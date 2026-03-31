---
sidebar_position: 1
title: Authentication Setup
description: Configure pluggable authentication strategies including local passwords, magic links, OIDC, API keys, and one-time tokens
---

# Authentication Setup

RaisinDB provides a pluggable authentication system where each tenant can mix and match authentication strategies — local passwords, magic links, OIDC providers, API keys — while sharing a unified session and token infrastructure.

## Architecture Overview

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Local     │  │   OIDC      │  │  Magic Link │  ...
│  Strategy   │  │  Strategy   │  │  Strategy   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       └────────────────┼────────────────┘
                        ▼
            ┌───────────────────────┐
            │  AuthStrategyRegistry │
            └───────────┬───────────┘
                        ▼
            ┌───────────────────────┐
            │      AuthService      │
            │  (JWT + Sessions)     │
            └───────────────────────┘
```

Every authentication attempt follows the same flow:

1. The transport layer receives credentials and wraps them in an `AuthCredentials` variant
2. The `AuthStrategyRegistry` routes the credentials to the matching strategy
3. The strategy validates the credentials and returns a verified `Identity`
4. `AuthService` creates or updates a `Session`, then issues JWT access and refresh tokens

Adding a new authentication method requires only a new strategy implementation — the session, token, and middleware infrastructure stays untouched.

## Available Strategies

| Strategy | Use Case | Credential Type |
|----------|----------|-----------------|
| **Local** | Traditional email + password login | `UsernamePassword` |
| **Magic Link** | Passwordless email authentication | `MagicLinkToken` |
| **OIDC** | Google, Okta, Keycloak, Azure AD | `OAuth2Code` |
| **API Key** | Machine-to-machine access | `ApiKey` |
| **One-Time Token** | Email verification, password reset, invitations | `OneTimeToken` |

## Local Strategy (Username + Password)

The local strategy authenticates users with email and password, using bcrypt for password hashing.

### Setup

Local authentication is available by default. Users register via the REST API:

```bash
POST /auth/register
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "SecureP@ssw0rd!",
  "display_name": "Alice"
}
```

### Login

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "SecureP@ssw0rd!"
}
```

**Response:**

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Password Policy

Configure password requirements per tenant:

```yaml
password_policy:
  min_length: 8
  max_length: 128
  require_uppercase: true
  require_lowercase: true
  require_digit: true
  require_special: true
```

## Magic Link Strategy

Passwordless authentication via email. The user requests a magic link, receives it by email, and clicking the link completes authentication without setting a password.

### Setup

Enable magic links in your tenant configuration:

```yaml
magic_link:
  enabled: true
  expiration_minutes: 15
```

### Flow

```bash
# 1. Request a magic link
POST /auth/magic-link
{ "email": "alice@example.com" }

# 2. User receives email with link containing a one-time token
# 3. User clicks link, which hits the verify endpoint
GET /auth/magic-link/verify?token=<one-time-token>

# 4. Response includes access + refresh tokens
```

## OIDC Strategy (Google, Okta, Azure AD, Keycloak)

OpenID Connect integration supports enterprise identity providers.

### Supported Providers

- **Google** — Google Workspace and consumer accounts
- **Okta** — Enterprise identity provider
- **Keycloak** — Open-source identity management
- **Azure AD** — Microsoft identity platform

### Configuration

Configure OIDC providers in your tenant settings:

```yaml
oidc:
  providers:
    google:
      client_id: "your-google-client-id"
      client_secret: "your-google-client-secret"
      redirect_uri: "https://yourapp.com/auth/oidc/google/callback"

    okta:
      client_id: "your-okta-client-id"
      client_secret: "your-okta-client-secret"
      issuer: "https://your-org.okta.com"
      redirect_uri: "https://yourapp.com/auth/oidc/okta/callback"

    azure:
      client_id: "your-azure-client-id"
      client_secret: "your-azure-client-secret"
      tenant_id: "your-azure-tenant-id"
      redirect_uri: "https://yourapp.com/auth/oidc/azure/callback"

    keycloak:
      client_id: "your-keycloak-client-id"
      client_secret: "your-keycloak-client-secret"
      issuer: "https://keycloak.yourorg.com/realms/yourrealm"
      redirect_uri: "https://yourapp.com/auth/oidc/keycloak/callback"
```

### Flow

```bash
# 1. Start the OIDC flow (redirects user to provider)
GET /auth/oidc/google

# 2. User authenticates with Google
# 3. Google redirects back to your callback URL
GET /auth/oidc/google/callback?code=<auth-code>&state=<state>

# 4. RaisinDB exchanges the code for tokens, resolves identity
# 5. Response includes access + refresh tokens
```

On successful callback, RaisinDB resolves the provider's user ID to a local `Identity`. If no matching identity exists, a new one is created and linked to the provider.

### Identity Linking

A single identity can be linked to multiple providers. For example, a user might authenticate with both Google OIDC and a local password — both resolve to the same identity.

Each link is tracked by provider and external ID using a namespaced format (`oidc:google`, `oidc:okta`) so multiple OIDC providers coexist without collision.

## API Key Strategy

Long-lived credentials for machine-to-machine access. API keys bypass the interactive login flow, making them suitable for CI/CD pipelines, scripts, and service integrations.

```bash
# Authenticate with an API key
POST /auth/login
{
  "api_key": "raisin_key_abc123..."
}
```

## One-Time Token Strategy

Short-lived, single-use tokens for specific purposes:

- **Email verification** — confirm a user's email address
- **Password reset** — allow a user to set a new password
- **Workspace invitations** — invite a user to join a workspace

These tokens expire quickly and can only be used once.

## Session Management

Every successful authentication creates a server-side session. Sessions are the ground truth for whether a user is logged in — even if a JWT hasn't expired, the middleware checks that the session hasn't been revoked.

### JWT Token Pair

Authentication produces two tokens:

| Token | Lifetime | Purpose |
|-------|----------|---------|
| **Access token** | 1 hour | Short-lived JWT for API requests. Validated on every request. |
| **Refresh token** | 30 days | Long-lived token for obtaining new access tokens without re-authentication. |

### Token Claims

The access token carries:

| Claim | Purpose |
|-------|---------|
| `sub` | Identity ID |
| `email` | User's email |
| `tenant_id` | Tenant scope |
| `sid` | Session ID |
| `auth_strategy` | Which strategy produced this token (`local`, `oidc:google`, etc.) |
| `auth_time` | When the user last actively authenticated (for sudo mode) |
| `global_flags` | Tenant-wide flags (is_tenant_admin, email_verified, must_change_password) |
| `home` | User's home path in the repository |

**Workspace permissions are not stored in the JWT.** They are resolved per-request via an LRU cache, keeping tokens small and permissions always fresh. See [Roles and Permissions](./roles-and-permissions.md).

### Refresh Token Rotation

By default, each use of a refresh token issues a new refresh token and invalidates the old one. If a previously-used refresh token is presented again (indicating theft), the entire token family is revoked, forcing re-authentication on all devices.

```bash
# Refresh an access token
POST /auth/refresh
{ "refresh_token": "eyJhbG..." }
```

### Session Limits

The `max_sessions_per_user` setting (default: 10) caps concurrent sessions. When the limit is reached, the oldest session is revoked.

### Listing and Revoking Sessions

```bash
# List all sessions for the current user
GET /auth/sessions

# Revoke a specific session
DELETE /auth/sessions/{session_id}

# Logout (revoke current session)
POST /auth/logout
```

## Tenant-Level Configuration

Each tenant configures authentication independently. The full configuration:

```yaml
auth:
  session_duration_hours: 24
  refresh_token_duration_days: 30
  max_sessions_per_user: 10
  sudo_threshold_seconds: 300
  rotate_refresh_tokens: true
  revoke_on_reuse_detection: true
  audit_enabled: true
  anonymous_enabled: false

  password_policy:
    min_length: 8
    max_length: 128
    require_uppercase: true
    require_lowercase: true
    require_digit: true
    require_special: true

  magic_link:
    enabled: true
    expiration_minutes: 15

  rate_limiting:
    max_attempts_per_minute: 10
    lockout_duration_minutes: 30
    lockout_threshold: 5
```

### Rate Limiting

Authentication attempts are rate-limited per tenant to prevent brute-force attacks:

- `max_attempts_per_minute` — throttle for authentication attempts
- `lockout_threshold` — number of failures before account lockout
- `lockout_duration_minutes` — how long the lockout lasts

## Auth Middleware

The HTTP transport uses two middleware variants:

- **`require_auth`** — validates the JWT, checks the session is active, injects auth claims. Returns `401` if unauthenticated.
- **`optional_auth`** — same validation when a token is present, but allows anonymous access if no token is provided. Used for public content endpoints.

Both support **dual JWT validation** — accepting tokens signed by either the tenant's user key or the admin key.

### Admin Impersonation

Admins can impersonate users via the `X-Raisin-Impersonate` header for debugging. Impersonation tokens record the original admin's identity for audit purposes.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/providers` | List available auth providers |
| `POST` | `/auth/register` | Register with local credentials |
| `POST` | `/auth/login` | Authenticate with credentials |
| `POST` | `/auth/magic-link` | Request a magic link |
| `GET` | `/auth/magic-link/verify` | Verify a magic link token |
| `GET` | `/auth/oidc/{provider}` | Start OIDC flow |
| `GET` | `/auth/oidc/{provider}/callback` | Handle OIDC callback |
| `POST` | `/auth/refresh` | Refresh an access token |
| `POST` | `/auth/logout` | Logout and revoke session |
| `GET` | `/auth/sessions` | List user sessions |
| `DELETE` | `/auth/sessions/{id}` | Revoke a session |
| `GET` | `/auth/me` | Get current identity |

## Next Steps

- [Roles and Permissions](./roles-and-permissions.md) — configure workspace-scoped RBAC
- [Row-Level Security](./row-level-security.md) — enforce fine-grained access at query time
