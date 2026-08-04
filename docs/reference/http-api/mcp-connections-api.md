---
sidebar_position: 10
---

# MCP Connections API

Managing **outbound** MCP connections — remote servers whose tools your agents call. See the [Connecting to External Servers guide](../../guides/mcp/connecting-to-servers.md) for concepts.

Not to be confused with the [MCP API](./mcp-api.md), which is the inbound direction: RaisinDB serving its own tools.

All endpoints require an **admin** principal, except the OAuth callback — a browser redirect that cannot carry a bearer token, authenticated instead by its single-use `state`.

A connection is a `raisin:McpConnection` node in the `raisin:system` workspace at `/mcp-connections/{slug}`.

:::info Credentials are write-only
No endpoint ever returns a credential or a token. Reads carry `credential_set` and `oauth_connected` booleans so a UI can show "is set" without holding the secret.
:::

## List connections

```bash
GET /api/mcp-connections/{repo}
```

```json
{
  "connections": [
    {
      "title": "Linear",
      "slug": "linear",
      "url": "https://mcp.linear.app/mcp",
      "enabled": true,
      "protocol_version": "2025-06-18",
      "auth_kind": "oauth",
      "credential_set": false,
      "oauth_connected": true,
      "tool_filter": { "allow": [], "deny": [] },
      "refresh_policy": { "mode": "interval", "interval_secs": 3600, "on_save": true, "call_timeout_ms": 30000 },
      "tool_count": 12
    }
  ]
}
```

A connection whose node cannot be parsed is reported as `{ "slug": ..., "invalid": true, "error": ... }` rather than omitted — hiding it would leave you staring at a console that does not show the thing you just broke.

## Create a connection

```bash
POST /api/mcp-connections/{repo}
```

```json
{
  "slug": "linear",
  "title": "Linear",
  "url": "https://mcp.linear.app/mcp",
  "enabled": false,
  "auth_kind": "oauth"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `slug` | yes | Lowercase, digits and hyphens, 1–48 chars. **Immutable** — it is part of every generated tool path. |
| `url` | yes | Streamable HTTP endpoint. Validated against the egress policy. |
| `title` | no | Defaults to the slug. |
| `enabled` | no | Defaults to `false`. |
| `auth_kind` | no | `none` \| `static` \| `oauth`. Defaults to `none`. |
| `tool_filter` | no | `{ "allow": [], "deny": [] }` by remote tool name. Deny wins. |
| `refresh_policy` | no | `{ mode, interval_secs, on_save, call_timeout_ms }`. |

**Errors:** `409` if the slug exists. `400` for an invalid slug or a URL the egress policy refuses.

## Read, update, delete

```bash
GET    /api/mcp-connections/{repo}/{slug}
PATCH  /api/mcp-connections/{repo}/{slug}
DELETE /api/mcp-connections/{repo}/{slug}[?force=true]
```

`PATCH` accepts any create field except `slug`; omitted fields are untouched.

`DELETE` returns **409** while discovered tools still exist, listing how many — agents may reference their proxies, and a silent cascade would break those agents with no indication why. Pass `?force=true` to delete anyway.

## Credential (write-only)

```bash
PUT    /api/mcp-connections/{repo}/{slug}/credential
DELETE /api/mcp-connections/{repo}/{slug}/credential
```

```json
{
  "value": "lin_api_...",
  "static_auth": { "scheme": "header", "header_name": "X-Api-Key" }
}
```

Omit `static_auth` for `Authorization: Bearer <value>`. Setting a credential on a connection whose `auth_kind` is `none` promotes it to `static` — a stored credential the auth mode never applies would be a silent no-op.

There is deliberately **no GET**. The response carries `{ ok, credential_set, auth_kind }` and never the value.

## Test

```bash
POST /api/mcp-connections/{repo}/{slug}/test
```

Performs a real handshake and `tools/list`. It never calls a tool.

```json
{
  "reachable": true,
  "protocol_version": "2025-06-18",
  "server_info": { "name": "linear", "version": "1.2.0" },
  "tool_count": 12,
  "tools": ["search_issues", "create_issue"],
  "permitted_tool_count": 2
}
```

:::note Always 200
A broken connection still answers `200` with `{ "reachable": false, "error_code": "auth_expired", "error": "..." }`. A `5xx` would give a client only a generic failure; a structured report lets it say what is actually wrong. The status is non-2xx only for faults on *this* side, such as a missing master key.
:::

`error_code` is one of `auth_expired`, `rate_limited`, `config_error`, `protocol_error`, `transient_error`.

## Tools

```bash
GET   /api/mcp-connections/{repo}/{slug}/tools
PATCH /api/mcp-connections/{repo}/{slug}/tools/{remote_name}
POST  /api/mcp-connections/{repo}/{slug}/refresh-tools
```

`GET` returns the discovered tools, the active filter, and the last health record:

```json
{
  "tools": [
    {
      "remote_name": "search_issues",
      "function_name": "linear__search-issues",
      "function_path": "/mcp/linear/search-issues",
      "schema_hash": "sha256:...",
      "enabled": true,
      "state": "active"
    }
  ]
}
```

`function_path` is what you put in an agent's `tools:` array. `state` is `active`, `missing` (gone upstream — the proxy is disabled, never deleted) or `conflict` (its generated name collides with an existing function).

`PATCH` takes `{ "enabled": bool }`. It records the decision on `tool_filter` and enqueues a discovery run; the proxy nodes are only ever written by that job, so there is exactly one writer.

`refresh-tools` enqueues discovery and returns `{ "ok": true, "job_id": "..." }`. It is refused with `400` when the connection is disabled.

## OAuth 2.1

```bash
POST /api/mcp-connections/{repo}/{slug}/oauth/discover
POST /api/mcp-connections/{repo}/{slug}/oauth/start
POST /api/mcp-connections/{repo}/{slug}/oauth/disconnect
GET  /api/mcp-connections/{repo}/oauth/callback          # public
```

**`discover`** probes the server unauthenticated, parses the `WWW-Authenticate` challenge from its `401`, follows [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) protected-resource metadata → [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) authorization-server metadata, and registers a client via [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) when the server supports it.

```json
{
  "requires_auth": true,
  "discovered": true,
  "issuer": "https://auth.linear.app",
  "supports_dynamic_registration": true,
  "registered": true,
  "client_id": "...",
  "scopes": ["mcp"],
  "redirect_uri": "https://your-raisindb/api/mcp-connections/prod/oauth/callback"
}
```

A server that does not need authorization answers `{ "requires_auth": false }`. One that returns `401` without an RFC 9728 pointer answers `{ "discovered": false }` with a message — its endpoints must be configured by hand.

**`start`** returns `{ "auth_url", "state" }`. Open `auth_url` in a popup; the callback posts a `raisin-oauth-result` message to the opener and closes itself.

The authorize request carries PKCE `S256` and, per [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707), a `resource` parameter pinning the issued token to this MCP endpoint so it cannot be replayed at another server.

**`disconnect`** clears the stored tokens. The client registration is kept, so reconnecting needs no second round of dynamic registration.

Access tokens are refreshed automatically before expiry by the same periodic sweep that refreshes connector tokens.

## Configuration

The optional `[mcp_client]` TOML section bounds every connection in the process:

```toml
[mcp_client]
allowed_hosts = []              # empty = any PUBLIC host
allow_private_addresses = false # loopback/private + plain http
max_response_bytes = 8388608
default_timeout_ms = 30000
```

Egress is checked when a connection is saved **and** before every dial, against the addresses the hostname actually resolves to. It also covers every URL in the OAuth discovery chain, all of which the remote side chooses — so an `allowed_hosts` list must include the authorization server's host as well as the MCP endpoint's.
