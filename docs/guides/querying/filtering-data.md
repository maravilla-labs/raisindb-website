---
sidebar_position: 2
---

# Filtering Data

Advanced techniques for filtering and querying nodes in RaisinDB.

## JSON Query API

Use the JSON query endpoint for complex filters:

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/content/query \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "node_type": "Article",
      "properties.status": "published"
    },
    "limit": 20
  }'
```

## Comparison Operators

### Equals

```json
{
  "filter": {
    "properties.status": "published"
  }
}
```

### Not Equals

```json
{
  "filter": {
    "properties.status": { "$ne": "draft" }
  }
}
```

### Greater Than / Less Than

```json
{
  "filter": {
    "properties.views": { "$gt": 1000 },
    "properties.rating": { "$gte": 4.0 },
    "properties.price": { "$lt": 100 },
    "properties.stock": { "$lte": 10 }
  }
}
```

### In Array

```json
{
  "filter": {
    "properties.status": { "$in": ["published", "featured"] }
  }
}
```

### Not In Array

```json
{
  "filter": {
    "properties.status": { "$nin": ["draft", "archived"] }
  }
}
```

## Logical Operators

### AND (implicit)

```json
{
  "filter": {
    "node_type": "Article",
    "properties.status": "published",
    "properties.featured": true
  }
}
```

### OR

```json
{
  "filter": {
    "$or": [
      { "properties.status": "published" },
      { "properties.featured": true }
    ]
  }
}
```

### AND (explicit)

```json
{
  "filter": {
    "$and": [
      { "properties.views": { "$gt": 100 } },
      { "properties.rating": { "$gte": 4.0 } }
    ]
  }
}
```

### NOT

```json
{
  "filter": {
    "$not": {
      "properties.status": "archived"
    }
  }
}
```

## String Matching

### Contains

```json
{
  "filter": {
    "properties.title": { "$contains": "database" }
  }
}
```

### Starts With

```json
{
  "filter": {
    "properties.slug": { "$startsWith": "intro-" }
  }
}
```

### Ends With

```json
{
  "filter": {
    "properties.email": { "$endsWith": "@example.com" }
  }
}
```

### Regular Expression

```json
{
  "filter": {
    "properties.phone": { "$regex": "^\\+1\\d{10}$" }
  }
}
```

## Array Filters

### Array Contains

```json
{
  "filter": {
    "properties.tags": { "$contains": "technology" }
  }
}
```

### Array Contains Any

```json
{
  "filter": {
    "properties.tags": {
      "$containsAny": ["technology", "database", "web"]
    }
  }
}
```

### Array Contains All

```json
{
  "filter": {
    "properties.tags": {
      "$containsAll": ["javascript", "tutorial"]
    }
  }
}
```

### Array Length

```json
{
  "filter": {
    "properties.tags": { "$size": 3 }
  }
}
```

## Null Checks

### Is Null

```json
{
  "filter": {
    "properties.published_date": { "$null": true }
  }
}
```

### Is Not Null

```json
{
  "filter": {
    "properties.published_date": { "$null": false }
  }
}
```

### Field Exists

```json
{
  "filter": {
    "properties.custom_field": { "$exists": true }
  }
}
```

## Sorting

### Single Field

```json
{
  "filter": { "node_type": "Article" },
  "sort": [
    { "field": "created_at", "order": "desc" }
  ]
}
```

### Multiple Fields

```json
{
  "filter": { "node_type": "Article" },
  "sort": [
    { "field": "properties.featured", "order": "desc" },
    { "field": "properties.views", "order": "desc" },
    { "field": "created_at", "order": "desc" }
  ]
}
```

## Pagination

```json
{
  "filter": { "node_type": "Article" },
  "limit": 20,
  "offset": 40
}
```

## Field Selection

Select specific fields:

```json
{
  "filter": { "node_type": "Article" },
  "select": ["id", "path", "properties.title", "properties.author"],
  "limit": 10
}
```

## Complex Example

```json
{
  "filter": {
    "node_type": "Product",
    "$and": [
      {
        "$or": [
          { "properties.category": "electronics" },
          { "properties.category": "computers" }
        ]
      },
      { "properties.price": { "$gte": 100, "$lte": 1000 } },
      { "properties.in_stock": true },
      { "properties.rating": { "$gte": 4.0 } },
      { "properties.tags": { "$containsAny": ["sale", "featured"] } }
    ]
  },
  "sort": [
    { "field": "properties.featured", "order": "desc" },
    { "field": "properties.rating", "order": "desc" }
  ],
  "limit": 20,
  "offset": 0
}
```

## Next Steps

- [Graph Queries](./graph-queries.md)
- [Full-Text Search](./full-text-search.md)
