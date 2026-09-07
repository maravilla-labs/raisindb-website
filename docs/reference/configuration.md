---
sidebar_position: 1
---

# Configuration Reference

The server reads an optional TOML file (`--config <path>` or `RAISIN_CONFIG`). Command-line flags and their environment variables override values from the file. Every section is optional; omitted sections use the defaults shown here.

## `[server]`

```toml
[server]
port = 8080
bind_address = "127.0.0.1"
data_dir = "./.data/rocksdb"
initial_admin_password = "ChangeMe123!"      # used only when the admin user is first created
anonymous_enabled = false                    # unauthenticated requests resolve to the "anonymous" role
cors_allowed_origins = ["http://localhost:5173"]
```

| Key | Flag / env | Default |
|-----|------------|---------|
| `port` | `--port` / `RAISIN_PORT` | `8080` |
| `bind_address` | `--bind-address` / `RAISIN_BIND_ADDRESS` | `127.0.0.1` |
| `data_dir` | `--data-dir` / `RAISIN_DATA_DIR` | `./.data/rocksdb` |
| `initial_admin_password` | `--initial-admin-password` / `RAISIN_ADMIN_PASSWORD` | generated and printed on first start |
| `anonymous_enabled` | none | `false` |
| `cors_allowed_origins` | none | `[]` |

## `[pgwire]`

The PostgreSQL wire protocol listener is off by default in the binary; `raisindb server start` turns it on unless a `--config` file or `RAISIN_PGWIRE_ENABLED` decides otherwise.

```toml
[pgwire]
enabled = true
bind_address = "127.0.0.1"
port = 5432
max_connections = 100
```

Flags: `--pgwire-enabled true|false`, `--pgwire-bind-address`, `--pgwire-port`, `--pgwire-max-connections` (env `RAISIN_PGWIRE_*`). See [PostgreSQL Wire Protocol](../guides/connecting/pgwire.md).

## `[replication]`

Multi-node replication. Off by default.

```toml
[replication]
enabled = true
node_id = "node1"
port = 9001
bind_address = "127.0.0.1"

[[replication.peers]]
peer_id = "node2"
address = "127.0.0.1"
port = 9002
```

Flags: `--cluster-node-id`, `--replication-port`, `--replication-peers "node2=127.0.0.1:9002,node3=127.0.0.1:9003"`.

## `[monitoring]`

```toml
[monitoring]
enabled = true
interval_secs = 30
port = 9100          # optional; metrics are served on the main HTTP port when omitted
```

Flags: `--monitoring-enabled`, `--monitoring-interval-secs`, `--monitoring-port`.

## `[storage]`

RocksDB memory bounds. Both are unset by default, which keeps the built-in production tuning.

```toml
[storage]
block_cache_size = 536870912        # bytes
db_write_buffer_size = 268435456    # bytes
```

## `[secrets]`

```toml
[secrets]
vaulting_enabled = true
```

When `true` (the default), a property declared `encrypted: true` in a schema is moved into the secret store on write and the node keeps a `secret://` reference. Setting it to `false` stores such properties as plaintext; the server logs a warning at startup and for every affected write.

## `[locks]`

Enables the atomic [locks and inventory](../guides/coordination/locks-and-inventory.md) subsystem. Off by default.

```toml
[locks]
enabled = true
backend = "inprocess"   # "inprocess" = single server; "redis" = cluster
reaper_interval_secs = 30

[locks.redis]           # only used when backend = "redis"
url = "redis://127.0.0.1:6379/0"
namespace = "raisin:locks"
```

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Master switch for locks and inventory. |
| `backend` | `"inprocess"` | `"inprocess"` (single node) or `"redis"` (cluster). |
| `reaper_interval_secs` | `30` | Expired-lock sweep interval (in-process backend). |
| `redis.url` | `redis://127.0.0.1:6379/0` | Redis connection URL. |
| `redis.namespace` | `raisin:locks` | Key prefix on the Redis instance. |

The `inprocess` backend coordinates within one server only. A multi-node cluster needs `backend = "redis"` and a server built with the `locks-redis` feature.

## `[mcp_client]`

Outbound MCP connections (RaisinDB calling other servers' tools). The defaults refuse loopback and private addresses.

```toml
[mcp_client]
allowed_hosts = []                 # empty = any public host; entries are exact or "*.example.com"
allow_private_addresses = false    # local development only
max_response_bytes = 8388608
default_timeout_ms = 30000
```

## `[trigger_safety]`

Rate limits for trigger functions, on by default. Keys: `enabled`, `rate_limit_per_window`, `rate_limit_hard_ceiling`, `node_fire_budget`, `window_secs`.

## `[platform.hooks.<name>]`

Named endpoints that server-side functions may call with `raisin.platform.hook('<name>', payload)`. This is the supported way for a function to reach a service on a loopback or private address, which `raisin.http.fetch` refuses.

```toml
[platform.hooks.studio_update]
url = "http://127.0.0.1:8080/internal/studio/update"
token_env = "STUDIO_INTERNAL_TOKEN"     # or token = "..."
token_header = "x-studio-internal-token"
timeout_ms = 120000
```

## `[functions.wasm]`

Settings for WebAssembly component functions. Keys and defaults: `enabled = true`, `max_artifact_bytes = 33554432`, `compiled_cache_bytes = 268435456`, `max_wasm_stack_bytes = 1048576`, `epoch_tick_ms = 10`, `allocation = "on-demand"` (or `"pooling"`), `max_instances = 15`, `stdout_capture_bytes = 1048576`.

## Other keys

- `max_active_jobs_per_tenant` (top level): cap on concurrently running jobs per tenant.
- `[system_definitions]`: overlay directory for built-in node types and packages.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `RAISIN_CONFIG` | Path to the TOML file |
| `RAISIN_PORT`, `RAISIN_BIND_ADDRESS`, `RAISIN_DATA_DIR` | HTTP listener and storage |
| `RAISIN_ADMIN_PASSWORD` | Initial admin password |
| `RAISIN_PGWIRE_ENABLED`, `RAISIN_PGWIRE_PORT`, `RAISIN_PGWIRE_BIND_ADDRESS`, `RAISIN_PGWIRE_MAX_CONNECTIONS` | pgwire listener |
| `RAISIN_CLUSTER_NODE_ID`, `RAISIN_REPLICATION_PORT`, `RAISIN_REPLICATION_PEERS` | Replication |
| `RAISIN_DEV_MODE` | Development mode (insecure default secrets) |
| `JWT_SECRET` | Token signing secret; required unless in dev mode |
| `RAISINDB_SIGNING_SECRET` | Signed asset URL secret; required unless in dev mode |
| `RAISIN_MASTER_KEY` | Encryption key for the secret store |
| `RUST_LOG` | Log filter, default `info` (for example `warn,raisin_server=info`) |

A complete, tested example lives in the repository at `examples/cluster/node1.toml`.
