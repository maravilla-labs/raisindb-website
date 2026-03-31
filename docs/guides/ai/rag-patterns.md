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
Vector search (VECTOR_SEARCH)  ──►  Candidate nodes
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

## Step 2: Chunk Long Content as Child Nodes

For long documents, split content into child nodes. RaisinDB's hierarchy makes this natural — chunks are children of the source document:

```sql
-- Parent document
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'architecture-overview',
  '/docs/architecture',
  'kb:Article',
  '{"title": "Architecture Overview", "content": "Introduction to the system architecture..."}'
);

-- Chunks as child nodes
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'chunk-1',
  '/docs/architecture/architecture-overview',
  'kb:Chunk',
  '{"content": "The storage layer uses RocksDB with 40+ column families...", "position": 1, "source_doc": "architecture-overview"}'
);

INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'chunk-2',
  '/docs/architecture/architecture-overview',
  'kb:Chunk',
  '{"content": "The SQL engine parses queries through a multi-stage pipeline...", "position": 2, "source_doc": "architecture-overview"}'
);
```

Each chunk gets its own embedding, and `VECTOR_SEARCH` in **Documents mode** automatically deduplicates results by source document.

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
  __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND node_type = 'kb:Chunk'
ORDER BY __distance ASC
```

### Scoped Retrieval by Workspace

Use workspaces to separate knowledge domains. A customer support bot searches the `support` workspace; an engineering bot searches `engineering`:

```sql
-- Support bot searches only support knowledge
SELECT id, properties->>'content'::String AS content, __distance
FROM 'support'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC

-- Engineering bot searches only engineering knowledge
SELECT id, properties->>'content'::String AS content, __distance
FROM 'engineering'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC
```

### Scoped Retrieval by Path

Use the content hierarchy to scope retrieval to specific areas:

```sql
-- Only search within the API documentation
SELECT id, properties->>'content'::String AS content, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND PATH_STARTS_WITH(path, '/docs/api/')
ORDER BY __distance ASC
```

### Filtered Retrieval

Combine vector search with property filters:

```sql
-- Only retrieve published, recent content
SELECT id, properties->>'content'::String AS content, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND properties->>'status'::String = 'published'
  AND node_type = 'kb:Article'
ORDER BY __distance ASC
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
    `SELECT id, properties->>'content'::String AS content, __distance
     FROM 'knowledge'
     WHERE VECTOR_SEARCH(embedding, $1, 5)
     ORDER BY __distance ASC`,
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

### Multi-Workspace RAG

Search across multiple knowledge domains and let the LLM synthesize:

```sql
-- Search support knowledge
SELECT 'support' AS source_workspace, properties->>'content'::String AS content, __distance
FROM 'support'
WHERE VECTOR_SEARCH(embedding, $1, 5)

UNION ALL

-- Search engineering knowledge
SELECT 'engineering' AS source_workspace, properties->>'content'::String AS content, __distance
FROM 'engineering'
WHERE VECTOR_SEARCH(embedding, $1, 5)

ORDER BY __distance ASC
LIMIT 10
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
SELECT properties->>'content'::String AS content
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, $1, 5)
  AND __revision = 50
ORDER BY __distance ASC
```

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md) — deeper dive into vector search configuration
- [Agent Memory with Branches](./agent-memory-with-branches.md) — isolate RAG agents with branches
- [Function-Based Tool Use](./function-based-tool-use.md) — build RAG pipelines as serverless functions
