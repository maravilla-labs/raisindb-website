---
sidebar_position: 3
---

# JavaScript/TypeScript Client

Build applications with `@raisindb/client`, the official SDK. It talks to the server over WebSocket for real-time work and over HTTP for server-side rendering, uploads and identity auth.

## Installation

```bash
npm install @raisindb/client
```

In Node.js also install the optional peer dependency `ws` (`npm install ws`); browsers use the built-in WebSocket.

## Quick start

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', { repository: 'myapp' });

await client.connect();
await client.authenticate({ username: 'admin', password: 'your-password' });

const db = client.database('myapp');
const ws = db.workspace('content');

const page = await ws.nodes().create({
  type: 'raisin:Page',
  path: '/articles/hello',
  properties: { title: 'Hello' },
});

const result = await db.executeSql(
  "SELECT path, properties->>'title' AS title FROM 'content' WHERE node_type = $1",
  ['raisin:Page'],
);
console.log(result.rows); // [{ path: '/articles/hello', title: 'Hello' }]
```

The client connects to `ws://host/ws/{repository}`. You can pass that path yourself (`new RaisinClient('ws://localhost:8080/ws/myapp')`) or give a bare host plus the `repository` option. Multi-tenant operators can address a specific tenant with `ws://host/sys/{tenant}/{repository}`.

## HTTP-only client (server-side rendering)

Where WebSocket is not available, or for one request per page load, use the HTTP client. It shares authentication and SQL with the WebSocket client but has a smaller node API (see below).

```typescript
import { RaisinClient } from '@raisindb/client';

const http = RaisinClient.forSSR('http://localhost:8080');
await http.authenticate({ username: 'admin', password: process.env.RAISIN_PASSWORD! });

const db = http.database('myapp');
const { rows } = await db.executeSql("SELECT path, properties FROM 'content' WHERE path = $1", ['/articles/hello']);
const page = await db.workspace('content').getNodeByPath('/articles/hello');
```

## Authentication

### Admin credentials or a token

```typescript
await client.authenticate({ username: 'admin', password: 'your-password' });
// or reuse a JWT / API key you already hold
await client.authenticate({ type: 'jwt', token: 'eyJhbGc...' });
```

### End users (identity auth)

Register and log in application users with the built-in identity system. The repository is required because identities and roles are per repository.

```typescript
const user = await client.registerWithEmail('alice@example.com', 'CorrectHorse1!', 'myapp', 'Alice');
const user = await client.loginWithEmail('alice@example.com', 'CorrectHorse1!', 'myapp');
console.log(user.email, user.home); // 'alice@example.com', '/users/internal/alice-at-example-com'
```

Magic links, OIDC and the lower-level endpoints are covered in [Identity Authentication](../../reference/javascript-client/identity-auth.md).

### Restore a session

Tokens are kept in a `TokenStorage`. The default keeps them in memory; in a browser use `LocalStorageTokenStorage` so a reload can pick the session back up:

```typescript
import { RaisinClient, LocalStorageTokenStorage } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', {
  repository: 'myapp',
  tokenStorage: new LocalStorageTokenStorage('myapp'),
});
await client.connect();

const user = await client.initSession('myapp'); // IdentityUser | null
if (!user) redirectToLogin();
```

### Auth and readiness events

```typescript
const off = client.onAuthStateChange(({ event, session }) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'SESSION_EXPIRED' | 'USER_UPDATED'
  console.log(event, session.user?.email);
});

client.onReadyStateChange((ready) => console.log('connected and authenticated:', ready));
console.log(client.isReady());
```

`onAuthStateChange` fires for identity sign-ins (`loginWithEmail`, `initSession`, refresh); `authenticate()` with admin credentials does not emit it.

## Working with nodes

```typescript
const ws = db.workspace('content');
const nodes = ws.nodes();

// create
const article = await nodes.create({
  type: 'raisin:Page',
  path: '/articles/hello-world',
  properties: { title: 'Hello World', status: 'draft' },
});

// read
const byId = await nodes.get(article.id);
const kids = await nodes.listChildren('/articles');   // editorial order
const page = await nodes.listChildrenPage('/articles', { limit: 50 });

// update: properties are replaced, send the full set
await nodes.update(article.id, { properties: { title: 'Hello World', status: 'published' } });

// delete
await nodes.delete(article.id); // true
```

```typescript
const hello = await nodes.getByPath('/articles/hello-world');   // Node | null
const pages = await nodes.queryByType('raisin:Page', 20);
const published = await nodes.queryByProperty('status', 'published');
```

For anything beyond a path, type or single-property lookup, use SQL from the client (see [SQL](#sql-queries)).

### Tree operations

```typescript
await nodes.move('/articles/old', '/archive');           // move under a new parent
await nodes.rename('/articles/hello-world', 'hello');    // rename in place
await nodes.copy('/articles/template', '/articles', 'new-article');
await nodes.copyTree('/articles/series', '/archive');   // deep copy
```

### Ordering

Children have a manual order. You name a position or a neighbour and the server assigns the order key; children are identified by **name**, not full path.

```typescript
await nodes.reorder('/articles', 'item-1', 0);               // 0-based position
await nodes.moveChildBefore('/articles', 'item-2', 'item-1');
await nodes.moveChildAfter('/articles', 'item-3', 'item-2');
```

Read the order back with the `__order` SQL column. Order is per branch and travels with a merge; when promoting content by copying nodes between branches, replay it with `applyChildOrder(parentPath, sourceBranch)`. See [Node Operations](../../reference/javascript-client/node-operations.md#ordering).

### Relationships

```typescript
await nodes.addRelation('/articles/hello-world', 'authored_by', '/users/john-doe');
await nodes.addRelation('/articles/review', 'reviews', '/products/item-123', { weight: 0.9, targetWorkspace: 'products' });
const rels = await nodes.getRelationships('/articles/hello-world'); // { outgoing, incoming }
await nodes.removeRelation('/articles/hello-world', '/users/john-doe');
```

## SQL queries

```typescript
const result = await db.executeSql(
  "SELECT id, path, properties->>'title' AS title FROM 'content' WHERE node_type = $1 LIMIT $2",
  ['raisin:Page', 10],
);
// result: { columns: ['id','path','title'], rows: [{ id, path, title }], row_count: 1 }
```

The tagged template turns interpolations into parameters:

```typescript
const status = 'published';
const { rows } = await db.sql`
  SELECT path, properties->>'title' AS title
  FROM 'content'
  WHERE node_type = 'raisin:Page' AND properties->>'status'::String = ${status}
`;
```

Rows are plain objects keyed by column name.

## Branches and revisions

```typescript
const featureWs = db.onBranch('feature-xyz').workspace('content');
await featureWs.nodes().create({ type: 'raisin:Page', path: '/articles/new', properties: { title: 'New' } });

const old = await db.workspace('content').atRevision('1788719623132-0').nodes().get(article.id);
```

`db.branches()` forks, compares and merges branches; see [Branches](../../reference/javascript-client/branches.md).

## Real-time events

```typescript
const sub = await ws.events().subscribe(
  { path: '/articles/**', event_types: ['node:created', 'node:updated', 'node:deleted'], include_node: true },
  (event) => console.log(event.event_type, event.payload.path, event.payload.node?.properties),
);

const byType = await ws.events().subscribeToNodeType('raisin:Page', (event) => { /* ... */ });

await sub.unsubscribe();
```

Path filters are globs: a plain path matches only that node, `/*` its direct children, `/**` the whole subtree. Subscriptions are restored automatically after a reconnect. See [Events](../../reference/javascript-client/events.md) and [Realtime Subscriptions & Inbox](../../reference/javascript-client/realtime-inbox.md).

## AI chat

`db.conversations` is a `ConversationManager` for conversational AI. Conversations are `raisin:Conversation` nodes with `raisin:Message` children. See [Chat & Conversations](../../reference/javascript-client/chat.md).

```typescript
const { response } = await db.conversations.chat('/agents/my-assistant', 'What is RaisinDB?');

const conversation = await db.conversations.create({ participant: '/agents/my-assistant' });
for await (const event of db.conversations.sendMessage(conversation.conversationPath, 'Tell me more')) {
  if (event.type === 'text_chunk') process.stdout.write(event.text);
}
```

For UI state, `ConversationStore` (and the framework hooks built on it) handles streaming text, tool-call tracking and plan approval.

## Flows

`db.flow` is a `FlowClient` that runs server-side workflows over HTTP and streams their events:

```typescript
const result = await db.flow.runAndWait('/flows/process-order', { orderId: '12345' });

const { instance_id } = await db.flow.run('/flows/generate-report', { month: '2025-01' });
for await (const event of db.flow.streamEvents(instance_id)) {
  if (event.type === 'flow_completed') console.log(event.output);
}
await db.flow.resume(instanceId, { approved: true });
```

See [Flows](../../reference/javascript-client/flows.md).

## File uploads

```typescript
const upload = await ws.upload(file, '/images/photo.jpg', {
  onProgress: (p) => console.log(`${Math.round(p.progress * 100)}%`),
});

const batch = await ws.uploadFiles(fileList, '/images', { concurrency: 3 });

const { url } = await ws.signAssetUrl('/images/photo.jpg', 'display', { expiresIn: 600 });
```

The `path` is the asset node's full path (the file becomes that node). See [Uploads](../../reference/javascript-client/uploads.md).

## Framework integrations

The package ships subpath exports for React (`@raisindb/client/react`), Svelte 5 (`@raisindb/client/svelte`) and Vue 3 (`@raisindb/client/vue`). Each provides auth, connection, SQL, subscription, conversation and flow bindings over the same stores.

```tsx
import React from 'react';
import { createRaisinReact } from '@raisindb/client/react';
import { client } from './lib/raisin';

const { RaisinProvider, useConversation } = createRaisinReact(React);

function Chat() {
  const chat = useConversation({
    database: client.database('myapp'),
    createOptions: { participant: '/agents/my-assistant' },
  });
  return (
    <div>
      {chat.messages.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}
      {chat.isStreaming && <p>{chat.streamingText}</p>}
      <button onClick={() => chat.sendMessage('Hello!')}>Send</button>
    </div>
  );
}
```

See [Framework Integrations](../../reference/javascript-client/frameworks.md) for the full list of hooks and adapters.

## Error handling

```typescript
import { RaisinError, RaisinConnectionError, RaisinAuthError, RaisinTimeoutError, RaisinFlowError } from '@raisindb/client';

try {
  await nodes.update(id, { properties });
} catch (error) {
  if (error instanceof RaisinAuthError) console.error('auth:', error.code, error.status);
  else if (error instanceof RaisinTimeoutError) console.error('timed out after', error.timeoutMs, 'ms');
  else if (error instanceof RaisinConnectionError) console.error('connection:', error.code);
  else if (error instanceof RaisinFlowError) console.error('flow:', error.code, error.instanceId);
  else if (error instanceof RaisinError) console.error(error.code, error.message);
}
```

## Configuration options

```typescript
import { RaisinClient, LocalStorageTokenStorage, LogLevel } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', {
  repository: 'myapp',           // builds the /ws/myapp route
  defaultBranch: 'main',
  requestTimeout: 30000,
  logLevel: LogLevel.Info,       // Silent | Error | Warn | Info | Debug
  tokenStorage: new LocalStorageTokenStorage('myapp'),
  connection: { autoReconnect: true, heartbeatInterval: 30000 },
});
```

See the [ClientOptions reference](../../reference/javascript-client/connection.md#constructor).

## Connection state

```typescript
client.onConnectionStateChange((state) => {
  // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed'
});
client.onReconnected(() => {
  // fires after reconnect, re-auth and subscription restore
});
```

## Next steps

- [Connection & Authentication Reference](../../reference/javascript-client/connection.md)
- [Node Operations Reference](../../reference/javascript-client/node-operations.md)
- [Event Subscriptions Reference](../../reference/javascript-client/events.md)
- [Chat & Conversations Reference](../../reference/javascript-client/chat.md)
- [Flows Reference](../../reference/javascript-client/flows.md)
- [Uploads Reference](../../reference/javascript-client/uploads.md)
