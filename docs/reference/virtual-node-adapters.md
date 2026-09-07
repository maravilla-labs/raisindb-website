---
sidebar_position: 3
---

# Virtual Node Adapters

Reference for the adapter contract and for the two configuration nodes that
drive a mount. For the concepts see [Virtual Nodes](../concepts/virtual-nodes.md);
for a walkthrough see [Build a connector](../guides/integrations/build-a-custom-adapter.md)
and the [custom connector tutorial](../tutorials/custom-connector.md).

An **adapter** is a `raisin:Function` in the `functions` workspace. The sync
engine calls it with one operation at a time, decrypts the connection's
credential just before each call, and turns the items it returns into nodes
under the mount path. The adapter never writes nodes itself.

## Handler input

The entry point receives exactly one argument:

```javascript
function handler(input) {
  const { operation, params, credential, mount } = input;
  // ...
}
```

| Key | Type | Notes |
|-----|------|-------|
| `operation` | string | One of the operations below. |
| `params` | object | Operation-specific arguments. |
| `credential` | object or `null` | The decrypted credential of the mount's connection. `null` when the connector has no connection. |
| `mount` | object | A read-only snapshot of the mount. |

### `credential`

What the object contains depends on how the connection authenticates:

| Key | Present for | Value |
|-----|-------------|-------|
| `access_token` | OAuth connections | The current access token. |
| `username` | both | The connection's `username` field, or the provider-verified account subject (the email address) when there is none. |
| *secret fields* | credential connections | Every field the connection stores as a secret, decrypted. The IMAP connector stores `password`. |
| *credential fields* | credential connections | Non-secret fields whose schema carries `meta.credential: true`. |
| `account_id` | both | The connection id. |
| `provider_type` | both | The connector's `provider_type`. |

There is no `refresh_token`. The engine refreshes OAuth tokens itself and only
ever hands the adapter a current access token. When the provider rejects it,
throw `auth_expired` (see [Error codes](#error-codes)).

### `mount`

```javascript
{
  mount_id:    "HlrbuYjrnytco3_1DGQZv",
  remote_root: "INBOX",                 // or null
  mount_path:  "/external/todos",
  sync_config: { mode: "poll", interval_seconds: 300 },  // as authored, verbatim
  api_config:  { /* legacy connector-level settings, if any */ },
  config:      { /* merged view, see below */ }
}
```

`config` merges four layers, later ones winning per key: the connector's
`api_config`, the connector's `config`, the connection's `config`, and the
mount's `sync_config`. New adapters read `config` and ignore the other two.

## Operations

The engine calls these operations. Implement the ones your capabilities
declare and throw for the rest.

| Operation | When it is called | `params` | Returns |
|-----------|-------------------|----------|---------|
| `capabilities` | At the start of every run and by **Test connection**. | `{}` | [`Capabilities`](#capabilities) |
| `list` | Full walk (first sync, `mode: full`, a remap, or `supports_changes: false`). | `{ folder_id, cursor, limit }` | `{ items: ExternalItem[], next_cursor, total? }` |
| `get_changes` | Delta sync, when `supports_changes` is `true`. | `{ since_token, folder_id, baseline_only, events? }` | `{ items: Change[], next_token, has_more? }` |
| `get_content` | On demand, when something opens a mount-owned asset. | `{ item_id, parent_item_id, mime_type }` | `{ content_base64, mime_type }` or `{ content, mime_type }` |
| `update` | Write drain, `state_only` and `mirror` mounts. | `{ item_id, payload, fields, etag }` | `{ external_id?, etag? }` or `null` |
| `create` | Write drain, `mirror` mounts with `create_node_types`. | `{ payload, parent_id, parent_external_id, relative_path, content? }` | `{ external_id, etag? }` |
| `delete` | Write drain, `mirror` mounts. | `{ item_id, policy, etag }` | any value |
| `submit` | Write drain, `submit` mounts. | `{ payload, external_id, idempotency_key }` | `{ external_id?, etag? }` |
| `subscribe` | First run of a `webhook` or `hybrid` mount. | `{ notification_url }` | `{ subscription_id, secret?, expires_at?, resource? }` |
| `renew` | Renewal job, within a day of `expires_at`. | `{ subscription_id, notification_url }` | `{ subscription_id, expires_at? }` |
| `unsubscribe` | When the mount is disabled. | `{ subscription_id }` | ignored |
| `browse` | Admin console pickers, through `POST /api/integrations/{repo}/browse`. | `{ kind, parent_id, query, cursor, limit }` | `{ items: [{ id, name, kind, has_children, hint? }], next_cursor? }` |

Notes on the read operations:

- **`list`** returns one level of children. `folder_id` is `null` for the
  mount root and the `external_id` of a folder item otherwise. The engine
  recurses into every item with `is_folder: true`, so an adapter that ignores
  `folder_id` never imports nested content. Return `next_cursor: null` on the
  last page. `limit` is the mount's `max_items_per_sync`.
- **`get_changes`** returns changes since `since_token` (`null` on the first
  call). `has_more: true` means the token is a mid-enumeration cursor and the
  engine calls again immediately; `false` means the feed is caught up and the
  token is stored for the next run. Without `has_more` the engine stops on the
  first empty page. Return the cursor you were given when nothing changed
  rather than `null`, because a `null` token is treated as "no cursor" and the
  stored cursor is kept. When the stored cursor is no longer valid, throw
  `cursor_invalid` and the engine falls back to a full walk in the same run.
  `baseline_only: true` asks for a cursor at "now" without items; it is sent
  when a completed full walk has no token yet.
- **`get_content`** is never called during a sync. `parent_item_id` is set for
  items that are only addressable through their parent (a mail attachment).
  Return `content_base64` for binary data or `content` for text.
- **`get`** is not called by the engine.

Notes on the write operations:

- **`update`** receives `payload` already narrowed to `fields`, the properties
  that diverged. Forward it as it is. Throw `conflict` when `etag` no longer
  matches. Return `null` when the object no longer exists; the engine records
  the node as gone and waits for the next delta.
- **`create`** must return the `external_id` it created, or the engine cannot
  adopt the node. With `accepts_content: true` a file node's bytes arrive as
  `content: { name, mime_type, size, inline, content_base64? }`. Small files
  are inline; for larger ones `inline` is `false` and the adapter answers
  `{ upload: { url, method?, headers?, chunk_size?, continue_statuses? } }`
  so the engine streams the bytes to that URL itself.
- **`delete`** receives the resolved `policy`, either `"trash"` or `"purge"`.
  A `detach` policy never calls the adapter. Treat a missing object as
  deleted.
- **`submit`** is called at most once per command. Forward `idempotency_key`
  to the provider when you declared `supports_idempotency_key`.

## `ExternalItem`

The normalized shape of one remote object. Every field except `external_id`
may be omitted.

| Field | Type | Notes |
|-------|------|-------|
| `external_id` | string | **Required.** Stable across renames and moves. This is the upsert key. |
| `name` | string | Display name, used as the node name and the path segment. Required for anything but a delete. |
| `is_folder` | boolean | Folders become `raisin:Folder` nodes and are recursed into by `list`. |
| `mime_type` | string | When omitted the engine guesses from the extension of `name`. |
| `size_bytes` | number | |
| `parent_id` | string | Provider parent id. |
| `created_at` | string | ISO 8601. |
| `modified_at` | string | ISO 8601. |
| `etag` | string | Change token. An item whose stored `etag` matches is skipped before the mapper runs, so a stable value is what makes a quiet re-sync write nothing. An item without one is rewritten on every run. |
| `web_url` | string | Link a person can open. |
| `download_url` | string | Direct content link. |
| `metadata` | object | Provider passthrough. Also the source of `path_template` placeholders. `metadata.children_unknown: true` tells the engine to keep already-materialized children when the adapter could not list them. |

## `Change`

One entry in a `get_changes` page.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"created"`, `"updated"` or `"deleted"` | For `deleted` only `item.external_id` is read. |
| `item` | `ExternalItem` | |
| `relative_path` | string | Path relative to the mount root, including parent folders. When empty the item's `name` is used, and the item lands directly under the mount path. |

## `Capabilities`

Returned by the `capabilities` operation. Every field defaults to `false`,
`null` or empty, so an adapter that returns only the flags it needs is treated
as read-only. If the operation throws or returns something that is not an
object, the engine assumes `can_read: true` and nothing else.

| Field | Type | Notes |
|-------|------|-------|
| `can_read` | boolean | |
| `can_write` | boolean | Umbrella flag. Required by every write mode. |
| `can_create_folders` | boolean | |
| `supports_changes` | boolean | `true`: delta sync through `get_changes`. `false`: a full `list` walk on every run. |
| `supports_push` | boolean | The adapter implements `subscribe`, `renew` and `unsubscribe`. This is the flag the engine reads for push. |
| `supports_webhooks` | boolean | Informational. |
| `supports_search` | boolean | Informational. |
| `supports_browse` | boolean | The adapter implements `browse`, so the console can offer a picker. |
| `default_ttl` | number | Suggested `ttl_seconds` for an ephemeral mount. |
| `max_file_size` | number | Bytes. |
| `can_create` | boolean | Implements `create`. |
| `can_update` | boolean | Implements `update`. Needed by `state_only` and `mirror`. |
| `can_delete` | boolean | Implements `delete`. Needed by a `mirror` whose delete policy pushes. |
| `can_submit` | boolean | Implements `submit`. Needed by `submit`. |
| `submit_unavailable_reason` | string | Why `can_submit` is `false`, shown in the console. |
| `accepts_content` | boolean | `create` and `update` should receive file bytes, and a changed file counts as a change to push. |
| `mutable_fields` | string[] | Node properties the provider accepts as writes. The effective push list is the intersection with the mount's `write_config.mutable_fields`. |
| `move_fields` | string[] | Which of `mutable_fields` express the object's location (folder, parent). This is what `move_policy` acts on. |
| `default_delete_policy` | `"detach"`, `"trash"` or `"purge"` | Suggested default for a local delete. A `purge` default is ignored. |
| `default_move_policy` | `"push"`, `"detach"` or `"reject"` | Suggested default for a local move. |
| `supports_trash` | boolean | `delete` can soft-delete. Required for `delete_policy: trash`. |
| `supports_idempotency_key` | boolean | `submit` forwards the engine's key. |

The engine caches the result on the connector node as `capabilities` after
each run and after a successful connection test, so the console can read it
without invoking the adapter.

## Error codes

Throw an `Error` whose message contains one of these codes. The QuickJS
runtime surfaces only the message string, so put the code in the text:

```javascript
function coded(message, code) {
  var e = new Error(message + " (" + code + ")");
  e.code = code;
  return e;
}
```

| Code | Meaning | What the engine does |
|------|---------|----------------------|
| `auth_expired` | The credential was rejected. | Sets the mount status to `auth_required` and stops scheduling it until the account is reconnected. |
| `rate_limited` | The provider is throttling. | Backs off exponentially. Append `retry_after=<seconds>` to the message and the engine waits exactly that long, capped at one hour. Map 429, 503 and 504 here. |
| `config_error` | The request can never succeed as written: a bad remote root, a missing scope, a resource that does not exist. | Sets the status to `misconfigured` with your message and does not retry. On the write path the drain stops and stands off before trying again. |
| `cursor_invalid` | The provider no longer accepts the stored delta cursor. | Drops the cursor and runs a full walk in the same run. |
| `conflict` | The object changed since the mount last read it (etag mismatch). | Routed through the mount's `conflict` policy. |
| anything else | A transient failure. | Retried. The mount status is `error`, then `degraded` after five consecutive failures, and the poll interval doubles per failure up to 32 times the base value. |

`submit` inverts the last rule: only `rate_limited` requeues a command,
`auth_expired`, `config_error` and `conflict` mark it `failed`, and anything
else, a timeout included, parks it as `unknown` for a person to check, since a
retried send could be a duplicate.

Return an empty page only when the source really is empty. An empty `list` on
a mount that already has nodes skips reconcile deletes unless
`allow_empty_reconcile` is set, but an empty result on an auth failure still
hides the failure from the operator. Throw instead.

## Mapping items to nodes

### Default mapping

With no `mapping_function` the engine maps items in Rust:

| Item | Node type | Properties |
|------|-----------|------------|
| `is_folder: true` | `raisin:Folder` | none |
| everything else | `raisin:Node` | `title` (the item name) and a `meta` object holding `mime_type`, `size`, `web_url`, `download_url` and every key of `metadata` |

Query the `meta` object with the arrow operators:

```sql
SELECT name, properties->'meta'->>'title' AS title
FROM 'default' WHERE DESCENDANT_OF('/external/todos') AND node_type = 'raisin:Node';
```

### Mapping function

A mapping function is a second `raisin:Function` named on the mount as
`mapping_function`. It receives no credential and runs once per changed item:

```javascript
function handler(input) {
  switch (input.operation) {
    case "mapper_capabilities":
      return { to_external: false };
    case "to_external":
      return null;
    case "to_node":
    default: {
      const item = input.external_item;   // an ExternalItem
      if (item.is_folder) return { node_type: "raisin:Folder", name: item.name, properties: { title: item.name } };
      return {
        node_type: "raisin:Node",
        name: item.name,
        properties: { title: item.metadata.title, completed: item.metadata.completed === true },
      };
    }
  }
}
```

| Operation | Input | Return |
|-----------|-------|--------|
| `to_node` (also the default when `operation` is absent) | `{ external_item, mount }` | `{ node_type, name?, properties, children? }`, or `null` to skip the item. |
| `mapper_capabilities` | `{ mount }` | `{ to_external: true }` when the mapper can translate outward. Anything else makes the mount read-only. |
| `to_external` | `{ node, mount, fields, intent }` | `{ payload, external_id? }`, or `null` for a node that is not writable. |

Details:

- `children` is an optional array of `{ name, node_type, external_id, properties, etag? }`
  for subordinate nodes such as mail attachments. Their external id is
  namespaced under the parent's, and they inherit the parent's `etag` when they
  have none.
- The node type you return must be allowed in the target workspace, and a
  strict node type must include the `raisin:VirtualNode` mixin so the reserved
  properties below pass validation. `raisin:Mail`, `raisin:Event`,
  `raisin:OutboundMail` and `raisin:CalendarAction` already do.
- In `to_external`, `fields` is the list of properties that diverged. Emit only
  those keys. `intent` is `"create"`, `"update"` or `"submit"`.
- A mount without a `mapping_function` is read-only, because the default
  mapping has no reverse.
- Reserved `__` keys in mapper output are dropped.

### Reserved metadata properties

The engine writes these on every synced node. Declared once on the
`raisin:VirtualNode` mixin, and `__mount_id` and `__external_id` carry a
property index.

| Property | Type | Meaning |
|----------|------|---------|
| `__virtual` | boolean | Marks a mount-managed node. |
| `__mount_id` | string | Id of the owning mount node. |
| `__external_id` | string | Provider item id. |
| `__etag` | string | Provider change token at the last sync. |
| `__synced_at` | string | ISO 8601 time of the last sync write. |
| `__pushed_state` | object | The watched fields as last pushed or received. Only on mounts that declare `mutable_fields`. |
| `__write_seq` | number | Lifecycle counter on `submit` commands. |

```sql
SELECT path FROM 'default' WHERE properties->>'__mount_id'::String = $1;
SELECT path FROM 'default' WHERE properties->>'__external_id'::String = $2;
```

## `raisin:Integration`

A connector. Packages ship templates under `/connectors/<name>` in the
`raisin:system` workspace; the admin console's **Add connector** copies a
template to `/integrations/<name>`, which is where operators configure it and
where the engine reads it.

| Property | Required | Notes |
|----------|----------|-------|
| `title` | yes | |
| `provider_type` | yes | Slug such as `google-drive`, `imap`, `ms-graph`. Passed to the adapter in `credential.provider_type`. |
| `adapter_function` | yes | Path of the adapter in the `functions` workspace, for example `/adapters/google-drive`. |
| `enabled` | no | Default `true`. Mounts on a disabled connector are skipped by the scheduler. |
| `oauth_config` | no | `client_id`, `auth_url`, `token_url`, `revoke_url`, `scopes` (array), `redirect_uri`, `access_type`, `prompt`. |
| `client_secret_encrypted` | no | Written by `POST /api/integrations/{repo}/oauth/client-secret`, never returned. |
| `api_config` | no | Legacy connector-level settings. Forwarded to the adapter in `mount.api_config`. |
| `config_type` | no | Node type describing the connector-level `config` fields. The console renders it as a form. |
| `connection_config_type` | no | Node type describing per-connection fields, for example `imap:ConnectionConfig`. Fields with `meta.secret: true` are stored encrypted; fields with `meta.credential: true` are passed to the adapter in `credential`. |
| `config` | no | Connector-level non-secret values. Secrets go through `PUT /api/integrations/{repo}/config-secrets`. |
| `connected_accounts` | engine | The connections. Read them through `GET /api/integrations/{repo}/connections?integration_path=...`, which returns them without ciphertext. |
| `capabilities`, `capabilities_checked_at` | engine | Cached adapter capabilities. |
| `setup_instructions`, `docs_url` | no | Markdown and a link the console shows on the connector page. |
| `mount_bundles` | no | Presets the console's **Add bundle** turns into mounts. Read by the console only. |

Each connection is an entry in `connected_accounts`:

```json
{
  "id": "C84dv6-Ceo70bUJKCjlb6",
  "label": "demo",
  "subject": "someone@example.com",
  "auth_kind": "oauth",
  "expires_at": 1788723600,
  "scopes": ["https://www.googleapis.com/auth/drive.readonly"],
  "config": {},
  "secret_fields": ["password"],
  "created_at": "2026-09-06T18:42:16Z"
}
```

`scopes` records what the provider granted at the last consent. The
connections endpoint adds `missing_scopes`, the scopes the connector now
requests that this account has not granted, which is what the console's
"reconnect to grant" warning reads.

## `raisin:VirtualMount`

A mount lives under `/mounts/<name>` in `raisin:system` on the repository's
config branch. The periodic scan reads only that branch, so a copy of a mount
node on a forked branch never syncs.

| Property | Required | Notes |
|----------|----------|-------|
| `title` | yes | |
| `integration_ref` | yes | Path or node id of the connector, for example `/integrations/google-drive`. |
| `target_workspace` | yes | Workspace the nodes are written to. It must allow the node types the mapping produces. |
| `target_branch` | no | Branch the nodes are written to. Default `main`. |
| `mount_path` | yes | Path inside the target workspace, at any depth. Parent folders are created as `raisin:Folder`. |
| `account_ref` | no | Connection id. Required when the connector has more than one connection; with exactly one it is optional. |
| `remote_root` | no | Provider-side root: a folder id, a mailbox, a calendar id. Passed to the adapter as `mount.remote_root` and as `folder_id` of the first `list`. |
| `adapter_function` | no | Overrides the connector's adapter. |
| `mapping_function` | no | Custom mapper. Omit for the built-in mapping. |
| `resolver_function` | no | Conflict resolver (below). |
| `enabled` | no | Default `true`. Disabling a mount also unsubscribes its push subscription. |
| `sync_config` | no | Below. |
| `write_config` | no | Below. Absent means read-only. |
| `state` | engine | Do not edit by hand. |

### `sync_config`

Provider-specific keys (an IMAP `mailbox`, a Microsoft Graph `resource`) live
in the same object and reach the adapter unchanged. The engine reads these:

| Field | Default | Notes |
|-------|---------|-------|
| `mode` | `"poll"` | `"poll"`, `"webhook"` or `"hybrid"`. `webhook` is never polled; `hybrid` subscribes and also polls. |
| `interval_seconds` | `300` | Poll interval. After each consecutive failure the effective interval doubles, up to 32 times the base value. The scan runs once a minute. |
| `max_items_per_sync` | `500` | Items per run. A full walk that hits it saves a resume point and continues on the next run. |
| `include_patterns` | `[]` | Globs on the mount-relative path. Empty means everything. |
| `exclude_patterns` | `[]` | Globs. An excluded folder is not descended into, and nodes already synced under it are left in place. |
| `ephemeral` | `false` | Delete synced nodes older than `ttl_seconds`. |
| `ttl_seconds` | none | Required with `ephemeral`. |
| `cache_content` | `false` | Allow file bytes to be fetched and kept for indexing and previews. |
| `content_ttl_seconds` | 30 minutes | How long cached bytes outlive their last use. `0` drops them after processing; `null` keeps them. |
| `path_template` | `""` | Folder layout for items, over `metadata` keys plus `{name}` and `{external_id}`. `{date:%Y}/{date:%m}/{name}` formats an ISO date. |
| `reconcile_deletes` | `true` | Whether a full walk deletes mount-owned nodes it did not see. Turn off when `list` does not enumerate every item (IMAP lists mailboxes, not messages). |
| `allow_empty_reconcile` | `false` | Let a full walk that returns zero items delete the whole subtree. |
| `max_item_failures` | `50` | Item rejections tolerated before a run gives up while nothing has been written. |
| `folder_node_types` | `[]` | Node types treated as folders besides `raisin:Folder`. |
| `batch_size`, `batch_max_bytes` | `1000`, 4 MiB | Items and bytes per write transaction. Raise the two together or not at all. |

`PATCH /api/integrations/{repo}/mounts/{mount_id}/sync-config` changes named
keys and leaves `state` alone. It accepts every key above except the batch
pair, validates the value, and answers with the whole `sync_config` plus a
`follow_up` when the change only reaches already-synced items after a
`remap` (`path_template`) or a `full` sync (the pattern lists):

```json
{
  "ok": true,
  "changed": ["exclude_patterns"],
  "sync_config": { "mode": "poll", "interval_seconds": 600, "exclude_patterns": ["Bret"] },
  "follow_up": { "action": "full", "fields": ["exclude_patterns"], "reason": "..." }
}
```

### `write_config`

| Field | Default | Notes |
|-------|---------|-------|
| `mode` | `"off"` | `"off"`, `"state_only"`, `"mirror"` or `"submit"`. An unrecognized value is refused with a reason in `state.writeback_last_error`. |
| `writeback` | `"off"` | Legacy switch. `"write_through"` means `mode: mirror`. |
| `mutable_fields` | `[]` | Properties a local edit may push, read by `state_only` and `mirror`. Empty means nothing is pushed. The effective list is the intersection with the adapter's `mutable_fields`. |
| `conflict` | `"remote_wins"` | `"remote_wins"`, `"local_wins"`, `"error"` or `"resolver_function"`. |
| `delete_policy` | adapter's, else `"detach"` | `"detach"`, `"trash"` or `"purge"`. `trash` needs `supports_trash`. |
| `move_policy` | adapter's, else `"detach"` | `"push"`, `"detach"` or `"reject"`. A move is an `update` carrying a `move_fields` property. |
| `max_deletes_per_run` | none | Floor for how many deletes one drain may push; the allowance is the larger of this and `max_delete_ratio` times the mount size. |
| `max_delete_ratio` | none | Fraction of the mount's nodes. |
| `require_confirmation_on_bulk` | `true` | Park deletes that came from a transaction touching more than 50 nodes until an operator confirms. |
| `create_node_types` | `[]` | `mirror` only: node types created under the mount path that may be created at the provider. Empty means local creates stay local. |
| `command_node_types` | `[]` | `submit` only: node types that are commands. Empty means `raisin:OutboundMail` and `raisin:CalendarAction`. |

What each mode needs from the adapter and the mapper:

| mode | adapter capabilities | mapper |
|------|----------------------|--------|
| `state_only` | `can_write`, `can_update`, a non-empty effective `mutable_fields` | `mapper_capabilities` answers `{ to_external: true }` |
| `mirror` | `can_write`, `can_update`; `can_delete` when the delete policy pushes; `can_create` when `create_node_types` is set | same |
| `submit` | `can_write`, `can_submit` | same |

When something is missing the run records `state.writeback_supported: false`
and the reason in `state.writeback_last_error`, and the mount keeps syncing
read-only.

A `submit` command node moves through `status` values `draft`, `queued`,
`sending`, then `sent`, `failed` or `unknown`. The drain claims only `queued`
commands.

### Conflict resolver

With `conflict: "resolver_function"` (or simply a `resolver_function` set) the
engine calls that function when the provider refuses a push:

```javascript
// input
{ operation: "resolve_conflict", local, remote: null, conflict, base_etag, field_diff, mount }
// return
{ resolution: "local_wins" | "remote_wins" | "merged" | "park", fields?: {...}, reason?: "..." }
```

`field_diff` is `{ <field>: { local, pushed } }` for every field in the push
allow-list. `merged` pushes `fields` and lands them locally in the same write;
only fields inside the allow-list are accepted. A throw or an unrecognized
answer parks the edit and sets `state.writeback_status` to `"conflict"`.

### Sync modes

`POST /api/integrations/{repo}/mounts/{mount_id}/sync` with `{ "mode": ... }`
enqueues one run. The default is `delta`; any other value than the three below
is a validation error. The response is `{ "job_id": "...", "status": "queued" }`,
or `{ "job_id": null, "status": "already_running" }` when a run for that mount
is already in flight.

| mode | What runs |
|------|-----------|
| `delta` | `get_changes` from the stored cursor. Falls back to a full walk when there is no cursor yet or the adapter has no changes feed. |
| `full` | A `list` walk of the whole tree, then a reconcile that deletes mount-owned nodes the walk did not see. |
| `remap` | A full walk that re-runs the mapper for every item, ignoring etags. Nodes keep their ids and history. |

The same enqueue is available from functions as
`raisin.integrations.syncNow(mountId, mode?)` (alias `sync_now`).

### `state`

Written by the engine after every run. The fields most worth reading:

| Field | Notes |
|-------|-------|
| `status` | `"ok"`, `"syncing"`, `"error"`, `"degraded"`, `"auth_required"` or `"misconfigured"`. |
| `last_error` | Message of the last failure. |
| `last_sync_at`, `last_attempt_at` | Epoch seconds of the last success and the last attempt. |
| `last_sync_token` | The delta cursor. |
| `consecutive_failures` | Drives the backoff and the `degraded` status. |
| `backfill_complete`, `backfill_items_done`, `backfill_cursor`, `backfill_stack` | Progress and resume point of a full walk. |
| `last_run`, `recent_runs` | `{ started_at, finished_at, mode, trigger, outcome, written, skipped, deleted, failed, pushed, ... }`, newest first, at most 20. |
| `paused`, `stop_requested` | Set by the pause and stop endpoints. |
| `failed_items` | External ids the store rejected. |
| `writeback_supported`, `writeback_last_error`, `writeback_status`, `last_drain`, `writeback_blocked`, `writeback_retry_after` | The write path's verdict and receipts. |
| `push_status`, `push_subscription_id`, `push_expires_at`, `push_notification_url`, `push_last_error`, `push_deliveries_ok`, `push_deliveries_rejected` | Push subscription and delivery health. |

## HTTP endpoints

All under `/api/integrations/{repo}` and admin-only unless noted.

| Method and path | Purpose |
|-----------------|---------|
| `POST /test` | Connection test: `capabilities`, then a `list` of at most 10 items, within 30 seconds. Body `{ integration_path, account_id?, remote_root?, sync_config? }`. Always HTTP 200; read `ok`. |
| `POST /browse` | Remote picker. Body `{ integration_path, account_id?, kind?, parent_id?, query?, cursor?, limit?, sync_config? }`. |
| `GET /connections?integration_path=` | List connections with `missing_scopes`. |
| `POST /connections` | Create a credential connection: `{ integration_path, label?, config?, secrets? }`. Needs `RAISIN_MASTER_KEY`. |
| `PATCH /connections/{account_id}`, `DELETE /connections/{account_id}?integration_path=` | Update or remove one. |
| `POST /oauth/start` | `{ integration_path }` returns `{ auth_url, state }`. |
| `GET /oauth/callback` | Public. The provider redirects here. An account with the same subject is updated in place. |
| `POST /oauth/disconnect` | `{ integration_path, account_id }`. |
| `POST /oauth/client-secret` | `{ integration_path, client_secret }`. |
| `PUT /config-secrets` | `{ integration_path, secrets: { field: value or null } }`. |
| `GET /setup-urls`, `GET /mounts/{mount_id}/setup-urls` | The redirect URI and, per mount, the notification URL. Built from `RAISINDB_BASE_URL`; without it the URLs carry a literal `{base}` and `base_url_configured` is `false`. |
| `POST /mounts/{mount_id}/sync` | Enqueue a run. |
| `PATCH /mounts/{mount_id}/sync-config` | Edit named `sync_config` keys. |
| `POST /mounts/{mount_id}/pause` | `{ paused: true or false }`. Keeps the push subscription. |
| `POST /mounts/{mount_id}/stop` | Ask the running sync to stop at its next page. |
| `POST /mounts/{mount_id}/writeback/confirm` | `{ token }` from `state.writeback_blocked`. |
| `GET /mounts/{mount_id}/events` | Server-sent events (`mount-sync`) with `started`, `progress` and `finished` frames. |
| `DELETE /mounts/{mount_id}` | Delete the mount after unsubscribing it. Returns `{ deleted, unsubscribed }`. |
| `GET` or `POST /notifications/{mount_token}` | Public. Provider push endpoint. The token is the mount's `state.push_mount_token`, as embedded in the notification URL from `setup-urls` or `subscribe`. Echoes a `validationToken` or `challenge`, checks the stored secret, then enqueues a delta sync. |
| `POST /api/integrations/content/{repo}/{branch}/{ws}/by-id/{node_id}` | Any authenticated user who can read the node. Fetches the bytes of a mount-owned asset through `get_content`. Returns `{ status: "stored", bytes, storage_key }` or `{ status: "already_present" }`. |

Test connection response:

```json
{
  "ok": true,
  "latency_ms": 298,
  "auth": "not_required",
  "capabilities": { "can_read": true, "supports_changes": false, "...": "..." },
  "probe": { "items_seen": 10, "sample": ["Bret", "Antonette", "Samantha"] },
  "error": null
}
```

`auth` is `valid`, `expired`, `missing` or `not_required`. On failure `error`
carries a `code` (`adapter_not_found`, `missing_credential`, `auth_expired`,
`timeout`, or the adapter's own code) and a message. The `sample` holds item
names only.

## Operational notes

- `RAISIN_MASTER_KEY` encrypts OAuth tokens, connection secrets and client
  secrets. Without it no credential can be decrypted and no connection can be
  created. Back it up with the database.
- The periodic scan runs every 60 seconds and enqueues a `delta` run for every
  enabled, unpaused mount whose interval has elapsed. A run stops itself after
  eight minutes at a page boundary and resumes on the next tick.
- The engine takes a per-mount lease. In a replicated cluster configure the
  `redis` locks backend so two nodes cannot sync the same mount at once; with
  the in-process backend the engine logs a warning when replication is on.
- Sync writes are attributed to the actor `virtual-mount-sync`. Filter it out
  in triggers that write back into the mount path.
- A full walk of a large source emits one node event per item, so a trigger
  scoped to the mount path fires once per imported item on the first run.
