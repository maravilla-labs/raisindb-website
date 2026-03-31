---
sidebar_position: 1
---

# Working with Branches

Branches let you work on changes in isolation before merging to main.

## Create a Branch

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

## Next Steps

- [Merging Changes](./merging-changes.md)
