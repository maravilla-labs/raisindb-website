---
sidebar_position: 2
---

# REST API Access

Use the HTTP API to read and write nodes, run queries and SQL, search, and manage repositories and workspaces. Everything below was run against a local server; the responses are trimmed but otherwise verbatim.

## Base URL

```
http://localhost:8080
```

Most routes live under `/api`. Identity (end-user) auth lives under `/auth`, and static-site serving under `/resources`.

## Authentication

Send a bearer token on every request:

```bash
curl http://localhost:8080/api/repositories \
  -H "Authorization: Bearer $TOKEN"
```

Two kinds of token are accepted in that header:

- **A login token (JWT)** from the admin login endpoint below, or from an identity login (`/auth/{repo}/login`).
- **An API key** (`raisin_...`), created once and used long-term. API keys work on content, query, SQL and repository routes. The profile routes under `/api/raisindb/me` require a login token.

There is no separate API-key header.

### Log in as an admin user

```bash
curl -s -X POST http://localhost:8080/api/raisindb/sys/default/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user_id": "b86457ac-7c3c-4c5b-80f3-2ab2ab724bd3",
  "username": "admin",
  "must_change_password": true,
  "expires_at": 1788805990,
  "access_flags": {"console_login": true, "cli_access": true, "api_access": true, "pgwire_access": false, "can_impersonate": false}
}
```

`default` is the tenant id. The token expires at `expires_at` (Unix seconds); log in again to get a new one.

### Create an API key

```bash
curl -s -X POST http://localhost:8080/api/raisindb/me/api-keys \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ci"}'
```

```json
{"key": {"key_id": "047b191d-...", "name": "ci", "key_prefix": "raisin_DV2vMEwAg", "created_at": "...", "last_used_at": null, "is_active": true},
 "token": "raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e"}
```

The `token` is shown once. See the [Authentication API](../../reference/http-api/authentication.md) for identity (end-user) login, registration, magic links and OIDC.

## Node operations

Content routes have the shape `/api/repository/{repo}/{branch}/head/{workspace}/{path}`. `head` means the current state of the branch; replace it with `rev/{revision}` to read an older state.

The examples use repository `myapp`, branch `main` and a workspace `content` that allows `raisin:Folder` and `raisin:Page`.

### Create a node

`POST` to the **parent** path with the new node's `name`, `node_type` and `properties`. To create at the workspace root, post to `.../content/`.

```bash
curl -s -X POST http://localhost:8080/api/repository/myapp/main/head/content/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"articles","node_type":"raisin:Folder","properties":{"title":"Articles"}}'

curl -s -X POST http://localhost:8080/api/repository/myapp/main/head/content/articles \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"hello-world","node_type":"raisin:Page","properties":{"title":"Hello World","status":"draft"}}'
```

The second call returns `201` with the node wrapped in a commit envelope:

```json
{
  "node": {
    "id": "fzpbHQs6kHJjK246z4n6a",
    "name": "hello-world",
    "path": "/articles/hello-world",
    "node_type": "raisin:Page",
    "archetype": null,
    "properties": {"title": "Hello World", "status": "draft"},
    "parent": "articles",
    "version": 1,
    "created_at": "2026-09-06T18:33:43.132065Z",
    "updated_at": "2026-09-06T18:33:43.132065Z",
    "created_by": "system",
    "updated_by": "system",
    "relations": []
  },
  "revision": "1788719623132-0",
  "committed": true
}
```

A root-level `POST` returns the bare node object. Optionally add `"commit": {"message": "...", "actor": "..."}` to the body to record a commit message and actor on the revision.

### Get a node

```bash
curl -s http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer $TOKEN"
```

Returns the node object. Reads add two bookkeeping properties, `$supertypes` and `$mixins`, alongside your own.

Useful query parameters on `GET`:

| Parameter | Effect |
|-----------|--------|
| `level=1` | Return the node's children instead of the node itself (`level=2` for two levels, and so on) |
| `deep=true` | Return the whole subtree |
| `format=array` | Children as an array instead of a map |
| `cursor`, `limit` | Keyset pagination of a listing (`limit` default 100, max 1000) |
| `lang=de` | Resolve translated properties for a locale |
| `command=download` / `command=display` | Stream the bytes of an asset node |

`GET .../content/` (trailing slash) lists the workspace root.

### Update a node

`PUT` replaces the node's `properties` with the body's `properties`. Send the full set you want to keep.

```bash
curl -s -X PUT http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"properties":{"title":"Hello World","status":"published"}}'
```

Returns the updated node. To change one property, address it with `@`:

```bash
curl -s -X PUT http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world@title \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '"Hello Again"'
# {"status":"property updated"}

curl -s http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world@title \
  -H "Authorization: Bearer $TOKEN"
# "Hello Again"
```

### Delete a node

```bash
curl -s -X DELETE http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer $TOKEN"
# {"deleted":true}
```

### Get a node by id

```bash
curl -s 'http://localhost:8080/api/repository/myapp/main/head/content/$ref/fzpbHQs6kHJjK246z4n6a' \
  -H "Authorization: Bearer $TOKEN"
```

### Read an earlier revision

Every write produces a revision id such as `1788719623132-0`. Read the node as it was then:

```bash
curl -s http://localhost:8080/api/repository/myapp/main/rev/1788719623132-0/content/articles/hello-world \
  -H "Authorization: Bearer $TOKEN"
```

Repository-wide revision listings are under `/api/management/repositories/{tenant}/{repo}/revisions`; see the [Branches API](../../reference/http-api/branches-api.md).

## Query nodes

### Simple JSON query

`POST .../{workspace}/query` with exactly one of `nodeType`, `parent` (a parent node **id**) or `path`, plus optional `limit` and `offset`:

```bash
curl -s -X POST http://localhost:8080/api/repository/myapp/main/head/content/query \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nodeType":"raisin:Page","limit":10}'
```

```json
{
  "items": [ { "id": "fzpbHQs6kHJjK246z4n6a", "path": "/articles/hello-world", "node_type": "raisin:Page", "properties": {...} } ],
  "page": {"total": 1, "limit": 10, "offset": 0, "nextOffset": null}
}
```

Results are sorted by path. For anything more than a type or parent filter, use SQL.

### SQL

`POST /api/sql/{repo}` (branch `main`) or `POST /api/sql/{repo}/{branch}`. The workspace is the table, quoted as a string. Parameters are `$1`, `$2`, ... in `params`.

```bash
curl -s -X POST http://localhost:8080/api/sql/myapp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT id, path, properties->>'"'"'title'"'"' AS title FROM '"'"'content'"'"' WHERE node_type = $1","params":["raisin:Page"]}'
```

```json
{
  "columns": ["id", "path", "title"],
  "rows": [{"id": "fzpbHQs6kHJjK246z4n6a", "path": "/articles/hello-world", "title": "Hello World"}],
  "row_count": 1,
  "execution_time_ms": 4
}
```

Rows are objects keyed by column name. Writes work the same way and report `affected_rows`:

```bash
curl -s -X POST http://localhost:8080/api/sql/myapp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"sql\":\"INSERT INTO 'content' (path, node_type, name, properties) VALUES ('/articles/second','raisin:Page','second','{\\\"title\\\":\\\"Second\\\"}'::jsonb)\"}"
# {"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,"execution_time_ms":2}
```

A syntax error returns `400`:

```json
{"code":"VALIDATION_FAILED","message":"Failed to execute SQL query: ... Expected: an SQL statement, found: SELEC at Line: 1, Column: 1","timestamp":"..."}
```

See the [SQL Reference](../../reference/sql/overview.md) for the language.

### Full-text search

```bash
curl -s -X POST http://localhost:8080/api/repository/myapp/main/fulltext/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"hello","workspace":"content","limit":10}'
```

```json
[{"node_id":"fzpbHQs6kHJjK246z4n6a","workspace_id":"content","name":"hello-world","path":"/articles/hello-world","node_type":"raisin:Page","score":16.795317}]
```

Optional fields: `language`, `shape_type`. Omit `workspace` to search the whole branch. Hybrid (text + vector) search is `FULLTEXT_SEARCH` / `HYBRID_SEARCH` in SQL, see [Full-Text Search](../querying/full-text-search.md).

## Repositories and workspaces

```bash
# repositories
curl -s http://localhost:8080/api/repositories -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:8080/api/repositories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"repo_id":"myapp","description":"My app","default_branch":"main","default_language":"en"}'
curl -s http://localhost:8080/api/repositories/myapp -H "Authorization: Bearer $TOKEN"

# workspaces
curl -s http://localhost:8080/api/workspaces/myapp -H "Authorization: Bearer $TOKEN"
curl -s -X PUT http://localhost:8080/api/workspaces/myapp/content \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"content","description":"Site content","allowed_node_types":["raisin:Folder","raisin:Page","raisin:Asset"],"allowed_root_node_types":["raisin:Folder","raisin:Page"]}'
```

A new repository comes with a `default` workspace and a `functions` workspace. `PUT /api/workspaces/{repo}/{name}` creates or updates a workspace; `GET /api/workspaces/{repo}/{name}` returns it, including `allowed_node_types`, `allowed_root_node_types` and `config`.

## Files and assets

- **Upload** binary content with the resumable upload endpoints (`POST /api/uploads`, then `PATCH` chunks, then `.../complete`). See [Uploads](../../reference/javascript-client/uploads.md#http-endpoints) for the HTTP sequence.
- **Download** an asset node's bytes with `GET .../{path}?command=download` (or `command=display` for inline), or `GET .../{path}@file`.
- **Signed URLs**: `POST .../{path}/raisin:sign` with `{"command":"download","expires_in":600}` returns a URL that works without a token until it expires.
- **Static sites**: `GET /resources/{repo}/{branch}/{ws}/{path}` serves a subtree like a file server. See the [Resource Serving API](../../reference/http-api/resource-serving-api.md).

## Other surfaces

| Area | Routes | Reference |
|------|--------|-----------|
| NodeTypes, archetypes, element types, mixins | `/api/management/{repo}/{branch}/nodetypes` etc. | [NodeTypes API](../../reference/http-api/nodetypes-api.md) |
| Branches, tags, revisions | `/api/management/repositories/{tenant}/{repo}/branches` etc. | [Branches API](../../reference/http-api/branches-api.md) |
| Functions and flows | `/api/functions/{repo}/{name}/invoke`, `/api/flows/{repo}/run` | [Functions API](../../reference/http-api/functions-api.md) |
| Packages | `POST /api/repos/{repo}/packages/upload`, `/api/packages/{repo}/{branch}/head/{path}` | [Packages](../packages/creating-packages.md) |
| Locks and inventory | `/api/{repo}/{branch}/locks/*`, `/inventory/*` | [Locks API](../../reference/http-api/locks-api.md) |
| Secrets | `/api/secrets/{repo}/{branch}` | [Secrets](../../concepts/secrets.md) |
| MCP | `/mcp/{repo}/{branch}/{slug}` | [MCP API](../../reference/http-api/mcp-api.md) |

## Errors

Errors carry a machine-readable `code`:

```json
{"code":"NODE_NOT_FOUND","message":"Node not found at path: /articles/missing","timestamp":"2026-09-06T18:33:43.183260+00:00"}
```

The query endpoints use a shorter form, `{"error":"BadRequest","message":"Provide one of: path, parent, nodeType"}`.

Status codes: `200` OK, `201` created, `400` invalid request or SQL, `401` missing or invalid token, `403` forbidden, `404` not found (also returned for nodes the caller may not read), `409` conflict, `422` body failed to deserialize, `500` server error.

There is no per-key request rate limit on the API. Magic-link requests are rate limited per email and per IP.

## Next steps

- [HTTP API Reference](../../reference/http-api/overview.md)
- [JavaScript Client](./javascript-client.md) for a typed SDK over the same endpoints
- [PostgreSQL Wire Protocol](./pgwire.md) for SQL from any Postgres driver
