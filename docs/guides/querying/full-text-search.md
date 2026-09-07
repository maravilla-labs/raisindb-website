---
sidebar_position: 4
---

# Full-Text Search

Search the words in your content, with typo tolerance and stemming, from SQL
or over HTTP. Indexing is automatic for the fields a NodeType marks as
searchable.

## Search from SQL

`FULLTEXT_SEARCH` is a table function. It takes the query, the language code,
and a required `workspaces` scope:

```sql
SELECT path, score
FROM FULLTEXT_SEARCH('databases', 'en', workspaces => 'blog')
ORDER BY score DESC
LIMIT 10;
```

```json
{"columns":["path","score"],"rows":[
  {"path":"/posts/post-1","score":0.01639},
  {"path":"/posts/post-2","score":0.01613}
]}
```

- The language is an ISO 639-1 code (`'en'`, `'de'`). It selects the stemmer;
  the index stores two-letter codes, so `'english'` is rejected.
- `workspaces` is one name, a comma-separated list (`'blog, docs'`), a glob
  (`'content-*'`), or `'ALL READABLE'` for every workspace you may read.
- `limit => 50` caps the number of hits taken from the index (default 100).
  `LIMIT` on the outer query still applies.

Each row also carries `node_id`, `workspace_id`, `name`, `node_type`,
`properties`, `created_at`, `updated_at`, `fulltext_rank` (1 for the best
hit) and, for hybrid queries, `vector_rank` and `vector_distance`. `score` is
a rank-based value, `1 / (60 + rank)`, so it is comparable between queries
and between full-text and vector legs.

### Filtering search results

Any SQL predicate can follow the search:

```sql
SELECT path, properties->>'title' AS title, score
FROM FULLTEXT_SEARCH('databases', 'en', workspaces => 'blog')
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
  AND PATH_STARTS_WITH(path, '/posts/')
ORDER BY score DESC
LIMIT 10;
```

### Search as a predicate

`FULLTEXT_MATCH(query, language)` is the same search written as a `WHERE`
condition on the workspace table. It becomes the scan for the query, and
other predicates filter its hits:

```sql
SELECT path FROM 'blog'
WHERE FULLTEXT_MATCH('databases', 'en')
  AND CHILD_OF('/posts')
  AND properties->>'status'::String = 'published';
```

Use `FULLTEXT_SEARCH` when you want the score; `FULLTEXT_MATCH` when you only
need the rows.

## Query syntax

The query string uses Tantivy's parser over two fields: `name` (the node
name) and `content` (every searchable property, concatenated).

| Write | Meaning |
|---|---|
| `database query` | either word (terms are OR-ed) |
| `database AND query` | both words |
| `+database -tutorial` | must contain / must not contain |
| `"content management"` | the exact phrase |
| `datab*` | prefix |
| `name:about` | match the node name only |

Matching is case-insensitive. Terms tolerate one typo (`databses` finds
`databases`), and the language's stemmer matches word forms (`running` finds
`run`). Field names other than `name` and `content` are an error; property
names are not query fields.

## Which fields are searched

A NodeType declares which properties go into the index. In YAML:

```yaml
name: blog:Article
indexable: true
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: body
    type: String
    index: [Fulltext]
  - name: internal_notes
    type: String        # not searchable
```

In SQL DDL, the `FULLTEXT` modifier does the same:

```sql
CREATE NODETYPE 'blog:Article' PROPERTIES (
  title String REQUIRED FULLTEXT,
  body String FULLTEXT,
  internal_notes String
) INDEXABLE;
```

Only properties with the Fulltext index are searchable; a word that appears
only in `internal_notes` finds nothing. The built-in `raisin:Page` indexes
`title` and `content`. Nodes are indexed by a background job shortly after
each write.

## Search over HTTP

```bash
curl -X POST http://localhost:8090/api/repository/myrepo/main/fulltext/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "databases", "workspace": "blog", "language": "en", "limit": 10}'
```

```json
[
  {"node_id":"a178…","workspace_id":"blog","name":"post-1","path":"/posts/post-1","node_type":"raisin:Page","score":11.24},
  {"node_id":"d571…","workspace_id":"blog","name":"post-2","path":"/posts/post-2","node_type":"raisin:Page","score":11.24}
]
```

| Field | |
|---|---|
| `query` | required; same syntax as above |
| `workspace` | one workspace; omit to search all workspaces of the repository |
| `language` | defaults to the repository's default language |
| `limit` | default 20, maximum 100 |
| `shape_type` | only nodes whose type, archetype or nested element type is this name |

This endpoint returns the raw index score (BM25), which is larger for better
matches but not comparable across queries.

The combined search endpoint, `GET /api/search/{repo}?q=…&workspace=…`, runs
the same engine as `HYBRID_SEARCH` and returns rank-fused results. Pass
`strategy=fulltext` for a keyword-only search; the default `hybrid` strategy
needs an embedding configuration for the tenant. See
[Vector Search](/docs/concepts/multi-model/vector-search).

## Next Steps

- [Full-Text Search concepts](/docs/concepts/multi-model/full-text-search) for indexing, stemming and maintenance
- [Filtering Data](./filtering-data.md)
- [SQL Basics](./sql-basics.md)
