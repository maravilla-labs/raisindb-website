---
sidebar_position: 6
---

# Realtime Subscriptions & Inbox

Node subscriptions are the realtime backbone of RaisinDB apps: live queries, inbox bells, presence — all without polling or extra APIs. This page covers the path filter semantics (the most common source of "my subscription never fires" bugs) and the inbox-bell pattern.

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
  path?: string;            // glob pattern, see semantics below
  node_type?: string;       // e.g. 'raisin:Message'
  include_node?: boolean;   // deliver the full node in the payload
}
```

## Path filter semantics

The server matches subscription paths **literally with glob semantics**. There is **no implicit prefix matching** — a plain path only matches that exact node.

| Pattern | Matches |
|---------|---------|
| `/users/alice/inbox` | exactly that node — nothing below it |
| `/users/alice/inbox/*` | direct children only (`*` = exactly one path segment) |
| `/users/alice/inbox/**` | the whole subtree, any depth (`**` = recursive) |
| `/users/*/outbox/*` | one segment wildcards can appear mid-path |

Inbox items nest (chat messages live at `inbox/chats/<conversation>/<message>`), so inbox-style subscriptions almost always need the recursive `/**` suffix.

## Event payload

Node events (`node:created`, `node:updated`, `node:deleted`, ...) arrive as `EventMessage` with a `NodeEventPayload`:

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
  /** Full node — only present with include_node: true */
  node?: Node;
  metadata?: Record<string, unknown> | null;
  // relation / property-change events add relation_type,
  // target_node_id, property, ...
  [key: string]: unknown;
}
```

Pass `include_node: true` when you want to render something from the event (title, properties) without an extra round-trip.

## The inbox-bell pattern

Server-side messaging (chat replies, workflow tasks, notifications) delivers nodes into the logged-in user's home inbox in the `raisin:access_control` workspace. One subscription on `${home}/inbox/**` powers a notification bell — no polling, no extra API.

Two gotchas, both handled below:

1. **Home path normalization.** Depending on the auth path, `user.home` may be workspace-prefixed (`/raisin:access_control/users/internal/alice`) or workspace-relative (`/users/internal/alice`). Subscription paths must be workspace-relative — use `normalizeHomePath()` from the SDK.
2. **Your own messages.** The user's outgoing chat messages are persisted under their inbox too (`role: 'user'`) — skip them.

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

For a full conversation list with unread counts (rather than a raw bell), use `ConversationListStore` with `realtime: true` — it implements exactly this subscription on `${home}/inbox/chats/**` internally. See [Chat & Conversations](./chat.md#conversationliststore).

Workflow human tasks land in the same home inbox; to list and complete them programmatically use `db.inbox` (`InboxApi`) — see [Inbox tasks](./flows.md#inbox-tasks-dbinbox).

## Reconnection

Active subscriptions are restored automatically after a reconnect. If restoration fails permanently (after retries with backoff), the client emits `subscription_restore_failed`:

```typescript
client.on('subscription_restore_failed', (error) => {
  // Realtime events may be stale: reload lists and/or re-subscribe manually
});

client.onReconnected(() => {
  // Fired only after connection + auth + successful subscription restore —
  // a good place to refetch query data.
});
```

See [Events](./events.md) for the full `EventSubscriptions` API and the list of event types.
