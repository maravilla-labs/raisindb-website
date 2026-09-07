---
sidebar_position: 1
---

# HTTP API Overview

Reference for the RaisinDB REST API. For a walkthrough with worked examples, see [REST API Access](../../guides/connecting/http-api.md).

## Base URL

```
http://localhost:8080
```

| Prefix | Purpose |
|--------|---------|
| `/api/...` | Content, query, SQL, management and admin routes |
| `/auth/...` | End-user (identity) authentication |
| `/resources/...` | Static-site serving of node subtrees |
| `/mcp/...` | MCP server endpoints |
| `/ws`, `/ws/{repo}` | WebSocket endpoint used by the JavaScript client |
| `/admin` | Admin console |
| `/health` | Liveness check, returns the text `ok` |

## Authentication

Every request carries a bearer token:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/repositories
```

The token is either a login JWT (admin or identity) or an API key of the form `raisin_...`. Both use the same header. API keys are accepted on content, query, SQL and repository routes; the profile routes under `/api/raisindb/me` require a login JWT. Without a token a request runs as the anonymous principal, which only has access when `anonymous_enabled` is set in the server configuration and the `anonymous` role grants it.

See [Authentication](./authentication.md).

## Response format

Successful responses return the resource directly, with no envelope. A node read returns the node object; a listing returns an array; the query endpoints return `{"items": [...], "page": {...}}`; SQL returns `{"columns", "rows", "row_count", "execution_time_ms"}`.

Error responses:

```json
{
  "code": "NODE_NOT_FOUND",
  "message": "Node not found at path: /articles/missing",
  "timestamp": "2026-09-06T18:33:43.183260+00:00"
}
```

The JSON query endpoints use `{"error": "BadRequest", "message": "..."}` instead. A body that fails to deserialize returns `422` with a plain-text message naming the missing field.

## Status codes

- `200` success
- `201` created
- `400` bad request, including SQL validation errors
- `401` missing or invalid token
- `403` forbidden
- `404` not found, also used for nodes the caller is not permitted to read
- `409` conflict
- `422` request body could not be deserialized
- `500` internal error

## Rate limiting

There is no general per-token rate limit. Magic-link requests are limited per email address and per client IP.

## API sections

- [Authentication](./authentication.md)
- [Nodes API](./nodes-api.md)
- [NodeTypes API](./nodetypes-api.md)
- [Branches API](./branches-api.md)
- [Functions API](./functions-api.md)
- [Query API](./query-api.md)
- [Locks API](./locks-api.md)
- [MCP API](./mcp-api.md)
- [MCP Connections API](./mcp-connections-api.md)
- [Resource Serving API](./resource-serving-api.md)

Asset-processing rules (`/api/repository/{repo}/ai/rules`) and the server capability report (`/api/admin/management/plugins`) are documented with the feature they belong to, in [Asset Processing](../../guides/ai/asset-processing.md#http-api).
