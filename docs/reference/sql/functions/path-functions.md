---
sidebar_position: 3
---

# Path Functions

Nodes live in a tree, and the `path` column is the address in it. These functions compute with paths and select by position in the hierarchy. Examples use a `blog` workspace with `/hello`, `/news`, `/news/first` and `/news/second`.

Two kinds of function appear here. `DEPTH`, `PARENT`, `ANCESTOR` and `PATH_STARTS_WITH` take a path expression and can be used anywhere. `CHILD_OF`, `DESCENDANT_OF` and `REFERENCES` take only the target and apply to the current row; they belong in `WHERE` and are served by the path and reference indexes.

## DEPTH

Number of segments in a path.

```sql
DEPTH(path) → INT
```

```sql
SELECT DEPTH('/') AS root, DEPTH('/news') AS d1, DEPTH('/news/first') AS d2;
-- {"root":0,"d1":1,"d2":2}

SELECT name FROM 'blog' WHERE DEPTH(path) = 2;
-- first, second
```

The `depth` column holds the same number for every row, without a function call.

## PARENT

The parent path, or the ancestor `levels` steps up.

```sql
PARENT(path) → PATH
PARENT(path, levels) → PATH
```

```sql
SELECT path, PARENT(path) AS parent, PARENT(path, 2) AS grandparent FROM 'blog' ORDER BY path;
```

```json
{"path":"/hello","parent":"/","grandparent":""}
{"path":"/news","parent":"/","grandparent":""}
{"path":"/news/first","parent":"/news","grandparent":"/"}
{"path":"/news/second","parent":"/news","grandparent":"/"}
```

The parent of a root-level node is `/`. Going above the root yields an empty string rather than NULL.

```sql
SELECT PARENT(path) AS parent, COUNT(*) AS children FROM 'blog' GROUP BY PARENT(path) ORDER BY parent;
-- {"parent":"/","children":2}, {"parent":"/news","children":2}
```

## ANCESTOR

The prefix of a path with `n` segments: the ancestor at absolute depth `n`.

```sql
ANCESTOR(path, n) → PATH
```

```sql
SELECT path, ANCESTOR(path, 1) AS section, ANCESTOR(path, 2) AS sub FROM 'blog' ORDER BY path;
```

```json
{"path":"/hello","section":"/hello","sub":""}
{"path":"/news","section":"/news","sub":""}
{"path":"/news/first","section":"/news","sub":"/news/first"}
{"path":"/news/second","section":"/news","sub":"/news/second"}
```

When `n` equals the node's own depth the result is the path itself; when the path is shallower than `n`, or `n` is 0, the result is an empty string. `ANCESTOR(path, 1)` is the usual way to group a workspace by top-level section:

```sql
SELECT ANCESTOR(path, 1) AS section, COUNT(*) AS nodes FROM 'blog' GROUP BY ANCESTOR(path, 1);
```

## PATH_STARTS_WITH

Text prefix test on a path. Matches the prefix itself and everything below it.

```sql
PATH_STARTS_WITH(path, prefix) → BOOLEAN
```

```sql
SELECT name FROM 'blog' WHERE PATH_STARTS_WITH(path, '/news');
-- news, first, second
```

The comparison is on characters, so `/newsx` also starts with `/news`. Use `DESCENDANT_OF` when you mean tree membership.

## CHILD_OF

Rows that are direct children of a path.

```sql
CHILD_OF(parent_path) → BOOLEAN
```

```sql
SELECT name FROM 'blog' WHERE CHILD_OF('/news');
-- first, second

SELECT name FROM 'blog' WHERE CHILD_OF('/');
-- hello, news
```

`CHILD_OF` takes one argument, the parent; it always tests the current row. Writing `CHILD_OF(path, '/news')` is a `Function not found` error.

## DESCENDANT_OF

Rows anywhere under a path, optionally limited to a number of levels.

```sql
DESCENDANT_OF(ancestor_path) → BOOLEAN
DESCENDANT_OF(ancestor_path, max_levels) → BOOLEAN
```

```sql
SELECT name FROM 'blog' WHERE DESCENDANT_OF('/news');
-- first, second

SELECT name FROM 'blog' WHERE DESCENDANT_OF('/news', 1);   -- one level only
-- first, second
```

The ancestor itself is not included. The traversal is depth-first in document order, so parents come before their children, and the `__tree_order` column is populated for keyset paging (see [SELECT](../statements/select.md#editorial-order-columns)). `DESCENDANT_OF('/')` returns no rows; use a plain scan for the whole workspace.

`DESCENDANT_OF` composes with the other predicates:

```sql
SELECT name FROM 'blog'
WHERE DESCENDANT_OF('/news') AND node_type = 'raisin:Page' AND properties->>'published' = 'true'
ORDER BY name;
```

In `UPDATE` and `DELETE`, a `DESCENDANT_OF` or `CHILD_OF` predicate makes the statement a bulk job ([UPDATE](../statements/update.md#how-the-where-clause-is-executed)).

## REFERENCES

Rows whose reference properties point at a target node. The reverse reference index is keyed by the target's id, so the lookup is fast and survives the target being moved.

```sql
REFERENCES('workspace:/path') → BOOLEAN
```

A reference property is stored as `{"raisin:ref": id, "raisin:workspace": ws, "raisin:path": path}`. Writing one with a path is enough; the server resolves the id:

```sql
UPDATE 'blog'
SET properties = properties || '{"related": {"raisin:ref": "/news/second", "raisin:workspace": "blog"}}'
WHERE path = '/news/first';

SELECT properties->'related' AS related FROM 'blog' WHERE path = '/news/first';
-- {"related":{"raisin:ref":"b4363972-fe50-4fe7-8574-c29dd3fc6dfa","raisin:workspace":"blog","raisin:path":"/news/second"}}

SELECT name FROM 'blog' WHERE REFERENCES('blog:/news/second');
-- first

SELECT COUNT(*) AS n FROM 'blog' WHERE REFERENCES('blog:/news/second') AND DESCENDANT_OF('/news');
-- {"n":1}
```

The argument must carry the workspace prefix; `REFERENCES('/news/second')` fails with `must be in 'workspace:/path' format`. It can be a bound parameter (`REFERENCES($1)` with `"blog:/news/second"` in `params`). `EXPLAIN` shows a `ReferenceIndexScan`; other predicates in the same `WHERE` filter its result.

## RESOLVE

Load the node a reference points at, as JSON.

```sql
RESOLVE(reference_json) → JSONB
RESOLVE(reference_json, depth) → JSONB
```

```sql
SELECT RESOLVE(properties->'related') AS target FROM 'blog' WHERE path = '/news/first';
```

```json
{"target":{"id":"b4363972-fe50-4fe7-8574-c29dd3fc6dfa","path":"/news/second","name":"second","node_type":"raisin:Page","title":"Second","views":7,"published":true,"tags":["b","c"],"author":{"name":"Ana","city":"Lisbon"}}}
```

The result flattens the target's columns and properties into one object. `RESOLVE` must be the outermost expression of its select-list item: `RESOLVE(...)->>'name'` is not evaluated (`Unknown function: RESOLVE`), so read the field from the returned object on the client.

## NEIGHBORS

A table function over graph relations created with [`RELATE`](../statements/graph-dml.md).

```sql
NEIGHBORS(start, direction, relation_type) → TABLE
```

| Parameter | Description |
|-----------|-------------|
| start | Node id, path, or `'workspace:/path'` |
| direction | `'OUT'`, `'IN'` or `'BOTH'` |
| relation_type | A relation type name, or `NULL` / `''` for all |

```sql
SELECT n.path, n.relation_type, n.weight
FROM NEIGHBORS('blog:/news/first', 'OUT', NULL) AS n;
```

The result carries the neighbour's node columns plus `relation_type` and `weight`. In testing against the current build, `NEIGHBORS` returned no rows for relations created with `RELATE` in the same workspace; `GRAPH_TABLE` ([Graph algorithms](./graph-algorithms.md)) is the working way to traverse relations from SQL.
