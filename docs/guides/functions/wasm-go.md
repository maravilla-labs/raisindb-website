---
sidebar_position: 6
---

# WebAssembly: Go

Go guests are built with **TinyGo** — the standard Go compiler cannot target
`wasip2`. Artifacts land around 1–3 MB.

## Prerequisites

- [TinyGo](https://tinygo.org/getting-started/install/) 0.34 or newer.

## Scaffold

```bash
raisindb create function greet --lang go --ns demo
```

## Write the handler

```go
package main

import (
	"encoding/json"

	"github.com/maravilla-labs/raisindb/sdks/go/raisin"
)

type Input struct {
	Name string `json:"name"`
}

func init() {
	raisin.HandleDefault(func(in json.RawMessage) (any, error) {
		var input Input
		if err := json.Unmarshal(in, &input); err != nil {
			return nil, err
		}

		raisin.Log.Info("greeting " + input.Name)

		children, err := raisin.Nodes.GetChildren("content", "/pages", 50)
		if err != nil {
			return nil, err
		}

		return map[string]any{
			"greeting": "Hello, " + input.Name,
			"pages":    len(children),
		}, nil
	})

	// More handlers in the same artifact:
	raisin.Handle("shout", func(in json.RawMessage) (any, error) { /* ... */ })
}

func main() {}
```

Registration happens in `init` because a component has no long-running `main`;
`main` stays empty and is never called for a handler invocation.

## Test without a server

```go
func TestGreet(t *testing.T) {
	raisintest.WithMock(t, func(m *raisintest.Mock) {
		m.Expect("nodes_getChildren", `["content","/pages",50]`, `[]`)

		out, err := raisin.Invoke("default", []byte(`{"name":"Ada"}`))
		if err != nil {
			t.Fatal(err)
		}
		// assert on out
	})
}
```

`go test ./...` runs natively — the wasm bindings are behind a build tag.

## Build, run, deploy

```bash
raisindb function build wasm/demo/greet
raisindb function test  wasm/demo/greet
raisindb function run   wasm/demo/greet --input '{"name":"Ada"}'
raisindb deploy . --install
```

Under the hood:

```bash
tinygo build -target=wasip2 --wit-package ./wit --wit-world function -o main.wasm .
```

## Depending on the SDK directly

```bash
go get github.com/maravilla-labs/raisindb/sdks/go/raisin@v0.5.0
```

It is a subdirectory module of the main repository, published under
path-prefixed tags (`sdks/go/raisin/v0.5.0`).

## TinyGo caveats

TinyGo is not the standard toolchain. Reflection is limited, some of the
standard library is unavailable, and `cgo` is out. `encoding/json` works,
which is what the SDK needs. Check the
[TinyGo language support page](https://tinygo.org/docs/reference/lang-support/)
before pulling in a large dependency.
