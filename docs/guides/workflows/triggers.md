---
sidebar_position: 8
---

# Workflow Triggers

Besides starting flows explicitly (API, SDK, admin console Run dialog), flows can start automatically when nodes change. Triggers are `raisin:Trigger` nodes in the **functions** workspace that reference a flow via `function_flow`.

## Node-Event Triggers

A node-event trigger starts the referenced flow whenever a matching node event occurs — the primary way workflows are launched in production.

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
    workspaces: [default]             # glob patterns
    node_types: ["my:Article"]
    # paths: ["/content/**"]          # optional path globs
  function_flow:
    raisin:ref: /flows/publish-pipeline
    raisin:workspace: functions
```

| Property | Description |
|----------|-------------|
| `trigger_type` | `node_event` |
| `config.event_kinds` | Any of `Created`, `Updated`, `Deleted`, `Published`, `Unpublished`, `Moved`, `Renamed` |
| `filters.workspaces` | Workspace glob patterns |
| `filters.paths` | Path glob patterns (e.g. `/content/**`) |
| `filters.node_types` | Node type list (e.g. `["raisin:Page", "raisin:Asset"]`) |
| `function_flow` | Reference to the `raisin:Flow` node to start (node id or path) |
| `enabled` | Default `true` |
| `priority` | Execution priority (lower = higher priority) |

:::note
Trigger nodes live under a folder in the functions workspace (the workspace root only allows folders) — e.g. `/triggers/on-article-published`.
:::

### The Trigger Context in the Flow

When a flow is started by a trigger, the triggering node's data is the flow input, and trigger metadata (event type, node path, actor, ...) is available under the `trigger.*` namespace:

```yaml
- id: notify
  node_type: raisin:FlowStep
  properties:
    function_ref: /lib/notify-author
    arguments:
      path: "{{ trigger.node_path }}"
      event: "{{ trigger.event_type }}"
```

See [Data & Templates](./data-and-templates.md#context-namespaces).

### Legacy: `function_path`

Triggers can alternatively reference a single function via `function_path`. This is deprecated — prefer `function_flow`, which gives you the full workflow toolbox (routing, retries, compensation, human tasks) even for single-step automations.

## Scheduled Triggers

Schedule-based triggers run on a cron expression. The scheduler evaluates them periodically (every minute) and queues an execution for each match:

```yaml
node_type: raisin:Trigger
properties:
  name: daily-cleanup
  title: Daily Cleanup
  trigger_type: schedule
  enabled: true
  config:
    cron_expression: "0 2 * * *"      # 02:00 every day
  function_path: /lib/cleanup-old-data
```

Supported cron syntax (5 fields: minute, hour, day, month, day-of-week):

| Pattern | Meaning |
|---------|---------|
| `*` | Any value |
| `*/15` | Every 15 units (step values) |
| `1-5` | Range |
| `1,3,5` | List |
| `@hourly`, `@daily` / `@midnight`, `@weekly`, `@monthly`, `@yearly` / `@annually` | Presets |

:::info
Scheduled triggers currently invoke a **function** (`function_path`). To run a full workflow on a schedule, point the scheduled trigger at a small function that starts the flow via the [flow API](/docs/reference/javascript-client/flows), or have the function perform the work directly.
:::

## Starting Flows Explicitly

For completeness, the explicit start paths:

| Channel | How |
|---------|-----|
| HTTP | `POST /api/flows/{repo}/run` with `{ "flow_path": "/flows/...", "input": {...} }` |
| HTTP (test run) | `POST /api/flows/{repo}/test` with an additional `test_config` ([mocks, isolated branch](./error-handling.md#test-runs-with-mocked-functions)) |
| SDK | `flows.run(path, input)`, `flows.runAndWait(...)`, `flows.runAndCollect(...)` |
| Admin console | Repository → Flows → Run dialog (JSON input + live event view) |

## Next Steps

- [Function Triggers](/docs/guides/functions/triggers) — triggers that invoke functions directly
- [Examples](./examples.md) — complete runnable workflows
