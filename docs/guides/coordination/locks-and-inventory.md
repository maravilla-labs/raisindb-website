---
sidebar_position: 1
---

# Locks & Inventory

Coordinate concurrent requests so two callers never both win a race — sell the
last airline seat once, hand a ticket to exactly one buyer, run a critical
section on only one node at a time.

## When do I need this?

Whenever multiple requests can try to grab **the same thing at the same time**
and you must not let more than one succeed:

- Selling a finite number of tickets or seats without overselling.
- Reserving a specific resource (seat `14A`, room `301`, username `alice`).
- Making sure a scheduled job or import runs once, not once per request.
- Guarding any "check-then-write" sequence that would break if it interleaved.

RaisinDB gives you two complementary tools:

| Tool | What it does | Use it for |
|------|--------------|------------|
| **Lock** | Acquire an arbitrary key for a short, expiring lease. Only one holder at a time. | Mutual exclusion around a critical section ("I'm working on seat 14A, hands off"). |
| **Inventory** | Atomically claim `N` units from a pool of `capacity`, never going below zero. | "How many seats are left?" — claim one, or fail if sold out. |

Both are **optional** and **off by default**. Enable them in server config (see
[Enabling locks](#enabling-locks)).

## Locks

A lock is taken on any string key you choose. `acquire` either succeeds and
returns a **guard**, or returns nothing because someone else holds it.

```javascript
async function handler(input) {
  const seat = `seat:${input.flight}:${input.seatNo}`;

  // Try to take the seat for up to 5 seconds.
  const lock = raisin.locks.acquire(seat, 5000);
  if (!lock.acquired) {
    return { ok: false, reason: 'seat is being booked by someone else' };
  }

  try {
    // --- critical section: we are the only one in here for this seat ---
    const node = await raisin.nodes.get('default', `/flights/${input.flight}/${input.seatNo}`);
    if (node.properties.sold) {
      return { ok: false, reason: 'already sold' };
    }
    await raisin.nodes.update('default', node.path, {
      properties: { ...node.properties, sold: true, buyer: input.buyer, fence: lock.token },
    });
    return { ok: true };
  } finally {
    // Always release, even on error.
    raisin.locks.release(seat, lock.token);
  }
}
```

`acquire` returns `{ acquired: true, key, token, expires_at_ms }` on success or
`{ acquired: false }` on a lost tie-breaker — always check `.acquired`. (REST and
WebSocket return the same shape.)

### The lease (time-to-live)

Every lock has a **TTL** in milliseconds. If the holder crashes or never calls
`release`, the lease simply expires and the key becomes available again — locks
can never get permanently stuck.

Choose a TTL a little longer than your critical section. For long-running work,
call `renew` periodically to extend the lease:

```javascript
const lock = raisin.locks.acquire('import:catalog', 10000);
if (lock.acquired) {
  // ... long work ...
  raisin.locks.renew('import:catalog', lock.token, 10000); // give it 10s more
}
```

### The fence token

`acquire` returns a `token` — a number that increases every time a lock is
handed out. It's optional, but it makes your writes bullet-proof: store the
token on the thing you protect, and ignore any write that carries an older
token. This guarantees that even in rare timing edge cases, a slow holder whose
lease already expired can't overwrite the work of a newer holder.

The example above does exactly this with `fence: lock.token`.

:::tip
If you just need a soft "please don't double-process", you can ignore the token.
If correctness is critical (money, inventory, bookings), record it and reject
stale writes.
:::

## Inventory

When the thing you're protecting is simply *a count* — seats remaining, tickets
left, licenses available — use inventory instead of a lock. `claim` atomically
takes units from a named pool and tells you how many remain, or fails cleanly
when sold out.

```javascript
async function handler(input) {
  // Claim 1 seat from a pool of 180. The pool is created on first use.
  const result = raisin.inventory.claim(`flight:${input.flight}`, 1, 180);
  if (!result.claimed) {
    return { ok: false, reason: 'sold out' };
  }
  return { ok: true, seatsLeft: result.remaining };
}
```

`claim` returns `{ claimed: true, remaining }` on success or `{ claimed: false }`
when sold out — always check `.claimed`. (REST and WebSocket return the same shape.)

Hand units back (e.g. a cancelled booking) with `release`:

```javascript
const left = raisin.inventory.release(`flight:${input.flight}`, 1);
```

No matter how many requests race, the pool never drops below zero and never
oversells — exactly `capacity` units can ever be claimed.

## Using it from HTTP

The same primitives are available over REST, scoped to a repository and branch.

```bash
# Acquire a lock (200 = got it, 409 = held by someone else)
curl -X POST http://localhost:8080/api/myapp/main/locks/acquire \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{ "key": "seat:AA123:14A", "ttl_ms": 5000 }'
# → { "acquired": true, "key": "seat:AA123:14A", "token": 42, "expires_at_ms": 1750000000000 }

# Claim inventory (200 = claimed, 409 = sold out)
curl -X POST http://localhost:8080/api/myapp/main/inventory/claim \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{ "pool": "flight:AA123", "n": 1, "capacity": 180 }'
# → { "claimed": true, "remaining": 179 }
```

See the [Locks & Inventory API reference](../../reference/http-api/locks-api.md)
for every endpoint. The same operations are also available over the WebSocket
node API (`locks_acquire`, `inventory_claim`, …).

## Enabling locks

Locks are off until you turn them on in the server config:

```toml
[locks]
enabled = true
# "inprocess" for a single server, "redis" for a multi-node cluster.
backend = "inprocess"
```

For a cluster, point every node at one Redis instance:

```toml
[locks]
enabled = true
backend = "redis"

[locks.redis]
url = "redis://127.0.0.1:6379/0"
```

:::warning Single-node vs cluster
The `inprocess` backend coordinates **only within one server**. If you run a
multi-node cluster, every node has its own independent set of locks — which
means they will **oversell**. Always use the `redis` backend when running more
than one node. (The server logs a warning if it detects this misconfiguration.)
:::

See the [Configuration reference](../../reference/configuration.md#locks) for all
options.

## Keys are private to your repo and branch

You choose the key (`seat:AA123:14A`, `flight:AA123`, anything). Behind the
scenes each key is isolated per tenant, repository, and branch, so a lock named
`import` in one branch never blocks the same name in another.

## Next steps

- [Creating Functions](../functions/creating-functions.md) — where most locking logic lives
- [Locks & Inventory API reference](../../reference/http-api/locks-api.md)
- [Configuration reference](../../reference/configuration.md#locks)
