---
sidebar_position: 3
---

# Vector Search

RaisinDB stores vector embeddings alongside your content and provides fast approximate nearest neighbor (ANN) search using the HNSW algorithm. This enables semantic search, content recommendations, and hybrid queries that combine vectors with SQL filters.

## How It Works

1. **Generate embeddings** — RaisinDB sends node content to a configured embedding provider (OpenAI, Anthropic, local models, etc.) and stores the resulting vectors
2. **Index with HNSW** — Vectors are indexed using Hierarchical Navigable Small World graphs for O(log n) approximate nearest neighbor search
3. **Query via SQL** — Use the `KNN` / `HYBRID_SEARCH` table functions, or the `<=>` distance operator in an ordinary query, optionally combined with filters

## Embedding Storage

Each node can have an associated embedding vector. Embeddings are generated asynchronously through the job system when nodes are created or updated:

- Embeddings are stored per-node with metadata (model name, dimensions, revision)
- Multiple embedding providers are supported per tenant
- Long documents are automatically chunked before embedding

## Similarity Queries

### Basic Vector Search

Find the 10 nodes most similar to a query vector:

```sql
SELECT path, properties->>'title'::String AS title, vector_distance
FROM KNN('how do vector indexes work', 10, workspaces => 'default');
```

- The first argument is the query — plain text is embedded with your tenant's provider; `EMBEDDING('…')`, a literal vector, or `VECTOR_OF('ws:/path')` also work
- `10` is the number of results (k)
- `workspaces` is **required**: a name, a comma-separated list, a glob such as `'content-*'`, or `'ALL READABLE'`
- `vector_distance` is the cosine distance (lower = more similar)

### Interpreting Distance

RaisinDB uses cosine distance (1 - cosine similarity):

| Distance | Similarity | Interpretation |
|----------|-----------|----------------|
| 0.0 | 1.0 | Identical vectors |
| 0.2 – 0.4 | 0.8 – 0.6 | Semantically similar |
| 0.4 – 0.6 | 0.6 – 0.4 | Weakly related |
| > 0.6 | < 0.4 | Not related |

### Distance Filtering

Filter results by distance threshold directly in SQL. The threshold is extracted and pushed down to the HNSW engine for efficient search:

```sql
SELECT id, path
FROM 'default'
WHERE embedding <=> EMBEDDING('search query') < 0.3
ORDER BY embedding <=> EMBEDDING('search query');
```

The default maximum distance threshold is configurable per-tenant:

```sql
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
```

### Hybrid Search (Vector + Filters)

Combine vector similarity with property filters:

```sql
SELECT path, vector_distance
FROM KNN('sustainable packaging', 20, workspaces => 'default')
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
LIMIT 10;
```

Request more results from the vector index (20) than you need (10) to account for rows removed by the property filter.

### Hybrid Search (Vector + Full-Text)

The `HYBRID_SEARCH` table function combines full-text search and vector similarity using Reciprocal Rank Fusion (RRF):

```sql
SELECT * FROM HYBRID_SEARCH('how does authentication work', 10,
                            workspaces => 'default');
```

This produces a single ranked result set that merges keyword matches and semantic similarity, returning columns for both fulltext and vector ranks alongside a combined score. This approach avoids the weaknesses of either search method alone — pure vector search can miss exact keyword matches, while pure full-text search misses semantically equivalent terms.

### Search Within a Subtree

```sql
SELECT path, embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'default'
WHERE PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY distance
LIMIT 10;
```

## One row per node, with `chunk_index`

The unit the index stores is a **chunk**, but results are fused per **node** — a
40-page handbook does not occupy ten of your ten slots. The `chunk_index` column
tells you which chunk answered, which is what lets a RAG caller cite the right
passage:

```sql
SELECT path, chunk_index, vector_distance
FROM KNN('rotating an API key', 5, workspaces => 'handbook');
```

`chunk_index` is `0` for a document that was never chunked, and `NULL` when the
hit came from the lexical leg only.

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
| AWS Bedrock | Converse API + Titan embeddings (fully supported) |
| Ollama | Local models (self-hosted) |
| Custom | Any OpenAI-compatible endpoint |

API keys are encrypted with AES-256-GCM before storage. See the [AI Provider Configuration guide](/docs/guides/ai/ai-provider-configuration) for setup.

## Multi-Tenant Isolation

Vector indexes are isolated per tenant, repository, and branch. Each combination gets its own HNSW index, ensuring:

- No cross-tenant vector leakage
- Independent scaling per tenant
- Branch-aware search (feature branch changes don't affect main)

## HNSW Parameter Tuning

The HNSW index exposes several parameters for tuning the trade-off between search accuracy and performance:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `M` | 16 | Number of bi-directional links per node. Higher values improve recall but use more memory |
| `ef_construction` | 200 | Size of the dynamic candidate list during index building. Higher values produce a better graph but slow down insertion |
| `ef_search` | 50 | Size of the dynamic candidate list during search. Higher values improve recall at the cost of query latency |

These are configured through your embedding configuration and apply per-index.

## Vector Quantization

RaisinDB supports vector quantization to reduce memory usage at the cost of some precision:

| Format | Size per Dimension | Use Case |
|--------|-------------------|----------|
| **F32** (default) | 4 bytes | Full precision, best accuracy |
| **F16** | 2 bytes | 50% memory savings with minimal accuracy loss |
| **Int8** | 1 byte | 75% memory savings, suitable for large-scale approximate search |

Quantization is configured in the embedding configuration and applies when vectors are stored in the HNSW index.

## Performance

- **HNSW** provides O(log n) approximate search — sub-millisecond for millions of vectors
- **Cosine, L2, InnerProduct, and Hamming** distance metrics are supported
- **Moka LRU cache** limits memory usage with configurable cache size
- **Periodic snapshots** persist indexes to disk with crash-safe recovery

## Next Steps

- [Full-Text Search](./full-text-search) — Keyword-based search
- [Document Model](./document-model) — How nodes store content
- [Common Query Patterns](/docs/guides/querying/common-query-patterns) — SQL recipes including vector search
