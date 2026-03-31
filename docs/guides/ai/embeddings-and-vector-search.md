---
sidebar_position: 2
title: Embeddings and Vector Search
description: Generate embeddings, run vector similarity queries, and combine vector search with full-text search
---

# Embeddings and Vector Search

RaisinDB stores vector embeddings alongside your content and provides fast approximate nearest neighbor (ANN) search via an integrated HNSW index. This means you can query semantically similar content using standard SQL — no external vector database required.

## How Embeddings Work in RaisinDB

Every node in RaisinDB can have an associated embedding vector. When you create or update a node, RaisinDB can automatically generate an embedding from the node's content using your [configured AI provider](./ai-provider-configuration.md).

```
Node created/updated
        │
        ▼
  Embedding job queued
        │
        ▼
  Provider generates vector
  (e.g., OpenAI text-embedding-3-small → 1536 dimensions)
        │
        ▼
  Vector stored in HNSW index
  (scoped to tenant/repo/branch/workspace)
```

Embedding generation is **asynchronous** — it runs through the job system so write operations are never blocked.

## Configuring Auto-Embedding

To enable automatic embedding generation, ensure your tenant has an embedding provider configured (see [AI Provider Configuration](./ai-provider-configuration.md)). Embeddings are generated for node content based on your configuration.

## Vector Search with SQL

RaisinDB integrates vector search directly into the SQL engine using the `VECTOR_SEARCH` function.

### Basic Vector Search

Find the 10 most similar nodes to a query vector:

```sql
SELECT id, name, properties, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC
```

- `$1` is the query vector (typically generated from a text query using the same embedding model)
- `10` is the number of results (top-k)
- `__distance` is the cosine distance (lower = more similar)

### Understanding Distance Scores

RaisinDB uses **cosine distance** (1 - cosine similarity):

| Distance | Cosine Similarity | Interpretation |
|----------|-------------------|----------------|
| 0.0 | 1.0 | Identical vectors |
| 0.2 – 0.4 | 0.8 – 0.6 | Semantically similar |
| 0.4 – 0.6 | 0.6 – 0.4 | Weakly related |
| > 0.6 | < 0.4 | Not related |

### KNN Queries

K-nearest neighbor queries return the `k` closest vectors to your query:

```sql
-- Find 5 articles most similar to a query
SELECT id, name, properties->>'title'::String AS title, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 5)
  AND node_type = 'article'
ORDER BY __distance ASC
```

You can combine `VECTOR_SEARCH` with additional `WHERE` clauses. The vector search runs first to identify candidates, then additional filters are applied.

### Search Modes

RaisinDB supports two search modes for handling multi-chunk documents:

- **Documents mode** (default) — deduplicates results by source document, returning the best matching chunk per document
- **Chunks mode** — returns all matching chunks ranked by similarity

Documents mode is typically what you want for RAG applications, where you need unique source documents rather than multiple chunks from the same document.

## Hybrid Search: Vector + Full-Text

Combine vector similarity with traditional text search for more precise results:

```sql
-- Vector search + keyword filter
SELECT id, name, properties->>'title'::String AS title, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 20)
  AND properties->>'category'::String = 'technology'
ORDER BY __distance ASC
LIMIT 10
```

```sql
-- Vector search + path hierarchy
SELECT id, name, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND PATH_STARTS_WITH(path, '/knowledge-base/docs/')
ORDER BY __distance ASC
```

This lets you scope vector search to specific categories, content types, or locations in the content hierarchy.

## Filtering by Node Type

Restrict vector search to specific node types:

```sql
-- Only search within FAQ entries
SELECT id, name, properties->>'question'::String AS question, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND node_type = 'faq:Entry'
ORDER BY __distance ASC
```

## Branch-Scoped Vector Search

HNSW indexes are scoped to tenant, repository, and branch. When you create a new branch, the vector index is efficiently copied for the new branch context. This means:

- Vector search on `main` returns different results than on `feature-branch` if content diverged
- Each [agent branch](./agent-memory-with-branches.md) has its own independent vector index
- Merging branches reconciles both content and vector indexes

```sql
-- Search on a specific branch (set via connection context)
-- psql -U tenant1/repo1/feature-branch
SELECT id, name, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC
```

## Scoring Configuration

For multi-chunk documents, RaisinDB provides scoring controls:

- **Position decay** — earlier chunks in a document score higher than later chunks
- **First chunk boost** — the first chunk of a document gets a configurable score boost

These settings help ensure that the beginning of a document (which often contains the most relevant summary information) is weighted appropriately.

## Performance Characteristics

The HNSW index provides:

- **O(log n) search time** — fast even with millions of vectors
- **Memory-bounded** — uses an LRU cache to limit memory usage
- **Persistent** — periodic snapshots to disk with dirty tracking
- **Crash-safe** — graceful shutdown ensures all dirty indexes are saved
- **Multi-tenant** — separate indexes per tenant/repo/branch

## Next Steps

- [RAG Patterns](./rag-patterns.md) — build end-to-end retrieval-augmented generation pipelines
- [Agent Memory with Branches](./agent-memory-with-branches.md) — use branches for isolated AI agent work
- [AI Provider Configuration](./ai-provider-configuration.md) — set up embedding providers
