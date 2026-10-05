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

## Upgrading

With the CLI, `raisindb server update` fetches the latest release; restart the
server afterwards. With a downloaded binary, stop the server, replace the
binary and start it again on the same data directory.

Some maintenance runs by itself after an upgrade. It starts shortly after the
server is up, never blocks startup, runs one branch at a time and resumes after
a restart: recording node paths in the current format, rebuilding the property
index, building the [localized name index](./data-modeling/localized-paths.md),
cleaning up translations of deleted blocks, and building compound indexes
(the built-in folder index, and compound indexes built by an older release).
Queries are answered correctly
throughout; some are slower until the work finishes. Follow it with the
[Index Repairs API](../reference/http-api/index-repairs-api.md) status endpoint,
and see the [configuration reference](../reference/configuration.md#index-and-query-switches)
for the switches that turn most of them off (the built-in folder index is
switched off per workspace instead).

### Notes for the localized-paths release

These apply when you upgrade to the release that introduced
[localized paths](./data-modeling/localized-paths.md) (October 2026), or past it.

- **Downgrading is not supported.** The release changes how node records and
  replicated translations are stored, and an older binary cannot read them
  correctly. Back up the data directory before upgrading.
- **Upgrade every node of a cluster.** All nodes must run the same release.
  Replication operations from older releases that the new one no longer
  understands, including any still sitting in a saved operation log, are
  skipped. Translations now replicate as a single operation type; if a replica
  is missing translations, run the `resync_translations` repair. To start
  repairs on all nodes from one request, give each peer an `http_url` in
  `[[replication.peers]]`.
- **Existing compound indexes are rebuilt automatically.** A compound index
  built by an earlier release is not used until it is rebuilt; until then its
  queries scan, with correct results. About two minutes after start, each node's
  `compound_builds` repair rebuilds them in the background, one branch at a
  time, paced and only with enough free disk (twice the compound index's size).
  The same job builds the new [built-in folder index](../concepts/indexing.md#built-in-folder-index)
  on every workspace. Follow it with
  `GET /api/management/{repo}/repairs/compound_builds/status`.

  To keep the rebuild under your control instead, start the nodes with
  `RAISIN_COMPOUND_FORMAT_REBUILD=0` and rebuild per node at a quiet time, per
  workspace:

  ```bash
  curl -s -X POST "http://localhost:8080/api/admin/management/database/default/myrepo/reindex/start?branch=main" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"workspace": "content", "index_types": ["compound"]}'
  ```

  Compound indexes created after the upgrade are built as usual.
- **Folder listings by creation time get faster on their own.**
  `CHILD_OF(...) ORDER BY created_at` is served by the built-in folder index
  once it is built on a node; it scans until then. A node written by a very old
  release may lack `created_at`; while a workspace holds such a node, the
  built-in index is not used there and its listings keep scanning (correct,
  slower) until those nodes are rewritten.

Behaviour changes you may notice:

- `SELECT *` no longer includes the `embedding` column. Name it explicitly when
  you need the vector.
- `ARRAY_AGG(x ORDER BY y DESC)` now sorts descending. It used to sort
  ascending.
- Time-travel reads (`rev/…` routes, `__revision` in SQL) return translations
  as they were at that revision.
- Deleting a node ends all of its translations, including those of its blocks.
- `RESOLVE` applies row-level security to every target it inlines, and a
  statement that would inline too much fails with an error instead of returning
  a partly resolved document. See
  [RESOLVE](../reference/sql/functions/path-functions.md#resolve).
- In functions, `raisin.sql.query` and `raisin.sql.execute` accept a `SELECT`
  without `FROM`, as the HTTP and PostgreSQL interfaces already did.
- `EXPLAIN` of a compound index scan prints `index-order` or
  `reverse-index-order` for the direction it reads the index, and the index
  owner: `(owner: workspace stories)` or `(owner: node type site:NewsItem)`.

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
