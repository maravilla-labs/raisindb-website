---
sidebar_position: 1
---

# MCP UI Client Overview

Reference for `@raisindb/mcp-ui-client`, the browser runtime for RaisinDB MCP Apps widgets.

This package runs **inside the widget iframe** (the MCP Apps "view"), not in a RaisinDB-connected backend. It is small, dependency-free and framework-agnostic: its job is to speak the [view-to-host JSON-RPC protocol](./view-protocol.md) so your widget code stays a plain web app. For the end-to-end workflow (building the widget file, shipping it as an asset, binding it to a tool) see the [Interactive Widgets guide](../../guides/mcp/interactive-widgets.md).

## Installation

```bash
npm install @raisindb/mcp-ui-client
```

Bundle it into the widget; the widget must be one self-contained HTML file. Loading it from a CDN at runtime fails under the host's sandbox CSP.

## Quick Start

```typescript
import { callTool, onToolResult, updateModelContext } from '@raisindb/mcp-ui-client';

// Data arrives after the view-to-host handshake, so render a waiting state first.
onToolResult((result) => {
  render(result.structuredContent);
});

// A button click is an ordinary tools/call through the host.
button.onclick = async () => {
  const result = await callTool('approve_order', { order_id: 42 });
  await updateModelContext([{ type: 'text', text: 'Order 42 approved.' }]);
};
```

On import the helper starts the `ui/initialize` handshake with the embedding host, retrying every 400 ms (up to 20 times) until the host answers, since an init sent before the host's bridge listener attaches is lost. It then sends `ui/notifications/initialized`, applies host theming and begins reporting content size.

## Lifecycle & data

- `connect(): Promise<void>` starts the handshake once. Every other API calls it implicitly and it runs eagerly on module load; await it only when you need to know the host has answered. Outside an iframe it resolves immediately.
- `onToolResult(cb): () => void` is invoked with every `CallToolResult` the host delivers: the initiating tool's result and the results of view-initiated `callTool` calls. Your function's `output_schema`-shaped data is `result.structuredContent`. Returns an unsubscribe function.
- `onToolInput(cb): () => void` and `getToolInput()` give the initiating tool call's arguments, delivered through `ui/notifications/tool-input`. Partial `tool-input-partial` notifications also reach the callback while the model is still streaming the call; only the complete arguments are stored for `getToolInput()`.
- `getInitiatingToolName(): string | undefined` is the tool whose call instantiated this view, from the handshake's `hostContext.toolInfo`.
- `getInitialRoute(): string` is `location.hash` without the `#`, useful when one widget file serves several views.
- `getServerOrigin(): string | undefined` is the origin of the RaisinDB instance that served the view (`https://host[:port]`), read from the `window.__RAISIN_SERVER_ORIGIN__` value the server injects into the document. Use it for image URLs and resource paths instead of a hard-coded origin; the same widget file is installed on every deployment.

## Calling back into the server

- `callTool(name, args): Promise<ToolResult>` sends a plain `tools/call` request through the host, which proxies it to the RaisinDB server under the same session and may prompt the user first. The result is returned and also fanned out to `onToolResult` listeners, so a view that only implements the listener keeps working.
- `updateModelContext(content): Promise<void>` pushes content into the conversation for the model's future turns (`ui/update-model-context`). Each call replaces the previous update.
- `sendMessage(text): Promise<void>` posts a user-role text message into the host's chat (`ui/message`).
- `openLink(url): Promise<void>` asks the host to open an external URL (`ui/open-link`).

A host error on any request rejects the promise with the host's error message.

## Host context & theming

- `getHostContext(): HostContext | undefined` and `onHostContext(cb)` expose the host's context from the handshake and every `host-context-changed` notification: `theme` (`light` or `dark`), `styles.variables` (CSS custom properties), `displayMode`, `availableDisplayModes`, `containerDimensions`, `locale`, `timeZone`, `userAgent`, `platform` and `toolInfo`.
- Theming is applied automatically: the helper sets `color-scheme` and `data-theme` on `<html>` and copies every host-provided `--*` CSS variable onto `:root`. Declare your own fallback values for any variable you use.
- Content size is reported through `ui/notifications/size-changed` from a `ResizeObserver` on `<body>`, debounced by 100 ms and sent only when the size changed. Do not size the widget with `100vh`; let content height drive the iframe.

## The pull fallback

The host pushes `tool-result` only while the view is displayed during tool execution. When the tool completed before your view finished initializing, which is common for fast tools, no push comes and the view has to pull by re-issuing the initiating call:

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

Two rules keep this safe: only pull read-only tools, since the host may execute view-initiated calls without a prompt, and never pull a tool that needs arguments before `tool-input` delivered them. An empty-args call fails the function, and a "pulled once" guard would then leave the view stuck.

## Diagnostics

- `getBridgeDebug()` and `onBridgeDebug(cb)` expose live bridge state for a debug footer while developing: `handshake` (`pending` or `ok`), counts of messages received from the host and of dropped foreign-source messages, and the last five JSON-RPC methods seen. Useful when a host renders the view but no data arrives.

## Security model

The view holds no credentials. Every read and write flows through the host as a `tools/call` under the calling user's own permissions, with [row-level security](../../guides/auth/row-level-security.md) applied server-side. The helper only accepts messages whose source is the embedding parent frame. Keep destructive tools out of one-click reach, and gate them with [`scopes`](../../guides/mcp/authentication.md) or `ui.visibility`.

## Reference Pages

- [View-to-Host Protocol](./view-protocol.md) lists the JSON-RPC messages on the wire, for building a view or a host without this helper.
