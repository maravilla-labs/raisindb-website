---
sidebar_position: 5
---

# Chat

Conversational AI client for building chat interfaces.

## Architecture

The `ChatClient` supports two modes:

- **Direct mode** (default): Creates `raisin:Conversation` and `raisin:Message` nodes directly, streams responses via SSE. This is the recommended approach for new applications.
- **Flow mode** (legacy): Uses `FlowClient` for flow-backed conversations. Activate by passing `flow` to `createConversation()` or setting `forceFlowMode: true`.

Direct mode conversations are stored as node trees in the user's `raisin:access_control` workspace. When you send a message, a trigger fires the configured agent, which streams its response back via Server-Sent Events.

## ChatClient

Access via the `Database` instance:

```typescript
const db = client.database('myapp');
const chatClient = db.chat;
```

The `db.chat` getter returns a lazily-created, cached `ChatClient` pre-configured with the correct base URL, repository, auth manager, and WebSocket-backed `FlowsApi`.

### Options

```typescript
interface ChatClientOptions {
  requestTimeout?: number;
  fetch?: typeof fetch;
  defaultFlowPath?: string;
  /** Force flow mode even for new conversations */
  forceFlowMode?: boolean;
}
```

---

## Methods

### chat()

One-shot convenience method. Creates a conversation, sends a message, and returns the full response.

```typescript
async chat(
  agent: string,
  message: string,
  options?: {
    signal?: AbortSignal;
    input?: Record<string, unknown>;
  }
): Promise<ChatResult>
```

```typescript
interface ChatResult {
  response: string;
  conversationId: string;
}
```

Example:

```typescript
const { response } = await chatClient.chat(
  'my-assistant',
  'Summarize the latest sales report'
);
```

### createConversation()

Start a new multi-turn conversation.

```typescript
async createConversation(options: {
  agent: string;
  conversationType?: ConversationType;
  flow?: string;
  input?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Conversation>
```

In direct mode (default), creates a `raisin:Conversation` node. In flow mode (when `flow` is specified), runs the flow and polls until the chat session is ready.

```typescript
type ConversationType = 'ai_chat' | 'direct_message' | 'flow_chat';
```

### sendMessage()

Send a user message and stream the response as an async iterable.

```typescript
async *sendMessage(
  conversationId: string,
  content: string,
  options?: { signal?: AbortSignal }
): AsyncIterable<ChatEvent>
```

The `conversationId` parameter accepts either:
- A **conversation path** (starts with `/`) for direct mode
- A **flow instance ID** for flow mode

Example:

```typescript
for await (const event of chatClient.sendMessage(id, 'Hello')) {
  if (event.type === 'text_chunk') {
    process.stdout.write(event.text);
  }
}
```

### resumeConversation()

Restore a conversation after a page reload.

```typescript
async resumeConversation(
  conversationPathOrInstanceId: string
): Promise<Conversation | null>
```

Accepts a conversation path (direct mode) or flow instance ID (flow mode).

### getMessages()

Load the full message history for a conversation.

```typescript
async getMessages(
  conversationId: string
): Promise<ChatMessage[]>
```

### stop()

Abort an active streaming response.

```typescript
stop(conversationId: string): void
```

---

## Conversation

```typescript
interface Conversation {
  /** Conversation node ID */
  id: string;
  /** Conversation type */
  type: ConversationType;
  /** Agent reference path */
  agentRef?: string;
  /** Participant IDs */
  participants?: string[];
  /** Participant details */
  participantDetails?: Record<string, { display_name: string }>;
  /** Number of unread messages */
  unreadCount?: number;
  /** Last message preview */
  lastMessage?: { content: string; sender_id: string; created_at: string };
  /** Node path (primary identifier in direct mode) */
  conversationPath: string;
  /** Workspace */
  conversationWorkspace: string;
  /** Flow instance ID (only for flow-initiated chats) */
  flowInstanceId?: string;
  /** Initial events from creation */
  initialEvents?: ChatEvent[];
}
```

---

## Chat Events

Events yielded by `sendMessage()`:

| Event Type | Key Fields | Description |
|-----------|------------|-------------|
| `text_chunk` | `text` | Incremental text from the assistant |
| `assistant_message` | `message: ChatMessage` | Complete assistant message |
| `waiting` | `sessionId?`, `turnCount?` | Conversation is waiting for next input |
| `completed` | `reason?`, `messages?` | Conversation turn is complete |
| `failed` | `error` | An error occurred |
| `tool_call_started` | `toolCallId`, `functionName`, `arguments` | Agent is calling a tool |
| `tool_call_completed` | `toolCallId`, `result`, `error?` | Tool call finished |
| `thought_chunk` | `text` | Reasoning/thinking text |
| `conversation_created` | `conversationPath`, `workspace` | Conversation node was created |
| `message_saved` | `messagePath`, `role` | Message was persisted |
| `log` | `level`, `message` | Log entry from the flow |

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
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  children?: MessageChild[];
  /** Sender identity ID */
  senderId?: string;
  /** Sender display name */
  senderDisplayName?: string;
  /** Message delivery status */
  status?: string;
  /** Message type discriminator */
  messageType?: string;
}
```

### ToolCallRecord

```typescript
interface ToolCallRecord {
  id: string;
  name: string;
  arguments: unknown;
}
```

### MessageChild

```typescript
interface MessageChild {
  id: string;
  path?: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'cost';
  content: string;
  toolName?: string;
  toolInput?: unknown;
  status?: string;
}
```

---

## ConversationClient

The `ConversationClient` provides inbox-level operations for listing and managing conversations. Access via `db.conversations`:

```typescript
const db = client.database('myapp');
const conversations = db.conversations;
```

### listConversations()

List conversations for the current user.

```typescript
async listConversations(options?: {
  type?: ConversationType;
  limit?: number;
  signal?: AbortSignal;
}): Promise<ConversationListItem[]>
```

```typescript
interface ConversationListItem {
  id: string;
  type: ConversationType;
  conversationPath: string;
  conversationWorkspace: string;
  agentRef?: string;
  participants?: string[];
  unreadCount?: number;
  lastMessage?: { content: string; sender_id: string; created_at: string };
  updatedAt?: string;
}
```

Example:

```typescript
const aiChats = await conversations.listConversations({ type: 'ai_chat', limit: 20 });
```

### startAIChat()

Create a new AI chat conversation.

```typescript
async startAIChat(options: {
  agent: string;
  input?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Conversation>
```

### openConversation()

Open an existing conversation by path.

```typescript
async openConversation(
  conversationPath: string,
  options?: { signal?: AbortSignal }
): Promise<Conversation | null>
```

### markAsRead()

Mark a conversation as read.

```typescript
async markAsRead(
  conversationPath: string,
  options?: { signal?: AbortSignal }
): Promise<void>
```

---

## ChatStore (Svelte Adapter)

The `ChatStore` manages chat state for UI frameworks. It handles conversation creation, message sending, streaming, and message history with a subscribe/callback pattern.

### Creating a ChatStore

```typescript
import { ChatStore } from '@raisindb/client';

const db = client.database('myapp');
const store = new ChatStore({
  agent: '/agents/support',
  database: db,
});
```

### Options

```typescript
interface ChatStoreOptions {
  agent: string;
  database?: Database;
  flowPath?: string;
  clientOptions?: ChatClientOptions;
  input?: Record<string, unknown>;
  onEvent?: (event: ChatEvent) => void;
}
```
