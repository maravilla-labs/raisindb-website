---
sidebar_position: 1
---

# JavaScript Client Overview

Reference for `@raisindb/client`, the TypeScript SDK for browsers and Node.js.

## Installation

```bash
npm install @raisindb/client
# Node.js only: the WebSocket implementation is an optional peer dependency
npm install ws
```

The package ships ESM and CommonJS builds with type definitions, plus subpath exports `@raisindb/client/react`, `@raisindb/client/svelte` and `@raisindb/client/vue`.

## Quick start

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080', { repository: 'myapp' });

await client.connect();
await client.authenticate({ username: 'admin', password: 'password' });

const db = client.database('myapp');
const ws = db.workspace('content');
```

The client connects to `ws://host/ws/{repository}`. Pass a bare host and the `repository` option, or the full path (`ws://localhost:8080/ws/myapp`). Multi-tenant operators can address a tenant with `ws://host/sys/{tenant}/{repository}`.

For server-side code without WebSocket, `RaisinClient.forSSR(httpUrl)` returns an HTTP-only client; see [Connection & Authentication](./connection.md#http-client-ssr).

## Reference pages

- [Connection & Authentication](./connection.md): connect, authenticate, sessions, options
- [Node Operations](./node-operations.md): CRUD, tree operations, ordering, relationships
- [Branches](./branches.md): fork, compare and merge branches; `onBranch()` scoping
- [Events](./events.md): real-time subscriptions
- [Realtime Subscriptions & Inbox](./realtime-inbox.md): path filter semantics, the inbox-bell pattern
- [Chat & Conversations](./chat.md): `ConversationManager`, `ConversationStore`, streaming
- [Framework Integrations](./frameworks.md): React, Svelte 5 and Vue 3 bindings
- [Flows](./flows.md): workflow execution and streaming
- [Functions](./functions.md): invoking server-side functions
- [Uploads](./uploads.md): file uploads and signed URLs
- [Identity Authentication](./identity-auth.md): end-user sign-in over HTTP
- [Schema Management](./schema-management.md): NodeTypes, archetypes and element types
