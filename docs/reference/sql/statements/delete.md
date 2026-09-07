---
sidebar_position: 4
---

# DELETE Statement

`DELETE` removes nodes from a workspace. Deleting a node also removes everything under it.

## Syntax

```sql
DELETE FROM 'workspace'
WHERE condition
```

The table name is the workspace. A `WHERE` clause is required; `DELETE FROM 'blog'` on its own is rejected with `DELETE requires a WHERE clause`. There is no `PURGE` or `USING`.

<!-- TODO(sql-ext): fill from engine report (RETURNING) -->

## Delete one node

```sql
DELETE FROM 'blog' WHERE path = '/t2';
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,"execution_time_ms":2}
```

By id:

```sql
DELETE FROM 'blog' WHERE id = '11111111-2222-4333-8444-555555555555';
```

Deleting a node that does not exist is not an error; `affected_rows` is `0`.

## Subtrees

A node's descendants go with it. Deleting the `/news` folder that holds four pages removes five nodes:

```sql
DELETE FROM 'blog' WHERE path = '/news';
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":5}],"row_count":1,"execution_time_ms":8}
```

To remove only the children and keep the folder, select them with a hierarchy predicate (this runs as a job, see below):

```sql
DELETE FROM 'blog' WHERE CHILD_OF('/news');
```

## How the WHERE clause is executed

`WHERE id = '...'` and `WHERE path = '...'` (a literal or a bound parameter) are point deletes and complete in the request. `EXPLAIN` confirms it:

```
=== DELETE Plan ===
Target workspace: blog
Strategy: fast path
PathIndexLookup: path='/x' (O(1) point write)
```

Any other predicate is planned as a bulk operation and queued as a job. The statement returns at once with the job id:

```sql
DELETE FROM 'blog' WHERE PATH_STARTS_WITH(path, '/t');
```

```json
{"columns":["job_id","status","message"],"rows":[{"job_id":"QMrZF1vwojmJlqWdkXVDj","status":"accepted","message":"Bulk operation started. Poll /api/jobs/{job_id} for status."}],"row_count":1,"execution_time_ms":0}
```

Poll `GET /management/jobs/{job_id}` until `data` is `Completed`. A bulk delete whose predicate matches nothing is still accepted as a job and completes with no changes.

Predicates that work in the bulk path are the ones `SELECT` accepts: property comparisons, `LIKE`, `IN (...)`, `DESCENDANT_OF`, `CHILD_OF`, `PATH_STARTS_WITH`, `DEPTH(path)`, `node_type = ...`, timestamps compared against a cast literal, and `AND` / `OR` combinations of them. A subquery in `WHERE id = (SELECT ...)` is not accepted. Run the same predicate as a `SELECT` first when you want to see what a bulk delete will remove.

## Examples

```sql
-- Drafts older than a date (bulk job)
DELETE FROM 'blog'
WHERE properties->>'status' = 'draft'
  AND created_at < '2025-01-01T00:00:00Z'::TIMESTAMPTZ;

-- Everything flagged temporary (bulk job)
DELETE FROM 'blog' WHERE properties @> '{"temporary": true}';

-- Deep nodes of one type (bulk job)
DELETE FROM 'blog' WHERE DEPTH(path) > 3 AND node_type = 'raisin:Asset';

-- Bound parameter (fast path)
-- {"sql": "DELETE FROM 'blog' WHERE path = $1", "params": ["/news/old"]}
```

## Targeting a branch

`WHERE __branch = 'staging' AND path = '/draft'` deletes on another branch; the `__branch` predicate selects the branch and is not part of the filter.

## After a delete

A deleted node no longer resolves by path or id, and `RESTORE NODE path='...' TO REVISION HEAD~1` answers `not found` for it: `RESTORE` rewinds a live node to an earlier revision, it does not undelete. To keep a safety net, do the deletion on a branch and merge it, or copy the subtree first with [`COPY`](./graph-dml.md).
