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

RaisinDB exposes search through **three table functions over one engine**, plus a
distance operator you can use in an ordinary query:

| Surface | Legs | Use it for |
|---|---|---|
| `KNN(query, limit, …)` | vector only | meaning; cross-lingual; "more like this" |
| `FULLTEXT_SEARCH(query, language, …)` | lexical only | exact words, names, codes, phrases |
| `HYBRID_SEARCH(query, limit, …)` | both, rank-fused | the default for RAG and site search |
| `embedding <=> EMBEDDING('…')` | vector only | a distance column in a normal `SELECT` |

All three functions return the same columns, apply the same row-level security,
and take the same **required** workspace scope.

### Basic Vector Search

Find the 10 most similar nodes to a query vector:

```sql
SELECT path, name, vector_distance, chunk_index
FROM KNN('how do vector indexes work', 10, workspaces => 'default');
```

- The first argument is the **query**. Plain text is embedded with your tenant's
  provider; you can also pass `EMBEDDING('…')`, a literal vector (`ARRAY[…]` or
  the pgvector text form `'[0.1,0.2]'`), or `VECTOR_OF('ws:/path')` to use a
  node's own stored vector.
- `10` is the number of results (top-k). Default is 10.
- `workspaces` is **required** — see below.
- `vector_distance` is the cosine distance (lower = more similar).
- `chunk_index` names which chunk of a long document answered.

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
SELECT path, properties->>'title'::String AS title, vector_distance
FROM KNN('quarterly revenue', 5, workspaces => 'default')
WHERE node_type = 'article';
```

The vector leg runs first to identify candidates; the residual `WHERE` is applied to the rows it emits, so `limit` still means rows delivered.

### The workspace scope is required

The universe a search covers is the most consequential thing about it, so it is
written in the query and cannot be defaulted. There are exactly four spellings:

```sql
workspaces => 'library'              -- one workspace
workspaces => 'library, handbook'    -- a list; every name must resolve
workspaces => 'content-*'            -- a glob; matching nothing is fine
workspaces => 'ALL READABLE'         -- every workspace this caller may read
```

A **name** is an assertion, so one that does not resolve is an error. A **glob**
is a question, so matching nothing is not. `'*'` and `'ALL'` are rejected on
purpose: `'ALL READABLE'` is two uppercase words that appear in no other
context, so "which of our queries go repo-wide?" is one grep.

Omitting the scope is an error, not a repo-wide search.

### One row per node, and `chunk_index` tells you which chunk

Long documents are chunked and each chunk is embedded separately, but results
are fused per **node** — a 40-page handbook does not occupy ten of your ten
slots. `chunk_index` tells you which chunk matched, which is exactly what a RAG
caller needs to cite the right passage. It is `0` for a document that was never
chunked, and `NULL` when the hit had no vector leg.

### Result columns

Every entry point emits the same row:

| Column | Meaning |
|---|---|
| `node_id`, `workspace_id` | the hit's identity — a node id is unique only *within* its workspace |
| `name`, `path`, `node_type` | from the node |
| `score` | the fused rank score |
| `fulltext_rank` | 1-based rank in the lexical leg, `NULL` if it did not match |
| `vector_rank` | 1-based rank in the vector leg, `NULL` if it did not match |
| `vector_distance` | cosine distance of the vector hit, `NULL` when `vector_rank` is |
| `chunk_index` | which chunk answered; `0` for an unchunked document |
| `embedding_kind` | `'text'` or `'image'` — which embedding space produced the hit |
| `revision`, `created_at`, `updated_at` | from the node |
| `properties` | the node's properties, already field-filtered by the permission that granted access |

They behave like ordinary columns — project them, filter on them, order by them.
A residual `WHERE` is applied *after* fusion, so `limit` still means rows
delivered:

```sql
SELECT path, node_type, score
FROM HYBRID_SEARCH('winter storage', 10, workspaces => 'ALL READABLE')
WHERE workspace_id = 'library';
```

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
SELECT path, properties->>'title'::String AS title, vector_distance
FROM KNN('neural network training', 20, workspaces => 'default')
WHERE properties->>'category'::String = 'technology'
LIMIT 10;
```

```sql
-- Vector search + path hierarchy.
-- The operator form is an ordinary scan, so structural predicates compose
-- naturally and are pushed into it.
SELECT path, name,
       embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'default'
WHERE PATH_STARTS_WITH(path, '/knowledge-base/docs/')
ORDER BY distance
LIMIT 10;
```

This lets you scope vector search to specific categories, content types, or locations in the content hierarchy.

### HYBRID_SEARCH Table Function

The `HYBRID_SEARCH` table function combines full-text search and vector similarity using Reciprocal Rank Fusion (RRF) to produce a single ranked result set. This is the recommended approach when you want the best of both keyword matching and semantic search:

```sql
SELECT * FROM HYBRID_SEARCH('how does authentication work', 10,
                            workspaces => 'default');
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
SELECT path, properties->>'question'::String AS question, vector_distance
FROM KNN('how do I reset my password', 10, workspaces => 'default')
WHERE node_type = 'faq:Entry';
```

## Branch-Scoped Vector Search

HNSW indexes are scoped to tenant, repository, and branch. When you create a new branch, the vector index is efficiently copied for the new branch context. This means:

- Vector search on `main` returns different results than on `feature-branch` if content diverged
- Each [agent branch](./agent-memory-with-branches.md) has its own independent vector index
- Merging branches reconciles both content and vector indexes

```sql
-- Search on a specific branch (set via connection context)
-- psql -U tenant1/repo1/feature-branch
SELECT path, name, vector_distance
FROM KNN('release checklist', 10, workspaces => 'default');
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
EXPLAIN SELECT path, name,
       embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'default'
ORDER BY distance
LIMIT 10;
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
