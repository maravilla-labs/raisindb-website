---
sidebar_position: 3
---

# JavaScript/TypeScript Client

Build applications with the official RaisinDB JavaScript client library.

## Installation

```bash
npm install @raisindb/client
```

Or with yarn:

```bash
yarn add @raisindb/client
```

## Quick Start

### Basic Connection

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', {
  tenantId: 'default'
});

await client.connect();
await client.authenticate({
  username: 'admin',
  password: 'your-password'
});

// Get database interface
const db = client.database('myapp');
```

### HTTP-Only Client (Server-Side Rendering)

For server-side rendering where WebSocket is not available:

```typescript
import { RaisinClient } from '@raisindb/client';

const client = RaisinClient.forSSR('http://localhost:8080', {
  tenantId: 'default'
});

await client.authenticate({
  username: 'admin',
  password: 'your-password'
});

const db = client.database('myapp');
```

## Authentication

### Admin Authentication

```typescript
await client.authenticate({
  username: 'admin',
  password: 'your-password'
});
```

### Email / Password Authentication

Register and log in end users with the built-in identity system:

```typescript
// Register a new user
const user = await client.registerWithEmail(
  'alice@example.com',
  'securePassword',
  'myapp',
  'Alice'  // optional display name
);

// Log in an existing user
const user = await client.loginWithEmail(
  'alice@example.com',
  'securePassword',
  'myapp'
);
```

### Session Restoration

Restore a session from a stored token (e.g. after a page reload):

```typescript
const user = await client.initSession('myapp');

if (user) {
  console.log('Session restored for', user.email);
} else {
  console.log('No stored session, redirect to login');
}
```

### Auth State Listener

React to sign-in, sign-out, and token refresh events:

```typescript
const unsubscribe = client.onAuthStateChange(({ event, session }) => {
  switch (event) {
    case 'SIGNED_IN':
      console.log('User signed in:', session.user?.email);
      break;
    case 'SIGNED_OUT':
      console.log('User signed out');
      break;
    case 'TOKEN_REFRESHED':
      console.log('Token refreshed');
      break;
    case 'SESSION_EXPIRED':
      console.log('Session expired, redirect to login');
      break;
  }
});

// Stop listening
unsubscribe();
```

### Ready State

The client is "ready" when it is both connected and authenticated:

```typescript
const unsubscribe = client.onReadyStateChange((ready) => {
  if (ready) {
    console.log('Client is connected and authenticated');
  }
});

console.log(client.isReady()); // true | false
```

### Token Storage

By default tokens are stored in memory. For browser persistence:

```typescript
import { RaisinClient, LocalStorageTokenStorage } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', {
  tokenStorage: new LocalStorageTokenStorage()
});
```

## Working with Nodes

### Create Nodes

```typescript
const ws = db.workspace('content');

const article = await ws.nodes().create({
  type: 'Article',
  path: '/articles/hello-world',
  properties: {
    title: 'Hello World',
    author: 'John Doe',
    status: 'draft'
  }
});

console.log(article.id); // "01HQRS4T8K..."
```

### Get Nodes

```typescript
// Get by path
const article = await ws.nodes().getByPath('/articles/hello-world');

// Get by ID
const node = await ws.nodes().get('01HQRS4T8K...');

// Query by type
const articles = await ws.nodes().queryByType('Article', 10);

// Query by property
const published = await ws.nodes().queryByProperty(
  'status',
  'published',
  20
);
```

### Update Nodes

```typescript
await ws.nodes().update(article.id, {
  properties: {
    status: 'published',
    published_date: new Date().toISOString()
  }
});
```

### Delete Nodes

```typescript
await ws.nodes().delete(article.id);
```

## Tree Operations

### List Children

```typescript
const children = await ws.nodes().listChildren('/articles');
```

### Get Tree

```typescript
// Get full tree
const tree = await ws.nodes().getTree('/articles');

// Limit depth
const tree = await ws.nodes().getTree('/articles', 2);

// Get flattened tree
const flatTree = await ws.nodes().getTreeFlat('/articles');
```

### Move and Rename

```typescript
// Move node
await ws.nodes().move('/articles/old-path', '/articles/new-folder');

// Rename node
await ws.nodes().rename('/articles/hello-world', 'hello-raisindb');

// Copy node (shallow)
await ws.nodes().copy('/articles/template', '/articles/new-article');

// Copy tree (deep)
await ws.nodes().copyTree('/articles/series', '/articles/archived-series');
```

### Reorder Nodes

```typescript
// Set specific order key
await ws.nodes().reorder('/articles/item-1', 'a0');

// Move before sibling
await ws.nodes().moveChildBefore(
  '/articles',
  '/articles/item-2',
  '/articles/item-1'
);

// Move after sibling
await ws.nodes().moveChildAfter(
  '/articles',
  '/articles/item-3',
  '/articles/item-2'
);
```

## Relationships

### Add Relationships

```typescript
// Add relationship
await ws.nodes().addRelation(
  '/articles/hello-world',
  'authored_by',
  '/users/john-doe'
);

// With weight
await ws.nodes().addRelation(
  '/articles/hello-world',
  'related_to',
  '/articles/getting-started',
  { weight: 0.9 }
);

// Cross-workspace relationship
await ws.nodes().addRelation(
  '/articles/product-review',
  'reviews',
  '/products/item-123',
  { targetWorkspace: 'products' }
);
```

### Remove Relationships

```typescript
await ws.nodes().removeRelation(
  '/articles/hello-world',
  '/users/john-doe'
);
```

### Get Relationships

```typescript
const rels = await ws.nodes().getRelationships('/articles/hello-world');

console.log(rels.outgoing); // Relationships from this node
console.log(rels.incoming); // Relationships to this node
```

## SQL Queries

### Execute SQL

```typescript
const result = await db.executeSql(
  'SELECT * FROM nodes WHERE node_type = $1 LIMIT $2',
  ['Article', 10]
);

console.log(result.rows);
```

### Tagged Template Literals

```typescript
const status = 'published';
const limit = 10;

const result = await db.sql`
  SELECT * FROM nodes
  WHERE node_type = 'Article'
    AND properties->>'status' = ${status}
  LIMIT ${limit}
`;

for (const row of result.rows) {
  console.log(row.properties.title);
}
```

## Branches

### Switch Branch

```typescript
// Work on feature branch
const featureWs = db.workspace('content').onBranch('feature-xyz');

const node = await featureWs.nodes().create({
  type: 'Article',
  path: '/articles/new-feature',
  properties: { title: 'New Feature' }
});
```

### Time Travel

```typescript
// Query node at specific revision
const historicWs = db.workspace('content').atRevision('01HQRS4T8K...');

const oldVersion = await historicWs.nodes().getByPath('/articles/hello-world');
```

## Transactions

```typescript
const ws = db.workspace('content');
const tx = ws.transaction();

try {
  await tx.begin({ message: 'Create article series' });

  await tx.nodes().create({
    type: 'Article',
    path: '/articles/part-1',
    properties: { title: 'Part 1' }
  });

  await tx.nodes().create({
    type: 'Article',
    path: '/articles/part-2',
    properties: { title: 'Part 2' }
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

## Real-Time Events

### Subscribe to Node Changes

```typescript
const ws = db.workspace('content');

// Subscribe to all changes in workspace
const subscription = await ws.events().subscribe({}, (event) => {
  console.log('Event:', event.event_type, event.payload);
});

// Unsubscribe
await subscription.unsubscribe();
```

### Filter Events

```typescript
// Subscribe to specific node type
const sub = await ws.events().subscribeToNodeType('Article', (event) => {
  console.log('Article changed:', event.payload);
});

// Subscribe to path pattern
const sub = await ws.events().subscribeToPath('/articles', (event) => {
  console.log('Article in /articles changed');
});

// Subscribe to specific event types
const sub = await ws.events().subscribeToTypes(
  ['node:created', 'node:updated'],
  (event) => {
    console.log('Node created or updated:', event.payload);
  }
);
```

## AI Chat

Build conversational AI features with the `ChatClient`. It handles conversation lifecycle, real-time streaming, and message history. Conversations are stored as `raisin:Conversation` nodes with `raisin:Message` children.

### Create a Chat Client

```typescript
const db = client.database('myapp');
const chatClient = db.chat;
```

Or create manually:

```typescript
import { ChatClient } from '@raisindb/client';

const chatClient = ChatClient.fromHttpClient(
  client,               // authenticated RaisinClient or RaisinHttpClient
  'http://localhost:8080',
  'myapp'
);
```

### One-Shot Chat

Send a single message and get the full response:

```typescript
const { response, conversationId } = await chatClient.chat(
  'my-assistant',       // agent reference
  'What is RaisinDB?'
);
console.log(response);
```

### Multi-Turn Conversations

Create a conversation and stream responses in real time:

```typescript
// Start a conversation
const conversation = await chatClient.createConversation({
  agent: 'my-assistant'
});

// Send a message and stream the response
for await (const event of chatClient.sendMessage(
  conversation.conversationPath,
  'Tell me about your capabilities'
)) {
  switch (event.type) {
    case 'text_chunk':
      process.stdout.write(event.text);
      break;
    case 'assistant_message':
      console.log('\nFull response:', event.message.content);
      break;
    case 'tool_call_started':
      console.log('Calling tool:', event.functionName);
      break;
    case 'waiting':
      console.log('Ready for next message');
      break;
  }
}
```

### Resume a Conversation

Restore a conversation after a page reload:

```typescript
const conversation = await chatClient.resumeConversation(conversationPath);

if (conversation) {
  // Load previous messages
  const messages = await chatClient.getMessages(conversation.conversationPath);
}
```

### Stop Streaming

```typescript
chatClient.stop(conversationId);
```

### Manage Conversations

Use the `ConversationClient` to list and manage the user's conversation inbox:

```typescript
const conversations = db.conversations;

// List AI chat conversations
const chats = await conversations.listConversations({
  type: 'ai_chat',
  limit: 20,
});

// Open an existing conversation
const convo = await conversations.openConversation(chats[0].conversationPath);

// Mark as read
await conversations.markAsRead(chats[0].conversationPath);
```

## Flow Execution

Run server-side workflows and stream their progress in real time.

### Create a Flow Client

```typescript
import { FlowClient } from '@raisindb/client';

const flowClient = FlowClient.fromHttpClient(
  client,
  'http://localhost:8080',
  'myapp'
);
```

### Run a Flow and Wait for Completion

```typescript
const result = await flowClient.runAndWait(
  'flows/process-order',
  { orderId: '12345', priority: 'high' }
);

if (result.status === 'completed') {
  console.log('Output:', result.output);
} else {
  console.error('Failed:', result.error);
}
```

### Stream Flow Events

```typescript
const { instance_id } = await flowClient.run(
  'flows/generate-report',
  { month: '2025-01' }
);

for await (const event of flowClient.streamEvents(instance_id)) {
  switch (event.type) {
    case 'step_started':
      console.log('Step started:', event.node_id);
      break;
    case 'step_completed':
      console.log('Step completed:', event.node_id);
      break;
    case 'text_chunk':
      process.stdout.write(event.text);
      break;
    case 'flow_completed':
      console.log('Flow done:', event.output);
      break;
    case 'flow_failed':
      console.error('Flow failed:', event.error);
      break;
  }
}
```

### Resume a Waiting Flow

Flows can pause and wait for external input (human tasks, chat sessions):

```typescript
// Resume with data
await flowClient.resume(instanceId, {
  approved: true,
  comment: 'Looks good'
});

// Respond to a human task
await flowClient.respondToHumanTask(instanceId, taskId, {
  selectedOption: 'approve'
});
```

### Check Flow Status

```typescript
const status = await flowClient.getInstanceStatus(instanceId);
console.log(status.status); // 'running' | 'completed' | 'failed' | 'waiting' | ...
```

## File Uploads

### Upload a Single File

```typescript
const upload = await client.upload(file, {
  repository: 'myapp',
  workspace: 'content',
  path: '/images/photo.jpg'
});
```

### Upload from a Workspace

```typescript
const ws = db.workspace('content');

const upload = await ws.upload(file, '/images/photo.jpg');
```

### Batch Upload

```typescript
const batch = await ws.uploadFiles(fileList, '/images/', {
  concurrency: 3,
  onProgress: (progress) => {
    console.log(`${progress.filesCompleted}/${progress.filesTotal} files`);
  }
});
```

### Signed Asset URLs

Generate time-limited URLs for accessing binary assets:

```typescript
const { url } = await ws.signAssetUrl('/images/photo.jpg');
```

## React Integration

### useChat Hook

The `useChat` hook manages chat state, streaming, and message history:

```typescript
import { useChat } from '@raisindb/client/integrations/react-chat';
import * as React from 'react';

function ChatWidget() {
  const {
    messages,
    isStreaming,
    streamingText,
    error,
    sendMessage,
    stop,
  } = useChat(React, {
    agent: 'my-assistant',
    baseUrl: 'http://localhost:8080',
    repository: 'myapp',
    authManager: client.getAuthManager(),
  });

  const [input, setInput] = React.useState('');

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
        </div>
      ))}

      {isStreaming && <div className="assistant">{streamingText}</div>}

      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => { sendMessage(input); setInput(''); }}>
        Send
      </button>
      {isStreaming && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

### React Router Loader (SSR)

```typescript
import { RaisinClient } from '@raisindb/client';

export async function articleLoader({ params }) {
  const client = RaisinClient.forSSR('http://localhost:8080', {
    tenantId: 'default'
  });
  await client.authenticate({
    username: 'admin',
    password: process.env.RAISIN_PASSWORD
  });

  const db = client.database('myapp');
  const ws = db.workspace('content');

  const article = await ws.nodes().getByPath(`/articles/${params.slug}`);
  return { article };
}
```

## Svelte Integration

### ChatStore

The `ChatStore` provides a reactive store for Svelte:

```typescript
import { ChatStore } from '@raisindb/client/integrations/svelte-chat';

const chatStore = new ChatStore({
  agent: 'my-assistant',
  baseUrl: 'http://localhost:8080',
  repository: 'myapp',
  authManager: client.getAuthManager(),
});

// Subscribe to state changes
const unsubscribe = chatStore.subscribe((state) => {
  console.log(state.messages, state.isStreaming, state.streamingText);
});

// Send a message
await chatStore.sendMessage('Hello!');

// Clean up
chatStore.destroy();
```

## Error Handling

```typescript
import {
  RaisinError,
  RaisinConnectionError,
  RaisinAuthError,
  RaisinFlowError,
  RaisinTimeoutError,
} from '@raisindb/client';

try {
  await ws.nodes().getByPath('/articles/missing');
} catch (error) {
  if (error instanceof RaisinAuthError) {
    console.error('Auth error:', error.code, error.status);
  } else if (error instanceof RaisinConnectionError) {
    console.error('Connection lost:', error.code);
  } else if (error instanceof RaisinFlowError) {
    console.error('Flow error:', error.code, error.instanceId);
  } else if (error instanceof RaisinTimeoutError) {
    console.error('Timed out after', error.timeoutMs, 'ms');
  } else if (error instanceof RaisinError) {
    console.error('RaisinDB error:', error.code, error.message);
  }
}
```

## Configuration Options

```typescript
const client = new RaisinClient('ws://localhost:8080', {
  tenantId: 'default',
  defaultBranch: 'main',
  requestTimeout: 30000,
  logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
  tokenStorage: new LocalStorageTokenStorage(),
});
```

## Connection State

Monitor and react to connection lifecycle:

```typescript
client.onConnectionStateChange((state) => {
  // state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed'
  console.log('Connection:', state);
});

client.onReconnected(() => {
  console.log('Reconnected — subscriptions auto-restored');
});
```

## TypeScript Types

The client is fully typed:

```typescript
import type {
  Node,
  NodeCreateOptions,
  NodeUpdateOptions,
  NodeQueryOptions,
  PropertyValue,
  ChatMessage,
  ChatEvent,
  Conversation,
  ConversationType,
  ConversationListItem,
  FlowExecutionEvent,
  FlowRunResponse,
} from '@raisindb/client';
```

## Next Steps

- [Connection & Authentication Reference](../../reference/javascript-client/connection.md)
- [Node Operations Reference](../../reference/javascript-client/node-operations.md)
- [Event Subscriptions Reference](../../reference/javascript-client/events.md)
- [Chat & Conversations Reference](../../reference/javascript-client/chat.md)
- [Flows Reference](../../reference/javascript-client/flows.md)
- [Uploads Reference](../../reference/javascript-client/uploads.md)
