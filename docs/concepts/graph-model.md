---
sidebar_position: 10
---

# Graph Model

Every node in RaisinDB sits in a hierarchy (its path) and can also be connected
to any other node by a typed, directed **relation**. Relations turn a repository
into a property graph: you create edges with the `RELATE` statement and query
them with SQL/PGQ `GRAPH_TABLE`.

## Nodes and relations

Nodes are the documents you already know. They are created with ordinary
`INSERT` statements or through the API:

```sql
INSERT INTO 'social' (path, node_type, name, properties) VALUES
  ('/alice', 'social:Person', 'alice', '{"name":"Alice","city":"Zurich"}'::jsonb),
  ('/bob',   'social:Person', 'bob',   '{"name":"Bob","city":"Bern"}'::jsonb),
  ('/graph-intro', 'social:Article', 'graph-intro', '{"title":"Graph Intro"}'::jsonb);
```

A **relation** is a directed edge from a source node to a target node. It has a
`relation_type` (any string, matched case-sensitively) and an optional numeric
`weight`. Relations are stored in a relation index, not inside the node record,
so adding one does not create a new revision of either node.

```sql
-- bob follows alice
RELATE FROM path='/bob' IN WORKSPACE 'social'
       TO   path='/alice' IN WORKSPACE 'social'
       TYPE 'follows';

-- a weighted edge
RELATE FROM path='/alice' IN WORKSPACE 'social'
       TO   path='/graph-intro' IN WORKSPACE 'social'
       TYPE 'authored' WEIGHT 1.0;

-- remove an edge
UNRELATE FROM path='/bob' IN WORKSPACE 'social'
         TO   path='/alice' IN WORKSPACE 'social'
         TYPE 'follows';
```

Both endpoints are written as `path='…'` or `id='…'`. When `TYPE` is omitted the
relation type is `references`. Each call returns `affected_rows: 1`.

The full grammar and the branch and workspace options are in the
[Graph DML reference](/docs/reference/sql/statements/graph-dml).

### Cross-workspace relations

A relation can point into another workspace; `IN WORKSPACE` names each side:

```sql
RELATE FROM path='/alice' IN WORKSPACE 'social'
       TO   path='/zurich-hb' IN WORKSPACE 'places'
       TYPE 'lives_near';
```

### Relations on a branch

Relations belong to a branch like everything else. `IN BRANCH` writes the edge
on a branch other than the one the connection is using:

```sql
RELATE IN BRANCH 'feature'
       FROM path='/alice' IN WORKSPACE 'social'
       TO   path='/advanced-graphs' IN WORKSPACE 'social'
       TYPE 'authored';
```

Querying the branch (`POST /api/sql/{repo}/feature`) shows the new edge; `main`
does not.

## Querying with GRAPH_TABLE

`GRAPH_TABLE` matches a pattern against the relation index and returns the
result as a table. Write it directly after `FROM`, with no space before the
opening parenthesis:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (a:Person)-[r:follows]->(b:Person)
  COLUMNS (a.name AS follower, b.name AS followed, r.weight AS weight)
);
```

```json
{"columns":["follower","followed","weight"],
 "rows":[{"follower":"bob","followed":"alice","weight":null},
         {"follower":"carol","followed":"alice","weight":null},
         {"follower":"dave","followed":"bob","weight":2.5},
         {"follower":"dave","followed":"alice","weight":null}]}
```

A few things to know about patterns:

- A node label is the **local part** of the node type, so `(a:Person)` matches
  `social:Person`. Labels are case-insensitive. Quote the full type in backticks
  to pin one namespace: ``(a:`social:Person`)``.
- Relation types are matched exactly, including case: `[:follows]` does not
  match an edge created with `TYPE 'FOLLOWS'`.
- Inside `COLUMNS` and `WHERE`, a node variable exposes the system fields
  (`id`, `path`, `name`, `node_type`, `workspace`, `parent_id`, `created_at`,
  `updated_at`) and any property by name: `a.city` is the same as
  `a.properties->>'city'`.
- An edge variable exposes `relation_type` and `weight`.
- Filters go in the `WHERE` clause between `MATCH` and `COLUMNS`.

### Incoming and outgoing edges

Direction is part of the pattern:

```sql
-- who follows alice (incoming)
SELECT * FROM GRAPH_TABLE(
  MATCH (a)<-[r]-(other) WHERE a.path = '/alice'
  COLUMNS (other.path AS follower, r.relation_type AS type)
);
-- rows: /bob, /carol, /dave

-- what alice points at (outgoing)
SELECT * FROM GRAPH_TABLE(
  MATCH (a)-[r]->(other) WHERE a.path = '/alice'
  COLUMNS (other.path AS target, r.relation_type AS type)
);
-- rows: /graph-intro (authored)
```

### Multi-hop paths

Chain patterns for a fixed number of hops, or use a quantifier after the arrow
for a range:

```sql
-- exactly two hops
SELECT * FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->(b:Person)-[:follows]->(c:Person)
  COLUMNS (a.name AS start, b.name AS via, c.name AS end)
);

-- one to three hops from dave
SELECT * FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->{1,3}(b:Person)
  WHERE a.path = '/dave'
  COLUMNS (a.name AS start, b.name AS reached)
);
-- rows: dave→bob, dave→alice (direct), dave→alice (via bob)
```

Every distinct path is a row, so a node reachable two ways appears twice. Wrap
the query in `SELECT DISTINCT` when you want each endpoint once.

Path variables, shortest-path selectors and the quantifier rules are covered in
the [GRAPH_TABLE reference](/docs/reference/sql/graph/pgq).

## Combining graph results with SQL

`GRAPH_TABLE` is a table expression, so the outer query can filter, sort,
group and join it like any other table:

```sql
-- follower count per person
SELECT followed, COUNT(*) AS followers
FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->(b:Person)
  COLUMNS (b.name AS followed)
) AS g
GROUP BY followed
ORDER BY followers DESC;
-- alice 3, bob 1

-- join back to the workspace for more columns
SELECT g.follower, s.properties->>'city' AS city
FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->(b:Person)
  COLUMNS (a.name AS follower, a.id AS follower_id)
) AS g
JOIN 'social' s ON s.id = g.follower_id;
```

Aggregates such as `COUNT` and `COLLECT` are also accepted inside `COLUMNS`,
but there they aggregate over the whole match set rather than per node. Use an
outer `GROUP BY`, as above, for per-node counts.

## Graph algorithms

PageRank, degree, connected components, community detection and shortest-path
distances are available as functions inside `COLUMNS`:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, pageRank(n) AS rank, in_degree(n) AS followers)
) ORDER BY rank DESC;
```

See the [Graph Algorithms guide](/docs/guides/querying/graph-algorithms).

## Weights

`WEIGHT` stores a number on the edge. It is returned as `r.weight`, drives
`ANY CHEAPEST` path selection (`COST r.weight`) and the weighted shortest-path
function `sssp()`. Edges created without a weight return `NULL` for
`r.weight`; a query that filters or sorts on the weight only sees weighted edges.

## Modelling relation types

Relation types are free-form strings. Choose descriptive, lower-case names and
keep them consistent, because pattern matching on the type is exact:

| Purpose | Examples |
|---|---|
| Content links | `references`, `related_to`, `part_of` |
| Authorship | `authored`, `edited_by`, `reviewed_by` |
| Social | `follows`, `likes`, `commented_on` |
| Taxonomy | `tagged_with`, `categorized_as` |

A symmetric relationship such as friendship is two edges, one in each
direction; the pattern `(a)-[:follows]->(b)` only follows the stored direction.

## Other ways to read and write relations

- **JavaScript SDK** (`@raisindb/client`, WebSocket):
  `ws.nodes().addRelation(sourcePath, type, targetPath, weight?)`,
  `ws.nodes().removeRelation(sourcePath, targetPath)` and
  `ws.nodes().getRelationships(path)`, which returns `{ outgoing, incoming }`.
- **`NEIGHBORS(start, direction, type)`** is a table function
  (`SELECT * FROM NEIGHBORS('social:/alice', 'IN', 'follows')`) that lists the
  nodes adjacent to a start node without a pattern. On the current build it
  returns no rows for relations that `GRAPH_TABLE` finds; prefer `GRAPH_TABLE`
  until that is resolved.

## Next steps

- [GRAPH_TABLE reference](/docs/reference/sql/graph/pgq)
- [Graph DML: RELATE, UNRELATE, MOVE, COPY](/docs/reference/sql/statements/graph-dml)
- [Graph Algorithms guide](/docs/guides/querying/graph-algorithms)
- [Paths and hierarchy](/docs/concepts/data-model/paths-and-hierarchy)
