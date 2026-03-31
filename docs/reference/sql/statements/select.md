---
sidebar_position: 1
---

# SELECT Statement

The SELECT statement retrieves data from RaisinDB.

:::info Workspace = Table Name
In the FROM clause, the table name refers to the **workspace name**. For example, `SELECT * FROM products` queries the `products` workspace. You can also query `FROM nodes` to access all nodes across workspaces.
:::

## Syntax

```sql
[ EXPLAIN ] [ WITH cte_name AS ( query ) [, ...] ]
SELECT [ DISTINCT ] select_list
FROM workspace_name
[ WHERE condition ]
[ GROUP BY grouping_element [, ...] ]
[ HAVING condition ]
[ WINDOW window_name AS ( window_definition ) [, ...] ]
[ ORDER BY expression [ ASC | DESC ] [, ...] ]
[ LIMIT count ]
[ OFFSET start ]
```

## SELECT Clause

Specify columns and expressions to retrieve:

```sql
-- Select all columns
SELECT * FROM nodes;

-- Select node columns
SELECT id, path, node_type, properties FROM default;

-- Select properties using JSONB operators
SELECT
    properties->>'title' AS title,
    properties->>'status' AS status
FROM default;

-- Select with expressions
SELECT
    properties->>'title' AS title,
    UPPER(properties->>'status') AS status,
    DEPTH(path) AS depth
FROM default;
```

## Working with Properties

All node data is stored in the `properties` JSONB column. Use JSONB operators to access fields:

### Extract as Text (`->>`)

```sql
SELECT properties->>'title' AS title FROM default;
```

### Extract as JSONB (`->`)

```sql
SELECT properties->'tags' AS tags FROM default;
```

### Nested Access

```sql
SELECT properties->'author'->>'name' AS author_name FROM default;
```

### Cast for Comparisons

```sql
SELECT * FROM default
WHERE (properties->>'price')::numeric > 100;
```

### Containment Check

```sql
SELECT * FROM default
WHERE properties @> '{"featured": true}';
```

## FROM Clause

Specify data sources:

```sql
-- Query a specific workspace
SELECT * FROM default;

-- Query all nodes
SELECT * FROM nodes;

-- Query with alias
SELECT p.properties->>'title' AS title
FROM default p;

-- Cross-workspace query
SELECT * FROM content.nodes;
```

## WHERE Clause

Filter rows:

```sql
-- Filter by property
SELECT * FROM default
WHERE properties->>'status' = 'published';

-- Multiple conditions
SELECT * FROM default
WHERE properties->>'status' = 'published'
  AND created_at > '2024-01-01';

-- Pattern matching on property
SELECT * FROM default
WHERE properties->>'title' LIKE '%guide%';

-- NULL checks
SELECT * FROM default
WHERE properties->>'description' IS NOT NULL;

-- IN lists
SELECT * FROM default
WHERE properties->>'status' IN ('published', 'draft');

-- Hierarchical filtering
SELECT * FROM default
WHERE CHILD_OF(path, '/content');
```

## Operators

### Comparison Operators

- `=` - Equal
- `!=` or `<>` - Not equal
- `<` - Less than
- `<=` - Less than or equal
- `>` - Greater than
- `>=` - Greater than or equal

### Logical Operators

- `AND` - Logical and
- `OR` - Logical or
- `NOT` - Logical negation

### String Operators

- `LIKE` - Pattern matching with `%` and `_` wildcards
- `||` - String concatenation

### JSON Operators

- `->` - Extract JSON field as JSONB
- `->>` - Extract JSON field as text
- `@>` - JSONB contains
- `||` - JSONB merge

### Full-Text Operators

- `@@` - Full-text match

## Joins

### INNER JOIN

Returns only matching rows:

```sql
SELECT
    a.properties->>'title' AS article,
    u.properties->>'name' AS author
FROM default a
INNER JOIN default u ON a.properties->>'author_id' = u.id;
```

### LEFT JOIN

Returns all rows from left table:

```sql
SELECT
    a.properties->>'title' AS article,
    u.properties->>'name' AS author
FROM default a
LEFT JOIN default u ON a.properties->>'author_id' = u.id;
```

### RIGHT JOIN

Returns all rows from right table:

```sql
SELECT
    a.properties->>'title' AS article,
    u.properties->>'name' AS author
FROM default a
RIGHT JOIN default u ON a.properties->>'author_id' = u.id;
```

### FULL JOIN

Returns all rows from both tables:

```sql
SELECT
    a.properties->>'title' AS article,
    u.properties->>'name' AS author
FROM default a
FULL JOIN default u ON a.properties->>'author_id' = u.id;
```

### CROSS JOIN

Cartesian product of tables:

```sql
SELECT *
FROM default
CROSS JOIN nodes;
```

## GROUP BY

Aggregate rows:

```sql
-- Count by property
SELECT properties->>'status' AS status, COUNT(*) AS count
FROM default
GROUP BY properties->>'status';

-- Multiple grouping columns
SELECT node_type, properties->>'status' AS status, COUNT(*)
FROM nodes
GROUP BY node_type, properties->>'status';

-- With aggregates
SELECT
    PARENT(path, 1) AS parent,
    COUNT(*) AS child_count,
    AVG((properties->>'view_count')::int) AS avg_views
FROM default
GROUP BY PARENT(path, 1);
```

## HAVING

Filter aggregated results:

```sql
SELECT properties->>'status' AS status, COUNT(*) AS count
FROM default
GROUP BY properties->>'status'
HAVING COUNT(*) > 10;
```

## ORDER BY

Sort results:

```sql
-- Sort by property
SELECT * FROM default ORDER BY properties->>'title';

-- Descending order
SELECT * FROM default ORDER BY created_at DESC;

-- Multiple columns
SELECT * FROM default
ORDER BY properties->>'status' ASC, created_at DESC;

-- Sort by numeric property
SELECT * FROM default
ORDER BY (properties->>'price')::numeric DESC;

-- By expression
SELECT * FROM default
ORDER BY DEPTH(path), properties->>'title';
```

## LIMIT and OFFSET

Paginate results:

```sql
-- First 10 rows
SELECT * FROM default LIMIT 10;

-- Skip first 20, return next 10
SELECT * FROM default LIMIT 10 OFFSET 20;

-- Pagination example
SELECT * FROM default
ORDER BY created_at DESC
LIMIT 25 OFFSET 0;  -- Page 1
```

## DISTINCT

Remove duplicate rows:

```sql
-- Distinct values
SELECT DISTINCT properties->>'status' AS status FROM default;

-- Distinct on multiple columns
SELECT DISTINCT node_type, properties->>'status' AS status FROM nodes;
```

## Subqueries

### Scalar Subqueries

Return single value:

```sql
SELECT
    properties->>'title' AS title,
    (properties->>'view_count')::int AS views,
    (SELECT AVG((properties->>'view_count')::int) FROM default) AS avg_views
FROM default;
```

### IN Subqueries

Check membership:

```sql
SELECT * FROM nodes
WHERE node_type = 'Comment'
  AND properties->>'article_id' IN (
    SELECT id FROM nodes
    WHERE node_type = 'Article'
      AND properties->>'status' = 'published'
  );
```

### EXISTS Subqueries

Check existence:

```sql
SELECT * FROM nodes a
WHERE a.node_type = 'Article'
  AND EXISTS (
    SELECT 1 FROM nodes c
    WHERE c.node_type = 'Comment'
      AND c.properties->>'article_id' = a.id
  );
```

## Common Table Expressions (WITH)

Define temporary named result sets:

```sql
WITH published AS (
    SELECT * FROM default
    WHERE properties->>'status' = 'published'
)
SELECT
    properties->>'author' AS author,
    COUNT(*) AS article_count
FROM published
GROUP BY properties->>'author'
ORDER BY article_count DESC;
```

Multiple CTEs:

```sql
WITH
    recent AS (
        SELECT * FROM default
        WHERE created_at > NOW() - INTERVAL '30 days'
    ),
    stats AS (
        SELECT node_type, COUNT(*) AS count
        FROM recent
        GROUP BY node_type
    )
SELECT * FROM stats ORDER BY count DESC;
```

## Window Functions

Analytical functions with OVER clause:

```sql
-- Row number within partition
SELECT
    properties->>'title' AS title,
    properties->>'status' AS status,
    ROW_NUMBER() OVER (
        PARTITION BY properties->>'status'
        ORDER BY created_at
    ) AS row_num
FROM default;

-- Rank by numeric property
SELECT
    properties->>'title' AS title,
    (properties->>'view_count')::int AS views,
    RANK() OVER (ORDER BY (properties->>'view_count')::int DESC) AS rank
FROM default;

-- Aggregate over window
SELECT
    properties->>'title' AS title,
    (properties->>'view_count')::int AS views,
    AVG((properties->>'view_count')::int) OVER (
        PARTITION BY properties->>'status'
    ) AS avg_by_status
FROM default;
```

See [Window Functions](../functions/window-functions.md) for details.

## EXPLAIN

Prefix a SELECT with `EXPLAIN` to see the query execution plan without running the query:

```sql
EXPLAIN SELECT * FROM default
WHERE (properties->>'price')::numeric > 100;

EXPLAIN SELECT
    a.properties->>'title' AS title,
    u.properties->>'name' AS author
FROM default a
JOIN default u ON a.properties->>'author_id' = u.id;
```

## Node Columns

Access node columns:

```sql
SELECT
    id,              -- ULID
    path,            -- Hierarchical path
    node_type,       -- Node type name
    workspace,       -- Workspace name
    properties,      -- All node properties (JSONB)
    created_at,      -- Creation timestamp
    updated_at,      -- Last modification
    version          -- Version number
FROM default;
```

System aliases are also available: `__id`, `__path`, `__node_type`, `__created_at`, `__updated_at`, `__revision`, `__branch`.

## Examples

### Basic Query

```sql
SELECT
    properties->>'title' AS title,
    properties->>'status' AS status,
    created_at
FROM default
WHERE properties->>'status' = 'published'
ORDER BY created_at DESC
LIMIT 10;
```

### Hierarchical Query

```sql
SELECT
    path,
    properties->>'title' AS title,
    DEPTH(path) AS depth
FROM nodes
WHERE DESCENDANT_OF(path, '/content/blog')
ORDER BY path;
```

### Aggregation with Join

```sql
SELECT
    u.properties->>'name' AS author,
    COUNT(a.id) AS article_count,
    MAX(a.updated_at) AS latest_update
FROM default a
JOIN default u ON a.properties->>'author_id' = u.id
GROUP BY u.properties->>'name'
HAVING COUNT(a.id) > 0
ORDER BY article_count DESC;
```

### Full-Text Search

```sql
SELECT * FROM fulltext_search('default', 'database query');

-- Or using tsvector/tsquery
SELECT
    properties->>'title' AS title,
    TS_RANK(search_vector, TO_TSQUERY('database & query')) AS rank
FROM default
WHERE search_vector @@ TO_TSQUERY('database & query')
ORDER BY rank DESC
LIMIT 20;
```

### Geospatial Query

```sql
SELECT
    properties->>'name' AS name,
    ST_DISTANCE(
        location,
        ST_POINT(-122.4194, 37.7749)
    ) AS distance_meters
FROM default
WHERE ST_DWITHIN(
    location,
    ST_POINT(-122.4194, 37.7749),
    5000
)
ORDER BY distance_meters
LIMIT 10;
```
