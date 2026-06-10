---
sidebar_position: 2
---

# Workflow Quickstart

Build the complete human-in-the-loop approval flow from the [`approval-flow` example](./examples.md#approval-flow): define a flow with an approval step, run it, watch it pause, complete the inbox task from the SDK, and stream the rest of the execution.

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

A flow is just a node: create a `raisin:Flow` node in the **functions** workspace with `workflow_data` set to the definition.

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
Flows can also be shipped as `.node.yaml` content files in [packages](/docs/guides/packages/creating-packages), or created visually in the admin console's flow designer.
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

The flow runs until the approval step and pauses. Poll until it reaches `waiting`:

```javascript
let status;
do {
  await new Promise((r) => setTimeout(r, 500));
  status = await flows.getInstanceStatus(instance_id);
} while (!['waiting', 'completed', 'failed'].includes(status.status));
// status.status === 'waiting' — the flow is paused on the human task
```

## 4. Find the Task in the Inbox

The human-task step created a `raisin:InboxTask` node in the assignee's inbox:

```javascript
const { tasks } = await inbox.listTasks({ status: 'pending', assignee: '/users/admin' });
const task = tasks.find((t) => t.flow_instance_id === instance_id);
console.log(`Inbox task: "${task.title}" [${task.task_type}, P${task.priority}]`);
// Inbox task: "Approve order ORD-1042 (249 CHF)" [approval, P4]
```

## 5. Complete the Task and Stream the Rest

Subscribe to the event stream **before** completing the task so no events are missed, then approve:

```javascript
const stream = await flows.createEventStream(instance_id);

await inbox.completeTask(task.id, {
  action: 'approve',
  comment: 'Approved from the SDK example',
});

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

Completing the task resumes the flow. The submitted response is available to downstream steps as the step's output (`steps.approve.*`) and as the `__human_response` variable.

## Full Script

The complete, runnable version of this quickstart (with idempotent setup and retries) lives in the RaisinDB repository at `examples/workflows/approval-flow/run.mjs`:

```bash
cd examples/workflows/approval-flow
npm install && npm start
```

## Next Steps

- [Flow Definition Reference](./flow-definition.md) — add function steps, routing, and containers
- [Human-in-the-Loop & the Inbox](./human-in-the-loop.md) — task types, agent assignees, escalation
- [Examples](./examples.md) — a multi-step ticketing workflow with compensation and routing
