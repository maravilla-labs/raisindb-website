---
sidebar_position: 3
---

# Flow Definition Reference

The complete reference for the **designer format** — the canonical authoring format for `workflow_data`, and the same format the admin console's visual flow designer reads and writes.

## The Flow Node

A workflow is a `raisin:Flow` node in the **functions** workspace. Its `workflow_data` property holds the flow definition. As a package content file (`.node.yaml`):

```yaml
node_type: raisin:Flow
properties:
  title: Order Approval            # display title
  name: order-approval             # node name (path segment)
  description: Approves incoming orders
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

### Top-Level `workflow_data` Fields

| Field | Type | Notes |
|-------|------|-------|
| `version` | number | Defaults to `1`. |
| `error_strategy` | `fail_fast` \| `continue` | Defaults to `fail_fast`. With `continue`, steps without explicit error handling behave as if `continue_on_fail: true` were set. Per-step [error handling](./error-handling.md) always takes precedence. |
| `nodes` | array | Root steps and containers, executed in **array order**. |

### Format Rules

- Every node is `node_type: raisin:FlowStep` or `node_type: raisin:FlowContainer`.
- There are **no explicit `start`/`end` nodes** — the engine injects them.
- There is **no explicit chaining** — execution order is the array order of `nodes` (and of each container's `children`). The engine lowers the tree into a flat graph, chaining each node to the next sibling and the last node to the injected end.

## Steps (`raisin:FlowStep`)

Common shape:

```yaml
- id: my-step                # unique within the flow; referenced by rules/edges and steps.<id>.*
  node_type: raisin:FlowStep
  properties: { ... }        # per step kind, see below
  on_error: stop             # optional: stop | skip | continue (carried for UI/auditing)
  error_edge: error-handler  # optional: node id to jump to on failure (also allowed inside properties)
```

### How the Engine Classifies a Step

The engine decides what a step is from its properties, in priority order:

1. `step_type: human_task` (or any `task_type` present) → **human task**
2. `function_ref` present → **function step**
3. `step_type: ai_agent` → **lightweight agent step** (one answer; the agent's own tools run in a bounded loop)
4. `agent_ref` present without `step_type: ai_agent` → **full AI container** (backward compat: tool loop + conversation persistence)
5. `step_type: chat` → **chat step**
6. `condition` present → decision step (runtime-format concept; in designer format, route with [`or` containers](#or--rel-routed-exactly-one-child) instead)
7. otherwise → function step (which then fails for a missing `function_ref`)

### References (`function_ref`, `agent_ref`, `compensation_ref`)

A reference is either a **plain path string** (workspace defaults to `functions`) or the **full reference object**:

```yaml
# Both are accepted and equivalent:
function_ref: /lib/charge-payment

function_ref:
  raisin:ref: /lib/charge-payment
  raisin:workspace: functions
  raisin:path: /lib/charge-payment    # optional resolved path; wins if present
```

## Function Step

Queues a RaisinDB [function](/docs/guides/functions/creating-functions) via the job system; the flow pauses and resumes when the function completes.

```yaml
- id: charge
  node_type: raisin:FlowStep
  properties:
    action: Charge the card           # display label
    function_ref: /lib/charge-payment
    arguments:                        # template expressions resolved against the flow context
      order_id: "{{ input.order_id }}"
      amount: "${input.amount}"       # whole-string expression keeps the native JSON type (number)
      note: "Order {{ input.order_id }} for {{ input.customer }}"   # interpolation -> string
    timeout_ms: 30000                 # optional wait deadline for the function execution
    retry:
      max_retries: 2
      base_delay_ms: 1000
      max_delay_ms: 10000
    compensation_ref: /lib/refund-payment   # saga rollback
    continue_on_fail: false
```

The step output is the function's `result` value, available downstream as `steps.charge.*`. With no `arguments`, an empty object is sent.

| Property | Type | Description |
|----------|------|-------------|
| `action` | string | Display label (template-resolved) |
| `function_ref` | reference | The function to call |
| `arguments` | object | Templated input — see [Data & Templates](./data-and-templates.md) |
| `timeout_ms` | number | Wait deadline for the queued execution |
| `retry` / `retry_strategy` | object / string | See [Error Handling](./error-handling.md#retries) |
| `error_edge` | string | Node id to jump to on failure |
| `continue_on_fail` | boolean | Continue the flow even if this step fails (default `false`) |
| `compensation_ref` | reference | Saga rollback function — see [Compensation](./error-handling.md#saga-compensation-compensation_ref) |
| `compensation_input_mapping` | object | Templated input for the compensation (`output.*` = this step's output) |
| `timeout_edge` | string | Node id to route to when the wait deadline expires |
| `disabled` | boolean | Skip this step (default `false`) |
| `isolated_branch` | boolean | Run in an isolated git-like branch |
| `execution_identity` | `agent` \| `caller` \| `function` | Which identity the permission check uses (default `agent`) |

## Human Task Step

Creates an inbox task and pauses the flow until it is completed. Covered in depth in [Human-in-the-Loop & the Inbox](./human-in-the-loop.md).

```yaml
- id: approve
  node_type: raisin:FlowStep
  properties:
    action: "Approve order {{ input.order_id }}"   # becomes the TASK TITLE
    step_type: human_task
    task_type: approval                 # approval | input | review | action
    assignee: /users/manager            # user path OR agent path; templates allowed
    task_description: "Please review order {{ input.order_id }}."
    priority: 4                         # 1-5 (5 = highest); default 3
    due_in_seconds: 86400               # due time AND wait deadline
    timeout_edge: escalate-step         # where to go if the deadline expires
    options:                            # for approval tasks
      - { value: approve, label: Approve, style: success }
      - { value: reject,  label: Reject,  style: danger }
    # input tasks instead use:
    # input_schema: { type: object, properties: { quantity: { type: number } } }
    # agent-assignee controls:
    # min_confidence: 0.75
    # escalation_assignee: /users/boss
```

| Property | Type | Description |
|----------|------|-------------|
| `action` | string | Doubles as the **task title** (defaults to `"Task"`); template-resolved |
| `task_type` | string | `approval` \| `input` \| `review` \| `action` |
| `assignee` | string | User or AI agent path; template-resolved |
| `task_description` | string | Maps to the task's `description`; template-resolved |
| `priority` | number | 1–5 (5 = highest); default 3 |
| `options` | array | `{ value, label, style }` choices for approval tasks. `style` is free-form; the UI understands `default` \| `success` \| `danger` \| `warning` |
| `input_schema` | object | JSON schema for input tasks |
| `due_in_seconds` | number | Materializes an absolute `due_at` on the task; also the flow's wait deadline |
| `timeout_edge` | string | Node to continue at when the deadline expires (the task is marked `expired`). Without it, an expired wait fails the flow |
| `min_confidence` | number | Agent-assignee confidence threshold (default 0.7) — see [agent as assignee](./human-in-the-loop.md#ai-agent-as-assignee) |
| `escalation_assignee` | string | Where to escalate when an agent assignee cannot decide |

## AI Agent Step

A lightweight AI call: one agent, one answer, no conversation persistence. The agent's own tools are executed in a bounded internal loop (default 5 iterations, `max_tool_iterations` to change). Covered in depth in [AI Steps](./ai-steps.md#ai_agent-steps).

```yaml
- id: summarize
  node_type: raisin:FlowStep
  properties:
    action: Summarize request
    step_type: ai_agent
    agent_ref: /agents/summarizer
    prompt: "Summarize this refund request: {{ input.reason }} ({{ input.amount }} CHF)"
    # max_tool_iterations: 5    # bound for the internal tool loop (default 5)
```

Output shape: `{ response, model, finish_reason, usage }` — reference the text downstream as `{{ steps.summarize.response }}`. When tools ran, `tools_used` and `tool_iterations` are included for auditing.

## Chat Step

:::caution Experimental
Chat steps are experimental and their configuration may change.
:::

A long-running, multi-turn conversation step. The flow waits between turns; conversation history is persisted as nodes. See [AI Steps — Chat](./ai-steps.md#chat-steps-experimental).

```yaml
- id: chat-session
  node_type: raisin:FlowStep
  properties:
    step_type: chat
    action: Chat Session
    chat_config:
      agent_ref: /agents/support        # primary agent (null = resolved from context)
      system_prompt: "You are a helpful support agent."
      max_turns: 50                     # default 50
      session_timeout_ms: 600000        # how long to wait for the user each turn
      handoff_targets:
        - agent_ref: /agents/billing
          description: "Billing and invoice questions"
          condition: "input.topic == \"billing\""   # optional REL expression
      termination:
        allow_user_end: true            # user keyword can end the session (default true)
        allow_ai_end: true              # AI may declare the session complete (default true)
        end_keywords: ["goodbye", "exit"]
```

## Containers (`raisin:FlowContainer`)

```yaml
- id: my-container
  node_type: raisin:FlowContainer
  container_type: and          # and | or | parallel | ai_sequence | competition | loop
  children: [ ...nodes... ]
  rules: [ ... ]               # 'or' containers only
  router: { ... }              # 'or' containers only (optional AI router)
  ai_config: { ... }           # 'ai_sequence' containers only
  referee: { ... }             # 'competition' containers only
  prompt: "..."                # 'competition' containers only (shared task)
  loop: { ... }                # 'loop' containers only
  timeout_ms: 60000            # optional
```

### `and` — All Children, Sequentially

Children run in array order; the flow then continues after the container. Children can reference each other's outputs (`steps.<child-id>.*`).

```yaml
- id: book-everything
  node_type: raisin:FlowContainer
  container_type: and
  children:
    - id: book-flight
      node_type: raisin:FlowStep
      properties: { function_ref: /lib/book-flight }
    - id: book-hotel
      node_type: raisin:FlowStep
      properties:
        function_ref: /lib/book-hotel
        arguments: { near_flight: "${steps.book-flight.arrival_airport}" }
```

### `or` — REL-Routed, Exactly One Child

Rules are evaluated **in order**; the first matching rule routes to its child, that child runs, then execution **exits the container** (other children are skipped). If **no rule matches, the whole container is skipped** and the flow continues after it.

```yaml
- id: route-by-tier
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "input.tier == \"premium\"", next_step: vip }
    - { condition: "input.tier == \"basic\"",   next_step: standard }
  children:
    - id: vip
      node_type: raisin:FlowStep
      properties: { function_ref: /lib/vip-handling }
    - id: standard
      node_type: raisin:FlowStep
      properties: { function_ref: /lib/standard-handling }
```

Conditions are [REL expressions](/docs/reference/rel) over the same namespaces as templates. If `rules` is omitted, each child's own `condition` property is used as its rule. With neither, the container passes through to its first child.

#### AI-Routed `or`

An optional `router: { agent_ref, prompt?, min_confidence?, default_branch? }` lets an **agent pick the child** when no REL rule matched — deterministic rules always run first. The decision is recorded as a step output `{ routed_to, routed_by_agent, reasoning, confidence }`. See [AI Steps — AI-Routed `or` Containers](./ai-steps.md#ai-routed-or-containers).

### `parallel` — Fork Children, Join Outputs

Each child becomes its own branch flow (a child flow instance); the container waits for all branches and joins their outputs.

```yaml
- id: par
  node_type: raisin:FlowContainer
  container_type: parallel
  children:
    - id: left
      node_type: raisin:FlowStep
      properties: { function_ref: /lib/left }
    - id: right
      node_type: raisin:FlowStep
      properties: { function_ref: /lib/right }
```

The joined output lands in the container's step output: `steps.par.branch_0.status == "completed"`, `steps.par.branch_0.output`, etc. (branches indexed in child order). A child may itself be a container.

### `ai_sequence` — Agentic Tool Loop

An AI agent runs in a loop: it is called, may request tool calls, the tools execute, results are fed back, and the loop continues. Covered in depth in [AI Steps](./ai-steps.md#ai_sequence-containers-agentic-tool-loop).

```yaml
- id: assistant
  node_type: raisin:FlowContainer
  container_type: ai_sequence
  ai_config:
    agent_ref: /agents/helper      # or "$auto" to derive from the conversation's agent_ref
    tool_mode: auto                # auto | explicit | hybrid (default auto)
    max_iterations: 10             # default 10
    thinking_enabled: false
    on_error: stop                 # stop | continue | retry
    timeout_ms: 30000              # per-call timeout
    total_timeout_ms: 300000       # across all iterations
  children: []                     # explicit tool steps (explicit/hybrid modes)
```

### `competition` — Competing Agents Judged by a Referee

Every child agent (each potentially backed by a different LLM) answers the same task; a **referee agent** judges the answers and either accepts a winner or requests refinement (bounded by `max_rounds`, default 1 refinement round). Covered in depth in [AI Steps](./ai-steps.md#competition-containers).

```yaml
- id: compete
  node_type: raisin:FlowContainer
  container_type: competition
  prompt: "Write a tagline for {{ input.product }}."   # shared task (templated)
  referee:
    agent_ref: /agents/referee
    min_confidence: 0.7          # below -> output.confident = false (default 0.7)
    max_rounds: 2                # refinement rounds after the initial one (default 1)
    # prompt: optional judging instructions
  children:                      # children must be ai_agent steps with agent_ref
    - id: writer_claude
      node_type: raisin:FlowStep
      properties: { action: Claude writer, step_type: ai_agent, agent_ref: /agents/writer-claude }
    - id: writer_gpt
      node_type: raisin:FlowStep
      properties: { action: GPT writer, step_type: ai_agent, agent_ref: /agents/writer-gpt }
```

Output under `steps.compete.*`: `{ response, winner, confidence, confident, reasoning, rounds, answers, models }`. The canonical low-confidence pattern is a follow-up `or` gate on `steps.compete.confidence < 0.7` into a [human task](./human-in-the-loop.md).

### `loop` — Iterate the Children Over a Collection

The container's children form the **loop body** and run once per item of a collection. The current item is exposed as a flow variable (default `item`) — reference it like any other value: `${candidate}` / `{{ candidate }}` in templates, bare `candidate` in REL conditions.

```yaml
- id: ask_each_candidate
  node_type: raisin:FlowContainer
  container_type: loop
  loop:
    over: '${steps.pick_candidates.candidates}'   # required: must resolve to an array
    item: candidate                               # default: item (snake_case identifier)
    index: candidate_index                        # optional: 0-based iteration index
    max_iterations: 10                            # optional: cap on processed items
    until: 'steps.ask.response == "accept"'       # optional: early-exit REL condition
  children:
    - id: ask
      node_type: raisin:FlowStep
      properties:
        function_ref: /lib/ask-candidate
        arguments: { who: "${candidate}", position: "${candidate_index}" }
```

Semantics:

- **`over`** is a template expression evaluated once when the loop starts. Arrays iterate item by item; objects iterate as `{key, value}` pairs. An empty collection skips the loop (output `{results: [], count: 0}`). A `loop` block without `over` is rejected when the definition is parsed.
- **Body** children chain like an `and` container, then loop back for the next item. Each iteration sees fresh `item`/`index` variables; step outputs (`steps.ask.*`) hold the latest iteration's values.
- **`max_iterations`** caps how many items are processed — a safety bound for unbounded collections.
- **`until`** is a REL condition evaluated **after each completed iteration**, with that iteration's step outputs and loop variables visible. When true, the loop stops early and keeps the results collected so far. Waiting steps inside the body (human tasks, chats) work — the loop resumes where it left off.
- **Output** under `steps.<loop-id>.*`: `{ results, count }` — `results` is the array of per-iteration body outputs, in order.

The example above implements "ask each candidate until one accepts": as soon as `until` fires, the remaining candidates are never asked. Loops nest — give inner loops distinct `item` names. `raisin flow doctor` validates loops (missing `over`, non-identifier `item`/`index`, `until` referencing unknown steps).

## Advanced: Runtime Format

Before lowering, the engine also accepts `workflow_data` directly in the lower-level **runtime format**: a flat node list with top-level `step_type`, explicit `start`/`end` nodes, and explicit `next_node` chaining. The engine auto-detects the format (nodes with `node_type` are designer format; nodes with top-level `step_type` are runtime format) — **don't mix the two in one definition**.

Some step types are only expressible in the runtime format:

| Step type | Key properties | Notes |
|-----------|----------------|-------|
| `decision` | `condition` (REL), `yes_branch`, `no_branch` | Two-way branch. Designer `or` containers lower to cascades of these. |
| `wait` | `wait_type: delay\|until\|event\|cron`, `duration` (e.g. `"5s"`, `"30m"`, `"1h"`, templated), `until` | Pause for time/event. |
| `loop` | `loop_type: for_each\|while\|times`, `collection` (expr), `item_var`, `index_var`, `body_step`, `condition`, `max_iterations`, `until` (REL early exit) | The body step must chain back to the loop node. `for_each` loops are authorable in the designer format via `container_type: loop` (above); `while`/`times` remain runtime-only. |
| `sub_flow` | `flow_ref` (path to a `raisin:Flow`), `input_mapping` (templated object), `async` | Child output becomes `steps.<id>.*` in the parent. |
| `parallel` | `branches: [{id, flow_definition, input_mapping?}]`, `merge_strategy: merge_all` | Inline branch definitions. |

Runtime-format example — a `for_each` loop:

```json
{
  "nodes": [
    { "id": "start", "step_type": "start", "next_node": "each" },
    { "id": "each", "step_type": "loop",
      "properties": { "loop_type": "for_each", "collection": "${input.items}",
                      "item_var": "current", "body_step": "body" },
      "next_node": "end" },
    { "id": "body", "step_type": "function_step",
      "properties": { "function_ref": "/lib/process", "arguments": { "item": "${current}" } },
      "next_node": "each" },
    { "id": "end", "step_type": "end" }
  ]
}
```

Accepted `step_type` aliases: `agent_step`/`ai_agent`, `ai_container`/`ai_sequence`, `chat_step`/`chat_session`. In runtime format, agent-step and AI-container nodes read their continuation from a `next_node` property **inside `properties`** as well as the top-level field — set both to be safe.

## Next Steps

- [Data & Templates](./data-and-templates.md) — the expression language for `arguments`, prompts, and conditions
- [Error Handling & Compensation](./error-handling.md) — retries, error edges, sagas
- [JavaScript Client — Flows](/docs/reference/javascript-client/flows) — run flows from your app
