---
sidebar_position: 1
---

# SQL Interface Overview

RaisinDB provides a SQL interface for querying and manipulating data stored in the hierarchical document database. The SQL implementation extends standard SQL with specialized features for hierarchical paths, graph queries, JSON documents, vector search, and version control.

:::info Workspace = Table Name
In RaisinDB, the **workspace name** is used as the table name in SQL queries. When you write `SELECT * FROM products`, `products` is the workspace name.
:::

## Supported SQL Features

### Data Definition Language (DDL)

- `CREATE NODETYPE` - Define node type schemas
- `CREATE ARCHETYPE` - Define archetype schemas
- `CREATE ELEMENTTYPE` - Define element type schemas
- `ALTER` statements for schema modifications
- `DROP` statements for schema removal

### Branch Operations

- `CREATE BRANCH` - Create a new branch (with options: FROM, AT REVISION, DESCRIPTION, PROTECTED, UPSTREAM, WITH HISTORY)
- `DROP BRANCH` - Delete a branch
- `ALTER BRANCH` - Modify branch settings (RENAME, SET/UNSET UPSTREAM, SET PROTECTED)
- `MERGE BRANCH ... INTO ...` - Merge branches (with strategy selection)
- `USE BRANCH` / `CHECKOUT BRANCH` - Switch active branch
- `USE LOCAL BRANCH` - Switch branch for current session only
- `BEGIN` / `COMMIT` - Transaction control with message and actor metadata
- `SET validate_schema` - Configure schema validation

### Data Manipulation Language (DML)

- `SELECT` - Query data with filtering, joins, aggregation
- `INSERT` - Add new nodes
- `UPDATE` - Modify existing nodes
- `DELETE` - Remove nodes
- `EXPLAIN` - Show query execution plan

### Graph DML

- `RELATE` - Create relationships between nodes
- `UNRELATE` - Remove relationships
- `MOVE` - Move nodes in hierarchy
- `COPY` - Copy nodes (with optional recursion)
- `ORDER` - Order nodes within a parent
- `RESTORE` - Restore nodes from previous revisions
- `TRANSLATE` - Multi-language translation of node content

### Query Capabilities

- **Filtering**: `WHERE` clauses with complex predicates
- **Joins**: INNER, LEFT, RIGHT, FULL, CROSS
- **Aggregation**: `GROUP BY` with aggregate functions
- **Sorting**: `ORDER BY` with multiple columns
- **Limiting**: `LIMIT` and `OFFSET` for pagination
- **Common Table Expressions**: `WITH` clause for CTEs
- **Window Functions**: `OVER` clause for analytical queries
- **Subqueries**: Correlated and non-correlated subqueries

## Special Features

### Hierarchical Path Functions

RaisinDB provides specialized functions for working with hierarchical paths:

- `DEPTH(path)` - Calculate hierarchy depth
- `PARENT(path)` - Get parent path
- `ANCESTOR(path, depth)` - Get ancestor at specific depth
- `PATH_STARTS_WITH(path, prefix)` - Check path prefix
- `CHILD_OF(path, parent)` - Check direct parent relationship
- `DESCENDANT_OF(path, ancestor)` - Check descendant relationship
- `REFERENCES(target)` - Check if node references target
- `NEIGHBORS(node_id, direction, relation_type)` - Get neighboring nodes in the graph

### Working with Properties

All node data is stored in a `properties` JSONB column. Use JSONB operators to access fields:

```sql
-- Extract as text
SELECT properties->>'title' AS title FROM default;

-- Extract as JSONB
SELECT properties->'tags' AS tags FROM default;

-- Nested access
SELECT properties->'author'->>'name' AS author_name FROM default;

-- Cast for comparisons
SELECT * FROM default WHERE (properties->>'price')::numeric > 100;

-- Containment check
SELECT * FROM default WHERE properties @> '{"featured": true}';
```

### JSON Support

Native JSON operations using JSONPath expressions:

- `JSON_VALUE(json, path)` - Extract scalar values
- `JSON_QUERY(json, path)` - Extract JSON objects/arrays
- `JSON_EXISTS(json, path)` - Check path existence
- `JSONB_SET(json, path, value)` - Set values in JSON
- JSON operators: `->`, `->>`, `@>`, `<@`, `?`, `#>`, `#>>`, `#-`, `@?`

All of these operate on the `properties` JSONB column when querying nodes.

### Full-Text Search

PostgreSQL-compatible full-text search:

- `TO_TSVECTOR([language,] text)` - Create search document
- `TO_TSQUERY([language,] text)` - Create search query
- `TS_RANK(tsvector, tsquery)` - Calculate relevance score
- `FULLTEXT_MATCH(query, language)` - Match with language support
- `fulltext_search(workspace, query)` - Search a workspace
- `@@` operator for matching

### Vector Search

Embedding-based similarity search:

- `EMBEDDING(text)` - Generate vector embedding
- `VECTOR_L2_DISTANCE(vec1, vec2)` - Euclidean distance
- `VECTOR_COSINE_DISTANCE(vec1, vec2)` - Cosine distance
- `VECTOR_INNER_PRODUCT(vec1, vec2)` - Inner product
- Operators: `<->` (L2), `<=>` (cosine), `<#>` (inner product)

### Geospatial Queries

PostGIS-compatible spatial operations:

- `ST_POINT(lon, lat)` - Create point geometry
- `ST_DISTANCE(geom1, geom2)` - Calculate distance
- `ST_CONTAINS(geom1, geom2)` - Check containment
- `ST_INTERSECTS(geom1, geom2)` - Check intersection

### Graph Queries (SQL/PGQ)

SQL:2023 standard property graph queries using GRAPH_TABLE syntax:

- Pattern matching with node labels and relationship types
- Multi-label support: `(n:User|Admin)`
- Variable-length path patterns with quantifiers
- Inline WHERE predicates in node patterns
- Default graph name: `NODES_GRAPH`

### System Functions

- `VERSION()`, `CURRENT_SCHEMA()`, `CURRENT_DATABASE()`
- `CURRENT_USER()`, `SESSION_USER()`, `CURRENT_CATALOG()`
- RaisinDB-specific: `RAISIN_CURRENT_USER()`, `RAISIN_AUTH_*()` functions

### Numeric Functions

- `ROUND(number [, decimals])` - Round to nearest integer or N decimal places

## Node Columns

Every node has these columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique node identifier (ULID) |
| `node_type` | TEXT | NodeType name |
| `path` | TEXT | Hierarchical path |
| `workspace` | TEXT | Workspace name |
| `properties` | JSONB | All node properties |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |
| `version` | INTEGER | Version number |

All user-defined data lives in the `properties` JSONB column and is accessed with JSONB operators (`properties->>'field'`).

### System Aliases

The following double-underscore aliases are also available:

- `__id` → `id`
- `__path` → `path`
- `__node_type` → `node_type`
- `__created_at` → `created_at`
- `__updated_at` → `updated_at`
- `__revision` → `version`
- `__branch` → current branch name

## Data Types

Supported SQL data types:

- **Numeric**: INT, BIGINT, DOUBLE (NUMERIC/DECIMAL are accepted but convert to DOUBLE internally)
- **Text**: TEXT, UUID
- **Boolean**: BOOLEAN
- **Temporal**: TIMESTAMPTZ, INTERVAL
- **Specialized**: PATH, JSONB, GEOMETRY, VECTOR(n)
- **Full-Text**: TSVECTOR, TSQUERY
- **Collections**: ARRAY[T]
- **Nullable**: Any type with NULL support

## Type Coercion

RaisinDB supports implicit type coercion:

- Numeric ladder: INT → BIGINT → DOUBLE
- TEXT → PATH for path comparisons
- Non-nullable → Nullable wrapping

Explicit casting uses `CAST(expr AS type)` syntax.

## Case Sensitivity

- SQL keywords are case-insensitive
- Function names are case-insensitive
- Column names are case-sensitive
- String comparisons are case-sensitive by default

## Standards Compliance

RaisinDB SQL implementation follows:

- SQL:2016 standard for core features
- SQL:2023 PGQ for property graph queries
- PostgreSQL conventions for extensions
- PostGIS for geospatial functions
