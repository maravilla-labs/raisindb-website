---
sidebar_position: 12
---

# Identity Authentication

Sign a **person** in with a magic link, an email and password, or an OIDC provider.

This is distinct from `client.authenticate(...)`, which presents your application's own credential. Both end at the same place: a token the client attaches to every subsequent call.

The identity API is exposed on the HTTP client (`RaisinClient.forSSR`), which is the right client for a server-rendered sign-in flow. In a browser app that holds a WebSocket client, the convenience methods `client.loginWithEmail()`, `client.registerWithEmail()` and `client.initSession()` cover the password flow; see [Connection & Authentication](./connection.md#authentication).

```typescript
import { RaisinClient, readTokensFromFragment } from '@raisindb/client';

const client = RaisinClient.forSSR('https://db.example.com');
const auth = client.auth('myapp');
```

The repository is required rather than inferred from client state, because identities, home nodes and roles are per repository.

## Magic link

A good default for a consumer-facing app: nothing to choose, forget or leak.

```typescript
await auth.sendMagicLink('someone@example.com', {
  redirectUrl: 'https://app.example.com/account/callback',
});
```

RaisinDB emails a link that points at the server's own verify endpoint. Following it verifies the token and redirects the browser to `redirectUrl` with the tokens in the URL **fragment**, which browsers do not send to servers, so the tokens stay out of access logs and the `Referer` header.

`redirectUrl` must be on the tenant's redirect allowlist; the request is refused otherwise. Omit it to use the configured default.

On your callback route:

```typescript
const tokens = readTokensFromFragment(window.location.hash);
if (tokens) {
  client.setIdentityTokens(tokens.accessToken, tokens.refreshToken);
  // ...and hand them to your own session, if you keep one
}
```

`readTokensFromFragment` returns `null` when the fragment carries no tokens, so a plain visit to the callback route can render the normal page instead of a sign-in error.

:::note What the response tells you
`sendMagicLink` resolves for an address that has no account, so the endpoint does not reveal which emails are registered. Show the same "check your inbox" message either way; the returned `masked_email` (`u***@example.com`) lets the person spot a typo.
:::

## Password

```typescript
const result = await auth.login('someone@example.com', 'correct horse');
client.setIdentityTokens(result);

await auth.register('new@example.com', 'correct horse', { displayName: 'Ada' });
```

`setIdentityTokens` accepts either the whole result or a bare access token, and records the expiry when it has one so the refresh timer works.

## Which methods to offer

Magic link and password are per-repository configuration, so ask the server rather than hard-coding buttons:

```typescript
const { local_enabled, magic_link_enabled, providers } = await auth.providers();
```

`providers` lists the configured OIDC options, each with an `auth_url` to send the browser to.

## Who is signed in

```typescript
const me = await auth.me(); // { id, email, roles, anonymous, home }
```

`me` is the only call here that sends the current token. The sign-in calls go out without one, so a stale session on a shared browser cannot attach itself to a new sign-in.

## Refreshing

```typescript
const fresh = await auth.refresh(refreshToken);
client.setIdentityTokens(fresh);
```

## Server-side use

On a server, build one credential-free client and a token-bearing client per request. Do not set a request's token on a shared client, since concurrent requests would overwrite each other's token.

```typescript
// once
const anon = RaisinClient.forSSR(process.env.DB_URL!).auth('myapp');

// per request
function asUser(token: string) {
  const c = RaisinClient.forSSR(process.env.DB_URL!);
  c.setIdentityTokens(token);
  return c;
}
```

## API

All methods call the repository-scoped `/auth/{repo}/...` HTTP endpoints described in the [Authentication API](../http-api/authentication.md#identity-users).

| Method | Purpose |
|---|---|
| `sendMagicLink(email, { redirectUrl? })` | Email a sign-in link. Returns `{ message, masked_email, expires_in_minutes }`, never a token. |
| `verifyMagicLink(token)` | Exchange a token for a session. Single-use; usually unnecessary, since the emailed link is followed to RaisinDB directly. |
| `login(email, password, { rememberMe? })` | Password sign-in. |
| `register(email, password, { displayName? })` | Create an account. |
| `refresh(refreshToken)` | Trade a refresh token for a fresh pair. |
| `providers()` | Which sign-in methods this repository offers. |
| `me()` | The current token's identity, roles and home. |

`login`, `register`, `verifyMagicLink` and `refresh` return an `IdentityAuthResult`: `{ access_token, refresh_token, token_type, expires_at, identity: { id, email, display_name, avatar_url, email_verified, linked_providers, home } }`.

| Helper | Purpose |
|---|---|
| `readTokensFromFragment(hashOrUrl)` | `{ accessToken, refreshToken }` left by a verify redirect, or `null`. |
| `client.setIdentityTokens(resultOrToken, refreshToken?)` | Adopt an identity for subsequent calls. |
| `client.clearIdentityTokens()` | Sign out locally. |

## See also

- [Authentication setup](../../guides/auth/authentication-setup.md): enabling magic link and configuring the redirect allowlist
- [Outbound email](../../guides/auth/outbound-email.md): the provider a magic link is sent through
