---
sidebar_position: 1
---

# JavaScript Client Overview

Complete reference for `@raisindb/client`.

## Installation

```bash
npm install @raisindb/client
```

## Quick Start

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('ws://localhost:8080/ws/myapp');

await client.connect();
await client.authenticate({
  username: 'admin',
  password: 'password'
});

const db = client.database('myapp');
const ws = db.workspace('content');
```

Connection URLs use the tenant-less `ws://host/ws/{repository}` form — clients
never need to know a tenant id. Multi-tenant operators can address a specific
tenant with `ws://host/sys/{tenant}/{repository}` (or by passing the
`tenantId` option).

## Reference Pages

- [Connection & Authentication](./connection.md) — Connect, authenticate, manage sessions
- [Node Operations](./node-operations.md) — CRUD, tree operations, relationships
- [Branches](./branches.md) — Fork, compare, and merge branches; `onBranch()` scoping
- [Events](./events.md) — Real-time subscriptions
- [Realtime Subscriptions & Inbox](./realtime-inbox.md) — Path filter semantics, inbox-bell pattern
- [Chat & Conversations](./chat.md) — ConversationManager, ConversationStore, streaming, plans
- [Framework Integrations](./frameworks.md) — React, Svelte 5, and Vue 3 bindings
- [Flows](./flows.md) — Workflow execution and streaming
- [Uploads](./uploads.md) — File uploads and signed URLs
