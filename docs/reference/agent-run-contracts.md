---
title: Agent Run Contracts
description: Wire contracts of durable agent runs — the domain reducer (raisin.agent-run.reducer/1), the tool-result envelope (raisin.tool-result/1), the projection shape and the model-turn function.
---

# Agent Run Contracts

Three JSON contracts connect an [agent run](../concepts/agent-runs.md) to the
functions that drive it. All three are language-neutral: a reducer, a tool or a
model-turn function is an ordinary RaisinDB function, in JavaScript, Starlark
or WebAssembly, whose input and output are the JSON shapes below.

| Contract id | Between |
|---|---|
| `raisin.agent-run.reducer/1` | the runtime and a run's domain reducer |
| `raisin.tool-result/1` | a tool function and the runtime (and from there the reducer) |
| model-turn function | the runtime and the function that calls the model |

**Growth rule.** Within a version, new *optional* fields may appear and both
sides ignore fields they do not know. The sets of event kinds and effect kinds
are closed per version: a new kind means a new version.

## The reducer contract

A reducer is bound when the run is created:

```json
{ "reducer": { "function_path": "/lib/myapp/my-reducer", "handler": "reduce" } }
```

`handler` is optional; it selects a named handler (for example one export of a
WebAssembly component that carries several). The runtime calls the reducer
inline, once per event, under the **deterministic execution policy**: every
host call (`raisin.*`, plugin methods, `fetch`) fails, the clock reads the
epoch and randomness is a fixed sequence.

### Request

```json
{
  "contract": "raisin.agent-run.reducer/1",
  "accept": ["raisin.agent-run.reducer/1"],
  "run": {
    "run_id": "…",
    "status": "running",
    "turn": 3,
    "last_seq": 41,
    "usage": {},
    "budgets": {},
    "open_requests": [],
    "unanswered_calls": ["call_1"],
    "scope": { "repo": "myapp", "branch": "main" },
    "subject": { "workspace": "ai", "path": "/agents/a/inbox/chats/c1" }
  },
  "state": { "…": "the reducer's own last state; null on run_started" },
  "state_rev": 7,
  "event": { "seq": 41, "kind": "tool_result", "effect_id": "7:0", "operation_id": "…", "data": {} }
}
```

Every event is derived from a persisted run event and carries its `seq`:

| `event.kind` | Comes from | `data` |
|---|---|---|
| `run_started` | the run's creation | `{input, objective?, context?}` |
| `user_input` | a consumed steer | `{steer_id, input}` |
| `model_turn_completed` | a finished model turn | `{message: {text?}, tool_calls: [{call_id, name, args}], finish_reason, usage}` |
| `tool_result` | a finished tool call, or a delivered external result | `{call_id?, tool, envelope}` (a `raisin.tool-result/1`) |
| `request_resolved` | an approval or answer | `{request_id, kind: "approval" \| "input", decision?, subject_digest?, value?, reason?}` |
| `request_closed` | an expired, cancelled or withdrawn request | `{request_id, reason}` |
| `operation_failed` | a failed operation, or one abandoned on takeover | `{error_class, retryable, outcome_unknown, message}` |
| `operation_cancelled` | a cancelled operation | `{acknowledged}` |
| `resumed` | a resume | `{from_checkpoint_no}` |
| `budget_exceeded` | a budget | `{which, limit, used}` |
| `stopped` | a stop | `{reason}` |

### Response

```json
{
  "contract": "raisin.agent-run.reducer/1",
  "state": { "…": "next state" },
  "state_rev": 8,
  "effects": [
    { "effect_id": "8:0", "kind": "call_tool", "tool": "/lib/myapp/lookup",
      "args": { "id": 42 }, "mutating": false, "replay_safe": true, "for_call_id": "call_1" }
  ],
  "projection": { "items": [{ "key": "t1", "title": "Look up order", "status": "in_progress" }] },
  "diagnostics": [],
  "refused": null
}
```

`state_rev` is the request's revision when the state is unchanged, otherwise
that revision plus one. Effect *i* must have `effect_id` `"{state_rev}:{i}"`.

| Effect `kind` | Fields | What core does |
|---|---|---|
| `call_tool` | `tool`, `args`, `mutating`, `replay_safe`, `interruptible?` (default true), `timeout_ms?`, `for_call_id?` | Starts a tool operation. `args.__raisin_context` gets `run_id` and `operation_id`. |
| `request_model_turn` | `tools_offered: [{name, kind: function\|domain, function_path?, description?, schema}]`, `instructions?`, `context?`, `tool_results?`, `output_schema?` | Starts a model turn. Core executes only `function` tools; a call to a `domain` tool comes back to the reducer. |
| `request_approval` | `subject: {kind, digest, digest_alg, summary, changes?}`, `expires_in_ms?` | Opens an approval request; the run waits. |
| `ask_user` | `question`, `choices?`, `schema?`, `expires_in_ms?` | Opens an input request; the run waits. |
| `withdraw_request` | `request_id` | Closes an open request as withdrawn. |
| `checkpoint` | `reason?`, `summary?` | Writes a checkpoint referencing the new state. |
| `complete` | `outcome: succeeded\|partial\|blocked`, `summary?`, `artifacts?`, `evidence?` | Ends the run `completed`. |
| `fail` | `code`, `message` | Ends the run `failed`. |
| `capability_gap` | `gap: {requested_outcome, missing, inspected, why_insufficient, proposed: {layer, description}, safe_alternative?}` | Records what the agent could not do. Must be followed by `complete{blocked}` or `ask_user`. |

### Validation

Every response is checked before it is applied. A violation fails the run with
`reducer_refused:<code>`:

| Code | Rule |
|---|---|
| `contract_mismatch` | `contract` is not one the request accepted. |
| `state_rev_regressed` | `state_rev` is neither the request's nor the next. |
| `effect_id_mismatch` | An effect id is not `"{state_rev}:{i}"`. |
| `multiple_operations` | More than one of `call_tool`, `request_model_turn`, `request_approval`, `ask_user`. |
| `terminal_not_exclusive` | `complete` or `fail` together with an operation effect. |
| `gap_without_follow_up` | `capability_gap` not followed by `complete{blocked}` or `ask_user`. |
| `effects_after_terminal` | After the run ended (or on `stopped`), only `checkpoint` effects are allowed; the state may still change. |
| `unknown_effect_kind` | An effect kind outside the version's set. |
| `state_too_large` | The canonical state exceeds 256 KiB. |
| `effects_without_state_change` | Effects without a state revision bump. |
| `open_requests_unresolved` | On `user_input` with open requests, the response must withdraw them all or start no operation. |
| `unanswered_tool_calls` | A model turn must answer every tool call of the previous turn (`tool_results`), and a `call_tool.for_call_id` must name an unanswered call. |
| `projection_invalid` | `projection` does not have the shape below. |

A reducer that returns `refused: {code, message}`, or throws, also fails the
run. A reducer that cannot be reached (missing, timed out, trapped) pauses the
run with `reducer_unavailable` instead, resumable after a redeploy. A reducer
whose artifact changed since the run bound it pauses with `reducer_changed`.

### Writing a deterministic reducer

- Keep a `last_event_seq` in your state and return the state unchanged, the
  same `state_rev` and no effects for an event you have already seen. A crash
  before the runtime commits your answer re-delivers the same event.
- An event whose `effect_id` is not the one you are waiting for should change
  nothing but a diagnostic.
- Compute every digest you emit (for example an approval `subject.digest`) over
  canonical JSON, never over a map's insertion order.

## Projection

```json
{
  "items": [
    { "key": "t1", "title": "Draft the article", "status": "completed", "detail": {} }
  ],
  "summary": "1 of 2 done"
}
```

Item `status` is one of `pending`, `in_progress`, `waiting`, `completed`,
`blocked`, `failed`, `stopped`, `paused`. `detail` is opaque to core. Readers
receive the effective projection: `in_progress` survives only while the run is
`running`.

## The tool-result envelope

A tool called from inside a run answers with `raisin.tool-result/1`. A result
in any other shape is wrapped by the runtime with `legacy: true`, and its
writes and evidence are then untrusted.

```json
{
  "envelope": "raisin.tool-result/1",
  "operation_id": "…",
  "status": "succeeded",
  "reads": [{ "read_id": "content:/articles/a", "locator": {}, "revision": { "value": "…", "alg": "raisin.node/1" } }],
  "writes": [{ "locator": {}, "action": "moved", "from": {}, "revision": {} }],
  "artifact_refs": [{ "kind": "node", "locator": {}, "revision": {}, "role": "primary" }],
  "evidence": [{ "kind": "read_back", "subject": { "locator": {}, "revision": {} }, "ok": true, "level": null }],
  "diagnostics": [{ "code": "stale_revision", "severity": "error", "class": "repairable", "message": "…" }],
  "suggested_next_actions": [{ "action": "read", "args": {}, "reason": "…" }],
  "retry_policy": { "retryable": false },
  "payload": { "…": "the tool's own result, opaque to core" }
}
```

| Field | Notes |
|---|---|
| `status` | `succeeded`, `waiting`, `retryable`, `blocked` or `failed`. |
| `resume_key` | Required when `status` is `waiting`. The run parks until a result is delivered for that key (for example `child:{run_id}` for a [child run](../concepts/agent-delegation.md)). |
| `reads` / `writes` | Locators `{repository?, branch?, workspace, path, node_id?}` and revisions `{value, alg}`. `writes[].action` is `created`, `updated`, `deleted` or `moved`; a move carries `from`. |
| `artifact_refs` | `role` is `primary`, `supporting` or `dependency`. A non-legacy `succeeded` result with writes must carry **exactly one** primary. |
| `evidence` | Proof about a specific revision. `kind` and `level` are open strings the domain defines. `subject.revision` must name its `alg`. |
| `diagnostics` | `code`, `severity` (`error`, `warning`, `info`), optional `class` (`repairable`, `blocking`, `transient`), `message`, `fix?`, `path?`. |

Refusal codes of the envelope validator: `envelope_mismatch`,
`waiting_without_resume_key`, `writes_without_primary`,
`evidence_revision_without_alg`.

The `ai-tools` package classifies tool errors as `invalid_input`, `not_found`,
`permission_denied`, `conflict`, `transient`, `timeout`, `rate_limited`,
`unsupported` or `tool_error`.

## Tool calls

The function at a `call_tool.tool` path receives the effect's `args`, including
`__raisin_context: {run_id, operation_id}` (merged with anything the reducer put
there; core's two values always win), and runs **as the run's principal**: a
user principal with the user's rights, an agent principal with the agent's
rights or those of the user it acts for. It never falls back to system rights.
A mutating tool should use the operation id as its idempotency key, which is
what makes it safe to mark `replay_safe`.

## The model-turn function

For `request_model_turn`, core calls a function: `executor_config.model_turn_function`
if the run set one, otherwise `/lib/raisin/ai/agent-run-model-turn` from
`ai-tools`.

Input:

```json
{
  "run_id": "…", "operation_id": "…", "attempt": 1,
  "agent_ref": "functions:/agents/assistant",
  "subject": { "workspace": "ai", "path": "…" },
  "executor_config": {},
  "request": { "tools_offered": [], "instructions": "…", "tool_results": [], "output_schema": null, "context": {} }
}
```

Output on success:

```json
{
  "message": { "text": "…" },
  "tool_calls": [{ "call_id": "call_1", "name": "lookup", "args": {} }],
  "finish_reason": "tool_calls",
  "usage": { "input_tokens": 812, "output_tokens": 64 }
}
```

Output on error: `{error_class, message, retryable?}`.

## Related

- [Agent Runs](../concepts/agent-runs.md)
- [Function API: `raisin.agentRuns`](./function-api/agent-runs.md)
- [WebAssembly ABI](./function-api/wasm-abi.md)
