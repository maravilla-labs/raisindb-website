---
sidebar_position: 7
---

# Common Query Patterns

A recipe book of SQL patterns that come up when building on RaisinDB. Each
recipe was run against a `blog` workspace that allows `raisin:Page` and
`raisin:Folder` nodes.

## CRUD

### Create a node

```sql
INSERT INTO 'blog' (path, node_type, name, properties) VALUES (
  '/posts/hello-world',
  'raisin:Page',
  'hello-world',
  '{"title": "Hello World", "status": "draft"}'::jsonb
);
```

`name` is optional; it defaults to the last path segment. The JSON literal
needs the `::jsonb` cast. The parent (`/posts`) must already exist.

### Read a node by path

```sql
SELECT * FROM 'blog' WHERE path = '/posts/hello-world';
```

### Replace all properties

`SET properties = …` replaces the whole object. Properties you leave out are
removed.

```sql
UPDATE 'blog'
SET properties = '{"title": "Hello World (Updated)", "status": "published"}'::jsonb
WHERE path = '/posts/hello-world';
```

### Change one property

```sql
UPDATE 'blog'
SET properties = JSONB_SET(properties, '{status}', 'published')
WHERE path = '/posts/hello-world';

-- a non-string value
UPDATE 'blog'
SET properties = JSONB_SET(properties, '{views}', 999)
WHERE path = '/posts/hello-world';
```

### Delete a node

```sql
DELETE FROM 'blog' WHERE path = '/posts/hello-world';
```

Deleted nodes stay readable at earlier revisions; see
[Time-Travel Queries](./time-travel-queries.md).

## Property filters

Cast the **key** to the type you compare against:

```sql
SELECT path FROM 'blog' WHERE properties->>'status'::String = 'published';

SELECT path FROM 'blog'
WHERE properties->>'status'::String = 'published'
  AND properties->>'category'::String = 'tech';

-- bound parameters
SELECT path FROM 'blog'
WHERE properties->>'user_id'::String = $1
  AND properties->>'email'::String = $2;
```

Numbers and booleans use `::Integer`, `::Double` and `::Boolean`. The uncast
form `properties->>'status' = 'published'` is served from the property index
and is fine for plain equality; use the cast form for `LIKE`, ranges and
anything combined with other predicates. Details in
[Filtering Data](./filtering-data.md).

## Hierarchy

### Everything under a path

```sql
SELECT path FROM 'blog' WHERE DESCENDANT_OF('/posts');
-- same thing as a prefix test
SELECT path FROM 'blog' WHERE PATH_STARTS_WITH(path, '/posts/');
```

Both become a prefix scan over the path index rather than a workspace scan.

### Direct children

```sql
SELECT path FROM 'blog' WHERE CHILD_OF('/posts');
```

### By depth

```sql
-- top-level nodes
SELECT path FROM 'blog' WHERE depth = 1;

-- exactly three levels deep
SELECT path FROM 'blog' WHERE DEPTH(path) = 3;
```

### Hierarchy plus property filters

```sql
SELECT path FROM 'blog'
WHERE DESCENDANT_OF('/posts')
  AND node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
ORDER BY properties->>'published_at'::String DESC
LIMIT 10;
```

## Graph

### Create a relationship

```sql
RELATE FROM path='/posts/post-1' IN WORKSPACE 'blog'
       TO   path='/about'        IN WORKSPACE 'blog'
       TYPE 'RELATED_TO';
```

`UNRELATE FROM … TO …` removes it. Either side can be given as `id='…'`
instead of a path.

### Pattern matching with GRAPH_TABLE

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (a)-[:RELATED_TO]->(b)
  WHERE a.path = '/posts/post-1'
  COLUMNS (a.path AS source, b.path AS target)
);
```

```json
{"columns":["source","target"],"rows":[{"source":"/posts/post-1","target":"/about"}]}
```

### Multi-hop and variable-length paths

```sql
-- exactly two hops
SELECT * FROM GRAPH_TABLE(
  MATCH (a)-[:RELATED_TO]->(b)-[:RELATED_TO]->(c)
  WHERE a.path = '/posts/post-1'
  COLUMNS (b.path AS intermediate, c.path AS destination)
);

-- one to three hops
SELECT * FROM GRAPH_TABLE(
  MATCH (a)-[:RELATED_TO]->{1,3}(b)
  WHERE a.path = '/posts/post-1'
  COLUMNS (a.path AS source, b.path AS target)
);
```

See [Graph Queries](./graph-queries.md) for labels, direction and costs.

## Full-text search

```sql
SELECT path, score
FROM FULLTEXT_SEARCH('content management', 'en', workspaces => 'blog')
ORDER BY score DESC
LIMIT 20;

-- restricted by type and status
SELECT path, properties->>'title' AS title, score
FROM FULLTEXT_SEARCH('raisindb', 'en', workspaces => 'blog')
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
ORDER BY score DESC
LIMIT 10;

-- restricted to a subtree
SELECT path, score
FROM FULLTEXT_SEARCH('database', 'en', workspaces => 'blog')
WHERE PATH_STARTS_WITH(path, '/posts/')
ORDER BY score DESC;
```

The second argument is the ISO 639-1 language code and `workspaces` is
required. See [Full-Text Search](./full-text-search.md).

## Vector similarity

```sql
SELECT path, vector_distance
FROM KNN('how do vector indexes work', 10, workspaces => 'blog');

-- with filters
SELECT path, vector_distance
FROM KNN('sustainable packaging', 20, workspaces => 'blog')
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
LIMIT 10;
```

The first argument is the query text (a literal vector or
`VECTOR_OF('blog:/path')` also work), the second is k, and `workspaces` is
required. `KNN` and `HYBRID_SEARCH` need an embedding configuration for the
tenant; without one they fail with a message saying so.

## Pagination

Recipes only; [Pagination](./pagination.md) explains how to choose a cursor.

### Offset

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

### Keyset on a timestamp

```sql
-- $1 = created_at of the last row on the previous page
SELECT path, created_at FROM 'blog'
WHERE node_type = 'raisin:Page' AND created_at < $1
ORDER BY created_at DESC
LIMIT 20;
```

### Keyset on the path

```sql
-- children of /posts, 20 at a time; $1 = last path of the previous page
SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND path > $1
ORDER BY path
LIMIT 20;
```

### Previous and next node

```sql
-- next sibling of /posts/post-3 in path order
SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND path > '/posts/post-3'
ORDER BY path ASC LIMIT 1;

-- previous sibling
SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND path < '/posts/post-3'
ORDER BY path DESC LIMIT 1;
```

For "older / newer post" links, cursor on the publish date instead:

```sql
-- $1 = the current article's published_at
SELECT path FROM 'blog'
WHERE DESCENDANT_OF('/posts') AND properties->>'published_at'::String > $1
ORDER BY properties->>'published_at'::String ASC LIMIT 1;
```

### Editorial (drag-and-drop) order

Every parent keeps a manual order for its children, the one editors set by
dragging in the console. Two columns expose it and both work as cursors:

| Column | Orders a node | Use for |
|---|---|---|
| `__order` | among its siblings | paging one parent's children |
| `__tree_order` | within a subtree, in document order | paging a whole tree |

```sql
-- page 1
SELECT name, __order FROM 'blog'
WHERE CHILD_OF('/menu')
ORDER BY __order
LIMIT 20;

-- page 2: $1 = the __order value of the last row from page 1
SELECT name, __order FROM 'blog'
WHERE CHILD_OF('/menu') AND __order > $1
ORDER BY __order
LIMIT 20;

-- a whole tree in document order
SELECT path, __tree_order FROM 'blog'
WHERE DESCENDANT_OF('/menu') AND __tree_order > $1
ORDER BY __tree_order
LIMIT 20;
```

The values are opaque tokens such as `8180::1a07802e4f60000000000000000`.
Pass them back as bound parameters exactly as received.

`path` sorts siblings alphabetically; `__order` sorts them editorially. They
agree only while the manual order happens to be alphabetical, so page a menu
on `__order`. The cursor column and the `ORDER BY` column must be the same
column, otherwise rows are skipped or repeated.

Changing the order is a node operation, not a property edit. From the
JavaScript client:

```typescript
const nodes = client.database('myrepo').workspace('blog').nodes();
await nodes.reorder('/menu', 'about', 0);              // move to the front
await nodes.moveChildBefore('/menu', 'about', 'home');
await nodes.moveChildAfter('/menu', 'about', 'contact');
```

The server assigns the key, so inserting between two siblings never renumbers
anything and concurrent reorders don't collide. There is no need to maintain a
`sort_order` property by hand.

## Aggregation by property

```sql
SELECT properties->>'category' AS category, COUNT(*) AS n
FROM 'blog'
WHERE node_type = 'raisin:Page'
GROUP BY properties->>'category'
ORDER BY n DESC;
```

## Small utilities

### Does a node exist?

```sql
SELECT COUNT(*) AS n FROM 'blog' WHERE path = '/posts/hello-world';
```

### Nodes missing a property

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
  AND properties->>'featured_image' IS NULL;
```

### Recently updated nodes

```sql
SELECT path, node_type, updated_at
FROM 'blog'
WHERE updated_at > '2026-03-01T00:00:00Z'
ORDER BY updated_at DESC
LIMIT 50;
```

## Next Steps

- [Time-Travel Queries](./time-travel-queries.md)
- [Filtering Data](./filtering-data.md)
- [Graph Queries](./graph-queries.md)
- [Full-Text Search](./full-text-search.md)
