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
