---
title: Agent Runs API
description: HTTP routes, the SSE event stream and the WebSocket request types for durable agent runs.
---

# Agent Runs API

Create, read, follow and control [agent runs](../../concepts/agent-runs.md)
over HTTP or the WebSocket connection. Both transports are thin adapters over
the same core API, so the rules (who may see or control a run, lease fencing,
idempotency) are identical everywhere.

All HTTP routes require authentication; anonymous callers are refused. The
tenant comes from the usual tenant header. Every route accepts `?branch=`
(default `main`), the branch the run executes on. Errors are
`{ "code": "…", "message": "…" }` with status 400, 403, 404, 409, 422 or 503.

A caller sees a run when it is the run's principal, the user the run acts for,
or a system caller. Controls additionally accept the run's control capability.

## Runs

### Create a run

```
POST /api/agent-runs/{repo}
```

```json
{
  "subject": { "workspace": "content", "path": "/articles/launch" },
  "reducer": { "function_path": "/lib/myapp/review-reducer" },
  "as_agent": "functions:/agents/reviewer",
  "create_key": "review-launch-1",
  "input": { "text": "Review the launch article" },
  "budgets": { "max_model_calls": 20, "on_exceeded": "pause" },
  "executor_config": { "node_dev": { "roots": [{ "workspace": "content", "path": "/articles" }] } },
  "control_capability": "a-secret-for-a-second-controller"
}
```

| Field | Notes |
|---|---|
| `subject` | Required. `{workspace, path, node_id?}`. One live run per subject. |
| `reducer` | `{function_path, handler?}`. Present: server-driven. Absent: client-driven. |
| `agent_ref` | Opaque agent reference stored on the run. |
| `as_agent` | Run as this agent (`"ws:/path"` or `"/path"`) on the caller's behalf. |
| `on_behalf_of` | The user the run acts for. Honoured for system callers only. |
| `create_key` | Idempotency key: a retried create returns the same run. |
| `input` | Delivered to the reducer as `run_started.data.input`. |
| `budgets` | `max_turns`, `max_operations`, `max_model_calls`, `max_total_tokens`, `max_wall_ms`, `max_consecutive_op_failures`, `max_children`, `max_live_children`, `max_depth`, `on_exceeded` (`pause` default, or `fail`). |
| `executor_config` | Opaque to core. Known keys: `model_turn_function`, `node_dev.roots` (the run's [write grant](../../concepts/node-development.md#working-roots-and-grants)), `allowed_tools`. |
| `control_capability` | A secret whose holder may control the run (stored hashed). |
| `branch` | Branch the run executes on (default `main`). |

Response:

```json
{ "run_id": "01J…", "created": true, "status": "queued" }
```

`created: false` means the subject already had a live run, or the create key
was used before; the existing run is returned.

### List runs

```
GET /api/agent-runs/{repo}?status=running&limit=50
GET /api/agent-runs/{repo}?subject=ai:/agents/a/inbox/chats/c1[&subject_node_id=…][&status=…][&limit=…]
```

Without `subject`: your runs in one status (default `running`, `limit` up to
500). With `subject` (`"{workspace}:{path}"`): every run about that node,
the live one first, then newest first. Runs keyed by the node id and by the
path are both found.

### Read a run

```
GET /api/agent-runs/{repo}/{run}
```

Returns a `RunView`:

```json
{
  "run": { "run_id": "…", "status": "…", "principal": {}, "subject": {}, "last_seq": 41,
           "budgets": {}, "usage": {}, "children": [], "mailbox": [], "…": "…" },
  "status": "waiting",
  "projection": { "items": [], "summary": "…" }
}
```

`run` is the full run record without the capability hash. `projection` is the
[effective projection](../../concepts/agent-runs.md#projections).

### Read events

```
GET /api/agent-runs/{repo}/{run}/events?after_seq=0&limit=500
```

Returns durable events in `seq` order, gap-free (`limit` up to 5000):

```json
[{ "run_id": "…", "seq": 12, "at_ms": 1790000000000, "turn": 2, "op_id": "…",
   "kind": { "type": "steer_consumed", "steer_id": "…", "turn": 2 } }]
```

Event `kind.type` values include `run_created`, `status_changed`,
`turn_started`, `turn_ended`, `operation_started`, `operation_completed`,
`operation_cancelled`, `operation_abandoned`, `control_received`,
`control_applied`, `control_rejected`, `steer_queued`, `steer_consumed`,
`steer_discarded`, `request_opened`, `request_resolved`, `request_closed`,
`resumed`, `checkpoint_written`, `budget_exceeded`, `lease_acquired`,
`lease_taken_over`, `lease_released`, `domain_applied`, `terminal`, and for
delegation `child_spawned`, `child_handback`, `handback_delivered`,
`mail_posted`, `mailbox_acked`, `child_controlled`, and `waiter_notified`
when a waiting flow instance has been handed the run's result.

### Stream events (SSE)

```
GET /api/agent-runs/{repo}/{run}/stream?after_seq=0
```

Replays the log after `after_seq`, then follows it live. Each event is sent as
`event: run-event` with `id: <seq>` and the event as `data`. Reconnect with
`Last-Event-ID` (or `after_seq`) to resume exactly after the last event you
saw. The stream ends with `event: end` once the run is terminal and its log is
complete; failures arrive as `event: error`. Commits made on other cluster
nodes are picked up by polling every two seconds.

### Control a run

```
POST /api/agent-runs/{repo}/{run}/control
```

```json
{ "control_id": "ctl-7f3a", "command": { "command": "steer", "input": { "text": "Use the 2025 figures" } } }
```

| `command` | Fields |
|---|---|
| `stop` | `reason?` |
| `pause` | |
| `resume` | `budget_increase?`, `accept_reducer_change?` |
| `steer` | `input` |
| `approve` | `request_id`, `decision: {decision: "approve"}` or `{decision: "reject", reason?}`, `subject_digest` |
| `provide_input` | `request_id`, `value` |

Add `capability` to control a run you are not the principal of. The answer is
a `ControlAck`: `{ack: "applied", seq}`, `{ack: "duplicate", original_seq}` or
`{ack: "rejected", reason, seq}`. Rejection reasons include `unauthorized`,
`run_terminal`, `digest_mismatch`, `control_id_reused` and `steer_queue_full`.

Named shortcuts take a flat body:

```
POST /api/agent-runs/{repo}/{run}/{stop|pause|resume|steer|approve|answer}
```

```json
{ "control_id": "ctl-9", "request_id": "req-2", "decision": "approve", "subject_digest": "sha256:…" }
```

Body fields: `control_id` (required), `capability?`, `reason?`, `input?`,
`request_id?`, `decision?` (`approve` default, or `reject`),
`subject_digest?`, `value?`, `accept_reducer_change?`.

## Client-driven runs

A run created without a reducer is driven by the client, which holds a lease
and presents its fence `{owner, epoch}` on every call.

| Route | Body | Returns |
|---|---|---|
| `POST …/{run}/lease/acquire` | `{}` | `{owner, epoch}` |
| `POST …/{run}/lease/renew` | `{fence}` | status |
| `POST …/{run}/lease/release` | `{fence}` | status |
| `POST …/{run}/operations` | `{fence, kind, input?, replay_safe?, non_interruptible?, for_call_id?, answers?}` | the active operation, with its `op_id` |
| `POST …/{run}/operations/finish` | `{fence, op_id, outcome, payload?, tool_calls?, usage?, resume_key?}` | status |
| `POST …/{run}/wait` | `{fence, requests: [...]}` | status |
| `POST …/{run}/complete` | `{fence, status: "completed" \| "failed", outcome: {kind, code?, message?, detail?}}` | status |

`kind` is `model_turn`, `tool_call`, `compaction` or a custom string.
`outcome` is `succeeded`, `waiting`, `retryable`, `blocked`, `failed` or
`cancelled`. `tool_calls` lists the call ids a model turn asked for; `answers`
lists the call ids an operation answers. Wait requests are
`{kind: "approval", subject_digest, digest_alg, summary, scope?, changes?}`,
`{kind: "input", prompt, choices?, schema?}` or `{kind: "child", child_run_id}`,
each with an optional `expires_at_ms`.

A call with a stale fence is refused: another worker, or a stop, has taken the
run from you.

## Child runs

See [Agent Delegation](../../concepts/agent-delegation.md) for the model.

| Route | Purpose |
|---|---|
| `POST …/{run}/children` | Spawn a child. |
| `GET …/{run}/children` | `[{link, status, usage}]`. |
| `GET …/{run}/children/{child}?after_seq=&limit=` | `{run, events, usage, checkpoint?}`. |
| `POST …/{run}/children/{child}/control` | `{control_id, action, …}`: `message` (`message`), `steer` (`input`), `interrupt` (`mode?: stop \| pause`, `reason?`), `resume`. Returns a `ControlAck`. |
| `POST …/{run}/children/{child}/wait` | `{fence, expires_at_ms?}`: a client-driven parent waits for the child. Refused with `child_already_completed` or `unknown_child`. |
| `GET …/{run}/mailbox` | `[{item: {mail_no, kind: completion \| message, from_run, seq, result_key, status?}, payload}]`. |
| `POST …/{run}/mailbox/ack` | `{up_to}` → `{remaining}`. |
| `POST …/{run}/post-to-parent` | `{message_id, message}` (≤ 64 KiB) → `{mail_no}`. |
| `POST …/{run}/checkpoints` | `{fence?, operation_id?, reason?, summary?, transcript_cutoff?, state?, large_refs?}` → the checkpoint. |
| `GET …/{run}/checkpoints/{n\|latest}` | `{checkpoint, state}`. |
| `GET …/{run}/usage` | `{own, children, reserved, total, counted, budgets, spare}`. |

Spawn body:

```json
{
  "objective": {
    "title": "Summarize the Q3 support tickets",
    "instructions": "Group by product area, at most 10 bullets.",
    "context": { "mode": "recent_turns", "turns": 4, "items": [] },
    "allowed_tools": ["/lib/raisin/node-dev/node-read", "/lib/myapp/tickets-*"],
    "allowed_writes": [],
    "expected_artifacts": [{ "kind": "summary", "required": true }],
    "acceptance_checks": [{ "id": "ten-bullets", "description": "at most 10 bullets" }],
    "hand_back": { "required_fields": ["summary"] }
  },
  "budgets": { "max_model_calls": 10 },
  "on_exceeded": "fail",
  "spawn_key": "q3-summary",
  "reducer": { "function_path": "/lib/raisin/ai/agent-run-reducer" }
}
```

Other optional fields: `subject`, `as_agent`, `agent_ref`, `input`,
`executor_config`, and `inherit_reducer: true` to run the child on the
parent's reducer. Response:

```json
{ "child_run_id": "…", "child_no": 1, "created": true, "budgets": {}, "resume_key": "child:…" }
```

## WebSocket requests

The same operations are available on the WebSocket connection, as requests
whose `type` is one of the values below. The repository comes from the
request context (`context.repository` is required; `context.branch` is
optional); the caller is the connection's authenticated user, and anonymous
connections are refused.

| `type` | Payload | Result |
|---|---|---|
| `agent_run_create` | a create body as above | `{run_id, created, status}` |
| `agent_run_get` | `{run_id}` | `RunView` |
| `agent_run_by_subject` | `{workspace, path?, node_id?, limit?}` | `[RunView]`, live run first |
| `agent_run_list` | `{status?, limit?}` | `[RunView]` |
| `agent_run_events` | `{run_id, after_seq?, limit?}` | `[RunEvent]` |
| `agent_run_subscribe` | `{run_id, after_seq?}` | `{subscription_id, run_id}` |
| `agent_run_unsubscribe` | `{subscription_id}` | `{success, stopped}` |
| `agent_run_control` | `{run_id, control_id, command, capability?}` | `ControlAck` |
| `agent_run_children` | `{run_id}` | `[{link, status, usage}]` |

After `agent_run_subscribe`, the server replays events after `after_seq` and
then follows the durable log, sending event messages with `event_type`
`agent_run_event` (payload: a `RunEvent`) and, once the run has ended and its
log is complete, one `agent_run_end` (payload `{type: "end", last_seq}`). The
subscription re-reads the log every two seconds so commits from other cluster
nodes arrive too, and stops on end, unsubscribe or disconnect.

The JavaScript client wraps these requests in
[`db.runs()`](../javascript-client/agent-runs.md).
