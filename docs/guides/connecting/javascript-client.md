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

const client = new RaisinClient('ws://localhost:8080/ws/myapp');

await client.connect();
await client.authenticate({
  username: 'admin',
  password: 'your-password'
});

// Get database interface
const db = client.database('myapp');
```

Connection URLs use the tenant-less `ws://host/ws/{repository}` form — no
tenant id needed. Equivalently, pass a bare host URL with the `repository`
option: `new RaisinClient('ws://localhost:8080', { repository: 'myapp' })`.
Multi-tenant operators can address a specific tenant with
`ws://host/sys/{tenant}/{repository}`.

### HTTP-Only Client (Server-Side Rendering)

For server-side rendering where WebSocket is not available:

```typescript
import { RaisinClient } from '@raisindb/client';

const client = RaisinClient.forSSR('http://localhost:8080');

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

const client = new RaisinClient('ws://localhost:8080/ws/myapp', {
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

Build conversational AI features with the `ConversationManager` (`db.conversations`). It handles conversation lifecycle, real-time streaming, plan approvals, and message history. Conversations are stored as `raisin:Conversation` nodes with `raisin:Message` children. See [Chat & Conversations](../../reference/javascript-client/chat.md) for the full reference.

### Access the ConversationManager

```typescript
const db = client.database('myapp');
const conversations = db.conversations;
```

The getter returns a lazily-created, cached `ConversationManager` pre-configured with the correct base URL, repository, and auth manager.

### One-Shot Chat

Send a single message and collect the full response:

```typescript
const { response, conversationPath } = await db.conversations.chat(
  '/agents/my-assistant',
  'What is RaisinDB?'
);
console.log(response);
```

### Multi-Turn Conversations

Create a conversation and stream responses in real time:

```typescript
// Start a conversation (agent paths create an ai_chat)
const conversation = await db.conversations.create({
  participant: '/agents/my-assistant'
});

// Send a message and stream the response
for await (const event of db.conversations.sendMessage(
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
const conversation = await db.conversations.open(conversationPath);

if (conversation) {
  // Load previous messages
  const messages = await db.conversations.getMessages(conversation.conversationPath);
}
```

### Manage Conversations

```typescript
// List AI chat conversations
const chats = await db.conversations.list({
  type: 'ai_chat',
  limit: 20,
});

// Mark as read
await db.conversations.markAsRead(chats[0].conversationPath);
```

### ConversationStore (UI state)

For building chat UIs, `ConversationStore` wraps the manager with a snapshot/subscribe state container — streaming text, tool-call tracking, plan projection, and hang recovery included:

```typescript
import { ConversationStore } from '@raisindb/client';

const store = new ConversationStore({
  database: db,
  createOptions: { participant: '/agents/my-assistant' },
});

store.subscribe((s) => {
  render(s.messages, s.isStreaming, s.streamingText, s.activeToolCalls);
});

await store.sendMessage('Hello!');
// later
store.destroy();
```

## Flow Execution

Run server-side workflows and stream their progress in real time.

### Create a Flow Client

```typescript
const db = client.database('myapp');
const flowClient = db.flow;
```

Or create one manually from an authenticated client:

```typescript
import { FlowClient } from '@raisindb/client';

const flowClient = FlowClient.fromHttpClient(
  client,               // authenticated RaisinClient or RaisinHttpClient
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

The `@raisindb/client/react` subpath export provides a Provider plus hooks (`useAuth`, `useSql`, `useSubscription`, `useConversation`, `useFlow`, ...). See [Framework Integrations](../../reference/javascript-client/frameworks.md) for the complete reference.

### useConversation Hook

```tsx
import React from 'react';
import { createRaisinReact } from '@raisindb/client/react';
import { client } from './lib/raisin'; // your RaisinClient instance

const { RaisinProvider, useConversation } = createRaisinReact(React);

function ChatWidget() {
  const chat = useConversation({
    database: client.database('myapp'),
    createOptions: { participant: '/agents/my-assistant' },
  });

  const [input, setInput] = React.useState('');

  return (
    <div>
      {chat.messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
        </div>
      ))}

      {chat.isStreaming && <div className="assistant">{chat.streamingText}</div>}

      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => { chat.sendMessage(input); setInput(''); }}>
        Send
      </button>
      {chat.isStreaming && <button onClick={chat.stop}>Stop</button>}
    </div>
  );
}
```

### React Router Loader (SSR)

```typescript
import { RaisinClient } from '@raisindb/client';

export async function articleLoader({ params }) {
  const client = RaisinClient.forSSR('http://localhost:8080');
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

### Conversation adapter

The `@raisindb/client/svelte` subpath export provides adapter factories designed for Svelte 5 runes (`createAuthAdapter`, `createSqlAdapter`, `createConversationAdapter`, ...):

```typescript
import { createConversationAdapter } from '@raisindb/client/svelte';

const adapter = createConversationAdapter({
  database: client.database('myapp'),
  createOptions: { participant: '/agents/my-assistant' },
});

// Subscribe to state changes (bind to $state in a .svelte.ts file)
const unsubscribe = adapter.subscribe((state) => {
  console.log(state.messages, state.isStreaming, state.streamingText);
});

// Send a message
await adapter.sendMessage('Hello!');

// Clean up
adapter.destroy();
```

See [Framework Integrations](../../reference/javascript-client/frameworks.md#svelte-5) for the full adapter list and a runes-based example.

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
import { RaisinClient, LocalStorageTokenStorage, LogLevel } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', {
  repository: 'myapp',          // builds the /ws/myapp route
  defaultBranch: 'main',
  requestTimeout: 30000,
  logLevel: LogLevel.Info,      // Silent | Error | Warn | Info | Debug
  tokenStorage: new LocalStorageTokenStorage(),
});
```

See the [ClientOptions reference](../../reference/javascript-client/connection.md#constructor) for the full option table.

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
