---
sidebar_position: 3
title: Agent Memory with Branches
description: Use RaisinDB's git-like branching to give AI agents isolated, auditable, mergeable memory
---

# Agent Memory with Branches

This is RaisinDB's key differentiator for AI applications. While other databases store vectors in a flat namespace, RaisinDB gives each AI agent its own **branch** — an isolated, versioned workspace where the agent can read, write, and reason without interfering with other agents or production data.

Every change is tracked with full revision history. When the agent finishes, its branch merges back — just like a developer merging a feature branch.

## Why Branches for Agent Memory?

Traditional vector databases give agents a single shared namespace. This creates problems:

| Problem | Flat namespace | RaisinDB branches |
|---------|---------------|-------------------|
| Agent A overwrites Agent B's work | Common | Impossible — isolated branches |
| Debugging what an agent did | Difficult — no history | Full revision history per branch |
| Rolling back bad agent output | Manual cleanup | Reset branch HEAD to prior revision |
| Running agents in parallel | Risk of conflicts | Each agent has its own branch |
| Auditing agent decisions | Not built in | Every commit has actor + message + timestamp |

## The Pattern: Branch → Work → Merge

### 1. Create a Branch for the Agent Task

```sql
-- Create an isolated branch for the agent's work
-- Branches from the current state of main
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/research-task-42', 'main');
```

Or via the REST API:

```bash
POST /api/repository/myrepo/branches
{
  "name": "agent/research-task-42",
  "from_branch": "main"
}
```

The agent now has a complete copy of the data at the point of branching. It can read everything that exists on `main`, but writes go only to its branch.

### 2. Agent Stores Findings

The agent works on its branch, creating and updating nodes as it discovers information:

```sql
-- Agent creates nodes to store its findings (on agent branch)
INSERT INTO 'default' (name, path, node_type, properties) VALUES (
  'finding-1',
  '/research/findings',
  'research:Finding',
  '{"title": "Market Analysis Q1", "summary": "Revenue grew 15%...", "confidence": 0.92, "sources": ["report-a", "report-b"]}'
);

INSERT INTO 'default' (name, path, node_type, properties) VALUES (
  'finding-2',
  '/research/findings',
  'research:Finding',
  '{"title": "Competitor Landscape", "summary": "Three new entrants...", "confidence": 0.87, "sources": ["press-release-1"]}'
);
```

Each write can optionally be committed for a permanent audit trail:

```bash
POST /api/repository/myrepo/agent/research-task-42/default/raisin:cmd/commit
{
  "message": "Agent: completed market analysis with 2 findings",
  "actor": "research-agent-v2"
}
```

### 3. Merge Results Back

When the agent completes its task, merge the branch back to `main`:

```bash
# Update main to include the agent's work
PUT /api/management/repositories/default/myrepo/branches/main/head
{
  "head": <agent-branch-latest-revision>
}
```

Or clean up if the results aren't needed:

```bash
# Delete the branch if results were not useful
DELETE /api/repository/myrepo/branches/agent/research-task-42
```

## Multi-Agent Coordination

Run multiple agents in parallel, each on its own branch:

```
main ─────────────────────────────────────────► main (merged)
  │                                               ▲
  ├── agent/researcher ──── findings ──── commit ──┤
  │                                                │
  ├── agent/fact-checker ── verifications ── commit─┤
  │                                                │
  └── agent/summarizer ──── summary ──── commit ───┘
```

### Example: Research Pipeline

```sql
-- Step 1: Create branches for each agent
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/researcher', 'main');
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/fact-checker', 'main');
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/summarizer', 'main');

-- Step 2: Each agent works independently on its branch
-- (researcher stores raw findings)
-- (fact-checker validates claims against sources)
-- (summarizer produces executive summary)

-- Step 3: Merge sequentially or review before merging
-- The orchestrator can inspect each branch before merging
SELECT id, name, properties->>'confidence'::String AS confidence
FROM 'default'  -- queried against the agent/researcher branch
WHERE node_type = 'research:Finding'
ORDER BY properties->>'confidence'::String DESC;
```

### Merge Strategies

- **Sequential merge** — merge one agent at a time, resolving conflicts at each step
- **Review-then-merge** — an orchestrator (or human) reviews each branch before merging
- **Selective merge** — only merge high-confidence findings, discard low-quality branches

## Revision History as Agent Memory

Because every commit creates an immutable revision, you can **time-travel** to see what an agent knew at any point:

```sql
-- See the state of the agent's workspace at revision 42
SELECT id, name, properties
FROM 'default'
WHERE __revision = 42
```

### Viewing Agent Commit History

```bash
# List all commits on an agent branch
GET /api/repository/myrepo/agent/researcher/revisions
```

Each revision records:
- **Revision number** — sequential identifier
- **Commit message** — what the agent did
- **Actor** — which agent made the change
- **Timestamp** — when it happened
- **Parent revision** — enables history traversal

### Rolling Back Agent Mistakes

If an agent produces bad output, roll back to a known-good state:

```bash
# Reset the agent's branch to revision 5 (before the bad output)
PUT /api/management/repositories/default/myrepo/branches/agent/researcher/head
{
  "head": 5
}
```

The bad revisions still exist in history for debugging, but the branch HEAD now points to the clean state.

## Practical Patterns

### Pattern 1: Conversational Memory

Give each conversation its own branch so the agent can accumulate context:

```sql
-- New conversation starts
INSERT INTO 'raisin:branches' (name, from_branch)
VALUES ('conversations/conv-abc123', 'main');

-- Agent stores conversation turns
INSERT INTO 'default' (name, path, node_type, properties) VALUES (
  'turn-1',
  '/conversations/conv-abc123',
  'chat:Turn',
  '{"role": "user", "content": "What is our Q1 revenue?", "timestamp": "2026-03-31T10:00:00Z"}'
);

INSERT INTO 'default' (name, path, node_type, properties) VALUES (
  'turn-2',
  '/conversations/conv-abc123',
  'chat:Turn',
  '{"role": "assistant", "content": "Q1 revenue was $2.4M...", "timestamp": "2026-03-31T10:00:05Z"}'
);
```

### Pattern 2: Agent Scratchpad

Use a branch as a temporary scratchpad that gets discarded:

```sql
-- Agent creates a scratchpad branch
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('scratch/task-789', 'main');

-- Agent experiments freely — tries different approaches
-- ...stores intermediate results, dead ends, explorations...

-- If the final result is good, cherry-pick just the output
-- If not, delete the branch entirely
```

### Pattern 3: Knowledge Base Updates

An agent periodically enriches a knowledge base on a branch, and a human reviews before merging:

```sql
-- Nightly enrichment agent
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/nightly-enrichment-2026-03-31', 'main');

-- Agent adds new knowledge nodes
INSERT INTO 'default' (name, path, node_type, properties) VALUES (
  'new-article-summary',
  '/knowledge/summaries',
  'kb:Summary',
  '{"source_url": "https://...", "summary": "...", "extracted_entities": ["Entity A", "Entity B"]}'
);

-- Commit with descriptive message
-- POST .../raisin:cmd/commit { "message": "Nightly enrichment: 47 new summaries", "actor": "enrichment-agent" }

-- Human reviews the branch contents before merging to main
```

### Pattern 4: A/B Testing Agent Strategies

Run two agent strategies on separate branches and compare results:

```sql
-- Strategy A branch
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/strategy-a', 'main');
-- Strategy B branch
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/strategy-b', 'main');

-- Both agents process the same input independently
-- Compare outputs by querying each branch
SELECT COUNT(*), AVG(properties->>'confidence'::String)
FROM 'default'  -- on agent/strategy-a
WHERE node_type = 'research:Finding';

SELECT COUNT(*), AVG(properties->>'confidence'::String)
FROM 'default'  -- on agent/strategy-b
WHERE node_type = 'research:Finding';
```

## Combining Branches with Vector Search

Each branch has its own vector index. This means an agent's embeddings are isolated to its branch:

```sql
-- Search for similar content within the agent's branch
-- (connected to agent/researcher branch)
SELECT id, name, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC
```

When branches merge, their vector indexes are reconciled. See [Embeddings and Vector Search](./embeddings-and-vector-search.md) for details.

## Why This Matters

Most AI infrastructure forces you to choose between:
- **Simple but unsafe** — agents share a flat namespace, overwriting each other
- **Safe but complex** — you build isolation yourself with namespaces, metadata tags, and manual cleanup

RaisinDB gives you both: the simplicity of "just write to the database" with the safety of full isolation, history, and rollback. Branches are a first-class primitive, not a workaround.

## Next Steps

- [RAG Patterns](./rag-patterns.md) — combine branch isolation with retrieval-augmented generation
- [Embeddings and Vector Search](./embeddings-and-vector-search.md) — vector search within branches
- [Function-Based Tool Use](./function-based-tool-use.md) — give agents callable tools
