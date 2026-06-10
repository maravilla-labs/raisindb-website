---
sidebar_position: 5
---

# Chat & Conversations

Conversational AI client for building chat interfaces.

## Architecture

All conversation operations live behind two layers:

- **`ConversationManager`** (`db.conversations`) — the unified low-level API: list, create, open, delete, message history, streaming, plan actions, and persistent SSE subscriptions.
- **`ConversationStore` / `ConversationListStore`** — framework-agnostic state containers on top of the manager, with a snapshot/subscribe pattern that binds directly to React, Svelte, and Vue (see [Framework Integrations](./frameworks.md)).

Conversations are stored as node trees (`raisin:Conversation` + `raisin:Message`) in the user's home inbox inside the `raisin:access_control` workspace. Sending a message creates a message node; a trigger fires the configured agent, which streams its response back via Server-Sent Events.

## ConversationManager

Access via the `Database` instance:

```typescript
const db = client.database('myapp');
const conversations = db.conversations;
```

The `db.conversations` getter returns a lazily-created, cached `ConversationManager` pre-configured with the correct base URL, repository, and auth manager.

### list()

List conversations for the current user.

```typescript
async list(options?: {
  type?: ConversationType;   // 'ai_chat' | 'direct_message'
  limit?: number;
  signal?: AbortSignal;
}): Promise<ConversationListItem[]>
```

```typescript
const aiChats = await db.conversations.list({ type: 'ai_chat', limit: 20 });
```

### create()

Start a new conversation. The participant is auto-detected: agent paths (e.g. `/agents/support`) create an `ai_chat`, anything else a `direct_message`.

```typescript
async create(options: {
  participant: string;                 // '/agents/support' or a user id
  subject?: string;
  input?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Conversation>
```

### sendMessage()

Send a user message and stream the agent's turn as an async iterable of `ChatEvent`s.

```typescript
async *sendMessage(
  conversationPath: string,
  content: string,
  options?: SendMessageOptions
): AsyncIterable<ChatEvent>
```

```typescript
interface SendMessageOptions {
  /** Stream events via SSE (default: true). false = fire-and-forget. */
  stream?: boolean;
  signal?: AbortSignal;
  /**
   * Inactivity timeout for the per-turn SSE stream in ms (default: 120000).
   * If the stream produces no bytes for this long, the turn ends with a
   * synthetic `waiting` event instead of hanging forever. 0 disables.
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
// A final waiting/done event is guaranteed even if the stream dies.
```

### subscribe()

Persistent SSE subscription that survives across turns. Useful for async events between turns (background tool results, agent-initiated messages). Auto-reconnects on disconnect. This is what `ConversationStore` uses internally.

```typescript
subscribe(
  conversationPath: string,
  onEvent: (event: ChatEvent) => void,
  options?: { signal?: AbortSignal }
): ConversationSubscription
```

```typescript
interface ConversationSubscription {
  unsubscribe(): void;
  waitUntilConnected(): Promise<void>;
}
```

### Other methods

| Method | Description |
|--------|-------------|
| `open(conversationPath)` | Open an existing conversation, `null` if not found |
| `delete(conversationPath)` | Delete a conversation and all its children |
| `getMessages(conversationPath)` | Full message history from the node tree |
| `createUserMessage(conversationPath, content)` | Persist a user message without streaming |
| `markAsRead(conversationPath)` | Reset the conversation's unread count |
| `markMessageAsRead(messagePath)` | Mark a single message as read |
| `approvePlan(planPath, options?)` | Approve a pending plan (returns a `PlanActionReceipt`; final state arrives via events) |
| `rejectPlan(planPath, feedback?, options?)` | Reject a pending plan |
| `chat(participant, message, options?)` | One-shot: create + send + collect the full response |
| `getActiveToolCalls(conversationPath)` | Pending/running tool calls from the node tree |
| `checkTurnHealth(conversationPath)` | `'streaming' \| 'done' \| 'unknown'` for the latest assistant turn |

---

## ConversationStore

Framework-agnostic store managing a single conversation: lazy creation, sending, streaming, tool call tracking, plan projection, history reload, and hang recovery. Subscribers get an immutable snapshot on every change.

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
   * Streaming inactivity timeout in ms (default: 120000). If no SSE event
   * arrives for this long while streaming, the store auto-recovers
   * (reloads messages, clears the streaming state).
   */
  streamingTimeoutMs?: number;
  /**
   * Activity watchdog interval in ms (default: 30000). While streaming, the
   * store periodically calls checkTurnHealth() and recovers if the backend
   * says the turn already finished.
   */
  watchdogIntervalMs?: number;
}
```

The two stability options form independent recovery layers on top of the SSE stream — together they guarantee a chat UI never gets stuck on a dead stream:

- `streamingTimeoutMs` catches a silent stream (proxy reset, dead TCP).
- `watchdogIntervalMs` catches the case where the stream is alive but the terminal event was lost.

### Snapshot

```typescript
interface ConversationStoreSnapshot {
  conversation: { conversationPath: string; type: string } | null;
  messages: ChatMessage[];
  isStreaming: boolean;        // agent is generating
  isWaiting: boolean;          // turn done, waiting for user input
  streamingText: string;       // accumulated text of the current turn
  error: string | null;
  activeToolCalls: ToolCallInfo[];   // in-flight tool executions
  plans: PlanProjection[];           // deterministic plan/task projection
  isLoading: boolean;
  conversationPath: string | null;
}
```

```typescript
interface ToolCallInfo {
  id: string;
  functionName: string;
  arguments: unknown;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  durationMs?: number;
}
```

`plans` is rebuilt from persisted `ai_plan` / `ai_task_update` messages on every snapshot, so plan state survives reloads. Render approval UI from it:

```typescript
for (const plan of snapshot.plans) {
  if (plan.status === 'pending_approval') {
    // plan.title, plan.tasks[] with per-task status
    await store.approvePlan(plan.planPath);
    // or: await store.rejectPlan(plan.planPath, 'Not like this');
  }
}
```

### Actions

| Method | Description |
|--------|-------------|
| `sendMessage(content)` | Send + stream (creates the conversation if needed) |
| `loadMessages()` | Load persisted history |
| `approvePlan(planPath)` / `rejectPlan(planPath, feedback?)` | Plan actions |
| `markMessageAsRead(messagePath)` | Mark one message as read |
| `stop()` | Stop the current streaming turn in the UI |
| `getConversationPath()` | Current conversation path |
| `destroy()` | Release the SSE subscription and all timers |

---

## ConversationListStore

Inbox-style list of conversations with optional realtime updates.

```typescript
import { ConversationListStore } from '@raisindb/client';

const list = new ConversationListStore({
  database: db,
  type: 'ai_chat',     // optional filter
  realtime: true,      // subscribe to node events under ${home}/inbox/chats/**
});

list.subscribe((s) => {
  render(s.conversations);        // ConversationListItem[]
  badge(s.totalUnreadCount);
});
await list.load();

const convo = await list.createConversation({ participant: '/agents/support' });
await list.markAsRead(convo.conversationPath);

// Cached per-conversation stores:
const store = list.getConversationStore(convo.conversationPath);
```

With `realtime: true` the store subscribes to `node:created` / `node:updated` events on the user's chats folder (see [Realtime Subscriptions & Inbox](./realtime-inbox.md) for the path semantics involved).

---

## Chat Events

Events delivered by `sendMessage()` and `subscribe()`:

| Event Type | Key Fields | Description |
|-----------|------------|-------------|
| `text_chunk` | `text` | Incremental text from the assistant |
| `thought_chunk` | `text` | Reasoning/thinking text |
| `assistant_message` | `message: ChatMessage` | Complete assistant message |
| `tool_call_started` | `toolCallId`, `functionName`, `arguments` | Agent started a tool call |
| `tool_call_completed` | `toolCallId`, `result`, `error?`, `durationMs?` | Tool call finished |
| `waiting` | `sessionId?`, `turnCount?` | Turn finished, waiting for next input |
| `done` | `content?`, `role?`, `finishReason?`, `dispatchPhase?` | Turn completed (terminal when `dispatchPhase` is `'terminal'`) |
| `completed` | `reason?`, `messages?` | Conversation finished entirely |
| `failed` | `error` | An error occurred |
| `conversation_created` | `conversationPath`, `workspace` | Conversation node was created |
| `message_saved` | `messagePath`, `role` | A message was persisted |
| `message_delivered` | `message: ChatMessage` | An async message arrived (e.g. agent-initiated) |
| `log` | `level`, `message` | Server-side log entry |

Tool-call events let you render live activity badges:

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
// or just read snapshot.activeToolCalls — the store tracks them for you.
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
  dispatchPhase?: string;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  children?: MessageChild[];     // thoughts, tool calls/results, plans
  senderId?: string;
  senderDisplayName?: string;
  status?: string;
  messageType?: string;          // e.g. 'ai_plan', 'ai_task_update'
  data?: Record<string, unknown>;
}
```

---

## Full example

From the [shiftboard example](https://github.com/maravilla-labs/raisindb/tree/main/examples/shiftboard) — resume the latest conversation with an agent, or create one lazily:

```typescript
import { ConversationStore } from '@raisindb/client';

const AGENT_PATH = '/agents/shift-planner';
const db = client.database('shiftboard');

// Reuse the most recent ai_chat conversation with our agent.
let conversationPath: string | undefined;
const existing = await db.conversations.list({ type: 'ai_chat' });
conversationPath = existing
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
