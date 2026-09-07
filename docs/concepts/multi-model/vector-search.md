---
sidebar_position: 3
---

# Vector Search

RaisinDB stores vector embeddings alongside your content and answers
approximate nearest-neighbour queries from a built-in HNSW index. Semantic
search, "more like this" and hybrid keyword-plus-meaning queries are all SQL.

## How it works

1. **Embed**: when a node is created or updated, a job sends its text to the
   tenant's configured embedding provider and stores the vectors.
2. **Index**: vectors go into an HNSW (Hierarchical Navigable Small World) graph
   for logarithmic-time approximate search.
3. **Query**: use the `KNN` and `HYBRID_SEARCH` table functions, or the `<=>`
   distance operator in an ordinary query, with filters as needed.

## What gets embedded

- Text is taken from the node's fields marked `index: [Vector]` in its node
  type, plus its name and path when the tenant configuration says so.
- Long text is chunked (256 tokens with 64 overlap by default) and each chunk
  gets its own vector, keyed by node and chunk index.
- Vectors are stored per tenant, repository, branch and workspace, and grouped
  into partitions by embedding model and kind (`text` or `image`).

## Similarity queries

### Basic vector search

```sql
SELECT path, properties->>'title'::String AS title, vector_distance, chunk_index
FROM KNN('how do vector indexes work', 10, workspaces => 'default');
```

- The first argument is the query. Plain text is embedded with the tenant's
  provider; `EMBEDDING('...')`, a literal vector, or `VECTOR_OF('ws:/path')`
  also work.
- `10` is the number of rows.
- `workspaces` is required: a name, a comma-separated list, a glob such as
  `'content-*'`, or `'ALL READABLE'`.
- `vector_distance` is the cosine distance; lower is closer.

### Interpreting distance

Cosine distance is `1 - cosine similarity`:

| Distance | Interpretation |
|----------|----------------|
| 0.0 | identical |
| up to about 0.4 | close in meaning |
| 0.4 to 0.6 | loosely related |
| above 0.6 | filtered out by default |

The cutoff is configurable per tenant
(`ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5'`) and per query
(`max_distance => 0.3`).

### Vector search plus filters

```sql
SELECT path, vector_distance
FROM KNN('sustainable packaging', 20, workspaces => 'default')
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
LIMIT 10;
```

The `WHERE` is applied after the search, so ask the index for more rows than
you need when a filter is selective.

### Vector plus full-text

`HYBRID_SEARCH` runs both legs and fuses them by rank (reciprocal rank
fusion), so an exact product name and a paraphrase both count:

```sql
SELECT path, score, fulltext_rank, vector_rank
FROM HYBRID_SEARCH('how does authentication work', 10, workspaces => 'default');
```

### Search within a subtree

The operator form is planned as an index scan when the distance is the
`ORDER BY` key and there is a `LIMIT`. Structural predicates are pushed into it:

```sql
SELECT path, embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'default'
WHERE PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY distance
LIMIT 10;
```

## One row per node, with `chunk_index`

The unit the index stores is a chunk, but results are fused per node by
default, so a long handbook occupies one row. `chunk_index` and `chunk_text`
name the passage that answered:

```sql
SELECT path, chunk_index, chunk_text, vector_distance
FROM KNN('rotating an API key', 5, workspaces => 'handbook');
```

Ask for `granularity => 'chunk'` to get one row per passage instead, which is
what a RAG prompt usually wants. `chunk_index` is `0` for a document that was
never chunked and `NULL` when a hybrid hit came from the lexical leg only.

## Embedding providers

Providers are configured per tenant. The embedding configuration can point at
any of these kinds:

| Kind | Notes |
|----------|-------|
| `openai` | `text-embedding-3-small` (1536), `text-embedding-3-large` (3072) |
| `azure_openai`, `groq`, `openrouter`, `custom` | any OpenAI-compatible `/embeddings` endpoint |
| `anthropic` | embeddings are served by Voyage AI |
| `ollama` | local models such as `nomic-embed-text` (768) or `bge-m3` (1024) |

API keys are encrypted with AES-256-GCM before storage and are never returned
by any read. See the
[AI Provider Configuration guide](/docs/guides/ai/ai-provider-configuration).

## Isolation

Vectors and indexes are scoped by tenant, repository and branch, and searches
are filtered by workspace and row-level security inside the graph walk:

- no cross-tenant results
- a branch searches its own content; creating a branch copies the parent's
  embeddings and index
- a caller only ever sees hits they could read as nodes

## Index settings

Two index properties are configurable, both on the tenant's embedding
configuration:

| Setting | Values | Notes |
|---------|--------|-------|
| `distance_metric` | `cosine` (default), `l2`, `inner_product`, `hamming` | the metric the partition is built with |
| `quantization` | `F32` (default), `F16`, `Int8` | storage precision; `F16` halves memory, `Int8` quarters it |

The HNSW graph parameters (connectivity and expansion factors) use the
library defaults and are not exposed.

## Performance

- HNSW gives approximate search in logarithmic time; a query over a few
  hundred vectors answers in tens of milliseconds including embedding the
  query text.
- Loaded indexes are kept in a memory cache with a 512 MB budget.
- Changed indexes are written to disk about every 60 seconds and on shutdown.
- `SHOW VECTOR INDEX HEALTH`, `VERIFY VECTOR INDEX` and `REBUILD VECTOR INDEX`
  inspect and repair the index for the current branch.

## Next Steps

- [Full-Text Search](./full-text-search): keyword search
- [Document Model](./document-model): how nodes store content
- [Vector Functions reference](/docs/reference/sql/functions/vector-functions): the full grammar
