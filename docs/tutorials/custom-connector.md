---
sidebar_position: 3
---

# Build a Custom Connector

In this tutorial you build a connector from scratch and mount an external API
as nodes in a workspace. You scaffold an adapter with the CLI, implement the
two operations a read-only mount needs, install it, test it, create a mount,
sync, and query the result with SQL. Then you add a mapper so the imported
items become typed nodes.

The source is [JSONPlaceholder](https://jsonplaceholder.typicode.com), a free
API that needs no account. It has users who each own todos, which is exactly
the shape most connectors deal with: folders (users) that contain items
(todos).

## Prerequisites

- A running RaisinDB server and the `raisindb` CLI, logged in
  (`raisindb login -s http://localhost:8090 -u admin -p ...`).
- A repository to work in. The examples use `myapp`.
- `curl` and `jq` for the HTTP steps, with a bearer token in `$TOKEN`.

## Step 1: Scaffold the adapter

```bash
raisindb create adapter placeholder
cd placeholder-adapter
```

The scaffold is a complete, installable package:

```
placeholder-adapter/
  manifest.yaml                                          # category: integrations
  README.md
  content/
    functions/adapters/placeholder/index.js              # the adapter
    functions/adapters/placeholder/.node.yaml            # function node + network policy
    _raisin__system/connectors/placeholder/.node.yaml    # disabled connector template
```

It already implements `capabilities` and a `list` that returns an empty page.

## Step 2: Allow the provider host

Open `content/functions/adapters/placeholder/.node.yaml` and replace the
placeholder host in `network_policy.allowed_urls`:

```yaml
network_policy:
  http_enabled: true
  allowed_urls:
    - "https://jsonplaceholder.typicode.com/**"
```

Without this every `raisin.http.fetch` from the adapter is refused.

## Step 3: Declare capabilities

Replace the contents of `content/functions/adapters/placeholder/index.js`
with the code in this step and the next. Start with what the adapter can do:

```javascript
var API = "https://jsonplaceholder.typicode.com";

function opCapabilities() {
  return {
    can_read: true,
    can_write: false,
    can_create_folders: false,
    supports_changes: false,   // no delta API: the engine lists everything on each run
    supports_webhooks: false,
    supports_search: false,
    supports_push: false,
    default_ttl: null,
    max_file_size: null,
  };
}
```

Declare only what you implement. The engine reads these flags to decide how
to sync and which write modes a mount may use.

## Step 4: Implement `list`

`list` returns one level of children. The engine calls it once with
`folder_id: null` for the mount root, then once per item you flagged
`is_folder: true`, passing that item's `external_id` as `folder_id`. For this
API the root lists users as folders and a user folder lists todos:

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
  throw new Error(context + ": HTTP " + resp.status);
}

function opList(credential, mount, params) {
  if (!params.folder_id) {
    var users = checked(raisin.http.fetch(API + "/users"), "list users").body || [];
    return {
      items: users.map(function (u) {
        return {
          external_id: "user-" + u.id,     // stable for the node's lifetime
          name: u.username,
          is_folder: true,
          parent_id: null,
          etag: "user-" + u.id,            // stable, so folders are not rewritten each run
          metadata: { email: u.email, company: u.company && u.company.name },
        };
      }),
      next_cursor: null,                   // one page
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
        etag: t.id + ":" + (t.completed ? "done" : "open"),   // changes only when the todo changes
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

Two details carry the whole contract:

- `external_id` is the node's identity. The engine matches items by it, so a
  rename on the provider side updates the node instead of creating a second one.
- `etag` is the change marker. An item whose etag is unchanged is skipped
  before the mapper runs, which is what lets a re-sync of 200 unchanged items
  write nothing.

The `checked` helper maps HTTP statuses to the engine's error codes: the code
in the message decides whether the mount pauses (`auth_expired`), backs off
(`rate_limited`), is marked misconfigured (`config_error`) or retries.

## Step 5: Deploy, install and test

```bash
raisindb package deploy . --repo myapp --install
```

The package installs the function at `/adapters/placeholder` in the
`functions` workspace and the connector template at `/connectors/placeholder`
in `raisin:system`. In the admin console open **Connectors**, click **Add
connector**, pick the Placeholder template, keep the name `placeholder`, and
save; that creates the configured connector at `/integrations/placeholder`.
Then test it, with **Test connection** on the connector or over HTTP:

```bash
curl -s -X POST localhost:8090/api/integrations/myapp/test \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"integration_path":"/integrations/placeholder"}' | jq .
```

```json
{
  "ok": true,
  "latency_ms": 298,
  "auth": "not_required",
  "capabilities": { "can_read": true, "supports_changes": false, "...": "..." },
  "probe": { "items_seen": 10, "sample": ["Bret", "Antonette", "Samantha", "..."] },
  "error": null
}
```

`auth: not_required` is expected: this connector has no account. The probe
called `capabilities`, then `list` with a limit of ten, and saw the ten user
folders.

The template ships `enabled: false`, and a disabled connector's mounts are
skipped by the sync engine. Enable it in the connector editor, or update the
node:

```bash
PROPS=$(curl -s localhost:8090/api/repository/myapp/main/head/raisin:system/integrations/placeholder \
  -H "Authorization: Bearer $TOKEN" | jq -c '.properties + {enabled: true}')
curl -s -X PUT localhost:8090/api/repository/myapp/main/head/raisin:system/integrations/placeholder \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"properties\": $PROPS}"
```

A `PUT` replaces the whole property map, which is why the example reads the
node first and merges.

## Step 6: Mount it and sync

A mount is a `raisin:VirtualMount` node under `/mounts` in `raisin:system`.
Create it with **New Mount** on the console's Mounts page, or with the node
API. The target workspace must allow `raisin:Folder` and `raisin:Node`; the
repository's `default` workspace does.

```bash
curl -s -X POST localhost:8090/api/repository/myapp/main/head/raisin:system/mounts \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{
    "name": "placeholder-todos",
    "node_type": "raisin:VirtualMount",
    "properties": {
      "title": "Placeholder Todos",
      "integration_ref": "/integrations/placeholder",
      "target_workspace": "default",
      "target_branch": "main",
      "mount_path": "/external/todos",
      "enabled": true,
      "sync_config": { "mode": "poll", "interval_seconds": 300 }
    }
  }' | jq '.id'
```

If `/mounts` does not exist yet, create it first as a `raisin:Folder` under
`raisin:system/`. Note the returned id; the sync endpoints take the mount's
node id.

An enabled mount is picked up by the scheduler within a minute. To run it now:

```bash
curl -s -X POST localhost:8090/api/integrations/myapp/mounts/<mount id>/sync \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"mode":"delta"}'
# {"job_id":"VHyLnduuuW58CmYZK2TT_","status":"queued"}
```

The first run is a full walk regardless of the mode you ask for. Read the
run record from the mount's `state`:

```bash
curl -s localhost:8090/api/repository/myapp/main/head/raisin:system/mounts/placeholder-todos \
  -H "Authorization: Bearer $TOKEN" | jq '.properties.state.last_run'
```

```json
{
  "trigger": "manual",
  "mode": "full",
  "outcome": "ok",
  "written": 210,
  "skipped": 0,
  "deleted": 0,
  "failed": 0,
  "duration_ms": 1000
}
```

Ten user folders and 200 todos. Run the sync again and the record reports
`"written": 0, "skipped": 210`: every etag matched, so nothing was rewritten.

Now query the subtree like any other data:

```sql
SELECT path, node_type, properties->>'title' AS title
FROM 'default'
WHERE DESCENDANT_OF('/external/todos')
ORDER BY path
LIMIT 5;
```

| path | node_type | title |
|------|-----------|-------|
| /external/todos/Antonette | raisin:Folder | |
| /external/todos/Antonette/todo-21 | raisin:Node | todo-21 |
| /external/todos/Antonette/todo-22 | raisin:Node | todo-22 |
| /external/todos/Antonette/todo-23 | raisin:Node | todo-23 |
| /external/todos/Antonette/todo-24 | raisin:Node | todo-24 |

Without a mapper each todo is a `raisin:Node` whose `title` is the item name
and whose provider fields sit in a `meta` object:

```json
{
  "title": "todo-1",
  "meta": { "title": "delectus aut autem", "completed": false, "user_id": 1 },
  "__virtual": true,
  "__mount_id": "HlrbuYjrnytco3_1DGQZv",
  "__external_id": "todo-1",
  "__etag": "1:open",
  "__synced_at": "2026-09-06T18:41:28Z"
}
```

Reach into `meta` with the arrow operators:

```sql
SELECT name, properties->'meta'->>'title' AS title
FROM 'default'
WHERE DESCENDANT_OF('/external/todos') AND node_type = 'raisin:Node'
LIMIT 3;
```

## Step 7: Type the nodes with a mapper

A mapper is a second function that turns an item into the node shape you
want. Add it to the package at
`content/functions/mappers/placeholder-todo/index.js`:

```javascript
function handler(input) {
  switch (input.operation) {
    case "mapper_capabilities":
      return { to_external: false };      // read-only mapper
    case "to_external":
      return null;
    case "to_node":
    default: {
      var item = input.external_item;
      if (item.is_folder) {
        return { node_type: "raisin:Folder", name: item.name, properties: { title: item.name } };
      }
      var m = item.metadata || {};
      return {
        node_type: "raisin:Node",
        name: item.name,
        properties: {
          title: m.title,
          completed: m.completed === true,
          assignee: String(m.user_id),
        },
      };
    }
  }
}
```

with a `.node.yaml` beside it:

```yaml
node_type: raisin:Function
properties:
  title: Placeholder Todo Mapper
  language: javascript
  entry_file: index.js:handler
  execution_mode: Async
  enabled: true
  version: 1
```

List it under `provides.functions` in `manifest.yaml` as
`/mappers/placeholder-todo`, bump the version, and deploy again. Then point
the mount at it (the console's mount editor has a **Mapping function** field)
and run a remap, which re-runs the mapper for every item regardless of etags:

```bash
curl -s -X POST localhost:8090/api/integrations/myapp/mounts/<mount id>/sync \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"mode":"remap"}'
```

The run record now reads `"mode": "remap", "written": 210`, and the
properties are typed:

```sql
SELECT name, properties->>'title'::String AS title, properties->>'assignee'::String AS assignee
FROM 'default'
WHERE DESCENDANT_OF('/external/todos')
  AND properties->>'completed'::String = 'true'
ORDER BY path
LIMIT 3;
```

| name | title | assignee |
|------|-------|----------|
| todo-22 | distinctio vitae autem nihil ut molestias quo | 2 |
| todo-25 | voluptas quo tenetur perspiciatis explicabo natus | 2 |
| todo-26 | aliquam aut quasi | 2 |

To produce your own node type instead of `raisin:Node`, ship it in the
package, add it to the target workspace's allowed types, and give it the
`raisin:VirtualNode` mixin if it is strict, so the reserved `__` properties
validate.

## Step 8: Refresh on demand

A function can enqueue a sync, which is the building block for webhook-driven
refresh:

```javascript
function handler(input) {
  var r = raisin.integrations.syncNow(input.mount_id);
  return { job_id: r.job_id, status: r.status };   // "queued" or "already_running"
}
```

Deployed as `/lib/placeholder-refresh` and invoked with
`POST /api/functions/myapp/placeholder-refresh/invoke` and a body of
`{"input":{"mount_id":"<mount id>"}}`, it returns `{"status":"queued"}` and the
mount syncs within seconds.

## Where to go from here

1. **A delta feed.** Implement `get_changes`, set `supports_changes: true`,
   and return `has_more` on every page.
2. **The write path.** Implement `update`, `create`, `delete` or `submit`,
   declare them in `capabilities`, and add `to_external` to your mapper. See
   [the reference](../reference/virtual-node-adapters.md#write_config).
3. **Push.** Implement `subscribe`, `renew` and `unsubscribe` and set
   `supports_push: true`. See
   [Real-time sync with webhooks](../guides/integrations/realtime-sync-webhooks.md).

- [Build a connector](../guides/integrations/build-a-custom-adapter.md): the
  compact contract walkthrough.
- [Adapter reference](../reference/virtual-node-adapters.md): every field.
- [Sync a Google Drive folder](../guides/integrations/sync-google-drive.md): a
  shipped adapter to read alongside your own.
