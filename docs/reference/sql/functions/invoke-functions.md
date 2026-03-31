---
sidebar_position: 11
---

# Invoke Functions

Call server-side functions directly from SQL. These functions work across all SQL transports: WebSocket, HTTP, and PgWire (`psql`).

## INVOKE

Queue a server-side function for background execution. Returns immediately with tracking IDs.

```sql
INVOKE(path) → JSONB
INVOKE(path, input) → JSONB
INVOKE(path, input, workspace) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| path | TEXT | Function name or path (e.g., `'send-newsletter'` or `'/libs/send-newsletter'`) |
| input | JSONB | Input data passed to the function. Defaults to `{}` if omitted |
| workspace | TEXT | Workspace where the function is defined. Defaults to `'functions'` if omitted |

### Return Value

A JSONB object containing:

| Field | Type | Description |
|-------|------|-------------|
| execution_id | string | Unique identifier for this invocation |
| job_id | string | Internal job queue ID for tracking |

### Examples

```sql
-- Basic: queue a function with no input
SELECT INVOKE('health-check');

-- With JSON input
SELECT INVOKE('send-newsletter', '{"template": "weekly"}'::jsonb);

-- With explicit workspace
SELECT INVOKE('send-newsletter', '{"template": "weekly"}'::jsonb, 'my-functions');

-- Per-row: queue a function for each row
SELECT path, INVOKE('process-item', properties) AS job
FROM 'content'
WHERE node_type = 'Article';
```

---

## INVOKE_SYNC

Execute a server-side function inline and return the result directly. The function runs synchronously on the server — no job queue is involved.

```sql
INVOKE_SYNC(path) → JSONB
INVOKE_SYNC(path, input) → JSONB
INVOKE_SYNC(path, input, workspace) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| path | TEXT | Function name or path (e.g., `'calculate-total'` or `'/libs/calculate-total'`) |
| input | JSONB | Input data passed to the function. Defaults to `{}` if omitted |
| workspace | TEXT | Workspace where the function is defined. Defaults to `'functions'` if omitted |

### Return Value

The function's return value as JSONB. Returns `null` if the function has no output.

### Examples

```sql
-- Basic: call a function with no input
SELECT INVOKE_SYNC('health-check');

-- With JSON input
SELECT INVOKE_SYNC('calculate-total', '{"items": [{"price": 10, "qty": 2}]}'::jsonb);

-- With explicit workspace
SELECT INVOKE_SYNC('calculate-total', '{"items": []}'::jsonb, 'my-functions');

-- Per-row: transform each row's properties through a function
SELECT path, INVOKE_SYNC('enrich', properties) AS enriched
FROM 'content'
WHERE node_type = 'Article';

-- Use the result in a WHERE clause
SELECT path, properties
FROM 'content'
WHERE INVOKE_SYNC('should-publish', properties)::jsonb = 'true'::jsonb;
```

---

## Standalone vs. Per-Row Execution

Both functions support two execution modes depending on whether a `FROM` clause is present:

**Standalone** (no `FROM`) — the function executes once as a scalar call:

```sql
SELECT INVOKE_SYNC('health-check');
```

**Per-row** (with `FROM`) — the function executes once for each row returned by the query:

```sql
SELECT path, INVOKE_SYNC('enrich', properties) AS enriched
FROM 'content';
```

When used per-row, you can pass column values (like `properties`) as the input argument.

---

## Notes

- `INVOKE` is non-blocking — it queues a background job and returns tracking IDs immediately. Use the [JavaScript client](/docs/reference/javascript-client/functions) or HTTP API to check execution status.
- `INVOKE_SYNC` blocks until the function completes. Use it for fast operations where you need the result inline.
- Both functions are non-deterministic and always require server-side execution.
- The `workspace` parameter is optional. Most functions live in the default `functions` workspace.
- Functions are resolved by name or path. For example, `'calculate-total'` and `'/libs/calculate-total'` both work.
- These SQL functions are equivalent to the [JavaScript client `invoke()` and `invokeSync()` methods](/docs/reference/javascript-client/functions).
