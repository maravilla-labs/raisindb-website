---
sidebar_position: 1
---

# SQL Basics

RaisinDB speaks SQL. Each **workspace is a table**, every node is a row, and a
node's properties are a JSON column you can filter, sort and aggregate on.

## Running a query

Send SQL to the HTTP endpoint of a repository. The optional `params` array binds
`$1`, `$2`, and so on.

```bash
curl -X POST http://localhost:8090/api/sql/myrepo \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT path, name FROM '"'"'blog'"'"' WHERE node_type = $1 LIMIT 2",
       "params": ["raisin:Page"]}'
```

```json
{"columns":["path","name"],"rows":[{"path":"/about","name":"about"},{"path":"/posts/post-1","name":"post-1"}],"row_count":2,"execution_time_ms":3}
```

`POST /api/sql/{repo}` queries the repository's default branch; `POST
/api/sql/{repo}/{branch}` targets another branch. The same statements run over
the JavaScript client and over `psql` through the PostgreSQL wire protocol.

```typescript
const db = client.database('myrepo');
const result = await db.executeSql(
  "SELECT path FROM 'blog' WHERE node_type = $1 LIMIT $2",
  ['raisin:Page', 2],
);
// result: { columns: ['path'], rows: [{ path: '/about' }, ...], row_count: 2 }

// Tagged template form: interpolated values become bound parameters
const count = await db.sql`SELECT COUNT(*) AS n FROM 'blog' WHERE node_type = ${'raisin:Page'}`;
```

## The workspace table

Quote the workspace name and use it as the table:

```sql
SELECT * FROM 'blog' LIMIT 10;
```

Every row carries these columns:

| Column | Type | Description |
|---|---|---|
| `id` | TEXT | Node identifier |
| `path` | PATH | Hierarchical location, for example `/posts/post-1` |
| `name` | TEXT | Last path segment |
| `node_type` | TEXT | NodeType name, for example `raisin:Page` |
| `archetype` | TEXT | Archetype name, if any |
| `properties` | JSONB | The node's properties |
| `parent_name` | TEXT | Name of the parent node |
| `depth` | INT | Number of path segments (`/posts/post-1` is 2) |
| `created_at`, `updated_at` | TIMESTAMPTZ | Write timestamps |
| `created_by`, `updated_by` | TEXT | Actor that wrote the node |
| `published_at`, `published_by` | TIMESTAMPTZ, TEXT | Set when the node is published |
| `translations` | JSONB | Per-locale property overrides |
| `owner_id` | TEXT | Owner used by row-level security |
| `__order`, `__tree_order` | TEXT | Editorial ordering keys, see [Pagination](./pagination.md) |
| `__revision`, `__branch` | | Time-travel and branch selectors, see [Time-Travel Queries](./time-travel-queries.md) |

`SELECT *` returns all of them. Selecting only the columns you need keeps
responses small.

## Filtering rows

```sql
-- by type
SELECT path FROM 'blog' WHERE node_type = 'raisin:Page';

-- by exact path
SELECT * FROM 'blog' WHERE path = '/posts/post-1';

-- children of a folder
SELECT path FROM 'blog' WHERE CHILD_OF('/posts');

-- everything under a folder, any depth
SELECT path FROM 'blog' WHERE DESCENDANT_OF('/posts');
```

`CHILD_OF` and `DESCENDANT_OF` become prefix scans over the path index. See
[Filtering Data](./filtering-data.md) for the full set of predicates.

## Working with properties

Read a property with `->>`. It always yields **text**, whatever the JSON type.

```sql
SELECT
  path,
  properties->>'title'  AS title,
  properties->>'status' AS status
FROM 'blog'
WHERE node_type = 'raisin:Page';
```

To filter on a property, cast the key to the type you want to compare against:

```sql
-- string
SELECT path FROM 'blog' WHERE properties->>'status'::String = 'published';

-- number
SELECT path FROM 'blog' WHERE properties->>'views'::Integer > 300;

-- boolean
SELECT path FROM 'blog' WHERE properties->>'featured'::Boolean = true;

-- ISO 8601 date strings compare correctly as text
SELECT path FROM 'blog' WHERE properties->>'published_at'::String > '2026-02-15';

-- relative to now: NOW() / CURRENT_TIMESTAMP and INTERVAL arithmetic
SELECT path FROM 'blog' WHERE properties->>'published_at'::String < NOW() - INTERVAL '30 days';

-- regex: ~ / ~* / !~ / !~* / SIMILAR TO — see filtering-data.md for the full set
SELECT path FROM 'blog' WHERE properties->>'slug'::String ~ '^[a-z0-9-]+$';
```

Cast names are `String`, `Integer` (or `int`), `Boolean`, `Double` and
`timestamp`. The cast goes on the **key**, not on a parenthesised result:
`properties->>'views'::Integer`, not `(properties->>'views')::numeric`.

:::note Two forms of a property filter
`properties->>'status' = 'published'` (no cast) and
`properties->>'status'::String = 'published'` (cast) both use the same index
when one is available — the cast form is no longer slower. Always use the
cast form: it is guaranteed correct, including for `LIKE`, range comparisons,
and when combined with other predicates, with no performance trade-off.
:::

A missing property reads as `NULL`:

```sql
SELECT path FROM 'blog' WHERE properties->>'views' IS NULL;
```

## Sorting and limiting

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
ORDER BY properties->>'views'::Integer DESC
LIMIT 20 OFFSET 0;

SELECT path FROM 'blog'
ORDER BY properties->>'status' DESC, created_at DESC;
```

A column you sort by but did not select is added to the result so the client
can see the sort key. Sorting by `properties->>'views'` adds the whole
`properties` column.

## Aggregations

`COUNT`, `SUM`, `AVG`, `MIN`, `MAX` and `ARRAY_AGG` are available, with
`GROUP BY` and `DISTINCT`:

```sql
SELECT COUNT(*) AS total FROM 'blog' WHERE node_type = 'raisin:Page';

SELECT properties->>'status' AS status, COUNT(*) AS n
FROM 'blog'
WHERE node_type = 'raisin:Page'
GROUP BY properties->>'status'
ORDER BY n DESC;

SELECT AVG(properties->>'rating'::Double) AS avg_rating,
       MAX(properties->>'views'::Integer) AS most_viewed
FROM 'blog';

SELECT DISTINCT properties->>'category' AS category FROM 'blog';
```

`HAVING` filters the groups after they are folded, so it can test an aggregate
the way `WHERE` tests a row:

```sql
SELECT properties->>'category' AS category, COUNT(*) AS n
FROM 'blog'
WHERE node_type = 'raisin:Page'
GROUP BY properties->>'category'
HAVING COUNT(*) > 1;
```

```json
{"category":"news","n":2}
```

## Arrays and JSON containment

```sql
-- array property contains a value
SELECT path FROM 'blog' WHERE properties->'tags' @> '["tech"]'::jsonb;

-- object containment: every listed key/value must match
SELECT path FROM 'blog' WHERE properties @> '{"status": "draft"}'::jsonb;

-- key present at all
SELECT path FROM 'blog' WHERE JSON_EXISTS(properties, '$.featured');
```

Other JSON helpers: `JSON_VALUE(properties, '$.title')`,
`JSON_GET_INT(properties, 'views')`, `JSON_GET_TEXT`, `JSON_GET_BOOL`,
`JSON_GET_DOUBLE`, and `JSONB_SET(properties, '{status}', 'archived')` for
updating one key in place.

## Joins and subqueries

Join a workspace to itself, or to another workspace, on any expression:

```sql
-- posts in the same category as post-1
SELECT b.path
FROM 'blog' a
JOIN 'blog' b ON a.properties->>'category' = b.properties->>'category'
WHERE a.path = '/posts/post-1' AND b.path != a.path;

-- IN with a subquery
SELECT path FROM 'blog'
WHERE properties->>'category' IN (
  SELECT properties->>'category' FROM 'blog'
  WHERE properties->>'featured'::Boolean = true
);
```

A subquery that returns a single row and a single column can be used as a value,
in the select list or in a comparison:

```sql
-- the most-viewed page
SELECT name FROM 'blog'
WHERE (properties->>'views')::INT = (SELECT MAX((properties->>'views')::INT) FROM 'blog');
```

`EXISTS` tests whether a subquery returns any row at all, and `ANY` / `ALL`
compare a value against every row a subquery returns:

```sql
SELECT name FROM 'blog'
WHERE path = ANY (SELECT PARENT(path) FROM 'blog');
-- rows: news

SELECT name FROM 'blog' WHERE name <> ALL (SELECT name FROM 'blog' WHERE depth = 2);
-- rows: hello, news
```

Subqueries stand on their own. A subquery cannot refer to a column of the query
that contains it; RaisinDB rejects that with `Correlated subqueries that
reference the outer query are not supported`. Write it as a join or an
`IN (SELECT ...)` instead.

## Common table expressions

```sql
WITH published AS (
  SELECT * FROM 'blog' WHERE properties->>'status'::String = 'published'
)
SELECT properties->>'category' AS category, COUNT(*) AS n
FROM published
GROUP BY properties->>'category'
ORDER BY n DESC;
```

## CASE

```sql
SELECT
  path,
  CASE
    WHEN properties->>'views'::Integer > 500 THEN 'popular'
    WHEN properties->>'views'::Integer > 200 THEN 'moderate'
    ELSE 'low'
  END AS popularity
FROM 'blog'
WHERE CHILD_OF('/posts');
```

## Window functions

`ROW_NUMBER`, `RANK` and `DENSE_RANK` support `OVER (PARTITION BY … ORDER BY …)`:

```sql
SELECT
  path,
  ROW_NUMBER() OVER (
    PARTITION BY properties->>'category'
    ORDER BY properties->>'views'::Integer DESC
  ) AS rank_in_category
FROM 'blog'
WHERE CHILD_OF('/posts');
```

## Scalar functions

`COALESCE`, `NULLIF`, `UPPER`, `LOWER`, `ROUND` and `NOW()` are available:

```sql
SELECT path, COALESCE(properties->>'views'::String, 'n/a') AS views, LOWER(name) AS slug
FROM 'blog';
```

## Full-text search

Full-text search is a table function, not a `LIKE` over the text:

```sql
SELECT path, score
FROM FULLTEXT_SEARCH('databases', 'en', workspaces => 'blog')
WHERE node_type = 'raisin:Page'
ORDER BY score DESC
LIMIT 10;
```

See [Full-Text Search](./full-text-search.md).

## Seeing the plan

`EXPLAIN` prints the physical plan so you can check which index a query uses:

```sql
EXPLAIN SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND properties->>'status'::String = 'published';
```

```
=== Physical Execution Plan ===
Project: 1 expressions
  Filter: 1 predicates
    PrefixScan: prefix=/posts/
```

Indexes are maintained automatically; there is no `CREATE INDEX` statement.
Every property gets an equality index, and NodeTypes can declare compound
indexes. See [Indexing](/docs/concepts/indexing).

## Next Steps

- [Filtering Data](./filtering-data.md) for the full predicate reference
- [Common Query Patterns](./common-query-patterns.md) for recipes
- [Full-Text Search](./full-text-search.md)
