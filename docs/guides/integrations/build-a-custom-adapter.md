---
sidebar_position: 3
---

# Build a connector

A connector mounts a new external system into your workspaces. The only code
you write is an **adapter**: one RaisinDB function that translates a handful
of normalized operations into calls against one provider. The sync engine
calls it, maps what it returns, and writes the nodes. You never touch nodes,
cursors or transactions yourself.

This guide covers the scaffold, the handler contract, the operations and error
codes, and a minimal adapter you can copy. The
[adapter reference](../../reference/virtual-node-adapters.md) has every field;
the [tutorial](../../tutorials/custom-connector.md) walks the same path step by
step against a public API.

## Scaffold with the CLI

```bash
raisindb create adapter dropbox
```

This writes a `./dropbox-adapter/` package:

| Path | Purpose |
|------|---------|
| `manifest.yaml` | Package metadata with `category: integrations`, which is how the console's **Installed adapters** list finds it. |
| `content/functions/adapters/dropbox/index.js` | The adapter. `capabilities` and an empty `list` are implemented; the rest are TODOs. |
| `content/functions/adapters/dropbox/.node.yaml` | The function node: entry point, a 120 second timeout, and a `network_policy` whose `allowed_urls` you must point at your provider. |
| `content/_raisin__system/connectors/dropbox/.node.yaml` | A disabled `raisin:Integration` template with empty OAuth endpoints, under `/connectors/dropbox` like the built-in packages. |
| `README.md` | Notes for the package. |

The template is what the admin console's **Add connector** copies to
`/integrations/<name>`, where the operator configures it. Package updates
rewrite `/connectors/<name>` and never touch `/integrations/<name>`, so a
reinstall cannot lose an operator's credentials or connected accounts.

Implement the adapter, then deploy and install in one step:

```bash
cd dropbox-adapter
raisindb package deploy . --repo myapp --install
```

## The handler contract

The entry point takes one argument with four keys:

```javascript
function handler(input) {
  var params = input.params || {};
  switch (input.operation) {
    case "capabilities": return opCapabilities();
    case "list":         return opList(input.credential, input.mount, params);
    case "get_changes":  return opGetChanges(input.credential, input.mount, params);
    default:
      throw new Error("Unsupported operation: " + input.operation);
  }
}
```

- `operation` names what the engine wants.
- `params` carries the operation's arguments.
- `credential` is the decrypted credential of the mount's connection, or
  `null` when the connector has none. For an OAuth connection it holds
  `access_token`; for a credential connection it holds the connection's
  secret fields such as `password`. Both carry `username`, `account_id` and
  `provider_type`. It never contains a refresh token; the engine refreshes
  tokens itself.
- `mount` is a read-only snapshot: `mount_id`, `remote_root`, `mount_path`,
  the mount's `sync_config` as authored, and `config`, a merged view of the
  connector's, the connection's and the mount's settings.

The engine calls the function directly rather than through a trigger, so the
usual `raisin.*` bindings are available and there is no trigger event.

## The operations

| Operation | Params | Returns |
|-----------|--------|---------|
| `capabilities` | `{}` | A capabilities object (below). |
| `list` | `{ folder_id, cursor, limit }` | `{ items: ExternalItem[], next_cursor }` |
| `get_changes` | `{ since_token, folder_id, baseline_only }` | `{ items: Change[], next_token, has_more }` |
| `get_content` | `{ item_id, parent_item_id, mime_type }` | `{ content_base64, mime_type }` |
| `update`, `create`, `delete`, `submit` | see the reference | write-path receipts |
| `subscribe`, `renew`, `unsubscribe` | see the reference | push subscription state |
| `browse` | `{ kind, parent_id, query, cursor, limit }` | `{ items: [{ id, name, kind, has_children }] }` |

You only need to implement what your capabilities declare. A read-only
connector with no changes feed implements `capabilities` and `list`, and the
engine walks the tree with `list` on every run.

**`capabilities`** is called at the start of every run and by the connection
test, so keep it cheap. `supports_changes` decides the strategy: `true` uses
`get_changes` after the first walk, `false` re-lists everything each run.

**`list`** returns one level of children. `folder_id` is `null` for the mount
root and the `external_id` of a folder for deeper levels; the engine recurses
into every item you flag `is_folder: true`. Page with `cursor` and
`next_cursor`, and return `next_cursor: null` on the last page.

**`get_changes`** returns what changed since `since_token` (`null` on the
first call) and the token to store. Set `has_more: true` while you are paging
through a backlog and `false` when the feed is caught up. When nothing
changed, return the token you were given rather than `null`. When the provider
no longer accepts the stored token, throw `cursor_invalid` and the engine
falls back to a full walk in the same run.

**`get_content`** is called when someone opens a mount-owned asset, never
during a sync.

The engine never calls `get`.

## Items

An `ExternalItem` is the normalized shape of one remote object:

```javascript
{
  external_id: "todo-42",        // required, stable across renames and moves
  name: "todo-42",               // node name and path segment
  is_folder: false,
  mime_type: null,               // guessed from the name's extension when omitted
  size_bytes: null,
  parent_id: "user-2",
  created_at: null,              // ISO 8601
  modified_at: null,
  etag: "42:open",               // change token; unchanged means "skip"
  web_url: null,
  download_url: null,
  metadata: { title: "...", completed: false }   // provider passthrough
}
```

`etag` is what keeps a re-sync cheap: an item whose stored etag matches is
skipped before the mapper runs. An item without one is rewritten on every
run, so give folders a stable value too.

## Capabilities

```javascript
function opCapabilities() {
  return {
    can_read: true,
    can_write: false,
    can_create_folders: false,
    supports_changes: false,   // no delta feed: the engine lists everything each run
    supports_webhooks: false,
    supports_search: false,
    supports_push: false,
    default_ttl: null,
    max_file_size: null,
  };
}
```

Every write-path flag (`can_create`, `can_update`, `can_delete`, `can_submit`,
`mutable_fields`, `accepts_content`, and so on) defaults to off, so a
read-only adapter omits them. Declare a write capability only once the
operation behind it exists; the engine resolves a mount's write mode from
these flags and refuses the mode with a stated reason when one is missing.

## Error codes

Throw an `Error` whose message contains the code. Only the message crosses the
runtime boundary, so the code has to be in the text:

```javascript
function coded(message, code) {
  var e = new Error(message + " (" + code + ")");
  e.code = code;
  return e;
}

function checked(resp, context) {
  if (resp.status >= 200 && resp.status < 300) return resp;
  if (resp.status === 401 || resp.status === 403) throw coded(context + ": token rejected", "auth_expired");
  if (resp.status === 429 || resp.status === 503 || resp.status === 504) throw coded(context + ": throttled", "rate_limited");
  if (resp.status === 400 || resp.status === 404) throw coded(context + ": bad request", "config_error");
  throw new Error(context + ": HTTP " + resp.status);   // transient, retried
}
```

| Code | Engine behavior |
|------|-----------------|
| `auth_expired` | The mount pauses with status `auth_required` until the account is reconnected. |
| `rate_limited` | Backs off and retries. Add `retry_after=<seconds>` to the message to use the provider's own wait. |
| `config_error` | The mount is marked `misconfigured` with your message and not retried. |
| `cursor_invalid` | The stored cursor is dropped and a full walk runs in the same run. |
| `conflict` | A write is routed through the mount's conflict policy. |
| anything else | Retried; after five consecutive failures the mount is `degraded`. |

Throw on failure rather than returning an empty page. An empty `list` on a
mount that has nodes is treated as suspicious and skips deletes, but the
operator sees a green run instead of the real error.

## A minimal working adapter

This read-only adapter mounts [JSONPlaceholder](https://jsonplaceholder.typicode.com):
users become folders and their todos become items. It is the adapter the
tutorial builds, and it runs unchanged against a live server.

```javascript
var API = "https://jsonplaceholder.typicode.com";

function coded(message, code) {
  var e = new Error(message + " (" + code + ")");
  e.code = code;
  return e;
}

function checked(resp, context) {
  if (resp.status >= 200 && resp.status < 300) return resp;
  if (resp.status === 401 || resp.status === 403) throw coded(context + ": token rejected", "auth_expired");
  if (resp.status === 429 || resp.status === 503 || resp.status === 504) throw coded(context + ": throttled", "rate_limited");
  if (resp.status === 400 || resp.status === 404) throw coded(context + ": bad request", "config_error");
  throw new Error(context + ": HTTP " + resp.status);
}

function opCapabilities() {
  return {
    can_read: true, can_write: false, can_create_folders: false,
    supports_changes: false, supports_webhooks: false, supports_search: false,
    supports_push: false, default_ttl: null, max_file_size: null,
  };
}

function opList(credential, mount, params) {
  if (!params.folder_id) {
    var users = checked(raisin.http.fetch(API + "/users"), "list users").body || [];
    return {
      items: users.map(function (u) {
        return {
          external_id: "user-" + u.id,
          name: u.username,
          is_folder: true,
          parent_id: null,
          etag: "user-" + u.id,
          metadata: { email: u.email },
        };
      }),
      next_cursor: null,
    };
  }
  var userId = params.folder_id.replace("user-", "");
  var todos = checked(raisin.http.fetch(API + "/users/" + userId + "/todos"), "list todos").body || [];
  return {
    items: todos.map(function (t) {
      return {
        external_id: "todo-" + t.id,
        name: "todo-" + t.id,
        is_folder: false,
        parent_id: params.folder_id,
        etag: t.id + ":" + (t.completed ? "done" : "open"),
        metadata: { title: t.title, completed: t.completed, user_id: t.userId },
      };
    }),
    next_cursor: null,
  };
}

function handler(input) {
  var params = input.params || {};
  switch (input.operation) {
    case "capabilities": return opCapabilities();
    case "list":         return opList(input.credential, input.mount || {}, params);
    default:             throw new Error("Unsupported operation: " + input.operation);
  }
}
```

`raisin.http.fetch` is synchronous in the function runtime and returns
`{ status, body }`. The host has to be in the function's `network_policy`:

```yaml
network_policy:
  http_enabled: true
  allowed_urls:
    - "https://jsonplaceholder.typicode.com/**"
```

## Performance rules

The adapter runs inside every sync of every mount that uses it.

- Do the provider I/O and normalization inline. Do not call
  `raisin.functions.call` per item; it blocks a worker per nesting level.
- Keep `etag` stable when nothing changed.
- Respect `params.limit`, which is the mount's `max_items_per_sync`.
- Restrict `allowed_urls` to the provider's hosts.

## Mapping items to nodes

Without a mapper the engine turns folders into `raisin:Folder` and everything
else into a `raisin:Node` carrying `title` and a `meta` object with the mime
type, size, links and your `metadata`. To choose node types and properties,
ship a second function and name it on the mount as `mapping_function`:

```javascript
function handler(input) {
  switch (input.operation) {
    case "mapper_capabilities": return { to_external: false };   // read-only
    case "to_external":         return null;
    case "to_node":
    default: {
      var item = input.external_item;
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

A mapper that can also translate a node back into a provider payload answers
`{ to_external: true }` and implements `to_external`; that is what makes a
mount writable. Keep both directions in the mapper rather than in the adapter,
so a user who swaps the mapper for a custom node shape does not end up with a
reverse mapping that writes the wrong fields.

## Test the connection

Before creating a mount, run **Test connection** on the connector in the
admin console, or call the endpoint:

```bash
curl -s -X POST localhost:8090/api/integrations/myapp/test \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"integration_path":"/integrations/dropbox","account_id":"<connection id>"}'
```

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

The test loads the adapter, calls `capabilities`, then `list` with a limit of
10, all within 30 seconds. `auth` is `valid`, `expired`, `missing` or
`not_required`. A failed test is still HTTP 200 with `ok: false` and an
`error.code` such as `adapter_not_found`, `missing_credential`, `auth_expired`
or `timeout`. On success the capabilities are cached on the connector node,
which is what the console's mount editor reads.

Pass `remote_root` to probe a specific folder and `sync_config` to forward
keys the adapter needs, such as Microsoft Graph's `resource`.

## Changing your mapper later

An ordinary sync skips unchanged items before the mapper runs, so a changed
mapper never reaches items that are already synced. Run a remap:

```bash
curl -s -X POST localhost:8090/api/integrations/myapp/mounts/<mount id>/sync \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"mode":"remap"}'
```

It re-runs the mapper for every item and writes a revision per item, so it is
an operator action rather than a schedule. Nodes keep their ids and history.
The console offers it as **Remap** on the mount.

## Trigger a sync on demand

From a function, for example a webhook handler:

```javascript
const r = raisin.integrations.syncNow(mountId);
// { job_id: "Coo36RHBLgaNbS9dXyH3S", status: "queued" }
// or { job_id: null, status: "already_running" }
```

`already_running` means a run for that mount is in flight and the call was a
no-op, so it is safe to call on every webhook. The same call over HTTP is
`POST /api/integrations/{repo}/mounts/{mount_id}/sync`. A mount with
`sync_config.mode: "webhook"` is never polled and relies on this.

## Next steps

- [Adapter reference](../../reference/virtual-node-adapters.md): every field of
  `ExternalItem`, `Change`, `Capabilities`, the mount configuration and the
  HTTP endpoints.
- [Custom connector tutorial](../../tutorials/custom-connector.md): the same
  adapter, deployed and mounted step by step.
- [Sync a Google Drive folder](sync-google-drive.md): a shipped adapter with a
  delta feed and a write path.
