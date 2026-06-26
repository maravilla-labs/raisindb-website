---
sidebar_position: 7
---

# Locks & Inventory API

Atomic locks and inventory reservations over REST. All endpoints are scoped to a
repository and branch and require the [locks subsystem](../configuration.md#locks)
to be enabled.

A `409 Conflict` means the lock is currently held, or the pool is sold out — it
is the normal "you lost the race" outcome, not an error.

## Acquire a lock

```bash
POST /api/{repo}/{branch}/locks/acquire
```

Request:

```json
{
  "key": "seat:AA123:14A",
  "ttl_ms": 5000,
  "owner": "booking-service"
}
```

`owner` is optional and informational. Response (`200`):

```json
{
  "acquired": true,
  "key": "seat:AA123:14A",
  "token": 42,
  "expires_at_ms": 1750000000000
}
```

When the key is already held (`409`):

```json
{ "acquired": false }
```

The `token` is a monotonically increasing fence token. Store it on whatever the
lock protects and reject writes that carry an older token to stay correct under
rare timing edge cases.

## Release a lock

```bash
POST /api/{repo}/{branch}/locks/release
```

```json
{ "key": "seat:AA123:14A", "token": 42 }
```

Response:

```json
{ "released": true }
```

`released` is `false` if the lock was already gone or held by someone else.
Releasing is idempotent and safe to call from a `finally` block.

## Renew a lock

Extend the lease before it expires (for long-running work).

```bash
POST /api/{repo}/{branch}/locks/renew
```

```json
{ "key": "seat:AA123:14A", "token": 42, "ttl_ms": 5000 }
```

```json
{ "renewed": true }
```

`renewed` is `false` if the lease was already lost.

## Claim inventory

Atomically take `n` units from a pool, seeding it to `capacity` the first time
it is touched.

```bash
POST /api/{repo}/{branch}/inventory/claim
```

```json
{ "pool": "flight:AA123", "n": 1, "capacity": 180 }
```

Response (`200`):

```json
{ "claimed": true, "remaining": 179 }
```

When fewer than `n` units remain (`409`):

```json
{ "claimed": false }
```

## Release inventory

Return units to a pool.

```bash
POST /api/{repo}/{branch}/inventory/release
```

```json
{ "pool": "flight:AA123", "n": 1 }
```

```json
{ "remaining": 180 }
```

## See also

- [Locks & Inventory guide](../../guides/coordination/locks-and-inventory.md)
- [Configuration reference](../configuration.md#locks)
