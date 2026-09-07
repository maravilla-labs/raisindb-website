---
sidebar_position: 4
---

# Data and Templates

How data moves through a flow: template expressions in step properties, the context they resolve against, and REL conditions for routing.

## Template Markers

Anywhere a value supports templates (function `arguments`, agent `prompt`, human-task title, description, assignee, options and `data`, wait durations, sub-flow `input_mapping`, compensation mappings), two marker styles are accepted and equivalent:

- `{{ expr }}`
- `${expr}`

Both are evaluated with [REL](/docs/reference/rel) (the Raisin Expression Language) against the flow context.

## Resolution Rules

A string that consists of exactly one expression keeps the expression's native JSON type:

```yaml
arguments:
  amount: "${input.amount}"      # a number
  items: "${input.items}"        # the whole array
  user: "${input.user}"          # the whole object
  everything: "${steps}"         # a whole namespace is a value too
```

Surrounding whitespace still counts as a whole-string expression.

A string that mixes text and expressions is interpolated into a string:

```yaml
arguments:
  note: "Hello {{ input.user.name }}!"   # a string
```

Non-string values are inserted as compact JSON, and `null` becomes the empty string.

More rules:

- Objects and arrays are resolved recursively. Keys are never resolved.
- Unterminated markers (`"price is ${100"`) are left as literal text.
- Expressions can compute: `"${input.user.age + 1}"`.

## Context Namespaces

Templates and REL conditions (`or` container rules, `decision` steps, loop `until` and `while`) share one evaluation context:

| Namespace | Meaning |
|-----------|---------|
| `input.*` | The flow input: the `input` of the run request, or the event payload when a trigger started the flow (see [Triggers](./triggers.md#the-flow-input)). |
| `steps.<step_id>.*` | Output of a previously completed step, by node id. Always the latest output when a step ran more than once. |
| `trigger.*` | `event_type`, `node_id`, `node_type`, `node_path`, `workspace`, `tenant_id`, `repo_id`, `branch` of whatever started the flow. For an API start, `event_type` is `manual`. |
| `output.*` | The current step's fresh output. Available in `compensation_input_mapping`. |
| `error.*` | `error_type`, `message`, `step_id`, `timestamp` when running after an `error_edge`, a `timeout_edge`, or `continue_on_fail`. |
| `visits.<step_id>` | How many times that node has been entered (1 on the first visit). Useful to bound a cycle: `visits.draft < 3`. |
| `history.<step_id>` | That node's outputs per visit, oldest first (the most recent 20 are kept). |
| *(bare names)* | Flow variables, including `__human_response`, loop item variables, and the keys of previous step outputs merged flat. |

:::note Prefer `steps.<id>.*` over bare names
Object step outputs are also merged flat into the variables, so after a step returning `{score: 8}` both `steps.score_step.score` and the bare `score` resolve. Prefer the explicit `steps.<id>.*` form, since a later step can overwrite a flat key.
:::

:::warning Name step ids in snake_case
REL identifiers only allow `[A-Za-z0-9_]`, so `steps.create-accounts.email` parses as subtraction (`steps.create - accounts.email`) and resolves to garbage. Bracket access (`steps['create-accounts'].email`) parses, but errors when the step was skipped (for example an `or` branch that did not run), whereas dot access on a missing step resolves to `null`. Use `create_accounts`, not `create-accounts`. `raisindb flow doctor` reports hyphenated dot paths as an error.
:::

## Worked Examples

From the [event-ticketing example](./examples.md#event-ticketing): a function step consuming the flow input and a previous step's output.

```yaml
- id: reserve
  node_type: raisin:FlowStep
  properties:
    action: "Reserve {{ input.quantity }}x {{ input.tier }} for {{ input.event_id }}"
    function_ref: /lib/ticketing/reserve-seats
    arguments:
      event_id: "{{ input.event_id }}"
      quantity: "${input.quantity}"     # whole-string expression keeps the number type
      tier: "{{ input.tier }}"

- id: issue
  node_type: raisin:FlowStep
  properties:
    action: "Issue tickets for {{ steps.reserve.reservation_id }}"
    function_ref: /lib/ticketing/issue-tickets
    arguments:
      reservation_id: "${steps.reserve.reservation_id}"
      quantity: "${input.quantity}"
```

A human-task step whose title and description are templated, including the output of an earlier step:

```yaml
- id: approve
  node_type: raisin:FlowStep
  properties:
    action: "Approve {{ input.quantity }}x {{ input.tier }} ticket order ({{ steps.reserve.total_price }} CHF)"
    step_type: human_task
    task_type: approval
    assignee: /users/admin
    task_description: >
      Order for event {{ input.event_id }} needs approval.
      Reservation {{ steps.reserve.reservation_id }},
      total {{ steps.reserve.total_price }} CHF.
```

The assignee can be templated too: `assignee: "${steps.lookup_owner.user_home}"`. So can the numeric task fields: `due_in_seconds: "${input.sla_seconds}"`.

## REL Conditions

`or` container rules, `decision` steps, and loop conditions use REL expressions over the same context:

```text
steps.reserve.total_price > 500
input.tier == "vip"
(input.priority >= 5 || input.urgent == true) && input.enabled == true
__human_response.action == "approve"
steps.critic.passed == false && visits.draft < 3
```

Truthiness: `false`, `null`, `0`, `0.0`, `""`, `[]`, `{}` are false; everything else is true. Combine with `&&` and `||`, not `and` and `or`.

A complete routing example. Rules are evaluated in order, the first match wins, and no match skips the container:

```yaml
- id: approval_gate
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "steps.reserve.total_price > 500", next_step: approve }
    - { condition: "input.tier == \"vip\"",           next_step: approve }
  children:
    - id: approve
      node_type: raisin:FlowStep
      properties:
        action: "Approve large or VIP order"
        step_type: human_task
        task_type: approval
        assignee: /users/admin
        options:
          - { value: approve, label: Approve, style: success }
          - { value: reject,  label: Reject,  style: danger }
```

See the [full REL reference](/docs/reference/rel) for all operators, methods, type coercion rules, and grammar.

## Human Responses

When a person or an agent assignee completes a task, the response is exposed two ways:

- As the human-task step's output: `steps.approve.*`
- As the `__human_response` variable, convenient in later conditions:

```yaml
- id: decision_gate
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "__human_response.action == \"reject\"", next_step: record_rejection }
    - { condition: "true", next_step: charge }
  children:
    # ...
```

Both carry the submitted payload plus `completed_by` and `task_path`. See [Human-in-the-Loop and the Inbox](./human-in-the-loop.md) for response payload conventions.
