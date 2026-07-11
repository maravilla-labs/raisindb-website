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

## The eight operations

| Operation | Params | Returns |
|-----------|--------|---------|
| `capabilities` | `{}` | A capabilities object (see below). |
| `list` | `{ folder_id?, cursor?, limit? }` | `{ items: ExternalItem[], next_cursor }` |
| `get` | `{ item_id?, path? }` | `ExternalItem` or `null` |
| `get_content` | `{ item_id }` | `{ content, mime_type }` |
| `create` | `{ parent_id, name, is_folder, content?, mime_type? }` | `ExternalItem` |
| `update` | `{ item_id, name?, content?, mime_type?, etag? }` | `ExternalItem` |
| `delete` | `{ item_id }` | `{ deleted: true }` |
| `get_changes` | `{ since_token, folder_id? }` | `{ items: Change[], next_token }` |

You only need to implement what your provider supports — advertise the rest as
`false` in `capabilities` and the engine won't call them.

- **`capabilities`** is the most important operation. It must be cheap and
  side-effect-free (ideally no network call), because the engine polls it. Its
  `supports_changes` flag decides the sync strategy: `true` uses the fast
  `get_changes` delta path; `false` forces a full listing (`list`) every time.
- **`list`** enumerates one level of children — defaulting to `mount.remote_root`
  when `folder_id` is omitted — and pages via `cursor` / `next_cursor`.
- **`get_changes`** returns everything that changed since `since_token` and a
  fresh `next_token`. Make `next_token` durable and resumable: the engine may
  re-run a page after a crash and relies on your results being idempotent.
- **`get_content`**, **`create`**, **`update`**, **`delete`** back content sync
  and write-through, which are **not implemented in the engine** — it is
  read/reconcile-only, and the admin console hides the write-back controls.
  Implement them for forward-compatibility if you like, but a v1 mount is
  link-only and the engine never calls them.

## Error codes

Signal failure by **throwing an `Error` with a `code` property**. The engine
dispatches on `code`:

| `code` | Meaning | Engine behavior |
|--------|---------|-----------------|
| `auth_expired` | The access token was rejected. | Marks the account for re-auth and **pauses the mount** (`auth_required`) until reconnected. Not retried. |
| `rate_limited` | The provider is throttling. | Backs off and retries later. |
| `conflict` | Write-through optimistic-concurrency failure (etag mismatch). | Surfaced to the writer; with `remote_wins` the local edit is dropped and a warning is emitted. |
| *(anything else)* | Transient failure. | Retries with backoff; after repeated failures the mount goes `degraded`. |

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
  };
}

function toItem(row) {
  return {
    external_id: row.id,          // stable across renames — REQUIRED
    name: row.title,              // REQUIRED
    is_folder: row.kind === "folder", // REQUIRED
    mime_type: row.mime || null,
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
