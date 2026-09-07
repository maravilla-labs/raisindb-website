---
sidebar_position: 4
---

# Sync and Watch: The Development Loop

Packages are the unit of deployment, but while developing you do not want to
rebuild and reinstall for every edit. The CLI gives you two speeds:

- **`raisindb sync --watch`** watches your package directory and pushes each
  change to the running server as you save. This covers content nodes and
  schema: node types, archetypes, element types and mixins are upserted through
  the management API, so a changed definition applies without a redeploy. This
  is the loop for almost all development.
- **`raisindb deploy --install`** validates, builds, uploads and installs. Use
  it for the first install and whenever the manifest or a workspace definition
  changes, because those are applied at install time.

## Local development setup

```bash
# 1. Start a local server (data lives in ./.data under the current folder)
raisindb server start

# 2. Authenticate (writes server URL and token to .raisinrc)
raisindb login --server http://localhost:8080 --username admin --password '...'

# 3. Create the target repository
raisindb repo create myapp --exists-ok

# 4. First install: schema, workspaces and seed content
raisindb deploy ./package --repo myapp --install

# 5. Develop: push every change live as you edit
raisindb sync ./package --repo myapp --watch --push
```

`--watch` starts with a full push of the current local state, then pushes only
the files that change. `--push` makes the session one-way (local to server) and
skips the server-event subscription, which is the right mode for a
single-developer loop.

`deploy --install` waits for the install job and succeeds only when the package
reaches status `installed`; on `failed` it prints the server's error detail.
It installs in `sync` mode by default, so a redeploy also updates existing
content nodes. Pass `--mode skip` to leave existing content alone.

With `--repo` on the command line, `sync` needs no configuration file: the
repository comes from the flag and the server and token from `raisindb login`
or the environment (see [CI](#ci)). If a `.raisindb-cli.yaml` exists in the
package directory it is used instead; `raisindb sync ./package --init --repo
myapp` writes one:

```yaml
version: 1
server: http://localhost:8080
repository: myapp
branch: main
remote_path: /my-package
conflict_strategy: prompt
ignore:
  - "*.local.*"
  - .raisindb-cli.yaml
  - .raisin-sync.yaml
  - node_modules/
  - .git/
  - .env
  - .env.*
```

:::note Two files, two purposes
`.raisindb-cli.yaml` is the CLI's connection config for the local push loop and
is never pushed or packaged. `.raisin-sync.yaml` at the same location is the
package's install policy, which ships inside the `.rap` and is read by the
server's install job (see
[Creating Packages](./creating-packages.md#install-policy-raisin-syncyaml)).
Earlier CLI versions wrote their connection config as `.raisin-sync.yaml`;
the current CLI still reads that name when the file has a `server` field.
:::

## What watch mode syncs

Each changed file is mapped to the node the installer would create from it:

| You edit | What happens on the server |
|----------|---------------------------|
| `content/{ws}/.../{dir}/.node.yaml` | Properties of the `{dir}` node are updated |
| `content/{ws}/.../{name}.yaml` | Properties of the `{name}` node are updated |
| `content/{ws}/.../index.js` (also `.py`, `.star`) | The asset node's `code` property is updated; the function runtime picks it up on the next call |
| `content/{ws}/.../.node.{file}.yaml` | Metadata of the sibling asset `{file}` is updated |
| `content/{ws}/.../{base}.{locale}.yaml` | Translations for `{base}` are applied |
| other files | Re-uploaded as the asset's `file` resource (multipart) |
| `nodetypes/`, `archetypes/`, `elementtypes/`, `mixins/` (`*.yaml`) | Upserted through `/api/management/{repo}/{branch}/{kind}`; the resolved schema reflects it immediately |
| `manifest.yaml`, `workspaces/`, `static/` | Not synced; the watcher prints a redeploy hint |

Files under `content/` whose name starts with a dot, other than the `.node.*`
forms above, are ignored. A `.wasm` artifact is uploaded as a binary asset.

When the manifest or a workspace definition changes, run:

```bash
raisindb deploy ./package --repo myapp --install
```

On an interactive terminal, watch mode renders a live status view. When stdout
is not a TTY, for example in CI or when piped to a file, it prints plain lines:

```
Initial sync: 13 pushed, 0 failed — now watching for changes.
[watch] watching /work/myapp/package
[watch] target http://localhost:8080 repo=myapp branch=main
[watch] local watcher ready
[watch] 2026-09-06T18:37:24.548Z change: blog/posts/getting-started.yaml
[watch] 2026-09-06T18:37:25.062Z pushed: blog/posts/getting-started.yaml
```

Structural changes print a line such as
`structural change: workspaces/blog.yaml — not synced; run "raisindb deploy ..."`.

## One-shot push

To push everything once without watching:

```bash
raisindb sync ./package --repo myapp --push
raisindb sync ./package --repo myapp --push --dry-run     # list what would be pushed
```

`--force` retries a rejected create as an update. `--pull` downloads server
changes to local files and refuses to overwrite a local file that contains
`{env:...}` tokens unless `--force` is given (see
[Environment Variables](./environment-variables.md#pulling-tokens-are-protected)).

## Install status lifecycle

Every uploaded package is a `raisin:Package` node whose `status` property
tracks the lifecycle:

```
processing  →  uploaded  →  installing  →  installed
                                       ↘  failed   (error property has the detail)
```

| Status | Meaning |
|--------|---------|
| `processing` | Upload accepted; manifest extraction in progress |
| `uploaded` | Package stored, not installed |
| `installing` | Install job running |
| `installed` | Install completed; `installed: true`, `installed_at` set |
| `failed` | Processing or install failed; the CLI prints the error |

`raisindb package list --repo myapp` shows the status column. Built-in packages
that are registered but not installed show `-`. Uninstalling a package returns
it to `uploaded`.

## CI

All commands are non-interactive and exit non-zero on failure, so a pipeline
is:

```bash
# Authentication: environment variables win over .raisinrc
export RAISINDB_SERVER=https://db.example.com
export RAISINDB_TOKEN=...          # or: raisindb login --server ... --token "$TOKEN"
                                   # or: raisindb login --server ... --username ... --password ...

raisindb repo create myapp --exists-ok
raisindb deploy ./package --repo myapp --install
```

Exit codes: `0` when the package reached status `installed`; `1` when
validation, upload or install failed. A one-shot push of content and schema
without a reinstall is `raisindb sync ./package --repo myapp --push`.

Environment-specific values in the package YAML should be `{env:...}` tokens,
resolved from the same exported variables:

```bash
export PREVIEW_SERVER=https://preview.example.ch
raisindb deploy ./package --repo myapp --install
```

An unset variable with no inline default fails the deploy instead of shipping a
literal token.

## Next steps

- [Creating Packages](./creating-packages.md)
- [Installing Packages](./installing-packages.md)
- [Built-in Packages](./builtin-packages.md)
- [Environment Variables](./environment-variables.md)
