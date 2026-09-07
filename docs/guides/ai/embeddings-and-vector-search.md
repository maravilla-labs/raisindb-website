---
sidebar_position: 2
title: Embeddings and Vector Search
description: Generate embeddings, run vector similarity queries, and combine vector search with full-text search
---

# Embeddings and Vector Search

RaisinDB stores vector embeddings next to your content and answers
nearest-neighbour queries from a built-in HNSW index. Semantic search is a SQL
query; there is no separate vector database to run.

The examples on this page were run against a tenant whose embedding
configuration points at a local Ollama `bge-m3` model (1024 dimensions). Set
yours up first: [AI Provider Configuration](./ai-provider-configuration.md).

## How embeddings are produced

Once the tenant's embedding configuration is enabled, every node create or
update queues an embedding job. The job collects the node's text, splits it into
chunks, asks the provider for one vector per chunk, and writes the vectors to
the index. The write that triggered it is never blocked.

```text
Node created or updated
        |
        v
Embedding job queued (per node)
        |
        v
Text collected: name, path (if enabled) + fields marked `index: [Vector]`
        |
        v
Chunked (default 256 tokens, 64 overlap) and embedded, one vector per chunk
        |
        v
Stored per (tenant, repo, branch, workspace, model, kind, node, chunk)
```

Which text is embedded is decided by the node type: fields marked
`index: [Vector]` in the type's schema (top-level fields, archetype fields and
element fields alike), plus the node's name and path when `include_name` and
`include_path` are on. A node type with no vector fields gets a vector of its
name and path only.

Uploaded files take one more step. A binary has to be read first: its text is
extracted into `__extracted_text`, and only then chunked and embedded. Which
files that happens to, and what to check when a document is not searchable, is
covered in [Asset Processing](./asset-processing.md).

## Searching

RaisinDB exposes search as three table functions over one engine, plus a
distance operator for ordinary queries:

| Surface | Legs | Use it for |
|---|---|---|
| `KNN(query, limit, workspaces => ...)` | vector only | meaning, cross-lingual, "more like this" |
| `FULLTEXT_SEARCH(query, language, workspaces => ...)` | lexical only | exact words, names, codes |
| `HYBRID_SEARCH(query, limit, workspaces => ...)` | both, rank-fused | the default for RAG and site search |
| `ORDER BY embedding <=> EMBEDDING('...') LIMIT k` | vector only | a distance column in a normal `SELECT` |

The three functions return the same columns, apply the caller's row-level
security, and take the same `workspaces` scope. The full argument grammar is in
the [Vector Functions reference](/docs/reference/sql/functions/vector-functions).

### Basic vector search

```sql
SELECT path, name, vector_distance, chunk_index
FROM KNN('how do vector indexes work', 10, workspaces => 'knowledge');
```

```json
{"columns":["path","name","vector_distance","chunk_index"],
 "rows":[{"path":"/handbook","name":"handbook","vector_distance":0.3247,"chunk_index":86},
         {"path":"/vector-search-explained","name":"vector-search-explained","vector_distance":0.4384,"chunk_index":1}]}
```

- The first argument is the query. Plain text is embedded with the tenant's
  provider. You can also pass `EMBEDDING('...')`, a literal vector (`ARRAY[...]`
  or `'[0.1, 0.2, ...]'`), or `VECTOR_OF('workspace:/path')` to search with a
  node's own stored vector.
- `10` is the number of rows (default 10, maximum 1000).
- `workspaces` is required (below).
- `vector_distance` is the cosine distance; lower is closer. Results beyond the
  maximum distance (0.6 by default) are dropped, so a query that matches nothing
  well returns fewer rows than asked for.
- `chunk_index` names the chunk of the document that answered.

### The workspace scope

The scope is written in every call. Four spellings:

```sql
workspaces => 'library'              -- one workspace
workspaces => 'library, handbook'    -- a list; every name must resolve
workspaces => 'content-*'            -- a glob; matching nothing is fine
workspaces => 'ALL READABLE'         -- every workspace this caller may read
```

Omitting it is an error rather than a repository-wide search, and so is `'*'`.
`'ALL READABLE'` is the one spelling for "everything I may read", which keeps
repository-wide queries easy to find in a code base. `workspace_id` comes back
as a column, so a multi-workspace result needs no `UNION`:

```sql
SELECT workspace_id, path, vector_distance
FROM KNN('relational databases', 3, workspaces => 'ALL READABLE');
-- {"workspace_id":"functions","path":"/lib/docs/probe/index.js","vector_distance":0.4082}
-- {"workspace_id":"knowledge","path":"/handbook","vector_distance":0.4384}
-- {"workspace_id":"knowledge","path":"/intro-to-sql","vector_distance":0.4424}
```

### Interpreting distances

Cosine distance is `1 - cosine similarity`. With a text embedding model:

| Distance | Interpretation |
|----------|----------------|
| 0.0 | identical |
| up to about 0.4 | close in meaning |
| 0.4 to 0.6 | loosely related |
| above 0.6 | filtered out by default |

Change the cutoff per tenant with
`ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5'`, or per query with
`max_distance => 0.3`.

### Filtering

A `WHERE` on a search function's rows is applied after the search, and `limit`
still means rows delivered:

```sql
SELECT path, properties->>'title'::String AS title, vector_distance
FROM KNN('graph relationships', 20, workspaces => 'knowledge')
WHERE node_type = 'raisin:Page'
LIMIT 10;
```

For a filter on the content hierarchy the operator form is often simpler,
because it is an ordinary scan and structural predicates are pushed into it:

```sql
SELECT path, embedding <=> EMBEDDING('sql databases') AS distance
FROM 'knowledge'
WHERE PATH_STARTS_WITH(path, '/intro')
ORDER BY distance
LIMIT 5;
-- {"knowledge.path":"/intro-to-sql","knowledge.distance":0.3836}
```

### Result columns

Every search function emits the same row:

| Column | Meaning |
|---|---|
| `node_id`, `workspace_id` | the hit's identity; a node id is unique within its workspace |
| `name`, `path`, `node_type` | from the node |
| `score` | fused rank score, higher is better |
| `fulltext_rank`, `vector_rank` | 1-based rank in each leg, `NULL` where the leg did not match |
| `vector_distance` | cosine distance of the vector hit, `NULL` for a lexical-only hit |
| `chunk_index` | which chunk answered; `0` for an unchunked document; `NULL` for a lexical-only hit |
| `embedding_kind` | `'text'` or `'image'` |
| `chunk_text`, `chunk_text_source` | the passage that answered and how reliable it is (`exact`, `excerpt`, `unavailable`) |
| `revision`, `created_at`, `updated_at` | from the node |
| `properties` | the node's properties, filtered by the permission that granted access |

### One row per node, or one per chunk

Long documents are chunked and each chunk is embedded separately. By default
results are fused per node: a 40-page handbook occupies one of your ten rows,
and `chunk_index` and `chunk_text` say which passage matched. For a RAG prompt
that wants several passages, ask for chunk granularity:

```sql
SELECT path, chunk_index, vector_distance, chunk_text
FROM KNN('merging a branch back', 3, workspaces => 'knowledge', granularity => 'chunk');
```

```json
{"rows":[{"path":"/handbook","chunk_index":97,"vector_distance":0.2857,
          "chunk_text":"A branch is forked from a parent and can later be merged back, carrying node revisions with it."},
         {"path":"/handbook","chunk_index":80,"vector_distance":0.2857, "chunk_text":"..."},
         {"path":"/handbook","chunk_index":63,"vector_distance":0.2857, "chunk_text":"..."}]}
```

With `granularity => 'chunk'`, `LIMIT k` counts passages, so several rows may
share a `node_id`. `chunk_text_source` tells you what you are holding: `exact`
is the chunk sliced from the document by its stored span, `excerpt` is the
stored preview of up to 200 characters, `unavailable` means no text is stored
for that row.

## Hybrid search

`HYBRID_SEARCH` runs the lexical and vector legs and fuses them by rank
(reciprocal rank fusion), so exact terms and meaning both count:

```sql
SELECT path, score, fulltext_rank, vector_rank, vector_distance, chunk_index
FROM HYBRID_SEARCH('how does replication work', 5, workspaces => 'knowledge');
-- {"path":"/handbook","score":0.0328,"fulltext_rank":1,"vector_rank":1,"vector_distance":0.3769,"chunk_index":58}
```

The score is `sum(weight / (60 + rank))` over the legs a document appeared in.
Distances from the vector leg are reported but never added to the score, which
is what lets a text hit and an image hit rank against each other.
`vector_weight => 0` turns the query into keyword search (no embedding provider
needed), `fulltext_weight => 0` into vector search.

Hybrid search is the right default for RAG: pure vector search can miss a
product name or an error code, pure full-text search misses a paraphrase.

### Over HTTP

The same engine answers `GET /api/search/{repo}` with the same argument names:

```http
GET /api/search/docs-ai?q=replication&workspace=knowledge&strategy=hybrid&limit=2
```

```json
{"results":[{"node_id":"98443e00-...","name":"handbook","node_type":"raisin:Page","path":"/handbook",
             "workspace_id":"knowledge","score":0.0328,"fulltext_rank":1,"vector_distance":0.3107,
             "revision":1,"chunk_index":24,"chunk_text":"...","chunk_text_source":"excerpt"}],
 "count":2,"strategy":"hybrid","fulltext_count":1,"vector_count":2}
```

Query parameters: `q`, `workspace` (same grammar as `workspaces =>`),
`strategy` (`hybrid`, `vector`, `fulltext`), `limit`, `branch`, `kind`,
`granularity`, and `vector` for a raw query vector.

## The distance operator

In an ordinary `SELECT`, `embedding <=> EMBEDDING('...')` is planned as an
index scan when it is the `ORDER BY` key and the query has a `LIMIT`:

```sql
SELECT path, name, embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'knowledge'
ORDER BY distance
LIMIT 3;
-- {"knowledge.path":"/handbook","knowledge.distance":0.3599}
-- {"knowledge.path":"/intro-to-sql","knowledge.distance":0.5928}
```

A distance comparison in `WHERE` is pushed into the scan as a threshold, and
`EXPLAIN` shows the plan:

```sql
EXPLAIN SELECT path, embedding <=> EMBEDDING('sql databases') AS distance
FROM 'knowledge'
WHERE distance < 0.5
ORDER BY distance
LIMIT 10;
-- VectorScan: table=knowledge, column=embedding, k=10, metric=Cosine, max_distance=0.50
```

Two things to know about this form. Columns come back prefixed with the table
name (`knowledge.path`). And without `ORDER BY ... LIMIT` the distance is not
computed at all: the column is `NULL` and the rows come back in scan order. Use
`KNN` when you want the distance as a plain value.

`<->` (L2) and `<#>` (inner product) select the other metrics in the same
position.

## Branches

Embeddings are stored per branch, and the index is per branch too. Creating a
branch copies the stored embeddings and queues a job that copies the source
branch's index files, so a search on the new branch answers as soon as that job
has run (usually within a second). If `SHOW VECTOR INDEX HEALTH` on the branch
still reports `empty`, `REBUILD VECTOR INDEX` on that branch builds the index
from the copied embeddings:

```bash
# SQL endpoint for a branch: /api/sql/{repo}/{branch}
curl -s -X POST localhost:8090/api/sql/docs-ai/exp -H "$H" -H "$J" \
  -d '{"sql":"REBUILD VECTOR INDEX"}'
# {"result":"Vector index rebuilt: 126 embeddings indexed (workspaces: functions, knowledge)","success":true}
```

Each [agent branch](./agent-memory-with-branches.md) therefore searches its own
content, and searches on `main` are unaffected by what an agent writes.

## Vector index management

```sql
SHOW VECTOR INDEX HEALTH;   -- one row per partition: count, dimensions, memory, quantization, metric
VERIFY VECTOR INDEX;        -- {"status":"consistent","hnsw_count":133,"storage_count":133}
REBUILD VECTOR INDEX;       -- rebuild the configured partition from stored embeddings
```

A partition is one embedding model and kind. Changing the model in the
embedding configuration starts a new partition; the old one stays until the
index is rebuilt. `SHOW VECTOR INDEX HEALTH` marks the partition the current
configuration searches with `queried: true`.

These statements work over the HTTP SQL endpoint and over pgwire (`psql`), and
the same operations exist as management endpoints under
`/api/admin/management/database/{tenant}/{repo}/vector/`.

## How the index behaves

- Partitions are keyed by model and kind so that vectors from different models
  are never compared with each other.
- Loaded indexes live in a memory cache with a 512 MB budget; cold partitions
  are read from disk on first use.
- Changed indexes are written to disk about every 60 seconds and on shutdown, so
  a write followed immediately by a restart can report a mismatch that
  `REBUILD VECTOR INDEX` repairs.
- Storage precision is `F32` by default; `F16` and `Int8` can be selected in the
  embedding configuration.

## Next Steps

- [Asset Processing](./asset-processing.md): how an uploaded file becomes searchable
- [RAG Patterns](./rag-patterns.md): retrieval-augmented generation end to end
- [Agent Memory with Branches](./agent-memory-with-branches.md): isolated AI agent work
- [Vector Functions reference](/docs/reference/sql/functions/vector-functions): the full grammar
