---
sidebar_position: 2
---

# View↔Host Protocol

The wire protocol between a widget iframe (the MCP Apps "view") and the embedding MCP host. [`@raisindb/mcp-ui-client`](./overview.md) implements all of this for you — read this page when you build a view without the helper, debug a host integration, or implement a host.

Everything is **JSON-RPC 2.0 over `postMessage`** between the view and its parent frame. The view acts as an MCP client; the host answers, proxies tool calls to the RaisinDB server, and pushes notifications.

## How the view gets discovered and loaded

RaisinDB's side of the contract, before any view code runs:

1. **`tools/list`** — a widget-bound tool carries the view's resource URI in metadata (plus a deprecated flat key some pre-GA hosts read):

```json
{
  "name": "order_card",
  "description": "Show an order as an interactive card.",
  "inputSchema": { "type": "object", "properties": { "order_id": { "type": "number" } } },
  "outputSchema": { "type": "object", "properties": { "id": {}, "status": {} } },
  "_meta": {
    "ui": { "resourceUri": "ui://assets/widgets/order/index.html" },
    "ui/resourceUri": "ui://assets/widgets/order/index.html"
  }
}
```

2. **`resources/list`** — the view is predeclared (deduped when several tools share one file), so hosts can review and prefetch it:

```json
{
  "uri": "ui://assets/widgets/order/index.html",
  "name": "Order Card",
  "description": "Interactive order view.",
  "mimeType": "text/html;profile=mcp-app",
  "_meta": { "ui": { "csp": { "connectDomains": ["https://db.example.com"], "resourceDomains": ["https://db.example.com"] }, "prefersBorder": true } }
}
```

3. **`resources/read`** on the `ui://` URI returns the HTML (RLS-scoped asset read; `text`, mime `text/html;profile=mcp-app`), with the same `_meta.ui` on the content item — the spec-preferred location, which takes precedence over listing metadata. The `ui://{workspace}/{path}` URI simply names the asset holding the widget's bytes.

4. **`tools/call`** returns **data only** — `content` blocks plus `structuredContent` when the function declares an `output_schema`. Nothing UI-related is embedded in tool results; the host renders the predeclared view and feeds it the result.

## Handshake (view → host)

The view initiates as soon as it runs:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "ui/initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "appInfo": { "name": "my-widget", "version": "1.0.0" },
    "appCapabilities": { "availableDisplayModes": ["inline"] }
  } }
```

The host's result carries `hostContext` — theme, `styles.variables` (CSS custom properties), `displayMode`, `containerDimensions`, `locale`, `timeZone`, `platform`, and `toolInfo` (`{ id, tool }` of the call that instantiated the view). After receiving it, the view MUST send:

```json
{ "jsonrpc": "2.0", "method": "ui/notifications/initialized", "params": {} }
```

The host withholds all tool data until `initialized` arrives. Send `ui/initialize` **with retries** — an init posted before the host's listener attaches is silently lost, and a view that never initializes never receives data.

## Notifications (host → view)

| Method | Payload | Notes |
|---|---|---|
| `ui/notifications/tool-input-partial` | `{ arguments }` | Zero or more, while the model streams the call's arguments. Best-effort JSON recovery — never act on these. |
| `ui/notifications/tool-input` | `{ arguments }` | The complete arguments, once. |
| `ui/notifications/tool-result` | a `CallToolResult` (`{ content, structuredContent, isError }`) | Sent when the tool completes **if the view is displayed during execution**. A view that loaded after completion must pull (see below). |
| `ui/notifications/tool-cancelled` | `{ reason }` | Execution was cancelled. |
| `ui/notifications/host-context-changed` | partial `HostContext` | Merge into your current context (theme toggle, resize, display-mode change). |

## Requests (host → view)

The view must answer these:

| Method | Respond with |
|---|---|
| `ui/resource-teardown` | `{}` — flush state first; the host waits before destroying the iframe. |
| `ping` | `{}` |
| `tools/list` | `{ "tools": [] }` (or your app-registered tools, if you expose any). |

## Requests (view → host)

| Method | Params | Purpose |
|---|---|---|
| `tools/call` | `{ name, arguments }` | Call a server tool through the host — same session, same caller, RLS-scoped; the host may prompt the user. Result: a `CallToolResult`. |
| `ui/update-model-context` | `{ content }` | Push content into the conversation for the model's future turns; each call overwrites the last. |
| `ui/message` | `{ role: "user", content: { type: "text", text } }` | Post a message into the chat. |
| `ui/open-link` | `{ url }` | Open an external URL in the user's browser. |
| `ui/request-display-mode` | `{ mode }` | Ask for `inline` / `fullscreen` / `pip`; the result names the mode actually set. |

## Notifications (view → host)

| Method | Payload | Purpose |
|---|---|---|
| `ui/notifications/size-changed` | `{ width, height }` | Report content size so the host can grow/shrink the iframe (debounce; send on real changes only). |
| `ui/notifications/request-teardown` | `{}` | Ask the host to close the view (e.g. a "Done" button). |

## The pull fallback (normative for RaisinDB views)

`tool-result` is only guaranteed while the view is on screen during execution. A view that initialized after the tool finished must recover the result itself:

1. Read the initiating tool from `hostContext.toolInfo.tool.name` and its arguments from `tool-input`.
2. Re-issue that call via `tools/call` — only for read-only/idempotent tools, and only once the arguments actually arrived (an empty-args call fails the function's `input_schema` validation).

## Sandboxing & CSP

The host renders the view in a sandboxed iframe and builds its Content-Security-Policy from the `csp` domains declared in the resource's `_meta.ui` (which RaisinDB takes from the tool binding's `ui.csp`; when omitted, RaisinDB declares its own origin for `connect`/`resource` so same-instance images and API calls work). Undeclared origins are blocked — bundle everything into the widget file and declare what little you genuinely need.

## Next steps

- [`@raisindb/mcp-ui-client` reference](./overview.md) — the helper that implements this protocol.
- [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md) — the end-to-end authoring workflow.
- [MCP API reference](../../reference/http-api/mcp-api.md) — the server side of `tools/list`, `resources/read`, and the `ui` binding.
