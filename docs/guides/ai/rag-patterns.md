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

Long text is split into chunks and each chunk gets its own vector, so a
question about page 30 is not answered with page 2.

**A document body is always chunked.** Text extracted from a PDF, or handed back
by a converter plugin, is embedded under its own spec (`doc`) and falls back to
**512 tokens with a 64-token overlap** when you have configured nothing. That
fallback is not optional, and the reason is worth stating: without it a
forty-page contract becomes a single vector, which sits close to every query and
specific to none. Nothing reports that — the embedding job succeeds and
`SHOW VECTOR INDEX HEALTH` stays green — so the only symptom is retrieval
quietly returning the wrong document.

**A node's own fields are not chunked** unless you ask. A title and a caption are
short; splitting them makes every fragment match everything.

Override either on the tenant's embedding configuration, or per
[processing rule](./asset-processing.md#tasks) for uploaded documents:

```yaml
chunking:
  chunk_size: 512
  splitter: recursive     # recursive | fixed_size | markdown | code
  overlap:
    type: Tokens          # Tokens (a count) or Percentage (0.0 to 0.5)
    value: 64
```

Sizes are counted in **tokens** when `tokenizer_id` is set and in **characters**
when it is not — a `chunk_size: 256` with no tokenizer means 256 characters,
roughly a sentence and a half. Set `tokenizer_id` to a tiktoken model name such
as `text-embedding-3-small`; it is a counting proxy and does not have to match
the embedder you actually use. A name the tokenizer cannot load falls back to
character counting rather than to no chunking.

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

## Ready-made: the built-in RAG functions

Everything above is the pipeline you would assemble yourself. Four functions in
the `ai-tools` package already assemble it, and they are ordinary
`raisin:Function` nodes — read them, copy them, replace them.

| Function | What it does |
|---|---|
| `/lib/raisin/ai/search-documents` | Hybrid search at chunk granularity. Returns passages with `path`, `node_id` and `chunk_index` as citation handles |
| `/lib/raisin/ai/ask` | The whole round trip: retrieve, grade, answer from those passages only, with citations |
| `/lib/raisin/ai/graph-context` | Seeds by meaning, then walks the graph outward from what it found |
| `/lib/raisin/ai/extract-entities` | Builds the graph from a document: entities as nodes, relations as typed edges |

Call one over HTTP, from another function, or as an agent tool:

```bash
curl -X POST "$RAISIN/api/functions/$REPO/ask/invoke" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input": {"question": "How often must standing rigging be replaced?"},
       "wait_for_completion": true}'
```

```json
{
  "answer": "Standing rigging must be replaced every ten years in temperate
             waters and every seven years in the tropics [1].",
  "grounded": true,
  "citations": [
    { "marker": 1, "path": "/marine-handbook", "chunk_index": 2,
      "node_id": "ba12dff4-…", "text_is_exact": true }
  ],
  "attempts": [{ "query": "How often must standing rigging be replaced?",
                 "passages": 8 }]
}
```

Three things in that response are load-bearing:

- **`grounded: false` means the model was never called.** When retrieval finds
  nothing, `ask` returns a plain "the documents do not cover this" instead of
  asking a model to answer from an empty context. A model in that position
  answers from its own weights, fluently, and nothing in the output says so.
- **`citations` is the numbering the model was given**, so `[1]` resolves to a
  path and a chunk index without parsing prose.
- **`attempts` shows the retry.** See below.

`text_is_exact: false` on a passage means the engine could only supply a
200-character preview rather than the passage itself. Point a reader at the
document with it; do not quote it as though it were complete.

## Agentic retrieval: grade, rewrite, retry

`ask` does not take the first retrieval as final. It grades the passages against
the question, and when they do not answer it, rewrites the query in the
vocabulary the documents themselves use and searches once more:

```text
"how much warning before we get kicked out?"   ->  0 passages
        grade: insufficient
        rewrite: "termination written notice period"
"termination written notice period"            ->  8 passages  -> answer
```

That rewrite is most of the value of the loop. A user asks in their own words,
the document says "termination requires thirty days written notice", and the
lexical leg matches nothing while the vector leg matches vaguely.

The loop is bounded at two retrievals, and a grader that fails, times out or
returns something unparseable counts as "good enough" — a broken grader degrades
this to ordinary one-shot RAG rather than a retry storm.

## Graph RAG: retrieve, then follow the links

Vector search finds documents that *read* like the question. It cannot tell you
that two documents are about the same person, because nothing in the text says
so. That is what the graph is for.

### Building the graph from documents

`extract-entities` reads a document's extracted text, asks a model which
entities it names and how they relate, and writes them as nodes joined by typed
edges:

```bash
curl -X POST "$RAISIN/api/functions/$REPO/extract-entities/invoke" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"input": {"path": "/marine-handbook", "workspace": "library"},
       "wait_for_completion": true}'
```

Two documents naming the same organisation converge on **one** entity node, so
walking out from that entity reaches both — the connection a vector search over
either document alone can never make.

It is idempotent: a run records a fingerprint of the text it read, and a later
run that finds the same fingerprint does nothing at all. Without that, every
re-save of a document would pay for a model call, mint a node revision, and
trigger the reindex that follows.

### Relations are not references

RaisinDB has two kinds of link, and graph retrieval uses the explicit one.

| | Reference | Relation |
|---|---|---|
| What it is | A property that points somewhere: `{"raisin:ref": "/path", "raisin:workspace": "ws"}` | `RELATE FROM … TO … TYPE … WEIGHT …` |
| Where it lives | The node's own properties | The relation index, independent of both nodes |
| Query it with | `REFERENCES(...)` | `NEIGHBORS(...)`, `GRAPH_TABLE(...)` |
| It exists because | The content says so — an author field, a hero image | Someone asserted it |

An extracted knowledge graph is the second kind. "Acme employs Dana" is an
assertion about the world, not a field on a document, and `works_at` has to be
the label on the edge — which a reference property cannot carry.

```sql
RELATE FROM path='/entities/dana-weber' IN WORKSPACE 'library'
       TO   path='/entities/acme-marine' IN WORKSPACE 'library'
       TYPE 'works_at';

SELECT path, relation_type, weight
FROM NEIGHBORS('library:/entities/dana-weber', 'BOTH', NULL);
-- /entities/acme-marine   works_at   NULL
```

### Walking out from what you found

`graph-context` seeds from hybrid search (or from seeds you pass) and expands
breadth-first along those edges:

```bash
curl -X POST "$RAISIN/api/functions/$REPO/graph-context/invoke" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"input": {"query": "who maintains the handbook?", "hops": 2},
       "wait_for_completion": true}'
```

Each returned node carries `hop` (distance from a seed) and `via` (the edge's
type), so an agent can say not just *that* two things are connected but *how*.
The walk is bounded, and when it hits its budget it says so with
`truncated: true` — a truncated neighbourhood that looked complete would make an
agent conclude something is unconnected when it was simply never visited.

`ask` can use it as a second retrieval leg with `"use_graph": true`. It is
opt-in because it answers a different question and costs a walk.

## An agent that retrieves

The `ai-tools` package ships a **Research Assistant** agent at
`/agents/research-assistant` wired to `search-documents`, `ask` and
`graph-context`, with a system prompt that tells it to search before answering,
cite what it used, and say plainly when the documents do not cover something.

Set its `provider` and `model` to something your tenant has configured, and add
the same three tool paths to any agent of your own:

```yaml
tools:
  - /lib/raisin/ai/search-documents
  - /lib/raisin/ai/ask
  - /lib/raisin/ai/graph-context
```

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md): search columns and options in depth
- [Agent Memory with Branches](./agent-memory-with-branches.md): isolate RAG agents with branches
- [Function-Based Tool Use](./function-based-tool-use.md): the `raisin.*` runtime inside functions
