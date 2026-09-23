---
sidebar_position: 10
title: Drive an Agent Run from a Client
description: Follow and control a server-driven agent run from a UI, and drive a client-driven run from an external agent with durable, fenced operations.
---

# Drive an Agent Run from a Client

This guide shows two ways a client works with a
[durable agent run](../../concepts/agent-runs.md) through `@raisindb/client`:

1. **Follow and control a server-driven run**, for example the run behind a
   conversation: find it, stream its events, steer it, answer its approval,
   stop it.
2. **Drive a client-driven run** from an external agent: your process calls the
   model and the tools, and RaisinDB keeps the run's state durable, fenced and
   controllable by others.

You need an authenticated client and a repository. The WebSocket API is
`db.runs()`; the HTTP API is `http.agentRuns(repo)`. See the
[reference](../../reference/javascript-client/agent-runs.md) for every method.

## Part 1: follow and control a server-driven run

### Find the run

Every run is about a subject node. A conversation's run is about the
conversation node:

```typescript
const db = client.database('myapp');
const runs = db.runs();

const conversation = 'ai:/agents/assistant/inbox/chats/c1';
const view = await runs.latest(conversation);
if (!view) throw new Error('no run for this conversation yet');

const runId = view.run.run_id;
console.log(view.status, view.projection?.items);
```

`bySubject` returns every run of the subject, the live one first, if you want
the history too.

### Stream its events

```typescript
const sub = await runs.subscribe(runId, {
  afterSeq: 0,
  onEnd: (lastSeq) => console.log('run finished at seq', lastSeq),
});

for await (const ev of sub) {
  switch (ev.kind.type) {
    case 'operation_started':
      console.log('working:', ev.kind.kind);
      break;
    case 'steer_queued':
    case 'steer_consumed':
      console.log(ev.kind.type, ev.kind.steer_id);
      break;
    case 'request_opened':
      await onRequest(ev.kind.request as OpenRequest);
      break;
    case 'terminal':
      console.log('outcome:', ev.kind.outcome);
      break;
  }
}
```

Keep `sub.lastSeq`. After a reconnect, subscribe again with
`afterSeq: sub.lastSeq` and you receive every later event exactly once.

### Steer it

```typescript
const ack = await runs.steer(runId, { text: 'Use the 2025 figures instead' });
// { ack: 'applied', seq } — the input is queued now and consumed at the next
// safe boundary; watch for steer_queued, then steer_consumed.
```

### Answer an approval or a question

A reducer that needs a decision opens a request. The `request_opened` event
carries the full request, including the digest an approval must quote:

```typescript
type OpenRequest = {
  request_id: string;
  kind:
    | { kind: 'approval'; subject_digest: string; digest_alg: string; summary: string; changes?: unknown }
    | { kind: 'input'; prompt: string; choices?: unknown[] };
};

async function onRequest(req: OpenRequest) {
  if (req.kind.kind === 'approval') {
    const ok = await askPerson(req.kind.summary, req.kind.changes);
    await runs.approve(
      runId,
      req.request_id,
      req.kind.subject_digest,          // ties the approval to exactly this change
      ok ? undefined : { reason: 'Not now' },
    );
  } else if (req.kind.kind === 'input') {
    await runs.answer(runId, req.request_id, await askPerson(req.kind.prompt));
  }
}
```

If the change was revised after the person looked at it, the digest no longer
matches and the approval is rejected with `digest_mismatch`: nobody can
approve something they did not see.

### Pause, resume, stop

```typescript
await runs.pause(runId);                  // pauses at the next boundary, with a checkpoint
await runs.resume(runId);
await runs.stop(runId, 'user pressed stop');
```

Controls are idempotent per control id. To retry after a network failure,
generate the id once with `newControlId()` and send the same id again.

A budget pause looks like any other pause, with `status_reason`
`budget_exceeded:<which>`. Resume it with more budget through `control`:

```typescript
await runs.control(runId, { command: 'resume', budget_increase: { max_model_calls: 20 } });
```

## Part 2: drive a client-driven run

A run created **without a reducer** is yours to drive. You still get a durable
event log, idempotent controls that other people can use, budgets, and
recovery: if your process dies, its lease expires and nothing it does
afterwards can corrupt the run.

This uses the HTTP API, which has the driver methods:

```typescript
import { RaisinHttpClient } from '@raisindb/client';

const http = new RaisinHttpClient('http://localhost:8080', { tenantId: 'default' });
await http.authenticate({ username, password });
const runs = http.agentRuns('myapp');
```

### Create the run

```typescript
const { run_id: runId } = await runs.create({
  subject: { workspace: 'content', path: '/articles/launch' },
  createKey: 'external-review:launch:1',     // a retried create returns the same run
  budgets: { max_model_calls: 20, max_wall_ms: 15 * 60_000, on_exceeded: 'pause' },
  input: { task: 'Review the launch article' },
});
```

### Take the lease and run operations

Each unit of work is an operation, begun and finished under the lease's
fence:

```typescript
let fence = await runs.acquire(runId);                 // { owner, epoch }

const turn = await runs.begin(runId, fence, {
  kind: 'model_turn',
  input: { prompt: 'Review the launch article' },
  replay_safe: true,
});
const answer = await callYourModel(/* … */);
await runs.finish(runId, fence, turn.op_id, {
  outcome: 'succeeded',
  payload: { text: answer.text },
  tool_calls: answer.toolCalls.map((c) => c.id),       // the calls this turn asked for
  usage: { input_tokens: answer.inputTokens, output_tokens: answer.outputTokens },
});

for (const call of answer.toolCalls) {
  const op = await runs.begin(runId, fence, {
    kind: 'tool_call',
    input: call,
    for_call_id: call.id,
    replay_safe: false,                                // mutating and not idempotent
  });
  const result = await runYourTool(call);
  await runs.finish(runId, fence, op.op_id, { outcome: 'succeeded', payload: result });
}
```

Things the server enforces for you:

- `begin` is refused when a budget is exhausted, when the run was stopped or
  paused, or when your fence is stale.
- Queued steers are consumed when you call `begin`: read the
  `steer_consumed` events (they carry the input) before you build the next
  prompt.
- A model turn must be answered: every tool call it listed in `tool_calls`
  needs a `tool_call` operation with that `for_call_id`, or a later
  operation that lists it in `answers`.

### Keep the lease alive and honour stops

The lease lasts 90 seconds. Renew it while a long operation runs, and treat
the returned status as a signal:

```typescript
const status = await runs.renew(runId, fence);
if (status === 'cancelling') {
  abortCurrentWork();                                  // someone pressed stop
}
```

When a stop lands during an operation, the run is `cancelling`; finish the
operation (with `outcome: 'cancelled'` if you aborted it) and the run becomes
`stopped`. Any further call with the old fence is refused.

### Ask a person

```typescript
await runs.wait(runId, fence, [{
  kind: 'approval',
  subject_digest: digestOf(plannedChange),             // e.g. a changeset digest
  digest_alg: 'sha256',
  summary: 'Publish the reviewed article',
  changes: plannedChange,
}]);
// The run is now `waiting` and holds no lease.
```

Follow the run with `stream(runId, lastSeq)`. When `request_resolved`
arrives, the run is `queued` again: `acquire` a new fence and continue with
the decision from the event's `resolution`.

To make the change itself reviewable and conflict-safe, plan it with the
[node-development surface](../../concepts/node-development.md): `propose`
returns a digest, the person approves that digest, and `commit` with
`expected_digest` writes exactly what was approved.

### Finish

```typescript
await runs.complete(runId, fence, 'completed', {
  kind: 'succeeded',
  message: 'Reviewed; 3 fixes committed',
});
```

Use `'failed'` with an outcome `code` when the task cannot be completed. The
run is now terminal; its event log remains readable, and any further control
is rejected with `run_terminal`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `created: false` on create | The subject already has a live run, or the `createKey` was used before. Steer or stop that run instead. |
| A control returns `{ ack: 'rejected', reason: 'unauthorized' }` | You are neither the run's principal nor the user it acts for, and you did not pass its control capability. |
| `digest_mismatch` on approve | The change was revised after you displayed it. Show the new request. |
| Driver calls fail after a pause in your process | Your lease expired and was taken over or released. Acquire a new fence. |
| The run pauses with `reducer_unavailable` | A server-driven run's reducer function is missing or failed to load. Redeploy it and `resume`. |

## Related

- [Agent Runs](../../concepts/agent-runs.md)
- [Agent Runs API (HTTP and WebSocket)](../../reference/http-api/agent-runs-api.md)
- [JavaScript client: Agent Runs](../../reference/javascript-client/agent-runs.md)
