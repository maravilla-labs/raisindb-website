---
sidebar_position: 2
---

# CLI Commands

Complete command reference for the RaisinDB CLI.

## Authentication

### login

Authenticate with a RaisinDB server. By default opens your browser for login, then saves the token to `.raisinrc`. All subsequent commands use this authentication.

For CI and scripts, two non-interactive modes are available: username/password against system auth, or storing an existing token directly.

```bash
raisindb login
raisindb login --server https://my-server.example.com

# Non-interactive (CI)
raisindb login --server https://db.example.com --username admin --password "$PASSWORD"
raisindb login --server https://db.example.com --token "$TOKEN"
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL (default: `http://localhost:8080` or from `.raisinrc`) |
| `-u, --username <username>` | Username for non-interactive login (requires `--password`) |
| `-p, --password <password>` | Password for non-interactive login |
| `-t, --token <token>` | Store an existing token directly (non-interactive) |
| `--tenant <tenant>` | Tenant for username/password login (default: `default`) |

Alternatively, set `RAISINDB_SERVER` and `RAISINDB_TOKEN` environment variables — they take precedence over `.raisinrc` and skip `login` entirely (see [Environment variables](./overview.md#environment-variables)).

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
| `--pack <name>` | Template pack: `content-modeling` (default) or `minimal` |
| `-n, --name <name>` | Package name (default: folder name) |
| `-w, --workspace <name>` | Workspace name (default: package name) |
| `-d, --description <text>` | Package description |
| `--skip-install` | Skip `npm install` and skills installation |

### package validate

Validate a package folder without building a `.rap`: schema validation (manifest, node types, workspaces, content, translations) plus static flow analysis — every `raisin:Flow` node's `workflow_data` is run through the same checks as `raisindb flow doctor` (templates, REL pitfalls, container/loop configuration). Exits `0` when clean, `1` when there are errors; warnings are printed but don't fail validation.

```bash
raisindb package validate ./package
```

This is the final gate before a package is built or uploaded — `package create` and `package deploy` run the same validation automatically and abort on errors. Use `raisindb flow doctor` as the fast, focused loop while editing a single flow.

### package create

Create a `.rap` package file from a folder. Runs the full package validation (schema + flow doctor, see `package validate`) first and refuses to build on errors.

```bash
raisindb package create ./package
raisindb package create ./package --check
raisindb package create ./package -o custom-name.rap
```

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path |
| `--check` | Validate only (don't create package; same as `package validate`) |
| `--no-validate` | Skip validation |

### package deploy

Validate, build, and upload a package in one step. Reads `manifest.yaml` for the name and version automatically. Also available as a top-level alias: `raisindb deploy`.

```bash
raisindb package deploy ./package
raisindb package deploy ./package --repo demo
raisindb deploy ./package --repo demo --install

# Deploy (and install) to a non-default branch
raisindb deploy ./package --repo demo --branch staging --install
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |
| `-b, --branch <name>` | Target branch (default: `main`). Uploads — and, with `--install`, installs — onto this branch. |
| `-i, --install` | Install after upload; waits until the package status is `installed` (fails on `failed` with the error detail) |

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

List packages in a repository, including a `Status` column that tracks the install lifecycle: `uploaded → installing → installed | failed` (for `failed`, the error detail is printed). Built-in packages installed at repository creation show `-`.

```bash
raisindb package list --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |

### package install

Install a package by name. Starts the install job and polls until the package reaches a terminal status: succeeds on `installed`, fails on `failed` (printing the server's error detail).

```bash
raisindb package install my-package --repo demo
raisindb package install my-package --repo demo --branch staging
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository name |
| `-b, --branch <name>` | Branch the package lives on / installs into (default: `main`) |

### package sync

Synchronize a local package directory with the server. Supports watch mode for live development. Also available as a top-level alias: `raisindb sync`. With `--repo` no `.raisin-sync.yaml` is required. In non-TTY environments (CI, piped output) watch mode prints plain log lines instead of the interactive UI. See [Sync and Watch](../../guides/packages/sync-and-watch.md).

```bash
raisindb package sync ./package --watch
raisindb package sync ./package --push
raisindb sync ./package --repo demo --watch
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
| `-b, --branch <name>` | Branch to sync against (default: `main`) |
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

## Workflow Tools

Offline static analysis for flow definitions — no server needed.

### flow doctor

Statically analyze flow definitions (a flow YAML file or a whole package folder): templates, REL pitfalls, container/loop configuration. The same checks run inside `package validate` / `package create` / `package deploy`.

```bash
raisindb flow doctor ./package
raisindb flow doctor ./package/content/flows/onboarding.yaml --strict
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--strict` | Treat warnings as failures (non-zero exit) |

### flow explain

Print the lowered execution plan the engine will actually run for a flow definition.

```bash
raisindb flow explain ./package/content/flows/onboarding.yaml
```

## Repository Administration

Repo commands operate over the HTTP API with your stored token — they work identically against local and remote servers.

### repo create

```bash
raisindb repo create myapp
raisindb repo create myapp --exists-ok
```

| Option | Description |
|--------|-------------|
| `-d, --description <text>` | Repository description |
| `--exists-ok` | Succeed if the repository already exists (idempotent for CI) |

### repo list

```bash
raisindb repo list
raisindb repo list --json
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |

### repo delete

Delete a repository. Irreversible — requires explicit confirmation via `--yes`.

```bash
raisindb repo delete myapp --yes
```

| Option | Description |
|--------|-------------|
| `-y, --yes` | Confirm deletion (required) |

## AI Provider Configuration

Manage tenant-level AI providers, gh-secret style: API keys are write-only and **never echoed** back by any command.

### ai provider set

Create or update a provider. Read-modify-write semantics: other providers and already-stored keys are preserved — omitting `--api-key*` keeps the existing key.

```bash
# Interactive shells
raisindb ai provider set openai --api-key sk-... --model gpt-4o:GPT-4o

# CI: never put keys in argv
echo "$OPENAI_KEY" | raisindb ai provider set openai --api-key-stdin
raisindb ai provider set anthropic --api-key-env ANTHROPIC_API_KEY \
  --model claude-sonnet-4-5 --enabled
```

| Option | Description |
|--------|-------------|
| `--api-key <value>` | API key value (prefer `--api-key-stdin` or `--api-key-env` in CI) |
| `--api-key-stdin` | Read the API key from stdin |
| `--api-key-env <var>` | Read the API key from an environment variable |
| `--endpoint <url>` | Custom API endpoint |
| `--enabled` / `--disabled` | Enable or disable the provider |
| `-m, --model <spec>` | Model as `model_id[:display_name]` (repeatable; the first becomes the default) |
| `--tenant <tenant>` | Tenant ID (default: `default`) |

### ai provider list

List configured providers: provider, enabled, `has_api_key`, model count. Keys themselves are never shown.

```bash
raisindb ai provider list
raisindb ai provider list --json
```

| Option | Description |
|--------|-------------|
| `--tenant <tenant>` | Tenant ID (default: `default`) |
| `--json` | Machine-readable JSON output |

### ai provider test

Test the live connection to a configured provider.

```bash
raisindb ai provider test openai
```

| Option | Description |
|--------|-------------|
| `--tenant <tenant>` | Tenant ID (default: `default`) |

## User Administration

### user register

Register an identity user (demo/login user) for a repository.

```bash
raisindb user register alice@example.com --repo myapp --display-name "Alice"

# CI: read the password from stdin
echo "$PASSWORD" | raisindb user register alice@example.com --repo myapp --password-stdin
```

| Option | Description |
|--------|-------------|
| `-p, --password <password>` | Password (prefer `--password-stdin` in CI) |
| `--password-stdin` | Read the password from stdin |
| `-r, --repo <name>` | Target repository (required) |
| `--display-name <name>` | Display name |
| `--tenant <tenant>` | Tenant ID (default: `default`) |
| `--exists-ok` | Succeed if the user already exists |

## CORS

Manage CORS allowed origins. Repo-level by default; `--tenant-level` operates on the tenant-wide fallback used when a repo has no config of its own.

### cors add

```bash
raisindb cors add https://app.example.com --repo myapp
raisindb cors add https://app.example.com --tenant-level
```

### cors list

```bash
raisindb cors list --repo myapp
raisindb cors list --tenant-level --json
```

### cors remove

```bash
raisindb cors remove https://app.example.com --repo myapp
```

Shared options:

| Option | Description |
|--------|-------------|
| `-r, --repo <name>` | Target repository |
| `--tenant-level` | Operate on the tenant-level config instead of a repo |
| `--tenant <tenant>` | Tenant ID (default: `default`) |
| `--json` | Machine-readable JSON output (`cors list` only) |

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
