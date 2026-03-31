---
sidebar_position: 2
---

# INSERT Statement

The INSERT statement adds new nodes to RaisinDB.

:::info Workspace = Table Name
The table name in INSERT refers to the **workspace name**. For example, `INSERT INTO products` inserts into the `products` workspace.
:::

## Syntax

```sql
INSERT INTO workspace_name (path, node_type, properties)
VALUES (path_value, type_value, properties_jsonb)
[, (path_value, type_value, properties_jsonb) ...]
```

## Basic INSERT

Insert a node with path, node type, and properties:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/getting-started',
    'Article',
    '{"title": "Getting Started", "content": "Welcome to RaisinDB", "status": "published"}'
);
```

## With Explicit ID

You can optionally specify the node ID:

```sql
INSERT INTO default (id, path, node_type, properties)
VALUES (
    '01HQ3K9V5NWCR3KXM2Y7P8G6ZT',
    '/content/blog/my-post',
    'Article',
    '{"title": "My Post", "content": "Hello world", "status": "draft"}'
);
```

## Multiple Rows

Insert multiple nodes in one statement:

```sql
INSERT INTO default (path, node_type, properties)
VALUES
    ('/content/tags/database', 'Tag', '{"name": "database", "color": "blue"}'),
    ('/content/tags/tutorial', 'Tag', '{"name": "tutorial", "color": "green"}'),
    ('/content/tags/reference', 'Tag', '{"name": "reference", "color": "red"}');
```

## NULL Values

Properties that aren't specified in the JSON are simply absent:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/untitled',
    'Article',
    '{"title": "Untitled", "status": "draft"}'
);
```

To explicitly set a JSON null:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/untitled',
    'Article',
    '{"title": "Untitled", "description": null, "status": "draft"}'
);
```

## JSON Data

Build properties using JSON syntax:

```sql
-- Nested objects
INSERT INTO default (path, node_type, properties)
VALUES (
    '/products/widget-1',
    'Product',
    '{"name": "Widget", "metadata": {"color": "blue", "size": "large"}, "tags": ["new", "featured"]}'
);

-- Using JSONB cast
INSERT INTO default (path, node_type, properties)
VALUES (
    '/products/gadget-1',
    'Product',
    '{"name": "Gadget", "price": 29.99}'::JSONB
);
```

Using JSONB_SET to build properties:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/products/gadget-2',
    'Product',
    JSONB_SET('{"name": "Gadget"}', '{color}', '"red"')
);
```

## Timestamps

Include timestamp values in properties:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/events/launch',
    'Event',
    '{"name": "Launch", "event_time": "2024-01-15T10:00:00Z"}'
);
```

:::note
System columns `created_at` and `updated_at` are set automatically and cannot be specified in INSERT.
:::

## Geospatial Data

Geometry values use typed columns defined in the schema. The geometry data is stored separately from the JSON properties:

```sql
INSERT INTO default (path, node_type, properties, point)
VALUES (
    '/locations/san-francisco',
    'Location',
    '{"name": "San Francisco"}',
    ST_POINT(-122.4194, 37.7749)
);
```

## Arrays

Include arrays in properties:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/sql-guide',
    'Article',
    '{"title": "SQL Guide", "tags": ["sql", "database", "tutorial"]}'
);
```

## Vectors

Vector embeddings use typed columns defined in the schema. The vector data is stored separately from the JSON properties:

```sql
INSERT INTO default (path, node_type, properties, embedding)
VALUES (
    '/documents/doc-1',
    'Document',
    '{"title": "Document 1"}',
    ARRAY[0.1, 0.2, 0.3]::VECTOR(3)
);
```

## Full-Text Search

Full-text search is schema-driven. Mark properties with the `FULLTEXT` keyword in the schema definition, and RaisinDB automatically indexes their content. No special column is needed at insert time — just insert the text properties normally:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/db-tutorial',
    'Article',
    '{"title": "Database Tutorial", "content": "A tutorial for beginners"}'
);
```

:::tip
Properties marked as `FULLTEXT` in the schema are automatically indexed for search. You can then query them using `search_vector @@ TO_TSQUERY(...)` or the `fulltext_search()` function.
:::

## Expressions in VALUES

Use expressions when building properties:

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/example',
    'Article',
    JSONB_SET(
        '{"title": "Example Page", "status": "draft"}',
        '{slug}',
        TO_JSON(LOWER('Example Page'))
    )
);
```

## Examples

### Basic Node Insert

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/guides/raisindb-intro',
    'Article',
    '{
        "title": "Introduction to RaisinDB",
        "content": "RaisinDB is a hierarchical document database...",
        "status": "published",
        "author": "admin"
    }'
);
```

### Insert Product with Metadata

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/products/premium-widget',
    'Product',
    '{
        "name": "Premium Widget",
        "price": 99.99,
        "metadata": {
            "color": "blue",
            "weight": 500,
            "features": ["waterproof", "durable"]
        }
    }'
);
```

### Insert Location

```sql
INSERT INTO default (path, node_type, properties, location)
VALUES (
    '/stores/downtown',
    'Store',
    '{
        "name": "Downtown Store",
        "address": "123 Main St"
    }',
    ST_POINT(-122.4194, 37.7749)
);
```

### Insert Event

```sql
INSERT INTO default (path, node_type, properties)
VALUES (
    '/events/product-launch',
    'Event',
    '{
        "name": "Product Launch",
        "description": "New product release",
        "event_date": "2024-06-15T14:00:00Z"
    }'
);
```

### Batch Insert

```sql
INSERT INTO default (path, node_type, properties)
VALUES
    ('/content/tags/database', 'Tag', '{"name": "Database", "slug": "database", "description": "Database related content"}'),
    ('/content/tags/tutorial', 'Tag', '{"name": "Tutorial", "slug": "tutorial", "description": "Tutorial content"}'),
    ('/content/tags/guide', 'Tag', '{"name": "Guide", "slug": "guide", "description": "Guide content"}'),
    ('/content/tags/reference', 'Tag', '{"name": "Reference", "slug": "reference", "description": "Reference documentation"}');
```

## Notes

- System columns (`id`, `path`, `created_at`, `updated_at`, `version`) are auto-generated
- The `id` column can optionally be provided; if omitted, a ULID is generated
- The `node_type` determines the schema used for validation (if schema validation is enabled)
- All user data goes in the `properties` JSONB column
- Constraint violations from schema validation will cause the INSERT to fail
- Invalid JSON in properties will cause an error
