---
sidebar_position: 1
---

# Graph Queries (GRAPH_TABLE)

RaisinDB supports SQL/PGQ (Property Graph Queries), part of the SQL:2023 standard, for graph pattern matching within SQL queries.

## Overview

SQL/PGQ extends SQL with graph pattern matching capabilities using the GRAPH_TABLE syntax. It allows you to query graph structures using SQL while leveraging familiar SQL constructs.

## GRAPH_TABLE Syntax

The GRAPH_TABLE function creates a table from graph pattern matching.

### Basic Syntax

```sql
SELECT *
FROM GRAPH_TABLE (
    MATCH pattern
    COLUMNS ( column_list )
)
```

## Pattern Matching

### Node Patterns

Match nodes in the graph:

```sql
-- Match all nodes
SELECT *
FROM GRAPH_TABLE (
    MATCH (n)
    COLUMNS (n.title, n.status)
);

-- Match nodes with label (node type)
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (n.title, n.view_count)
);

-- Match with inline WHERE filter
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page WHERE n.status = 'published')
    COLUMNS (n.title, n.created_at)
);
```

### Multi-Label Node Patterns

Match nodes with any of several labels:

```sql
-- Match nodes that are User OR Admin
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:User|Admin)
    COLUMNS (n.name, n.email)
);

-- Multi-label with inline filter
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page|Article WHERE n.status = 'published')
    COLUMNS (n.title, n.__node_type)
);
```

### Relationship Patterns

Match relationships between nodes:

```sql
-- Simple relationship
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)
    COLUMNS (a.title AS source, b.title AS target)
);

-- Relationship with properties
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[r:LINKS_TO WHERE r.weight > 0.5]->(b)
    COLUMNS (a.title, r.weight, b.title)
);

-- Undirected relationship
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:RELATED_TO]-(b)
    COLUMNS (a.title, b.title)
);
```

### Path Patterns

Match paths through the graph:

```sql
-- Fixed length path
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b)-[:LINKS_TO]->(c)
    COLUMNS (a.title AS start, c.title AS end)
);

-- Variable length path
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO*1..3]->(b:Page)
    COLUMNS (a.title, b.title)
);
```

### Path Quantifiers

Control the length of variable-length paths:

| Quantifier | Description |
|------------|-------------|
| `*` | Any number of hops (0 or more) |
| `*n` | Exactly n hops |
| `*n..m` | Between n and m hops (inclusive) |
| `*n..` | At least n hops |
| `*..m` | At most m hops |

```sql
-- Any number of hops
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:LINKS_TO*]->(b)
    COLUMNS (a.title, b.title)
);

-- Exactly 2 hops
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:LINKS_TO*2]->(b)
    COLUMNS (a.title AS start, b.title AS end)
);

-- Between 1 and 3 hops
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:LINKS_TO*1..3]->(b)
    COLUMNS (a.title, b.title)
);

-- At least 2 hops
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:LINKS_TO*2..]->(b)
    COLUMNS (a.title, b.title)
);

-- At most 3 hops
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[:LINKS_TO*..3]->(b)
    COLUMNS (a.title, b.title)
);
```

## Properties in GRAPH_TABLE

Within GRAPH_TABLE COLUMNS, node properties are accessed **by name directly** (e.g., `n.title`, `n.status`). The GRAPH_TABLE abstraction automatically maps these to the underlying `properties` JSONB column. This is different from regular SQL queries where you must use `properties->>'title'`.

```sql
-- GRAPH_TABLE: access properties by name
SELECT * FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (n.title, n.status)  -- direct property access
);

-- Regular SQL: use JSONB operators
SELECT properties->>'title', properties->>'status' FROM default;
```

## System Fields

Nodes in the graph have system fields available in COLUMNS:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Node UUID (same as `__id`) |
| `workspace` | TEXT | Workspace the node belongs to |
| `node_type` | TEXT | Node type name |
| `path` | PATH | Hierarchical path |
| `name` | TEXT | Node name (path segment) |
| `parent_id` | UUID | Parent node ID |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification timestamp |

All other fields on nodes are stored as JSONB properties and accessed by name.

```sql
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (
        n.id,
        n.workspace,
        n.node_type,
        n.path,
        n.name,
        n.title,         -- JSONB property
        n.view_count      -- JSONB property
    )
);
```

## WHERE Clause

Filter graph patterns:

```sql
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)
    WHERE a.status = 'published' AND b.view_count > 100
    COLUMNS (a.title, b.title, b.view_count)
);
```

## COLUMNS Clause

Specify which properties to return:

```sql
-- Select node properties
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (
        n.title AS page_title,
        n.status,
        n.view_count
    )
);

-- Select relationship properties
SELECT *
FROM GRAPH_TABLE (
    MATCH (a)-[r:LINKS_TO]->(b)
    COLUMNS (
        a.title AS source,
        r.weight AS link_weight,
        r.created_at AS linked_at,
        b.title AS target
    )
);

-- Select with expressions
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (
        n.title,
        n.view_count * 2 AS doubled_views,
        UPPER(n.status) AS status_upper
    )
);
```

## Aggregate Functions in GRAPH_TABLE

The following aggregate functions are available inside GRAPH_TABLE COLUMNS:

- `COUNT(expression)` - Count matching elements
- `COLLECT(expression)` - Collect values into an array

```sql
-- Count relationships per node
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)
    COLUMNS (
        a.title,
        COUNT(b) AS link_count,
        COLLECT(b.title) AS linked_pages
    )
);
```

## Combining with SQL

Graph patterns integrate seamlessly with SQL:

```sql
-- Join with regular tables
SELECT
    g.page_title,
    g.linked_page,
    c.category_name
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)
    COLUMNS (a.title AS page_title, b.title AS linked_page, b.category_id)
) g
JOIN categories c ON g.category_id = c.__id;

-- Filter results with WHERE
SELECT *
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (n.title, n.view_count)
) AS pages
WHERE view_count > 1000
ORDER BY view_count DESC;

-- Aggregate results
SELECT
    status,
    COUNT(*) AS page_count,
    AVG(view_count) AS avg_views
FROM GRAPH_TABLE (
    MATCH (n:Page)
    COLUMNS (n.status, n.view_count)
) AS pages
GROUP BY status;
```

## Multiple Patterns

Match multiple patterns in one query:

```sql
-- Two separate patterns
SELECT *
FROM GRAPH_TABLE (
    MATCH
        (a:Page)-[:LINKS_TO]->(b:Page),
        (b)-[:LINKS_TO]->(c:Page)
    COLUMNS (a.title, b.title, c.title)
);

-- Chain patterns
SELECT *
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)-[:LINKS_TO]->(c:Page)
    WHERE a.id <> c.id
    COLUMNS (a.title AS start, b.title AS middle, c.title AS end)
);
```

## Complete Examples

### Find Related Pages

```sql
-- Pages linked from a specific page
SELECT
    linked_title,
    view_count
FROM GRAPH_TABLE (
    MATCH (start:Page WHERE start.title = 'Home')-[:LINKS_TO]->(linked:Page)
    COLUMNS (linked.title AS linked_title, linked.view_count AS view_count)
) AS results
ORDER BY view_count DESC;
```

### Two-Hop Connections

```sql
-- Pages reachable in 2 hops
SELECT DISTINCT end_title
FROM GRAPH_TABLE (
    MATCH (start:Page WHERE start.title = 'Home')-[:LINKS_TO*2]->(end:Page)
    WHERE start.id <> end.id
    COLUMNS (end.title AS end_title)
) AS results;
```

### Link Count Analysis

```sql
-- Count incoming links per page
SELECT
    page_title,
    COUNT(*) AS incoming_links
FROM GRAPH_TABLE (
    MATCH (source:Page)-[:LINKS_TO]->(target:Page)
    COLUMNS (target.title AS page_title)
) AS links
GROUP BY page_title
ORDER BY incoming_links DESC
LIMIT 10;
```

### Path Analysis

```sql
-- Analyze paths between pages
SELECT
    start_page,
    end_page,
    COUNT(*) AS path_count
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO*1..3]->(b:Page)
    COLUMNS (a.title AS start_page, b.title AS end_page)
) AS paths
GROUP BY start_page, end_page
ORDER BY path_count DESC;
```

### Category Network

```sql
-- Links between different categories
SELECT
    from_cat,
    to_cat,
    COUNT(*) AS link_count
FROM GRAPH_TABLE (
    MATCH (a:Page)-[:LINKS_TO]->(b:Page)
    WHERE a.category <> b.category
    COLUMNS (a.category AS from_cat, b.category AS to_cat)
) AS cross_links
GROUP BY from_cat, to_cat
ORDER BY link_count DESC;
```

### Hub Detection

```sql
-- Pages with many outgoing links
SELECT
    page_title,
    COUNT(*) AS outgoing_links
FROM GRAPH_TABLE (
    MATCH (hub:Page)-[:LINKS_TO]->(target:Page)
    COLUMNS (hub.title AS page_title)
) AS hubs
GROUP BY page_title
HAVING COUNT(*) >= 10
ORDER BY outgoing_links DESC;
```

### Influence Metric

```sql
-- Calculate influence (pages reached in 3 hops)
SELECT
    source_page,
    COUNT(DISTINCT target_page) AS influence_count
FROM GRAPH_TABLE (
    MATCH (source:Page)-[:LINKS_TO*1..3]->(target:Page)
    COLUMNS (source.title AS source_page, target.title AS target_page)
) AS influence
GROUP BY source_page
ORDER BY influence_count DESC
LIMIT 20;
```

### Multi-Label Query

```sql
-- Find users or admins connected to projects
SELECT *
FROM GRAPH_TABLE (
    MATCH (person:User|Admin)-[:MEMBER_OF]->(project:Project)
    COLUMNS (
        person.name,
        person.node_type AS role,
        project.name AS project_name
    )
);
```

---

## Notes

- SQL/PGQ is part of the SQL:2023 standard
- Graph patterns are compiled to efficient execution plans
- Can combine graph patterns with regular SQL operations
- Variable-length paths may be expensive on large graphs
- Use WHERE clauses to limit pattern matching scope
- COLUMNS clause determines the result schema
- Graph patterns support same data types as regular SQL
- Patterns are matched exhaustively (all possible matches)
- Use DISTINCT to remove duplicate paths
- System fields (id, workspace, node_type, path, name, parent_id, created_at, updated_at) are always available on nodes
- User-defined properties are stored in JSONB and accessed by name in COLUMNS
- For graph algorithms (PageRank, community detection, shortest paths), see [Graph Algorithm Functions](/docs/reference/sql/functions/graph-algorithms)
