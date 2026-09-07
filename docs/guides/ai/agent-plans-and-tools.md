---
sidebar_position: 6
title: Agent Plans & Custom Tools
description: Give agents custom tools, let them propose multi-step plans, and build plan-approval UIs with the JavaScript SDK
---

# Agent Plans & Custom Tools

An agent is a `raisin:AIAgent` node. Give it tools and it can act on your data;
switch on task creation and it decomposes work into a persisted plan of tasks,
optionally gated behind a human approval.

RaisinDB persists the plan, streams state changes to the chat, and the SDK
projects the plan state for you. This guide covers how to define tools, how the
four execution modes behave, what gets persisted, and the SDK recipe for an
approval UI.

## Custom tools

A tool is a `raisin:Function` node in the `functions` workspace. Its
`description` and `input_schema` properties become the tool definition the
model sees (`{ name, description, parameters }`), and its node name becomes the
tool name. Write the description for the model:

```yaml
# functions workspace, /lib/myapp/list-shifts/.node.yaml
node_type: raisin:Function
properties:
  name: list-shifts
  title: List Shifts
  description: >
    List all shifts on the board with their title, day, time and current
    assignee. Use this before answering any question about shifts.
  enabled: true
  language: javascript
  execution_mode: async
  entry_file: index.js:handler
  input_schema:
    type: object
    properties:
      day:
        type: string
        description: Optional ISO date to filter by (YYYY-MM-DD)
    required: []
```

```javascript
// index.js
async function handler(input) {
  const { day, __raisin_context } = input;

  // __raisin_context is added to every agent tool call. Keys:
  // workspace, chat_path, msg_path, conversation_path, agent_name, sender_id,
  // execution_mode, orchestration_mode, orchestration_round.

  const rows = raisin.sql.query(
    `SELECT path, properties FROM 'staffing'
      WHERE node_type = 'myapp:Shift'
        ${day ? "AND properties->>'day'::String = $1" : ''}
      ORDER BY created_at ASC`,
    day ? [day] : [],
  );
  if (rows.error) return { error: rows.error };

  if (rows.length === 0) {
    // Return errors as data. The model reads the message and can try
    // something else in the same turn; a thrown error fails the tool call.
    return { error: 'No shifts found. The board may be empty for that day.' };
  }

  return { shifts: rows.map((r) => r.properties) };
}
```

Wire it into the agent:

```yaml
# functions workspace, /agents/shift-planner/.node.yaml
node_type: raisin:AIAgent
properties:
  title: Shift Planner
  system_prompt: |
    ...
  provider: groq                      # a provider slug from the tenant's AI configuration
  model: llama-3.3-70b-versatile
  temperature: 0.2
  max_tokens: 1024
  execution_mode: automatic
  tools:
    - /lib/myapp/list-shifts
```

`provider` is a slug from the tenant's
[provider list](./ai-provider-configuration.md), not a provider kind. Other
agent properties: `thinking_enabled` (default true), `rules` (a list of
strings appended to the prompt), `execution_context` (`user`, `agent` or
`system`, with `roles` and `groups` for the `agent` case), `max_history_messages`,
and the compaction settings `auto_compact`, `compact_threshold_messages`,
`compact_keep_messages` and `max_conversation_tokens`.

Tools proxied from an external MCP server are `raisin:Function` nodes as well
and are listed the same way. See
[Connecting to External Servers](../mcp/connecting-to-servers.md).

### The function runtime is not the client SDK

Three things to know when writing a tool:

- `raisin.sql.query(sql, params)` is synchronous and returns the row array. A
  failed query does not throw; it returns `{ error, rows: [] }`, so check
  `error`. `raisin.sql.execute` returns the affected row count, or `-1` on
  failure.
- Every agent tool call carries `__raisin_context` in its input. Destructure it
  out before validating your own arguments.
- Throwing fails the whole tool call. Returning `{ error: '...' }` lets the model
  recover.

## Enabling plans

Add the built-in planning tools and switch on task creation:

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

The four planning tools ship with the built-in `ai-tools` package and carry
`category: planning`. `task_creation_enabled` is the gate: when it is `false`
(the default), every tool in that category is removed from the model's tool
list and the planning instructions are left out of the system prompt, so the
agent answers directly and no plan nodes are created even if the tools are
listed.

### The four execution modes

| Mode | Approval gate | Execution | Use when |
|------|---------------|-----------|----------|
| `automatic` | none | tasks run immediately after the plan is created | trusted, low-risk automation |
| `approve_then_auto` | plan waits for `approvePlan()` | after approval all tasks run to completion | user-facing agents: one human decision, then hands-off |
| `step_by_step` | plan waits for `approvePlan()` | one task per continue signal; the agent pauses after each task | operations you want to watch task by task |
| `manual` | plan waits for `approvePlan()` | nothing runs on its own; you drive each step in chat | plan-as-a-document workflows |

`rejectPlan(planPath, feedback?)` works the same in all gated modes: the plan is
cancelled and the agent proposes a revision based on the feedback.

## What gets persisted

Plans are nodes in the `ai` workspace, created under the assistant message
that proposed them:

```text
{conversation}/msg-.../
  plan-1718012345678          raisin:AIPlan
    title, description, reasoning
    status: draft | pending_approval | in_progress | completed | cancelled
    estimated_steps, completed_steps
    task-1                    raisin:AITask
      title, description
      status: pending | in_progress | completed | cancelled
      priority: low | normal | high | urgent
    task-2                    raisin:AITask
```

In parallel the agent writes message cards into the conversation, as
`raisin:Message` nodes with a `message_type`:

- `ai_plan`: the proposal. Its `data` holds `plan_id`, `plan_path`, `title`,
  `description`, `tasks`, `status` and `requires_approval`.
- `ai_task_update`: each status change. Its `data` holds `task_id`, `title`,
  `status`, `plan_path`, `plan_id`, `plan_status`, `total_tasks`,
  `completed_tasks` and `pending_tasks`.

The SDK projects plan state from these messages, so a chat UI needs no extra
queries against the plan nodes.

## Building the approval UI

`ConversationStore` exposes plan state as one snapshot field, `plans`, rebuilt
from the persisted `ai_plan` and `ai_task_update` messages on every change. It
survives reloads.

```typescript
interface PlanProjection {
  key: string;
  planPath?: string;          // the raisin:AIPlan node path
  planId?: string;
  title: string;
  status: string;             // pending_approval | in_progress | completed | cancelled
  requiresApproval: boolean;  // true => render Approve / Reject
  tasks: { taskId?: string; title: string; status: string; description?: string; priority?: string }[];
  sourceMessagePath?: string;
  updatedAt?: string;
}
```

The full loop:

```typescript
import { RaisinClient, ConversationStore } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8090', { repository: 'myrepo' });
await client.loginWithEmail(email, password, 'myrepo');
const db = client.database('myrepo');

const store = new ConversationStore({
  database: db,
  createOptions: { participant: '/agents/shift-planner' },
});

store.subscribe((s) => {
  renderMessages(s.messages, s.streamingText);

  // 1. Plan cards from the projection
  for (const plan of s.plans) {
    renderPlanCard(plan);

    // 2. Proposal: Approve / Reject while pending
    if (plan.requiresApproval && plan.status === 'pending_approval') {
      onApproveClick(() => store.approvePlan(plan.planPath!));
      onRejectClick((feedback) => store.rejectPlan(plan.planPath!, feedback));
    }
  }

  // 3. The turn pauses instead of finishing: a `waiting` event with
  //    reason 'awaiting_plan_approval' arrives, and s.isWaiting is true.

  // 4. step_by_step: the turn ends with finish_reason 'awaiting_step_continue'.
  //    Any user message resumes the next task.
  const last = s.messages.at(-1);
  if (last?.finishReason === 'awaiting_step_continue') {
    showContinueButton(() => store.sendMessage('continue'));
  }
});

await store.sendMessage('Plan next week and assign the open shifts.');
```

Lifecycle notes:

- `approvePlan()` returns a receipt (`{ accepted, action, planPath, jobId, ... }`)
  immediately. In `approve_then_auto` and `step_by_step` the backend starts a
  continuation turn; keep the subscription open and task statuses progress
  through the projection. In `manual` mode approval flips the status and the
  agent waits for your instructions in chat.
- `rejectPlan(path, feedback)` cancels the plan and the agent answers with a
  revised proposal, which appears as a new `ai_plan` card.
- Task updates are persisted messages, so `loadMessages()` always resyncs.

The framework adapters expose the same snapshot: `useConversation` from
`createRaisinReact(React)` or `createRaisinVue(Vue)`, and
`createConversationAdapter` for Svelte. See
[Chat & Conversations](/docs/reference/javascript-client/chat).

## Reference implementation

The admin console's agent **Test Chat** (Functions IDE, open an agent, "Test
Chat") is a plan client built on this contract: proposal cards with
Approve/Reject, live task progression, and a Continue affordance for
`step_by_step` pauses.

For a scripted run of all four modes with SDK assertions, see
`examples/shiftboard/plan-modes-test.mjs` in the RaisinDB repository. The
`shift-coordinator` agent in that example is a complete `approve_then_auto`
configuration.

## See also

- [Chat & Conversations (JS client reference)](/docs/reference/javascript-client/chat):
  `ConversationStore`, `approvePlan` / `rejectPlan`, event types
- [Function-Based Tool Use](/docs/guides/ai/function-based-tool-use): the
  `raisin.*` runtime available inside tools
- [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration)
