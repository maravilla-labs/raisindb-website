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

const client = new RaisinClient('ws://localhost:8080', {
  tenantId: 'default'
});

await client.connect();
await client.authenticate({
  username: 'admin',
  password: 'password'
});

const db = client.database('myapp');
const ws = db.workspace('content');
```

## Reference Pages

- [Connection & Authentication](./connection.md) — Connect, authenticate, manage sessions
- [Node Operations](./node-operations.md) — CRUD, tree operations, relationships
- [Events](./events.md) — Real-time subscriptions
- [Chat & Conversations](./chat.md) — Conversational AI client and inbox management
- [Flows](./flows.md) — Workflow execution and streaming
- [Uploads](./uploads.md) — File uploads and signed URLs
