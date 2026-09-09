---
sidebar_position: 2
---

# Merging Changes

Merge one branch into another, for example a `feature` branch into `main`.
A merge writes a merge commit on the target and copies the source's changed
nodes across; the source branch is left as it was.

## Merge a branch

### JavaScript client

```typescript
// merge feature INTO main
const result = await db.branches().merge('feature', 'main', {
  strategy: 'ThreeWay',       // default; 'FastForward' to allow only a pointer move
  message: 'Merge feature',
});
// { success: true, revision: 1788719765785, conflicts: [], fast_forward: false, nodes_changed: 2 }
```

### SQL

```sql
MERGE BRANCH 'feature' INTO 'main' MESSAGE 'Merge feature';
-- result          | revision      | fast_forward | nodes_changed
-- Merge completed | 1788719765785 | false        | 2
```

### HTTP API

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myapp/branches/main/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source_branch": "feature", "strategy": "ThreeWay", "message": "Merge feature", "actor": "alice"}'
```

All four fields are required over HTTP. The response is the same merge result
as above. `revision` is the millisecond part of the merge commit's HLC; read
the branch head if you need the full `timestamp-counter` string.

## Merge strategies

- `ThreeWay` (default): compares both branches with their common ancestor,
  reports conflicts if the same node changed on both sides, otherwise creates a
  merge commit whose `parent` is the old target head and whose `merge_parent`
  is the source head.
- `FastForward`: moves the target head to the source head and creates no
  commit. It is only allowed when the target has no commits of its own since
  the fork; otherwise the call fails with
  `Fast-forward merge not possible: branches have diverged`.

If both heads are already equal the merge succeeds with `nodes_changed: 0`.
A protected target branch rejects the merge with `403 Forbidden`.

:::note
Merge, compare, diff and `copyNodes` require the RocksDB storage backend (the
default).
:::

## Sibling order in merges

A merge carries the child order of sibling nodes along with their content.
Reordering a node on one branch is reported in the diff as `reordered` but is
not treated as a conflict, even when the other branch edited that node's
content; the order from the source branch is applied. See
[Child Ordering](/docs/concepts/data-model/paths-and-hierarchy#sibling-order).

In the [Admin Console](/docs/guides/admin-console/using-admin-console) merge
dialog, the preview groups affected nodes as **Added**, **Modified**,
**Reordered** and **Deleted** before you run the merge.

:::tip Promoting content without a full merge
If you publish by copying selected nodes between branches instead of merging
whole branches, child order is not copied with the content. Replay it with
[`applyChildOrder()`](/docs/reference/javascript-client/node-operations#applychildorder).
:::

## Conflicts

A three-way merge stops when a node was changed on both branches since the
common ancestor. The result then has `success: false` and one entry per node:

```json
{
  "success": false,
  "revision": null,
  "conflicts": [{
    "node_id": "260584c1-62d7-49a9-b536-8ee18455f3c3",
    "path": "",
    "conflict_type": "BothModified",
    "base_properties":   { "title": "Hello v3" },
    "target_properties": { "title": "Title from main" },
    "source_properties": { "title": "Title from feature" }
  }],
  "fast_forward": false,
  "nodes_changed": 0
}
```

`conflict_type` is `BothModified`, `BothAdded`, `DeletedBySourceModifiedByTarget`
or `ModifiedBySourceDeletedByTarget`. A conflict on a translation carries a
`translation_locale`. In SQL the merge statement fails with the conflict list in
the error, and `SHOW CONFLICTS FOR MERGE 'feature' INTO 'main'` returns the same
rows.

### Resolve conflicts

Complete the merge by sending one resolution per conflicted node to the
`resolve-merge` endpoint. Each resolution names the side to keep and the final
properties:

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myapp/branches/main/resolve-merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_branch": "feature",
    "resolutions": [{
      "node_id": "260584c1-62d7-49a9-b536-8ee18455f3c3",
      "resolution_type": "keep-theirs",
      "resolved_properties": { "title": "Title from feature" }
    }],
    "message": "Merge feature (resolved)",
    "actor": "alice"
  }'
# {"success":true,"revision":1788719912532,"conflicts":[],"fast_forward":false,"nodes_changed":1}
```

`resolution_type` is `keep-ours` (the target's version), `keep-theirs` (the
source's version) or `manual` (the properties you supply). A resolution for a
node that did not change on both branches is rejected. The SQL form is
`MERGE BRANCH ... RESOLVE CONFLICTS (('node-id', USE_VALUE '{...}'))`; see the
[SQL branch reference](../../reference/sql/statements/branch.md#merge-branch).

## Compare branches

`compare` gives commit counts; `diff` lists the changed nodes. Both are relative
to the common ancestor, so their cost follows the size of the change rather
than the repository.

### JavaScript client

```typescript
await db.branches().compare('feature', 'main');
// { ahead: 2, behind: 1, common_ancestor: '1788719729588-0' }

await db.branches().diff('feature', 'main');
// { common_ancestor: '1788719729588-0',
//   added:    [{ node_id: 'f29d5b20-...', workspace: 'content', path: '/feature-only', operation: 'added' }],
//   modified: [{ node_id: '260584c1-...', workspace: 'content', path: '/hello', operation: 'modified' }],
//   deleted:  [] }
```

### HTTP API

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature/compare/main \
  -H "Authorization: Bearer $TOKEN"
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature/diff/main \
  -H "Authorization: Bearer $TOKEN"
```

### SQL

```sql
SHOW DIVERGENCE 'feature' FROM 'main';
-- branch  | base | ahead | behind | common_ancestor
-- feature | main | 2     | 1      | 1788719729588-0
```

## Next Steps

- [Working with Branches](./working-with-branches.md)
- [Branches SDK reference](../../reference/javascript-client/branches.md)
- [Branches HTTP API](../../reference/http-api/branches-api.md)
