---
sidebar_position: 4
---

# Schema Management

Manage and resolve **NodeTypes**, **Archetypes**, and **ElementTypes** at runtime — list, read, create/update/delete, publish, and resolve inheritance (`extends`).

Both clients expose the same three accessors on a database handle:

```typescript
const db = client.database('my_repo');

db.nodeTypes();     // NodeType management
db.archetypes();    // Archetype management
db.elementTypes();  // ElementType management
```

- The **WebSocket client** (`RaisinClient`) talks to the realtime schema protocol.
- The **HTTP client** (`RaisinHttpClient`, for SSR) talks to the management REST API.

The method names are identical across both clients, so call sites can switch transports with minimal changes.

## Methods

Every accessor (`nodeTypes()`, `archetypes()`, `elementTypes()`) exposes the same surface:

| Method | Description |
|--------|-------------|
| `get(name)` | Fetch a single schema by name |
| `list(publishedOnly?)` | List all schemas (or only published) |
| `getResolved(name)` | Fetch the schema with full inheritance (`extends`) merged |
| `create(name, definition, commit?)` | Create a schema |
| `update(name, definition, commit?)` | Update a schema |
| `delete(name, commit?)` | Delete a schema |
| `publish(name, commit?)` | Publish a schema |
| `unpublish(name, commit?)` | Unpublish a schema |

```typescript
const elementTypes = db.elementTypes();

await elementTypes.list();                  // all element types
await elementTypes.list(true);              // published only
await elementTypes.get('launchpad:Hero');
await elementTypes.create('launchpad:Hero', { fields: [/* ... */] });
await elementTypes.publish('launchpad:Hero');
```

:::note Commit metadata
The optional `commit` argument is `{ message: string; actor?: string }`. It is only honored by the **HTTP client** (the management REST API records a commit). When omitted, the server uses a default message and the `"system"` actor. The WebSocket client auto-commits writes as the system actor.
:::

## Resolving inheritance: `getResolved()`

NodeTypes, Archetypes, and ElementTypes can `extend` a parent (and NodeTypes also compose `mixins`). `getResolved()` walks the whole chain — base first, child overrides by name, with cycle detection — so you don't have to merge `extends`/`mixins` yourself.

:::important It returns an envelope, not a merged definition
`getResolved()` does **not** return a single type object with everything folded in. It returns a wrapper with the **original** (unmerged) definition under one key (`node_type` / `archetype` / `element_type`) **plus** the fully-merged data under separate `resolved_*` keys.

So to read the effective properties/fields, use `resolved_properties` / `resolved_fields` — **not** `node_type.properties` / `element_type.fields` (those are only the leaf type's own, unmerged entries).
:::

### ElementType / Archetype return shape

```typescript
const resolved = await db.elementTypes().getResolved('launchpad:Hero');
```

```typescript
{
  element_type: ElementType,        // (or `archetype` for archetypes) the ORIGINAL definition, unmerged
  resolved_fields: FieldSchema[],   // ALL fields merged: parent → child, child overrides by name
  resolved_layout: LayoutNode[] | null, // merged layout (child wins if it sets one)
  inheritance_chain: string[],      // leaf → root, e.g. ['launchpad:Hero', 'launchpad:BaseBlock']
  resolved_strict: boolean          // effective strict-mode flag after merge
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `element_type` / `archetype` | object | The type's **own** definition as authored (not merged) |
| `resolved_fields` | `FieldSchema[]` | Every field including inherited ones; child overrides parent by `name` |
| `resolved_layout` | `LayoutNode[] \| null` | Merged layout, or `null` if none in the chain |
| `inheritance_chain` | `string[]` | Names from leaf to root (for debugging/UX) |
| `resolved_strict` | `boolean` | Effective `strict` flag |

### NodeType return shape

```typescript
const node = await db.nodeTypes().getResolved('blog:Article');
```

```typescript
{
  node_type: NodeType,                  // the ORIGINAL definition, unmerged
  resolved_properties: PropertyValueSchema[], // ALL properties: extends ancestors + mixins + own
  resolved_allowed_children: string[],  // merged allowed-children list
  resolved_mixins: string[],            // effective mixin names (inherited + transitive, deduped)
  inheritance_chain: string[]           // leaf → root of the `extends` chain
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `node_type` | object | The NodeType's **own** definition as authored (not merged) |
| `resolved_properties` | `PropertyValueSchema[]` | Every property merged from `extends` ancestors **and** mixins; the type's own properties win |
| `resolved_allowed_children` | `string[]` | Allowed child types, merged across the chain |
| `resolved_mixins` | `string[]` | Effective mixin names, including those pulled in via `extends` and transitively from other mixins |
| `inheritance_chain` | `string[]` | `extends` chain names, leaf to root |

Mixin **properties** land in `resolved_properties`; the mixin **names** are listed in `resolved_mixins`.

NodeType resolution can also be **workspace-aware** (honoring workspace NodeType pins) on the HTTP client:

```typescript
await db.nodeTypes().getResolved('blog:Article', { workspace: 'content' });
```

`getResolved()` is available for **all three** schema kinds on **both** the WebSocket and HTTP clients, and the WebSocket and HTTP responses use the **same** shapes shown above.

## Branches

Schema definitions are **per-branch**, exactly like nodes — `launchpad:Hero` on `main` and on a `staging` branch are independent records. Every operation runs against a branch.

By default, operations target the database's branch (`main` unless configured otherwise). Use `onBranch()` to target a different branch:

```typescript
// Default branch (main)
await db.elementTypes().getResolved('launchpad:Hero');

// Target a specific branch — works on both clients
await db.onBranch('staging').elementTypes().getResolved('launchpad:Hero');
await db.onBranch('staging').nodeTypes().list();
```

For the HTTP client the branch is part of the REST path
(`/api/management/{repo}/{branch}/...`); for the WebSocket client it travels in
the request context. In both cases, `onBranch('staging')` returns a
branch-scoped database whose schema operations all run against that branch.

## Availability

| Operation | WebSocket client | HTTP client |
|-----------|:---------------:|:-----------:|
| `nodeTypes/archetypes/elementTypes()` | ✅ | ✅ |
| `get` / `list` | ✅ | ✅ |
| `getResolved` (NodeType) | ✅ | ✅ |
| `getResolved` (Archetype, ElementType) | ✅ | ✅ |
| `create` / `update` / `delete` | ✅ | ✅ |
| `publish` / `unpublish` | ✅ | ✅ |
| Branch targeting (`onBranch`) | ✅ | ✅ |

## See also

- [NodeTypes](/docs/concepts/data-model/nodetypes) — schema definition and inheritance
- [Archetypes](/docs/concepts/data-model/archetypes) — editor templates
- [Elements](/docs/concepts/data-model/elements) — composable content blocks
- [NodeTypes HTTP API](/docs/reference/http-api/nodetypes-api) — REST endpoints
