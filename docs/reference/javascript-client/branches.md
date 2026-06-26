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

:::note
Branch **merge** and **compare** require a server running the RocksDB storage
backend (the default).
:::
