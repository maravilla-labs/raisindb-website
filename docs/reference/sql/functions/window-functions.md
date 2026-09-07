---
sidebar_position: 6
---

# Window Functions

A window function computes a value for each row from the rows around it, without collapsing the result the way `GROUP BY` does. It is written as `function(...) OVER (...)`.

```sql
function(...) OVER (
    [ PARTITION BY expression [, ...] ]
    [ ORDER BY expression [ ASC | DESC ] [, ...] ]
    [ ROWS BETWEEN frame_start AND frame_end ]
)
```

Available today: `ROW_NUMBER()` and the aggregates `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`. `RANK`, `DENSE_RANK`, `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE` and `NTILE` are not available in the current build (`LAG` and the others are rejected by the analyzer; `RANK` and `DENSE_RANK` are accepted but fail at execution).

<!-- TODO(sql-ext): fill from engine report -->

The examples use the `blog` workspace: `hello` (depth 1, page), `news` (depth 1, folder), `first` and `second` (depth 2, pages).

## ROW_NUMBER

Sequential number of the row within its partition, in the window's `ORDER BY`.

```sql
ROW_NUMBER() OVER (...) → BIGINT
```

```sql
SELECT name, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM 'blog' ORDER BY name;
-- {"name":"first","rn":1}, {"name":"hello","rn":2}, {"name":"news","rn":3}, {"name":"second","rn":4}

SELECT name, node_type, ROW_NUMBER() OVER (PARTITION BY node_type ORDER BY name) AS rn
FROM 'blog' ORDER BY node_type, name;
```

```json
{"name":"news","node_type":"raisin:Folder","rn":1}
{"name":"first","node_type":"raisin:Page","rn":1}
{"name":"hello","node_type":"raisin:Page","rn":2}
{"name":"second","node_type":"raisin:Page","rn":3}
```

Top-N per group is a subquery over `ROW_NUMBER()`; a window function cannot appear in `WHERE` directly:

```sql
SELECT * FROM (
  SELECT name, node_type, ROW_NUMBER() OVER (PARTITION BY node_type ORDER BY name) AS rn FROM 'blog'
) ranked WHERE rn <= 1;
-- {"name":"news","node_type":"raisin:Folder","rn":1}, {"name":"first","node_type":"raisin:Page","rn":1}
```

## Aggregates over a window

`COUNT`, `SUM`, `AVG`, `MIN` and `MAX` with `OVER` keep every row and attach the aggregate of the row's frame.

```sql
SELECT name, node_type,
       COUNT(*) OVER () AS total,
       COUNT(*) OVER (PARTITION BY node_type) AS per_type,
       AVG(depth) OVER (PARTITION BY node_type) AS avg_depth,
       MAX(depth) OVER (PARTITION BY node_type) AS max_depth
FROM 'blog' ORDER BY node_type, name;
```

```json
{"name":"news","node_type":"raisin:Folder","total":4,"per_type":1,"avg_depth":1.0,"max_depth":1}
{"name":"first","node_type":"raisin:Page","total":4,"per_type":3,"avg_depth":1.6666666666666667,"max_depth":2}
{"name":"hello","node_type":"raisin:Page","total":4,"per_type":3,"avg_depth":1.6666666666666667,"max_depth":2}
{"name":"second","node_type":"raisin:Page","total":4,"per_type":3,"avg_depth":1.6666666666666667,"max_depth":2}
```

## Frames

A `ROWS BETWEEN` clause picks which rows of the partition, relative to the current one, feed the aggregate. Bounds are `UNBOUNDED PRECEDING`, `n PRECEDING`, `CURRENT ROW`, `n FOLLOWING` and `UNBOUNDED FOLLOWING`.

```sql
SELECT name, depth,
       SUM(depth) OVER (ORDER BY name ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running,
       AVG(depth) OVER (ORDER BY name ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS centered
FROM 'blog' ORDER BY name;
```

```json
{"name":"first","depth":2,"running":2,"centered":1.5}
{"name":"hello","depth":1,"running":3,"centered":1.3333333333333333}
{"name":"news","depth":1,"running":4,"centered":1.3333333333333333}
{"name":"second","depth":2,"running":6,"centered":1.5}
```

When no frame is given, the aggregate covers the whole partition, with or without `ORDER BY`. That differs from PostgreSQL, where an `ORDER BY` alone implies a running frame. Write the frame out when you want a running total:

```sql
SELECT name, depth, SUM(depth) OVER (ORDER BY name) AS whole FROM 'blog' ORDER BY name;
-- every row: "whole": 6
```

`RANGE BETWEEN ...` is accepted and treated the same as `ROWS BETWEEN ...` (bounds count rows, not values).

## PARTITION BY and ORDER BY

`PARTITION BY` splits the rows into independent groups; `ORDER BY` inside `OVER` sets the numbering order and the frame order and may list several expressions with `ASC` / `DESC`. Both accept any expression, including JSON accesses:

```sql
SELECT properties->>'title' AS title,
       ROW_NUMBER() OVER (PARTITION BY properties->>'published' ORDER BY (properties->>'views')::INT DESC) AS rank_in_group
FROM 'blog' WHERE node_type = 'raisin:Page';
```

The outer query's `ORDER BY` is separate from the window's; add one when the output order matters.

## Notes

- Several window functions can share one statement, each with its own `OVER`.
- Window functions run after `WHERE` and `GROUP BY`; to filter on their result, wrap the query in a subquery.
- A window can be applied over a `GROUP BY` result, which gives percentages of a total in one statement:

```sql
SELECT node_type, COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS pct FROM 'blog' GROUP BY node_type;
-- {"node_type":"raisin:Folder","pct":25.0}, {"node_type":"raisin:Page","pct":75.0}
```
