---
sidebar_position: 1
---

# Installation & Setup

Get RaisinDB up and running in your development environment.

## Quick Start

The fastest way to get started is using the CLI:

```bash
npm install -g @raisindb/cli
raisindb server start
```

This downloads the server binary for your platform and starts RaisinDB with:
- HTTP API on port 8080
- PostgreSQL wire protocol on port 5432

## Installation Options

### CLI (Recommended)

The RaisinDB CLI downloads and manages the server binary automatically:

```bash
# Install the CLI
npm install -g @raisindb/cli

# Download and start the server
raisindb server start

# Or install the binary separately
raisindb server install

# Update to the latest version
raisindb server update

# Check installed version
raisindb server version
```

The server binary is cached in `~/.raisindb/bin/` and verified with SHA256 checksums.

### Binary Download

Download pre-built binaries directly from [GitHub Releases](https://github.com/maravilla-labs/raisindb/releases):

```bash
# macOS (Apple Silicon)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-aarch64-apple-darwin.tar.gz
tar xzf raisindb-latest-aarch64-apple-darwin.tar.gz
sudo mv raisindb-*/raisindb /usr/local/bin/

# macOS (Intel)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-x86_64-apple-darwin.tar.gz
tar xzf raisindb-latest-x86_64-apple-darwin.tar.gz
sudo mv raisindb-*/raisindb /usr/local/bin/

# Linux (x64)
curl -LO https://github.com/maravilla-labs/raisindb/releases/latest/download/raisindb-latest-x86_64-unknown-linux-gnu.tar.gz
tar xzf raisindb-latest-x86_64-unknown-linux-gnu.tar.gz
sudo mv raisindb-*/raisindb /usr/local/bin/

# Windows (x64) — download the .zip from GitHub Releases
# https://github.com/maravilla-labs/raisindb/releases
```

### Build from Source

```bash
# Prerequisites: Rust 1.89+
git clone https://github.com/maravilla-labs/raisindb.git
cd raisindb

# Build server
cargo build --release --package raisin-server --features "storage-rocksdb,websocket,pgwire"

# Binary will be at target/release/raisin-server
```

## Configuration

Create a configuration file at `~/.config/raisindb/config.toml`:

```toml
[server]
host = "0.0.0.0"
http_port = 8080
pgwire_port = 5432

[storage]
type = "rocksdb"
path = "/var/lib/raisindb/data"

[auth]
mode = "password"  # Options: "password", "api_key", "oidc", "none"
secret_key = "your-secret-key-here"

[tenants.default]
enabled = true
```

## Starting the Server

### Using the CLI (recommended):

```bash
raisindb server start
# Or with options:
raisindb server start --config ~/.config/raisindb/config.toml
raisindb server start --port 8081 --pgwire-enabled true
```

### Using the binary directly:

```bash
raisin-server --config ~/.config/raisindb/config.toml
```

### Using environment variables:

```bash
export RAISINDB_HTTP_PORT=8080
export RAISINDB_PGWIRE_PORT=5432
export RAISINDB_STORAGE_PATH=/var/lib/raisindb/data
raisin-server
```

## CLI Tools

The CLI also provides tools for package management and development:

```bash
# Package management
raisindb package create ./my-project    # Create a .rap package
raisindb package install ./my-project   # Install a package on the server
raisindb package sync                   # Sync local changes to server

# Interactive shell
raisindb shell
```

## First Steps

### 1. Verify the Server is Running

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

### 2. Create Your First Repository

Using the HTTP API:

```bash
curl -X POST http://localhost:8080/api/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "repository_id": "myapp",
    "description": "My first RaisinDB repository"
  }'
```

### 3. Connect via PostgreSQL

```bash
psql -h localhost -p 5432 -U admin -d default/myapp
```

When prompted, enter the default password: `admin`

### 4. Install JavaScript Client

For application development:

```bash
npm install @raisindb/client
```

## Authentication Setup

### Password Authentication (Development)

Default credentials:
- Username: `admin`
- Password: `admin`

**Change the admin password immediately:**

```bash
curl -X POST http://localhost:8080/api/raisindb/sys/default/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "old_password": "admin",
    "new_password": "your-secure-password"
  }'
```

### API Key Authentication (Production)

Generate an API key:

```bash
curl -X POST http://localhost:8080/api/raisindb/me/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "production-key",
    "expires_at": "2025-12-31T23:59:59Z"
  }'
```

Use the API key in requests:

```bash
curl http://localhost:8080/api/repositories \
  -H "X-API-Key: your-api-key"
```

### OIDC Authentication (Enterprise)

Configure in `config.toml`:

```toml
[auth.oidc]
enabled = true
provider = "google"  # or "okta", "azure", "keycloak"
client_id = "your-client-id"
client_secret = "your-client-secret"
issuer_url = "https://accounts.google.com"
```

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `RAISINDB_HTTP_PORT` | HTTP API port | `8080` |
| `RAISINDB_PGWIRE_PORT` | PostgreSQL protocol port | `5432` |
| `RAISINDB_STORAGE_PATH` | Data storage directory | `/var/lib/raisindb/data` |
| `RAISINDB_TENANT_ID` | Default tenant ID | `default` |
| `RAISINDB_AUTH_MODE` | Authentication mode | `password` |
| `RAISINDB_LOG_LEVEL` | Logging level | `info` |

## Troubleshooting

### Port Already in Use

If ports 8080 or 5432 are occupied:

```bash
# Use different ports
raisindb server start --port 8081 --pgwire-port 5433
```

### Storage Permission Denied

Ensure the data directory is writable:

```bash
sudo mkdir -p /var/lib/raisindb/data
sudo chown -R $USER:$USER /var/lib/raisindb
```

### Connection Refused

Check if the server is running:

```bash
# Check HTTP API
curl http://localhost:8080/health

# Check PostgreSQL
nc -zv localhost 5432
```

## Next Steps

- [Connect via PostgreSQL](./connecting/pgwire.md)
- [Use the HTTP API](./connecting/http-api.md)
- [Install the JavaScript client](./connecting/javascript-client.md)
- [Create your first NodeTypes](./data-modeling/creating-nodetypes.md)
