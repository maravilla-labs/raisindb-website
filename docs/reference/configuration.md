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
http_url = "http://127.0.0.1:8081"   # optional
```

Flags: `--cluster-node-id`, `--replication-port`, `--replication-peers "node2=127.0.0.1:9002,node3=127.0.0.1:9003"`.

`http_url` is the base URL of the peer's HTTP API. Replication does not use it; cluster-wide admin operations do. An [index repair](./http-api/index-repairs-api.md) started on one node is forwarded to every peer that has an `http_url`, and peers without one are skipped. The `--replication-peers` flag has no way to set it, so a peer given on the command line keeps the `http_url` of the file entry with the same `peer_id`.

All nodes of a cluster must run the same release. Older releases' replication operations that a node does not understand are skipped.

## `[monitoring]`

```toml
[monitoring]
enabled = true
interval_secs = 30
port = 9100          # optional; metrics are served on the main HTTP port when omitted
```

Flags: `--monitoring-enabled`, `--monitoring-interval-secs`, `--monitoring-port`.

## `[storage]`

RocksDB memory bounds and index maintenance.

```toml
[storage]
block_cache_size = 536870912        # bytes
db_write_buffer_size = 268435456    # bytes
index_skip_unchanged = true
history_gc_collapse_runs = false
```

| Key | Env | Default | Description |
|-----|-----|---------|-------------|
| `block_cache_size` | | built-in tuning | Block cache in bytes, shared by all column families. |
| `db_write_buffer_size` | | built-in tuning | Total memtable budget in bytes. |
| `index_skip_unchanged` | `RAISIN_INDEX_SKIP_UNCHANGED` | `true` | An update writes only the property index entries whose values changed. It takes effect on a branch once this node has finished the `property_index` repair there, which queues itself in the background. Setting it to `false` is always safe. The env variable (`0` or `1`) overrides the file either way. |
| `history_gc_collapse_runs` | `RAISIN_HISTORY_GC_COLLAPSE_RUNS` | `false` | Allows the admin-started `collapse_runs` repair, which removes consecutive index versions that hold the same state. It is refused on a node that replicates. |

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
| `RAISIN_SUPERADMIN_TOKEN` | Operator superadmin bearer token. Also sent by a node when it forwards an [index repair](./http-api/index-repairs-api.md) to its peers, so cluster nodes share it. |
| `RUST_LOG` | Log filter, default `info` (for example `warn,raisin_server=info`) |

### Index and query switches

These default to on. Each accepts `0`, `false`, `off` or `no` to switch off (`RAISIN_SQL_OPTIMIZER_VERIFY` defaults to off and takes `1`, `true`, `on` or `yes`).

| Variable | Default | Effect |
|----------|---------|--------|
| `RAISIN_SQL_PLAN_CACHE` | on | Reuse SQL plans: a statement with `$1`-style parameters is planned once and run again with new values. `0` plans every statement from scratch. |
| `RAISIN_SQL_BATCHED_FETCH` | on | Index scans and `RESOLVE` read nodes in batches. `0` reads one node per row. |
| `RAISIN_LOCALIZED_NAME_INDEX` | on | Maintain and use the [localized name index](../guides/data-modeling/localized-paths.md#index-build-and-fallback). `0` stops writing it, refuses builds and answers every lookup row by row; switching it back on rebuilds every branch. |
| `RAISIN_NODE_PATH_AUTO_BACKFILL` | on | Run the `node_path` repair by itself after startup, one branch at a time. |
| `RAISIN_PROPERTY_INDEX_AUTO_REBUILD` | on | Run the `property_index` repair by itself after startup while `index_skip_unchanged` is on. The admin endpoint still works when off. |
| `RAISIN_BLOCK_OVERLAY_TOMBSTONES_AUTO` | on | Run the `block_overlay_tombstones` cleanup by itself after startup. The admin endpoint still works when off. |
| `RAISIN_COMPOUND_FORMAT_REBUILD` | on | Let the `compound_builds` repair rebuild, by itself after startup, compound indexes built by an older release. `0` leaves them unused (their queries scan) until you rebuild them by hand with `reindex/start` and `index_types: ["compound"]`. The repair still builds and drops the [built-in folder index](../concepts/indexing.md#built-in-folder-index); that one is switched per workspace. See [Upgrading](../guides/installation.md#upgrading). |
| `RAISIN_SQL_OPTIMIZER_VERIFY` | off | Diagnostic: run one extra optimizer round per query and log when it still changes the plan. |

The automatic repairs start shortly after the job system does, never block startup, and record their progress per branch, so a restart resumes rather than repeats them. Their state is visible through the [Index Repairs API](./http-api/index-repairs-api.md).

A complete, tested example lives in the repository at `examples/cluster/node1.toml`.
