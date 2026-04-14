---
sidebar_position: 8
---

# Graph Algorithms

Run graph algorithms directly in SQL to analyze relationships, detect communities, and measure node importance.

## Overview

RaisinDB includes a set of graph algorithms based on the LDBC Graphalytics benchmark. These algorithms operate on the relationships between nodes and are accessible through standard SQL using the `GRAPH_TABLE` syntax.

Use graph algorithms when you need to:

- **Rank nodes** by importance or influence (PageRank, closeness, betweenness)
- **Detect communities** in your data (Louvain, CDLP)
- **Measure connectivity** between nodes (BFS, SSSP, WCC)
- **Analyze structure** of your graph (clustering coefficient, triangle count)

## Quick Start

Create some users and relationships, then run PageRank:

```sql
-- Create users
INSERT INTO 'users' (path, name, node_type) VALUES
  ('/users/alice', 'Alice', 'User'),
  ('/users/bob', 'Bob', 'User'),
  ('/users/carol', 'Carol', 'User'),
  ('/users/dave', 'Dave', 'User');

-- Add FOLLOWS relationships
RELATE '/users/bob' -> '/users/alice' AS 'FOLLOWS';
RELATE '/users/carol' -> '/users/alice' AS 'FOLLOWS';
RELATE '/users/dave' -> '/users/alice' AS 'FOLLOWS';
RELATE '/users/dave' -> '/users/bob' AS 'FOLLOWS';

-- Run PageRank to find the most influential user
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.name AS name,
    pageRank(n) AS rank
  )
)
ORDER BY rank DESC;
```

Result:

| name  | rank  |
|-------|-------|
| Alice | 0.41  |
| Bob   | 0.22  |
| Dave  | 0.19  |
| Carol | 0.18  |

## Available Algorithms

| Algorithm | Function | Returns | Description |
|-----------|----------|---------|-------------|
| PageRank | `pageRank(n)` | Float | Importance based on incoming links |
| BFS | `bfs(n, source)` | Integer | Hop count from a source node |
| SSSP | `sssp(n, source)` | Float | Weighted shortest path distance |
| WCC | `wcc(n)` | Integer | Connected component ID |
| CDLP | `cdlp(n)` | Integer | Community label (label propagation) |
| LCC | `lcc(n)` | Float | Local clustering coefficient |
| Triangle Count | `triangle_count(n)` | Integer | Triangles the node participates in |
| Louvain | `louvain(n)` | Integer | Community ID (modularity-based) |
| Degree | `degree(n)` | Integer | Total connections |
| In-Degree | `in_degree(n)` | Integer | Incoming connections |
| Out-Degree | `out_degree(n)` | Integer | Outgoing connections |
| Closeness | `closeness(n)` | Float | Reachability centrality |
| Betweenness | `betweenness(n)` | Float | Bridge/bottleneck score |
| Component Count | `component_count()` | Integer | Total connected components |
| Community Count | `community_count()` | Integer | Total detected communities |

## Ad-hoc Queries

Graph algorithm functions can be used directly in any `GRAPH_TABLE` query. The algorithm is computed on the fly over the matched subgraph.

```sql
-- Combine multiple algorithms in one query
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    pageRank(n) AS influence,
    louvain(n) AS community,
    degree(n) AS connections
  )
)
ORDER BY influence DESC;
```

You can filter, join, and aggregate the results like any SQL result set:

```sql
-- Average PageRank per community
SELECT community, COUNT(*) AS members, AVG(influence) AS avg_rank
FROM (
  SELECT * FROM GRAPH_TABLE(
    MATCH (n:User)
    COLUMNS (
      pageRank(n) AS influence,
      louvain(n) AS community
    )
  )
)
GROUP BY community
ORDER BY avg_rank DESC;
```

## Background Precomputation

For production workloads, you can configure algorithms to run in the background and store results persistently. This avoids recomputing on every query.

### RAP Package Configuration

In a RAP package, add a `.node.yaml` file under the `raisin:access_control/graph-config/` path:

```yaml
# content/raisin:access_control/graph-config/social-pagerank/.node.yaml
node_type: raisin:GraphAlgorithmConfig
properties:
  algorithm: "pagerank"
  enabled: true
  target:
    mode: "all_branches"
  scope:
    node_types: ["User"]
    relation_types: ["FOLLOWS"]
  config:
    damping_factor: 0.85
    max_iterations: 100
  refresh:
    on_relation_change: true
    ttl_seconds: 300
```

```yaml
# content/raisin:access_control/graph-config/bfs-from-hub/.node.yaml
node_type: raisin:GraphAlgorithmConfig
properties:
  algorithm: "bfs"
  enabled: true
  target:
    mode: "branch"
    branches: ["main"]
  scope:
    node_types: ["User"]
  config:
    source_node: "hub-user-123"
  refresh:
    on_relation_change: true
```

### Refresh Behavior

RaisinDB supports several ways to trigger algorithm recomputation:

- **`on_relation_change: true`** — when relationships change (RELATE/UNRELATE), the projection and cached results are automatically marked stale and rebuilt on next access. This is the recommended setting for most use cases.
- **`on_branch_change: true`** — recomputes when the branch HEAD changes (any commit).
- **`ttl_seconds: N`** — recomputes after N seconds regardless of changes.
- **`cron: "..."` ** — recomputes on a cron schedule (e.g., `"0 */6 * * *"` for every 6 hours).

**Defaults** (when no refresh config is specified):
- All refresh triggers are **off** — the algorithm computes once on first access and does not automatically recompute.
- Set at least one refresh trigger to keep results fresh.

**Admin Console defaults** (pre-filled in the UI):
- `ttl_seconds: 3600` (1 hour), `on_branch_change: true`, `on_relation_change: false`

Results are persisted in RocksDB and survive server restarts. On cluster join, projections are transferred as part of the RocksDB checkpoint.

### Managing Configs via SQL

Graph algorithm configs are stored as nodes in the `raisin:access_control` workspace. You can create, update, and delete them using standard SQL:

```sql
-- Create a PageRank config for social network analysis
INSERT INTO "raisin:access_control" (path, name, node_type, properties) VALUES (
  '/graph-config/social-pagerank',
  'social-pagerank',
  'raisin:GraphAlgorithmConfig',
  '{"algorithm": "pagerank", "enabled": true,
    "target": {"mode": "all_branches"},
    "scope": {"relation_types": ["FOLLOWS"], "node_types": ["User"]},
    "config": {"damping_factor": 0.85, "max_iterations": 100},
    "refresh": {"on_relation_change": true, "ttl_seconds": 300}
  }'::jsonb
);

-- Create a BFS config to measure distances from a hub node
INSERT INTO "raisin:access_control" (path, name, node_type, properties) VALUES (
  '/graph-config/bfs-from-hub',
  'bfs-from-hub',
  'raisin:GraphAlgorithmConfig',
  '{"algorithm": "bfs", "enabled": true,
    "target": {"mode": "branch", "branches": ["main"]},
    "scope": {"node_types": ["User"]},
    "config": {"source_node": "hub-user-123"},
    "refresh": {"on_relation_change": true}
  }'::jsonb
);

-- Create a weighted shortest path config
INSERT INTO "raisin:access_control" (path, name, node_type, properties) VALUES (
  '/graph-config/sssp-from-warehouse',
  'sssp-from-warehouse',
  'raisin:GraphAlgorithmConfig',
  '{"algorithm": "sssp", "enabled": true,
    "target": {"mode": "branch", "branches": ["main"]},
    "scope": {"relation_types": ["SHIPS_TO"]},
    "config": {"source_node": "warehouse-east"},
    "refresh": {"on_relation_change": true}
  }'::jsonb
);

-- Disable a config
UPDATE "raisin:access_control"
SET properties = properties || '{"enabled": false}'::jsonb
WHERE path = '/graph-config/social-pagerank';

-- Delete a config
DELETE FROM "raisin:access_control"
WHERE path = '/graph-config/social-pagerank';

-- List all graph algorithm configs
SELECT name, 
  properties->>'algorithm' AS algorithm,
  properties->>'enabled' AS enabled
FROM "raisin:access_control"
WHERE node_type = 'raisin:GraphAlgorithmConfig';
```

Configs can be managed three ways:

1. **SQL** — INSERT/UPDATE/DELETE on `raisin:access_control` workspace (shown above)
2. **Admin Console** — visual UI for creating and monitoring configs
3. **RAP Packages** — YAML config files deployed as part of a package

### Config Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| algorithm | string | yes | One of: pagerank, bfs, sssp, connected_components, cdlp, lcc, louvain, triangle_count, betweenness_centrality, closeness_centrality |
| enabled | boolean | yes | Whether this config is active |
| target.mode | string | yes | "branch", "all_branches", "revision", or "branch_pattern" |
| target.branches | string[] | no | Branch names (for mode=branch) |
| target.branch_pattern | string | no | Glob pattern (for mode=branch_pattern) |
| scope.node_types | string[] | no | Filter by node types |
| scope.relation_types | string[] | no | Filter by relation types |
| scope.workspaces | string[] | no | Filter by workspaces |
| scope.paths | string[] | no | Filter by path glob patterns |
| config.damping_factor | number | no | PageRank damping (default: 0.85) |
| config.max_iterations | number | no | PageRank: default 100. Louvain/CDLP: default 10. |
| config.convergence_threshold | number | no | PageRank convergence (default: 1e-6) |
| config.source_node | string | no | BFS/SSSP source node ID (required for these algorithms) |
| config.resolution | number | no | Louvain resolution parameter |
| refresh.ttl_seconds | number | no | Time-to-live before recomputation |
| refresh.on_branch_change | boolean | no | Recompute when branch HEAD changes |
| refresh.on_relation_change | boolean | no | Recompute when relations change (event-driven) |
| refresh.cron | string | no | Cron schedule for periodic recomputation |

## Examples

### Social Network: Influence and Communities

Find the most influential users and which communities they belong to:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    pageRank(n) AS influence,
    cdlp(n) AS community,
    in_degree(n) AS followers,
    out_degree(n) AS following
  )
)
ORDER BY influence DESC
LIMIT 20;
```

Find bridge users who connect different communities:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    betweenness(n) AS bridge_score,
    louvain(n) AS community
  )
)
WHERE bridge_score > 0
ORDER BY bridge_score DESC
LIMIT 10;
```

### Knowledge Graph: Paths and Connectivity

Find the shortest path distance from a root topic to all others:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    n.id AS topic_id,
    n.name AS name,
    bfs(n, 'machine-learning') AS distance
  )
)
WHERE distance IS NOT NULL
ORDER BY distance;
```

Check if the knowledge graph has disconnected clusters:

```sql
-- Count connected components
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    component_count() AS total_components
  )
)
LIMIT 1;

-- See which topics are in which component
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    n.name AS name,
    wcc(n) AS component
  )
)
ORDER BY component, name;
```

### Content Graph: Clustering Analysis

Analyze how tightly connected content categories are:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Article)
  COLUMNS (
    n.id AS article_id,
    n.name AS title,
    lcc(n) AS clustering,
    triangle_count(n) AS triangles,
    degree(n) AS connections
  )
)
ORDER BY clustering DESC;
```

Find densely interconnected groups of articles:

```sql
SELECT community, COUNT(*) AS articles, AVG(clustering) AS avg_clustering
FROM (
  SELECT * FROM GRAPH_TABLE(
    MATCH (n:Article)
    COLUMNS (
      louvain(n) AS community,
      lcc(n) AS clustering
    )
  )
)
GROUP BY community
HAVING COUNT(*) > 3
ORDER BY avg_clustering DESC;
```

## Next Steps

- [Graph Queries](./graph-queries.md) - Traversing relationships and hierarchies
- [Graph Algorithm Functions Reference](/docs/reference/sql/functions/graph-algorithms) - Full function signatures and parameter details
