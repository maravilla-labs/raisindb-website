---
sidebar_position: 6
---

# WebAssembly: Go

Go guests are built with TinyGo, because the standard Go compiler cannot target
`wasip2`.

## Prerequisites

- [TinyGo](https://tinygo.org/getting-started/install/) 0.34 or newer, plus a
  regular Go toolchain (1.22 or newer) for `go test`.

## Scaffold

```bash
raisindb create function greet --lang go --ns demo
```

## Write the handler

```go
package main

import (
	"encoding/json"
	"fmt"

	"github.com/maravilla-labs/raisindb/sdks/go/raisin"
)

type input struct {
	Name string `json:"name"`
}

func init() {
	raisin.HandleDefault(greet)

	// More handlers in the same artifact:
	// raisin.Handle("shout", shout)
}

// main is required by Go but never runs: the host calls the component
// export, not a program entry point.
func main() {}

func greet(raw json.RawMessage) (any, error) {
	var in input
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, fmt.Errorf("invalid input: %w", err)
	}

	raisin.Info("greeting %s", in.Name)

	limit := uint32(50)
	children, err := raisin.Nodes.GetChildren("content", "/pages", &limit)
	if err != nil {
		return nil, err
	}
	var pages []json.RawMessage
	_ = json.Unmarshal(children, &pages)

	return map[string]any{
		"greeting": "Hello, " + in.Name,
		"pages":    len(pages),
	}, nil
}
```

Handlers are registered in `init` with `raisin.HandleDefault` (the handler
named `default`) or `raisin.Handle(name, fn)`. A handler takes the input as
`json.RawMessage` and returns any JSON-serialisable value. Logging is through
package-level functions (`raisin.Debug`, `raisin.Info`, `raisin.Warn`,
`raisin.Error`) with `Printf` formatting. The `raisin.*` API methods return
`json.RawMessage`; decode what you need. Optional arguments are pointers, and
`nil` means absent.

## Test without a server

```go
package main

import (
	"strings"
	"testing"

	"github.com/maravilla-labs/raisindb/sdks/go/raisin/raisintest"
)

func TestGreet(t *testing.T) {
	mock := raisintest.New().
		Expect("nodes_getChildren", `["content","/pages",50]`, `[]`)
	defer mock.Install()()

	out, err := raisintest.Invoke("default", map[string]string{"name": "Ada"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"greeting":"Hello, Ada"`) {
		t.Fatalf("unexpected output %s", out)
	}
}
```

`raisintest.New()` builds a mock host; `Expect(method, args, result)` scripts
one call, where `args` is the JSON argument array (an empty string matches any
arguments) and `result` is the raw JSON the host would return. `Install()`
activates it and returns the restore function. `raisintest.Invoke` dispatches by
handler name exactly as the host does. An unscripted call fails the test, and
`mock.Calls()`, `mock.Logs()` and `mock.Unmet()` are available for assertions.

`go test ./...` runs natively; the wasm bindings are behind a build tag.

## Build, run, deploy

```bash
raisindb function build wasm/demo/greet
raisindb function test  wasm/demo/greet
raisindb function run   wasm/demo/greet --input '{"name":"Ada"}' --repo myapp
raisindb deploy . --repo myapp --install
```

Under the hood:

```bash
tinygo build -target=wasip2 -o main.wasm --wit-package ./wit --wit-world function .
```

## Depending on the SDK directly

```bash
go get github.com/maravilla-labs/raisindb/sdks/go/raisin@v0.5.0
```

It is a subdirectory module of the main repository, published under
path-prefixed tags (`sdks/go/raisin/v0.5.0`). The scaffold's `go.mod` requires
that version.

## TinyGo caveats

TinyGo is not the standard toolchain. Reflection is limited, some of the
standard library is unavailable, and `cgo` is out. `encoding/json` works,
which is what the SDK needs. Check the
[TinyGo language support page](https://tinygo.org/docs/reference/lang-support/)
before pulling in a large dependency.
