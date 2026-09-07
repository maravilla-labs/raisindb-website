---
sidebar_position: 8
---

# Graph Algorithms

Run graph algorithms from SQL to rank nodes, detect communities and measure
how nodes are connected.

## Overview

The algorithm functions run inside `GRAPH_TABLE`. RaisinDB builds an in-memory
graph from the stored relations that match the pattern's relation types, runs
the algorithm once per query, and returns each node's value as a column. There
is nothing to project or materialise first.

Use them when you need to:

- **Rank nodes** by importance (`pageRank`, `closeness`, `betweenness`)
- **Detect communities** (`louvain`, `cdlp`)
- **Measure connectivity** (`bfs`, `sssp`, `wcc`)
- **Describe structure** (`lcc`, `triangle_count`, `degree`)

## Quick start

Create a few people, let them follow each other, and ask for PageRank:

```sql
INSERT INTO 'social' (path, node_type, name, properties) VALUES
  ('/alice', 'social:Person', 'alice', '{"name":"Alice"}'::jsonb),
  ('/bob',   'social:Person', 'bob',   '{"name":"Bob"}'::jsonb),
  ('/carol', 'social:Person', 'carol', '{"name":"Carol"}'::jsonb),
  ('/dave',  'social:Person', 'dave',  '{"name":"Dave"}'::jsonb);

RELATE FROM path='/bob'   IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/carol' IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/dave'  IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/dave'  IN WORKSPACE 'social' TO path='/bob'   IN WORKSPACE 'social' TYPE 'follows' WEIGHT 2.5;

SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, pageRank(n) AS rank)
)
ORDER BY rank DESC;
```

| name  | rank  |
|-------|-------|
| alice | 0.274 |
| bob   | 0.112 |
| dave  | 0.079 |
| carol | 0.079 |

`ORDER BY` and `LIMIT` belong to the outer `SELECT`, not inside `GRAPH_TABLE`.

## Available algorithms

| Algorithm | Function | Returns | Description |
|-----------|----------|---------|-------------|
| PageRank | `pageRank(n)` | Float | Importance from incoming links |
| BFS | `bfs(n, source_id)` | Integer | Hop count from a source node |
| SSSP | `sssp(n, source_id)` | Float | Weighted shortest-path distance |
| WCC | `wcc(n)` | Integer | Weakly connected component id |
| CDLP | `cdlp(n)` | Integer | Community label (label propagation) |
| LCC | `lcc(n)` | Float | Local clustering coefficient |
| Triangle count | `triangle_count(n)` | Integer | Triangles the node is part of |
| Louvain | `louvain(n)` | Integer | Community id (modularity) |
| Degree | `degree(n)` | Integer | Incoming plus outgoing edges |
| In-degree | `in_degree(n)` | Integer | Incoming edges |
| Out-degree | `out_degree(n)` | Integer | Outgoing edges |
| Closeness | `closeness(n)` | Float | Reachability centrality |
| Betweenness | `betweenness(n)` | Float | Bridge score |
| Component count | `component_count()` | Integer | Number of connected components |
| Community count | `community_count()` | Integer | Number of detected communities |

Function names are case-insensitive, and most have aliases (`page_rank`,
`betweenness_centrality`, `closeness_centrality`, `component_id`,
`shortest_path_distance`); the
[reference](/docs/reference/sql/functions/graph-algorithms) lists them.

## Ad-hoc queries

Any number of algorithm functions can appear in one `COLUMNS` list. They share
the graph built for the query, so adding a second function is cheap:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
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

The graph contains the relation types named in the pattern; a bare `(n:Person)`
with no edge pattern uses every relation type. Results can be filtered, joined
and aggregated like any SQL result:

```sql
-- average PageRank per community
SELECT community, COUNT(*) AS members, AVG(influence) AS avg_rank
FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (pageRank(n) AS influence, louvain(n) AS community)
) AS g
GROUP BY community
ORDER BY avg_rank DESC;
```

`bfs` and `sssp` take the **id** of the source node as their second argument
(a path is not resolved):

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, bfs(n, 'ce3a9b41-eb0f-4104-95f5-edfa16a32766') AS hops)
);
-- alice 0, everyone else NULL: the follows edges point at alice, not away from her
```

## Background precomputation

Algorithms can also run in the background on a schedule, with results stored
per branch. A background job wakes up every 60 seconds, computes every enabled
config whose results are missing or stale, and keeps the stored graph
projection for the next run.

:::note
Stored results are consumed by the platform (the console shows them, and
`relates_cache` feeds row-level security). The `GRAPH_TABLE` functions above
compute on the fly and do not read stored results, so a config does not
speed up ad-hoc queries.
:::

A config is a node of type `raisin:GraphAlgorithmConfig` in the
`raisin:access_control` workspace, under `/graph-config/`. Create it with SQL,
in a package, or from the Admin Console.

### With SQL

```sql
INSERT INTO "raisin:access_control" (path, name, node_type, properties) VALUES (
  '/graph-config/social-pagerank',
  'social-pagerank',
  'raisin:GraphAlgorithmConfig',
  '{"algorithm": "pagerank", "enabled": true,
    "target": {"mode": "branch", "branches": ["main"]},
    "scope": {"workspaces": ["social"], "relation_types": ["follows"]},
    "config": {"damping_factor": 0.85, "max_iterations": 100},
    "refresh": {"on_relation_change": true, "ttl_seconds": 300}
  }'::jsonb
);

-- list configs
SELECT name, properties->>'algorithm' AS algorithm, properties->>'enabled' AS enabled
FROM "raisin:access_control"
WHERE node_type = 'raisin:GraphAlgorithmConfig';

-- disable, delete
UPDATE "raisin:access_control" SET properties = properties || '{"enabled": false}'::jsonb
WHERE path = '/graph-config/social-pagerank';
DELETE FROM "raisin:access_control" WHERE path = '/graph-config/social-pagerank';
```

### In a package

```yaml
# content/raisin:access_control/graph-config/social-pagerank/.node.yaml
node_type: raisin:GraphAlgorithmConfig
properties:
  algorithm: pagerank
  enabled: true
  target:
    mode: branch
    branches: [main]
  scope:
    workspaces: [social]
    relation_types: [follows]
  config:
    damping_factor: 0.85
  refresh:
    on_relation_change: true
    ttl_seconds: 300
```

### Checking status

The management API reports each config's state, when it last ran and when the
next tick is due:

```bash
curl -s localhost:8090/management/graph-cache/docs-graph/status -H "Authorization: Bearer $TOKEN"
```

```json
{"success":true,"data":{"configs":[{"id":"social-pagerank","algorithm":"pagerank",
  "enabled":true,"status":"pending","last_computed_at":null,"next_scheduled_at":null,
  "node_count":null,"error":null,"config":{…}}],
  "next_tick_at":1788720348015,"tick_interval_seconds":60}}
```

`POST /management/graph-cache/{repo}/{config_id}/recompute` runs a config now;
`POST …/mark-stale` marks it for the next tick.

### Config reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `algorithm` | string | yes | `pagerank`, `louvain`, `connected_components`, `betweenness_centrality`, `closeness_centrality`, `triangle_count`, `bfs`, `sssp`, `cdlp`, `lcc`, `relates_cache` |
| `enabled` | boolean | yes | Whether the config is active |
| `target.mode` | string | yes | `branch`, `all_branches`, `revision` or `branch_pattern` |
| `target.branches` | string[] | no | Branch names for `mode: branch` |
| `target.revisions` | string[] | no | Revisions for `mode: revision` |
| `target.branch_pattern` | string | no | Glob for `mode: branch_pattern` |
| `scope.node_types` | string[] | no | Limit to these node types |
| `scope.relation_types` | string[] | no | Limit to these relation types |
| `scope.workspaces` | string[] | no | Limit to these workspaces |
| `scope.paths` | string[] | no | Limit to these path globs |
| `config.damping_factor` | number | no | PageRank damping (default 0.85) |
| `config.max_iterations` | number | no | PageRank default 100; Louvain and CDLP default 10 |
| `config.convergence_threshold` | number | no | PageRank convergence (default 1e-6) |
| `config.resolution` | number | no | Louvain resolution (default 1.0) |
| `config.source_node` | string | no | Source node id; required for `bfs` and `sssp` |
| `refresh.ttl_seconds` | number | no | Recompute after this many seconds |
| `refresh.on_branch_change` | boolean | no | Recompute when the branch HEAD moves |
| `refresh.on_relation_change` | boolean | no | Recompute when relations change |
| `refresh.cron` | string | no | Cron schedule, e.g. `"0 */6 * * *"` |

When `refresh` is omitted every trigger is off: the config is computed once
and stays as it is until you mark it stale or recompute it.

## Examples

### Influence and communities

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (
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

### Bridge nodes

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, betweenness(n) AS bridge_score, louvain(n) AS community)
) AS g
WHERE bridge_score > 0
ORDER BY bridge_score DESC
LIMIT 10;
```

### Distance from a node

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (n.name AS name, bfs(n, '<id of machine-learning>') AS distance)
) AS g
WHERE distance IS NOT NULL
ORDER BY distance;
```

### Connected components

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (n.name AS name, wcc(n) AS component, component_count() AS total)
)
ORDER BY component, name;
```

### Clustering

```sql
SELECT community, COUNT(*) AS articles, AVG(clustering) AS avg_clustering
FROM GRAPH_TABLE(
  MATCH (n:Article)
  COLUMNS (louvain(n) AS community, lcc(n) AS clustering)
) AS g
GROUP BY community
ORDER BY avg_clustering DESC;
```

## Next steps

- [Graph queries](./graph-queries.md)
- [Graph algorithm function reference](/docs/reference/sql/functions/graph-algorithms)
