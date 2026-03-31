---
sidebar_position: 2
---

# Authentication API

Authenticate and manage access tokens.

## Login

```bash
POST /api/raisindb/sys/{tenant_id}/auth
```

Request:

```json
{
  "username": "admin",
  "password": "your-password"
}
```

Response:

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Refresh Token

```bash
POST /auth/refresh
```

Request:

```json
{
  "refresh_token": "eyJhbGc..."
}
```

## Change Password

```bash
POST /api/raisindb/sys/{tenant_id}/auth/change-password
```

Request:

```json
{
  "old_password": "current-password",
  "new_password": "new-password"
}
```

## API Keys

### Create API Key

```bash
POST /api/raisindb/me/api-keys
```

Request:

```json
{
  "name": "production-key",
  "expires_at": "2025-12-31T23:59:59Z"
}
```

### List API Keys

```bash
GET /api/raisindb/me/api-keys
```

### Revoke API Key

```bash
DELETE /api/raisindb/me/api-keys/{key_id}
```

## OIDC Authentication

### Authorize

```bash
GET /auth/oidc/{provider}
```

Redirects to OAuth provider.

### Callback

```bash
GET /auth/oidc/{provider}/callback
```

Handles OAuth callback.
