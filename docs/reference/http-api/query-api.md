---
sidebar_position: 7
---

# Query API

Three ways to find nodes over HTTP: a simple JSON filter, a JSON filter DSL, and SQL. SQL is the most capable; use it for anything beyond a type, parent or path lookup.

## Simple JSON query

```
POST /api/repository/{repo}/{branch}/head/{workspace}/query
```

The body carries exactly one selector plus optional pagination:

| Field | Meaning |
|-------|---------|
| `nodeType` | All nodes of this type in the workspace |
| `parent` | Children of the node with this **id** |
| `path` | The node at this exact path |
| `limit`, `offset` | Pagination (default: everything) |

`path` takes precedence over the other two. With none of them the response is `400 {"error":"BadRequest","message":"Provide one of: path, parent, nodeType"}`.

```json
{"nodeType": "raisin:Page", "limit": 20, "offset": 0}
```

Response, sorted by path then id:

```json
{
  "items": [ { "id": "...", "path": "/articles/hello-world", "node_type": "raisin:Page", "properties": {...} } ],
  "page": {"total": 1, "limit": 20, "offset": 0, "nextOffset": null}
}
```

`nextOffset` is `null` on the last page.

## Filter DSL

```
POST /api/repository/{repo}/{branch}/head/{workspace}/query/dsl
```

A boolean tree of field filters, evaluated over the workspace's root-level nodes:

```json
{
  "and": [
    {"node_type": {"eq": "raisin:Folder"}},
    {"properties.title": {"like": "%Articles%"}}
  ],
  "order_by": {"path": "asc"},
  "limit": 10,
  "offset": 0
}
```

- Combinators: `and`, `or`, `not` (each takes filters of the same shape).
- Field operators: `eq`, `ne`, `like`, `contains`, `in`, `exists`, `gt`, `lt`, `gte`, `lte`.
- Fields address node columns (`path`, `name`, `node_type`) or `properties.<key>`.

The response has the same `{items, page}` shape as the simple query. Because only root-level nodes are evaluated, use SQL for filters over nested content.

## SQL

```
POST /api/sql/{repo}            (branch main)
POST /api/sql/{repo}/{branch}
```

```json
{"sql": "SELECT id, path, properties->>'title' AS title FROM 'content' WHERE node_type = $1 LIMIT 10", "params": ["raisin:Page"]}
```

The workspace is the table, written as a quoted string. Placeholders `$1`, `$2`, ... bind to `params`.

```json
{
  "columns": ["id", "path", "title"],
  "rows": [{"id": "fzpbHQs6kHJjK246z4n6a", "path": "/articles/hello-world", "title": "Hello World"}],
  "row_count": 1,
  "execution_time_ms": 4
}
```

Rows are objects keyed by column name. `EXPLAIN` statements add an `explain_plan` string. DML returns a single `affected_rows` column. Invalid SQL returns `400` with `code: "VALIDATION_FAILED"` and the parser message. A `SELECT` from a table name that is not a workspace returns no columns and no rows rather than an error.

See the [SQL Reference](../sql/overview.md).

## Full-text search

```
POST /api/repository/{repo}/{branch}/fulltext/search
```

```json
{"query": "raisindb database", "workspace": "content", "limit": 10, "language": "en"}
```

`workspace`, `limit`, `language` and `shape_type` are optional; without `workspace` the whole branch is searched.

```json
[
  {"node_id": "fzpbHQs6kHJjK246z4n6a", "workspace_id": "content", "name": "hello-world", "path": "/articles/hello-world", "node_type": "raisin:Page", "score": 16.795317}
]
```

Results are ranked by `score`. Fetch the node itself with `GET .../{workspace}/$ref/{node_id}`. For hybrid text and vector search use `HYBRID_SEARCH` in SQL, see [Full-Text Search](../../guides/querying/full-text-search.md).
