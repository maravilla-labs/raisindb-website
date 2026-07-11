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
| `operation` | string | One of the eight operations below. |
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
| `get_content` | `{ item_id }` | `{ content, mime_type }` |
| `create` | `{ parent_id, name, is_folder, content?, mime_type? }` | `ExternalItem` |
| `update` | `{ item_id, name?, content?, mime_type?, etag? }` | `ExternalItem` |
| `delete` | `{ item_id }` | `{ deleted: true }` |
| `get_changes` | `{ since_token: string \| null, folder_id? }` | `{ items: Change[], next_token: string }` |

Notes:

- **`capabilities`** must be cheap and side-effect-free; it is polled.
- **`list`** returns one level of children; omit `folder_id` to list
  `mount.remote_root`. Return `next_cursor: null` on the last page.
- **`update`** with an `etag` that no longer matches must throw `conflict`.
- **`delete`** is idempotent — deleting an absent item still returns
  `{ deleted: true }`.
- **`get_changes`** is the delta fast path. `next_token` must be durable and
  resumable. If the provider has no delta API, advertise `supports_changes:
  false` and you need not implement it — the engine full-lists instead.

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
- **Write-through is not implemented.** The engine is read/reconcile-only and the
  admin console hides the write-back controls — it is not a toggle. `write_config`
  and the adapter's `create`/`update`/`delete` are inert; `remote_wins` is the
  only conflict strategy and is relevant only once write-through exists.
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
