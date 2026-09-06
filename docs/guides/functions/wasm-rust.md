---
sidebar_position: 5
---

# WebAssembly: Rust

The fastest of the three guest languages and the smallest artifacts
(~200–400 KB). Best when latency matters or you want existing Rust crates.

## Prerequisites

```bash
rustup target add wasm32-wasip2
```

That is all — since Rust 1.82 the `wasm32-wasip2` target emits a component
directly, so `cargo-component` is optional.

## Scaffold

```bash
raisindb create function greet --lang rust --ns demo
```

You get a Function node under `content/functions/lib/demo/greet/` and a crate
under `wasm/demo/greet/`. Source lives outside `content/` so `raisindb sync`
never uploads your `Cargo.toml` as an asset.

## Write the handler

```rust
use raisin_sdk::{handler, nodes, sql, log, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Input { name: String }

#[derive(Serialize)]
struct Output { greeting: String, pages: usize }

#[handler]
fn greet(input: Input) -> Result<Output> {
    log::info(&format!("greeting {}", input.name));

    let children = nodes::get_children("content", "/pages", Some(50))?;
    let rows = sql::query(
        "SELECT id, name FROM 'content' WHERE node_type = $1",
        &[serde_json::json!("raisin:Page")],
    )?;

    Ok(Output {
        greeting: format!("Hello, {}", input.name),
        pages: children.len().max(rows.len()),
    })
}
```

`#[handler]` registers as `default`. Name it to add more to one artifact:

```rust
#[handler(name = "shout")]
fn shout(input: Input) -> Result<Output> { /* ... */ }
```

## Test without a server

The SDK compiles natively as well as to wasm, so handlers are ordinary Rust
under `cargo test`. Host calls go to a mock you script:

```rust
#[test]
fn it_greets() {
    raisin_sdk::testing::with_mock(|mock| {
        mock.expect("nodes_getChildren", json!(["content", "/pages", 50]), json!([]));
        mock.expect("sql_query", json!([/* ... */]), json!([{"id": "1"}]));

        let out = greet(Input { name: "Ada".into() }).unwrap();
        assert_eq!(out.greeting, "Hello, Ada");
    });
}
```

An unexpected host call fails the test rather than returning a default, so a
handler that starts calling something new cannot pass silently.

## Build, run, deploy

```bash
raisindb function build wasm/demo/greet     # -> content/.../greet/main.wasm
raisindb function test  wasm/demo/greet     # cargo test, no server
raisindb function run   wasm/demo/greet --input '{"name":"Ada"}'
raisindb deploy . --install
```

## Depending on the SDK directly

Scaffolds pin the SDK to a release tag:

```toml
[dependencies]
raisin-sdk = { git = "https://github.com/maravilla-labs/raisindb", tag = "v0.5.0" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Keep the pin. The WIT contract is versioned, and a scaffold pinned to a tag
keeps building after the SDK moves on.

## Keeping artifacts small

```toml
[profile.release]
opt-level = "s"
lto = true
strip = true
codegen-units = 1
```

Scaffolds set this already. Size affects upload and cold-start compile time,
not steady-state speed.
