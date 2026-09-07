---
sidebar_position: 6
---

# Indexing

RaisinDB maintains its indexes automatically as nodes are written. Most
queries need no declaration at all; compound indexes and the search indexes
are declared on the NodeType.

## Types of indexes

| Index | Answers | Declared |
|---|---|---|
| Path index | `path = …`, `CHILD_OF`, `DESCENDANT_OF`, `PATH_STARTS_WITH` | automatic |
| Property index | `properties->>'k' = v`, `node_type = …`, `ORDER BY created_at` | automatic for every top-level property |
| Compound index | several equalities plus an `ORDER BY`, in one scan | `COMPOUND_INDEX` on the NodeType |
| Full-text | `FULLTEXT_SEARCH`, `FULLTEXT_MATCH` | `index: [Fulltext]` per property |
| Vector | `KNN`, `HYBRID_SEARCH` | `index: [Vector]` per property plus an embedding provider |
| Spatial | `ST_DWITHIN`, `ST_DISTANCE` ordering | automatic for geometry values |

`EXPLAIN` shows which one a query uses.

## Path index

Every node's path is indexed, and hierarchy predicates become prefix scans:

```sql
EXPLAIN SELECT path FROM 'blog' WHERE CHILD_OF('/posts');
-- PrefixScan: prefix=/posts/
```

## Property index

Each top-level property of every node is written to the property index as a
hash of its value, keyed by property name. That gives equality lookups on any
property without declaring anything:

```sql
EXPLAIN SELECT path FROM 'blog' WHERE properties->>'status' = 'published';
-- PropertyIndexScan: status=published
```

The same index holds a few system fields: `node_type`, `name`, `archetype`,
`created_by`, `updated_by`, and the two timestamps. The timestamps are stored
in sortable form, so `ORDER BY created_at DESC LIMIT n` is served in index
order without sorting:

```sql
EXPLAIN SELECT path FROM 'blog' ORDER BY created_at DESC LIMIT 10;
-- PropertyOrderScan: __created_at DESC limit_hint=10
```

Because values are hashed, the property index answers equality only. A
`LIKE`, a range, or a comparison on a cast key is evaluated row by row on
top of whichever index narrows the scan (a path prefix, a `node_type`, or a
compound index).

Index entries are versioned with the revision that wrote them, and draft and
published states are kept apart, so a time-travel query or a published-only
read sees exactly the entries that were live at that point.

## Compound indexes

A compound index stores several property values in one key, in a declared
order, so a query that filters on all of them and sorts on the last can read
its result as one pre-sorted slice.

### The problem they solve

```sql
SELECT path FROM 'feed'
WHERE properties->>'category' = 'tech'
  AND properties->>'status' = 'published'
ORDER BY created_at DESC
LIMIT 10;
```

With only the property index, the planner picks the more selective of the
two equalities, filters the rest, and sorts. With a compound index on
`(category, status, __created_at DESC)` it seeks to `tech / published` and
reads ten entries that are already in the right order.

### Declaring one

Compound indexes belong to a NodeType:

```sql
CREATE NODETYPE 'app:Post' PROPERTIES (
  category  String REQUIRED,
  status    String,
  author_id String
)
COMPOUND_INDEX 'idx_category_status_created' ON (category, status, __created_at DESC)
COMPOUND_INDEX 'idx_author_created'          ON (author_id, __created_at DESC);
```

Each index has a name that is unique within the type, an ordered list of
columns, and an optional `ASC` or `DESC` per column. Add one to an existing
type with `ALTER NODETYPE 'app:Post' ADD COMPOUND_INDEX 'name' ON (...)`,
or declare it in YAML under `compound_indexes`.

Columns are property names, or one of the system fields `__created_at`,
`__updated_at`, `__node_type` and `__parent_path`. In the query you still
write `created_at`; the planner maps it to the index column.

### Column order matters

The planner matches a leading prefix of the equality columns. For
`(category, status, __created_at DESC)`:

| Query | Uses the index | Sorted by the index |
|---|---|---|
| `category = 'tech' AND status = 'pub' ORDER BY created_at DESC` | yes | yes |
| `category = 'tech' AND status = 'pub'` | yes | |
| `category = 'tech' ORDER BY created_at DESC` | partial: `category` only | no, sorted afterwards |
| `status = 'pub'` | no | |

Put equality columns first, most selective first, and the sort column last.
Only a full match on every equality column lets the planner trust the index
order and skip the sort.

### Timestamp direction

`__created_at DESC` stores the newest entry first, which is what feeds and
"latest" views read. `ASC` stores oldest first for timelines and queues. The
direction is encoded in the key, so it costs nothing at query time.

### When the planner uses it

A compound index is used only after its build has completed and been
recorded for the workspace; until then queries take the property index and
`EXPLAIN` shows why:

```
PropertyIndexScan: category=tech
```

The build runs as a background job: it scans the type's existing nodes in
batches of 1,000, writes their entries, and skips any node that lacks one of
the index's columns. New writes are indexed inline from the start. When the
index is in use, `EXPLAIN` prints `CompoundIndexScan` with the index name.

Like the property index, compound entries are versioned by revision and
split into draft and published sets.

## Practical examples

### Social feed

```sql
CREATE NODETYPE 'social:Post' PROPERTIES (
  author_id  String REQUIRED,
  visibility String
)
COMPOUND_INDEX 'idx_author_feed' ON (author_id, visibility, __created_at DESC);

-- latest 20 public posts by a user
SELECT path FROM 'feed'
WHERE properties->>'author_id' = $1
  AND properties->>'visibility' = 'public'
ORDER BY created_at DESC
LIMIT 20;
```

### Catalog

```sql
CREATE NODETYPE 'shop:Product' PROPERTIES (
  category String REQUIRED,
  in_stock Boolean,
  price    Number
)
COMPOUND_INDEX 'idx_category_stock_price' ON (category, in_stock, price ASC);

-- cheapest in-stock electronics
SELECT path FROM 'catalog'
WHERE properties->>'category' = 'electronics'
  AND properties->>'in_stock' = 'true'
ORDER BY properties->>'price'::Double ASC
LIMIT 50;
```

### Activity log

```sql
CREATE NODETYPE 'app:Activity' PROPERTIES (
  tenant String REQUIRED,
  action String REQUIRED
)
COMPOUND_INDEX 'idx_tenant_activity' ON (tenant, __created_at DESC);

SELECT path FROM 'activity'
WHERE properties->>'tenant' = $1
ORDER BY created_at DESC
LIMIT 100;
```

## Full-text and vector

Both are declared per property with the `index` list, and both are rebuilt
locally on every node of a cluster rather than replicated:

```yaml
properties:
  - name: title
    type: String
    index: [Fulltext, Vector]
```

See [Full-Text Search](/docs/concepts/multi-model/full-text-search) and
[Vector Search](/docs/concepts/multi-model/vector-search).

## Next Steps

- [DDL Reference](/docs/reference/sql/statements/ddl) for the full `CREATE NODETYPE` syntax
- [SQL Basics](/docs/guides/querying/sql-basics)
- [Pagination](/docs/guides/querying/pagination) for cursors that use these indexes
