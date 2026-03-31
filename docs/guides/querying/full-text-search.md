---
sidebar_position: 4
---

# Full-Text Search

Search content across your nodes using full-text search.

## Basic Search

### Via HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/fulltext/search \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "raisindb graph database",
    "workspace": "content",
    "limit": 10
  }'
```

### Via SQL

```sql
SELECT * FROM fulltext_search('content', 'raisindb graph database');
```

## Advanced Searches

### Filter by NodeType

```sql
SELECT * FROM fulltext_search(
  'content',
  'tutorial',
  node_type => 'Article'
);
```

### Boost Specific Fields

```json
{
  "query": "database",
  "workspace": "content",
  "boost": {
    "title": 3.0,
    "content": 1.0
  }
}
```

### Highlighting

```json
{
  "query": "raisindb",
  "workspace": "content",
  "highlight": {
    "fields": ["title", "content"],
    "fragment_size": 150,
    "number_of_fragments": 3
  }
}
```

## Search Operators

- `AND`, `OR`, `NOT` for boolean logic
- `"exact phrase"` for phrase matching
- `field:value` for field-specific search
- `*` for wildcards

Example:

```
title:"getting started" AND (raisindb OR database) NOT deprecated
```

## Next Steps

- [Filtering Data](./filtering-data.md)
- [SQL Basics](./sql-basics.md)
