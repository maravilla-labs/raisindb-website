---
sidebar_position: 4
---

# Data Modeling Strategy

Practical guidance for designing a RaisinDB data model: when to share
properties through inheritance and when through mixins, how to organize
workspaces and paths, when a relation belongs in the tree and when in the
graph, and a few patterns to avoid.

## Inheritance vs mixins

A NodeType can share properties in two ways: `extends` (one parent) and
`mixins` (any number).

### When to use inheritance

Use `extends` for a clear "is a kind of" relationship with a single parent:

```yaml
# Base type with shared fields
name: content:Base
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
# A BlogPost is a content:Base
name: blog:Post
extends: content:Base
properties:
  - name: body
    type: String
  - name: excerpt
    type: String
```

```yaml
# A NewsArticle is a content:Base
name: news:Article
extends: content:Base
properties:
  - name: body
    type: String
  - name: source_url
    type: URL
```

Nodes of a subtype can be found by their base type: the server stamps every
node written through the node API with `$supertypes`, and `IS_A` queries it.

```sql
SELECT name, node_type FROM 'content' WHERE IS_A(properties, 'content:Base');
```

Use inheritance when the types share an identity, when you want to query them
as the base type, and when the relationship is genuinely hierarchical.

### When to use mixins

Use mixins for capabilities that apply to unrelated types:

```sql
CREATE MIXIN 'myapp:Seo'
  DESCRIPTION 'SEO metadata fields'
  PROPERTIES (
    meta_title String,
    meta_description String,
    og_image URL
  );

CREATE MIXIN 'myapp:Reviewed'
  PROPERTIES (
    reviewed_by String REQUIRED,
    reviewed_on Date
  );

CREATE MIXIN 'myapp:Tagged'
  PROPERTIES (
    tags Array OF String
  );
```

```yaml
# An Article needs SEO, review metadata and tags
name: blog:Article
mixins:
  - myapp:Seo
  - myapp:Reviewed
  - myapp:Tagged
properties:
  - name: title
    type: String
    required: true
```

```yaml
# A Product needs SEO and review metadata but not tags
name: shop:Product
mixins:
  - myapp:Seo
  - myapp:Reviewed
properties:
  - name: name
    type: String
    required: true
  - name: price
    type: Number
```

Use a mixin when the capability cuts across unrelated types, when a type needs
several capabilities, and when the relationship is "also has" rather than
"is a".

### Combining both

Inheritance and mixins compose. The parent's properties are merged first, then
each mixin in order, then the type's own properties:

```yaml
name: blog:FeaturedArticle
extends: content:Base
mixins:
  - myapp:Seo
  - myapp:Tagged
properties:
  - name: hero_image
    type: Resource
  - name: featured_order
    type: Number
```

See [Using Mixins](./using-mixins.md) for the resolution rules.

## Workspace design

A workspace is a named tree inside a repository with its own list of allowed
NodeTypes. Each workspace is queried as its own SQL table.

### By domain

| Workspace | Purpose | NodeTypes |
|-----------|---------|-----------|
| `content` | Pages and posts | `site:Page`, `blog:Article` |
| `media` | Images, videos, documents | `raisin:Asset`, `raisin:Folder` |
| `people` | Profiles | `crm:Contact` |
| `catalog` | Products | `shop:Product`, `shop:Category` |

```sql
SELECT * FROM 'content' WHERE node_type = 'blog:Article';
SELECT * FROM 'media' WHERE node_type = 'raisin:Asset';
```

This fits applications with clearly separated content areas.

### By access level

| Workspace | Purpose |
|-----------|---------|
| `public` | Content visible to end users |
| `internal` | Internal documents and drafts |

This fits applications where the access boundary matters more than the content
type. Row-level security rules and workspace access grants can then follow the
workspace boundary.

### Keep it simple

Start with few workspaces and split later. One workspace is fine for a small
project. Split when you need a different set of allowed NodeTypes, a separate
tree with its own root, or a separate search scope.

## Path design

Nodes form a tree within each workspace, and a node's path is its address.
Good path design keeps hierarchical queries simple.

### URL-friendly paths

If content maps to URLs, mirror the URL structure:

```
/blog/2026/03/hello-world
/blog/2026/03/second-post
/pages/about
/pages/contact
```

Query everything under one folder:

```sql
SELECT path FROM 'content' WHERE DESCENDANT_OF('/blog/2026/03');
-- or, as a prefix match on the path string
SELECT path FROM 'content' WHERE PATH_STARTS_WITH(path, '/blog/2026/03/');
```

### Categorical paths

Group by concept rather than date:

```
/products/electronics/laptop-x1
/products/clothing/blue-shirt
/categories/electronics
/categories/clothing
```

### Flat paths

For simple collections without hierarchy, use one level:

```
/users/jane
/users/john
```

### Principles

1. **Keep paths stable.** Moving a node moves its whole subtree and changes
   every descendant's address.
2. **Use meaningful segments.** `/content/blog/hello-world` reads better than
   `/c/b/hw`.
3. **Limit depth.** Paths deeper than four or five levels are hard to manage.
4. **Use the hierarchy for containment queries.** If you often ask for
   "everything in category X", make the category a path segment.

## Hierarchy vs graph relations

RaisinDB has both a tree (paths) and a graph (relations created with
`RELATE`). Pick by the shape of the relationship.

### Use the tree when

- the relationship is ownership or containment (a folder contains files),
- a node has exactly one parent,
- you need subtree queries (`DESCENDANT_OF`, `CHILD_OF`),
- the structure mirrors navigation or a folder system.

### Use relations when

- the relationship is many-to-many (articles have many tags, tags apply to
  many articles),
- a node has several relationships of different kinds,
- you need traversal queries,
- the relationship is semantic (`AUTHORED_BY`, `RELATED_TO`) rather than
  structural.

```sql
RELATE FROM path='/blog/post-1' IN WORKSPACE 'content'
    TO path='/users/jane' IN WORKSPACE 'people'
    TYPE 'AUTHORED_BY';

RELATE FROM path='/blog/post-1' IN WORKSPACE 'content'
    TO path='/blog/post-2' IN WORKSPACE 'content'
    TYPE 'RELATED_TO';
```

Each endpoint names its workspace, so a relation can cross workspaces.
`UNRELATE` with the same clauses removes one.

### Combining both

A common pattern is the tree for structure and relations for everything else:

```
/blog/post-1                 (tree: the post lives in the blog)
   AUTHORED_BY  /users/jane  (relation)
   RELATED_TO   /blog/post-2 (relation)
```

A `Reference` property is a third option for a single pointer stored on the
node itself, for example a `category` field:

```json
{"category": {"raisin:ref": "/categories/tech", "raisin:workspace": "catalog"}}
```

The server resolves the path to the target's id on write and stores
`raisin:ref`, `raisin:workspace` and `raisin:path`. `REFERENCES('catalog:/categories/tech')`
finds the nodes that point at it. Use a reference for a one-to-one pointer that
belongs to the node, and relations for edges you want to traverse or count.

## Patterns to avoid

### Deep inheritance chains

```yaml
# Four levels: hard to reason about
name: blog:SpecialFeaturedPost
extends: blog:FeaturedPost   # extends blog:Post, extends content:Base
```

Keep inheritance to two levels and add capabilities with mixins.

### One workspace per NodeType

Workspaces mark domain boundaries, not type boundaries. Filter on `node_type`
inside a workspace instead of creating `articles`, `categories` and `tags`
workspaces.

### Encoding data in paths

```
/articles/status-published/category-tech/post-123
```

A path like this has to change whenever the status or category changes. Keep
that data in properties and filter on it:

```sql
SELECT * FROM 'content'
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
  AND properties->>'category'::String = 'tech';
```

### Unnamespaced types

NodeType names must be `namespace:Name` (`blog:Article`, not `Article`). The
namespace keeps packages from colliding when installed side by side.

### One type with everything

A type with thirty properties is hard to validate and hard to edit. Keep the
type to its own fields and move cross-cutting groups into mixins:

```yaml
name: blog:Article
mixins:
  - myapp:Seo
  - myapp:Reviewed
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
```

## Next steps

- [Creating NodeTypes](./creating-nodetypes.md)
- [Using Mixins](./using-mixins.md)
- [Paths and Hierarchy](../../concepts/data-model/paths-and-hierarchy.md)
