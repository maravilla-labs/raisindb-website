---
sidebar_position: 4
---

# Sync and Watch: The Development Loop

RaisinDB packages are the unit of deployment — but during development you
don't want to rebuild and reinstall a package for every edit. The CLI gives
you a two-speed loop:

- **`raisindb deploy --install`** — full build → upload → install. Use it for
  the first install and whenever *structure* changes (manifest, node types,
  workspace definitions).
- **`raisindb sync --watch`** — watches your package directory and pushes
  each changed *content* node to the running instance live (typically within
  a second or two of saving).

## Local development setup

```bash
# 1. Authenticate (writes server + token to .raisinrc)
raisindb login --server http://localhost:8081 --username admin --password '...'

# 2. Create the target repository
raisindb repo create myapp --exists-ok

# 3. First install
raisindb deploy ./package --repo myapp --install

# 4. Develop: push changes live as you edit
raisindb sync ./package --repo myapp --watch
```

`deploy --install` validates the package, builds the `.rap`, uploads it,
starts the install job, and **waits for the final state**: it succeeds only
when the package reaches status `installed`, and fails with the server's
error detail when the status becomes `failed`.

`sync ./package --repo myapp` needs no config file — the repository comes
from the flag and the server/token from `raisindb login` (or environment
variables, see CI below). If a `.raisin-sync.yaml` exists in the package
directory it is used; run `raisindb sync --init` to create one.

## What watch mode syncs

Watch mode maps each changed file to the node the package installer created
from it:

| You edit | What happens on the server |
|----------|---------------------------|
| `content/{ws}/.../{dir}/.node.yaml` | Properties of the `{dir}` node are updated (PUT) |
| `content/{ws}/.../{name}.yaml` | Properties of the `{name}` node are updated (PUT) |
| `content/{ws}/.../index.js` (also `.py`, `.star`) | The asset node's inline `code` property is updated — the function runtime picks it up on the next call |
| `content/{ws}/.../{base}.{locale}.yaml` | Translations for `{base}` are applied via the translate command |
| other binary files | Re-uploaded as the asset's `file` resource (multipart) |
| `manifest.yaml`, `nodetypes/`, `workspaces/`, `mixins/`, `archetypes/` | **Not synced** — these are applied at install time. The watcher prints a re-deploy hint |

When a structural file changes, finish your edit and run:

```bash
raisindb deploy ./package --repo myapp --install
```

On an interactive terminal, watch mode renders a live status UI. When stdout
is not a TTY (CI, piped to a file), it prints plain log lines instead:

```
[watch] watching /work/myapp/package
[watch] target http://localhost:8081 repo=myapp branch=main
[watch] 2026-06-10T11:40:01.123Z change: functions/lib/tools/list-shifts/index.js
[watch] 2026-06-10T11:40:01.872Z pushed: functions/lib/tools/list-shifts/index.js
```

Add `--push` to skip the server-event subscription and only push local
changes (no WebSocket connection needed).

## Install status lifecycle

Every uploaded package is a `raisin:Package` node whose `status` property
tracks the lifecycle truthfully:

```
processing  →  uploaded  →  installing  →  installed
                                       ↘  failed   (error property has the detail)
```

| Status | Meaning |
|--------|---------|
| `processing` | Upload accepted; manifest extraction in progress |
| `uploaded` | Package stored and validated, not installed |
| `installing` | Install job running (node types, workspaces, content) |
| `installed` | Install completed — `installed: true`, `installed_at` set |
| `failed` | Processing or install failed — the CLI reports the error detail |

`raisindb package list --repo myapp` shows the status column, and
`raisindb package install` / `deploy --install` print the failure detail
(from the package node's `error` property where the schema supports it, or
from the install job record). Built-in packages installed automatically at
repository creation have no `status` property.

Uninstalling a package returns it to `uploaded`.

## CI

All commands are non-interactive and exit non-zero on failure, so a pipeline
is just:

```bash
# Authentication: environment variables win over .raisinrc
export RAISINDB_SERVER=https://db.example.com
export RAISINDB_TOKEN=...          # or: raisindb login --server ... --token "$TOKEN"
                                   # or: raisindb login --server ... --username ... --password ...

raisindb repo create myapp --exists-ok
raisindb deploy ./package --repo myapp --install
```

Exit codes: `0` — package reached status `installed`; `1` — validation,
upload, or install failed (the install error detail is printed). A one-shot
content push without a full reinstall is available as
`raisindb sync ./package --repo myapp --push`.

## Next Steps

- [Creating Packages](./creating-packages.md) — Package format and structure
- [Installing Packages](./installing-packages.md) — Package lifecycle
- [Built-in Packages](./builtin-packages.md) — Pre-installed packages
