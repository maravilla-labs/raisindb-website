---
sidebar_position: 4
---

# Schema Management

The `@raisindb/client` package manages **NodeTypes**, **Archetypes** and **ElementTypes** at runtime: list, read, create, update, delete, publish, and resolve inheritance. Both clients expose the same three accessors on a database handle:

```typescript
import { RaisinClient, RaisinHttpClient } from '@raisindb/client';

// WebSocket client
const client = new RaisinClient('raisin://localhost:8090/sys/default');
await client.connect();
await client.authenticate({ username: 'admin', password: '...' });
const db = client.database('docs-model');

// HTTP client (server-side rendering, scripts)
const http = new RaisinHttpClient('http://localhost:8090');
await http.authenticate({ username: 'admin', password: '...' });
const hdb = http.database('docs-model');

db.nodeTypes();     // NodeTypes        (HttpNodeTypes on the HTTP client)
db.archetypes();    // Archetypes       (HttpArchetypes)
db.elementTypes();  // ElementTypes     (HttpElementTypes)
```

The WebSocket accessors send schema requests over the realtime protocol; the HTTP accessors call the management REST API (`/api/management/{repo}/{branch}/{nodetypes|archetypes|elementtypes}`). Method names match across both, so call sites can switch transports.

## Methods

Every accessor exposes this surface. Definitions and results are plain objects (`Record<string, unknown>` in, `unknown` out); the shapes are the ones the server stores, see [NodeTypes](/docs/concepts/data-model/nodetypes), [Archetypes](/docs/concepts/data-model/archetypes) and [Elements](/docs/concepts/data-model/elements).

| Method | WebSocket | HTTP |
|--------|-----------|------|
| `list(publishedOnly = false)` | `list(publishedOnly?)` | `list(publishedOnly?)` |
| `get(name)` | `get(name)` | `get(name)` |
| `getResolved(name)` | `getResolved(name)` | `getResolved(name, { workspace? })` on NodeTypes; `getResolved(name)` on the others |
| `create(name, definition)` | `create(name, definition)` | `create(name, definition, commit?)` |
| `update(name, definition)` | `update(name, definition)` | `update(name, definition, commit?)` |
| `delete(name)` | `delete(name)` | `delete(name, commit?)` |
| `publish(name)` | `publish(name)` | `publish(name, commit?)` |
| `unpublish(name)` | `unpublish(name)` | `unpublish(name, commit?)` |
| `validate(node)` | NodeTypes only | not available |

The `name` argument is merged into the definition, so you do not repeat it inside `definition`:

```typescript
const nodeTypes = hdb.nodeTypes();

await nodeTypes.create(
  'blog:Comment',
  { properties: [{ name: 'body', type: 'String', required: true }] },
  { message: 'Add comment type', actor: 'jane' }
);
await nodeTypes.publish('blog:Comment', { message: 'Publish', actor: 'jane' });

const published = await nodeTypes.list(true);   // [{ name: 'blog:Article', ... }, ...]
const one = await nodeTypes.get('blog:Comment');  // { name: 'blog:Comment', version: 2, published_by: 'jane', ... }
await nodeTypes.delete('blog:Comment');
```

`list()` returns an array; `get()` rejects with an error when the name does not exist (`Invalid request: Node type not found: blog:Comment` over WebSocket, an HTTP error with code `NODE_TYPE_NOT_FOUND` over HTTP).

:::note Commit metadata
`commit` is `{ message: string; actor?: string }` and is only accepted by the **HTTP** client, where it becomes the revision message and author. Without it the server records a generated message and the `system` actor. The WebSocket client always commits schema writes as `system`.
:::

### `validate(node)` (WebSocket, NodeTypes only)

Sends the node to the server's write-time checks without storing it. The server requires a workspace in the request context for this call, and `db.nodeTypes()` sends none, so in the current client the call fails with `Invalid request: Workspace required`. Until that is wired, validate over HTTP with `POST /api/management/{repo}/{branch}/nodetypes/validate` (see the [NodeTypes API](/docs/reference/http-api/nodetypes-api#validate-a-node)).

## Resolving inheritance: `getResolved()`

NodeTypes, Archetypes and ElementTypes can `extend` a parent, and NodeTypes also take `mixins`. `getResolved()` returns the type's own definition together with the merged result, so you do not have to walk the chain yourself. The WebSocket and HTTP responses have the same shape.

The resolved object is an envelope, not a merged definition: the authored definition sits under `node_type` / `archetype` / `element_type`, and the merged data under `resolved_*` keys. Read effective properties from `resolved_properties` (or `resolved_fields`), not from `node_type.properties`.

### NodeType

```typescript
const r = await hdb.nodeTypes().getResolved('blog:Guide', { workspace: 'blog' });
```

```typescript
{
  node_type: NodeType,                         // the authored definition
  resolved_properties: PropertyValueSchema[],  // extends ancestors + mixins + own, sorted by name
  resolved_allowed_children: string[],
  resolved_mixins: string[],                   // effective mixin names, transitive, deduped
  inheritance_chain: string[]                  // leaf to root, e.g. ['blog:Guide', 'blog:Article']
}
```

Passing `{ workspace }` resolves against that workspace's pinned NodeType versions. Over WebSocket the workspace comes from the request context instead of an argument.

### Archetype and ElementType

```typescript
const r = await hdb.elementTypes().getResolved('launchpad:Hero');
```

```typescript
{
  element_type: ElementType,            // or `archetype` for archetypes
  resolved_fields: FieldSchema[],       // parent fields first, child overrides by name
  resolved_layout: LayoutNode[] | null, // the nearest layout in the chain
  inheritance_chain: string[],
  resolved_strict: boolean
}
```

## Branches

Schema definitions are stored per branch, like nodes. Operations run against the database handle's branch (`main` unless configured). Use `onBranch()` for another branch on either client:

```typescript
await db.elementTypes().getResolved('launchpad:Hero');                 // main
await db.onBranch('staging').elementTypes().getResolved('launchpad:Hero');
await hdb.onBranch('staging').nodeTypes().list();
```

On the HTTP client the branch becomes part of the REST path; on the WebSocket client it travels in the request context.

## Exports

The accessor classes are exported as `NodeTypes`, `Archetypes`, `ElementTypes` (WebSocket) and `HttpNodeTypes`, `HttpArchetypes`, `HttpElementTypes` (HTTP). Definitions are untyped objects; use the JSON shapes from the concept pages.

## See also

- [NodeTypes](/docs/concepts/data-model/nodetypes) for the definition format and inheritance
- [NodeTypes HTTP API](/docs/reference/http-api/nodetypes-api) for the REST routes the HTTP client calls
- [Archetypes](/docs/concepts/data-model/archetypes) and [Elements](/docs/concepts/data-model/elements)
