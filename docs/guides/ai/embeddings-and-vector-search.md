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

:::tip Uploaded files take one more step
The above describes node **content** — properties written directly. An uploaded
binary has to be read first: its text is extracted into `__extracted_text`, and
only then chunked and embedded. Which files that happens to, and what to check
when a document is not searchable, is [Asset Processing](./asset-processing.md).
The core server reads PDFs and nothing else, so a `.docx` on a stock server is
inert until a plugin is installed — visibly, via `__extract_status`, not
silently.
:::

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

## Distance Filtering in WHERE Clauses

You can filter results by distance directly in SQL using the `<=>` operator. The HNSW engine extracts the threshold and applies it during the search for optimal performance:

```sql
-- Only return results within a cosine distance of 0.3
SELECT id, name, properties->>'title'::String AS title
FROM 'default'
WHERE embedding <=> EMBEDDING('machine learning') < 0.3
ORDER BY embedding <=> EMBEDDING('machine learning');
```

### Configurable Default Max Distance

By default, vector search filters out results beyond a maximum distance threshold. You can configure this per-tenant:

```sql
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
```

This replaces the previous hard-coded threshold and gives you control over how aggressively distant results are filtered.

## Hybrid Search: Vector + Full-Text

### Filtering with Vector Search

Combine vector similarity with traditional SQL filters for more precise results:

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

### HYBRID_SEARCH Table Function

The `HYBRID_SEARCH` table function combines full-text search and vector similarity using Reciprocal Rank Fusion (RRF) to produce a single ranked result set. This is the recommended approach when you want the best of both keyword matching and semantic search:

```sql
SELECT * FROM HYBRID_SEARCH('how does authentication work', 10);
```

This returns up to 10 results with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| `node_id` | TEXT | The matched node ID |
| `name` | TEXT | Node name |
| `path` | TEXT | Node path in the content hierarchy |
| `node_type` | TEXT | Node type |
| `score` | DOUBLE | Combined RRF score (higher = more relevant) |
| `fulltext_rank` | DOUBLE | Full-text search rank |
| `vector_rank` | DOUBLE | Vector similarity rank |
| `vector_distance` | DOUBLE | Raw vector distance |
| `properties` | JSON | Node properties |

:::tip
`HYBRID_SEARCH` is ideal for RAG applications where pure vector search may miss keyword-specific matches and pure full-text search may miss semantically similar content.
:::

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

## Document Chunking

When chunking is enabled in your embedding configuration, long documents are automatically chunked before embedding. The embedding worker splits content using the configured strategy, generates embeddings for each chunk via the batch embedding API, and stores them in the HNSW index with chunk metadata.

No manual chunking is needed — the pipeline handles splitting, embedding, and indexing automatically when nodes are created or updated.

This is also why extraction hands text back to the server rather than doing its
own indexing: chunk ids follow a fixed grammar, and an index built with ids the
live search path never produces returns zero rows while reporting no fault. See
[Asset Processing](./asset-processing.md#handing-text-back-raisinassetssetextractedtext).

## Vector Index Management

RaisinDB provides SQL commands to manage and monitor HNSW indexes:

```sql
-- Rebuild the vector index from stored embeddings
REBUILD VECTOR INDEX;

-- Verify index integrity
VERIFY VECTOR INDEX;

-- Show index health statistics
SHOW VECTOR INDEX HEALTH;
```

These commands are available via SQL and pgwire, making them accessible from `psql` or any PostgreSQL-compatible client.

## EXPLAIN for Vector Queries

Use `EXPLAIN` to inspect how vector queries are executed:

```sql
EXPLAIN SELECT id, name, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC;
```

This shows the `VectorScan` plan details, including the number of candidates, distance metric, and any threshold filtering applied.

## Performance Characteristics

The HNSW index provides:

- **O(log n) search time** — fast even with millions of vectors
- **Memory-bounded** — uses an LRU cache to limit memory usage
- **Persistent** — periodic snapshots to disk with dirty tracking
- **Crash-safe** — graceful shutdown ensures all dirty indexes are saved
- **Multi-tenant** — separate indexes per tenant/repo/branch

## Next Steps

- [Asset Processing](./asset-processing.md) — how an uploaded file becomes searchable in the first place
- [RAG Patterns](./rag-patterns.md) — build end-to-end retrieval-augmented generation pipelines
- [Agent Memory with Branches](./agent-memory-with-branches.md) — use branches for isolated AI agent work
- [AI Provider Configuration](./ai-provider-configuration.md) — set up embedding providers
