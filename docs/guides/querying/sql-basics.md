---
sidebar_position: 1
---

# SQL Basics

Query your RaisinDB content using familiar SQL syntax.

## The Nodes Table

All content in RaisinDB is stored in the `nodes` virtual table:

```sql
SELECT * FROM nodes LIMIT 10;
```

Column | Type | Description
-------|------|------------
`id` | TEXT | Unique node identifier (ULID)
`node_type` | TEXT | NodeType name
`path` | TEXT | Hierarchical path
`workspace` | TEXT | Workspace name
`properties` | JSONB | All node properties
`created_at` | TIMESTAMP | Creation time
`updated_at` | TIMESTAMP | Last update time
`version` | INTEGER | Version number

## Basic Queries

### Select All Nodes

```sql
SELECT * FROM nodes;
```

### Filter by NodeType

```sql
SELECT * FROM nodes
WHERE node_type = 'Article';
```

### Filter by Workspace

```sql
SELECT * FROM nodes
WHERE workspace = 'content';
```

### Limit Results

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
LIMIT 20
OFFSET 0;
```

## Working with Properties

Properties are stored as JSONB, use `->` and `->>` operators:

### Extract Property Value

```sql
-- Extract as text
SELECT
  path,
  properties->>'title' as title,
  properties->>'author' as author
FROM nodes
WHERE node_type = 'Article';
```

### Filter by Property

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
  AND properties->>'status' = 'published';
```

### Numeric Properties

```sql
SELECT * FROM nodes
WHERE node_type = 'Product'
  AND (properties->>'price')::numeric > 100;
```

### Boolean Properties

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
  AND (properties->>'featured')::boolean = true;
```

### Date Properties

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
  AND (properties->>'published_date')::timestamp > '2024-01-01';
```

## Sorting

### Sort by Property

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
ORDER BY properties->>'title' ASC;
```

### Sort by Multiple Fields

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
ORDER BY
  properties->>'status' DESC,
  created_at DESC;
```

### Sort by Numeric Property

```sql
SELECT * FROM nodes
WHERE node_type = 'Product'
ORDER BY (properties->>'price')::numeric DESC;
```

## Aggregations

### Count Nodes

```sql
SELECT COUNT(*) as total
FROM nodes
WHERE node_type = 'Article';
```

### Group by Property

```sql
SELECT
  properties->>'status' as status,
  COUNT(*) as count
FROM nodes
WHERE node_type = 'Article'
GROUP BY properties->>'status';
```

### Sum Numeric Property

```sql
SELECT
  SUM((properties->>'price')::numeric) as total_value
FROM nodes
WHERE node_type = 'Product';
```

### Average

```sql
SELECT
  AVG((properties->>'rating')::numeric) as avg_rating
FROM nodes
WHERE node_type = 'Review';
```

## Array Properties

### Check if Array Contains Value

```sql
SELECT * FROM nodes
WHERE node_type = 'Article'
  AND properties->'tags' @> '"technology"'::jsonb;
```

### Array Length

```sql
SELECT
  path,
  jsonb_array_length(properties->'tags') as tag_count
FROM nodes
WHERE node_type = 'Article';
```

### Expand Array

```sql
SELECT
  path,
  jsonb_array_elements_text(properties->'tags') as tag
FROM nodes
WHERE node_type = 'Article';
```

## Joins

### Self-Join for Relationships

```sql
SELECT
  a.path as article,
  u.path as author
FROM nodes a
JOIN nodes u ON a.properties->>'author_id' = u.id
WHERE a.node_type = 'Article'
  AND u.node_type = 'User';
```

### Cross-Workspace Join

```sql
SELECT
  c.properties->>'title' as article,
  p.properties->>'name' as product
FROM content.nodes c
JOIN products.nodes p
  ON c.properties->>'product_id' = p.id;
```

## Subqueries

### IN Subquery

```sql
SELECT * FROM nodes
WHERE node_type = 'Comment'
  AND properties->>'article_id' IN (
    SELECT id FROM nodes
    WHERE node_type = 'Article'
      AND properties->>'status' = 'published'
  );
```

### EXISTS Subquery

```sql
SELECT * FROM nodes a
WHERE a.node_type = 'Article'
  AND EXISTS (
    SELECT 1 FROM nodes c
    WHERE c.node_type = 'Comment'
      AND c.properties->>'article_id' = a.id
  );
```

## Common Table Expressions (CTEs)

```sql
WITH published_articles AS (
  SELECT * FROM nodes
  WHERE node_type = 'Article'
    AND properties->>'status' = 'published'
)
SELECT
  properties->>'author' as author,
  COUNT(*) as article_count
FROM published_articles
GROUP BY properties->>'author'
ORDER BY article_count DESC;
```

## CASE Statements

```sql
SELECT
  path,
  properties->>'title' as title,
  CASE
    WHEN (properties->>'views')::int > 1000 THEN 'Popular'
    WHEN (properties->>'views')::int > 100 THEN 'Moderate'
    ELSE 'Low'
  END as popularity
FROM nodes
WHERE node_type = 'Article';
```

## Window Functions

### Row Number

```sql
SELECT
  path,
  properties->>'title' as title,
  ROW_NUMBER() OVER (ORDER BY created_at DESC) as rank
FROM nodes
WHERE node_type = 'Article';
```

### Partition by Property

```sql
SELECT
  properties->>'category' as category,
  properties->>'title' as title,
  ROW_NUMBER() OVER (
    PARTITION BY properties->>'category'
    ORDER BY created_at DESC
  ) as rank_in_category
FROM nodes
WHERE node_type = 'Article';
```

## Full-Text Search

Use the built-in full-text search function:

```sql
SELECT * FROM fulltext_search('content', 'raisindb database');
```

With filters:

```sql
SELECT * FROM fulltext_search(
  'content',
  'raisindb',
  node_type => 'Article',
  limit => 10
);
```

## Parameterized Queries

Use `$1`, `$2`, etc. for parameters:

```sql
SELECT * FROM nodes
WHERE node_type = $1
  AND properties->>'status' = $2
LIMIT $3;
```

From JavaScript:

```typescript
const result = await db.executeSql(
  'SELECT * FROM nodes WHERE node_type = $1 AND properties->>\'status\' = $2 LIMIT $3',
  ['Article', 'published', 10]
);
```

## Performance Tips

### Use Indexes

```sql
CREATE INDEX idx_article_status
ON nodes ((properties->>'status'))
WHERE node_type = 'Article';
```

### Filter Early

```sql
-- Good: Filter first
SELECT * FROM nodes
WHERE node_type = 'Article'
  AND properties->>'status' = 'published'
LIMIT 10;

-- Bad: Limit without filter
SELECT * FROM nodes
WHERE node_type = 'Article'
LIMIT 10;
```

### Avoid SELECT *

```sql
-- Good: Select only needed columns
SELECT path, properties->>'title', created_at
FROM nodes
WHERE node_type = 'Article';

-- Bad: Select all columns
SELECT * FROM nodes
WHERE node_type = 'Article';
```

## Next Steps

- [Filtering Data](./filtering-data.md) - Advanced filtering techniques
- [Graph Queries](./graph-queries.md) - Traverse relationships
- [Full-Text Search](./full-text-search.md) - Search content
