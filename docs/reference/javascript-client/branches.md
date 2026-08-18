---
sidebar_position: 5
---

# Branches

Create, fork, compare, and merge branches over the WebSocket client, and scope
any operation to a branch with `onBranch()`. A branch is an isolated copy of
both schema and content.

Typical uses: give an AI agent its own branch to work in and merge the result
back when it's done, stage schema or content changes before promoting them to
`main`, or run parallel experiments without touching production data. See
[Agent Memory with Branches](../../guides/ai/agent-memory-with-branches.md) for
the agent-isolation pattern.

## Scope an operation to a branch

`onBranch(name)` returns a branch-scoped `Database` (or workspace). Every read
and write made through it targets that branch; the default is `main`.

```typescript
const db = client.database('myapp');

// Read/write on the `staging` branch in isolation
const staging = db.onBranch('staging');
await staging.workspace('content').nodes().create({
  type: 'Article',
  path: '/articles/draft',
  properties: { title: 'Draft' },
});

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
| `options.fromBranch` | `string?` | Fork from this branch's current HEAD — copies its nodes, indexes **and schema (archetypes, element types, node types)** |
| `options.fromRevision` | `string?` | Fork at a specific revision instead of HEAD |

```typescript
// Full fork of main — staging gets main's schema + content
await db.branches().create('staging', { fromBranch: 'main' });
```

:::tip
A `fromBranch` fork copies the **archetype registry**, so writing archetyped
nodes on the new branch works immediately — you don't need to redeploy the
schema to it.
:::

### list / get / delete

```typescript
const all = await db.branches().list();
const branch = await db.branches().get('staging');
await db.branches().delete('staging');
```

### getHead / updateHead

```typescript
const head = await db.branches().getHead('main');      // current HEAD revision
await db.branches().updateHead('staging', revisionId);
```

### compare

Calculate divergence (commits ahead / behind) between two branches.

```typescript
const divergence = await db.branches().compare('staging', 'main');
// { ahead, behind, ... } — how far `staging` has diverged from `main`
```

### merge

Merge a source branch into a target branch. Defaults to a three-way merge and
fast-forwards automatically when possible.

```typescript
// Merge staging INTO main
await db.branches().merge('staging', 'main', {
  strategy: 'ThreeWay',          // or 'FastForward'
  message: 'Merge staging',
});
```

The result reports `success`, the merge `revision`, whether it was a
`fast_forward`, and any `conflicts`. On conflicts, surface them in your UI and
resolve via the HTTP `resolve-merge` endpoint.

| Argument | Type | Description |
|----------|------|-------------|
| `sourceBranch` | `string` | Branch to merge **from** |
| `targetBranch` | `string` | Branch to merge **into** |
| `options.strategy` | `string?` | `'ThreeWay'` (default) or `'FastForward'` |
| `options.message` | `string?` | Merge commit message |

### copyNodes

Copy a set of nodes from one branch onto another — branch **promotion**. Unlike
a merge, which takes a whole branch, this takes named roots, so it suits a model
where one branch holds work in progress and another holds what is live.

```typescript
await db.branches().copyNodes('main', 'live', {
  workspace: 'content',
  roots: ['/products/kettle'],
  recursive: true,
});
```

Node **ids are preserved**, so promoting the same root again updates the same
target nodes rather than creating new ones — repeat promotions are idempotent
for a given source state, and references to a promoted node keep resolving. The
whole set lands in one atomic commit and the target branch HEAD advances once.

A promotion carries the whole node: properties, archetype, every index
(path, property, reference, relation, ordered-children), branch-scoped secrets,
and **translation overlays**, node-level and block-level.

Each root's parent path must already exist on the target branch; a missing one
fails the call rather than writing a dangling subtree.

| Argument | Type | Description |
|----------|------|-------------|
| `sourceBranch` | `string` | Branch to copy **from** |
| `targetBranch` | `string` | Branch to copy **onto** |
| `options.workspace` | `string` | Workspace the nodes live in |
| `options.roots` | `string[]` | Node paths to copy (non-empty) |
| `options.recursive` | `boolean?` | Also copy descendants (default `true`) |
| `options.deleteMissing` | `boolean?` | Prune target nodes under the roots that are absent from the copied set — one-way sync (default `false`) |
| `options.sourceRevision` | `string?` | Read the source AS OF this revision instead of its HEAD |

#### Pinning a promotion to a revision

Copying a large set is not instantaneous. Without a pin the source is read at
HEAD as each node's turn comes, so a write that lands mid-copy ends up partly
inside the result — a torn snapshot, and nothing reports it, because every node
copied cleanly, just not all from the same moment.

Capture the head when the promotion is decided and pass it back:

```typescript
const at = await db.branches().getHead('main');

// …minutes later, after a review step, and while other people keep working
await db.branches().copyNodes('main', 'live', {
  workspace: 'content',
  roots: ['/products'],
  recursive: true,
  sourceRevision: at,
});
```

The target branch is always resolved at its head: the pin says **what** to copy,
never where to put it. An unparseable revision is an error rather than a silent
fall back to "latest" — copying newer data than intended is the thing the pin
exists to prevent.

This matters for any review gate. If a change is approved minutes after it was
proposed, an unpinned copy promotes whatever HEAD holds at approval time, not
what the approver looked at.

Requires server **0.3.15** or later; earlier servers ignore the field and copy
at HEAD.

:::note
Branch **merge**, **compare** and **copyNodes** require a server running the
RocksDB storage backend (the default).
:::
