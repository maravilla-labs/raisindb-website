---
sidebar_position: 4
---

# DELETE Statement

The DELETE statement removes nodes from RaisinDB. By default, DELETE performs a soft delete (the node is marked as deleted but can be restored). Use `PURGE` for a permanent hard delete.

:::info Workspace = Table Name
The table name in DELETE refers to the **workspace name**. For example, `DELETE FROM products` removes nodes from the `products` workspace.
:::

## Syntax

```sql
DELETE FROM workspace_name
[ WHERE condition ]

-- Hard delete (permanent, cannot be restored)
DELETE FROM workspace_name
[ WHERE condition ]
PURGE
```

## Basic DELETE

Delete a specific node by ID:

```sql
DELETE FROM default
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';
```

Delete by path:

```sql
DELETE FROM default
WHERE path = '/content/blog/old-post';
```

## PURGE

By default, DELETE performs a soft delete. Add `PURGE` to permanently remove the node:

```sql
-- Soft delete (can be restored)
DELETE FROM default
WHERE path = '/content/blog/old-post';

-- Hard delete (permanent)
DELETE FROM default
WHERE path = '/content/blog/old-post'
PURGE;
```

## WHERE Clause

The WHERE clause specifies which rows to delete.

### Delete with Simple Condition

```sql
DELETE FROM default
WHERE properties->>'status' = 'draft';
```

### Delete with Multiple Conditions

```sql
DELETE FROM default
WHERE properties->>'status' = 'draft'
  AND created_at < '2023-01-01';
```

### Delete with NULL Check

```sql
DELETE FROM default
WHERE properties->>'description' IS NULL
  AND properties->>'status' = 'draft';
```

### Delete with Comparison

```sql
DELETE FROM default
WHERE created_at < NOW() - INTERVAL '1 year';
```

## Hierarchical Deletion

Delete nodes based on path hierarchy:

```sql
-- Delete specific node
DELETE FROM default
WHERE path = '/content/blog/old-post';

-- Delete all children of a path
DELETE FROM default
WHERE CHILD_OF(path, '/content/temp');

-- Delete all descendants (recursively)
DELETE FROM default
WHERE DESCENDANT_OF(path, '/content/archive');

-- Delete nodes at specific depth
DELETE FROM default
WHERE DEPTH(path) > 5;

-- Delete by path prefix
DELETE FROM default
WHERE PATH_STARTS_WITH(path, '/content/drafts/');
```

## Delete with Pattern Matching

```sql
-- Delete by LIKE pattern on property
DELETE FROM default
WHERE properties->>'title' LIKE 'Test%';

-- Delete by property suffix
DELETE FROM default
WHERE properties->>'slug' LIKE '%-backup';
```

## Delete with Subquery

```sql
-- Delete based on subquery
DELETE FROM default
WHERE properties->>'category_id' IN (
    SELECT id FROM nodes
    WHERE node_type = 'Category'
      AND properties->>'archived' = 'true'
);

-- Delete with NOT EXISTS
DELETE FROM nodes t
WHERE t.node_type = 'Tag'
  AND NOT EXISTS (
    SELECT 1 FROM nodes a
    WHERE a.node_type = 'Article'
      AND a.properties->'tags' @> TO_JSON(t.properties->>'name')
  );
```

## Delete Multiple Rows

Delete all rows matching condition:

```sql
DELETE FROM default
WHERE properties->>'status' IN ('draft', 'pending', 'rejected');
```

## Delete All Rows

Delete without WHERE removes all rows (use with caution):

```sql
-- Deletes everything from workspace
DELETE FROM temp_data;
```

## Delete with Time-Based Filters

```sql
-- Delete old nodes
DELETE FROM default
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete by specific date
DELETE FROM default
WHERE created_at < '2024-01-01';

-- Delete by timestamp range
DELETE FROM default
WHERE created_at BETWEEN '2023-01-01' AND '2023-12-31';
```

## Delete with JSON Conditions

```sql
-- Delete based on JSON field
DELETE FROM default
WHERE properties->>'discontinued' = 'true';

-- Delete based on containment
DELETE FROM default
WHERE properties @> '{"temporary": true}';
```

## Delete with Geospatial Filters

```sql
-- Delete points outside area
DELETE FROM default
WHERE NOT ST_WITHIN(
    properties->'location',
    ST_GEOMFROMGEOJSON('{"type":"Polygon","coordinates":[...]}')
);

-- Delete points far from center
DELETE FROM default
WHERE ST_DISTANCE(properties->'location', ST_POINT(-122.4194, 37.7749)) > 10000;
```

## Delete with Full-Text Match

```sql
DELETE FROM default
WHERE search_vector @@ TO_TSQUERY('deprecated & content');
```

## Delete with Aggregation (via Subquery)

```sql
-- Delete duplicates, keeping newest
DELETE FROM default p1
WHERE EXISTS (
    SELECT 1 FROM default p2
    WHERE p2.properties->>'slug' = p1.properties->>'slug'
      AND p2.created_at > p1.created_at
);
```

## Examples

### Delete Single Node

```sql
DELETE FROM default
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';
```

### Delete Old Drafts

```sql
DELETE FROM default
WHERE properties->>'status' = 'draft'
  AND created_at < NOW() - INTERVAL '30 days';
```

### Delete Entire Hierarchy Branch

```sql
DELETE FROM default
WHERE DESCENDANT_OF(path, '/content/deprecated')
   OR path = '/content/deprecated';
```

### Delete Unpublished Content

```sql
DELETE FROM default
WHERE properties->>'status' IN ('draft', 'pending')
  AND created_at < '2023-01-01'
  AND (properties->>'view_count')::int = 0;
```

### Delete Based on JSON Properties

```sql
DELETE FROM default
WHERE properties->>'discontinued' = 'true'
  AND updated_at < NOW() - INTERVAL '180 days';
```

### Hard Delete Test Data

```sql
DELETE FROM default
WHERE PATH_STARTS_WITH(path, '/test/')
   OR properties @> '{"test": true}'
PURGE;
```

### Delete by Multiple Criteria

```sql
DELETE FROM default
WHERE (properties->>'status' = 'cancelled' OR properties->>'status' = 'expired')
  AND (properties->>'attendee_count')::int = 0;
```

### Delete with Complex Hierarchy Logic

```sql
DELETE FROM default
WHERE DEPTH(path) > 3
  AND NOT PATH_STARTS_WITH(path, '/content/important/')
  AND node_type = 'TemporaryNode';
```

## Cascading Deletes

RaisinDB handles cascading deletes based on reference relationships:

```sql
-- Deleting a parent may cascade to children
-- depending on reference configuration
DELETE FROM default
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';
```

## Notes

- DELETE without `PURGE` performs a soft delete (node can be restored)
- DELETE with `PURGE` is permanent and cannot be undone
- Deleting a node may affect references from other nodes
- System columns are automatically removed with the node
- DELETE without WHERE removes all rows from the workspace
- Failed deletes (constraint violations) will roll back
- Use transactions for complex delete operations
- Hierarchical deletes may affect multiple levels
