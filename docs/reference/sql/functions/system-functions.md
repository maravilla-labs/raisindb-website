---
sidebar_position: 10
---

# System Functions

Functions that report on the server and the session, test a node's type membership, and drive the atomic lock and inventory primitives from SQL.

## Server and session

| Function | Returns | Example result |
|----------|---------|----------------|
| `VERSION()` | TEXT | `RaisinDB 0.1.0 on macos (PostgreSQL-compatible)` |
| `CURRENT_SCHEMA()` | TEXT | `public` |
| `CURRENT_DATABASE()` | TEXT | `raisindb` |
| `SESSION_USER` (no parentheses) | TEXT | `raisindb` |
| `RAISIN_CURRENT_USER()` | JSONB | the calling user's `raisin:User` node, or NULL |

```sql
SELECT VERSION() AS v, CURRENT_SCHEMA() AS s, CURRENT_DATABASE() AS d, SESSION_USER AS su;
```

```json
{"v":"RaisinDB 0.1.0 on macos (PostgreSQL-compatible)","s":"public","d":"raisindb","su":"raisindb"}
```

These exist so that PostgreSQL clients connecting over the wire protocol get sensible answers; they do not describe the tenant or repository. `SESSION_USER` is a keyword and takes no parentheses. `CURRENT_USER` and `CURRENT_CATALOG` are parsed as keywords too, and neither form of them currently evaluates (`Unknown function: CURRENT_USER`); use `RAISIN_CURRENT_USER()` for the caller's identity.

### RAISIN_CURRENT_USER

```sql
RAISIN_CURRENT_USER() → JSONB
```

Returns the JSON of the `raisin:User` node in `raisin:access_control` whose `user_id` matches the authenticated caller, or NULL when there is no such node (for example a superadmin token that is not backed by a user node, or an anonymous request).

```sql
SELECT RAISIN_CURRENT_USER() AS me;
-- {"me":null}   for a token with no matching user node
```

Read a field from it with `->>`: `RAISIN_CURRENT_USER()->>'user_id'`.

## Type membership

Every node carries its effective mixins and supertypes, so these checks are simple membership tests with no schema resolution at query time. See [Using Mixins](../../../guides/data-modeling/using-mixins.md).

```sql
HAS_MIXIN(properties, mixin_name) → BOOLEAN
IS_A(properties, type_name) → BOOLEAN
```

| Parameter | Description |
|-----------|-------------|
| properties | The node's `properties` column (the membership sets are stored inside it) |
| mixin_name / type_name | The name to test, e.g. `'myapp:SEO'`, `'myapp:Article'` |

```sql
SELECT name FROM 'blog' WHERE HAS_MIXIN(properties, 'docs:SEO');
SELECT name FROM 'blog' WHERE IS_A(properties, 'docs:Article');
```

The first argument is required: `HAS_MIXIN('x')` is `Function not found: HAS_MIXIN(TEXT)`. Both return `false` for a node whose properties carry no membership sets. In the current build a plain `raisin:Page` node answers `false` to `IS_A(properties, 'raisin:Page')`, so treat `IS_A` as a test for types reached through `EXTENDS` and mixins rather than for the node's own `node_type`; compare `node_type` directly for that.

## Locks and inventory

Atomic [locks and inventory](../../../guides/coordination/locks-and-inventory.md) from SQL, backed by the same lock manager as the function, HTTP and WebSocket surfaces. They require the `[locks]` section to be enabled in the server config and an authenticated, non-anonymous session. Keys are scoped to the current tenant, repository and branch.

When the subsystem is off every call fails with:

```
Locks subsystem is disabled. Enable [locks] in server config.
```

### RAISIN_TRY_ACQUIRE

Try once to acquire a lease on `key`. Returns JSON with the outcome and a monotonically increasing fence token.

```sql
RAISIN_TRY_ACQUIRE(key, ttl_ms) → JSONB
```

| Parameter | Type | Description |
|-----------|------|-------------|
| key | TEXT | Lock key, e.g. `'seat:AA123:14A'` |
| ttl_ms | BIGINT | Lease duration in milliseconds; the lease expires on its own. Must be positive and at most 300000 (5 minutes). |

```sql
SELECT RAISIN_TRY_ACQUIRE('seat:AA123:14A', 5000);
-- {"acquired": true, "key": "seat:AA123:14A", "token": 42, "expires_at_ms": 1750000000000}
-- or {"acquired": false} when someone else holds it
```

### RAISIN_RELEASE and RAISIN_RENEW

```sql
RAISIN_RELEASE(key, token) → BOOLEAN
RAISIN_RENEW(key, token, ttl_ms) → BOOLEAN
```

Both return `false` when the lease is already gone or is held under a different token.

### RAISIN_CLAIM and RAISIN_RELEASE_CLAIM

Counting reservations. `RAISIN_CLAIM` takes `n` units from `pool`, seeding the pool to `capacity` the first time it is touched, and never goes below zero.

```sql
RAISIN_CLAIM(pool, n, capacity) → JSONB
RAISIN_RELEASE_CLAIM(pool, n) → BIGINT
```

```sql
SELECT RAISIN_CLAIM('flight:AA123', 1, 180);
-- {"claimed": true, "remaining": 179}   or {"claimed": false} when sold out

SELECT RAISIN_RELEASE_CLAIM('flight:AA123', 1);
-- 180
```

### Fencing a write

The fence token lets a guarded write reject a stale holder. Record the token on the protected row and update only when yours is newer; the affected-row count tells you whether you won:

```sql
UPDATE 'flights' SET properties = $1::jsonb
WHERE path = '/AA123/14A' AND properties->>'fence'::String < '42';
-- 0 rows affected: a newer holder wrote first, back off
```

A `WHERE` with a property predicate runs as a bulk job ([UPDATE](../statements/update.md#how-the-where-clause-is-executed)), so read the job result for the count.

## Authentication configuration

`RAISIN_AUTH_CURRENT_USER`, `RAISIN_AUTH_CURRENT_WORKSPACE`, `RAISIN_AUTH_HAS_PERMISSION`, `RAISIN_AUTH_GET_SETTINGS`, `RAISIN_AUTH_UPDATE_SETTINGS`, `RAISIN_AUTH_ADD_PROVIDER`, `RAISIN_AUTH_UPDATE_PROVIDER` and `RAISIN_AUTH_REMOVE_PROVIDER` are declared to the analyzer but have no implementation in the current build; calling them returns `Unknown function`. Authentication settings and providers are managed through the HTTP auth endpoints and the admin console.
