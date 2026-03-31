---
sidebar_position: 7
---

# Common Query Patterns

A recipe book of frequently used SQL patterns in RaisinDB. Each recipe includes a working SQL example and a brief explanation.

## CRUD Operations

### Create a Node

```sql
INSERT INTO 'default' (path, node_type, properties) VALUES (
  '/content/blog/hello-world',
  'blog:Article',
  '{"title": "Hello World", "status": "draft"}'
);
```

### Read a Node by Path

```sql
SELECT * FROM 'default'
WHERE path = '/content/blog/hello-world';
```

### Update Node Properties

```sql
UPDATE 'default'
SET properties = '{"title": "Hello World (Updated)", "status": "published"}'
WHERE path = '/content/blog/hello-world';
```

### Delete a Node

```sql
DELETE FROM 'default'
WHERE path = '/content/blog/hello-world';
```

## JSON Property Filtering

Use the `->>` operator with `::String` cast on the **key** to query JSON properties.

### Filter by String Property

```sql
SELECT * FROM 'default'
WHERE properties->>'status'::String = 'published';
```

### Filter by Multiple Properties

```sql
SELECT * FROM 'default'
WHERE properties->>'status'::String = 'published'
  AND properties->>'category'::String = 'technology';
```

### Parameterized Property Query

Use positional parameters for prepared statements:

```sql
SELECT * FROM 'default'
WHERE properties->>'user_id'::String = $1
  AND properties->>'email'::String = $2;
```

:::warning JSON Cast Syntax
Always cast the **key**, not the result:

```sql
-- Correct
WHERE properties->>'email'::String = 'user@example.com'

-- Wrong (causes type coercion error)
WHERE (properties->>'email')::String = 'user@example.com'
```
:::

## Hierarchical Queries

### Find All Nodes Under a Path

```sql
SELECT * FROM 'default'
WHERE PATH_STARTS_WITH(path, '/content/blog/');
```

`PATH_STARTS_WITH` is optimized into a RocksDB prefix scan — it does not scan the entire workspace.

### Find Direct Children

```sql
SELECT * FROM 'default'
WHERE PARENT(path) = '/content/blog';
```

### Filter by Depth

```sql
-- Find all top-level nodes (depth 1)
SELECT * FROM 'default'
WHERE DEPTH(path) = 1;

-- Find nodes exactly 3 levels deep
SELECT * FROM 'default'
WHERE DEPTH(path) = 3;
```

### Combine Hierarchy with Property Filters

```sql
SELECT * FROM 'default'
WHERE PATH_STARTS_WITH(path, '/content/')
  AND node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
ORDER BY properties->>'published_date'::String DESC
LIMIT 10;
```

## Graph Traversal

### Create a Relationship

```sql
RELATE FROM path='/content/blog/post1'
       TO path='/users/jane'
       TYPE 'AUTHORED_BY';
```

### Find Neighbors

```sql
-- Outgoing neighbors of a specific type
SELECT * FROM NEIGHBORS('/users/jane', 'OUT', 'AUTHORED');

-- All neighbors in any direction
SELECT * FROM NEIGHBORS('/content/blog/post1', 'BOTH', NULL);
```

### Pattern Matching with GRAPH_TABLE

```sql
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (author:Profile)-[r:AUTHORED]->(article:Article)
  WHERE author.path = '/users/jane'
  COLUMNS (
    article.path AS article_path,
    article.properties->>'title' AS title
  )
);
```

### Multi-Hop Traversal

```sql
-- Find articles two hops away
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->(b:Article)-[:RELATED_TO]->(c:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (
    b.path AS intermediate,
    c.path AS destination
  )
);
```

### Variable-Length Paths

```sql
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->{1,3}(b:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (a.path AS source, b.path AS target)
);
```

## Full-Text Search

### Basic Search

```sql
SELECT id, path, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'content management')
ORDER BY __score DESC
LIMIT 20;
```

### Search with NodeType Filter

```sql
SELECT id, path, properties->>'title'::String AS title, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'raisindb')
  AND node_type = 'blog:Article'
ORDER BY __score DESC
LIMIT 10;
```

## Vector Similarity Search

### Find Similar Content

```sql
SELECT id, path, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC;
```

The second argument is the query vector, and the third is the number of results (k).

### Hybrid Search (Vector + Filter)

```sql
SELECT id, path, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 20)
  AND node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
ORDER BY __distance ASC
LIMIT 10;
```

## Pagination

### Offset-Based Pagination

```sql
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

### Keyset Pagination (Better Performance)

For large datasets, paginate using a sort key from the last row:

```sql
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
  AND created_at < $1
ORDER BY created_at DESC
LIMIT 20;
```

Pass the `created_at` value of the last row from the previous page as `$1`.

## Combining Multiple Query Types

### Hierarchy + Graph

Find related articles that share the same parent folder:

```sql
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->(related:Article)
  WHERE a.path = '/content/blog/post1'
    AND PARENT(a.path) = PARENT(related.path)
  COLUMNS (related.properties->>'title' AS title)
);
```

### Full-Text Search + Hierarchy

Search only within a subtree:

```sql
SELECT id, path, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'database')
  AND PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY __score DESC
LIMIT 10;
```

### Aggregation by Property

```sql
SELECT
  properties->>'category'::String AS category,
  COUNT(*) AS count
FROM 'default'
WHERE node_type = 'blog:Article'
GROUP BY properties->>'category'::String
ORDER BY count DESC;
```

## Useful Patterns

### Check if a Node Exists

```sql
SELECT COUNT(*) AS exists
FROM 'default'
WHERE path = '/content/blog/hello-world';
```

### Find Nodes Without a Property

```sql
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
  AND properties->>'featured_image'::String IS NULL;
```

### Find Recently Updated Nodes

```sql
SELECT path, node_type, updated_at
FROM 'default'
WHERE updated_at > '2026-03-01T00:00:00Z'
ORDER BY updated_at DESC
LIMIT 50;
```

## Next Steps

- [Time-Travel Queries](./time-travel-queries.md) — Query historical state
- [Filtering Data](./filtering-data.md) — Advanced filtering techniques
- [Graph Queries](./graph-queries.md) — Deep graph traversal
- [Full-Text Search](./full-text-search.md) — Search configuration
