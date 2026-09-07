---
sidebar_position: 4
---

# Events

Real-time event subscriptions over the WebSocket connection.

## EventSubscriptions

```typescript
const ws = db.workspace('content');
const events = ws.events();
```

### subscribe()

Subscribe with explicit filters. All filters are optional and combined with AND; the workspace is set by `ws.events()`.

```typescript
subscribe(filters: Partial<SubscriptionFilters>, callback: (event: EventMessage) => void): Promise<Subscription>

interface SubscriptionFilters {
  workspace?: string;
  path?: string;            // glob: exact node, '/*' children, '/**' subtree
  event_types?: string[];   // e.g. ['node:created', 'node:updated']
  node_type?: string;
  include_node?: boolean;   // deliver the full node in the payload
}
```

```typescript
const sub = await events.subscribe(
  { path: '/articles/**', event_types: ['node:created', 'node:updated'] },
  (event) => console.log(event.event_type, event.payload.path),
);
```

### subscribeToNodeType()

```typescript
subscribeToNodeType(nodeType: string, callback: EventCallback): Promise<Subscription>
```

### subscribeToPath()

```typescript
subscribeToPath(path: string, callback: EventCallback, options?: { includeNode?: boolean }): Promise<Subscription>
```

:::warning Path matching is a literal glob
A plain path matches only that exact node. Use `/articles/*` for direct children and `/articles/**` for the whole subtree. See [Realtime Subscriptions & Inbox](./realtime-inbox.md#path-filter-semantics).
:::

### subscribeToTypes()

```typescript
subscribeToTypes(eventTypes: string[], callback: EventCallback): Promise<Subscription>
```

Event types:

| Event type | Emitted when |
|-----------|--------------|
| `node:created` | A node was created |
| `node:updated` | A node's properties changed |
| `node:deleted` | A node was deleted |
| `node:reordered` | A node's order key changed |
| `node:published` | A node was published |
| `node:unpublished` | A node was unpublished |
| `node:property_changed` | A single property changed |
| `node:relation_added` | A relationship was added |
| `node:relation_removed` | A relationship was removed |

The constants are exported as `NodeEventType` and `AllNodeEventTypes`.

## Event payload

```typescript
interface EventMessage<TPayload = NodeEventPayload> {
  event_id: string;
  subscription_id: string;
  event_type: string;        // e.g. 'node:created'
  payload: TPayload;
  timestamp: string;         // ISO 8601
}

interface NodeEventPayload {
  kind: string;              // 'Created', 'Updated', 'Deleted', ...
  tenant_id?: string;
  repository_id?: string;
  branch?: string;
  workspace_id?: string;
  node_id?: string;
  node_type?: string | null;
  path?: string | null;
  revision?: string;
  node?: Node;               // only with include_node: true
  metadata?: Record<string, unknown> | null;
  relation_type?: string;    // relation events
  target_node_id?: string;
  property?: string;         // property_changed events
  [key: string]: unknown;
}
```

A single `update()` can produce more than one `node:updated` event (for example when the node record and a derived index are written in separate steps), so make handlers idempotent.

## Subscription

```typescript
interface Subscription {
  id: string;
  unsubscribe(): Promise<void>;
  isActive(): boolean;
}
```

## Automatic reconnection

After a reconnect the client restores every active subscription. If a subscription cannot be restored after retries the client emits `subscription_restore_failed`; see [Reconnection](./realtime-inbox.md#reconnection).

## Example

```typescript
const sub = await ws.events().subscribeToNodeType('raisin:Page', (event) => {
  if (event.event_type === 'node:created') {
    console.log('New page:', event.payload.path);
  }
});

// later
await sub.unsubscribe();
```
