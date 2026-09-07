---
sidebar_position: 5
---

# Aggregate Functions

Aggregates fold the rows of a query, or of each `GROUP BY` group, into one value. Six are implemented: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` and `ARRAY_AGG`. All of them also work as [window functions](./window-functions.md) with an `OVER` clause.

<!-- TODO(sql-ext): fill from engine report (HAVING; any further aggregates) -->

The example workspace `blog` holds a folder `/news` (no `views`) and three pages with `views` 101, 42 and 8.

## COUNT

```sql
COUNT(*) → BIGINT
COUNT(expression) → BIGINT
COUNT(*) FILTER (WHERE condition) → BIGINT
```

```sql
SELECT COUNT(*) AS nodes,
       COUNT(*) FILTER (WHERE depth = 1) AS roots,
       COUNT(*) FILTER (WHERE properties->>'published' = 'true') AS published
FROM 'blog';
-- {"nodes":4,"roots":2,"published":2}

SELECT node_type, COUNT(*) AS n FROM 'blog' GROUP BY node_type ORDER BY n DESC;
-- {"node_type":"raisin:Page","n":3}, {"node_type":"raisin:Folder","n":1}
```

`FILTER (WHERE ...)` is the way to count a subset in the same pass. The `COUNT(CASE WHEN ... THEN 1 END)` idiom is accepted by the parser but returns a wrong number in the current build; use `FILTER`.

In the current build `COUNT(expression)` counts every row, including rows where the expression is NULL, and `COUNT(DISTINCT expression)` counts every row rather than distinct values. Use `FILTER (WHERE expression IS NOT NULL)` and `SELECT DISTINCT` in a subquery for those two questions.

## SUM

```sql
SUM(expression) → DOUBLE
```

```sql
SELECT SUM((properties->>'views')::INT) AS views FROM 'blog';
-- {"views":151.0}

SELECT node_type, SUM((properties->>'views')::INT) AS views FROM 'blog' GROUP BY node_type ORDER BY node_type;
-- {"node_type":"raisin:Folder","views":0.0}, {"node_type":"raisin:Page","views":151.0}
```

NULL inputs are skipped; a group with no numeric values sums to `0.0`. The result is DOUBLE even for integer input.

## AVG

```sql
AVG(expression) → DOUBLE
```

```sql
SELECT ROUND(AVG((properties->>'views')::INT), 1) AS avg_views FROM 'blog';
-- {"avg_views":50.3}
```

NULL inputs are skipped (the folder without `views` does not pull the average down).

## MIN and MAX

```sql
MIN(expression) → type of the expression
MAX(expression) → type of the expression
```

They work on numbers, text (code-point order) and timestamps:

```sql
SELECT MIN(depth) AS shallowest, MAX(depth) AS deepest,
       MIN(name) AS first_name, MAX(name) AS last_name,
       MIN(created_at) AS first_created, MAX(updated_at) AS last_change
FROM 'blog';
```

```json
{"shallowest":1,"deepest":2,"first_name":"first","last_name":"second","first_created":"2026-09-06T18:32:15.143528+00:00","last_change":"2026-09-07T00:47:57.721929+00:00"}
```

Over an expression that is NULL for some rows, `MIN` and `MAX` do not skip the NULLs in the current build and the answer is unreliable (`MAX` came back NULL and `MIN` came back the first value seen). Restrict the rows first:

```sql
SELECT MIN((properties->>'views')::INT) AS mn, MAX((properties->>'views')::INT) AS mx
FROM 'blog' WHERE properties ? 'views';
```

## ARRAY_AGG

Collect values into an array, in scan order. NULLs are included.

```sql
ARRAY_AGG(expression) → ARRAY
```

```sql
SELECT ARRAY_AGG(name) AS names FROM 'blog';
-- {"names":["hello","news","first","second"]}

SELECT node_type, ARRAY_AGG(name) AS names FROM 'blog' GROUP BY node_type ORDER BY node_type;
-- {"node_type":"raisin:Folder","names":["news"]}, {"node_type":"raisin:Page","names":["hello","first","second"]}
```

`ARRAY_AGG(DISTINCT x)` and `ARRAY_AGG(x ORDER BY ...)` parse but the modifiers are ignored: duplicates stay and the order is the scan order. Sort or deduplicate in a subquery before aggregating.

## GROUP BY

Group by any expression: a column, a JSON access, a path function.

```sql
SELECT properties->>'published' AS published, COUNT(*) AS n
FROM 'blog' GROUP BY properties->>'published' ORDER BY published;
-- {"published":"false","n":1}, {"published":"true","n":2}, {"published":null,"n":1}

SELECT PARENT(path) AS parent, COUNT(*) AS children FROM 'blog' GROUP BY PARENT(path);
```

`HAVING` is not available yet. Filter an aggregate by wrapping the grouped query:

```sql
SELECT * FROM (
  SELECT node_type, COUNT(*) AS n FROM 'blog' GROUP BY node_type
) g WHERE n > 1;
-- {"node_type":"raisin:Page","n":3}
```

A query whose `WHERE` matches no rows returns no row at all, not a row of NULLs or zeros:

```sql
SELECT COUNT(*) AS n FROM 'blog' WHERE path = '/none';
-- {"columns":[],"rows":[],"row_count":0}
```

## Aggregates over a CTE or subquery

```sql
WITH pages AS (SELECT name, depth, node_type FROM 'blog')
SELECT node_type, COUNT(*) AS n FROM pages GROUP BY node_type ORDER BY node_type;
-- {"node_type":"raisin:Folder","n":1}, {"node_type":"raisin:Page","n":3}
```

Aggregates cannot be nested (`SUM(MAX(x))`); compute the inner aggregate in a subquery and aggregate over it.
