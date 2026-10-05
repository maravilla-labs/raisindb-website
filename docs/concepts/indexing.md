---
sidebar_position: 6
---

# Indexing

RaisinDB maintains its indexes automatically as nodes are written. Most
queries need no declaration at all. Compound indexes are declared on a
workspace or a NodeType (and one, for folder listings by creation time, is
built in); the search indexes are declared per property on the NodeType.

## Types of indexes

| Index | Answers | Declared |
|---|---|---|
| Path index | `path = …`, `CHILD_OF`, `DESCENDANT_OF`, `PATH_STARTS_WITH` | automatic |
| Property index | `properties->>'k' = v`, `node_type = …`, `ORDER BY created_at` | automatic for every top-level property |
| Built-in folder index | `CHILD_OF(…) ORDER BY created_at [DESC]` | automatic on every workspace (opt-out) |
| Compound index | several equalities plus an `ORDER BY`, in one scan | `compound_indexes` on the workspace, or `COMPOUND_INDEX` on the NodeType |
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

`CHILD_OF` with no `ORDER BY`, or with `ORDER BY __order`, returns the children
in their editorial order. Ordered by creation time, it is served by the
[built-in folder index](#built-in-folder-index) instead.

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

### Who owns an index

A compound index is declared on a **workspace** or on a **NodeType**, and the
owner decides which nodes it holds and which queries may use it:

| Owner | Holds | Serves |
|---|---|---|
| Workspace (`compound_indexes` on the workspace) | every node of the workspace, whatever its type | any query on that workspace, typed or untyped |
| NodeType (`COMPOUND_INDEX` / `compound_indexes` on the type) | only nodes of that type (and its subtypes) | only queries that name the type: `node_type = '…'` or `IS_A('…')` |

A NodeType index is never used for a query that does not name its type: it
would silently miss every node of another type, so the planner scans instead.
That is why a folder listing, which usually names no type, needs a workspace
index (or the built-in one below).

### Built-in folder index

Every workspace carries a built-in index on `(__parent_path, __created_at)`, so
a folder listing by creation time is index-served without declaring anything:
newest or oldest first, with or without `LIMIT`, typed or untyped, with or
without other predicates (they are applied as filters on top).

```sql
EXPLAIN SELECT id, name FROM 'blog'
WHERE CHILD_OF('/posts') ORDER BY created_at DESC LIMIT 20;
-- CompoundIndexScan: @__children_by_created_at [__parent_path=/posts] index-order limit_hint=20 (owner: workspace blog)
```

It costs one index entry per node, written on create, re-keyed on move and
ended on delete; an update that changes neither the parent nor `created_at`
writes nothing to it (measured at about 1.3% of create throughput). It does not
serve `DESCENDANT_OF` (a subtree is a path range, not one parent), and it does
not replace editorial order: `CHILD_OF` with no `ORDER BY` or with
`ORDER BY __order` keeps the ordered-children index. There is no built-in
`updated_at` index, because it would be rewritten on every update; declare a
workspace index on `(__parent_path, __updated_at)` if you need one, and accept
that every update then writes it.

The index is built in the background on every server, branch by branch, by the
`compound_builds` repair (see [When the planner uses it](#when-the-planner-uses-it)).
Until it is built on a server, the listing scans there and returns the same
rows more slowly. Nodes written by a very old release may lack `created_at`;
while a branch of a workspace holds one, the built-in index is not marked ready
there and listings keep scanning, correctly, until those nodes are rewritten.
An index you declare yourself that serves the query as well or better is
preferred over the built-in one.

A workspace that never lists folders by creation time can switch it off in its
configuration, in YAML or through the workspace API:

```yaml
name: audit_log
config:
  builtin_indexes:
    children_by_created_at: false
```

or over SQL (`NULL` restores the default, on):

```sql
UPDATE Workspaces
SET builtin_indexes = '{"children_by_created_at": false}'::jsonb
WHERE name = 'audit_log';
```

Switching it off takes effect at once (the planner stops using it) and the
background job then deletes its entries; switching it back on builds it again.
`SELECT builtin_indexes FROM Workspaces` shows the switches in force, defaults
included. Index names starting with `__` are reserved for built-in indexes.

### Declaring one on a workspace

Declare a workspace index under `compound_indexes` in the workspace YAML
(`workspaces/<name>.yaml` in a package) or in the body of
`PUT /api/workspaces/{repo}/{name}`:

```yaml
name: blog
compound_indexes:
  - name: folder_by_status
    columns:
      - property: __parent_path
        column_type: String
      - property: status
        column_type: String
      - property: __created_at
        column_type: Timestamp
    has_order_column: true
```

or over SQL, with the same JSON shape:

```sql
UPDATE Workspaces
SET compound_indexes = '[{"name":"folder_by_status","columns":[
      {"property":"__parent_path","column_type":"String"},
      {"property":"status","column_type":"String"},
      {"property":"__created_at","column_type":"Timestamp"}],
    "has_order_column":true}]'::jsonb
WHERE name = 'blog';
```

```sql
SELECT id, name FROM 'blog'
WHERE CHILD_OF('/posts') AND properties->>'status'::String = 'published'
ORDER BY created_at DESC LIMIT 20;      -- every child, whatever its type
-- CompoundIndexScan: @folder_by_status [...] (owner: workspace blog)
```

A workspace index is stored as `@<name>`, in its own keyspace, so a NodeType
index of the same name never shares entries with it; NodeType index names may
not start with `@`. There is no `CREATE`/`ALTER` DDL for workspace indexes; the
`compound_indexes` column of the `Workspaces` table is the SQL surface.

A workspace index pinned to a parent (`__parent_path` among its equality
columns) is not used for an editorial listing (`CHILD_OF` with no `ORDER BY`, or
`ORDER BY __order`) unless it serves the `ORDER BY`, so the order editors
arranged is kept.

### Declaring one on a NodeType

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
or declare it in YAML under `compound_indexes`. Queries must name the type to
use it:

```sql
SELECT path FROM 'feed'
WHERE node_type = 'app:Post'
  AND properties->>'category'::String = 'tech'
  AND properties->>'status'::String = 'published'
ORDER BY created_at DESC LIMIT 10;
```

Columns are property names, or one of the system fields `__created_at`,
`__updated_at`, `__node_type` and `__parent_path`. In the query you still
write `created_at`; the planner maps it to the index column. `__order` is not
an index column.

### Column order matters

The planner matches a leading prefix of the equality columns. For
`(category, status, __created_at DESC)` (on a NodeType index, each query also
names the type):

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
recorded for the branch on that server; until then queries take the property
index or scan, with the same results, and `EXPLAIN` shows it:

```
PropertyIndexScan: category=tech
```

Declaring or changing an index queues its build on every server. The build
runs as a background job: it scans the existing nodes (the type's, or the whole
workspace's) in batches, writes their entries, and skips any node that lacks
one of the index's equality columns. New writes are indexed inline from the
start. When the index is in use, `EXPLAIN` prints `CompoundIndexScan` with the
index name, `index-order` or `reverse-index-order` for the direction it reads,
and its owner:

```
CompoundIndexScan: @folder_by_status [...] index-order limit_hint=20 (owner: workspace blog)
CompoundIndexScan: idx_category_status_created [...] index-order limit_hint=10 (owner: node type app:Post)
```

When several indexes fit a query, the planner prefers the one matching more
equality columns, then one that serves the `ORDER BY`, then one you declared
over the built-in one; an index that is not built yet never hides one that is.

The `compound_builds` repair keeps compound indexes built without anyone
asking. It runs on every server about two minutes after startup, one branch at
a time, paced and only with enough free disk (twice the compound index's size),
and again after a checkpoint is ingested. It builds the built-in folder index,
drops the entries of one switched off or of a removed workspace index, and
rebuilds every index built by an older release (October 2026, the
localized-paths release, changed the format). Set
`RAISIN_COMPOUND_FORMAT_REBUILD=0` to leave those older indexes to a manual
rebuild; they scan until then. Its progress is reported by the
[Index Repairs API](/docs/reference/http-api/index-repairs-api). See also
[Upgrading](/docs/guides/installation#upgrading).

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
WHERE node_type = 'social:Post'
  AND properties->>'author_id'::String = $1
  AND properties->>'visibility'::String = 'public'
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
WHERE node_type = 'shop:Product'
  AND properties->>'category'::String = 'electronics'
  AND properties->>'in_stock'::String = 'true'
ORDER BY properties->>'price'::Double ASC
LIMIT 50;
```

### Newest posts in a folder

No declaration needed; the built-in folder index serves it:

```sql
SELECT id, name FROM 'blog'
WHERE CHILD_OF($1)
ORDER BY created_at DESC
LIMIT 20;
```

### Activity log

```sql
CREATE NODETYPE 'app:Activity' PROPERTIES (
  tenant String REQUIRED,
  action String REQUIRED
)
COMPOUND_INDEX 'idx_tenant_activity' ON (tenant, __created_at DESC);

SELECT path FROM 'activity'
WHERE node_type = 'app:Activity'
  AND properties->>'tenant'::String = $1
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
