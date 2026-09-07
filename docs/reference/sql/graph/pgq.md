---
sidebar_position: 1
---

# Graph Queries (GRAPH_TABLE)

`GRAPH_TABLE` is RaisinDB's implementation of SQL/PGQ (SQL:2023 property graph
queries). It matches a pattern against the relations of a repository and
returns the matches as a table that the rest of the query can filter, sort,
group and join.

## Syntax

```sql
SELECT *
FROM GRAPH_TABLE(
    [graph_name]
    MATCH pattern [, pattern ...]
    [WHERE condition]
    COLUMNS ( expression [AS alias] [, ...] )
) [AS alias]
```

Write `GRAPH_TABLE(` with no space before the parenthesis. `graph_name` is
optional and is ignored for scoping; relations of every workspace on the
current branch are searched. Give the expression an alias when the outer query
refers to its columns (`... ) AS g WHERE g.hops > 1`).

## Node patterns

```sql
-- every node that has at least one relation
SELECT * FROM GRAPH_TABLE(
    MATCH (n)
    COLUMNS (n.path, n.node_type)
);

-- nodes of one type
SELECT * FROM GRAPH_TABLE(
    MATCH (n:Article)
    COLUMNS (n.title, n.path)
);

-- with a filter
SELECT * FROM GRAPH_TABLE(
    MATCH (n:Article)
    WHERE n.status = 'published'
    COLUMNS (n.title, n.created_at)
);
```

A single-node pattern is resolved from the relation index, so it returns only
nodes that are the source or target of at least one relation. Use an ordinary
`SELECT` to list every node of a type.

### Labels

Node types are namespaced (`news:Article`, `raisin:Folder`). A label is the
part after the colon, matched case-insensitively:

```sql
MATCH (n:Article)          -- matches news:Article and studio:Article
MATCH (n:`news:Article`)   -- backticks pin the full type
MATCH (n:news:Article)     -- parse error
```

`(n:Article|Page)` matches either label. Filtering on `n.node_type` in the
`WHERE` clause is another way to pin a namespace.

### Where filters go

Predicates belong in the `WHERE` clause of the `GRAPH_TABLE`, between `MATCH`
and `COLUMNS`. A `WHERE` written inside a node or edge pattern
(`(n:Page WHERE …)`) is a parse error; the message points at the supported
form.

## Relationship patterns

```sql
-- directed, typed
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Person)-[:follows]->(b:Person)
    COLUMNS (a.name AS follower, b.name AS followed)
);

-- reverse direction
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Person)<-[:follows]-(b:Person)
    WHERE a.path = '/alice'
    COLUMNS (b.name AS follower)
);

-- bound edge variable
SELECT * FROM GRAPH_TABLE(
    MATCH (a)-[r:follows]->(b)
    WHERE r.weight > 1
    COLUMNS (a.name, r.weight, b.name)
);
```

Relation types match exactly, including case (`[:follows]` does not match an
edge stored as `FOLLOWS`). A type containing a hyphen must be backticked:
``[:`tagged-with`]``. `[:follows|likes]` matches either type.

An edge pattern without an arrow, `(a)-[:follows]-(b)`, is accepted but
currently matches the stored direction only, the same as `(a)-[:follows]->(b)`.
Write two patterns when you need both directions.

### Edge fields

An edge variable exposes two fields:

| Field | Type | Description |
|---|---|---|
| `r.relation_type` | TEXT | The type given in `RELATE … TYPE` |
| `r.weight` | DOUBLE | The `WEIGHT`, or `NULL` when none was set |

Relations carry no other properties; to weight edges by a domain value, write
it into `weight` when you create them.

## Path patterns and quantifiers

```sql
-- fixed length
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Page)-[:LINKS_TO]->(b)-[:LINKS_TO]->(c)
    COLUMNS (a.title AS start, c.title AS end)
);

-- variable length
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Page)-[:LINKS_TO]->{1,3}(b:Page)
    COLUMNS (a.title, b.title)
);
```

The quantifier follows the arrow:

| Quantifier | Hops |
|------------|------|
| `->{2}` | exactly 2 |
| `->{1,3}` | 1 to 3 |
| `->{2,}` | 2 or more |
| `->*` | 0 or more |
| `->+` | 1 or more |
| `->?` | 0 or 1 |

An unbounded quantifier (`*`, `+`, `{m,}`) must be inside the scope of a
[path selector](#path-selectors) or a [path restrictor](#path-restrictors);
`MATCH (a)-[:t]->*(b)` on its own is a parse error, while
`MATCH ANY SHORTEST p = (a)-[:t]->*(b)` and `MATCH TRAIL (a)-[:t]->*(b)` are
accepted. Even then traversal stops at 10 hops. Bounded quantifiers need
neither.

Every matching path is a row. A node reachable by two routes appears twice;
use `SELECT DISTINCT` in the outer query to collapse them.

### Cypher-style quantifier

The older spelling inside the brackets still parses and is mapped as follows:

| Older form | Equivalent |
|------------|-----------|
| `-[:t*2]->` | `-[:t]->{2}` |
| `-[:t*1..3]->` | `-[:t]->{1,3}` |
| `-[:t*2..]->` | `-[:t]->{2,}` |
| `-[:t*]->` | `-[:t]->{1,}` |

Note that `*` inside the brackets means one or more, while `->*` means zero
or more. The bracket form does not need a selector or restrictor and is capped
at 10 hops.

## Path variables

Bind the path to a variable to read it with the path accessors:

```sql
SELECT hops, stops
FROM GRAPH_TABLE(
    MATCH p = (a:Person)-[:follows]->{1,3}(b:Person)
    WHERE a.path = '/dave'
    COLUMNS (path_length(p) AS hops, nodes(p) AS stops)
);
```

```json
{"columns":["hops","stops"],
 "rows":[{"hops":1,"stops":[{"id":"f3ea…","workspace":"social","node_type":"social:Person"},
                            {"id":"6637…","workspace":"social","node_type":"social:Person"}]},
         {"hops":2,"stops":[…]}]}
```

The variable can be written before the selector (`p = ANY SHORTEST (...)`) or
after the restrictor (`ANY SHORTEST TRAIL p = (...)`). A path variable is not
selectable on its own; `COLUMNS (p)` is rejected with a message naming the
accessors.

### Path accessors

| Accessor | Returns |
|----------|---------|
| `path_length(p)` | hop count |
| `nodes(p)` | array of `{id, workspace, node_type}` in order |
| `edges(p)` | array of `{source_id, source_workspace, target_id, target_workspace, relation_type, weight}` |
| `path_first(p)` | the first node |
| `path_last(p)` | the last node |
| `element_id(p)` | a stable string identifying the whole path |
| `is_trail(p)` | whether no edge repeats |
| `is_acyclic(p)` | whether no node repeats |

`element_id` takes a path variable only; it is not defined for a plain edge
variable.

### Path selectors

A selector limits how many paths are returned per pair of endpoints:

| Selector | Meaning |
|----------|---------|
| *(none)* | every matching path |
| `ANY` | one arbitrary path per endpoint pair |
| `ANY SHORTEST` | one minimum-hop path per endpoint pair |
| `ALL SHORTEST` | every minimum-hop path per endpoint pair |
| `ANY CHEAPEST` | one minimum-cost path (RaisinDB extension, requires `COST`) |

```sql
-- fewest hops from dave to alice
SELECT hops FROM GRAPH_TABLE(
    MATCH ANY SHORTEST p = (a:Person)-[:follows]->{1,6}(b:Person)
    WHERE a.path = '/dave' AND b.path = '/alice'
    COLUMNS (path_length(p) AS hops)
);
-- hops: 1

-- cheapest by edge weight
SELECT hops FROM GRAPH_TABLE(
    MATCH ANY CHEAPEST p = (a:Stop)-[r:route COST r.weight]->{1,8}(b:Stop)
    COLUMNS (path_length(p) AS hops)
);
```

`COST` needs a bound edge variable and must be `r.weight` (or a positive
literal); `COST` on an anonymous edge, on another variable, or naming a field
other than `weight` is a parse error. `ANY CHEAPEST` and `COST` go together:
either without the other is an error. Every edge on a cheapest path must carry
a positive weight; an unweighted edge on the way makes the query fail with a
message naming the edge. `SHORTEST k`, `SHORTEST k GROUP` and `ANY k` are not
implemented.

### Path restrictors

| Restrictor | Meaning |
|------------|---------|
| `WALK` | nodes and edges may repeat |
| `TRAIL` | no edge is traversed twice |
| `ACYCLIC` | no node is visited twice (default) |

Write the selector before the restrictor: `ANY SHORTEST TRAIL p = (...)`.
`SIMPLE` is not implemented.

## Properties and system fields

Inside `WHERE` and `COLUMNS`, a node variable exposes its system fields and any
property by name; `n.title` and `n.properties->>'title'` are equivalent.

| Field | Description |
|-------|-------------|
| `id` | node id |
| `path` | hierarchical path |
| `name` | last path segment |
| `node_type` | full node type, e.g. `social:Person` |
| `workspace` | workspace the node lives in |
| `parent_id` | parent node id |
| `created_at`, `updated_at` | timestamps |

```sql
SELECT * FROM GRAPH_TABLE(
    MATCH (n:Article)
    COLUMNS (n.id, n.workspace, n.node_type, n.path, n.name, n.title)
);
```

Without an alias a column is named `variable_field` (`n.title` becomes
`n_title`).

## Expressions in COLUMNS and WHERE

Comparisons, `AND`/`OR`/`NOT`, arithmetic on numeric fields and the graph
algorithm functions are supported:

```sql
SELECT * FROM GRAPH_TABLE(
    MATCH (a)-[r:follows]->(b)
    WHERE r.weight > 1
    COLUMNS (a.name, r.weight * 2 AS doubled)
);
```

General SQL functions such as `UPPER()` or `PARENT()` are not available inside
`GRAPH_TABLE`; apply them in the outer query instead.

`COUNT(x)` and `COLLECT(x)` are accepted inside `COLUMNS`, but they aggregate
over the entire match set (there is no per-node grouping inside the pattern).
For per-node counts, aggregate in the outer query:

```sql
SELECT followed, COUNT(*) AS followers
FROM GRAPH_TABLE(
    MATCH (a:Person)-[:follows]->(b:Person)
    COLUMNS (b.name AS followed)
) AS g
GROUP BY followed
ORDER BY followers DESC;
```

## Combining with SQL

```sql
-- filter and sort the matches
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Person)-[:follows]->(b:Person)
    COLUMNS (a.name AS follower, b.name AS followed)
) AS g
ORDER BY follower
LIMIT 20;

-- join back to a workspace
SELECT g.follower, s.properties->>'city' AS city
FROM GRAPH_TABLE(
    MATCH (a:Person)-[:follows]->(b:Person)
    COLUMNS (a.name AS follower, a.id AS follower_id)
) AS g
JOIN 'social' s ON s.id = g.follower_id;

-- collapse duplicate paths
SELECT DISTINCT reached
FROM GRAPH_TABLE(
    MATCH (a:Person)-[:follows]->{1,3}(b:Person)
    WHERE a.path = '/dave'
    COLUMNS (b.name AS reached)
) AS g;
```

Time-travel predicates (`__revision`) apply to workspace tables, not to
`GRAPH_TABLE`; the pattern is always matched against the current state of the
branch.

## Multiple patterns

```sql
-- two patterns sharing a variable
SELECT * FROM GRAPH_TABLE(
    MATCH
        (a:Page)-[:LINKS_TO]->(b:Page),
        (b)-[:LINKS_TO]->(c:Page)
    COLUMNS (a.title, b.title, c.title)
);

-- the same as one chain
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)-[:LINKS_TO]->(c:Page)
    WHERE a.id <> c.id
    COLUMNS (a.title AS start, b.title AS middle, c.title AS end)
);
```

## Examples

### Pages linked from a page

```sql
SELECT linked_title
FROM GRAPH_TABLE(
    MATCH (start:Page)-[:LINKS_TO]->(linked:Page)
    WHERE start.title = 'Home'
    COLUMNS (linked.title AS linked_title)
) AS results
ORDER BY linked_title;
```

### Pages reachable in exactly two hops

```sql
SELECT DISTINCT end_title
FROM GRAPH_TABLE(
    MATCH (start:Page)-[:LINKS_TO]->{2}(end:Page)
    WHERE start.title = 'Home' AND start.id <> end.id
    COLUMNS (end.title AS end_title)
) AS results;
```

### Incoming link count

```sql
SELECT page_title, COUNT(*) AS incoming_links
FROM GRAPH_TABLE(
    MATCH (source:Page)-[:LINKS_TO]->(target:Page)
    COLUMNS (target.title AS page_title)
) AS links
GROUP BY page_title
ORDER BY incoming_links DESC
LIMIT 10;
```

### Related through a shared tag

```sql
SELECT * FROM GRAPH_TABLE(
    MATCH (a:Article)-[:`tagged-with`]->(t:Tag)<-[:`tagged-with`]-(b:Article)
    WHERE a.path = '/articles/graph-intro' AND a.id <> b.id
    COLUMNS (b.title AS related, t.name AS via_tag)
);
```

### Members of a project, two node types

```sql
SELECT * FROM GRAPH_TABLE(
    MATCH (person:User|Admin)-[:MEMBER_OF]->(project:Project)
    COLUMNS (person.name, person.node_type AS role, project.name AS project_name)
);
```

## See also

- [Graph Model](/docs/concepts/graph-model) for creating relations with `RELATE`
- [Graph algorithm functions](/docs/reference/sql/functions/graph-algorithms) for `pageRank(n)`, `wcc(n)` and friends inside `COLUMNS`
