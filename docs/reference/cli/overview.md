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
| [`raisindb login/logout`](./commands#authentication) | Authenticate with a server |
| [`raisindb server`](./commands#server-management) | Install, start, stop, update the server |
| [`raisindb package`](./commands#package-management) | Init, validate, build, deploy, sync packages |
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
