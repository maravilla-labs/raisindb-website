---
sidebar_position: 1
---

# MCP UI Client Overview

Complete reference for `@raisindb/mcp-ui-client` — the browser runtime for RaisinDB MCP Apps widgets.

This package runs **inside the widget iframe** (the MCP Apps "view"), not in a RaisinDB-connected backend. It is tiny, dependency-free, and framework-agnostic: its whole job is to speak the [view↔host JSON-RPC protocol](./view-protocol.md) so your widget code stays a plain web app. For the end-to-end workflow — building the widget file, shipping it as an asset, binding it to a tool — see the [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md).

## Installation

```bash
npm install @raisindb/mcp-ui-client
```

Bundle it into the widget (the widget must be one self-contained HTML file) — don't load it from a CDN at runtime; the host's sandbox CSP will block undeclared origins.

## Quick Start

```typescript
import { callTool, onToolResult, updateModelContext } from '@raisindb/mcp-ui-client';

// Data arrives ASYNCHRONOUSLY after the view↔host handshake —
// render a waiting state first, then react.
onToolResult((result) => {
  render(result.structuredContent);
});

// A button click is an ordinary tools/call through the host.
button.onclick = async () => {
  const result = await callTool('approve_order', { order_id: 42 });
  await updateModelContext([{ type: 'text', text: 'Order 42 approved.' }]);
};
```

On import the helper automatically starts the `ui/initialize` handshake with the embedding host (retrying until the host answers — an init fired before the host's bridge listener attaches would otherwise be lost), sends `ui/notifications/initialized`, applies host theming, and begins reporting content size.

## Lifecycle & data

- `connect(): Promise<void>` — starts (once) the handshake. Called implicitly by every other API and eagerly on module load; await it only when you need to know the host is there.
- `onToolResult(cb): () => void` — invoked with every `CallToolResult` the host delivers: the initiating tool's result **and** the results of view-initiated `callTool` calls. Your tool's `output_schema`-shaped data is `result.structuredContent`. Returns an unsubscribe function.
- `onToolInput(cb): () => void` / `getToolInput()` — the initiating tool call's arguments, delivered via `ui/notifications/tool-input` (partial streaming variants arrive first while the model is still typing).
- `getInitiatingToolName(): string | undefined` — the tool whose call instantiated this view, from the handshake's `hostContext.toolInfo`.
- `getInitialRoute(): string` — `location.hash` without the `#` (useful when one widget file serves several views).

## Calling back into the server

- `callTool(name, args): Promise<ToolResult>` — a plain `tools/call` JSON-RPC request through the host. The host proxies it to the RaisinDB server under the same session (and may prompt the user first). The result is returned **and** fanned out to `onToolResult` listeners, so single-code-path views that only implement the listener keep working.
- `updateModelContext(content): Promise<void>` — push content into the conversation for the model's future turns (`ui/update-model-context`). Each call overwrites the previous update.
- `sendMessage(text): Promise<void>` — post a user-role text message into the host's chat (`ui/message`).
- `openLink(url): Promise<void>` — ask the host to open an external URL (`ui/open-link`).

## Host context & theming

- `getHostContext(): HostContext | undefined` / `onHostContext(cb)` — the host's context from the handshake and every `host-context-changed` notification: `theme` (`light`/`dark`), `styles.variables` (CSS custom properties), `displayMode`, `containerDimensions`, `locale`, `timeZone`, `platform`, and `toolInfo`.
- Theming is applied automatically: the helper sets `color-scheme` and `data-theme` on `<html>` and copies every host-provided `--*` CSS variable onto `:root`. Declare your own fallback values for any variables you use.
- Content size is reported automatically via `ui/notifications/size-changed` (a debounced `ResizeObserver` on `<body>`) — never size the widget with `100vh`; let content height drive the iframe.

## The pull fallback

The host guarantees a `tool-result` push only while the view is displayed **during** tool execution. When the tool completed before your view finished initializing (the common case for fast tools), no push comes — the view must **pull** by re-issuing the initiating call:

```typescript
import {
  callTool, onToolResult, onToolInput,
  getToolInput, getInitiatingToolName,
} from '@raisindb/mcp-ui-client';

const READ_ONLY = new Set(['get_order', 'list_orders']);
let got = false;
onToolResult(() => { got = true; });

function pull() {
  const name = getInitiatingToolName();
  const args = getToolInput();
  if (got || !name || !READ_ONLY.has(name)) return;
  if (args === undefined && toolNeedsArgs(name)) return; // wait for tool-input
  got = true;
  callTool(name, args ?? {});
}
onToolInput(() => setTimeout(pull, 200));
setTimeout(pull, 1200);
setTimeout(pull, 3000);
```

Two rules keep this safe: only pull **read-only/idempotent** tools (the host may execute view-initiated calls without a prompt), and never pull an args-requiring tool before `tool-input` delivered the arguments — an empty-args call fails server-side validation and a naive "pulled once" guard then wedges the view.

## Diagnostics

- `getBridgeDebug()` / `onBridgeDebug(cb)` — live bridge state for a debug footer while developing: `handshake` (`pending`/`ok`), counts of messages received from the host vs dropped foreign-source messages, and the last few JSON-RPC methods seen. Invaluable when a host renders the view but no data arrives.

## Security model

The view holds **no credentials**: every read and write flows through the host as an auditable `tools/call` under the calling user's own permissions ([row-level security](../../guides/auth/row-level-security.md) applies server-side). The helper only accepts messages whose source is the embedding parent frame. Keep destructive tools out of one-click reach — gate them with [`scopes`](../../guides/mcp/authentication.md) or `ui.visibility`.

## Reference Pages

- [View↔Host Protocol](./view-protocol.md) — the JSON-RPC messages on the wire, for building a view (or a host) without this helper.
