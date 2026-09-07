---
sidebar_position: 2
---

# Connection & Authentication

Connect, authenticate, and manage the client lifecycle.

## RaisinClient

### Constructor

```typescript
new RaisinClient(url: string, options?: ClientOptions)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | WebSocket URL: a bare host (`ws://localhost:8080`, combined with `options.repository`) or a full path (`ws://localhost:8080/ws/myrepo`, `wss://host/sys/{tenant}/{repo}`) |
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
  httpBaseUrl?: string;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `repository` | extracted from the URL | With a bare host URL the client builds the `/ws/{repository}` route. With a path URL it overrides the repository extracted from it (used for repository-scoped auth). |
| `tenantId` | from the URL, else `'default'` | Rarely needed. The server resolves the tenant for `/ws/{repo}` connections; use the `/sys/{tenant}/{repo}` URL form to target a tenant explicitly. |
| `defaultBranch` | `'main'` | Branch used for all operations unless overridden with `onBranch()`. |
| `requestTimeout` | `30000` | Per-request timeout in milliseconds; exceeding it rejects with `RaisinTimeoutError`. |
| `connection` | | `autoReconnect` (default `true`), `reconnectOptions`, `heartbeatInterval` (default `30000`, `0` disables), `heartbeatTimeout` (default `5000`), `protocols`, `headers` (upgrade headers, Node.js only). |
| `tokenStorage` | `MemoryTokenStorage` | Where tokens are persisted (see [Token Storage](#token-storage)). |
| `logLevel` | `LogLevel.Info` | `Silent`, `Error`, `Warn`, `Info`, `Debug`. |
| `httpBaseUrl` | derived from the WS URL | HTTP base URL used for identity auth, uploads and flows. |

### connect()

```typescript
await client.connect(): Promise<void>
```

### disconnect()

```typescript
client.disconnect(): void
```

### database()

```typescript
client.database(name: string): Database
```

The `Database` carries the repository and exposes:

| Member | Returns | Reference |
|--------|---------|-----------|
| `workspace(name)` | `WorkspaceClient` with `nodes()`, `events()`, `onBranch()`, `atRevision()`, `transaction()`, uploads | [Node Operations](./node-operations.md) |
| `executeSql(sql, params?)`, `` sql`...` `` | `SqlResult` `{ columns, rows, row_count }` | [SQL](../../guides/connecting/javascript-client.md#sql-queries) |
| `onBranch(branch)`, `atRevision(revision)` | a `Database` scoped to that branch or revision | [Branches](./branches.md) |
| `branches()`, `nodeTypes()`, `archetypes()`, `elementTypes()`, `tags()`, `scheduler()` | management APIs over WebSocket | [Schema Management](./schema-management.md) |
| `conversations` | `ConversationManager` | [Chat & Conversations](./chat.md) |
| `flow` | `FlowClient` (HTTP with SSE streaming) | [Flows](./flows.md) |
| `flows()` | `FlowsApi` (WebSocket) | [Flows](./flows.md#flowsapi-websocket) |
| `functions()` | `FunctionsApi` | [Functions](./functions.md) |
| `inbox` | `InboxApi` | [Flows](./flows.md#inbox-tasks-dbinbox) |

Accessors are created lazily and cached with the correct base URL, repository and auth manager.

```typescript
const db = client.database('myapp');
const convo = await db.conversations.create({ participant: '/agents/support' });
const result = await db.flow.runAndWait('/flows/process-order', { orderId: '123' });
const { tasks } = await db.inbox.listTasks({ status: 'pending' });
```

---

## Authentication

### authenticate()

```typescript
await client.authenticate(credentials: Credentials): Promise<void>
```

`Credentials` is one of:

```typescript
{ username: string; password: string }   // admin user
{ type: 'jwt'; token: string }           // an existing JWT or API key
```

### loginWithEmail()

```typescript
await client.loginWithEmail(email: string, password: string, repository: string): Promise<IdentityUser>
```

### registerWithEmail()

```typescript
await client.registerWithEmail(email: string, password: string, repository: string, displayName?: string): Promise<IdentityUser>
```

### initSession()

Restore a session from a stored token. Returns the user, or `null` when there is no valid token.

```typescript
await client.initSession(repository: string): Promise<IdentityUser | null>
```

### refreshToken()

```typescript
await client.refreshToken(): Promise<IdentityUser | null>
```

### logout()

```typescript
await client.logout(options?: { disconnect?: boolean; reconnect?: boolean }): Promise<void>
```

---

## Session and user info

```typescript
client.isAuthenticated(): boolean
client.isReady(): boolean                       // connected and authenticated
client.getCurrentUser(): CurrentUser | null     // { userId, roles?, anonymous, node? }
client.getCurrentUserId(): string | null
client.getCurrentUserPath(): string | null
client.getSession(): { user: IdentityUser | null; accessToken: string | null } | null
client.getUser(): IdentityUser | null           // getSession()?.user
client.getStoredUser(): IdentityUser | null
client.hasStoredToken(): boolean
await client.fetchUserNode(repository): Promise<UserNode | null>
```

After `authenticate()` with admin credentials, `getCurrentUser()` returns `{ userId: 'admin', anonymous: false }`; the identity methods fill in email, roles and home.

---

## State listeners

Every listener returns an unsubscribe function.

### onAuthStateChange()

```typescript
client.onAuthStateChange((change: AuthStateChange) => void): () => void

interface AuthStateChange {
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'SESSION_EXPIRED' | 'USER_UPDATED';
  session: { user: IdentityUser | null; accessToken: string | null };
}
```

Fires for identity flows (`loginWithEmail`, `registerWithEmail`, `initSession`, `refreshToken`, `logout`); admin `authenticate()` does not emit it.

### onConnectionStateChange()

```typescript
client.onConnectionStateChange((state: ConnectionState) => void): () => void
// 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed'
```

### onReadyStateChange()

```typescript
client.onReadyStateChange((ready: boolean) => void): () => void
```

### onReconnected()

Fires after the connection, authentication and subscription restore have all succeeded.

```typescript
client.onReconnected(() => void): () => void
```

### onUserChange()

Fires when the user's home node is updated.

```typescript
client.onUserChange((event: UserChangeEvent) => void): () => void
```

The client is also an `EventEmitter`: `client.on('subscription_restore_failed', handler)` reports a subscription that could not be restored after a reconnect.

---

## Connection info

```typescript
client.isConnected(): boolean
client.getConnectionState(): ConnectionState
client.getBranch(): string
client.setBranch(branch: string): void
client.getTenantId(): string
client.httpBaseUrl: string
```

---

## Reconnection and request queueing

The client reconnects with exponential backoff and re-authenticates with the stored token. Requests issued while reconnecting are queued and flushed afterwards, so short network interruptions do not surface as errors. The queue holds 100 requests; beyond that a request rejects immediately with `Request queue is full`.

Active subscriptions are restored with retries; a permanent failure emits `subscription_restore_failed` (see [Realtime Subscriptions & Inbox](./realtime-inbox.md#reconnection)).

| Error | Thrown when |
|-------|-------------|
| `RaisinTimeoutError` | A request exceeds `requestTimeout` (carries `timeoutMs`) |
| `RaisinAuthError` | Authentication or token refresh fails (carries `code`, `status`) |
| `RaisinConnectionError` | The connection drops unrecoverably |
| `RaisinAbortError` | A request was aborted through its `AbortSignal` |

---

## HTTP client (SSR)

For server-side rendering, or wherever WebSocket is unavailable:

```typescript
const http = RaisinClient.forSSR('http://localhost:8080', options?: HttpClientOptions): RaisinHttpClient
// alias
const http = RaisinClient.createHttpClient('http://localhost:8080', options);
```

`RaisinHttpClient` shares `authenticate()`, `database()`, `executeSql()`, repository and workspace management, uploads and `signAssetUrl()` with the WebSocket client, and adds the identity-auth surface (`auth(repo)`, `setIdentityTokens()`, `clearIdentityTokens()`, see [Identity Authentication](./identity-auth.md)). Its workspace object is smaller: `getNode(id)`, `getNodeByPath(path)`, `createNode(payload)`, `updateNode(id, properties)`, `deleteNode(id)`. Real-time events and the WebSocket flow API are not available; `db.flow` (HTTP) is.

---

## Token storage

```typescript
interface TokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clear(): void;
}
```

| Class | Storage | Use case |
|-------|---------|----------|
| `MemoryTokenStorage` | In memory | Default; server-side |
| `LocalStorageTokenStorage(prefix = 'raisindb')` | `localStorage` | Browser persistence across reloads |

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
