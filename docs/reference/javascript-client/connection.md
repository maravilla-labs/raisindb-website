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
| `url` | `string` | WebSocket URL (e.g. `ws://localhost:8080`) |
| `options` | `ClientOptions` | Optional configuration |

```typescript
interface ClientOptions {
  tenantId?: string;
  defaultBranch?: string;
  requestTimeout?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  tokenStorage?: TokenStorage;
  mode?: 'websocket' | 'http' | 'hybrid';
  httpBaseUrl?: string;
}
```

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

The returned `Database` comes pre-configured with access to the [Chat](./chat.md) and [Flow](./flows.md) APIs:

```typescript
const db = client.database('myapp');

// Chat — conversational AI
const convo = await db.chat.createConversation({ agent: '/agents/support' });

// Flow — workflow execution
const result = await db.flow.runAndWait('/flows/process-order', { orderId: '123' });
```

#### db.chat

Returns a pre-configured [`ChatClient`](./chat.md) scoped to this repository. The client is lazily created and cached.

```typescript
get chat: ChatClient
```

#### db.flow

Returns a pre-configured [`FlowClient`](./flows.md) scoped to this repository. The client is lazily created and cached.

```typescript
get flow: FlowClient
```

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
