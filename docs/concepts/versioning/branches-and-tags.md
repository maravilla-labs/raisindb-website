---
sidebar_position: 2
---

# Branches and Tags

A **branch** is an isolated line of content and schema inside a repository. Every repository starts with `main`. You can fork a branch from another one, write to it without touching the source, compare it, merge it back, or promote selected nodes from it. A **tag** is an immutable name for one revision, used to mark releases and reviewed states.

## What a branch is

A branch record holds a name and a `head`, the HLC revision it currently points to, plus a little metadata:

```json
{
  "name": "feature",
  "head": "1788719742050-0",
  "created_at": "2026-09-06T18:35:41.856317Z",
  "created_by": "alice",
  "created_from": "1788719729588-0",
  "upstream_branch": "main",
  "protected": false,
  "description": null
}
```

- `created_from` is the revision the branch was forked at, or `null` for a branch created from nothing.
- `upstream_branch` is the branch it is compared against by default; `main` when unset.
- `protected` blocks deletion, head changes and merges into the branch.

Every write on a branch creates a new revision and advances that branch's head only. See [Revisions](./revisions) for how revisions work.

## Creating a branch

Forking copies the source branch's content, indexes and schema (NodeTypes, archetypes, element types) as they are at the fork revision. The new branch is usable immediately, including for archetyped content, and the copy is a real copy: later writes on either side do not affect the other.

```sql
CREATE BRANCH 'feature' FROM 'main';
```

```typescript
await db.branches().create('feature', { fromBranch: 'main' });
// fork at an earlier revision instead of the head:
await db.branches().create('pin', { fromBranch: 'main', fromRevision: '1788719729588-0' });
```

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "feature", "upstream_branch": "main", "created_by": "alice"}'
```

Over HTTP the source is named by `upstream_branch`; add `from_revision` to fork at a specific revision. A request with neither creates an empty branch whose head is `0-0`.

The commit history of the source is copied into the new branch by a background job, so the repository revision log for the branch fills in shortly after creation.

## Working on a branch

The branch is part of every address, so choosing a branch is choosing a URL segment, a SQL endpoint or a client scope. Nothing is switched globally.

```bash
# REST: the branch is the second path segment
curl http://localhost:8080/api/repository/myapp/feature/head/content/hello -H "Authorization: Bearer $TOKEN"

# SQL over HTTP: POST /api/sql/{repo}/{branch}
curl -X POST http://localhost:8080/api/sql/myapp/feature -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sql\":\"UPDATE 'content' SET properties = '{\\\"title\\\":\\\"Hello from feature\\\"}'::jsonb WHERE path = '/hello'\"}"
```

```typescript
const feature = db.onBranch('feature');
await feature.workspace('content').nodes().create({ type: 'raisin:Page', path: '/feature-only', properties: { title: 'Only on feature' } });
await feature.executeSql("SELECT path, properties->>'title' AS title FROM 'content'");
```

Inside a SQL batch or a pgwire session, `USE BRANCH 'feature'` sets the branch for the statements that follow, and `SHOW CURRENT BRANCH` reports it. A `__branch = 'feature'` predicate routes a single query to another branch without changing the session. Details are in the [SQL branch reference](/docs/reference/sql/statements/branch).

## Comparing branches

`compare` counts commits ahead and behind and names the common ancestor. `diff` lists the nodes that changed since the fork.

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature/compare/main -H "Authorization: Bearer $TOKEN"
# {"ahead":2,"behind":1,"common_ancestor":"1788719729588-0"}

curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature/diff/main -H "Authorization: Bearer $TOKEN"
# {"common_ancestor":"1788719729588-0",
#  "added":[{"node_id":"f29d5b20-...","workspace":"content","path":"/feature-only","operation":"added"}],
#  "modified":[{"node_id":"260584c1-...","workspace":"content","path":"/hello","operation":"modified"}],
#  "deleted":[]}
```

`SHOW DIVERGENCE 'feature' FROM 'main'` returns the same counts in SQL. The diff walks the commits since the fork rather than the whole repository, so it stays cheap on large content sets.

## Merging

A merge brings a source branch's changes into a target branch. Two strategies exist:

- **Fast-forward** moves the target head to the source head. It is only allowed when the target has no commits of its own since the fork; otherwise the merge is rejected with `Fast-forward merge not possible: branches have diverged`.
- **Three-way** (the default) compares both branches against their common ancestor. If a node was changed on both sides, the merge stops and reports conflicts. Otherwise it writes a merge commit on the target, with the target head as `parent` and the source head as `merge_parent`, and copies the source's changed nodes across. Reordering siblings on one branch does not count as a conflict.

```sql
MERGE BRANCH 'feature' INTO 'main' MESSAGE 'Merge feature';
-- result: Merge completed | revision 1788719765785 | fast_forward false | nodes_changed 2
```

When a three-way merge finds conflicts the result carries them, one per node, with the node's properties at the base, on the target (`ours`) and on the source (`theirs`):

```json
{
  "success": false,
  "revision": null,
  "conflicts": [{
    "node_id": "260584c1-...",
    "path": "",
    "conflict_type": "BothModified",
    "base_properties":   { "title": "Hello v3" },
    "target_properties": { "title": "Title from main" },
    "source_properties": { "title": "Title from c1" }
  }],
  "fast_forward": false,
  "nodes_changed": 0
}
```

`conflict_type` is one of `BothModified`, `BothAdded`, `DeletedBySourceModifiedByTarget` or `ModifiedBySourceDeletedByTarget`. The merge is completed by sending a resolution for each conflict (`keep-ours`, `keep-theirs` or `manual` with explicit properties) to the resolve endpoint; see [Merging Changes](/docs/guides/branching/merging-changes).

A merge never rewrites the source branch. Delete it afterwards if it is no longer needed.

## Promoting selected nodes

A merge takes a whole branch. When one branch holds work in progress and another holds what is live, `copyNodes` moves named subtrees instead, preserving node ids so a second promotion updates the same targets:

```typescript
await db.branches().copyNodes('staging', 'main', {
  workspace: 'content',
  roots: ['/products/kettle'],
  recursive: true,
});
// { copied: 1, deleted: 0, revision: '1788720003641-0', changes: [...] }
```

## Branch management

```sql
SHOW BRANCHES;                                   -- name, head, protected, upstream, created_at, created_by
DESCRIBE BRANCH 'feature';                       -- adds created_from and description
ALTER BRANCH 'release' SET PROTECTED TRUE;       -- no delete, no head reset, no merge into it
ALTER BRANCH 'feature' SET UPSTREAM 'develop';   -- default comparison base
ALTER BRANCH 'feature' SET DESCRIPTION 'Q3 redesign';
DROP BRANCH IF EXISTS 'feature';
```

Branches cannot be renamed; create a new one and drop the old one. A protected branch answers deletion, merge and head changes with `403 Forbidden` until protection is removed.

## Tags

A tag names one revision and never moves. Create one from a branch head, a history entry or a merge result:

```typescript
const head = await db.branches().getHead('main');
await db.tags().create('v1.0', head.revision, 'First release');
await db.tags().list();
// [{ name: 'v1.0', revision: '1788719765785-0', created_at: '...', created_by: 'system',
//    message: 'First release', protected: false }]
await db.tags().delete('v1.0');
```

The HTTP endpoints are `POST` and `GET /api/management/repositories/{tenant}/{repo}/tags` and `GET` or `DELETE .../tags/{name}`; the create body is `{"name", "revision", "message?", "created_by?", "protected?"}`. A protected tag cannot be deleted.

To read content at a tag, use its revision with the `rev/` REST segment or a `__revision` predicate; to start work from it, fork a branch with `fromRevision`. There is no SQL syntax for tags.

## Next Steps

- **[Git-Like Workflows](./git-like-workflows)** - Feature, environment and review workflows
- **[Revisions](./revisions)** - The revision model behind branches
- **[Working with Branches](/docs/guides/branching/working-with-branches)** - Step-by-step branch operations
- **[Merging Changes](/docs/guides/branching/merging-changes)** - Merge, conflicts and comparison
