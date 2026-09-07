---
sidebar_position: 3
---

# Flow Definition Reference

The reference for the designer format, the authoring format for `workflow_data`. It is the same format the admin console's visual flow designer reads and writes, and the format `raisindb flow doctor` and `raisindb flow explain` analyze.

## The Flow Node

A workflow is a `raisin:Flow` node in the `functions` workspace. Its `workflow_data` property holds the flow definition. As a package content file (`.node.yaml`):

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
| `error_strategy` | `fail_fast` \| `continue` | Defaults to `fail_fast`. With `continue`, function, agent, and `ai_sequence` steps without their own error handling behave as if `continue_on_fail: true` were set. Per-step [error handling](./error-handling.md) takes precedence. |
| `nodes` | array | Root steps and containers, executed in array order. |

### Format Rules

- Every node is `node_type: raisin:FlowStep` or `node_type: raisin:FlowContainer`.
- There are no explicit start and end nodes. The engine adds them, unless you name a node `start` or `end` yourself.
- There is no explicit chaining. Execution order is the array order of `nodes`, and of each container's `children`. The engine lowers the tree into a flat graph, chaining each node to the next sibling and the last node to the end.
- Node ids share one namespace across the whole tree and must be unique. Use snake_case ids; see [Data and Templates](./data-and-templates.md#context-namespaces) for why hyphens cause trouble in expressions.

## Steps (`raisin:FlowStep`)

Common shape:

```yaml
- id: my_step                # unique within the flow; referenced by rules, edges and steps.<id>.*
  node_type: raisin:FlowStep
  properties:
    action: Do the thing     # display label; also the task title for human tasks
    # ... per step kind, see below
  error_edge: error_handler  # optional: node id to jump to on failure (also accepted inside properties)
  on_error: stop             # optional: stop (default) | continue | skip
```

`on_error: continue` and `on_error: skip` both let the flow carry on to the next sibling when the step fails, the same as `continue_on_fail: true` inside `properties`. See [Error Handling](./error-handling.md#continue_on_fail-best-effort-steps).

Give every step an `action`. It is the label in the designer and the timeline, the task title for human tasks, and `raisindb flow doctor` reports a missing one as an error.

### How the Engine Classifies a Step

The engine decides what a step is from its properties, checked in this order:

1. `step_type: human_task`, or any `task_type` present: **human task**
2. `step_type: wait`: **wait step**
3. `step_type: sub_flow`: **sub-flow step**
4. `step_type: decision`: **decision step**
5. `function_ref` present: **function step**
6. `step_type: ai_agent`: **AI agent step** (one answer, the agent's own tools in a bounded loop)
7. `agent_ref` present without `step_type: ai_agent`: **AI container** (tool loop and conversation persistence, kept for older definitions)
8. `step_type: chat`: **chat step**
9. `condition` present: **decision step**
10. otherwise: function step, which fails at run time because `function_ref` is missing

### References (`function_ref`, `agent_ref`, `flow_ref`, `compensation_ref`)

A reference is either a plain path string (the workspace defaults to `functions`) or the full reference object:

```yaml
# Both are accepted and equivalent:
function_ref: /lib/charge-payment

function_ref:
  raisin:ref: /lib/charge-payment
  raisin:workspace: functions
  raisin:path: /lib/charge-payment    # optional resolved path; used when present
```

## Function Step

Queues a RaisinDB [function](/docs/guides/functions/creating-functions) through the job system. The flow pauses and resumes when the function completes.

```yaml
- id: charge
  node_type: raisin:FlowStep
  properties:
    action: Charge the card
    function_ref: /lib/charge-payment
    arguments:                        # template expressions resolved against the flow context
      order_id: "{{ input.order_id }}"
      amount: "${input.amount}"       # whole-string expression keeps the native JSON type (number)
      note: "Order {{ input.order_id }} for {{ input.customer }}"   # interpolation gives a string
    timeout_ms: 30000                 # wait deadline for the function execution
    retry:
      max_retries: 2
      base_delay_ms: 1000
      max_delay_ms: 10000
    compensation_ref: /lib/refund-payment   # saga rollback
    compensation_input_mapping:
      charge_id: "${output.charge_id}"
    continue_on_fail: false
```

The step output is the function's return value, available downstream as `steps.charge.*`. With no `arguments`, an empty object is sent.

| Property | Type | Description |
|----------|------|-------------|
| `action` | string | Display label |
| `function_ref` | reference | The function to call |
| `arguments` | object | Templated input. See [Data and Templates](./data-and-templates.md) |
| `timeout_ms` | number | Wait deadline for the queued execution. When it expires the step follows `timeout_edge` or fails |
| `retry` / `retry_strategy` | object / string | See [Error Handling](./error-handling.md#retries) |
| `error_edge` | string | Node id to jump to on failure |
| `continue_on_fail` | boolean | Continue the flow even if this step fails (default `false`) |
| `compensation_ref` | reference | Saga rollback function. See [Compensation](./error-handling.md#saga-compensation-compensation_ref) |
| `compensation_input_mapping` | object | Templated input for the compensation; `output.*` is this step's output |
| `timeout_edge` | string | Node id to continue at when the wait deadline expires |
| `isolated_branch` | boolean | Run the step's writes on an isolated branch |
| `execution_identity` | `agent` \| `caller` \| `function` | Which identity the permission check uses (default `agent`) |
| `disabled` | boolean | Skip this step: the flow goes straight to the next node with a null output (default `false`) |

## Human Task Step

Creates an inbox task and pauses the flow until it is completed. Covered in depth in [Human-in-the-Loop and the Inbox](./human-in-the-loop.md).

```yaml
- id: approve
  node_type: raisin:FlowStep
  properties:
    action: "Approve order {{ input.order_id }}"   # becomes the task title
    step_type: human_task
    task_type: approval                 # approval | input | review | action, or your own slug
    assignee: /users/manager            # user, agent or group path; templates allowed
    task_description: "Please review order {{ input.order_id }}."
    priority: 4                         # 1-5 (5 = highest); default 3
    due_in_seconds: 86400               # due time and wait deadline
    timeout_edge: escalate_step         # where to go if the deadline expires
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
| `action` | string | The task title (defaults to `"Task"`); template-resolved |
| `task_type` | string | `approval`, `input`, `review`, `action`, or any application-defined slug matching `[a-z][a-z0-9_-]{0,63}` |
| `assignee` | string | A user home path (`/users/alice`), an AI agent path (`/agents/support`), or a group path; template-resolved |
| `task_description` | string | Stored as the task's `description`; template-resolved |
| `priority` | number or template | 1 to 5, where 5 is highest; default 3. A template such as `"${input.priority}"` is resolved and coerced |
| `options` | array | `{ value, label, style }` choices for approval tasks. `style` is free text; the console understands `default`, `success`, `danger`, `warning` |
| `input_schema` | object | JSON schema for input tasks |
| `data` | object | Arbitrary structured payload for a custom task UI, stored on the task as `data`; templates inside it are resolved |
| `due_in_seconds` | number or template | Sets an absolute `due_at` on the task and the flow's wait deadline |
| `timeout_edge` | string | Node to continue at when the deadline expires. The task is marked `expired`. Without it, an expired wait fails the flow |
| `min_confidence` | number | Confidence an agent assignee must reach (default 0.7). See [agent as assignee](./human-in-the-loop.md#ai-agent-as-assignee) |
| `escalation_assignee` | string | Who receives the task when an agent assignee cannot decide |

## AI Agent Step

One agent, one answer, no conversation persistence. Tools configured on the agent node run in a bounded internal loop. Covered in depth in [AI Steps](./ai-steps.md#ai_agent-steps).

```yaml
- id: summarize
  node_type: raisin:FlowStep
  properties:
    action: Summarize request
    step_type: ai_agent
    agent_ref: /agents/summarizer
    prompt: "Summarize this refund request: {{ input.reason }} ({{ input.amount }} CHF)"
    # include_context: input     # or full: append the workflow context to the prompt
    # response_format: json_object
    # max_tool_iterations: 5     # bound for the internal tool loop (default 5)
```

Output: `{ response, model, finish_reason, usage }`. Reference the text downstream as `{{ steps.summarize.response }}`. With `response_format`, the parsed JSON is added as `structured_output`. When tools ran, `tools_used` and `tool_iterations` are included.

## Wait Step

Pauses the flow for a duration, until a timestamp, until an external event, or until the next cron match.

```yaml
- id: cool_off
  node_type: raisin:FlowStep
  properties:
    action: Wait before retrying
    step_type: wait
    wait_type: delay          # delay (default) | until | event | cron
    duration: "30m"           # delay: "500ms", "5s", "30m", "1h", "1d", or "2 hours"; templates allowed
    # until: "2026-12-31T23:00:00Z"   # until: RFC 3339 timestamp; templates allowed
    # event_type: payment.settled     # event: resumed by POST .../instances/{id}/resume
    # timeout: "1h"                   # event: optional deadline
    # cron: "0 9 * * 1-5"             # cron: next occurrence (5-field, or @daily etc.)
```

A `delay`, `until`, or `cron` wait wakes up by itself. An `event` wait resumes when something calls the resume endpoint (or `flows.resume()` in the SDK); the resume data becomes `steps.<id>.event`. The output is `{ waited: true }`, or `{ waited: false, reason: "timestamp_passed" }` for an `until` already in the past.

## Sub-Flow Step

Runs another deployed flow as a child instance and waits for it to finish.

```yaml
- id: fulfil
  node_type: raisin:FlowStep
  properties:
    action: Run fulfilment
    step_type: sub_flow
    flow_ref: /flows/fulfilment          # path to a raisin:Flow node
    input_mapping:                       # templated child input
      order_id: "${input.order_id}"
      items: "${steps.reserve.items}"
```

The child's output becomes `steps.fulfil.*`. Without `input_mapping`, the child receives the parent's input merged with the parent's flow variables. A failed child fails the step, which then goes through the normal [error handling](./error-handling.md). Sub-flow steps do not retry by default, because a retry would start the child again.

## Decision Step

A two-way branch on a REL condition. Name only the arm that diverges; the other arm defaults to the next sibling.

```yaml
- id: is_large
  node_type: raisin:FlowStep
  properties:
    action: Large order?
    step_type: decision
    condition: "steps.reserve.total > 500"
    no_branch: notify            # skip the review step unless the order is large
- id: review
  node_type: raisin:FlowStep
  properties: { action: Review large order, function_ref: /lib/review }
- id: notify
  node_type: raisin:FlowStep
  properties: { action: Notify, function_ref: /lib/notify }
```

`yes_branch` and `no_branch` name node ids. The output is `{ decision: true|false, branch_taken: "yes"|"no" }`. Because siblings chain in array order, a decision is a forward guard. For mutually exclusive branches that rejoin, use an [`or` container](#or-routed-by-rel-rules-exactly-one-child).

## Chat Step

:::caution Experimental
Chat steps are experimental and their configuration may change.
:::

A long-running, multi-turn conversation step. The flow waits between turns and the conversation is persisted as nodes. See [AI Steps: Chat](./ai-steps.md#chat-steps-experimental).

```yaml
- id: chat_session
  node_type: raisin:FlowStep
  properties:
    step_type: chat
    action: Chat Session
    chat_config:
      agent_ref: /agents/support
      system_prompt: "You are a helpful support agent."
      max_turns: 50                     # default 50
      session_timeout_ms: 600000        # how long to wait for the user each turn
      handoff_targets:
        - agent_ref: /agents/billing
          description: "Billing and invoice questions"
          condition: "input.topic == \"billing\""   # optional REL expression
      termination:
        allow_user_end: true            # default true
        allow_ai_end: true              # default true
        end_keywords: ["goodbye", "exit"]
```

## Containers (`raisin:FlowContainer`)

```yaml
- id: my_container
  node_type: raisin:FlowContainer
  container_type: and          # and | or | parallel | loop | ai_sequence | competition
  children: [ ...nodes... ]
  rules: [ ... ]               # or containers
  router: { ... }              # or containers (optional AI router)
  fan_out: { ... }             # parallel containers (dynamic fan-out)
  merge_strategy: merge_all    # parallel containers
  loop: { ... }                # loop containers
  ai_config: { ... }           # ai_sequence containers
  referee: { ... }             # competition containers
  prompt: "..."                # competition containers (shared task)
```

### `and`: All Children, Sequentially

Children run in array order, then the flow continues after the container. Children can reference each other's outputs (`steps.<child_id>.*`).

```yaml
- id: book_everything
  node_type: raisin:FlowContainer
  container_type: and
  children:
    - id: book_flight
      node_type: raisin:FlowStep
      properties: { action: Book flight, function_ref: /lib/book-flight }
    - id: book_hotel
      node_type: raisin:FlowStep
      properties:
        action: Book hotel
        function_ref: /lib/book-hotel
        arguments: { near_flight: "${steps.book_flight.arrival_airport}" }
```

### `or`: Routed by REL Rules, Exactly One Child

Rules are evaluated in order. The first matching rule routes to its child, that child runs, then execution leaves the container. If no rule matches, the container is skipped and the flow continues after it.

```yaml
- id: route_by_tier
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "input.tier == \"premium\"", next_step: vip }
    - { condition: "input.tier == \"basic\"",   next_step: standard }
  children:
    - id: vip
      node_type: raisin:FlowStep
      properties: { action: VIP handling, function_ref: /lib/vip-handling }
    - id: standard
      node_type: raisin:FlowStep
      properties: { action: Standard handling, function_ref: /lib/standard-handling }
```

Conditions are [REL expressions](/docs/reference/rel) over the same context as templates. If `rules` is omitted, each child's own `condition` property is used as its rule. With neither, the container passes through to its first child. A child may itself be a container.

#### AI-Routed `or`

An optional `router: { agent_ref, prompt?, min_confidence?, default_branch?, include_context? }` lets an agent pick the child when no REL rule matched. Deterministic rules always run first. The decision is recorded as a step output `{ routed_to, routed_by_agent, reasoning, confidence }`. See [AI Steps: AI-Routed `or` Containers](./ai-steps.md#ai-routed-or-containers).

### `parallel`: Fork Children, Join Outputs

Each child becomes its own branch, run as a child flow instance. The container waits for every branch to reach a terminal state, then joins the outputs.

```yaml
- id: par
  node_type: raisin:FlowContainer
  container_type: parallel
  merge_strategy: merge_all      # merge_all (default) | first_success | all_success
  children:
    - id: left
      node_type: raisin:FlowStep
      properties: { action: Left, function_ref: /lib/left }
    - id: right
      node_type: raisin:FlowStep
      properties: { action: Right, function_ref: /lib/right }
```

Each branch receives the parent's flow input as its own input. The joined output lands in the container's step output:

- `branch_0`, `branch_1`, ... in child order, each `{ status, output, error }`
- `branches`: the same entries as an ordered array, each tagged with `branch_id` and `instance_id`

`first_success` returns the first completed branch's output and fails if every branch failed. `all_success` fails the step if any branch failed, otherwise merges like `merge_all`. Parallel containers do not retry by default, because a retry forks the branches again.

#### Dynamic Fan-Out

With `fan_out`, the container's children become one branch subgraph that runs once per item of a collection, and all runs are joined:

```yaml
- id: collect_approvals
  node_type: raisin:FlowContainer
  container_type: parallel
  fan_out:
    over: "${steps.plan.items}"    # must resolve to an array; objects iterate as {key, value}
    max_branches: 200              # optional, default 500
  merge_strategy: all_success
  children:
    - id: approve_item
      node_type: raisin:FlowStep
      properties:
        action: "Approve {{ input.item.name }}"
        step_type: human_task
        task_type: approval
        assignee: "${input.item.owner}"
```

Each branch instance receives `{ item, index }` as its input, so inside the branch the current element is `input.item` and its position is `input.index`. Branch ids are `<container_id>-<index>`.

### `loop`: Repeat the Children

The container's children form the loop body. Exactly one of `over`, `while`, or `times` decides the loop's shape.

```yaml
- id: ask_each_candidate
  node_type: raisin:FlowContainer
  container_type: loop
  loop:
    over: "${steps.pick_candidates.candidates}"   # iterate a collection
    item: candidate                               # default: item (snake_case identifier)
    index: candidate_index                        # optional 0-based index variable
    max_iterations: 10                            # optional cap on processed items
    until: 'steps.ask.response == "accept"'       # optional early-exit REL condition
  children:
    - id: ask
      node_type: raisin:FlowStep
      properties:
        action: "Ask {{ candidate.name }}"
        function_ref: /lib/ask-candidate
        arguments: { who: "${candidate}", position: "${candidate_index}" }
```

- `over` is a template expression evaluated once when the loop starts. Arrays iterate item by item; objects iterate as `{key, value}` pairs. An empty collection skips the loop with output `{ results: [], count: 0 }`.
- `while: "<REL condition>"` repeats while the condition holds. It is re-tested after every iteration, and capped at `max_iterations` (default 1000). Set `unbounded: true` to remove the cap; the engine's own per-execution step budget still applies.
- `times: N` repeats a fixed number of times. `while` and `times` loops expose `iteration` and `index` variables.
- Each iteration sees fresh `item` and `index` variables; step outputs (`steps.ask.*`) hold the latest iteration's values, and `history.ask` keeps earlier ones.
- `until` is evaluated after each completed iteration with that iteration's outputs visible. When true, the loop stops and keeps the results collected so far. Waiting steps inside the body (human tasks, chats, function calls) work; the loop resumes where it left off.
- Output under `steps.<loop_id>.*`: `{ results, count }`, where `results` is the array of per-iteration body outputs in order.

The example implements "ask each candidate until one accepts": once `until` fires, the remaining candidates are never asked. Loops nest; give inner loops distinct `item` names. Loops do not retry by default. `raisindb flow doctor` validates loops (missing or ambiguous shape, non-identifier `item` or `index`, `until` referencing unknown steps).

### `ai_sequence`: Agentic Tool Loop

An AI agent runs in a loop: it is called, may request tool calls, the tools execute, the results are fed back, and the loop continues. Covered in depth in [AI Steps](./ai-steps.md#ai_sequence-containers-agentic-tool-loop).

```yaml
- id: assistant
  node_type: raisin:FlowContainer
  container_type: ai_sequence
  ai_config:
    agent_ref: /agents/helper
    tool_mode: auto                # auto | explicit | hybrid (default auto)
    max_iterations: 10             # default 10
    thinking_enabled: false
    on_error: stop                 # stop | continue | retry
    timeout_ms: 30000              # per-call timeout
    total_timeout_ms: 300000       # across all iterations
  children: []                     # explicit tool steps (explicit and hybrid modes)
```

### `competition`: Competing Agents Judged by a Referee

Every child agent answers the same task; a referee agent judges the answers and either accepts a winner or requests refinement. Covered in depth in [AI Steps](./ai-steps.md#competition-containers).

```yaml
- id: compete
  node_type: raisin:FlowContainer
  container_type: competition
  prompt: "Write a tagline for {{ input.product }}."   # shared task (templated)
  referee:
    agent_ref: /agents/referee
    min_confidence: 0.7          # below this, output.confident is false (default 0.7)
    max_rounds: 2                # refinement rounds after the initial one (default 1)
    # prompt: optional judging instructions
  children:                      # children must be ai_agent steps with an agent_ref
    - id: writer_claude
      node_type: raisin:FlowStep
      properties: { action: Claude writer, step_type: ai_agent, agent_ref: /agents/writer-claude }
    - id: writer_gpt
      node_type: raisin:FlowStep
      properties: { action: GPT writer, step_type: ai_agent, agent_ref: /agents/writer-gpt }
```

Output under `steps.compete.*`: `{ response, winner, confidence, confident, reasoning, rounds, answers, models }`.

## Checking a Definition

`raisindb flow doctor <file-or-package-dir>` analyzes designer-format definitions without a server: unknown step or container types, missing `action`, `function_ref`, `assignee` or `task_type`, rule and edge targets that do not exist, hyphenated step ids in templates, template references to steps that run later, loop and fan-out configuration, and retry settings. It exits 1 on errors (or on warnings with `--strict`), 2 on parse failures, and prints JSON with `--json`.

`raisindb flow explain <file>` prints the lowered graph: every runtime node, its type, what it routes to, and the compensations that would run on rollback.

## Advanced: Runtime Format

The engine also accepts `workflow_data` directly in the lower-level runtime format: a flat node list with a top-level `step_type` per node, explicit `start` and `end` nodes, and explicit `next_node` chaining. The engine auto-detects the format (nodes with `node_type` are designer format; nodes with a top-level `step_type` are runtime format). Do not mix the two in one definition.

Every step type above can be written in the designer format, so the runtime format is only needed when you want to hand-author the graph, for example a cycle with a backward edge:

```json
{
  "nodes": [
    { "id": "start", "step_type": "start", "next_node": "draft" },
    { "id": "draft", "step_type": "agent_step",
      "properties": { "agent_ref": "/agents/writer", "prompt": "Draft: ${input.brief}" },
      "next_node": "check" },
    { "id": "check", "step_type": "decision",
      "properties": { "condition": "steps.draft.response.length > 200 || visits.draft >= 3",
                      "yes_branch": "end", "no_branch": "draft" } },
    { "id": "end", "step_type": "end" }
  ]
}
```

Runtime `step_type` values: `start`, `end`, `decision`, `function_step`, `agent_step` (alias `ai_agent`), `ai_container` (alias `ai_sequence`), `human_task`, `parallel`, `wait`, `sub_flow`, `chat` (aliases `chat_step`, `chat_session`), `agent_decision`, `competition`, `loop`. Retry settings are flat properties in this format (`max_retries`, `retry_base_delay_ms`, `retry_max_delay_ms`), and a `loop` node uses `loop_type: for_each|while|times` with `collection`, `condition` or `times`, `item_var`, `index_var`, and `body_step`. `raisindb flow doctor` skips runtime-format definitions.

## Next Steps

- [Data and Templates](./data-and-templates.md): the expression language for `arguments`, prompts, and conditions
- [Error Handling and Compensation](./error-handling.md): retries, error edges, sagas
- [JavaScript Client: Flows](/docs/reference/javascript-client/flows): run flows from your app
