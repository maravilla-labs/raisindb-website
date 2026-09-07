---
sidebar_position: 7
---

# Locks & Inventory API

Atomic locks and inventory reservations over REST. All endpoints are `POST`,
scoped to a repository and branch, and need the
[locks subsystem](../configuration.md#locks) enabled. The caller must be
authenticated and not anonymous (`403` otherwise); the lock owner is derived
from the caller's identity, not from the request body.

A `409 Conflict` means the lock is currently held or the pool does not have
enough units. It is the normal "you lost the race" outcome, not an error.
With the subsystem disabled every endpoint returns `400` with code
`VALIDATION_FAILED` and the message `Locks subsystem disabled. Enable [locks]
in server config.`

## Acquire a lock

```
POST /api/{repo}/{branch}/locks/acquire
```

Request:

```json
{ "key": "seat:AA123:14A", "ttl_ms": 5000 }
```

`ttl_ms` must be between 1 and 300000. Response (`200`):

```json
{ "acquired": true, "key": "seat:AA123:14A", "token": 348, "expires_at_ms": 1788720658677 }
```

When the key is already held (`409`):

```json
{ "acquired": false }
```

`token` is a fencing token that increases with every lock handed out. Store
it on whatever the lock protects and reject writes that carry an older token
to stay correct when a lease expires under a slow holder.

## Release a lock

```
POST /api/{repo}/{branch}/locks/release
```

```json
{ "key": "seat:AA123:14A", "token": 348 }
```

Response (`200`):

```json
{ "released": true }
```

`released` is `false` when the lock has already expired, was released, or is
held with a different token. Releasing is idempotent and safe to call from a
`finally` block.

## Renew a lock

Extend the lease before it expires.

```
POST /api/{repo}/{branch}/locks/renew
```

```json
{ "key": "seat:AA123:14A", "token": 348, "ttl_ms": 5000 }
```

```json
{ "renewed": true }
```

`renewed` is `false` when the lease was already lost.

## Claim inventory

Take `n` units from a pool. The pool is created with `capacity` units the
first time it is touched; on later calls `capacity` is ignored.

```
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

Return units to a pool. The count is not capped at `capacity`.

```
POST /api/{repo}/{branch}/inventory/release
```

```json
{ "pool": "flight:AA123", "n": 1 }
```

```json
{ "remaining": 180 }
```

## WebSocket

The same five operations are available on the WebSocket node API as request
types `locks_acquire`, `locks_release`, `locks_renew`, `inventory_claim` and
`inventory_release`, with identical payloads. The responses have the same
bodies; a lost race comes back as a normal response with `acquired: false`
or `claimed: false` rather than a `409`.

## See also

- [Locks & Inventory guide](../../guides/coordination/locks-and-inventory.md)
- [Configuration reference](../configuration.md#locks)
