---
sidebar_position: 3
---

# Nodes API

Read and write nodes at `/api/repository/{repo}/{branch}/head/{workspace}/{path}`. `{path}` is the node's path inside the workspace without the leading slash; the trailing-slash form `.../{workspace}/` addresses the workspace root.

## Node object

```json
{
  "id": "fzpbHQs6kHJjK246z4n6a",
  "name": "hello-world",
  "path": "/articles/hello-world",
  "node_type": "raisin:Page",
  "archetype": null,
  "properties": {"title": "Hello World", "status": "draft", "$supertypes": ["raisin:Page"], "$mixins": []},
  "parent": "articles",
  "order_key": "",
  "has_children": false,
  "version": 1,
  "created_at": "2026-09-06T18:33:43.132065Z",
  "updated_at": "2026-09-06T18:33:43.151412Z",
  "created_by": "system",
  "updated_by": "system",
  "published_at": null,
  "published_by": null,
  "translations": null,
  "workspace": "content",
  "owner_id": null,
  "relations": []
}
```

`$supertypes` and `$mixins` are added on read from the node's type.

## Create

```
POST /api/repository/{repo}/{branch}/head/{workspace}/{parent_path}
POST /api/repository/{repo}/{branch}/head/{workspace}/           (at the root)
```

```json
{
  "name": "hello-world",
  "node_type": "raisin:Page",
  "properties": {"title": "Hello World"},
  "commit": {"message": "Add hello world", "actor": "alice"}
}
```

`commit` is optional. `name` becomes the last path segment (sanitized). The node type must be in the workspace's `allowed_node_types` (and `allowed_root_node_types` for root creation).

Response `201`. Under a parent the node is returned in a commit envelope, `{"node": {...}, "revision": "1788719623132-0", "committed": true}`; at the root the bare node is returned.

## Read

```
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}
GET /api/repository/{repo}/{branch}/head/{workspace}/$ref/{id}
GET /api/repository/{repo}/{branch}/head/{workspace}/            (root listing)
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}@{property}
```

Query parameters:

| Parameter | Effect |
|-----------|--------|
| `level=N` | Return descendants to depth N instead of the node |
| `deep=true` | Return the whole subtree |
| `flatten=true` | Flatten a subtree into a list |
| `format=array` | Children as an array (default is a map keyed by name) |
| `cursor`, `limit` | Keyset pagination for listings; `limit` defaults to 100, max 1000 |
| `lang=xx` | Resolve translations for a locale |
| `command=download` | Stream an asset's bytes as an attachment |
| `command=display` | Stream an asset's bytes inline |
| `revision=N` | Read at an older revision (or use the `rev/` route below) |

A node the caller cannot read returns `404`, the same as a missing node.

## Update

```
PUT /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

```json
{"properties": {"title": "Hello World", "status": "published"}, "commit": {"message": "Publish", "actor": "alice"}}
```

`properties` **replaces** the stored properties. `translations` may be included. Returns the updated node (`200`), or the commit envelope when `commit` is present.

To set a single property, address it with `@` and send the value as the JSON body:

```
PUT /api/repository/{repo}/{branch}/head/{workspace}/{path}@title
"Hello Again"
```

Response: `{"status": "property updated"}`.

## Delete

```
DELETE /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

Response: `{"deleted": true}`.

## Commands

Structural operations are `POST` requests to the node path with the command as the last segment, `.../{path}/raisin:{command}`. They cover move, rename, copy, publish, reorder, relations and translations; the JavaScript client's [Node Operations](../javascript-client/node-operations.md) wraps them. Two are commonly called directly:

### Sign an asset URL

```
POST /api/repository/{repo}/{branch}/head/{workspace}/{path}/raisin:sign
{"command": "download", "expires_in": 600}
```

```json
{"url": "/api/repository/myapp/main/head/content/site/index.html/raisin:download?sig=HATkBlR...&exp=1788720991", "expires_at": "2026-09-06T18:56:31+00:00"}
```

The returned URL serves the bytes without a token until `exp`. `command` is `download` or `display`.

### Upload bytes

Multipart `POST` to an asset node path stores the file on that node. For large files use the resumable [upload endpoints](../javascript-client/uploads.md#http-endpoints).

## Time travel

```
GET /api/repository/{repo}/{branch}/rev/{revision}/{workspace}/{path}
GET /api/repository/{repo}/{branch}/rev/{revision}/{workspace}/$ref/{id}
GET /api/repository/{repo}/{branch}/rev/{revision}/{workspace}/
```

`{revision}` is a revision id such as `1788719623132-0`, as returned by a commit or listed under `/api/management/repositories/{tenant}/{repo}/revisions`.

## Revision history

Lists a node's own revisions, newest first, independent of the NodeType's `auditable` flag.

```
GET /api/history/{repo}/{branch}/{workspace}/by-id/{id}?limit=50
GET /api/history/{repo}/{branch}/{workspace}/{path}?limit=50
```

```json
[
  {"revision": "1788720442090-0", "updated_at": "…", "updated_by": "admin", "deleted": false, "message": "publish", "is_system": false}
]
```

Use `revision` with the `rev/` route to fetch the full snapshot.

## Audit log

Audit entries are recorded only for NodeTypes with `auditable: true` (see [NodeTypes](/docs/concepts/data-model/nodetypes#auditable)).

```
GET /api/audit/{repo}/{branch}/{workspace}/by-id/{id}
GET /api/audit/{repo}/{branch}/{workspace}/{path}
```

```json
[{"action": "Update", "user_id": "alice", "timestamp": "…", "path": "/content/page", "details": null}]
```

History and audit reads go through row-level security: you only see entries for nodes you can read.
