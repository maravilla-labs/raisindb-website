---
sidebar_position: 4
---

# WebAssembly Functions

Write a RaisinDB function in **Rust, Go or AssemblyScript**, compile it to a
WebAssembly component, and deploy it like any other function.

WebAssembly is a first-class runtime alongside QuickJS and Starlark: same
`raisin:Function` node, same `raisin.*` API, same triggers, same execution
logs. What differs is that you ship a compiled artifact instead of source.

## When to choose it

| You want | Use |
|---|---|
| Fastest execution and lowest tail latency | **WebAssembly** (Rust, Go) |
| TypeScript-like syntax in a small artifact | **WebAssembly** (AssemblyScript) |
| Existing Rust or Go libraries in a function | **WebAssembly** |
| Edit-in-console, no build step | QuickJS (JavaScript) |
| Small deterministic config logic | Starlark |

All of them are created the same way — `raisindb create function --lang …`
takes `rust`, `go`, `assemblyscript`, `js` and `starlark`. Only the compiled languages have a
build step.

Measured on one server, a function doing one node read plus a SQL query over
25 nodes (debug build, so treat these as a floor):

| runtime | latency | throughput at saturation | p99 under load |
|---|---:|---:|---:|
| WebAssembly | 11 ms | 452 req/s | 106 ms |
| QuickJS | 14 ms | 324 req/s | 175 ms |
| Starlark | 31 ms | 175 req/s | 281 ms |

For CPU-bound work the gap is far larger: a 50k-iteration loop is 1 ms in
WebAssembly, 14 ms in QuickJS, 149 ms in Starlark.

The one cost is **cold start**. The first call to a given artifact after a
server start compiles it (roughly 150 ms for a small Rust component). Every later call reuses the compiled form, and
artifacts with identical bytes share it.

## The shape of a wasm function

A `raisin:Function` node with `language: wasm` and a `main.wasm` artifact
uploaded as a child asset:

```yaml
node_type: raisin:Function
properties:
  title: Greet
  language: wasm
  entry_file: main.wasm:default    # artifact:handler
  execution_mode: both
  enabled: true
  resource_limits:
    timeout_ms: 5000
    max_memory_bytes: 67108864
```

### One artifact can hold many handlers

`entry_file` is `artifact:handler`. A bare `main.wasm` means the handler named
`default`. Because the handler name is data rather than a separate export,
**one artifact can serve many functions**:

```yaml
# content/functions/lib/demo/greet/.node.yaml
entry_file: main.wasm:default

# content/functions/lib/demo/greet-shout/.node.yaml  — SAME artifact
entry_file: ../greet/main.wasm:shout
```

The second node has no artifact of its own. This keeps a package small when many
functions share a codebase: one artifact uploaded once, not one per handler.

A parent-relative `entry_file` must stay inside the `functions` workspace.

## The development loop

```bash
# 1. Scaffold — creates the node, the project, and a unit test
raisindb create function greet --lang rust --ns demo   # or: go | js | starlark

# 2. Build the component
raisindb function build wasm/demo/greet

# 3. Test it with NO server running (mock host)
raisindb function test wasm/demo/greet

# 4. Run it against your local server
raisindb server start
raisindb function run wasm/demo/greet --input '{"name":"Ada"}'

# 5. Ship it
raisindb deploy . --install
```

### What `create function` actually produces

`raisindb create function greet --lang rust --ns demo` writes two things in two
places, and the split is deliberate:

```
my-package/
  content/functions/lib/demo/greet/
    .node.yaml            the raisin:Function node — language, entry_file, limits
    main.wasm             the built component (appears after `function build`)
  wasm/demo/greet/
    raisin.build.yaml     lang, node_dir, artifact, optional command override
    Cargo.toml            pinned to the SDK at a release tag
    src/lib.rs            your handler
    tests/handlers.rs     a native unit test against the mock host
    tests/server.json     scenarios for `function test --server`
    README.md
  .rapignore              contains `wasm/`
```

**Why the source is not under `content/`.** `raisindb sync` maps every non-YAML
file under `content/` to a node, so a `Cargo.toml` sitting there would be
uploaded as an asset. Guest source belongs to your build, not to your content
tree.

**What ships.** The `.rap` package contains `.node.yaml` and `main.wasm`. It
does **not** contain `Cargo.toml`, `go.mod` or `src/` — `.rapignore` excludes
`wasm/`. The artifact is the deliverable; the source is yours and stays in your
repository.

This means a package you receive from someone else is not a way to read their
guest source. That is the intended trade: the thing that runs is what ships.

For `--lang js` and `--lang starlark` there is no second directory at all. The
source *is* the deliverable, so it lives beside its `.node.yaml` under
`content/` and ships with the package:

```
content/functions/lib/demo/greet/
  .node.yaml              language: javascript, entry_file: index.js:handler
  index.js                ships as the function's code
```

### What `function build` actually runs

It is a thin wrapper around your language's real toolchain, not a compiler of
its own. It reads `raisin.build.yaml` in the project and runs:

| `--lang` | command |
|---|---|
| `rust` | `cargo build --release --target wasm32-wasip2` |
| `go` | `tinygo build -target=wasip2 --wit-package ./wit --wit-world function .` |
| `assemblyscript` | `asc …` then `wasm-tools component embed` + `component new` (three steps — see its guide) |

Then it copies the resulting component into the Function node's directory as
its artifact, prints the size and sha256, and lists every Function node that
artifact backs. You can run those commands yourself; `function build` exists so
you do not have to remember the target triple, and so the artifact lands where
the node's `entry_file` expects it.

`raisin.build.yaml` carries a `command:` key if your project needs something
else — a workspace flag, a different profile, a wrapper script.

`raisindb function doctor` checks the parts that otherwise fail late: that your
toolchain is installed, that every `entry_file` handler name is actually
registered in the source, that the artifact is under the size cap, and that
the component imports only what the host provides.

### Adding a second handler to an existing project

```bash
raisindb create function greet-shout --lang rust --into wasm/demo/greet --handler shout
```

This adds a handler to the existing project and creates a Function node
pointing at the same artifact.

## What a function can and cannot do

Everything in the [`raisin.*` API](../../reference/function-api/wasm-abi.md)
is available — nodes, SQL, HTTP, secrets, locks, AI, assets — through the same
registry every runtime uses.

Not available, deliberately:

- **No sockets and no direct HTTP.** Network access goes through
  `raisin.http.*`, which enforces the per-function network policy and blocks
  loopback and private ranges. A component importing `wasi:sockets` is
  rejected at upload with the import named.
- **No filesystem.** The interface is linked with no preopened directories, so
  guests that expect it start cleanly but every open fails.
- **No timers or background work.** A handler runs, returns, and its instance
  is destroyed.

## Limits

| Limit | Default | Source |
|---|---|---|
| Wall clock | 30 s | `resource_limits.timeout_ms` |
| Memory | 128 MiB | `resource_limits.max_memory_bytes` |
| Artifact size | 32 MiB | `[functions.wasm] max_artifact_bytes` |

Memory is a **store-wide** budget: a component with several linear memories
shares one allowance rather than getting the limit each.

Every execution gets a fresh instance. Nothing survives between calls — no
globals, no cached state — so two tenants running the same artifact share only
its immutable compiled code.

## Next steps

- [Rust quickstart](./wasm-rust.md) — smallest artifacts, fastest
- [Go quickstart](./wasm-go.md) — built with TinyGo
- [AssemblyScript quickstart](./wasm-assemblyscript.md) — TypeScript-like syntax, ~8 KB artifacts
- [The WIT contract and host ABI](../../reference/function-api/wasm-abi.md)
