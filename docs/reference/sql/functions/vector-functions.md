---
sidebar_position: 9
---

# Vector Functions

Functions for vector embedding generation and similarity search.

## EMBEDDING

Generate a vector embedding from text input.

### Syntax

```sql
EMBEDDING(text) → VECTOR
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| text | TEXT | Input text to embed |

### Return Value

VECTOR - Vector embedding of the input text.

### Examples

```sql
-- Generate an embedding
SELECT EMBEDDING('machine learning algorithms');

-- Store embeddings for documents
UPDATE documents
SET embedding = EMBEDDING(title || ' ' || content)
WHERE embedding IS NULL;

-- Insert with embedding
INSERT INTO articles (title, content, embedding)
VALUES (
    'SQL Guide',
    'Learn SQL from scratch...',
    EMBEDDING('SQL Guide Learn SQL from scratch')
);
```

### Notes

- Embedding dimensions depend on the configured model
- Returns NULL if text is NULL or empty
- Useful for semantic search and similarity matching

---

## VECTOR_L2_DISTANCE

Calculate the L2 (Euclidean) distance between two vectors.

### Syntax

```sql
VECTOR_L2_DISTANCE(vector1, vector2) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| vector1 | VECTOR | First vector |
| vector2 | VECTOR | Second vector |

### Return Value

DOUBLE - Euclidean distance between the two vectors. Lower values indicate more similar vectors.

### Examples

```sql
-- Calculate distance between two document embeddings
SELECT VECTOR_L2_DISTANCE(a.embedding, b.embedding) AS distance
FROM documents a, documents b
WHERE a.title = 'SQL Guide' AND b.title = 'Database Tutorial';

-- Find nearest neighbors
SELECT title, VECTOR_L2_DISTANCE(embedding, EMBEDDING('search query')) AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

### Notes

- Both vectors must have the same dimensions
- Returns 0.0 for identical vectors
- Also available as the `<->` operator

---

## VECTOR_COSINE_DISTANCE

Calculate the cosine distance between two vectors.

### Syntax

```sql
VECTOR_COSINE_DISTANCE(vector1, vector2) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| vector1 | VECTOR | First vector |
| vector2 | VECTOR | Second vector |

### Return Value

DOUBLE - Cosine distance (1 - cosine similarity). Lower values indicate more similar vectors.

### Examples

```sql
-- Cosine similarity search
SELECT title, VECTOR_COSINE_DISTANCE(embedding, EMBEDDING('query text')) AS distance
FROM documents
ORDER BY distance
LIMIT 10;

-- Find semantically similar content
SELECT
    a.title AS source,
    b.title AS similar,
    VECTOR_COSINE_DISTANCE(a.embedding, b.embedding) AS distance
FROM documents a
CROSS JOIN documents b
WHERE a.__id != b.__id
  AND VECTOR_COSINE_DISTANCE(a.embedding, b.embedding) < 0.3
ORDER BY distance;
```

### Notes

- Range: 0.0 (identical direction) to 2.0 (opposite direction)
- Normalized for vector magnitude — measures directional similarity
- Also available as the `<=>` operator

---

## VECTOR_INNER_PRODUCT

Calculate the inner product (dot product) of two vectors.

### Syntax

```sql
VECTOR_INNER_PRODUCT(vector1, vector2) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| vector1 | VECTOR | First vector |
| vector2 | VECTOR | Second vector |

### Return Value

DOUBLE - Inner product of the two vectors. Higher values indicate more similar vectors.

### Examples

```sql
-- Inner product similarity
SELECT title, VECTOR_INNER_PRODUCT(embedding, EMBEDDING('search terms')) AS score
FROM documents
ORDER BY score DESC
LIMIT 10;
```

### Notes

- Higher values indicate greater similarity (unlike distance functions)
- Best suited for normalized vectors
- Also available as the `<#>` operator (returns negative inner product for ORDER BY compatibility)

---

## Vector Operators

### Distance Operators

| Operator | Function Equivalent | Description |
|----------|-------------------|-------------|
| `<->` | `VECTOR_L2_DISTANCE` | L2 (Euclidean) distance |
| `<=>` | `VECTOR_COSINE_DISTANCE` | Cosine distance |
| `<#>` | `VECTOR_INNER_PRODUCT` | Negative inner product |

### Examples

```sql
-- Using operators for nearest neighbor search
SELECT title
FROM documents
ORDER BY embedding <-> EMBEDDING('search query')
LIMIT 10;

-- Cosine distance with operator
SELECT title, embedding <=> EMBEDDING('machine learning') AS distance
FROM documents
WHERE embedding <=> EMBEDDING('machine learning') < 0.5
ORDER BY distance;

-- Inner product with operator
SELECT title, embedding <#> EMBEDDING('search terms') AS score
FROM documents
ORDER BY score
LIMIT 10;
```

---

## Search table functions: `KNN`, `FULLTEXT_SEARCH`, `HYBRID_SEARCH`

Three entry points over **one** engine. `KNN` is `HYBRID_SEARCH` with the
lexical leg switched off; `FULLTEXT_SEARCH` is the same with the vector leg off.
All three return the same columns and apply the same row-level security.

### Syntax

```text
HYBRID_SEARCH  ( query [, limit] [, workspace] [, named …] )
FULLTEXT_SEARCH( query ,  language            [, named …] )
KNN            ( query [, limit]              [, named …] )
```

Positionals must precede named arguments, and each value may be given once.
Unknown named arguments are **rejected**, not ignored.

### Parameters

| Named argument | `HYBRID_SEARCH` | `FULLTEXT_SEARCH` | `KNN` | Default |
|---|:-:|:-:|:-:|---|
| `workspaces` | ✅ | ✅ | ✅ | **required** |
| `limit` | ✅ | ✅ | ✅ | 10 (100 for `FULLTEXT_SEARCH`) |
| `language` | ✅ | ✅ (also positional #2) | — | the repo's default |
| `vector_weight` | ✅ | — | — | 1.0 |
| `fulltext_weight` | ✅ | — | — | 1.0 |
| `max_distance` | ✅ | — | ✅ | 0.6 |
| `kind` | ✅ | — | ✅ | `'text'` |

`language` must be an **ISO 639-1 code** (`'en'`, not `'english'`) — the index
stores two-letter codes. `kind` selects the embedding space: `'text'`,
`'image'` or `'all'`; it defaults to `'text'` so that adding an image tower
cannot silently change existing queries.

Setting `fulltext_weight => 0` skips the lexical leg entirely;
`vector_weight => 0` skips the vector leg, including embedding-provider
resolution — so a tenant with no embedder can still run a hybrid query.

### The `workspaces` scope is required

Omitting it is an error, not a repo-wide search. There are four spellings:

```sql
workspaces => 'library'              -- one workspace
workspaces => 'library, handbook'    -- a list; every name must resolve
workspaces => 'content-*'            -- a glob; matching nothing is fine
workspaces => 'ALL READABLE'         -- every workspace this caller may read
```

A **name** is an assertion (one that does not resolve is an error); a **glob**
is a question (matching nothing is not). `'*'` and `'ALL'` are rejected.

### The query argument

`KNN`'s first argument accepts five forms:

```sql
KNN('some text')                        -- embedded with the tenant's provider
KNN(EMBEDDING('some text'))             -- identical; the wrapper is unwrapped
KNN(ARRAY[0.1, 0.2, ...])               -- a vector literal
KNN('[0.1, 0.2, ...]')                  -- the pgvector text form
KNN(VECTOR_OF('library:/winter-layup')) -- a node's own stored vector
```

The last two are what make binding a vector as a query parameter work.
`VECTOR_OF` and raw vectors are **`KNN`-only**: they have no lexical surface, so
a `HYBRID_SEARCH` built on one would be a vector-only search reported as hybrid.

`VECTOR_OF(node_ref [, chunk])` requires a workspace prefix
(`'workspace:/path'` or `'workspace:<node-id>'`), because embeddings are keyed
by the workspace the node lives in, which is not necessarily one being searched.
The source node is excluded from its own results.

### Return columns

| Column | Type | Description |
|--------|------|-------------|
| node_id | TEXT | The matched node ID — unique only *within* its workspace |
| workspace_id | TEXT | The workspace the hit came from |
| name | TEXT | Node name |
| path | TEXT | Node path in the content hierarchy |
| node_type | TEXT | Node type |
| score | DOUBLE | Fused RRF score (higher = more relevant) |
| fulltext_rank | INTEGER | 1-based rank in the lexical leg; `NULL` if it did not match |
| vector_rank | INTEGER | 1-based rank in the vector leg; `NULL` if it did not match |
| vector_distance | DOUBLE | Cosine distance of the vector hit; `NULL` when `vector_rank` is |
| chunk_index | INTEGER | Which chunk answered; `0` for an unchunked document |
| embedding_kind | TEXT | `'text'` or `'image'` — which space produced the vector hit |
| revision | INTEGER | Node revision |
| created_at, updated_at | TEXT | Timestamps |
| properties | JSON | Node properties, already field-filtered by the granting permission |

### Examples

```sql
-- Basic hybrid search
SELECT path, score, fulltext_rank, vector_rank, vector_distance
FROM HYBRID_SEARCH('how does authentication work', 10,
                   workspaces => 'docs');

-- Filter the results: a residual WHERE is applied AFTER fusion,
-- so `limit` still means rows delivered.
SELECT node_id, name, score
FROM HYBRID_SEARCH('database replication', 20, workspaces => 'ALL READABLE')
WHERE node_type = 'kb:Article'
ORDER BY score DESC
LIMIT 10;

-- Semantic only, across a family of workspaces
SELECT path, chunk_index, vector_distance
FROM KNN('storing a boat over winter', 5, workspaces => 'content-*');

-- Lexical only, German analyzer
SELECT path, score
FROM FULLTEXT_SEARCH('Bremsbeläge', 'de', workspaces => 'library');

-- More like this, from a node's own stored vector
SELECT path, vector_distance
FROM KNN(VECTOR_OF('library:/winter-layup'), 4,
         workspaces => 'ALL READABLE');
```

### Notes

- Fusion is **rank-based**, never score-based: `score(doc) = Σ weight / (60 + rank)`.
  Distances from two embedding spaces are not commensurable, so they are
  reported (as `vector_distance`, beside `embedding_kind`) but never combined.
- Results are fused per **node**, not per chunk — one long document does not
  fill the result set. `chunk_index` names the chunk that answered.
- A query vector of the wrong width is refused rather than degraded.

## Distance Filtering in WHERE Clauses

The `<=>` operator can be used in `WHERE` clauses to filter results by distance. The threshold is extracted and pushed down to the HNSW engine for efficient search:

```sql
-- Only return results within cosine distance 0.3
SELECT id, name
FROM 'default'
WHERE embedding <=> EMBEDDING('machine learning') < 0.3
ORDER BY embedding <=> EMBEDDING('machine learning');
```

### Configurable Default Max Distance

```sql
-- Set the default maximum distance threshold per-tenant
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
```

This controls the default cutoff for vector search results. Results beyond this distance are filtered out.

---

## Vector Index Management

SQL commands for managing HNSW indexes.

### REBUILD VECTOR INDEX

Rebuild the HNSW index from stored embeddings:

```sql
REBUILD VECTOR INDEX;
```

Use this after bulk data imports or if the index becomes inconsistent.

### VERIFY VECTOR INDEX

Check the integrity of the HNSW index:

```sql
VERIFY VECTOR INDEX;
```

Returns a report of any inconsistencies found.

### SHOW VECTOR INDEX HEALTH

Display health statistics for the vector index:

```sql
SHOW VECTOR INDEX HEALTH;
```

Returns metrics including vector count, index size, and integrity status.

---

## Examples

### Semantic Search

```sql
-- Find documents semantically similar to a query
SELECT
    title,
    VECTOR_COSINE_DISTANCE(embedding, EMBEDDING('how to query databases')) AS relevance
FROM documents
ORDER BY relevance
LIMIT 20;
```

### Recommendation Engine

```sql
-- Find similar products based on description embeddings
SELECT
    b.name AS recommended,
    VECTOR_L2_DISTANCE(a.embedding, b.embedding) AS similarity
FROM products a
CROSS JOIN products b
WHERE a.name = 'Premium Widget'
  AND a.__id != b.__id
ORDER BY similarity
LIMIT 5;
```

### Hybrid Search (Vector + Full-Text)

```sql
-- Use the HYBRID_SEARCH table function for combined ranking
SELECT node_id, name, score, fulltext_rank, vector_rank
FROM HYBRID_SEARCH('database management', 10, workspaces => 'docs');

-- Or combine vector distance with full-text manually
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS text_rank,
    VECTOR_COSINE_DISTANCE(embedding, EMBEDDING('database management')) AS vector_distance
FROM articles
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY vector_distance
LIMIT 10;
```

---

## Notes

- Vector columns must have a fixed dimension defined in the schema: `VECTOR(768)`
- All distance functions require vectors of the same dimension
- Use `EMBEDDING()` to generate vectors from text at query time
- Operators `<->`, `<=>`, and `<#>` can be used in ORDER BY for efficient nearest-neighbor queries
- The `<#>` operator returns the negative inner product so that ORDER BY ASC returns the most similar results
