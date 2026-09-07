---
sidebar_position: 2
title: "Tutorial: Semantic Search with Embeddings"
description: Step-by-step tutorial on configuring embeddings and running vector similarity searches in RaisinDB
---

# Semantic Search with Embeddings

This tutorial configures automatic embedding generation and runs vector
similarity searches with RaisinDB's built-in HNSW index and SQL search
functions. It was run against a local RaisinDB with a local
[Ollama](https://ollama.com) serving the `bge-m3` embedding model, so every
output shown is real.

## Prerequisites

- A running RaisinDB instance and the `raisindb` CLI logged in to it
- An embedding provider: Ollama with `bge-m3` pulled, or an OpenAI API key
- A way to run SQL: the examples use the HTTP SQL endpoint with `curl`, but
  `psql` or the admin console work the same

```bash
H="Authorization: Bearer $TOKEN"; J='content-type: application/json'
sql() { curl -s -X POST localhost:8090/api/sql/docs-ai -H "$H" -H "$J" -d "{\"sql\":\"$1\"}"; echo; }
```

## Step 1: Configure an embedding provider

Register the provider for the tenant, then point the embedding configuration
at it:

```bash
raisindb ai provider set local-ollama --kind ollama --endpoint http://localhost:11434 -e bge-m3
# Provider 'local-ollama' configured for tenant 'default' (kind=ollama, enabled=true, models=1, api_key=unchanged).
```

```sql
ALTER EMBEDDING CONFIG
  SET PROVIDER = 'ollama'
  SET MODEL = 'bge-m3'
  SET DIMENSIONS = 1024
  SET BASE_URL = 'http://localhost:11434'
  SET ENABLED = true;

TEST EMBEDDING CONNECTION;
```

```json
{"columns":["result","dimensions","model","success"],
 "rows":[{"result":"Connection successful","dimensions":1024,"model":"bge-m3","success":true}]}
```

For OpenAI, use `SET PROVIDER = 'openai' SET MODEL = 'text-embedding-3-small'
SET DIMENSIONS = 1536 SET API_KEY = 'sk-...'` instead.

## Step 2: Create a workspace and some content

```bash
curl -s -X PUT localhost:8090/api/workspaces/docs-ai/knowledge -H "$H" -H "$J" \
  -d '{"name":"knowledge","allowed_node_types":["raisin:Folder","raisin:Page"],"allowed_root_node_types":["raisin:Folder","raisin:Page"]}'
```

```sql
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES
  ('/intro-to-sql', 'intro-to-sql', 'raisin:Page',
   '{"title": "Introduction to SQL", "content": "SQL is a standard language for managing relational databases."}'::jsonb);

INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES
  ('/graph-databases', 'graph-databases', 'raisin:Page',
   '{"title": "Understanding Graph Databases", "content": "Graph databases store data as nodes and edges."}'::jsonb);

INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES
  ('/vector-search-explained', 'vector-search-explained', 'raisin:Page',
   '{"title": "Vector Search Explained", "content": "Vector search uses mathematical representations of content to find semantically similar documents."}'::jsonb);
```

Each insert answers `{"affected_rows":1}` at once. Embedding runs in the
background: a job per node collects the text, chunks it if it is long, calls
the provider and writes the vectors.

## Step 3: Check that vectors arrived

```sql
SHOW VECTOR INDEX HEALTH;
```

```json
{"columns":["partition","queried","status","count","dimensions","memory_bytes","quantization","metric"],
 "rows":[{"partition":"7TKpxhrIUdAT","queried":true,"status":"available","count":126,
          "dimensions":1024,"memory_bytes":16798240,"quantization":"F32","metric":"Cosine"}]}
```

`count` grows as jobs finish. If the row says `status: "empty"`, the jobs have
not run yet; wait a moment and check again.

## Step 4: Run a vector search

```sql
SELECT path, name, vector_distance, chunk_index
FROM KNN('how do databases work', 10, workspaces => 'knowledge');
```

```json
{"columns":["path","name","vector_distance","chunk_index"],
 "rows":[{"path":"/intro-to-sql","name":"intro-to-sql","vector_distance":0.4700,"chunk_index":0},
         {"path":"/vector-search-explained","name":"vector-search-explained","vector_distance":0.5971,"chunk_index":1}]}
```

The query text is embedded with the configured provider and compared with the
stored vectors. `workspaces` is required: one name, a comma-separated list, a
glob such as `'content-*'`, or `'ALL READABLE'`.

## Step 5: Read the distances

Cosine distance is `1 - cosine similarity`, so lower is closer. Results beyond
the maximum distance are dropped; the default cutoff is 0.6:

| Distance | Interpretation |
|----------|----------------|
| 0.0 | identical |
| up to about 0.4 | close in meaning |
| 0.4 to 0.6 | loosely related |
| above 0.6 | dropped by default |

Tighten the cutoff for one query with `max_distance => 0.3`, or for the whole
tenant:

```sql
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
```

## Step 6: Combine with filters

Filter the search function's rows like any other rows:

```sql
SELECT path, name, vector_distance
FROM KNN('graph relationships', 20, workspaces => 'knowledge')
WHERE node_type = 'raisin:Page'
LIMIT 10;
```

For keyword matches and meaning in one ranked list, use `HYBRID_SEARCH`:

```sql
SELECT path, score, fulltext_rank, vector_rank, vector_distance
FROM HYBRID_SEARCH('database relationships', 10, workspaces => 'knowledge');
```

```json
{"rows":[{"path":"/intro-to-sql","score":0.0323,"fulltext_rank":2,"vector_rank":2,"vector_distance":0.4674},
         {"path":"/graph-databases","score":0.0164,"fulltext_rank":1,"vector_rank":null,"vector_distance":null},
         {"path":"/vector-search-explained","score":0.0159,"fulltext_rank":null,"vector_rank":3,"vector_distance":0.5855}]}
```

`score` fuses the two legs by rank. A row with `fulltext_rank: null` was found
by meaning only, and one with `vector_rank: null` by keywords only.

## Step 7: Chunks and citations

Long documents are chunked and each chunk embedded separately. Results are
fused per node, and `chunk_index` and `chunk_text` say which passage matched.
Add a longer page and search it:

```sql
SELECT path, chunk_index, vector_distance, chunk_text
FROM KNN('merging a branch back', 3, workspaces => 'knowledge', granularity => 'chunk');
```

```json
{"rows":[{"path":"/handbook","chunk_index":97,"vector_distance":0.2857,
          "chunk_text":"A branch is forked from a parent and can later be merged back, carrying node revisions with it."}]}
```

With `granularity => 'chunk'` each row is a passage, which is what a RAG
prompt needs. Without it, each row is a document carrying its best chunk.

## Step 8: The distance operator

In an ordinary `SELECT`, the `<=>` operator becomes an index scan when it is
the `ORDER BY` key and the query has a `LIMIT`. A distance comparison in
`WHERE` becomes a threshold on the scan:

```sql
SELECT path, embedding <=> EMBEDDING('sql databases') AS distance
FROM 'knowledge'
WHERE distance < 0.5
ORDER BY distance
LIMIT 10;
```

```json
{"columns":["knowledge.path","knowledge.distance"],
 "rows":[{"knowledge.path":"/intro-to-sql","knowledge.distance":0.3836}]}
```

`EXPLAIN` on the same statement shows the plan:

```text
VectorScan: table=knowledge, column=embedding, k=10, metric=Cosine, max_distance=0.50
```

## Step 9: Verify and repair the index

```sql
VERIFY VECTOR INDEX;
-- {"status":"consistent","hnsw_count":133,"storage_count":133}

REBUILD VECTOR INDEX;
-- {"result":"Vector index rebuilt: 126 embeddings indexed (workspaces: functions, knowledge)","success":true}
```

Run `REBUILD VECTOR INDEX` after a bulk import or when `VERIFY` reports a
mismatch.

## Next Steps

- [RAG Patterns](/docs/guides/ai/rag-patterns): build a retrieval-augmented generation pipeline
- [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration): other providers and chunking settings
- [Vector Functions Reference](/docs/reference/sql/functions/vector-functions): the complete SQL grammar
