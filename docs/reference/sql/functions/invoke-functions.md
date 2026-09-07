---
sidebar_position: 11
---

# Invoke Functions

Call server-side functions from SQL. `INVOKE` and `INVOKE_SYNC` are available
on the HTTP SQL endpoint and over the WebSocket client.

## INVOKE

Queue a function for background execution and return its tracking ids.

```sql
INVOKE(path) → JSONB
INVOKE(path, input) → JSONB
INVOKE(path, input, workspace) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| path | TEXT | The function's `name`, or its full path (`'send-newsletter'` or `'/lib/app/send-newsletter'`) |
| input | JSONB | Input passed to the function. Defaults to `{}` |
| workspace | TEXT | Workspace holding the function. Defaults to `'functions'` |

Functions are always resolved on the `main` branch.

### Return value

```json
{ "execution_id": "-h7MIqzW3RQaKIqxvfC21", "job_id": "0aoatJQvm7SrzvQoqPnfl" }
```

The run appears in the function's execution history with `trigger_name: "sql"`.

### Examples

```sql
-- Queue a function with no input
SELECT INVOKE('health-check');

-- With JSON input
SELECT INVOKE('send-newsletter', '{"template": "weekly"}'::jsonb);

-- With a bound parameter (cast it to jsonb)
SELECT INVOKE('send-newsletter', $1::jsonb);

-- With an explicit workspace
SELECT INVOKE('send-newsletter', '{"template": "weekly"}'::jsonb, 'my-functions');

-- Per row: queue one job per matching node, passing its properties
SELECT path, INVOKE('process-item', properties) AS job
FROM 'content'
WHERE node_type = 'blog:Article';
```

---

## INVOKE_SYNC

Run a function inline and return its result.

```sql
INVOKE_SYNC(path) → JSONB
INVOKE_SYNC(path, input) → JSONB
INVOKE_SYNC(path, input, workspace) → JSONB
```

The parameters are the same as for `INVOKE`. The function's `execution_mode`
does not matter here; the call always waits.

### Return value

The function's return value as JSONB, or `null` if it returned nothing. A
failing function makes the statement fail.

### Examples

```sql
-- Call with no input
SELECT INVOKE_SYNC('health-check');

-- With JSON input
SELECT INVOKE_SYNC('calculate-total', '{"items": [{"price": 10, "qty": 2}]}'::jsonb);

-- With a bound parameter
SELECT INVOKE_SYNC('calculate-total', $1::jsonb);

-- Per row: pass each node's properties through a function
SELECT path, INVOKE_SYNC('enrich', properties) AS enriched
FROM 'content'
WHERE node_type = 'blog:Article';
```

```json
{
  "columns": ["out"],
  "rows": [{ "out": "{\"greeting\":\"Hello, Ada\"}" }],
  "row_count": 1
}
```

---

## Standalone and per-row execution

Without a `FROM` clause the function runs once. With one it runs once per row,
and column values such as `properties` can be passed as the input.

In per-row mode the call must stand on its own as a selected column. Wrapping
it in another expression (`INVOKE_SYNC(...)->>'field'`) or using it in `WHERE`
is not supported at the moment and fails with "Unknown function: INVOKE_SYNC".
Select the whole result and read the field on the client instead.

---

## Notes

- `INVOKE` does not block. Check progress through the
  [Functions API](/docs/reference/http-api/functions-api#get-an-execution).
- `INVOKE_SYNC` blocks for the function's whole run; use it for fast operations.
- Both are non-deterministic and are always evaluated on the server.
- `INVOKE_SYNC` runs the function as the `system` actor.
- These correspond to `invoke()` and `invokeSync()` in the
  [JavaScript client](/docs/reference/javascript-client/functions).
