---
sidebar_position: 2
---

# Full-Text Search

RaisinDB includes a built-in full-text engine based on
[Tantivy](https://github.com/quickwit-oss/tantivy). Properties a NodeType
marks as searchable are indexed after every write and queried from SQL with
`FULLTEXT_SEARCH` and `FULLTEXT_MATCH`.

## How it works

1. **Write.** A node is created or updated through any transport.
2. **Index job.** An indexing job is queued for the node and runs shortly
   after. It reads the node's type, collects the properties marked
   `Fulltext`, and writes one document to the index. Nested element blocks
   contribute the fields their element type marks the same way.
3. **Per-branch index.** Each repository branch has its own Tantivy index;
   documents carry their workspace and language.
4. **Query.** `FULLTEXT_SEARCH` runs the query against the index and joins
   the hits back to their nodes, where ordinary SQL predicates apply.

## Querying

```sql
SELECT path, properties->>'title' AS title, score
FROM FULLTEXT_SEARCH('content management', 'en', workspaces => 'blog')
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
ORDER BY score DESC
LIMIT 20;
```

- `'content management'` is the query.
- `'en'` is the language, as an ISO 639-1 code. It selects the stemmer used
  for the query; the index stores two-letter codes, so `'english'` is rejected.
- `workspaces` is required: a name, a comma-separated list, a glob such as
  `'content-*'`, or `'ALL READABLE'`.
- `score` is `1 / (60 + rank)`, higher for better hits.
- Which fields are searched is decided by the NodeType, not by the query.

The [Full-Text Search guide](/docs/guides/querying/full-text-search) covers
the query syntax, `FULLTEXT_MATCH`, and the HTTP endpoint.

## What the index does with text

**Two fields per document.** The node's `name` and a `content` field holding
every searchable property, concatenated. Queries match either; `name:about`
targets the name alone. Property names are not query fields.

**Tokenization.** Text is split on whitespace and punctuation and lowercased.
The base analyzer handles CJK text as well as Latin scripts.

**Stemming.** Each document is additionally indexed in a stemmed form for its
language, and the query is stemmed the same way, so `running` finds `run`
and `Datenbanken` finds `Datenbank`. Languages without a stemmer (Japanese,
Chinese, Korean, Thai, and others) use the unstemmed fields only.

**Typo tolerance.** Terms match within an edit distance of one on the
unstemmed fields, so `databses` finds `databases`. Fuzzy matching is not
applied to the stemmed fields, which keeps it from conflating unrelated
stems.

**Ranking.** Tantivy scores hits with BM25. The SQL surface converts that
ranking into the rank-based `score` so results from the full-text leg and
the vector leg of a hybrid search can be fused.

## Choosing what is indexed

Two flags on the NodeType and one on each property:

```yaml
name: blog:Article
indexable: true               # default true; false switches the type off entirely
index_types: [Fulltext]       # default: all index types
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: body
    type: String
    index: [Fulltext, Vector] # searchable by word and by meaning
  - name: excerpt
    type: String              # not indexed
```

The same in SQL DDL:

```sql
CREATE NODETYPE 'blog:Article' PROPERTIES (
  title String REQUIRED FULLTEXT,
  body String FULLTEXT,
  excerpt String
) INDEXABLE;
```

A property with no `index` entry is not searchable. If a node's type cannot
be resolved at index time, every top-level string property is indexed as a
fallback so that content never silently disappears from search.

Mark the same property `Fulltext` and `Vector` when you use hybrid search.
Rank fusion assumes both legs cover the same documents; a field visible to
one leg only tilts the ranking toward that leg.

## Index maintenance

The admin endpoints live under
`/api/admin/management/database/{tenant}/{repo}/fulltext/`, and take an
optional `?branch=` (default: the repository's default branch):

| Endpoint | Purpose |
|---|---|
| `GET …/health` | document count, disk usage, last optimize time |
| `POST …/verify` | compare the index against the node store |
| `POST …/reconcile` | index missing nodes and drop stale documents |
| `POST …/rebuild` | drop and rebuild the index from the nodes |
| `POST …/optimize` | merge segments |
| `GET …/errors` | indexing failures recorded for the branch |

```bash
curl http://localhost:8090/api/admin/management/database/default/myrepo/fulltext/health \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"index_type":"FullText","memory_usage_bytes":0,"disk_usage_bytes":1022244,"entry_count":190,"cache_hit_rate":null,"last_optimized":"2026-09-06T18:39:22Z"}
```

`rebuild` and `reconcile` queue a job and return its id. The index is
derived data: it is rebuilt locally on every node of a cluster and never
replicated, so a node that joined late runs `rebuild` to catch up.

## Compared to vector search

| | Full-text search | Vector search |
|---|---|---|
| Query | keywords, phrases, prefixes | meaning |
| Best for | known terminology, exact wording | "find similar", paraphrases |
| Engine | Tantivy inverted index | HNSW nearest neighbour |
| SQL | `FULLTEXT_SEARCH()` | `KNN()`, both in `HYBRID_SEARCH()` |
| Distance column | `score` | `vector_distance` (cosine) plus `score` |
| Setup | mark fields `Fulltext` | mark fields `Vector` and configure an embedding provider |

Both can run on the same fields, and `HYBRID_SEARCH` fuses them by rank.

## Next Steps

- [Full-Text Search guide](/docs/guides/querying/full-text-search)
- [Vector Search](./vector-search)
- [Document Model](./document-model)
- [Indexing](/docs/concepts/indexing)
