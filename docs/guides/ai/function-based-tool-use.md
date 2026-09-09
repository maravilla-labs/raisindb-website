---
sidebar_position: 5
title: Function-Based Tool Use
description: Write serverless functions that AI agents can call as tools, using the raisin.* API
---

# Function-Based Tool Use

An AI agent in RaisinDB calls tools, and a tool is a function: a
`raisin:Function` node whose `input_schema` tells the model what arguments to
send and whose handler does the work. The same function can also be invoked
over HTTP, from SQL, or by a trigger. This guide covers what a tool function
looks like and what the `raisin.*` API lets it do; see
[Creating functions](/docs/guides/functions/creating-functions) for deploying
one.

## Writing a tool function

```yaml
# content/functions/lib/research/save-finding/.node.yaml
node_type: raisin:Function
properties:
  title: Save finding
  name: save_finding
  description: Store a research finding with a confidence score.
  language: javascript
  entry_file: index.js:handler
  execution_mode: both
  enabled: true
  input_schema:
    type: object
    required: [title, summary]
    properties:
      title: { type: string }
      summary: { type: string }
      confidence: { type: number, description: "0 to 1" }
```

```javascript
// content/functions/lib/research/save-finding/index.js
export function handler(input) {
  const node = raisin.nodes.createDeep('knowledge', '/research/findings', {
    name: input.title.toLowerCase().replace(/\s+/g, '-'),
    node_type: 'research:Finding',
    properties: {
      title: input.title,
      summary: input.summary,
      confidence: input.confidence ?? 0.5,
    },
  });
  return { saved: node.path };
}
```

The handler receives the model's arguments as `input` and its return value
goes back to the model as the tool result.

## Giving the tool to an agent

A `raisin:Agent` node lists the functions it may call in its `tools` array as
paths in the `functions` workspace. The function's `name` becomes the tool
name, its `description` the tool description, and its `input_schema` the tool's
parameter schema (a function without one is offered with no parameters).

```yaml
node_type: raisin:Agent
properties:
  title: Research assistant
  tools:
    - /lib/research/save_finding
    - /lib/research/search_knowledge
```

An entry may also be an object, which is how you reach a function in another
workspace or advertise it under a different name:

```yaml
  tools:
    - path: /lib/research/save_finding
    - path: /lib/shared/lookup
      workspace: shared
      alias: knowledge_lookup
      explicit: true
```

Only `path` is required. `workspace` defaults to `functions`, and `alias`
replaces the name the model sees, which is otherwise the function's own `name`.

Write the `description` for the model: it is what the model reads to decide
when to call the tool.

## The raisin.* API

Inside a function the `raisin` global gives access to the database. In
JavaScript the calls are synchronous.

### raisin.nodes

```javascript
export function handler(input) {
  // Read by path, or by id
  const node = raisin.nodes.get('knowledge', '/articles/my-post');
  const byId = raisin.nodes.getById('knowledge', node.id);

  // Children of a path (full node objects)
  const children = raisin.nodes.getChildren('knowledge', '/articles');

  // A filter object, when a path is not enough. Values are bound, not
  // interpolated. Reach for raisin.sql.query() for anything richer.
  const published = raisin.nodes.query('knowledge', {
    nodeType: 'research:Finding',
    descendantOf: '/research',
    properties: { status: 'published' },
    orderBy: 'created_at',
    order: 'desc',
    limit: 20,
  });

  // Create under a parent path: create(workspace, parentPath, data)
  raisin.nodes.create('knowledge', '/research/findings', {
    name: 'new-finding',
    node_type: 'research:Finding',
    properties: { title: input.title, summary: input.summary },
  });

  // Same, but create any missing ancestor folders first
  // (they default to raisin:Folder; pass a 4th argument to change that)
  raisin.nodes.createDeep('knowledge', '/research/2026/q3', {
    name: 'new-finding',
    node_type: 'research:Finding',
    properties: { title: input.title },
  });

  // Merge properties into a node; properties you do not name are kept
  raisin.nodes.update('knowledge', '/articles/my-post', {
    properties: { status: 'reviewed', reviewed_at: new Date().toISOString() },
  });

  // Delete
  raisin.nodes.delete('knowledge', '/articles/old-post');

  return { children: children.length };
}
```

For anything that filters or searches, use SQL.

### raisin.sql

`query` returns an array of row objects; `execute` returns the number of
affected rows. Bind values with `$1`, `$2`, … rather than interpolating them.

```javascript
export function handler(input) {
  const rows = raisin.sql.query(
    "SELECT id, name, properties->>'title'::String AS title FROM 'knowledge' WHERE node_type = $1",
    ['research:Finding']
  );

  const affected = raisin.sql.execute(
    "UPDATE 'knowledge' SET properties = properties || '{\"reviewed\":true}'::jsonb WHERE path = $1",
    [input.path]
  );

  return { count: rows.length, affected };
}
```

A failing query does not throw: `query` returns `{ error, rows: [] }` and
`execute` returns `-1`.

### raisin.http

Outbound requests go through `raisin.http.fetch(url, options)` with `method`,
`headers` and `body` (an object is sent as JSON). The response has `status`,
`headers` and `body`. The standard `fetch()` is also available and returns a
`Response` you can `await`.

`raisin.http.request(method, url, options)` and the shorthands
`raisin.http.get`, `post`, `put`, `patch` and `delete` are the same call with
the method filled in, and they fail the same way: a failed request resolves to
`{ error, status: 0, ok: false }` rather than throwing.

```javascript
export async function handler(input) {
  const res = raisin.http.fetch('https://api.example.com/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { text: input.message },
  });
  if (res.status !== 200) return { error: res.error ?? `status ${res.status}` };

  const alt = await fetch('https://api.example.com/health');
  return { entities: res.body, healthy: alt.ok };
}
```

The function's node must allow the destination:

```yaml
  network_policy:
    http_enabled: true
    allowed_urls: ["https://api.example.com/**"]
```

A request outside `allowed_urls` returns `{ error, status: 0, ok: false }`
without leaving the server. Loopback and private addresses are always refused.

### raisin.events

```javascript
export function handler(input) {
  const ok = raisin.events.emit('research.complete', {
    taskId: input.taskId,
    findingCount: 5,
  });
  return { emitted: ok };
}
```

`emit` returns `true` when the event was published. Events can drive other
functions and workflows.

### raisin.context

`raisin.context` is an object with `tenant_id`, `repo_id`, `branch`,
`workspace_id`, `actor` and `execution_id`, so a function knows who and where
it is running for.

## Sandboxed execution

Functions run in a QuickJS sandbox with these defaults:

| Resource | Default | Where to change |
|----------|---------|-----------------|
| Memory | 128 MiB | `resource_limits.max_memory_bytes` on the node |
| Execution time | 30 seconds | `resource_limits.timeout_ms` on the node |
| Concurrent executions | 15 per server | `RAISIN_MAX_CONCURRENT_FUNCTIONS` environment variable |

A function that exceeds its limits is stopped and the call returns an error.

## Other ways a function runs

Besides being a tool, the same function node can be started by a
[trigger](/docs/guides/functions/triggers): on node events (`created`,
`updated`, `deleted`, with workspace, path, node type and property filters),
on a cron schedule, or through an HTTP endpoint at
`/api/triggers/{repo}/{name}`. From SQL, `INVOKE_SYNC('save_finding',
'{"title": "..."}'::jsonb)` runs it inline and
[`INVOKE`](/docs/reference/sql/functions/invoke-functions) queues it.

## Example: processing a message

A function an agent calls to store a message, look up related knowledge and
record what it found:

```javascript
export function handler(input) {
  const { message, conversationId } = input;

  // 1. Store the message
  raisin.nodes.createDeep('chat', `/conversations/${conversationId}/messages`, {
    name: `msg-${Date.now()}`,
    node_type: 'chat:Message',
    properties: { content: message, role: 'user', timestamp: new Date().toISOString() },
  });

  // 2. Find related knowledge (see the search guides for full-text and vector queries)
  const context = raisin.sql.query(
    "SELECT path, properties->>'title'::String AS title FROM 'knowledge' WHERE node_type = $1 LIMIT 5",
    ['research:Finding']
  );

  // 3. Ask an external service for entities
  const extraction = raisin.http.fetch('https://api.example.com/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { text: message },
  });
  const entities = extraction.status === 200 ? extraction.body.items : [];

  // 4. Store them
  for (const entity of entities) {
    raisin.nodes.createDeep('chat', `/conversations/${conversationId}/entities`, {
      name: entity.name.toLowerCase().replace(/\s+/g, '-'),
      node_type: 'research:Entity',
      properties: { name: entity.name, type: entity.type, confidence: entity.confidence },
    });
  }

  // 5. Tell downstream processing
  raisin.events.emit('message.processed', { conversationId, entityCount: entities.length });

  return { entitiesFound: entities.length, contextChunks: context.length };
}
```

## Starlark functions

Functions can also be written in Starlark, a Python-like language, with the
same API under snake_case names (`raisin.nodes.get_children`,
`raisin.sql.query`). Errors stop the handler instead of being returned. It
suits small, deterministic transformations.

```python
def handler(input):
    rows = raisin.sql.query("SELECT path FROM 'knowledge' WHERE node_type = $1", ["research:Finding"])
    return {"count": len(rows)}
```

## Workflow integration

Functions are also the steps of workflows in the flow runtime, which adds AI
agent loops with tool calls, human-in-the-loop approval steps, decisions,
parallel branches and retries. See the workflow guides for composing
functions into multi-step agents.

## Next steps

- [Agent memory with branches](./agent-memory-with-branches.md)
- [RAG patterns](./rag-patterns.md)
- [AI provider configuration](./ai-provider-configuration.md)
