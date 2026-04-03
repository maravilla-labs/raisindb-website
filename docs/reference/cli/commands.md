---
sidebar_position: 2
---

# CLI Commands

Complete command reference for the RaisinDB CLI.

## Authentication

### login

Authenticate with a RaisinDB server. Opens your browser for login, then saves the token to `.raisinrc`. All subsequent commands use this authentication.

```bash
raisindb login
raisindb login --server https://my-server.example.com
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL (default: `http://localhost:8080` or from `.raisinrc`) |

### logout

Clear the stored authentication token.

```bash
raisindb logout
```

## Server Management

### server install

Download and install the RaisinDB server binary for your platform.

```bash
raisindb server install
raisindb server install --version v0.1.3
```

| Option | Description |
|--------|-------------|
| `-v, --version <tag>` | Install a specific version |
| `-f, --force` | Force reinstall |

### server start

Start the RaisinDB server. On first run, downloads the binary automatically.

```bash
raisindb server start
raisindb server start --port 9090 --detach
```

| Option | Description |
|--------|-------------|
| `--port <port>` | HTTP port (default: 8080) |
| `--pgwire-port <port>` | PostgreSQL protocol port (default: 5432) |
| `--config <path>` | Path to config file |
| `--production` | Production mode |
| `--verbose` | Show server logs in terminal |
| `-d, --detach` | Run in background |

On first start, admin credentials are printed to the terminal.

### server stop

Stop a running RaisinDB server.

```bash
raisindb server stop
```

### server status

Check server health and status.

```bash
raisindb server status
```

### server logs

View server logs.

```bash
raisindb server logs
raisindb server logs -f -n 100
```

| Option | Description |
|--------|-------------|
| `-f, --follow` | Stream logs in real-time |
| `-n, --lines <count>` | Number of lines to show (default: 50) |

### server update

Update the server binary to the latest version.

```bash
raisindb server update
```

### server version

Show the installed server version.

```bash
raisindb server version
```

## Package Management

### package init

Scaffold a new RaisinDB project with package structure, frontend placeholder, and AI agent skills.

```bash
raisindb package init my-app
raisindb package init my-app --name "My App" --workspace content
```

This automatically:
1. Creates the project structure (`package/`, `frontend/`, `package.json`, etc.)
2. Runs `npm install` (installs `@raisindb/functions-types`)
3. Installs AI agent skills via `npx skills add`

| Option | Description |
|--------|-------------|
| `--pack <name>` | Template pack (default: `minimal`) |
| `-n, --name <name>` | Package name (default: folder name) |
| `-w, --workspace <name>` | Workspace name (default: package name) |
| `-d, --description <text>` | Package description |
| `--skip-install` | Skip `npm install` and skills installation |

### package create

Create a `.rap` package file from a folder.

```bash
raisindb package create ./package
raisindb package create ./package --check
raisindb package create ./package -o custom-name.rap
```

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path |
| `--check` | Validate only (don't create package) |
| `--no-validate` | Skip validation |

### package deploy

Validate, build, and upload a package in one step. Reads `manifest.yaml` for the name and version automatically.

```bash
raisindb package deploy ./package
raisindb package deploy ./package --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |

### package upload

Upload a `.rap` package to the server.

```bash
raisindb package upload my-app-0.1.0.rap --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |
| `-p, --path <path>` | Target path in repository |

### package list

List packages in a repository.

```bash
raisindb package list --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |

### package install

Install a package by name.

```bash
raisindb package install my-package --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |

### package sync

Synchronize a local package directory with the server. Supports watch mode for live development.

```bash
raisindb package sync ./package --watch
raisindb package sync ./package --push
```

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch mode (continuous sync) |
| `-p, --push` | One-way: local to server only |
| `-l, --pull` | One-way: server to local only |
| `-y, --yes` | Skip confirmations |
| `-f, --force` | Overwrite conflicts |
| `-n, --dry-run` | Show changes without applying |
| `-r, --repo <name>` | Repository name |
| `-s, --server <url>` | Server URL |
| `--init` | Initialize sync configuration |

### package clone

Clone a package from the server to a local directory.

```bash
raisindb package clone my-package
raisindb package clone my-package -o ./local-dir
```

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory |
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |
| `-b, --branch <name>` | Branch name (default: `main`) |

### package create-from-server

Interactive: create a new package by selecting content from the server.

```bash
raisindb package create-from-server --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |

## Interactive Shell

### shell

Start an interactive SQL shell with syntax highlighting and auto-completion.

```bash
raisindb shell
raisindb shell --server http://remote:8080 --database demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-d, --database <name>` | Database/repository to use |

Shell commands (inside the shell):
- `/connect <url>` — Connect to a server
- `/login` — Authenticate via browser
- `/logout` — Clear authentication
- `use <database>` — Switch database
- `/databases` — List databases
- `/sql` — Enter SQL mode
- `/help` — Show help
- `/quit` — Exit
