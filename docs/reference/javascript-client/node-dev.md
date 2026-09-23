---
sidebar_position: 15
title: Node Development
description: NodeDevApi — typed reads, atomic changesets with dry-run, propose and digest-bound commit, and branch worktrees from the JavaScript client.
---

# Node Development

`NodeDevApi` is the [node-development surface](../../concepts/node-development.md)
over HTTP. Get it from the HTTP client:

```typescript
import { RaisinHttpClient } from '@raisindb/client';

const http = new RaisinHttpClient('http://localhost:8080', { tenantId: 'default' });
const dev = http.nodeDev('myapp');          // or http.database('myapp').nodeDev()
```

## Common options

Every method takes an options object with:

```typescript
interface NodeDevCommon {
  roots?: WorkRoot[];       // [{ workspace, path?, ops? }]
  workspace?: string;       // one root covering the whole workspace
  branch?: string;          // default "main"
  envelope?: boolean;       // answer with a raisin.tool-result/1 envelope
}
```

A `NodeTarget` is a path (relative paths resolve against the first root) or
`{ workspace?, path?, node_id? }`.

## Methods

| Method | Server method |
|---|---|
| `stat(target, o?)` | `stat` |
| `read(target, { keys?, ...o })` | `read` |
| `list(target?, { limit?, ...o })` | `list` |
| `diff(target, from, to, o?)` | `diff`; `from` and `to` are `{ branch?, revision? }` |
| `watch(since?, { limit?, ...o })` | `watch` → `{ changes, cursor }` |
| `dryRun(o)` | `dry_run` |
| `propose(o)` | `propose` → `{ changeset: { changeset_id, plan: { digest } }, created }` |
| `getChangeset(id, o?)` | `get_changeset` |
| `listChangesets({ status?, limit?, ...o })` | `list_changesets` |
| `commit(id, expectedDigest?, o?)` | `commit` → `CommitOutcome` |
| `discard(id, o?)` | `discard` |
| `apply(o)` | `apply` → `CommitOutcome` |
| `forkBranch(name, o?)` | `fork_branch` |
| `diffBranch(base = 'main', o?)` | `diff_branch` |
| `mergeBranch(target, { dryRun?, message?, ...o })` | `merge_branch` |
| `discardBranch(o?)` | `discard_branch` |
| `call(method, request)` | any method by name |

Changeset methods take `ChangesetOptions`:

```typescript
interface ChangesetOptions extends NodeDevCommon {
  ops: ChangeOp[];
  idempotencyKey?: string;
  message?: string;
  primary?: number;   // index of the op whose node is the primary artifact
  kind?: string;      // artifact kind reported in tool results
}
```

`ChangeOp` is one of `create`, `patch`, `move`, `rename`, `copy` and `delete`;
see the [HTTP reference](../http-api/node-dev-api.md#operations) for the fields.

## Example: rename with a revision check and review

```typescript
const roots = [{ workspace: 'content', path: '/articles' }];

// Read the current revision.
const stat = (await dev.stat('launch', { roots })) as {
  locator: { revision: { value: string } };
};

// Propose the rename against it.
const { changeset } = await dev.propose({
  roots,
  idempotencyKey: 'rename-launch',
  message: 'Rename the launch article',
  ops: [{
    op: 'rename',
    target: 'launch',
    new_name: 'launch-2026',
    expected_revision: stat.locator.revision.value,
  }],
});

// A person reviews changeset.plan, then approves this digest.
const outcome = await dev.commit(changeset.changeset_id, changeset.plan.digest, { roots });

if (outcome.result === 'conflict') {
  // Nothing was written. Someone edited the node, or the plan changed.
  console.warn(outcome.conflicts);
} else {
  for (const op of outcome.receipt.ops) {
    console.log(op.action, op.old?.path, '→', op.new?.path);
  }
}
```

Retrying `propose` or `apply` with the same `idempotencyKey` is safe: a
committed key returns the stored receipt with `replayed: true`.

## Types

Exported: `NodeDevApi`, `WorkRoot`, `NodeLocator`, `NodeRevision`,
`NodeTarget`, `ChangeOp`, `ChangesetOptions`, `NodeDevCommon`,
`NodeDevConflict`, `OpReceipt`, `NodeDevReceipt`, `NodeDevCommitOutcome`,
`NodeDevTransport`.

## Related

- [Node Development API (HTTP)](../http-api/node-dev-api.md)
- [Function API: `raisin.nodeDev`](../function-api/node-dev.md)
