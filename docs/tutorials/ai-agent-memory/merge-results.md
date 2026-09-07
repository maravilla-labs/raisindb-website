---
sidebar_position: 4
title: "Tutorial: Merging Agent Results"
description: Step-by-step tutorial on merging AI agent branches back to production with review and conflict resolution
---

# Merging Agent Results

This tutorial continues from [Branching for Agent Isolation](./branching-isolation).
Several agents have worked on their own branches; now you review their output,
merge what is good, handle a conflict, and roll `main` back when a merge turns
out to be wrong.

## What you'll learn

- Reviewing an agent branch before merging
- Merging one branch, then several in sequence
- Promoting only selected results
- What a conflict looks like and how to complete the merge
- Rolling `main` back after a bad merge

## Setup

Two agents worked from the same `main`, each on its own branch:

```typescript
const db = client.database('research');
await db.branches().create('agent/researcher', { fromBranch: 'main' });
await db.branches().create('agent/fact-checker', { fromBranch: 'main' });

const researcher = db.onBranch('agent/researcher').workspace('findings').nodes();
await researcher.create({ type: 'raisin:Page', path: '/q1/market-analysis',
  properties: { title: 'Market Analysis Q1', confidence: 0.92 } });
await researcher.create({ type: 'raisin:Page', path: '/q1/competitors',
  properties: { title: 'Competitor Landscape', confidence: 0.61 } });

const checker = db.onBranch('agent/fact-checker').workspace('findings').nodes();
await checker.create({ type: 'raisin:Page', path: '/q1/verified-sources',
  properties: { title: 'Verified sources', confidence: 0.99 } });
```

## Step 1: Review a branch

Read the branch like any other database, and ask for its diff against `main`:

```typescript
const r = db.onBranch('agent/researcher');
await r.executeSql("SELECT path, properties->>'confidence' AS confidence FROM 'findings' WHERE node_type = 'raisin:Page' ORDER BY path");
// rows: [{ path: '/q1/competitors', confidence: '0.61' }, { path: '/q1/market-analysis', confidence: '0.92' }]

await db.branches().diff('agent/researcher', 'main');
// { added: [{ path: '/q1/market-analysis', ... }, { path: '/q1/competitors', ... }], modified: [], deleted: [] }
```

## Step 2: Merge one branch

```typescript
await db.branches().merge('agent/researcher', 'main', { message: 'Merge researcher findings' });
// { success: true, revision: 1788720003593, conflicts: [], fast_forward: false, nodes_changed: 2 }

await db.executeSql("SELECT path FROM 'findings' WHERE node_type = 'raisin:Page'");
// rows: [{ path: '/q1/market-analysis' }, { path: '/q1/competitors' }]
```

## Step 3: Merge a second branch

The fact-checker touched different nodes, so its merge combines cleanly with
what is already on `main`:

```typescript
await db.branches().merge('agent/fact-checker', 'main', { message: 'Merge fact-checker' });
// { success: true, ..., nodes_changed: 1 }
```

Merging several agents is a sequence of merges into `main`; each merge sees
the result of the previous one.

## Step 4: Promote only the good results

Suppose the low-confidence competitor page should not have gone live. Instead
of merging a whole branch, copy the roots you want with `copyNodes`. Ids are
preserved, so re-promoting later updates the same nodes:

```typescript
await db.branches().create('agent/summarizer', { fromBranch: 'main' });
const s = db.onBranch('agent/summarizer').workspace('findings').nodes();
await s.create({ type: 'raisin:Page', path: '/q1/summary', properties: { title: 'Executive summary', confidence: 0.9 } });
await s.create({ type: 'raisin:Page', path: '/q1/scratch', properties: { title: 'Dead end', confidence: 0.2 } });

await db.branches().copyNodes('agent/summarizer', 'main', {
  workspace: 'findings',
  roots: ['/q1/summary'],
  recursive: true,
});
// { copied: 1, deleted: 0, revision: '1788720003641-0', changes: [{ path: '/q1/summary', operation: 'added', ... }] }
```

`/q1/scratch` never reaches `main`. Drop the branch when done.

## Step 5: Handle a conflict

Two agents that edit the **same node** produce a conflict. Fork a branch, edit
`/q1/market-analysis` on it, and edit the same node on `main`:

```typescript
await db.branches().create('agent/reviser', { fromBranch: 'main' });
await db.onBranch('agent/reviser').executeSql(
  "UPDATE 'findings' SET properties = '{\"title\":\"Market Analysis Q1\",\"confidence\":0.97}'::jsonb WHERE path = '/q1/market-analysis'");
await db.executeSql(
  "UPDATE 'findings' SET properties = '{\"title\":\"Market Analysis Q1 (edited)\",\"confidence\":0.92}'::jsonb WHERE path = '/q1/market-analysis'");

const result = await db.branches().merge('agent/reviser', 'main', { message: 'Merge reviser' });
// { success: false, revision: null, fast_forward: false, nodes_changed: 0,
//   conflicts: [{ node_id: '260584c1-...', conflict_type: 'BothModified',
//     base_properties:   { title: 'Market Analysis Q1', confidence: 0.92 },
//     target_properties: { title: 'Market Analysis Q1 (edited)', confidence: 0.92 },
//     source_properties: { title: 'Market Analysis Q1', confidence: 0.97 } }] }
```

Nothing was written. Complete the merge by posting one resolution per node to
the HTTP `resolve-merge` endpoint, choosing `keep-ours`, `keep-theirs` or
`manual` and supplying the final properties:

```bash
curl -X POST localhost:8080/api/management/repositories/default/research/branches/main/resolve-merge \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "source_branch": "agent/reviser",
    "resolutions": [{
      "node_id": "260584c1-...",
      "resolution_type": "manual",
      "resolved_properties": { "title": "Market Analysis Q1 (edited)", "confidence": 0.97 }
    }],
    "message": "Merge reviser (resolved)",
    "actor": "orchestrator"
  }'
# {"success":true,"revision":1788719912532,"conflicts":[],"fast_forward":false,"nodes_changed":1}
```

Agents that write to disjoint paths never conflict, which is the usual way to
run them in parallel.

## Step 6: Roll main back

Every merge is a revision on `main`. If a merge turns out to be bad, move the
head to the revision before it. The merged revisions stay in history, so you
can move forward again later.

```typescript
const log = await fetch(
  'http://localhost:8080/api/management/repositories/default/research/revisions?branch=main&limit=5',
  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
// log.revisions[0] is the latest merge; log.revisions[0].parent is main before it

await db.branches().updateHead('main', log.revisions[0].parent);
```

Tag `main` before risky merges so the rollback target has a name:

```typescript
const head = await db.branches().getHead('main');
await db.tags().create('before-agent-merges', head.revision);
```

## Step 7: Clean up

```typescript
for (const b of ['agent/researcher', 'agent/fact-checker', 'agent/summarizer', 'agent/reviser']) {
  await db.branches().delete(b);
}
```

## Related guides

- [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches)
- [Merging Changes](/docs/guides/branching/merging-changes)
- [RAG Patterns](/docs/guides/ai/rag-patterns)
