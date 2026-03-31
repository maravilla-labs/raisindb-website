---
sidebar_position: 2
---

# Full-Text Search

RaisinDB includes a built-in full-text search engine powered by [Tantivy](https://github.com/quickwit-oss/tantivy). Nodes with `indexable: true` in their NodeType are automatically indexed on creation and update, and searchable via SQL.

## How It Works

1. **Automatic indexing** — When a node is created or updated, the indexing event handler enqueues an indexing job
2. **Background processing** — The indexer worker processes jobs in batches, extracting text from node properties and building the search index
3. **Per-workspace indexes** — Each workspace has its own Tantivy index with language-aware tokenization
4. **SQL integration** — Query the index using `FULLTEXT_SEARCH` in standard SQL

## Querying

### Basic Search

```sql
SELECT id, path, properties->>'title'::String AS title, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'content management')
ORDER BY __score DESC
LIMIT 20;
```

- `properties` tells the engine which fields to search
- `'content management'` is the search query
- `__score` is the relevance score (higher = more relevant)

### Search with Filters

Combine full-text search with standard SQL filters:

```sql
SELECT id, path, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'database')
  AND node_type = 'blog:Article'
  AND properties->>'status'::String = 'published'
ORDER BY __score DESC
LIMIT 10;
```

### Search Within a Subtree

```sql
SELECT id, path, __score
FROM 'default'
WHERE FULLTEXT_SEARCH(properties, 'tutorial')
  AND PATH_STARTS_WITH(path, '/content/docs/')
ORDER BY __score DESC;
```

## Features

### Multi-Language Stemming

Tantivy applies language-specific stemming so that searching for "running" also matches "run", "runs", and "ran". Stemming is configured per-workspace index.

### Fuzzy Matching

Tantivy supports approximate matching to handle typos and spelling variations. A search for "databse" can match documents containing "database".

### Tokenization

Text is tokenized into terms using language-aware rules:
- Whitespace and punctuation splitting
- Lowercasing for case-insensitive search
- Stop word removal (common words like "the", "is", "and")
- Stemming (reducing words to root forms)

### Relevance Scoring

Results are ranked by TF-IDF relevance scoring:
- **Term Frequency (TF)** — How often the search terms appear in the document
- **Inverse Document Frequency (IDF)** — How rare the terms are across all documents
- More specific terms produce higher scores

## Enabling Indexing

Full-text search requires `indexable: true` on the NodeType:

```yaml
name: blog:Article
indexable: true
index_types:
  - fulltext
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
  - name: excerpt
    type: String
```

When `indexable` is enabled, all string properties are included in the full-text index by default.

## Index Management

### Rebuild Indexes

If you need to reindex all content (e.g., after changing tokenization settings):

```bash
# Via the admin API
POST /api/management/myrepo/main/indexes/rebuild
```

### Index Statistics

Check index health and document counts:

```bash
GET /api/management/myrepo/main/indexes/stats
```

Returns document count, index size, and per-workspace statistics.

## Property Indexes

In addition to full-text search, RaisinDB maintains **property indexes** for efficient lookups on specific fields. The SQL engine's physical planner automatically uses property indexes when available, selecting index scans over full table scans.

`Reference` type properties are automatically indexed, enabling fast bidirectional lookups.

## Compared to Vector Search

| | Full-Text Search | Vector Search |
|-|-----------------|---------------|
| **Query type** | Keywords and phrases | Semantic meaning |
| **Best for** | Exact matches, known terminology | "Find similar content", fuzzy concepts |
| **Engine** | Tantivy (inverted index) | HNSW (approximate nearest neighbor) |
| **SQL function** | `FULLTEXT_SEARCH()` | `VECTOR_SEARCH()` |
| **Score field** | `__score` (relevance) | `__distance` (cosine distance) |
| **Zero config** | Yes (set `indexable: true`) | Requires embedding provider setup |

Use full-text search when users search by keywords. Use vector search when you need semantic similarity. You can use both on the same data.

## Next Steps

- [Vector Search](./vector-search) — Semantic similarity queries
- [Document Model](./document-model) — How nodes store content
- [Common Query Patterns](/docs/guides/querying/common-query-patterns) — SQL recipes including search
