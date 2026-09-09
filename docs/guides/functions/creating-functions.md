---
sidebar_position: 1
---

# Creating Functions

A function is server-side code that RaisinDB runs on demand: when you call it
over HTTP or SQL, when a trigger fires, or when an AI agent uses it as a tool.
It runs in a sandbox with a `raisin` API for reading and writing nodes, running
SQL, calling external services and sending email.

## Runtimes

| Runtime | `language` | `--lang` | Build step |
|---------|------------|----------|------------|
| QuickJS (JavaScript) | `javascript` | `js` | none, the source ships |
| Starlark (Python-like) | `starlark` | `starlark` | none, the source ships |
| [WebAssembly](./wasm-functions.md) | `wasm` | `rust`, `go`, `assemblyscript`, `ts` | compiled to a component |

JavaScript is the quickest to iterate on. WebAssembly is the choice for
CPU-bound work or when you want to reuse Rust or Go libraries. Starlark suits
small, deterministic data transformations.

## What a function is made of

A function is a `raisin:Function` node in the `functions` workspace, with its
code stored in a child asset node. Two properties tie them together:

- `language` selects the runtime.
- `entry_file` is `<file>:<handler>`: the asset beside the node and the
  function inside it to call. The default is `index.js:handler`.

  The handler half is optional. A bare file name takes the language's default
  handler, which is `handler` for JavaScript and Starlark and `default` for
  WebAssembly, so `main.wasm` and `main.wasm:default` mean the same thing. A
  bare name with no extension is read the old way, as a handler inside
  `index.js`.

```yaml
# content/functions/lib/docs/greet/.node.yaml
node_type: raisin:Function
properties:
  title: greet
  name: greet                 # used in URLs and SQL calls
  language: javascript
  entry_file: index.js:handler
  execution_mode: both        # async (default), sync, or both
  enabled: true
  resource_limits:
    timeout_ms: 30000
    max_memory_bytes: 134217728
  network_policy:
    http_enabled: false
```

```javascript
// content/functions/lib/docs/greet/index.js
export function handler(input) {
  console.log(`greeting ${input.name}`);
  const children = raisin.nodes.getChildren('content', '/pages', 50);
  return { greeting: `Hello, ${input.name}`, pages: children.length };
}
```

`execution_mode` decides how the function may be called. `async` (the default)
runs it as a background job. `sync` runs it inline and returns the result in
the response. `both` allows either.

By convention application functions live under `/lib/<namespace>/<name>`, and
the built-in ones under `/lib/raisin/...`.

## Create a function with the CLI

Inside a package directory (one that has a `manifest.yaml` and a `content/`
folder), scaffold the node and its source in one step:

```bash
raisindb create function greet --lang js --ns docs --description "Greets by name"
```

This writes the two files shown above under `content/functions/lib/docs/greet/`.
Use `--lang starlark` for a `main.star` handler instead, or one of the
WebAssembly languages (see [WebAssembly functions](./wasm-functions.md) for the
project layout they add).

Deploy the package and install it into a repository:

```bash
raisindb deploy . --repo myapp --install
```

Every function under `content/functions/` in the package becomes a node in the
repository's `functions` workspace.

## Create a function over HTTP

The same two nodes can be created with the repository API. First the function
node under `/lib`, then its code as a child asset with an inline `code`
property:

```bash
curl -X POST http://localhost:8090/api/repository/myapp/main/head/functions/lib \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"node":{"name":"greet","node_type":"raisin:Function","properties":{
        "title":"Greet","name":"greet","language":"javascript",
        "entry_file":"index.js:handler","execution_mode":"both","enabled":true}}}'

curl -X POST http://localhost:8090/api/repository/myapp/main/head/functions/lib/greet \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"node":{"name":"index.js","node_type":"raisin:Asset","properties":{
        "title":"index.js","file":"",
        "code":"export function handler(input) { return { greeting: \"Hello, \" + input.name }; }"}}}'
```

## Function code

The handler receives the caller's input as a plain object and returns a
JSON-serialisable value. In JavaScript the `raisin.*` calls are synchronous:
you can write `await` in front of them, but you do not need to.

```javascript
export function handler(input) {
  // Read a node (workspace, path)
  const page = raisin.nodes.get('content', input.path);

  // Merge properties into it; keys you do not name are kept
  raisin.nodes.update('content', input.path, {
    properties: { status: 'processed' },
  });

  // SQL with bound parameters; query returns an array of row objects
  const rows = raisin.sql.query(
    "SELECT path, name FROM 'content' WHERE node_type = $1",
    ['blog:Article']
  );

  // Outbound HTTP, allowed by the function's network_policy
  const res = raisin.http.fetch('https://api.example.com/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { page: page.id },
  });

  return { ok: res.status === 200, count: rows.length };
}
```

Every function sees the same API. The main namespaces:

| Namespace | Methods |
|-----------|---------|
| `raisin.nodes` | `get`, `getById`, `getChildren`, `query`, `create`, `createDeep`, `upsertDeep`, `update`, `updateProperty`, `delete`, `move`, `history`, `beginTransaction` |
| `raisin.sql` | `query`, `execute` |
| `raisin.http` | `fetch(url, options)`, plus `request(method, url, options)` and `get` / `post` / `put` / `patch` / `delete`; the global `fetch()` is also available in JavaScript |
| `raisin.events` | `emit(type, data)` |
| `raisin.secrets`, `raisin.email` | read vaulted secrets, send [email](../../reference/function-api/email.md) |
| `raisin.locks`, `raisin.inventory` | [lease locks and counting reservations](../coordination/locks-and-inventory.md) |
| `raisin.imap`, `raisin.ai`, `raisin.assets`, `raisin.functions` | IMAP, model calls, asset processing, calling other functions |
| `raisin.context` | `{ tenant_id, repo_id, branch, workspace_id, actor, execution_id }` |

Outbound HTTP is off until the node declares a `network_policy` with
`http_enabled: true` and an `allowed_urls` list of glob patterns (`*` matches
within one path segment, `**` across segments). A request to a URL outside the
list comes back with `status: 0` and an `error` message rather than leaving the
server. Email and secrets are gated the same way by `email_policy` and
`secret_policy`.

In JavaScript, most `raisin.*` calls report failure through their return value
instead of throwing: `sql.query` returns `{ error, rows: [] }`, `sql.execute`
returns `-1`, `events.emit` returns `false` and every `raisin.http` method
returns `{ error, status: 0, ok: false }`. Check for `error` when it matters.

## Querying nodes without writing SQL

`raisin.nodes.query(workspace, filter)` takes a small filter object and returns
the matching nodes. Everything in it is bound as a parameter, so a value
carrying a quote is a value and not syntax.

```js
const articles = raisin.nodes.query('content', {
  nodeType: 'blog:Article',
  descendantOf: '/blog',
  properties: { status: 'published' },
  orderBy: 'created_at',
  order: 'desc',
  limit: 20,
});
```

The recognised keys are `path`, `id`, `nodeType`, `childOf`, `descendantOf`,
`properties`, `orderBy`, `order`, `limit` and `offset`. Snake_case spellings
work too. Property values are compared as text, because the underlying operator
yields text, so write `{ seq: 0 }` and it is matched against `'0'`.

`orderBy` accepts `path`, `name`, `node_type`, `created_at`, `updated_at`,
`revision`, `__order` and `__tree_order`, and rejects anything else. Reach for
`raisin.sql.query()` when the filter object cannot express what you need.

In Starlark the same methods use snake_case names and errors stop the handler:

```python
def handler(input):
    print("greeting " + input["name"])
    rows = raisin.sql.query("SELECT path FROM 'content'", [])
    return {"greeting": "Hello, " + input["name"], "rows": len(rows)}
```

## Invoke a function

Over HTTP, send the input under `input`. Add `"sync": true` to run inline and
get the result back (the function's `execution_mode` must be `sync` or `both`):

```bash
curl -X POST http://localhost:8090/api/functions/myapp/greet/invoke \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"input":{"name":"Ada"},"sync":true}'
```

```json
{
  "execution_id": "BCCB5m3jkMBLtUBsJlA3N",
  "sync": true,
  "result": { "greeting": "Hello, Ada" },
  "duration_ms": 9,
  "logs": ["[info] greeting Ada"],
  "status": "completed",
  "completed": true,
  "timed_out": false,
  "waited": true
}
```

Without `sync` the call queues a job and returns `execution_id` and `job_id`
immediately. See the [Functions API](../../reference/http-api/functions-api.md)
for the full request and response shapes.

From the [JavaScript client](../../reference/javascript-client/functions.md):

```typescript
const db = client.database('myapp');
const { result } = await db.functions().invokeSync('greet', { name: 'Ada' });
```

From SQL:

```sql
SELECT INVOKE_SYNC('greet', '{"name":"Ada"}'::jsonb);
```

## Testing a function

```bash
raisindb function doctor content/functions/lib/docs/greet
raisindb function run    content/functions/lib/docs/greet --input '{"name":"Ada"}' --repo myapp
raisindb function test   content/functions/lib/docs/greet --server --repo myapp
```

`doctor` checks that the handler named in `entry_file` exists in the source.
`run` executes the local file on the server and prints the result and logs,
without deploying it. `test --server` replays the scenarios in a hidden
`.tests.json` beside the node (hidden so `sync` does not upload it as content):

```json
[{ "input": { "name": "Ada" }, "expect": { "greeting": "Hello, Ada" } }]
```

An object in `expect` is matched as a subset, so a case asserts only the fields
it names. WebAssembly projects additionally have native tests that run with no
server at all; see [WebAssembly functions](./wasm-functions.md).

## Next steps

- [Triggers](./triggers.md): run a function on node changes, a schedule or an HTTP request
- [Execution logs](./execution-logs.md): inspect past runs
