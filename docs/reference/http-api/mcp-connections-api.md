---
sidebar_position: 10
---

# MCP Connections API

Managing **outbound** MCP connections: remote servers whose tools your agents call. See the [Connecting to External Servers guide](../../guides/mcp/connecting-to-servers.md) for concepts.

Not to be confused with the [MCP API](./mcp-api.md), which is the inbound direction: RaisinDB serving its own tools.

All endpoints require an **admin** principal (the `admin` or `system_admin` role, or a system token); anything else answers `403`. The exception is the OAuth callback, a browser redirect authenticated by its single-use `state`.

A connection is a `raisin:McpConnection` node in the `raisin:system` workspace of the `main` branch at `/mcp-connections/{slug}`. Discovered proxies are `raisin:Function` nodes at `/mcp/{slug}/{tool}` in the `functions` workspace.

:::info Credentials are write-only
No endpoint returns a credential or a token. Reads carry `credential_set` and `oauth_connected` booleans so a UI can show "is set" without holding the secret.
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
      "static_auth": "Bearer",
      "credential_set": false,
      "oauth_connected": true,
      "oauth_client": { "issuer": "https://auth.linear.app", "client_id": "…", "scopes": ["mcp"] },
      "expires_at": 1788723465,
      "tool_filter": { "allow": [], "deny": [] },
      "refresh_policy": { "mode": "interval", "interval_secs": 3600, "on_save": true, "notifications": false, "call_timeout_ms": 30000 },
      "tool_count": 12
    }
  ]
}
```

`static_auth` reads back as `"Bearer"` or `{ "Header": { "name": "X-Api-Key" } }`. `protocol_version` is the revision agreed on the last handshake and is `null` until discovery has run.

A connection whose node cannot be parsed is reported as `{ "slug", "path", "invalid": true, "error" }` rather than omitted, so a broken node stays visible in the console.

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
| `slug` | yes | Lowercase letters, digits and hyphens, 1–48 characters. Cannot be changed; it is part of every generated tool path. |
| `url` | yes | Streamable HTTP endpoint. Must be `https` and pass the egress policy unless `allow_private_addresses` is on. |
| `title` | no | Defaults to the slug. |
| `enabled` | no | Defaults to `false`. |
| `auth_kind` | no | `none`, `static` or `oauth`. Defaults to `none`. |
| `static_auth` | no | `{ "scheme": "bearer" }` (default) or `{ "scheme": "header", "header_name": "X-Api-Key" }`. |
| `tool_filter` | no | `{ "allow": [], "deny": [] }` by remote tool name. Deny wins. |
| `refresh_policy` | no | `{ mode, interval_secs, on_save, notifications, call_timeout_ms }`. Defaults: `manual`, 3600, `true`, `false`, 30000. |

The response is the connection as returned by `GET`. Errors: `409 CONNECTION_EXISTS` if the slug exists; `400 VALIDATION_FAILED` for an invalid slug or a URL the egress policy refuses, for example:

```json
{"code":"VALIDATION_FAILED","message":"mcp configuration error: endpoint URL must use https (http is allowed only when [mcp_client] allow_private_addresses is enabled)"}
```

## Read, update, delete

```bash
GET    /api/mcp-connections/{repo}/{slug}
PATCH  /api/mcp-connections/{repo}/{slug}
DELETE /api/mcp-connections/{repo}/{slug}[?force=true]
```

`PATCH` accepts any create field except `slug`; omitted fields are untouched, and the response is the updated connection.

`DELETE` returns `409` while discovered tools still exist, because agents may reference their proxies. Pass `?force=true` to delete anyway. On success: `{ "ok": true, "slug": "linear" }`.

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

Omit `static_auth` for `Authorization: Bearer <value>`. Setting a credential on a connection whose `auth_kind` is `none` switches it to `static`; clearing the credential switches it back to `none`.

There is no `GET`. Both calls answer `{ "ok": true, "credential_set": true, "auth_kind": "static" }` (with `false` and `none` after a delete).

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
  "capabilities": { "tools": { "listChanged": true } },
  "instructions": "…",
  "tool_count": 12,
  "tools": ["search_issues", "create_issue"],
  "permitted_tool_count": 2
}
```

A broken connection still answers `200` with a structured report:

```json
{"reachable":false,"tool_count":0,"tools":[],"permitted_tool_count":0,"error_code":"transient_error","error":"mcp transient error: could not resolve `mcp.example.com`: …"}
```

`error_code` is one of `auth_expired`, `rate_limited`, `config_error`, `protocol_error`, `session_expired`, `transient_error`. The status is non-2xx only for faults on this side, such as a missing master key.

## Tools

```bash
GET   /api/mcp-connections/{repo}/{slug}/tools
PATCH /api/mcp-connections/{repo}/{slug}/tools/{remote_name}
POST  /api/mcp-connections/{repo}/{slug}/refresh-tools
```

`GET` returns the discovered tools, the active filter, the last health record and the last sync time:

```json
{
  "slug": "linear",
  "tools": [
    {
      "remote_name": "search_issues",
      "function_name": "linear__search-issues",
      "function_path": "/mcp/linear/search-issues",
      "schema_hash": "sha256:…",
      "enabled": true,
      "state": "active"
    }
  ],
  "tool_filter": { "allow": [], "deny": [] },
  "health": null,
  "last_synced_at": "2026-09-06T18:40:12Z"
}
```

`function_path` is what goes in an agent's `tools` array. `state` is `active`, `missing` (gone upstream; the proxy is disabled but kept) or `conflict` (its generated name collides with an existing function).

`PATCH` takes `{ "enabled": bool }`, records the decision on `tool_filter` and enqueues a discovery run. It answers `{ "ok", "remote_name", "enabled", "tool_filter", "refresh_job_id" }`. The proxy nodes are only written by the discovery job.

`refresh-tools` enqueues discovery and returns `{ "ok": true, "job_id": "…" }`. It answers `400` when the connection is disabled.

## Prune

```bash
DELETE /api/mcp-connections/{repo}/{slug}/tools/{remote_name}[?force=true]
POST   /api/mcp-connections/{repo}/{slug}/prune-tools[?force=true]
```

Delete one proxy, or every proxy whose state is `missing`. Both answer `{ "ok": true, "pruned": 2, "tools": ["/mcp/linear/old-tool", …] }`. Without `force`, a proxy an agent still references makes the call fail with `409 TOOLS_IN_USE` naming the agents. `DELETE` on an unknown remote name is `404 TOOL_NOT_FOUND`.

Discovery never deletes a proxy on its own; pruning is the explicit counterpart.

## OAuth 2.1

```bash
POST   /api/mcp-connections/{repo}/{slug}/oauth/discover
POST   /api/mcp-connections/{repo}/{slug}/oauth/start
PUT    /api/mcp-connections/{repo}/{slug}/oauth/client
DELETE /api/mcp-connections/{repo}/{slug}/oauth/client
POST   /api/mcp-connections/{repo}/{slug}/oauth/disconnect
GET    /api/mcp-connections/{repo}/oauth/callback          # public
```

**`discover`** probes the server unauthenticated, parses the `WWW-Authenticate` challenge from its `401`, follows [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) protected-resource metadata to [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) authorization-server metadata, and registers a client through [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) when the server supports it. On success it sets `auth_kind` to `oauth` and answers:

```json
{
  "ok": true,
  "requires_auth": true,
  "discovered": true,
  "auth_method": "none",
  "client_secret_required": false,
  "client_secret_set": false,
  "needs_manual_client_secret": false,
  "issuer": "https://auth.linear.app",
  "authorization_endpoint": "https://auth.linear.app/authorize",
  "token_endpoint": "https://auth.linear.app/token",
  "supports_dynamic_registration": true,
  "registered": true,
  "client_id": "…",
  "scopes": ["mcp"],
  "redirect_uri": "https://your-raisindb/api/mcp-connections/prod/oauth/callback"
}
```

A server that does not need authorization answers `{ "ok": true, "requires_auth": false, "discovered": false, "status": 200 }`. One that returns `401` without an RFC 9728 pointer answers `{ "ok": true, "requires_auth": true, "discovered": false, "message": "…" }`; configure its endpoints by hand with `oauth/client`. An unreachable server answers `{ "ok": false, "discovered": false, "error_code", "error" }`.

**`oauth/client`** (`PUT`) stores a client registration you obtained yourself: `{ "client_id", "client_secret", "issuer", "authorization_endpoint", "token_endpoint", "scopes" }`. Only `client_id` is required; endpoints already found by `discover` are kept when omitted. The response is `{ "ok": true, "client_id_set": true, "client_secret_set": bool }`. `DELETE` clears the registration and the stored tokens.

**`start`** returns `{ "auth_url", "state" }`. Open `auth_url` in a popup. The authorize request carries PKCE `S256` and, per [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707), a `resource` parameter binding the issued token to this MCP endpoint. After consent the callback stores the tokens, posts a `{ "type": "raisin-oauth-result", "connected": "<slug>" }` message (or `{ "type": "raisin-oauth-result", "error": "…" }`) to the opener window and closes itself.

**`disconnect`** clears the stored tokens and answers `{ "ok": true, "oauth_connected": false }`. The client registration is kept, so reconnecting needs no second registration.

Access tokens are refreshed before expiry by the same periodic sweep that refreshes connector tokens.

## Configuration

The optional `[mcp_client]` TOML section bounds every connection in the process:

```toml
[mcp_client]
allowed_hosts = []              # empty = any PUBLIC host
allow_private_addresses = false # loopback/private and plain http
max_response_bytes = 8388608
default_timeout_ms = 30000
```

`refresh_policy.notifications` opts the connection into a held-open notification stream so tool changes arrive live instead of at the next interval. It defaults to `false` and requires the server to speak `2026-07-28` or advertise `tools.listChanged`. On a replicated cluster it requires `[locks]` with the `redis` backend; otherwise no listener is started.

Egress is checked when a connection is saved and before every dial, against the addresses the hostname resolves to. It also covers every URL in the OAuth discovery chain, so an `allowed_hosts` list must include the authorization server's host as well as the MCP endpoint's.
