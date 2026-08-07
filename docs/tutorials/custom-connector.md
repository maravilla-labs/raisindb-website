---
sidebar_position: 3
---

# Build a Custom Connector

In this tutorial you build a **connector from scratch** and mount an external
API as live nodes in your workspace. You'll scaffold an adapter with the CLI,
implement the two read operations that make a mount work, install it, create a
mount, sync it, and query the result with SQL — then add a custom mapper so
the imported items become properly typed nodes.

We'll mount [JSONPlaceholder](https://jsonplaceholder.typicode.com) — a free,
no-auth fake API — so you can follow along without registering an OAuth app.
The API models users who each have todos, which gives us exactly the shape a
real connector deals with: **folders (users) containing items (todos)**.

**What you'll learn:** the adapter contract, why `folder_id` and stable
`external_id`s matter, honest capabilities, error codes, and where a custom
mapper fits.

## Prerequisites

- A running RaisinDB server (`raisindb server start`) and the CLI
- A repo to work in (the default `main` from the quickstart is fine)

## Step 1: Scaffold the adapter

```bash
raisindb create adapter placeholder
cd placeholder-adapter
```

The scaffold is a complete, installable package:

```
placeholder-adapter/
  manifest.yaml                                        # category: integrations
  content/
    functions/adapters/placeholder/index.js            # ← you implement this
    _raisin__system/integrations/placeholder/.node.yaml # disabled connector template
```

It already implements `capabilities` and a stub `list`, so it passes **Test
connection** before you write any provider code.

## Step 2: Declare honest capabilities

Open `content/functions/adapters/placeholder/index.js`. The first operation
every adapter serves is `capabilities` — and the rule is **declare only what
you implement**. A capability with nothing behind it makes a mount resolve
into a mode that fails later, after the engine committed to it.

```javascript
function capabilities() {
  return {
    can_read: true,
    can_write: false,          // no write path in this tutorial
    can_create_folders: false,
    supports_changes: false,   // JSONPlaceholder has no delta API →
                               // the engine full-lists on every sync. Honest
                               // beats clever: a fake delta that re-returns
                               // everything is just a slower full listing.
    supports_webhooks: false,
    supports_search: false,
    supports_push: false,
    default_ttl: null,
    max_file_size: null,
  };
}
```

## Step 3: Implement `list` — and honor `folder_id`

`list` enumerates **one level** of children. The engine walks the hierarchy
itself: it calls `list` once for the mount root, sees which items you flagged
`is_folder: true`, and calls `list` again for each of those — passing the
folder's id as `params.folder_id`.

That parameter is the most important line in this tutorial:

:::danger Always honor `params.folder_id`
An adapter that ignores `folder_id` and always lists its configured root
passes every test on a flat hierarchy — the first call *is* the root — and
then silently never imports any nested content, while the engine re-discovers
the same root folders forever. This exact bug shipped in a production
adapter. Test with at least one nested folder, always.
:::

For our API: the mount root lists **users** (as folders); a user's folder
lists their **todos** (as items).

```javascript
function list(params, credential, mount) {
  var API = "https://jsonplaceholder.typicode.com";

  if (!params.folder_id) {
    // Mount root → one folder per user.
    var users = raisin.http.fetch(API + "/users").body || [];
    return {
      items: users.map(function (u) {
        return {
          external_id: "user-" + u.id,   // stable for the node's lifetime
          name: u.username,
          is_folder: true,
          parent_id: null,
          etag: null,                    // folders here have no version marker
          metadata: { email: u.email, company: u.company && u.company.name },
        };
      }),
      next_cursor: null,                 // one page; null = no more pages
    };
  }

  // A user folder → that user's todos.
  var userId = params.folder_id.replace("user-", "");
  var todos = raisin.http.fetch(API + "/users/" + userId + "/todos").body || [];
  return {
    items: todos.map(function (t) {
      return {
        external_id: "todo-" + t.id,
        name: "todo-" + t.id,
        is_folder: false,
        parent_id: params.folder_id,
        // The etag drives skip-writes: unchanged etag → the engine touches
        // nothing. JSONPlaceholder is static, so derive it from content.
        etag: String(t.id) + ":" + (t.completed ? "done" : "open"),
        metadata: { title: t.title, completed: t.completed, user_id: t.userId },
      };
    }),
    next_cursor: null,
  };
}
```

Two contract details worth internalizing:

- **`external_id` is the node's identity for life.** Pick something the
  provider will never change. A provider id that changes (Microsoft Graph
  mail ids change when a message moves folders) turns a move into
  delete + create, losing anything attached to the node locally.
- **`etag` is your change marker.** Stable when nothing changed — that's what
  lets a 10,000-item re-sync write zero revisions. Changing on every call
  forces a full re-map of every item, every sync.

## Step 4: Fail loudly, with the right code

Wire errors before wiring more features. The error **code you throw is the
retry policy** the engine applies:

```javascript
function checked(resp, context) {
  if (resp.status === 401 || resp.status === 403) {
    var e = new Error(context + ": token rejected");
    e.code = "auth_expired";       // mount pauses until reconnected
    throw e;
  }
  if (resp.status === 429 || resp.status === 503 || resp.status === 504) {
    var e2 = new Error(context + ": provider is throttling");
    e2.code = "rate_limited";      // backs off, retries later
    throw e2;
  }
  if (resp.status === 400 || resp.status === 404) {
    var e3 = new Error(context + ": bad request/unknown resource");
    e3.code = "config_error";      // badged misconfigured; NOT retried —
    throw e3;                      // the identical retry gets the identical no
  }
  if (resp.status >= 300) {
    throw new Error(context + ": HTTP " + resp.status);  // transient → retried
  }
  return resp;
}
```

:::danger Never swallow an error into an empty result
Returning `{ items: [] }` on a failure reads as *"everything was deleted
upstream"* — the next reconcile will remove every node the mount owns. Throw.
:::

## Step 5: Deploy, install, test

```bash
raisindb package deploy . --repo main --install
```

Then in the admin console open **Integrations → placeholder** and hit
**Test connection**. The test loads your adapter, calls `capabilities`, and
probes a small `list` — all before any mount exists. `ok: true` with
`items_seen` in the probe means the wiring works. (JSONPlaceholder needs no
account, so `auth: not_required` is expected.)

## Step 6: Mount it and sync

Create the mount (console: **Integrations → placeholder → New mount**, or as
content):

```yaml
node_type: "raisin:VirtualMount"
properties:
  title: "Placeholder Todos"
  integration_ref: "/integrations/placeholder"
  target_workspace: "content"
  mount_path: "/external/todos"
  enabled: true
  sync_config:
    mode: "poll"
    interval_seconds: 300
```

Press **Sync now** (or wait for the interval), then query:

```sql
SELECT name, path, properties->>'completed'::String AS completed
FROM 'content'
WHERE DESCENDANT_OF('/external/todos')
LIMIT 10;
```

You should see ten user folders and their todos, materialized as nodes. Run
**Sync now** again and watch the run report `0 written` — that's your etags
doing their job.

## Step 7: Type the nodes with a mapper

By default items become generic metadata nodes. A **mapper** is a second
function that turns an `ExternalItem` into the node shape you want — and it's
the piece a user of your connector can swap without touching your adapter.

`content/functions/mappers/placeholder-todo/index.js`:

```javascript
function handler(input) {
  switch (input && input.operation) {
    case "mapper_capabilities":
      return { to_external: false };   // read-only mapper: honest, again
    case "to_node":
    default: {
      var item = input.external_item;
      if (item.is_folder) return null;   // let folders take the default shape
      return {
        node_type: "todo:Task",
        name: item.metadata.title.slice(0, 60),
        properties: {
          title: item.metadata.title,
          completed: item.metadata.completed === true,
          assignee: String(item.metadata.user_id),
        },
      };
    }
  }
}
```

Ship a `todo:Task` nodetype in the package, set the mount's
`mapping_function: "/mappers/placeholder-todo"`, and re-sync. Your external
API is now typed content — queryable, subscribable, and usable by triggers,
workflows, and agents like any other node.

:::warning A mapper that declares a field mutable must round-trip it exactly
This tutorial's mapper is read-only, so there's nothing to round-trip. The
moment you build a **two-way** mapper (`to_external`), every field you declare
mutable must map back to precisely the value that came in — otherwise the
engine's echo-prevention sees a permanent difference and re-pushes the field
forever. And emit **only** the fields the engine names in `input.fields`:
some provider fields have side effects on mere presence in an update
(Microsoft Graph re-sends meeting invites whenever `attendees` appears in a
PATCH).
:::

## Where to go from here

You now have the full read path. The remaining surface, in the order most
connectors grow:

1. **A real delta feed** — implement `get_changes`, flip
   `supports_changes: true`, and declare `has_more` on every page (`true` =
   mid-enumeration, keep paging; `false` = caught up, the token is next run's
   resume point). Never rely on the token "stabilizing" — some providers mint
   a fresh token on every idle poll — and never return `next_token: null` to
   mean "no changes".
2. **The write path** — `update`/`create`/`delete`/`submit` behind declared
   capabilities, and `to_external` in your mapper. Read
   [the write path](../reference/virtual-node-adapters.md) first: `submit` is
   at-most-once and never retried.
3. **Webhooks** — `subscribe`/`renew`/`unsubscribe` for event-driven sync
   instead of polling.

- **[Build a connector (guide)](../guides/integrations/build-a-custom-adapter.md)**
  — the compact contract walkthrough this tutorial expands on
- **[Adapter reference](../reference/virtual-node-adapters.md)** — every field
  table, the frozen contract
- **[Sync a Google Drive folder](../guides/integrations/sync-google-drive.md)**
  — a shipped adapter to read alongside your own
