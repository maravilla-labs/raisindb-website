---
sidebar_position: 3
title: Agent Memory with Branches
description: Use RaisinDB's git-like branching to give AI agents isolated, auditable, mergeable memory
---

# Agent Memory with Branches

RaisinDB can give each AI agent its own **branch**: a versioned copy of the
data where the agent reads, writes and reasons without touching other agents or
production content. Every write is a revision with an actor and a message, so
you can see what an agent did, roll it back, and merge the result the way a
developer merges a feature branch.

## Why branches for agent memory

| Concern | Flat namespace | RaisinDB branches |
|---------|----------------|-------------------|
| Agent A overwrites agent B's work | Possible | Each agent writes to its own branch |
| Debugging what an agent did | No history | Per-node history and a branch diff |
| Rolling back bad agent output | Manual cleanup | Move the branch head to an earlier revision |
| Running agents in parallel | Coordination needed | One branch per agent |
| Auditing agent decisions | Not built in | Every revision has an actor, message and timestamp |

## The pattern: branch, work, merge

### 1. Create a branch for the task

```sql
CREATE BRANCH 'agent/research-task-42' FROM 'main';
```

```typescript
await db.branches().create('agent/research-task-42', { fromBranch: 'main' });
```

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myrepo/branches \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "agent/research-task-42", "upstream_branch": "main", "created_by": "orchestrator"}'
```

The branch is a copy of `main` at that revision, schema included. The agent can
read everything that existed and its writes land only on the branch.

### 2. The agent stores findings

Hand the agent a branch-scoped handle so every tool call targets the branch:

```typescript
const agentDb = db.onBranch('agent/research-task-42');
const findings = agentDb.workspace('findings').nodes();

await findings.create({
  type: 'research:Finding',
  path: '/research/market-analysis',
  properties: { title: 'Market Analysis Q1', summary: 'Revenue grew 15%.', confidence: 0.92, sources: ['report-a'] },
});
```

Or over SQL, addressing the branch in the URL (`POST /api/sql/myrepo/agent%2Fresearch-task-42`):

```sql
INSERT INTO 'findings' (path, node_type, name, properties)
VALUES ('/research/competitors', 'research:Finding', 'competitors',
        '{"title":"Competitor Landscape","summary":"Three new entrants.","confidence":0.87}'::jsonb);
```

To attach a message to a group of writes, wrap them in a SQL transaction:

```sql
BEGIN;
UPDATE 'findings' SET properties = '{"title":"Market Analysis Q1","confidence":0.95}'::jsonb WHERE path = '/research/market-analysis';
COMMIT WITH MESSAGE 'Agent: completed market analysis' ACTOR 'research-agent-v2';
```

### 3. Review, then merge or discard

The orchestrator (or a human) reads the branch and asks what changed:

```typescript
await agentDb.executeSql("SELECT path, properties->>'confidence' AS confidence FROM 'findings' WHERE node_type = 'research:Finding'");
await db.branches().diff('agent/research-task-42', 'main');
// { common_ancestor: '...', added: [{ path: '/research/market-analysis', ... }, ...], modified: [], deleted: [] }
```

Merge it into `main`:

```typescript
await db.branches().merge('agent/research-task-42', 'main', { message: 'Merge research task 42' });
// { success: true, revision: 1788720003593, conflicts: [], fast_forward: false, nodes_changed: 2 }
```

Or delete it if the results are not needed:

```typescript
await db.branches().delete('agent/research-task-42');
```

## Multi-agent coordination

Run several agents in parallel, one branch each, and merge them in sequence:

```
main ─────────────────────────────────────────► main (merged)
  │                                               ▲
  ├── agent/researcher ──── findings ─────────────┤
  ├── agent/fact-checker ── verifications ────────┤
  └── agent/summarizer ──── summary ──────────────┘
```

```sql
CREATE BRANCH 'agent/researcher' FROM 'main';
CREATE BRANCH 'agent/fact-checker' FROM 'main';
CREATE BRANCH 'agent/summarizer' FROM 'main';

-- each agent works on its branch ...

MERGE BRANCH 'agent/researcher' INTO 'main' MESSAGE 'Researcher';
MERGE BRANCH 'agent/fact-checker' INTO 'main' MESSAGE 'Fact checker';
MERGE BRANCH 'agent/summarizer' INTO 'main' MESSAGE 'Summarizer';
```

Agents that write to different nodes merge without conflict. If two agents
change the **same node**, the merge stops and reports the node with both
versions; you complete it with a resolution. See
[Merging Changes](/docs/guides/branching/merging-changes#conflicts).

Three ways to bring results in:

- **Sequential merge**: merge one agent at a time, resolving anything that overlaps.
- **Review then merge**: inspect the diff and the findings first; merge or delete.
- **Selective promotion**: copy only the roots worth keeping with
  `db.branches().copyNodes(agentBranch, 'main', { workspace, roots })` and drop the rest.

## History as agent memory

Every write is a revision. A node's history lists what the agent did to it:

```typescript
await agentDb.workspace('findings').nodes().historyByPath('/research/market-analysis');
// [{ revision: '1788720366608-0', updated_at: '...', updated_by: 'system', deleted: false,
//    message: 'Agent: completed market analysis', is_system: false },
//  { revision: '1788720274636-0', ..., message: 'Created node: ...' }]
```

Read the workspace as it was at any of those revisions:

```sql
SELECT path, properties FROM 'findings' WHERE __revision = '1788720274636-0';
```

The repository-wide log (`GET /api/management/repositories/{tenant}/{repo}/revisions?branch=agent%2Fresearcher`)
lists the branch's commits with actor, message and the nodes each one changed.

### Rolling back agent mistakes

Move the branch head to a known-good revision. Later revisions stay in history
for debugging.

```typescript
await db.branches().updateHead('agent/researcher', '1788720274636-0');
```

```bash
curl -X PUT http://localhost:8080/api/management/repositories/default/myrepo/branches/agent%2Fresearcher/head \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"revision": "1788720274636-0"}'
```

## Practical patterns

### Conversational memory

One branch per conversation lets an agent accumulate context in isolation:

```sql
CREATE BRANCH 'conversations/conv-abc123' FROM 'main';
-- on that branch:
INSERT INTO 'conversations' (path, node_type, name, properties)
VALUES ('/conv-abc123/turn-1', 'chat:Turn', 'turn-1',
        '{"role":"user","content":"What is our Q1 revenue?","timestamp":"2026-03-31T10:00:00Z"}'::jsonb);
```

### Scratchpad

A branch the agent experiments in and that is deleted afterwards. Promote just
the final output with `copyNodes` if it is worth keeping.

### Reviewed knowledge-base updates

A nightly agent enriches a knowledge base on a dated branch
(`agent/nightly-2026-03-31`); a human reads the diff the next morning and
merges or drops it.

### A/B testing agent strategies

Run two strategies on two branches from the same `main` and compare with the
same query on each:

```typescript
for (const b of ['agent/strategy-a', 'agent/strategy-b']) {
  const r = await db.onBranch(b).executeSql(
    "SELECT COUNT(*) AS n, AVG(properties->>'confidence'::String) AS avg_confidence FROM 'findings' WHERE node_type = 'research:Finding'");
  console.log(b, r.rows[0]);
}
```

## Branches and vector search

Embeddings are stored per branch, and forking a branch copies the source's
embeddings along with its content. A `KNN` or `HYBRID_SEARCH` query issued on
an agent's branch therefore searches what that agent can see, including the
nodes it added there:

```sql
-- issued against the agent's branch
SELECT path, name FROM KNN('what did I learn about caching', 10, workspaces => 'findings');
```

See [Embeddings and Vector Search](./embeddings-and-vector-search.md).

## Next steps

- [Branching for Agent Isolation](/docs/tutorials/ai-agent-memory/branching-isolation) - step-by-step tutorial
- [Merging Agent Results](/docs/tutorials/ai-agent-memory/merge-results) - review, merge, conflicts, rollback
- [RAG Patterns](./rag-patterns.md) - retrieval on top of branch isolation
- [Function-Based Tool Use](./function-based-tool-use.md) - give agents callable tools
