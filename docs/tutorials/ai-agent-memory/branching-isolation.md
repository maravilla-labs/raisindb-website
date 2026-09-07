---
sidebar_position: 1
title: "Tutorial: Branching for Agent Isolation"
description: Step-by-step tutorial on using RaisinDB branches to give AI agents isolated workspaces
---

# Branching for Agent Isolation

Give an AI agent its own branch: a full copy of the data it can read and write
freely, while `main` stays exactly as it was. When the task is done you inspect
the branch, merge it, or throw it away. This tutorial uses the JavaScript
client; the [Merging Agent Results](./merge-results) tutorial continues from
here.

## What you'll learn

- Forking a branch per agent task
- Writing an agent's findings on its branch
- Inspecting the branch's history and diff before anyone merges it
- Rolling the branch back and cleaning up

## Prerequisites

A running server and a repository (`research` below) with a workspace
`findings` that allows `raisin:Folder` and `raisin:Page` nodes, plus the client:

```bash
npm install @raisindb/client
```

```typescript
import { RaisinClient } from '@raisindb/client';

const client = new RaisinClient('raisin://localhost:8080/sys/default');
await client.connect();
await client.authenticate({ username: 'admin', password: '...' });
const db = client.database('research');
```

## Step 1: Seed main

```typescript
await db.workspace('findings').nodes().create({
  type: 'raisin:Folder', path: '/q1', properties: { title: 'Q1 research' },
});
```

## Step 2: Create the agent's branch

```typescript
const task = 'agent/research-task-42';
await db.branches().create(task, { fromBranch: 'main' });
// { name: 'agent/research-task-42', head: '1788719933425-0', created_from: '1788719933425-0',
//   upstream_branch: 'main', protected: false, ... }
```

The branch holds everything on `main` at this revision: nodes, indexes and
schema. Writes to it do not touch `main`.

## Step 3: The agent writes on its branch

Scope a handle to the branch once and hand it to the agent's tools:

```typescript
const agentDb = db.onBranch(task);
const findings = agentDb.workspace('findings').nodes();

await findings.create({
  type: 'raisin:Page',
  path: '/q1/market-analysis',
  properties: { title: 'Market Analysis Q1', summary: 'Revenue grew 15%.', confidence: 0.92 },
});
await findings.create({
  type: 'raisin:Page',
  path: '/q1/competitors',
  properties: { title: 'Competitor Landscape', summary: 'Three new entrants.', confidence: 0.87 },
});
```

SQL through the same handle is branch-scoped too:

```typescript
await agentDb.executeSql(
  "UPDATE 'findings' SET properties = '{\"title\":\"Market Analysis Q1\",\"summary\":\"Revenue grew 15% year on year.\",\"confidence\":0.95}'::jsonb WHERE path = '/q1/market-analysis'"
);
```

## Step 4: Confirm main is untouched

```typescript
await db.executeSql("SELECT path FROM 'findings'");
// rows: [{ path: '/q1' }]
await agentDb.executeSql("SELECT path, properties->>'confidence' AS confidence FROM 'findings' WHERE node_type = 'raisin:Page'");
// rows: [{ path: '/q1/market-analysis', confidence: '0.95' }, { path: '/q1/competitors', confidence: '0.87' }]
```

## Step 5: Inspect what the agent did

Every write is a revision with a message. The per-node history shows the
agent's edits to one finding, and the branch diff shows everything it changed:

```typescript
await agentDb.workspace('findings').nodes().historyByPath('/q1/market-analysis');
// [{ revision: '1788720366608-0', updated_by: 'system', deleted: false, message: 'SQL UPDATE', ... },
//  { revision: '1788720274636-0', updated_by: 'system', deleted: false, message: 'Created node: ...', ... }]

await db.branches().diff(task, 'main');
// { common_ancestor: '1788719933425-0',
//   added: [{ path: '/q1/market-analysis', operation: 'added', ... }, { path: '/q1/competitors', operation: 'added', ... }],
//   modified: [], deleted: [] }
```

To name a revision so a reviewer can come back to it, tag it:

```typescript
const head = await db.branches().getHead(task);
await db.tags().create('task-42-done', head.revision, 'Agent finished task 42');
```

## Step 6: Roll the branch back

If the last edit was bad, move the branch head to the revision before it. The
newer revision stays in history.

```typescript
const history = await agentDb.workspace('findings').nodes().historyByPath('/q1/market-analysis');
await db.branches().updateHead(task, history[1].revision);
await agentDb.executeSql("SELECT properties->>'confidence' AS confidence FROM 'findings' WHERE path = '/q1/market-analysis'");
// rows: [{ confidence: '0.92' }]
```

Move it forward again with the newer revision if the rollback was wrong.

## Step 7: Clean up

A branch that produced nothing useful is simply deleted; `main` never saw it.

```typescript
await db.branches().delete(task);   // { success: true }
```

Keep the branch if you intend to merge it. The next tutorial,
[Merging Agent Results](./merge-results), does that.

## Related guides

- [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches)
- [Embeddings and Vector Search](/docs/guides/ai/embeddings-and-vector-search)
