---
sidebar_position: 3
---

# UPDATE Statement

The UPDATE statement modifies existing nodes in RaisinDB.

:::info Workspace = Table Name
The table name in UPDATE refers to the **workspace name**. For example, `UPDATE products` updates nodes in the `products` workspace.
:::

## Syntax

```sql
UPDATE workspace_name
SET properties = new_value
[ WHERE condition ]
```

## Update Patterns

All node data is stored in the `properties` JSONB column. There are three patterns for updating properties:

### Replace Entire Properties

Replace all properties with a new JSON object:

```sql
UPDATE default
SET properties = '{"title": "Updated Title", "status": "published", "content": "New content"}'
WHERE path = '/content/blog/my-post';
```

### Merge Properties

Merge new fields into existing properties using the `||` operator. Existing fields are overwritten, new fields are added, and unmentioned fields are preserved:

```sql
UPDATE default
SET properties = properties || '{"status": "published", "featured": true}'
WHERE path = '/content/blog/my-post';
```

### Update Specific Field

Use `jsonb_set` to update a single field:

```sql
UPDATE default
SET properties = jsonb_set(properties, '{author}', '"John"')
WHERE path = '/content/blog/my-post';
```

Update a nested field:

```sql
UPDATE default
SET properties = jsonb_set(properties, '{metadata,color}', '"blue"')
WHERE path = '/products/widget-1';
```

## WHERE Clause

The WHERE clause filters which rows to update.

### Update by Path

```sql
UPDATE default
SET properties = properties || '{"status": "archived"}'
WHERE path = '/content/blog/old-post';
```

### Update by ID

```sql
UPDATE default
SET properties = properties || '{"title": "Updated Title"}'
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';
```

### Update by Property Value

```sql
UPDATE default
SET properties = properties || '{"status": "archived"}'
WHERE properties->>'status' = 'draft'
  AND created_at < '2023-01-01';
```

### Hierarchical Updates

```sql
-- Update all descendants
UPDATE default
SET properties = properties || '{"category": "legacy"}'
WHERE DESCENDANT_OF(path, '/content/old');

-- Update direct children only
UPDATE default
SET properties = properties || '{"section": "documentation"}'
WHERE CHILD_OF(path, '/content/docs');
```

### Update Without WHERE

Updates all rows (use with caution):

```sql
UPDATE default
SET properties = properties || '{"reviewed": true}';
```

## Update JSON Columns

### Replace Entire JSON

```sql
UPDATE default
SET properties = '{"color": "red", "size": "large", "price": 29.99}'
WHERE path = '/products/widget-1';
```

### Update Specific JSON Field

```sql
UPDATE default
SET properties = jsonb_set(properties, '{color}', '"blue"')
WHERE properties->>'name' = 'Widget';
```

### Update Nested JSON

```sql
UPDATE default
SET properties = jsonb_set(properties, '{metadata,weight}', '500')
WHERE path = '/products/widget-1';
```

### Merge Multiple Fields

```sql
UPDATE default
SET properties = properties || '{"color": "blue", "updated": true}'
WHERE properties->>'name' = 'Widget';
```

## Update Timestamps in Properties

```sql
UPDATE default
SET properties = jsonb_set(properties, '{event_time}', '"2024-06-15T10:00:00Z"')
WHERE properties->>'name' = 'Product Launch';
```

## Update Arrays in Properties

```sql
-- Replace array
UPDATE default
SET properties = jsonb_set(properties, '{tags}', '["sql", "database", "advanced"]')
WHERE path = '/content/blog/sql-guide';
```

## Update to NULL

Remove a field by setting it to JSON null or by removing the key:

```sql
-- Set field to null
UPDATE default
SET properties = jsonb_set(properties, '{description}', 'null')
WHERE properties->>'description' = '';

-- Remove a key entirely
UPDATE default
SET properties = properties #- '{old_field}'
WHERE path = '/content/blog/my-post';
```

## Conditional Updates

Using CASE expressions:

```sql
UPDATE default
SET properties = CASE
    WHEN (properties->>'view_count')::int > 1000
        THEN properties || '{"tier": "popular"}'
    WHEN (properties->>'view_count')::int > 100
        THEN properties || '{"tier": "normal"}'
    ELSE properties || '{"tier": "unpopular"}'
END
WHERE properties->>'status' != 'archived';
```

## Examples

### Update Single Node

```sql
UPDATE default
SET properties = properties || '{
    "title": "Complete Guide to RaisinDB",
    "status": "published"
}'
WHERE path = '/content/guides/raisindb';
```

### Update with Numeric Calculation

```sql
UPDATE default
SET properties = jsonb_set(
    properties,
    '{price}',
    TO_JSON((properties->>'price')::numeric * 1.1)
)
WHERE node_type = 'Product'
  AND properties->>'category' = 'electronics';
```

### Update JSON Metadata

```sql
UPDATE default
SET properties = jsonb_set(
    jsonb_set(properties, '{color}', '"blue"'),
    '{updated}',
    TO_JSON(NOW())
)
WHERE properties->>'category' = 'widgets';
```

### Batch Status Update

```sql
UPDATE default
SET properties = properties || '{"status": "archived", "archived_reason": "Outdated content"}'
WHERE created_at < '2022-01-01'
  AND properties->>'status' = 'published';
```

### Update Based on Hierarchy

```sql
UPDATE default
SET properties = properties || '{"section": "documentation"}'
WHERE DESCENDANT_OF(path, '/content/docs')
  AND properties->>'section' IS NULL;
```

### Complex Conditional Update

```sql
UPDATE default
SET properties = properties || CASE
    WHEN properties->>'status' = 'published'
        AND (properties->>'view_count')::int > 1000
        THEN '{"priority": "high"}'
    WHEN properties->>'status' = 'published'
        THEN '{"priority": "normal"}'
    ELSE '{"priority": "low"}'
END
WHERE node_type = 'Article';
```

## Notes

- System columns (`id`, `path`, `created_at`) cannot be updated
- The `updated_at` column is automatically updated on each UPDATE
- The `version` counter is automatically incremented
- Updates without WHERE clause affect all rows
- Invalid JSON in properties will cause an error
- Failed updates (constraint violations) will roll back
