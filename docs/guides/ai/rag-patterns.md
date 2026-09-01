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
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'getting-started',
  '/docs/guides',
  'kb:Article',
  '{
    "title": "Getting Started Guide",
    "content": "RaisinDB is a multi-tenant content database with git-like versioning...",
    "author": "docs-team",
    "tags": ["introduction", "setup"],
    "status": "published"
  }'
);
```

When the node is created, RaisinDB automatically generates an embedding from the content (if an [embedding provider is configured](./ai-provider-configuration.md)) and indexes it in the HNSW vector store.

## Step 2: Automatic Document Chunking

When chunking is enabled in your embedding configuration, RaisinDB automatically splits long documents into chunks, generates embeddings for each chunk via the batch embedding API, and indexes them in the HNSW vector store. No manual chunking is needed.

```yaml
defaults:
  chunking:
    strategy: "tokens"
    chunk_size: 512
    chunk_overlap: 50
```

Chunks are stored as child nodes in the content hierarchy, preserving the relationship to their source document. Results are fused per **node**, so one long document does not fill your result set; `chunk_index` tells you which chunk answered.

If you need manual control over chunking, you can still create chunks as child nodes explicitly:

```sql
-- Parent document
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'architecture-overview',
  '/docs/architecture',
  'kb:Article',
  '{"title": "Architecture Overview", "content": "Introduction to the system architecture..."}'
);

-- Manual chunks as child nodes
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'chunk-1',
  '/docs/architecture/architecture-overview',
  'kb:Chunk',
  '{"content": "The storage layer uses RocksDB with 40+ column families...", "position": 1, "source_doc": "architecture-overview"}'
);
```

## Step 3: Retrieval Query Patterns

### Basic Vector Retrieval

Find the most relevant chunks for a user query:

```sql
-- $1 = embedding vector generated from the user's question
SELECT
  id,
  name,
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
-- After finding chunk-2 as relevant, get its parent article
SELECT id, properties->>'title'::String AS title, properties->>'content'::String AS content
FROM 'knowledge'
WHERE PARENT(path) = '/docs/architecture'
  AND node_type = 'kb:Article'
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
-- Find documents related to a given document via Cypher
SELECT * FROM cypher('
  MATCH (source:Article {id: "architecture-overview"})-[:REFERENCES]->(related:Article)
  RETURN related.title, related.content
')
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
  // 1. Generate embedding for the user's question
  const queryEmbedding = await raisin.ai.embed(input.question);

  // 2. Vector search for relevant chunks
  const results = await raisin.sql.query(
    `SELECT path, properties->>'content'::String AS content, vector_distance
     FROM KNN($1, 5, workspaces => 'knowledge')`,
    [queryEmbedding]
  );

  // 3. Build context from results
  const context = results.map(r => r.content).join('\n\n');

  // 4. Call LLM with context
  const answer = await raisin.ai.generate({
    prompt: `Answer the question based on the following context:\n\n${context}\n\nQuestion: ${input.question}`,
    model: 'claude-sonnet-4-20250514'
  });

  return { answer: answer.text, sources: results.map(r => r.id) };
}
```

## Step 6: Store Agent Outputs (Optional)

Store the generated answer as a node for future retrieval — your RAG system learns from its own answers:

```sql
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'answer-12345',
  '/answers/2026-03',
  'kb:Answer',
  '{
    "question": "How does the storage layer work?",
    "answer": "The storage layer uses RocksDB with 40+ column families...",
    "sources": ["chunk-1", "chunk-2"],
    "confidence": 0.94,
    "generated_at": "2026-03-31T12:00:00Z"
  }'
);
```

## Advanced Patterns

### Hybrid Search for RAG

The `HYBRID_SEARCH` table function combines full-text and vector search using Reciprocal Rank Fusion (RRF), producing a single ranked result set. This is often more effective for RAG than pure vector search because it captures both exact keyword matches and semantic similarity:

```javascript
async function handler(input) {
  // Use HYBRID_SEARCH for combined full-text + vector retrieval
  const results = await raisin.sql.query(
    `SELECT node_id, name, score, properties
     FROM HYBRID_SEARCH($1, 10, workspaces => 'knowledge')`,
    [input.question]
  );

  const context = results.map(r => r.properties.content).join('\n\n');

  const answer = await raisin.ai.generate({
    prompt: `Answer based on this context:\n\n${context}\n\nQuestion: ${input.question}`,
    model: 'claude-sonnet-4-20250514'
  });

  return { answer: answer.text, sources: results.map(r => r.node_id) };
}
```

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
INSERT INTO 'raisin:branches' (name, from_branch) VALUES ('agent/rag-session-001', 'main');

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
