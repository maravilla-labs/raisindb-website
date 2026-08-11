---
sidebar_position: 13
---

# Secrets

API keys, OAuth tokens and passwords do not belong in your content. RaisinDB
gives them a **dedicated encrypted store** and leaves a reference behind, so a
credential can sit in a node's schema without ever appearing in a query result,
an API response, an event or a log.

Mark one field. Everything else is automatic.

## Declare it once

```yaml
properties:
  - name: api_key
    type: String
    encrypted: true
```

That is the whole opt-in.

## Write plaintext, store a reference

Your application writes the value the obvious way — REST, SQL, WebSocket, it
does not matter:

```json
{ "api_key": "sk-live-abc123" }
```

RaisinDB seals it into the secret store and puts a reference in its place:

```json
{ "api_key": "secret://node/01H8XY7Z9/api_key@1" }
```

That reference is what every read returns. `SELECT *` is safe. Webhooks are
safe. The audit log is safe. There is no redaction layer to configure, and no
read path that can be forgotten — the plaintext simply is not there to leak.

```sql
SELECT name, api_key FROM 'crm';
-- Acme    secret://node/01H8XY7Z9/api_key@1
```

## Use it where it matters

Server-side code resolves a reference at the moment it dials the remote service.
In a function:

```js
const node = await raisin.nodes.get(id);
const key  = await raisin.secrets.get(node.api_key);
```

Access is **deny-by-default**. A function reads only the secrets its own policy
names:

```yaml
secret_policy:
  enabled: true
  allowed_names: ["stripe/*"]
```

## Rotate without downtime

Every write appends a version rather than overwriting one, so rotation is a
non-event: add the new value, let consumers pick it up, and anything pinned to
the old version keeps working until it moves.

```bash
raisindb secret rotate stripe-key
```

Versioning is also what keeps history honest. Read a node as it was last March
and you get the credential it held last March — not today's.

## Not every secret belongs to a node

Shared credentials — a webhook signing secret, an org-wide API key — live in the
same store under a name you choose, managed from the admin console or the CLI:

```bash
raisindb secret set stripe-key      # value read from stdin, never the command line
raisindb secret list
raisindb secret rotate stripe-key
```

There is deliberately **no command that prints a secret back**. Nothing in the
API returns a plaintext value either. If you have lost one, you rotate it.

## Branch-aware, like everything else

Secrets are scoped per branch and travel with your content. Fork a branch and it
gets its own copy, so a feature branch can hold test credentials while
production keeps the real ones. Promote content between branches and the
credentials it depends on come along.

## Encrypted at rest, keyed from outside

Values are sealed with AES-256-GCM under a master key held **outside the
database** — in your environment or your secret manager, never in the data
directory. A stolen backup is inert without it.

The key is a keyring rather than a single value, so keys can be added and
retired on a rolling basis instead of as a flag day:

```bash
RAISIN_MASTER_KEYS="1:<hex>,2:<hex>"
RAISIN_MASTER_KEY_ACTIVE=2
```

### Turn on the v2 envelope

Set one variable to get the stronger on-disk format:

```bash
RAISIN_CRYPTO_EMIT_V2=1
```

It gives you two things:

- **Every secret records which key sealed it.** Rotation becomes precise rather
  than best-effort, and a node that is missing a key says exactly which one
  (`unknown key id 2 (have: [0, 1])`) instead of failing with a generic
  decryption error.
- **Each secret is bound to where it lives** — its tenant, repository and field
  are woven into the encryption itself. A ciphertext lifted out and dropped
  somewhere else does not decrypt. Copying the bytes gets an attacker nothing.

It also tags anything sealed with the insecure all-zero development key, and
refuses to open those outside development mode — so a dev database promoted to
production fails loudly instead of quietly running on a key everyone knows.

RaisinDB always *reads* both formats, so turning this on is safe at any time on
a single node. On a cluster, roll it out only once every node is running a
version that understands v2.

## In short

- One schema flag turns a property into a managed secret
- Reads return a reference, so every surface is safe by construction
- Functions get explicit, per-secret grants
- Versioned by default, so rotation and history both just work
- Encrypted at rest under a key that never touches the database
- `RAISIN_CRYPTO_EMIT_V2=1` adds key identification and ties each secret to
  where it lives
