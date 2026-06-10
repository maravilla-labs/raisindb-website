---
sidebar_position: 1
---

# Workflows Overview

RaisinDB workflows orchestrate multi-step processes — function calls, AI agents, and human approvals — as a single `raisin:Flow` node. Functions, AI agents, and humans are **uniform step concepts**: a function step queues a function, an agent step calls an AI agent, and a human task pauses the flow for a person (or for an AI agent acting as the assignee, with automatic escalation back to a human).

```mermaid
flowchart LR
    subgraph Flow["raisin:Flow"]
        direction LR
        F[Function step] --> G{OR container<br/>REL rules}
        G -->|"amount >= 1000"| H[Human task]
        G -->|otherwise| S[skip]
        H --> I[Function step]
        S --> I
    end
    T[Trigger / API call] --> Flow
    H -. creates .-> X[(Inbox task)]
    X -. complete .-> H
    A[AI agent assignee] -. decides or escalates .-> X
```

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Flow** | A `raisin:Flow` node in the **functions** workspace. Its `workflow_data` property holds the definition. |
| **Step** | A `raisin:FlowStep` — a function call, AI agent call, human task, or chat session. |
| **Container** | A `raisin:FlowContainer` grouping steps: `and` (sequential), `or` (REL-routed, optionally AI-routed), `parallel` (fork/join), `ai_sequence` (agentic tool loop), `competition` (competing agents judged by a referee). |
| **Inbox** | The human-in-the-loop primitive. A `human_task` step creates a `raisin:InboxTask` in the assignee's inbox and pauses the flow; completing the task resumes it. |
| **Trigger** | A `raisin:Trigger` node that starts a flow automatically on node events. |
| **Instance** | One execution of a flow, with status, variables, and an event stream. |

## The Authoring Format

Flows are authored in the **designer format** — the same format the admin console's visual flow designer reads and writes. Three rules define it:

- Every node is `node_type: raisin:FlowStep` or `node_type: raisin:FlowContainer`.
- There are **no explicit `start`/`end` nodes** — the engine injects them.
- Execution order is the **array order** of `nodes` (and of each container's `children`). The engine lowers the tree into a flat graph, chaining each node to the next sibling.

A minimal flow with a single approval step:

```yaml
node_type: raisin:Flow
properties:
  title: Order Approval
  name: order-approval
  enabled: true
  workflow_data:
    version: 1
    error_strategy: fail_fast
    nodes:
      - id: approve
        node_type: raisin:FlowStep
        properties:
          action: Approve order {{ input.order_id }}
          step_type: human_task
          task_type: approval
          assignee: /users/manager
          options:
            - { value: approve, label: Approve, style: success }
            - { value: reject,  label: Reject,  style: danger }
```

Template expressions like `{{ input.order_id }}` resolve against the flow context — see [Data & Templates](./data-and-templates.md).

## Execution Lifecycle

A flow instance moves through these statuses:

```
pending → running → waiting ⇄ running → completed | failed | cancelled | rolled_back
```

`waiting` covers human tasks, queued functions, chat turns, sub-flows, scheduled waits, and retry backoff. Failed flows with registered [saga compensations](./error-handling.md#saga-compensation-compensation_ref) end as `rolled_back` after the compensations run.

## Running a Flow

Start a flow over HTTP or with the JavaScript SDK:

```typescript
import { RaisinHttpClient, FlowClient, InboxApi } from '@raisindb/client';

const client = new RaisinHttpClient(BASE_URL, { tenantId: 'default' });
await client.authenticate({ username, password });

const flows = FlowClient.fromHttpClient(client, BASE_URL, repo);
const { instance_id } = await flows.run('/flows/order-approval', { order_id: 'ORD-1' });
```

Observe progress via polling (`getInstanceStatus`), SSE streaming (`createEventStream`), or the **Flow Execution Monitor** in the admin console.

## In the Admin Console

- **Flows** (repository → Flows) — list, create, and open flows in the visual designer; the Run dialog starts a flow with a JSON input and live event view.
- **Inbox** (repository → Inbox) — the assignee-facing task list: approve, reject, or fill input forms; completing a task resumes the flow.
- **Flow Instances** (management → Flow Execution Monitor) — instance list with status, step timeline, variables, errors, and cancel/delete actions.

## Where to Go Next

- [Quickstart](./quickstart.md) — deploy and run a human-in-the-loop approval flow end to end
- [Flow Definition Reference](./flow-definition.md) — every step type, container type, and property
- [Data & Templates](./data-and-templates.md) — template expressions and REL conditions
- [Error Handling & Compensation](./error-handling.md) — retries, error edges, sagas
- [Human-in-the-Loop & the Inbox](./human-in-the-loop.md) — inbox tasks, agent assignees, escalation
- [AI Steps](./ai-steps.md) — agent steps and agentic tool loops
- [Triggers](./triggers.md) — start flows on node events
- [Examples](./examples.md) — complete runnable example apps
