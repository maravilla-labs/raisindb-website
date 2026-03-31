---
sidebar_position: 11
---

# Workspaces

**Workspaces** are app-specific organizational units for grouping related data within a repository. They separate different types of content — like "content", "dam", "customers" — while sharing the same version control and branching infrastructure. Workspaces are completely independent of multi-tenancy (which is handled by RaisinDB's built-in tenant isolation).

## What is a Workspace?

In the Admin Console, workspaces are displayed as cards showing their purpose and available NodeTypes:

![Workspace Selector](/img/admin-console/workspace-selector.png)

A workspace is a named container for nodes:

```sql
-- Each workspace is queryable as a table
SELECT * FROM default;              -- User content
SELECT * FROM raisin:system;        -- System metadata
SELECT * FROM raisin:access_control;-- Users, roles, permissions
SELECT * FROM functions;             -- Serverless functions
```

Workspaces provide:
- **Isolation**: Content in one workspace doesn't interfere with another
- **Organization**: Separate concerns (content, config, users, etc.)
- **Security**: Different access controls per workspace
- **Performance**: Independent indexes and optimization

## System Workspaces

RaisinDB includes built-in workspaces:

### default

Primary content workspace for your application:

```sql
-- User-facing content
SELECT * FROM default WHERE node_type = 'blog:Article';

-- This is where most INSERT/UPDATE operations happen
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/my-post',
  'blog:Article',
  '{"title": "My Article"}'
);
```

### raisin:system

System configuration and schemas. The workspace name is the table, and you filter by node_type:

```sql
-- Query the system workspace for NodeType definitions
SELECT path, properties->>'name' AS name
FROM "raisin:system"
WHERE node_type = 'raisin:NodeType';

-- Query archetypes
SELECT path, properties->>'name' AS name
FROM "raisin:system"
WHERE node_type = 'raisin:Archetype';

-- Query element definitions
SELECT path, properties->>'name' AS name
FROM "raisin:system"
WHERE node_type = 'raisin:ElementType';
```

### raisin:access_control

User management and permissions. Users, groups, and roles are nodes in this workspace:

```sql
-- Query users (nodes at /users/...)
SELECT path, properties->>'user_id' AS user_id,
       properties->>'email' AS email
FROM "raisin:access_control"
WHERE node_type = 'raisin:User';

-- Query groups (nodes at /groups/...)
SELECT path, properties->>'group_id' AS group_id
FROM "raisin:access_control"
WHERE node_type = 'raisin:Group';

-- Query roles (nodes at /roles/...)
SELECT path, properties->>'role_id' AS role_id
FROM "raisin:access_control"
WHERE node_type = 'raisin:Role';
```

### functions

Serverless JavaScript functions:

```sql
-- Stored functions
SELECT * FROM functions WHERE path = '/api/custom-endpoint';

-- Triggers
SELECT * FROM functions WHERE type = 'trigger';

-- Create a function
INSERT INTO functions (path, code, trigger_on) VALUES (
  '/api/hello',
  'export default function(req) { return { message: "Hello" }; }',
  NULL
);
```

### packages

Installed RAP (RaisinDB Application Package) content:

```sql
-- Installed packages
SELECT * FROM packages;

-- Package content
SELECT * FROM packages WHERE path LIKE '/packages/cms-toolkit/%';
```

## Creating Custom Workspaces

Create workspaces for specific purposes:

```sql
-- Create a workspace for drafts
CREATE WORKSPACE drafts;

-- Create a workspace for archives
CREATE WORKSPACE archives;

-- Create a workspace for media
CREATE WORKSPACE media;

-- Create a workspace for analytics
CREATE WORKSPACE analytics;
```

### Workspace Metadata

```sql
-- List all workspaces
SELECT name, created_at, created_by, description
FROM __workspaces__
ORDER BY name;

-- Get workspace details
SELECT * FROM __workspaces__
WHERE name = 'drafts';
```

## Using Workspaces

### Insert into Workspace

```sql
-- Insert into default workspace
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/post1',
  'blog:Article',
  '{"title": "Published Article"}'
);

-- Insert into drafts workspace
INSERT INTO drafts (path, node_type, properties) VALUES (
  '/content/blog/draft1',
  'blog:Article',
  '{"title": "Draft Article"}'
);

-- Insert into media workspace
INSERT INTO media (path, node_type, properties) VALUES (
  '/images/header.jpg',
  'media:Image',
  '{"url": "https://cdn.example.com/header.jpg"}'
);
```

### Query from Workspace

```sql
-- Query default workspace
SELECT * FROM default WHERE node_type = 'blog:Article';

-- Query drafts workspace
SELECT * FROM drafts WHERE properties->>'status' = 'review';

-- Query media workspace
SELECT * FROM media WHERE node_type = 'media:Image';

-- Join across workspaces
SELECT
  d.properties->>'title' AS title,
  m.properties->>'url' AS image_url
FROM default d
LEFT JOIN media m ON d.properties->>'featuredImage' = m.path
WHERE d.node_type = 'blog:Article';
```

### Cross-Workspace References

```sql
-- Article in default references media in media workspace
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/post1',
  'blog:Article',
  '{
    "title": "My Article",
    "featuredImage": "/images/header.jpg"
  }'
);

-- Resolve reference across workspaces
SELECT
  d.properties->>'title' AS title,
  (SELECT properties FROM media WHERE path = d.properties->>'featuredImage') AS image
FROM default d
WHERE path = '/content/blog/post1';
```

## Workspace Patterns

### Content Staging

Separate draft and published content:

```sql
-- Create staging workspaces
CREATE WORKSPACE drafts;
CREATE WORKSPACE review;
CREATE WORKSPACE published;

-- Author writes in drafts
INSERT INTO drafts (path, node_type, properties) VALUES (
  '/content/blog/new-article',
  'blog:Article',
  '{"title": "New Article", "status": "draft"}'
);

-- Move to review workspace
INSERT INTO review (path, node_type, properties)
SELECT path, node_type, properties
FROM drafts
WHERE path = '/content/blog/new-article';

DELETE FROM drafts WHERE path = '/content/blog/new-article';

-- Publish to published workspace
INSERT INTO published (path, node_type, properties)
SELECT path, node_type, properties || '{"published": true, "publishedAt": NOW()}'
FROM review
WHERE path = '/content/blog/new-article';
```

### Multi-Tenancy

Isolate data per tenant:

```sql
-- Create workspace per tenant
CREATE WORKSPACE tenant:acme;
CREATE WORKSPACE tenant:globex;
CREATE WORKSPACE tenant:initech;

-- Tenant-specific data
INSERT INTO tenant:acme (path, node_type, properties) VALUES (
  '/content/page',
  'cms:Page',
  '{"title": "Acme Corp Homepage"}'
);

INSERT INTO tenant:globex (path, node_type, properties) VALUES (
  '/content/page',
  'cms:Page',
  '{"title": "Globex Homepage"}'
);

-- Query tenant data
SELECT * FROM tenant:acme WHERE node_type = 'cms:Page';
```

### Environment Separation

Different workspaces for different environments:

```sql
-- Create environment workspaces
CREATE WORKSPACE env:development;
CREATE WORKSPACE env:staging;
CREATE WORKSPACE env:production;

-- Development config
INSERT INTO env:development (path, node_type, properties) VALUES (
  '/config/api',
  'config:API',
  '{"endpoint": "https://dev-api.example.com"}'
);

-- Production config
INSERT INTO env:production (path, node_type, properties) VALUES (
  '/config/api',
  'config:API',
  '{"endpoint": "https://api.example.com"}'
);

-- Application reads from appropriate workspace
SELECT properties->>'endpoint'
FROM env:production
WHERE path = '/config/api';
```

### Archive Storage

Move old content to archive workspace:

```sql
-- Create archive workspace
CREATE WORKSPACE archives;

-- Move old content to archive
INSERT INTO archives (path, node_type, properties)
SELECT path, node_type, properties
FROM default
WHERE (properties->>'publishedAt')::timestamp < NOW() - INTERVAL '1 year';

-- Remove from default
DELETE FROM default
WHERE (properties->>'publishedAt')::timestamp < NOW() - INTERVAL '1 year';

-- Query archived content
SELECT * FROM archives WHERE node_type = 'blog:Article';
```

## Workspace Versioning

Workspaces share the same versioning and branching:

```sql
-- Create branch (affects all workspaces)
CREATE BRANCH feature/redesign FROM main;

-- Switch branch
SET BRANCH = 'feature/redesign';

-- Changes in any workspace are on this branch
INSERT INTO default (path, node_type, properties) VALUES ('/content/page', 'cms:Page', '{}');
INSERT INTO media (path, node_type, properties) VALUES ('/images/new.jpg', 'media:Image', '{}');

-- Both changes are on feature/redesign branch
SELECT __branch FROM default WHERE path = '/content/page';  -- feature/redesign
SELECT __branch FROM media WHERE path = '/images/new.jpg';  -- feature/redesign

-- Merge brings changes from all workspaces
MERGE BRANCH feature/redesign INTO main;
```

## Workspace Access Control

Control access per workspace:

```sql
-- Grant access to specific workspace
GRANT SELECT ON default TO ROLE viewer;
GRANT INSERT, UPDATE, DELETE ON default TO ROLE editor;

-- Restrict access to system workspaces
GRANT SELECT ON raisin:system TO ROLE admin;
REVOKE ALL ON raisin:system FROM ROLE viewer;

-- Tenant isolation
GRANT ALL ON tenant:acme TO ROLE acme_admin;
GRANT SELECT ON tenant:acme TO ROLE acme_viewer;
REVOKE ALL ON tenant:globex FROM ROLE acme_admin;  -- No cross-tenant access
```

## Workspace Configuration

Configure workspace behavior:

```sql
-- Enable full-text search for workspace
ALTER WORKSPACE default SET INDEXING = 'enabled';

-- Set retention policy
ALTER WORKSPACE archives SET REVISION_RETENTION = 'DURATION 180 DAYS';

-- Configure workspace metadata
ALTER WORKSPACE drafts SET DESCRIPTION = 'Draft content pending review';

-- Set workspace-specific schema
ALTER WORKSPACE media SET ALLOWED_NODE_TYPES = '["media:Image", "media:Video", "media:Document"]';
```

## Workspace Queries

### List All Nodes Across Workspaces

```sql
-- Union across workspaces
SELECT 'default' AS workspace, path, node_type FROM default
UNION ALL
SELECT 'drafts', path, node_type FROM drafts
UNION ALL
SELECT 'media', path, node_type FROM media;
```

### Count Nodes Per Workspace

```sql
-- Using information schema
SELECT workspace_name, COUNT(*) AS node_count
FROM (
  SELECT 'default' AS workspace_name, path FROM default
  UNION ALL
  SELECT 'drafts', path FROM drafts
  UNION ALL
  SELECT 'media', path FROM media
) combined
GROUP BY workspace_name;
```

### Cross-Workspace Search

```sql
-- Search across multiple workspaces
SELECT 'default' AS workspace, path, properties->>'title' AS title
FROM default
WHERE properties->>'title' ILIKE '%search term%'
UNION ALL
SELECT 'drafts', path, properties->>'title'
FROM drafts
WHERE properties->>'title' ILIKE '%search term%';
```

## Deleting Workspaces

```sql
-- Delete empty workspace
DROP WORKSPACE temp;

-- Force delete (removes all content)
DROP WORKSPACE old_drafts CASCADE;
```

## Performance Considerations

### Workspace Indexes

Each workspace has independent indexes:

```sql
-- Create index on default workspace
CREATE INDEX idx_default_type ON default (node_type);

-- Create index on media workspace
CREATE INDEX idx_media_url ON media ((properties->>'url'));

-- Indexes don't affect other workspaces
```

### Workspace Size

```sql
-- Get workspace sizes
SELECT
  'default' AS workspace,
  COUNT(*) AS node_count,
  pg_size_pretty(pg_total_relation_size('default')) AS size
FROM default
UNION ALL
SELECT
  'media',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('media'))
FROM media;
```

## Best Practices

1. **Use default for primary content**: Keep main user-facing content in default
2. **Separate concerns**: Use workspaces to organize different data types (content, dam, customers)
3. **Don't over-segment**: Too many workspaces add complexity
4. **Document workspace purpose**: Add descriptions to workspaces
5. **Control access**: Use workspace-level permissions
6. **Index independently**: Optimize each workspace separately
7. **Consider query patterns**: Design workspaces around how you query
8. **Use tenants for isolation**: Multi-tenancy is handled by RaisinDB's tenant system, not workspaces

## Real-World Examples

### CMS with Workflow

```sql
-- Content lifecycle workspaces
CREATE WORKSPACE content:drafts;
CREATE WORKSPACE content:review;
CREATE WORKSPACE content:published;
CREATE WORKSPACE content:archived;

-- Media library
CREATE WORKSPACE media:images;
CREATE WORKSPACE media:videos;
CREATE WORKSPACE media:documents;

-- Configuration
CREATE WORKSPACE config:site;
CREATE WORKSPACE config:features;
```

### Multi-Site Platform

```sql
-- Site-specific workspaces
CREATE WORKSPACE site:corporate;
CREATE WORKSPACE site:blog;
CREATE WORKSPACE site:ecommerce;

-- Shared media
CREATE WORKSPACE shared:media;

-- Each site queries its workspace
SELECT * FROM site:corporate WHERE node_type = 'cms:Page';
SELECT * FROM site:blog WHERE node_type = 'blog:Article';
```

### SaaS Application

```sql
-- Tenant isolation
CREATE WORKSPACE customer:123;
CREATE WORKSPACE customer:456;
CREATE WORKSPACE customer:789;

-- Application queries current customer's workspace
SELECT * FROM customer:${customer_id} WHERE user_id = ${user_id};
```

## Next Steps

- **[Nodes](/docs/concepts/data-model/nodes)** - Create content in workspaces
- **[Access Control](/docs/concepts/access-control)** - Secure workspaces with permissions
- **[Branching](/docs/concepts/versioning/branches-and-tags)** - Version control across workspaces
- **[SQL Reference](/docs/reference/sql/statements/select)** - Workspace management commands
