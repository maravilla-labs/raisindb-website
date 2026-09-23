---
sidebar_position: 4
title: raisin.agentRuns
description: Function bindings for durable agent runs — create, read, control, deliver external results, spawn and manage child runs, mailbox, checkpoints and usage.
---

# `raisin.agentRuns`

Create and manage [agent runs](../../concepts/agent-runs.md) from inside a
function. The bindings exist in every runtime: `raisin.agentRuns.*` in
JavaScript (QuickJS), and `raisin.agent_runs.*` with snake_case method names in
the generated guest SDKs (Rust `raisin_sdk::agent_runs::spawn_child(request)`,
plus typed `*_as<T>` variants; the Go, AssemblyScript and TypeScript guest
SDKs are generated from the same registry methods, `agent_runs_*`). Each method
takes **one request object** and returns the same JSON the
[HTTP API](../http-api/agent-runs-api.md) returns. The JavaScript calls are
synchronous.

**Who is calling.** The caller is the function's own auth context: the user it
runs for, or the system when the function runs with
`execution_context: system` (a trigger, for example). A system caller is
treated as an admin.

**Branch.** A run created from a function defaults to the function's own
branch.

**Inside a tool call.** Where a method names a run and the request has no
`run_id`, the binding reads `__raisin_context.run_id` from the request. A tool
called by a run passes its own input's `__raisin_context` through, and then
`spawnChild` spawns a child *of the calling run*. Anonymous callers are
refused.

## Runs

| JavaScript | Request | Notes |
|---|---|---|
| `create(req)` | the [create body](../http-api/agent-runs-api.md#create-a-run) | `{run_id, created, status}` |
| `get(req)` | `{run_id, branch?}` | `RunView` |
| `events(req)` | `{run_id, after_seq?, limit?}` | `RunEvent[]` |
| `control(req)` | `{run_id, control_id, command, capability?}` | `ControlAck` |
| `deliver(req)` | `{run_id, resume_key, delivery_id, envelope}` | System context only. Completes a tool call that answered `waiting` with that `resume_key`. Idempotent by `delivery_id`. |

```js
// Start (or find) a review run for a node, as the reviewer agent,
// on behalf of the user this function runs for.
export function handler(input) {
  return raisin.agentRuns.create({
    subject: { workspace: 'content', path: input.path },
    reducer: { function_path: '/lib/raisin/ai/agent-run-reducer' },
    as_agent: 'functions:/agents/reviewer',
    create_key: `review:${input.path}:${input.revision}`,
    input: { text: `Review ${input.path}` },
  });   // { run_id, created, status }
}
```

A function running with `execution_context: system` may add `on_behalf_of`
to create the run for a specific user.

## Child runs

| JavaScript | Request |
|---|---|
| `spawnChild(req)` | `{run_id?, objective, budgets?, on_exceeded?, spawn_key?, subject?, as_agent?, agent_ref?, input?, executor_config?, reducer?, inherit_reducer?}` → `{child_run_id, child_no, created, budgets, resume_key}` |
| `children(req)` | `{run_id?}` → `[{link, status, usage}]` |
| `inspectChild(req)` | `{run_id?, child_run_id, after_seq?, limit?}` |
| `controlChild(req)` | `{run_id?, child_run_id, control_id, action, …}` (`message`, `steer`, `interrupt`, `resume`) |
| `waitChild(req)` | `{run_id?, child_run_id, fence, expires_at_ms?}` |
| `mailbox(req)` | `{run_id?}` → mailbox entries |
| `ackMailbox(req)` | `{run_id?, up_to}` → `{remaining}` |
| `postToParent(req)` | `{run_id?, message_id, message}` → `{mail_no}` |
| `checkpoint(req)` | `{run_id?, operation_id?, fence?, reason?, summary?, transcript_cutoff?, state?, large_refs?}`; `operation_id` defaults to `__raisin_context.operation_id` |
| `readCheckpoint(req)` | `{run_id?, checkpoint_no?}` → `{checkpoint, state}` |
| `usage(req)` | `{run_id?}` |

The objective is described in [Agent Delegation](../../concepts/agent-delegation.md#the-typed-objective).

### Recipe: a delegation tool

A tool that starts a child and hands the result back to the model when the
child is done needs no polling. Spawn, then answer `waiting` with the resume
key core returned; core completes the tool call with the child's hand-back
envelope when it ends.

```js
export function handler(input) {
  const ctx = input.__raisin_context || {};
  const child = raisin.agentRuns.spawnChild({
    __raisin_context: ctx,                          // the calling run is the parent
    spawn_key: `summarize:${ctx.operation_id}`,     // a retry returns the same child
    objective: {
      title: 'Summarize the attached tickets',
      instructions: input.instructions,
      context: { mode: 'none' },
      allowed_tools: ['/lib/raisin/node-dev/node-read'],
      allowed_writes: [],
      hand_back: { required_fields: ['summary'] },
    },
    as_agent: 'functions:/agents/summarizer',
    reducer: { function_path: '/lib/raisin/ai/agent-run-reducer' },
    budgets: { max_model_calls: 10 },
  });
  return {
    envelope: 'raisin.tool-result/1',
    operation_id: ctx.operation_id,
    status: 'waiting',
    resume_key: child.resume_key,                   // "child:<id>"
    payload: { child_run_id: child.child_run_id },
  };
}
```

## Related

- [Agent Run Contracts](../agent-run-contracts.md): the reducer and tool-result envelope
- [`raisin.nodeDev`](./node-dev.md)
