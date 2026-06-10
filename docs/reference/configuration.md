---
sidebar_position: 1
---

# Configuration Reference

RaisinDB server configuration options.

## Configuration File

Location: `~/.config/raisindb/config.toml`

## Server Configuration

```toml
[server]
host = "0.0.0.0"
http_port = 8080
pgwire_port = 5432
```

## Storage Configuration

```toml
[storage]
type = "rocksdb"  # or "mongodb", "postgres", "memory"
path = "/var/lib/raisindb/data"
```

## Authentication

```toml
[auth]
mode = "password"  # or "api_key", "oidc", "none"
secret_key = "your-secret-key"
token_expiry = 3600  # seconds
```

### OIDC Configuration

```toml
[auth.oidc]
enabled = true
provider = "google"
client_id = "your-client-id"
client_secret = "your-client-secret"
issuer_url = "https://accounts.google.com"
```

## Tenants

```toml
[tenants.default]
enabled = true
max_repositories = 100

[tenants.production]
enabled = true
max_repositories = 50
```

## Logging

```toml
[logging]
level = "info"  # debug, info, warn, error
format = "json"  # or "text"
output = "stdout"  # or file path
```

## Performance

```toml
[performance]
max_connections = 1000
query_timeout = 30  # seconds
max_query_results = 10000
```

## Vector Search Configuration

```toml
[embedding]
# Distance metrics: "cosine", "l2", "inner_product", "hamming"
distance_metric = "cosine"

# Default max distance threshold for search results
default_max_distance = 0.6

# HNSW index parameters
hnsw_m = 16                  # Bi-directional links per node
hnsw_ef_construction = 200   # Candidate list size during index building
hnsw_ef_search = 50          # Candidate list size during search

# Vector quantization: "f32", "f16", "int8"
quantization = "f32"
```

## Environment Variables

Override config with environment variables:

- `RAISINDB_HTTP_PORT` - HTTP port
- `RAISINDB_PGWIRE_PORT` - PostgreSQL port
- `RAISINDB_STORAGE_PATH` - Data directory
- `RAISINDB_AUTH_MODE` - Authentication mode
- `RAISINDB_LOG_LEVEL` - Log level
