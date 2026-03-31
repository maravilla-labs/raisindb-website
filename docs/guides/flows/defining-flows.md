---
sidebar_position: 1
---

# Defining Flows

Flows are visual workflows that orchestrate multi-step processes — function calls, AI agents, human approvals, and branching logic. They are defined in YAML and stored as `raisin:Flow` nodes.

## Flow Structure

A flow is a `raisin:Flow` node with a `workflow_data` property containing the visual workflow definition:

```yaml
node_type: raisin:Flow
properties:
  title: Process Order
  name: process-order
  description: Validate and fulfill customer orders
  enabled: true
  workflow_data:
    version: 1
    error_strategy: fail_fast
    nodes:
      - id: validate
        node_type: "raisin:FlowStep"
        properties:
          action: Validate Order
          function_ref: /lib/validate-order
        connections:
          - target: check-inventory

      - id: check-inventory
        node_type: "raisin:FlowStep"
        properties:
          action: Check Inventory
          function_ref: /lib/check-inventory
        connections:
          - target: fulfill
```

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | number | `1` | Schema version |
| `error_strategy` | string | `fail_fast` | `fail_fast` stops on first error; `continue` keeps going |
| `timeout_ms` | number | `60000` | Global flow timeout in milliseconds |
| `nodes` | array | — | The flow steps and containers |

## Step Types

### Function Step

Call a server-side function:

```yaml
- id: send-email
  node_type: "raisin:FlowStep"
  properties:
    action: Send Welcome Email
    function_ref: /lib/send-welcome-email
    timeout_ms: 30000
    retry:
      max_retries: 3
      base_delay_ms: 1000
      max_delay_ms: 30000
    continue_on_fail: false
    execution_identity: caller
```

| Property | Type | Description |
|----------|------|-------------|
| `function_ref` | string | Path to the function node |
| `input_mapping` | object | Map context values to function inputs |
| `output_mapping` | object | Map function outputs back to context |
| `timeout_ms` | number | Step timeout |
| `retry` | object | Retry with exponential backoff (`max_retries`, `base_delay_ms`, `max_delay_ms`) |
| `continue_on_fail` | boolean | Continue the flow if this step fails |
| `on_error` | string | `stop`, `skip`, or `continue` |
| `error_edge` | string | Node ID to jump to on error |
| `execution_identity` | string | `agent` (default), `caller`, or `function` |
| `isolated_branch` | boolean | Run in an isolated git branch |
| `compensation_ref` | string | Rollback function for saga pattern |

### Decision Step

Branch based on a REL condition:

```yaml
- id: check-priority
  node_type: "raisin:FlowStep"
  properties:
    action: Check Priority
    condition: "input.priority >= 5 || input.urgent == true"
    yes_branch: fast-track
    no_branch: standard-queue
```

The `condition` is a [REL expression](/docs/reference/rel) that evaluates to `true` or `false`. If true, execution goes to `yes_branch`; otherwise `no_branch`.

### AI Agent Step

Single-shot AI agent call (no tool loop):

```yaml
- id: classify
  node_type: "raisin:FlowStep"
  properties:
    step_type: ai_agent
    action: Classify Ticket
    agent_ref: /agents/classifier
    timeout_ms: 30000
```

### Chat Step

Interactive multi-turn conversation session:

```yaml
- id: chat-session
  node_type: "raisin:FlowStep"
  properties:
    step_type: chat
    action: Customer Support Chat
    agent_ref: /agents/support-bot
    system_prompt: |
      You are a customer support agent. Help the user
      with their inquiry. Be polite and concise.
    max_turns: 50
    conversation_format: inbox
    termination:
      allow_user_end: true
      allow_ai_end: true
      end_keywords: ["goodbye", "exit", "done"]
    handoff_targets:
      - agent_ref:
          raisin:ref: "specialist-agent"
          raisin:workspace: "functions"
        description: "Specialist for technical issues"
        condition: "input.issue_type == 'technical'"
```

| Property | Type | Description |
|----------|------|-------------|
| `agent_ref` | string | Path to the AI agent |
| `system_prompt` | string | System prompt for the conversation |
| `max_turns` | number | Maximum conversation turns (default: 50) |
| `conversation_format` | string | `ai_chat` (default) or `inbox` |
| `session_timeout_ms` | number | Session timeout |
| `termination` | object | When the session can end |
| `handoff_targets` | array | Agents the AI can delegate to |

Setting `conversation_format: inbox` delivers messages to the user's regular inbox instead of a dedicated AI chat widget.

### Human Task Step

Pause and wait for human input or approval:

```yaml
- id: approve-order
  node_type: "raisin:FlowStep"
  properties:
    step_type: human_task
    action: Approve Large Order
    task_type: approval
    title: "Order exceeds $10,000"
    description: "Please review and approve this order"
    assignee: /users/manager
    priority: 4
    options:
      - value: approve
        label: Approve
        style: primary
      - value: reject
        label: Reject
        style: danger
    due_in_seconds: 86400
```

### Wait Step

Pause for a duration or external event:

```yaml
- id: wait-for-payment
  node_type: "raisin:FlowStep"
  properties:
    step_type: wait
    action: Wait for Payment
```

### Start and End

Explicit entry and exit points:

```yaml
- id: start
  node_type: "raisin:FlowStep"
  properties:
    step_type: start
  connections:
    - target: first-step

- id: end
  node_type: "raisin:FlowStep"
  properties:
    step_type: end
```

If omitted, the runtime injects implicit start/end nodes automatically.

## Containers

Containers group steps and control their execution model.

### AI Sequence

An AI agent with a tool loop — the agent decides which child tools to call:

```yaml
- id: ai-agent
  node_type: "raisin:FlowContainer"
  container_type: ai_sequence
  ai_config:
    agent_ref: /agents/planner
    tool_mode: auto
    max_iterations: 10
    thinking_enabled: false
    timeout_ms: 30000
    total_timeout_ms: 300000
    on_error: stop
  children:
    - id: search-tool
      node_type: "raisin:FlowStep"
      properties:
        action: Search Database
        function_ref: /lib/search
    - id: send-email-tool
      node_type: "raisin:FlowStep"
      properties:
        action: Send Email
        function_ref: /lib/send-email
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `agent_ref` | string | — | AI agent path (or `"$auto"` to inherit from conversation) |
| `tool_mode` | string | `auto` | `auto` (agent handles tools), `explicit` (tools exposed as steps), `hybrid` |
| `max_iterations` | number | `10` | Maximum tool loop iterations |
| `thinking_enabled` | boolean | `false` | Enable extended reasoning |
| `timeout_ms` | number | `30000` | Per-iteration timeout |
| `total_timeout_ms` | number | `300000` | Total execution timeout (5 min) |
| `on_error` | string | `stop` | `stop`, `continue`, or `retry` |

### Parallel

Execute children concurrently:

```yaml
- id: parallel-tasks
  node_type: "raisin:FlowContainer"
  container_type: parallel
  children:
    - id: task-a
      node_type: "raisin:FlowStep"
      properties:
        action: Fetch User Profile
        function_ref: /lib/fetch-profile
    - id: task-b
      node_type: "raisin:FlowStep"
      properties:
        action: Fetch Order History
        function_ref: /lib/fetch-orders
```

### And / Or

- **`and`** — all children must succeed
- **`or`** — the container succeeds if any child succeeds

```yaml
- id: validation-checks
  node_type: "raisin:FlowContainer"
  container_type: and
  children:
    - id: check-stock
      node_type: "raisin:FlowStep"
      properties:
        function_ref: /lib/check-stock
    - id: check-credit
      node_type: "raisin:FlowStep"
      properties:
        function_ref: /lib/check-credit
```

### Container Rules

Containers can define conditional routing rules:

```yaml
- id: router
  node_type: "raisin:FlowContainer"
  container_type: or
  rules:
    - condition: "input.region == 'eu'"
      next_step: eu-handler
    - condition: "input.region == 'us'"
      next_step: us-handler
  children:
    - id: eu-handler
      node_type: "raisin:FlowStep"
      properties:
        function_ref: /lib/eu-handler
    - id: us-handler
      node_type: "raisin:FlowStep"
      properties:
        function_ref: /lib/us-handler
```

## Navigation

Steps connect to the next step via `connections`:

```yaml
- id: step-1
  node_type: "raisin:FlowStep"
  properties:
    action: First Step
    function_ref: /lib/step-one
  connections:
    - target: step-2

- id: step-2
  node_type: "raisin:FlowStep"
  properties:
    action: Second Step
    function_ref: /lib/step-two
```

When connections are omitted, nodes execute in declaration order.

## Raisin Expression Language (REL)

Decision conditions and container rules use [REL](/docs/reference/rel), a lightweight expression language built into RaisinDB.

### Quick Reference

```
// Comparisons
input.amount > 1000
input.status == 'active'

// Logical operators (short-circuit)
input.priority >= 5 || input.urgent == true
input.active == true && input.verified == true

// String methods
input.name.contains('test')
input.email.endsWith('@example.com')

// Array methods
input.tags.contains('vip')
input.items.length() > 0

// Property access
input.user.email
input.items[0].price
```

Flow conditions have access to `input` (the flow's input data) and `context.variables` (values set by previous steps).

See the [full REL reference](/docs/reference/rel) for all operators, methods, type coercion rules, and grammar.

## Error Handling

### Step-Level

```yaml
- id: risky-step
  node_type: "raisin:FlowStep"
  properties:
    function_ref: /lib/external-api
    continue_on_fail: true       # continue the flow even if this fails
    retry:
      max_retries: 3
      base_delay_ms: 1000
      max_delay_ms: 30000
  on_error: continue             # stop | skip | continue
  error_edge: error-handler      # jump to this node on error
```

### Flow-Level

```yaml
workflow_data:
  error_strategy: fail_fast      # fail_fast | continue
```

### Compensation (Saga Pattern)

For distributed transactions, attach a compensation function that rolls back on failure:

```yaml
- id: charge-card
  node_type: "raisin:FlowStep"
  properties:
    function_ref: /lib/charge-card
    compensation_ref: /lib/refund-card
```

## Complete Example

```yaml
node_type: raisin:Flow
properties:
  title: Order Processing
  name: order-processing
  description: Validate, approve, and fulfill orders
  enabled: true
  workflow_data:
    version: 1
    error_strategy: fail_fast
    nodes:
      - id: start
        node_type: "raisin:FlowStep"
        properties:
          step_type: start
        connections:
          - target: validate

      - id: validate
        node_type: "raisin:FlowStep"
        properties:
          action: Validate Order
          function_ref: /lib/validate-order
        connections:
          - target: check-amount

      - id: check-amount
        node_type: "raisin:FlowStep"
        properties:
          action: Check Amount
          condition: "input.amount > 10000"
          yes_branch: needs-approval
          no_branch: fulfill

      - id: needs-approval
        node_type: "raisin:FlowStep"
        properties:
          step_type: human_task
          action: Manager Approval
          task_type: approval
          title: "Large order requires approval"
          assignee: /users/manager
          options:
            - value: approve
              label: Approve
            - value: reject
              label: Reject
        connections:
          - target: fulfill

      - id: fulfill
        node_type: "raisin:FlowStep"
        properties:
          action: Fulfill Order
          function_ref: /lib/fulfill-order
          compensation_ref: /lib/cancel-fulfillment
        connections:
          - target: end

      - id: end
        node_type: "raisin:FlowStep"
        properties:
          step_type: end
```

## Next Steps

- [JavaScript Client — Flows](/docs/reference/javascript-client/flows) — Run flows from your app
- [JavaScript Client — Chat](/docs/reference/javascript-client/chat) — Build chat UIs
- [Creating Functions](/docs/guides/functions/creating-functions) — Write the functions your flows call
- [Triggers](/docs/guides/functions/triggers) — Start flows automatically
- [Access Control](/docs/concepts/access-control) — Secure your flows with permissions
