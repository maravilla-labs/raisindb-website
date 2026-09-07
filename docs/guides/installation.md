---
sidebar_position: 1
---

# Installation & Setup

Get RaisinDB running in your development environment.

## Quick Start

```bash
npm install -g @raisindb/cli   # install the CLI
raisindb server start           # download the server binary and start it
raisindb login                  # authenticate (browser flow)
raisindb package init my-app    # scaffold a project + install types + agent skills
```

This gives you a running server, an authenticated CLI, and a project ready for development. See the [Quick Start tutorial](/docs/tutorials/quickstart) for the full walkthrough.

## Installation Options

### CLI (recommended)

The CLI downloads and manages the server binary:

```bash
npm install -g @raisindb/cli

raisindb server start      # downloads the binary on first use, then starts it
raisindb server install    # only download/install the binary
raisindb server update     # update to the latest release
raisindb server version    # show the installed server version
raisindb server status     # health check of the running server
raisindb server logs       # tail ~/.raisindb/server.log
raisindb server stop
```

The binary is cached in `~/.raisindb/bin/` and verified against the release's `SHA256SUMS`. The server's log goes to `~/.raisindb/server.log`, and data goes to `./.data/rocksdb` relative to where you ran `server start`.

`raisindb server start` runs the binary in development mode (`--dev-mode`), which supplies insecure defaults for the JWT and signing secrets so you can start without configuring any, and turns on the PostgreSQL listener (the binary itself leaves it off unless told otherwise). Use `--production` when you have set the secrets described under [Production secrets](#production-secrets).

### Binary download

Download pre-built binaries from [GitHub Releases](https://github.com/maravilla-labs/raisindb/releases):

```bash
# macOS (Apple Silicon)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-aarch64-apple-darwin.tar.gz
tar xzf raisindb-latest-aarch64-apple-darwin.tar.gz
sudo mv raisindb-*/raisindb /usr/local/bin/

# macOS (Intel)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-x86_64-apple-darwin.tar.gz

# Linux (x64)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-x86_64-unknown-linux-gnu.tar.gz

# Windows (x64): download the .zip from the releases page
```

### Build from source

```bash
git clone https://github.com/maravilla-labs/raisindb.git
cd raisindb
cargo build --release --package raisin-server --features "storage-rocksdb,websocket,pgwire"
# binary: target/release/raisin-server
```

## Starting the server

### With the CLI

```bash
raisindb server start                         # dev mode, HTTP on 8080, pgwire on 5432
raisindb server start --port 8081 --pgwire-port 5433
raisindb server start --config ./raisindb.toml  # the file's [pgwire] section decides pgwire
raisindb server start --production            # requires JWT_SECRET and RAISINDB_SIGNING_SECRET
raisindb server start --detach                # run in the background
raisindb server start --verbose               # show server logs in the terminal
```

### With the binary directly

```bash
raisin-server --dev-mode
raisin-server --config ./raisindb.toml
raisin-server --port 8081 --data-dir /var/lib/raisindb --pgwire-enabled true --pgwire-port 5432
```

Every flag has an environment variable equivalent; CLI flags override the config file:

| Flag | Environment variable | Default |
|------|----------------------|---------|
| `--config <path>` | `RAISIN_CONFIG` | none |
| `--port <port>` | `RAISIN_PORT` | `8080` |
| `--bind-address <addr>` | `RAISIN_BIND_ADDRESS` | `127.0.0.1` |
| `--data-dir <path>` | `RAISIN_DATA_DIR` | `./.data/rocksdb` |
| `--initial-admin-password <pw>` | `RAISIN_ADMIN_PASSWORD` | generated on first start |
| `--pgwire-enabled true` | `RAISIN_PGWIRE_ENABLED` | `false` |
| `--pgwire-port <port>` | `RAISIN_PGWIRE_PORT` | `5432` |
| `--pgwire-bind-address <addr>` | `RAISIN_PGWIRE_BIND_ADDRESS` | `127.0.0.1` |
| `--pgwire-max-connections <n>` | `RAISIN_PGWIRE_MAX_CONNECTIONS` | `100` |
| `--dev-mode` | `RAISIN_DEV_MODE` | off |
| `--cluster-node-id`, `--replication-port`, `--replication-peers` | `RAISIN_CLUSTER_NODE_ID`, `RAISIN_REPLICATION_PORT`, `RAISIN_REPLICATION_PEERS` | replication off |

Logging is controlled by `RUST_LOG` (default `info`). The full config file format is in the [Configuration Reference](/docs/reference/configuration).

## Configuration file

A minimal `raisindb.toml`:

```toml
[server]
port = 8080
bind_address = "127.0.0.1"
data_dir = "./.data/rocksdb"
anonymous_enabled = true                     # unauthenticated requests get the "anonymous" role
cors_allowed_origins = ["http://localhost:5173"]

[pgwire]
enabled = true
port = 5432
```

## Production secrets

Outside `--dev-mode` the server refuses to start unless these are set:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs admin and identity tokens |
| `RAISINDB_SIGNING_SECRET` | Signs short-lived asset URLs |
| `RAISIN_MASTER_KEY` | Encrypts stored secrets and credentials (an all-zero dev key is used in dev mode) |

## First steps

### 1. Check the server

```bash
curl http://localhost:8080/health
# ok
```

### 2. Log in and get a token

```bash
curl -s -X POST http://localhost:8080/api/raisindb/sys/default/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<generated password>"}'
```

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user_id": "b86457ac-...",
  "username": "admin",
  "must_change_password": true,
  "expires_at": 1788805990,
  "access_flags": { "console_login": true, "cli_access": true, "api_access": true, "pgwire_access": false, "can_impersonate": false }
}
```

`default` is the tenant. Send the token as `Authorization: Bearer <token>` on every request.

### 3. Create a repository

```bash
curl -X POST http://localhost:8080/api/repositories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repo_id":"myapp","description":"My first repository"}'
```

Or with the CLI: `raisindb repo create myapp`.

### 4. Change the admin password

```bash
curl -X POST http://localhost:8080/api/raisindb/sys/default/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"<generated>","new_password":"<new password>"}'
```

### 5. Create an API key

API keys are long-lived credentials for scripts, drivers and `psql`. They are created for the logged-in admin user and are shown once:

```bash
curl -X POST http://localhost:8080/api/raisindb/me/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-dev"}'
```

```json
{
  "key": { "key_id": "047b191d-...", "name": "local-dev", "key_prefix": "raisin_DV2vMEwAg", "created_at": "...", "last_used_at": null, "is_active": true },
  "token": "raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e"
}
```

Use the `token` value as a bearer token on content, query and SQL endpoints, and as the `psql` password. See [Authentication API](/docs/reference/http-api/authentication).

### 6. Install the JavaScript client

```bash
npm install @raisindb/client
```

## CLI overview

```bash
raisindb login                          # browser flow against http://localhost:8080
raisindb login --server https://db.example.com --username admin --password "$PASSWORD"
raisindb login --server https://db.example.com --token "$TOKEN"
raisindb logout
# The CLI also reads RAISINDB_SERVER, RAISINDB_REPO and RAISINDB_TOKEN, which take
# precedence over .raisinrc.

raisindb package init my-app            # scaffold a project
raisindb package create ./package --check   # validate only
raisindb package create ./package       # build a .rap file
raisindb package deploy ./package -r myapp --install   # validate + build + upload (+ install)
raisindb package sync ./package --watch # live sync during development
raisindb repo create myapp
raisindb shell                          # interactive SQL shell
```

See the [CLI Reference](/docs/reference/cli/commands) for all commands and options.

## Troubleshooting

### Port already in use

`raisindb server start` tries to free port 8080 itself. To run on other ports use `raisindb server start --port 8081 --pgwire-port 5433`, or run the binary with `--port` / `--pgwire-port`.

### Storage permission denied

Make the data directory writable by the user running the server:

```bash
sudo mkdir -p /var/lib/raisindb
sudo chown -R $USER /var/lib/raisindb
raisin-server --data-dir /var/lib/raisindb
```

### Connection refused

```bash
curl http://localhost:8080/health      # HTTP
nc -zv localhost 5432                  # pgwire
raisindb server logs
```

## Next Steps

- [Connect via PostgreSQL](./connecting/pgwire.md)
- [Use the HTTP API](./connecting/http-api.md)
- [Install the JavaScript client](./connecting/javascript-client.md)
- [Create your first NodeTypes](./data-modeling/creating-nodetypes.md)
