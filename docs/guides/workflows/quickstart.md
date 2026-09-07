---
sidebar_position: 2
---

# Workflow Quickstart

Build the human-in-the-loop approval flow from the [`approval-flow` example](./examples.md#approval-flow): define a flow with an approval step, run it, watch it pause, complete the inbox task from the SDK, and stream the rest of the execution.

## Prerequisites

- A running `raisin-server` in dev mode (see [Installation](/docs/guides/installation))
- Node.js 18+ and the `@raisindb/client` package

```bash
npm install @raisindb/client
```

## 1. Define the Flow

The flow has a single human-task step. The `action` label doubles as the inbox task title, and templates resolve against the flow input:

```javascript
const workflowData = {
  version: 1,
  error_strategy: 'fail_fast',
  nodes: [
    {
      id: 'approve',
      node_type: 'raisin:FlowStep',
      properties: {
        action: 'Approve order {{ input.order_id }} ({{ input.amount }} CHF)',
        step_type: 'human_task',
        task_type: 'approval',
        assignee: '/users/admin',
        task_description: 'A new order needs your approval before fulfillment.',
        priority: 4,
        options: [
          { value: 'approve', label: 'Approve', style: 'success' },
          { value: 'reject', label: 'Reject', style: 'danger' },
        ],
      },
    },
  ],
};
```

## 2. Deploy the Flow

A flow is a node. Create a `raisin:Flow` node in the `functions` workspace with `workflow_data` set to the definition. The workspace root only accepts folders, so the flow goes under a folder such as `/flows`.

```javascript
import { RaisinHttpClient, FlowClient, InboxApi } from '@raisindb/client';

const BASE_URL = 'http://localhost:8081';
const REPO = 'workflow-demo';

const client = new RaisinHttpClient(BASE_URL, { tenantId: 'default' });
await client.authenticate({ username: 'admin', password: process.env.RAISIN_PASSWORD });

// Create the /flows folder, then the flow node
await fetch(`${BASE_URL}/api/repository/${REPO}/main/head/functions/`, {
  method: 'POST',
  headers: authHeaders(client),
  body: JSON.stringify({
    node: { name: 'flows', node_type: 'raisin:Folder', properties: {} },
  }),
});

await fetch(`${BASE_URL}/api/repository/${REPO}/main/head/functions/flows`, {
  method: 'POST',
  headers: authHeaders(client),
  body: JSON.stringify({
    node: {
      name: 'order-approval',
      node_type: 'raisin:Flow',
      properties: {
        name: 'order-approval',
        title: 'Order Approval',
        enabled: true,
        workflow_data: workflowData,
      },
    },
  }),
});

function authHeaders(client) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${client.getAuthManager().getAccessToken()}`,
  };
}
```

:::tip
Flows can also ship as `.node.yaml` content files in [packages](/docs/guides/packages/creating-packages), or be created in the admin console's flow designer. Run `raisindb flow doctor <file-or-package>` to check a definition before deploying it.
:::

## 3. Run It

```javascript
const flows = FlowClient.fromHttpClient(client, BASE_URL, REPO);
const inbox = new InboxApi(BASE_URL, REPO, client.getAuthManager());

const { instance_id } = await flows.run('/flows/order-approval', {
  order_id: 'ORD-1042',
  amount: 249,
});
console.log('Flow started:', instance_id);
```

The run call returns as soon as the instance is queued. The flow runs until the approval step and pauses. Poll until it reaches `waiting`:

```javascript
let status;
do {
  await new Promise((r) => setTimeout(r, 500));
  status = await flows.getInstanceStatus(instance_id);
} while (!['waiting', 'completed', 'failed'].includes(status.status));
// status.status === 'waiting': the flow is paused on the human task
```

## 4. Find the Task in the Inbox

The human-task step created a `raisin:InboxTask` node in the assignee's inbox. Listing without an `assignee` returns the caller's own inbox; an admin can list another principal's inbox by passing `assignee`:

```javascript
const { tasks } = await inbox.listTasks({ status: 'pending', assignee: '/users/admin' });
const task = tasks.find((t) => t.flow_instance_id === instance_id);
console.log(`Inbox task: "${task.title}" [${task.task_type}, P${task.priority}]`);
// Inbox task: "Approve order ORD-1042 (249 CHF)" [approval, P4]
```

A task looks like this on the wire:

```json
{
  "id": "IXjXHfYd2pE15yhZz9lzE",
  "path": "/users/admin/inbox/task-approve-4dc88efa448c-it0",
  "task_type": "approval",
  "title": "Approve order ORD-1042 (249 CHF)",
  "description": "A new order needs your approval before fulfillment.",
  "assignee": "/users/admin",
  "status": "pending",
  "priority": 4,
  "options": [
    { "value": "approve", "label": "Approve", "style": "success" },
    { "value": "reject", "label": "Reject", "style": "danger" }
  ],
  "flow_instance_id": "e878c91d-eacd-46b4-9ae1-a5c02cdb5c4f",
  "step_id": "approve",
  "created_at": "2026-09-06T18:37:01.369067+00:00"
}
```

## 5. Complete the Task and Stream the Rest

Subscribe to the event stream before completing the task so no events are missed, then approve:

```javascript
const stream = await flows.createEventStream(instance_id);

const result = await inbox.completeTask(task.id, {
  action: 'approve',
  comment: 'Approved from the SDK example',
});
// result.flow.instance_id and result.flow.job_id identify the resumed run

for await (const event of stream.events) {
  switch (event.type) {
    case 'step_completed':
      console.log(`step ${event.node_id} done (${event.duration_ms}ms)`);
      break;
    case 'flow_completed': {
      const final = await flows.getInstanceStatus(instance_id);
      console.log('Decision:', final.variables?.__human_response?.action);
      stream.close();
      break;
    }
    case 'flow_failed':
      stream.close();
      throw new Error(`Flow failed: ${event.error}`);
  }
}
```

Completing the task resumes the flow. The submitted response, plus `completed_by` (the caller's user id; the dev-mode superadmin shows as `system`) and `task_path`, becomes the step's output (`steps.approve.*`) and the `__human_response` variable:

```json
{
  "action": "approve",
  "comment": "Approved from the SDK example",
  "completed_by": "system",
  "task_path": "/users/admin/inbox/task-approve-4dc88efa448c-it0"
}
```

## Full Script

The complete, runnable version of this quickstart (with idempotent setup and retries) lives in the RaisinDB repository at `examples/workflows/approval-flow/run.mjs`:

```bash
cd examples/workflows/approval-flow
npm install && npm start
```

## Next Steps

- [Flow Definition Reference](./flow-definition.md): add function steps, routing, and containers
- [Human-in-the-Loop and the Inbox](./human-in-the-loop.md): task types, agent assignees, escalation
- [Examples](./examples.md): a multi-step ticketing workflow with compensation and routing
