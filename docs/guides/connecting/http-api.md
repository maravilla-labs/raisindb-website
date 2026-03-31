---
sidebar_position: 2
---

# REST API Access

Use RaisinDB's REST API for full control over nodes, types, and graph operations.

## Base URL

```
http://localhost:8080/api
```

## Authentication

All API requests require authentication via one of these methods:

### Bearer Token

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/repositories
```

### API Key Header

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:8080/api/repositories
```

### Login to Get Token

```bash
curl -X POST http://localhost:8080/api/raisindb/sys/default/auth \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Node Operations

### Create a Node

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "Article",
    "properties": {
      "title": "Hello World",
      "status": "draft",
      "author": "John Doe"
    }
  }'
```

### Get a Node

```bash
curl http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "id": "01HQRS4T8K...",
  "node_type": "Article",
  "path": "/articles/hello-world",
  "properties": {
    "title": "Hello World",
    "status": "draft",
    "author": "John Doe"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "version": 1
}
```

### Update a Node

```bash
curl -X PUT \
  http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "status": "published"
    }
  }'
```

### Delete a Node

```bash
curl -X DELETE \
  http://localhost:8080/api/repository/myapp/main/head/content/articles/hello-world \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Node by ID

```bash
curl http://localhost:8080/api/repository/myapp/main/head/content/$ref/01HQRS4T8K... \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Query Nodes

### JSON Query

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/content/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "node_type": "Article",
      "properties.status": "published"
    },
    "limit": 10,
    "offset": 0
  }'
```

Response:

```json
{
  "nodes": [
    {
      "id": "01HQRS4T8K...",
      "node_type": "Article",
      "path": "/articles/hello-world",
      "properties": {
        "title": "Hello World",
        "status": "published"
      }
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

### Advanced Filtering

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/content/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "node_type": "Article",
      "properties.views": { "$gt": 1000 },
      "properties.tags": { "$contains": "technology" }
    },
    "sort": [
      { "field": "properties.views", "order": "desc" }
    ],
    "limit": 20
  }'
```

## SQL Execution

### Execute SQL Query

```bash
curl -X POST http://localhost:8080/api/sql/myapp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM nodes WHERE node_type = $1 LIMIT $2",
    "params": ["Article", 10]
  }'
```

Response:

```json
{
  "columns": ["id", "node_type", "path", "properties"],
  "rows": [
    ["01HQRS4T8K...", "Article", "/articles/hello-world", {...}]
  ],
  "row_count": 1
}
```

### Execute SQL with Branch

```bash
curl -X POST http://localhost:8080/api/sql/myapp/feature-branch \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM nodes WHERE node_type = '\''Article'\''"
  }'
```

## Full-Text Search

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/fulltext/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "raisindb graph database",
    "workspace": "content",
    "limit": 10
  }'
```

Response:

```json
{
  "results": [
    {
      "node": {
        "id": "01HQRS4T8K...",
        "path": "/articles/intro-to-raisindb",
        "properties": {
          "title": "Introduction to RaisinDB"
        }
      },
      "score": 0.95,
      "highlights": {
        "content": ["...the <em>RaisinDB graph database</em>..."]
      }
    }
  ],
  "total": 1
}
```

## Time Travel (Revisions)

### Get Node at Specific Revision

```bash
curl http://localhost:8080/api/repository/myapp/main/rev/01HQRS4T8K.../content/articles/hello-world \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Revisions

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/revisions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "revisions": [
    {
      "id": "01HQRS4T8K...",
      "timestamp": "2024-01-15T10:30:00Z",
      "author": "admin",
      "message": "Initial commit",
      "parent": null
    }
  ]
}
```

## NodeType Management

### Create NodeType

```bash
curl -X POST \
  http://localhost:8080/api/management/myapp/main/nodetypes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BlogPost",
    "label": "Blog Post",
    "description": "A blog post article",
    "element_types": {
      "title": {
        "label": "Title",
        "type": "text",
        "required": true
      },
      "content": {
        "label": "Content",
        "type": "richtext",
        "required": true
      },
      "author": {
        "label": "Author",
        "type": "text"
      }
    }
  }'
```

### List NodeTypes

```bash
curl http://localhost:8080/api/management/myapp/main/nodetypes \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get NodeType

```bash
curl http://localhost:8080/api/management/myapp/main/nodetypes/BlogPost \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update NodeType

```bash
curl -X PUT \
  http://localhost:8080/api/management/myapp/main/nodetypes/BlogPost \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "element_types": {
      "published_date": {
        "label": "Published Date",
        "type": "date"
      }
    }
  }'
```

## Branch Management

### Create Branch

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "feature-xyz",
    "from_branch": "main",
    "description": "Feature XYZ development"
  }'
```

### List Branches

```bash
curl http://localhost:8080/api/management/repositories/default/myapp/branches \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Merge Branches

```bash
curl -X POST \
  http://localhost:8080/api/management/repositories/default/myapp/branches/main/merge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_branch": "feature-xyz",
    "strategy": "fast-forward"
  }'
```

## Function Invocation

### Invoke Function

```bash
curl -X POST \
  http://localhost:8080/api/functions/myapp/send-welcome-email/invoke \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "email": "user@example.com"
  }'
```

Response:

```json
{
  "execution_id": "exec-abc123",
  "status": "completed",
  "result": {
    "success": true,
    "message_id": "msg-xyz789"
  },
  "duration_ms": 145
}
```

### List Function Executions

```bash
curl http://localhost:8080/api/functions/myapp/send-welcome-email/executions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Package Management

### Upload Package

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/packages/my-package-1.0.0 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @my-package-1.0.0.rap
```

### List Packages

```bash
curl http://localhost:8080/api/repos/myapp/packages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Install Package

```bash
curl -X POST \
  http://localhost:8080/api/repos/myapp/packages/my-package-1.0.0/install \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Workspace Management

### List Workspaces

```bash
curl http://localhost:8080/api/workspaces/myapp \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Workspace

```bash
curl -X PUT \
  http://localhost:8080/api/workspaces/myapp/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Product catalog workspace",
    "allowed_node_types": ["Product", "Category"]
  }'
```

## Error Handling

API errors return standard HTTP status codes with JSON error details:

```json
{
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node not found at path: /articles/missing",
    "details": {
      "path": "/articles/missing",
      "workspace": "content"
    }
  }
}
```

Common status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## Rate Limiting

API requests are rate-limited per API key:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642348800
```

## Next Steps

- [Full HTTP API Reference](../../reference/http-api/overview.md)
- [JavaScript Client](./javascript-client.md) for easier integration
- [NodeType API Reference](../../reference/http-api/nodetypes-api.md)
