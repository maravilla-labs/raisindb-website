---
sidebar_position: 1
---

# CLI Overview

The `raisindb` CLI installs and runs the server, scaffolds projects, builds and
deploys packages, and administers repositories, users, secrets and AI providers
over the HTTP API.

## Installation

```bash
npm install -g @raisindb/cli
raisindb --version
```

## Quick start

```bash
raisindb server start                 # download the server binary and start it
raisindb login                        # authenticate (browser flow)
raisindb package init my-app          # scaffold a project with a package/ folder
raisindb repo create my-app --exists-ok
raisindb deploy my-app/package --repo my-app --install
raisindb sync my-app/package --repo my-app --watch --push
```

## Command groups

| Group | Description |
|-------|-------------|
| [`login`, `logout`](./commands#authentication) | Authenticate with a server: browser flow, or `--username`/`--password` or `--token` for scripts |
| [`server`](./commands#server-management) | Install, start, stop, update and inspect the server binary |
| [`package`](./commands#package-management) | Init, validate, create, upload, install, list, sync, clone |
| [`deploy`, `sync`](./commands#package-deploy) | Top-level aliases for `package deploy` and `package sync` |
| [`create`](./commands#scaffolding) | Scaffold a function or a connector adapter |
| [`function`](./commands#functions) | Build, check, run and test WebAssembly functions |
| [`flow`](./commands#workflow-tools) | Offline static analysis of flow definitions |
| [`repo`](./commands#repository-administration) | Create, list, delete repositories |
| [`ai provider`](./commands#ai-provider-configuration) | Configure tenant AI providers; keys are write-only |
| [`secret`](./commands#secrets) | Write, list, rotate and delete encrypted secrets |
| [`user`](./commands#user-administration) | Register identity users |
| [`cors`](./commands#cors) | Manage CORS allowed origins |
| [`shell`](./commands#interactive-shell) | Interactive SQL shell |

Every command prints its options with `--help`, for example
`raisindb package sync --help`.

## Configuration

The CLI stores the server URL, token and default repository in a `.raisinrc`
file (YAML):

```yaml
server: http://localhost:8080
token: <jwt>
default_repo: myapp
```

The file is looked up by walking up from the current directory; if none is
found, `~/.raisinrc` is used. `raisindb login` writes it, and `raisindb logout`
clears the token.

## Environment variables

Environment variables take precedence over `.raisinrc`, which is what makes CI
work without a config file or an interactive login:

| Variable | Overrides | Description |
|----------|-----------|-------------|
| `RAISINDB_SERVER` | `server` | Server URL |
| `RAISINDB_TOKEN` | `token` | Auth token; skips `raisindb login` |
| `RAISINDB_REPO` | `default_repo` | Repository used when `--repo` is omitted |

```bash
export RAISINDB_SERVER=https://db.example.com
export RAISINDB_TOKEN=$CI_RAISINDB_TOKEN

raisindb repo create myapp --exists-ok
raisindb deploy ./package --repo myapp --install
```

`raisindb server install` also honours `RAISINDB_VERSION` to pin a release tag,
`RAISINDB_GH_TOKEN` or `GITHUB_TOKEN` for authenticated GitHub downloads, and
`RAISINDB_SERVER_GITHUB_REPO` to download from a fork.
