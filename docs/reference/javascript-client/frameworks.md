---
sidebar_position: 7
---

# Framework Integrations

The SDK ships subpath exports for three frameworks:

| Framework | Import | Pattern |
|-----------|--------|---------|
| React | `@raisindb/client/react` | `createRaisinReact(React)` returns a Provider plus hooks |
| Svelte 5 | `@raisindb/client/svelte` | Framework-free adapters that bind to runes |
| Vue 3 | `@raisindb/client/vue` | `createRaisinVue(vue)` returns composables |

None of them makes the framework a dependency of the SDK. React and Vue use a "bring your own framework" factory (you pass the framework module in once), and the Svelte adapters are plain snapshot/subscribe objects. The core `@raisindb/client` bundle never imports `react`, `svelte` or `vue`.

All three sit on the same framework-agnostic stores (`ConversationStore`, `ConversationListStore`) and adapters, so streaming, tool-call tracking, plan projection and hang recovery behave identically. See [Chat & Conversations](./chat.md) for the underlying API.

## React

`createRaisinReact(React)` returns `RaisinProvider` and the hooks `useRaisinClient`, `useDatabase`, `useAuth`, `useConnection`, `useSql`, `useSubscription`, `useConversation`, `useConversationList` and `useFlow`.

```tsx
// lib/raisin-react.ts
import React from 'react';
import { RaisinClient, LocalStorageTokenStorage } from '@raisindb/client';
import { createRaisinReact } from '@raisindb/client/react';

export const client = new RaisinClient('ws://localhost:8080/ws/myrepo', {
  tokenStorage: new LocalStorageTokenStorage('myapp'),
});

export const {
  RaisinProvider, useAuth, useConnection, useSql,
  useSubscription, useConversation, useConversationList,
} = createRaisinReact(React);
```

```tsx
// Chat.tsx
import { client, useConversation } from './lib/raisin-react';

function Chat() {
  const chat = useConversation({
    database: client.database('myrepo'),
    createOptions: { participant: '/agents/support' },
  });

  return (
    <div>
      {chat.messages.map((m, i) => <p key={i}>{m.content}</p>)}
      {chat.isStreaming && <p className="streaming">{chat.streamingText}</p>}
      {chat.activeToolCalls.map((tc) => (
        <span key={tc.id} className="badge">{tc.functionName}: {tc.status}</span>
      ))}
      <button onClick={() => chat.sendMessage('Hello!')}>Send</button>
    </div>
  );
}

export default function App() {
  return (
    <RaisinProvider client={client} repository="myrepo">
      <Chat />
    </RaisinProvider>
  );
}
```

Hooks clean up on unmount: stores are destroyed and subscriptions released.

## Svelte 5

The Svelte entry exports adapter factories: `createAuthAdapter`, `createConnectionAdapter`, `createSqlAdapter`, `createSubscriptionAdapter`, `createFlowAdapter`, `createConversationAdapter` and `createConversationListAdapter`, designed for `$state` in `.svelte.ts` files:

```typescript
// lib/chat.svelte.ts
import { type ConversationStoreSnapshot } from '@raisindb/client';
import { createConversationAdapter } from '@raisindb/client/svelte';
import { db } from '$lib/raisin';

const adapter = createConversationAdapter({
  database: db,
  createOptions: { participant: '/agents/support' },
});

let snapshot = $state<ConversationStoreSnapshot>(adapter.getSnapshot());
adapter.subscribe((s) => { snapshot = s; });

export const chat = {
  get messages() { return snapshot.messages; },
  get isStreaming() { return snapshot.isStreaming; },
  get streamingText() { return snapshot.streamingText; },
  get activeToolCalls() { return snapshot.activeToolCalls; },
  get plans() { return snapshot.plans; },
  send: adapter.sendMessage,
  approvePlan: adapter.approvePlan,
  destroy: adapter.destroy,
};
```

```svelte
<!-- Chat.svelte -->
<script lang="ts">
  import { chat } from '$lib/chat.svelte';
</script>

{#each chat.messages as msg}
  <p>{msg.content}</p>
{/each}
{#if chat.isStreaming}
  <p class="streaming">{chat.streamingText}</p>
{/if}
```

The [shiftboard example](https://github.com/maravilla-labs/raisindb/tree/main/examples/shiftboard) is a complete Svelte 5 app built this way (chat, inbox bell, live board).

## Vue 3

`createRaisinVue(vue)` returns the composables `useAuth`, `useConnection`, `useSql`, `useSubscription`, `useConversation` and `useConversationList`. Pass the Vue module once; only `ref`, `computed` and `onUnmounted` are used.

```typescript
// lib/raisin-vue.ts
import * as vue from 'vue';
import { RaisinClient, LocalStorageTokenStorage } from '@raisindb/client';
import { createRaisinVue } from '@raisindb/client/vue';

export const client = new RaisinClient('ws://localhost:8080/ws/myrepo', {
  tokenStorage: new LocalStorageTokenStorage('myapp'),
});
export const db = client.database('myrepo');

export const {
  useAuth, useConnection, useSql, useSubscription,
  useConversation, useConversationList,
} = createRaisinVue(vue);
```

```vue
<!-- Chat.vue -->
<script setup lang="ts">
import { db, useConversation } from '@/lib/raisin-vue';

const chat = useConversation({
  database: db,
  createOptions: { participant: '/agents/support' },
});
// Cleanup is automatic: the composable destroys its store onUnmounted.
</script>

<template>
  <p v-for="(m, i) in chat.messages.value" :key="i">{{ m.content }}</p>
  <p v-if="chat.isStreaming.value" class="streaming">{{ chat.streamingText.value }}</p>
  <span v-for="tc in chat.activeToolCalls.value" :key="tc.id" class="badge">
    {{ tc.functionName }}: {{ tc.status }}
  </span>
  <button @click="chat.sendMessage('Hello!')">Send</button>
</template>
```

Composable return values are computed refs (`chat.messages.value`) plus plain action functions (`sendMessage`, `approvePlan`, `stop`). Node-event subscriptions work the same way:

```vue
<script setup lang="ts">
import { db, useSubscription } from '@/lib/raisin-vue';
import { normalizeHomePath } from '@raisindb/client';

const home = normalizeHomePath(user.home)!;

useSubscription(
  db,
  { workspace: 'raisin:access_control', path: `${home}/inbox/**`,
    event_types: ['node:created'], include_node: true },
  (event) => notify(event.payload.node),
); // unsubscribes automatically on unmount
</script>
```

## Vanilla and other frameworks

Everything above is sugar over `ConversationStore`, `ConversationListStore` and the `events()` subscriptions, all exported from the core `@raisindb/client` entry with a plain `subscribe(callback)` / `getSnapshot()` contract. Any reactive system (Angular signals, SolidJS, lit) can bind the same way.
