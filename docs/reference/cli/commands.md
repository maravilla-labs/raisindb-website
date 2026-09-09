---
sidebar_position: 2
---

# CLI Commands

Reference for every `raisindb` command. Options marked with a repository
default fall back to `RAISINDB_REPO`, then `default_repo` in `.raisinrc`.

## Authentication

### login

Authenticate with a server and store the token in `.raisinrc`. Without
options, the CLI opens the server's `/auth/cli` page in your browser and waits
on `localhost:9999` for the token. For scripts, pass a username and password
(system auth) or an existing token.

```bash
raisindb login
raisindb login --server https://db.example.com

# Non-interactive
raisindb login --server https://db.example.com --username admin --password "$PASSWORD"
raisindb login --server https://db.example.com --token "$TOKEN"
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL (default: from `.raisinrc`, else `http://localhost:8080`) |
| `-u, --username <username>` | Username for non-interactive login (requires `--password`) |
| `-p, --password <password>` | Password for non-interactive login |
| `-t, --token <token>` | Store an existing token directly |
| `--tenant <tenant>` | Tenant for username/password login (default: `default`) |

Username/password login posts to `/api/raisindb/sys/{tenant}/auth` and prints
the token's expiry. `RAISINDB_SERVER` and `RAISINDB_TOKEN` take precedence over
the stored values and make `login` unnecessary (see
[Environment variables](./overview.md#environment-variables)).

### logout

Clear the stored token from `.raisinrc`.

```bash
raisindb logout
```

## Server management

The server binary is installed to `~/.raisindb/bin/raisindb`; the PID file and
log live in `~/.raisindb/`. Data goes to `./.data` under the directory you
start from.

### server install

```bash
raisindb server install
raisindb server install --version v0.4.0
```

| Option | Description |
|--------|-------------|
| `-v, --version <tag>` | Install a specific release tag |
| `-f, --force` | Reinstall even if that version is present |

### server start

Start the server in the background. Installs the binary first if it is missing.
Runs in dev mode unless `--production` is given; on the first start in dev mode
it generates an admin password and prints it once.

```bash
raisindb server start
raisindb server start --port 9090
raisindb server start ./my-project --verbose
```

| Option | Description |
|--------|-------------|
| `--port <port>` | HTTP port (default: 8080) |
| `--pgwire-port <port>` | PostgreSQL protocol port (default: 5432) |
| `--config <path>` | Server config file |
| `--production` | Production mode (no dev defaults; requires configured secrets) |
| `--verbose` | Log at `info` level instead of `warn` |
| `-d, --detach` | Accepted; the server always runs detached |

A directory given as the first argument becomes the working directory. Unknown
options are passed through to the server binary.

### server stop, status, logs, update, version

```bash
raisindb server stop
raisindb server status
raisindb server logs -f -n 100
raisindb server update
raisindb server version
```

| Option (`logs`) | Description |
|--------|-------------|
| `-f, --follow` | Stream the log |
| `-n, --lines <count>` | Lines to show (default: 50) |

## Package management

### package init

Scaffold a project: a `package/` folder with `manifest.yaml`, empty schema
directories, a workspace definition and a root content folder, plus agent
instruction files and a `frontend/` placeholder.

```bash
raisindb package init my-app
raisindb package init my-app --name "my-app" --workspace content --pack minimal
```

| Option | Description |
|--------|-------------|
| `--pack <name>` | Template pack: `content-modeling` (default) or `minimal` |
| `-n, --name <name>` | Package name (default: folder name) |
| `-w, --workspace <name>` | Workspace name (default: package name) |
| `-d, --description <text>` | Package description |
| `--skip-install` | Skip `npm install` and the agent-skills installation |

The `minimal` pack also writes a root `package.json` with `validate`, `build`,
`deploy` and `sync` scripts; `npm install` and the skills installation run only
for packs that write one. Otherwise the next step is
`raisindb package validate ./package`.

### package validate

Validate a package folder without building: manifest, node types, workspaces,
content and translations, plus the same static flow checks as
[`flow doctor`](#flow-doctor). Exits `0` when clean and `1` on errors; warnings
are printed but do not fail.

```bash
raisindb package validate ./package
raisindb package validate ./package --env production
```

| Option | Description |
|--------|-------------|
| `-e, --env <profile>` | Env profile for `{env:...}` tokens (loads `.env.<profile>`) |
| `--env-file <path...>` | Additional env file(s) |

Validation runs on the substituted content, so an unset variable is reported as
an `UNRESOLVED_ENV_TOKEN` error with its file and line.

### package create

Build a `.rap` from a folder. Validates first and refuses to build on errors.
The output defaults to `<name>-<version>.rap` in the current directory.

```bash
raisindb package create ./package
raisindb package create ./package -o dist/my-app.rap
raisindb package create ./package --check
```

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path |
| `--check` | Validate only, same as `package validate` |
| `--no-validate` | Skip validation |
| `-e, --env <profile>` | Env profile for `{env:...}` tokens |
| `--env-file <path...>` | Additional env file(s) |

Files matched by `.gitignore`, `.rapignore` or the built-in ignore list are
excluded. `{env:...}` tokens are resolved into the archive; an unresolved token
aborts the build.

### package deploy

Validate, build, upload and optionally install in one step. Reads the name and
version from `manifest.yaml`. Also available as `raisindb deploy`.

```bash
raisindb package deploy ./package --repo demo
raisindb deploy ./package --repo demo --install
raisindb deploy ./package --repo demo --branch staging --install --mode skip
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository (has a default) |
| `-b, --branch <name>` | Target branch (default: `main`) |
| `-i, --install` | Install after upload and wait for status `installed`; fails on `failed` with the error detail |
| `--mode <mode>` | With `--install`: `skip`, `sync` (default) or `overwrite` |
| `-e, --env <profile>` | Env profile for `{env:...}` tokens |
| `--env-file <path...>` | Additional env file(s) |

After an install, workspaces that already existed have their
`allowed_node_types` and `allowed_root_node_types` re-applied from the
package's `workspaces/*.yaml`.

### package upload

Upload a `.rap`. The package node is created under the `packages` workspace on
`main`, named after the manifest.

```bash
raisindb package upload my-app-0.1.0.rap --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository (has a default) |
| `-p, --path <path>` | Target path inside the `packages` workspace |

### package list

List the packages in a repository with version, installed flag and status
(`uploaded`, `installing`, `installed`, `failed`). Failed packages print their
error.

```bash
raisindb package list --repo demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository (has a default) |

### package install

Install an uploaded package by name and poll until it reaches a terminal
status. Uses the server's default install mode, `skip`, so an already-installed
package is left alone; use `deploy --install` to choose a mode.

```bash
raisindb package install my-app --repo demo
raisindb package install my-app --repo demo --branch staging
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository (has a default) |
| `-b, --branch <name>` | Branch to install into (default: `main`) |

### package sync

Push a package directory to the server, watch it for changes, or pull. Also
available as `raisindb sync`. With `--repo` no config file is needed; otherwise
`.raisindb-cli.yaml` in the package directory is used. See
[Sync and Watch](../../guides/packages/sync-and-watch.md).

```bash
raisindb sync ./package --repo demo --push
raisindb sync ./package --repo demo --watch --push
raisindb sync ./package --init --repo demo
```

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch mode: push once, then push each change |
| `-p, --push` | One-way, local to server |
| `-l, --pull` | One-way, server to local |
| `-y, --yes` | Skip confirmations |
| `-f, --force` | Overwrite conflicts and token-bearing local files |
| `-n, --dry-run` | Show what would be synced |
| `-r, --repo <name>` | Repository |
| `-s, --server <url>` | Server URL |
| `-b, --branch <name>` | Branch (default: `main`) |
| `--init` | Write `.raisindb-cli.yaml` |
| `-e, --env <profile>` | Env profile for `{env:...}` tokens |
| `--env-file <path...>` | Additional env file(s) |

When stdout is not a TTY, watch mode prints plain log lines.

### package clone

Export a package from the server and unpack it into a local directory.

```bash
raisindb package clone my-app
raisindb package clone my-app -o ./local-dir --repo demo
```

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory (default: `./<package-name>`) |
| `-s, --server <url>` | Server URL |
| `-r, --repo <name>` | Repository (has a default) |
| `-b, --branch <name>` | Branch (default: `main`) |

### package create-from-server

Interactive: pick content on the server and download it as a new `.rap`.

```bash
raisindb package create-from-server --repo demo
```

## Scaffolding

### create function

Scaffold a `raisin:Function` node inside a package, either as source (JavaScript
or Starlark) or as a WebAssembly project under `wasm/`.

```bash
raisindb create function greet --lang rust --ns demo
raisindb create function hello --lang js --ns demo
raisindb create function greet-shout --into wasm/demo/greet --handler shout
```

| Option | Description |
|--------|-------------|
| `-l, --lang <lang>` | `rust`, `go`, `assemblyscript`, `ts` (compiled to WebAssembly) or `js`, `starlark` (source) |
| `--ns <namespace>` | Namespace under `content/functions/lib`. Defaults to the namespace of the `--into` project, or to the package name |
| `-d, --dir <path>` | Package directory (default: nearest `manifest.yaml` above cwd) |
| `--handler <name>` | Handler name (default `default`, or the function name with `--into`) |
| `--into <project>` | Add a second handler to an existing wasm project |
| `--description <text>` | Description for the Function node |

The node is always written under `content/`, creating that directory if the
package does not have one yet. Only `content/{workspace}/...` is installed, so a
node written anywhere else is packed and then silently ignored.

See [Creating Functions](../../guides/functions/creating-functions.md).

### create adapter

Scaffold a connector-adapter package skeleton.

```bash
raisindb create adapter acme --provider acme
```

| Option | Description |
|--------|-------------|
| `-d, --dir <path>` | Target directory (default: `./<name>-adapter`) |
| `-p, --provider <slug>` | Provider type slug (default: `<name>`) |
| `--description <text>` | Package description |

## Functions

### function build

Build a wasm project with its own toolchain (`cargo`, TinyGo or `asc` plus
`wasm-tools`) and copy the artifact into its Function node.

```bash
raisindb function build wasm/demo/greet
raisindb function build --all --watch
```

| Option | Description |
|--------|-------------|
| `--all` | Build every wasm project in the package |
| `-w, --watch` | Rebuild on change |
| `--release` / `--debug` | Build profile (release is the default) |

### function doctor

Offline checks: missing toolchains, an `entry_file` that does not resolve, an
artifact over the server's size cap, a handler the source does not define.

```bash
raisindb function doctor
raisindb function doctor wasm/demo/greet --strict
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable output |
| `--strict` | Treat warnings as failures |

### function run

Invoke a function on a server, uploading the local artifact first when it
differs from what is deployed.

```bash
raisindb function run wasm/demo/greet --input '{"name":"Ada"}'
raisindb function run content/functions/lib/demo/hello --input-file in.json
```

| Option | Description |
|--------|-------------|
| `-i, --input <json>` / `--input-file <path>` | Handler input |
| `--handler <name>` | Call a different handler than the node's `entry_file` |
| `-t, --timeout <ms>` | Timeout |
| `-s, --server <url>` / `-r, --repo <name>` / `-b, --branch <name>` | Target |
| `--json` | One JSON object instead of the live view |

### function test

```bash
raisindb function test wasm/demo/greet             # native tests, no server
raisindb function test wasm/demo/greet --server    # scenarios against a server
```

| Option | Description |
|--------|-------------|
| `--server [url]` | Replay `tests/server.json` against a server |
| `-r, --repo <name>` / `-b, --branch <name>` | Target (with `--server`) |
| `-t, --timeout <ms>` | Per-case timeout |

For a compiled language this runs `cargo test` or `go test ./...` against a mock
host. JavaScript and Starlark functions have no native step and need
`--server`; their scenarios live in a `.tests.json` beside the node:

```json
[{ "input": { "name": "Ada" }, "expect": { "greeting": "Hello, Ada" } }]
```

An object in `expect` is matched as a subset.

## Workflow tools

Offline static analysis; no server needed.

### flow doctor

```bash
raisindb flow doctor ./package
raisindb flow doctor ./package/content/flows/onboarding.yaml --strict
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--strict` | Treat warnings as failures |

### flow explain

Print the lowered execution plan the engine will run for a flow definition.

```bash
raisindb flow explain ./package/content/flows/onboarding.yaml
```

## Repository administration

These commands call the HTTP API with the stored token.

```bash
raisindb repo create myapp --description "My app"
raisindb repo create myapp --exists-ok
raisindb repo list
raisindb repo list --json
raisindb repo delete myapp --yes
```

| Command | Options |
|---------|---------|
| `repo create <name>` | `-d, --description <text>`; `--exists-ok` succeeds if it already exists |
| `repo list` | `--json` |
| `repo delete <name>` | `-y, --yes` (required) |

`repo list` prints the repository id, default branch, creation time and
description.

## AI provider configuration

Tenant-level providers are keyed by a slug. API keys are write-only: no
command prints one back.

### ai provider set

Create or update a provider. Existing providers and stored keys are preserved;
omitting the key options keeps the current key.

```bash
raisindb ai provider set openai --kind openai --api-key sk-... --model gpt-4o:GPT-4o

# CI: keep keys out of argv
echo "$OPENAI_KEY" | raisindb ai provider set openai --kind openai --api-key-stdin
raisindb ai provider set anthropic --kind anthropic --api-key-env ANTHROPIC_API_KEY \
  --model claude-sonnet-4-5 --enabled
```

| Option | Description |
|--------|-------------|
| `--kind <kind>` | Provider kind (`openai`, `anthropic`, `custom`, ...); required when creating a new slug |
| `--api-key <value>` | API key (prefer stdin or env in CI) |
| `--api-key-stdin` | Read the key from stdin |
| `--api-key-env <var>` | Read the key from an environment variable |
| `--endpoint <url>` | Custom API endpoint |
| `--display-name <name>`, `--icon-url <url>` | Display metadata |
| `--enabled` / `--disabled` | Enable or disable |
| `-m, --model <spec>` | `model_id[:display_name]`, repeatable; the first becomes the default |
| `--tenant <tenant>` | Tenant (default: `default`) |

### ai provider list, test

```bash
raisindb ai provider list
raisindb ai provider list --json
raisindb ai provider test openai
```

`list` shows slug, kind, endpoint, enabled, `has_api_key` and model count.
Both accept `--tenant <tenant>`; `list` also accepts `--json`.

## Secrets

Branch-scoped encrypted secrets. Values are read from stdin by default and are
never echoed; there is no `secret get`, because the API exposes no plaintext
read. Functions read secrets through `raisin.secrets`.

```bash
echo -n "$STRIPE_KEY" | raisindb secret set stripe_key --repo myapp
raisindb secret set stripe_key --value-env STRIPE_KEY --repo myapp
raisindb secret list --repo myapp
raisindb secret show stripe_key --repo myapp --json
echo -n "$NEW_KEY" | raisindb secret rotate stripe_key --repo myapp
raisindb secret rm stripe_key --repo myapp --yes
```

| Command | Options |
|---------|---------|
| `secret set <name>` | `--value <value>` (discouraged), `--value-env <var>`, `-r, --repo`, `-b, --branch` (default `main`) |
| `secret list` | `-r, --repo`, `-b, --branch`, `--json` |
| `secret show <name>` | Metadata only (version, timestamps, author); `-r, --repo`, `-b, --branch`, `--json` |
| `secret rotate <name>` | Same as `set`, stamped as a rotation |
| `secret rm <name>` | `-r, --repo`, `-b, --branch`, `-y, --yes` (required) |

## User administration

### user register

Register an identity user (a login user) for a repository.

```bash
raisindb user register alice@example.com --repo myapp --display-name "Alice"

# CI: read the password from stdin
echo "$PASSWORD" | raisindb user register alice@example.com --repo myapp --password-stdin
```

| Option | Description |
|--------|-------------|
| `-p, --password <password>` | Password (prefer `--password-stdin`) |
| `--password-stdin` | Read the password from stdin |
| `-r, --repo <name>` | Target repository (required) |
| `--display-name <name>` | Display name |
| `--tenant <tenant>` | Tenant (default: `default`) |
| `--exists-ok` | Succeed if the user already exists |

## CORS

Manage allowed origins. Repository-level by default; `--tenant-level` edits the
tenant-wide fallback used when a repository has no configuration of its own.

```bash
raisindb cors add https://app.example.com --repo myapp
raisindb cors list --repo myapp
raisindb cors list --tenant-level --json
raisindb cors remove https://app.example.com --repo myapp
```

| Option | Description |
|--------|-------------|
| `-r, --repo <name>` | Target repository |
| `--tenant-level` | Operate on the tenant-level config |
| `--tenant <tenant>` | Tenant (default: `default`) |
| `--json` | Machine-readable output (`list` only) |

## Interactive shell

### shell

An interactive shell with a SQL mode.

```bash
raisindb shell
raisindb shell --server http://remote:8080 --database demo
```

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Server URL |
| `-d, --database <name>` | Repository to use |

Commands inside the shell:

| Command | Description |
|---------|-------------|
| `/connect <url>` | Connect to a server |
| `/login`, `/logout` | Authenticate via the browser flow, or clear the token |
| `/auth`, `/status` | Show authentication and connection state |
| `/databases` (or `/repos`) | List repositories |
| `/sql`, `/exit-sql` | Enter and leave SQL mode |
| `/packages`, `/upload <file>`, `/install <name>`, `/create <folder>` | Package operations against the current repository |
| `/clear` | Clear the screen |
| `/help` | Show help |
| `/quit` (or `/exit`) | Exit |
