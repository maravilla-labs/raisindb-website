---
sidebar_position: 1
---

# What is RaisinDB?

RaisinDB is a multi-model content database with Git-style version control. Content is stored as typed, hierarchical nodes; every write lands in a revision on a branch; and the same data can be read as documents, as a graph, or through SQL. It is built for content management systems, collaborative platforms, and any application whose data needs schemas, history and branching.

## The core idea

Think of a RaisinDB repository the way you think of a Git repository. It has branches (`main` by default), every change is recorded as a revision with a hybrid logical clock (HLC) timestamp, and you can read the repository as it was at any earlier revision.

```sql
-- Create a branch from main and merge it back later
CREATE BRANCH 'feature/x' FROM 'main';
MERGE BRANCH 'feature/x' INTO 'main';
```

```bash
# Read a node as it was at an earlier revision
curl http://localhost:8080/api/repository/myrepo/main/rev/1788719962117-0/site/home
```

## One store, three data models

### Documents (nodes)

Content lives in nodes. A node has a path, a NodeType, a JSON `properties` document, and metadata such as timestamps and authorship. Nodes are grouped into workspaces, and workspaces are grouped into a repository.

```json
{
  "id": "stDiLdkWBo80p57nft8_V",
  "name": "home",
  "path": "/home",
  "node_type": "dcad:Page",
  "archetype": "dcad:LandingPage",
  "properties": { "title": "Home", "slug": "home" },
  "version": 1,
  "created_at": "2026-09-06T18:39:02.665997Z",
  "updated_at": "2026-09-06T18:39:02.665997Z",
  "workspace": "site"
}
```

### Graph (relations)

Any two nodes can be linked with a typed relation, and relations are queried with the SQL/PGQ `GRAPH_TABLE` syntax.

```sql
RELATE FROM path='/home' IN WORKSPACE 'site'
    TO path='/about' IN WORKSPACE 'site'
  TYPE 'LINKS_TO';

SELECT * FROM GRAPH_TABLE(
  MATCH (a:`dcad:Page`)-[r:LINKS_TO]->(b)
  COLUMNS (a.path AS source, b.path AS target)
);
```

```json
{"columns":["source","target"],"rows":[{"source":"/home","target":"/about"}],"row_count":1}
```

### Relational (SQL)

Every workspace is a table. The workspace name is quoted, and JSON properties are read with `->>`.

```sql
SELECT path, node_type, archetype, properties->>'title' AS title
FROM 'site'
WHERE node_type = 'dcad:Page';
```

## Key concepts

### Nodes

A node is the unit of content. It is addressed by path within a workspace, validated against its NodeType, and versioned as part of the repository's revision history.

Learn more: [Nodes](/docs/concepts/data-model/nodes)

### NodeTypes

A NodeType is the schema for a family of nodes. It lists typed properties, which children are allowed, and behaviour flags such as `versionable`, `publishable` and `auditable`. NodeTypes can extend one parent and include mixins.

```yaml
name: blog:Article
description: A blog article
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: published_on
    type: Date
versionable: true
publishable: true
```

Learn more: [NodeTypes](/docs/concepts/data-model/nodetypes)

### Workspaces

A workspace is a named container of nodes inside a repository. It declares which NodeTypes it accepts, and it is the table name in SQL.

```sql
SELECT path FROM 'site' WHERE node_type = 'dcad:Page';
SELECT path FROM 'raisin:access_control' WHERE node_type = 'raisin:User';
```

Learn more: [Workspaces](/docs/concepts/workspaces)

### Branches, tags and revisions

Branches are created and merged with SQL or the management API. Each write on a branch produces a revision; the revision list records who changed which nodes, and any node can be read at any revision.

```sql
SHOW BRANCHES;
```

```json
{"columns":["name","head","protected","upstream","created_at","created_by"],
 "rows":[{"name":"main","head":"1788719820700-0","protected":false,"upstream":null,
          "created_at":"2026-09-06T18:32:41.493910+00:00","created_by":"system"}]}
```

Learn more: [Branches and Tags](/docs/concepts/versioning/branches-and-tags), [Revisions](/docs/concepts/versioning/revisions)

## Ways to connect

| Interface | Default port | Notes |
|---|---|---|
| HTTP REST + SQL | 8080 | `POST /api/sql/{repo}` runs SQL; `/api/repository/...` reads and writes nodes |
| WebSocket | 8080 (same server) | Real-time events and the JavaScript client |
| PostgreSQL wire protocol | 5432 | Connect with `psql` or any PostgreSQL client. The username is the tenant id, the database is the repository, and the password is an API key |

```bash
# Run SQL over HTTP
curl -X POST http://localhost:8080/api/sql/myrepo \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sql":"SELECT path FROM '"'"'site'"'"' LIMIT 5"}'

# Read a node by path
curl http://localhost:8080/api/repository/myrepo/main/head/site/home \
  -H "Authorization: Bearer $TOKEN"
```

SQL includes extensions for graph queries (`GRAPH_TABLE`), full-text and vector search, and geospatial predicates.

## Architecture

```
┌─────────────────────────────────────────┐
│          Client Applications            │
│  (psql, REST, JavaScript client)        │
└─────────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    ▼                           ▼
┌─────────┐              ┌─────────────┐
│ pgwire  │              │  HTTP / WS  │
│ (5432)  │              │   (8080)    │
└─────────┘              └─────────────┘
                  │
         ┌────────┴────────┐
         │  Query Engine   │
         │ (SQL, PGQ)      │
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│ Nodes  │  │Relations │  │ Indexes  │
│(Docs)  │  │ (Graph)  │  │ (FTS/Vec)│
└────────┘  └──────────┘  └──────────┘
                  │
         ┌────────┴────────┐
         │ Versioned store │
         │ (HLC revisions) │
         └─────────────────┘
```

## Data-Centric Application Design

RaisinDB separates a node's content from the description of how that content is structured and presented. A NodeType says what a node is; an archetype says which fields and which content elements a node of that type carries; element types describe the reusable blocks inside it. A frontend that reads these definitions can render any node without a code change when the definitions change.

Learn more: [DCAD](/docs/concepts/dcad)

## What makes RaisinDB different

| Feature | Traditional database | RaisinDB |
|---|---|---|
| Versioning | Append-only logs or audit tables | Branches, merges and per-revision reads |
| Schema | Fixed tables | NodeTypes with inheritance and mixins |
| Queries | SQL | SQL, `GRAPH_TABLE`, REST and WebSocket |
| Structure | Flat rows | Hierarchical paths plus typed relations |
| Presentation | Application code | Archetypes and element types stored with the data |

## Getting started

1. [Quick Start](/docs/tutorials/quickstart) builds a first application.
2. [Nodes](/docs/concepts/data-model/nodes) and [NodeTypes](/docs/concepts/data-model/nodetypes) explain the data model.
3. [Git-like workflows](/docs/concepts/versioning/git-like-workflows) covers branching strategies.

Or explore a specific area: [Graph Model](/docs/concepts/graph-model), [Access Control](/docs/concepts/access-control), [SQL Reference](/docs/reference/sql/overview).
