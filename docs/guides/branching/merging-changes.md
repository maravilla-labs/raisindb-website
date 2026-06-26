---
sidebar_position: 2
---

# Merging Changes

Merge changes from one branch to another — for example, promoting a `staging`
branch into `main`.

## Merge a Branch

### JavaScript Client

```typescript
// Merge feature-xyz INTO main
const result = await db.branches().merge('feature-xyz', 'main', {
  strategy: 'ThreeWay',           // default; fast-forwards when possible
  message: 'Merge feature-xyz',
});
// result: { success, revision, fast_forward, conflicts, ... }
```

### HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches/main/merge \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_branch": "feature-xyz",
    "strategy": "ThreeWay"
  }'
```

## Merge Strategies

- `ThreeWay`: Three-way merge creating a merge commit (default). Fast-forwards
  automatically when the target is an ancestor of the source.
- `FastForward`: Fast-forward only.

:::note
Merge and compare require the RocksDB storage backend (the default).
:::

## Sibling Order in Merges

A merge carries the **child order** of sibling nodes along with their content —
if you reordered pages, sections, or list items on the source branch, the target
branch reflects that order after the merge. See
[Child Ordering](/docs/concepts/data-model/paths-and-hierarchy#child-ordering).

Reordering a node on its own is **not** treated as a merge conflict: order is
reconciled from the source branch automatically. Conflicts are only raised when
the same node's **content** was changed on both branches.

In the [Admin Console](/docs/guides/admin-console/using-admin-console) merge
dialog, the per-node change preview groups affected nodes as **Added**,
**Modified**, **Reordered**, and **Deleted** so you can see exactly what a merge
will bring across before you run it.

:::tip Promoting content without a full merge
If you publish by copying selected nodes between branches instead of merging
whole branches, child order is not copied with the content. Replay it with
[`applyChildOrder()`](/docs/reference/javascript-client/node-operations#applychildorder).
:::

## Resolve Conflicts

If merge conflicts occur:

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches/main/resolve-merge \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conflicts": [
      {
        "node_id": "01HQRS...",
        "resolution": "ours"
      }
    ]
  }'
```

## Compare Branches

### JavaScript Client

```typescript
// How far feature-xyz has diverged from main (ahead / behind)
const divergence = await db.branches().compare('feature-xyz', 'main');
```

### HTTP API

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature-xyz/compare/main \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

- [Working with Branches](./working-with-branches.md)
- [Branches SDK reference](../../reference/javascript-client/branches.md)
