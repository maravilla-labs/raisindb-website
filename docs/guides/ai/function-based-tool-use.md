---
sidebar_position: 5
title: Function-Based Tool Use
description: Write serverless functions that AI agents can call as tools, using the raisin.* API
---

# Function-Based Tool Use

RaisinDB includes a serverless function runtime that lets you write JavaScript functions your AI agents can call as tools. Functions run in a sandboxed environment with access to the full RaisinDB API — reading nodes, executing SQL, making HTTP requests, and emitting events.

## Writing a Function

Functions are JavaScript async handlers stored as nodes in RaisinDB:

```javascript
async function handler(input) {
  // Your logic here
  return { result: "done" };
}
```

The `input` parameter contains whatever the caller passes. The return value is sent back to the caller.

## The raisin.* API

Inside a function, you have access to four API modules:

### raisin.nodes — Content Operations

```javascript
async function handler(input) {
  // Read a node by workspace and path
  const node = await raisin.nodes.get("default", "/articles/my-post");

  // Get a node by ID
  const byId = await raisin.nodes.getById("default", "node-uuid-123");

  // Get children of a path
  const children = await raisin.nodes.getChildren("default", "/articles");

  // Create a new node
  await raisin.nodes.create("default", {
    name: "new-finding",
    path: "/research/findings",
    node_type: "research:Finding",
    properties: {
      title: input.title,
      summary: input.summary,
      confidence: 0.85
    }
  });

  // Update a node's properties
  await raisin.nodes.update("default", "/articles/my-post", {
    properties: { status: "reviewed", reviewed_at: new Date().toISOString() }
  });

  // Delete a node
  await raisin.nodes.delete("default", "/articles/old-post");

  // Query nodes
  const results = await raisin.nodes.query("default", {
    node_type: "research:Finding",
    path_prefix: "/research/"
  });

  return { found: results.length };
}
```

### raisin.sql — SQL Queries

```javascript
async function handler(input) {
  // Execute a SELECT query
  const results = await raisin.sql.query(
    "SELECT id, name, properties->>'title'::String AS title FROM 'default' WHERE node_type = $1",
    ["article"]
  );

  // Execute a write operation
  await raisin.sql.execute(
    "INSERT INTO 'default' (name, path, node_type, properties) VALUES ($1, $2, $3, $4)",
    ["new-item", "/items", "item:Task", '{"status": "pending"}']
  );

  return { count: results.length };
}
```

### raisin.http — External HTTP Requests

```javascript
async function handler(input) {
  // GET request
  const data = await raisin.http.get("https://api.example.com/data");

  // POST request with body
  const response = await raisin.http.post("https://api.example.com/webhook", {
    body: JSON.stringify({ event: "processed", id: input.nodeId }),
    headers: { "Content-Type": "application/json" }
  });

  // PUT and DELETE also available
  await raisin.http.put("https://api.example.com/items/123", { body: '{"status": "done"}' });
  await raisin.http.delete("https://api.example.com/items/456");

  return { status: response.status };
}
```

HTTP endpoints must be allowlisted in your function configuration to prevent unauthorized outbound calls.

### raisin.events — Event System

```javascript
async function handler(input) {
  // Emit a custom event
  await raisin.events.emit("research.complete", {
    taskId: input.taskId,
    findingCount: 5,
    confidence: 0.91
  });

  return { emitted: true };
}
```

Events can trigger other functions or workflows, enabling event-driven agent architectures.

## Sandboxed Execution

Functions run in a QuickJS sandbox with configurable resource limits:

| Resource | Default | Description |
|----------|---------|-------------|
| Memory | 128 MB | Maximum heap size |
| Execution time | 30 seconds | Maximum wall-clock time |
| Concurrent executions | 15 | Global concurrency limit |

These limits prevent runaway functions from affecting the server. If a function exceeds its limits, it is terminated and returns an error.

The concurrency limit is controlled by the `RAISIN_MAX_CONCURRENT_FUNCTIONS` environment variable.

## Trigger Patterns

Functions can be triggered in four ways:

### Event Triggers

React to node changes automatically:

```yaml
# Function definition
name: process-new-article
trigger:
  type: event
  event: node.created
  filter:
    node_type: "article"
    workspace: "content"
```

```javascript
async function handler(input) {
  // input.node contains the created node
  const article = input.node;

  // Extract entities, generate summary, etc.
  const summary = article.properties.content.substring(0, 200) + "...";

  await raisin.nodes.update("default", article.path, {
    properties: { auto_summary: summary, processed: true }
  });

  return { processed: article.id };
}
```

### HTTP Triggers

Expose functions as API endpoints:

```yaml
name: search-knowledge
trigger:
  type: http
  method: POST
  path: /api/functions/search
```

```javascript
async function handler(input) {
  const results = await raisin.sql.query(
    `SELECT id, properties->>'content'::String AS content, __distance
     FROM 'knowledge'
     WHERE VECTOR_SEARCH(embedding, $1, 5)
     ORDER BY __distance ASC`,
    [input.queryVector]
  );

  return { results };
}
```

### Schedule Triggers

Run functions on a cron schedule:

```yaml
name: nightly-enrichment
trigger:
  type: schedule
  cron: "0 2 * * *"  # Every day at 2 AM
```

### SQL Triggers

Call functions from SQL queries:

```sql
SELECT * FROM search_knowledge('what is vector search?')
```

## Example: Agent That Processes Messages

A complete example of a function that an AI agent calls to process incoming messages, extract entities, and store findings:

```javascript
async function handler(input) {
  const { message, conversationId } = input;

  // 1. Store the message
  await raisin.nodes.create("default", {
    name: `msg-${Date.now()}`,
    path: `/conversations/${conversationId}/messages`,
    node_type: "chat:Message",
    properties: {
      content: message,
      role: "user",
      timestamp: new Date().toISOString()
    }
  });

  // 2. Search for relevant context
  const context = await raisin.sql.query(
    `SELECT properties->>'content'::String AS content, __distance
     FROM 'knowledge'
     WHERE VECTOR_SEARCH(embedding, $1, 5)
     ORDER BY __distance ASC`,
    [input.messageEmbedding]
  );

  // 3. Call external AI for entity extraction
  const extraction = await raisin.http.post("https://api.example.com/extract", {
    body: JSON.stringify({ text: message }),
    headers: { "Content-Type": "application/json" }
  });

  // 4. Store extracted entities as nodes
  const entities = JSON.parse(extraction.body);
  for (const entity of entities.items) {
    await raisin.nodes.create("default", {
      name: entity.name.toLowerCase().replace(/\s+/g, '-'),
      path: `/conversations/${conversationId}/entities`,
      node_type: "research:Entity",
      properties: {
        name: entity.name,
        type: entity.type,
        confidence: entity.confidence,
        source_message: message
      }
    });
  }

  // 5. Emit event for downstream processing
  await raisin.events.emit("message.processed", {
    conversationId,
    entityCount: entities.items.length,
    contextRelevance: context.length > 0 ? context[0].__distance : null
  });

  return {
    entitiesFound: entities.items.length,
    contextChunks: context.length
  };
}
```

## Starlark Functions

In addition to JavaScript, RaisinDB supports Starlark (a Python-like language) for functions that need a more constrained execution model. Starlark is deterministic and has no I/O by default, making it suitable for pure data transformation tasks.

## Workflow Integration

Functions can be composed into multi-step workflows using the flow runtime. Workflows support:

- **AI agent loops** with tool calls
- **Human-in-the-loop** steps that pause for approval
- **Decision trees** with branching logic
- **Parallel execution** of multiple steps
- **Error handling** with retry and compensation

See the flow runtime documentation for details on composing functions into complex agent workflows.

## Next Steps

- [Agent Memory with Branches](./agent-memory-with-branches.md) — combine functions with branch isolation
- [RAG Patterns](./rag-patterns.md) — build RAG pipelines using functions
- [AI Provider Configuration](./ai-provider-configuration.md) — configure the AI models your functions use
