---
sidebar_position: 1
---

# Document Model

RaisinDB stores all content as **nodes** — flexible, schema-validated documents organized in a hierarchical path tree. Every node is simultaneously a document, a graph vertex, and a searchable entity.

## Nodes as Documents

A node is a self-contained document with an identity, a type, properties, and a position in a path hierarchy:

```sql
INSERT INTO 'default' (path, node_type, properties) VALUES (
  '/content/blog/hello-world',
  'blog:Article',
  '{"title": "Hello World", "body": "Welcome!", "status": "published"}'
);
```

Every node has these built-in fields:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (ULID, auto-generated) |
| `path` | Hierarchical location (e.g., `/content/blog/hello-world`) |
| `node_type` | Schema type (e.g., `blog:Article`) |
| `properties` | JSON object with typed fields |
| `workspace` | Logical container (maps to a SQL table) |
| `created_at` | Creation timestamp |
| `updated_at` | Last modification timestamp |
| `version` | Revision counter |

## Properties

Properties are the primary data store for each node. They are stored as JSON but validated against the NodeType schema:

```sql
-- Query properties with the ->> operator
SELECT
  properties->>'title'::String AS title,
  properties->>'status'::String AS status
FROM 'default'
WHERE node_type = 'blog:Article';
```

Properties support rich types: strings, numbers, booleans, dates, arrays, objects, references to other nodes, URLs, and more. When a NodeType defines a property as `required`, RaisinDB enforces it on every write.

## Path Hierarchy

Every node lives at a **path** — a slash-separated location that defines its position in a tree:

```
/                           (root)
/content/                   (folder)
/content/blog/              (folder)
/content/blog/hello-world   (article)
/content/blog/second-post   (article)
/content/pages/             (folder)
/content/pages/about        (page)
```

Paths enable powerful hierarchical queries:

```sql
-- All nodes under /content/blog/
SELECT * FROM 'default'
WHERE PATH_STARTS_WITH(path, '/content/blog/');

-- Direct children of /content/
SELECT * FROM 'default'
WHERE PARENT(path) = '/content';

-- Nodes at depth 2
SELECT * FROM 'default'
WHERE DEPTH(path) = 2;
```

`PATH_STARTS_WITH` is optimized into a RocksDB prefix scan — it reads only matching keys, not the full workspace.

## Workspaces

Workspaces are logical containers that map to SQL tables. Each workspace can have its own allowed NodeTypes and configuration:

```sql
-- Query the default workspace
SELECT * FROM 'default' WHERE node_type = 'blog:Article';

-- Query a media workspace
SELECT * FROM 'media' WHERE node_type = 'Asset';
```

Workspaces provide query isolation without physical separation. Nodes in different workspaces are independent — they have separate path trees and can be searched independently.

## Schema Validation

NodeTypes define the expected structure for nodes. When strict mode is enabled, only declared properties are accepted:

```yaml
name: blog:Article
strict: true
properties:
  - name: title
    type: String
    required: true
  - name: body
    type: String
  - name: status
    type: String
versionable: true
```

RaisinDB validates every write against the schema, catching missing required fields, type mismatches, and constraint violations before data is stored.

## Versioning

Nodes support git-like versioning. Draft writes update the working state instantly. Commits create immutable revisions:

```sql
-- Query the current state
SELECT * FROM 'default' WHERE path = '/content/blog/hello-world';

-- Time-travel to a past revision
SET __revision = 42;
SELECT * FROM 'default' WHERE path = '/content/blog/hello-world';
```

See [Time-Travel Queries](/docs/guides/querying/time-travel-queries) for more details.

## How It Connects to Other Models

The document model is the foundation. Every node you create is also:

- A **graph vertex** — connect nodes with typed edges using `RELATE` and query with `GRAPH_TABLE`
- A **searchable document** — full-text indexed via Tantivy for `FULLTEXT_SEARCH` queries
- A **vector point** — embeddings stored per-node for `VECTOR_SEARCH` similarity queries

You don't choose one model — you use all of them on the same data.

## Next Steps

- [Nodes](/docs/concepts/data-model/nodes) — Detailed node reference
- [Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy) — Path design
- [NodeTypes](/docs/concepts/data-model/nodetypes) — Schema definitions
- [Full-Text Search](./full-text-search) — Search your documents
- [Vector Search](./vector-search) — Similarity queries
