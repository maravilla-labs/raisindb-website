---
sidebar_position: 1
---

# Working with Branches

Branches let you work on changes in isolation before merging to main. A branch
forked with `fromBranch` is a **full copy** of the source — its nodes, indexes,
and schema (archetypes, element types, node types) — so you can write archetyped
content to it immediately.

## Create a Branch

### JavaScript Client

```typescript
// Fork a branch from main's HEAD (copies schema + content)
await db.branches().create('feature-xyz', { fromBranch: 'main' });
```

See the [Branches SDK reference](../../reference/javascript-client/branches.md)
for the full API.

### HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "feature-xyz",
    "from_branch": "main",
    "description": "Feature XYZ development"
  }'
```

## List Branches

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer TOKEN"
```

## Switch Branch

### JavaScript Client

```typescript
const featureWs = db.workspace('content').onBranch('feature-xyz');

await featureWs.nodes().create({
  type: 'Article',
  path: '/articles/new-feature',
  properties: { title: 'New Feature' }
});
```

### Via API Path

```bash
# Create node on feature branch
curl -X POST \
  http://localhost:8080/api/repository/myapp/feature-xyz/head/content/articles/test \
  -H "Authorization: Bearer TOKEN" \
  -d '{"node_type": "Article", "properties": {"title": "Test"}}'
```

## Delete a Branch

```bash
curl -X DELETE \
  http://localhost:8080/api/management/repositories/default/myapp/branches/feature-xyz \
  -H "Authorization: Bearer TOKEN"
```

## Deploy a Package to a Branch

The CLI can upload and install a package onto any branch with `--branch`:

```bash
# Deploy schema + content to a `staging` branch (not main)
raisindb deploy ./package --repo myapp --branch staging --install
```

`deploy`, `sync`, and `install` all accept `-b, --branch <name>` (default
`main`). See the [CLI commands reference](../../reference/cli/commands.md#package-deploy).

## Promote Selected Nodes to Another Branch

Merging moves a whole branch. When one branch holds work in progress and another
holds what is live, you usually want to move *some* of it — a page and what it
needs, not everything anyone has touched. `copyNodes` takes named roots:

```typescript
const at = await db.branches().getHead('main');   // pin: decide once, copy that

await db.branches().copyNodes('main', 'live', {
  workspace: 'content',
  roots: ['/products/kettle'],
  recursive: true,
  sourceRevision: at,
});
```

Two properties make this usable as a publishing step:

- **Ids are preserved**, so promoting the same root again updates the same
  target nodes. Repeat promotions are idempotent for a given source state, and
  anything referencing a promoted node keeps resolving.
- **The pin is a real snapshot.** Copying a large set takes time, and without
  `sourceRevision` the source is read at HEAD as each node's turn comes — so a
  write landing mid-copy ends up partly inside the result, with nothing to
  report it. Pinning is what makes "publish what I reviewed" true rather than
  "publish whatever is there when the copy gets to it".

The copy carries the whole node, translation overlays included, and lands in one
atomic commit. Each root's parent must already exist on the target branch.

See the [Branches SDK reference](../../reference/javascript-client/branches.md#copynodes)
for the full argument list.

## Next Steps

- [Merging Changes](./merging-changes.md)
- [Branches SDK reference](../../reference/javascript-client/branches.md)
