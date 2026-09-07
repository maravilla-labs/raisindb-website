---
sidebar_position: 1
---

# SQL Interface Overview

RaisinDB exposes its content model through SQL. The dialect is PostgreSQL-flavoured (the parser is the PostgreSQL dialect of `sqlparser`), extended with statements and functions for hierarchical paths, branches, graph relations, JSON properties, full-text and vector search, and schema definitions.

You can run SQL over HTTP (`POST /api/sql/{repo}` or `POST /api/sql/{repo}/{branch}`), from `psql` over the PostgreSQL wire protocol, from the JavaScript client, and from server-side functions via `raisin.sql`.

```bash
curl -s -X POST localhost:8090/api/sql/docs-sql \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sql":"SELECT id, path, properties->>'"'"'title'"'"' AS title FROM '"'"'blog'"'"' WHERE path = $1", "params":["/hello"]}'
```

```json
{"columns":["id","path","title"],"rows":[{"id":"eebfcd9f-9a5b-4ec9-89aa-421294f3278b","path":"/hello","title":"Hello"}],"row_count":1,"execution_time_ms":1}
```

Every response has the same shape: `columns`, `rows` (one JSON object per row), `row_count` and `execution_time_ms`. Statements that change data return one row with `affected_rows`; DDL returns `result` and `success`; `EXPLAIN` returns a `QUERY PLAN` column. Bound parameters are positional (`$1`, `$2`, ...) and passed in the `params` array.

## The workspace is the table

There is no global `nodes` table. Each workspace is a table, and the table name in `FROM`, `INSERT INTO`, `UPDATE` and `DELETE FROM` is the workspace name. Quote it as a string literal so names with a colon or a hyphen work:

```sql
SELECT path, name FROM 'blog' ORDER BY path;
SELECT name FROM 'raisin:access_control' WHERE node_type = 'raisin:Role';
```

Four reserved names read the schema registry instead of content: `NodeTypes`, `Archetypes`, `ElementTypes` and `Workspaces`. See [Schema Tables](./schema-tables.md).

## Node columns

Every workspace table has the same columns. `SELECT *` returns them in this order:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Node id (a UUID). You may supply one on INSERT; otherwise the server generates it. |
| `path` | PATH | Hierarchical path, e.g. `/news/first`. Unique within a workspace. |
| `name` | TEXT | Last path segment. Defaults to the last segment of `path` on INSERT. |
| `node_type` | TEXT | NodeType name, e.g. `raisin:Page`. Fixed after creation. |
| `archetype` | TEXT | Archetype name, or NULL. |
| `properties` | JSONB | All user data. Read fields with `->` and `->>`. |
| `parent_name` | TEXT | Name of the parent node (`/` for root-level nodes). |
| `version` | INT | Version counter. |
| `created_at`, `updated_at` | TIMESTAMPTZ | Set by the server. |
| `published_at`, `published_by` | TIMESTAMPTZ, TEXT | Set by publishing. |
| `created_by`, `updated_by` | TEXT | Actor ids. |
| `translations` | JSONB | Per-locale property overrides, or NULL. |
| `owner_id` | TEXT | Owning user, or NULL. |
| `relations` | JSONB | Graph relations stored on the node, or NULL. |
| `parent_path` | PATH | Filled by hierarchy traversals; NULL on plain scans. |
| `depth` | INT | Number of path segments (`/news/first` is 2). |
| `locale` | TEXT | Locale the row was rendered in. |
| `__revision`, `__branch`, `__workspace` | TEXT | Revision id, branch name and workspace name of the row. `__branch` is also usable in `WHERE` to read another branch. |
| `__order`, `__tree_order` | TEXT | Editorial (drag-and-drop) sort keys. See [SELECT](./statements/select.md#editorial-order-columns). |

All user-defined data lives in `properties`. A Page's title is `properties->>'title'`, not a `title` column.

## Statements

| Family | Statements | Reference |
|--------|-----------|-----------|
| Query | `SELECT` (joins, `GROUP BY`, `DISTINCT`, `ORDER BY`, `LIMIT`/`OFFSET`, `WITH`, window functions, `EXPLAIN`) | [SELECT](./statements/select.md) |
| Data | `INSERT`, `UPSERT`, `UPDATE`, `DELETE` | [INSERT](./statements/insert.md), [UPDATE](./statements/update.md), [DELETE](./statements/delete.md) |
| Schema | `CREATE / ALTER / DROP` for `NODETYPE`, `MIXIN`, `ARCHETYPE`, `ELEMENTTYPE` | [DDL](./statements/ddl.md) |
| Branches | `CREATE / ALTER / DROP / MERGE BRANCH`, `USE BRANCH`, `SHOW BRANCHES`, `SHOW CURRENT BRANCH`, `SHOW CONFLICTS`, `SHOW DIVERGENCE`, `BEGIN` / `COMMIT` | [Branch statements](./statements/branch.md) |
| Graph | `RELATE`, `UNRELATE`, `MOVE`, `COPY`, `ORDER`, `RESTORE`, `TRANSLATE` | [Graph DML](./statements/graph-dml.md) |
| Access control | `CREATE / ALTER / DROP ROLE`, `GROUP`, `USER`; `ALTER SECURITY CONFIG`; `SHOW ROLES`, `SHOW USERS`, `SHOW GROUPS`, `SHOW SECURITY CONFIG` | |
| AI and vectors | `SHOW AI CONFIG`, `ALTER AI CONFIG`, `SHOW EMBEDDING CONFIG`, `ALTER EMBEDDING CONFIG`, `SHOW / VERIFY / REBUILD VECTOR INDEX` | [Vector functions](./functions/vector-functions.md) |
| Spatial | `ALTER SPATIAL INDEX`, `REBUILD SPATIAL INDEX`, `SHOW SPATIAL INDEX` | [Geospatial functions](./functions/geospatial-functions.md) |

Several statements separated by `;` can be sent in one request; they run in order.

## Working with properties

```sql
-- text value
SELECT properties->>'title' AS title FROM 'blog';

-- JSON value (object, array, number, boolean)
SELECT properties->'tags' AS tags FROM 'blog';

-- nested field
SELECT properties->'author'->>'name' AS author FROM 'blog';

-- numbers: ->> yields text, so cast before comparing
SELECT name FROM 'blog' WHERE (properties->>'views')::INT > 20;

-- containment
SELECT name FROM 'blog' WHERE properties @> '{"published": true}';

-- bound parameter
SELECT name FROM 'blog' WHERE properties->>'title' = $1;
```

JSON literals in `INSERT` and `UPDATE` must be cast: `'{"title":"Hello"}'::jsonb`. The full operator list is in [Operators](./operators.md); the function list is in the pages under Functions.

## Hierarchy

Paths are first-class. `CHILD_OF('/news')` and `DESCENDANT_OF('/news')` select by position in the tree, `DEPTH(path)`, `PARENT(path)` and `ANCESTOR(path, n)` compute with paths, and `REFERENCES('blog:/news/second')` finds nodes whose reference properties point at a node. See [Path functions](./functions/path-functions.md).

## Type coercion and casting

Integer and float literals combine freely; arithmetic produces DOUBLE. Casts use `::type` or `CAST(x AS type)` with these names: `INT`, `BIGINT`, `DOUBLE`, `TEXT`, `BOOLEAN`, `TIMESTAMP`, `TIMESTAMPTZ`, `INTERVAL`, `JSONB`, `PATH`, `UUID`, `GEOMETRY`, `TSVECTOR`, `TSQUERY`. `NUMERIC` and `DECIMAL` are not accepted; use `DOUBLE`. See [Data Types](./data-types.md).

## Case sensitivity

Keywords and function names are case-insensitive. Column names, workspace names, paths, node type names and string comparisons are case-sensitive. `LIKE` is case-sensitive; `ILIKE` is not.

## Functions

Each page under Functions lists the functions the server implements, with executed examples: [string](./functions/string-functions.md), [numeric](./functions/numeric-functions.md), [JSON](./functions/json-functions.md), [path](./functions/path-functions.md), [date and time](./functions/datetime-functions.md), [aggregate](./functions/aggregate-functions.md), [window](./functions/window-functions.md), [system](./functions/system-functions.md), plus full-text, vector, geospatial and graph.

<!-- TODO(sql-ext): fill from engine report (scalar library, HAVING, set operations, EXISTS/scalar subqueries, regex operators, ANY/ALL, INSERT...SELECT, RETURNING) -->

