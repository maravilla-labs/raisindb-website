---
sidebar_position: 10
---

# WebAssembly ABI

The contract between a RaisinDB server and a WebAssembly function component.
You do not need this to write a function — the
[guest SDKs](../../guides/functions/wasm-functions.md) wrap all of it — but you
need it to write an SDK, debug a rejected artifact, or target a language that
has none.

## WIT world

Package `raisin:function@0.1.0`. The canonical file lives at
`crates/raisin-functions/wit/raisin-function.wit`; each SDK carries a
byte-identical copy, verified by a test.

```wit
package raisin:function@0.1.0;

interface host {
    enum log-level { debug, info, warn, error }

    /// Call a RaisinDB API method by its registry name ("nodes_getChildren",
    /// "sql_query", "http_request", ...). `args` is a JSON array of positional
    /// arguments; `null` means an absent optional.
    call: func(method: string, args: string) -> result<string, string>;

    /// Structured log line -> execution logs and the SSE log stream.
    log: func(level: log-level, message: string);

    /// Execution context as JSON: tenant, repo, branch, workspace, actor,
    /// execution id. Identical to `raisin.context.get()` in JavaScript.
    context: func() -> string;

    /// Host ABI version ("0.1.0").
    abi-version: func() -> string;
}

world function {
    import host;

    /// `name` is the handler selected by the node's `entry_file` suffix;
    /// `input` is the JSON-encoded function input.
    export handler: func(name: string, input: string) -> result<string, string>;
}
```

### Why one gateway instead of typed imports

Every `raisin.*` method is declared once in the server's binding registry and
reached through `call`. WIT imports are static, so typed imports would mean
regenerating and re-versioning the world on every API addition, and a guest
built against an older world could not call a newer method. With one gateway
the world is stable and the SDKs — which *are* typed — are generated from that
same registry.

### Why the handler name is a parameter

WIT exports are static too, so a component cannot declare an arbitrary set of
named exports. Passing the name lets one artifact carry many handlers and many
`raisin:Function` nodes share one artifact. See
[WebAssembly Functions](../../guides/functions/wasm-functions.md).

An unknown `name` must return `Err` listing the handlers the guest registered.

## Calling convention

`call` takes a method name and a JSON array; it returns the result encoded as
JSON, or `Err` with a message.

```
call("nodes_getChildren", "[\"content\",\"/pages\",50]")
  -> Ok("[{\"id\":\"...\",\"node_type\":\"raisin:Page\", ...}]")

call("sql_query", "[\"SELECT id FROM 'content' WHERE node_type = $1\",[\"raisin:Page\"]]")
  -> Ok("[{\"id\":\"...\"}]")            // an ARRAY of row objects

call("no_such_method", "[]")
  -> Err("Unknown raisin API method: no_such_method")
```

Result encodings: an object or array as-is; `null` for an absent optional;
`true`/`false` for booleans; a bare number for integers; a JSON string for
strings; `true` for void.

Errors from the API arrive as `Err`, not as a success-shaped value. SDKs should
surface them as their language's error type.

## Entry point resolution

`entry_file` is `artifact[:handler]`:

| `entry_file` | artifact | handler |
|---|---|---|
| `main.wasm` | `main.wasm` beside the node | `default` |
| `main.wasm:on-order` | `main.wasm` beside the node | `on-order` |
| `../shared/main.wasm:on-order` | the sibling node's artifact | `on-order` |

A parent-relative path must resolve inside the `functions` workspace.

## Linked WASI interfaces

Linked: `wasi:io`, `wasi:clocks`, `wasi:random`, `wasi:cli` (stdout and stderr
are captured into execution logs), and `wasi:filesystem` **with no preopened
directories** — present because wasi-libc and JavaScript engines import it at
startup, but every open fails.

**Not linked: `wasi:sockets`, `wasi:http`.** Network access goes through
`raisin.http.*`, which enforces the per-function network policy. A component
importing an unlinked interface is rejected when it is uploaded, with the
missing import named.

## Validation

An artifact is compiled when it is uploaded and when a package installs it,
using the same code path that runs it — so an artifact accepted at upload
cannot be rejected at run time. Rejections:

| Reason | Message |
|---|---|
| Core module, not a component | `not a valid WebAssembly component` |
| Missing or mistyped export | `missing export 'handler'` |
| Unlinkable import | names the import, e.g. `wasi:sockets/tcp` |
| Over the size cap | reports the size and the limit |

## Execution model

Every invocation gets a fresh instance and a fresh store. Nothing survives
between calls. Two tenants running byte-identical artifacts share only the
immutable compiled code, which is cached by a hash of the artifact bytes.

| Limit | Mechanism |
|---|---|
| Wall clock | epoch interruption plus an outer timeout |
| Memory | store-wide budget across all linear memories |
| Stack | engine-wide `max_wasm_stack_bytes` |

`max_instructions` is not enforced for WebAssembly; wall-clock timeout is the
CPU bound, as it is for QuickJS.

Traps map to execution errors: `TIMEOUT`, `MEMORY_LIMIT`, `STACK_OVERFLOW`, or
a runtime error carrying the guest backtrace.

## Server configuration

```toml
[functions.wasm]
enabled = true
max_artifact_bytes = 33554432      # 32 MiB
compiled_cache_bytes = 268435456   # 256 MiB of compiled code
max_wasm_stack_bytes = 1048576
epoch_tick_ms = 10
allocation = "on-demand"           # or "pooling"
```
