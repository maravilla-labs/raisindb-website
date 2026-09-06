---
sidebar_position: 7
---

# WebAssembly: TypeScript

Runs your JavaScript inside a WebAssembly component using
[ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS).

**The design goal is that a QuickJS function moves here unchanged.** The same
`raisin.*` surface is present, built from the same source the QuickJS runtime
uses, so you are not learning a second API.

## When this is worth it

Be honest with yourself about the trade-off. Components embed a JavaScript
engine, so they are **8–15 MB** and take the longest to compile on first call.
Against QuickJS you gain stronger isolation, real memory and CPU limits, and
the ability to ship one artifact serving many functions. You do not gain much
raw speed — for pure JavaScript, QuickJS is already close.

Choose it when you want the isolation guarantees or a single deployable
artifact. If you want fast edit-and-reload, stay on QuickJS.

## Prerequisites

Node 20+. The build tool comes with the SDK.

## Scaffold

```bash
raisindb create function greet --lang ts --ns demo
```

## Write the handler

```js
export function handler(input) {
  console.log(`greeting ${input.name}`);

  const children = raisin.nodes.getChildren('content', '/pages', 50);
  const rows = raisin.sql.query(
    "SELECT id, name FROM 'content' WHERE node_type = $1",
    ['raisin:Page'],
  );

  return { greeting: `Hello, ${input.name}`, pages: Math.max(children.length, rows.length) };
}

// Any other export becomes a handler in the same artifact:
export function shout(input) {
  return { greeting: `HELLO, ${input.name.toUpperCase()}` };
}
```

`entry_file: main.wasm:shout` selects the `shout` export; a bare `main.wasm`
maps to `handler`. This is the same `index.js:handlerName` grammar QuickJS
functions already use.

## Differences from QuickJS

Small, but real:

- **No `setTimeout` / `setInterval`.** A handler runs to completion; there is
  no event loop to schedule onto.
- **No global `fetch`.** Use `raisin.http.request`, which enforces your network
  policy. (This is the recommended call in QuickJS too.)
- **No `Resource` image or PDF helpers** (`resize`, `toImage`,
  `getPageCount`, `processDocument`). Calling one throws with a clear message
  rather than failing obscurely.
- `async` handlers work for `await`-only code, since promises are drained
  before the call returns. Nothing that needs a timer or real I/O will resolve.

## Test without a server

```js
import { createMockHost } from '@raisindb/function-wasm/testing';
import { handler } from '../src/index.js';

test('greets', () => {
  const host = createMockHost();
  host.expect('nodes_getChildren', ['content', '/pages', 50], []);
  host.install();

  expect(handler({ name: 'Ada' }).greeting).toBe('Hello, Ada');
});
```

`vitest` runs this as plain JavaScript — no componentizing, so the loop is
fast.

## Build, run, deploy

```bash
raisindb function build wasm/demo/greet   # jco componentize; takes a few seconds
raisindb function test  wasm/demo/greet
raisindb function run   wasm/demo/greet --input '{"name":"Ada"}'
raisindb deploy . --install
```

## Depending on the SDK directly

```bash
npm install @raisindb/function-wasm
```

## Size and cold start

A component is 8–15 MB, which is why the server's artifact cap defaults to
32 MiB. First call after a server start compiles it — noticeably longer than
for Rust. Two things help:

- Put **many handlers in one artifact** rather than one artifact per function.
  Twenty functions then cost one engine, not twenty.
- Expect the first request after a deploy to be slow, and warm it if that
  matters.
