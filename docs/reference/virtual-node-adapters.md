---
sidebar_position: 3
---

# Virtual Node Adapters

Reference for the virtual-node adapter contract and the configuration nodes that
drive it. For concepts see **[Virtual Nodes](../concepts/virtual-nodes.md)**; for
walkthroughs see **[Sync a Google Drive
folder](../guides/integrations/sync-google-drive.md)** and **[Build a custom
adapter](../guides/integrations/build-a-custom-adapter.md)**.

An **adapter** is a `raisin:Function` that translates one normalized operation
into calls against one external system. The **sync engine** invokes it directly,
decrypts the account credential immediately before the call, and materializes the
results as nodes under a mount path.

## Handler input

The entry point receives one argument, an object with four keys:

| Key | Type | Notes |
|-----|------|-------|
| `operation` | string | One of the operations below. |
| `params` | object | Operation-specific arguments. |
| `credential` | object \| null | Decrypted account credential; `null` when none is needed. |
| `mount` | object | Read-only mount snapshot. |

### `credential`

```javascript
{
  access_token: "…",          // current, valid access token
  account_id: "…",            // connected account id it came from
  provider_type: "google-drive"
}
```

There is **no `refresh_token` field**. Refresh tokens are stored only as
AES-256-GCM ciphertext and used exclusively by the engine's token-refresh logic;
they never enter the function sandbox. If `access_token` is rejected, throw
`auth_expired` — do not try to refresh it yourself.

### `mount`

```javascript
{
  mount_id:    "…",              // owning mount node id
  remote_root: "…",              // provider-side root (folder id, mailbox, …)
  mount_path:  "/documents/shared",
  sync_config: { /* … */ }
}
```

The snapshot is read-only; mutating it has no effect.

## Operations

| Operation | Params | Returns |
|-----------|--------|---------|
| `capabilities` | `{}` | `Capabilities` |
| `list` | `{ folder_id?, cursor?, limit? }` | `{ items: ExternalItem[], next_cursor: string \| null }` |
| `get` | `{ item_id?, path? }` | `ExternalItem \| null` |
| `get_content` | `{ item_id, parent_item_id?, mime_type? }` | `{ content \| content_base64, mime_type }` |
| `create` *(write)* | `{ payload, parent_id? }` | `{ external_id, etag? }` |
| `update` *(write)* | `{ item_id, payload, fields?, etag? }` | `{ external_id, etag? } \| null` |
| `delete` *(write)* | `{ item_id, policy, etag? }` | `{ deleted: true }` |
| `submit` *(write, optional)* | `{ payload, external_id?, idempotency_key }` | `{ external_id, etag?, provider_id? }` |
| `get_changes` | `{ since_token: string \| null, folder_id? }` | `{ items: Change[], next_token: string }` |

Notes:

- **`capabilities`** must be cheap and side-effect-free; it is polled.
- **`list`** returns one level of children; omit `folder_id` to list
  `mount.remote_root`. Return `next_cursor: null` on the last page.
- **`create`** receives the whole object — a create has nothing to patch — and
  **must return the id it created**. An adapter that answers without an
  `external_id` leaves an orphan: the engine refuses to adopt the node, because a
  node stamped with an id no remote object has would never converge and the next
  reconcile would create a *second* copy at the provider.
- **`update`** receives `payload` already narrowed to `fields`, the mount's
  allow-list. Forward `payload` **verbatim** — never rebuild it from `fields`,
  which are *node* property names; the mapper is the only authorized translator
  between the two vocabularies. An `etag` that no longer matches must throw
  `conflict`. Returning `null` means *gone*: the engine settles the node and
  waits for the delta to re-import it, instead of retrying a doomed write
  forever (provider ids are not always stable — a moved Graph message gets a
  new one).
- **`delete`** carries the mount's resolved `policy` — `"trash"` or `"purge"`,
  never `"detach"` (detaching means not calling you at all). Serve them
  differently or refuse the one you cannot serve; treating them the same makes
  `supports_trash` a lie and turns a recoverable mistake into a permanent one.
  It is idempotent: deleting an absent item still returns `{ deleted: true }`,
  because a 404 already satisfies a delete's desired end state.
- **`get_changes`** is the delta fast path. `next_token` must be durable and
  resumable. If the provider has no delta API, advertise `supports_changes:
  false` and you need not implement it — the engine full-lists instead.
- **`get_content`** is called on demand, never during a sync. `parent_item_id`
  is present when the item is not addressable on its own (a mail attachment
  lives at `/messages/{message}/attachments/{attachment}`); adapters whose items
  *are* self-addressing ignore it.

## `ExternalItem`

The normalized representation of one external object. All timestamps are ISO
8601 strings; all ids are provider-native strings.

| Field | Type | Notes |
|-------|------|-------|
| `external_id` | string | **Required.** Stable across renames/moves — the upsert key. |
| `name` | string | **Required.** Display name. |
| `is_folder` | boolean | **Required.** Drives the default mapping. |
| `mime_type` | string \| null | |
| `size_bytes` | number \| null | |
| `parent_id` | string \| null | Provider parent id (`null` at root). |
| `created_at` | string \| null | ISO 8601. |
| `modified_at` | string \| null | ISO 8601. |
| `etag` | string \| null | Change token; a stable value lets the engine skip re-writing. |
| `web_url` | string \| null | Human-openable link. |
| `download_url` | string \| null | Direct content link. |
| `metadata` | object \| null | Provider passthrough; preserved on the node. |

## `Change`

One entry in a `get_changes` feed.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"created" \| "updated" \| "deleted"` | For `deleted`, only `item.external_id` is required. |
| `item` | `ExternalItem` | The affected item (a best-effort tombstone for deletes). |
| `relative_path` | string | Path of the item relative to the mount root. |

## `Capabilities`

Returned by the `capabilities` operation; drives which operations the engine
calls and how it syncs.

| Field | Type | Notes |
|-------|------|-------|
| `can_read` | boolean | |
| `can_write` | boolean | |
| `can_create_folders` | boolean | |
| `supports_changes` | boolean | `true` = real delta API; `false` = full-listing diff each sync. |
| `supports_webhooks` | boolean | |
| `supports_search` | boolean | |
| `supports_push` | boolean | Event-driven / push providers. |
| `default_ttl` | number \| null | Suggested TTL (seconds) for ephemeral nodes. |
| `max_file_size` | number \| null | Bytes; the engine skips larger items. |

Write-path fields (all optional; every one defaults to `false`/empty, so an
adapter that omits them is correctly treated as read-only):

| Field | Type | Notes |
|-------|------|-------|
| `can_create` / `can_update` / `can_delete` / `can_submit` | boolean | Which write operations you actually implement. |
| `mutable_fields` | string[] | The `state_only` allow-list — which node properties this provider accepts as writes. |
| `default_delete_policy` | `"detach" \| "trash" \| "purge" \| null` | Your domain's recommended default. Mail usually wants `trash`; files and calendars usually want `detach`. |
| `move_fields` | string[] | Which of `mutable_fields` express the object's LOCATION (folder, parent, label set). A move is an `update` carrying one of these, so this is what makes `move_policy` mean anything — the engine is domain-blind and cannot tell that `folder` relocates a message while `unread` does not. A name here that is not in `mutable_fields` is inert. |
| `default_move_policy` | `"push" \| "detach" \| "reject" \| null` | |
| `supports_trash` | boolean | `delete` can soft-delete rather than purge. |
| `supports_idempotency_key` | boolean | `submit` can forward a provider idempotency key. |

**`mutable_fields` is how you explain what "writable" means for your provider.**
The engine has no domain knowledge — it does not know that a mail body is
immutable while its read flag is not. Listing `["unread", "categories", "folder"]`
tells it exactly which property edits you accept; an edit to anything else is
rejected with a clear error instead of being silently dropped. Declare the
narrowest honest set.

## Error codes

Throw an `Error` with a `code` property:

| `code` | Meaning | Engine behavior |
|--------|---------|-----------------|
| `auth_expired` | Access token rejected / account needs re-auth. | Sets mount status `auth_required` and **pauses** the mount until reconnected. Not retried. |
| `rate_limited` | Provider throttling. | Exponential backoff; retried later. |
| `conflict` | Write-through etag mismatch. | Surfaced to the writer; with `remote_wins` the local edit is dropped and a warning is emitted. |
| *(anything else)* | Transient failure. | Retry with backoff; after the failure threshold the mount goes `degraded`. |

Never return an empty result to signal an auth failure — an empty `list` /
`get_changes` reads as "everything was deleted" and triggers a destructive
reconcile.

## Default mapping

If a mount sets no `mapping_function`, the engine applies a built-in mapping — no
function call, minimal overhead:

| Item | Node type | Properties |
|------|-----------|------------|
| `is_folder === true` | `raisin:Folder` | name only |
| everything else | `raisin:Node` | `title`, plus a `meta` object carrying `mime_type`, `size`, `web_url`, `download_url`, and any `metadata` passthrough |

:::note Metadata node, not asset
The default file mapping produces a lightweight **`raisin:Node`** with a `meta`
object — not a `raisin:Asset`. An asset requires real binary content, which a
link-only virtual node does not have. To materialize a different node type (for
example a typed `raisin:Asset` with content sync), supply a custom
`mapping_function`.
:::

### Custom mapping function

A mapping function is called once per item with:

```javascript
{ external_item: ExternalItem, mount: { mount_id, mount_path, sync_config } }
```

and returns the node to materialize, or `null` to skip the item:

```javascript
{
  node_type: "raisin:Node",       // any allowed node type
  name: "optional override",       // omit to derive from the item
  properties: { title: "…", /* … */ }
}
```

It must be pure and fast, and must **not** call `raisin.functions.call` (it runs
in the sync hot loop). The engine always writes the reserved metadata (below) on
top of whatever the mapping returns; you cannot suppress or set those yourself.

### Both directions, one function

Under the [write path](#the-write-path) a mapper gains a second direction and
dispatches on `input.operation`:

```javascript
function handler(input) {
  switch (input.operation) {
    case "to_node":     // { external_item, mount }  — the call above
      // -> { node_type, name?, properties } | null
      return toNode(input.external_item, input.mount);

    case "to_external": // { node, mount, fields?, intent }
      // -> { payload, external_id? } | null
      return toExternal(input.node, input.mount, input.fields, input.intent);
  }
}
```

Input with no `operation` still means `to_node`, so existing mappers keep working
untouched.

**Put the reverse translation here, not in your adapter.** The mapper is
deliberately separate from the adapter so node shape can be customized without
forking the adapter — which means a reverse mapping hardcoded in the adapter would
silently write the wrong fields the moment someone points the mount at a custom
mapper. Keeping both directions in one file gives them one author and one place to
stay consistent.

- When `fields` is present, emit **only** those keys — the engine is asking for a
  patch, not a whole object.
- **`intent`** is `"create"`, `"update"` or `"submit"`. Ignore it and your mapper
  behaves exactly as before, but you cannot infer it: `fields` is empty for a
  mirror update *as well as* for a create. The difference is not cosmetic. A
  calendar exception, for instance, is perfectly updatable — it has its own
  provider id — and impossible to create from nothing, because the provider mints
  one only by diverging an occurrence of a live series; POSTing for one produces
  a duplicate meeting the series still overlaps.
- Return `null` from `to_external` to declare a node not writable; the write parks
  with a stated reason instead of pushing a guess. Return `null` rather than an
  empty payload when nothing is writable — an empty PATCH still bumps the
  provider's change token, which invalidates every stored etag and makes the next
  delta re-deliver the object for no reason.
- A mapper without `to_external` makes its mount **read-only**, reported in the
  mount's `writeback_supported` state so the console can explain why. Writability
  belongs to the *mount* — adapter and mapper together.
- Keep `to_external` pure and I/O-free, like `to_node`.
- The built-in default mapping has no reverse: a mount with no `mapping_function`
  is read-only by construction, because the default mapping is lossy and inverting
  it would be guessing.

## Reserved metadata properties

The engine stamps these on **every** synced node. They are plain properties, so
ordinary SQL works against them.

| Property | Type | Meaning |
|----------|------|---------|
| `__virtual` | boolean | Marks a mount-managed node. |
| `__mount_id` | string | Owning mount node id. |
| `__external_id` | string | Provider item id — the upsert-match key. |
| `__etag` | string | Provider change token at last sync (drives skip-write). |
| `__synced_at` | string | ISO 8601 timestamp of the last sync write. |

```sql
SELECT * FROM 'default' WHERE properties->>'__mount_id'::String = $1
SELECT * FROM 'default' WHERE properties->>'__external_id'::String = $2
```

If you map to a custom node type, declare a property index on `__mount_id` and
`__external_id` for that type, or upsert-matching and mount-scoped queries
degrade to full scans.

## `raisin:VirtualMount` configuration

A mount lives in the `raisin:system` workspace and points an integration account
at a workspace path.

| Property | Required | Notes |
|----------|----------|-------|
| `integration_ref` | yes | Path or id of the `raisin:Integration` to use. |
| `target_workspace` | yes | Workspace the nodes are materialized into. |
| `target_branch` | yes | Branch the synced nodes are written to. Defaults to `main`. The mount **config** always lives on the repo's config (default) branch — this only selects where materialized nodes land. A forked copy of the mount is inert; see [branch model](#branch-model). |
| `mount_path` | yes | Path prefix inside the target workspace (any depth). |
| `account_ref` | no | Which connected account to use; defaults to the first. |
| `remote_root` | no | Provider-side root (folder id, mailbox, …). |
| `adapter_function` | no | Overrides the integration's adapter. |
| `mapping_function` | no | Custom per-item mapping; omit for the built-in default. |
| `enabled` | no | Defaults to `true`. |
| `sync_config` | no | Sync schedule and filters (below). |
| `write_config` | no | **Inert in this release.** `{ writeback, conflict }`. The engine has no write-through path; a mount requesting `write_through` records `writeback_supported: false` in `state`. |
| `state` | — | **Engine-managed.** Do not edit by hand. |

### Branch model

The periodic scanner reads mounts **only from the repository's config (default)
branch**. `target_branch` selects where a mount's virtual nodes are materialized,
not where the mount is scanned from. Therefore:

- Creating or forking another branch does **not** start a second sync — a forked
  copy of a mount node is never scanned, so it never fires.
- To land synced nodes on a non-default branch, set `target_branch`; the mount
  node itself still lives on the config branch.

### `sync_config`

| Field | Default | Notes |
|-------|---------|-------|
| `mode` | `"poll"` | `"poll" \| "webhook" \| "hybrid"`. `webhook` mounts are skipped by the periodic driver. |
| `interval_seconds` | `300` | Poll interval; backs off on repeated failure. |
| `max_items_per_sync` | `500` | Per-sync item cap. |
| `include_patterns` | `[]` | Globs; empty means include everything. |
| `exclude_patterns` | `[]` | Globs; exclude wins over include. |
| `ephemeral` | `false` | Auto-delete synced nodes older than `ttl_seconds`. |
| `ttl_seconds` | — | Required for ephemeral mounts. |

### `state` (engine-managed)

Read-only from your perspective; the engine writes it after each sync.

| Field | Notes |
|-------|-------|
| `last_sync_token` | Delta cursor persisted after a successful sync. |
| `last_sync_at` | Unix epoch seconds of the last successful sync. |
| `last_error` | Last failure message, if any. |
| `consecutive_failures` | Drives interval backoff and the `degraded` transition. |
| `status` | `"ok" \| "syncing" \| "auth_required" \| "degraded" \| "misconfigured"`. |
| `writeback_supported` | `false` when the mount requests `write_through` but the engine cannot honour it (always, in this release). The UI reads it to explain the limitation. |
| `last_fencing_token` | Lease token guarding against stale writes in a cluster. |

## `raisin:Integration` configuration

Provider-level configuration, usually one per repository in `raisin:system`.

| Property | Notes |
|----------|-------|
| `provider_type` | **Required.** E.g. `google-drive`. |
| `adapter_function` | Default adapter path for mounts using this integration. |
| `enabled` | Disabled templates are ignored until you complete them. |
| `oauth_config` | `auth_url`, `token_url`, `scopes`, `redirect_uri`, `access_type`, `prompt`. |
| `client_id` | OAuth client id (added when you connect). |
| `client_secret_encrypted` | AES-256-GCM ciphertext of the client secret — never stored in cleartext. |
| `connected_accounts` | Array of connected accounts, each with an `id`, optional `subject`/`expires_at`, and encrypted tokens. |

## Operational notes

- **`RAISIN_MASTER_KEY` must be set and backed up.** Connected-account tokens are
  encrypted with it; the engine decrypts them just before each adapter call. A
  missing or lost key means no mount can authenticate, and existing ciphertext
  becomes unrecoverable. (For compatibility, the embedding master key is accepted
  as a fallback.)
- **Multi-node deployments need the Redis locks backend.** The engine takes a
  per-mount lease so two nodes never sync the same mount concurrently. On a
  single node the in-process lock suffices; in a replicated cluster without
  Redis locks, sync is not cluster-safe and the engine logs a warning.
- **v1 syncs metadata and links, not file bytes.** `get_content` exists in the
  contract but the engine never calls it.
- **Writeback is off until a mount asks for it.** `write_config.mode` defaults to
  `off`, and a mount only resolves to a write mode when the adapter declares the
  operations that mode needs and the mapper implements `to_external`. The console
  reports which of the two is missing rather than showing a control that does
  nothing.
- **The first sync of a large folder emits one node event per item.** A full
  reconcile writes every item, and each write fires a trigger. Expect an initial
  burst; scope triggers by path prefix and operation.
- **Sync writes run under the `virtual-mount-sync` system actor.** Filter on it
  in write-back triggers to avoid feedback loops.

## Test connection

`POST /api/integrations/{repo}/test` (admin-only) runs a synchronous, bounded
diagnostic against a connector's adapter: `capabilities`, then a 10-item `list`
probe, under a 30-second ceiling. On success it caches the resolved capabilities
onto the `raisin:Integration` node.

Request:

| Field | Required | Notes |
|-------|----------|-------|
| `integration_path` | yes | Path of the `raisin:Integration` to test. |
| `account_id` | no | Connected account to test with; omitted → `credential: null`, `auth: not_required`. |
| `remote_root` | no | Folder to probe; defaults to the adapter's root. |

Response (always HTTP `200` — a failed connection is a diagnostic result, not a
server error; read the `ok` flag):

| Field | Notes |
|-------|-------|
| `ok` | Whether the `list` probe succeeded. |
| `latency_ms` | Wall-clock duration. |
| `auth` | `"valid" \| "expired" \| "missing" \| "not_required"`. |
| `capabilities` | Parsed `Capabilities`, or a conservative read-only fallback. |
| `probe` | `{ items_seen, sample }` — item **names** only, never URLs or tokens. |
| `error` | `{ code, message }` on failure — e.g. `adapter_not_found`, `timeout`, `missing_credential`. |

No `access_token`, `refresh_token`, or `client_secret` ever appears in the
response or logs.

## On-demand sync

Force a sync outside the poll interval — the webhook-driven-refresh primitive.

- **Function binding:** `raisin.integrations.sync_now(mountId, mode?)` →
  `{ job_id: string | null, status: "queued" | "already_running" }`. Available in
  both the QuickJS/JS and Starlark/Python runtimes. `already_running` means a
  sync for that mount is in flight and the call was a safe no-op.
- **HTTP:** `POST /api/integrations/{repo}/mounts/{mount_id}/sync`.

A `webhook`-mode mount (`sync_config.mode: "webhook"`) is skipped by the periodic
driver entirely and is expected to be refreshed this way.

## The write path

The engine calls `create`, `update`, `delete`, `submit` and `get_content`. A mount
resolves its write mode from your `capabilities` and its mapper together, so an
adapter that declares nothing is correctly treated as read-only. Concept:
[Virtual Nodes → The write path](../concepts/virtual-nodes.md#the-write-path).

:::warning A write scope is not the scope you connected with
Every shipped connector requests read-only OAuth scopes. Writing needs more —
`Mail.ReadWrite` / `Calendars.ReadWrite` for Microsoft 365,
`https://www.googleapis.com/auth/calendar.events` for Google Calendar — and
widening it takes three steps, none skippable: grant the permission at the
provider, add the scope to the **live** `raisin:Integration` node under
`/integrations` (the `/connectors` template is package-owned and is overwritten
on package update), and **reconnect each account**. Neither Microsoft nor Google
issues a widened scope on a token refresh; only on fresh consent. Until then
every write returns 403, which the shipped adapters report as a `config_error`
naming the missing scope rather than as an expired token — because sending an
operator to reconnect an account cannot fix a scope that was never requested.
:::

### What the engine owns, what you own

The write path is deliberately thin and domain-blind. The engine knows "call
`update` with these fields". It does **not** know what a calendar is, that a mail
body is immutable, or what an outbox means. All of that is your package explaining
itself — through `capabilities`, your node types, and your docs.

| Layer | Owns |
|-------|------|
| **Engine** | change detection, ordering, the mount lease, write lifecycle, the already-pushed check, metadata stamp-back, safety rails, at-most-once semantics, error classification |
| **Your adapter** | the remote API calls, node↔provider translation, declared capabilities, the optional conflict resolver |
| **Your conventions** | which node types, which collections, outbox layout, mount templates |

**Adapters never write nodes.** Take a request, hit the provider, return a result;
the engine performs every local write. This is not a style preference — delegating
writes would lose lease serialization (a concurrent sync clobbers your write), the
metadata stamp-back that prevents infinite sync loops, the destructive-operation
rails, and the sandbox boundary. Adapters run privileged with a system auth
context, so an adapter that could write nodes could write *any* node.

> **You decide what the remote becomes and perform the remote call.
> The engine decides what the node becomes and performs the local write.**

### Write modes belong to the mount

The same adapter serves different modes on different mounts. You declare which
operations you can perform; the mount decides which apply where.

| mode | the node is… | a local change means | typical use |
|------|--------------|----------------------|-------------|
| `mirror` | the remote object | create / update / delete propagate | calendar events, files |
| `state_only` | an immutable record with mutable state | only `mutable_fields` propagate; other edits are rejected | mail — body immutable, read/flags/folder are not |
| `submit` | a **command** | creating it and queueing it performs the action once | send / reply / forward, RSVP |

`submit` is how immutable resources become writable coherently. An email cannot be
edited, so its write path is a *sending* path — which belongs in a separate mount
whose members are intents rather than mirrors:

```
/mail/inbox    state_only   raisin:Mail
/mail/sent     read-only    raisin:Mail          ← canonical sent message
/mail/outbox   submit       raisin:OutboundMail  ← commands
```

Reply and forward then need no special casing: the outbox node names the action
and the provider's own message id. The shape generalizes to any connector — a chat
outbox, a refund queue, an order submission mount are all `submit` collections.

### `submit` is at-most-once — never retried

`submit` causes a side effect the provider cannot take back. A retried send is a
duplicate email; a retried charge is a duplicate charge. So the engine treats it
unlike every other operation:

- The command is durably marked *sending* **before** the call, turning a crash
  mid-flight into a bounded ambiguity rather than an unbounded one.
- Success → *sent*, with `external_id` / `etag` stamped back.
- `rate_limited` → requeued. **The only error that requeues**, because it is the
  only one proving no side effect occurred.
- `auth_expired`, `config_error`, `conflict` → *failed*. Definitive pre-effect
  rejections.
- **Anything else, including a timeout, parks at *unknown* and is never retried
  automatically.** Only a human moves it back.

This inverts the usual default: for reads an unrecognized error is transient and
retried; for `submit` an unrecognized error is *ambiguous* and must not be. Throw
precise codes.

If your provider accepts an idempotency key, declare `supports_idempotency_key`
and forward the engine's `idempotency_key` — that is what turns an ambiguous case
into a safely resolvable one instead of a parked one.

### Delete and move are policy

Neither is fixed behaviour; the mount resolves them from your declared defaults.

| `delete_policy` | Effect |
|-----------------|--------|
| `detach` | the node is removed locally, the remote untouched. **A later full reconcile re-imports it** — there is no suppression list. Say so in your docs. |
| `trash` | the remote is soft-deleted (provider trash). `delete` is called with `mode: "trash"`. |
| `purge` | the remote is hard-deleted. Never a default. |

`move_policy` is `push`, `detach`, or `reject`. **There is no `move` operation** —
a move is an `update` carrying the new parent/folder field, so a provider that
reparents through its normal update call needs no extra code.

### Conflict

Writes carry the node's last-known provider etag. If it no longer matches, throw
`conflict` rather than overwriting — that is the signal the mount's conflict
policy acts on (`remote_wins` by default, or `local_wins`, or park for a human).

A package may also ship a **conflict resolver function**, referenced by the mount
as `resolver_function`. It is an ordinary function, invoked like a mapper, and
receives both sides:

```javascript
// input:  { local, remote, base_etag, field_diff, mount }
// return: { resolution: "local_wins" | "remote_wins" | "merged" | "park", node?, fields? }
```

This is where domain knowledge belongs: only a calendar package knows that two
edits touching different fields of one event can be merged, while two edits to the
same start time cannot. A throw parks the write — it is never silently dropped.

### What the engine guarantees you

So your adapter can stay simple:

- **You are never called concurrently for the same mount.** Writes drain under the
  same lease as sync, ahead of the read phase.
- **You are not called for a write that already landed.** Stored provider metadata
  is compared before every call; no-ops are skipped.
- **You are not called with your own change.** Metadata stamped after your write
  suppresses the echo when the next delta returns the item you just changed.
- **You are not called for a runaway delete.** Proportional blast-radius rails
  stop a mis-scoped bulk statement before it reaches the provider, park the
  pending writes, and surface the block to an operator — without stopping reads.
