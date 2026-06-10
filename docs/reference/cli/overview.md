---
sidebar_position: 1
---

# CLI Overview

The RaisinDB CLI manages the server, scaffolds projects with AI agent support, and handles package deployment.

## Installation

```bash
npm install -g @raisindb/cli
```

## Quick Start

```bash
raisindb server start        # Download & start server
raisindb login               # Authenticate (opens browser)
raisindb package init my-app # Scaffold project + install types + agent skills
cd my-app
npm run validate             # Validate package YAML
npm run deploy               # Build & upload to server
```

## Command Groups

| Group | Description |
|-------|-------------|
| [`raisindb login/logout`](./commands#authentication) | Authenticate with a server (browser flow, or non-interactive for CI) |
| [`raisindb server`](./commands#server-management) | Install, start, stop, update the server |
| [`raisindb package`](./commands#package-management) | Init, validate, build, deploy, sync packages |
| [`raisindb deploy` / `raisindb sync`](./commands#package-deploy) | Top-level aliases for the core dev loop |
| [`raisindb flow`](./commands#workflow-tools) | Static flow analysis: `doctor`, `explain` (offline) |
| [`raisindb repo`](./commands#repository-administration) | Create, list, delete repositories |
| [`raisindb ai provider`](./commands#ai-provider-configuration) | Configure tenant AI providers (keys never echoed) |
| [`raisindb user`](./commands#user-administration) | Register identity users |
| [`raisindb cors`](./commands#cors) | Manage CORS allowed origins |
| [`raisindb shell`](./commands#interactive-shell) | Interactive SQL shell |

## Configuration

The CLI stores authentication and server settings in `.raisinrc` (YAML format):

```yaml
server: http://localhost:8080
token: <jwt-token>
default_repo: demo
```

Config file lookup order:
1. Walk up directory tree from current directory
2. Fall back to `~/.raisinrc` (home directory)

The `raisindb login` command writes this file automatically.

## Environment variables

Environment variables take precedence over `.raisinrc` — designed for CI, where no config file or interactive login is needed:

| Variable | Overrides | Description |
|----------|-----------|-------------|
| `RAISINDB_SERVER` | `server` | Server URL |
| `RAISINDB_TOKEN` | `token` | Auth token (skips `raisindb login`) |
| `RAISINDB_REPO` | `default_repo` | Default repository for `--repo`-less commands |

```bash
export RAISINDB_SERVER=https://db.example.com
export RAISINDB_TOKEN=$CI_RAISINDB_TOKEN

raisindb repo create myapp --exists-ok
raisindb deploy ./package --repo myapp --install
```
