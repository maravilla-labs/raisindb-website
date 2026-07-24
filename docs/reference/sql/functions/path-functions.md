---
sidebar_position: 3
---

# Path Functions

Functions for hierarchical path manipulation and querying.

## DEPTH

Calculate the depth of a hierarchical path.

### Syntax

```sql
DEPTH(path) → INT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Hierarchical path |

### Return Value

INT - Number of path segments (depth in hierarchy).

### Examples

```sql
SELECT DEPTH('/content');
-- Result: 1

SELECT DEPTH('/content/blog/post1');
-- Result: 3

SELECT DEPTH('/');
-- Result: 0

SELECT
    __path,
    DEPTH(__path) AS depth
FROM nodes
ORDER BY depth;

-- Find all nodes at specific depth
SELECT * FROM nodes
WHERE DEPTH(__path) = 2;
```

### Notes

- Root path `/` has depth 0
- Each segment adds 1 to depth
- Useful for hierarchy level queries

---

## PARENT

Get the parent path, optionally going up multiple levels.

### Syntax

```sql
PARENT(path [, levels]) → PATH
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Child path |
| levels | INT | Optional. Number of levels up (default: 1) |

### Return Value

PATH - Parent path, or NULL if at root.

### Examples

```sql
SELECT PARENT('/content/blog/post1');
-- Result: '/content/blog'

SELECT PARENT('/content/blog/post1', 2);
-- Result: '/content'

SELECT PARENT('/content/blog/post1', 3);
-- Result: '/'

SELECT PARENT('/', 1);
-- Result: NULL

SELECT
    __path,
    PARENT(__path) AS parent_path,
    PARENT(__path, 2) AS grandparent_path
FROM nodes;

-- Group by parent
SELECT
    PARENT(__path) AS parent,
    COUNT(*) AS child_count
FROM nodes
GROUP BY PARENT(__path);
```

### Notes

- Returns NULL if going above root
- Default is 1 level up
- Negative levels not allowed

---

## ANCESTOR

Get ancestor at a specific absolute depth from root.

### Syntax

```sql
ANCESTOR(path, depth) → PATH
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Descendant path |
| depth | INT | Absolute depth from root (0 = root) |

### Return Value

PATH - Ancestor path at specified depth, or NULL if path is shallower.

### Examples

```sql
SELECT ANCESTOR('/content/blog/posts/2024/post1', 0);
-- Result: '/'

SELECT ANCESTOR('/content/blog/posts/2024/post1', 1);
-- Result: '/content'

SELECT ANCESTOR('/content/blog/posts/2024/post1', 2);
-- Result: '/content/blog'

SELECT ANCESTOR('/content/blog', 3);
-- Result: NULL (path not deep enough)

SELECT
    __path,
    ANCESTOR(__path, 1) AS section,
    ANCESTOR(__path, 2) AS subsection
FROM nodes
WHERE DEPTH(__path) >= 2;

-- Group by top-level section
SELECT
    ANCESTOR(__path, 1) AS section,
    COUNT(*) AS total_nodes
FROM nodes
WHERE DEPTH(__path) > 0
GROUP BY section;
```

### Notes

- Depth 0 always returns root `/`
- Returns NULL if path is shallower than requested depth
- Useful for grouping by hierarchy level

---

## PATH_STARTS_WITH

Check if a path starts with a given prefix.

### Syntax

```sql
PATH_STARTS_WITH(path, prefix) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Path to check |
| prefix | PATH | Prefix to match |

### Return Value

BOOLEAN - true if path starts with prefix, false otherwise.

### Examples

```sql
SELECT PATH_STARTS_WITH('/content/blog/post1', '/content');
-- Result: true

SELECT PATH_STARTS_WITH('/content/blog/post1', '/content/blog');
-- Result: true

SELECT PATH_STARTS_WITH('/content/blog/post1', '/docs');
-- Result: false

SELECT PATH_STARTS_WITH('/content', '/content');
-- Result: true (exact match)

SELECT * FROM nodes
WHERE PATH_STARTS_WITH(__path, '/content/blog');

-- Find all content under multiple sections
SELECT * FROM nodes
WHERE PATH_STARTS_WITH(__path, '/content/docs')
   OR PATH_STARTS_WITH(__path, '/content/guides');
```

### Notes

- Exact match returns true
- Prefix must be complete path segments
- Case-sensitive comparison

---

## CHILD_OF

Check if a path is a direct child of a parent path.

### Syntax

```sql
CHILD_OF(path, parent) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Child path to check |
| parent | PATH | Parent path |

### Return Value

BOOLEAN - true if path is a direct child of parent, false otherwise.

### Examples

```sql
SELECT CHILD_OF('/content/blog', '/content');
-- Result: true

SELECT CHILD_OF('/content/blog/post1', '/content');
-- Result: false (grandchild, not direct child)

SELECT CHILD_OF('/content/blog/post1', '/content/blog');
-- Result: true

-- Find direct children of a path
SELECT * FROM nodes
WHERE CHILD_OF(__path, '/content/docs');

-- Count direct children
SELECT
    PARENT(__path) AS parent,
    COUNT(*) AS direct_children
FROM nodes
WHERE CHILD_OF(__path, '/content')
GROUP BY PARENT(__path);
```

### Notes

- Only direct children return true
- Grandchildren and deeper descendants return false
- Use DESCENDANT_OF for any depth

---

## DESCENDANT_OF

Check if a path is a descendant of an ancestor path.

### Syntax

```sql
DESCENDANT_OF(path, ancestor [, max_depth]) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| path | PATH | Descendant path to check |
| ancestor | PATH | Ancestor path |
| max_depth | INT | Optional. Maximum depth difference |

### Return Value

BOOLEAN - true if path is a descendant of ancestor, false otherwise.

### Examples

```sql
SELECT DESCENDANT_OF('/content/blog/posts/post1', '/content');
-- Result: true

SELECT DESCENDANT_OF('/content/blog', '/content');
-- Result: true

SELECT DESCENDANT_OF('/content', '/content');
-- Result: false (not a descendant of itself)

SELECT DESCENDANT_OF('/docs', '/content');
-- Result: false

-- With max depth
SELECT DESCENDANT_OF('/content/blog/posts/post1', '/content', 2);
-- Result: true (depth difference is 3, within max of 2? false if strict)

-- Find all descendants
SELECT * FROM nodes
WHERE DESCENDANT_OF(__path, '/content/blog');

-- Find descendants within 2 levels
SELECT * FROM nodes
WHERE DESCENDANT_OF(__path, '/content', 2);

-- Exclude direct children
SELECT * FROM nodes
WHERE DESCENDANT_OF(__path, '/content')
  AND NOT CHILD_OF(__path, '/content');
```

### Notes

- Does not include the path itself
- Use PATH_STARTS_WITH to include the path itself
- Optional max_depth limits descendant depth
- Useful for subtree queries

---

## REFERENCES

Find nodes whose `reference`-type properties point at a target node. Uses the
reverse reference index, so it stays fast regardless of table size and keeps
working after the target node is moved (the index is keyed by the target's
stable id).

### Syntax

```sql
REFERENCES('workspace:/path') → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| target | TEXT | Target in **`workspace:/path`** format. The workspace prefix is required — a bare path is rejected with a validation error, because paths are only unique within a workspace. |

### Return Value

BOOLEAN - true if the current node holds a reference to the target.

### Examples

```sql
-- Find all nodes referencing a product (same workspace)
SELECT * FROM 'default'
WHERE REFERENCES('default:/content/products/widget1');

-- Cross-workspace: stories referencing a tag that lives in the tags workspace
SELECT id, path, name FROM 'stories'
WHERE REFERENCES('tags:/university/data');

-- Composes with other predicates: hierarchy scoping, node_type, ORDER BY, LIMIT
SELECT id, path, name FROM 'stories'
WHERE REFERENCES('tags:/university/data')
  AND DESCENDANT_OF('/university')
  AND node_type = 'studio:Page'
ORDER BY properties->>'published_at'::String DESC
LIMIT 20;

-- Fully parameterized (recommended — no string interpolation needed)
-- $1 = 'tags:/university/data'
SELECT * FROM 'stories' WHERE REFERENCES($1);
```

### Notes

- The argument must be `'workspace:/path'` — the workspace prefix is mandatory.
- Backed by the reverse reference index; the planner selects a
  `ReferenceIndexScan`, so the query reads only the referrers.
- Composes with `DESCENDANT_OF` / `CHILD_OF` / `node_type` / property
  predicates and `COUNT(*)`: REFERENCES drives the scan and the other
  predicates filter the (small) result set.
- Survives target moves: the reference is resolved by the target's stable id,
  not the stored path string.

---

## NEIGHBORS

Table-valued function returning nodes connected to a start node by graph
relations (created with `RELATE`).

### Syntax

```sql
NEIGHBORS(start, direction, relation_type) → TABLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| start | TEXT | Node id, path, or **`workspace:/path`** to disambiguate across workspaces |
| direction | TEXT | `'OUT'` (outgoing), `'IN'` (incoming), or `'BOTH'` |
| relation_type | TEXT | Relation type filter, or `NULL` / `''` for all types |

### Return Value

TABLE - the neighboring nodes (full node columns) plus `relation_type` and
`weight` columns describing the connecting edge.

### Examples

```sql
-- All outgoing neighbors of a node (any relation type)
SELECT n.path, n.relation_type
FROM NEIGHBORS('/content/home', 'OUT', NULL) AS n;

-- Incoming 'tagged-with' edges: everything tagged with this tag.
-- The workspace prefix resolves the path in the tag's own workspace.
SELECT n.id, n.path, n.name
FROM NEIGHBORS('tags:/university/data', 'IN', 'tagged-with') AS n;

-- Both directions
SELECT * FROM NEIGHBORS('/content/hub', 'BOTH', NULL);
```

### Notes

- `start` accepts a node id or a path; a path without a workspace prefix is
  resolved in the query's default workspace — use `'workspace:/path'` when the
  start node lives elsewhere.
- Direction values are `'OUT'`, `'IN'`, `'BOTH'` (case-insensitive).
- Returns an empty set if the node has no relations in the given direction.
- For multi-hop patterns or ordering/filtering on neighbor properties,
  prefer `GRAPH_TABLE`.

---

## Examples

### Hierarchy Depth Query

```sql
-- Show hierarchy structure with indentation
SELECT
    DEPTH(__path) AS depth,
    REPEAT('  ', DEPTH(__path)) || title AS indented_title,
    __path
FROM nodes
WHERE PATH_STARTS_WITH(__path, '/content')
ORDER BY __path;
```

### Find Siblings

```sql
-- Find all siblings of a specific node
SELECT * FROM nodes
WHERE PARENT(__path) = PARENT('/content/blog/post1')
  AND __path != '/content/blog/post1';
```

### Breadcrumb Generation

```sql
-- Generate breadcrumb trail
SELECT
    ANCESTOR(__path, 1) AS level1,
    ANCESTOR(__path, 2) AS level2,
    ANCESTOR(__path, 3) AS level3,
    __path AS current
FROM nodes
WHERE __path = '/content/docs/guides/sql/intro';
```

### Section Statistics

```sql
-- Count nodes by top-level section
SELECT
    ANCESTOR(__path, 1) AS section,
    COUNT(*) AS node_count,
    AVG(DEPTH(__path)) AS avg_depth
FROM nodes
WHERE DEPTH(__path) > 0
GROUP BY section
ORDER BY node_count DESC;
```

### Subtree Query

```sql
-- Get all nodes in a subtree with depth limit
SELECT
    __path,
    title,
    DEPTH(__path) - DEPTH('/content/docs') AS relative_depth
FROM nodes
WHERE DESCENDANT_OF(__path, '/content/docs', 3)
   OR __path = '/content/docs'
ORDER BY __path;
```

### Parent-Child Join

```sql
-- Join parents with their children
SELECT
    p.__path AS parent_path,
    p.title AS parent_title,
    c.__path AS child_path,
    c.title AS child_title
FROM nodes p
JOIN nodes c ON CHILD_OF(c.__path, p.__path)
WHERE p.__path = '/content/blog';
```

### Find Orphans

```sql
-- Find nodes without valid parents
SELECT * FROM nodes n1
WHERE NOT EXISTS (
    SELECT 1 FROM nodes n2
    WHERE n2.__path = PARENT(n1.__path)
)
AND __path != '/';
```

### Hierarchy Level Grouping

```sql
-- Group by hierarchy level
SELECT
    CASE DEPTH(__path)
        WHEN 1 THEN 'Top Level'
        WHEN 2 THEN 'Second Level'
        WHEN 3 THEN 'Third Level'
        ELSE 'Deep'
    END AS level,
    COUNT(*) AS count
FROM nodes
GROUP BY level
ORDER BY MIN(DEPTH(__path));
```
