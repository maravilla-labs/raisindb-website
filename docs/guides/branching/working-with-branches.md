---
sidebar_position: 1
---

# Working with Branches

Branches let you change content and schema in isolation and bring the result
into `main` when it is ready. A branch forked from another one is a full copy
of its nodes, indexes and schema (NodeTypes, archetypes, element types) at the
fork revision, so you can write archetyped content to it immediately.

## Create a branch

### JavaScript client

```typescript
const db = client.database('myapp');

// fork main's current head (copies schema + content)
await db.branches().create('feature-xyz', { fromBranch: 'main' });

// fork at an earlier revision of main
await db.branches().create('hotfix', { fromBranch: 'main', fromRevision: '1788719729588-0' });
```

### SQL

```sql
CREATE BRANCH 'feature-xyz' FROM 'main';
```

### HTTP API

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "feature-xyz", "upstream_branch": "main", "created_by": "alice"}'
```

The source branch is passed as `upstream_branch`; add `"from_revision": "..."`
to fork at a specific revision. The response is the branch record:

```json
{
  "name": "feature-xyz",
  "head": "1788719729588-0",
  "created_at": "2026-09-06T18:35:41.856317Z",
  "created_by": "alice",
  "created_from": "1788719729588-0",
  "upstream_branch": "main",
  "protected": false,
  "description": null
}
```

## List and inspect branches

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches -H "Authorization: Bearer $TOKEN"
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature-xyz -H "Authorization: Bearer $TOKEN"
```

```sql
SHOW BRANCHES;
DESCRIBE BRANCH 'feature-xyz';
```

## Write to a branch

The branch is part of every address, so you choose it per call.

### JavaScript client

```typescript
const feature = db.onBranch('feature-xyz');

await feature.workspace('content').nodes().create({
  type: 'raisin:Page',
  path: '/articles/new-feature',
  properties: { title: 'New Feature' },
});

await feature.executeSql("SELECT path, properties->>'title' AS title FROM 'content'");
```

`onBranch()` also exists on a workspace client: `db.workspace('content').onBranch('feature-xyz')`.

### REST

The branch is the second path segment. Creating a child under the workspace root:

```bash
curl -X POST http://localhost:8080/api/repository/myapp/feature-xyz/head/content/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "new-feature", "node_type": "raisin:Page", "properties": {"title": "New Feature"}}'
```

Reads (`GET .../head/content/new-feature`), updates (`PUT`) and deletes use the same path.

### SQL

```bash
# POST /api/sql/{repo}/{branch}; URL-encode a slash in a branch name
curl -X POST http://localhost:8080/api/sql/myapp/feature-xyz \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"sql\":\"UPDATE 'content' SET properties = '{\\\"title\\\":\\\"Edited\\\"}'::jsonb WHERE path = '/articles/new-feature'\"}"
```

Inside one SQL batch, `USE BRANCH 'feature-xyz';` switches the following
statements. Over HTTP the setting lasts for that request only.

## Protect a branch

```sql
ALTER BRANCH 'production' SET PROTECTED TRUE;
```

A protected branch rejects deletion, merges into it and head changes with
`403 Forbidden` until protection is removed with `SET PROTECTED FALSE`.

## Delete a branch

```bash
curl -X DELETE http://localhost:8080/api/management/repositories/default/myapp/branches/feature-xyz \
  -H "Authorization: Bearer $TOKEN"
# 204 No Content
```

```sql
DROP BRANCH IF EXISTS 'feature-xyz';
```

Deleting a branch removes its record and its head; it does not remove
revisions that other branches still reach.

## Deploy a package to a branch

The CLI can upload and install a package onto any branch with `--branch`:

```bash
raisindb deploy ./package --repo myapp --branch staging --install
```

`deploy`, `sync` and `install` accept `-b, --branch <name>` (default `main`).
See the [CLI commands reference](../../reference/cli/commands.md#package-deploy).

## Promote selected nodes to another branch

A merge moves a whole branch. When one branch holds work in progress and
another holds what is live, `copyNodes` moves named subtrees instead:

```typescript
const at = await db.branches().getHead('staging');   // pin the state you reviewed

await db.branches().copyNodes('staging', 'main', {
  workspace: 'content',
  roots: ['/products/kettle'],
  recursive: true,
  sourceRevision: at.revision,
});
// { copied: 1, deleted: 0, revision: '1788720003641-0',
//   changes: [{ node_id: '...', path: '/products/kettle', node_type: 'raisin:Page', operation: 'added' }] }
```

Node ids are preserved, so promoting the same root again updates the same
target nodes and references keep resolving. `sourceRevision` makes the copy
read every node from one revision instead of from the source head as the copy
progresses, which is what you want when a review happened minutes before the
promotion. Each root's parent must already exist on the target branch, and the
whole set lands in one commit.

See the [Branches SDK reference](../../reference/javascript-client/branches.md#copynodes)
for the full argument list.

## Next Steps

- [Merging Changes](./merging-changes.md)
- [Branches SDK reference](../../reference/javascript-client/branches.md)
- [Branch SQL statements](../../reference/sql/statements/branch.md)
