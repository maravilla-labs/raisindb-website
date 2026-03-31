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
-- Combine vector similarity with full-text search
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
