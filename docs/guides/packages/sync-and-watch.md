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

`--force` retries a rejected create as an update.

## Pulling the latest content from a server

Editors keep changing content on the running site. `raisindb pull` (the same
as `raisindb sync --pull`) brings those changes back into the package folder,
as the same files `deploy` installs, so a local server can be rebuilt from them
and the change history lives in Git:

```bash
raisindb pull ./package --repo myapp --dry-run     # report exactly what would change
raisindb pull ./package --repo myapp               # apply
raisindb pull ./package --repo myapp --diff        # show a diff per updated or conflicting file
```

A run reads every root at full depth (paged, with no depth limit), then
reports and applies one decision per file:

```text
Read stories:/my-site: 412 node(s)
Read assets:/website: 96 node(s)

new (3):
  + stories/my-site/news/season-opener/.node.yaml
  ...
updated (12):
  ~ stories/my-site/home/.node.yaml
  ...
local edits kept (1):
  L stories/my-site/contact/.node.yaml

3 new, 12 updated, 492 unchanged, 1 local edits
```

### What is pulled

By default, what the package already contains: for each `content/<workspace>/`
directory, the top-most nodes the package defines there and everything below
them. A workspace you share with Studio or another package (for example
`stories` or `functions`) contributes only your subtrees. Top-level server
nodes outside them are listed, not pulled. To choose the roots yourself:

```bash
raisindb pull ./package --path stories:/my-site --path sponsors:/   # sponsors:/ = whole workspace
```

or keep them in `.raisindb-cli.yaml`:

```yaml
pull:
  roots: [ "stories:/my-site", "sponsors:/", "assets:/website" ]
  exclude: [ "stories:/my-site/archive" ]
```

Node types, archetypes, element types, workspaces and the manifest are never
pulled: the package is their source.

### The files it writes

| Server | Package file |
|--------|--------------|
| a node | `content/<ws>/<path>/.node.yaml` (or the `{name}.yaml` / `SKILL.md` the package already uses) |
| an asset | the bytes at `content/<ws>/<path>`, streamed to disk and checked against the server's `content_hash`; `.node.<file>.yaml` only for metadata the installer cannot derive (title, alt text, …) |
| a translation | `.node.<locale>.yaml` next to the node, holding only what the locale changes; `hidden: true` for a hidden node |

References are written in path form (`raisin:ref: /my-brand`), never as the
server's uuid, so the folder installs on another server. Server bookkeeping
(`$supertypes`, `__*`) and renditions are left out. A bare folder the installer
would create anyway gets no `.node.yaml`.

### Your edits are safe

An existing file is updated value by value. Comments, formatting and
`{env:...}` tokens stay where they are; a token is package configuration and
matches whatever value the server holds (see
[Environment Variables](./environment-variables.md#pulling-tokens-are-protected)).

`.raisindb/pull-state.json` remembers what the last pull wrote, so each file is
decided three ways:

| Local file since last pull | Server since last pull | Result |
|---|---|---|
| unchanged | changed | **updated** |
| changed | unchanged | **local edit**, kept (push or deploy it) |
| changed | changed | **conflict** |

On the first pull there is no baseline yet, so any file that differs from the
server is a conflict. Conflicts follow `conflict_strategy` in
`.raisindb-cli.yaml`: `prompt` asks at a terminal (take server, keep local,
show diff, or decide for all), `server`, `local`, or `newest`. `--force` takes
the server version for every conflict; `--yes` never prompts and leaves them.
Running the same pull twice writes nothing the second time, and an interrupted
pull resumes where it stopped: files are written atomically and the baselines
are saved as it goes.

### `.raisin-sync.yaml` decides what is yours

The package's install policy is read exactly as the server reads it:

- `mode: replace` paths belong to the **package**: a deploy overwrites them, so
  your files are their source and pull skips them. `--include-owned` pulls them
  too, for example to see what drifted on the server.
- `direction: push_only` or `local_only`, and `exclude` patterns, are never
  pulled.
- Everything else (`defaults: {mode: skip}` is the usual case) is content the
  installation owns, and that is what pull is for.

The ignore list in `.raisindb-cli.yaml` and `.rapignore` apply as for push.

### Deletions

A local file whose node no longer exists on the server is reported as *gone
from server*. Pass `--delete` to remove those files. A root that comes back
empty never counts as a deletion.

### Empty results mean credentials

A read without valid credentials returns **no rows**, not an error. A pull
that reads nothing therefore stops:

```text
Error: The server returned no nodes for any root. RaisinDB answers a read without
valid credentials with an EMPTY result, not an error — so this usually means the
token is missing, expired, or for another server/repository. ...
```

Check `raisindb repo list` and `--repo`. Use `--allow-empty` only if the server
really is empty.

### Wrong repository, unsafe names

A repository that does not exist stops the pull before anything is read and
lists the ones that do:

```text
Error: Repository 'default' not found on https://db.example.com. Available: studio.
```

Refused credentials (HTTP 401/403) and a listing that is empty because nothing
was sent are named as such. A `remote_path` in `.raisindb-cli.yaml` that
matches no node gets a warning; pull itself does not use it.

Every file name a pull writes comes from the server, so it is checked: each
path segment, workspace and locale must be a plain file name (no `..`, path
separators, encoded dots, control characters or drive letters), the result must
stay inside the package, and nothing is written or deleted through a symlink.
Entries that fail are listed as `REFUSED` and never written.

### Pulling from the live server

Pass the live server and its credentials explicitly:

```bash
export RAISINDB_TOKEN=<API key of the live repository>
raisindb pull ./package -s https://db.example.com --repo myapp --dry-run
raisindb pull ./package -s https://db.example.com --repo myapp
```

`-s` beats the `server:` in `.raisindb-cli.yaml`, and `RAISINDB_TOKEN` is sent
to whatever server the command targets. `RAISINDB_SERVER` does not override a
`.raisindb-cli.yaml`, and `.raisinrc` is found by searching upward from the
current directory, so `-s` is the reliable way to aim a pull. The CLI prints
its target (`→ https://db.example.com (repo myapp, branch main)`) before it
reads anything. A pull only reads from the server; it never writes to it.

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
