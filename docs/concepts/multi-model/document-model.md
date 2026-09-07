---
sidebar_position: 1
---

# Document Model

RaisinDB stores content as **nodes**: schema-validated JSON documents arranged
in a path tree. The same node is also a vertex in the graph, a document in the
full-text index and, with embeddings configured, a point in the vector index.

## Nodes as documents

A node has an identity, a type, a position in the tree, and a `properties`
object:

```sql
INSERT INTO 'blog' (path, node_type, properties) VALUES (
  '/posts/hello-world',
  'raisin:Page',
  '{"title": "Hello World", "content": "Welcome!", "status": "published"}'::jsonb
);
```

Every node carries these fields:

| Field | Description |
|---|---|
| `id` | Unique identifier, generated on create |
| `path` | Location in the tree, for example `/posts/hello-world` |
| `name` | Last path segment |
| `node_type` | Schema type, for example `raisin:Page` |
| `archetype` | Optional archetype that adds fields to the type |
| `properties` | JSON object holding the content |
| `created_at`, `updated_at`, `created_by`, `updated_by` | Write metadata |
| `published_at`, `published_by` | Set when the node is published |
| `version` | Revision counter |

The workspace a node lives in is the SQL table you query it from.

## Properties

Properties are the content. They are stored as JSON and validated against the
NodeType on every write. Read them with `->>` and cast the key to filter by a
type:

```sql
SELECT
  properties->>'title'  AS title,
  properties->>'status' AS status
FROM 'blog'
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published';
```

Property types include strings, numbers, booleans, dates, URLs, arrays,
nested objects, references to other nodes, geometry and embedded element
blocks. A property declared `required` must be present on every write.

## Path hierarchy

Every node lives at a slash-separated path:

```
/                        root
/posts                   folder
/posts/hello-world       page
/posts/second-post       page
/pages
/pages/about
```

The tree is queryable directly:

```sql
-- direct children of /posts
SELECT path FROM 'blog' WHERE CHILD_OF('/posts');

-- everything under /posts
SELECT path FROM 'blog' WHERE DESCENDANT_OF('/posts');

-- top-level nodes
SELECT path FROM 'blog' WHERE depth = 1;
```

Hierarchy predicates become prefix scans over the path index, so they read
only the subtree they name. Children also carry an editorial order, the one
editors set by drag and drop, exposed as the `__order` column.

## Workspaces

A workspace is a named container with its own tree and its own list of
allowed NodeTypes. Each workspace is a table:

```sql
SELECT * FROM 'blog'   WHERE node_type = 'raisin:Page';
SELECT * FROM 'assets' WHERE node_type = 'raisin:Asset';
```

Workspaces are created over the management API, not with SQL. Cross-workspace
queries join two tables or search several workspaces at once with
`workspaces => 'blog, docs'`.

## Schema validation

A NodeType defines which properties a node may have, their types and
constraints:

```yaml
name: blog:Article
strict: true
versionable: true
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: body
    type: String
    index: [Fulltext]
  - name: status
    type: String
```

A write that misses a required field, has the wrong type or breaks a
constraint is rejected before anything is stored. With `strict: true` only
declared properties are accepted. The `index` list on a property decides
which indexes it enters; see [Indexing](/docs/concepts/indexing).

## Versioning

Every write creates a new revision of the branch, and earlier revisions stay
readable:

```sql
-- current state
SELECT * FROM 'blog' WHERE path = '/posts/hello-world';

-- as of an earlier revision
SELECT * FROM 'blog'
WHERE path = '/posts/hello-world' AND __revision = '1788720151444-0';
```

See [Time-Travel Queries](/docs/guides/querying/time-travel-queries).

## How it connects to the other models

The node is the unit everything else is built on:

- **Graph**: connect nodes with typed edges using `RELATE` and match patterns
  with `GRAPH_TABLE`.
- **Full-text**: properties marked `Fulltext` are indexed by Tantivy and
  queried with `FULLTEXT_SEARCH`.
- **Vector**: properties marked `Vector` are embedded and queried with `KNN`
  and `HYBRID_SEARCH`.

## Next Steps

- [Nodes](/docs/concepts/data-model/nodes)
- [Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy)
- [NodeTypes](/docs/concepts/data-model/nodetypes)
- [Full-Text Search](./full-text-search)
- [Vector Search](./vector-search)
