---
sidebar_position: 1
---

# Creating Functions

Create serverless functions to extend RaisinDB with custom logic.

## What are Functions?

Functions in RaisinDB run in a sandboxed environment with configurable resource limits. Supported runtimes:

| Runtime | Language | `--lang` | Build step |
|---------|----------|----------|------------|
| QuickJS | JavaScript | `js` | none — source ships |
| Starlark | Python-like | `starlark` | none — source ships |
| [WebAssembly](./wasm-functions.md) | Rust, Go | `rust`, `go` | compiled to a component |
| SQL | SQL | — | none |

Whichever you choose, the CLI starts it the same way:

```bash
raisindb create function send-welcome-email --lang js
raisindb create function price-quote        --lang rust
```

That scaffolds the `raisin:Function` node and its source (or its toolchain
project), ready to deploy. [WebAssembly](./wasm-functions.md) is the fastest
option and the one to reach for when you want existing Rust or Go libraries;
JavaScript is the quickest to iterate on.

Functions can:
- Process data
- Integrate with external APIs (allowlisted endpoints)
- Respond to triggers (events, HTTP, schedule, SQL)
- Handle webhooks

## Create a Function

Functions are stored as `raisin:Function` nodes in the `functions` workspace.

### Via Admin Console

1. Navigate to **Functions**
2. Click **Create Function**
3. Enter function details:
   - **Name**: `send-welcome-email`
   - **Description**: `Send welcome email to new users`
4. Add code in the editor
5. Click **Save**

### Via API

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/functions/send-welcome-email \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "raisin:Function",
    "properties": {
      "code": "export async function handler(event) { ... }",
      "runtime": "node20",
      "timeout": 30
    }
  }'
```

## Function Code

Functions have access to the sandboxed `raisin` API:

| API | Operations |
|-----|------------|
| `raisin.nodes` | `get`, `getById`, `getChildren`, `create`, `createDeep`, `upsertDeep`, `update`, `delete`, `query` |
| `raisin.sql` | `query`, `execute` |
| `raisin.http` | `get`, `post`, `put`, `delete` (allowlisted endpoints) |
| `raisin.imap` | `fetchSince`, `listMailboxes`, `fetchMessage`, `search` (native IMAP protocol; host allowlisted like `raisin.http`) |
| `raisin.events` | `emit` (publish events) |
| `raisin.locks` | `acquire`, `release`, `renew` (atomic [lease-locks](../coordination/locks-and-inventory.md)) |
| `raisin.inventory` | `claim`, `release` (counting reservations) |

```javascript
async function handler(input) {
  // Read a node
  const user = await raisin.nodes.get("default", input.path);

  // Update properties
  await raisin.nodes.update("default", input.path, {
    properties: { ...user.properties, status: "processed" }
  });

  // Execute SQL queries
  const results = await raisin.sql.query(
    "SELECT * FROM 'default' WHERE node_type = 'blog:Article'"
  );

  // Make HTTP requests (allowlisted)
  const response = await raisin.http.post("https://api.example.com/notify", {
    body: { user_id: input.user_id }
  });

  return { success: true, count: results.length };
}
```

## Invoke a Function

### Via HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/functions/myapp/send-welcome-email/invoke \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "email": "user@example.com"
  }'
```

### Via JavaScript Client

```typescript
const result = await client.functions.invoke('send-welcome-email', {
  user_id: 'user-123',
  email: 'user@example.com'
});
```

## Next Steps

- [Triggers](./triggers.md)
- [Execution Logs](./execution-logs.md)
