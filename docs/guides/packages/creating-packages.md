---
sidebar_position: 1
---

# Creating RAP Packages

A RAP (Raisin Archive Package) bundles schema, workspaces, content and functions
into one installable unit. A `.rap` file is a ZIP archive with a `manifest.yaml`
at its root. You author it as a plain folder, build it with the CLI, upload it to
a repository and install it there.

## Package layout

```
my-package/
  manifest.yaml              # required: name, version, metadata
  .raisin-sync.yaml          # optional: per-path install policy (see below)
  mixins/                    # mixin definitions, installed before node types
    blog_SEO.yaml
  nodetypes/                 # node type definitions
    blog_Article.yaml
  archetypes/                # archetype definitions
  elementtypes/              # element type definitions
  workspaces/                # workspace definitions, one file per workspace
    blog.yaml
  processing-rules/          # asset-processing rules (optional)
    assets.yaml
  migrations/                # declarative install-time migrations
    2026-09-contact-to-party-person.yaml
  content/                   # content, grouped by workspace
    blog/                    # workspace name
      posts/
        .node.yaml           # the "posts" folder node
        getting-started.yaml # a node named "getting-started"
        welcome/
          .node.yaml         # the "welcome" node
          hero.png           # a raisin:Asset child of "welcome"
    functions/
      lib/my-package/hello/
        .node.yaml           # a raisin:Function node
        index.js             # its code, stored as an asset child
  static/                    # package assets shown in the console
  README.md                  # shown on the package detail page
```

Only `manifest.yaml` is required. A package can ship schema only, content only,
or any combination.

## Scaffold a project

```bash
raisindb package init my-app --workspace blog
```

This creates a project folder with the package under `package/`, a `frontend/`
placeholder and agent instruction files. The default template pack is
`content-modeling`; `--pack minimal` produces a smaller tree and a root
`package.json` with `validate`, `build`, `deploy` and `sync` scripts. Add
`--skip-install` to skip `npm install` and the agent-skills installation.

## The manifest

```yaml
name: blog-starter                     # required, [A-Za-z0-9_-]
version: 1.0.0                         # required
title: Blog Starter Kit
description: Articles, categories and seed content
author: Your Name
license: MIT
icon: newspaper                        # Lucide icon name, default "package"
color: "#3B82F6"                       # default "#6366F1"
keywords: [blog, cms]
category: examples

provides:
  mixins:
    - blog:SEO
  nodetypes:
    - blog:Article
  workspaces:
    - blog
  content:
    - blog/posts/welcome

workspace_patches:
  functions:
    default_folder_type: raisin:Folder
    allowed_node_types:
      add:
        - blog:Article
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Package identifier. Letters, digits, hyphens and underscores. Becomes the node path under the `packages` workspace. |
| `version` | yes | Version string, shown in listings and used for the `.rap` file name. |
| `title`, `description`, `author`, `license`, `keywords`, `category` | no | Display metadata for the admin console. |
| `icon`, `color` | no | Lucide icon name and hex color for the console. |
| `builtin`, `auto_install` | no | Used by the packages embedded in the server binary. `auto_install: false` registers a built-in package without installing it into every repository. |
| `dependencies` | no | List of `{name, version}` entries. Informational today; see [Dependencies](#dependencies). |
| `provides` | no | Declares what the package contributes. The server reads `nodetypes`, `mixins`, `workspaces`, `content` and `mcp_servers`; other keys such as `functions` or `triggers` are accepted and ignored. |
| `workspace_patches` | no | Changes applied to existing workspaces at install time. |
| `migrations/` | no | Ordered YAML files that migrate existing installed data before content is installed. |
| `sync` | no | Configuration for the export tooling. The install job does not read it; the install policy lives in `.raisin-sync.yaml`. |

## Mixins and node types

Schema files are YAML documents with a `name` and a `properties` list. Mixins
are installed before node types so a node type can reference them.

```yaml
# mixins/blog_SEO.yaml
name: blog:SEO
title: SEO
is_mixin: true
properties:
  - name: meta_title
    type: String
  - name: meta_description
    type: String
```

```yaml
# nodetypes/blog_Article.yaml
name: blog:Article
title: Article
description: A blog article
mixins:
  - blog:SEO
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
  - name: status
    type: String
    default: draft
versionable: true
```

`raisindb package validate` warns when a node type references a mixin or type
that is neither built in nor defined in the same package.

## Workspaces

Each file under `workspaces/` defines one workspace. `root_structure` creates
folders at install time.

```yaml
# workspaces/blog.yaml
name: blog
title: Blog
icon: newspaper
color: "#3B82F6"

allowed_node_types:
  - raisin:Folder
  - blog:Article

allowed_root_node_types:
  - raisin:Folder

root_structure:
  - name: posts
    node_type: raisin:Folder
    title: Posts
```

A workspace whose name contains a namespace, such as `raisin:access_control`,
is spelled `_raisin__access_control` as a directory name under `content/`.

## Content

Content lives under `content/{workspace}/`. The installer reads nothing else, so
a node placed outside `content/` is packed into the archive and then skipped at
install time. The install still reports success, because no step in the chain
has an opinion about a file it never looks at. The server logs a warning naming
the stranded files when it sees any.

The directory structure is the node hierarchy, and the file name decides the
node name:

| File | Becomes |
|------|---------|
| `posts/.node.yaml` | the node `/posts` (a `.node.yaml` describes its own directory) |
| `posts/getting-started.yaml` | the node `/posts/getting-started` |
| `posts/welcome/hero.png` | a `raisin:Asset` node at `/posts/welcome/hero.png` |
| `posts/welcome/.node.hero.png.yaml` | title, description and properties for `hero.png` |
| `posts/welcome/.node.de.yaml` | German translation overlay for `/posts/welcome` |

A node file carries the type and properties. A top-level `name:` overrides the
name derived from the path; `properties.name` does not.

```yaml
# content/blog/posts/welcome/.node.yaml
node_type: blog:Article
properties:
  title: Welcome to the blog
  body: Your first post is ready.
  status: published
```

A function is a `raisin:Function` node whose code sits beside it. The code file
is installed as an asset child of the function node, and `entry_file` names it:

```yaml
# content/functions/lib/my-package/hello/.node.yaml
node_type: raisin:Function
properties:
  name: hello
  title: Hello
  enabled: true
  language: javascript
  execution_mode: sync
  entry_file: index.js:handler
```

```js
// content/functions/lib/my-package/hello/index.js
export function handler(input) {
  return { greeting: `Hello, ${input.name || 'world'}` };
}
```

After installation the two nodes exist at `/lib/my-package/hello` and
`/lib/my-package/hello/index.js` in the `functions` workspace.

## Processing rules

`processing-rules/*.yaml` ships the rules that decide what happens to uploaded
binaries. A file may hold one rule or a list. Rules are matched in `order`,
first match wins, so keep rules that belong together in one file.

```yaml
# processing-rules/assets.yaml
- id: blog-pdfs
  name: PDFs
  order: 10
  matcher:
    type: mime_type
    mime_type: application/pdf
  settings:
    tasks: [extract_text]

- id: blog-images
  name: Images
  order: 20
  matcher:
    type: mime_type
    mime_type: image/*
  settings:
    tasks: [image_embedding]
```

Matcher types are `all`, `node_type`, `path`, `mime_type`, `workspace`,
`property` and `combined`. Settings accept `tasks`, `chunking`, `pdf_strategy`
and `generate_image_embedding`. Rules are installed after workspaces and before
content, so a package's own seed assets are matched by the rules it ships.

In the default `skip` install mode a rule whose `id` already exists is left as
the operator configured it. In `sync` or `overwrite` mode the package's version
replaces it. See [Asset Processing](../ai/asset-processing.md) for the matcher
forms and task names.

## Workspace patches

Patches extend workspaces the package does not define itself, typically to
register your node types in a shared workspace such as `functions`:

```yaml
workspace_patches:
  functions:
    default_folder_type: raisin:Folder
    allowed_node_types:
      add:
        - raisin:AIAgent
```

Applying the same patch twice does not duplicate entries.

### Reinstalling into existing workspaces

What happens to a workspace that already exists depends on the
[install mode](./installing-packages.md#install-modes):

- **`skip`** (the server default) keeps the existing workspace and only merges
  the package's `allowed_node_types` into it, add-only. The merge is skipped when
  the workspace already allows everything (an empty list or `"*"`), so an
  unrestricted workspace is never narrowed.
- **`sync`** and **`overwrite`** replace the workspace definition with the one in
  the package. `raisindb deploy --install` uses `sync` by default and, after the
  install, re-applies `allowed_node_types` and `allowed_root_node_types` from
  each `workspaces/*.yaml` to workspaces that already existed.

## Package migrations

Put declarative migration files under `migrations/` when a package release must
repair existing installed data before new content can pass stricter validators.
Migration files are ordered by filename, run after schema definitions and
`workspace_patches`, and run before content nodes, binaries and translations.

```yaml
# migrations/2026-09-contact-to-party-person.yaml
id: 2026-09-contact-to-party-person
title: Contact to party person
operations:
  - replace_node_type:
      workspace: people
      from: studio:Contact
      to: party:Person
      archetype_from: studio:ContactPage
      archetype_to: party:PersonPage
  - patch_nodes:
      workspace: raisin:access_control
      path: /roles/editors
      properties:
        permissions:
          add:
            - action: create
              node_types: [party:Person]
  - move_node:
      workspace: people
      from: /contacts
      to: /people
      on_collision: skip
  - delete_node:
      workspace: people
      path: /legacy/tmp
      if_empty: true
```

Supported operations are `replace_node_type`, `patch_nodes`, `move_node`, and
`delete_node`. `delete_node` defaults to `if_empty: true`; recursive delete is
available only when the operator installs in `overwrite` mode. Applied
migrations are recorded on the package node by `id` and file hash. A reinstall
skips an already-applied migration with the same hash and rejects a migration
whose file changed after it was applied.

The admin console shows shipped/applied migrations on the package detail page.

## Install policy: `.raisin-sync.yaml`

By default an install leaves existing content nodes alone, so redeploying a
package does not clobber edits users made on the server. That is right for
user-owned content, but a package usually also ships things that should always
track the package: functions, configuration nodes, seed data.

A `.raisin-sync.yaml` at the package root, beside `manifest.yaml`, declares a
per-path policy that the install job applies whatever mode the operator chose:

```yaml
# .raisin-sync.yaml
defaults:
  mode: skip               # keep existing content nodes
filters:
  - root: /functions       # /{workspace}{node_path} prefix
    mode: replace          # always overwrite this subtree
```

For each content node and binary the install touches:

1. If the operator chose `overwrite` mode, the policy is ignored and the path is
   overwritten.
2. Otherwise the last matching `filters` entry (by path prefix) decides. The
   path compared is `/{workspace}{node_path}`, for example
   `/functions/lib/my-package/hello`. With no match, `defaults.mode` applies.
3. `skip` creates the node only if it is missing. `replace` always overwrites.
   `merge` and `update` are accepted but defer to the operator's install mode.

The file ships inside the `.rap` automatically (it is not excluded by the
default ignore list), and the uploaded package node gets a `sync_policy`
property summarising it. The admin console shows a policy badge on such
packages, and the [dry run](./installing-packages.md#preview-an-install-dry-run)
annotates each path with the rule that decided its outcome:

```
create content /posts/welcome            | package sync policy: skip (default)
create content /lib/my-package/hello     | package sync policy: replace (filter '/functions')
```

Check that the file was packaged with `unzip -l my-package-1.0.0.rap`.

:::note A different file with a similar name
The CLI's local sync configuration is `.raisindb-cli.yaml` (see
[Sync and Watch](./sync-and-watch.md)). Older CLI versions wrote it as
`.raisin-sync.yaml`; the current CLI still reads that name, but only when the
file has a `server` field, so an install policy is never mistaken for it.
:::

## Dependencies

The install job installs nested packages first: any `.rap` placed under
`dependencies/` or `packages/` inside your package is installed before the
outer package, up to three levels deep, and each nested package applies its own
`.raisin-sync.yaml`.

The `dependencies` list in the manifest is parsed and shown, but the server does
not resolve it against installed packages. Ship what you depend on as a nested
`.rap`, or install it first.

## Build and upload

```bash
raisindb package validate ./my-package        # schema + flow checks, no file written
raisindb package create ./my-package          # writes my-package-1.0.0.rap
raisindb package upload my-package-1.0.0.rap --repo myapp
raisindb package install my-package --repo myapp
```

`package create` validates first and refuses to build on errors. Files matched
by `.gitignore`, `.rapignore` or the built-in ignore list (`node_modules`,
`target`, `.env*`, editor files) are left out. `raisindb deploy ./my-package
--repo myapp --install` does all four steps in one go.

To inspect a built archive, list it with `unzip -l`, or upload it and browse it
in the admin console or with
`GET /api/packages/{repo}/main/head/{name}/raisin:browse`.

## Environment-specific values

Values that differ between dev, staging and production belong in `{env:...}`
tokens rather than in the YAML literally:

```yaml
properties:
  domain: "{env:SITE_DOMAIN:-my-site.localhost}"
  dev_url: "{env:PREVIEW_SERVER:-http://localhost:5173}"
```

The CLI resolves them from your shell or a `.env` file when the package is
validated, built or pushed. See [Environment Variables](./environment-variables.md).

## Next steps

- [Installing Packages](./installing-packages.md)
- [Built-in Packages](./builtin-packages.md)
- [Sync and Watch](./sync-and-watch.md)
- [Environment Variables](./environment-variables.md)
