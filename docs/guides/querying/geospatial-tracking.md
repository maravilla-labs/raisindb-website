---
sidebar_position: 11
title: Tracking moving objects
description: How to configure a position property that changes every few seconds, what each update costs, and how the spatial compaction filter keeps a busy cell small.
---

# Tracking moving objects

A vehicle that reports its position every few seconds is a different workload
from a list of static places, and the spatial index defaults are tuned for the
latter. This page explains what a position update costs and how to configure
a property for frequent updates.

## What an update writes

Every geometry update writes one index key per configured precision and
tombstones the entries it supersedes.

| profile | precisions | keys written | tombstones | total per update |
|---|---|---|---|---|
| default | `2,4,6,7,8,9,10,11` | 8 | 8 | 16 |
| tracking | `6,8` | 2 | 2 | 4 |

Tombstones are limited to the precisions that can hold entries (the configured
set plus whatever the local index state says is already indexed). When no
index state record exists yet, all twelve precisions are tombstoned; that
costs a few extra writes but never leaves a stale entry behind.

## Configuring a tracking property

Use the per-property policy:

```sql
ALTER SPATIAL INDEX FOR 'fleet' PROPERTY 'position' SET PRECISIONS = (8, 6);
```

```json
{"columns":["workspace","property","precisions","cover","note"],
 "rows":[{"workspace":"fleet","property":"position","precisions":"(8, 6)","cover":"Centroid",
          "note":"configuration written and replicated; run REBUILD SPATIAL INDEX on each node to migrate existing entries"}]}
```

The number of precisions sets the write cost; which precisions you pick sets
the query radii the index can serve well:

| precision | approximate cell | serves radii |
|---|---|---|
| 8 | about 38 m x 19 m | up to about 100 m |
| 6 | about 1.2 km x 0.6 km | about 100 m to 3 km |
| 4 | about 39 km | wide-area queries |

A radius query scans at most 1024 cells (`MAX_SCAN_CELLS`). Beyond roughly
10 km a precision-6 ring exceeds that budget, so the planner answers from a
row scan instead and says so in `EXPLAIN`. If wide-radius fleet queries
matter, add a coarse precision such as `(8, 6, 4)` rather than going back to
the eight-precision default.

`cover = centroid` (the default) is right for a tracked point; `extent` is for
polygons and lines.

`SHOW SPATIAL INDEX CONFIG FOR 'fleet'` shows the effective policy, and
`SHOW SPATIAL INDEX HEALTH FOR 'fleet' PROPERTY 'position'` reports whether
the local index still needs a rebuild after a policy change
(`needs_rebuild: true` until `REBUILD SPATIAL INDEX FOR 'fleet'` has run).

## Why a hot cell used to grow, and what bounds it

The revision is part of every index key, so an update writes a new key instead
of overwriting the old one. A radius query prefix-scans each cell and visits
every key in it, so superseded revisions are read cost.

At a coarse precision a vehicle circulating one site stays inside the same
cell across updates, so that one prefix accumulates about two entries per
update. At a fine precision the vehicle moves between cells and the entries
spread out. Coarse cells are therefore where read cost concentrates: one
vehicle at one update per second leaves tens of thousands of superseded
entries in its precision-6 cell per day.

### The compaction filter

A compaction filter on the spatial column family drops superseded entries as
RocksDB compacts. It is on by default. The newest entry per node per cell is
never dropped, so a read at HEAD returns the same rows with the filter on or
off. Older entries are removed once they exceed the revision budget or the
retention window, and tombstones are dropped during a full compaction once
they have aged out. Pruning happens incrementally as levels compact and
converges over time.

Defaults and environment overrides:

| Setting | Default | Environment variable |
|---|---|---|
| enabled | `true` | `RAISIN_SPATIAL_COMPACTION_FILTER=off` disables it |
| revisions kept per node per cell | `8` | `RAISIN_SPATIAL_KEEP_REVISIONS` |
| retention window | `3600` seconds | `RAISIN_SPATIAL_RETENTION_SECS` |

The variables are read when the database opens, so a change needs a restart.
With the defaults a hot cell settles at a handful of entries per vehicle
instead of growing with the update count.

:::note Historical reads
Because pruning discards old revisions, the index cannot answer a spatial
query at an older revision exactly. A query with an explicit `__revision`
predicate is therefore routed to a row scan with the predicate applied per
row, and `EXPLAIN` names the reason. Reads at HEAD keep using the index.
:::

`REBUILD SPATIAL INDEX` does not prune; it rewrites entries and adds
tombstones. The compaction filter is the mechanism that keeps cells small, so
there is no need to schedule periodic rebuilds.

### The per-cell scan budget

If a single cell holds more than 250,000 entries the index scan stops rather
than answer from a partial read, and the executor falls back to a row scan
(slow but exact). Fewer precisions reduce how fast entries accumulate.

## Modelling pattern

Keep the current position on the tracked entity in a property with the
tracking policy:

```sql
UPDATE 'fleet' SET properties = $1::jsonb WHERE path = '/van-17';
```

If you also need a position history, write it as separate append-only nodes
under a different property name:

```sql
INSERT INTO 'fleet' (path, node_type, name, properties)
VALUES ($1, 'fleet:Ping', $2, $3::jsonb);   -- geometry property: track_point
```

Keeping the two under different property names means proximity queries on
`position` never scan the history, and the compaction filter bounds
`position` (whose old revisions are superseded) without touching
`track_point` (which is not superseded data).
