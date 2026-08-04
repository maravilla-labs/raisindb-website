---
sidebar_position: 6
title: Agent Plans & Custom Tools
description: Give agents custom tools, let them propose multi-step plans, and build plan-approval UIs with the JavaScript SDK
---

# Agent Plans & Custom Tools

RaisinDB agents can do more than answer: give them **custom tools** and they
act on your data; enable **task creation** and they decompose work into a
persisted plan with tasks, optionally gated behind human approval.

The SDK is the product here: RaisinDB persists the plan, streams the state
changes, and exposes one deterministic projection — **you build the chat UI**
on top of it. This guide is the contract: how to define tools, how the four
execution modes behave, what the plan nodes look like, and the exact SDK
recipe for an approval UI.

## Custom tools

A tool is a plain `raisin:Function` in the `functions` workspace. Its
`description` and `input_schema` properties **are** the LLM tool definition —
write them for the model, not for humans:

```yaml
# functions workspace, e.g. /lib/myapp/list-shifts
node_type: raisin:Function
properties:
  description: >
    List all shifts on the board with their title, day, time and current
    assignee. Use this before answering any question about shifts.
  input_schema:
    type: object
    properties:
      day:
        type: string
        description: Optional ISO date to filter by (YYYY-MM-DD)
    required: []
```

```javascript
// index.js — the handler the agent invokes
async function handler(input) {
  const { day, __raisin_context } = input;

  // __raisin_context is injected into every agent tool call:
  // { agent_name, conversation_path, sender_id, workspace, msg_path, ... }
  // Use it to know who is talking and from which conversation thread.

  const rows = await raisin.sql.query(
    `SELECT path, properties FROM 'default'
     WHERE node_type = 'myapp:Shift'
       ${day ? "AND properties->>'day'::String = $1" : ''}
     ORDER BY created_at ASC`,
    day ? [day] : [],
  );

  if (rows.length === 0) {
    // Return errors AS DATA, don't throw: the model reads the message and
    // self-corrects in the same turn instead of failing the whole call.
    return { error: 'No shifts found. The board may be empty for that day.' };
  }

  return { shifts: rows.map((r) => r.properties) };
}
```

Wire it into the agent:

```yaml
node_type: raisin:AIAgent
properties:
  system_prompt: |
    ...
  provider: groq
  model: llama-3.3-70b-versatile
  tools:
    - /lib/myapp/list-shifts
```

### Tools from other MCP servers

An agent's `tools:` array is not limited to functions in this repository. Register a connection to an external MCP server and its tools become ordinary `raisin:Function` nodes you list the same way:

```yaml
  tools:
    - /lib/myapp/list-shifts        # your function
    - /mcp/linear/search-issues     # a Linear tool
```

The model sees one flat list. See [Connecting to External Servers](../mcp/connecting-to-servers.md).

### Function-runtime traps

The function runtime is **not** the client SDK — three things bite everyone
once:

- `raisin.sql.query(...)` returns the **row array directly**. The client's
  `executeSql` returns `{ rows }` — don't expect that shape inside a
  function. Use `raisin.sql.execute` for DML.
- Every agent tool call receives the injected `__raisin_context` argument.
  Destructure it out of `input` so it doesn't leak into your own validation.
- Throwing makes the whole tool call fail; returning `{ error: '...' }` lets
  the model recover gracefully.

## Enabling plans

Add the builtin planning tools and switch on task creation:

```yaml
node_type: raisin:AIAgent
properties:
  # ...
  task_creation_enabled: true
  execution_mode: approve_then_auto   # automatic | approve_then_auto | step_by_step | manual
  tools:
    - /lib/raisin/ai/create-plan
    - /lib/raisin/ai/add-task
    - /lib/raisin/ai/update-task
    - /lib/raisin/ai/get-plan-status
    - /lib/myapp/list-shifts          # your domain tools
```

`task_creation_enabled` is the gate: when it is `false` (or absent), every
tool with `category: planning` is filtered out of the model's tool list and
the planning system-prompt addition is skipped — the agent answers directly
and **no plan nodes are ever created**, even if the tools are listed.

### The four execution modes

| Mode | Approval gate | Execution | Use when |
|------|---------------|-----------|----------|
| `automatic` | none | all tasks run immediately after plan creation | trusted, low-risk automation; background jobs |
| `approve_then_auto` | plan waits for `approvePlan()` | after approval all tasks run to completion | the default for user-facing agents: one human decision, then hands-off |
| `step_by_step` | plan waits for `approvePlan()` | exactly **one task per continue signal**; the agent pauses after each task | high-stakes operations you want to watch task by task |
| `manual` | plan waits for `approvePlan()` | nothing runs automatically — execution needs explicit user instructions | plan-as-a-document workflows; you drive every step in chat |

Rejection works the same in all gated modes: `rejectPlan(planPath, feedback?)`
cancels the plan and the agent proposes a revision based on your feedback.

## What gets persisted

Plans are real nodes, created under the assistant message that proposed them
(in the agent's conversation in the `ai` workspace):

```
{conversation}/msg-.../
  plan-1718012345678          raisin:AIPlan
    ├─ title, description
    ├─ status: pending_approval | in_progress | completed | cancelled
    ├─ estimated_steps, completed_steps
    ├─ task-1                 raisin:AITask
    │    ├─ title, description, priority
    │    └─ status: pending | in_progress | completed | failed | cancelled
    └─ task-2                 raisin:AITask
```

In parallel, the agent delivers **message cards** into the conversation:
`message_type: 'ai_plan'` (the proposal — title, tasks, `plan_path`,
`requires_approval`) and `message_type: 'ai_task_update'` (each status
change). These cards are what the SDK projects plan state from, so a chat UI
needs no extra queries against the plan nodes.

## Building the approval UI (the SDK recipe)

`ConversationStore` exposes everything as one snapshot field: `plans`, a
deterministic projection rebuilt from the persisted `ai_plan` /
`ai_task_update` cards on every change — it survives reloads and needs no
extra wiring.

```typescript
interface PlanProjection {
  planPath?: string;          // the real raisin:AIPlan node path
  title: string;
  status: string;             // pending_approval | in_progress | completed | cancelled
  requiresApproval: boolean;  // true => render Approve / Reject
  tasks: { taskId?: string; title: string; status: string }[];
}
```

The full loop — paste this shape into your own chat UI:

```typescript
import { RaisinClient, ConversationStore } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8081/ws/myrepo');
await client.loginWithEmail(email, password, 'myrepo');
const db = client.database('myrepo');

const store = new ConversationStore({
  database: db,
  createOptions: { participant: '/agents/shift-planner' },
});

store.subscribe((s) => {
  renderMessages(s.messages, s.streamingText);

  // 1. Render plan cards from the projection
  for (const plan of s.plans) {
    renderPlanCard(plan); // title + tasks[] with per-task status

    // 2. Proposal: show Approve / Reject while pending
    if (plan.requiresApproval && plan.status === 'pending_approval') {
      onApproveClick(() => store.approvePlan(plan.planPath!));
      onRejectClick((feedback) => store.rejectPlan(plan.planPath!, feedback));
    }
  }

  // 3. Waiting states: the turn pauses instead of finishing
  if (s.isWaiting) {
    // reason 'awaiting_plan_approval' arrives as a `waiting` chat event —
    // the agent is parked until approvePlan/rejectPlan is called.
  }

  // 4. step_by_step: the turn ends with finish_reason 'awaiting_step_continue'.
  //    Any plain user message resumes the next task:
  const last = s.messages.at(-1);
  if (last?.finishReason === 'awaiting_step_continue') {
    showContinueButton(() => store.sendMessage('continue'));
  }
});

await store.sendMessage('Plan next week and assign the open shifts.');
```

Notes on the lifecycle:

- **After `approvePlan()`** in `approve_then_auto` / `step_by_step`, the
  backend creates a continuation turn automatically — keep your stream
  subscription open and the task statuses progress live through the
  projection. In `manual` mode approval flips the status and then waits for
  your explicit instructions in chat.
- **After `rejectPlan(path, feedback)`** the plan becomes `cancelled` and the
  agent answers with a revised proposal (a new `ai_plan` card appears).
- Task status updates are persisted messages, so a `loadMessages()` (or the
  store's own refresh) is always enough to resync — no bespoke endpoints.

The framework adapters expose the same snapshot: `useConversation` from
`@raisindb/client/react` and `@raisindb/client/vue`, plus the Svelte stores
from `@raisindb/client/svelte`.

## Reference implementation

The admin console's agent **Test Chat** (Functions IDE → open an agent →
"Test Chat") is a reference-quality plan client built on exactly this
contract: plan proposal cards with Approve/Reject, live task progression
during execution, and a Continue affordance for `step_by_step` pauses. When
in doubt about UI behavior, mirror what it does.

For an end-to-end scripted version of all four modes (including the SDK
assertions), see `examples/shiftboard/plan-modes-test.mjs` in the RaisinDB
repository.

## See also

- [Chat & Conversations (JS client reference)](/docs/reference/javascript-client/chat) —
  `ConversationStore`, `approvePlan` / `rejectPlan`, event types
- [Function-Based Tool Use](/docs/guides/ai/function-based-tool-use) — the
  full `raisin.*` runtime API available inside tools
- [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration)
