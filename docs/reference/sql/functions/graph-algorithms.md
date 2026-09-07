---
sidebar_position: 12
---

# Graph Algorithm Functions

Functions that compute a graph algorithm over the stored relations and return
one value per matched node. They are used inside the `COLUMNS` clause of a
`GRAPH_TABLE` query:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, pageRank(n) AS rank, wcc(n) AS component)
)
ORDER BY rank DESC;
```

How the graph is built for a query:

- The graph contains the relations whose type appears in the pattern. A pattern
  with no edge, or with an untyped edge, uses every relation type.
- The graph is built once per query and shared by every algorithm function in
  the `COLUMNS` list.
- Names are case-insensitive; `pageRank`, `pagerank` and `page_rank` are the
  same function.
- `ORDER BY`, `LIMIT` and `WHERE` on the computed columns go in the outer
  `SELECT`, with an alias on the `GRAPH_TABLE` when a `WHERE` refers to them.

Sample data used in the examples: four people, `bob`, `carol` and `dave`
follow `alice`, and `dave` follows `bob` with weight 2.5.

## pageRank

```sql
pageRank(node) → DOUBLE
```

Aliases: `page_rank`. Importance of a node based on its incoming edges
(damping 0.85, up to 100 iterations). Scores over the whole graph sum to
about 1.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, pageRank(n) AS rank)
)
ORDER BY rank DESC;
-- alice 0.274, bob 0.112, dave 0.079, carol 0.079
```

## bfs

```sql
bfs(node, source_id) → INTEGER
```

Aliases: `breadth_first_search`. Number of hops from the node with id
`source_id` to `node`, following edge direction. `0` for the source itself,
`NULL` when the node is not reachable. The second argument must be a node id;
a path is not resolved.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, bfs(n, 'ce3a9b41-eb0f-4104-95f5-edfa16a32766') AS hops)
);
-- alice 0; bob, carol, dave NULL (their edges point at alice, not away from her)
```

Several `bfs` calls with different sources can share one query; each is
computed independently.

## sssp

```sql
sssp(node, source_id) → DOUBLE
```

Aliases: `shortest_path_distance`. Weighted shortest-path distance from
`source_id`, using each edge's `weight` (`RELATE … WEIGHT n`). Edges without a
weight count as 1. `0.0` for the source, `NULL` when unreachable.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Location)
  COLUMNS (n.name AS name, sssp(n, '<id of headquarters>') AS distance)
)
ORDER BY distance;
```

## wcc

```sql
wcc(node) → INTEGER
```

Aliases: `connected_component`, `component_id`. Id of the weakly connected
component the node belongs to (edge direction ignored). Nodes with the same
id are connected.

```sql
SELECT component, COUNT(*) AS size
FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (wcc(n) AS component)
) AS g
GROUP BY component
ORDER BY size DESC;
```

## cdlp

```sql
cdlp(node) → INTEGER
```

Aliases: `community_detection`. Community label from label propagation: each
node adopts the most common label among its neighbours until labels settle.
Deterministic for a given graph.

```sql
SELECT community, COUNT(*) AS members
FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (cdlp(n) AS community)
) AS g
GROUP BY community
ORDER BY members DESC;
```

## louvain

```sql
louvain(node) → INTEGER
```

Community id from Louvain modularity optimisation. Usually gives tighter
communities than `cdlp` at a higher cost on large graphs.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, louvain(n) AS community)
)
ORDER BY community;
```

## community_id

```sql
community_id(node) → INTEGER
```

Aliases: `communityId`. The community id of the node from the default
community detection; the same value `community_count()` counts.

## lcc

```sql
lcc(node) → DOUBLE
```

Aliases: `local_clustering_coefficient`, `clustering_coefficient`. Fraction of
a node's neighbours that are connected to each other, `0.0` to `1.0`. Nodes
with fewer than two neighbours return `0.0`.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, lcc(n) AS clustering)
) AS g
WHERE clustering > 0.5
ORDER BY clustering DESC;
-- bob 1.0, dave 1.0
```

## triangle_count

```sql
triangle_count(node) → INTEGER
```

Aliases: `triangleCount`. Number of triangles (three mutually connected nodes)
the node takes part in.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, triangle_count(n) AS triangles)
)
ORDER BY triangles DESC;
-- alice 1, bob 1, dave 1, carol 0
```

## degree, in_degree, out_degree

```sql
degree(node) → INTEGER
in_degree(node) → INTEGER
out_degree(node) → INTEGER
```

Edge counts: all edges, incoming edges, outgoing edges.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, degree(n) AS total, in_degree(n) AS followers, out_degree(n) AS following)
)
ORDER BY followers DESC;
-- alice 4/3/1, bob 2/1/1, dave 2/0/2, carol 1/0/1
```

## closeness

```sql
closeness(node) → DOUBLE
```

Aliases: `closeness_centrality`. How near a node is to every node it can
reach; higher means fewer hops on average. Nodes in small or disconnected
components score lower.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, closeness(n) AS centrality)
)
ORDER BY centrality DESC;
-- dave 0.45, bob 0.27, carol 0.27, alice 0.20
```

## betweenness

```sql
betweenness(node) → DOUBLE
```

Aliases: `betweenness_centrality`. How often a node lies on shortest paths
between other nodes. This is the most expensive function here; on a graph with
hundreds of thousands of nodes prefer a background config.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, betweenness(n) AS bridge_score)
)
ORDER BY bridge_score DESC;
-- alice 0.15, everyone else 0
```

## component_count, community_count

```sql
component_count() → INTEGER
community_count() → INTEGER
```

Aliases: `componentCount`, `communityCount`. Whole-graph values: the number of
weakly connected components, and the number of communities found by the
default community detection. They take no argument and repeat the same value
on every row, so read them with `LIMIT 1`.

```sql
SELECT components FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (component_count() AS components)
) AS g
LIMIT 1;
```

## Background computation

The same algorithms can be scheduled with a `raisin:GraphAlgorithmConfig` node
and their results stored per branch. Stored results are used by the platform
(console, `relates_cache` for row-level security); the functions on this page
always compute on the fly. See
[Background precomputation](/docs/guides/querying/graph-algorithms#background-precomputation)
for the config fields.
