---
sidebar_position: 3
---

# Graph Queries

Traverse relationships and hierarchies in RaisinDB.

## Getting Relationships

### Get All Relationships

```sql
SELECT * FROM get_relationships('node-id-123');
```

Returns both incoming and outgoing relationships.

### Get Outgoing Relationships

```sql
SELECT * FROM get_outgoing_relationships('node-id-123');
```

### Get Incoming Relationships

```sql
SELECT * FROM get_incoming_relationships('node-id-123');
```

### Filter by Relation Type

```sql
SELECT * FROM get_relationships('node-id-123')
WHERE relation_type = 'authored_by';
```

## Hierarchy Traversal

### Get Children

```sql
SELECT * FROM get_children('/articles');
```

### Get Descendants

```sql
-- Get all descendants up to depth 3
SELECT * FROM get_descendants('/articles', 3);
```

### Get Ancestors

```sql
SELECT * FROM get_ancestors('/articles/2024/january/post');
```

### Get Siblings

```sql
SELECT * FROM get_siblings('/articles/hello-world');
```

## JavaScript Client

```typescript
// Get relationships
const rels = await ws.nodes().getRelationships('/articles/hello-world');

// Get tree
const tree = await ws.nodes().getTree('/articles', 2);

// Get children
const children = await ws.nodes().listChildren('/articles');
```

## Next Steps

- [Full-Text Search](./full-text-search.md)
