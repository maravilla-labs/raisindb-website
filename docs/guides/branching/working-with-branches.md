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

## Next Steps

- [Merging Changes](./merging-changes.md)
- [Branches SDK reference](../../reference/javascript-client/branches.md)
