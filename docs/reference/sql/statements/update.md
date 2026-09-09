---
sidebar_position: 3
---

# UPDATE Statement

`UPDATE` changes existing nodes in a workspace.

## Syntax

```sql
UPDATE 'workspace'
SET column = expression [, ...]
WHERE condition
[ RETURNING expression [ AS alias ] [, ...] ]
```

The table name is the workspace. A `WHERE` clause is required; `UPDATE 'blog' SET ...` without one is rejected with `UPDATE requires a WHERE clause`. The result is one row with `affected_rows`, unless `RETURNING` is given.

## Updating properties

All user data lives in the `properties` JSONB column, so most updates assign to it. Three patterns cover nearly every case.

### Merge fields

`properties || '{...}'` keeps every existing field and adds or overwrites the ones you name:

```sql
UPDATE 'blog'
SET properties = properties || '{"views": 12, "reviewed": true}'
WHERE path = '/hello';
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,"execution_time_ms":4}
```

### Set one field, including nested ones

`JSONB_SET(properties, '{key,subkey}', value)` writes a single path and creates intermediate objects as needed. The value is JSON text: quote a string as `'"text"'`, a number as `'11'`.

```sql
UPDATE 'blog' SET properties = JSONB_SET(properties, '{views}', '11') WHERE path = '/hello';
UPDATE 'blog' SET properties = JSONB_SET(properties, '{seo,title}', '"Hello again"') WHERE path = '/hello';
```

### Remove a field

```sql
UPDATE 'blog' SET properties = properties - 'reviewed' WHERE path = '/hello';
```

### Replace everything

Assigning a literal replaces the whole object. The new value must still satisfy the NodeType's required properties.

```sql
UPDATE 'blog'
SET properties = '{"title": "Hello", "views": 0}'::jsonb
WHERE path = '/hello';
```

A JSON literal on its own is TEXT; cast it with `::jsonb`. The `||` and `JSONB_SET` forms take the literal without a cast because their signatures already expect JSON.

## Updating other columns

| Column | Effect |
|--------|--------|
| `name` | Renames the node. |
| `path` | Changes this node's own path. Its children keep their old paths, so use [`MOVE`](./graph-dml.md) to relocate a subtree. |
| `archetype` | Assigns an archetype; the name must exist, otherwise `Archetype not found`. |
| `node_type` | Rejected: `Cannot change node_type after creation`. |
| `id`, `created_at`, `created_by`, `version` | Server-managed; not assignable. |

```sql
UPDATE 'blog' SET name = 'hello-world' WHERE path = '/hello';
UPDATE 'blog' SET path = '/hello-world' WHERE path = '/hello';
```

Each update stamps `updated_at` and `updated_by`.

## How the WHERE clause is executed

The shape of the `WHERE` clause decides whether the statement runs inline or as a job.

**Fast path.** `WHERE id = '...'` or `WHERE path = '...'` with a literal (or a bound parameter) is a single point write and completes in the request:

```sql
UPDATE 'blog' SET properties = properties || '{"views": 8}'
WHERE id = 'b4363972-fe50-4fe7-8574-c29dd3fc6dfa';
```

If no node matches, the statement fails with `Node at path '/x' not found` or `Node with id '...' not found`.

**Bulk path.** Any other predicate (a property comparison, `DESCENDANT_OF`, `CHILD_OF`, `LIKE`, a combination with `AND`) is planned as a bulk operation and handed to the job queue. The response comes back immediately with a job id:

```sql
UPDATE 'blog'
SET properties = properties || '{"seen": true}'
WHERE properties->>'published' = 'true';
```

```json
{"columns":["job_id","status","message"],"rows":[{"job_id":"ZvzWqGaT9NJuiaM5MbbEX","status":"accepted","message":"Bulk operation started. Poll /api/jobs/{job_id} for status."}],"row_count":1,"execution_time_ms":0}
```

Poll the job with `GET /management/jobs/{job_id}`:

```json
{"success":true,"data":"Completed","error":null}
```

`EXPLAIN UPDATE ...` shows which path a statement will take without running it:

```
=== UPDATE Plan ===
Target workspace: blog
Strategy: fast path
PathIndexLookup: path='/x' (O(1) point write)
```

Bulk updates run in the background, so a `SELECT` issued straight after may still see the old values. Combine a point predicate with a property check only when you can accept the job round-trip: `WHERE path = '/news/first' AND properties->>'published'::String = 'false'` is a bulk operation, not a fast one.

## Examples

```sql
-- Publish one page
UPDATE 'blog'
SET properties = properties || '{"published": true, "published_on": "2026-09-06"}'
WHERE path = '/news/first';

-- Tag every page under a folder (bulk job)
UPDATE 'blog'
SET properties = properties || '{"section": "news"}'
WHERE DESCENDANT_OF('/news');

-- Bound parameters
-- {"sql": "UPDATE 'blog' SET properties = properties || $1 WHERE path = $2",
--  "params": [{"views": 100}, "/hello"]}
```

## Targeting a branch

Add `__branch = '...'` to the `WHERE` clause to update a node on another branch; the predicate is removed from the filter and selects the branch. Inside `BEGIN ... COMMIT` the branch is fixed at `BEGIN`.

```sql
UPDATE 'blog' SET properties = properties || '{"title": "Draft 2"}'
WHERE __branch = 'staging' AND path = '/draft';
```

## RETURNING

`RETURNING` reports the rows the statement wrote instead of a count, one row per updated node:

```sql
UPDATE 'blog'
SET properties = properties || '{"views": 5}'::jsonb
WHERE path = '/draft'
RETURNING path, properties->>'views' AS views;
```

```json
{"columns":["path","views"],"rows":[{"path":"/draft","views":"5"}],"row_count":1,"execution_time_ms":1}
```

The list is projected from the node as the statement leaves it, before the server stamps its own columns, so `updated_at`, `updated_by` and `__revision` read as NULL here. Select the node afterwards if you need them. Aggregates are rejected (`aggregate functions are not allowed in RETURNING`).
