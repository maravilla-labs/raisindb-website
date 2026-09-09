---
sidebar_position: 1
title: Authentication Setup
description: Register and log in identity users with email and password or magic links, work with the token pair, and configure tenant-level authentication settings
---

# Authentication Setup

RaisinDB has two kinds of accounts:

- **Admin accounts** are operator logins managed under
  `/api/raisindb/sys/{tenant}/...`. They are used by the CLI, the admin console
  and setup scripts. The dev-mode server ships with `admin`.
- **Identity users** are the end users of your application. An identity is
  tenant-wide (one email, one password), and it maps to a `raisin:User` node in
  each repository the person logs in to. Everything below is about identity
  users.

An identity user authenticates with an email and password, with a magic
link, or through an external OpenID Connect provider such as Google, Keycloak,
Okta or Azure AD. All three produce the same token pair.

## Admin login

```bash
curl -X POST localhost:8090/api/raisindb/sys/default/auth \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"AdminPassword123!"}'
```

```json
{"token":"eyJ...","user_id":"...","username":"admin","must_change_password":false,"expires_at":...,"access_flags":{...}}
```

Use `token` as a bearer token. Admin tokens can act on any repository and can
impersonate a user for debugging by sending the `X-Raisin-Impersonate` header.

## Register and log in

Use the repository-scoped routes. The `{repo}` segment makes the server
create (or find) the caller's `raisin:User` node in that repository's
`raisin:access_control` workspace and puts its path into the token.

```bash
# Register
curl -X POST localhost:8090/auth/myrepo/register \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"CorrectHorse42Battery","display_name":"Jane"}'

# Log in
curl -X POST localhost:8090/auth/myrepo/login \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"CorrectHorse42Battery"}'
```

Both return the token pair:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_at": 1788810564,
  "identity": {
    "id": "a0d30626-a234-4e61-9204-087e144d19fb",
    "email": "jane@example.com",
    "display_name": "Jane",
    "avatar_url": null,
    "email_verified": false,
    "linked_providers": [],
    "home": "/users/internal/jane-at-example-com"
  }
}
```

The login body also accepts `"remember_me": true`, which extends the
server-side session from 24 hours to 30 days. A wrong password returns `401`
with code `INVALID_CREDENTIALS`. After too many failures the account is
locked and login returns `429` with code `ACCOUNT_LOCKED`; the threshold and
lockout duration come from the tenant configuration (five failures, fifteen
minutes when none is stored). A password that does not meet the tenant's
password policy is rejected with `400` and code `WEAK_PASSWORD`, listing the
unmet rules; without a stored policy the only rule is a minimum of 8
characters.

The unscoped routes `/auth/register` and `/auth/login` also exist. They issue
a token without a `home` claim, and a `raisin:User` node is not provisioned.
Such a token still works against a repository where the user already has a
node.

### The provisioned user node

On first login the node is created at `/users/internal/{email-slug}` with the
identity id in `user_id`, the email, a display name and the roles `viewer` and
`authenticated_user`. Later logins reuse the node and never remove roles, so
role changes you make with SQL survive. See
[Roles and Permissions](./roles-and-permissions.md) for how to change them.

### Who am I

```bash
curl localhost:8090/auth/myrepo/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{"id":"a0d3...","email":"jane@example.com","roles":["viewer","authenticated_user"],
 "anonymous":false,"home":"/users/internal/jane-at-example-com","user_node":{...}}
```

`GET /auth/me` returns the same without the node.

## Tokens

| Token | Lifetime | Purpose |
|-------|----------|---------|
| Access token | 1 hour by default | Sent as `Authorization: Bearer ...` on every request |
| Refresh token | 30 days by default | Exchanged for a new pair with `POST /auth/refresh` |

Both lifetimes can be changed per tenant through `session_settings` in the
tenant configuration below. `expires_at` in every token response is the
access token's expiry as a Unix timestamp in seconds.

Access-token claims:

| Claim | Meaning |
|-------|---------|
| `sub` | Identity id |
| `email` | Email address |
| `tenant_id` | Tenant |
| `repository` | The repository the token was issued for (repo-scoped routes only) |
| `home` | Path of the user node in that repository |
| `sid` | Session id |
| `auth_strategy` | `local`, `magic_link`, or `oidc:{provider}` |
| `auth_time` | When the user last entered credentials |
| `global_flags` | `is_tenant_admin`, `email_verified`, `must_change_password` |
| `token_type` | `{"type":"access"}` |
| `exp`, `iat`, `nbf`, `jti`, `iss` | Standard JWT claims; `iss` is `raisindb` |

Roles and permissions are not in the token. They are resolved from the user
node on each request and cached for five minutes, so a token stays small and
a role change does not require a new login.

### Refreshing

```bash
curl -X POST localhost:8090/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refresh_token":"eyJ..."}'
```

The response has the same shape as login. Each refresh rotates the refresh
token: the old one is invalidated and the new one carries the next
`generation`. Presenting an already-used refresh token revokes the whole
session (`401`, code `TOKEN_REUSE_DETECTED`), so a stolen token cannot be
replayed.

### Expired tokens on read endpoints

Endpoints that allow anonymous access, including `POST /api/sql/{repo}`,
treat an expired or otherwise unusable token as an anonymous caller. A query
then returns whatever the anonymous role may see, usually zero rows with a
`200`, rather than a `401`. Refresh before the access token expires.

## Changing a password

```bash
curl -X POST localhost:8090/auth/change-password \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"old_password":"...","new_password":"..."}'
```

Returns `204`.

## Magic links

Passwordless sign-in sends a one-time link by email. It needs outbound email
configured with a `base_url` and a default provider; see
[Outbound Email](./outbound-email.md). Until then the request returns `503`
with code `EMAIL_NOT_CONFIGURED`.

```bash
# 1. Request a link (always answers the same way, so it does not reveal whether the address exists)
curl -X POST localhost:8090/auth/myrepo/magic-link \
  -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","redirect_url":"https://app.example.com/after-login"}'
# {"message":"If that address has an account, a sign-in link is on its way.","masked_email":"...","expires_in_minutes":15}

# 2. The link in the email points at
GET /auth/myrepo/magic-link/verify?token=<one-time-token>
# which redirects to redirect_url (default: base_url) with the token pair in the URL fragment.
```

`redirect_url` must sit under the configured `base_url` or match an entry of
the email config's `redirect_allowlist`. Requests are limited to 5 per
address per 15 minutes and 20 per IP per hour. The link is rendered and sent
by the built-in `send-magic-link` function.

## OpenID Connect sign-in

RaisinDB can hand the login to an external identity provider. Any provider
that publishes a discovery document works: Google, Keycloak, Okta, Azure AD,
Auth0 and self-hosted servers such as Authentik or Dex. The flow is the
standard authorization code flow with PKCE, and the result is the same token
pair as a password login, with the user's `raisin:User` node provisioned in
the repository you name.

### Configure a provider

Providers are part of the tenant configuration. A tenant admin sends the list
with `PUT /api/tenants/{tenant}/auth/config`:

```bash
curl -X PUT localhost:8090/api/tenants/default/auth/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{
    "oidc_providers": [{
      "provider_id": "google",
      "display_name": "Sign in with Google",
      "issuer_url": "https://accounts.google.com",
      "client_id": "1234567890-abc.apps.googleusercontent.com",
      "client_secret": "GOCSPX-...",
      "redirect_uri": "https://api.example.com/auth/oidc/google/callback",
      "scopes": ["openid", "email", "profile"],
      "allowed_email_domains": ["example.com"]
    }]
  }'
```

| Field | Meaning |
|-------|---------|
| `provider_id` | Slug used in the login URL, `/auth/oidc/{provider_id}`. Lower-case letters, digits, `-` and `_`. |
| `display_name`, `icon`, `priority` | What a login page shows, and in which order. |
| `enabled` | A disabled provider stays configured but refuses logins with `403`. Defaults to `true`. |
| `issuer_url` | The provider's issuer. The server fetches `{issuer_url}/.well-known/openid-configuration` and caches it for an hour. |
| `client_id`, `client_secret` | The OAuth client registered at the provider. The secret is encrypted with the server's master key before it is stored and is never returned; reads report `has_client_secret` instead. Leaving `client_secret` out of a later `PUT` keeps the stored one. |
| `redirect_uri` | The callback URL registered with the provider, exactly. It is `{your server}/auth/oidc/{provider_id}/callback`. |
| `scopes` | Defaults to `openid email profile`. |
| `allowed_email_domains` | When set, a login whose verified email is outside these domains is refused. |
| `attribute_mapping` | Claim names for `email`, `name`, `picture` and `email_verified`, for providers that use non-standard ones. |
| `groups_claim` | A claim whose array value is recorded on the identity as provider groups. |
| `authorization_url`, `token_url`, `userinfo_url`, `jwks_url` | Manual endpoints for a provider without a discovery document. With `issuer_url` set they are not needed. |

The list is a full replacement: a provider missing from the list is removed.
Local and magic-link settings in the same document are untouched.

A **Keycloak** realm looks like this. The issuer is the realm URL and the
client must be confidential with "Standard flow" enabled, or public with PKCE
required, in which case `client_secret` is simply omitted:

```json
{
  "oidc_providers": [{
    "provider_id": "keycloak",
    "display_name": "Company SSO",
    "issuer_url": "https://sso.example.com/realms/staff",
    "client_id": "raisindb",
    "client_secret": "…",
    "redirect_uri": "https://api.example.com/auth/oidc/keycloak/callback",
    "groups_claim": "groups"
  }]
}
```

For **Google**, create an OAuth client of type "Web application" in the Google
Cloud console and add the callback URL to its authorised redirect URIs. Google's
`sub` is stable per user and per client, and `email_verified` is sent for
Google-hosted mailboxes.

For **Azure AD** use the tenant-specific issuer,
`https://login.microsoftonline.com/{tenant-id}/v2.0`, and for **Okta** the
authorization server URL, `https://{org}.okta.com/oauth2/default`.

### What a login page shows

`GET /auth/{repo}/providers` (or `/auth/providers` without a repository)
returns what to render, and never a secret:

```json
{
  "providers": [
    {"id": "google", "display_name": "Sign in with Google", "icon": "log-in",
     "auth_url": "/auth/oidc/google?repo=myrepo"}
  ],
  "local_enabled": true,
  "magic_link_enabled": true
}
```

`local_enabled` and `magic_link_enabled` reflect the tenant configuration and
default to `true` for a tenant that has never stored one.

### The redirect flow

1. The browser opens
   `GET /auth/oidc/{provider}?repo={repo}&redirect_uri={where the app wants to land}`.
   The server generates a PKCE verifier and a nonce, seals them together with
   the tenant, provider, repository and landing URL into the `state` parameter
   (encrypted under the master key, valid for ten minutes), and answers `302`
   to the provider's authorization endpoint. Nothing is stored server-side, so
   the callback may land on any node of a cluster.
2. The user authenticates at the provider, which redirects the browser to
   `redirect_uri` with `code` and `state`.
3. `GET /auth/oidc/{provider}/callback?code=…&state=…` opens the state, redeems
   the code at the token endpoint with the PKCE verifier and the client secret,
   and verifies the `id_token`: RS256 signature against the provider's JWKS
   (cached, refetched once on an unknown key id), `iss`, `aud`, `azp`, `exp`
   and the `nonce`. The userinfo endpoint is consulted only to fill in claims
   the token did not carry; it can never override a signed claim.
4. The claims are mapped to an identity, a session is created, the user node
   is provisioned in `{repo}`, and the browser is redirected to the landing
   URL with the tokens in the **fragment**:
   `{redirect_uri}#access_token=…&refresh_token=…&expires_at=…`. A fragment is
   never sent to a server, so the tokens stay out of logs and `Referer`
   headers. Without a `redirect_uri` the callback returns the token pair as
   JSON instead.

`redirect_uri` on step 1 is allow-listed: it must be a path on the server or
an origin listed in the tenant's `cors_allowed_origins`, otherwise the request
is refused with `400`.

### Accounts and linking

Identities are keyed by email, so the provider must assert one. The rules:

- A verified email with no existing account creates one, with no password and
  the provider linked. Such an account cannot use the password login until a
  password is set.
- A verified email that matches an existing account links the provider to it,
  whichever way the account was first created. Existing display name and
  avatar are kept; blanks are filled from the provider.
- A returning user is matched on the provider's `sub`. The same email arriving
  with a different `sub` at the same provider is refused.
- An unverified email is refused outright, whether or not an account exists.
  This is what stops someone registering a mailbox they do not own at a lax
  provider and inheriting the real owner's account later.

Automatic linking by verified email is a deliberate choice; see the note at
the end of this page if your deployment needs explicit linking instead.

:::caution Not yet exercised end to end

The OpenID Connect implementation described above compiles and its protocol
layer is covered by unit tests, but the full browser round trip has not been
run against a live server and a real provider at the time of writing. Treat
this section as a description of intended behaviour, and verify the flow in a
staging environment before relying on it.

:::

## Logout and sessions

A session is the record behind a refresh token. Listing and revoking sessions
works on that record; all three routes take the identity access token:

```bash
# Sessions of the calling identity, newest first; is_current marks this one
curl localhost:8090/auth/sessions -H "Authorization: Bearer $ACCESS"

# Revoke another session (404 for a session that is not yours)
curl -X DELETE localhost:8090/auth/sessions/{session_id} -H "Authorization: Bearer $ACCESS"

# Log out: revoke the current session (204)
curl -X POST localhost:8090/auth/logout -H "Authorization: Bearer $ACCESS"
```

```json
{"sessions": [{"id": "…", "auth_strategy": "oidc:google", "user_agent": null,
  "ip_address": null, "created_at": "2026-09-08T12:34:56Z",
  "last_active_at": "2026-09-08T12:34:56Z", "is_current": true}]}
```

Revoking a session stops its refresh token from working; the next
`POST /auth/refresh` answers `401` with `SESSION_REVOKED`. The access token
already issued is verified statelessly and stays valid until its own expiry,
which is why the default access lifetime is one hour. A client that logs out
should discard both tokens.

## Tenant configuration

Tenant-level settings are read and written by a tenant admin at
`GET` and `PUT /api/tenants/{tenant}/auth/config`:

```json
{
  "tenant_id": "default",
  "local_auth": {"enabled": true},
  "magic_link": {"enabled": true, "token_ttl_minutes": 15},
  "password_policy": {"min_length": 12, "require_uppercase": true, "require_lowercase": true,
                      "require_numbers": true, "require_special": false, "max_age_days": null},
  "session_settings": {"duration_hours": 1, "refresh_token_duration_days": 30,
                       "max_sessions_per_user": 10, "single_session_mode": false},
  "access_settings": {"allow_access_requests": true, "allow_invitations": true,
                      "require_approval": true, "default_roles": ["viewer"]},
  "oidc_providers": [],
  "anonymous_enabled": false,
  "cors_allowed_origins": []
}
```

`PUT` takes the same document; every top-level key is optional, but a nested
object must be complete. `oidc_providers` is described under
[OpenID Connect sign-in](#openid-connect-sign-in). Once a configuration is stored, registration and
password changes enforce `password_policy`, login lockout uses the tenant's
lockout threshold and duration, and access and refresh tokens use the
`session_settings` lifetimes (`duration_hours` and
`refresh_token_duration_days`). A tenant with no stored configuration keeps
the defaults: an 8-character minimum, lockout after five failures for fifteen
minutes, one-hour access tokens and thirty-day refresh tokens.

Anonymous access can also be switched per repository through a
`raisin:RepoAuthConfig` node at `/config/repos/{repo}` in the `raisin:system`
workspace, which takes precedence over the tenant setting.

The JWT signing key comes from the `JWT_SECRET` environment variable of the
server.

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/{repo}/register` | Register and provision the user node |
| `POST` | `/auth/{repo}/login` | Log in, provision the user node if missing |
| `POST` | `/auth/{repo}/magic-link` | Request a magic link |
| `GET` | `/auth/{repo}/magic-link/verify` | Complete magic-link sign-in |
| `GET` | `/auth/{repo}/me` | Identity, roles, home and user node |
| `POST` | `/auth/register`, `/auth/login`, `/auth/magic-link` | Same without repository scope |
| `GET` | `/auth/me` | Identity and roles |
| `POST` | `/auth/refresh` | Rotate the token pair |
| `POST` | `/auth/change-password` | Change the password (`204`) |
| `GET` | `/auth/providers`, `/auth/{repo}/providers` | Sign-in methods, including configured OIDC providers |
| `GET` | `/auth/oidc/{provider}` | Start an OIDC login (`?repo=`, `?redirect_uri=`) |
| `GET` | `/auth/oidc/{provider}/callback` | Provider callback; redirects with tokens in the fragment, or returns JSON |
| `POST` | `/auth/logout` | Revoke the current session (`204`) |
| `GET` | `/auth/sessions` | List the caller's sessions |
| `DELETE` | `/auth/sessions/{id}` | Revoke one session (`204`) |
| `GET`, `PUT` | `/api/tenants/{tenant}/auth/config` | Tenant settings (tenant admin) |
| `POST` | `/api/raisindb/sys/{tenant}/auth` | Admin account login |

## Next steps

- [Roles and Permissions](./roles-and-permissions.md)
- [Row-Level Security](./row-level-security.md)
- [Outbound Email](./outbound-email.md) for magic links
