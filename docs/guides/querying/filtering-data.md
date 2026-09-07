---
sidebar_position: 2
---

# Filtering Data

How to narrow a query to the nodes you want: by type, by place in the tree, by
property value, and by combinations of those. Filtering is done in SQL; the
JSON query endpoints at the end of this page cover the simple lookups that
don't need a statement.

All examples use a `blog` workspace with pages under `/posts`.

## By type and path

```sql
SELECT path FROM 'blog' WHERE node_type = 'raisin:Page';
SELECT * FROM 'blog' WHERE path = '/posts/post-1';
SELECT * FROM 'blog' WHERE id = $1;
```

Type and path equality are index lookups. `node_type IN ('a', 'b')` expands to
one index scan per value.

## By position in the hierarchy

| Predicate | Matches |
|---|---|
| `CHILD_OF('/posts')` | direct children of `/posts` |
| `DESCENDANT_OF('/posts')` | everything under `/posts`, any depth |
| `DESCENDANT_OF('/posts', 2)` | descendants up to two levels down |
| `PATH_STARTS_WITH(path, '/posts/')` | same as `DESCENDANT_OF('/posts')`, spelled as a prefix test |
| `PARENT(path) = '/posts'` | direct children, via the parent path |
| `DEPTH(path) = 1` or `depth = 1` | nodes at a given depth |

```sql
SELECT path FROM 'blog' WHERE CHILD_OF('/posts');

SELECT path FROM 'blog'
WHERE DESCENDANT_OF('/posts') AND properties->>'status'::String = 'published';

-- top-level nodes only
SELECT path FROM 'blog' WHERE depth = 1;
```

`PARENT(path, 2)` and `ANCESTOR(path, n)` return the path n levels up, and can
be selected as columns. `REFERENCES('blog:/about')` matches nodes whose
properties hold a reference to that node; the workspace prefix is required.

## By property value

`->>` reads a property as text. Cast the key to compare as another type:

```sql
-- equality
SELECT path FROM 'blog' WHERE properties->>'status'::String = 'published';

-- not equal (a node without the property also matches)
SELECT path FROM 'blog' WHERE properties->>'status'::String != 'draft';

-- numeric comparison
SELECT path FROM 'blog' WHERE properties->>'views'::Integer > 300;
SELECT path FROM 'blog' WHERE properties->>'views'::Integer BETWEEN 300 AND 600;

-- boolean
SELECT path FROM 'blog' WHERE properties->>'featured'::Boolean = true;

-- membership
SELECT path FROM 'blog' WHERE properties->>'status'::String IN ('draft', 'archived');
SELECT path FROM 'blog' WHERE properties->>'status'::String NOT IN ('draft');

-- date strings in ISO 8601 order correctly as text
SELECT path FROM 'blog' WHERE properties->>'published_at'::String > '2026-02-15';

-- relative to now: NOW() / CURRENT_TIMESTAMP and INTERVAL arithmetic work directly
SELECT path FROM 'blog' WHERE properties->>'published_at'::String < NOW() - INTERVAL '30 days';
SELECT path FROM 'blog' WHERE updated_at >= NOW() - INTERVAL '7 days';
```

`!=` and `NOT` treat a missing property as "not equal", so a row without
`status` is returned by `!= 'draft'`. Add `IS NOT NULL` if you only want rows
that have the property.

### Text matching

```sql
SELECT path FROM 'blog' WHERE properties->>'title'::String LIKE 'Post%';
SELECT path FROM 'blog' WHERE properties->>'title'::String ILIKE '%database%';
SELECT path FROM 'blog' WHERE name LIKE 'post-%';
```

Use the `::String` cast with `LIKE`; the uncast form is routed to the
equality index and does not evaluate patterns correctly. For word-level search
across many nodes use [full-text search](./full-text-search.md) instead of
`LIKE`.

Regex operators are supported too — `~` (match), `~*` (case-insensitive),
`!~` / `!~*` (negated), and `SIMILAR TO` (anchored SQL pattern):

```sql
SELECT path FROM 'blog' WHERE properties->>'phone'::String ~ '^\+1\d{10}$';
SELECT path FROM 'blog' WHERE properties->>'slug'::String !~ '[A-Z]';
SELECT path FROM 'blog' WHERE properties->>'title'::String SIMILAR TO 'Guide%';
```

### Missing and present

```sql
SELECT path FROM 'blog' WHERE properties->>'featured_image' IS NULL;
SELECT path FROM 'blog' WHERE properties->>'views'::String IS NOT NULL;
SELECT path FROM 'blog' WHERE JSON_EXISTS(properties, '$.featured');
```

### Arrays and nested objects

```sql
-- array contains a value
SELECT path FROM 'blog' WHERE properties->'tags' @> '["tech"]'::jsonb;

-- several key/value pairs at once
SELECT path FROM 'blog' WHERE properties @> '{"status": "published", "category": "tech"}'::jsonb;

-- nested value: step into the object with ->, read the leaf with ->>
SELECT path FROM 'blog' WHERE properties->'author'->>'name' = 'Jane';
SELECT path FROM 'blog' WHERE JSON_VALUE(properties, '$.author.name') = 'Jane';
```

`= ANY(...)` / `<> ALL(...)` compare a value against every element of an array:

```sql
SELECT path FROM 'blog' WHERE 'tech' = ANY(properties->'tags');
SELECT path FROM 'blog' WHERE node_type = ANY(ARRAY['blog:Post', 'blog:Page']);
```

## Combining predicates

`AND`, `OR`, `NOT` and parentheses work as usual:

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
  AND CHILD_OF('/posts')
  AND (properties->>'status'::String = 'published'
       OR properties->>'featured'::Boolean = true)
  AND NOT (properties->>'category'::String = 'archive');
```

The planner picks one index (path prefix, node type, property equality or a
compound index) as the access path and applies the remaining predicates as a
filter. `EXPLAIN` shows which one was chosen:

```sql
EXPLAIN SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND properties->>'status'::String = 'published';
-- PrefixScan: prefix=/posts/  with a Filter on top
```

## Bound parameters

Use `$1`, `$2`, … and pass values in `params`. Parameters work anywhere a
literal does, including `LIMIT`:

```sql
SELECT path FROM 'blog'
WHERE node_type = $1 AND properties->>'status'::String = $2
LIMIT $3;
```

```json
{"sql": "...", "params": ["raisin:Page", "published", 20]}
```

## JSON query endpoints

Two REST endpoints answer simple lookups without SQL. Both return a page
object:

```json
{"items": [ /* nodes */ ], "page": {"total": 6, "limit": 20, "offset": 0, "nextOffset": null}}
```

### Lookup by path, parent or type

`POST /api/repository/{repo}/{branch}/head/{workspace}/query` takes exactly one
of `path`, `parent` or `nodeType` (also accepted as `node_type`), plus
`limit` and `offset`. `parent` is the parent node's **id**, not its path.

```bash
curl -X POST http://localhost:8090/api/repository/myrepo/main/head/blog/query \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nodeType": "raisin:Page", "limit": 20}'
```

Results are sorted by path. Combining `parent` with `nodeType` filters the
parent's children by type; anything else needs SQL.

### Filter DSL

`POST /api/repository/{repo}/{branch}/head/{workspace}/query/dsl` accepts
`and` / `or` / `not` trees over the top-level fields `id`, `name`, `path`,
`node_type` and `parent`, with the operators `eq`, `ne`, `like`
(substring), `contains`, `in`, `exists`, `gt`, `lt`, `gte`, `lte`, plus
`order_by`, `limit` and `offset`:

```json
{
  "and": [
    { "node_type": { "eq": "raisin:Page" } },
    { "name": { "like": "ab" } }
  ],
  "order_by": { "path": "asc" },
  "limit": 5
}
```

The DSL evaluates only the workspace's **root-level** nodes and does not see
properties. For property filters, hierarchy predicates or anything below the
root, use SQL.

## Next Steps

- [Common Query Patterns](./common-query-patterns.md)
- [Pagination](./pagination.md)
- [Full-Text Search](./full-text-search.md)
