---
sidebar_position: 4
---

# Data Modeling Strategy

Practical guidance for designing your RaisinDB data model. This guide covers when to use inheritance vs mixins, how to organize workspaces and paths, and common anti-patterns to avoid.

## NodeType Inheritance vs Mixins

RaisinDB supports two ways to share properties across NodeTypes: **inheritance** (`extends`) and **mixins**.

### When to Use Inheritance

Use `extends` when you have a clear "is-a" relationship with a single parent type:

```yaml
# Base type with shared fields
name: content:BaseContent
properties:
  - name: title
    type: String
    required: true
  - name: slug
    type: String
    required: true
versionable: true
auditable: true
```

```yaml
# BlogPost IS A BaseContent
name: blog:BlogPost
extends: content:BaseContent
properties:
  - name: body
    type: String
  - name: excerpt
    type: String
```

```yaml
# NewsArticle IS A BaseContent
name: news:NewsArticle
extends: content:BaseContent
properties:
  - name: body
    type: String
  - name: source_url
    type: URL
```

**Use inheritance when:**
- Types share a core identity (BlogPost, NewsArticle, and Documentation are all "content")
- You want inherited types to be queryable as the base type
- The relationship is genuinely hierarchical

### When to Use Mixins

Use mixins for cross-cutting concerns that apply to unrelated types:

```sql
CREATE MIXIN 'myapp:SEO'
  DESCRIPTION 'SEO metadata fields'
  PROPERTIES (
    meta_title String,
    meta_description String,
    og_image String
  );

CREATE MIXIN 'myapp:Timestamps'
  DESCRIPTION 'Standard timestamp fields'
  PROPERTIES (
    created_at Date REQUIRED,
    updated_at Date REQUIRED
  );

CREATE MIXIN 'myapp:Taggable'
  DESCRIPTION 'Tag support'
  PROPERTIES (
    tags Array
  );
```

```yaml
# An Article needs SEO + Timestamps + Tags
name: blog:Article
mixins:
  - myapp:SEO
  - myapp:Timestamps
  - myapp:Taggable
properties:
  - name: title
    type: String
    required: true
```

```yaml
# A Product also needs SEO + Timestamps but NOT tags
name: ecommerce:Product
mixins:
  - myapp:SEO
  - myapp:Timestamps
properties:
  - name: name
    type: String
    required: true
  - name: price
    type: Number
```

**Use mixins when:**
- The capability applies to unrelated types (SEO applies to articles AND products)
- You need to compose multiple capabilities (a type can have many mixins)
- The relationship is "has-a" rather than "is-a"

### Combining Both

You can use inheritance and mixins together:

```yaml
name: blog:FeaturedArticle
extends: content:BaseContent
mixins:
  - myapp:SEO
  - myapp:Taggable
properties:
  - name: hero_image
    type: String
  - name: featured_order
    type: Number
```

## Workspace Design Patterns

Workspaces provide logical separation within a repository. Each workspace is independently queryable as a SQL table.

### By Domain

Separate workspaces for different content domains:

| Workspace | Purpose | NodeTypes |
|-----------|---------|-----------|
| `content` | Website pages and blog posts | Page, Article, Category |
| `media` | Images, videos, documents | Asset, Folder |
| `users` | User profiles and preferences | Profile, Settings |
| `products` | Product catalog | Product, Category, Review |

```sql
-- Query content workspace
SELECT * FROM 'content' WHERE node_type = 'blog:Article';

-- Query media workspace
SELECT * FROM 'media' WHERE node_type = 'Asset';
```

**Best for:** Applications with clearly separated content domains.

### By Access Level

Separate workspaces based on who accesses the data:

| Workspace | Purpose |
|-----------|---------|
| `public` | Published content visible to end users |
| `internal` | Internal documents and drafts |
| `system` | Configuration, NodeTypes, system data |

**Best for:** Applications where access control boundaries are more important than content type boundaries.

### Keep It Simple

Start with fewer workspaces and split later. One `default` workspace is fine for small projects. Split when you need:
- Different query isolation
- Different allowed NodeTypes per workspace
- Independent indexing or search scopes

## Path Hierarchy Design

Paths organize nodes into a tree structure within each workspace. Good path design makes hierarchical queries efficient.

### URL-Friendly Paths

If your content maps to URLs, mirror the URL structure:

```
/blog/
  /blog/2026/
    /blog/2026/03/
      /blog/2026/03/hello-world
      /blog/2026/03/second-post
/pages/
  /pages/about
  /pages/contact
```

Query all March 2026 posts:

```sql
SELECT * FROM 'content'
WHERE PATH_STARTS_WITH(path, '/blog/2026/03/');
```

### Categorical Paths

Group by domain concept rather than date:

```
/products/
  /products/electronics/
    /products/electronics/laptop-x1
  /products/clothing/
    /products/clothing/blue-shirt
/categories/
  /categories/electronics
  /categories/clothing
```

### Flat Paths

For simple collections without hierarchy, use a single level:

```
/users/jane
/users/john
/users/alice
```

### Path Design Principles

1. **Keep paths stable** — Changing a path moves the node and all its children. Design paths that won't need to change.
2. **Use meaningful segments** — `/content/blog/hello-world` is better than `/c/b/hw`.
3. **Limit depth** — Deep paths (5+ levels) are harder to manage. Flatten where possible.
4. **Use hierarchy for queries** — If you frequently query "all items in category X", make category a path segment.

## When to Use Graph Edges vs Hierarchy

RaisinDB supports both parent-child hierarchy (paths) and graph edges (RELATE). Choose based on the relationship:

### Use Path Hierarchy When

- The relationship is **ownership** or **containment** (a folder contains files)
- A node has exactly **one parent**
- You need **prefix scan** queries (find all content under `/blog/`)
- The structure mirrors a **navigation tree** or **folder system**

```
/blog/
  /blog/post-1      (a blog post LIVES IN the blog folder)
  /blog/post-2
```

### Use Graph Edges When

- The relationship is **many-to-many** (articles have many tags, tags apply to many articles)
- Nodes can have **multiple relationships** of different types
- You need **traversal queries** (friends of friends, recommendation chains)
- The relationship is **semantic** rather than structural (AUTHORED_BY, LIKES, RELATED_TO)

```sql
RELATE FROM path='/blog/post-1' TO path='/users/jane' TYPE 'AUTHORED_BY';
RELATE FROM path='/blog/post-1' TO path='/tags/rust' TYPE 'TAGGED_WITH';
RELATE FROM path='/blog/post-1' TO path='/blog/post-2' TYPE 'RELATED_TO';
```

### Combining Both

A common pattern: hierarchy for structure, edges for relationships.

```
/blog/post-1           (hierarchy: post lives in blog)
  └── AUTHORED_BY → /users/jane      (edge: author relationship)
  └── TAGGED_WITH → /tags/rust       (edge: tag relationship)
  └── RELATED_TO → /blog/post-2      (edge: content relationship)
```

## Anti-Patterns to Avoid

### Deeply Nested Type Hierarchies

```yaml
# Avoid: 4+ levels of inheritance
name: SpecialFeaturedBlogPost
extends: FeaturedBlogPost     # extends BlogPost → extends BaseContent → extends Node
```

Keep inheritance to 2 levels maximum. Use mixins for additional capabilities instead.

### One Workspace Per NodeType

```
# Avoid: too many workspaces
articles workspace   → only Article nodes
categories workspace → only Category nodes
tags workspace       → only Tag nodes
```

Workspaces are for domain boundaries, not type boundaries. Use `node_type` filters within a workspace.

### Encoding Data in Paths

```
# Avoid: data-dependent paths that break when data changes
/articles/status-published/category-tech/post-123
```

Use properties and filters instead:

```sql
SELECT * FROM 'content'
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
  AND properties->>'category'::String = 'tech';
```

### Skipping Namespaces

```yaml
# Avoid: bare names that can conflict
name: Article
name: Category
```

```yaml
# Better: namespaced names
name: blog:Article
name: blog:Category
```

Namespaces prevent conflicts when installing packages or sharing types across teams.

### Giant Monolithic NodeTypes

```yaml
# Avoid: 30+ properties on a single type
name: Everything
properties:
  - name: title
  - name: body
  - name: seo_title
  - name: seo_description
  - name: author_name
  - name: author_email
  # ... 25 more fields
```

Split into a focused type with mixins:

```yaml
name: blog:Article
mixins:
  - myapp:SEO
  - myapp:Authorable
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
```

## Next Steps

- [Creating NodeTypes](/docs/guides/data-modeling/creating-nodetypes) — Define schemas
- [Using Archetypes](/docs/guides/data-modeling/using-archetypes) — Reusable property sets
- [Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy) — Path design details
- [Graph Model](/docs/concepts/graph-model) — Graph edge patterns
