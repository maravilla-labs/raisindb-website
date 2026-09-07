---
sidebar_position: 4
---

# WebAssembly Functions

Write a RaisinDB function in Rust, Go or AssemblyScript, compile it to a
WebAssembly component, and deploy it like any other function.

WebAssembly is a runtime alongside QuickJS and Starlark: the same
`raisin:Function` node, the same `raisin.*` API, the same triggers and
execution logs. The difference is that you ship a compiled artifact instead of
source.

## When to choose it

| You want | Use |
|---|---|
| CPU-bound work, or existing Rust or Go libraries | WebAssembly (Rust, Go) |
| TypeScript-like syntax in a small artifact | WebAssembly (AssemblyScript) |
| Edit in the console, no build step | QuickJS (JavaScript) |
| Small deterministic data transformations | Starlark |

`raisindb create function --lang …` accepts `rust`, `go`, `assemblyscript`,
`ts`, `js` and `starlark`. Only the compiled languages have a build step.
(`ts` bundles JavaScript together with a JavaScript engine into a component;
it works, but the artifacts are large, which is why AssemblyScript is the
usual choice for TypeScript-style code.)

The one cost is cold start. The first call to a given artifact after a server
start compiles it; later calls reuse the compiled form, and artifacts with
identical bytes share it.

## The shape of a wasm function

A `raisin:Function` node with `language: wasm` and a `main.wasm` artifact
uploaded as a child asset:

```yaml
node_type: raisin:Function
properties:
  title: Greet
  name: greet
  language: wasm
  entry_file: main.wasm:default    # artifact:handler
  execution_mode: both
  enabled: true
  resource_limits:
    timeout_ms: 5000
    max_memory_bytes: 67108864
  network_policy:
    http_enabled: false
```

### One artifact can hold many handlers

`entry_file` is `artifact:handler`. A bare `main.wasm` means the handler named
`default` (writing `main.wasm:default` explicitly is equivalent). Because the
handler name is data rather than a separate export, one artifact can serve
several functions:

```yaml
# content/functions/lib/demo/greet/.node.yaml
entry_file: main.wasm:default

# content/functions/lib/demo/greet-shout/.node.yaml  (same artifact)
entry_file: ../greet/main.wasm:shout
```

The second node has no artifact of its own. A parent-relative `entry_file` must
stay inside the `functions` workspace.

## The development loop

```bash
# 1. Scaffold: the node, the project and a unit test
raisindb create function greet --lang rust --ns demo

# 2. Build the component and copy it into the node directory
raisindb function build wasm/demo/greet

# 3. Run the native tests, no server needed
raisindb function test wasm/demo/greet

# 4. Run it on your server (uploads the artifact when it changed)
raisindb function run wasm/demo/greet --input '{"name":"Ada"}' --repo myapp

# 5. Ship it
raisindb deploy . --repo myapp --install
```

### What `create function` produces

Run it inside a package whose content lives under `content/`. It writes two
things in two places:

```
my-package/
  content/functions/lib/demo/greet/
    .node.yaml            the raisin:Function node: language, entry_file, limits
    main.wasm             the built component (appears after `function build`)
  wasm/demo/greet/
    raisin.build.yaml     lang, node_dir, artifact, handlers, command, output
    Cargo.toml            pinned to the SDK at a release tag
    src/lib.rs            your handlers
    tests/handlers.rs     native unit tests against the mock host
    tests/server.json     scenarios for `function test --server`
    README.md
  .rapignore              contains `wasm/`
```

The guest source sits outside `content/` because `raisindb sync` treats every
non-YAML file under `content/` as an asset and would upload `Cargo.toml`.
The `.rap` package therefore contains `.node.yaml` and `main.wasm`, and not
`Cargo.toml`, `go.mod` or `src/`. The artifact is what ships; the source stays
in your repository.

For `--lang js` and `--lang starlark` there is no second directory. The source
is the deliverable, so it lives beside its `.node.yaml` under `content/`:

```
content/functions/lib/demo/greet/
  .node.yaml              language: javascript, entry_file: index.js:handler
  index.js                ships as the function's code
```

### What `function build` runs

It is a thin wrapper around your language's toolchain. It reads
`raisin.build.yaml` and runs:

| `--lang` | command |
|---|---|
| `rust` | `cargo build --release --target wasm32-wasip2` |
| `go` | `tinygo build -target=wasip2 -o main.wasm --wit-package ./wit --wit-world function .` |
| `assemblyscript` | `asc …`, then `wasm-tools component embed` and `component new` (see its guide) |

Then it copies the component into the Function node's directory, prints the
size and sha256, and lists every Function node that artifact backs:

```
+ wasm/demo/greet -> content/functions/lib/demo/greet/main.wasm
    136.1 KiB  sha256 8dd6d641…  (12891 ms)
    backs 2 Function node(s):
      greet-shout  handler "shout"
      greet        handler "default"
```

`raisin.build.yaml` has a `command:` key if your project needs something else,
such as a workspace flag or a wrapper script. `--debug` builds the debug
profile (faster to build, much larger), `--all` builds every project in the
package, `--watch` rebuilds on change.

`raisindb function doctor` checks the parts that otherwise fail late: the
toolchain is installed, every `entry_file` handler name is registered in the
source, the artifact is under the size cap, and the component imports only
what the host provides.

### Adding a second handler to an existing project

```bash
raisindb create function greet-shout --lang rust --into wasm/demo/greet --handler shout
```

This registers `shout` in the project, adds it to the tests and to
`raisin.build.yaml`, and creates a second Function node whose `entry_file`
points at the same artifact.

## What a function can and cannot do

Everything in the `raisin.*` API is available: nodes, SQL, HTTP, secrets,
locks, AI, assets. The guest SDKs are generated from the same registry every
runtime uses (see the [ABI reference](../../reference/function-api/wasm-abi.md)).

Not available:

- **Sockets and direct HTTP.** Network access goes through `raisin.http.*`,
  which applies the function's `network_policy`. A component that imports
  `wasi:sockets` or `wasi:http` is rejected at upload with the import named.
- **The filesystem.** The interface is linked with no preopened directories,
  so guests that expect it start cleanly but every open fails.
- **Timers or background work.** A handler runs, returns, and its instance is
  destroyed.

## Limits

| Limit | Default | Where |
|---|---|---|
| Wall clock | 30 s | `resource_limits.timeout_ms` on the node |
| Memory | 128 MiB | `resource_limits.max_memory_bytes` on the node |
| Artifact size | 32 MiB | `[functions.wasm] max_artifact_bytes` in the server config |

Scaffolds set 5 s and 64 MiB, which is plenty for most handlers. Memory is a
budget for the whole store: a component with several linear memories shares one
allowance.

Every execution gets a fresh instance. Nothing survives between calls, no
globals and no cached state, so two tenants running the same artifact share
only its immutable compiled code.

## Next steps

- [Rust quickstart](./wasm-rust.md): smallest artifacts
- [Go quickstart](./wasm-go.md): built with TinyGo
- [AssemblyScript quickstart](./wasm-assemblyscript.md): TypeScript-like syntax
- [The WIT contract and host ABI](../../reference/function-api/wasm-abi.md)
