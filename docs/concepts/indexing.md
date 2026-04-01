---
sidebar_position: 6
---

# Indexing

RaisinDB provides multiple indexing strategies to keep queries fast as your data grows. From single-property lookups to multi-column compound indexes to full-text search, indexes are defined declaratively and maintained automatically.

## Types of Indexes

| Index Type | Best For | Defined On |
|-----------|----------|------------|
| **Property Index** | Single-field equality lookups | Automatic for queried properties |
| **Compound Index** | Multi-field queries with sorting | NodeType via `COMPOUND_INDEX` clause |
| **Full-Text Search** | Natural language queries | NodeTypes with `indexable: true` |
| **Vector Search** | Semantic similarity | Embedding-enabled nodes |

## Compound Indexes

Compound indexes are the workhorse for structured queries. They allow the query engine to scan a small, pre-sorted slice of the index instead of walking every node in the workspace.

### The Problem They Solve

Without a compound index, a query like this scans **every node** in the workspace:

```sql
SELECT * FROM 'default'
WHERE properties->>'category'::String = 'tech'
  AND properties->>'status'::String = 'published'
ORDER BY __created_at DESC
LIMIT 10;
```

With a compound index, the same query becomes an **O(LIMIT) prefix scan** — it seeks directly to `category=tech, status=published` in the index, reads 10 pre-sorted entries, and looks up the nodes by ID. Fast regardless of total data size.

### Defining Compound Indexes

Compound indexes are declared on NodeTypes using SQL DDL:

```sql
CREATE NODETYPE article (
    title TEXT NOT NULL,
    category TEXT,
    status TEXT DEFAULT 'draft',
    author_id TEXT
)
COMPOUND_INDEX 'idx_category_status_created' ON (
    category,
    status,
    __created_at DESC
)
COMPOUND_INDEX 'idx_author_created' ON (
    author_id,
    __created_at DESC
);
```

Each index specifies:
- A **name** — must be unique within the NodeType
- An ordered list of **columns** — properties or system fields
- An optional **sort direction** per column — `ASC` (default) or `DESC`

### Column Order Matters

The query planner matches indexes using **leftmost prefix matching**. Given an index on `(category, status, __created_at DESC)`:

| Query | Uses Index? | Why |
|-------|-------------|-----|
| `WHERE category = 'tech' AND status = 'pub' ORDER BY __created_at DESC` | Yes | Full prefix match |
| `WHERE category = 'tech' AND status = 'pub'` | Yes | Equality on first 2 columns |
| `WHERE category = 'tech'` | Yes | Equality on first column |
| `WHERE status = 'pub'` | **No** | Skips leading column |
| `WHERE category = 'tech' ORDER BY __created_at DESC` | Partial | Uses category prefix, but skips status |

**Rule of thumb:** put high-cardinality equality columns first, and the ORDER BY column last.

### System Properties

Compound indexes can include system properties alongside user-defined properties:

| System Property | Type | Use Case |
|----------------|------|----------|
| `__node_type` | String | Cross-type indexes |
| `__created_at` | Timestamp | "Latest first" feeds |
| `__updated_at` | Timestamp | "Recently modified" views |

A cross-type index using `__node_type` lets you query across multiple NodeTypes efficiently:

```sql
CREATE NODETYPE content_item (
    workspace_id TEXT
)
COMPOUND_INDEX 'idx_ws_type_created' ON (
    workspace_id,
    __node_type,
    __created_at DESC
);
```

### Timestamp Sort Direction

Timestamp columns support direction-aware encoding in the index:

- **`DESC`** — most recent entries first (natural forward scan). Use this for feeds, activity logs, "latest" queries.
- **`ASC`** — oldest entries first. Use this for chronological timelines, queue processing.

The encoding is baked into the index key, so sorting happens at scan time with zero overhead.

### Background Index Building

When you add a compound index to a NodeType that already has data, RaisinDB doesn't block — it schedules a background job:

1. Scans all existing nodes of the target NodeType
2. Builds index entries in batches of 1,000
3. Skips nodes where required index columns are missing
4. New writes are indexed inline immediately (no gap in coverage)

You can monitor the build job through the admin console or the job queue API.

### Draft vs. Published

Compound indexes maintain **separate entries** for draft and published node states. This means:

- Queries against the default (draft) workspace only scan draft index entries
- Published content queries only scan published index entries
- No cross-contamination between editing and live data

### Versioning (MVCC)

Compound index entries are fully revision-aware:

- Each entry includes the HLC revision in the key
- Deleted nodes are tracked with tombstone markers
- Scans deduplicate by node ID, returning only the latest live entry

This guarantees correct results during concurrent writes, branch operations, and time-travel queries.

## Practical Examples

### Social Feed

Show the latest posts by a specific user:

```sql
CREATE NODETYPE post (
    author_id TEXT NOT NULL,
    visibility TEXT DEFAULT 'public'
)
COMPOUND_INDEX 'idx_author_feed' ON (
    author_id,
    visibility,
    __created_at DESC
);
```

```sql
-- Latest 20 public posts by user
SELECT * FROM 'default'
WHERE properties->>'author_id'::String = $1
  AND properties->>'visibility'::String = 'public'
ORDER BY __created_at DESC
LIMIT 20;
```

### E-Commerce Catalog

Browse products by category, filtering in-stock items, sorted by price:

```sql
CREATE NODETYPE product (
    category TEXT NOT NULL,
    in_stock BOOLEAN DEFAULT true,
    price INT
)
COMPOUND_INDEX 'idx_category_stock_price' ON (
    category,
    in_stock,
    price ASC
);
```

```sql
-- Cheapest in-stock electronics
SELECT * FROM 'default'
WHERE properties->>'category'::String = 'electronics'
  AND properties->>'in_stock'::Boolean = true
ORDER BY properties->>'price'::Integer ASC
LIMIT 50;
```

### Multi-Tenant Activity Log

Show recent activity across all content types for a tenant:

```sql
CREATE NODETYPE activity (
    tenant TEXT NOT NULL,
    action TEXT NOT NULL
)
COMPOUND_INDEX 'idx_tenant_activity' ON (
    tenant,
    __created_at DESC
);
```

```sql
-- Last 100 actions by tenant
SELECT * FROM 'default'
WHERE properties->>'tenant'::String = $1
ORDER BY __created_at DESC
LIMIT 100;
```

## Property Indexes

Property indexes are single-field secondary indexes maintained by the `PropertyIndexPlugin`. They're updated automatically when nodes are created or modified, and the SQL query planner uses them for equality lookups on individual properties.

Unlike compound indexes, property indexes don't need to be declared — they're built on demand based on query patterns.

## Full-Text Search

Nodes with `indexable: true` on their NodeType are automatically indexed for full-text search using [Tantivy](https://github.com/quickwit-oss/tantivy). See [Full-Text Search](/docs/concepts/multi-model/full-text-search) for details.

## Vector Search

Embedding-enabled nodes can be searched using approximate nearest neighbor (ANN) via the HNSW algorithm. See [Vector Search](/docs/concepts/multi-model/vector-search) for details.

## Next Steps

- **[DDL Reference](/docs/reference/sql/statements/ddl)** — Full syntax for `COMPOUND_INDEX` and other schema statements
- **[Querying Guide](/docs/guides/querying/sql-basics)** — Write efficient queries that leverage indexes
- **[Full-Text Search](/docs/concepts/multi-model/full-text-search)** — Natural language search
- **[Vector Search](/docs/concepts/multi-model/vector-search)** — Semantic similarity search
