---
sidebar_position: 2
---

# View-to-Host Protocol

The wire protocol between a widget iframe (the MCP Apps "view") and the embedding MCP host. [`@raisindb/mcp-ui-client`](./overview.md) implements this for you; read this page when you build a view without the helper, debug a host integration, or implement a host.

Everything is JSON-RPC 2.0 over `postMessage` between the view and its parent frame. The view acts as an MCP client; the host answers, proxies tool calls to the RaisinDB server, and pushes notifications.

## How the view gets discovered and loaded

RaisinDB's side of the contract, before any view code runs:

1. **`tools/list`**: a widget-bound tool carries the view's resource URI in metadata (plus a deprecated flat key some older hosts read):

```json
{
  "name": "order_card",
  "description": "Show an order as an interactive card.",
  "inputSchema": { "type": "object", "properties": { "order_id": { "type": "number" } } },
  "outputSchema": { "type": "object", "properties": { "id": {}, "status": {} } },
  "_meta": {
    "ui": { "resourceUri": "ui://functions/lib/acme/widgets/order.html" },
    "ui/resourceUri": "ui://functions/lib/acme/widgets/order.html"
  }
}
```

2. **`resources/list`**: the view is predeclared, once per distinct URI even when several tools share it, so hosts can review and prefetch it:

```json
{
  "uri": "ui://functions/lib/acme/widgets/order.html",
  "name": "Order Card",
  "description": "Interactive order view.",
  "mimeType": "text/html;profile=mcp-app",
  "_meta": { "ui": { "csp": { "connectDomains": ["https://db.example.com"], "resourceDomains": ["https://db.example.com"] }, "prefersBorder": true } }
}
```

3. **`resources/read`** on the `ui://` URI returns the HTML as `text` with MIME `text/html;profile=mcp-app`, with the same `_meta.ui` on the content item. The read is RLS-scoped, and only a URI declared by a tool the caller can see resolves. The server inserts a `<script>` that defines `window.__RAISIN_SERVER_ORIGIN__` at the top of `<head>`, and a `<base href>` when the binding asks for one.

4. **`tools/call`** returns data only: `content` blocks plus `structuredContent` when the function declares an `output_schema`. The host renders the predeclared view and feeds it the result.

## Handshake (view to host)

The view initiates as soon as it runs. The helper sends:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "ui/initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "appInfo": { "name": "raisindb-widget", "version": "0.2.0" },
    "appCapabilities": { "availableDisplayModes": ["inline"] }
  } }
```

The host's result carries `hostContext`: `theme`, `styles.variables` (CSS custom properties), `displayMode`, `availableDisplayModes`, `containerDimensions`, `locale`, `timeZone`, `platform` and `toolInfo` (`{ id, tool }` of the call that instantiated the view). After receiving it the view sends:

```json
{ "jsonrpc": "2.0", "method": "ui/notifications/initialized", "params": {} }
```

The host withholds tool data until `initialized` arrives. Send `ui/initialize` with retries: an init posted before the host's listener attaches is lost, and a view that never initializes never receives data. The helper retries every 400 ms with a fresh request id.

## Notifications (host to view)

| Method | Payload | Notes |
|---|---|---|
| `ui/notifications/tool-input-partial` | `{ arguments }` | Zero or more, while the model streams the call's arguments. Do not act on these. |
| `ui/notifications/tool-input` | `{ arguments }` | The complete arguments, once. |
| `ui/notifications/tool-result` | a `CallToolResult` (`{ content, structuredContent, isError }`) | Sent when the tool completes, if the view is displayed during execution. A view that loaded after completion must pull (see below). |
| `ui/notifications/host-context-changed` | partial `HostContext` | Merge into the current context (theme toggle, resize, display-mode change). |

## Requests (host to view)

The view must answer these. The helper does so automatically and answers any other host request with `-32601 Method not found`:

| Method | Respond with |
|---|---|
| `ui/resource-teardown` | `{}`. The host waits for the answer before destroying the iframe. |
| `ping` | `{}` |
| `tools/list` | `{ "tools": [] }`. The helper registers no app-side tools. |

## Requests (view to host)

| Method | Params | Purpose |
|---|---|---|
| `tools/call` | `{ name, arguments }` | Call a server tool through the host: same session, same caller, RLS-scoped. The host may prompt the user. Result: a `CallToolResult`. |
| `ui/update-model-context` | `{ content }` | Push content into the conversation for the model's future turns; each call replaces the last. |
| `ui/message` | `{ role: "user", content: { type: "text", text } }` | Post a message into the chat. |
| `ui/open-link` | `{ url }` | Open an external URL in the user's browser. |

The MCP Apps specification defines further verbs, such as a display-mode request and a teardown request from the view. The helper does not wrap those; send them yourself if a host you target supports them.

## Notifications (view to host)

| Method | Payload | Purpose |
|---|---|---|
| `ui/notifications/initialized` | `{}` | Handshake complete; the host may start sending tool data. |
| `ui/notifications/size-changed` | `{ width, height }` | Report content size so the host can grow or shrink the iframe. Debounce and send on real changes only. |

## The pull fallback

`tool-result` is only guaranteed while the view is on screen during execution. A view that initialized after the tool finished recovers the result itself:

1. Read the initiating tool from `hostContext.toolInfo.tool.name` and its arguments from `tool-input`.
2. Re-issue that call through `tools/call`, only for read-only tools, and only once the arguments have arrived. An empty-args call fails the function's input validation.

## Sandboxing & CSP

The host renders the view in a sandboxed iframe and builds its Content-Security-Policy from the `csp` domains in the resource's `_meta.ui`. RaisinDB takes those from the tool binding's `ui.csp` and always adds its own origin to `connectDomains` and `resourceDomains`, so same-instance images and API calls work. Undeclared origins are blocked, so bundle everything into the widget file and declare only what you need.

## Next steps

- [`@raisindb/mcp-ui-client` reference](./overview.md) covers the helper that implements this protocol.
- [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md) covers the authoring workflow.
- [MCP API reference](../../reference/http-api/mcp-api.md) covers the server side of `tools/list`, `resources/read` and the `ui` binding.
