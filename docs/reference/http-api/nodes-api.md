---
sidebar_position: 3
---

# Nodes API

CRUD operations for nodes.

## Create Node

```bash
POST /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

Request:

```json
{
  "node_type": "Article",
  "properties": {
    "title": "Hello World",
    "content": "..."
  }
}
```

Response: Created node object

## Get Node

```bash
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

## Update Node

```bash
PUT /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

Request:

```json
{
  "properties": {
    "title": "Updated Title"
  }
}
```

## Delete Node

```bash
DELETE /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

## Get by ID

```bash
GET /api/repository/{repo}/{branch}/head/{workspace}/$ref/{id}
```

## Time Travel

Get node at specific revision:

```bash
GET /api/repository/{repo}/{branch}/rev/{revision}/{workspace}/{path}
```

## Revision History

List a node's revisions (git-style "file history"), newest first. Always available
regardless of the NodeType `auditable` flag — this is the structural MVCC history.

```bash
GET /api/history/{repo}/{branch}/{workspace}/by-id/{id}?limit=50
GET /api/history/{repo}/{branch}/{workspace}/{path}?limit=50
```

Response — each entry carries the `revision` (usable with the `rev/{revision}`
time-travel read above to fetch the full snapshot), plus who/when and whether the
node was deleted at that revision:

```json
[
  { "revision": "1718553600000-0", "updated_at": "…", "updated_by": "alice", "deleted": false },
  { "revision": "1718553500000-0", "updated_at": "…", "updated_by": "bob",   "deleted": false }
]
```

## Audit Log

Query a node's audit-log entries. Audit logs are only produced for NodeTypes marked
`auditable: true` (see [NodeTypes → Auditable](/docs/concepts/data-model/nodetypes#auditable)).

```bash
GET /api/audit/{repo}/{branch}/{workspace}/by-id/{id}
GET /api/audit/{repo}/{branch}/{workspace}/{path}
```

```json
[
  { "action": "Update", "user_id": "alice", "timestamp": "…", "path": "/content/page", "details": null }
]
```

Both history and audit reads are authorized through row-level security — you only
get results for nodes you can read.
