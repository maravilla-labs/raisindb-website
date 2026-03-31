---
sidebar_position: 4
---

# Sync and Watch

The `raisindb sync --watch` command enables a live development workflow where local package changes are automatically synchronized to your RaisinDB server. Edit node types, content, or configuration locally, and see changes reflected instantly.

## Basic Sync

Push local package content to a running server:

```bash
raisindb sync --repo myapp --branch main
```

This compares your local package files against the server state and uploads any changes.

## Watch Mode

For development, use `--watch` to continuously sync on file changes:

```bash
raisindb sync --watch --repo myapp --branch main
```

Watch mode:
1. Performs an initial sync of all local changes
2. Monitors the package directory for file modifications
3. Automatically syncs changed files to the server
4. Reports sync status in the terminal

This is ideal for iterative development — edit a `node.yaml` or `index.js` file, save, and the changes appear in your running RaisinDB instance within seconds.

## Sync Configuration

Configure sync behavior in your package's `manifest.yaml`:

```yaml
sync:
  remote:
    url: "http://localhost:8080"
    repo_id: "myapp"
    branch: "main"
    tenant_id: "default"
  defaults:
    mode: replace              # replace | merge | update
    on_conflict: prefer_local  # ask | prefer_local | prefer_server | prefer_newer
    sync_deletions: true       # propagate local deletes to server
    property_merge: shallow    # shallow | deep
```

### Sync Modes

| Mode | Behavior |
|------|----------|
| `replace` | Full replacement of server content with local (default) |
| `merge` | Combine local and server, keeping content from both |
| `update` | Only push changes, preserve unmodified server content |

### Conflict Strategies

| Strategy | Behavior |
|----------|----------|
| `ask` | Prompt in terminal for each conflict (default) |
| `prefer_local` | Always keep your local version |
| `prefer_server` | Always keep the server version |
| `prefer_newer` | Use whichever version has a newer timestamp |
| `merge_properties` | Attempt property-level merge |

## Path Filters

Control which paths are synced using filters:

```yaml
sync:
  filters:
    # Only sync YAML files in /content/pages
    - root: /content/pages
      mode: merge
      include:
        - "**/*.yaml"
      exclude:
        - "drafts/**"

    # Local-only development content, never pushed
    - root: /content/dev
      direction: local_only

    # System content pulled from server, never pushed
    - root: /system
      direction: server_only
      on_conflict: prefer_server
```

### Sync Directions

| Direction | Push | Pull | Use Case |
|-----------|------|------|----------|
| `bidirectional` | Yes | Yes | Default two-way sync |
| `local_only` | No | No | Local dev content, not synced |
| `server_only` | No | Yes | Pull from server, never push |
| `push_only` | Yes | No | Push to server, never pull |

## Sync Status

Check what has changed between local and server:

```bash
raisindb sync --status --repo myapp
```

Each file gets a status:

| Status | Meaning |
|--------|---------|
| `synced` | Identical locally and on server |
| `local_only` | Exists only locally (new file) |
| `server_only` | Exists only on server (deleted locally) |
| `modified` | Changed locally since last sync |
| `conflict` | Both local and server versions changed |

## Development Workflow

A typical development workflow with sync:

```bash
# 1. Initialize a package
raisindb init --pack my-feature

# 2. Start the server
RUST_LOG=info ./target/release/raisin-server --config node.toml

# 3. Start watch mode in another terminal
raisindb sync --watch --repo myapp --branch main

# 4. Edit files — changes sync automatically
# Edit nodetypes/blog_Article.yaml → NodeType updated on server
# Edit content/blog/posts/welcome/node.yaml → Content updated
# Add content/blog/posts/new-post/node.yaml → New node created

# 5. When ready, build the final package
raisindb package create ./my-feature
```

## Conflict Resolution

When both local and server have changes to the same file, sync detects a conflict.

In interactive mode (`on_conflict: ask`), you'll be prompted:

```
Conflict: content/blog/posts/welcome/node.yaml
  Local:  modified 2026-03-31T10:00:00Z
  Server: modified 2026-03-31T09:30:00Z

  [l] Keep local  [s] Keep server  [n] Keep newer  [d] Show diff  [a] Abort
```

For automated workflows, set a default strategy:

```yaml
sync:
  defaults:
    on_conflict: prefer_local
  conflicts:
    "/content/pages/home":
      strategy: prefer_server
      backup: true
```

Path-specific overrides in `conflicts` take precedence over defaults.

## Next Steps

- [Creating Packages](./creating-packages.md) — Package format and structure
- [Built-in Packages](./builtin-packages.md) — Pre-installed packages
- [Installing Packages](./installing-packages.md) — Package lifecycle
