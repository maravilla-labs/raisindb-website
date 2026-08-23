---
sidebar_position: 12
---

# Identity Authentication

Sign a **person** in — magic link, email and password, or an OIDC provider.

This is distinct from `client.authenticate(...)`, which is how your
*application* presents its own credential. Both end at the same place: a token
the client attaches to every subsequent call.

```typescript
import { RaisinClient, readTokensFromFragment } from '@raisindb/client';

const client = RaisinClient.forSSR('https://db.example.com');
const auth = client.auth('myapp');
```

The repository is required, not inferred from client state. Identities, their
home nodes and their roles are per repository, so a guessed one signs somebody
into the wrong data.

## Magic link

The default for a consumer-facing app: no password to choose, forget, or leak.

```typescript
await auth.sendMagicLink('someone@example.com', {
  redirectUrl: 'https://app.example.com/account/callback',
});
```

RaisinDB emails a link to **itself**, not to your app. Following it verifies
the token and redirects the browser to `redirectUrl` with the tokens in the URL
**fragment**, which never reaches a server — so they stay out of access logs
and out of the `Referer` header.

`redirectUrl` is checked against the tenant's redirect allowlist and refused if
it is not on it. That check is the reason an attacker cannot aim somebody
else's one-time token at their own host. Omit it to use the configured default.

On your callback route:

```typescript
const tokens = readTokensFromFragment(window.location.hash);
if (tokens) {
  client.setIdentityTokens(tokens.accessToken, tokens.refreshToken);
  // …and hand them to your own session, if you keep one
}
```

`readTokensFromFragment` returns `null` when the fragment carries no tokens, so
a plain visit to the callback route is distinguishable from an arrival from a
link — render your normal page rather than a sign-in failure.

:::note What the response tells you, and what it does not
`sendMagicLink` resolves for an address that has no account. A response that
differed would let anyone test whether an email is registered. Show the same
"check your inbox" either way; the returned `masked_email` (`u***@example.com`)
is there so somebody can spot a typo without the endpoint leaking addresses.
:::

## Password

```typescript
const result = await auth.login('someone@example.com', 'correct horse');
client.setIdentityTokens(result);

await auth.register('new@example.com', 'correct horse', { displayName: 'Ada' });
```

`setIdentityTokens` takes either the whole result or a bare access token, and
records the expiry when it has one so the refresh timer works.

## Which methods to offer

Ask, rather than hard-coding buttons — magic link and password are
per-repository configuration, and a button for a disabled method is a dead end.

```typescript
const { local_enabled, magic_link_enabled, providers } = await auth.providers();
```

`providers` lists the configured OIDC options, each with the `auth_url` to send
the browser to.

## Who is signed in

```typescript
const me = await auth.me(); // { id, email, roles, anonymous, home }
```

`me` is the one call here that carries the token — it is the one asking about
the caller. Every other call goes out unauthenticated on purpose: a sign-in
that carried the previous identity's token is how one person's session gets
attached to another's sign-in attempt on a shared browser.

## Refreshing

```typescript
const fresh = await auth.refresh(refreshToken);
client.setIdentityTokens(fresh);
```

## Server-side use

On a server, build the credential-free client once and a token-bearing one per
request. Never mutate a shared client with a request's token — two requests in
flight will race over whose token is current.

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

| Method | Purpose |
|---|---|
| `sendMagicLink(email, { redirectUrl })` | Email a sign-in link. Returns an acknowledgement, never a token. |
| `verifyMagicLink(token)` | Exchange a token for a session. Single-use; usually unnecessary, since the emailed link is followed to RaisinDB directly. |
| `login(email, password, { rememberMe })` | Password sign-in. |
| `register(email, password, { displayName })` | Create an account. |
| `refresh(refreshToken)` | Trade a refresh token for a fresh pair. |
| `providers()` | Which sign-in methods this repository offers. |
| `me()` | The current token's identity, roles and home. |

| Helper | Purpose |
|---|---|
| `readTokensFromFragment(hashOrUrl)` | Tokens left by a verify redirect, or `null`. |
| `client.setIdentityTokens(resultOrToken, refreshToken?)` | Adopt an identity for subsequent calls. |
| `client.clearIdentityTokens()` | Sign out locally. |

## See also

- [Authentication setup](../../guides/auth/authentication-setup.md) — enabling magic link and configuring the redirect allowlist
- [Outbound email](../../guides/auth/outbound-email.md) — the provider a magic link is sent through
