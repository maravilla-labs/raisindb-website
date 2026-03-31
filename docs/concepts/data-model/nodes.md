---
sidebar_position: 1
---

# Nodes

**Nodes** are the fundamental building blocks of content in RaisinDB. They're hierarchical documents with unique paths, typed properties, and complete revision history. Think of them as files in a Git repository—each has a path, content, and a version history.

## What is a Node?

A node represents a single content item in your repository. It combines:

- **Path**: A unique hierarchical identifier (e.g., `/content/blog/my-post`)
- **NodeType**: A schema that defines allowed properties
- **Properties**: A JSON document with typed fields
- **Metadata**: System fields like created_at, updated_at
- **Revisions**: Complete version history with HLC timestamps

```sql
-- A node in the database
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/content/blog/welcome",
  "node_type": "blog:Article",
  "properties": {
    "title": "Welcome to RaisinDB",
    "author": "Jane Developer",
    "body": "<p>Content goes here...</p>",
    "published": true
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T14:22:00Z"
}
```

## Node Paths

Paths are hierarchical identifiers using forward slashes, similar to file system paths:

```
/content/blog/2024/january/my-first-post
/media/images/header.jpg
/config/site-settings
/users/jane-developer/profile
```

### Path Rules

- Must start with `/`
- Segments separated by `/`
- Segments can contain letters, numbers, hyphens, underscores
- Paths are unique within a workspace
- Case-sensitive

### Path Functions

RaisinDB provides SQL functions for working with hierarchical paths:

```sql
-- Get depth of a path (number of segments)
SELECT DEPTH('/content/blog/post1');  -- Returns 3

-- Get parent path
SELECT PARENT('/content/blog/post1');  -- Returns '/content/blog'

-- Get ancestor at specific depth
SELECT ANCESTOR('/content/blog/2024/post1', 2);  -- Returns '/content/blog'

-- Check if path starts with prefix
SELECT PATH_STARTS_WITH('/content/blog/post1', '/content');  -- true

-- Get all children
SELECT * FROM default WHERE CHILD_OF('/content/blog');

-- Get all descendants (recursive)
SELECT * FROM default WHERE DESCENDANT_OF('/content');
```

## Creating Nodes

Use standard SQL `INSERT` statements:

```sql
-- Basic node creation
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/my-post',
  'blog:Article',
  '{
    "title": "My First Post",
    "author": "Jane Developer",
    "published": false
  }'
);

-- With ID specified (UUID)
INSERT INTO default (id, path, node_type, properties) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  '/content/blog/another-post',
  'blog:Article',
  '{"title": "Another Post"}'
);
```

The system automatically:
- Generates a UUID for `id` if not provided
- Sets `created_at` and `updated_at` timestamps
- Creates the first revision with HLC timestamp
- Validates properties against the NodeType schema

## Querying Nodes

Query nodes using standard SQL:

```sql
-- Get all blog articles
SELECT * FROM default WHERE node_type = 'blog:Article';

-- Access JSON properties
SELECT
  path,
  properties->>'title' AS title,
  properties->>'author' AS author,
  (properties->>'published')::boolean AS published
FROM default
WHERE node_type = 'blog:Article';

-- Filter by property values
SELECT * FROM default
WHERE node_type = 'blog:Article'
  AND properties->>'author' = 'Jane Developer'
  AND (properties->>'published')::boolean = true;

-- Hierarchical queries
SELECT * FROM default
WHERE PATH_STARTS_WITH('/content/blog/2024')
ORDER BY properties->>'publishedAt' DESC;
```

## Updating Nodes

Use SQL `UPDATE` statements:

```sql
-- Update entire properties object
UPDATE default
SET properties = '{
  "title": "Updated Title",
  "author": "Jane Developer",
  "published": true
}'
WHERE path = '/content/blog/my-post';

-- Update specific properties (merge)
UPDATE default
SET properties = properties || '{"published": true}'
WHERE path = '/content/blog/my-post';

-- Update nested properties
UPDATE default
SET properties = jsonb_set(
  properties,
  '{author}',
  '"John Smith"'
)
WHERE path = '/content/blog/my-post';
```

Each update creates a new revision with a new HLC timestamp.

## Deleting Nodes

```sql
-- Soft delete (marks as deleted, keeps in revision history)
DELETE FROM default WHERE path = '/content/blog/my-post';

-- Hard delete (permanently removes, including revisions)
DELETE FROM default WHERE path = '/content/blog/my-post' PURGE;

-- Delete all descendants
DELETE FROM default WHERE DESCENDANT_OF('/content/blog/archive');
```

Soft deletes are the default. The node remains in revision history and can be restored via time-travel queries.

## Node Metadata

Every node has system-managed metadata:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier across the repository |
| `path` | string | Hierarchical path, unique within workspace |
| `node_type` | string | NodeType name (e.g., `blog:Article`) |
| `properties` | JSONB | Content properties validated by NodeType |
| `created_at` | timestamp | When the node was created |
| `updated_at` | timestamp | Last modification time |
| `__revision` | HLC | Current revision timestamp |
| `__branch` | string | Current branch name |
| `__workspace` | string | Workspace name |

### Querying Metadata

```sql
-- Get system fields
SELECT id, path, node_type, created_at, updated_at, __revision
FROM default
WHERE path = '/content/blog/my-post';

-- Find recently updated nodes
SELECT path, updated_at
FROM default
ORDER BY updated_at DESC
LIMIT 10;

-- Find nodes by ID
SELECT * FROM default WHERE id = '550e8400-e29b-41d4-a716-446655440000';
```

## Node Flags

NodeTypes define metadata flags that control behavior:

### Versionable

When `versionable: true`, every change creates a new revision:

```sql
-- Enable versioning in NodeType
"metadata": {
  "versionable": true
}

-- Query revision history
SELECT __revision, __timestamp, properties->>'title'
FROM default
WHERE path = '/content/blog/my-post'
ORDER BY __revision DESC;
```

### Auditable

When `auditable: true`, all changes are logged for compliance:

```sql
"metadata": {
  "auditable": true
}

-- Query audit log
SELECT __revision, __timestamp, __user, __operation
FROM default.__audit__
WHERE path = '/content/blog/sensitive-data';
```

### Indexable

When `indexable: true`, nodes are included in full-text search indexes:

```sql
"metadata": {
  "indexable": true
}

-- Full-text search works automatically
SELECT * FROM default
WHERE FTS_MATCH('search query')
  AND node_type = 'blog:Article';
```

## Node Relationships (Edges)

Nodes can have typed relationships to other nodes using the RELATE statement:

```sql
-- Create a relationship using RELATE
RELATE FROM path='/content/blog/post1'
       TO path='/content/blog/post2'
       TYPE 'RELATED_TO'
       WEIGHT 0.8;

-- Query relationships with GRAPH_TABLE (SQL/PGQ)
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[r:RELATED_TO]->(related:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (
    related.path AS related_path,
    related.properties->>'title' AS title
  )
);

-- Or use the NEIGHBORS function
SELECT * FROM NEIGHBORS('/content/blog/post1', 'OUT', 'RELATED_TO');
```

Learn more: [Graph Model](/docs/concepts/graph-model)

## Working with Revisions

Every node has a complete revision history:

```sql
-- Get current revision
SELECT __revision, properties->>'title'
FROM default
WHERE path = '/content/blog/my-post';

-- Get all revisions
SELECT __revision, __timestamp, properties->>'title'
FROM default
WHERE path = '/content/blog/my-post'
ORDER BY __revision DESC;

-- Time-travel to specific revision
SET __revision = '2024-01-14T10:00:00Z';
SELECT properties->>'title'
FROM default
WHERE path = '/content/blog/my-post';

-- Reset to latest
SET __revision = DEFAULT;
```

Learn more: [Revisions](/docs/concepts/versioning/revisions)

## Node Naming Conventions

Follow these conventions for clear, maintainable content:

### Paths

```sql
-- Content
/content/blog/2024/my-post
/content/pages/about-us
/content/products/laptop-stand

-- Media
/media/images/header.jpg
/media/videos/tutorial.mp4
/media/documents/whitepaper.pdf

-- Configuration
/config/site-settings
/config/navigation/main-menu
/config/themes/default

-- Users
/users/jane-developer/profile
/users/jane-developer/preferences
```

### NodeTypes

Use namespace prefixes:

```sql
blog:Article
blog:Category
blog:Tag

ecommerce:Product
ecommerce:Category
ecommerce:Order

cms:Page
cms:Layout
cms:Component
```

## Advanced Patterns

### Polymorphic Queries

Query multiple NodeTypes with shared archetypes:

```sql
-- Both Article and Product have 'Publishable' mixin
SELECT path, node_type, properties->>'title'
FROM default
WHERE (properties->>'published')::boolean = true
ORDER BY properties->>'publishedAt' DESC;
```

### Hierarchical Aggregations

```sql
-- Count articles by category (using path hierarchy)
SELECT
  PARENT(path) AS category,
  COUNT(*) AS article_count
FROM default
WHERE node_type = 'blog:Article'
  AND DEPTH(path) = 4
GROUP BY PARENT(path);
```

### Composite Paths

```sql
-- Store structured identifiers in paths
/content/blog/2024/01/15/my-post
/users/org123/team456/user789

-- Query using path patterns
SELECT * FROM default
WHERE path ~ '^/content/blog/2024/';
```

## Best Practices

1. **Use meaningful paths**: Paths should be human-readable and reflect content hierarchy
2. **Keep properties focused**: Don't store large blobs in properties; use separate media nodes
3. **Leverage NodeTypes**: Define schemas for validation and consistency
4. **Version important content**: Enable `versionable` for content that needs audit trails
5. **Index for search**: Set `indexable: true` for user-facing content
6. **Use relationships**: Link related nodes with typed edges instead of embedding references

## Next Steps

- **[NodeTypes](/docs/concepts/data-model/nodetypes)** - Define schemas for your nodes
- **[Archetypes](/docs/concepts/data-model/archetypes)** - Reusable property templates
- **[Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy)** - Master hierarchical queries
- **[Graph Model](/docs/concepts/graph-model)** - Build relationships between nodes
