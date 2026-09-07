---
sidebar_position: 10
---

# WebAssembly ABI

The contract between a RaisinDB server and a WebAssembly function component.
You do not need this to write a function; the
[guest SDKs](../../guides/functions/wasm-functions.md) wrap all of it. You need
it to write an SDK, to debug a rejected artifact, or to target a language that
has no SDK yet.

## WIT world

Package `raisin:function@0.1.0`. The canonical file is
`crates/raisin-functions/wit/raisin-function.wit` in the RaisinDB repository;
each SDK carries a byte-identical copy, and a test keeps them in sync.

```wit
package raisin:function@0.1.0;

interface host {
    enum log-level { debug, info, warn, error }

    /// Call a RaisinDB API method by registry name ("nodes_get",
    /// "http_request", "sql_query", ...). `args` is a JSON array of positional
    /// arguments; `null` means an absent optional. Ok is the JSON-encoded
    /// result; Err is a human-readable message.
    call: func(method: string, args: string) -> result<string, string>;

    /// Structured log line, stored in the execution's logs.
    log: func(level: log-level, message: string);

    /// Execution context as JSON, identical to `raisin.context` in JavaScript.
    context: func() -> string;

    /// Host ABI semver ("0.1.0"); SDKs refuse hosts older than they were
    /// generated for.
    abi-version: func() -> string;
}

world function {
    import host;

    /// The single entry point. `name` is the handler selected by the Function
    /// node's `entry_file` suffix (`main.wasm:on-order` -> "on-order"; a bare
    /// `main.wasm` -> "default"). `input` is the JSON-encoded function input.
    /// Ok is the JSON output; Err is a failure message. An unknown `name`
    /// must return Err listing the names the guest registered.
    export handler: func(name: string, input: string) -> result<string, string>;
}
```

Every `raisin.*` method is declared once in the server's binding registry and
reached through the one `call` import. This keeps the world stable as methods
are added: a guest built against this world can call any method the server it
runs on provides, and the typed SDKs are generated from the same registry.

The handler name is a parameter for a similar reason: WIT exports are static,
so passing the name lets one artifact carry many handlers, and lets many
`raisin:Function` nodes share one artifact.

## Calling convention

`call` takes a registry method name and a JSON array of arguments. It returns
the result encoded as JSON, or `Err` with a message.

```
call("nodes_getChildren", "[\"content\",\"/pages\",50]")
  -> Ok("[{\"id\":\"...\",\"node_type\":\"raisin:Page\", ...}]")

call("sql_query", "[\"SELECT id FROM 'content' WHERE node_type = $1\",[\"raisin:Page\"]]")
  -> Ok("[{\"id\":\"...\"}]")            // an ARRAY of row objects

call("no_such_method", "[]")
  -> Err("Unknown raisin API method: no_such_method")
```

Result encodings: objects and arrays as they are; `null` for an absent
optional; `true` or `false` for booleans; a bare number for integers; a JSON
string for strings; `true` for a method that returns nothing. Malformed
arguments produce `Err("Invalid arguments for <method>: ...")`, and API
failures arrive as `Err` rather than as a success-shaped value. SDKs surface
them as their language's error type.

Registry names are `<category>_<method>` with the JavaScript spelling of the
method: `nodes_getChildren`, `sql_query`, `http_request`, `email_send`.

## Entry point resolution

`entry_file` is `artifact[:handler]`:

| `entry_file` | artifact | handler |
|---|---|---|
| `main.wasm` | `main.wasm` beside the node | `default` |
| `main.wasm:on-order` | `main.wasm` beside the node | `on-order` |
| `../shared/main.wasm:on-order` | the sibling node's artifact | `on-order` |

A parent-relative path must resolve inside the `functions` workspace. The host
never checks the handler name against a list; the guest owns its namespace and
answers an unknown name with `Err`.

## Linked WASI interfaces

Linked: `wasi:io`, `wasi:clocks`, `wasi:random`, `wasi:cli` (stdout and stderr
are captured into the execution logs, up to 1 MiB each), and `wasi:filesystem`
with no preopened directories. The filesystem interface is present because
wasi-libc and JavaScript engines import it at startup, but every open fails.

Not linked: `wasi:sockets` and `wasi:http`. Network access goes through
`raisin.http.*`, which applies the function's network policy. The guest runs
with no arguments and no environment variables.

## Validation

An artifact is compiled when it is uploaded and when a package installs it,
with the same code path that runs it, so an artifact accepted at upload does
not fail to load later. Rejections:

| Reason | Message |
|---|---|
| Core module, not a component | `wasm component rejected: not a valid WebAssembly component (a core module is not one) - …` |
| Unlinkable import | `wasm component rejected: an import it needs is not provided by this host (wasi:sockets and wasi:http are never provided) - …` |
| Missing or mistyped export | ``wasm component rejected: it does not export `handler: func(name: string, input: string) -> result<string, string>` - …`` |
| Over the size cap | `wasm artifact is N bytes, over the M-byte limit` |

## Execution model

Every invocation gets a fresh instance and a fresh store. Nothing survives
between calls. Two tenants running byte-identical artifacts share only the
immutable compiled code, which is cached by a hash of the artifact bytes.

| Limit | Mechanism |
|---|---|
| Wall clock | epoch interruption at `resource_limits.timeout_ms`, plus an outer timeout 250 ms later |
| Memory | a store-wide budget of `resource_limits.max_memory_bytes` across all linear memories |
| Stack | engine-wide `max_wasm_stack_bytes` |

`max_instructions` is not enforced for WebAssembly; the wall-clock timeout is
the CPU bound, as it is for QuickJS.

Traps map to execution errors: `TIMEOUT`, `MEMORY_LIMIT`, `STACK_OVERFLOW`, or
`RUNTIME_ERROR` with the guest backtrace. A handler that returns `Ok` with a
payload that is not JSON fails with `INVALID_OUTPUT`.

## Server configuration

```toml
[functions.wasm]
enabled = true
max_artifact_bytes = 33554432      # 32 MiB
compiled_cache_bytes = 268435456   # 256 MiB of compiled code
max_wasm_stack_bytes = 1048576
epoch_tick_ms = 10
allocation = "on-demand"           # or "pooling"
max_instances = 15                 # concurrent wasm executions
stdout_capture_bytes = 1048576     # per stream, per execution
```

With `enabled = false` an invocation fails with "WebAssembly functions are
disabled on this server".
