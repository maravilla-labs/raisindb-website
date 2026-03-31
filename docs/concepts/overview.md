---
sidebar_position: 1
---

# What is RaisinDB?

RaisinDB is a **multi-model database** that brings Git-like version control to structured content. It combines the flexibility of document databases with the rigor of schema-driven development, making it ideal for content management systems, collaborative platforms, and applications that need complete audit trails.

## The Core Idea

Think of RaisinDB as **"Git for your database"**. Every change to your data is tracked as a revision, stored with hybrid logical clock (HLC) timestamps. You can branch, merge, and time-travel through your content just like you do with code.

```sql
-- Query data as it existed yesterday
SET __revision = '2024-01-14T10:00:00Z';
SELECT * FROM articles WHERE author = 'Jane';

-- Create a feature branch
CREATE BRANCH new-feature FROM main;

-- Merge changes back
MERGE BRANCH new-feature INTO main;
```

## Multi-Model Architecture

RaisinDB supports multiple data models within a single system:

### 1. Document Model (Nodes)

Content is stored as **nodes** with hierarchical paths:

```sql
/content/blog/2024/my-first-post
/media/images/header.jpg
/config/site-settings
```

Each node has:
- A unique **path** (like a file in a directory)
- A **node_type** (schema definition)
- **properties** (JSON document with typed fields)
- **metadata** (created, updated, version flags)

### 2. Graph Model (Edges)

Nodes can have relationships using the RELATE statement:

```sql
-- Create a relationship using RELATE
RELATE FROM path='/content/blog/post1' TO path='/content/blog/post2' TYPE 'RELATED_TO';

-- Query relationships with GRAPH_TABLE (SQL/PGQ)
SELECT * FROM GRAPH_TABLE (
  default
  MATCH (a:Article)-[r:RELATED_TO]->(b:Article)
  COLUMNS (a.path AS source, b.path AS target)
);
```

### 3. Relational Model (SQL)

Every workspace is queryable as a SQL table:

```sql
-- Standard SQL queries work
SELECT properties->>'title' AS title,
       properties->>'author' AS author
FROM default
WHERE node_type = 'blog:Article'
  AND (properties->>'published')::boolean = true;
```

## Key Concepts

### Nodes

**Nodes** are the fundamental content units in RaisinDB. They're hierarchical documents with paths, types, and properties.

- **Path**: Unique identifier like `/content/blog/post1`
- **NodeType**: Schema definition (e.g., `blog:Article`)
- **Properties**: JSON document validated against the schema
- **Revisions**: Every change creates a new revision with HLC timestamp

Learn more: [Nodes](/docs/concepts/data-model/nodes)

### NodeTypes

**NodeTypes** define the schema for your content. They're like classes in object-oriented programming:

```yaml
name: blog:Article
properties:
  title:
    type: string
    required: true
  body:
    type: richtext
  published:
    type: boolean
```

NodeTypes support:
- **Inheritance** via `extend` (object-oriented style)
- **Composition** via `mixins` (trait-based)
- **Validation** (required fields, types, constraints)

Learn more: [NodeTypes](/docs/concepts/data-model/nodetypes)

### Workspaces

**Workspaces** provide logical isolation within a repository. They're like namespaces:

```sql
-- Query the 'default' workspace
SELECT * FROM default WHERE node_type = 'blog:Article';

-- Query the 'drafts' workspace
SELECT * FROM drafts WHERE author = 'Jane';
```

System workspaces:
- `default` - Primary content
- `raisin:system` - NodeType definitions, configuration
- `raisin:access_control` - Users, roles, permissions
- `functions` - Serverless JavaScript functions
- `packages` - Installed RAP packages

Learn more: [Workspaces](/docs/concepts/workspaces)

### Branches and Tags

Create isolated development branches:

```sql
-- Create a feature branch
CREATE BRANCH feature/redesign FROM main;

-- Work on the branch
SET BRANCH = 'feature/redesign';
UPDATE default SET properties = '{"status": "draft"}';

-- Tag important milestones
CREATE TAG v1.0 ON main AT HEAD;
```

Learn more: [Branches and Tags](/docs/concepts/versioning/branches-and-tags)

### Revisions

Every modification creates a revision with an HLC timestamp:

```sql
-- See revision history
SELECT __revision, __timestamp, properties->>'title'
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC;

-- Time-travel query
SET __revision = '2024-01-01T00:00:00Z';
```

Revisions enable:
- Complete audit trails
- Time-travel queries
- Conflict-free merges
- Event sourcing patterns

Learn more: [Revisions](/docs/concepts/versioning/revisions)

## PostgreSQL Compatibility

RaisinDB speaks the **PostgreSQL wire protocol**, so you can connect with any PostgreSQL client:

```bash
# psql
psql -h localhost -p 5432 -U admin -d myrepo

# TablePlus, DBeaver, pgAdmin, etc.
# Just use the standard PostgreSQL connection settings
```

Standard SQL works with extensions for:
- Graph queries (SQL/PGQ via GRAPH_TABLE)
- Full-text search (FTS)
- Vector similarity search
- Geospatial queries (PostGIS-compatible)

## REST API

Everything is accessible via HTTP:

```bash
# Get a node
curl http://localhost:8080/api/repository/blog/main/head/default/content/blog/post1

# Query with SQL
curl -X POST http://localhost:8080/api/repository/blog/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM default WHERE node_type = '\''blog:Article'\''"}'

# Create a branch
curl -X POST http://localhost:8080/api/repository/blog/branches \
  -d '{"name": "feature", "from": "main"}'
```

## Use Cases

RaisinDB excels at:

### Content Management Systems

- **Versioned content** with full audit trails
- **Editorial workflows** using branches (draft, review, publish)
- **Multi-site management** via workspaces
- **Rich media support** with typed properties

### Collaborative Platforms

- **Conflict-free collaboration** with merge capabilities
- **Per-user branches** for isolated workspaces
- **Role-based access control** built-in
- **Real-time sync** via WebSocket subscriptions

### Configuration Management

- **Infrastructure as data** with schema validation
- **Environment branching** (dev, staging, prod)
- **Rollback capabilities** via time-travel
- **Change auditing** with full revision history

### Knowledge Graphs

- **Hierarchical documents** with graph relationships
- **Schema-driven ontologies** via NodeTypes
- **GRAPH_TABLE queries** for relationship traversal
- **Graph algorithms** (PageRank, shortest path)

## Architecture Overview

```
┌─────────────────────────────────────────┐
│          Client Applications            │
│  (psql, REST, JavaScript SDK)           │
└─────────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    ▼                           ▼
┌─────────┐              ┌─────────────┐
│ pgwire  │              │  HTTP API   │
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
│ Nodes  │  │  Graph   │  │ Indexes  │
│(Docs)  │  │ (Edges)  │  │ (FTS/Vec)│
└────────┘  └──────────┘  └──────────┘
                  │
         ┌────────┴────────┐
         │ Version Storage │
         │ (HLC Revisions) │
         └─────────────────┘
```

## Data-Centric Application Design (DCAD)

RaisinDB is built around **Data-Centric Application Design (DCAD)** — a paradigm where your schema drives the entire application experience. Instead of hard-coding UI layouts and navigation, you define the structure in data and let your application interpret it dynamically.

The key insight: a single node can switch between archetypes (e.g., "Landing Page" to "Kanban Board") and the UI adapts instantly — no frontend deployment needed. This makes applications dynamically flexible for humans and natively readable for AI agents.

Learn more: [DCAD](/docs/concepts/dcad)

## What Makes RaisinDB Different?

| Feature | Traditional DB | RaisinDB |
|---------|---------------|----------|
| **Versioning** | Append-only logs | Git-like branching & merging |
| **Schema** | Fixed tables | Flexible NodeTypes with inheritance |
| **Queries** | SQL only | SQL + GRAPH_TABLE + REST |
| **History** | Manual audit tables | Built-in time-travel |
| **Collaboration** | Row locking | Branch-based workflows |
| **Structure** | Flat tables | Hierarchical paths + graph |

## Getting Started

Ready to dive in?

1. **[Quick Start Tutorial](/docs/tutorials/quickstart)** - Build your first app in 5 minutes
2. **[Data Model Concepts](/docs/concepts/data-model/nodes)** - Understand nodes and NodeTypes
3. **[Versioning Workflows](/docs/concepts/versioning/git-like-workflows)** - Master branching strategies

Or explore specific features:
- [Graph Model](/docs/concepts/graph-model)
- [Access Control](/docs/concepts/access-control)
- [SQL Reference](/docs/reference/sql/overview)
