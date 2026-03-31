---
sidebar_position: 6
---

# Functions API

Manage and invoke serverless functions.

## List Functions

```bash
GET /api/functions/{repo}
```

## Get Function

```bash
GET /api/functions/{repo}/{name}
```

## Invoke Function

```bash
POST /api/functions/{repo}/{name}/invoke
```

Request:

```json
{
  "user_id": "user-123",
  "email": "user@example.com"
}
```

Response:

```json
{
  "execution_id": "exec-abc123",
  "status": "completed",
  "result": {
    "success": true
  },
  "duration_ms": 145
}
```

## List Executions

```bash
GET /api/functions/{repo}/{name}/executions
```

## Get Execution

```bash
GET /api/functions/{repo}/{name}/executions/{execution_id}
```
