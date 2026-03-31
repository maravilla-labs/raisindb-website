---
sidebar_position: 2
---

# Merging Changes

Merge changes from one branch to another.

## Merge a Branch

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches/main/merge \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_branch": "feature-xyz",
    "strategy": "fast-forward"
  }'
```

## Merge Strategies

- `fast-forward`: Fast-forward merge if possible
- `recursive`: Three-way merge
- `ours`: Keep our version on conflict
- `theirs`: Take their version on conflict

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

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches/feature-xyz/compare/main \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

- [Working with Branches](./working-with-branches.md)
