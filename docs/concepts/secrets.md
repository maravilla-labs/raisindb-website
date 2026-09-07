---
sidebar_position: 13
---

# Secrets

API keys, OAuth tokens and passwords should not sit in content. RaisinDB keeps
them in an encrypted secret store and leaves a reference in the node, so a
credential can be part of a node's schema without appearing in a query result,
an API response, an event or a log.

## Declare an encrypted field

Mark the property in the node type definition:

```yaml
properties:
  - name: api_key
    type: String
    encrypted: true
```

That is the whole opt-in. The same flag exists on element-type fields. (The
older spelling `meta: { secret: true }` is still read.) There is no SQL DDL
modifier for it, so encrypted fields are declared in YAML or through the
node-type management API.

## Write plaintext, store a reference

Your application writes the value the normal way, through REST, SQL or the
WebSocket API:

```sql
INSERT INTO 'crm' (path, node_type, name, properties)
VALUES ('/acme', 'docs:Connection', 'acme',
        '{"label":"Acme","api_key":"sk-live-abc123"}'::jsonb);
```

Before the node is indexed or stored, the server moves the value into the
secret store and replaces the property with a reference:

```sql
SELECT properties FROM 'crm';
-- {"label":"Acme","api_key":"secret://node/67b793df-f435-46f0-b4f4-44cccba20952/api_key@1"}
```

The reference is `secret://node/{node id}/{field}@{version}`. Every read
returns this reference, whether it comes from `SELECT *`, a REST read, a
webhook payload, the audit log or a replication message. Because the value is
vaulted before indexing, a query like `properties->>'api_key' = 'guess'` cannot
be used to probe it.

Writing a reference back is a no-op, so a client that reads a node and saves
it again does not create a new version. Writing a new plaintext value creates
a new version and updates the pin. An encrypted field that holds something
other than a string (or null) is rejected rather than stored.

## Use it where it matters

Server-side function code resolves a reference at the moment it needs the
value. A function must declare which secrets it may read; without a policy,
every read is denied.

```yaml
# .node.yaml of the function
secret_policy:
  enabled: true
  allowed_names: ["node/*"]
```

```js
const rows = await raisin.sql.query("SELECT properties FROM 'crm' WHERE path = '/acme'");
const key = raisin.secrets.get(rows.rows[0].properties.api_key);
// "sk-live-abc123"
```

`allowed_names` entries are globs where `*` also matches `/`, so `node/*`
covers every node-owned secret and `stripe/*` covers `stripe/api_key`.
`raisin.secrets.get` accepts a bare name or a full `secret://` reference;
`raisin.secrets.resolve(value)` returns the plaintext when `value` is a
reference and the value unchanged otherwise. A denied read fails with
`[secrets:policy_denied]`.

## Named secrets

A credential that is not tied to one node, such as an email provider key or a
webhook signing secret, is stored under a name you choose. Names may contain
`/`.

```bash
raisindb secret set stripe/api_key -r myrepo          # value read from stdin
raisindb secret list -r myrepo
raisindb secret show stripe/api_key -r myrepo         # metadata and version history
raisindb secret rotate stripe/api_key -r myrepo       # appends a new version
raisindb secret rm stripe/api_key -r myrepo --yes     # writes a tombstone
```

The same operations exist over HTTP (admin principal required):

```bash
PUT    /api/secrets/{repo}/{branch}/{name}          {"value": "..."}
POST   /api/secrets/{repo}/{branch}/rotate/{name}   {"value": "..."}
GET    /api/secrets/{repo}/{branch}
GET    /api/secrets/{repo}/{branch}/{name}
DELETE /api/secrets/{repo}/{branch}/{name}
```

A write returns the name, the new version and an unpinned reference:

```json
{"name":"stripe/api_key","version":2,"reference":"secret://stripe/api_key"}
```

No route, SQL function or CLI command returns a plaintext value. Listing and
`show` return metadata only: version, key id, timestamps, author and, for
node-owned secrets, `owner_node` and `owner_field`.

## Versions and rotation

Every write appends a version. A reference without `@version` resolves to the
newest version at read time; `secret://stripe/api_key@1` stays pinned to
version 1. Node fields are always written pinned, so reading an older node
revision gives you the credential that revision held.

Rotation is therefore an append: set the new value, let consumers pick it up,
and anything pinned to the old version keeps working until it is rewritten.

## Branches

The secret store is branch-scoped. Forking a branch copies its secrets, so a
feature branch can hold test credentials while `main` keeps the real ones.
Copying nodes between branches carries the secret versions those nodes
reference along with them.

## Encryption and keys

Values are sealed with AES-256-GCM under a master keyring that lives outside
the database, in the server's environment:

```bash
RAISIN_MASTER_KEYS="1:<64 hex chars>,2:<64 hex chars>"
RAISIN_MASTER_KEY_ACTIVE=2          # the key id that seals new writes
RAISIN_CRYPTO_EMIT_V2=1             # required for the node secret store
```

`RAISIN_MASTER_KEY` (a single 64-hex key) is still accepted and is loaded as
key id 0. With more than one key listed, `RAISIN_MASTER_KEY_ACTIVE` is
required. A server with no key configured fails at startup rather than falling
back to a built-in key.

The v2 envelope records which key sealed each value and binds the ciphertext
to its tenant, repository and field, so bytes copied out of one place do not
decrypt somewhere else. Older v1 blobs are always readable, so the setting can
be turned on at any time; on a cluster, enable it once every node runs a
version that reads v2. Node-owned secrets are only ever written in v2 format,
which is why `RAISIN_CRYPTO_EMIT_V2` must be set before encrypted fields are
used. When a value was sealed with a key the keyring no longer holds, the
error names the missing id and the ids available.

The `[secrets]` section of the server config has one switch,
`vaulting_enabled` (default `true`). Turning it off stores declared-encrypted
fields as plaintext.

## In short

- One schema flag turns a property into a managed secret
- Reads return `secret://node/{id}/{field}@{version}`, never the value
- Functions read secrets only through an explicit `secret_policy`
- Every write is a new version, so rotation and history come for free
- Keys live in the environment, not in the data directory
