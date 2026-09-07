---
sidebar_position: 5
---

# Chat & Conversations

Conversational AI client for building chat interfaces on top of RaisinDB
agents. Package: `@raisindb/client`.

## Architecture

Conversation operations live behind two layers:

- **`ConversationManager`** (`db.conversations`): the low-level API. List,
  create, open, delete, message history, streaming, plan actions, and a
  persistent event subscription.
- **`ConversationStore` / `ConversationListStore`**: framework-agnostic state
  containers on top of the manager with a snapshot/subscribe pattern that
  binds to React, Svelte and Vue (see [Framework Integrations](./frameworks.md)).

A conversation is a `raisin:Conversation` node with `raisin:Message` children,
stored in the user's home inbox in the `raisin:access_control` workspace at
`{home}/inbox/chats/chat-<uuid>`. Agents are `raisin:AIAgent` nodes in the
`functions` workspace (for example `/agents/support`). Sending a message
creates a message node; a trigger runs the agent, which streams its turn back
over Server-Sent Events from `GET /api/conversations/{repo}/events`.

## ConversationManager

Access it through a `Database` obtained from the client:

```typescript
const client = new RaisinClient('ws://localhost:8090', { repository: 'myapp' });
await client.loginWithEmail(email, password, 'myapp');
const db = client.database('myapp');
const conversations = db.conversations;
```

`db.conversations` is a lazily created, cached manager configured with the
client's HTTP base URL, repository and auth. It is only available on a
`Database` created with `client.database()`.

### list()

```typescript
async list(options?: {
  type?: 'ai_chat' | 'direct_message';
  limit?: number;
  signal?: AbortSignal;
}): Promise<ConversationListItem[]>
```

```typescript
interface ConversationListItem {
  id: string;
  type: string;
  conversationPath: string;
  conversationWorkspace: string;
  agentRef?: string;           // e.g. '/agents/support'
  participants?: string[];
  unreadCount?: number;
  lastMessage?: string;
  updatedAt?: string;
}
```

### create()

Start a conversation. The participant decides the type: an agent path such as
`/agents/support` creates an `ai_chat`, anything else a `direct_message`.

```typescript
async create(options: {
  participant: string;
  subject?: string;
  input?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Conversation>
```

### sendMessage()

Send a user message and stream the agent's turn as an async iterable of
`ChatEvent`s.

```typescript
async *sendMessage(
  conversationPath: string,
  content: string,
  options?: SendMessageOptions
): AsyncIterable<ChatEvent>

interface SendMessageOptions {
  /** Stream events via SSE (default true). false = fire and forget. */
  stream?: boolean;
  signal?: AbortSignal;
  /**
   * Inactivity timeout for the per-turn stream in ms (default 120000).
   * If no bytes arrive for this long the turn ends with a synthetic
   * `waiting` event. 0 disables.
   */
  inactivityTimeoutMs?: number;
}
```

```typescript
for await (const event of db.conversations.sendMessage(path, 'Hello!', {
  inactivityTimeoutMs: 60_000,
})) {
  if (event.type === 'text_chunk') process.stdout.write(event.text);
}
// A final waiting/done event arrives even if the stream dies.
```

### subscribe()

A persistent subscription that survives across turns, for events between
turns (background tool results, agent-initiated messages). It reconnects on
disconnect. `ConversationStore` uses it internally.

```typescript
subscribe(
  conversationPath: string,
  onEvent: (event: ChatEvent) => void,
  options?: { signal?: AbortSignal }
): ConversationSubscription

interface ConversationSubscription {
  unsubscribe(): void;
  waitUntilConnected(): Promise<void>;
}
```

### Other methods

| Method | Description |
|--------|-------------|
| `open(conversationPath)` | Open an existing conversation; `null` if not found |
| `delete(conversationPath)` | Delete a conversation and all its children |
| `getMessages(conversationPath)` | Full message history from the node tree |
| `createUserMessage(conversationPath, content)` | Persist a user message without streaming |
| `markAsRead(conversationPath)` | Reset the conversation's unread count |
| `markMessageAsRead(messagePath)` | Mark a single message as read |
| `approvePlan(planPath, options?)` | Approve a pending plan; returns a `PlanActionReceipt` |
| `rejectPlan(planPath, feedback?, options?)` | Reject a pending plan; returns a `PlanActionReceipt` |
| `chat(participant, message, options?)` | One shot: create, send and collect the full response as `{ response, conversationPath }` |
| `getActiveToolCalls(conversationPath)` | Pending or running tool calls as `{ id, name, status }[]` |
| `checkTurnHealth(conversationPath)` | `'streaming' \| 'done' \| 'unknown'` for the latest assistant turn |

Plan actions are queued, not blocking. The receipt says the request was
accepted; the resulting plan state arrives through events and the persisted
messages.

```typescript
interface PlanActionReceipt {
  accepted: boolean;
  action: 'approve' | 'reject';
  actionId: string;
  planPath: string;
  executionId: string;
  jobId: string;
  status?: string;
}

interface PlanActionOptions {
  actionId?: string;
  requestTimeoutMs?: number;
}
```

---

## ConversationStore

A store for one conversation: lazy creation, sending, streaming, tool-call
tracking, plan projection, history reload and hang recovery. Subscribers get
an immutable snapshot on every change.

```typescript
import { ConversationStore } from '@raisindb/client';

const store = new ConversationStore({
  database: db,
  // Either resume an existing conversation...
  conversationPath: existingPath,
  // ...or let the first sendMessage() create one:
  createOptions: { participant: '/agents/shift-planner' },
});

const unsubscribe = store.subscribe((s) => render(s));
await store.loadMessages();          // history on reload
await store.sendMessage('Plan next week');
// later
store.destroy();
```

### Options

```typescript
interface ConversationStoreOptions {
  database: Database;
  /** Resume an existing conversation */
  conversationPath?: string;
  /** Create a new conversation on first message */
  createOptions?: { participant: string; input?: Record<string, unknown> };
  /** Callback for individual chat events */
  onEvent?: (event: ChatEvent) => void;
  /**
   * Streaming inactivity timeout in ms (default 120000). If no event
   * arrives for this long while streaming, the store reloads messages and
   * clears the streaming state.
   */
  streamingTimeoutMs?: number;
  /**
   * Watchdog interval in ms (default 30000). While streaming, the store
   * calls checkTurnHealth() periodically and recovers if the backend says
   * the turn already finished.
   */
  watchdogIntervalMs?: number;
}
```

The two timeouts are independent recovery layers: `streamingTimeoutMs`
catches a silent stream (proxy reset, dead connection), `watchdogIntervalMs`
catches a live stream whose terminal event was lost.

### Snapshot

```typescript
interface ConversationStoreSnapshot {
  conversation: { conversationPath: string; type: string } | null;
  messages: ChatMessage[];
  isStreaming: boolean;        // the agent is generating
  isWaiting: boolean;          // turn done, waiting for user input
  streamingText: string;       // accumulated text of the current turn
  error: string | null;
  activeToolCalls: ToolCallInfo[];   // in-flight tool executions
  plans: PlanProjection[];           // plan/task projection
  isLoading: boolean;
  conversationPath: string | null;
}

interface ToolCallInfo {
  id: string;
  functionName: string;
  arguments: unknown;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  durationMs?: number;
}

interface PlanProjection {
  key: string;
  planPath?: string;
  planId?: string;
  title: string;
  status: string;              // pending_approval | in_progress | completed | cancelled
  requiresApproval: boolean;
  tasks: { taskId?: string; title: string; status: string; description?: string; priority?: string }[];
  sourceMessagePath?: string;
  updatedAt?: string;
}
```

`plans` is rebuilt from the persisted messages with `messageType` `ai_plan`
and `ai_task_update` on every snapshot, so plan state survives reloads. There
is no separate plan event type; plan changes arrive as messages.

```typescript
for (const plan of snapshot.plans) {
  if (plan.requiresApproval && plan.status === 'pending_approval') {
    await store.approvePlan(plan.planPath!);
    // or: await store.rejectPlan(plan.planPath!, 'Not like this');
  }
}
```

For the full plan lifecycle (enabling task creation on an agent, the four
execution modes, the persisted node shapes and a complete approval UI) see
the [Agent Plans & Custom Tools guide](/docs/guides/ai/agent-plans-and-tools).

### Actions

| Method | Description |
|--------|-------------|
| `sendMessage(content)` | Send and stream; creates the conversation if needed |
| `loadMessages()` | Load persisted history |
| `approvePlan(planPath)` / `rejectPlan(planPath, feedback?)` | Plan actions |
| `markMessageAsRead(messagePath)` | Mark one message as read |
| `stop()` | Stop the current streaming turn in the UI |
| `getSnapshot()` | Current snapshot |
| `getConversationPath()` | Current conversation path |
| `destroy()` | Release the subscription and all timers |

---

## ConversationListStore

An inbox-style list of conversations with optional realtime updates.

```typescript
import { ConversationListStore } from '@raisindb/client';

const list = new ConversationListStore({
  database: db,
  type: 'ai_chat',     // optional filter
  realtime: true,      // subscribe to node events under {home}/inbox/chats/**
});

list.subscribe((s) => {
  render(s.conversations);        // ConversationListItem[]
  badge(s.totalUnreadCount);
});
await list.load();

const convo = await list.createConversation({ participant: '/agents/support' });
await list.markAsRead(convo.conversationPath);
await list.deleteConversation(convo.conversationPath);

// Cached per-conversation stores:
const store = list.getConversationStore(convo.conversationPath);
```

The snapshot is `{ conversations, totalUnreadCount, isLoading, error }`. With
`realtime: true` the store subscribes to `node:created` and `node:updated`
events on the user's chats folder in the `raisin:access_control` workspace
(see [Realtime Subscriptions & Inbox](./realtime-inbox.md)).

---

## Chat events

Events delivered by `sendMessage()` and `subscribe()`. Every event carries a
`timestamp`.

| Event type | Key fields | Description |
|-----------|------------|-------------|
| `text_chunk` | `text` | Incremental text from the assistant |
| `thought_chunk` | `text` | Reasoning text |
| `assistant_message` | `message: ChatMessage` | Complete assistant message |
| `tool_call_started` | `toolCallId`, `functionName`, `arguments` | The agent started a tool call |
| `tool_call_completed` | `toolCallId`, `result`, `error?`, `durationMs?` | A tool call finished |
| `waiting` | `sessionId?`, `turnCount?` | Turn finished, waiting for input. Also emitted while a plan awaits approval |
| `done` | `content?`, `role?`, `finishReason?`, `dispatchPhase?`, `recovered?` | Turn completed; terminal when `dispatchPhase` is `'terminal'` |
| `completed` | `reason?`, `messages?` | Conversation finished entirely |
| `failed` | `error` | An error occurred |
| `conversation_created` | `conversationPath`, `workspace` | The conversation node was created |
| `message_saved` | `messagePath`, `role`, `conversationPath` | A message was persisted |
| `message_delivered` | `message: ChatMessage`, `conversationPath` | An asynchronous message arrived (for example agent-initiated) |
| `log` | `level`, `message`, `module?`, `nodeId?` | Server-side log entry |

`finishReason` values you will see on `done` and on messages include
`awaiting_plan_approval`, `awaiting_step_continue` (step-by-step plans) and
`budget_exceeded` (the agent's `max_conversation_tokens` was reached).

Tool-call events let you render live activity:

```typescript
const store = new ConversationStore({
  database: db,
  conversationPath,
  onEvent: (event) => {
    if (event.type === 'tool_call_started') {
      console.log(`running ${event.functionName}...`);
    }
  },
});
// or read snapshot.activeToolCalls, which the store tracks for you.
```

---

## ChatMessage

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  id?: string;
  path?: string;
  agent?: string;
  finishReason?: string;
  dispatchPhase?: 'pending' | 'queued' | 'awaiting_results' | 'ready_for_model' | 'terminal';
  orchestrationMode?: 'automatic' | 'approve_then_auto' | 'step_by_step' | 'manual';
  orchestrationRound?: number;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  children?: MessageChild[];     // thoughts, tool calls/results, plans
  senderId?: string;
  senderDisplayName?: string;
  status?: string;
  messageType?: string;          // 'chat', 'ai_plan', 'ai_task_update', ...
  data?: Record<string, unknown>;
  readAt?: string;
}
```

---

## Framework adapters

The stores bind to each framework through a factory, so the SDK has no
framework peer dependency:

```typescript
import React from 'react';
import { RaisinClient, createRaisinReact } from '@raisindb/client';

export const { RaisinProvider, useAuth, useDatabase, useConversation, useConversationList } =
  createRaisinReact(React);
```

`createRaisinVue(Vue)` returns `useConversation` and `useConversationList` for
Vue, and `createConversationAdapter` / `createConversationListAdapter` wrap the
stores for Svelte. All three take the same options as the stores. See
[Framework Integrations](./frameworks.md).

---

## Full example

From the [shiftboard example](https://github.com/maravilla-labs/raisindb/tree/main/examples/shiftboard):
resume the latest conversation with an agent, or create one lazily.

```typescript
import { RaisinClient, ConversationStore } from '@raisindb/client';

const AGENT_PATH = '/agents/shift-planner';
const client = new RaisinClient('ws://localhost:8090', { repository: 'shiftboard' });
await client.loginWithEmail(email, password, 'shiftboard');
const db = client.database('shiftboard');

// Reuse the most recent ai_chat conversation with our agent.
const existing = await db.conversations.list({ type: 'ai_chat' });
const conversationPath = existing
  .filter((c) => c.agentRef === AGENT_PATH)
  .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  ?.conversationPath;

const store = new ConversationStore({
  database: db,
  conversationPath,                                  // resume if found
  createOptions: { participant: AGENT_PATH },        // else create on first send
});

store.subscribe((s) => render(s));
if (conversationPath) await store.loadMessages();

await store.sendMessage('Who is on shift tomorrow?');
```
