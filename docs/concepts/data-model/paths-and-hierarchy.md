---
sidebar_position: 5
---

# Paths and Hierarchy

RaisinDB organizes nodes in a **hierarchical structure** using forward-slash paths, similar to file systems. This natural organization makes it easy to model content trees, navigation structures, and nested data while providing powerful SQL functions for hierarchical queries.

## Path Structure

Paths are unique identifiers with hierarchical segments:

```
/content/blog/2024/january/my-first-post
└─┬───┘ └─┬─┘ └─┬┘ └──┬──┘ └─────┬──────┘
  │       │     │      │          │
  Root    Category Year Month    Article
```

### Path Rules

- Must start with `/`
- Segments separated by `/`
- Segments can contain: letters, numbers, hyphens, underscores
- Paths are case-sensitive
- Maximum depth: unlimited (practical limit ~50 levels)
- Maximum length: 1024 characters

### Valid Paths

```
/content
/content/blog
/content/blog/article-1
/media/images/2024/header.jpg
/users/jane-developer/profile
/config/site-settings
```

### Invalid Paths

```
content           -- Missing leading /
/content//blog    -- Double slash
/content/         -- Trailing slash
/Content/Blog     -- Inconsistent casing (avoid for clarity)
```

## Hierarchical Relationships

Paths create natural parent-child relationships:

```
/content                    -- Parent (depth 1)
  /content/blog             -- Child of /content (depth 2)
    /content/blog/post1     -- Child of /content/blog (depth 3)
    /content/blog/post2
  /content/pages            -- Sibling of /content/blog
    /content/pages/about
```

## Path Functions

RaisinDB provides SQL functions for working with hierarchical paths:

### DEPTH()

Returns the number of path segments:

```sql
SELECT DEPTH('/content/blog/post1');
-- Returns: 3

SELECT path, DEPTH(path) AS depth
FROM default
ORDER BY depth;

-- Find all top-level nodes
SELECT * FROM default WHERE DEPTH(path) = 1;

-- Find nodes at specific depth (e.g., all articles)
SELECT * FROM default
WHERE DEPTH(path) = 4
  AND path LIKE '/content/blog/%';
```

### PARENT()

Returns the immediate parent path:

```sql
SELECT PARENT('/content/blog/post1');
-- Returns: '/content/blog'

SELECT PARENT('/content');
-- Returns: '/'

SELECT PARENT('/');
-- Returns: NULL

-- Get all nodes with their parents
SELECT
  path,
  PARENT(path) AS parent_path
FROM default;

-- Find all children of a specific parent
SELECT child.path
FROM default child
WHERE PARENT(child.path) = '/content/blog';
```

### ANCESTOR()

Returns the ancestor at a specific depth:

```sql
SELECT ANCESTOR('/content/blog/2024/post1', 1);
-- Returns: '/content'

SELECT ANCESTOR('/content/blog/2024/post1', 2);
-- Returns: '/content/blog'

-- Get category for all articles
SELECT
  path,
  ANCESTOR(path, 2) AS category
FROM default
WHERE DEPTH(path) = 4;
```

### PATH_STARTS_WITH()

Check if a path starts with a prefix:

```sql
SELECT PATH_STARTS_WITH('/content/blog/post1', '/content');
-- Returns: true

SELECT PATH_STARTS_WITH('/media/images/photo.jpg', '/content');
-- Returns: false

-- Get all blog content
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog');

-- Get all 2024 content
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog/2024');
```

### CHILD_OF()

Check if a node is a direct child:

```sql
-- Get direct children only
SELECT * FROM default
WHERE CHILD_OF('/content/blog');

-- Equivalent to:
SELECT * FROM default
WHERE PARENT(path) = '/content/blog';

-- Count children per parent
SELECT
  PARENT(path) AS parent,
  COUNT(*) AS child_count
FROM default
WHERE CHILD_OF('/content')
GROUP BY PARENT(path);
```

### DESCENDANT_OF()

Check if a node is a descendant (at any depth):

```sql
-- Get all descendants (recursive)
SELECT * FROM default
WHERE DESCENDANT_OF('/content');

-- Includes:
-- /content/blog
-- /content/blog/post1
-- /content/blog/2024/post2
-- /content/pages/about
-- ... etc

-- Count all descendants
SELECT COUNT(*) FROM default
WHERE DESCENDANT_OF('/content/blog');
```

## Common Hierarchical Queries

### Get All Children

```sql
-- Direct children only
SELECT * FROM default
WHERE PARENT(path) = '/content/blog'
ORDER BY path;

-- All descendants (recursive)
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog/')
ORDER BY path;
```

### Build a Tree Structure

```sql
-- Get tree with depth indicators
SELECT
  REPEAT('  ', DEPTH(path) - 1) || path AS tree,
  node_type,
  properties->>'title' AS title
FROM default
WHERE PATH_STARTS_WITH(path, '/content')
ORDER BY path;

-- Output:
-- /content                     | Folder | Content
--   /content/blog              | Folder | Blog
--     /content/blog/post1      | Article | My First Post
--     /content/blog/post2      | Article | Another Post
--   /content/pages             | Folder | Pages
--     /content/pages/about     | Page | About Us
```

### Count Children Per Node

```sql
-- Count direct children
SELECT
  path,
  (SELECT COUNT(*)
   FROM default children
   WHERE PARENT(children.path) = parent.path
  ) AS child_count
FROM default parent
WHERE PATH_STARTS_WITH(path, '/content');
```

### Find Leaf Nodes

Nodes with no children:

```sql
SELECT path
FROM default parent
WHERE NOT EXISTS (
  SELECT 1 FROM default child
  WHERE PARENT(child.path) = parent.path
);
```

### Get Breadcrumb Path

```sql
-- Generate breadcrumbs for a specific path
WITH RECURSIVE breadcrumbs AS (
  SELECT path, DEPTH(path) AS level
  FROM default
  WHERE path = '/content/blog/2024/my-post'

  UNION ALL

  SELECT PARENT(b.path), DEPTH(PARENT(b.path))
  FROM breadcrumbs b
  WHERE PARENT(b.path) IS NOT NULL
)
SELECT path, properties->>'title' AS title
FROM default
WHERE path IN (SELECT path FROM breadcrumbs)
ORDER BY DEPTH(path);

-- Results:
-- /content              | Content Root
-- /content/blog         | Blog
-- /content/blog/2024    | 2024 Posts
-- /content/blog/2024/my-post | My Post
```

### Get Siblings

Nodes with the same parent:

```sql
SELECT sibling.path
FROM default sibling
WHERE PARENT(sibling.path) = (
  SELECT PARENT(path)
  FROM default
  WHERE path = '/content/blog/post1'
)
AND sibling.path != '/content/blog/post1';
```

### Tree Aggregations

```sql
-- Count articles per category
SELECT
  PARENT(path) AS category,
  COUNT(*) AS article_count
FROM default
WHERE node_type = 'blog:Article'
GROUP BY PARENT(path)
ORDER BY article_count DESC;

-- Sum values up the tree
SELECT
  ANCESTOR(path, 2) AS top_category,
  SUM((properties->>'views')::int) AS total_views
FROM default
WHERE node_type = 'blog:Article'
GROUP BY ANCESTOR(path, 2);
```

## Path Design Patterns

### Content Organization

```
/content
  /content/blog
    /content/blog/2024
      /content/blog/2024/01
        /content/blog/2024/01/my-post
    /content/blog/categories
      /content/blog/categories/technology
      /content/blog/categories/design
  /content/pages
    /content/pages/about
    /content/pages/contact
```

### Media Library

```
/media
  /media/images
    /media/images/2024
      /media/images/2024/header.jpg
      /media/images/2024/banner.png
  /media/videos
  /media/documents
```

### User Data

```
/users
  /users/jane-developer
    /users/jane-developer/profile
    /users/jane-developer/settings
    /users/jane-developer/posts
      /users/jane-developer/posts/draft-1
```

### Configuration

```
/config
  /config/site
    /config/site/general
    /config/site/appearance
  /config/navigation
    /config/navigation/main-menu
    /config/navigation/footer-menu
```

### E-commerce

```
/products
  /products/electronics
    /products/electronics/laptops
      /products/electronics/laptops/macbook-pro
    /products/electronics/phones
  /products/clothing
    /products/clothing/mens
    /products/clothing/womens
```

## Path Constraints

Use allowed_children to enforce hierarchy:

```sql
-- Define a Folder that can contain Articles or other Folders
INSERT INTO raisin:system.node_types (name, allowed_children, properties) VALUES (
  'content:Folder',
  '["blog:Article", "content:Folder"]',
  '{
    "name": {"type": "string", "required": true}
  }'
);

-- Attempting to create invalid child fails
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/invalid-child',  -- Parent is content:Folder
  'ecommerce:Product',            -- Not in allowed_children
  '{}'
);
-- Error: NodeType 'ecommerce:Product' not allowed as child of 'content:Folder'
```

## Moving Nodes

Change a node's path to move it in the hierarchy:

```sql
-- Move a blog post to a different category
UPDATE default
SET path = '/content/blog/technology/my-post'
WHERE path = '/content/blog/general/my-post';

-- Move with all descendants (recursive)
UPDATE default
SET path = REPLACE(path, '/content/blog/old', '/content/blog/new')
WHERE PATH_STARTS_WITH(path, '/content/blog/old');
```

**Warning**: Moving nodes with children requires careful handling to maintain referential integrity.

## Path Indexing

Create indexes for efficient hierarchical queries:

```sql
-- Index for path prefix queries
CREATE INDEX idx_path_prefix ON default USING BTREE(path);

-- Index for parent lookups
CREATE INDEX idx_parent ON default (PARENT(path));

-- Index for depth queries
CREATE INDEX idx_depth ON default (DEPTH(path));
```

## Virtual Hierarchies

Create logical hierarchies without path structure:

```sql
-- Nodes reference their parent explicitly
{
  "path": "/content/article-123",
  "properties": {
    "title": "My Article",
    "parent": "/content/category-tech"  -- Explicit reference
  }
}

-- Query logical hierarchy
SELECT child.path
FROM default child
WHERE child.properties->>'parent' = '/content/category-tech';
```

Use this when:
- Nodes need multiple parents
- Hierarchy changes frequently
- Path-based hierarchy is too rigid

## Performance Considerations

### Efficient Queries

```sql
-- Good: Uses path index
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog');

-- Bad: Full table scan
SELECT * FROM default
WHERE path LIKE '%/blog/%';

-- Good: Depth index
SELECT * FROM default
WHERE DEPTH(path) = 3;

-- Bad: Function on every row
SELECT * FROM default
WHERE DEPTH(path) BETWEEN 2 AND 4;
```

### Limiting Depth

```sql
-- Get children up to 2 levels deep
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog')
  AND DEPTH(path) <= DEPTH('/content/blog') + 2;
```

## Best Practices

1. **Use meaningful paths**: Paths should be human-readable and descriptive
2. **Keep depth reasonable**: Avoid deeply nested hierarchies (>10 levels)
3. **Use consistent naming**: kebab-case for segments
4. **Index appropriately**: Add indexes for common path queries
5. **Plan for growth**: Leave room in hierarchy for future expansion
6. **Document conventions**: Establish path naming standards for your team
7. **Consider alternatives**: Use graph edges for non-hierarchical relationships

## Hierarchical Patterns

### Date-Based Paths

```sql
-- Year/Month/Day structure
/content/blog/2024/01/15/my-post

-- Query by date range
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/content/blog/2024/01');
```

### Taxonomy Paths

```sql
-- Multi-level categorization
/products/electronics/computers/laptops/gaming

-- Navigate taxonomy
SELECT * FROM default
WHERE PATH_STARTS_WITH(path, '/products/electronics')
  AND DEPTH(path) = 4;  -- Get all categories
```

### Namespace Paths

```sql
-- Separate concerns
/system/config
/system/cache
/user-data/profiles
/user-data/preferences
```

## Next Steps

- **[Nodes](/docs/concepts/data-model/nodes)** - Create hierarchical content
- **[Graph Model](/docs/concepts/graph-model)** - Build non-hierarchical relationships
- **[Workspaces](/docs/concepts/workspaces)** - Organize content across namespaces
- **[SQL Reference](/docs/reference/sql/functions/string-functions)** - Complete path function documentation
