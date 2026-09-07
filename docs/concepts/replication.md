---
sidebar_position: 12
---

# Replication

RaisinDB replicates between servers as a masterless cluster. Every node accepts reads and writes, ships its writes to its peers as operations, and applies the operations it receives. There is no leader and no election; a node that loses its peers keeps serving and catches up when they return.

## How it works

Each write is captured as an **operation** and appended to a local operation log. Operations are streamed to peers over a dedicated TCP port, and each peer applies them to its own storage. An operation carries the tenant, repository and branch it belongs to, the originating node's id, a wall-clock timestamp, and a vector clock.

Most content writes travel as an `apply_revision` operation: the full node snapshots a commit produced, together with the branch head after the commit. Schema (NodeTypes, archetypes, element types, workspaces), branches, tags, revision metadata, users, permissions, secrets and API keys are replicated as records of their own kind. Everything derived from those records is rebuilt on each node locally rather than shipped: full-text, spatial, reference and vector indexes are recomputed on every replica from the replicated nodes.

You can inspect a node's log and clock over the admin API:

```bash
curl http://localhost:8080/api/replication/default/myapp/vector-clock -H "Authorization: Bearer $TOKEN"
# {"vector_clock":{"clock":{"node1":541}},"nodes":["node1"]}

curl "http://localhost:8080/api/replication/default/myapp/operations?limit=1" -H "Authorization: Bearer $TOKEN"
# {"operations":[{"op_id":"e62c62a2-...","op_seq":1,"cluster_node_id":"node1",
#   "timestamp_ms":1788719723269,"vector_clock":{"clock":{"node1":1}},
#   "tenant_id":"default","repo_id":"myapp","branch":"main","op_type":{"update_repository":{...}}}]}
```

## Vector clocks and ordering

Each node keeps a counter, and a vector clock is the map of node id to counter that an operation was created under:

```
node1 writes            -> {node1: 1}
node1 writes            -> {node1: 2}
node2 writes            -> {node2: 1}
node2 receives node1's  -> {node1: 2, node2: 1}
```

Comparing two clocks gives one of four answers: `Before`, `After`, `Concurrent` or `Equal`. Operations that are causally ordered are applied in that order. Operations that are concurrent target-by-target are ordered deterministically by vector clock, then wall-clock timestamp, then node id, so every replica picks the same winner.

## Conflict rules

Concurrent operations on the same target are merged with a fixed rule per operation kind:

| Target | Rule |
|--------|------|
| Node snapshots and properties | Last write wins, using the ordering above |
| Relations | Last write wins per `(source, target, relation_type)` |
| Moves | Last write wins; the node ends up under one parent |
| Deletes | A delete wins over a concurrent update, so deleted content does not come back |

A concurrent property update, a concurrent move to different parents, or a delete racing an update is applied and also counted as a conflict in the replication metrics, so you can see that it happened.

## Causal delivery

Operations can arrive out of order over the network. A causal delivery buffer holds an operation until everything its vector clock depends on has been applied, so a property update is never applied before the create it depends on. Buffered operations are released as their dependencies arrive.

## Operation log and garbage collection

The operation log is durable and is what a lagging or restarted peer catches up from. A collector trims it under these defaults:

| Setting | Default |
|---------|---------|
| Maximum age of an operation | 30 days |
| Maximum log size | 10 GB, trimmed back to 9 GB |
| Peer acknowledgements required before trimming | all peers |

Operations a peer has not acknowledged are kept, so a node that has been down does not lose its catch-up window unless the size limit forces an emergency trim.

## Cluster setup

Replication is configured per node, in the `[replication]` section of the TOML config or through flags and environment variables. A node needs an id, a replication port and the list of its peers:

```toml
[replication]
enabled = true
node_id = "node1"
port = 9001
bind_address = "127.0.0.1"

[[replication.peers]]
peer_id = "node2"
address = "127.0.0.1"
port = 9002

[[replication.peers]]
peer_id = "node3"
address = "127.0.0.1"
port = 9003
```

The same settings as flags or environment variables:

```bash
raisin-server --cluster-node-id node1 --replication-port 9001 \
  --replication-peers "node2=127.0.0.1:9002,node3=127.0.0.1:9003"

RAISIN_CLUSTER_NODE_ID=node1 RAISIN_REPLICATION_PORT=9001 \
RAISIN_REPLICATION_PEERS="node2=127.0.0.1:9002,node3=127.0.0.1:9003" raisin-server
```

Both the node id and the port are required; with only one of them the server logs a warning and runs standalone. Peers given on the command line are merged with those in the file, overriding an entry with the same `peer_id`.

At startup the node discovers the tenant and repository pairs that exist locally and syncs those. Extra pairs can be listed in `RAISIN_CLUSTER_SYNC_EXTRA_REPOS`. The example configs under `examples/cluster/` and the script `./scripts/start-cluster.sh` start a three-node cluster on one machine.

Two things to plan for in a cluster:

- **Derived indexes and embeddings are built on every node.** Each replica indexes the content it receives, so an embedding provider must be reachable from every node and embedding cost scales with the node count.
- **Locks need a shared backend.** The in-process lock manager serializes within one node only. A cluster that uses `raisin.locks` or inventory claims must set `[locks] backend = "redis"`; the server warns when replication is on and the backend is `inprocess`.

## Next Steps

- [Multi-Tenancy](./multi-tenancy) - Tenant isolation in replicated clusters
- [Revisions](./versioning/revisions) - The revision model that replicated commits carry
