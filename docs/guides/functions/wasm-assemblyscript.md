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

`wasm-tools` performs the last two build steps (see
[How the build works](#how-the-build-works)). The AssemblyScript compiler is
installed per project as a dev dependency, so `wasm-tools` is the only thing
you add globally.

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

`assembly/index.ts` exports two things: your `handler`, and `cabi_realloc`,
which lets the host allocate inside the guest's memory. `wasm-tools component
new` resolves both by name, so keep the names as the scaffold writes them.

The SDK is imported by path into `node_modules`, which is how `asc` resolves
scoped packages. The scaffold writes it for you.

## Working with JSON

Handlers take and return JSON as **text**, and every `raisin.*` method returns
the raw JSON the server produced. For many functions that is all you need —
compose the response directly:

```ts
return '{"greeting":"hello","children":' + children + '}';
```

When you want typed objects, add a JSON library and decode explicitly:

```bash
npm install json-as
```

```ts
import { JSON } from "json-as";

@json class Input { name!: string; }

const parsed = JSON.parse<Input>(input);
log.info("greeting " + parsed.name);
```

AssemblyScript's standard library does not include JSON, so the SDK leaves the
choice to you rather than fixing one into every artifact. Picking your own also
keeps a function that never parses anything at its smallest.

## Testing

A scaffolded project comes with unit tests that run with no server:

```bash
raisindb function test wasm/demo/greet
```

The SDK's mock host loads your compiled module and answers `raisin.*` calls
from JavaScript, so a handler is exercised exactly as the server would call it:

```js
import { loadGuest } from "@raisindb/function-assemblyscript/testing";

const guest = await loadGuest(CORE, {
  call(method) {
    if (method === "nodes_getChildren") return [{ id: "a", node_type: "raisin:Page" }];
    throw new Error(`unexpected ${method}`);
  },
});

const out = guest.invoke("default", { name: "Ada" });
assert.equal(out.greeting, "hello");
assert.deepEqual(guest.calls.map((c) => c.method), ["nodes_getChildren"]);
```

`guest.calls` and `guest.logs` record what the handler did, so a test can
assert which data it asked for and what it logged. A call you have not scripted
raises, which keeps a handler that starts reaching for something new from
passing quietly.

To run the scenarios in `tests/server.json` against a real server:

```bash
raisindb function test wasm/demo/greet --server
```

## Build, run, deploy

```bash
raisindb function doctor wasm/demo/greet   # checks asc + wasm-tools
raisindb function build  wasm/demo/greet
raisindb function run    wasm/demo/greet --input '{"name":"Ada"}'
raisindb deploy . --install
```

## How the build works

`asc` compiles to a core WebAssembly module, and the server runs Component
Model components — so the build has three steps, which `raisindb function
build` runs for you:

```bash
asc assembly/index.ts -o build/guest.core.wasm --runtime stub --exportRuntime --optimize
wasm-tools component embed wit build/guest.core.wasm -o build/guest.embed.wasm --world function
wasm-tools component new build/guest.embed.wasm -o main.wasm
```

`embed` attaches the WIT interface from `wit/` to the module, and `new` wraps
the result as a component. You can run the three yourself; the command exists
so you need not remember them.

Inside the SDK, `assembly/abi.ts` implements the Component Model's canonical
ABI — how a `string` or a `result` is laid out in memory — and is the only file
that works with pointers. The typed `raisin.*` surface above it is generated
from the server's binding registry, the same source the Rust and Go SDKs are
generated from.

## Depending on the SDK directly

```bash
npm install @raisindb/function-assemblyscript
```

## Limits

AssemblyScript functions run in the same sandbox as every other wasm guest:
network access goes through `raisin.http.*` and is governed by the function's
`network_policy`. See [WebAssembly Functions](./wasm-functions.md#limits) for
timeouts, memory and the artifact size cap.
