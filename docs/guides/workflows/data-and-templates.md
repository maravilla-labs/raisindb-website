---
sidebar_position: 4
---

# Data & Templates

How data moves through a flow: template expressions in step properties, the context namespaces they resolve against, and REL conditions for routing.

## Template Markers

Anywhere a value supports templates (function `arguments`, agent `prompt`, human-task title/description/assignee/options, compensation mappings), two marker styles are accepted and equivalent:

- `{{ expr }}`
- `${expr}`

Both are evaluated with [REL](/docs/reference/rel) (the Raisin Expression Language) against the flow context.

## Resolution Rules

**Whole-string expressions keep their native JSON type:**

```yaml
arguments:
  amount: "${input.amount}"      # -> a number
  items: "${input.items}"        # -> the whole array
  user: "${input.user}"          # -> the whole object
```

Surrounding whitespace still counts as whole-string.

**Mixed strings interpolate:**

```yaml
arguments:
  note: "Hello {{ input.user.name }}!"   # -> string
```

Non-string values are inserted as compact JSON; `null` becomes the empty string.

**More rules:**

- Objects and arrays are resolved recursively (keys are never resolved).
- Unterminated markers (`"price is ${100"`) are left as literal text.
- Expressions can compute: `"${input.user.age + 1}"`.

## Context Namespaces

The same context is used for templates and for REL conditions (`or` container rules):

| Namespace | Meaning |
|-----------|---------|
| `input.*` | The flow input (run request body `input`, or the triggering node data). |
| `steps.<step_id>.*` | Output of a previously completed step (by node id). |
| `trigger.*` | Trigger info (event type, node path, actor, ...) when event-triggered. |
| `output.*` | The current step's fresh output — available in `compensation_input_mapping`. |
| `error.*` | Error info when running after an `error_edge` / `continue_on_fail`. |
| *(bare names)* | Flow variables, including `__human_response` and the flat-merged keys of previous step outputs. |

:::note Prefer `steps.<id>.*` over bare names
Object step outputs are *also* merged flat into the variables, so after a step returning `{score: 8}` both `steps.score_step.score` and the bare `score` resolve. Prefer the explicit `steps.<id>.*` form — flat keys can be clobbered by later steps.
:::

:::warning Name step ids in snake_case
REL identifiers only allow `[A-Za-z0-9_]`, so `steps.create-accounts.email` parses as **subtraction** (`steps.create - accounts.email`) and silently resolves to garbage. Bracket access (`steps['create-accounts'].email`) parses, but errors when the step was skipped (e.g. an OR branch that didn't run), whereas dot access on a missing step resolves to `null`. Use `create_accounts`, not `create-accounts` — `raisindb flow doctor` flags hyphenated dot paths.
:::

## Worked Examples

From the tested [event-ticketing example](./examples.md#event-ticketing): a function step consuming the flow input and a previous step's output.

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

The assignee itself can be templated: `assignee: "/users/{{ input.approver }}"`.

## REL Conditions

`or` container rules use REL expressions over the same namespaces:

```text
steps.reserve.total_price > 500
input.tier == "vip"
(input.priority >= 5 || input.urgent == true) && input.enabled == true
__human_response.action == "approve"
```

Truthiness: `false`, `null`, `0`, `0.0`, `""`, `[]`, `{}` are false; everything else is true.

A complete routing example — rules evaluated in order, first match wins, no match skips the container:

```yaml
- id: approval-gate
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "steps.reserve.total_price > 500", next_step: approve }
    - { condition: "input.tier == \"vip\"",           next_step: approve }
  children:
    - id: approve
      node_type: raisin:FlowStep
      properties:
        step_type: human_task
        task_type: approval
        assignee: /users/admin
        action: "Approve large or VIP order"
        options:
          - { value: approve, label: Approve, style: success }
          - { value: reject,  label: Reject,  style: danger }
```

See the [full REL reference](/docs/reference/rel) for all operators, methods, type coercion rules, and grammar.

## Human Responses

When a human (or agent assignee) completes a task, the response is exposed two ways:

- As the human-task step's output: `steps.approve.*`
- As the `__human_response` variable, convenient in later conditions:

```yaml
- id: decision-gate
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "__human_response.action == \"reject\"", next_step: record-rejection }
    - { condition: "true", next_step: charge }
  children:
    # ...
```

See [Human-in-the-Loop & the Inbox](./human-in-the-loop.md) for response payload conventions.
