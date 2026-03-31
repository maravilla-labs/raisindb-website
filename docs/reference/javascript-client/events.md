---
sidebar_position: 4
---

# Events

Real-time event subscriptions via WebSocket.

## EventSubscriptions

Access event subscriptions through a workspace:

```typescript
const ws = db.workspace('content');
const events = ws.events();
```

### subscribe()

Subscribe with custom filters.

```typescript
subscribe(
  filters: Partial<SubscriptionFilters>,
  callback: EventCallback
): Promise<Subscription>
```

```typescript
type EventCallback = (event: EventMessage) => void;
```

Example:

```typescript
const sub = await ws.events().subscribe({}, (event) => {
  console.log('Event:', event.event_type, event.payload);
});
```

### subscribeToNodeType()

Subscribe to events for a specific node type.

```typescript
subscribeToNodeType(
  nodeType: string,
  callback: EventCallback
): Promise<Subscription>
```

Example:

```typescript
const sub = await ws.events().subscribeToNodeType('Article', (event) => {
  console.log('Article changed:', event.payload);
});
```

### subscribeToPath()

Subscribe to events for nodes at or under a path.

```typescript
subscribeToPath(
  path: string,
  callback: EventCallback,
  options?: { includeNode?: boolean }
): Promise<Subscription>
```

Example:

```typescript
const sub = await ws.events().subscribeToPath('/articles', (event) => {
  console.log('Change under /articles:', event.payload);
});
```

### subscribeToTypes()

Subscribe to specific event types.

```typescript
subscribeToTypes(
  eventTypes: string[],
  callback: EventCallback
): Promise<Subscription>
```

Available event types:

| Event Type | Description |
|-----------|-------------|
| `node:created` | A node was created |
| `node:updated` | A node's properties were updated |
| `node:deleted` | A node was deleted |
| `node:reordered` | A node's order key changed |
| `node:published` | A node was published |
| `node:unpublished` | A node was unpublished |
| `node:property_changed` | A specific property changed |
| `node:relation_added` | A relationship was added |
| `node:relation_removed` | A relationship was removed |

Example:

```typescript
const sub = await ws.events().subscribeToTypes(
  ['node:created', 'node:deleted'],
  (event) => {
    console.log(event.event_type, event.payload);
  }
);
```

---

## Subscription

### unsubscribe()

Stop receiving events for this subscription.

```typescript
await subscription.unsubscribe(): Promise<void>
```

### isActive()

Check whether the subscription is still active.

```typescript
subscription.isActive(): boolean
```

---

## Automatic Reconnection

When the WebSocket disconnects and reconnects, all active subscriptions are automatically restored. No manual re-subscription is needed.

---

## Example

```typescript
const ws = db.workspace('content');

// Listen for new articles
const sub = await ws.events().subscribeToNodeType('Article', (event) => {
  if (event.event_type === 'node:created') {
    console.log('New article:', event.payload.path);
  }
});

// Later
await sub.unsubscribe();
```
