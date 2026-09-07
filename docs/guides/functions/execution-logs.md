---
sidebar_position: 3
---

# Execution Logs

Every asynchronous run of a function is recorded as a job, and the Functions
API lists those jobs per function. Each record carries the status, timing,
the function's return value and everything it logged.

## List executions

```bash
curl "http://localhost:8090/api/functions/myapp/greet/executions?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "execution_id": "4Al9KV1JpP8mMVMRzYxSr",
    "function_path": "/lib/docs/greet",
    "trigger_name": "http",
    "status": "completed",
    "started_at": "2026-09-06T18:41:08.880292+00:00",
    "completed_at": "2026-09-06T18:41:08.886972+00:00",
    "duration_ms": 6,
    "result": {
      "execution_id": "4Al9KV1JpP8mMVMRzYxSr",
      "success": true,
      "result": { "greeting": "Hello, Cy" },
      "error": null,
      "duration_ms": 5,
      "logs": ["[info] greeting Cy"]
    }
  }
]
```

The list is newest first. Query parameters:

| Parameter | Meaning |
|-----------|---------|
| `status` | `scheduled`, `running`, `completed`, `failed` or `cancelled` |
| `trigger_name` | what started the run: `http` for the invoke endpoint, `sql` for `INVOKE()`, `ws` for the WebSocket client, or a trigger's name |
| `limit`, `offset` | paging, default 100 from 0 |

The outer `duration_ms` is the job's wall-clock time; the inner one is the
function's own execution time. Console output (`console.log` in JavaScript,
`print` in Starlark) lands in `logs` with a level prefix, and stdout and
stderr of a WebAssembly guest are captured the same way. A failed run has
`status: "failed"` and the error message in `error`.

## Get one execution

```bash
curl http://localhost:8090/api/functions/myapp/greet/executions/4Al9KV1JpP8mMVMRzYxSr \
  -H "Authorization: Bearer $TOKEN"
```

Returns the same record, or 404 with `"Execution '...' not found"`. This is
the endpoint to poll after an asynchronous invoke: `status` moves from
`scheduled` through `running` to `completed` or `failed`.

## What is recorded

Synchronous invocations (`"sync": true`) run inline and return their result and
logs directly in the response; they do not create a job, so they do not appear
in this list. To keep a record of a call and still get its result, use
`"wait_for_completion": true` instead.

Job records are kept for 24 hours. Results larger than 64 KiB are replaced by
`{"$truncated": true, "size": n}` in listings.

## Next steps

- [Creating functions](./creating-functions.md)
- [Triggers](./triggers.md)
