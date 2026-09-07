---
sidebar_position: 6
---

# Flows

Execute server-side workflows, stream their progress, and complete inbox tasks.

## FlowClient

The `FlowClient` runs flows over HTTP and streams events over SSE. Use it for long-running workflows, background jobs, and human-in-the-loop processes.

### Creating a FlowClient

From an authenticated `RaisinHttpClient`:

```typescript
import { RaisinHttpClient, FlowClient } from '@raisindb/client';

const client = new RaisinHttpClient(BASE_URL, { tenantId: 'default' });
await client.authenticate({ username, password });

const flows = FlowClient.fromHttpClient(client, BASE_URL, 'myapp');
```

Or through a `Database` from the WebSocket `RaisinClient`, which carries HTTP context:

```typescript
const db = client.database('myapp');
const flows = db.flow;
```

The `db.flow` getter returns a lazily created, cached `FlowClient` configured with the base URL, repository, and auth manager. When created this way it routes `run`, `getInstanceStatus`, `resume`, and event streaming over the WebSocket connection instead of HTTP and SSE.

The constructor is also public: `new FlowClient(baseUrl, repository, authManager, options?, flowsApi?)`.

### Options

```typescript
interface FlowClientOptions {
  requestTimeout?: number;   // milliseconds, default 60000
  fetch?: typeof fetch;
}
```

---

## Methods

### run()

Start a flow and return as soon as it is queued.

```typescript
async run(
  flowPath: string,
  input?: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<FlowRunResponse>
```

```typescript
interface FlowRunResponse {
  instance_id: string;
  job_id: string;
  status: string;   // "queued"
}
```

### runAndWait()

Start a flow, stream its events, and return the terminal outcome.

```typescript
async runAndWait(
  flowPath: string,
  input?: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<FlowRunResult>
```

```typescript
interface FlowRunResult {
  instanceId: string;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
}
```

### runAndCollect()

Start a flow and collect all events into an array.

```typescript
async runAndCollect(
  flowPath: string,
  input?: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<FlowCollectResult>
```

```typescript
interface FlowCollectResult {
  instanceId: string;
  events: FlowExecutionEvent[];
}
```

### streamEvents()

Stream events from a running flow as an async iterable. The stream ends after `flow_completed` or `flow_failed`.

```typescript
async *streamEvents(
  instanceId: string,
  options?: { signal?: AbortSignal }
): AsyncIterable<FlowExecutionEvent>
```

Example:

```typescript
for await (const event of flows.streamEvents(instanceId)) {
  console.log(event.type, event);
}
```

### createEventStream()

Open the connection immediately and return a closeable stream. Use this when you need to subscribe before resuming a flow or completing a task, so events emitted in between are not missed.

```typescript
async createEventStream(
  instanceId: string,
  options?: { signal?: AbortSignal }
): Promise<{ events: AsyncIterable<FlowExecutionEvent>; close: () => void }>
```

### getInstanceStatus()

Read the current status of a flow instance.

```typescript
async getInstanceStatus(
  instanceId: string,
  options?: { signal?: AbortSignal }
): Promise<FlowInstanceStatusResponse>
```

```typescript
interface FlowInstanceStatusResponse {
  id: string;
  status: FlowInstanceStatus;
  variables: Record<string, unknown>;   // includes step_outputs and __human_response
  flow_path: string;
  started_at: string;
  error?: string;
  metrics?: FlowMetrics;
}

type FlowInstanceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';   // a failed flow whose saga compensations ran
```

### resume()

Resume a flow that is waiting for external input, such as an `event` wait step.

```typescript
async resume(
  instanceId: string,
  data: unknown,
  options?: { signal?: AbortSignal }
): Promise<void>
```

A flow waiting on a human task is resumed by completing the task (see `respondToHumanTask` or `InboxApi`); the server rejects a plain resume for that wait unless the caller is an admin.

### respondToHumanTask()

Complete an inbox task. This posts to the same endpoint as `InboxApi.completeTask()`; the `instanceId` argument is kept for API stability and not used.

```typescript
async respondToHumanTask(
  instanceId: string,
  taskId: string,
  response: unknown,
  options?: { signal?: AbortSignal }
): Promise<void>
```

---

## FlowsApi (WebSocket)

On a `Database` from the WebSocket client, flows are also available directly through `db.flows()`:

```typescript
const flows = db.flows();

const { instance_id } = await flows.run('/flows/my-flow', { key: 'value' });
const status = await flows.getInstanceStatus(instance_id);
const resumed = await flows.resume(instance_id, { approved: true });
await flows.cancel(instance_id);

// Stream events
const { events, unsubscribe } = await flows.subscribeEvents(instance_id);
for await (const event of events) {
  console.log(event.type);
}
await unsubscribe();
```

---

## Flow Execution Events

| Event Type | Key Fields | Description |
|-----------|------------|-------------|
| `step_started` | `node_id`, `step_name`, `step_type` | A step began executing |
| `step_completed` | `node_id`, `output`, `duration_ms`, `usage?` | A step finished. `usage` carries `input_tokens` and `output_tokens` when the step made a model call |
| `step_failed` | `node_id`, `error`, `duration_ms` | A step failed |
| `flow_waiting` | `node_id`, `wait_type`, `reason` | The flow paused, for example on a human task or a queued function |
| `flow_resumed` | `node_id`, `wait_duration_ms` | The flow resumed |
| `flow_completed` | `output`, `total_duration_ms` | The flow finished successfully |
| `flow_failed` | `error`, `failed_at_node`, `total_duration_ms` | The flow failed |
| `text_chunk` | `text` | Streaming text from an AI step |
| `thought_chunk` | `text` | AI reasoning text |
| `tool_call_started` | `tool_call_id`, `function_name`, `arguments` | An AI step is calling a tool |
| `tool_call_completed` | `tool_call_id`, `result`, `error?`, `duration_ms?` | The tool call finished |
| `conversation_created` | `conversation_path`, `workspace` | A chat conversation node was created |
| `message_saved` | `message_path`, `role`, `conversation_path` | A message was persisted |
| `log` | `level`, `message`, `node_id?` | A log entry |

Every event carries a `timestamp`.

### Helper

```typescript
import { isTerminalEvent } from '@raisindb/client';

if (isTerminalEvent(event)) {
  // event is FlowCompletedEvent | FlowFailedEvent
}
```

---

## Inbox tasks (db.inbox)

When a flow reaches a `human_task` step it emits `flow_waiting` and pauses: a task is created in the assignee's inbox, and completing the task resumes the flow. `InboxApi` is the client for those tasks. Assignees can be users or AI agents, and both complete tasks through the same API.

Available on a `Database` from `RaisinClient.database()`, lazily created and cached like `db.flow`:

```typescript
const inbox = db.inbox;

// List my pending tasks (pending first, then by priority and due time)
const { tasks } = await inbox.listTasks({ status: 'pending' });

// Approve the first one; the waiting flow resumes
const result = await inbox.completeTask(tasks[0].id, { action: 'approve', comment: 'LGTM' });
// result.flow?.instance_id when a flow was resumed
```

| Method | Description |
|--------|-------------|
| `listTasks(options?)` | List tasks as `{ assignee, count, tasks }`. Filters: `status` (`'pending' \| 'completed' \| 'expired' \| 'cancelled'`), `assignee` (another principal's inbox, or `'*'` for every task; admins only) |
| `getTask(taskId)` | Get a single task by id or path |
| `completeTask(taskId, response)` | Complete a task and get `{ task_id, task_path, status, flow? }`. Approval tasks: `{ action: '<option value>', comment? }`; input tasks: a value matching the task's `input_schema` |

Each `InboxTask` carries `id`, `path`, `task_type`, `title`, `description`, `assignee`, `status`, `priority`, approval `options` or `input_schema`, and, for flow-created tasks, `flow_instance_id` and `step_id`. A standalone `InboxApi` can also be constructed directly: `new InboxApi(baseUrl, repository, authManager, { requestTimeout? })`.

For the human-in-the-loop patterns (escalation, agent assignees, due dates) see [Human-in-the-Loop](../../guides/workflows/human-in-the-loop.md).

---

## useFlow (React Hook)

React hook for executing and monitoring flows with reactive state. Shown here in its raw form (`useFlow(React, options)` from the core entry). If you use [`createRaisinReact`](./frameworks.md#react), the returned `useFlow(options)` is pre-bound and reads the client from context.

```typescript
import React from 'react';
import { useFlow } from '@raisindb/client';

const db = client.database('myapp');

function OrderProcessor() {
  const flow = useFlow(React, { database: db });

  return (
    <div>
      <button onClick={() => flow.run('/flows/process-order', { orderId: '123' })}>
        Run
      </button>
      <p>Status: {flow.status}</p>
      {flow.events.map((e, i) => <div key={i}>{e.type}</div>)}
    </div>
  );
}
```

### Options

```typescript
interface UseFlowOptions {
  database?: Database;          // derives baseUrl, repository, authManager, flowsApi
  baseUrl?: string;
  repository?: string;
  authManager?: AuthManager;
  clientOptions?: FlowClientOptions;
  flowsApi?: FlowsApi;
}
```

### Return Value

```typescript
interface UseFlowReturn {
  events: FlowExecutionEvent[];
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed';
  isRunning: boolean;
  error: string | null;
  output: unknown | null;
  instanceId: string | null;
  run: (flowPath: string, input?: Record<string, unknown>) => Promise<void>;
  resume: (data: unknown) => Promise<void>;
  reset: () => void;
}
```
