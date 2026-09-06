---
sidebar_position: 3
---

# Build a connector

A **connector** mounts a new external system into your workspaces. The only code
you write for one is an **adapter**: a single RaisinDB function that translates a
handful of normalized operations into calls against one provider (a REST API, a
mailbox, a device hub…). The sync engine calls it, maps what it returns, and
materializes nodes — you never touch nodes, cursors, or transactions yourself.

This guide covers the fast path — `raisindb create adapter` — then the
`handler(input)` contract, the eight operations, the error codes, and a minimal
adapter you can copy. For the exhaustive tables, see the
**[adapter reference](../../reference/virtual-node-adapters.md)**.

## Scaffold with the CLI

Start from a working skeleton rather than a blank file:

```bash
raisindb create adapter dropbox
```

This writes a `./dropbox-adapter/` package containing a manifest
(`category: integrations`, so the admin console's **Connectors** gallery
discovers it), a README, a stub adapter function with `capabilities` and `list`
already implemented, and a **disabled** `raisin:Integration` template that
carries no client secret. The scaffold is immediately installable and passes a
`capabilities` invocation with no edits — so you can install and **Test
connection** before writing a line of provider code.

The generated layout mirrors the built-in adapters:

| Path | Purpose |
|------|---------|
| `content/functions/adapters/dropbox/index.js` | The adapter function — implement the TODOs here. |
| `content/_raisin__system/integrations/dropbox/.node.yaml` | Disabled connector template; set `auth_url` / `token_url` / `scopes`. |
| `manifest.yaml` | Package metadata (`category: integrations`). |

Then implement, deploy, and install in one step:

```bash
cd dropbox-adapter
raisindb package deploy . --repo <repo> --install
```

The rest of this guide is what goes inside `index.js`.

## The handler contract

An adapter is a `raisin:Function` whose entry point takes **exactly one
argument** — an object with four keys:

```javascript
function handler(input) {
  const { operation, params, credential, mount } = input;

  switch (operation) {
    case "capabilities": return capabilities();
    case "list":         return list(params, credential, mount);
    case "get":          return get(params, credential, mount);
    case "get_content":  return getContent(params, credential);
    case "create":       return create(params, credential);
    case "update":       return update(params, credential);
    case "delete":       return del(params, credential);
    case "get_changes":  return getChanges(params, credential, mount);
    default:
      throw new Error(`unsupported operation: ${operation}`);
  }
}
```

- `operation` — one of the eight operations below.
- `params` — operation-specific arguments.
- `credential` — the decrypted account credential, or `null` if none is needed.
  It contains a live `access_token`, the `account_id`, and the `provider_type`.
  It **never** contains a refresh token.
- `mount` — a read-only snapshot of the mount config (`mount_id`, `remote_root`,
  `mount_path`, `sync_config`). Mutating it does nothing; return results instead.

The usual read-only `raisin.context` global is available. Because the engine
calls the adapter **directly (not via a trigger)**, there is no `context.event`.

## The operations

| Operation | Params | Returns |
|-----------|--------|---------|
| `capabilities` | `{}` | A capabilities object (see below). |
| `list` | `{ folder_id?, cursor?, limit? }` | `{ items: ExternalItem[], next_cursor }` |
| `get` | `{ item_id?, path? }` | `ExternalItem` or `null` |
| `get_content` | `{ item_id, parent_item_id? }` | `{ content \| content_base64, mime_type }` |
| `create` *(write)* | `{ payload, parent_id? }` | `{ external_id, etag? }` |
| `update` *(write)* | `{ item_id, payload, fields?, etag? }` | `{ external_id, etag? }` or `null` |
| `delete` *(write)* | `{ item_id, policy, etag? }` | `{ deleted: true }` |
| `submit` *(write, optional)* | `{ payload, external_id?, idempotency_key }` | `{ external_id, etag? }` |
| `get_changes` | `{ since_token, folder_id? }` | `{ items: Change[], next_token, has_more? }` |

You only need to implement what your provider supports — advertise the rest as
`false` in `capabilities` and the engine won't call them.

- **`capabilities`** is the most important operation. It must be cheap and
  side-effect-free (ideally no network call), because the engine polls it. Its
  `supports_changes` flag decides the sync strategy: `true` uses the fast
  `get_changes` delta path; `false` forces a full listing (`list`) every time.
- **`list`** enumerates one level of children — defaulting to `mount.remote_root`
  when `folder_id` is omitted — and pages via `cursor` / `next_cursor`.
  **Always honor `params.folder_id`.** The engine recurses folders explicitly,
  naming the folder it wants on every call; an adapter that always lists its
  configured root passes every flat-hierarchy test and then silently never
  imports nested content.
- **`get_changes`** returns everything that changed since `since_token` and a
  fresh `next_token`. Make `next_token` durable and resumable: the engine may
  re-run a page after a crash and relies on your results being idempotent.
  Two rules keep the delta loop sane:
  - **Declare `has_more`.** `true` = "this is a mid-enumeration cursor, call me
    again now"; `false` = "caught up — the token is the next run's resume
    point". Do not expect the engine to infer this from the token: some
    providers (Microsoft Graph) mint a *fresh* delta token on every poll of an
    idle feed, so "the token stopped changing" never happens.
  - **Never return `next_token: null` to mean "no changes."** Echo the cursor
    you were given. A null token reads as "no resumable cursor exists at all".
- **`get_content`**, **`create`**, **`update`**, **`delete`** and **`submit`**
  back content sync and the write path, and the engine **calls all of them**.
  They are optional: declare in `capabilities` only what you actually implement,
  because a capability with nothing behind it is how a mount resolves to a mode
  that throws at drain time — after the engine has already claimed its
  candidates. Read
  [the write path](../../reference/virtual-node-adapters.md#the-write-path)
  before you start. Three things surprise people:
  - **The write mode is chosen by the *mount*, not by your adapter.** You declare
    which operations you can perform; a mount decides whether it mirrors, pushes
    only a declared set of mutable fields, or submits commands.
  - **`submit` is at-most-once and is never retried.** A retried send is a
    duplicate email, so an ambiguous failure parks for a human instead of
    retrying.
  - **Your reverse mapping belongs in the mapper, not the adapter** — see below.
  - **`accepts_content` is a separate flag, and files need it.** `mutable_fields`
    describes properties; replacing a file's contents changes no property such a
    list would name. Without `accepts_content` a drive mount pushes on rename and
    on create and **never on an edit** — the new version silently never reaches
    the provider. Declare it if your `create` / `update` should receive bytes.

:::danger Never write nodes from an adapter
Return results and let the engine write. An adapter that writes nodes directly
bypasses the mount lease, the metadata stamp-back that prevents infinite sync
loops, and the rails that stop a runaway delete. Adapters run privileged, so one
that can write nodes can write *any* node in the workspace.
:::

## Error codes

Signal failure by **throwing an `Error` with a `code` property**. The engine
dispatches on `code`:

| `code` | Meaning | Engine behavior |
|--------|---------|-----------------|
| `auth_expired` | The access token was rejected (401/403). | Marks the account for re-auth and **pauses the mount** (`auth_required`) until reconnected. Not retried. |
| `rate_limited` | The provider is throttling (429, and treat 503/504 the same). | Backs off and retries later. The **only** code the write drain requeues. |
| `config_error` | The request itself is wrong (400/404 on reads: bad folder id, missing scope) — the identical retry gets the identical rejection. | Badges the mount **misconfigured** with your message and stands off. Mapping these to "transient" instead is how an adapter hammers a provider on every tick, forever. |
| `cursor_invalid` | The provider expired the delta cursor (Graph: 410 Gone, or 400 with `syncStateNotFound`). | Drops the stored cursor and falls back to a full reconcile **in the same run**. Normal operation, not a fault. |
| `conflict` | Write-through optimistic-concurrency failure (etag mismatch). | Routed through the mount's conflict policy — never retried blindly. |
| *(anything else)* | Transient failure. | **Reads**: retried with backoff; after repeated failures the mount goes `degraded`. **Writes invert this**: an unrecognized error on the drain is *not* retried — a retried send is a duplicate email. |

```javascript
if (resp.status === 401) {
  const e = new Error("access token rejected");
  e.code = "auth_expired";
  throw e;
}
```

:::danger Never swallow an auth error into an empty result
Returning an empty `list` or `get_changes` reads as *"everything was deleted"* —
the reconcile will then remove every node the mount owns. On an auth failure,
**throw `auth_expired`**; never return `{ items: [] }`.
:::

## A minimal working adapter

This read-only adapter mounts a hypothetical JSON API. It implements just the
operations it advertises — `capabilities`, `list`, and `get` — and lets the
engine fall back to a full listing every sync (`supports_changes: false`).

```javascript
const API = "https://api.example.com/v1";

function capabilities() {
  return {
    can_read: true,
    can_write: false,
    can_create_folders: false,
    supports_changes: false,   // no delta API → engine full-lists each sync
    supports_webhooks: false,
    supports_search: false,
    supports_push: false,
    default_ttl: null,
    max_file_size: null,
    // Write path — every one defaults to false/empty, so a read-only adapter
    // can simply omit them. Declare only what you have actually implemented.
    can_create: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    accepts_content: false,   // true if create/update should receive file BYTES
    mutable_fields: [],       // the properties this provider accepts as writes
    move_fields: [],          // which of those relocate the object
  };
}

function toItem(row) {
  return {
    external_id: row.id,          // stable across renames — REQUIRED
    name: row.title,              // REQUIRED
    is_folder: row.kind === "folder", // REQUIRED
    mime_type: row.mime || null,   // omit and the engine guesses from `name`
    size_bytes: row.bytes ?? null,
    parent_id: row.parent || null,
    created_at: row.created,      // ISO 8601
    modified_at: row.updated,     // ISO 8601
    etag: row.version || null,    // stable when unchanged → skip-write
    web_url: row.url || null,
    download_url: null,
    metadata: { source: "example" }, // provider extras, preserved on the node
  };
}

async function list(params, credential, mount) {
  const folder = params.folder_id || mount.remote_root;
  const url = new URL(`${API}/folders/${folder}/children`);
  if (params.cursor) url.searchParams.set("page", params.cursor);

  const resp = await raisin.http.fetch(url.toString(), {
    headers: { Authorization: `Bearer ${credential.access_token}` },
  });
  if (resp.status === 401) {
    const e = new Error("token rejected"); e.code = "auth_expired"; throw e;
  }
  if (!resp.ok) throw new Error(`API ${resp.status}`);

  const body = resp.body;
  return {
    items: (body.items || []).map(toItem),
    next_cursor: body.next_page || null,
  };
}

async function get(params, credential) {
  const resp = await raisin.http.fetch(`${API}/items/${params.item_id}`, {
    headers: { Authorization: `Bearer ${credential.access_token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return toItem(resp.body);
}

function handler(input) {
  const { operation, params, credential, mount } = input;
  switch (operation) {
    case "capabilities": return capabilities();
    case "list":         return list(params, credential, mount);
    case "get":          return get(params, credential);
    default:
      throw new Error(`unsupported operation: ${operation}`);
  }
}
```

That is a complete, mountable adapter. Package it (see below), create an
integration and a mount pointing at `/adapters/<your-adapter>`, and the engine
does the rest.

## Performance rules

The adapter runs in the sync hot loop, so a slow adapter slows every mount.

:::warning Do not call other functions per item
**Never call `raisin.functions.call` inside `list`, `get_changes`, or a mapping
function.** A nested function call blocks a worker for up to five minutes per
level, with no depth guard, and can stall all sync jobs. Do the provider I/O and
normalization inline. If you truly need cross-function orchestration, do it once
per sync run — never once per item.
:::

- Keep `etag` stable when nothing changed, so the engine skips re-writes and
  avoids spurious trigger storms.
- Respect `params.limit` and page efficiently.
- Restrict outbound requests to your provider's hosts via the function's
  `network_policy`.

## Packaging and mapping

- Ship the adapter as a package with `category: integrations` so the admin
  console's Integrations gallery discovers it. See
  **[Creating packages](../packages/creating-packages.md)**.
- By default the engine maps items with a built-in rule: folders →
  `raisin:Folder`, everything else → a lightweight metadata node. To control
  node types yourself, add a **mapping function** and set it as the mount's
  `mapping_function`. A mapping function receives one item and returns
  `{ node_type, name?, properties }`, or `null` to skip the item. The same
  performance rules apply — it must be pure and fast, and must not call other
  functions.
- Under the [write path](../../reference/virtual-node-adapters.md#the-write-path)
  a mapper carries **both directions**, dispatching on `input.operation`:
  `to_node` (the call above — still the default when no operation is given, so
  existing mappers keep working) and `to_external`, which turns a node back into a
  provider payload. Put the reverse translation **here, not in your adapter**: the
  mapper is what a user swaps to customize node shape, so a reverse mapping living
  in the adapter would silently write the wrong fields the moment someone does
  that. A mapper without `to_external` makes its mount read-only, which the
  console reports rather than failing quietly.
- **The engine learns that from a third operation, `mapper_capabilities`.** Once
  per run it calls your mapper with `{ operation: "mapper_capabilities" }` and
  looks for exactly `{ to_external: true }`. Anything else — a missing operation,
  a falsy value, a throw — resolves the mount to read-only and records the reason
  in `state.writeback_last_error`. It is a separate operation rather than a
  probe call with a null node, so your `to_external` never has to tolerate being
  handed nothing. A mount with **no** `mapping_function` at all is read-only by
  construction: the built-in mapping is lossy, so inverting it would be guessing.

## The write path in practice

The read path is the one you get for free; the write path is where adapters go
wrong quietly. Four things to build against.

**The mount picks the mode, you declare the operations.** `state_only` pushes an
allow-list of properties; `mirror` adds creates and deletes behind blast-radius
rails; `submit` treats the node as a command to perform once. A mode your
capabilities cannot serve is refused at drain time — after the engine has already
claimed the candidates — so declare honestly and declare narrowly.

**Divergence is a value comparison, not a dirty flag.** The engine stamps
`__pushed_state` on each node with the watched fields as last pushed, and
nominates anything that no longer matches. Two consequences: your `to_external`
receives **only the fields that actually diverged**, possibly one of them, and it
must return a valid payload for *every* single-field subset — returning null for
one makes that push a no-op, and the node is re-nominated every drain forever
with no request going out and no error surfaced. And your `update` must return a
receipt whose `etag` is exactly what the next read will compute for the
post-write state; a null etag means the next read sees a mismatch, rebuilds the
node from the remote item, and reverts the local edit.

**Bytes are a second kind of divergence.** See `accepts_content` above. Without
it, a file mount never pushes an edit.

**A locally-created node is not yours unless the mount says so.** This is the
limitation people hit first, so it is worth stating plainly:

:::warning Uploading a file into a mounted folder does not send it to the provider
Every write path except one starts from the mount's index, and that index holds
only the nodes the mount **materialized** — the ones carrying `__mount_id` and
`__external_id`. A file uploaded into a mounted folder in Studio has neither. It
renders under the mount path, it is a real asset with real bytes, and the mount
is structurally unaware of it. Neither a sync nor a remap adopts it: both walk
the *provider's* items, so neither can discover a node the provider has never
heard of.

The one exception is a mount that opted in explicitly: `mode: mirror` plus the
node's type named in `write_config.create_node_types` (empty by default) plus an
adapter declaring `can_create`. Only then does the drain scan the mount path for
unadopted nodes and create them at the provider.

The default is deliberate rather than an oversight — an ordinary content node
under a mount path is ambiguous, and guessing wrong uploads private content to a
third party, which fixing the config afterwards does not undo.
:::

## Changing your mapper later

An ordinary sync skips any item whose `etag` is unchanged, and that skip happens
**before** the mapper runs. So a change to your mapper — a new node type, a
renamed property, a different folder layout — is invisible to everything already
synced, however many times you sync. Nothing reports this; the mount just keeps
looking healthy while serving the old shape.

The migration is a **remap**:

```bash
POST /api/integrations/{repo}/mounts/{mount_id}/sync   { "mode": "remap" }
```

It re-applies the current mapper and path template to every item, ignoring
etags, and moves nodes if the template now resolves a different path. It writes a
revision per item and re-fires downstream triggers, so it is an operator action,
not something to schedule. Engine-derived properties — the thumbnail, the
`__extract_*` extraction artifacts — are carried across it, because your mapper
cannot know them.

## Test the connection before you mount

Once the connector is installed and an account is connected, use **Test
connection** (admin console → your connector, or `POST
/api/integrations/{repo}/test`) to verify the wiring without creating a mount.
The test runs synchronously and bounded — a 30-second ceiling, a 10-item probe —
and does three things:

1. **Loads and runs the adapter.** If the `adapter_function` can't be resolved,
   you get `adapter_not_found` — check the integration's `adapter_function` path.
2. **Checks auth.** With an `account_id` it decrypts the account's token and
   hands the adapter a credential; the response's `auth` is `valid`, `expired`,
   `missing`, or `not_required`. `expired` means the adapter threw `auth_expired`
   — reconnect the account.
3. **Probes listing.** It calls `capabilities`, then a small `list`. A successful
   `list` (`ok: true`) is the real connectivity signal; the response's `probe`
   shows `items_seen` and a `sample` of item **names** (never URLs or tokens).

On success the resolved **capabilities are cached onto the connector node**, so
the admin UI can show what the provider supports without re-testing. Reading the
report when debugging:

- `ok: false` with an `error.code` of `timeout` → the adapter hung; check for a
  slow or blocking provider call.
- `capabilities` present but `probe` absent → `capabilities` succeeded but `list`
  failed; usually a wrong `remote_root` or a provider-side permission problem.
- A failed test still returns HTTP `200` — it is a diagnostic result, not a
  server error. Only the `ok` flag tells you pass/fail.

## Trigger a sync on demand

Mounts sync on their interval, but you can force a run — the pattern for
webhook-driven refresh. From a function (for example, a webhook handler):

```javascript
raisin.integrations.sync_now(mountId);        // full/delta per the mount config
// → { job_id: "…" | null, status: "queued" | "already_running" }
```

`status: "already_running"` means a sync for that mount is in flight and your
call was a no-op — safe to call on every webhook. The same is available over
HTTP: `POST /api/integrations/{repo}/mounts/{mount_id}/sync`.

## Next steps

- **[Adapter reference](../../reference/virtual-node-adapters.md)** — full field
  tables for `ExternalItem`, `Change`, `Capabilities`, reserved metadata, and
  mount configuration.
- **[Sync a Google Drive folder](sync-google-drive.md)** — a worked example of a
  full-featured adapter in action.
- **[Sync a mailbox](sync-a-mailbox.md)** — the ephemeral, agent-driven pattern.
