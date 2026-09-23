---
sidebar_position: 14
title: Agent Runs
description: db.runs() over the WebSocket connection and AgentRunsApi over HTTP — find, follow, control and drive durable agent runs, spawn children and read the mailbox.
---

# Agent Runs

Two APIs expose [durable agent runs](../../concepts/agent-runs.md) in
`@raisindb/client`:

| API | Transport | Get it with | Use it for |
|---|---|---|---|
| `AgentRunsWsApi` | the WebSocket connection you already hold | `db.runs()` | UIs: find a run, follow it live, control it, list its children |
| `AgentRunsApi` | HTTP (+ SSE for streaming) | `httpClient.agentRuns(repo)` or `httpDb.agentRuns()` | servers and external agents: everything above, plus client-driven runs, child runs, mailbox, checkpoints, usage |

```typescript
import { RaisinClient, RaisinHttpClient } from '@raisindb/client';

// WebSocket
const db = client.database('myapp');
const runs = db.runs();

// HTTP
const http = new RaisinHttpClient('http://localhost:8080', { tenantId: 'default' });
const httpRuns = http.agentRuns('myapp');       // or http.database('myapp').agentRuns()
```

## Subjects

A run is about a subject node. Methods that take a subject accept
`{ workspace, path?, node_id? }` or the string form `"workspace:/path"`:

```typescript
import { subjectOf } from '@raisindb/client';

subjectOf('ai:/agents/assistant/inbox/chats/c1');
// { workspace: 'ai', path: '/agents/assistant/inbox/chats/c1' }
```

## `db.runs()` — AgentRunsWsApi

| Method | Returns |
|---|---|
| `create(options)` | `{ run_id, created, status }`; returns the subject's live run with `created: false` if there is one |
| `get(runId)` | `AgentRunView` (`{ run, status, projection }`) |
| `bySubject(subject, limit = 20)` | every run of the subject you may see, the live one first |
| `latest(subject)` | the newest run of the subject, or `null` |
| `list(status = 'running', limit = 50)` | your runs in one status |
| `events(runId, afterSeq = 0, limit = 500)` | durable events after `afterSeq` |
| `children(runId)` | `[{ link, status, usage }]` |
| `control(runId, command, controlId?, capability?)` | `AgentRunControlAck` |
| `stop(runId, reason?, controlId?)` | ack |
| `pause(runId, controlId?)` | ack |
| `resume(runId, controlId?)` | ack |
| `steer(runId, input, controlId?)` | ack; the input is consumed at the next safe boundary |
| `approve(runId, requestId, subjectDigest, reject?, controlId?)` | ack; pass `{ reason }` as `reject` to reject |
| `answer(runId, requestId, value, controlId?)` | ack |
| `subscribe(runId, { afterSeq?, onEvent?, onEnd?, signal? })` | `AgentRunSubscription` |

### subscribe()

`subscribe` is gap-free and resumable. It registers the listener first, then
replays the durable log after `afterSeq`, holding live events until the
replay is merged, so every `seq` is delivered exactly once and in order even
when events arrive during the subscribe call. It ends when the run has ended
and its log is complete.

```typescript
const [live] = await runs.bySubject('ai:/agents/assistant/inbox/chats/c1');
const sub = await runs.subscribe(live.run.run_id, { afterSeq: 0 });

for await (const ev of sub) {
  console.log(ev.seq, ev.kind.type);
}
// After a reconnect, resume from sub.lastSeq.
```

The subscription object:

```typescript
interface AgentRunSubscription extends AsyncIterable<AgentRunEvent> {
  readonly lastSeq: number;   // the last seq delivered
  readonly done: Promise<void>;
  unsubscribe(): Promise<void>;
}
```

Instead of iterating, pass `onEvent` and `onEnd(lastSeq)` callbacks, and an
`AbortSignal` to stop following.

## AgentRunsApi (HTTP)

It has the same read and control methods as `db.runs()` (`create`, `get`,
`bySubject`, `list`, `events`, `control`, `stop`, `pause`, `resume`, `steer`,
`approve`, `answer`), plus:

### stream()

```typescript
for await (const ev of httpRuns.stream(runId, afterSeq, abortSignal)) {
  // one AgentRunEvent per SSE `run-event`; the generator returns at `end`
}
```

### Client-driven runs

| Method | Wraps |
|---|---|
| `acquire(runId)` | `POST …/lease/acquire` → `{ owner, epoch }` (the fence) |
| `renew(runId, fence)` / `release(runId, fence)` | lease renew / release |
| `begin(runId, fence, { kind, input?, replay_safe?, non_interruptible?, for_call_id?, answers? })` | begin an operation → `{ op_id, … }` |
| `finish(runId, fence, opId, { outcome, payload?, tool_calls?, usage?, resume_key? })` | finish it |
| `wait(runId, fence, requests)` | open approval, input or child requests and wait |
| `complete(runId, fence, 'completed' \| 'failed', { kind, code?, message?, detail? })` | end the run |

See [Drive an Agent Run from a Client](../../guides/ai/drive-an-agent-run.md)
for a complete loop.

### Child runs, mailbox, checkpoints

| Method | Notes |
|---|---|
| `spawnChild(runId, options)` | `options`: `objective` (required), `budgets`, `onExceeded` (default `'fail'`), `spawnKey`, `subject`, `asAgent`, `agentRef`, `input`, `executorConfig`, `reducer`, `inheritReducer`, `branch`. Returns `{ child_run_id, child_no, created, budgets, resume_key }`. |
| `children(runId)` | the parent's child list |
| `inspectChild(runId, childId, afterSeq?, limit?)` | `{ run, events, usage, checkpoint? }` |
| `controlChild(runId, childId, action, controlId?)` | `action`: `{ action: 'message', message }`, `{ action: 'steer', input }`, `{ action: 'interrupt', mode?, reason? }`, `{ action: 'resume' }` |
| `messageChild`, `steerChild`, `interruptChild(runId, childId, reason?, mode = 'stop')` | shortcuts for `controlChild` |
| `waitChild(runId, childId, fence, expiresAtMs?)` | a client-driven parent waits for a child |
| `mailbox(runId)` | `MailboxEntry[]` |
| `ackMailbox(runId, upTo)` | `{ remaining }` |
| `postToParent(runId, messageId, message)` | `{ mail_no }` |
| `checkpoint(runId, { fence?, operationId?, reason?, summary?, transcriptCutoff?, state?, largeRefs? })` | writes a checkpoint |
| `readCheckpoint(runId, n?)` | `{ checkpoint, state }`; the latest when `n` is omitted |
| `usage(runId)` | own, children, reserved, total and spare usage |

A `ChildObjective` is:

```typescript
interface ChildObjective {
  title: string;
  instructions?: string;
  context?: { mode: 'none' }
          | { mode: 'recent_turns'; turns: number; items?: unknown[] }
          | { mode: 'snapshot'; checkpoint_no?: number; data?: unknown };
  allowed_tools?: string[];      // function paths; a trailing * is a prefix
  allowed_writes?: Array<{ workspace: string; path?: string; ops?: string[] }>;
  expected_artifacts?: Array<{ kind: string; locator?: unknown; description?: string; required?: boolean }>;
  acceptance_checks?: Array<{ id: string; description?: string; check?: unknown; required?: boolean }>;
  hand_back?: { required_fields?: string[]; schema?: unknown; description?: string };
}
```

## Control ids

Every control takes an optional `controlId`. Without one, a fresh id is
generated with `newControlId()`. To retry safely after a network error, create
the id yourself and send the **same** id again: the server answers
`{ ack: 'duplicate', original_seq }` instead of applying the control twice.

```typescript
import { newControlId } from '@raisindb/client';

const id = newControlId('stop');
await runs.stop(runId, 'user pressed stop', id);
await runs.stop(runId, 'user pressed stop', id);   // duplicate, no second stop
```

## Types

Exported types: `AgentRunView`, `AgentRunEvent`, `AgentRunStatus`,
`AgentRunCommand`, `AgentRunControlAck`, `AgentRunFence`, `AgentRunSubject`,
`AgentRunSubscription`, `AgentRunSubscribeOptions`, `AgentRunChildView`,
`CreateAgentRunOptions`, `CreateAgentRunResult`, `BeginOperationOptions`,
`FinishOperationOptions`, `AgentRunsTransport`, and the
child-run types `ChildObjective`, `ChildContext`, `ChildAction`,
`SpawnChildOptions`, `SpawnChildResult`, `MailboxEntry`, `CheckpointOptions`.

`CreateAgentRunOptions`:

```typescript
interface CreateAgentRunOptions {
  subject: { workspace: string; path: string; node_id?: string | null };
  branch?: string;
  agentRef?: string;
  createKey?: string;
  budgets?: Record<string, unknown>;
  input?: unknown;
  reducer?: { function_path: string; handler?: string };   // omit for client-driven
  executorConfig?: Record<string, unknown>;
  controlCapability?: string;
  asAgent?: string;
}
```

## Related

- [Agent Runs API (HTTP and WebSocket)](../http-api/agent-runs-api.md)
- [Node Development](./node-dev.md)
