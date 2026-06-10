---
sidebar_position: 2
title: "Tutorial: Semantic Search with Embeddings"
description: Step-by-step tutorial on configuring embeddings and running vector similarity searches in RaisinDB
---

# Semantic Search with Embeddings

This tutorial walks you through configuring automatic embedding generation and running vector similarity searches using RaisinDB's built-in HNSW index and SQL extensions.

## Prerequisites

- A running RaisinDB instance
- An embedding provider configured (OpenAI, AWS Bedrock, or Ollama for local)
- `psql` or the admin console for running SQL

## Step 1: Configure an Embedding Provider

Set up your embedding provider. Here we use OpenAI as an example:

```sql
-- Configure OpenAI as the embedding provider
INSERT INTO 'raisin:system' (name, path, node_type, properties) VALUES (
  'ai-config',
  '/config/ai',
  'raisin:AIConfig',
  '{
    "providers": [
      {
        "provider": "openai",
        "api_key": "sk-your-api-key-here",
        "enabled": true,
        "models": ["text-embedding-3-small"]
      }
    ]
  }'
);
```

:::tip
For local development without an API key, use Ollama with `nomic-embed-text`. For AWS deployments, use Bedrock with `amazon.titan-embed-text-v2:0`.
:::

## Step 2: Create Nodes with Content

Insert documents that will be automatically embedded:

```sql
INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'intro-to-sql',
  '/docs/guides',
  'kb:Article',
  '{"title": "Introduction to SQL", "content": "SQL is a standard language for managing relational databases. It allows you to create, read, update, and delete data..."}'
);

INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'graph-databases',
  '/docs/guides',
  'kb:Article',
  '{"title": "Understanding Graph Databases", "content": "Graph databases store data as nodes and edges, making them ideal for modeling relationships between entities..."}'
);

INSERT INTO 'knowledge' (name, path, node_type, properties) VALUES (
  'vector-search-explained',
  '/docs/guides',
  'kb:Article',
  '{"title": "Vector Search Explained", "content": "Vector search uses mathematical representations of content to find semantically similar documents..."}'
);
```

Embedding generation is asynchronous — the embedding worker picks up the job, generates vectors via your provider, and indexes them in HNSW. Long documents are automatically chunked when chunking is enabled in your configuration.

## Step 3: Run a Basic Vector Search

Once embeddings are generated, use `VECTOR_SEARCH` in SQL:

```sql
SELECT id, name, properties->>'title'::String AS title, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, EMBEDDING('how do databases work'), 10)
ORDER BY __distance ASC;
```

Results are ranked by cosine distance — lower values mean higher similarity.

## Step 4: Interpret Distance Scores

RaisinDB uses cosine distance (1 - cosine similarity):

| Distance | Similarity | Interpretation |
|----------|-----------|----------------|
| 0.0 | 1.0 | Identical vectors |
| 0.2 - 0.4 | 0.8 - 0.6 | Semantically similar |
| 0.4 - 0.6 | 0.6 - 0.4 | Weakly related |
| > 0.6 | < 0.4 | Not related |

## Step 5: Filter by Distance

Use the `<=>` operator in `WHERE` clauses to filter by distance threshold. The threshold is pushed down to the HNSW engine for efficient search:

```sql
-- Only return results within cosine distance 0.3
SELECT id, name, properties->>'title'::String AS title
FROM 'knowledge'
WHERE embedding <=> EMBEDDING('database queries') < 0.3
ORDER BY embedding <=> EMBEDDING('database queries');
```

You can also configure the default maximum distance:

```sql
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
```

## Step 6: Hybrid Search

Combine vector similarity with property filters:

```sql
-- Vector search + node type filter
SELECT id, name, properties->>'title'::String AS title, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, EMBEDDING('graph relationships'), 20)
  AND node_type = 'kb:Article'
ORDER BY __distance ASC
LIMIT 10;
```

For combined full-text + vector search, use the `HYBRID_SEARCH` table function:

```sql
SELECT node_id, name, score, fulltext_rank, vector_rank, vector_distance
FROM HYBRID_SEARCH('database relationships', 10);
```

This uses Reciprocal Rank Fusion (RRF) to merge keyword matches and semantic similarity into a single ranked result set.

## Step 7: Search Modes

RaisinDB supports two search modes for multi-chunk documents:

```sql
-- Documents mode (default): deduplicates by source document
SELECT id, name, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, EMBEDDING('SQL queries'), 10)
ORDER BY __distance ASC;

-- Chunks mode: returns all matching chunks
-- Useful when you need the exact passage within a long document
```

Documents mode returns the best matching chunk per document — typically what you want for RAG applications.

## Step 8: Monitor Index Health

Check the health of your vector indexes:

```sql
SHOW VECTOR INDEX HEALTH;
```

If needed, rebuild the index from stored embeddings:

```sql
REBUILD VECTOR INDEX;
```

Verify index integrity:

```sql
VERIFY VECTOR INDEX;
```

## Step 9: Inspect Query Plans

Use `EXPLAIN` to understand how vector queries are executed:

```sql
EXPLAIN SELECT id, name, __distance
FROM 'knowledge'
WHERE VECTOR_SEARCH(embedding, EMBEDDING('search query'), 10)
ORDER BY __distance ASC;
```

This shows the `VectorScan` plan details including candidate count, distance metric, and threshold filtering.

## Next Steps

- [RAG Patterns](/docs/guides/ai/rag-patterns) — build full retrieval-augmented generation pipelines
- [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration) — configure additional providers
- [Vector Functions Reference](/docs/reference/sql/functions/vector-functions) — complete SQL function reference
