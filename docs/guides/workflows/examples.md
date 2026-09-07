---
sidebar_position: 9
---

# Workflow Examples

Six complete, runnable example apps ship in the RaisinDB repository under `examples/workflows/`. Each is a self-contained Node.js script against a dev-mode server:

```bash
cd examples/workflows/<example>
npm install && npm start
```

| Example | Demonstrates |
|---------|--------------|
| `approval-flow` | Human task, inbox API, SSE event streaming |
| `ai-approval-flow` | Single-shot agent step, agent as assignee, escalation |
| `event-ticketing` | Functions as nodes, saga compensation, REL routing, approval gate |
| `ecommerce-order` | Two compensations with LIFO rollback, a fraud gate with human review, a cancel path |
| `employee-onboarding` | Compensation, an `or` gate, a mandatory approval, a step consuming both an earlier output and the human decision |
| `picasso-order` | Three chained human tasks in one flow (two approvals and one `input` task with `input_schema`), a decline gate |

Environment overrides for every script: `RAISIN_URL`, `RAISIN_REPO`, `RAISIN_USER`, `RAISIN_PASSWORD`.

## approval-flow

The flow behind the [Quickstart](./quickstart.md): a single approval step assigned to `/users/admin`.

1. Deploy a `raisin:Flow` node with one `human_task` step.
2. `flows.run()`: the flow pauses on the approval (`status: waiting`).
3. `inbox.listTasks()` finds the task; `inbox.completeTask()` approves it.
4. The flow resumes. The script streams `step_completed` and `flow_completed` events over SSE and reads the decision from `variables.__human_response`.

## ai-approval-flow

Agent-in-the-loop refund approvals, with both AI roles in one flow:

1. **Agent step:** `summarize` makes a one-shot AI call with a templated prompt and exposes `steps.summarize.response`.
2. **Agent as assignee:** the `approve` human task is assigned to `/agents/refund-approver` with `min_confidence: 0.75` and `escalation_assignee: /users/admin`. A confident structured decision (`{ decision, reasoning, confidence }`) completes the task automatically. On low confidence or an AI error the task escalates to the person, who completes it through the same inbox API.

The script handles both outcomes: if the flow emits `flow_waiting`, the task escalated, and the script prints `escalated_from` and `escalation_reason` and completes it as the human. Without a configured AI provider the example still finishes, through the escalation path. Set `RAISIN_AGENT_PROVIDER` and `RAISIN_AGENT_MODEL` to exercise the agent decision.

See [Human-in-the-Loop: AI agent as assignee](./human-in-the-loop.md#ai-agent-as-assignee).

## event-ticketing

A ticket-ordering workflow combining the main engine features:

```mermaid
flowchart LR
    A["reserve<br/>(function + compensation)"] --> B{"approval-gate<br/>(or container)"}
    B -->|"total > 500 CHF<br/>or tier == vip"| C["approve<br/>(human task)"]
    B -->|no rule matches| D["issue<br/>(function)"]
    C --> D
```

- **JS functions deployed as nodes:** `raisin:Function` nodes with the source in a child `index.js` asset, under `/lib/ticketing/`: `reserve-seats`, `issue-tickets`, `cancel-reservation`.
- **Saga compensation:** `reserve` registers `cancel-reservation` with a `compensation_input_mapping` of `{ reservation_id: "${output.reservation_id}" }`. If a later step fails unrecoverably, the reservation is released automatically.
- **REL routing:** the `approval-gate` `or` container routes orders over 500 CHF or any VIP order to a human approval. When no rule matches, the container is skipped.
- **Cross-step data flow:** `issue` consumes `${steps.reserve.reservation_id}`.

The script runs live scenarios and asserts the results:

- **Standard order, 100 CHF:** completes without pausing; the approval step never runs.
- **VIP order, 600 CHF:** pauses on approval, the task is completed through the inbox API, the flow resumes and issues 4 tickets referencing the reservation.
- **Outage:** `issue-tickets` fails permanently and the flow rolls back, cancelling the reservation with the mapped input.

Key flow definition excerpt:

```javascript
const workflowData = {
  version: 1,
  error_strategy: 'fail_fast',
  nodes: [
    {
      id: 'reserve',
      node_type: 'raisin:FlowStep',
      properties: {
        action: 'Reserve {{ input.quantity }}x {{ input.tier }} for {{ input.event_id }}',
        function_ref: '/lib/ticketing/reserve-seats',
        arguments: {
          event_id: '{{ input.event_id }}',
          quantity: '${input.quantity}', // whole-string expression keeps the number type
          tier: '{{ input.tier }}',
        },
        compensation_ref: '/lib/ticketing/cancel-reservation',
        compensation_input_mapping: {
          reservation_id: '${output.reservation_id}',
        },
        timeout_ms: 30000,
      },
    },
    {
      id: 'approval-gate',
      node_type: 'raisin:FlowContainer',
      container_type: 'or',
      rules: [
        { condition: 'steps.reserve.total_price > 500', next_step: 'approve' },
        { condition: 'input.tier == "vip"', next_step: 'approve' },
      ],
      children: [
        {
          id: 'approve',
          node_type: 'raisin:FlowStep',
          properties: {
            action:
              'Approve {{ input.quantity }}x {{ input.tier }} ticket order ({{ steps.reserve.total_price }} CHF)',
            step_type: 'human_task',
            task_type: 'approval',
            assignee: '/users/admin',
            priority: 4,
            options: [
              { value: 'approve', label: 'Approve', style: 'success' },
              { value: 'reject', label: 'Reject', style: 'danger' },
            ],
          },
        },
      ],
    },
    {
      id: 'issue',
      node_type: 'raisin:FlowStep',
      properties: {
        action: 'Issue tickets for {{ steps.reserve.reservation_id }}',
        function_ref: '/lib/ticketing/issue-tickets',
        arguments: {
          reservation_id: '${steps.reserve.reservation_id}',
          quantity: '${input.quantity}',
        },
        timeout_ms: 30000,
      },
    },
  ],
};
```

## Streaming Execution Events

All examples observe flows through the SSE event stream:

```typescript
const stream = await flows.createEventStream(instance_id);
for await (const event of stream.events) {
  // ...
}
stream.close();
```

Each SSE message is an `event: flow-event` line with a JSON `data` payload. Event types (snake_case, tagged with `type`, all carrying a `timestamp`):

| Event | Payload highlights |
|-------|--------------------|
| `step_started` | `node_id`, `step_name`, `step_type` |
| `step_completed` | `node_id`, `output`, `duration_ms`, and `usage` (`input_tokens`, `output_tokens`) when the step made a model call |
| `step_failed` | `node_id`, `error`, `duration_ms` |
| `flow_waiting` | `node_id`, `wait_type`, `reason` (for example `human_task`, `function_call`, `scheduled`) |
| `flow_resumed` | `node_id`, `wait_duration_ms` |
| `flow_completed` | `output`, `total_duration_ms` |
| `flow_failed` | `error`, `failed_at_node`, `total_duration_ms` |
| `text_chunk`, `thought_chunk`, `tool_call_started`, `tool_call_completed`, `conversation_created`, `message_saved`, `log` | AI streaming and logging events |

A real stream, captured while completing the quickstart's approval task:

```
event: flow-event
data: {"type":"step_started","node_id":"approve","step_name":null,"step_type":"human_task","timestamp":"2026-09-06T18:39:26.941949+00:00"}

event: flow-event
data: {"type":"step_completed","node_id":"approve","output":{"action":"reject","comment":"too small","task_path":"/users/admin/inbox/task-approve-04674020726f-it0","completed_by":"system"},"duration_ms":0,"timestamp":"2026-09-06T18:39:26.942049+00:00"}

event: flow-event
data: {"type":"flow_completed","output":{"action":"reject","comment":"too small","task_path":"/users/admin/inbox/task-approve-04674020726f-it0","completed_by":"system"},"total_duration_ms":0,"timestamp":"2026-09-06T18:39:26.942151+00:00"}
```

## HTTP API Summary

| Endpoint | Purpose |
|----------|---------|
| `POST /api/flows/{repo}/run` | Start a flow: `{ "flow_path": "...", "input": {...} }` returns `{ instance_id, job_id, status: "queued" }` |
| `POST /api/flows/{repo}/test` | Test run with `test_config` (mocks, isolated branch, auto-discard) |
| `GET /api/flows/{repo}/instances/{id}` | Instance status: `{ id, status, variables, flow_path, started_at, error? }` |
| `POST /api/flows/{repo}/instances/{id}/resume` | Resume a waiting instance with `{ "resume_data": {...} }`. A human-task wait must be completed through the inbox endpoint unless the caller is an admin |
| `POST /api/flows/{repo}/instances/{id}/cancel` | Cancel a pending, running, or waiting instance |
| `DELETE /api/flows/{repo}/instances/{id}` | Delete a terminated instance (returns 204; an active instance is rejected) |
| `GET /api/flows/{repo}/instances/{id}/events` | SSE stream of execution events |
| `GET /api/inbox/{repo}` | List the caller's inbox tasks (`?status=pending&assignee=...`) as `{ assignee, count, tasks }` |
| `GET /api/inbox/{repo}/tasks/{task_id}` | Get one task by id or path |
| `POST /api/inbox/{repo}/tasks/{task_id}/complete` | Complete a task with `{ "response": {...} }`; resumes the owning flow |

## SDK Quick Reference

```javascript
import { RaisinHttpClient, FlowClient, InboxApi } from '@raisindb/client';

const client = new RaisinHttpClient(BASE_URL, { tenantId: 'default' });
await client.authenticate({ username, password });

const flows = FlowClient.fromHttpClient(client, BASE_URL, repo);
const inbox = new InboxApi(BASE_URL, repo, client.getAuthManager());

// Start a flow
const { instance_id } = await flows.run('/flows/order-approval', { order_id: 'ORD-1' });

// Status and events
const status = await flows.getInstanceStatus(instance_id);
const stream = await flows.createEventStream(instance_id);   // { events, close() }
for await (const event of stream.events) { /* event types above */ }

// Convenience runners
await flows.runAndWait('/flows/x', input);     // run, then stream until the terminal event
await flows.runAndCollect('/flows/x', input);  // run, then collect all events

// Resume a waiting step, or complete a human task
await flows.resume(instance_id, resumeData);
await flows.respondToHumanTask(instance_id, taskId, { action: 'approve' });

// Inbox
const { tasks } = await inbox.listTasks({ status: 'pending' });
await inbox.completeTask(tasks[0].id, { action: 'approve', comment: 'LGTM' });
```

On a `Database` obtained from `RaisinClient.database()`, the same clients are available as `db.flow` and `db.inbox`. Full method documentation: [JavaScript Client: Flows](/docs/reference/javascript-client/flows).
