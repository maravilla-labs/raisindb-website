---
sidebar_position: 1
---

# HTTP API Overview

Complete reference for the RaisinDB REST API.

## Base URL

```
http://localhost:8080/api
```

## Authentication

All requests require authentication:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/repositories
```

Or with API key:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:8080/api/repositories
```

## Response Format

Successful responses return JSON:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "req-abc123"
  }
}
```

Error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Node not found",
    "details": { ... }
  }
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## Rate Limiting

Requests are rate-limited:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642348800
```

## API Sections

- [Authentication](./authentication.md)
- [Nodes API](./nodes-api.md)
- [NodeTypes API](./nodetypes-api.md)
- [Branches API](./branches-api.md)
- [Functions API](./functions-api.md)
- [Query API](./query-api.md)
