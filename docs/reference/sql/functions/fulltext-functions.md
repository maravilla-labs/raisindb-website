---
sidebar_position: 8
---

# Full-Text Search Functions

PostgreSQL-compatible functions for full-text search operations.

## TS_RANK

Calculate relevance ranking score for full-text search matches.

### Syntax

```sql
TS_RANK(tsvector, tsquery) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| tsvector | TSVECTOR | Full-text search document |
| tsquery | TSQUERY | Search query |

### Return Value

DOUBLE - Relevance score (higher is more relevant).

### Examples

```sql
-- Basic ranking
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC;

-- Rank with multiple terms
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database & query')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database & query')
ORDER BY rank DESC
LIMIT 20;

-- Compare ranking for different queries
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('sql')) AS sql_rank,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS db_rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('sql | database')
ORDER BY sql_rank + db_rank DESC;
```

### Notes

- Returns 0.0 if no match
- Higher scores indicate better matches
- Score based on term frequency and document statistics
- Always use with @@ operator for filtering

---

## TO_TSVECTOR

Convert text to a full-text search document vector.

### Syntax

```sql
TO_TSVECTOR(text) → TSVECTOR
TO_TSVECTOR(language, text) → TSVECTOR
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| language | TEXT | Optional. Language for stemming and stop words (e.g., `'english'`, `'spanish'`) |
| text | TEXT | Text to convert |

### Return Value

TSVECTOR - Full-text search document.

### Examples

```sql
-- Create search vector
SELECT TO_TSVECTOR('The quick brown fox jumps over the lazy dog');

-- Index document content
INSERT INTO default (path, node_type, properties)
VALUES (
    '/content/blog/sql-tutorial',
    'Article',
    '{"title": "SQL Tutorial", "content": "Learn SQL from the basics..."}'
);

-- Combine multiple fields for search vector
UPDATE default
SET search_vector = TO_TSVECTOR(
    properties->>'title' || ' ' || properties->>'content'
);

-- Create search vector from properties
UPDATE default
SET search_vector = TO_TSVECTOR(
    properties->>'name' || ' ' ||
    COALESCE(properties->>'description', '') || ' ' ||
    COALESCE(properties->>'category', '')
);

-- Use with a specific language
SELECT TO_TSVECTOR('spanish', 'Los gatos son animales inteligentes');

UPDATE default
SET search_vector = TO_TSVECTOR(
    'english',
    properties->>'title' || ' ' || properties->>'content'
);
```

### Notes

- Normalizes text (lowercases, removes stop words)
- Stems words to base forms
- Removes punctuation and common words
- Store in TSVECTOR column for efficient searching
- When language is specified, uses language-specific stemming and stop words

---

## TO_TSQUERY

Convert text to a full-text search query.

### Syntax

```sql
TO_TSQUERY(query_text) → TSQUERY
TO_TSQUERY(language, query_text) → TSQUERY
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| language | TEXT | Optional. Language for stemming (e.g., `'english'`, `'spanish'`) |
| query_text | TEXT | Query string with operators |

### Return Value

TSQUERY - Full-text search query.

### Query Operators

- `&` - AND (both terms required)
- `|` - OR (either term)
- `!` - NOT (exclude term)
- `<->` - FOLLOWED BY (adjacent words)

### Examples

```sql
-- Single term
SELECT TO_TSQUERY('database');

-- AND query
SELECT TO_TSQUERY('database & query');

-- OR query
SELECT TO_TSQUERY('sql | database');

-- NOT query
SELECT TO_TSQUERY('database & !nosql');

-- Phrase search
SELECT TO_TSQUERY('full <-> text <-> search');

-- Complex query
SELECT TO_TSQUERY('(database | sql) & query & !tutorial');
```

### Notes

- Terms are normalized and stemmed
- Supports boolean operators
- Use with @@ operator for matching

---

## @@ Operator

Match operator for full-text search.

### Syntax

```sql
tsvector @@ tsquery → BOOLEAN
```

### Return Value

BOOLEAN - true if tsvector matches tsquery, false otherwise.

### Examples

```sql
-- Basic match
SELECT * FROM articles
WHERE search_vector @@ TO_TSQUERY('database');

-- AND query
SELECT * FROM articles
WHERE search_vector @@ TO_TSQUERY('database & query');

-- OR query
SELECT * FROM articles
WHERE search_vector @@ TO_TSQUERY('sql | database');

-- NOT query
SELECT * FROM articles
WHERE search_vector @@ TO_TSQUERY('database & !tutorial');

-- With ranking
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database & query')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database & query')
ORDER BY rank DESC;
```

---

## FULLTEXT_MATCH

Match text content against a full-text query with language support.

### Syntax

```sql
FULLTEXT_MATCH(query, language) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| query | TEXT | Search query text |
| language | TEXT | Language for text analysis |

### Return Value

BOOLEAN - true if the content matches the query.

### Examples

```sql
-- Match with language
SELECT * FROM articles
WHERE FULLTEXT_MATCH('database query', 'english');

-- Match in Spanish
SELECT * FROM articles
WHERE FULLTEXT_MATCH('base de datos', 'spanish');
```

---

## Complete Examples

### Basic Search

```sql
-- Search articles for keyword
SELECT
    title,
    content,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC
LIMIT 10;
```

### Multi-Term Search

```sql
-- Search for multiple terms with AND
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('sql & database & query')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('sql & database & query')
ORDER BY rank DESC;
```

### Search with OR

```sql
-- Search for any of multiple terms
SELECT
    title,
    TS_RANK(
        search_vector,
        TO_TSQUERY('postgresql | mysql | sqlite')
    ) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('postgresql | mysql | sqlite')
ORDER BY rank DESC
LIMIT 20;
```

### Exclude Terms

```sql
-- Find database articles excluding tutorials
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database & !tutorial')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database & !tutorial')
ORDER BY rank DESC;
```

### Phrase Search

```sql
-- Search for adjacent words
SELECT
    title,
    TS_RANK(
        search_vector,
        TO_TSQUERY('full <-> text <-> search')
    ) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('full <-> text <-> search')
ORDER BY rank DESC;
```

### Create Search Index

```sql
-- Update search vector from content
UPDATE default
SET search_vector = TO_TSVECTOR(
    COALESCE(properties->>'title', '') || ' ' ||
    COALESCE(properties->>'content', '') || ' ' ||
    COALESCE(properties->>'author', '')
)
WHERE search_vector IS NULL;
```

### Weighted Search

```sql
-- Combine title and content with different weights
UPDATE default
SET search_vector = TO_TSVECTOR(
    -- Title appears 3 times for higher weight
    properties->>'title' || ' ' || properties->>'title' || ' ' || properties->>'title' || ' ' ||
    properties->>'content'
);
```

### Search with Filters

```sql
-- Full-text search with additional filters
SELECT
    properties->>'title' AS title,
    properties->>'category' AS category,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM default
WHERE search_vector @@ TO_TSQUERY('database')
  AND properties->>'status' = 'published'
  AND created_at > NOW() - INTERVAL '90 days'
ORDER BY rank DESC
LIMIT 10;
```

### Count Matches

```sql
-- Count articles matching search
SELECT
    COUNT(*) AS total_matches
FROM articles
WHERE search_vector @@ TO_TSQUERY('database & query');
```

### Search with Excerpts

```sql
-- Find matching articles with title and rank
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC;
```

### Multi-Field Search

```sql
-- Search across multiple node types using the nodes table
SELECT
    node_type,
    properties->>'title' AS title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM nodes
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC
LIMIT 20;
```

### Autocomplete Search

```sql
-- Prefix matching for autocomplete
SELECT DISTINCT title
FROM articles
WHERE search_vector @@ TO_TSQUERY('datab:*')
ORDER BY title
LIMIT 10;
```

### Search with Pagination

```sql
-- Paginated search results
SELECT
    title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC
LIMIT 25 OFFSET 0;  -- Page 1
```

### Complex Boolean Query

```sql
-- Advanced search query
SELECT
    title,
    category,
    TS_RANK(
        search_vector,
        TO_TSQUERY('(database | sql) & (query | search) & !tutorial')
    ) AS rank
FROM articles
WHERE search_vector @@ TO_TSQUERY('(database | sql) & (query | search) & !tutorial')
ORDER BY rank DESC;
```

### Search with Category Boost

```sql
-- Boost results from specific category
SELECT
    properties->>'title' AS title,
    properties->>'category' AS category,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS base_rank,
    CASE
        WHEN properties->>'category' = 'Database'
            THEN TS_RANK(search_vector, TO_TSQUERY('database')) * 2
        ELSE TS_RANK(search_vector, TO_TSQUERY('database'))
    END AS boosted_rank
FROM default
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY boosted_rank DESC;
```

---

## Notes

- Full-text search is case-insensitive
- Common words (stop words) are automatically removed
- Words are stemmed to base forms (e.g., "running" → "run")
- Use TSVECTOR columns for efficient searching
- Create GIN or GiST indexes on TSVECTOR columns for performance
- @@ operator is required for filtering before ranking
- TS_RANK returns 0.0 for non-matches
- Combine with standard SQL filters for refined results
- Update search vectors when source content changes
