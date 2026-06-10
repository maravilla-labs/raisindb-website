---
sidebar_position: 7
---

# AI Steps

Five ways to put AI into a workflow:

| Construct | Use for | Conversation | Tools |
|-----------|---------|--------------|-------|
| `ai_agent` step | Classify / extract / summarize | None (one answer) | The agent's own tools (bounded internal loop) |
| `ai_sequence` container | Agentic work: the agent decides which tools to call | Within the loop | Yes (tool loop + workflow-level tools) |
| AI-routed `or` container | Let an agent pick the branch when no REL rule matched | None | — |
| `competition` container | Several agents (different LLMs) answer the same task; a referee judges | None | Each competitor's own tools |
| `chat` step *(experimental)* | Long-running multi-turn conversations with a user | Persisted as nodes | Via the agent |

A fourth pattern — the **AI agent as a human-task assignee** — is covered in [Human-in-the-Loop](./human-in-the-loop.md#ai-agent-as-assignee).

## `ai_agent` Steps

A lightweight AI call: one agent, one answer, no conversation persistence. **The agent's own tools work**: tools configured on the agent node are executed in a bounded internal loop (default 5 iterations, `max_tool_iterations` to change). Use `ai_sequence` when you need workflow-level tools, explicit tool steps, or orchestration — the mental model: *an agent's tools travel with the agent; an `ai_sequence`'s children are additional workflow tools layered on top.*

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

- `prompt` is template-resolved against the flow context. Without a `prompt`, the handler falls back to the triggering content (`input.event.node_data.properties.content`, then `input.message`, then `input.input`).
- Output shape: `{ response, model, finish_reason, usage }` — reference the text downstream as `{{ steps.summarize.response }}`. When tools ran, `tools_used` (name, function_ref, error) and `tool_iterations` are included for auditing.
- `response_format` requests structured output; the parsed JSON lands in `structured_output`.

The agent itself is a `raisin:AIAgent` node in the functions workspace (system prompt, provider, model, temperature, tools) — see [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration).

### Giving Agents Context

An agent only sees what reaches its prompt. There are three complementary ways to give it workflow context:

1. **Templates (precise):** inject exactly the fields the agent needs — `{{ input.customer }}`, `{{ steps.reserve.total }}`, or whole objects: `"Order data: {{ input }}"`. Token-efficient and explicit.
2. **`include_context` (broad):** set `include_context: "input"` (the flow input) or `include_context: "full"` (input + all step outputs + trigger info + flow variables) on the step and the engine appends the workflow state as a JSON block to the prompt — no templating needed. Available on `ai_agent` steps, `ai_sequence` containers (inside `ai_config`), `or` routers, and `competition` containers. Agent-as-assignee human tasks always inject the full context.
3. **Tools (pull):** give the agent node-read/search tools and let it fetch details on demand — best when the relevant data is large or unknown upfront.

```yaml
- id: review
  node_type: raisin:FlowStep
  properties:
    step_type: ai_agent
    agent_ref: /agents/reviewer
    prompt: "Review this order for risk."
    include_context: full   # agent sees input + every previous step's output
```

:::tip
Prefer templates or `include_context: "input"` for routine steps — `"full"` includes every step output and can get large in long flows.
:::

:::note
A step with `agent_ref` but **without** `step_type: ai_agent` is treated as a full AI container (tool loop + conversation persistence) for backward compatibility. Always set `step_type: ai_agent` when you want the lightweight one-answer behavior.
:::

## `ai_sequence` Containers (Agentic Tool Loop)

An AI agent runs in a loop: it is called, may request tool calls, the tools execute, results are fed back, and the loop continues. **The loop ends when the agent responds without tool calls, or when `max_iterations` is reached** (the last response is then used as the final answer).

```yaml
- id: assistant
  node_type: raisin:FlowContainer
  container_type: ai_sequence
  ai_config:
    agent_ref: /agents/helper      # or "$auto" to derive from the conversation's agent_ref
    tool_mode: auto                # auto | explicit | hybrid (default auto)
    explicit_tools: []             # tool names exposed as explicit child steps (hybrid mode)
    max_iterations: 10             # default 10
    thinking_enabled: false
    on_error: stop                 # stop | continue | retry
    timeout_ms: 30000              # per-call timeout
    total_timeout_ms: 300000       # across all iterations
    # max_retries: 3                  # retry budget for failed AI calls
    # retry_delay_ms: 5000            # delay between AI-call retries
    # response_format: json           # request structured output
    # output_schema: { ... }          # JSON schema for the structured output
    # conversation_ref: <reference>   # continue an existing conversation
  children: []                     # explicit tool steps (explicit/hybrid modes)
```

Tool modes:

- `auto` — the agent's configured tools are executed internally by the loop.
- `explicit` — every tool call appears as an explicit child step.
- `hybrid` — tools listed in `explicit_tools` are explicit; the rest internal.

Output: `{ response, iterations, message_count }` under `steps.<container-id>.*`. With `response_format` / `output_schema`, the model is asked for structured output (matching the schema, if given) and `response` contains the JSON text.

While the agent streams, the flow's [SSE event stream](./examples.md#streaming-execution-events) emits `text_chunk`, `tool_call_started`, and `tool_call_completed` events alongside the usual step events.

## AI-Routed `or` Containers

Add a `router` to an [`or` container](./flow-definition.md#or--rel-routed-exactly-one-child) and an **agent picks the child** — deterministic REL rules always run first; the agent decides only when none matched (or when there are no rules at all). The agent receives your routing instructions plus the list of branches (each child's id and `action` text) and must answer with structured output `{ branch, reasoning, confidence }` — `branch` is schema-constrained to the declared child ids, so the model can never route to an invented target.

```yaml
- id: route
  node_type: raisin:FlowContainer
  container_type: or
  rules:                                    # optional - deterministic first
    - { condition: "input.amount > 10000", next_step: escalate }
  router:
    agent_ref: /agents/dispatcher
    prompt: "Order from {{ input.customer }} for {{ input.amount }} CHF. Route it."
    min_confidence: 0.6                     # below -> default_branch / skip
    default_branch: standard                # omit to skip the container instead
  children:
    - id: escalate
      node_type: raisin:FlowStep
      properties: { action: Escalate to ops, function_ref: /lib/escalate }
    - id: vip
      node_type: raisin:FlowStep
      properties: { action: VIP handling, function_ref: /lib/vip }
    - id: standard
      node_type: raisin:FlowStep
      properties: { action: Standard handling, function_ref: /lib/standard }
```

The router's decision is recorded as a step output (id `<container>__router`, or the container id when there are no rules): `{ routed_to, routed_by_agent, reasoning, confidence }` — downstream steps can reference and audit it.

:::tip
Typical use: a node-event trigger starts the flow and the agent routes by looking at the changed node in `{{ input }}`.
:::

## `competition` Containers

Every child agent (each potentially backed by a **different LLM**) answers the same task; a **referee agent** judges the answers and either accepts a winner or sends per-competitor feedback for another round (bounded by `max_rounds`, default 1 refinement round). On the final round the referee must accept. The referee's declared confidence travels in the step output — gate on it downstream exactly like a human-task confidence.

```yaml
- id: compete
  node_type: raisin:FlowContainer
  container_type: competition
  prompt: "Write a tagline for {{ input.product }}."   # shared task (templated)
  referee:
    agent_ref: /agents/referee
    min_confidence: 0.7          # below -> output.confident = false
    max_rounds: 2                # refinement rounds after the initial one
    # prompt: optional judging instructions
  children:
    - id: writer_claude
      node_type: raisin:FlowStep
      properties: { action: Claude writer, step_type: ai_agent, agent_ref: /agents/writer-claude }
    - id: writer_gpt
      node_type: raisin:FlowStep
      properties: { action: GPT writer, step_type: ai_agent, agent_ref: /agents/writer-gpt }
      # children may override the shared task with their own `prompt`
```

Refinement: the referee answers `{ action: accept|refine, winner, confidence, feedback: {<competitor>: text} }` (schema-enforced). On `refine`, only competitors **with feedback** re-answer — they see their previous answer plus the referee's notes; the others' answers stand.

Output under `steps.compete.*`: `{ response, winner, confidence, confident, reasoning, rounds, answers, models }` — `response` is the winning answer, `answers`/`models` keep every competitor's final answer and model for auditing.

The canonical low-confidence pattern is a follow-up `or` gate into a [human task](./human-in-the-loop.md):

```yaml
- id: confidence-gate
  node_type: raisin:FlowContainer
  container_type: or
  rules:
    - { condition: "steps.compete.confidence < 0.7", next_step: human_review }
  children:
    - id: human_review
      node_type: raisin:FlowStep
      properties:
        step_type: human_task
        task_type: review
        assignee: /users/editor
        action: "Review the AI tagline (referee confidence {{ steps.compete.confidence }})"
```

:::note
Competition children must be **`ai_agent` steps** with an `agent_ref` — children without one are ignored by the competition.
:::

## Chat Steps (Experimental)

:::caution Experimental
Chat steps are experimental; the configuration shape below may change between releases.
:::

A long-running, multi-turn conversation step. The flow waits between turns; conversation history is persisted as nodes (no in-memory window).

```yaml
- id: chat-session
  node_type: raisin:FlowStep
  properties:
    step_type: chat
    action: Chat Session
    chat_config:
      agent_ref: /agents/support        # primary agent (null = resolved from context)
      system_prompt: "You are a helpful support agent."   # optional
      max_turns: 50                     # default 50
      session_timeout_ms: 600000        # how long to wait for the user each turn
      handoff_targets:                  # optional sub-agent delegation
        - agent_ref: /agents/billing
          description: "Billing and invoice questions"
          condition: "input.topic == \"billing\""   # optional REL expression
      termination:
        allow_user_end: true            # user keyword can end the session (default true)
        allow_ai_end: true              # AI may declare the session complete (default true)
        end_keywords: ["goodbye", "exit"]
```

Behavior:

- Each user message increments the turn counter; reaching `max_turns` completes the step (`completion_reason: max_turns_reached`).
- `end_keywords` are matched case-insensitively against the user message when `allow_user_end` is true.
- `allow_ai_end` lets the agent end the session (the AI turn signals `end_session`).
- The TypeScript SDK's alternative shapes are accepted and normalized: handoff targets may use `trigger_condition` / `trigger_phrases`, and `termination` may use `modes` / `termination_phrases`.

For building chat UIs against flows, see [JavaScript Client — Chat](/docs/reference/javascript-client/chat).

## Putting It Together

The [`ai-approval-flow` example](./examples.md#ai-approval-flow) combines a lightweight agent step with an agent-as-assignee approval:

1. An `ai_agent` step summarizes the refund request with a templated prompt.
2. A `human_task` step assigned to `/agents/refund-approver` decides the approval — completing it automatically on a confident decision, or escalating to `/users/admin` otherwise.

```yaml
- id: summarize
  node_type: raisin:FlowStep
  properties:
    step_type: ai_agent
    agent_ref: /agents/refund-approver
    prompt: >
      Summarize this refund request in one sentence:
      customer {{ input.customer }}, amount {{ input.amount }} CHF,
      reason: {{ input.reason }}

- id: approve
  node_type: raisin:FlowStep
  properties:
    action: "Refund {{ input.amount }} CHF for {{ input.customer }}?"
    step_type: human_task
    task_type: approval
    task_description: "Summary: {{ steps.summarize.response }}"
    assignee: /agents/refund-approver
    min_confidence: 0.75
    escalation_assignee: /users/admin
    options:
      - { value: approve, label: Approve refund, style: success }
      - { value: reject,  label: Reject,         style: danger }
```

Note how the approval's `task_description` references `{{ steps.summarize.response }}` — the agent's summary becomes the context the (human or agent) approver sees.

:::note
AI agents always run real — they cannot be mocked in [test runs](./error-handling.md#test-runs-with-mocked-functions).
:::
