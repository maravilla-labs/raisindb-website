---
sidebar_position: 6
---

# Branch Statements

SQL statements for creating, inspecting, switching and merging branches. Branch
names are quoted strings; an unquoted identifier is accepted for simple names
such as `main`.

## CREATE BRANCH

```sql
CREATE BRANCH 'name'
    [ FROM 'source_branch' ]
    [ AT REVISION <hlc> | HEAD~N | branch~N ]
    [ DESCRIPTION 'text' ]
    [ PROTECTED ]
    [ UPSTREAM 'branch' ]
    [ WITH HISTORY ]
```

`FROM` forks the source branch at its current head, copying its content,
indexes and schema. Without `FROM` the branch is created empty, with head
`0-0`. `PROTECTED` creates the branch protected, `UPSTREAM` sets the branch it
is compared against by default, and `WITH HISTORY` copies the source's commit
log into the new branch in the background.

```sql
CREATE BRANCH 'feature/search' FROM 'main';
CREATE BRANCH 'production' FROM 'main' PROTECTED UPSTREAM 'main';
-- result
-- Branch 'feature/search' created
```

:::note
`AT REVISION` and `DESCRIPTION` are accepted by the parser but not applied by
the current server: the branch is forked at the source head and its
description stays empty. To fork at a revision use the JavaScript client's
`fromRevision` or the HTTP `from_revision` field; set a description with
`ALTER BRANCH ... SET DESCRIPTION`.
:::

## DROP BRANCH

```sql
DROP BRANCH [ IF EXISTS ] 'name'
```

Fails with `Not found` if the branch does not exist and `IF EXISTS` is absent,
and with `Forbidden` if the branch is protected.

```sql
DROP BRANCH 'feature/search';
DROP BRANCH IF EXISTS 'scratch';
```

## ALTER BRANCH

```sql
ALTER BRANCH 'name'
      SET UPSTREAM 'branch'
    | UNSET UPSTREAM
    | SET PROTECTED TRUE | FALSE
    | SET DESCRIPTION 'text'
```

```sql
ALTER BRANCH 'feature/search' SET UPSTREAM 'develop';
ALTER BRANCH 'feature/search' UNSET UPSTREAM;
ALTER BRANCH 'production' SET PROTECTED TRUE;
ALTER BRANCH 'develop' SET DESCRIPTION 'Integration branch';
-- result
-- Branch 'production' altered
```

A protected branch cannot be deleted, merged into, or have its head moved.
`RENAME TO` parses but returns `RENAME TO is not supported`; create a new branch
and drop the old one instead.

## MERGE BRANCH

```sql
MERGE BRANCH 'source' INTO 'target'
    [ USING FAST_FORWARD | THREE_WAY ]
    [ MESSAGE 'commit message' ]
    [ RESOLVE CONFLICTS ( resolution [, ...] ) ]

resolution := ( 'node_id' [, 'locale'] , KEEP_OURS | KEEP_THEIRS | DELETE | USE_VALUE '<json>' )
```

`THREE_WAY` is the default. `FAST_FORWARD` only moves the target head and
fails with `Fast-forward merge not possible: branches have diverged` when the
target has its own commits. The message defaults to `SQL merge`.

```sql
MERGE BRANCH 'feature/search' INTO 'main' MESSAGE 'Add search';
-- result          | revision      | fast_forward | nodes_changed
-- Merge completed | 1788719765785 | false        | 2
```

A three-way merge with conflicts fails and lists them in the error message.
Inspect them with `SHOW CONFLICTS`, then rerun the merge with a resolution per
conflicted node:

```sql
MERGE BRANCH 'feature/search' INTO 'main' MESSAGE 'Add search'
RESOLVE CONFLICTS (
  ('260584c1-62d7-49a9-b536-8ee18455f3c3', USE_VALUE '{"title": "Merged title"}')
);
```

`USE_VALUE` supplies the node's final properties as JSON; `DELETE` resolves the
conflict by deleting the node. A resolution for a node that did not change on
both sides is rejected. The HTTP `resolve-merge` endpoint takes the same
resolutions; see [Merging Changes](/docs/guides/branching/merging-changes#resolve-conflicts).

## USE BRANCH / CHECKOUT BRANCH

```sql
USE BRANCH 'name'
USE LOCAL BRANCH 'name'
CHECKOUT BRANCH 'name'
```

Sets the branch for the statements that follow. `USE BRANCH` and
`CHECKOUT BRANCH` apply for the rest of the session: a pgwire connection, a
WebSocket connection, or the remaining statements of one HTTP batch.
`USE LOCAL BRANCH` applies to the next statement only.

```sql
USE BRANCH 'feature/search';
SELECT path, properties->>'title' AS title FROM 'content';
-- command | branch         | scope
-- SET     | feature/search | SESSION
```

Over HTTP the branch can also be part of the URL: `POST /api/sql/{repo}/{branch}`.

## SHOW and DESCRIBE

```sql
SHOW BRANCHES
SHOW CURRENT BRANCH
DESCRIBE BRANCH 'name'
SHOW DIVERGENCE 'branch' FROM 'base'
SHOW CONFLICTS FOR MERGE 'source' INTO 'target'
```

```sql
SHOW BRANCHES;
-- name    | head            | protected | upstream | created_at                | created_by
-- main    | 1788719881662-0 | false     | NULL     | 2026-09-06T18:35:23+00:00 | system
-- feature | 1788719742050-0 | false     | main     | 2026-09-06T18:35:41+00:00 | alice

DESCRIBE BRANCH 'feature';
-- adds created_from and description

SHOW DIVERGENCE 'feature' FROM 'main';
-- branch  | base | ahead | behind | common_ancestor
-- feature | main | 2     | 1      | 1788719729588-0

SHOW CONFLICTS FOR MERGE 'feature' INTO 'main';
-- node_id | path | conflict_type | base_properties | target_properties | source_properties
-- (or a single row: No conflicts detected)
```

## Branch and revision predicates in queries

Two pseudo-columns steer a single `SELECT` without changing the session:

```sql
-- read another branch
SELECT path, properties->>'title' AS title FROM 'content' WHERE __branch = 'feature';

-- read the workspace as it was at a revision
SELECT path, properties->>'title' AS title FROM 'content' WHERE __revision = '1788719729588-0';
```

`__revision` takes the full `timestamp-counter` string. Both predicates are
consumed by the planner; the columns themselves read as `NULL` in the result.

## Transactions

```sql
BEGIN [ TRANSACTION ];
COMMIT [ WITH MESSAGE 'text' ] [ ACTOR 'name' ];
```

Statements between `BEGIN` and `COMMIT` are written as one revision. The
message and actor are recorded on that revision and appear in the node
history.

```sql
BEGIN;
UPDATE 'content' SET properties = '{"title":"Committed via SQL"}'::jsonb WHERE path = '/hello';
COMMIT WITH MESSAGE 'Retitle hello' ACTOR 'alice';
-- message
-- Transaction committed
```

## SET

```sql
SET validate_schema = true | false
```

`validate_schema` is the only session variable. Turning it off skips NodeType
validation for the following writes, which is useful for bulk imports.

## Notes

- Branch names are case-sensitive.
- Tags have no SQL syntax; use the HTTP API or the JavaScript client.
- Every write creates a revision whether or not it is wrapped in a transaction.
