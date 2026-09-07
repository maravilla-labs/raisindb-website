---
sidebar_position: 2
---

# Authentication API

RaisinDB has two kinds of principals:

- **Admin users** belong to a tenant, log in with a username, and operate the console, CLI, API and pgwire. Their routes are under `/api/raisindb/...`.
- **Identity users** are the end users of your application. They belong to a repository, log in with an email (password, magic link or OIDC), and are subject to roles and row-level security. Their routes are under `/auth/...`.

Both end up with a JWT sent as `Authorization: Bearer <token>`.

## Admin login

```
POST /api/raisindb/sys/{tenant_id}/auth
```

Request:

```json
{"username": "admin", "password": "your-password"}
```

Optional `"interface": "console" | "cli" | "api"` (default `console`); the user's access flags must allow that interface.

Response:

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user_id": "b86457ac-7c3c-4c5b-80f3-2ab2ab724bd3",
  "username": "admin",
  "must_change_password": true,
  "expires_at": 1788805990,
  "access_flags": {
    "console_login": true, "cli_access": true, "api_access": true,
    "pgwire_access": false, "can_impersonate": false
  }
}
```

There is no refresh endpoint for admin tokens; log in again when `expires_at` passes.

## Change admin password

```
POST /api/raisindb/sys/{tenant_id}/auth/change-password
Authorization: Bearer <admin token>
```

```json
{"old_password": "current-password", "new_password": "new-password"}
```

## Profile and API keys

```
GET /api/raisindb/me
```

Returns `user_id`, `username`, `email`, `tenant_id`, `access_flags`, `must_change_password`.

### Create an API key

```
POST /api/raisindb/me/api-keys
```

```json
{"name": "production-key"}
```

Response (the `token` is returned only here):

```json
{
  "key": {
    "key_id": "047b191d-f5ec-4d79-aac0-5afa5c352b32",
    "name": "production-key",
    "key_prefix": "raisin_DV2vMEwAg",
    "created_at": "2026-09-06T18:34:28.665187+00:00",
    "last_used_at": null,
    "is_active": true
  },
  "token": "raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e"
}
```

Use the token as a bearer token on content, query, SQL and repository routes, and as the password for pgwire. Keys do not expire; revoke them when no longer needed.

### List and revoke

```
GET    /api/raisindb/me/api-keys          → [ { key_id, name, key_prefix, created_at, last_used_at, is_active } ]
DELETE /api/raisindb/me/api-keys/{key_id}
```

### Admin user management

Tenant admins manage admin users at `/api/raisindb/sys/{tenant_id}/admin-users` (`GET`, `POST` with `{username, email?, password, access_flags}`) and `/admin-users/{username}` (`GET`, `PUT` with any of `email`, `access_flags`, `must_change_password`, `is_active`, `DELETE`). Set `"pgwire_access": true` to let a user connect over the PostgreSQL protocol.

## Identity users

Routes exist in a repository-scoped form (`/auth/{repo}/...`) and a tenant-level form (`/auth/...`). Use the repository-scoped form for application users: identities, home nodes and roles are per repository.

### Which methods are enabled

```
GET /auth/{repo}/providers
```

```json
{"providers": [], "local_enabled": true, "magic_link_enabled": true}
```

Each configured OIDC provider appears in `providers` as `{id, display_name, icon, auth_url}`.

### Register

```
POST /auth/{repo}/register
```

```json
{"email": "alice@example.com", "password": "CorrectHorse1!", "display_name": "Alice"}
```

### Log in

```
POST /auth/{repo}/login
```

```json
{"email": "alice@example.com", "password": "CorrectHorse1!", "remember_me": false}
```

Register and login both respond with:

```json
{
  "access_token": "eyJ0eXAi...",
  "refresh_token": "eyJ0eXAi...",
  "token_type": "Bearer",
  "expires_at": 1788828502315,
  "identity": {
    "id": "e69cc955-a0a3-465e-b4d5-6d7899ef7d58",
    "email": "alice@example.com",
    "display_name": "Alice",
    "avatar_url": null,
    "email_verified": false,
    "linked_providers": [],
    "home": "/users/internal/alice-at-example-com"
  }
}
```

A wrong password returns `401` with `{"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}`.

### Refresh

```
POST /auth/{repo}/refresh
```

```json
{"refresh_token": "eyJ0eXAi..."}
```

Returns a new token pair in the same shape as login.

### Who am I

```
GET /auth/{repo}/me
Authorization: Bearer <identity access token>
```

```json
{
  "id": "e69cc955-...",
  "email": "alice@example.com",
  "roles": ["viewer", "authenticated_user"],
  "anonymous": false,
  "home": "/users/internal/alice-at-example-com",
  "user_node": { "path": "/users/internal/alice-at-example-com", "node_type": "raisin:User", "workspace": "raisin:access_control", "..." : "..." }
}
```

`home` is the user's node path inside the `raisin:access_control` workspace; the user's inbox lives beneath it.

### Magic link

```
POST /auth/{repo}/magic-link            {"email": "...", "redirect_url": "https://app.example.com/callback"}
GET  /auth/{repo}/magic-link/verify?token=...
```

The request returns `{message, masked_email, expires_in_minutes}` whether or not the address is registered. The emailed link points at the verify endpoint, which redirects the browser to `redirect_url` with the tokens in the URL fragment. `redirect_url` must be on the tenant's allowlist; see [Authentication setup](../../guides/auth/authentication-setup.md).

### OIDC

```
GET /auth/oidc/{provider}            → redirects to the provider
GET /auth/oidc/{provider}/callback   → handles the provider's response
```

### Sessions, password, logout

```
POST /auth/{repo}/change-password
GET  /auth/sessions
POST /auth/logout
```

## Tenant auth configuration

`GET` / `PUT /api/tenants/{tenant_id}/auth/config` reads and updates the tenant's auth settings (enabled methods, OIDC providers, redirect allowlist). The admin console's Auth Settings page uses this endpoint.
