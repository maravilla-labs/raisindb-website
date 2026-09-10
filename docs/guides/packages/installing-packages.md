---
sidebar_position: 2
---

# Installing Packages

A package is installed into one repository and branch. Upload puts the `.rap`
into the repository's `packages` workspace as a `raisin:Package` node; install
runs a background job that applies its schema, workspaces and content.

## List packages

```bash
raisindb package list --repo myapp
```

```
Packages in repository 'myapp':

  Name                          Version     Installed   Status
  ──────────────────────────────────────────────────────────────
  blog-starter                  1.0.0       -           uploaded
  raisin-auth                   1.0.0       ✓           installed
  imap-adapter                  1.7.0       -           -
  ...
```

Built-in packages that are registered but not installed show `-` in both
columns. The same list is available as `GET /api/repos/{repo}/packages`, which
returns the package nodes with their properties.

## Install a package

With the CLI, either install an uploaded package by name or deploy a folder and
install in one step:

```bash
raisindb package install blog-starter --repo myapp
raisindb deploy ./package --repo myapp --install
raisindb deploy ./package --repo myapp --install --branch staging
```

Both commands start the install job and poll until the package reaches a
terminal status. They exit `0` on `installed` and `1` on `failed`, printing the
server's error detail.

Over HTTP, the package is addressed by its name (the manifest `name`, not the
file name):

```bash
curl -X POST "http://localhost:8080/api/repos/myapp/packages/blog-starter/install?mode=sync" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"package_name":"blog-starter","version":"1.0.0","installed":false,"installed_at":null,"job_id":"4f0c..."}
```

The same operation exists on the command-style endpoint used by the admin
console, which also takes the branch in the path:

```bash
curl -X POST "http://localhost:8080/api/packages/myapp/main/head/blog-starter/raisin:install?mode=sync" \
  -H "Authorization: Bearer $TOKEN"
```

Query parameters on both: `mode` (default `skip`) and, on the first form,
`branch` (default `main`).

## What gets installed

The job runs these phases in order:

1. Nested `.rap` packages under `dependencies/` or `packages/`
2. Mixins, then node types, archetypes and element types
3. Workspaces
4. Processing rules
5. Workspace patches from the manifest
6. Package migrations from `migrations/*.yaml`
7. Content nodes, binaries and translation overlays
8. Package assets (`README.md`, `static/`), attached under the package node

Schema definitions are upserted in every mode. The install mode only governs
workspaces, processing rules and content.

## Migrations during install

Package migrations run automatically for normal installs, reinstalls and force
installs. They are intended for schema/content transitions that must touch
already-stored data, such as replacing a deleted node type, moving a subtree, or
patching role/config nodes before stricter content writes run.

Each migration is stored as an applied record on the package node with its `id`
and content hash. Reinstalling skips the same migration. If a migration file is
edited after it was applied, install fails instead of silently running a changed
operation under the old id.

## Install modes

| Mode | Existing content nodes | Existing workspaces and rules |
|------|------------------------|-------------------------------|
| `skip` | Left untouched; only missing nodes are created. | Kept. A workspace gains the package's `allowed_node_types` add-only. |
| `sync` | Updated from the package; missing nodes created; nodes the package does not define are left alone. | Replaced by the package definition. |
| `overwrite` | Replaced unconditionally. Also ignores the package's own `.raisin-sync.yaml`. | Replaced by the package definition. |

Which mode applies depends on how you install:

- `raisindb package install` sends no mode, so the server default `skip`
  applies.
- `raisindb deploy --install` sends `--mode sync` unless you pass
  `--mode skip` or `--mode overwrite`.
- The HTTP endpoints take `?mode=`.
- The admin console's Install and Reinstall buttons let you pick the mode.

Binary assets are compared by content hash in `skip` and `sync` mode, so an
unchanged file is not rewritten.

### Reinstalling

Installing an already-installed package in `skip` mode does nothing: the server
returns `installed: true` without a `job_id`, and the CLI says so:

```
Package 'blog-starter' is already installed, and mode 'skip' leaves existing
content untouched — nothing was applied.
Re-apply the package's content with: --mode sync
```

To ship updates to content the package owns, such as functions or seed
configuration, without asking operators to choose a mode, declare a per-path
policy in the package's [`.raisin-sync.yaml`](./creating-packages.md#install-policy-raisin-syncyaml).
A `replace` filter there overwrites its subtree in both `skip` and `sync` mode.

## Preview an install (dry run)

A dry run reports what an install would do without changing anything:

```bash
curl "http://localhost:8080/api/packages/myapp/main/head/blog-starter/raisin:dry-run?mode=sync" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "package_name": "blog-starter",
  "package_version": "1.0.0",
  "mode": "sync",
  "logs": [
    { "level": "info", "category": "manifest", "path": "manifest.yaml",
      "message": "Package: blog-starter v1.0.0", "action": "info",
      "policy": "package ships a .raisin-sync.yaml policy — see per-path entries below" },
    { "level": "create", "category": "node_type", "path": "blog:Article",
      "message": "Node type 'blog:Article' will be created", "action": "create" },
    { "level": "create", "category": "workspace", "path": "blog",
      "message": "Workspace 'blog' will be created", "action": "create" },
    { "level": "create", "category": "content", "path": "/posts/welcome",
      "message": "Content node 'welcome' will be created at /posts/welcome",
      "action": "create", "policy": "package sync policy: skip (default)" },
    { "level": "create", "category": "binary", "path": "functions/lib/blog/hello/index.js",
      "message": "Binary asset 'index.js' will be created (93 bytes)",
      "action": "create", "policy": "package sync policy: replace (filter '/functions')" }
  ],
  "summary": {
    "node_types": { "create": 1, "update": 0, "skip": 0 },
    "archetypes": { "create": 0, "update": 0, "skip": 0 },
    "element_types": { "create": 0, "update": 0, "skip": 0 },
    "workspaces": { "create": 1, "update": 0, "skip": 0 },
    "content_nodes": { "create": 4, "update": 0, "skip": 0 },
    "binary_files": { "create": 1, "update": 0, "skip": 0 },
    "package_assets": { "create": 2, "update": 0, "skip": 0 }
  }
}
```

Against a repository where the package is already installed, the same call
reports what a reinstall would do; here the package's policy keeps `/posts`
and replaces `/functions`:

```
skip    content  /posts/welcome                       package sync policy: skip (default)
update  content  /lib/blog/hello                      package sync policy: replace (filter '/functions')
update  binary   functions/lib/blog/hello/index.js    package sync policy: replace (filter '/functions')
```

Each entry carries an `action` of `create`, `update`, `skip` or `info`. The
`policy` field is present only when the package's `.raisin-sync.yaml` decided
the outcome, and names the rule that fired. Categories are `manifest`, `mixin`,
`node_type`, `archetype`, `element_type`, `workspace`, `processing_rule`,
`content`, `binary` and `package_asset`.

The admin console offers the same preview from a package's detail page, next to
Install and Reinstall.

## Uninstall a package

```bash
curl -X POST http://localhost:8080/api/repos/myapp/packages/blog-starter/uninstall \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"package_name":"blog-starter","version":"1.0.0","installed":false}
```

Uninstalling marks the package node as not installed and sets its status back
to `uploaded`. The nodes it created stay in place; the archive remains on the
server and can be installed again.

## Package status

The package node's `status` property tracks the lifecycle:

| Status | Meaning |
|--------|---------|
| `processing` | Upload accepted, manifest extraction running |
| `uploaded` | Archive stored, not installed (also after uninstall) |
| `installing` | Install job running |
| `installed` | Install finished; `installed: true`, `installed_at` set |
| `failed` | Processing or install failed; `error` holds the detail |

`raisindb package list` shows this column and prints the `error` for failed
packages.

## Next steps

- [Creating Packages](./creating-packages.md)
- [Sync and Watch](./sync-and-watch.md)
