---
sidebar_position: 10
---

# Graph Model

RaisinDB combines hierarchical document storage with a **property graph model**, enabling you to model and query complex relationships between nodes. Use the RELATE statement to create edges, and GRAPH_TABLE (SQL/PGQ) for property graph queries.

## Nodes and Edges

### Nodes

In RaisinDB, every document is also a **graph node**. You already know nodes from the document model:

```sql
-- Create nodes (documents)
INSERT INTO default (path, node_type, properties) VALUES
  ('/content/blog/post1', 'blog:Article', '{"title": "GraphDB Intro"}'),
  ('/content/blog/post2', 'blog:Article', '{"title": "Advanced Graphs"}'),
  ('/users/jane', 'user:Profile', '{"name": "Jane Developer"}');
```

### Edges (Relationships)

**Edges** connect nodes with typed relationships using the **RELATE** statement:

```sql
-- Create relationships using RELATE
RELATE FROM path='/content/blog/post1' TO path='/content/blog/post2' TYPE 'RELATED_TO';

RELATE FROM path='/content/blog/post1' TO path='/users/jane' TYPE 'AUTHORED_BY';

-- RELATE with weight
RELATE FROM path='/users/jane' TO path='/content/blog/post2' TYPE 'AUTHORED' WEIGHT 1.0;

-- Remove a relationship with UNRELATE
UNRELATE FROM path='/content/blog/post1' TO path='/content/blog/post2' TYPE 'RELATED_TO';
```

## RELATE Statement Syntax

The full RELATE syntax:

```sql
RELATE [IN BRANCH 'branch']
  FROM path|id='value' [IN WORKSPACE 'ws']
  TO path|id='value' [IN WORKSPACE 'ws']
  [TYPE 'relation_type']
  [WEIGHT number];
```

### Cross-Workspace Relationships

```sql
-- Relate nodes across different workspaces
RELATE
  FROM path='/content/page' IN WORKSPACE 'default'
  TO path='/images/hero.jpg' IN WORKSPACE 'media'
  TYPE 'REFERENCES'
  WEIGHT 2.0;
```

### Branch-Specific Relationships

```sql
-- Create relationship in a specific branch
RELATE IN BRANCH 'feature/new-content'
  FROM path='/content/blog/post1'
  TO path='/content/blog/post2'
  TYPE 'RELATED_TO';
```

## Querying with GRAPH_TABLE (SQL/PGQ)

RaisinDB supports SQL/PGQ (ISO SQL:2023 Property Graph Queries) via the GRAPH_TABLE construct:

### Basic Pattern Matching

```sql
-- Find all articles and their related articles
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[r:RELATED_TO]->(b:Article)
  COLUMNS (
    a.path AS source_path,
    a.properties->>'title' AS source_title,
    b.path AS target_path,
    b.properties->>'title' AS target_title
  )
);

-- Find articles authored by a user
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (author:Profile)-[r:AUTHORED]->(article:Article)
  WHERE author.path = '/users/jane'
  COLUMNS (
    author.properties->>'name' AS author_name,
    article.properties->>'title' AS article_title
  )
);
```

### Bidirectional Relationships

```sql
-- Find all relationships (in any direction)
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[r]-(other)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (
    element_id(r) AS relation_id,
    other.path AS related_node
  )
);
```

### Multi-Hop Traversal

```sql
-- Find articles related to related articles (2 hops)
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->(b:Article)-[:RELATED_TO]->(c:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (
    a.path AS source,
    b.path AS intermediate,
    c.path AS destination
  )
);

-- Variable-length paths (1 to 3 hops)
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->{1,3}(b:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (a.path AS source, b.path AS target)
);
```

## NEIGHBORS Function

For simpler graph traversals, use the NEIGHBORS() function:

```sql
-- Find all outgoing neighbors of a node
SELECT * FROM NEIGHBORS('/users/jane', 'OUT', 'AUTHORED');

-- Find all incoming neighbors
SELECT * FROM NEIGHBORS('/content/blog/post1', 'IN', 'AUTHORED_BY');

-- Find neighbors in any direction
SELECT * FROM NEIGHBORS('/users/jane', 'BOTH', NULL);
```

## Relationship Types

Define semantic relationships:

### Common Patterns

```sql
-- Content relationships
RELATED_TO       -- General relatedness
REFERENCES       -- Explicit reference
PART_OF          -- Hierarchical composition
DERIVED_FROM     -- Content derivation

-- Authorship
AUTHORED         -- Created content
EDITED_BY        -- Modified content
REVIEWED_BY      -- Reviewed content

-- Social
FOLLOWS          -- User follows user
LIKES            -- User likes content
COMMENTED_ON     -- User commented on content

-- Taxonomy
CATEGORIZED_AS   -- Content → Category
TAGGED_WITH      -- Content → Tag
```

### Create Typed Edges

```sql
-- Article references another article
RELATE FROM path='/content/blog/advanced-graphs'
       TO path='/content/blog/graph-intro'
       TYPE 'REFERENCES';

-- User likes an article
RELATE FROM path='/users/jane'
       TO path='/content/blog/post1'
       TYPE 'LIKES';

-- Article tagged with tag
RELATE FROM path='/content/blog/post1'
       TO path='/taxonomy/tags/database'
       TYPE 'TAGGED_WITH';
```

## Edge Weights

Use weights for ranking and algorithms:

```sql
-- Create weighted relationship
RELATE FROM path='/content/blog/post1'
       TO path='/content/blog/post2'
       TYPE 'RELATED_TO'
       WEIGHT 0.95;

-- Query relationships ordered by weight
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a)-[r:RELATED_TO]->(b)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (b.path AS related, r.weight AS relevance)
  ORDER BY r.weight DESC
);
```

## Reciprocal Relationships

Create bidirectional edges:

```sql
-- Explicit bidirectional relationship
RELATE FROM path='/users/jane' TO path='/users/john' TYPE 'FRIENDS_WITH';
RELATE FROM path='/users/john' TO path='/users/jane' TYPE 'FRIENDS_WITH';

-- Query bidirectional with GRAPH_TABLE
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Profile)-[:FRIENDS_WITH]-(b:Profile)
  WHERE a.path = '/users/jane'
  COLUMNS (b.properties->>'name' AS friend)
);
```

## Graph + Hierarchy

Combine graph relationships with hierarchical paths:

```sql
-- Find related articles in the same category
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->(related:Article)
  WHERE a.path = '/content/blog/post1'
    AND PARENT(a.path) = PARENT(related.path)
  COLUMNS (related.properties->>'title' AS title)
);
```

## Real-World Examples

### Content Recommendation

```sql
-- Recommend articles based on what similar users liked
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (user:Profile)-[:LIKES]->(liked:Article)
        <-[:LIKES]-(similar:Profile)-[:LIKES]->(recommended:Article)
  WHERE user.path = '/users/jane'
    AND NOT EXISTS {
      MATCH (user)-[:LIKES]->(recommended)
    }
  COLUMNS (
    recommended.properties->>'title' AS title,
    COUNT(similar) AS similarity_score
  )
  ORDER BY similarity_score DESC
  LIMIT 5
);
```

### Social Network

```sql
-- Find friends of friends
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (user:Profile)-[:FOLLOWS]->(friend:Profile)-[:FOLLOWS]->(fof:Profile)
  WHERE user.path = '/users/jane'
    AND NOT EXISTS {
      MATCH (user)-[:FOLLOWS]->(fof)
    }
    AND fof.path != user.path
  COLUMNS (
    fof.properties->>'name' AS suggested_follow,
    COUNT(friend) AS mutual_friends
  )
  ORDER BY mutual_friends DESC
  LIMIT 10
);
```

### Citation Network

```sql
-- Find most cited articles
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (citing:Article)-[:REFERENCES]->(article:Article)
  COLUMNS (
    article.properties->>'title' AS title,
    COUNT(citing) AS citation_count
  )
  ORDER BY citation_count DESC
  LIMIT 20
);
```

## Versioned Graphs

Edges are versioned like nodes:

```sql
-- Create relationship
RELATE FROM path='/content/blog/post1'
       TO path='/content/blog/post2'
       TYPE 'RELATED_TO';

-- Time-travel graph query
SET __revision = '2024-01-14T10:00:00Z';

SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[:RELATED_TO]->(related:Article)
  WHERE a.path = '/content/blog/post1'
  COLUMNS (related.properties->>'title' AS title)
);
```

## Best Practices

1. **Use typed relationships**: Semantic relation_type names (AUTHORED, not LINKED)
2. **Use RELATE for edges**: Never use INSERT to create relationships
3. **Limit traversal depth**: Deep graph queries can be expensive
4. **Consider direction**: Use directed edges when order matters
5. **Use weights**: Add weights for relevance ranking
6. **Combine with hierarchies**: Leverage both graph and tree structures
7. **Monitor query performance**: Use EXPLAIN for complex graph queries

## Next Steps

- **[Nodes](/docs/concepts/data-model/nodes)** - Understanding graph nodes
- **[Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy)** - Tree + Graph
- **[SQL Reference - PGQ](/docs/reference/sql/graph/pgq)** - Complete SQL/PGQ documentation
- **[Data Modeling Guide](/docs/guides/data-modeling/creating-nodetypes)** - Design graph schemas
