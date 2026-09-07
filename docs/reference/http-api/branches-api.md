---
sidebar_position: 5
---

# Branches API

Branch, tag and revision endpoints live under the management prefix and are
addressed by tenant and repository. All requests need `Authorization: Bearer <token>`.

```
/api/management/repositories/{tenant}/{repo}/...
```

## Branches

### Create branch

```
POST /api/management/repositories/{tenant}/{repo}/branches
```

```json
{
  "name": "feature-xyz",
  "upstream_branch": "main",
  "from_revision": "1788719729588-0",
  "created_by": "alice",
  "protected": false,
  "include_revision_history": true
}
```

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | Branch name |
| `upstream_branch` | no | Branch to fork from and to compare against by default. With no `from_revision`, the fork happens at this branch's current head |
| `from_revision` | no | Fork at this revision instead of the head |
| `created_by` | no | Actor recorded on the branch; default `system` |
| `protected` | no | Create the branch protected; default `false` |
| `include_revision_history` | no | Copy the source's commit log in a background job; default `true` |

With neither `upstream_branch` nor `from_revision` the branch is created empty
with head `0-0`. Returns `201 Created` with the branch record:

```json
{
  "name": "feature-xyz",
  "head": "1788719729588-0",
  "created_at": "2026-09-06T18:35:41.856317Z",
  "created_by": "alice",
  "created_from": "1788719729588-0",
  "upstream_branch": "main",
  "protected": false,
  "description": null
}
```

### List branches

```
GET /api/management/repositories/{tenant}/{repo}/branches
```

Returns an array of branch records.

### Get branch

```
GET /api/management/repositories/{tenant}/{repo}/branches/{name}
```

Returns the branch record, or `404` with code `BRANCH_NOT_FOUND`.

### Delete branch

```
DELETE /api/management/repositories/{tenant}/{repo}/branches/{name}
```

Returns `204 No Content`. A protected branch answers `403` with
`Cannot delete protected branch '{name}'`.

### Get and set head

```
GET /api/management/repositories/{tenant}/{repo}/branches/{name}/head
PUT /api/management/repositories/{tenant}/{repo}/branches/{name}/head
```

`GET` returns `{"revision": "1788719765785-0"}`. `PUT` takes
`{"revision": "1788719765785-0"}` and moves the head to that revision
unconditionally, forward or back; it returns `204`. Use it for rollback. A
protected branch returns `403`.

### Set upstream

```
PATCH /api/management/repositories/{tenant}/{repo}/branches/{name}/upstream
```

Body `{"upstream_branch": "develop"}`, or `{"upstream_branch": null}` to clear.
Returns the updated branch record. The upstream must exist.

### Compare branches

```
GET /api/management/repositories/{tenant}/{repo}/branches/{branch}/compare/{base_branch}
```

```json
{ "ahead": 2, "behind": 1, "common_ancestor": "1788719729588-0" }
```

`ahead` counts commits on `branch` that `base_branch` lacks; `behind` the
reverse.

### Diff branches

Per-node changes of a branch relative to a base branch since they diverged.
Cost scales with the size of the change, not the repository.

```
GET /api/management/repositories/{tenant}/{repo}/branches/{branch}/diff/{base_branch}
```

```json
{
  "common_ancestor": "1788719729588-0",
  "added":    [{ "node_id": "f29d5b20-...", "workspace": "content", "path": "/feature-only", "operation": "added" }],
  "modified": [{ "node_id": "260584c1-...", "workspace": "content", "path": "/hello", "operation": "modified" }],
  "deleted":  []
}
```

`operation` is `added`, `modified`, `reordered` or `deleted`; reordered nodes
are listed under `modified`. A change to a translation carries a
`translation_locale`. `path` is `null` when only a tombstone remains.

### Merge

```
POST /api/management/repositories/{tenant}/{repo}/branches/{target_branch}/merge
```

```json
{
  "source_branch": "feature-xyz",
  "strategy": "ThreeWay",
  "message": "Merge feature-xyz",
  "actor": "alice"
}
```

All four fields are required. `strategy` is `ThreeWay` or `FastForward`.

```json
{ "success": true, "revision": 1788719765785, "conflicts": [], "fast_forward": false, "nodes_changed": 2 }
```

`revision` is the millisecond part of the merge commit's revision. When a
three-way merge finds conflicts, `success` is `false`, `revision` is `null`
and `conflicts` lists them:

```json
{
  "node_id": "260584c1-...",
  "path": "",
  "conflict_type": "BothModified",
  "base_properties":   { "title": "Hello v3" },
  "target_properties": { "title": "Title from main" },
  "source_properties": { "title": "Title from feature" }
}
```

`conflict_type` is `BothModified`, `BothAdded`, `DeletedBySourceModifiedByTarget`
or `ModifiedBySourceDeletedByTarget`. A fast-forward that is not possible
returns a validation error; a protected target returns `403`.

### Resolve merge

```
POST /api/management/repositories/{tenant}/{repo}/branches/{target_branch}/resolve-merge
```

```json
{
  "source_branch": "feature-xyz",
  "resolutions": [{
    "node_id": "260584c1-...",
    "resolution_type": "keep-theirs",
    "resolved_properties": { "title": "Title from feature" },
    "translation_locale": null
  }],
  "message": "Merge feature-xyz (resolved)",
  "actor": "alice"
}
```

`resolution_type` is `keep-ours`, `keep-theirs` or `manual`;
`resolved_properties` are the node's final properties. Returns the same merge
result shape with `success: true`. A resolution for a node that was not
changed on both branches is rejected.

Compare, diff, merge, resolve-merge and upstream require the RocksDB storage
backend (the default).

## Tags

### Create tag

```
POST /api/management/repositories/{tenant}/{repo}/tags
```

```json
{ "name": "v1.0", "revision": "1788719765785-0", "message": "First release", "created_by": "alice", "protected": false }
```

`name` and `revision` are required. Returns `201` with the tag record:

```json
{ "name": "v1.0", "revision": "1788719765785-0", "created_at": "2026-09-06T18:36:05.935331Z",
  "created_by": "alice", "message": "First release", "protected": false }
```

### List, get, delete

```
GET    /api/management/repositories/{tenant}/{repo}/tags
GET    /api/management/repositories/{tenant}/{repo}/tags/{name}
DELETE /api/management/repositories/{tenant}/{repo}/tags/{name}
```

Delete returns `204`, or `404` when the tag does not exist. A protected tag
cannot be deleted. Read content at a tag through the `rev/{revision}` node
endpoints below.

## Revisions

### List revisions

```
GET /api/management/repositories/{tenant}/{repo}/revisions?limit=50&offset=0&branch=main&include_system=false
```

Returns commits newest first. `branch` keeps only commits made on that branch
and at or below its head; `include_system=true` adds system commits.

```json
{
  "revisions": [{
    "revision": "1788719765785-0",
    "parent": "1788719744056-0",
    "merge_parent": "1788719742050-0",
    "branch": "main",
    "timestamp": "2026-09-06T18:36:05.785549Z",
    "actor": "alice",
    "message": "Merge feature",
    "is_system": false,
    "changed_nodes": [{ "node_id": "260584c1-...", "workspace": "content", "operation": "modified" }],
    "changed_node_types": [], "changed_archetypes": [], "changed_element_types": []
  }],
  "total": 1,
  "has_more": false
}
```

### Get revision and its changes

```
GET /api/management/repositories/{tenant}/{repo}/revisions/{revision}
GET /api/management/repositories/{tenant}/{repo}/revisions/{revision}/changes
```

The first returns one revision record; the second returns its node changes as
`[{ "node_id": "...", "operation": "added" }]`. The revision must be the full
`timestamp-counter` string, otherwise `400` with `Invalid revision`.

## Reading content on a branch or at a revision

These are content endpoints, outside the management prefix. The branch is the
second segment; `head` reads the branch head and `rev/{revision}` reads a
point in time.

```
GET /api/repository/{repo}/{branch}/head/{ws}/{path}
GET /api/repository/{repo}/{branch}/head/{ws}/$ref/{id}
GET /api/repository/{repo}/{branch}/rev/{revision}/{ws}/
GET /api/repository/{repo}/{branch}/rev/{revision}/{ws}/{path}
GET /api/repository/{repo}/{branch}/rev/{revision}/{ws}/$ref/{id}
```

Node writes (`POST`, `PUT`, `DELETE` on `.../head/{ws}/{path}`) and SQL
(`POST /api/sql/{repo}/{branch}`) take the branch the same way.

### Node history

```
GET /api/history/{repo}/{branch}/{ws}/{path}?limit=50
GET /api/history/{repo}/{branch}/{ws}/by-id/{id}?limit=50
```

Returns a node's revisions newest first, each with `revision`, `updated_at`,
`updated_by`, `deleted`, `message` and `is_system`. The same listing is
available over WebSocket as `node_history` and in the JavaScript client as
`nodes().history()` / `nodes().historyByPath()`.
