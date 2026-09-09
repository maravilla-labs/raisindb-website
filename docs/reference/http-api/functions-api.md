---
sidebar_position: 6
---

# Functions API

List, inspect and invoke functions, and read their execution history.
Functions are resolved by their `name` property in the repository's
`functions` workspace on the `main` branch.

## List functions

```
GET /api/functions/{repo}
```

Query parameters: `language`, `enabled`, `include_disabled`, `limit`, `offset`.

```json
[
  {
    "path": "/lib/docs/greet",
    "name": "greet",
    "title": "Greet",
    "description": "Greets by name",
    "language": "javascript",
    "enabled": true,
    "execution_mode": "both",
    "has_http_trigger": false,
    "has_event_triggers": false,
    "has_schedule_triggers": false
  }
]
```

## Get a function

```
GET /api/functions/{repo}/{name}?include_code=true
```

Returns the node's configuration: `path`, `name`, `title`, `description`,
`language`, `enabled`, `execution_mode`, `entry_file`, `resource_limits`,
`network_policy`, `triggers`, `input_schema`, `output_schema`, `created_at`,
`updated_at`, and with `include_code=true` the source as `code`. An unknown
name returns 404 with `{"code": "NOT_FOUND", "message": "Function 'x' not found"}`.

## Invoke a function

```
POST /api/functions/{repo}/{name}/invoke
```

Request body:

| Field | Type | Meaning |
|---|---|---|
| `input` | object | The handler's input. Defaults to `{}`. |
| `sync` | boolean | Run inline and return the result. Default `false`. |
| `wait_for_completion` | boolean | Queue a job, then wait for it. Default `false`. |
| `wait_timeout_ms` | number | How long to wait, 1,000 to 300,000 (default 60,000). |
| `timeout_ms` | number | Override the function's own timeout for this call. |

**Asynchronous** (the default) queues a job and returns at once:

```bash
curl -X POST http://localhost:8090/api/functions/myapp/greet/invoke \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"input":{"name":"Ada"}}'
```

```json
{
  "execution_id": "p91QVFa6nlVjRLup59CCB",
  "sync": false,
  "job_id": "Bo6VjzcT1SE1V2N8gf26k",
  "status": "scheduled",
  "completed": false,
  "timed_out": false,
  "waited": false
}
```

The `execution_id` in the response is the same id the function sees as
`raisin.context.execution_id` and the same one the execution log records, so a
log line can be traced back to the call that produced it.

**Synchronous** (`"sync": true`) runs the function inline. The function's
`execution_mode` must be `sync` or `both`, otherwise the call fails with 400.

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

A handler that throws still answers with `status: "completed"`; the failure is
in `error`, for example `"[RUNTIME_ERROR] Internal error: [JS] cannot read
property 'name' of null\n    at handler (entry:4:34)"`.

**Queue and wait** (`"wait_for_completion": true`) records a job like the
asynchronous form, then polls it and returns the same fields as the
synchronous response plus `job_id`. If the wait runs out, `status` is
`"running"` and `timed_out` is `true`; the job continues and can be read from
the executions endpoint. `sync` and `wait_for_completion` cannot be combined.

## List executions

```
GET /api/functions/{repo}/{name}/executions
```

Query parameters: `status` (`scheduled`, `running`, `completed`, `failed`,
`cancelled`), `trigger_name`, `limit` (default 100), `offset`.

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

Only job-backed runs are listed (asynchronous invokes, `wait_for_completion`,
SQL `INVOKE()`, triggers). Synchronous invokes return their result directly
and leave no record. See [Execution logs](/docs/guides/functions/execution-logs)
for retention.

## Get an execution

```
GET /api/functions/{repo}/{name}/executions/{execution_id}
```

Returns one record as above, or 404.

## HTTP triggers

Functions exposed through an HTTP trigger are called at
`/api/triggers/{repo}/{trigger_name}` or `/api/webhooks/{repo}/{webhook_id}`
(GET, POST, PUT or DELETE, with an optional path suffix). See
[Triggers](/docs/guides/functions/triggers#http-triggers) for the request and
response shapes.
