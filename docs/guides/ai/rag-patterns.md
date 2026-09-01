---
sidebar_position: 4
title: RAG Patterns
description: Build retrieval-augmented generation pipelines using RaisinDB's content graph, vector search, and workspaces
---

# RAG Patterns

Retrieval-Augmented Generation (RAG) combines LLM generation with relevant context retrieved from your data. RaisinDB is uniquely suited for RAG because it combines vector search, a hierarchical content graph, and workspace isolation in a single system — no need to stitch together a vector database, a document store, and a graph database.

## End-to-End RAG Workflow

```
User Query
    │
    ▼
Generate query embedding
    │
    ▼
Vector search (KNN / HYBRID_SEARCH)  ──►  Candidate nodes
    │
    ▼
Enrich with graph context       ──►  Related nodes via hierarchy/relations
    │
    ▼
Assemble prompt context
    │
    ▼
LLM generates answer
    │
    ▼
(Optional) Store answer as a node
```

## Step 1: Store Knowledge as Nodes

Structure your knowledge base as a content hierarchy. Each piece of knowledge is a node with properties and an automatically generated embedding:

```sql
-- Create a knowledge base article
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/docs/guides/getting-started',
  'getting-started',
  'kb:Article',
  '{
    "title": "Getting Started Guide",
    "content": "RaisinDB is a multi-tenant content database with git-like versioning...",
    "author": "docs-team",
    "tags": ["introduction", "setup"],
    "status": "published"
  }'::jsonb
);
```

When the node is created, RaisinDB automatically generates an embedding from the content (if an [embedding provider is configured](./ai-provider-configuration.md)) and indexes it in the HNSW vector store.

## Step 2: Automatic Document Chunking

When chunking is enabled in your embedding configuration, RaisinDB automatically splits long documents into chunks, generates embeddings for each chunk via the batch embedding API, and indexes them in the HNSW vector store. No manual chunking is needed.

```yaml
chunking:
  chunk_size: 512
  splitter: recursive     # recursive | fixed_size | markdown | code
  overlap:
    type: Tokens          # Tokens (a count) or Percentage (0.0–0.5)
    value: 64
```

These are the `chunking` settings on a [processing rule](./asset-processing.md#tasks),
so you can chunk a legal contract differently from a changelog.

:::info Automatic chunks are not nodes
Chunks produced by the embedding pipeline live in the embedding index, keyed by
`(source node, chunk index)` — they are **not** child nodes and will not appear
in a `SELECT` over the workspace. That is why retrieval returns one row per
**node** with a `chunk_index` telling you which chunk answered, rather than
separate chunk rows.
:::

If you want chunks to be first-class content — separately addressable, editable,
or permissioned — model them as child nodes yourself. That is an ordinary
content-modelling choice, and those nodes are embedded like any other:

```sql
-- Parent document
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/docs/architecture/architecture-overview',
  'architecture-overview',
  'kb:Article',
  '{"title": "Architecture Overview", "content": "Introduction to the system architecture..."}'::jsonb
);

-- Manual chunks as child nodes
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/docs/architecture/architecture-overview/chunk-1',
  'chunk-1',
  'kb:Chunk',
  '{"content": "The storage layer uses RocksDB with 40+ column families...", "position": 1, "source_doc": "architecture-overview"}'::jsonb
);
```

## Step 3: Retrieval Query Patterns

### Basic Vector Retrieval

Find the most relevant chunks for a user query:

```sql
SELECT
  node_id,
  path,
  properties->>'content'::String AS content,
  properties->>'source_doc'::String AS source,
  vector_distance,
  chunk_index
FROM KNN('how do I rotate an API key', 10, workspaces => 'knowledge')
WHERE node_type = 'kb:Chunk';
```

### Scoped Retrieval by Workspace

Use workspaces to separate knowledge domains. A customer support bot searches the `support` workspace; an engineering bot searches `engineering`:

```sql
-- Support bot searches only support knowledge
SELECT path, properties->>'content'::String AS content, vector_distance
FROM KNN('refund policy', 10, workspaces => 'support');

-- Engineering bot searches only engineering knowledge
SELECT path, properties->>'content'::String AS content, vector_distance
FROM KNN('deployment rollback', 10, workspaces => 'engineering');
```

### Scoped Retrieval by Path

Use the content hierarchy to scope retrieval to specific areas:

```sql
-- Only search within the API documentation.
-- The operator form is an ordinary scan, so structural predicates are
-- pushed into it.
SELECT path, properties->>'content'::String AS content,
       embedding <=> EMBEDDING('pagination cursors') AS distance
FROM 'knowledge'
WHERE PATH_STARTS_WITH(path, '/docs/api/')
ORDER BY distance
LIMIT 10;
```

### Filtered Retrieval

Combine vector search with property filters:

```sql
-- Only retrieve published content
SELECT path, properties->>'content'::String AS content, vector_distance
FROM KNN('single sign-on setup', 10, workspaces => 'knowledge')
WHERE properties->>'status'::String = 'published'
  AND node_type = 'kb:Article';
```

## Step 4: Enrich with Graph Context

This is where RaisinDB's content graph adds value beyond a flat vector store. After finding relevant chunks, traverse the hierarchy to gather related context:

### Get Parent Document for a Chunk

```sql
-- Having retrieved a chunk node at /docs/architecture/architecture-overview/chunk-1,
-- fetch the article it belongs to.
SELECT path, properties->>'title'::String AS title,
       properties->>'content'::String AS content
FROM 'knowledge'
WHERE path = '/docs/architecture/architecture-overview'
```

### Get Sibling Chunks

```sql
-- Get all chunks from the same document for fuller context
SELECT properties->>'content'::String AS content, properties->>'position'::String AS position
FROM 'knowledge'
WHERE PATH_STARTS_WITH(path, '/docs/architecture/architecture-overview')
  AND node_type = 'kb:Chunk'
ORDER BY properties->>'position'::String ASC
```

### Traverse Related Documents

Use graph queries to find related content:

```sql
-- Find documents this one points at
SELECT * FROM GRAPH_TABLE(
  knowledge
  MATCH (source:Article)-[:REFERENCES]->(related:Article)
  WHERE source.path = '/docs/architecture/architecture-overview'
  COLUMNS (related.path AS path, related.title AS title)
)
```

### Combine Vector + Graph in a Single Pipeline

1. **Vector search** finds the top-k most relevant chunks
2. **Parent traversal** fetches the full source document for each chunk
3. **Sibling retrieval** gets surrounding chunks for context
4. **Relation traversal** finds linked/referenced documents
5. **Assemble** all context into the LLM prompt

## Step 5: Assemble and Generate

With retrieved context, build the prompt for your LLM:

```javascript
// In a RaisinDB function
async function handler(input) {
  // 1. Retrieve. KNN embeds the query text for you, so no separate embed
  //    call is needed — see the note below for when you would make one.
  const { rows, error } = raisin.sql.query(
    `SELECT path, properties->>'content'::String AS content, vector_distance
     FROM KNN($1, 5, workspaces => 'knowledge')`,
    [input.question]
  );
  if (error) throw new Error(error);

  // 2. Build context from the retrieved rows
  const context = rows.map(r => r.content).join('\n\n');

  // 3. Call the LLM with that context
  const answer = raisin.ai.completion({
    model: 'claude-sonnet-5',
    messages: [
      { role: 'user',
        content: `Answer the question based on the following context:\n\n${context}\n\nQuestion: ${input.question}` }
    ]
  });

  return { answer: answer.content, sources: rows.map(r => r.path) };
}
```

## Step 6: Store Agent Outputs (Optional)

Store the generated answer as a node for future retrieval — your RAG system learns from its own answers:

```sql
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/answers/2026-03/answer-12345',
  'answer-12345',
  'kb:Answer',
  '{
    "question": "How does the storage layer work?",
    "answer": "The storage layer uses RocksDB with 40+ column families...",
    "sources": ["chunk-1", "chunk-2"],
    "confidence": 0.94,
    "generated_at": "2026-03-31T12:00:00Z"
  }'::jsonb
);
```

## Advanced Patterns

### Hybrid Search for RAG

The `HYBRID_SEARCH` table function combines full-text and vector search using Reciprocal Rank Fusion (RRF), producing a single ranked result set. This is often more effective for RAG than pure vector search because it captures both exact keyword matches and semantic similarity:

```javascript
async function handler(input) {
  // Use HYBRID_SEARCH for combined full-text + vector retrieval
  const { rows, error } = raisin.sql.query(
    `SELECT node_id, path, name, score, properties
     FROM HYBRID_SEARCH($1, 10, workspaces => 'knowledge')`,
    [input.question]
  );
  if (error) throw new Error(error);

  const context = rows.map(r => r.properties.content).join('\n\n');

  const answer = raisin.ai.completion({
    model: 'claude-sonnet-5',
    messages: [
      { role: 'user',
        content: `Answer based on this context:\n\n${context}\n\nQuestion: ${input.question}` }
    ]
  });

  return { answer: answer.content, sources: rows.map(r => r.path) };
}
```

:::note API shapes
`raisin.sql.query(sql, params)` returns `{ rows, error }` — a failed query
resolves rather than throwing, so check `error`. `raisin.ai.completion` takes
`{ model, messages }` and returns `{ content, model, finish_reason, tool_calls }`.

You rarely need `raisin.ai.embed` in a RAG handler, because the search functions
embed the query for you. When you do want the raw vector, it takes an object and
returns one: `raisin.ai.embed({ model: 'text-embedding-3-small', input: 'text' })`
→ `{ embedding, dimensions }`. Both `model` and `input` are required.
:::

:::tip
Use `HYBRID_SEARCH` when your knowledge base contains content where exact terminology matters (e.g., product names, error codes, API endpoints) alongside content where semantic understanding is important.
:::

### Multi-Workspace RAG

Search across multiple knowledge domains and let the LLM synthesize:

```sql
-- One query, several workspaces: the scope takes a list, and `workspace_id`
-- comes back as a column, so no UNION is needed.
SELECT workspace_id, path,
       properties->>'content'::String AS content,
       vector_distance
FROM KNN('why did the deploy fail', 10,
         workspaces => 'support, engineering');
```

### RAG with Branch Isolation

Use [agent branches](./agent-memory-with-branches.md) to let a RAG agent build up knowledge over time without affecting the main branch:

```sql
-- Create a branch for the RAG agent's session
CREATE BRANCH 'agent/rag-session-001' FROM 'main';

-- Agent stores generated answers and extracted facts on its branch
-- These can be reviewed and merged later
```

### Versioned Knowledge Base

Because RaisinDB tracks revisions, you can build a RAG system that answers questions about how things **used to be**:

```sql
-- What did the docs say at revision 50?
-- The operator form is an ordinary scan, so the __revision predicate
-- applies exactly as it does to any other query.
SELECT path, properties->>'content'::String AS content,
       embedding <=> EMBEDDING('rate limit policy') AS distance
FROM 'knowledge'
WHERE __revision = 50
ORDER BY distance
LIMIT 5
```

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md) — deeper dive into vector search configuration
- [Agent Memory with Branches](./agent-memory-with-branches.md) — isolate RAG agents with branches
- [Function-Based Tool Use](./function-based-tool-use.md) — build RAG pipelines as serverless functions
