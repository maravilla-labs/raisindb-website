---
sidebar_position: 7
---

# Query API

Query nodes with JSON filters and SQL.

## JSON Query

```bash
POST /api/repository/{repo}/{branch}/head/{workspace}/query
```

Request:

```json
{
  "filter": {
    "node_type": "Article",
    "properties.status": "published"
  },
  "limit": 20,
  "offset": 0
}
```

## Execute SQL

```bash
POST /api/sql/{repo}
```

Request:

```json
{
  "query": "SELECT * FROM nodes WHERE node_type = $1 LIMIT $2",
  "params": ["Article", 10]
}
```

Response:

```json
{
  "columns": ["id", "path", "properties"],
  "rows": [...],
  "row_count": 10
}
```

## Full-Text Search

```bash
POST /api/repository/{repo}/{branch}/fulltext/search
```

Request:

```json
{
  "query": "raisindb database",
  "workspace": "content",
  "limit": 10
}
```
