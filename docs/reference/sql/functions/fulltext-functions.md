---
sidebar_position: 8
---

# Full-Text Search Functions

Functions that query the Tantivy full-text index. Both take a query string in
[Tantivy syntax](/docs/guides/querying/full-text-search#query-syntax) and an
ISO 639-1 language code.

## FULLTEXT_SEARCH

Table function. Returns the index hits, ranked, as rows.

### Syntax

```sql
FULLTEXT_SEARCH(query, language, workspaces => scope [, limit => n])
```

### Arguments

| Argument | Type | Description |
|---|---|---|
| `query` | TEXT | Search string. Positional, required. |
| `language` | TEXT | ISO 639-1 code such as `'en'`. Positional, required. Selects the stemmer. `'english'` is rejected. |
| `workspaces` | TEXT | Named, required. One name, `'a, b, c'`, a glob `'content-*'`, or `'ALL READABLE'`. |
| `limit` | INT | Named, optional. Hits taken from the index. Default 100. |

Positional arguments must come before named ones. A third positional argument
is an error.

### Result columns

| Column | Type | Description |
|---|---|---|
| `node_id`, `workspace_id` | TEXT | Identity of the hit |
| `name`, `path`, `node_type` | TEXT | From the node |
| `properties` | JSONB | The node's properties |
| `score` | DOUBLE | `1 / (60 + fulltext_rank)`; higher is better |
| `fulltext_rank` | INT | 1 for the best hit |
| `vector_rank`, `vector_distance`, `chunk_index`, `embedding_kind`, `chunk_text`, `chunk_text_source` | | NULL for a full-text-only search; populated by `HYBRID_SEARCH` and `KNN` |
| `revision` | INT | The node's version |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### Examples

```sql
-- top ten
SELECT path, score
FROM FULLTEXT_SEARCH('databases', 'en', workspaces => 'blog')
ORDER BY score DESC
LIMIT 10;

-- filtered
SELECT path, score
FROM FULLTEXT_SEARCH('databases', 'en', workspaces => 'blog', limit => 50)
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
ORDER BY score DESC;

-- several workspaces
SELECT workspace_id, path, score
FROM FULLTEXT_SEARCH('onboarding', 'en', workspaces => 'docs, blog')
ORDER BY score DESC
LIMIT 20;

-- everything the caller may read
SELECT workspace_id, path
FROM FULLTEXT_SEARCH('gdpr', 'en', workspaces => 'ALL READABLE')
LIMIT 20;

-- phrase, exclusion, prefix, field
SELECT path FROM FULLTEXT_SEARCH('"content management"', 'en', workspaces => 'blog');
SELECT path FROM FULLTEXT_SEARCH('+database -tutorial', 'en', workspaces => 'blog');
SELECT path FROM FULLTEXT_SEARCH('datab*', 'en', workspaces => 'blog');
SELECT path FROM FULLTEXT_SEARCH('name:about', 'en', workspaces => 'blog');
```

### Errors

| Message | Cause |
|---|---|
| `FULLTEXT_SEARCH requires an explicit workspace scope` | `workspaces` missing |
| `language must be an ISO 639-1 code` | a word such as `'english'` |
| `Field does not exist: 'title'` | a `field:` prefix other than `name` or `content` |
| `unknown argument '…'` | a named argument other than `workspaces`, `limit`, `language` |

---

## FULLTEXT_MATCH

Boolean predicate for the `WHERE` clause of a query over a workspace table.
The planner turns it into a `FullTextScan` and applies the remaining
predicates to its hits.

### Syntax

```sql
FULLTEXT_MATCH(query, language) → BOOLEAN
```

### Arguments

| Argument | Type | Description |
|---|---|---|
| `query` | TEXT | Search string |
| `language` | TEXT | ISO 639-1 code. An unknown code matches nothing. |

### Examples

```sql
SELECT path FROM 'blog'
WHERE FULLTEXT_MATCH('databases', 'en');

SELECT path FROM 'blog'
WHERE FULLTEXT_MATCH('databases', 'en')
  AND CHILD_OF('/posts')
  AND properties->>'status'::String = 'published';
```

```sql
EXPLAIN SELECT path FROM 'blog'
WHERE FULLTEXT_MATCH('databases', 'en') AND properties->>'status'::String = 'published';
-- Project
--   Filter: 1 predicates
--     FullTextScan: lang=en, query=databases
```

`FULLTEXT_MATCH` returns rows in index order but exposes no score column.
Use `FULLTEXT_SEARCH` when you need to sort by relevance.

---

## Related

- `HYBRID_SEARCH(query, k, workspaces => …)` and `KNN(query, k, workspaces
  => …)` share this implementation and add a vector leg. They require an
  embedding configuration. See
  [Vector Search](/docs/concepts/multi-model/vector-search).
- PostgreSQL's `to_tsvector` / `to_tsquery` / `@@` / `ts_rank` are not
  available as query operators; use the two functions above.
