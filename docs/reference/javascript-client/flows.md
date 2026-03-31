---
sidebar_position: 6
---

# Flows

Execute server-side workflows and stream their progress.

## FlowClient

The `FlowClient` runs flows over HTTP with SSE streaming. Use it for long-running workflows, background jobs, and human-in-the-loop processes.

### Creating a FlowClient

Access via the `Database` instance:

```typescript
const db = client.database('myapp');
const flowClient = db.flow;
```

The `db.flow` getter returns a lazily-created, cached `FlowClient` pre-configured with the correct base URL, repository, auth manager, and WebSocket-backed `FlowsApi`.

### Options

```typescript
interface FlowClientOptions {
  requestTimeout?: number;
  fetch?: typeof fetch;
}
```

---

## Methods

### run()

Start a flow and return immediately.

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
  status: string;
}
```

### runAndWait()

Start a flow and wait until it completes or fails.

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

Stream events from a running flow as an async iterable.

```typescript
async *streamEvents(
  instanceId: string,
  options?: { signal?: AbortSignal }
): AsyncIterable<FlowExecutionEvent>
```

Example:

```typescript
for await (const event of flowClient.streamEvents(instanceId)) {
  console.log(event.type, event);
}
```

### createEventStream()

Create a closeable event stream (alternative to `streamEvents`).

```typescript
async createEventStream(
  instanceId: string,
  options?: { signal?: AbortSignal }
): Promise<{ events: AsyncIterable<FlowExecutionEvent>; close: () => void }>
```

### getInstanceStatus()

Check the current status of a flow instance.

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
  variables: Record<string, unknown>;
  flow_path: string;
  started_at: string;
  error?: string;
}

type FlowInstanceStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting'
  | 'cancelled';
```

### resume()

Resume a flow that is waiting for external input.

```typescript
async resume(
  instanceId: string,
  data: unknown,
  options?: { signal?: AbortSignal }
): Promise<void>
```

### respondToHumanTask()

Respond to a specific human task within a waiting flow.

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

When using a WebSocket client, flows are also available via `db.flows()`:

```typescript
const flows = db.flows();

const { instance_id } = await flows.run('flows/my-flow', { key: 'value' });
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
| `step_started` | `node_id`, `step_type` | A step began executing |
| `step_completed` | `node_id`, `output`, `duration_ms` | A step finished |
| `step_failed` | `node_id`, `error`, `duration_ms` | A step failed |
| `flow_waiting` | `node_id`, `wait_type`, `reason` | Flow is paused waiting for input |
| `flow_resumed` | `node_id`, `wait_duration_ms` | Flow was resumed |
| `flow_completed` | `output`, `total_duration_ms` | Flow finished successfully |
| `flow_failed` | `error`, `total_duration_ms` | Flow failed |
| `text_chunk` | `text` | Streaming text from an AI step |
| `thought_chunk` | `text` | AI reasoning/thinking text |
| `tool_call_started` | `tool_call_id`, `function_name`, `arguments` | AI is calling a tool |
| `tool_call_completed` | `tool_call_id`, `result`, `error?` | Tool call finished |
| `conversation_created` | `conversation_path`, `workspace` | Chat conversation created |
| `message_saved` | `message_path`, `role` | Message persisted |
| `log` | `level`, `message`, `node_id?` | Log entry |

### Helper

```typescript
import { isTerminalEvent } from '@raisindb/client';

if (isTerminalEvent(event)) {
  // event is FlowCompletedEvent | FlowFailedEvent
}
```

---

## useFlow (React Hook)

React hook for executing and monitoring flows with reactive state.

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
  database?: Database;
  clientOptions?: FlowClientOptions;
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
