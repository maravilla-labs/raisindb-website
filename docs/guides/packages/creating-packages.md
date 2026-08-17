---
sidebar_position: 1
---

# Creating RAP Packages

RAP (Raisin Archive Package) is RaisinDB's packaging system for bundling, distributing, and installing content. A `.rap` file is a ZIP archive containing node type definitions, workspace configurations, content nodes, and associated files — like npm for your content.

## Package Structure

```
my-package-1.0.0.rap
  manifest.yaml              # Package metadata (required)
  mixins/                    # Mixin definitions (installed before node types)
    myapp_SEO.yaml
    myapp_Timestamps.yaml
  nodetypes/                 # Node type definitions
    blog_Article.yaml
    blog_Category.yaml
  workspaces/                # Workspace configuration files
    blog.yaml
  content/                   # Content organized by workspace
    blog/                    # Workspace name
      posts/                 # Directory structure
        welcome-post/        # Each node is a directory
          node.yaml          # Node metadata (node_type, properties)
          index.md           # Associated files
        getting-started/
          node.yaml
          index.md
          hero.png           # Binary assets
```

Every package must contain a `manifest.yaml` at the root. The other directories are optional — a package can provide only node types, only content, or any combination.

## Initialize a Package

```bash
raisindb init --pack my-package
```

This creates the scaffolding:

```
my-package/
  manifest.yaml
  nodetypes/
  mixins/
  workspaces/
  content/
```

## The Manifest

The `manifest.yaml` is the heart of every package. Here is the complete schema:

```yaml
# Required fields
name: my-package                       # Unique identifier (alphanumeric, hyphens, underscores)
version: 1.0.0                         # Semantic version string

# Metadata (all optional)
title: My Package                      # Human-readable display name
description: A great package           # Brief description
author: Your Name                      # Author or team
license: MIT                           # License identifier
icon: package                          # Lucide icon name for UI (default: "package")
color: "#6366F1"                       # Hex color for UI display (default: "#6366F1")
keywords:                              # Search keywords
  - content
  - starter
category: starter                      # Package category
builtin: false                         # If true, auto-installed on repo creation

# Dependencies
dependencies:
  - name: base-types
    version: ">=1.0.0"
  - name: core-functions
    version: ">=2.0.0"

# What this package provides
provides:
  mixins:
    - myapp:SEO
    - myapp:Timestamps
  nodetypes:
    - blog:Article
    - blog:Category
  workspaces:
    - blog
  content:
    - blog/welcome-post
    - blog/getting-started

# Workspace patches (applied during install)
workspace_patches:
  blog:
    allowed_node_types:
      add:
        - blog:Article
        - blog:Category
    default_folder_type: "raisin:Folder"

# Sync configuration (optional)
sync:
  remote:
    url: "https://raisindb.example.com"
    repo_id: "my-project"
    branch: "main"
    tenant_id: "default"
  defaults:
    mode: replace
    on_conflict: ask
    sync_deletions: true
    property_merge: shallow
```

### Manifest Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Unique identifier. Alphanumeric, hyphens, underscores only. |
| `version` | String | Yes | Semantic version (e.g., `1.0.0`). |
| `title` | String | No | Human-readable display name. |
| `description` | String | No | Brief description. |
| `author` | String | No | Author or team name. |
| `license` | String | No | License identifier (e.g., `MIT`, `Apache-2.0`). |
| `icon` | String | No | Lucide icon name for UI. Defaults to `"package"`. |
| `color` | String | No | Hex color code for UI. Defaults to `"#6366F1"`. |
| `keywords` | List | No | Tags for search and discovery. |
| `category` | String | No | Classification category. |
| `builtin` | Boolean | No | Auto-install on new repositories when `true`. |
| `dependencies` | List | No | Packages this package depends on. |
| `provides` | Object | No | Declares what the package contributes. |
| `workspace_patches` | Object | No | Workspace modifications applied during install. |
| `sync` | Object | No | Bidirectional local↔server sync configuration (remote connection + conflict strategy), consumed by the export/local-dev tooling. **Not** the per-path install-reconciliation policy — that's a separate file, [`.raisin-sync.yaml`](#reconciling-updates-raisin-syncyaml), described below. |

## Adding Mixins

Mixins are installed **before** node types. Place YAML files in the `mixins/` directory:

```yaml
# mixins/myapp_SEO.yaml
name: myapp:SEO
description: SEO metadata fields
is_mixin: true
properties:
  - name: meta_title
    type: String
  - name: meta_description
    type: String
  - name: og_image
    type: String
```

## Adding NodeTypes

Place node type definitions in the `nodetypes/` directory:

```yaml
# nodetypes/blog_Article.yaml
name: blog:Article
description: A blog article
mixins:
  - myapp:SEO
  - myapp:Timestamps
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
    required: true
  - name: excerpt
    type: String
  - name: category
    type: Reference
versionable: true
indexable: true
```

## Adding Content

Inside `content/`, each node is a directory containing a `node.yaml` and any associated files:

```yaml
# content/blog/posts/welcome-post/node.yaml
node_type: blog:Article
properties:
  title: Welcome to the Blog
  excerpt: Your first post is ready
  status: published
```

```markdown
<!-- content/blog/posts/welcome-post/index.md -->
# Welcome to the Blog

This is your first post. Edit it to get started!
```

Associated files (code, templates, images) are stored alongside `node.yaml` and bundled automatically.

## Workspace Patches

Patches modify workspace configurations during install — typically to register new node types:

```yaml
workspace_patches:
  blog:
    allowed_node_types:
      add:
        - blog:Article
        - blog:Category
  functions:
    allowed_node_types:
      add:
        - ai:Agent
    default_folder_type: "raisin:Folder"
```

Patches are idempotent — applying the same patch twice does not create duplicate entries.

### Reinstall behavior and existing workspaces

When a package is **reinstalled**, an existing workspace is never overwritten — its live configuration is preserved. To pick up node types your package newly provides, the installer **additively merges** the `allowed_node_types` from your package's own `workspaces/<name>.yaml` into the existing workspace (add-only; it never removes a type). So for workspaces your package defines, simply listing a type in the workspace's `allowed_node_types` is enough — you do not need to duplicate it under `workspace_patches`.

The merge is **skipped when the workspace already allows everything** — an empty `allowed_node_types` (which means "allow all") or one containing `"*"`. In that case the new type is already permitted, and merging would silently narrow the workspace. A literal `"*"` is never merged in.

Use `workspace_patches` when you need to extend a workspace your package does **not** define itself — for example, adding your node types to another package's workspace, or a shared workspace by name.

## Reconciling Updates: .raisin-sync.yaml

Install and reinstall default to **skip mode**: content nodes that already
exist are left untouched, so a redeploy never clobbers a user's edits. That's
the right default for user-owned content — but it also means anything your
package treats as **platform code**, not user content (server-side functions,
a config node, seed data that should stay in lockstep with the package), never
refreshes on an existing install unless the operator deliberately reinstalls
with a different [install mode](./installing-packages.md#install-modes) or you
push it by hand with `raisindb sync --push --force`.

For a package that ships updates to users who run their own installs — an
update channel, a self-hosted instance auto-updating itself, a re-provisioning
script — you can't rely on someone hand-running a force push every time.
Declare the reconciliation policy in the package itself instead: drop a
**`.raisin-sync.yaml`** file at the package root, next to `manifest.yaml`.

```yaml
# .raisin-sync.yaml  (package root, beside manifest.yaml — NOT a field inside it)
defaults:
  mode: skip               # preserve user content by default — never clobber
filters:
  - root: /functions        # platform code the user never hand-edits
    mode: replace            # always overwrite on update, so fixes/new fns land
```

It rides along inside the built `.rap` automatically — the packager includes
any file not excluded by `.gitignore`/`.rapignore`, so **don't gitignore this
file** (see the naming collision note below).

### How it's resolved

For every content path the install touches, the server's install job:

1. If the operator explicitly chose **`overwrite`** mode, `.raisin-sync.yaml`
   is ignored entirely and that path is overwritten — the clean-reset escape
   hatch always wins.
2. Otherwise, it finds the **last** matching entry in `filters` by path prefix
   (the prefix is `/{workspace}{node_path}`, e.g. `/functions/lib/notify`) and
   uses its `mode`. No filter matches → `defaults.mode` applies.
3. `mode: skip` never touches an existing node at that path (create only if
   missing). `mode: replace` always overwrites it, regardless of the
   operator's chosen install mode. `merge` and `update` also parse but aren't
   specially handled today — they fall through to whichever install mode the
   operator chose, so use `skip`/`replace` when you need an actual guarantee.

Keep `defaults` conservative (`skip`) and carve out only the paths you
consider platform-owned as `replace` — typically `/functions`, and any
configuration content your package manages exclusively.

### See it before you ship it

The [dry-run preview](./installing-packages.md#preview-an-install-dry-run)
annotates every affected path with *why* it will be created, updated, or
skipped whenever `.raisin-sync.yaml` (not the chosen install mode) decided the
outcome. A package that ships one also shows a "Custom Sync Policy" badge on
its list/detail page in the admin console — hover it for the default mode and
every filter — so you can confirm the policy landed without doing a real
install.

### Don't confuse it with the other `.raisin-sync.yaml`

The `raisindb sync` CLI command also reads a file named `.raisin-sync.yaml` —
but from your **local checkout**, not the package root inside a `.rap`. That
one is connection config (server URL, repo, branch, ignore patterns) for the
local↔server live-push workflow described in
[Sync and Watch](./sync-and-watch.md), and the CLI always excludes it from
what it pushes/packages. Same filename, same package-root location, entirely
different purpose from the install-reconciliation file above — and if your
project's `.gitignore` excludes the local connection-config version (common,
since it can carry a server URL), double-check it isn't also swallowing the
install-policy one. Verify what actually got packaged with:

```bash
unzip -l my-package-1.0.0.rap | grep raisin-sync
```

It's also unrelated to the manifest's own `sync:` field (in the field
reference above) — that one configures the same bidirectional local↔server
sync tooling, embedded in `manifest.yaml` instead of a local file.

## Dependencies

Packages can depend on other packages. Dependencies are resolved in topological order using Kahn's algorithm:

```yaml
dependencies:
  - name: core-functions
    version: ">=1.0.0"
  - name: base-types
    version: ">=2.0.0"
```

RaisinDB detects circular dependencies and reports the exact cycle:

```
Circular dependency detected:
  > A → B → C → A (cycle)

To resolve: Remove one of these dependency relationships.
```

## Build and Upload

### Build the Package

```bash
raisindb package create ./my-package
# Output: my-package-1.0.0.rap
```

### Upload to a Repository

```bash
raisindb package upload my-package-1.0.0.rap --repo myapp
```

### Inspect Before Installing

```bash
raisindb package inspect my-package-1.0.0.rap
```

Lists the manifest, included node types, mixins, content nodes, and file counts.

## Example: Blog Starter Kit

A complete package for bootstrapping a blog:

```yaml
# manifest.yaml
name: blog-starter
version: 1.0.0
title: Blog Starter Kit
description: Complete blog setup with articles, categories, and seed content
author: RaisinDB Team
icon: newspaper
color: "#3B82F6"
keywords: [blog, cms, content]
category: starter

dependencies:
  - name: base-types
    version: ">=1.0.0"

provides:
  mixins:
    - blog:Publishable
  nodetypes:
    - blog:Article
    - blog:Category
    - blog:Author
  workspaces:
    - blog
  content:
    - blog/welcome-post
    - blog/getting-started

workspace_patches:
  blog:
    allowed_node_types:
      add:
        - blog:Article
        - blog:Category
        - blog:Author
```

## Environment-Specific Values

Any value that differs between dev, staging and production — a preview server
URL, a public domain — belongs in an `{env:...}` token rather than in the YAML
literally:

```yaml
properties:
  domain: "{env:SITE_DOMAIN:-my-site.localhost}"
  dev_url: "{env:PREVIEW_SERVER:-http://localhost:5173}"
```

The CLI resolves these from your shell or a `.env` file when the package is
built, validated or pushed, so one source tree builds for every environment.
See [Environment Variables](./environment-variables.md).

## Next Steps

- [Installing Packages](./installing-packages.md) — Install packages into repositories
- [Built-in Packages](./builtin-packages.md) — Packages that ship with RaisinDB
- [Sync and Watch](./sync-and-watch.md) — Live development workflow
- [Environment Variables](./environment-variables.md) — `{env:...}` substitution in package YAML
