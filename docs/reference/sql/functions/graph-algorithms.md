---
sidebar_position: 12
---

# Graph Algorithm Functions

Functions for computing graph algorithms over node relationships using GRAPH_TABLE syntax.

All graph algorithm functions work inside `GRAPH_TABLE(MATCH ... COLUMNS (...))` queries. You write regular SQL — RaisinDB automatically builds the graph structure from your stored relations and runs the algorithm. No manual graph projection management needed.

```sql
-- This is all you need. RaisinDB handles the rest.
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (n.id, pageRank(n) AS rank, wcc(n) AS component)
)
ORDER BY rank DESC;
```

## pageRank

Compute PageRank centrality for a node based on its incoming relationships.

### Syntax

```sql
pageRank(node) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

To customize damping factor or iteration count, use a `GraphAlgorithmConfig` for background precomputation (see [Config Reference](#configuration)).

### Return Value

DOUBLE - PageRank score between 0.0 and 1.0. Scores across all nodes in the graph sum to approximately 1.0. Higher values indicate more influential nodes.

### Examples

```sql
-- Rank users by influence in a social network
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    pageRank(n) AS rank
  )
)
ORDER BY rank DESC
LIMIT 10;

-- PageRank with default settings (damping: 0.85, max iterations: 100)
-- To customize, configure a GraphAlgorithmConfig for background precomputation
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Article)
  COLUMNS (
    n.id AS article_id,
    pageRank(n) AS rank
  )
)
ORDER BY rank DESC;
```

### Notes

- PageRank is computed over all directed relationships in the matched subgraph
- The damping factor controls how much rank "leaks" at each step; 0.85 is the standard default
- Convergence typically occurs well before the max iteration limit

---

## bfs

Compute the breadth-first search distance (hop count) from a source node. BFS answers the question: "how many steps does it take to reach each node from a given starting point?"

### Syntax

```sql
bfs(node, source_id) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |
| source_id | TEXT | ID of the source node to measure distance from |

### Return Value

INTEGER - Number of hops from the source node. Returns NULL if the node is unreachable from the source in the directed graph.

### Examples

```sql
-- How far is everyone from Alice?
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    bfs(n, 'alice') AS hops_from_alice
  )
)
ORDER BY hops_from_alice;
-- Result:
-- alice   | Alice   | 0      ← source node itself
-- bob     | Bob     | 1      ← alice follows bob directly
-- charlie | Charlie | 1      ← alice follows charlie directly
-- dave    | Dave    | NULL   ← no path from alice to dave

-- Compare distances from two different starting points in one query
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    bfs(n, 'alice') AS from_alice,
    bfs(n, 'bob') AS from_bob
  )
);

-- Find all users within 2 hops of a hub node
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    bfs(n, 'hub-node-123') AS distance
  )
)
WHERE distance <= 2;
```

### Notes

- Treats all edges as unweighted (each hop has equal cost of 1). For weighted shortest paths, use `sssp()` instead.
- Returns 0 for the source node itself
- Returns NULL for nodes that cannot be reached from the source in the directed graph
- You can call `bfs()` with different source nodes in the same query (each computes independently)
- The graph projection (the in-memory structure used by the algorithm) is built and cached automatically — you just write SQL

---

## sssp

Compute the shortest weighted distance from a source node to all other nodes. Unlike `bfs()` which counts hops, `sssp()` respects edge weights set via `RELATE ... WITH WEIGHT`.

### Syntax

```sql
sssp(node, source_id) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |
| source_id | TEXT | ID of the source node to measure distance from |

### Return Value

DOUBLE - Weighted shortest path distance from the source node. Returns NULL if the node is unreachable.

### Examples

```sql
-- Find shortest weighted paths from a hub node
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Location)
  COLUMNS (
    n.id AS location_id,
    n.name AS name,
    sssp(n, 'headquarters') AS distance
  )
)
ORDER BY distance;
```

### Notes

- Uses edge weights defined via `RELATE ... WITH WEIGHT` syntax
- If no weights are defined, all edges default to weight 1.0 (equivalent to BFS)
- Returns 0.0 for the source node itself
- Returns NULL for unreachable nodes

---

## wcc

Compute Weakly Connected Components, assigning each node a component identifier.

### Syntax

```sql
wcc(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Component ID. Nodes with the same component ID are in the same connected component.

### Examples

```sql
-- Identify connected components in a knowledge graph
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    n.id AS topic_id,
    n.name AS name,
    wcc(n) AS component
  )
)
ORDER BY component;

-- Count the number of isolated clusters
SELECT component, COUNT(*) AS size
FROM (
  SELECT * FROM GRAPH_TABLE(
    MATCH (n:Topic)
    COLUMNS (
      wcc(n) AS component
    )
  )
)
GROUP BY component
ORDER BY size DESC;
```

### Notes

- Treats the graph as undirected (ignores edge direction)
- Useful for finding disconnected subgraphs or data islands

---

## cdlp

Community Detection via Label Propagation. Assigns each node a community label based on its neighbors.

### Syntax

```sql
cdlp(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Community label. Nodes with the same label belong to the same community.

### Examples

```sql
-- Detect communities in a social network
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    cdlp(n) AS community
  )
)
ORDER BY community;

-- Find the largest communities
SELECT community, COUNT(*) AS members
FROM (
  SELECT * FROM GRAPH_TABLE(
    MATCH (n:User)
    COLUMNS (
      cdlp(n) AS community
    )
  )
)
GROUP BY community
ORDER BY members DESC
LIMIT 5;
```

### Notes

- Produces deterministic results — same graph always yields the same communities
- Each node adopts the most common community label among its neighbors
- Fast and scalable, suitable for large graphs

---

## lcc

Compute the Local Clustering Coefficient for a node, measuring how interconnected its neighbors are.

### Syntax

```sql
lcc(node) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

DOUBLE - Clustering coefficient between 0.0 and 1.0. A value of 1.0 means all neighbors are connected to each other. Returns 0.0 for nodes with fewer than 2 neighbors.

### Examples

```sql
-- Find tightly-knit clusters of users
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    lcc(n) AS clustering
  )
)
WHERE clustering > 0.5
ORDER BY clustering DESC;
```

### Notes

- Measures the ratio of existing edges among neighbors to the maximum possible
- Nodes with degree 0 or 1 always return 0.0
- Useful for identifying clique-like structures

---

## triangle_count

Count the number of triangles a node participates in.

### Syntax

```sql
triangle_count(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Number of triangles the node is part of.

### Examples

```sql
-- Find users involved in the most triangles
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    triangle_count(n) AS triangles
  )
)
ORDER BY triangles DESC
LIMIT 10;
```

### Notes

- A triangle is a set of three mutually connected nodes
- Related to `lcc()` — the clustering coefficient is derived from triangle count and degree

---

## louvain

Louvain community detection using modularity optimization. Identifies communities by maximizing the density of edges within communities compared to edges between them.

### Syntax

```sql
louvain(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Community ID. Nodes with the same ID belong to the same community.

### Examples

```sql
-- Detect communities with modularity optimization
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    louvain(n) AS community
  )
)
ORDER BY community;
```

### Notes

- Generally produces higher-quality communities than label propagation (CDLP)
- Multi-level algorithm that iteratively merges communities
- More computationally expensive than CDLP on very large graphs

---

## degree

Count the total number of relationships (both incoming and outgoing) for a node.

### Syntax

```sql
degree(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Total degree (incoming + outgoing edges).

### Examples

```sql
-- Find the most connected users
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    degree(n) AS connections
  )
)
ORDER BY connections DESC
LIMIT 10;
```

---

## in_degree

Count the number of incoming relationships for a node.

### Syntax

```sql
in_degree(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Number of incoming edges.

### Examples

```sql
-- Find users with the most followers
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    in_degree(n) AS followers
  )
)
ORDER BY followers DESC
LIMIT 10;
```

---

## out_degree

Count the number of outgoing relationships for a node.

### Syntax

```sql
out_degree(node) → INTEGER
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

INTEGER - Number of outgoing edges.

### Examples

```sql
-- Find users who follow the most people
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    out_degree(n) AS following
  )
)
ORDER BY following DESC
LIMIT 10;
```

---

## closeness

Compute closeness centrality, measuring how close a node is to all other reachable nodes.

### Syntax

```sql
closeness(node) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

DOUBLE - Closeness centrality score. Higher values indicate nodes that can reach others in fewer hops.

### Examples

```sql
-- Find the most central users in terms of reachability
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    n.name AS name,
    closeness(n) AS centrality
  )
)
ORDER BY centrality DESC
LIMIT 10;
```

### Notes

- Higher score means a node can reach others in fewer steps on average
- Nodes in small or disconnected components receive lower scores, reflecting their limited reach in the overall graph

---

## betweenness

Compute betweenness centrality, measuring how often a node lies on shortest paths between other nodes.

### Syntax

```sql
betweenness(node) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node | NODE | Node variable from the MATCH pattern |

### Return Value

DOUBLE - Betweenness centrality score. Higher values indicate nodes that serve as bridges.

### Examples

```sql
-- Find bridge nodes in a knowledge graph
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    n.id AS topic_id,
    n.name AS name,
    betweenness(n) AS bridge_score
  )
)
ORDER BY bridge_score DESC
LIMIT 10;
```

### Notes

- High betweenness indicates a node is a critical connector or bottleneck
- More expensive than other algorithms on large graphs — for graphs with over 100K nodes, use background precomputation with a `GraphAlgorithmConfig` instead of ad-hoc queries

---

## component_count

Return the total number of weakly connected components in the graph.

### Syntax

```sql
component_count() → INTEGER
```

### Parameters

None. This is an aggregate function over the entire graph.

### Return Value

INTEGER - Number of distinct connected components.

### Examples

```sql
-- Check if the graph is fully connected
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Topic)
  COLUMNS (
    component_count() AS components
  )
)
LIMIT 1;
```

### Notes

- Returns 1 if the entire graph is connected
- Useful as a quick health check for graph connectivity

---

## community_count

Return the total number of communities detected by the default community detection algorithm.

### Syntax

```sql
community_count() → INTEGER
```

### Parameters

None. This is an aggregate function over the entire graph.

### Return Value

INTEGER - Number of distinct communities.

### Examples

```sql
-- Count communities in a social network
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    community_count() AS communities
  )
)
LIMIT 1;
```

---

## Usage with GRAPH_TABLE

All graph algorithm functions are used within the `COLUMNS` clause of a `GRAPH_TABLE` expression:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Label)
  COLUMNS (
    n.id AS node_id,
    n.name AS name,
    function_name(n) AS result
  )
)
```

Multiple algorithm functions can be combined in a single query:

```sql
-- Compute multiple metrics at once
SELECT * FROM GRAPH_TABLE(
  MATCH (n:User)
  COLUMNS (
    n.id AS user_id,
    pageRank(n) AS rank,
    degree(n) AS connections,
    louvain(n) AS community,
    lcc(n) AS clustering
  )
)
ORDER BY rank DESC;
```

---

## Configuration

Graph algorithm functions can be used directly in GRAPH_TABLE queries (ad-hoc, computed on the fly). For large graphs, configure background precomputation to cache results:

```sql
INSERT INTO "raisin:access_control" (path, name, node_type, properties) VALUES (
  '/graph-config/my-pagerank',
  'my-pagerank',
  'raisin:GraphAlgorithmConfig',
  '{"algorithm": "pagerank", "enabled": true, "target": {"mode": "all_branches"}, "refresh": {"on_relation_change": true}}'::jsonb
);
```

See the [Graph Algorithms Guide](/docs/guides/querying/graph-algorithms) for full configuration reference.

---

## Notes

- All node-level functions require a node variable from the MATCH pattern
- Aggregate functions (`component_count`, `community_count`) take no arguments
- Algorithms are computed over the subgraph defined by the MATCH pattern's node type
- Results can be filtered, sorted, and joined like any other SQL query result
