---
sidebar_position: 2
---

# Connection & Authentication

Connect, authenticate, and manage client lifecycle.

## RaisinClient

### Constructor

```typescript
new RaisinClient(url: string, options?: ClientOptions)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | WebSocket URL (e.g. `ws://localhost:8080/ws/myrepo`) |
| `options` | `ClientOptions` | Optional configuration |

```typescript
interface ClientOptions {
  repository?: string;
  tenantId?: string;
  defaultBranch?: string;
  requestTimeout?: number;
  connection?: ConnectionOptions;
  tokenStorage?: TokenStorage;
  logLevel?: LogLevel;
  mode?: 'websocket' | 'http' | 'hybrid';
  httpBaseUrl?: string;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `repository` | extracted from URL | Repository name. With a bare host URL the client builds the tenant-less `/ws/{repository}` route internally. With a path URL it overrides the repository extracted from the URL (used for repo-scoped auth endpoints). |
| `tenantId` | extracted from URL, else `'default'` | Optional — you normally never set this. The server resolves the tenant for `/ws/{repo}` connections; multi-tenant operators address a specific tenant with the `/sys/{tenant}/{repo}` URL form instead. |
| `defaultBranch` | `'main'` | Branch used for all operations unless overridden. |
| `requestTimeout` | `30000` | Per-request timeout in milliseconds. Requests that exceed it reject with `RaisinTimeoutError`. |
| `connection` | — | Low-level `ConnectionOptions`: `autoReconnect` (default `true`), `reconnectOptions`, `heartbeatInterval` (default `30000`, `0` disables), `heartbeatTimeout` (default `5000`), `protocols`, `headers` (upgrade headers, Node.js only). |
| `tokenStorage` | `MemoryTokenStorage` | Where tokens are persisted (see [Token Storage](#token-storage)). |
| `logLevel` | `LogLevel.Info` | `LogLevel` enum: `Silent`, `Error`, `Warn`, `Info`, `Debug`. |
| `mode` | `'websocket'` | Client mode. |
| `httpBaseUrl` | derived from WS URL | HTTP base URL for identity auth and uploads. |

The `repository` option lets you connect with a bare host URL — `new
RaisinClient('ws://localhost:8080', { repository: 'myrepo' })` builds the
tenant-less `/ws/myrepo` route internally. Multi-tenant operators can
address a specific tenant with the `/sys/{tenant}/{repository}` URL form
instead.

### connect()

Establish the WebSocket connection.

```typescript
await client.connect(): Promise<void>
```

### disconnect()

Close the WebSocket connection.

```typescript
client.disconnect(): void
```

### database()

Get a database interface for the given repository.

```typescript
client.database(name: string): Database
```

The returned `Database` comes pre-configured with access to the [Conversations](./chat.md), [Flow](./flows.md), [Functions](./functions.md), and inbox-task APIs:

```typescript
const db = client.database('myapp');

// Conversations — conversational AI
const convo = await db.conversations.create({ participant: '/agents/support' });

// Flow — workflow execution
const result = await db.flow.runAndWait('/flows/process-order', { orderId: '123' });

// Inbox — human-in-the-loop tasks
const { tasks } = await db.inbox.listTasks({ status: 'pending' });
```

| Accessor | Returns | Reference |
|----------|---------|-----------|
| `db.conversations` | [`ConversationManager`](./chat.md) — list/create/open conversations, streaming, plan actions | [Chat & Conversations](./chat.md) |
| `db.flow` | [`FlowClient`](./flows.md) — run flows over HTTP with SSE streaming | [Flows](./flows.md) |
| `db.flows()` | `FlowsApi` — flow execution over the WebSocket connection | [Flows](./flows.md#flowsapi-websocket) |
| `db.functions()` | `FunctionsApi` — invoke server-side functions | [Functions](./functions.md) |
| `db.inbox` | `InboxApi` — list/complete human-in-the-loop tasks | [Flows](./flows.md#inbox-tasks-dbinbox) |

All accessors are lazily created and cached, pre-configured with the correct base URL, repository, and auth manager.

---

## Authentication

### authenticate()

Authenticate with admin credentials or a JWT token.

```typescript
await client.authenticate(credentials: Credentials): Promise<void>
```

Admin credentials:

```typescript
await client.authenticate({
  username: 'admin',
  password: 'your-password'
});
```

JWT token:

```typescript
await client.authenticate({
  type: 'jwt',
  token: 'eyJhbGciOiJIUzI...'
});
```

### loginWithEmail()

Log in an existing user with email and password.

```typescript
await client.loginWithEmail(
  email: string,
  password: string,
  repository: string
): Promise<IdentityUser>
```

Returns an `IdentityUser` with `id`, `email`, `displayName`, and `home` path.

### registerWithEmail()

Register a new user account.

```typescript
await client.registerWithEmail(
  email: string,
  password: string,
  repository: string,
  displayName?: string
): Promise<IdentityUser>
```

### initSession()

Restore a session from a previously stored token.

```typescript
await client.initSession(
  repository: string
): Promise<IdentityUser | null>
```

Returns the user if a valid stored token exists, or `null` otherwise.

### refreshToken()

Manually refresh the access token.

```typescript
await client.refreshToken(): Promise<IdentityUser | null>
```

### logout()

Sign out and optionally disconnect.

```typescript
await client.logout(options?: {
  disconnect?: boolean;
  reconnect?: boolean;
}): Promise<void>
```

---

## Session & User Info

### isAuthenticated()

```typescript
client.isAuthenticated(): boolean
```

### isReady()

Returns `true` when the client is both connected and authenticated.

```typescript
client.isReady(): boolean
```

### getCurrentUser()

```typescript
client.getCurrentUser(): CurrentUser | null
```

```typescript
interface CurrentUser {
  userId: string;
  roles?: string[];
  anonymous: boolean;
  node?: UserNode;
}
```

### getCurrentUserId()

```typescript
client.getCurrentUserId(): string | null
```

### getCurrentUserPath()

```typescript
client.getCurrentUserPath(): string | null
```

### getSession()

```typescript
client.getSession(): {
  user: IdentityUser | null;
  accessToken: string | null;
} | null
```

### getUser()

Alias for `getSession()?.user`. Compatible with Supabase patterns.

```typescript
client.getUser(): IdentityUser | null
```

---

## State Listeners

### onAuthStateChange()

Listen for authentication lifecycle events.

```typescript
const unsubscribe = client.onAuthStateChange(
  callback: (change: AuthStateChange) => void
): () => void
```

```typescript
interface AuthStateChange {
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
       | 'SESSION_EXPIRED' | 'USER_UPDATED';
  session: {
    user: IdentityUser | null;
    accessToken: string | null;
  };
}
```

### onConnectionStateChange()

```typescript
const unsubscribe = client.onConnectionStateChange(
  callback: (state: ConnectionState) => void
): () => void
```

`ConnectionState` is one of: `'disconnected'` | `'connecting'` | `'connected'` | `'reconnecting'` | `'closed'`.

### onReadyStateChange()

Fires when the combined connected + authenticated state changes.

```typescript
const unsubscribe = client.onReadyStateChange(
  callback: (ready: boolean) => void
): () => void
```

### onReconnected()

Fires after the client automatically reconnects.

```typescript
const unsubscribe = client.onReconnected(
  callback: () => void
): () => void
```

### onUserChange()

Fires when the user's home node is updated.

```typescript
const unsubscribe = client.onUserChange(
  callback: (event: UserChangeEvent) => void
): () => void
```

---

## Connection Info

### isConnected()

```typescript
client.isConnected(): boolean
```

### getConnectionState()

```typescript
client.getConnectionState(): ConnectionState
```

### getBranch() / setBranch()

```typescript
client.getBranch(): string
client.setBranch(branch: string): void
```

### getTenantId()

```typescript
client.getTenantId(): string
```

---

## Reconnection & Request Queueing

The client reconnects automatically (exponential backoff) and re-authenticates with the stored token. Requests issued while the connection is re-establishing are **queued and flushed** after reconnect + re-auth, so brief network blips don't surface as errors. The queue is capped at **100 requests** — overflow rejects immediately (`Request queue is full`).

After a reconnect, active subscriptions are restored with retries; if restoration fails permanently the client emits `subscription_restore_failed` (see [Realtime Subscriptions & Inbox](./realtime-inbox.md#reconnection)). `onReconnected()` fires only after connection, auth, and subscription restore have all succeeded.

Failures surface as typed errors:

| Error | Thrown when |
|-------|-------------|
| `RaisinTimeoutError` | A request exceeds `requestTimeout` (carries `timeoutMs`) |
| `RaisinAuthError` | Authentication or token refresh fails (carries `code`, `status`) |
| `RaisinConnectionError` | The connection drops unrecoverably |

---

## HTTP Client (SSR)

For server-side rendering where WebSocket is not available:

```typescript
const client = RaisinClient.forSSR('http://localhost:8080', {
  tenantId: 'default'
});

// Also available as:
const client = RaisinClient.createHttpClient('http://localhost:8080', options);
```

The HTTP client supports the same authentication and database methods but communicates over REST instead of WebSocket. Real-time events and flows over WebSocket are not available.

---

## Token Storage

```typescript
interface TokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clear(): void;
}
```

Built-in implementations:

| Class | Storage | Use case |
|-------|---------|----------|
| `MemoryTokenStorage` | In-memory | Default, server-side |
| `LocalStorageTokenStorage` | `localStorage` | Browser persistence |

---

## Types

```typescript
interface IdentityUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  home?: string;
}
```
