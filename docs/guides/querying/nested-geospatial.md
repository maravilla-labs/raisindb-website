---
sidebar_position: 10
title: Nested geospatial
description: Query a geometry anywhere in a node's property tree, inside an object, an element or an array, using a dotted path shared by the index and the query.
---

# Nested geospatial

A geometry does not have to be a top-level property. RaisinDB indexes every
GeoJSON geometry it finds in a node's properties, inside an object, inside a
section element, inside an array, and each one is addressed by its dot path.

## Addressing

The string inside `properties->>'…'` is the path, and the same string is the
property segment of the index key, so the query and the index always agree.

Given this node in a `places` workspace:

```json
{
  "title": "Zurich HB",
  "location": { "type": "Point", "coordinates": [8.5402, 47.3779] },
  "venue": {
    "name": "Main Hall",
    "geo": { "type": "Point", "coordinates": [8.5535, 47.3779] }
  },
  "hero": {
    "element_type": "demo:MapSection",
    "map_pin": { "type": "Point", "coordinates": [8.5668, 47.3779] }
  },
  "stops": [
    { "geo": { "type": "Point", "coordinates": [8.673, 47.3779] } },
    { "geo": { "type": "Point", "coordinates": [8.5468, 47.3779] } }
  ]
}
```

| where the geometry sits | how you write it | index key segment |
|---|---|---|
| top level | `properties->>'location'` | `location` |
| inside an object | `properties->>'venue.geo'` | `venue.geo` |
| inside an element (a section field) | `properties->>'hero.map_pin'` | `hero.map_pin` |
| one element of an array | `properties->>'stops.0.geo'` | `stops.0.geo` |
| every element of an array | `properties->>'stops[].geo'` | not indexed, see below |

```sql
-- a geometry inside an object
SELECT name, __distance, __matched_path FROM 'places'
 WHERE ST_DWITHIN(properties->>'venue.geo', ST_POINT(8.5535, 47.3779), 500);
```

```json
{"columns":["name","__distance","__matched_path"],
 "rows":[{"name":"zurich-hb","__distance":0.0,"__matched_path":"venue.geo"}]}
```

```sql
-- one element of an array
SELECT name FROM 'places'
 WHERE ST_DWITHIN(properties->>'stops.0.geo', ST_POINT(8.673, 47.3779), 500);
```

Array indices are zero-based. The separator is `.` only; a property whose own
name contains a dot is read as a direct key. Nested geometry must be written
as `properties->>'…'`: a bare `venue.geo` parses as a table-qualified column
(`venue`.`geo`), not a path.

Indexing does not depend on the node type declaring a `Geometry` property; any
stored value shaped like a GeoJSON geometry is indexed at its path. The
declared type matters for validation and for the per-property policy.

## Each field is its own index

A query names exactly the field it searches. In the example above a 200 m
query at the position of `location` matches the node, while the same query
against `venue.geo` does not, because that geometry is a kilometre away. No
query shape searches "any geometry on the node".

## Several geometries on one node: one row per node

A node that matches through several of its geometries appears once:

- `ST_DWITHIN(properties->>'stops[].geo', …)` is true when any element is
  within the radius.
- `ST_DISTANCE(properties->>'stops[].geo', …)` is the minimum over the
  elements.

That is what makes

```sql
SELECT name FROM 'places'
ORDER BY ST_DISTANCE(properties->>'stops[].geo', ST_POINT(8.54, 47.37)) LIMIT 10;
```

mean "the ten nearest nodes". Ties resolve to the lexicographically smallest
concrete path, so the answer is deterministic, and `LIMIT k` is k nodes.

### Which geometry matched: `__matched_path` and `__distance`

Two opt-in columns say how a spatial predicate was satisfied:

| Column | Type | Meaning |
|---|---|---|
| `__distance` | double | metres from the query centre; for a wildcard, the minimum over the matched elements |
| `__matched_path` | text | the concrete path that produced it, e.g. `stops.1.geo` |

```sql
SELECT name, __distance, __matched_path
FROM 'places'
WHERE ST_DWITHIN(properties->>'stops[].geo', ST_POINT(8.54, 47.37), 2000);
```

```json
{"rows":[{"name":"tour","__distance":1016.79,"__matched_path":"stops.1.geo"}]}
```

Name them explicitly; `SELECT *` does not include them.

### The `[]` wildcard is a row scan

`stops[].geo` is accepted and gives correct results, but it is not answered
from the index: each element is indexed under its own concrete path, so no
single cell scan covers them all. The planner applies the predicate per row
and explains why:

```
TableScan: places (spatial index NOT USED for 'places'.'stops[].geo'
  (spatial index unusable: 'stops[].geo' is a wildcard over an array of geometries;
   each element is indexed under its own concrete path … Name one element
   (properties->>'stops.0.geo') to use the index.))
```

There is no `properties->>'*'` and no bare `ST_DWITHIN(properties, …)`.

## A path that is not indexed yet

A path whose index has not been built is answered by a row scan with the
predicate kept, so results are correct, the scan is full, and a warning names
the path and the rebuild command. To index existing data under paths that
were never walked before, rebuild the whole workspace:

```sql
REBUILD SPATIAL INDEX FOR 'places';
-- {"job_id":"…","workspace":"places","property":"*","scope":"local node only"}
```

Run it without a `PROPERTY` filter; that is the form that re-walks whole
property trees and discovers nested paths.

## Per-field policy, including array fields

Precisions are configured per property path:

```sql
ALTER SPATIAL INDEX FOR 'places' PROPERTY 'venue.geo' SET PRECISIONS = (8, 6);
```

For an array field, configure the `[]` spelling; one declaration covers every
element:

```sql
ALTER SPATIAL INDEX FOR 'places' PROPERTY 'stops[].geo' SET PRECISIONS = (8, 6);
```

Array indices normalise to `[]` for policy lookup only (`stops.3.geo` uses the
policy of `stops[].geo`); the index entry keeps the concrete path. Resolution
is exact: a policy on `venue` does not apply to `venue.geo`.

`SHOW SPATIAL INDEX HEALTH FOR 'places'` lists one row per indexed path
(`area`, `location`, `venue.geo`, …) with its entry counts and whether it
needs a rebuild.

## Limits

- At most 64 geometry paths per node are indexed. Beyond that the write logs a
  warning naming the dropped paths; model the extras as child nodes.
- Every stored geometry is indexed wherever it sits. The node type's schema
  drives policy (precisions, cover mode), not whether a geometry is indexed.
