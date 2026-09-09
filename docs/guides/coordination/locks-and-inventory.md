---
sidebar_position: 1
---

# Locks & Inventory

Coordinate concurrent requests so that only one caller wins a race: sell the
last seat once, hand a ticket to exactly one buyer, run a critical section on
one node at a time.

## When do I need this?

Whenever several requests can try to take the same thing at the same time
and only one may succeed:

- Selling a finite number of tickets or seats without overselling.
- Reserving a specific resource (seat `14A`, room `301`, username `alice`).
- Running a scheduled job or import once, not once per request.
- Guarding any check-then-write sequence that breaks if it interleaves.

RaisinDB offers two primitives:

| Tool | What it does | Use it for |
|------|--------------|------------|
| **Lock** | Take a key for a short, expiring lease. One holder at a time. | Mutual exclusion around a critical section |
| **Inventory** | Atomically claim `n` units from a pool of `capacity`, never below zero. | Counting what is left: claim one, or fail when sold out |

Both are available from functions, over HTTP and over the WebSocket API.

## Locks

A lock is taken on any string key you choose. `acquire` returns a guard with
a token, or `{ acquired: false }` when someone else holds the key. The
function bindings are synchronous in JavaScript.

```javascript
export async function handler(input) {
  const seat = `seat:${input.flight}:${input.seatNo}`;

  // Try to take the seat for up to 5 seconds.
  const lock = raisin.locks.acquire(seat, 5000);
  if (!lock.acquired) {
    return { ok: false, reason: 'seat is being booked by someone else' };
  }

  try {
    // Critical section: only one caller is in here for this seat.
    const node = await raisin.nodes.get('flights', `/${input.flight}/${input.seatNo}`);
    if (node.properties.sold) {
      return { ok: false, reason: 'already sold' };
    }
    await raisin.nodes.update('flights', node.path, {
      properties: { ...node.properties, sold: true, buyer: input.buyer, fence: lock.token },
    });
    return { ok: true };
  } finally {
    raisin.locks.release(seat, lock.token);   // always release, even on error
  }
}
```

`acquire(key, ttlMs)` returns `{ acquired: true, key, token, expires_at_ms }`
on success or `{ acquired: false }` otherwise. `release(key, token)` and
`renew(key, token, ttlMs)` return `true` or `false`. The same shapes come back
over HTTP and WebSocket. In Starlark the calls are `raisin.locks.acquire(key,
ttl_ms)`, `raisin.locks.release(key, token)` and
`raisin.locks.renew(key, token, ttl_ms)`.

### The lease

Every lock has a time-to-live in milliseconds. If the holder crashes or never
calls `release`, the lease expires and the key becomes available again, so a
lock cannot stay stuck. Pick a TTL a little longer than the critical section
and call `renew` for long-running work:

```javascript
const lock = raisin.locks.acquire('import:catalog', 10000);
if (lock.acquired) {
  // ... long work ...
  raisin.locks.renew('import:catalog', lock.token, 10000);   // 10 more seconds
}
```

Over HTTP and WebSocket the TTL is capped at 300000 ms (five minutes).

### The fence token

`token` is a number that increases every time a lock is handed out. Store it
on the thing the lock protects and reject writes that carry an older token.
Then a slow holder whose lease already expired cannot overwrite the work of a
newer holder. The example above does this with `fence: lock.token`. If you
only need a soft "please don't double-process", you can ignore the token.

## Inventory

When the thing you protect is a count (seats remaining, licences available),
use inventory. `claim` takes units from a named pool atomically and reports
how many remain, or fails when there are not enough.

```javascript
export function handler(input) {
  // Claim 1 seat from a pool of 180. The pool is created with 180 units on first use.
  const result = raisin.inventory.claim(`flight:${input.flight}`, 1, 180);
  if (!result.claimed) {
    return { ok: false, reason: 'sold out' };
  }
  return { ok: true, seatsLeft: result.remaining };
}
```

`claim(pool, n, capacity)` returns `{ claimed: true, remaining }` or
`{ claimed: false }`. `capacity` only matters the first time a pool is
touched; later calls with a different capacity do not resize it. Hand units
back with `release`, which returns the new remaining count:

```javascript
const left = raisin.inventory.release(`flight:${input.flight}`, 1);   // e.g. 180
```

No matter how many requests race, the pool never goes below zero. `release`
is not capped at `capacity`, so release only what you claimed.

## Using it from HTTP

The same operations exist over REST, scoped to a repository and branch. They
require an authenticated, non-anonymous caller.

Enabling anonymous access for a repository does not open the lock endpoints.
An unauthenticated request is resolved onto the built-in anonymous user, and
that user is refused here whatever it is granted elsewhere: a held lock is a
denial-of-service vector, so a caller who cannot be named cannot take one. The
same rule applies to the WebSocket lock requests and to the SQL lock
functions.

```bash
# Acquire a lock: 200 = got it, 409 = held by someone else
curl -X POST http://localhost:8090/api/myapp/main/locks/acquire \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "key": "seat:AA123:14A", "ttl_ms": 5000 }'
# {"acquired":true,"key":"seat:AA123:14A","token":348,"expires_at_ms":1788720658677}

# Claim inventory: 200 = claimed, 409 = not enough left
curl -X POST http://localhost:8090/api/myapp/main/inventory/claim \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "pool": "flight:AA123", "n": 1, "capacity": 180 }'
# {"claimed":true,"remaining":179}
```

See the [Locks & Inventory API reference](../../reference/http-api/locks-api.md)
for every endpoint. Over the WebSocket node API the request types are
`locks_acquire`, `locks_release`, `locks_renew`, `inventory_claim` and
`inventory_release`, with the same payloads.

## Enabling locks

The subsystem is off by default and enabled in the server config. A server
started with `--dev-mode` enables the in-process backend automatically.

```toml
[locks]
enabled = true
backend = "inprocess"        # single server
reaper_interval_secs = 30    # how often expired leases are swept
```

For a cluster, point every node at one Redis instance (the server must be
built with the `locks-redis` feature):

```toml
[locks]
enabled = true
backend = "redis"

[locks.redis]
url = "redis://127.0.0.1:6379/0"
namespace = "raisin:locks"
```

:::warning Single node vs cluster
The `inprocess` backend coordinates only within one server process. On a
multi-node cluster each node would have its own independent locks and pools,
and inventory would oversell. Use the `redis` backend for more than one node;
the server logs a warning when it sees `inprocess` together with replication.
:::

When the subsystem is disabled, HTTP and WebSocket calls fail with
`Locks subsystem disabled. Enable [locks] in server config.` and the function
bindings throw the equivalent error.

See the [Configuration reference](../../reference/configuration.md#locks) for
all options.

## Keys are private to your repo and branch

You choose the key (`seat:AA123:14A`, `flight:AA123`, anything). Internally
each key is prefixed with the tenant, repository and branch, so a lock named
`import` on one branch never blocks the same name on another.

## Next steps

- [Creating Functions](../functions/creating-functions.md), where most locking logic lives
- [Locks & Inventory API reference](../../reference/http-api/locks-api.md)
- [Configuration reference](../../reference/configuration.md#locks)
