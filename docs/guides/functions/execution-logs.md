---
sidebar_position: 3
---

# Execution Logs

Monitor and debug function executions.

## View Execution Logs

```bash
curl http://localhost:8080/api/functions/myapp/send-welcome-email/executions \
  -H "Authorization: Bearer TOKEN"
```

Response:

```json
{
  "executions": [
    {
      "id": "exec-123",
      "status": "completed",
      "started_at": "2024-01-15T10:30:00Z",
      "completed_at": "2024-01-15T10:30:02Z",
      "duration_ms": 2145,
      "result": {
        "success": true
      }
    }
  ]
}
```

## Get Execution Details

```bash
curl http://localhost:8080/api/functions/myapp/send-welcome-email/executions/exec-123 \
  -H "Authorization: Bearer TOKEN"
```

Includes full logs and error traces.

## Next Steps

- [Creating Functions](./creating-functions.md)
- [Triggers](./triggers.md)
