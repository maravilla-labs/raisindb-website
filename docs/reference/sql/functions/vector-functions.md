---
sidebar_position: 9
---

# Vector Functions

SQL surface for embeddings and similarity search: the three search table
functions, the `EMBEDDING` / `VECTOR_OF` query builders, the distance operators,
and the statements that configure and maintain the vector index.

Every example on this page was run against a tenant whose embedding
configuration points at a local Ollama `bge-m3` model. A query that embeds text
(`KNN('some text')`, `EMBEDDING('some text')`) needs an enabled embedding
configuration; without one the statement fails with a message that says so. See
[AI Provider Configuration](/docs/guides/ai/ai-provider-configuration).

## Search table functions: `KNN`, `FULLTEXT_SEARCH`, `HYBRID_SEARCH`

Three entry points over one engine. `KNN` is `HYBRID_SEARCH` with the lexical
leg switched off; `FULLTEXT_SEARCH` is the same engine with the vector leg off.
All three return the same columns and apply the caller's row-level security.

### Syntax

```text
HYBRID_SEARCH  ( query [, limit] [, named ...] )
FULLTEXT_SEARCH( query ,  language [, named ...] )
KNN            ( query [, limit]  [, named ...] )
```

Positional arguments come first, then named arguments written as
`name => value`. Each value may be given once. An unknown named argument is an
error that lists the valid names, for example
`unknown argument 'foo' for FULLTEXT_SEARCH. Valid: workspaces, limit, language.`

### Named arguments

| Named argument | `HYBRID_SEARCH` | `FULLTEXT_SEARCH` | `KNN` | Default |
|---|:-:|:-:|:-:|---|
| `workspaces` | yes | yes | yes | required |
| `limit` | yes | yes | yes | 10 (100 for `FULLTEXT_SEARCH`); 1 to 1000 |
| `language` | yes | yes (also positional #2, required there) | no | the repository's default language |
| `vector_weight` | yes | no | no | 1.0 |
| `fulltext_weight` | yes | no | no | 1.0 |
| `max_distance` | yes | no | yes | 0.6, or the tenant's `DEFAULT_MAX_DISTANCE` |
| `kind` | yes | no | yes | `'text'` |
| `granularity` | yes | no | yes | `'node'` |

- `language` is an ISO 639-1 code (`'en'`, not `'english'`). The index stores
  two-letter codes, so any other spelling is rejected.
- `kind` selects the embedding space: `'text'`, `'image'` or `'all'`. It
  defaults to `'text'`, so adding image embeddings later does not change what
  existing queries return.
- `granularity` says what one row is. `'node'` (the default) returns one row per
  document carrying its best-matching chunk, so `LIMIT 10` is ten documents.
  `'chunk'` returns one row per passage, so several rows may share a `node_id`
  and `LIMIT 10` is ten passages. `'document'` and `'passage'` are accepted as
  synonyms.
- `fulltext_weight => 0` skips the lexical leg; `vector_weight => 0` skips the
  vector leg, including embedding the query, so a tenant with no embedding
  provider can still run a hybrid query as keyword search. Both at zero is an
  error.

### The `workspaces` scope

The scope is written in every call. There are four spellings:

```sql
workspaces => 'library'              -- one workspace
workspaces => 'library, handbook'    -- a list; every name must resolve
workspaces => 'content-*'            -- a glob; matching nothing is fine
workspaces => 'ALL READABLE'         -- every workspace this caller may read
```

A name that does not resolve is an error (`workspace 'nope' is not available to
this query`). A glob that matches nothing returns zero rows. Omitting the scope
is an error, and so is `'*'` or `'ALL'`; use `'ALL READABLE'` for a repository-wide
search.

### The query argument

`KNN` accepts five forms for its first argument:

```sql
KNN('some text', ...)                        -- embedded with the tenant's provider
KNN(EMBEDDING('some text'), ...)             -- identical
KNN(ARRAY[0.1, 0.2, ...], ...)               -- a vector literal
KNN('[0.1, 0.2, ...]', ...)                  -- the pgvector text form
KNN(VECTOR_OF('library:/winter-layup'), ...) -- a node's own stored vector
```

A vector of the wrong width is refused:
`Query dimension mismatch: expected 1024, got 2`.

`VECTOR_OF(node_ref [, chunk_index])` reads a node's stored vector. The
reference needs a workspace prefix (`'workspace:/path'` or `'workspace:<node-id>'`)
because embeddings are keyed by the workspace the node lives in, which need not
be one of the workspaces being searched. Without a chunk index the node must
have exactly one stored vector; a chunked document needs the index. The source
node is excluded from its own results. `VECTOR_OF` and raw vectors work only
with `KNN`, since they have no text for a lexical leg.

### Return columns

| Column | Type | Description |
|--------|------|-------------|
| `node_id` | TEXT | The matched node id. Unique within its workspace |
| `workspace_id` | TEXT | The workspace the hit came from |
| `name`, `path`, `node_type` | TEXT | From the node |
| `score` | DOUBLE | Fused rank score (higher is better) |
| `fulltext_rank` | INTEGER | 1-based rank in the lexical leg; `NULL` if it did not match |
| `vector_rank` | INTEGER | 1-based rank in the vector leg; `NULL` if it did not match |
| `vector_distance` | DOUBLE | Cosine distance of the vector hit; `NULL` when `vector_rank` is |
| `chunk_index` | INTEGER | Which chunk answered; `0` for an unchunked document; `NULL` for a lexical-only hit |
| `embedding_kind` | TEXT | `'text'` or `'image'`; `NULL` for a lexical-only hit |
| `chunk_text` | TEXT | The text of the chunk that answered, or `NULL` |
| `chunk_text_source` | TEXT | `'exact'` (sliced from the document by its stored span), `'excerpt'` (the stored preview, up to 200 characters) or `'unavailable'` |
| `revision` | INTEGER | Node revision |
| `created_at`, `updated_at` | TEXT | Timestamps |
| `properties` | JSON | Node properties, filtered by the permission that granted access |

Fusion is rank based: `score = sum(weight / (60 + rank))` over the legs a
document appeared in. Distances are reported but never added to the score, so a
text hit and an image hit stay comparable by rank alone.

### Examples

```sql
-- Semantic search, one workspace
SELECT path, name, vector_distance, chunk_index
FROM KNN('how do vector indexes work', 10, workspaces => 'knowledge');
```

```json
{"columns":["path","name","vector_distance","chunk_index"],
 "rows":[{"path":"/handbook","name":"handbook","vector_distance":0.3247,"chunk_index":86},
         {"path":"/vector-search-explained","name":"vector-search-explained","vector_distance":0.4384,"chunk_index":1}]}
```

```sql
-- Hybrid: both legs, rank-fused
SELECT path, score, fulltext_rank, vector_rank, vector_distance, chunk_index
FROM HYBRID_SEARCH('how does replication work', 5, workspaces => 'knowledge');
-- {"path":"/handbook","score":0.0328,"fulltext_rank":1,"vector_rank":1,"vector_distance":0.3769,"chunk_index":58}

-- Passages for a RAG context window: several rows may share a node
SELECT path, chunk_index, vector_distance, chunk_text
FROM KNN('merging a branch back', 3, workspaces => 'knowledge', granularity => 'chunk');

-- Lexical only, explicit language
SELECT path, score FROM FULLTEXT_SEARCH('graph', 'en', workspaces => 'knowledge');

-- A residual WHERE is applied after fusion; `limit` still means rows delivered
SELECT node_id, name, score
FROM HYBRID_SEARCH('database replication', 20, workspaces => 'ALL READABLE')
WHERE node_type = 'kb:Article'
ORDER BY score DESC
LIMIT 10;

-- More like this, from a node's own stored vector
SELECT path, vector_distance
FROM KNN(VECTOR_OF('knowledge:/intro-to-sql'), 3, workspaces => 'knowledge');

-- Bind the query text as a parameter
SELECT path FROM KNN($1, 5, workspaces => 'knowledge');
```

---

## `EMBEDDING` and the distance operators

`EMBEDDING(text)` embeds text with the tenant's configured provider. It is only
recognised inside a nearest-neighbour pattern: an `ORDER BY` on a distance
between the virtual `embedding` column and a query, followed by `LIMIT`. The
planner turns that pattern into a `VectorScan` over the HNSW index.

```sql
SELECT path, name, embedding <=> EMBEDDING('index maintenance') AS distance
FROM 'knowledge'
ORDER BY distance
LIMIT 3;
```

```json
{"columns":["knowledge.path","knowledge.name","knowledge.distance"],
 "rows":[{"knowledge.path":"/handbook","knowledge.name":"handbook","knowledge.distance":0.3599},
         {"knowledge.path":"/intro-to-sql","knowledge.name":"intro-to-sql","knowledge.distance":0.5928}]}
```

Columns from a `VectorScan` come back prefixed with the table name
(`knowledge.path`). The search table functions return bare column names.

### Operators and function spellings

| Operator | Function spelling | Metric |
|----------|-------------------|--------|
| `<=>` | `VECTOR_COSINE_DISTANCE(embedding, q)` | cosine distance (0 identical, up to 2 opposite) |
| `<->` | `VECTOR_L2_DISTANCE(embedding, q)` | Euclidean distance |
| `<#>` | `VECTOR_INNER_PRODUCT(embedding, q)` | inner product, ordered so that ascending means most similar first |

All three are accepted as the `ORDER BY` key of the pattern above and select the
metric of the `VectorScan`. `EXPLAIN` shows which was chosen:

```sql
EXPLAIN SELECT path FROM 'knowledge'
ORDER BY embedding <-> EMBEDDING('sql databases') LIMIT 5;
-- VectorScan: table=knowledge, column=embedding, k=5, metric=L2
```

Outside that pattern the functions and operators are not evaluated. A `SELECT`
without `ORDER BY ... LIMIT` returns `NULL` for the distance, and
`SELECT EMBEDDING('x')` on its own fails with `Unknown function: EMBEDDING`.
Use the search table functions when you need a distance as an ordinary value.

### Distance threshold

A distance comparison in `WHERE` is pushed into the scan as `max_distance`. Both
the operator form and the alias form are recognised:

```sql
SELECT path, embedding <=> EMBEDDING('sql databases') AS distance
FROM 'knowledge'
WHERE distance < 0.5
ORDER BY distance
LIMIT 10;
```

```text
EXPLAIN ... -> VectorScan: table=knowledge, column=embedding, k=10, metric=Cosine, max_distance=0.50
```

Other predicates become a filter over a wider candidate set (`fetch_k`), so a
`WHERE node_type = ...` or `PATH_STARTS_WITH(path, ...)` composes with the scan:

```text
Limit: limit=5, offset=0
  Filter: 1 predicates
    VectorScan: table=knowledge, column=embedding, k=5, metric=Cosine, fetch_k=100
```

### Default maximum distance

Search results beyond the maximum distance are dropped. The default is 0.6 and
can be set per tenant:

```sql
ALTER EMBEDDING CONFIG SET DEFAULT_MAX_DISTANCE = '0.5';
-- {"result":"Embedding configuration updated","success":true}
```

`KNN` and `HYBRID_SEARCH` also take `max_distance => 0.3` per call.

---

## Embedding configuration statements

| Statement | Result |
|---|---|
| `SHOW EMBEDDING CONFIG` | key/value rows: `enabled`, `provider`, `model`, `dimensions`, `has_api_key`, `base_url`, `include_name`, `include_path`, `default_max_distance`, `distance_metric`, `max_embeddings_per_repo` |
| `ALTER EMBEDDING CONFIG SET key = value [SET key = value ...]` | `result`, `success` |
| `TEST EMBEDDING CONNECTION` | `result`, `model`, `success`, and `dimensions` on success |

Accepted keys for `ALTER EMBEDDING CONFIG SET`: `PROVIDER` (`openai`, `claude`,
`ollama`, `huggingface`), `MODEL`, `DIMENSIONS`, `API_KEY`, `BASE_URL`, `ENABLED`,
`INCLUDE_NAME`, `INCLUDE_PATH`, `DEFAULT_MAX_DISTANCE` (a number, or `none`),
`DISTANCE_METRIC` (`cosine`, `l2`, `inner_product`, `hamming`),
`MAX_EMBEDDINGS_PER_REPO` (a number, or `unlimited`). Keys are case-insensitive;
values are quoted.

```sql
ALTER EMBEDDING CONFIG
  SET PROVIDER = 'ollama'
  SET MODEL = 'bge-m3'
  SET DIMENSIONS = 1024
  SET BASE_URL = 'http://localhost:11434'
  SET ENABLED = true;
```

## Provider statements

The tenant's provider list (the record behind `/api/tenants/{tenant}/ai/config`,
the CLI and the console) has its own statements:

| Statement | Result |
|---|---|
| `SHOW AI PROVIDERS` (alias `SHOW AI CONFIG`) | one row per provider: `slug`, `kind`, `enabled`, `has_api_key`, `api_endpoint`, `models` |
| `ALTER AI CONFIG ADD PROVIDER '<slug>' [SET key = value ...]` | create or update the provider with that slug |
| `ALTER AI CONFIG DROP PROVIDER '<slug>'` | remove it |

`ADD PROVIDER` SET keys: `KIND` (`openai`, `anthropic`, `google`, `ollama`,
`azure_openai`, `groq`, `openrouter`, `bedrock`, `custom`, `local`; defaults to
the slug when the slug is a kind name), `API_KEY`, `BASE_URL` (or `ENDPOINT`),
`DISPLAY_NAME`, `ENABLED`, `MODEL` (repeatable or comma-separated; the first
becomes the default) and `USE_CASES` (comma-separated, applied to the models
named in the same statement; default `chat,agent`). A key that is not set keeps
its stored value, so re-running the statement without `API_KEY` keeps the key.

```sql
ALTER AI CONFIG ADD PROVIDER 'bedrock'
  SET API_KEY = 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  SET BASE_URL = 'us-east-1'
  SET MODEL = 'anthropic.claude-sonnet-4-20250514-v1:0';

ALTER AI CONFIG ADD PROVIDER 'openai'
  SET MODEL = 'text-embedding-3-small' SET USE_CASES = 'embedding';

SHOW AI PROVIDERS;
-- {"slug":"bedrock","kind":"bedrock","enabled":true,"has_api_key":true,"api_endpoint":"us-east-1",
--  "models":"anthropic.claude-sonnet-4-20250514-v1:0*[chat,agent]"}
```

In the `models` column a `*` marks a default model and the bracket lists its
use cases.

---

## Vector index management

Each statement acts on the current repository and branch.

### SHOW VECTOR INDEX HEALTH

One row per index partition. A partition is one embedding model and kind; a
tenant that changed models has one partition per model it ever used.

```sql
SHOW VECTOR INDEX HEALTH;
```

```json
{"columns":["partition","queried","status","count","dimensions","memory_bytes","quantization","metric"],
 "rows":[{"partition":"7TKpxhrIUdAT","queried":true,"status":"available","count":126,
          "dimensions":1024,"memory_bytes":16798240,"quantization":"F32","metric":"Cosine"}]}
```

`queried` marks the partition the current configuration searches. A branch
that has no index yet returns one row with `status: "empty"`.

### VERIFY VECTOR INDEX

Compares the number of vectors in the index with the number of stored
embeddings.

```json
{"columns":["status","hnsw_count","storage_count"],
 "rows":[{"status":"consistent","hnsw_count":133,"storage_count":133}]}
```

On a mismatch the row also carries `action: "Run REBUILD VECTOR INDEX to fix"`.
The counts cover every partition, so a repository whose configuration changed
models reports the older partition's vectors as well.

### REBUILD VECTOR INDEX

Rebuilds the index for the configured partition from stored embeddings. Use it
after a bulk import, after creating a branch (a new branch starts with an empty
index), or when `VERIFY` reports a mismatch.

```json
{"result":"Vector index rebuilt: 126 embeddings indexed (workspaces: functions, knowledge)","success":true}
```

### REGENERATE EMBEDDINGS

Reports the current count and points at the HTTP endpoint that queues
regeneration jobs:

```http
POST /api/admin/management/database/{tenant}/{repo}/vector/regenerate
```

The same management prefix also offers `vector/health`, `vector/verify`,
`vector/rebuild`, `vector/optimize` and `vector/restore`.

---

## Notes

- A search function's rows are ordinary rows: project them, filter them with a
  residual `WHERE`, and order them.
- `ORDER BY ... LIMIT` with an `OFFSET` is not planned as a `VectorScan`; leave
  the offset out and page with a distance threshold instead.
- `WHERE __revision = <hlc>` applies to the operator form as well: the scan
  reads each hit at that revision. `EXPLAIN` does not print it.
- Cosine distance is `1 - cosine similarity`. As a rough guide with a text
  model, values under about 0.4 are close matches and values above 0.6 are
  filtered out by default.
