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

This endpoint — and `raisindb package install` / `raisindb deploy --install` —
always install in the default **skip** mode (below); the CLI has no flag to
change it yet. To choose a different install mode, or to preview an install
first, use the command-style endpoint the **admin console**'s package page
uses:

```bash
curl -X POST \
  "http://localhost:8080/api/packages/myapp/main/head/blog-starter-1.0.0/raisin:install?mode=sync" \
  -H "Authorization: Bearer TOKEN"
```

## What Gets Installed

When you install a package:
1. Mixins are installed (if any)
2. NodeTypes are created
3. Workspaces are created or patched
4. Content nodes are imported (including functions, templates, etc.)

## Install Modes

Every install/reinstall runs in one of three modes, controlling what happens
to **content nodes** that already exist at a path the package also defines
(schema — node types, archetypes, element types, mixins — is always upserted,
regardless of mode; only content honors this setting):

| Mode | Behavior |
|------|----------|
| `skip` (default) | Never touch existing content nodes — only create ones that don't exist yet. Safest for repeat installs; a user's edits are never clobbered. |
| `sync` | Update existing content nodes, create new ones, leave nodes the package no longer defines untouched. |
| `overwrite` | Delete and replace existing content unconditionally — a clean reset. This mode also **always wins over a package's own `.raisin-sync.yaml`** (below), for exactly this "start over" use case. |

Pass it as `?mode=` on the `raisin:install` / `raisin:dry-run` endpoints (the
admin console's Install/Reinstall/Preview buttons let a user pick it
directly). There is currently no `raisindb package install`/`deploy --install`
CLI flag for it — those always use `skip`.

### Reinstalling

Reinstalling a package never overwrites an existing workspace. New NodeTypes are still made usable in workspaces the package defines: their `allowed_node_types` are **additively merged** into the existing workspace (add-only, never removing types), so a reinstall that adds a type makes it usable without manual intervention. Workspaces that already allow everything (empty `allowed_node_types` or `"*"`) are left untouched. See [Workspace Patches](./creating-packages.md#workspace-patches) for extending workspaces your package does not own.

Since the CLI always installs in `skip` mode, a `deploy --install` / `sync
--push` redeploy never updates existing content — including server-side
functions and seed nodes — no matter which command you used. If your package
ships updates that must always reach an already-installed repository (a bug
fix in a function, a newly-added seed node), declare a **per-path override**
in a
[`.raisin-sync.yaml`](./creating-packages.md#reconciling-updates-raisin-syncyaml)
file at the package root — it applies regardless of which install mode ends
up being used.

## Preview an Install (Dry Run)

Before committing to an install or reinstall, preview exactly what will
happen — no changes are made:

```bash
curl "http://localhost:8080/api/packages/myapp/main/head/blog-starter-1.0.0/raisin:dry-run?mode=sync" \
  -H "Authorization: Bearer TOKEN"
```

The response lists every node type, workspace, content node, and binary
asset the install would touch, with an action (`create` / `update` / `skip`)
and a create/update/skip summary count per category:

```json
{
  "package_name": "blog-starter",
  "package_version": "1.1.0",
  "mode": "skip",
  "logs": [
    {
      "level": "skip",
      "category": "content",
      "path": "/welcome-post",
      "message": "Content node at '/welcome-post' already exists, will skip",
      "action": "skip"
    },
    {
      "level": "update",
      "category": "content",
      "path": "/functions/lib/notify",
      "message": "Content node at '/functions/lib/notify' exists, will update",
      "action": "update",
      "policy": "package sync policy: replace (filter '/functions')"
    }
  ],
  "summary": { "content_nodes": { "create": 0, "update": 1, "skip": 1 }, "...": "..." }
}
```

The optional `policy` field on a log entry appears only when the package's own
`.raisin-sync.yaml` — not the `mode` you passed — determined that path's
outcome, and explains which rule fired. The admin console's package Preview
dialog surfaces this the same way, with a banner when the package ships a
policy at all.

The **admin console** exposes the same preview from a package's detail page
("Preview" next to Install/Reinstall), and shows a "Custom Sync Policy" badge
on any package that ships a `.raisin-sync.yaml`.

## Uninstall a Package

```bash
curl -X POST \
  http://localhost:8080/api/repos/myapp/packages/blog-starter-1.0.0/uninstall \
  -H "Authorization: Bearer TOKEN"
```

## Next Steps

- [Creating Packages](./creating-packages.md)
