---
sidebar_position: 8
---

# Workflow Triggers

Besides starting flows explicitly (API, SDK, admin console Run dialog), flows can start automatically when nodes change. Triggers are `raisin:Trigger` nodes in the `functions` workspace that reference a flow through `function_flow`.

## Node-Event Triggers

A node-event trigger starts the referenced flow whenever a matching node event occurs.

```yaml
node_type: raisin:Trigger
properties:
  name: on-article-published
  title: On Article Published
  trigger_type: node_event
  enabled: true
  config:
    event_kinds: [Updated]            # which events fire the trigger
  filters:
    workspaces: [content]             # glob patterns
    node_types: ["my:Article"]
    # paths: ["/articles/**"]         # optional path globs
    # property_filters:               # optional conditions on the node's properties
    #   status: published
    #   "seo.score": { $gte: 80 }
  function_flow:
    raisin:ref: /flows/publish-pipeline
    raisin:workspace: functions
```

| Property | Description |
|----------|-------------|
| `trigger_type` | `node_event` |
| `config.event_kinds` | Any of `Created`, `Updated`, `Deleted`, `Published`, `Unpublished`, `Moved`, `Renamed` |
| `filters.workspaces` | Workspace glob patterns |
| `filters.paths` | Path glob patterns. `*` matches within one segment, `**` matches across segments |
| `filters.node_types` | Node type list, for example `["raisin:Page", "raisin:Asset"]` |
| `filters.property_filters` | Object of property path (dot notation for nested values) to either a literal value or an operator object: `$exists`, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in` |
| `function_flow` | Reference to the `raisin:Flow` node to start. `raisin:ref` may be the node's path or id; the server resolves a path to the id on write |
| `enabled` | Default `true` |
| `priority` | Execution priority (lower runs first) |
| `max_retries` | Retry budget for the trigger's execution job |

Trigger nodes live under a folder in the functions workspace, since the workspace root only allows folders. New repositories come with a `/triggers` folder.

### The Flow Input

When a trigger starts a flow, the flow input describes the event and carries the node:

```json
{
  "event": {
    "type": "Created",
    "node_id": "JyR6mKiKBUV5Om7lhGZDC",
    "node_type": "raisin:Page",
    "node_path": "/hello"
  },
  "node": {
    "id": "JyR6mKiKBUV5Om7lhGZDC",
    "path": "/hello",
    "name": "hello",
    "node_type": "raisin:Page",
    "workspace": "blog",
    "properties": { "title": "Hello", "featured": true, "tags": ["a", "b"] },
    "created_by": "system",
    "created_at": "2026-09-06T18:40:18.849950+00:00"
  },
  "workspace": "blog"
}
```

So a step reads the changed node's properties as `input.node.properties.*`. Trigger metadata is also available under `trigger.*` (`event_type` in lower case, `node_id`, `node_type`, `node_path`, `workspace`, `tenant_id`, `repo_id`, `branch`):

```yaml
- id: notify
  node_type: raisin:FlowStep
  properties:
    action: Notify the author
    function_ref: /lib/notify-author
    arguments:
      path: "{{ trigger.node_path }}"
      event: "{{ trigger.event_type }}"
      title: "{{ input.node.properties.title }}"
```

See [Data and Templates](./data-and-templates.md#context-namespaces).

### Triggers That Call a Function

A trigger can reference a single function through `function_path` instead of a flow. The function receives the event directly. When a trigger has both, `function_flow` wins. Use `function_flow` when you want routing, retries, compensation, or human tasks, even for single-step automations.

## Scheduled Triggers

Schedule-based triggers run on a cron expression. Every minute the server evaluates the enabled schedule triggers of every repository and queues an execution for each match:

```yaml
node_type: raisin:Trigger
properties:
  name: daily-cleanup
  title: Daily Cleanup
  trigger_type: schedule
  enabled: true
  config:
    cron_expression: "0 2 * * *"      # 02:00 UTC every day
  function_path: /lib/cleanup-old-data
```

Supported cron syntax (5 fields: minute, hour, day, month, day-of-week, evaluated in UTC):

| Pattern | Meaning |
|---------|---------|
| `*` | Any value |
| `*/15` | Every 15 units (step values) |
| `1-5` | Range |
| `1,3,5` | List |
| `@hourly`, `@daily` / `@midnight`, `@weekly` (Monday), `@monthly`, `@yearly` / `@annually` | Presets |

Scheduled triggers invoke a function (`function_path`). To run a workflow on a schedule, point the trigger at a small function that starts the flow through the [flow API](/docs/reference/javascript-client/flows), or have the function do the work itself.

## Starting Flows Explicitly

| Channel | How |
|---------|-----|
| HTTP | `POST /api/flows/{repo}/run` with `{ "flow_path": "/flows/...", "input": {...} }` |
| HTTP (test run) | `POST /api/flows/{repo}/test` with an additional `test_config` ([mocks, isolated branch](./error-handling.md#test-runs-with-mocked-functions)) |
| SDK | `flows.run(path, input)`, `flows.runAndWait(...)`, `flows.runAndCollect(...)` |
| Admin console | Repository sidebar, Flows, Run dialog (JSON input and live event view) |

For an API start, `trigger.event_type` is `manual` and the flow input is exactly the `input` you sent.

## Next Steps

- [Function Triggers](/docs/guides/functions/triggers): triggers that invoke functions directly, including HTTP triggers
- [Examples](./examples.md): complete runnable workflows
