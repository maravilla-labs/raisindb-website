---
sidebar_position: 4
title: RAG Patterns
description: Build retrieval-augmented generation pipelines using RaisinDB's content graph, vector search, and workspaces
---

# RAG Patterns

Retrieval-Augmented Generation (RAG) answers a question with an LLM after
retrieving the relevant passages from your own data. RaisinDB gives you the
retrieval half in one system: vector and full-text search, a content hierarchy
to gather surrounding context, and workspaces and branches to scope what an
agent may see.

## The pipeline

```text
User question
    |
    v
HYBRID_SEARCH / KNN  ->  best-matching passages (chunk_text) and their nodes
    |
    v
Hierarchy lookups     ->  parent document, sibling sections, linked nodes
    |
    v
Prompt assembled       ->  raisin.ai.completion(...)
    |
    v
Answer returned, optionally stored as a node
```

## Step 1: Store knowledge as nodes

Each piece of knowledge is a node. Its text fields are embedded automatically
when the tenant's [embedding configuration](./ai-provider-configuration.md#embedding-configuration)
is enabled.

```sql
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/docs/guides/getting-started',
  'getting-started',
  'kb:Article',
  '{"title": "Getting Started Guide",
    "content": "RaisinDB is a multi-tenant content database with git-like versioning...",
    "status": "published"}'::jsonb
);
```

The embedding job runs after the write; the node is searchable a moment later.

## Step 2: Chunking

Long text is split into chunks and each chunk gets its own vector. The default
is 256 tokens with a 64-token overlap using the recursive splitter. Change it on
the tenant's embedding configuration, or per
[processing rule](./asset-processing.md#tasks) for uploaded documents:

```yaml
chunking:
  chunk_size: 512
  splitter: recursive     # recursive | fixed_size | markdown | code
  overlap:
    type: Tokens          # Tokens (a count) or Percentage (0.0 to 0.5)
    value: 64
```

Chunks are not nodes. They live in the embedding index keyed by node and chunk
index, and a `SELECT` over the workspace does not show them. Search results
carry `chunk_index` and `chunk_text` so you can cite the passage without
re-reading the document.

If you want sections to be first-class content (separately editable, ordered,
permissioned), model them as child nodes. They are embedded like any other node:

```sql
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES
  ('/docs/architecture/overview', 'overview', 'kb:Article',
   '{"title": "Architecture Overview", "content": "Introduction to the system architecture..."}'::jsonb),
  ('/docs/architecture/overview/storage', 'storage', 'kb:Section',
   '{"content": "The storage layer uses RocksDB with 40+ column families...", "position": 1}'::jsonb);
```

## Step 3: Retrieval queries

### Passages for a prompt

`granularity => 'chunk'` returns one row per passage, which is what a context
window wants. `chunk_text` is the passage:

```sql
SELECT path, chunk_index, vector_distance, chunk_text
FROM KNN('how do I rotate an API key', 5, workspaces => 'knowledge', granularity => 'chunk');
```

Without `granularity`, results are one row per node with the best chunk
attached, so `LIMIT 5` means five documents.

### Scoped by workspace

Use workspaces to separate knowledge domains. A support bot searches `support`,
an engineering bot searches `engineering`, and one query can cover both:

```sql
SELECT workspace_id, path, chunk_text, vector_distance
FROM KNN('why did the deploy fail', 10, workspaces => 'support, engineering');
```

`workspace_id` comes back as a column, so no `UNION` is needed.

### Scoped by path

The operator form is an ordinary scan, so a hierarchy predicate is pushed into
it:

```sql
SELECT path, properties->>'content'::String AS content,
       embedding <=> EMBEDDING('pagination cursors') AS distance
FROM 'knowledge'
WHERE PATH_STARTS_WITH(path, '/docs/api/')
ORDER BY distance
LIMIT 10;
```

### Filtered by property

A `WHERE` on the search function's rows is applied after the search:

```sql
SELECT path, chunk_text, vector_distance
FROM KNN('single sign-on setup', 10, workspaces => 'knowledge')
WHERE properties->>'status'::String = 'published'
  AND node_type = 'kb:Article';
```

## Step 4: Enrich with hierarchy context

After retrieval, use the content tree to gather what surrounds a hit.

```sql
-- The article a section belongs to
SELECT path, properties->>'title'::String AS title, properties->>'content'::String AS content
FROM 'knowledge'
WHERE path = '/docs/architecture/overview';

-- All sections of that article, in order
SELECT properties->>'content'::String AS content
FROM 'knowledge'
WHERE CHILD_OF('/docs/architecture/overview') AND node_type = 'kb:Section'
ORDER BY __order;
```

Nodes that reference each other can be followed with the reference and graph
predicates described in the [graph guides](/docs/guides/querying/common-query-patterns).

A typical enrichment loop:

1. Search for the top passages.
2. Fetch the parent document of each hit.
3. Fetch neighbouring sections for continuity.
4. Follow references to linked documents.
5. Assemble the prompt.

## Step 5: Assemble and generate

Inside a RaisinDB function, retrieval and generation are two calls. The search
functions embed the question for you, so no separate embedding step is needed.

```javascript
async function handler(input) {
  // 1. Retrieve. In the function runtime raisin.sql.query is synchronous and
  //    returns the row array; a failed query returns { error, rows: [] }.
  const rows = raisin.sql.query(
    `SELECT path, chunk_text
       FROM HYBRID_SEARCH($1, 8, workspaces => 'knowledge', granularity => 'chunk')`,
    [input.question]
  );
  if (rows.error) throw new Error(rows.error);

  // 2. Build the context
  const context = rows.map((r) => `[${r.path}] ${r.chunk_text}`).join('\n\n');

  // 3. Generate. The model is "<provider slug>:<model id>".
  const answer = raisin.ai.completion({
    model: 'openai:gpt-4o',
    messages: [
      { role: 'system', content: 'Answer only from the context. Cite paths.' },
      { role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${input.question}` },
    ],
  });

  return { answer: answer.content, sources: [...new Set(rows.map((r) => r.path))] };
}
```

`raisin.ai.completion` takes `{ model, messages, system?, temperature?,
max_tokens?, tools?, response_format? }` and returns
`{ content, model, finish_reason, tool_calls, usage: { prompt_tokens,
completion_tokens, total_tokens } }`. It throws when the provider call fails.

When you need a raw vector (for example to store it elsewhere),
`raisin.ai.embed({ model: 'local-ollama:bge-m3', input: 'text' })` returns
`{ embedding, model, dimensions }`. Both `model` and `input` are required.

## Step 6: Store the answer (optional)

Storing answers as nodes makes them retrievable next time:

```sql
INSERT INTO 'knowledge' (path, name, node_type, properties) VALUES (
  '/answers/2026-03/answer-12345',
  'answer-12345',
  'kb:Answer',
  '{"question": "How does the storage layer work?",
    "answer": "The storage layer uses RocksDB with 40+ column families...",
    "sources": ["/docs/architecture/overview/storage"],
    "generated_at": "2026-03-31T12:00:00Z"}'::jsonb
);
```

## Hybrid search for RAG

`HYBRID_SEARCH` fuses the lexical and vector legs by rank. It is usually the
better retriever for a knowledge base that mixes prose with product names,
error codes and API paths, because an exact term and a paraphrase both count:

```sql
SELECT path, score, fulltext_rank, vector_rank, chunk_text
FROM HYBRID_SEARCH('ERR_CONN_RESET during publish', 10,
                   workspaces => 'knowledge', granularity => 'chunk');
```

`fulltext_weight` and `vector_weight` tilt the fusion; setting one to `0` turns
the other leg off.

## RAG with branch isolation

Give a RAG agent its own [branch](./agent-memory-with-branches.md) so it can
write answers and extracted facts without touching `main`:

```sql
CREATE BRANCH 'agent/rag-session-001' FROM 'main';
```

Searches run against the branch named in the connection or SQL endpoint
(`/api/sql/{repo}/{branch}`). A new branch starts with the parent's embeddings
and index copied.

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md): search columns and options in depth
- [Agent Memory with Branches](./agent-memory-with-branches.md): isolate RAG agents with branches
- [Function-Based Tool Use](./function-based-tool-use.md): the `raisin.*` runtime inside functions
