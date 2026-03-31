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
| `sync` | Object | No | Bidirectional sync configuration. |

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

## Next Steps

- [Installing Packages](./installing-packages.md) — Install packages into repositories
- [Built-in Packages](./builtin-packages.md) — Packages that ship with RaisinDB
- [Sync and Watch](./sync-and-watch.md) — Live development workflow
