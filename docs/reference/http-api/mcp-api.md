---
sidebar_position: 9
---

# MCP API

The Model Context Protocol transport and its OAuth 2.1 authorization server. See the [MCP Servers guide](../../guides/mcp/overview.md) for concepts.

These endpoints are served at the site root, not under `/api`.

## Endpoint

```bash
POST /mcp/{repo}/{branch}/{slug}
```

One JSON-RPC 2.0 message per request body. `{slug}` resolves a `raisin:McpServer` node in the `mcp` workspace; `{branch}` selects the branch the tools operate on.

**Headers**

| Header | Notes |
|--------|-------|
| `Content-Type: application/json` | Expected. A request without it is still parsed, so an unauthenticated probe receives the OAuth challenge rather than a `415`. |
| `Authorization: Bearer <token>` | Required unless the server is `public`. Accepts a user token, an API key or an OAuth access token whose audience is this endpoint. |

**HTTP status**

| Status | When |
|--------|------|
| `200` | A request with an `id`. The body is a JSON-RPC response; failures are in its `error` member. |
| `202` | A notification (no `id`). Empty body. |
| `401` | No valid token on a non-public server. Carries `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…/.well-known/oauth-protected-resource/mcp/{repo}/{branch}/{slug}"` so a client can start OAuth. |
| `403` | Authenticated, but missing a scope the server or tool requires. |

`subscriptions/listen` answers with a `text/event-stream` instead of a single response.

**Protocol versions**

The server speaks `2026-07-28` and the earlier revisions `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` and `2024-10-07`. Clients on the older revisions negotiate through `initialize`. Clients on `2026-07-28` call `server/discover` and then carry `_meta."io.modelcontextprotocol/protocolVersion"` and `_meta."io.modelcontextprotocol/clientCapabilities"` on every request. Every result from a `2026-07-28`-style method includes `resultType`, `ttlMs`, `cacheScope` and `_meta."io.modelcontextprotocol/serverInfo"`.

## Methods

### initialize

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}
```

Response:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true},"resources":{"subscribe":true,"listChanged":false}},"serverInfo":{"name":"Catalog","version":"1.0.0"},"instructions":"Query the product catalog."}}
```

The server echoes the client's revision when it supports it and answers with its newest otherwise.

### server/discover

The `2026-07-28` replacement for `initialize`. It establishes no session.

```json
{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

```json
{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","supportedVersions":["2026-07-28","2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"],"capabilities":{"tools":{"listChanged":true},"resources":{"subscribe":true,"listChanged":false}},"instructions":"Query the product catalog.","ttlMs":60000,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"Catalog","version":"1.0.0"}}}}
```

`resources` is present only when the server's `data.resources` is `true`. When the client declares the MCP Apps extension, `capabilities.extensions` also lists `io.modelcontextprotocol/ui` with the `text/html;profile=mcp-app` MIME type.

### tools/list

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

Returns only the tools whose scopes the caller holds. Each entry carries `name`, `description`, `inputSchema`, `kind` (`data` or `function`) and, when known, `outputSchema`:

```json
{"jsonrpc":"2.0","id":2,"result":{"resultType":"complete","tools":[{"name":"get_node","description":"Fetch a single node by its path within a workspace.","inputSchema":{"type":"object","properties":{"path":{"type":"string","description":"Absolute node path, e.g. \"/blog/post-1\"."},"workspace":{"type":"string","description":"Workspace to operate in. Defaults to the active workspace; must be one this server exposes (see list_workspaces)."}},"required":["path"]},"kind":"data"}],"ttlMs":60000,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"Catalog","version":"1.0.0"}}}}
```

A tool bound to an [interactive widget](../../guides/mcp/interactive-widgets.md) also carries `_meta.ui.resourceUri`; see [Interactive-widget tools](#interactive-widget-tools-mcp-apps).

### tools/call

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_node","arguments":{"workspace":"products","path":"/widgets/acme"}}}
```

The result is a `text` content block holding the pretty-printed JSON. A tool with an `outputSchema` additionally returns the value as `structuredContent`:

```json
{"jsonrpc":"2.0","id":3,"result":{"resultType":"complete","content":[{"type":"text","text":"{\n  \"message\": \"hi\",\n  \"length\": 2\n}"}],"isError":false,"structuredContent":{"message":"hi","length":2}}}
```

A function that throws is reported with `isError: true` and the error text in the content block, not as a JSON-RPC error:

```json
{"jsonrpc":"2.0","id":3,"result":{"resultType":"complete","content":[{"type":"text","text":"[RUNTIME_ERROR] Internal error: [JS] boom requested\n    at handler (eval_script:2:43)\n"}],"isError":true}}
```

An unknown tool name, a missing node or a missing scope is a JSON-RPC error (see [Error codes](#error-codes)).

### Interactive-widget tools (MCP Apps)

A tool may declare a `ui` binding so an MCP Apps-capable host renders its results through an HTML view. The tool result itself stays data only (`content` plus `structuredContent`). The binding shows up in three places:

- **`tools/list`**: the tool carries `_meta.ui.resourceUri: "ui://{workspace}/{entry}"` (plus the deprecated flat `"ui/resourceUri"` key for older hosts), and `_meta.ui.visibility` when the binding declares it.
- **`resources/list`**: the view is predeclared once per distinct URI: `{ uri, name, description, mimeType: "text/html;profile=mcp-app", _meta: { ui: { csp, permissions, domain, prefersBorder } } }`.
- **`resources/read`** of the `ui://` URI: the widget HTML as `text` with MIME `text/html;profile=mcp-app` and the same `_meta.ui` on the content item. The read is an ordinary RLS-scoped asset read, and only URIs declared by a tool the caller can see resolve; anything else is `-32601`.

The served HTML gets a `<script>` defining `window.__RAISIN_SERVER_ORIGIN__` inserted at the top of `<head>`, and a `<base href>` when the binding asks for one. `csp.connectDomains` and `csp.resourceDomains` always include the server's own origin.

Binding fields, on the `raisin:McpServer` tool entry, a `ui_resources` entry, or the function's `mcp` block:

| Field | Meaning |
|---|---|
| `entry` | Node path of the widget's HTML asset. A `#fragment` is ignored. |
| `workspace` | Workspace `entry` resolves in; defaults to the session workspace (first of `data.workspaces`). |
| `resource` | Name of a server-level `ui_resources` entry to inherit from. Inline fields win. |
| `name` / `description` | The view's identity in `resources/list`. |
| `csp` | `{ connectDomains, resourceDomains, frameDomains, baseUriDomains }`. Entries must be `http(s)://host` origins; anything else is dropped. |
| `permissions` | `{ camera: {}, microphone: {}, geolocation: {}, clipboardWrite: {} }`, each granted by presence. |
| `domain` | A bare hostname passed through as the host's stable sandbox origin. |
| `prefersBorder` | Host renders a visible border and background. |
| `baseHref` | Inject a `<base href>` to the entry's directory. Defaults to off, or on for a legacy `mode: uri-list` binding. |
| `visibility` | `["model", "app"]` (default) or `["app"]` for view-only tools. |
| `mode` | Deprecated and optional. Widgets are always delivered inline. |

The view-to-host runtime protocol is documented in the [View-to-host protocol reference](../mcp-ui-client/view-protocol.md); the [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md) covers authoring.

### resources/list · resources/templates/list · resources/read

Available when the server's `data.resources` is `true`. Resources are addressed as `raisin://{workspace}/{path}`.

`resources/list` returns one entry per exposed workspace root (plus any widget resources):

```json
{"jsonrpc":"2.0","id":4,"result":{"resultType":"complete","resources":[{"uri":"raisin://products/","name":"products (workspace root)","description":"Browse nodes in the `products` workspace by path.","mimeType":"application/json"}],"ttlMs":60000,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"Catalog","version":"1.0.0"}}}}
```

`resources/templates/list` returns a `raisin://{workspace}/{+path}` template per workspace.

`resources/read` returns one `contents` entry. A node comes back as `text` holding its JSON (`id`, `path`, `name`, `node_type`, `properties`, timestamps and so on); a workspace root lists its children; a `raisin:Asset` comes back as a base64 `blob` with its MIME type:

```json
{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"raisin://products/widgets/acme"}}
```

```json
{"jsonrpc":"2.0","id":5,"result":{"resultType":"complete","contents":[{"uri":"raisin://products/widgets/acme","mimeType":"application/json","text":"{\"id\":\"JNG-giu5-hI8VMlc3QUcr\",\"path\":\"/widgets/acme\",\"name\":\"acme\",\"node_type\":\"raisin:Page\",\"properties\":{\"title\":\"Acme Widget\"},…}"}],"ttlMs":5000,"cacheScope":"private"}}
```

Widget views use the `ui://{workspace}/{path}` scheme on the same method.

### resources/subscribe

The pre-`2026-07-28` per-URI subscription. It validates the URI and answers `{"subscribed":true,"uri":"…"}` as a plain JSON response; notifications are delivered through `subscriptions/listen`, which clients (including the JS SDK's `subscribeResource`) use directly.

### subscriptions/listen

One long-lived stream carrying every notification type the client opts into.

```json
{"jsonrpc":"2.0","id":5,"method":"subscriptions/listen","params":{"notifications":{"toolsListChanged":true,"resourceSubscriptions":["raisin://products/widgets/acme"]}}}
```

The response is a `text/event-stream` of `message` events. The first frame is the acknowledgement, which repeats the subset the server will honour:

```
event: message
data: {"jsonrpc":"2.0","method":"notifications/subscriptions/acknowledged","params":{"_meta":{"io.modelcontextprotocol/subscriptionId":5},"notifications":{"toolsListChanged":true,"resourceSubscriptions":["raisin://products/widgets/acme"]}}}
```

| Filter field | Honoured |
|---|---|
| `toolsListChanged` | yes, when a `raisin:Function` in the `functions` workspace changes |
| `resourceSubscriptions` | yes, per URI, as `notifications/resources/updated` |
| `promptsListChanged` | no, there is no prompt registry |
| `resourcesListChanged` | no, the resource list is static; use `resourceSubscriptions` |

Subsequent frames:

```
data: {"jsonrpc":"2.0","method":"notifications/resources/updated","params":{"uri":"raisin://products/widgets/acme","_meta":{"io.modelcontextprotocol/subscriptionId":5}}}

data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed","params":{"_meta":{"io.modelcontextprotocol/subscriptionId":5}}}
```

A stream that requests only `toolsListChanged` stays open until the client closes it. Every frame carries `_meta."io.modelcontextprotocol/subscriptionId"`, equal to the `id` of the `subscriptions/listen` request. `notifications/tools/list_changed` carries no other payload; call `tools/list` again. Changes within 250 ms are coalesced into one notification.

A graceful close is the response to the original request, which distinguishes an intentional shutdown from a dropped connection:

```
data: {"jsonrpc":"2.0","id":5,"result":{"resultType":"complete","_meta":{"io.modelcontextprotocol/subscriptionId":5}}}
```

Close the connection to cancel.

## Error codes

| Code | Meaning |
|------|---------|
| `-32700` | Parse error (malformed JSON). |
| `-32600` | Invalid request or a server-side protocol failure. |
| `-32601` | Unknown method, unknown tool, unknown server slug, or a node/resource that was not found. |
| `-32602` | Invalid params. |
| `-32603` | Serialization failure. |
| `-32000` | Storage or service error. |
| `-32001` | Unauthorized: authentication required, or a missing server or tool scope. |
| `-32003` | The tool's function failed (also surfaced as `isError: true`). |
| `-32020` | Header mismatch. |
| `-32021` | A required client capability is missing. |
| `-32022` | Unsupported protocol version. `data` carries `{ supported, requested }`. |

## OAuth 2.1 authorization server

Interactive clients discover and use these automatically. All are served at the site root.

### Discovery metadata

```bash
GET /.well-known/oauth-authorization-server                              # RFC 8414
GET /.well-known/oauth-protected-resource/mcp/{repo}/{branch}/{slug}     # RFC 9728
```

```json
{"issuer":"https://db.example.com","authorization_endpoint":"https://db.example.com/authorize","token_endpoint":"https://db.example.com/token","registration_endpoint":"https://db.example.com/register","response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],"code_challenge_methods_supported":["S256"],"token_endpoint_auth_methods_supported":["none","client_secret_post","client_secret_basic"]}
```

```json
{"resource":"https://db.example.com/mcp/myapp/main/catalog","authorization_servers":["https://db.example.com"],"bearer_methods_supported":["header"]}
```

### Dynamic client registration (RFC 7591)

```bash
POST /register
```

```json
{"client_name":"my-agent","redirect_uris":["https://app.example.com/cb"],"token_endpoint_auth_method":"none","grant_types":["authorization_code"],"response_types":["code"]}
```

```json
{"client_id":"client_N_VjkCcJOo0p9IhOmks6fg","client_id_issued_at":1788719865,"redirect_uris":["https://app.example.com/cb"],"token_endpoint_auth_method":"none","grant_types":["authorization_code"],"response_types":["code"],"client_name":"my-agent"}
```

A confidential client (`client_secret_post` or `client_secret_basic`) also receives a `client_secret`.

### Authorization (RFC 6749 §4.1, PKCE S256)

```bash
GET  /authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&scope=…&resource=…&state=…
POST /authorize    # login + consent form submission
```

`GET` renders the login and consent form. `POST` authenticates the user against the identity store, narrows the requested scopes to the roles and groups the user holds, and redirects to `redirect_uri?code=…&state=…`. `resource` is the MCP endpoint URL the token will be bound to (RFC 8707).

### Token

```bash
POST /token
```

Form body for the code exchange: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier` (plus `client_secret` for confidential clients). For a refresh: `grant_type=refresh_token`, `refresh_token`, `client_id`, and optionally a narrower `scope`.

```json
{"access_token":"…","token_type":"Bearer","expires_in":3600,"refresh_token":"…","scope":"catalog:read"}
```

The access token is bound to the requested MCP resource and carries the consented scopes. Present it as `Authorization: Bearer <token>` on that MCP endpoint. An unknown client answers `401 {"error":"invalid_client",…}`.

## Configuration

Behind a reverse proxy, set `RAISINDB_BASE_URL` to the canonical external origin so the issuer, token audiences and widget origins stay fixed, or allowlist hosts with `RAISINDB_TRUSTED_HOST_SUFFIXES`. `X-Forwarded-*` headers are honoured only when `RAISINDB_TRUST_FORWARDED_HEADERS=1`. See the [authentication guide](../../guides/mcp/authentication.md#self-hosting-behind-a-proxy).
