---
sidebar_position: 5
---

# Branches

Create, fork, compare and merge branches over the WebSocket client, and scope
any operation to a branch with `onBranch()`. A branch forked from another is an
isolated copy of both schema and content.

Typical uses: give an AI agent its own branch and merge the result back when it
is done, stage schema or content changes before promoting them to `main`, or
run parallel experiments without touching production data. See
[Agent Memory with Branches](../../guides/ai/agent-memory-with-branches.md) for
the agent pattern.

## Scope an operation to a branch

`onBranch(name)` returns a branch-scoped `Database` (or workspace client). Every
read, write and SQL statement made through it targets that branch; the default
is `main`.

```typescript
const db = client.database('myapp');

const staging = db.onBranch('staging');
await staging.workspace('content').nodes().create({
  type: 'raisin:Page',
  path: '/articles/draft',
  properties: { title: 'Draft' },
});
await staging.executeSql("SELECT path, properties->>'title' AS title FROM 'content'");
// main is untouched until you merge
```

## `db.branches()`

Returns a `Branches` handle for branch lifecycle operations.

### create

```typescript
await db.branches().create(name, options?);
```

| Argument | Type | Description |
|----------|------|-------------|
| `name` | `string` | New branch name |
| `options.fromBranch` | `string?` | Fork from this branch: copies its nodes, indexes and schema (NodeTypes, archetypes, element types). It also becomes the branch's default comparison base |
| `options.fromRevision` | `string?` | Fork at this revision of `fromBranch` instead of its head |

Without either option the branch is created empty. Resolves to the branch
record:

```typescript
await db.branches().create('staging', { fromBranch: 'main' });
// { name: 'staging', head: '1788719933425-0', created_at: '...', created_by: 'system',
//   created_from: '1788719933425-0', upstream_branch: 'main', protected: false, description: null }
```

### list / get / delete

```typescript
const all = await db.branches().list();      // Branch[]
const branch = await db.branches().get('staging');
await db.branches().delete('staging');       // { success: true }
```

### getHead / updateHead

```typescript
const head = await db.branches().getHead('main');   // { revision: '1788719933425-0' }
await db.branches().updateHead('staging', '1788719765785-0');   // { success: true }
```

`updateHead` moves the head to any revision, forward or back, and is the
rollback primitive: reads on the branch then return the state at that revision
while newer revisions stay in history.

### compare

Commits ahead and behind, plus the common ancestor.

```typescript
const divergence = await db.branches().compare('staging', 'main');
// { ahead: 1, behind: 0, common_ancestor: '1788719933425-0' }
```

### diff

The nodes that changed on `branch` since it diverged from `baseBranch`.

```typescript
const diff = await db.branches().diff('staging', 'main');
// { common_ancestor: '1788719933425-0',
//   added:    [{ node_id: '...', workspace: 'content', path: '/sdk-page', operation: 'added' }],
//   modified: [],
//   deleted:  [] }
```

`operation` is `added`, `modified`, `reordered` or `deleted`.

### merge

Merge a source branch into a target branch. Defaults to a three-way merge.

```typescript
// merge staging INTO main
const result = await db.branches().merge('staging', 'main', {
  strategy: 'ThreeWay',          // or 'FastForward'
  message: 'Merge staging',
});
// { success: true, revision: 1788720003593, conflicts: [], fast_forward: false, nodes_changed: 1 }
```

| Argument | Type | Description |
|----------|------|-------------|
| `sourceBranch` | `string` | Branch to merge from |
| `targetBranch` | `string` | Branch to merge into |
| `options.strategy` | `string?` | `'ThreeWay'` (default) or `'FastForward'` |
| `options.message` | `string?` | Merge commit message |

`revision` is the millisecond part of the merge commit; call `getHead` for the
full string. When a three-way merge finds conflicts, `success` is `false` and
`conflicts` holds one entry per node with `node_id`, `conflict_type`,
`base_properties`, `target_properties` and `source_properties`. Resolve them
through the HTTP `resolve-merge` endpoint described in
[Merging Changes](../../guides/branching/merging-changes.md#resolve-conflicts).
A fast-forward that is not possible rejects with
`Fast-forward merge not possible: branches have diverged`.

### copyNodes

Copy a set of nodes from one branch onto another: branch **promotion**. Unlike
a merge, which takes a whole branch, this takes named roots, so it suits a model
where one branch holds work in progress and another holds what is live.

```typescript
await db.branches().copyNodes('staging', 'main', {
  workspace: 'content',
  roots: ['/products/kettle'],
  recursive: true,
});
// { copied: 1, deleted: 0, revision: '1788720003641-0',
//   changes: [{ node_id: '...', path: '/products/kettle', node_type: 'raisin:Page', operation: 'added' }] }
```

Node ids are preserved, so promoting the same root again updates the same
target nodes rather than creating new ones, and references to a promoted node
keep resolving. The whole set lands in one commit and the target head advances
once. A promotion carries the whole node: properties, archetype, indexes,
relations, branch-scoped secrets and translation overlays. Each root's parent
path must already exist on the target branch; a missing one fails the call.

| Argument | Type | Description |
|----------|------|-------------|
| `sourceBranch` | `string` | Branch to copy from |
| `targetBranch` | `string` | Branch to copy onto |
| `options.workspace` | `string` | Workspace the nodes live in |
| `options.roots` | `string[]` | Node paths to copy (non-empty) |
| `options.recursive` | `boolean?` | Also copy descendants (default `true`) |
| `options.deleteMissing` | `boolean?` | Prune target nodes under the roots that are absent from the copied set (default `false`) |
| `options.sourceRevision` | `string?` | Read the source as of this revision instead of its head |

#### Pinning a promotion to a revision

Copying a large set takes time. Without a pin the source is read at head as
each node's turn comes, so a write landing mid-copy ends up partly inside the
result. Capture the head when the promotion is decided and pass it back:

```typescript
const at = await db.branches().getHead('staging');

// later, after a review step, while other people keep working
await db.branches().copyNodes('staging', 'main', {
  workspace: 'content',
  roots: ['/products'],
  recursive: true,
  sourceRevision: at.revision,
});
```

The pin says what to copy; the target branch is always written at its head. An
unparseable revision is an error rather than a fallback to the head. Requires
server 0.3.15 or later.

## `db.tags()`

A tag is an immutable name for one revision.

```typescript
const head = await db.branches().getHead('main');
await db.tags().create('v1.0', head.revision, 'First release');
// { name: 'v1.0', revision: '1788719933425-0', created_at: '...', created_by: 'system',
//   message: 'First release', protected: false }
await db.tags().list();
await db.tags().get('v1.0');
await db.tags().delete('v1.0');   // { success: true }
```

To read content at a tag, use its revision in a SQL `__revision` predicate or
the HTTP `rev/{revision}` endpoints.

## Node history

A node's revisions, newest first, are available on any workspace client:

```typescript
const history = await db.onBranch('staging').workspace('content').nodes().historyByPath('/sdk-page');
// [{ revision: '1788720003556-0', updated_at: '...', updated_by: 'system', deleted: false,
//    message: 'Created node: b7ed40a1-...', is_system: false }]
```

See [Node Operations](./node-operations.md) for `history()` and `historyByPath()`.

:::note
Branch merge, compare, diff and `copyNodes` require a server running the
RocksDB storage backend (the default).
:::
