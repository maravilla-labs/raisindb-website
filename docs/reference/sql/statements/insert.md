---
sidebar_position: 2
---

# INSERT Statement

`INSERT` creates nodes in a workspace. `UPSERT` has the same syntax and creates or replaces.

## Syntax

```sql
INSERT INTO 'workspace' (path, node_type [, name] [, id] [, archetype] [, properties] [, __branch])
VALUES (...) [, (...) ...]

UPSERT INTO 'workspace' (...) VALUES (...)
```

The table name is the workspace. `path` and `node_type` are required; everything else has a default. Values must be literals or bound parameters (`$1`); expressions such as `JSONB_SET(...)` or `'{}'::jsonb || '{}'::jsonb` in `VALUES` are rejected with `Complex expressions in DML VALUES are not yet supported`. `INSERT ... SELECT` and `RETURNING` are not part of the current build.

<!-- TODO(sql-ext): fill from engine report (INSERT...SELECT, RETURNING) -->

## Basic INSERT

```sql
INSERT INTO 'blog' (path, node_type, name, properties)
VALUES ('/hello', 'raisin:Page', 'hello', '{"title": "Hello", "views": 10, "tags": ["a", "b"]}'::jsonb);
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,"execution_time_ms":4}
```

The JSON literal must be cast to `jsonb`. Without the cast the statement fails with `Type mismatch: expected JSONB, got TEXT`.

Read the node back to see what the server filled in:

```sql
SELECT id, path, name, node_type, version, created_by, created_at FROM 'blog' WHERE path = '/hello';
```

```json
{"id":"eebfcd9f-9a5b-4ec9-89aa-421294f3278b","path":"/hello","name":"hello","node_type":"raisin:Page","version":1,"created_by":"system","created_at":"2026-09-06T18:32:15.143528+00:00"}
```

## Columns

| Column | Default | Notes |
|--------|---------|-------|
| `path` | required | Must start with `/`. The parent must exist unless the node is at the root. |
| `node_type` | required | Must be allowed in the workspace (`allowed_node_types`, and `allowed_root_node_types` for root-level paths). |
| `name` | last segment of `path` | `'/news/no-name'` becomes `name = 'no-name'`. |
| `id` | generated UUID | Any string; must be unique in the repository. |
| `archetype` | NULL | Must name an existing archetype. |
| `properties` | `{}` | JSONB. Validated against the NodeType's property schema. |
| `__branch` | current branch | Pseudo-column, see below. |

`created_at`, `updated_at`, `created_by`, `updated_by` and `version` are set by the server and cannot be supplied.

### Explicit id

```sql
INSERT INTO 'blog' (id, path, node_type, name, properties)
VALUES ('11111111-2222-4333-8444-555555555555', '/news/third', 'raisin:Page', 'third', '{"title": "Third"}'::jsonb);
```

## Multiple rows

One statement can insert several nodes. Parents listed earlier in the same statement are available to later rows.

```sql
INSERT INTO 'blog' (path, node_type, name, properties) VALUES
  ('/news',        'raisin:Folder', 'news',   '{"title": "News"}'::jsonb),
  ('/news/first',  'raisin:Page',   'first',  '{"title": "First post", "views": 42, "published": false}'::jsonb),
  ('/news/second', 'raisin:Page',   'second', '{"title": "Second", "views": 7, "published": true}'::jsonb);
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":3}],"row_count":1,"execution_time_ms":5}
```

## Bound parameters

```json
{"sql": "INSERT INTO 'blog' (path, node_type, properties) VALUES ($1, 'raisin:Page', $2::jsonb)",
 "params": ["/news/fourth", {"title": "Fourth"}]}
```

## UPSERT

`UPSERT` creates the node if the path is free and replaces it if the path exists. The properties are replaced, not merged.

```sql
INSERT INTO 'blog' (path, node_type, name, properties) VALUES ('/t1', 'raisin:Folder', 't1', '{}'::jsonb);
INSERT INTO 'blog' (path, node_type, name, properties) VALUES ('/t1', 'raisin:Folder', 't1', '{}'::jsonb);
-- Conflict: Node with path '/t1' already exists (id=4ef79d59-05fd-412b-8101-de4ec286e927)

UPSERT INTO 'blog' (path, node_type, name, properties) VALUES ('/t1', 'raisin:Folder', 't1', '{"x": 1}'::jsonb);
-- {"affected_rows":1}
```

## Validation

The write is checked against the workspace and the NodeType before anything is stored. Each failure is a `VALIDATION_FAILED` response naming the rule:

```
Missing required property 'title' for NodeType 'raisin:Page'
Workspace 'blog' does not allow root nodes of type 'raisin:User'. Allowed root types: ["raisin:Folder", "raisin:Page"]
Conflict: Node with path '/t1' already exists (id=...)
```

A multi-row statement is rejected as a whole if any row fails.

## Targeting a branch

By default an `INSERT` writes to the branch of the request (`/api/sql/{repo}/{branch}`, or the repository's default branch). Add a `__branch` pseudo-column to write to a different branch in one statement:

```sql
INSERT INTO 'blog' (__branch, path, node_type, properties)
VALUES ('staging', '/news/draft', 'raisin:Page', '{"title": "Draft"}'::jsonb);
```

`__branch` must be a string literal, the same for every row, and it needs an explicit column list. It is removed before the row is stored. Inside an explicit `BEGIN ... COMMIT` the branch is fixed at `BEGIN`; use [`USE BRANCH`](./branch.md) there instead. `SELECT`, `UPDATE` and `DELETE` accept the same override as `WHERE __branch = '...'`.

The target branch must already carry the node type. A branch created with a bare `CREATE BRANCH 'staging'` and written to immediately answered `NodeType not found: raisin:Page` in testing; create the branch from a populated one (`CREATE BRANCH 'staging' FROM 'main'`, see [Branch statements](./branch.md)) before inserting into it.

## Property values

`properties` is free-form JSON checked against the NodeType schema. Nested objects, arrays, numbers and booleans are stored as written. Two value shapes have special meaning:

- A reference: `{"raisin:ref": "/news/second", "raisin:workspace": "blog"}`. On write the server resolves the path to the target's id and stores `raisin:ref` (id), `raisin:workspace` and `raisin:path`. `REFERENCES(...)` and `RESOLVE(...)` work on these; see [Path functions](../functions/path-functions.md).
- A geometry: a GeoJSON object such as `{"type": "Point", "coordinates": [-122.4, 37.8]}` in a property. It is indexed for `ST_DWITHIN` and friends; see [Geospatial functions](../functions/geospatial-functions.md).

Fields marked `FULLTEXT` or `VECTOR` in the NodeType are indexed after the write; nothing extra is needed in the statement.

Timestamps in properties are plain strings. Keep them in ISO 8601 (`"2024-01-15T10:00:00Z"`) so they sort correctly as text.
