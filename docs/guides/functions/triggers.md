---
sidebar_position: 2
---

# Triggers

Automatically execute functions in response to events.

## Node Triggers

Execute a function when nodes change:

```yaml
name: on-article-published
trigger_type: node_change
filter:
  node_type: Article
  operation: update
  properties:
    status:
      from: draft
      to: published
function: send-publication-notification
```

## Schedule Triggers

Execute on a schedule:

```yaml
name: daily-cleanup
trigger_type: schedule
cron: '0 2 * * *'  # 2 AM daily
function: cleanup-old-data
```

## Webhook Triggers

Execute on HTTP request:

```yaml
name: github-webhook
trigger_type: webhook
webhook_id: abc123
function: process-github-event
```

## Next Steps

- [Creating Functions](./creating-functions.md)
- [Execution Logs](./execution-logs.md)
