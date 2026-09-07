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

An identity user authenticates with an email and password or with a magic
link. Both produce the same token pair.

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
  "expires_at": 1788806964200,
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
with code `INVALID_CREDENTIALS`; after five failures the account is locked
for fifteen minutes and login returns `429` with code `ACCOUNT_LOCKED`.
Passwords must be at least 8 characters.

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
| Access token | 1 hour | Sent as `Authorization: Bearer ...` on every request |
| Refresh token | 30 days | Exchanged for a new pair with `POST /auth/refresh` |

Access-token claims:

| Claim | Meaning |
|-------|---------|
| `sub` | Identity id |
| `email` | Email address |
| `tenant_id` | Tenant |
| `repository` | The repository the token was issued for (repo-scoped routes only) |
| `home` | Path of the user node in that repository |
| `sid` | Session id |
| `auth_strategy` | `local` or `magic_link` |
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

Note that `expires_at` is in milliseconds on login and register but in
seconds on refresh. Read `exp` from the access token itself if you need a
reliable expiry.

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
  "anonymous_enabled": false,
  "cors_allowed_origins": []
}
```

`PUT` takes the same document; every top-level key is optional, but a nested
object must be complete. In this release the login path applies fixed
values for password strength, lockout and token lifetimes, so
`password_policy` and `session_settings` are stored but not yet enforced.
`anonymous_enabled` and `cors_allowed_origins` are used.

Anonymous access can also be switched per repository through a
`raisin:RepoAuthConfig` node at `/config/repos/{repo}` in the `raisin:system`
workspace, which takes precedence over the tenant setting.

The JWT signing key comes from the `JWT_SECRET` environment variable of the
server.

## Not available in this release

The following routes exist but answer `501 Not Implemented`: `POST
/auth/logout`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, and the
OIDC routes `GET /auth/oidc/{provider}` and its callback. `GET
/auth/providers` always reports local and magic-link sign-in and no external
providers. Sessions end when the refresh token expires or is revoked by reuse
detection.

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
| `GET` | `/auth/providers` | Sign-in methods |
| `GET`, `PUT` | `/api/tenants/{tenant}/auth/config` | Tenant settings (tenant admin) |
| `POST` | `/api/raisindb/sys/{tenant}/auth` | Admin account login |

## Next steps

- [Roles and Permissions](./roles-and-permissions.md)
- [Row-Level Security](./row-level-security.md)
- [Outbound Email](./outbound-email.md) for magic links
