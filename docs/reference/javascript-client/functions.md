---
sidebar_position: 7
---

# Functions

Invoke server-side functions from your application. Works identically across WebSocket and HTTP clients.

## Usage

Both the WebSocket client (`RaisinClient`) and the HTTP client (`RaisinHttpClient`) expose the same `functions()` API:

### WebSocket Client

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('raisin://localhost:8080/sys/default');
await client.connect();
await client.authenticate({ username: 'admin', password: 'admin' });

const db = client.database('myapp');
const { execution_id, job_id } = await db.functions().invoke('send-welcome-email', {
  userId: 'user_123',
  template: 'onboarding',
});
```

### HTTP Client (SSR / Node.js)

```typescript
import { RaisinHttpClient } from '@raisindb/client';

const client = new RaisinHttpClient('http://localhost:8081');
await client.authenticate({ username: 'admin', password: 'admin' });

const db = client.database('myapp');
const { execution_id, job_id } = await db.functions().invoke('send-welcome-email', {
  userId: 'user_123',
  template: 'onboarding',
});
```

The code is the same in both cases — only the client constructor differs.

### SQL

Functions can also be invoked directly from SQL using `INVOKE()` and `INVOKE_SYNC()`:

```typescript
const db = client.database('myapp');

// Async — queue a background job
const result = await db.sql`
  SELECT INVOKE('send-welcome-email', ${{ userId: 'user_123', template: 'onboarding' }}::jsonb)
`;

// Sync — execute inline and get the result
const syncResult = await db.sql`
  SELECT INVOKE_SYNC('calculate-total', ${{ items: [{ price: 10, qty: 2 }] }}::jsonb)
`;
```

The client can be either `RaisinClient` (WebSocket) or `RaisinHttpClient` — the SQL syntax is the same. This also works via PgWire (`psql`) and any other SQL transport.

See [SQL Invoke Functions](/docs/reference/sql/functions/invoke-functions) for the full syntax reference including per-row execution, workspace parameters, and more examples.

---

## Methods

### invoke()

Invoke a server-side function by name. The function is queued as a background job and returns immediately with tracking IDs.

```typescript
async invoke(
  functionName: string,
  input?: Record<string, unknown>,
): Promise<FunctionInvokeResponse>
```

```typescript
interface FunctionInvokeResponse {
  execution_id: string;
  job_id: string;
}
```

### invokeSync()

Invoke a server-side function synchronously. The function executes inline on the server and the result is returned directly. This bypasses the job queue for immediate execution.

```typescript
async invokeSync(
  functionName: string,
  input?: Record<string, unknown>,
): Promise<FunctionInvokeSyncResponse>
```

```typescript
interface FunctionInvokeSyncResponse {
  execution_id: string;
  result?: unknown;
  error?: string;
  duration_ms?: number;
  logs?: string[];
}
```

#### Example

```typescript
const db = client.database('myapp');
const { result, error, duration_ms } = await db.functions().invokeSync('calculate-total', {
  items: [{ price: 10, qty: 2 }, { price: 5, qty: 3 }],
});

if (error) {
  console.error('Function failed:', error);
} else {
  console.log('Total:', result); // e.g., { total: 35 }
  console.log(`Executed in ${duration_ms}ms`);
}
```

---

## Tracking Execution

When using `invoke()` (async), you receive two IDs:

- **`execution_id`** — a unique identifier for this invocation. Use it to query execution status via the HTTP API.
- **`job_id`** — the internal job queue ID. Visible in the admin console under Jobs for debugging.

### Checking Execution Status

Retrieve the result of an async invocation via the HTTP API:

```
GET /api/functions/{repo}/{name}/executions/{execution_id}
```

---

## Branch Scoping

`functions()` respects branch context:

```typescript
const staging = db.onBranch('staging');
await staging.functions().invoke('my-function', { key: 'value' });
```

---

## Direct Invocation (HTTP Client)

The `RaisinHttpClient` also exposes lower-level methods:

```typescript
// Async (background job)
const result = await client.invokeFunction('myapp', 'send-welcome-email', {
  userId: 'user_123',
});

// Sync (inline execution)
const syncResult = await client.invokeFunctionSync('myapp', 'calculate-total', {
  items: [{ price: 10, qty: 2 }],
});
```

