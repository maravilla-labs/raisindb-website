---
sidebar_position: 2
---

# Installing Packages

Install RAP packages to add features to your repository.

## List Available Packages

```bash
raisindb package list --repo myapp
```

## Install a Package

```bash
raisindb package install blog-starter --repo myapp
```

Via API:

```bash
curl -X POST \
  http://localhost:8080/api/repos/myapp/packages/blog-starter-1.0.0/install \
  -H "Authorization: Bearer TOKEN"
```

## What Gets Installed

When you install a package:
1. Mixins are installed (if any)
2. NodeTypes are created
3. Workspaces are created or patched
4. Content nodes are imported (including functions, templates, etc.)

### Reinstalling

Reinstalling a package never overwrites an existing workspace. New NodeTypes are still made usable in workspaces the package defines: their `allowed_node_types` are **additively merged** into the existing workspace (add-only, never removing types), so a reinstall that adds a type makes it usable without manual intervention. Workspaces that already allow everything (empty `allowed_node_types` or `"*"`) are left untouched. See [Workspace Patches](./creating-packages.md#workspace-patches) for extending workspaces your package does not own.

## Uninstall a Package

```bash
curl -X POST \
  http://localhost:8080/api/repos/myapp/packages/blog-starter-1.0.0/uninstall \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

- [Creating Packages](./creating-packages.md)
