---
sidebar_position: 3
---

# Vector Search

RaisinDB stores vector embeddings alongside your content and provides fast approximate nearest neighbor (ANN) search using the HNSW algorithm. This enables semantic search, content recommendations, and hybrid queries that combine vectors with SQL filters.

## How It Works

1. **Generate embeddings** — RaisinDB sends node content to a configured embedding provider (OpenAI, Anthropic, local models, etc.) and stores the resulting vectors
2. **Index with HNSW** — Vectors are indexed using Hierarchical Navigable Small World graphs for O(log n) approximate nearest neighbor search
3. **Query via SQL** — Use `VECTOR_SEARCH` in standard SQL queries, optionally combined with filters

## Embedding Storage

Each node can have an associated embedding vector. Embeddings are generated asynchronously through the job system when nodes are created or updated:

- Embeddings are stored per-node with metadata (model name, dimensions, revision)
- Multiple embedding providers are supported per tenant
- Long documents are automatically chunked before embedding

## Similarity Queries

### Basic Vector Search

Find the 10 nodes most similar to a query vector:

```sql
SELECT id, path, properties->>'title'::String AS title, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
ORDER BY __distance ASC;
```

- `$1` is the query vector (generated from your search text by the same embedding model)
- `10` is the number of results (k)
- `__distance` is the cosine distance (lower = more similar)

### Interpreting Distance

RaisinDB uses cosine distance (1 - cosine similarity):

| Distance | Similarity | Interpretation |
|----------|-----------|----------------|
| 0.0 | 1.0 | Identical vectors |
| 0.2 – 0.4 | 0.8 – 0.6 | Semantically similar |
| 0.4 – 0.6 | 0.6 – 0.4 | Weakly related |
| > 0.6 | < 0.4 | Not related |

### Hybrid Search (Vector + Filters)

Combine vector similarity with property filters:

```sql
SELECT id, path, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 20)
  AND node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
ORDER BY __distance ASC
LIMIT 10;
```

Request more results from the vector index (20) than you need (10) to account for rows removed by the property filter.

### Search Within a Subtree

```sql
SELECT id, path, __distance
FROM 'default'
WHERE VECTOR_SEARCH(embedding, $1, 10)
  AND PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY __distance ASC;
```

## Search Modes

HNSW supports two modes for multi-chunk documents:

| Mode | Behavior |
|------|----------|
| **Documents** (default) | Deduplicates by source document, returning the best chunk per document |
| **Chunks** | Returns all matching chunks ranked by similarity |

Document mode is best for most use cases. Chunk mode is useful when you need to locate the exact passage within a long document.

## Chunk-Aware Scoring

When documents are split into chunks for embedding, scoring accounts for chunk position:

- **Position decay** — Earlier chunks (introductions, abstracts) score slightly higher
- **First chunk boost** — The first chunk of a document gets a configurable relevance boost

This helps surface the most relevant document rather than a random chunk from the middle.

## AI Provider Configuration

Embedding providers are configured per tenant. Supported providers:

| Provider | Notes |
|----------|-------|
| OpenAI | `text-embedding-3-small`, `text-embedding-3-large` |
| Anthropic | Claude embedding models |
| Azure OpenAI | Enterprise Azure deployments |
| Google Gemini | Gemini embedding models |
| AWS Bedrock | Claude, Titan embeddings |
| Ollama | Local models (self-hosted) |
| Custom | Any OpenAI-compatible endpoint |

API keys are encrypted with AES-256-GCM before storage. See the [AI Provider Configuration guide](/docs/guides/ai/ai-provider-configuration) for setup.

## Multi-Tenant Isolation

Vector indexes are isolated per tenant, repository, and branch. Each combination gets its own HNSW index, ensuring:

- No cross-tenant vector leakage
- Independent scaling per tenant
- Branch-aware search (feature branch changes don't affect main)

## Performance

- **HNSW** provides O(log n) approximate search — sub-millisecond for millions of vectors
- **Cosine distance** is optimized for normalized embeddings (OpenAI embeddings are pre-normalized)
- **Moka LRU cache** limits memory usage with configurable cache size
- **Periodic snapshots** persist indexes to disk with crash-safe recovery

## Next Steps

- [Full-Text Search](./full-text-search) — Keyword-based search
- [Document Model](./document-model) — How nodes store content
- [Common Query Patterns](/docs/guides/querying/common-query-patterns) — SQL recipes including vector search
