---
sidebar_position: 5
---

# Branches API

Manage repository branches.

## Create Branch

```bash
POST /api/management/repositories/{tenant}/{repo}/branches
```

Request:

```json
{
  "name": "feature-xyz",
  "from_branch": "main",
  "description": "Feature XYZ"
}
```

## List Branches

```bash
GET /api/management/repositories/{tenant}/{repo}/branches
```

## Get Branch

```bash
GET /api/management/repositories/{tenant}/{repo}/branches/{name}
```

## Delete Branch

```bash
DELETE /api/management/repositories/{tenant}/{repo}/branches/{name}
```

## Merge Branches

```bash
POST /api/management/repositories/{tenant}/{repo}/branches/{target}/merge
```

Request:

```json
{
  "source_branch": "feature-xyz",
  "strategy": "fast-forward"
}
```

## Compare Branches

```bash
GET /api/management/repositories/{tenant}/{repo}/branches/{branch}/compare/{base}
```

Returns the divergence counts (`ahead`, `behind`) and the common ancestor.

## Diff Branches

Per-node changes of a branch relative to a base branch — which nodes were added,
modified, reordered, or deleted since the branches diverged. Cost scales with the
size of the change, not the repository.

```bash
GET /api/management/repositories/{tenant}/{repo}/branches/{branch}/diff/{base}
```

Response:

```json
{
  "common_ancestor": "...",
  "added":    [{ "node_id": "...", "workspace": "content", "path": "/menu/new", "operation": "added" }],
  "modified": [
    { "node_id": "...", "workspace": "content", "path": "/menu/home",  "operation": "modified" },
    { "node_id": "...", "workspace": "content", "path": "/menu/about", "operation": "reordered" }
  ],
  "deleted":  [{ "node_id": "...", "workspace": "content", "path": "/menu/old", "operation": "deleted" }]
}
```

`operation` is one of `added`, `modified`, `reordered`, or `deleted`. Reordered
entries are returned in the `modified` array. Requires the RocksDB storage
backend.
