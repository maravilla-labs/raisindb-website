---
sidebar_position: 8
---

# Index Repairs API

Index repairs rebuild or clean up a repository's derived indexes in the
background. Derived indexes live on each server separately and are never
replicated, so one request starts the repair on **every node of the cluster**
and the status endpoint reports each node's progress.

Both endpoints need an administrator credential (an admin token, a `raisin_`
API key, or the operator's superadmin token). The tenant comes from the
request, as for every management route.

```
POST /api/management/{repo}/repairs/{repair}
GET  /api/management/{repo}/repairs/{repair}/status
```

## Repairs

| `{repair}` | What it does |
|------------|--------------|
| `node_path` | Records each node's path in the current record format, for data written by older releases. Runs by itself after startup. |
| `property_index` | Rewrites the property index for each node's newest version. Runs by itself after startup while [`index_skip_unchanged`](../configuration.md#storage) is on. |
| `property_index_verify` | Samples nodes and checks their property index entries. On a miss it queues a `property_index` rebuild for that branch. Writes no index data. |
| `ordered_children` | Removes child-ordering entries that deletes left behind. |
| `path_tombstone` | Rewrites old-format path index tombstones left by earlier merges. |
| `localized_names` | Builds the [localized name index](../../guides/data-modeling/localized-paths.md#index-build-and-fallback) of a branch. Runs by itself for every branch. |
| `block_overlay_tombstones` | Marks the block translations of deleted nodes as deleted, so history cleanup can reclaim them. Reads already treat them as deleted. Runs by itself after startup. |
| `compound_builds` | Builds the [built-in folder index](../../concepts/indexing.md#built-in-folder-index) of every workspace that has not opted out, drops the entries of one that has (or of a removed workspace index), and rebuilds compound indexes built by an older release unless `RAISIN_COMPOUND_FORMAT_REBUILD=0`. Runs by itself about two minutes after startup, after a checkpoint is ingested, and when a workspace's indexes change. Builds are paced and need free disk of twice the compound index size. |
| `resync_translations` | Re-sends every stored translation version, at its original revision, to the cluster's other nodes, so a replica that missed translations catches up with history intact. Writes nothing locally. |
| `collapse_runs` | Removes consecutive index versions that hold the same state, to reclaim space. Off unless enabled with [`history_gc_collapse_runs`](../configuration.md#storage), and refused on a node that replicates. |

An unknown name returns `400` with the list of valid names.

Repairs run as ordinary background jobs: in bounded batches, rate-limited,
resumable after a restart, and only after a free-disk check for the index they
write.

## Start a repair

```
POST /api/management/{repo}/repairs/{repair}
```

| Body field | Type | Default | Description |
|------------|------|---------|-------------|
| `branch` | string | all branches | Repair one branch only |
| `dry_run` | boolean | `false` | Count what would be written without writing it |

The body is required; send `{}` for the defaults.

```bash
curl -s -X POST http://localhost:8080/api/management/myrepo/repairs/localized_names \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"branch": "main"}'
```

```json
{
  "repair": "localized_names",
  "dry_run": false,
  "branch": "main",
  "nodes": [
    {"node_id": "node1", "status": "enqueued", "job_id": "…"},
    {"node_id": "node2", "status": "enqueued", "job_id": "…"},
    {"node_id": "node3", "status": "unreachable", "error": "…"}
  ]
}
```

Each node's `status` is `enqueued`, `unreachable` or `error`. A single server
reports itself as `local`.

## Repair status

```
GET /api/management/{repo}/repairs/{repair}/status
GET /api/management/{repo}/repairs/{repair}/status?branch=main
```

```json
{
  "repair": "localized_names",
  "nodes": [
    {
      "node_id": "node1",
      "status": "reported",
      "branches": [
        {"branch": "main", "state": {"status": "done", "pass": "…", "cursor": null, "written": 1284, "updated_at": "2026-10-05T08:12:44Z"}}
      ]
    }
  ]
}
```

A node's `status` is `reported`, `unreachable` or `error`. Per branch, `state`
is `null` when the repair never ran there; otherwise its `status` is `running`
(also after a crash, until the job resumes) or `done`, and `written` counts the
entries written so far. A `compound_builds` branch can also report `failed`
(for example, not enough free disk); it is retried at the next start, or when
the work it owes changes.

## Reaching the other nodes

The server that receives the request forwards it to each peer's HTTP API. Give
every peer its HTTP address with `http_url` in the
[replication configuration](../configuration.md#replication):

```toml
[[replication.peers]]
peer_id = "node2"
address = "10.0.0.2"
port = 9001
http_url = "http://10.0.0.2:8080"
```

A peer without `http_url` is not contacted. The forwarded request authenticates
with the superadmin token in the forwarding server's `RAISIN_SUPERADMIN_TOKEN`
environment variable, so the nodes of a cluster must share it.
