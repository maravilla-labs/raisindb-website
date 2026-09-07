---
sidebar_position: 6
---

# Realtime Subscriptions & Inbox

Node subscriptions are the real-time backbone of RaisinDB apps: live lists, inbox bells and presence without polling. This page covers the path filter semantics (the most common cause of "my subscription never fires") and the inbox-bell pattern.

## Subscribing

```typescript
const ws = db.workspace('raisin:access_control');

const sub = await ws.events().subscribe(
  {
    path: '/users/internal/alice/inbox/**',
    event_types: ['node:created'],
    include_node: true,
  },
  (event) => console.log(event.event_type, event.payload),
);

// later
await sub.unsubscribe();
```

All filters are optional and combined with AND:

```typescript
interface SubscriptionFilters {
  workspace?: string;       // usually set via ws.events()
  event_types?: string[];   // e.g. ['node:created', 'node:updated']
  path?: string;            // glob pattern, see below
  node_type?: string;       // e.g. 'raisin:Message'
  include_node?: boolean;   // deliver the full node in the payload
}
```

## Path filter semantics

The server matches subscription paths as literal globs. A plain path matches only that exact node; there is no implicit prefix matching.

| Pattern | Matches |
|---------|---------|
| `/users/alice/inbox` | exactly that node, nothing below it |
| `/users/alice/inbox/*` | direct children only (`*` is exactly one path segment) |
| `/users/alice/inbox/**` | the whole subtree, any depth |
| `/users/*/outbox/*` | one-segment wildcards can appear mid-path |

Inbox items nest (chat messages live at `inbox/chats/<conversation>/<message>`), so inbox subscriptions almost always need the recursive `/**` suffix.

## Event payload

Node events arrive as `EventMessage` with a `NodeEventPayload`:

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
  workspace_id?: string;
  node_id?: string;
  node_type?: string | null;
  path?: string | null;
  revision?: string;
  node?: Node;               // only present with include_node: true
  metadata?: Record<string, unknown> | null;
  // relation / property-change events add relation_type, target_node_id, property, ...
  [key: string]: unknown;
}
```

Pass `include_node: true` to render from the event (title, properties) without another round-trip. Fall back to a fetch by `node_id` when `payload.node` is absent.

## The inbox-bell pattern

Server-side messaging (chat replies, workflow tasks, notifications) delivers nodes into the signed-in user's home inbox in the `raisin:access_control` workspace. One subscription on `${home}/inbox/**` powers a notification bell.

Two details to handle:

1. **Home path normalization.** Depending on how the user signed in, `user.home` may be workspace-prefixed (`/raisin:access_control/users/internal/alice`) or workspace-relative (`/users/internal/alice`). Subscription paths must be workspace-relative; `normalizeHomePath()` from the SDK strips the prefix.
2. **Your own messages.** The user's outgoing chat messages are stored under their inbox too (`role: 'user'`); skip them.

From the [shiftboard example](https://github.com/maravilla-labs/raisindb/tree/main/examples/shiftboard):

```typescript
import { normalizeHomePath, type EventMessage } from '@raisindb/client';

const user = await client.initSession('shiftboard');
const home = normalizeHomePath(user!.home)!;
// '/raisin:access_control/users/internal/alice' -> '/users/internal/alice'

await db.workspace('raisin:access_control').events().subscribe(
  {
    path: `${home}/inbox/**`,        // ** because inbox items nest
    event_types: ['node:created'],
    include_node: true,
  },
  (event: EventMessage) => {
    const props = event.payload.node?.properties ?? {};

    // Skip the user's own outgoing chat messages.
    if (props.role === 'user') return;

    unread += 1;
    showToast(
      (props.title as string) ??
        (props.subject as string) ??
        event.payload.node?.name ??
        'New inbox item',
    );
  },
);
```

For a full conversation list with unread counts, use `ConversationListStore` with `realtime: true`; it makes this subscription on `${home}/inbox/chats/**` internally. See [Chat & Conversations](./chat.md#conversationliststore).

Workflow human tasks land in the same home inbox. To list and complete them programmatically use `db.inbox` (`listTasks`, `getTask`, `completeTask`); see [Inbox tasks](./flows.md#inbox-tasks-dbinbox).

## Reconnection

Active subscriptions are restored automatically after a reconnect. If restoration fails permanently (after retries with backoff), the client emits `subscription_restore_failed`:

```typescript
client.on('subscription_restore_failed', (error) => {
  // Realtime events may be stale: reload lists and/or re-subscribe manually
});

client.onReconnected(() => {
  // Fires only after connection, auth and subscription restore all succeeded;
  // a good place to refetch query data.
});
```

See [Events](./events.md) for the full `EventSubscriptions` API and the list of event types.
