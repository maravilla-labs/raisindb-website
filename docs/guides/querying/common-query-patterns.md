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
SELECT path, score
FROM FULLTEXT_SEARCH('content management', 'en', workspaces => 'default')
ORDER BY score DESC
LIMIT 20;
```

### Search with NodeType Filter

```sql
SELECT path, properties->>'title'::String AS title, score
FROM FULLTEXT_SEARCH('raisindb', 'en', workspaces => 'default')
WHERE node_type = 'blog:Article'
ORDER BY score DESC
LIMIT 10;
```

## Vector Similarity Search

### Find Similar Content

```sql
SELECT path, vector_distance
FROM KNN('how do vector indexes work', 10, workspaces => 'default');
```

The first argument is the query (text is embedded for you; a literal vector or `VECTOR_OF('ws:/path')` also work), the second is the number of results (k), and `workspaces` is required.

### Hybrid Search (Vector + Filter)

```sql
SELECT path, vector_distance
FROM KNN('sustainable packaging', 20, workspaces => 'default')
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
LIMIT 10;
```

## Pagination

Recipes below; see [Pagination](./pagination.md) for choosing between offset and
keyset, picking a cursor column, and the HTTP / JavaScript client equivalents.

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

Keyset cursors also work over paths — useful for hierarchical listings, since
sibling paths sort naturally:

```sql
-- Page through the children of /blog, 20 at a time
SELECT * FROM 'default'
WHERE CHILD_OF('/blog') AND path > $1   -- $1 = last path of the previous page
ORDER BY path
LIMIT 20;
```

### Previous / Next Node

Because RaisinDB is hierarchical, "the node before/after this one" is a
single keyset query — no window functions needed:

```sql
-- Next sibling of /blog/post-3 (path order)
SELECT * FROM 'default'
WHERE CHILD_OF('/blog') AND path > '/blog/post-3'
ORDER BY path ASC LIMIT 1;

-- Previous sibling
SELECT * FROM 'default'
WHERE CHILD_OF('/blog') AND path < '/blog/post-3'
ORDER BY path DESC LIMIT 1;
```

For a blog's "older / newer post" links, cursor on the publish date instead
of the path:

```sql
-- Next (newer) article after the current one ($1 = current published_at)
SELECT * FROM 'default'
WHERE DESCENDANT_OF('/blog')
  AND properties->>'published_at'::String > $1
ORDER BY properties->>'published_at'::String ASC LIMIT 1;

-- Previous (older) article
SELECT * FROM 'default'
WHERE DESCENDANT_OF('/blog')
  AND properties->>'published_at'::String < $1
ORDER BY properties->>'published_at'::String DESC LIMIT 1;
```

### Editorial (drag-and-drop) Order

RaisinDB keeps a **manual order** for every parent's children — what an editor
sets by dragging in the admin console. Two columns expose it, and both work as
keyset cursors:

| Column | Orders a node | Use for |
| --- | --- | --- |
| `__order` | among its **siblings** | paging one parent's children |
| `__tree_order` | within a **subtree** (document order) | paging a whole tree |

```sql
-- Page 1: a menu's items in the order the editor arranged them
SELECT name, __order
FROM 'default'
WHERE CHILD_OF('/menu')
ORDER BY __order
LIMIT 20;

-- Page 2 — $1 = the __order value of the last row from page 1
SELECT name, __order
FROM 'default'
WHERE CHILD_OF('/menu') AND __order > $1
ORDER BY __order
LIMIT 20;
```

To page an entire tree rather than one level, cursor on `__tree_order`. It sorts
into document order: each node appears before its descendants, and a subtree stays
contiguous, so a whole navigation tree pages correctly.

```sql
SELECT path, __tree_order
FROM 'default'
WHERE DESCENDANT_OF('/menu') AND __tree_order > $1
ORDER BY __tree_order
LIMIT 20;
```

Both values are opaque. Pass them back as **bound parameters**, exactly as
received — don't parse, construct, or interpolate them.

Changing the order is a write, not a property edit — you name a position or a
neighbour and the server assigns the key:

```ts
await ws.nodes().reorder('/menu', 'about', 0);              // move to the front
await ws.nodes().moveChildBefore('/menu', 'about', 'home');
await ws.nodes().moveChildAfter('/menu', 'about', 'contact');
```

:::warning `__order` is not `path`
Both order parents before children, so they look interchangeable — but they order
*siblings* differently. `path` sorts siblings **alphabetically**; `__order` sorts
them **editorially**.

With children arranged `c`, `a`, `b`:

```sql
ORDER BY path         -- a, b, c   (alphabetical — the manual order is lost)
ORDER BY __tree_order -- c, a, b   (the order the editor set)
```

They agree only when the manual order happens to be alphabetical, which is why
reaching for `path` looks fine until someone reorders something. And never mix
them — `WHERE __tree_order > $1 ORDER BY path` advances the cursor in one order
while sorting in another, which drops and duplicates rows. Keyset pagination
requires the cursor column and the `ORDER BY` column to match.
:::

:::tip Prefer this over a `sort_order` property
Hand-maintaining a numeric `sort_order` means renumbering to insert between two
items, and concurrent edits collide. The built-in order is a fractional index —
inserting between two siblings never renumbers anything — and it is what the
admin console's drag-and-drop already writes to.
:::

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
SELECT path, score
FROM FULLTEXT_SEARCH('database', 'en', workspaces => 'default')
WHERE PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY score DESC
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
