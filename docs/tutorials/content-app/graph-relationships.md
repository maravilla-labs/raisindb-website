---
sidebar_position: 3
---

# 3. Graph Relationships

In this step you connect the content you created earlier with typed relations
and query the resulting graph. You will link people to the articles they wrote,
let people follow each other, and then ask the graph who is most followed and
what is reachable from a given person.

All statements go through the SQL endpoint used in the previous steps:

```bash
curl -s -X POST localhost:8090/api/sql/docs-graph \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sql": "…"}'
```

## 1. Create the nodes

Use a workspace that allows the two node types. The `social:Person` and
`social:Article` types below have a `name`/`city` and a `title` property.

```sql
INSERT INTO 'social' (path, node_type, name, properties) VALUES
  ('/alice', 'social:Person', 'alice', '{"name":"Alice","city":"Zurich"}'::jsonb),
  ('/bob',   'social:Person', 'bob',   '{"name":"Bob","city":"Bern"}'::jsonb),
  ('/carol', 'social:Person', 'carol', '{"name":"Carol","city":"Zurich"}'::jsonb),
  ('/dave',  'social:Person', 'dave',  '{"name":"Dave","city":"Basel"}'::jsonb);

INSERT INTO 'social' (path, node_type, name, properties) VALUES
  ('/graph-intro',     'social:Article', 'graph-intro',     '{"title":"Graph Intro"}'::jsonb),
  ('/advanced-graphs', 'social:Article', 'advanced-graphs', '{"title":"Advanced Graphs"}'::jsonb);
```

## 2. Relate them

`RELATE` creates one directed edge. Both endpoints name their workspace.

```sql
RELATE FROM path='/bob'   IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/carol' IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/dave'  IN WORKSPACE 'social' TO path='/alice' IN WORKSPACE 'social' TYPE 'follows';
RELATE FROM path='/dave'  IN WORKSPACE 'social' TO path='/bob'   IN WORKSPACE 'social' TYPE 'follows' WEIGHT 2.5;

RELATE FROM path='/alice' IN WORKSPACE 'social' TO path='/graph-intro' IN WORKSPACE 'social' TYPE 'authored';
RELATE FROM path='/advanced-graphs' IN WORKSPACE 'social'
       TO   path='/graph-intro'     IN WORKSPACE 'social' TYPE 'references' WEIGHT 0.9;
```

Each statement answers `{"affected_rows": 1}`.

## 3. Query the graph

Who follows whom:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (a:Person)-[r:follows]->(b:Person)
  COLUMNS (a.name AS follower, b.name AS followed, r.weight AS weight)
);
```

```json
{"rows":[{"follower":"bob","followed":"alice","weight":null},
         {"follower":"carol","followed":"alice","weight":null},
         {"follower":"dave","followed":"bob","weight":2.5},
         {"follower":"dave","followed":"alice","weight":null}]}
```

Articles and their authors, reading the `title` property straight off the
node variable:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (p:Person)-[:authored]->(a:Article)
  COLUMNS (p.name AS author, a.title AS title)
);
-- alice, "Graph Intro"
```

Everything dave can reach in up to three hops:

```sql
SELECT DISTINCT reached FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->{1,3}(b:Person)
  WHERE a.path = '/dave'
  COLUMNS (b.name AS reached)
) AS g;
-- bob, alice
```

## 4. Rank people

Graph algorithm functions run inside `COLUMNS`. Use an outer `ORDER BY` to
sort the result:

```sql
SELECT * FROM GRAPH_TABLE(
  MATCH (n:Person)
  COLUMNS (n.name AS name, pageRank(n) AS rank, in_degree(n) AS followers)
) ORDER BY rank DESC;
```

```json
{"rows":[{"name":"alice","rank":0.274,"followers":3},
         {"name":"bob","rank":0.112,"followers":1},
         {"name":"dave","rank":0.079,"followers":0},
         {"name":"carol","rank":0.079,"followers":0}]}
```

## 5. Combine with document queries

`GRAPH_TABLE` is a table, so join it back to the workspace for any column the
pattern did not carry:

```sql
SELECT g.follower, s.properties->>'city' AS city
FROM GRAPH_TABLE(
  MATCH (a:Person)-[:follows]->(b:Person) WHERE b.path = '/alice'
  COLUMNS (a.name AS follower, a.id AS follower_id)
) AS g
JOIN 'social' s ON s.id = g.follower_id;
```

## 6. Remove an edge

```sql
UNRELATE FROM path='/dave' IN WORKSPACE 'social'
         TO   path='/bob'  IN WORKSPACE 'social' TYPE 'follows';
```

## What you learned

- `RELATE … TYPE … [WEIGHT …]` creates a directed edge; `UNRELATE` removes it.
- `GRAPH_TABLE(MATCH … WHERE … COLUMNS (…))` turns a pattern into rows.
- Node variables expose properties by name; edge variables expose
  `relation_type` and `weight`.
- Algorithms such as `pageRank(n)` run inside `COLUMNS`.

Next: [Branching workflow](./branching-workflow.md). For the full pattern
grammar see the [GRAPH_TABLE reference](/docs/reference/sql/graph/pgq).
