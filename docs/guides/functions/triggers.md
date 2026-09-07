---
sidebar_position: 2
---

# Triggers

A trigger runs a function automatically: when nodes change, on a schedule, or
when an HTTP request arrives. Triggers are `raisin:Trigger` nodes in the
`functions` workspace, conventionally under `/triggers/`, and point at a
function with `function_path`.

```yaml
# content/functions/triggers/on-page-created/.node.yaml
node_type: raisin:Trigger
properties:
  title: On page created
  name: on-page-created
  enabled: true
  trigger_type: node_event        # node_event | schedule | http
  config:
    event_kinds: [created]
  filters:
    workspaces: [content]
    node_types: [raisin:Page]
  function_path: /lib/docs/on-page
```

A trigger can also be declared inline on the function it belongs to, as an
entry of the function node's `triggers` array with the same `name`,
`trigger_type`, `config` and `filters` keys. Both forms behave the same; the
standalone node is easier to enable, disable and inspect on its own.

## Node event triggers

`trigger_type: node_event` fires on writes in any workspace. `config.event_kinds`
lists the events to react to: `created`, `updated` or `deleted`. `filters`
narrow which nodes count:

| Filter | Meaning |
|--------|---------|
| `workspaces` | glob patterns over workspace names |
| `paths` | glob patterns over node paths, for example `/blog/**` |
| `node_types` | exact node type names |
| `property_filters` | conditions on properties, with dot paths and `$exists`, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in` |

```yaml
  filters:
    workspaces: [content]
    node_types: [raisin:Asset]
    paths: ["**"]
    property_filters:
      "file.metadata.storage_key":
        $exists: true
```

The function receives the event and the node under `flow_input`:

```json
{
  "flow_input": {
    "event": {
      "type": "Created",
      "node_id": "c837f0ae-...",
      "node_type": "raisin:Page",
      "node_path": "/pages/second"
    },
    "node": { "id": "c837f0ae-...", "path": "/pages/second", "properties": { "title": "Second" } },
    "workspace": "content"
  },
  "previous_results": {}
}
```

```javascript
export function handler(input) {
  const { event, node, workspace } = input.flow_input;
  if (event.type === 'Created') {
    raisin.nodes.update(workspace, event.node_path, {
      properties: { seen_by: 'on-page' },
    });
  }
  return { ok: true };
}
```

Writes made by the function are attributed to the trigger: the node's
`updated_by` becomes `trigger:/triggers/on-page-created`. A trigger fires once
per write on the node that received it, so in a replicated cluster it does not
fire again on the other nodes.

## Schedule triggers

`trigger_type: schedule` runs the function on a cron schedule. The server checks
schedules once a minute, so the finest resolution is one minute.

```yaml
node_type: raisin:Trigger
properties:
  title: Nightly cleanup
  name: nightly-cleanup
  enabled: true
  trigger_type: schedule
  config:
    cron_expression: "0 2 * * *"
  function_path: /lib/docs/cleanup-old-data
```

`cron_expression` takes the five-field form (`minute hour day month weekday`)
with `*` and `*/N` steps, or one of `@hourly`, `@daily`, `@weekly`, `@monthly`,
`@yearly`. The function's input describes the tick:

```json
{
  "event": {
    "type": "Scheduled",
    "trigger_name": "nightly-cleanup",
    "scheduled_time": 1788720204,
    "scheduled_time_iso": "2026-09-06T18:43:24+00:00"
  }
}
```

## HTTP triggers

`trigger_type: http` exposes the function at a URL. Every trigger is reachable
by name, and also by its `webhook_id`, a random id the server assigns when the
node is created:

```
/api/triggers/{repo}/{name}[/{suffix}]
/api/webhooks/{repo}/{webhook_id}[/{suffix}]
```

Use the `webhook_id` form for third-party webhooks: the id is unguessable and
is not indexed for search, so it acts as the credential.

```yaml
node_type: raisin:Trigger
properties:
  title: Hello over HTTP
  name: hello-http
  enabled: true
  trigger_type: http
  config:
    methods: [GET, POST]      # GET, POST, PUT, PATCH, DELETE
    default_sync: true        # wait for the result instead of queueing
  function_path: /lib/docs/greet
```

```bash
curl -X POST http://localhost:8090/api/triggers/myapp/hello-http/orders/42 \
  -H "Content-Type: application/json" -d '{"name":"Web"}'
```

The function receives the request under `http`:

```json
{
  "http": {
    "method": "POST",
    "path": "orders/42",
    "params": {},
    "query": {},
    "headers": { "content-type": "application/json", "host": "localhost:8090" },
    "body": { "name": "Web" }
  }
}
```

Query-string parameters are not currently passed through; `query` arrives
empty. A method that is not in `config.methods` is rejected with 400.

A synchronous call answers with the result:

```json
{
  "execution_id": "x3F2nImLqIBzzyA2F3DQV",
  "status": "completed",
  "result": { "greeting": "Hello, Web" },
  "job_id": "xg3-Z3mJhYGYFRLqna9qr",
  "duration_ms": 5,
  "logs": []
}
```

An asynchronous one returns `{"execution_id": ..., "status": "queued", "job_id": ...}`.
The caller can override the trigger's default per request with `?sync=true`
or `?sync=false`, or the `X-Raisin-Sync` header.

## Seeing what fired

Every triggered run appears in the function's execution list with the trigger's
name in `trigger_name`:

```bash
curl "http://localhost:8090/api/functions/myapp/on-page/executions?trigger_name=on-page-created" \
  -H "Authorization: Bearer $TOKEN"
```

See [Execution logs](./execution-logs.md).

## Next steps

- [Creating functions](./creating-functions.md)
- [Execution logs](./execution-logs.md)
