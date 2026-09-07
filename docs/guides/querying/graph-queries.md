---
sidebar_position: 3
---

# Graph Queries

How to follow relations between nodes and walk the hierarchy from SQL and from
the JavaScript SDK. Relations are created with `RELATE` (see the
[Graph Model](/docs/concepts/graph-model)); this page is about reading them.

## Relations of one node

Anchor a pattern on the node and let the direction of the edge decide what you
get back. Filters go in the `WHERE` clause between `MATCH` and `COLUMNS`.

```sql
-- outgoing: what does alice point at?
SELECT * FROM GRAPH_TABLE(
  MATCH (a)-[r]->(other) WHERE a.path = '/alice'
  COLUMNS (other.path AS target, r.relation_type AS type, r.weight AS weight)
);

-- incoming: who points at alice?
SELECT * FROM GRAPH_TABLE(
  MATCH (a)<-[r]-(other) WHERE a.path = '/alice'
  COLUMNS (other.path AS source, r.relation_type AS type)
);
```

```json
{"columns":["source","type"],
 "rows":[{"source":"/bob","type":"follows"},
         {"source":"/carol","type":"follows"},
         {"source":"/dave","type":"follows"}]}
```

Run the two queries separately when you need both directions; an edge pattern
without an arrow currently matches in the stored direction only.

### Filter by relation type

Name the type in the edge pattern. Types match exactly, including case.

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (a)<-[:follows]-(f:Person) WHERE a.path = '/alice'
  COLUMNS (f.name AS follower, f.city AS city)
);
```

`f.city` reads the `city` property; `f.properties->>'city'` is the same thing.

### Follow a chain

```sql
-- people two hops upstream of alice
SELECT DISTINCT start
FROM GRAPH_TABLE(
  MATCH (a)<-[:follows]-(b)<-[:follows]-(c) WHERE a.path = '/alice'
  COLUMNS (c.name AS start)
) AS g;

-- everything reachable from dave in one to three hops
SELECT DISTINCT reached
FROM GRAPH_TABLE(
  MATCH (a)-[:follows]->{1,3}(b) WHERE a.path = '/dave'
  COLUMNS (b.name AS reached)
) AS g;
```

`GRAPH_TABLE` returns one row per path, so `DISTINCT` collapses nodes that are
reachable more than one way.

### Count and group

Treat the `GRAPH_TABLE` result as a table:

```sql
SELECT followed, COUNT(*) AS followers
FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->(b:Person)
  COLUMNS (b.name AS followed)
) AS g
GROUP BY followed
ORDER BY followers DESC;
```

The complete pattern grammar, path variables and shortest-path selectors are
in the [GRAPH_TABLE reference](/docs/reference/sql/graph/pgq).

## Hierarchy traversal

Paths are the tree. These predicates and functions walk it without a graph
pattern:

```sql
-- direct children
SELECT path FROM 'social' WHERE CHILD_OF('/archive');

-- all descendants, or descendants down to a depth
SELECT path FROM 'social' WHERE DESCENDANT_OF('/archive');
SELECT path FROM 'social' WHERE DESCENDANT_OF('/archive', 1);

-- parent path and depth of each node under a prefix
SELECT path, PARENT(path) AS parent, DEPTH(path) AS depth
FROM 'social'
WHERE PATH_STARTS_WITH(path, '/archive');
```

```json
{"columns":["path","parent","depth"],
 "rows":[{"path":"/archive","parent":"/","depth":1},
         {"path":"/archive/team","parent":"/archive","depth":2},
         {"path":"/archive/team/erin","parent":"/archive/team","depth":3}]}
```

`DESCENDANT_OF` returns parents before children (pre-order), and children keep
their editorial order; see
[Path functions](/docs/reference/sql/functions/path-functions) for the
`__order` and `__tree_order` columns.

## JavaScript SDK

The `@raisindb/client` package talks to the WebSocket API. Relation methods
take paths and default to the workspace of the client:

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8090/sys/default/docs-graph');
await client.connect();
await client.authenticate({ username: 'admin', password: '…' });

const nodes = client.database('docs-graph').workspace('social').nodes();

// create and remove an edge
await nodes.addRelation('/bob', 'likes', '/graph-intro', 0.7);   // true
await nodes.removeRelation('/bob', '/graph-intro');              // true

// both directions of one node
const rels = await nodes.getRelationships('/alice');
// { outgoing: [{ target, workspace, target_node_type, relation_type, weight }],
//   incoming: [{ source_workspace, source_node_id, relation: { … } }] }

// direct children in editorial order
const children = await nodes.listChildren('/archive');   // Node[]
```

`addRelation` accepts an options object instead of the weight when the target
lives in another workspace: `{ targetWorkspace: 'places', weight: 1 }`.

## Next steps

- [Graph algorithms](./graph-algorithms.md) for PageRank, components and communities
- [Full-text search](./full-text-search.md)
