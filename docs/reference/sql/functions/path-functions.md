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

Check if a node has a reference to a target path.

### Syntax

```sql
REFERENCES(target_path) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| target_path | PATH | Path being referenced |

### Return Value

BOOLEAN - true if current node references target, false otherwise.

### Examples

```sql
-- Find all nodes referencing a specific path
SELECT * FROM nodes
WHERE REFERENCES('/content/products/widget1');

-- Find nodes with any references
SELECT
    __path,
    COUNT(*) AS reference_count
FROM nodes
WHERE REFERENCES(__path)
GROUP BY __path;

-- Find pages referencing a category
SELECT p.__path, p.title
FROM pages p
WHERE REFERENCES('/categories/tutorials');
```

### Notes

- Uses reverse reference index for performance
- Checks outgoing references from current node
- Useful for finding relationships

---

## NEIGHBORS

Get neighboring nodes connected by graph relationships.

### Syntax

```sql
NEIGHBORS(node_id, direction, relation_type) → TABLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| node_id | UUID | ID of the source node |
| direction | TEXT | Direction: `'outgoing'`, `'incoming'`, or `'both'` |
| relation_type | TEXT | Optional. Filter by relationship type |

### Return Value

TABLE - Set of neighboring node IDs and relationship metadata.

### Examples

```sql
-- Find all outgoing neighbors
SELECT * FROM NEIGHBORS(__id, 'outgoing')
FROM pages
WHERE __path = '/content/home';

-- Find incoming relationships of a specific type
SELECT * FROM NEIGHBORS(__id, 'incoming', 'links_to')
FROM pages
WHERE title = 'About';

-- Find all connected nodes (both directions)
SELECT * FROM NEIGHBORS(__id, 'both')
FROM pages
WHERE __path = '/content/hub';
```

### Notes

- Returns an empty set if the node has no relationships in the given direction
- When `relation_type` is omitted, returns neighbors for all relationship types
- Uses the graph index for efficient lookups

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
