---
sidebar_position: 12
---

# Replication

RaisinDB uses operation-based CRDTs (Conflict-free Replicated Data Types) for masterless multi-master replication. Any node in a cluster can accept writes, and all nodes converge to identical state without coordination.

## How It Works

Every mutation in RaisinDB is recorded as an **operation** — a self-contained, replayable unit. Operations are streamed between cluster nodes and applied in causal order:

```
Node A: Write "title = Hello"  →  Operation sent to B, C
Node B: Write "status = published"  →  Operation sent to A, C
Node C: Receives both operations  →  Applies in causal order  →  Converges
```

There is no leader election and no consensus protocol. Every node accepts reads and writes at all times.

## Vector Clocks

Vector clocks track causal dependencies between operations. Each cluster node maintains a counter, and the vector clock is a map from node ID to counter value:

```
Node A writes  →  clock: {A: 1}
Node A writes  →  clock: {A: 2}
Node B writes  →  clock: {B: 1}
Node B receives A's ops  →  clock: {A: 2, B: 1}
```

Comparing two vector clocks yields one of four results:

| Result | Meaning |
|--------|---------|
| **Before** | This clock happened before the other (causal predecessor) |
| **After** | This clock happened after the other (causal successor) |
| **Concurrent** | Neither happened before the other (potential conflict) |
| **Equal** | The clocks are identical |

## CRDT Merge Strategies

Different data types use different CRDT strategies for automatic conflict resolution:

### Properties: Last-Write-Wins (LWW)

When two nodes concurrently update the same property, the winner is determined by:

1. **Vector clock** — Causal ordering takes priority
2. **Timestamp** — Wall-clock time breaks ties between concurrent operations
3. **Node ID** — Deterministic string comparison as final tiebreaker

This guarantees every node converges to the same value, even under concurrent writes.

### Relations: Last-Write-Wins

Relationship edges (created with `RELATE`) use LWW. Relations are identified by a composite key `(source_id, target_id, relation_type)`, and only one relation of a given type can exist between two nodes.

### Ordered Lists: RGA

Ordered lists use the Replicated Growable Array (RGA) algorithm with tombstones. Concurrent insertions and deletions merge without conflicts, preserving user intent.

### Node Moves: Last-Write-Wins

When two nodes concurrently move the same node to different parents, the one with the higher vector clock wins. A conflict event is emitted for observability.

### Deletes: Delete-Wins

Delete operations take priority over concurrent updates, preventing "resurrection" of deleted content.

## Conflict Observability

While CRDTs resolve all conflicts automatically, RaisinDB records when conflicts occur for auditing:

| Conflict Type | Description |
|---------------|-------------|
| Concurrent property update | Two nodes updated the same property simultaneously |
| Concurrent move | Two nodes moved the same node to different parents |
| Concurrent schema update | Concurrent NodeType changes |
| Delete wins over update | A delete was concurrent with an update |

Conflicts are auto-resolved but recorded, so you can review what happened.

## Causal Delivery

The causal delivery module ensures operations are applied in happens-before order. If operation B depends on operation A, B is buffered until A has been applied — even if B arrives first over the network.

This prevents inconsistencies like applying a property update to a node that hasn't been created yet.

## Operation Log and Garbage Collection

Every mutation is appended to a persistent operation log. The garbage collection system provides bounded growth:

- **Compaction** — Old operations that all nodes have acknowledged are compacted
- **Retention window** — Configurable window for how long to keep operations
- **Catch-up support** — Operations needed for lagging nodes are preserved

## Cluster Setup

A multi-node cluster is configured in each node's TOML configuration file. Nodes discover peers and begin streaming operations automatically:

```bash
# Start a 3-node test cluster
./scripts/start-cluster.sh
```

Each node is fully independent — it can accept reads and writes even if other nodes are temporarily unreachable. When connectivity is restored, operations are replayed and state converges.

## Next Steps

- [Multi-Tenancy](./multi-tenancy) — Tenant isolation in replicated clusters
- [Time-Travel Queries](/docs/guides/querying/time-travel-queries) — Query historical state
