---
sidebar_position: 1
---

# SELECT Statement

`SELECT` reads nodes from a workspace. Examples on this page run against a `blog` workspace holding a `/hello` page, a `/news` folder and two pages under it.

## Syntax

```sql
[ EXPLAIN ]
[ WITH name AS ( query ) [, ...] ]
SELECT [ DISTINCT ] expression [ AS alias ] [, ...]
FROM 'workspace' [ alias ] | ( subquery ) alias | table_function(...) alias
[ JOIN 'workspace' alias ON condition ] [ ... ]
[ WHERE condition ]
[ GROUP BY expression [, ...] ]
[ HAVING condition ]
[ { UNION [ ALL ] | INTERSECT | EXCEPT } query ]
[ ORDER BY expression [ ASC | DESC ] [, ...] ]
[ LIMIT count ] [ OFFSET start ]
```

Subqueries appear in `FROM`, in `IN (SELECT ...)`, in `EXISTS`, in `ANY` / `ALL` and as scalar values. A subquery cannot reference a column of the enclosing query; correlated subqueries are rejected at analysis time.

## Select list

Node columns, JSON accesses, expressions and functions, each with an optional alias:

```sql
SELECT path, name, node_type, depth,
       properties->>'title' AS title,
       (properties->>'views')::INT AS views,
       UPPER(name) AS upper_name,
       DEPTH(path) AS d
FROM 'blog'
ORDER BY path;
```

```json
{"columns":["path","name","node_type","depth","title","views","upper_name","d"],
 "rows":[
  {"path":"/hello","name":"hello","node_type":"raisin:Page","depth":1,"title":"Hello","views":12,"upper_name":"HELLO","d":1},
  {"path":"/news","name":"news","node_type":"raisin:Folder","depth":1,"title":"News","views":null,"upper_name":"NEWS","d":1},
  {"path":"/news/first","name":"first","node_type":"raisin:Page","depth":2,"title":"First post","views":42,"upper_name":"FIRST","d":2},
  {"path":"/news/second","name":"second","node_type":"raisin:Page","depth":2,"title":"Second","views":7,"upper_name":"SECOND","d":2}],
 "row_count":4,"execution_time_ms":2}
```

`SELECT *` returns every node column, listed in the [overview](../overview.md#node-columns). An unaliased expression gets a generated name such as `column1`, so alias anything you will read by name.

`TO_JSON(alias)` turns a whole row into one JSON object:

```sql
SELECT TO_JSON(b) AS node FROM 'blog' b WHERE path = '/hello';
```

## FROM

The table is a workspace. Quote the name; an alias is optional.

```sql
SELECT p.name FROM 'blog' p;
SELECT name FROM 'raisin:access_control' WHERE node_type = 'raisin:Role';
```

Other things that can appear in `FROM`:

- The schema tables `NodeTypes`, `Archetypes`, `ElementTypes`, `Workspaces` ([Schema Tables](../schema-tables.md)).
- A subquery with an alias: `FROM (SELECT name, depth FROM 'blog') sub WHERE depth = 1`.
- A CTE name from a `WITH` clause.
- The table functions `NEIGHBORS(...)` ([Path functions](../functions/path-functions.md#neighbors)) and `GRAPH_TABLE(...)` ([Graph algorithms](../functions/graph-algorithms.md)).

## WHERE

Any BOOLEAN expression built from the [operators](../operators.md) and functions. The predicates below are the ones used most; each returns the rows shown for the example workspace.

```sql
-- property equality (text)
SELECT name FROM 'blog' WHERE properties->>'title' = 'Hello';                -- hello

-- numeric comparison needs a cast
SELECT name FROM 'blog' WHERE (properties->>'views')::INT > 20;              -- first

-- JSON containment and key test
SELECT name FROM 'blog' WHERE properties @> '{"published": true}';           -- hello, second
SELECT name FROM 'blog' WHERE properties ? 'author';                          -- second

-- pattern, list, range
SELECT name FROM 'blog' WHERE name LIKE 'h%';                                 -- hello
SELECT name FROM 'blog' WHERE name IN ('news', 'first');                      -- news, first
SELECT name FROM 'blog' WHERE depth BETWEEN 1 AND 2;                          -- all four

-- missing property
SELECT name FROM 'blog' WHERE properties->>'summary' IS NULL;                 -- all four

-- hierarchy
SELECT name FROM 'blog' WHERE CHILD_OF('/news');                              -- first, second
SELECT name FROM 'blog' WHERE DESCENDANT_OF('/news');                         -- first, second
SELECT name FROM 'blog' WHERE PATH_STARTS_WITH(path, '/news');                -- news, first, second
SELECT name FROM 'blog' WHERE DEPTH(path) = 1;                                -- hello, news

-- timestamps: compare against a cast literal or NOW()
SELECT name FROM 'blog'
WHERE created_at > '2020-01-01T00:00:00Z'::TIMESTAMPTZ AND created_at < NOW();

-- references (workspace prefix required)
SELECT name FROM 'blog' WHERE REFERENCES('blog:/news/second');                -- first

-- subquery membership
SELECT name FROM 'blog' WHERE path IN (SELECT PARENT(path) FROM 'blog');      -- news
```

Bound parameters replace literals anywhere in the statement:

```json
{"sql": "SELECT name FROM 'blog' WHERE properties->>'title' = $1 AND depth = $2", "params": ["Hello", 1]}
```

`created_at > NOW() - INTERVAL '1 hour'` is currently rejected (`Range scan not supported for this predicate`); compute the boundary on the client and pass it as a cast literal or parameter.

## JOIN

`INNER JOIN`, `LEFT JOIN` and `CROSS JOIN` are accepted between workspaces, schema tables and subqueries. Join on plain column equality; the executor evaluates that form correctly.

```sql
SELECT p.path, f.path AS folder
FROM 'blog' p
INNER JOIN 'blog' f ON p.parent_name = f.name
ORDER BY p.path;
```

```json
{"columns":["path","folder"],"rows":[{"path":"/news/first","folder":"/news"},{"path":"/news/second","folder":"/news"}],"row_count":2,"execution_time_ms":2}
```

```sql
SELECT b.name, w.name AS ws
FROM 'blog' b JOIN Workspaces w ON w.name = b.__workspace
LIMIT 1;
-- {"name":"hello","ws":"blog"}

SELECT COUNT(*) AS pairs FROM 'blog' a CROSS JOIN 'blog' b;
-- {"pairs":16}
```

A join condition that wraps a column in a function, such as `ON PARENT(p.path) = f.path`, does not evaluate correctly today (an inner join returns no rows and a left join pairs each row with itself). Keep join keys to columns, or join on the `parent_name` and `id` columns as above.

## GROUP BY and aggregates

```sql
SELECT node_type, COUNT(*) AS n, SUM((properties->>'views')::INT) AS views
FROM 'blog'
GROUP BY node_type
ORDER BY node_type;
```

```json
{"columns":["node_type","n","views"],"rows":[{"node_type":"raisin:Folder","n":1,"views":0.0},{"node_type":"raisin:Page","n":3,"views":61.0}],"row_count":2,"execution_time_ms":2}
```

Group by any expression, including a JSON access or a path function:

```sql
SELECT PARENT(path) AS parent, COUNT(*) AS children FROM 'blog' GROUP BY PARENT(path) ORDER BY parent;
-- {"parent":"/","children":2}, {"parent":"/news","children":2}

SELECT properties->>'published' AS published, COUNT(*) AS n
FROM 'blog' GROUP BY properties->>'published' ORDER BY published;
-- {"published":"false","n":1}, {"published":"true","n":2}, {"published":null,"n":1}
```

`HAVING` filters the groups, so it can test an aggregate:

```sql
SELECT node_type, COUNT(*) AS n FROM 'blog' GROUP BY node_type HAVING COUNT(*) > 1;
-- {"node_type":"raisin:Page","n":3}
```

The condition may also test a grouping key, and it works without `GROUP BY`, where the whole result is one group:

```sql
SELECT node_type, COUNT(*) AS n FROM 'blog' GROUP BY node_type HAVING node_type = 'raisin:Page';
SELECT COUNT(*) AS n FROM 'blog' WHERE node_type = 'raisin:Page' HAVING COUNT(*) > 2;
```

Aggregate functions and `FILTER (WHERE ...)` are described under [Aggregate functions](../functions/aggregate-functions.md).

## Set operations

Two queries can be combined with `UNION`, `UNION ALL`, `INTERSECT` or `EXCEPT`. Both sides must produce the same number of columns; the column names come from the left side. `UNION`, `INTERSECT` and `EXCEPT` remove duplicates, `UNION ALL` keeps them. `ORDER BY` and `LIMIT` written after the last query apply to the combined result.

```sql
SELECT name FROM 'blog' WHERE depth = 1
UNION
SELECT name FROM 'blog' WHERE node_type = 'raisin:Folder'
ORDER BY name;
-- hello, news

SELECT name FROM 'blog' WHERE depth = 1
UNION ALL
SELECT name FROM 'blog' WHERE node_type = 'raisin:Folder'
ORDER BY name;
-- hello, news, news

SELECT name FROM 'blog' WHERE depth = 1
INTERSECT
SELECT name FROM 'blog' WHERE node_type = 'raisin:Page';
-- hello

SELECT name FROM 'blog' WHERE node_type = 'raisin:Page'
EXCEPT
SELECT name FROM 'blog' WHERE depth = 2;
-- hello
```

Mismatched arity is rejected: `each UNION query must have the same number of columns: left has 1, right has 2`.

## Subqueries

A subquery in `FROM` or `IN (SELECT ...)` is covered above. Three more forms are available, and none of them may reference a column of the enclosing query.

### Scalar subqueries

A query returning one row and one column is a value. It can sit in the select list or on either side of a comparison. An empty result reads as NULL; more than one row is an error.

```sql
SELECT name, (SELECT COUNT(*) FROM 'blog' WHERE node_type = 'raisin:Page') AS pages
FROM 'blog' WHERE path = '/hello';
-- {"name":"hello","pages":3}

SELECT name FROM 'blog'
WHERE (properties->>'views')::INT = (SELECT MAX((properties->>'views')::INT) FROM 'blog');
-- first
```

### EXISTS

`EXISTS (subquery)` is true when the subquery returns at least one row, `NOT EXISTS` when it returns none.

```sql
SELECT name FROM 'blog'
WHERE EXISTS (SELECT 1 FROM 'blog' WHERE node_type = 'raisin:Folder') AND depth = 1
ORDER BY name;
-- hello, news
```

### ANY and ALL

`expression op ANY (subquery)` is true when the comparison holds for at least one returned row; `ALL` requires every row. `SOME` is a synonym for `ANY`. The right-hand side must be a subquery.

```sql
SELECT name FROM 'blog' WHERE path = ANY (SELECT PARENT(path) FROM 'blog');
-- news

SELECT name FROM 'blog' WHERE name <> ALL (SELECT name FROM 'blog' WHERE depth = 2) ORDER BY name;
-- hello, news
```

A correlated subquery is rejected before execution:

```
Correlated subqueries that reference the outer query are not supported;
rewrite as a JOIN or an IN (SELECT ...) predicate
```

## DISTINCT

```sql
SELECT DISTINCT node_type FROM 'blog' ORDER BY node_type;
-- raisin:Folder, raisin:Page
```

## ORDER BY, LIMIT, OFFSET

Sort by columns or expressions, ascending by default.

```sql
SELECT name, (properties->>'views')::INT AS views
FROM 'blog'
WHERE properties ? 'views'
ORDER BY (properties->>'views')::INT DESC
LIMIT 2 OFFSET 0;
```

```json
{"columns":["name","views"],"rows":[{"name":"first","views":42},{"name":"hello","views":12}],"row_count":2,"execution_time_ms":1}
```

Two things to know:

- Sorting by a JSON access (`ORDER BY properties->>'title'`) adds the `properties` column to the result even when it is not selected. Sorting by a cast expression or a named column does not.
- `NULLS FIRST` / `NULLS LAST` is accepted, but `NULLS FIRST` adds the sort column to the output.

For paging large result sets, prefer a keyset cursor over a growing `OFFSET`; see [Pagination](/docs/guides/querying/pagination).

## Common table expressions

```sql
WITH pages AS (
  SELECT name, depth FROM 'blog' WHERE node_type = 'raisin:Page'
)
SELECT name FROM pages WHERE depth = 2;
-- first, second
```

A CTE can be reused in `FROM` like a workspace. Aggregating over a CTE works the same way as over a workspace.

## Window functions

`ROW_NUMBER()` and the aggregates `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` accept an `OVER (...)` clause with `PARTITION BY`, `ORDER BY` and a `ROWS BETWEEN` frame:

```sql
SELECT name, node_type,
       ROW_NUMBER() OVER (PARTITION BY node_type ORDER BY name) AS rn,
       COUNT(*) OVER (PARTITION BY node_type) AS per_type
FROM 'blog'
ORDER BY node_type, name;
```

```json
{"rows":[{"name":"news","node_type":"raisin:Folder","rn":1,"per_type":1},{"name":"first","node_type":"raisin:Page","rn":1,"per_type":3},{"name":"hello","node_type":"raisin:Page","rn":2,"per_type":3},{"name":"second","node_type":"raisin:Page","rn":3,"per_type":3}]}
```

Top-N per group is a subquery over `ROW_NUMBER()`:

```sql
SELECT * FROM (
  SELECT name, node_type, ROW_NUMBER() OVER (PARTITION BY node_type ORDER BY name) AS rn FROM 'blog'
) ranked WHERE rn <= 1;
```

See [Window functions](../functions/window-functions.md) for frames and the current limits (`RANK`, `LAG`, `LEAD` and friends are not available).

## EXPLAIN

Prefix any `SELECT`, `UPDATE` or `DELETE` with `EXPLAIN` to see the plan without running it:

```sql
EXPLAIN SELECT name FROM 'blog' WHERE properties->>'title' = 'Hello' ORDER BY created_at DESC LIMIT 5;
```

```
=== Physical Execution Plan ===
Limit: limit=5, offset=0
  Project: 2 expressions
    PropertyOrderScan: __created_at DESC limit_hint=5
```

The scan node tells you which index served the query: `PathIndexScan` for `path = ...`, `PropertyOrderScan` for an `ORDER BY` on an indexed column, `ReferenceIndexScan` for `REFERENCES(...)`, `TableScan` when nothing applied.

## Reading another branch

`WHERE __branch = 'staging'` reads the same workspace on another branch; the predicate selects the branch and is dropped from the filter. The request URL form `POST /api/sql/{repo}/{branch}` does the same for a whole request.

```sql
SELECT properties->>'title' AS title FROM 'blog' WHERE __branch = 'staging' AND path = '/hello';
```

## Editorial order columns

Two columns expose the manual (drag-and-drop) order a parent's children are kept in:

| Column | Orders a node | Use for |
| --- | --- | --- |
| `__order` | among its siblings | listing or paging one parent's children |
| `__tree_order` | within a subtree (document order) | listing or paging a whole tree |

Both are opaque, lexicographically sortable text. Sort by them, and pass the last row's value back as a keyset cursor; treat the value as a token rather than parsing it.

```sql
SELECT name, __order FROM 'blog' WHERE CHILD_OF('/news') ORDER BY __order;
-- {"name":"first","__order":"80::1a078051ec00000000000000000"}, {"name":"second","__order":"8180::1a078051ec00000000000000000"}

SELECT name, __tree_order FROM 'blog' WHERE DESCENDANT_OF('/news') AND __tree_order > $1
ORDER BY __tree_order LIMIT 20;
```

`__tree_order` is populated by tree traversals (`DESCENDANT_OF`, full scans) and is NULL on other scans.

`path` and `__order` both put parents before children, but they order siblings differently: `path` alphabetically, `__order` editorially. Keep the cursor column and the `ORDER BY` column the same, otherwise paging drops and duplicates rows.
