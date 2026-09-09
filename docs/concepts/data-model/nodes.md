---
sidebar_position: 1
---

# Nodes

A **node** is the unit of content in RaisinDB. Every node lives in a workspace, has a path in that workspace's tree, is typed by a [NodeType](/docs/concepts/data-model/nodetypes), and carries a `properties` document. Think of a node as a file in a Git repository: it has a path, content, and a history of revisions.

## What a node looks like

This is a node as the HTTP API returns it (`GET /api/repository/docs-model/main/head/blog/hello`):

```json
{
  "id": "WAc_1d79nfVmim7aD2s9j",
  "name": "hello",
  "path": "/hello",
  "node_type": "blog:Article",
  "archetype": null,
  "properties": {
    "title": "Hello",
    "rating": 4,
    "tags": ["a", "b"],
    "$mixins": [],
    "$supertypes": ["blog:Article"]
  },
  "children": [],
  "order_key": "",
  "has_children": false,
  "parent": "/",
  "version": 1,
  "created_at": "2026-09-06T18:33:16.553029Z",
  "updated_at": "2026-09-06T18:33:16.553029Z",
  "published_at": null,
  "published_by": null,
  "updated_by": "system",
  "created_by": "system",
  "translations": null,
  "tenant_id": null,
  "workspace": "blog",
  "owner_id": null,
  "relations": []
}
```

| Field | Meaning |
|-------|---------|
| `id` | Server-generated identifier (a 21-character nanoid). You may supply your own on create. |
| `name` | The display name you gave the node. |
| `path` | Where the node sits in the workspace tree. Derived from the parent path and a slug of `name`. Unique within a workspace. |
| `node_type` | The NodeType that validates `properties`. |
| `archetype` | Optional [archetype](/docs/concepts/data-model/archetypes) name for editor-driven content. |
| `properties` | Your content. Keys starting with `$` are server-computed and cannot be set by clients. |
| `order_key` | The node's position among its siblings (an opaque, sortable string). Empty until a reorder or an ordered write assigns one. |
| `has_children` | Computed on read. |
| `parent` | The **name** of the parent node, or `"/"` for a root-level node. It is not the parent path. |
| `version` | The node's own edit counter: `1` when created, `+1` on every write that updates it. Server-stamped; a client cannot set it. It is not the revision (see the note below). |
| `created_at`, `updated_at`, `created_by`, `updated_by` | Stamped by the server on every write. Writes without an authenticated actor record `"system"`. |
| `published_at`, `published_by` | Set by the publish commands. |
| `translations` | Per-locale overrides, see [Translations](/docs/guides/data-modeling/translations). |
| `relations` | Typed links to other nodes, see [Graph Model](/docs/concepts/graph-model). |

The two reserved properties are worth knowing about. `$supertypes` lists the node's type plus every type it extends and every mixin it carries, and `$mixins` lists just the mixins. The SQL functions `IS_A(properties, 'ns:Type')` and `HAS_MIXIN(properties, 'ns:Mixin')` read them, which makes polymorphic queries cheap. The server stamps both on every write — a `POST` to the workspace root or to a node path, a SQL `INSERT` or `UPDATE`, and a WebSocket create all go through the same validate-and-stamp step — and discards any `$` property a client sends.

## Paths and names

A node's `name` is free text. Its `path` is built by the server: the parent path plus a slug of the name (lower-cased, whitespace replaced with `-`, anything other than `a-z`, `0-9`, `-`, `_` and `.` dropped). Creating a node named `My Third Post` under `/blog` gives the path `/blog/my-third-post`, while `name` stays `My Third Post`.

Paths start with `/`, are case-sensitive, and are unique within a workspace. Hierarchy functions and ordering are covered in [Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy).

## Creating nodes

Over HTTP, `POST` to the parent. `POST` to the workspace root (`.../head/{ws}/`) creates a root-level node and returns the node itself:

```bash
curl -X POST localhost:8090/api/repository/docs-model/main/head/blog/ \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"hello","node_type":"blog:Article","properties":{"title":"Hello","tags":["a","b"],"rating":4}}'
```

`POST` to an existing node path creates a child of that node. This form runs as a commit and returns an envelope with the node and the revision it produced:

```bash
curl -X POST localhost:8090/api/repository/docs-model/main/head/blog/hello \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"first-comment","node_type":"blog:Comment","properties":{"body":"Nice."}}'
```

```json
{
  "node": { "id": "m5D9Yr5c54xIeEUoeKQf9", "name": "first-comment", "path": "/hello/first-comment", "...": "..." },
  "revision": "1788719820700-0",
  "committed": true
}
```

Add a `commit` object (`{"message": "...", "actor": "jane"}`) to any write to set the revision message and author. Without it the server uses a generated message and the authenticated actor.

The same node in SQL (the workspace is the table, and JSON literals need `::jsonb`):

```sql
INSERT INTO 'blog' (path, node_type, name, properties)
VALUES ('/hello', 'blog:Article', 'hello', '{"title":"Hello"}'::jsonb);

-- with your own id
INSERT INTO 'blog' (id, path, node_type, name, properties)
VALUES ('my-fixed-id', '/hello-2', 'blog:Article', 'hello-2', '{"title":"Two"}'::jsonb);
```

On every create the server generates an `id` if you did not pass one, stamps the timestamps and actor, validates the node against its NodeType and the workspace's allowed types, and writes a revision.

### What validation checks

Validation rejects a node when a `required` property is missing, when the NodeType is `strict` and the node carries an undeclared property, when a `unique` property collides with another node, or when the workspace does not allow the type (`allowed_node_types`, and `allowed_root_node_types` for root-level nodes). A failed write returns HTTP 400:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Missing required property 'title' for NodeType 'blog:Article'",
  "details": "Missing required property 'title' for NodeType 'blog:Article'",
  "timestamp": "2026-09-06T18:33:16.568668+00:00"
}
```

Property values are not type-checked against the schema, and `constraints` such as `min` or `max` are stored on the NodeType but not enforced on write. Treat them as documentation for editors and validate in your application if you need hard guarantees.

## Reading nodes

By path, by id, or as a listing:

```bash
# one node
GET /api/repository/docs-model/main/head/blog/hello

# by id
GET /api/repository/docs-model/main/head/blog/$ref/WAc_1d79nfVmim7aD2s9j

# root-level nodes of the workspace (an array)
GET /api/repository/docs-model/main/head/blog/

# children of a node, one level deep (an array, in sibling order)
GET /api/repository/docs-model/main/head/blog/hello?level=1

# a subtree, up to 10 levels; each node carries its children under "children"
GET /api/repository/docs-model/main/head/blog/hello?level=3
```

`?level=N` returns an array of nodes with nested `children` arrays. Add `&format=map` to get a map keyed by name instead, or `&flatten=true` for a flat array of every node in the subtree.

In SQL, the workspace is the table and `->>` reads a property as text:

```sql
SELECT id, path, properties->>'title' AS title
FROM 'blog'
WHERE node_type = 'blog:Article';

SELECT * FROM 'blog' WHERE id = 'WAc_1d79nfVmim7aD2s9j';

SELECT path, updated_at FROM 'blog' ORDER BY updated_at DESC LIMIT 10;
```

`SELECT *` returns the node fields plus a few computed columns: `parent_name`, `depth`, `locale`, `__workspace`, and the ordering columns `__order` and `__tree_order`.

## Updating nodes

`PUT` to the node path replaces `properties` with what you send (a full replace, not a merge). The response is the updated node. With a `commit` object the response is the `{node, revision, committed}` envelope instead:

```bash
curl -X PUT localhost:8090/api/repository/docs-model/main/head/blog/hello \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"properties":{"title":"Hello, edited","rating":3},"commit":{"message":"Retitle","actor":"jane"}}'
```

To change a single property, address it with `@` and send only the value:

```bash
curl -X PUT 'localhost:8090/api/repository/docs-model/main/head/blog/hello@rating' \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '5'
# {"status":"property updated"}
```

In SQL, `SET properties = ...` replaces the document and `properties || ...` merges into it:

```sql
UPDATE 'blog' SET properties = '{"title":"Replaced"}'::jsonb WHERE path = '/hello';
UPDATE 'blog' SET properties = properties || '{"rating":2}'::jsonb WHERE path = '/hello';
```

Every update writes a new revision **and** bumps the node's `version` by one.

The two count different things. The **revision** is a Hybrid Logical Clock that orders every write in the branch; it is what time-travel reads (`rev/{revision}`) and the history endpoint take, and it advances when any node in the branch changes. **`version`** counts writes to *this* node only, which is the number an optimistic-concurrency check wants: read `version`, send it back, and reject the write if it has moved. Revisions, not `version`, are the history.

## Moving, renaming, copying, reordering

Structural changes are **commands**, sent as `POST` to `{node path}/raisin:cmd/{command}`. Bodies use camelCase keys:

```bash
# rename (the path slug changes with the name)
POST .../head/blog/hello/raisin:cmd/rename      {"newName": "hello-world"}

# move: targetPath is the node's NEW full path
POST .../head/blog/hello-world/raisin:cmd/move  {"targetPath": "/archive/hello-world"}

# copy a single node
POST .../head/blog/hello/raisin:cmd/copy        {"targetPath": "/archive/hello-copy"}

# copy with descendants
POST .../head/blog/hello/raisin:cmd/copy_tree   {"targetPath": "/archive/hello-tree"}

# reorder among siblings
POST .../head/blog/second/raisin:cmd/reorder    {"targetPath": "/blog/first", "movePosition": "before"}
```

Other commands on the same endpoint: `publish`, `unpublish`, `publish_tree`, `unpublish_tree`, `add-relation`, `remove-relation`, `translate`, `delete-translation`, and the version commands (`create_version`, `restore_version`, `delete_version`). In SQL, `UPDATE 'blog' SET path = '/archive/hello' WHERE path = '/hello'` also moves a node.

## Deleting nodes

```bash
DELETE /api/repository/docs-model/main/head/blog/hello
# {"deleted":true}
```

With a `commit` body the delete also removes every descendant and returns the revision:

```json
{"deleted": true, "node_id": "hGTJYOSspkYIRbZrMLjn_", "revision": "1788719843437-0", "committed": true}
```

```sql
DELETE FROM 'blog' WHERE path = '/hello';
```

After a delete the path returns 404 at `head`, but earlier revisions still contain the node.

## Revisions and time travel

Every write to a branch produces a revision. A revision id looks like `1788719842951-0` (a hybrid logical clock timestamp and counter). List a repository's revisions and what each changed:

```bash
GET /api/management/repositories/default/docs-model/revisions
```

```json
{
  "revisions": [
    {
      "revision": "1788719842951-0",
      "parent": "1788719842920-0",
      "branch": "main",
      "timestamp": "2026-09-06T18:37:22.952166Z",
      "actor": "jane",
      "message": "Retitle",
      "is_system": false,
      "changed_nodes": [{"node_id": "m5D9Yr5c54xIeEUoeKQf9", "workspace": "blog", "operation": "modified"}]
    }
  ]
}
```

Read any node as it was at a revision by swapping `head` for `rev/{revision}`:

```bash
GET /api/repository/docs-model/main/rev/1788719842920-0/blog/hello
```

A per-node history endpoint exists at `GET /api/history/{repo}/{branch}/{ws}/{path}` (and `/by-id/{id}`), returning `{revision, updated_at, updated_by, deleted}` entries newest first. See [Revisions](/docs/concepts/versioning/revisions).

## Audit log

NodeTypes with `auditable: true` also write an audit-log entry on every change. Audit entries are separate from revision history and are read through `GET /api/audit/{repo}/{branch}/{ws}/by-id/{id}` or `.../{path}`, the `audit_query` WebSocket request, or `ws.nodes().auditLog(id)` in the JavaScript client.

## Relationships

Besides the tree, nodes can hold typed relations to other nodes (the `relations` field). They are created with the `add-relation` command or the SQL `RELATE` statement and queried with `GRAPH_TABLE` or `NEIGHBORS()`. See [Graph Model](/docs/concepts/graph-model).

## Next steps

- **[NodeTypes](/docs/concepts/data-model/nodetypes)** define what a node may contain.
- **[Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy)** covers tree queries and sibling order.
- **[Archetypes](/docs/concepts/data-model/archetypes)** add editor-facing structure on top of a NodeType.
