---
sidebar_position: 7
---

# WebAssembly: AssemblyScript

TypeScript-shaped syntax compiled ahead of time to a WebAssembly component —
no embedded JavaScript engine, and artifacts of a few kilobytes.

A scaffolded function builds to about **8 KB**. For comparison, running real
JavaScript inside a component requires shipping a JS engine with it, which
costs 8–15 MB. If you want TypeScript-like ergonomics in a wasm function, this
is the option that stays small.

## Prerequisites

```bash
brew install wasm-tools     # or: cargo install wasm-tools
```

`wasm-tools` is **required** here, where it is optional for other languages —
see [Why three build steps](#why-three-build-steps). `asc` itself is installed
per project as a dev dependency, so there is nothing global to manage.

## Scaffold

```bash
raisindb create function greet --lang assemblyscript --ns demo
cd wasm/demo/greet && npm install
```

## Write the handler

```ts
import { run, log, nodes, unknownHandler, cabi_realloc }
  from "../node_modules/@raisindb/function-assemblyscript/assembly/index";

function greet(input: string): string {
  log.info("greeting");

  // Every raisin.* method is available and returns raw JSON.
  const children = nodes.getChildren("content", "/pages", 50);

  return '{"greeting":"hello","children":' + children + '}';
}

// The component exports ONE function; the node's `entry_file` suffix picks the
// handler, so routing is an ordinary comparison.
function route(name: string, input: string): string {
  if (name == "default") return greet(input);
  return unknownHandler(name, "default");
}

export function handler(np: i32, nl: i32, ip: i32, il: i32): i32 {
  return run(np, nl, ip, il, route);
}
export { cabi_realloc };
```

Two things must both be exported from `assembly/index.ts`: `handler` and
`cabi_realloc`. `wasm-tools component new` resolves them **by name**, so
renaming either produces an artifact the server rejects.

The import is a path into `node_modules` rather than the bare package name,
because `asc` does not resolve bare scoped imports. The scaffold writes it
correctly; keep the shape if you move files.

## Strings, not objects

Handlers take and return JSON **text**. AssemblyScript has no JSON in its
standard library, and bundling one would make every artifact pay for it — so
the SDK does not choose one for you. Build strings directly for simple outputs,
or add [`json-as`](https://github.com/JairusSW/as-json) for typed
(de)serialisation.

This is the main ergonomic difference from the Rust SDK, which hands you a
deserialised value.

## Build, run, deploy

```bash
raisindb function doctor wasm/demo/greet   # checks asc + wasm-tools
raisindb function build  wasm/demo/greet
raisindb function run    wasm/demo/greet --input '{"name":"Ada"}'
raisindb deploy . --install
```

## Why three build steps

AssemblyScript deliberately implements neither WASI nor the Component Model,
and has no `wit-bindgen` backend, so `asc` emits a **core module** while the
server requires a **component**. `raisindb function build` bridges that:

```bash
asc assembly/index.ts -o build/guest.core.wasm --runtime stub --exportRuntime --optimize
wasm-tools component embed wit build/guest.core.wasm -o build/guest.embed.wasm --world function
wasm-tools component new build/guest.embed.wasm -o main.wasm
```

You can run those yourself; the command exists so you need not remember them.

Because there is no bindings generator upstream, the SDK carries the lowering
by hand in `assembly/abi.ts` — the only file that deals in pointers. The typed
`raisin.*` surface above it is generated from the server's binding registry,
exactly as the Rust and Go SDKs are, so nobody writes that encoding per
project.

## Depending on the SDK directly

```bash
npm install @raisindb/function-assemblyscript
```

## Limits

No `wasi:sockets`, no `wasi:http`, no filesystem, no timers — the same sandbox
every wasm guest gets. Egress is `raisin.http.*`, gated by the function's
`network_policy`.
