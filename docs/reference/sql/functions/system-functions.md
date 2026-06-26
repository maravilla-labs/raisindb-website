---
sidebar_position: 10
---

# System Functions

Functions for querying system information, session details, and RaisinDB-specific authentication state.

## Standard System Functions

### VERSION

Return the RaisinDB server version.

```sql
VERSION() → TEXT
```

```sql
SELECT VERSION();
-- Result: 'RaisinDB 0.1.0'
```

---

### CURRENT_SCHEMA

Return the current schema name.

```sql
CURRENT_SCHEMA() → TEXT
```

```sql
SELECT CURRENT_SCHEMA();
```

---

### CURRENT_DATABASE

Return the current database name.

```sql
CURRENT_DATABASE() → TEXT
```

```sql
SELECT CURRENT_DATABASE();
```

---

### CURRENT_USER

Return the current user name.

```sql
CURRENT_USER() → TEXT
```

```sql
SELECT CURRENT_USER();
```

---

### SESSION_USER

Return the session user name.

```sql
SESSION_USER() → TEXT
```

```sql
SELECT SESSION_USER();
```

---

### CURRENT_CATALOG

Return the current catalog name.

```sql
CURRENT_CATALOG() → TEXT
```

```sql
SELECT CURRENT_CATALOG();
```

---

## RaisinDB Authentication Functions

### RAISIN_CURRENT_USER

Return the current RaisinDB authenticated user.

```sql
RAISIN_CURRENT_USER() → TEXT
```

```sql
SELECT RAISIN_CURRENT_USER();
```

---

### RAISIN_AUTH_CURRENT_USER

Return detailed information about the currently authenticated user.

```sql
RAISIN_AUTH_CURRENT_USER() → JSONB
```

```sql
SELECT RAISIN_AUTH_CURRENT_USER();
```

---

### RAISIN_AUTH_CURRENT_WORKSPACE

Return the current workspace context for the authenticated user.

```sql
RAISIN_AUTH_CURRENT_WORKSPACE() → TEXT
```

```sql
SELECT RAISIN_AUTH_CURRENT_WORKSPACE();
```

---

### RAISIN_AUTH_HAS_PERMISSION

Check if the current user has a specific permission.

```sql
RAISIN_AUTH_HAS_PERMISSION(permission) → BOOLEAN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| permission | TEXT | Permission name to check |

```sql
SELECT RAISIN_AUTH_HAS_PERMISSION('write');
SELECT RAISIN_AUTH_HAS_PERMISSION('admin');
```

---

### RAISIN_AUTH_GET_SETTINGS

Retrieve authentication settings.

```sql
RAISIN_AUTH_GET_SETTINGS() → JSONB
```

```sql
SELECT RAISIN_AUTH_GET_SETTINGS();
```

---

### RAISIN_AUTH_UPDATE_SETTINGS

Update authentication settings.

```sql
RAISIN_AUTH_UPDATE_SETTINGS(settings) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| settings | JSONB | New settings to apply |

```sql
SELECT RAISIN_AUTH_UPDATE_SETTINGS('{"require_mfa": true}');
```

---

### RAISIN_AUTH_ADD_PROVIDER

Add an authentication provider.

```sql
RAISIN_AUTH_ADD_PROVIDER(provider_config) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| provider_config | JSONB | Provider configuration |

```sql
SELECT RAISIN_AUTH_ADD_PROVIDER('{
    "type": "oauth2",
    "name": "github",
    "client_id": "..."
}');
```

---

### RAISIN_AUTH_UPDATE_PROVIDER

Update an existing authentication provider.

```sql
RAISIN_AUTH_UPDATE_PROVIDER(provider_name, config) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| provider_name | TEXT | Name of the provider to update |
| config | JSONB | Updated configuration |

```sql
SELECT RAISIN_AUTH_UPDATE_PROVIDER('github', '{"enabled": false}');
```

---

### RAISIN_AUTH_REMOVE_PROVIDER

Remove an authentication provider.

```sql
RAISIN_AUTH_REMOVE_PROVIDER(provider_name) → BOOLEAN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| provider_name | TEXT | Name of the provider to remove |

```sql
SELECT RAISIN_AUTH_REMOVE_PROVIDER('github');
```

---

## Type Membership Functions

Fast checks against a node's materialized type sets. Every node is stamped on write
with its effective mixins and supertypes, so these are simple membership tests — no
schema resolution happens at query time. See
[Using Mixins](../../../guides/data-modeling/using-mixins.md).

### HAS_MIXIN

True if the node carries the given mixin (type-declared, transitively).

```sql
HAS_MIXIN(properties, mixin_name) → BOOLEAN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| properties | JSONB | The node's `properties` column |
| mixin_name | TEXT | Mixin name to test, e.g. `'myapp:SEO'` |

```sql
SELECT * FROM 'workspace' WHERE HAS_MIXIN(properties, 'myapp:SEO');
```

### IS_A

True if the node "is a" given type — its `node_type`, any `EXTENDS` ancestor, or any
mixin.

```sql
IS_A(properties, type_name) → BOOLEAN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| properties | JSONB | The node's `properties` column |
| type_name | TEXT | Type name to test, e.g. `'myapp:Article'` |

```sql
SELECT * FROM 'workspace' WHERE IS_A(properties, 'myapp:Article');
```

---

## Lock & Inventory Functions

Atomic [locks & inventory](../../../guides/coordination/locks-and-inventory.md) from
SQL. These call the same backend as the function/HTTP/WS surfaces. They require the
`[locks]` subsystem to be enabled and an **authenticated, non-anonymous** session
(a held lock is a denial-of-service vector); the requested TTL is capped at 5
minutes. Keys are scoped to the current tenant / repository / branch.

### RAISIN_TRY_ACQUIRE

Try once to acquire a lease-lock on an arbitrary `key`. Returns JSON with the
result and a monotonically increasing **fence token**.

```sql
RAISIN_TRY_ACQUIRE(key, ttl_ms) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| key | TEXT | Arbitrary lock key, e.g. `'seat:AA123:14A'` |
| ttl_ms | BIGINT | Lease duration in milliseconds (auto-expires; max 300000) |

```sql
SELECT RAISIN_TRY_ACQUIRE('seat:AA123:14A', 5000);
-- {"acquired": true, "key": "seat:AA123:14A", "token": 42, "expires_at_ms": 1750000000000}
-- or, if currently held by someone else:
-- {"acquired": false}
```

### RAISIN_RELEASE

Release a lock held with the given fence token. Returns `false` if the lock was
already gone or held by someone else.

```sql
RAISIN_RELEASE(key, token) → BOOLEAN
```

```sql
SELECT RAISIN_RELEASE('seat:AA123:14A', 42);
```

### RAISIN_RENEW

Extend the lease on a held lock. Returns `false` if the lease was already lost.

```sql
RAISIN_RENEW(key, token, ttl_ms) → BOOLEAN
```

```sql
SELECT RAISIN_RENEW('seat:AA123:14A', 42, 5000);
```

### RAISIN_CLAIM

Atomically claim `n` units from an inventory `pool`, seeding it to `capacity` the
first time it is touched. Never oversells.

```sql
RAISIN_CLAIM(pool, n, capacity) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| pool | TEXT | Inventory pool name, e.g. `'flight:AA123'` |
| n | BIGINT | Units to claim |
| capacity | BIGINT | Pool size (used only on first touch) |

```sql
SELECT RAISIN_CLAIM('flight:AA123', 1, 180);
-- {"claimed": true, "remaining": 179}   (or {"claimed": false} when sold out)
```

### RAISIN_RELEASE_CLAIM

Return `n` units to a pool. Returns the new remaining count.

```sql
RAISIN_RELEASE_CLAIM(pool, n) → BIGINT
```

```sql
SELECT RAISIN_RELEASE_CLAIM('flight:AA123', 1);
```

### Fencing a write (the secure pattern)

The fence token lets a guarded write reject a stale holder. Record the token on
the protected row and only update when your token is newer — a standard
compare-and-swap `UPDATE` whose affected-row count tells you if you won:

```sql
-- 1) acquire → token (say 42)
-- 2) guarded write: succeeds only if no newer holder has written
UPDATE 'flights' SET properties = $1::jsonb
  WHERE path = '/AA123/14A' AND properties->>'fence'::String < '42';
-- 0 rows affected ⇒ a newer holder won; back off.
```

---

## Notes

- Standard system functions follow PostgreSQL conventions
- `CURRENT_USER()` and `SESSION_USER()` may differ when impersonation is used
- `RAISIN_AUTH_*` functions are specific to RaisinDB's authentication system
- Authentication management functions require appropriate admin permissions
- All functions return NULL if the requested information is not available
