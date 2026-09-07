---
sidebar_position: 7
---

# Functions

Invoke server-side functions from your application. The WebSocket client and
the HTTP client expose the same `functions()` API.

## Usage

### WebSocket client

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8090/ws/myapp');
await client.connect();
await client.authenticate({ username: 'admin', password: 'admin' });

const db = client.database('myapp');
const { execution_id, job_id } = await db.functions().invoke('send-welcome-email', {
  userId: 'user_123',
  template: 'onboarding',
});
```

`raisin://` and `raisins://` URLs are accepted as aliases for `ws://` and `wss://`.

### HTTP client (SSR / Node.js)

```typescript
import { RaisinHttpClient } from '@raisindb/client';

const client = new RaisinHttpClient('http://localhost:8090');
await client.authenticate({ username: 'admin', password: 'admin' });

const db = client.database('myapp');
const { execution_id, job_id } = await db.functions().invoke('send-welcome-email', {
  userId: 'user_123',
  template: 'onboarding',
});
```

The code is the same in both cases; only the client constructor differs.

### SQL

Functions can also be invoked from SQL with `INVOKE()` and `INVOKE_SYNC()`.
The WebSocket client has a tagged template; the HTTP client uses `executeSql`:

```typescript
// WebSocket client: tagged template, values are bound as parameters
const rows = await db.sql`
  SELECT INVOKE_SYNC('calculate-total', ${{ items: [{ price: 10, qty: 2 }] }}::jsonb) AS out
`;

// HTTP client
const result = await db.executeSql(
  "SELECT INVOKE_SYNC('calculate-total', $1::jsonb) AS out",
  [{ items: [{ price: 10, qty: 2 }] }]
);
```

See [SQL Invoke Functions](/docs/reference/sql/functions/invoke-functions) for
the full syntax, including per-row execution.

---

## Methods

### invoke()

Queue a function as a background job. Returns as soon as the job is
registered, unless you ask it to wait.

```typescript
async invoke(
  functionName: string,
  input?: Record<string, unknown>,
  options?: FunctionInvokeOptions,
): Promise<FunctionInvokeResponse>
```

```typescript
interface FunctionInvokeOptions {
  waitForResult?: boolean;   // wait for the job and return its result
  waitTimeoutMs?: number;    // how long to wait (server default 60 s)
  requestTimeoutMs?: number; // HTTP client only: request timeout
}

interface FunctionInvokeResponse {
  execution_id: string;
  job_id: string;
  status?: string;           // "scheduled", "running", "completed", "failed"
  completed?: boolean;
  timed_out?: boolean;
  waited?: boolean;
  result?: unknown;          // present when waited
  error?: string;
  duration_ms?: number;
  logs?: string[];
}
```

```typescript
const run = await db.functions().invoke('generate-report', { month: '2026-08' }, {
  waitForResult: true,
  waitTimeoutMs: 30_000,
});
if (run.timed_out) console.log('still running:', run.execution_id);
else console.log(run.result);
```

### invokeSync()

Run a function inline and return the result directly. No job is created, so
the run does not appear in the execution history. The function's
`execution_mode` must be `sync` or `both`.

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

```typescript
const { result, error, duration_ms } = await db.functions().invokeSync('calculate-total', {
  items: [{ price: 10, qty: 2 }, { price: 5, qty: 3 }],
});

if (error) {
  console.error('Function failed:', error);
} else {
  console.log('Total:', result); // e.g. { total: 35 }
  console.log(`Executed in ${duration_ms}ms`);
}
```

Over HTTP the response also carries the `status`, `completed` and `waited`
fields of the [Functions API](/docs/reference/http-api/functions-api).

---

## Tracking execution

An asynchronous `invoke()` returns two ids:

- `execution_id` identifies this invocation and is what the execution history
  is keyed by.
- `job_id` is the job queue id, visible in the admin console under Jobs.

The client has no method for reading execution history; use the HTTP API:

```
GET /api/functions/{repo}/{name}/executions/{execution_id}
```

---

## Branches

Functions are always resolved and executed on the `main` branch of the
repository. A branch-scoped database (`db.onBranch('staging')`) affects SQL
and node operations, not `functions()`.

---

## Direct invocation (HTTP client)

`RaisinHttpClient` also exposes the lower-level methods the database wrapper
calls:

```typescript
// Async (background job)
const run = await client.invokeFunction('myapp', 'send-welcome-email', {
  userId: 'user_123',
});

// Sync (inline execution)
const sync = await client.invokeFunctionSync('myapp', 'calculate-total', {
  items: [{ price: 10, qty: 2 }],
});
```
