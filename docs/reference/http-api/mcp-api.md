---
sidebar_position: 9
---

# MCP API

The Model Context Protocol transport and its OAuth 2.1 authorization server. See the [MCP Servers guide](../../guides/mcp/overview.md) for concepts.

These endpoints are served at the site root (not under `/api`).

## Endpoint

```bash
POST /mcp/{repo}/{branch}/{slug}
```

One JSON-RPC 2.0 message per request body. `{slug}` resolves a `raisin:McpServer` node in the `mcp` workspace; `{branch}` selects the branch served.

**Headers**

| Header | Notes |
|--------|-------|
| `Content-Type: application/json` | Required. |
| `Authorization: Bearer <token>` | Required unless the server (or tool) is `public`. Accepts a user/API-key token or an OAuth resource token. |

**Responses**

- A request (with `id`) returns a JSON-RPC response (HTTP `200`); errors are carried in the JSON-RPC `error` field.
- A notification (no `id`) returns `202` with no body.
- `resources/subscribe` returns a `text/event-stream` (SSE) of update notifications.

## Methods

### initialize

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}
```

Response:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false},"resources":{"subscribe":true,"listChanged":false}},"serverInfo":{"name":"Catalog","version":"1.0.0"},"instructions":"Query the product catalog."}}
```

### tools/list

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

Returns only the tools the caller's scopes permit. Each entry: `{ "name", "description", "inputSchema" }`. A tool bound to an [interactive widget](../../guides/mcp/interactive-widgets.md) also advertises its `outputSchema` (inherited from the function) and `_meta.ui.resourceUri` — see [Interactive-widget tools (MCP Apps)](#interactive-widget-tools-mcp-apps) below.

### tools/call

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_node","arguments":{"workspace":"products","path":"/widgets/acme"}}}
```

Response (`isError: true` marks a function/tool-level failure, distinct from a JSON-RPC `error`):

```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"json","json":{ "...": "..." }}],"isError":false}}
```

### Interactive-widget tools (MCP Apps)

A tool may declare a `ui` binding so an MCP Apps-capable host renders its results through an HTML view. The engine then does three things on the wire — the tool result itself stays **data only** (`content` + `structuredContent`), nothing UI-related is embedded in it:

- **`tools/list`**: the tool carries `_meta.ui.resourceUri: "ui://{workspace}/{entry}"` (plus the deprecated flat `"ui/resourceUri"` key for pre-GA hosts), and `_meta.ui.visibility` when the binding declares it.
- **`resources/list`**: the view is predeclared once per distinct URI — `{ uri, name, description, mimeType: "text/html;profile=mcp-app", _meta.ui: { csp, permissions, prefersBorder } }`.
- **`resources/read`** of the `ui://` URI: the widget HTML as `text` with mime `text/html;profile=mcp-app` and the same `_meta.ui` on the content item (spec precedence over the listing entry). The read is an ordinary RLS-scoped asset read.

Binding fields (on the `raisin:McpServer` tool entry or the function's `mcp` block):

| Field | Meaning |
|---|---|
| `mode` | `html` — MCP Apps view delivery. `uri-list` is reserved (the spec's deferred external-URL content type). |
| `entry` | **Absolute node path** (leading `/`) of the widget's HTML asset. |
| `workspace` | Workspace `entry` resolves in; defaults to the session workspace (first of `data.workspaces`). |
| `name` / `description` | The view's identity in `resources/list`. |
| `csp` | `{ connectDomains, resourceDomains, frameDomains, baseUriDomains }` — when omitted, the server declares its own origin for connect + resource. |
| `permissions` | Sandbox permission requests (camera/microphone/geolocation/clipboardWrite), passed through. |
| `prefersBorder` | Host renders a visible border + background. |
| `visibility` | `[model, app]` (default) or `[app]` for view-only tools. |

The view↔host runtime protocol (handshake, `tool-input`/`tool-result` notifications, view-initiated `tools/call`) is documented in the [View↔Host protocol reference](../mcp-ui-client/view-protocol.md); the [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md) covers the authoring workflow.

### resources/list · resources/read · resources/subscribe

Available when the server's `data.resources` is `true`. Resources are addressed as `raisin://{workspace}/{path}`.

```json
{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"raisin://products/widgets/acme"}}
```

A resource is returned as one or more `contents` entries. A node's properties come back as a `text` block (JSON-stringified); a binary asset (image, PDF, HTML) comes back byte-for-byte as a base64 `blob`:

```json
{"jsonrpc":"2.0","id":4,"result":{"contents":[{"uri":"raisin://products/widgets/acme","mimeType":"image/png","blob":"iVBORw0KGgo…"}]}}
```

Each entry carries `uri`, `mimeType`, and exactly one of `text` (UTF-8 payloads) or `blob` (base64-encoded raw bytes). This makes any uploaded asset readable over `resources/read`. Widget views use the dedicated `ui://{workspace}/{path}` scheme on this same method and come back as `text` with mime `text/html;profile=mcp-app` — see [Interactive-widget tools (MCP Apps)](#interactive-widget-tools-mcp-apps).

`resources/subscribe` upgrades to SSE and streams `notifications/resources/updated` frames as nodes change.

## Error codes

| Code | Meaning |
|------|---------|
| `-32700` | Parse error (malformed JSON). |
| `-32600` | Invalid request. |
| `-32601` | Method or tool not found / server slug not found. |
| `-32602` | Invalid params. |
| `-32001` | Unauthorized (missing scopes, or authentication required for a non-public server). |

## OAuth 2.1 authorization server

Interactive clients discover and use these automatically. All are served at the site root.

### Discovery metadata

```bash
GET /.well-known/oauth-authorization-server                              # RFC 8414
GET /.well-known/oauth-protected-resource/mcp/{repo}/{branch}/{slug}     # RFC 9728
```

The protected-resource document's `resource` is the canonical MCP URL; `authorization_servers` points back to this issuer. `code_challenge_methods_supported` is `["S256"]`.

### Dynamic client registration (RFC 7591)

```bash
POST /register
```

Request:

```json
{"client_name":"my-agent","redirect_uris":["https://app.example.com/cb"],"token_endpoint_auth_method":"none","grant_types":["authorization_code"],"response_types":["code"]}
```

Response includes `client_id` (and `client_secret` for confidential clients).

### Authorization (RFC 6749 §4.1, PKCE S256)

```bash
GET  /authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&scope=…&resource=…
POST /authorize    # login + consent form submission
```

`GET` renders the login + consent form. `POST` authenticates the resource owner against the identity store and redirects to `redirect_uri?code=…&state=…`. `resource` is the MCP endpoint URL the token will target (RFC 8707).

### Token

```bash
POST /token
```

Form body: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`.

Response:

```json
{"access_token":"…","token_type":"Bearer","expires_in":3600,"scope":"catalog:read"}
```

The access token is **audience-bound** to the requested MCP resource and carries the **consented scopes** (the intersection of requested scopes and the user's roles/groups). Present it as `Authorization: Bearer <token>` on the MCP endpoint.

## Configuration

Behind a reverse proxy, set `RAISINDB_BASE_URL` to the canonical external origin so issuer and token audiences stay fixed. `X-Forwarded-*` headers are honoured only when `RAISINDB_TRUST_FORWARDED_HEADERS=1`. See the [authentication guide](../../guides/mcp/authentication.md#self-hosting-behind-a-proxy).
