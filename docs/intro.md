---
sidebar_position: 1
slug: /
---

# Welcome to RaisinDB

**RaisinDB** is a multi-model database that combines the flexibility of document storage with the power of Git-like versioning. Build content-rich applications with schema-driven development, graph relationships, and full revision history.

## Why RaisinDB?

- **Git-like Version Control**: Every change is tracked. Branch, merge, and time-travel through your data.
- **Schema-Driven Development**: Define NodeTypes with strong typing, validation, and inheritance.
- **Multi-Model Queries**: Use SQL, GRAPH_TABLE (SQL/PGQ), or REST API to query documents, graphs, and full-text search.
- **PostgreSQL Compatible**: Connect with any PostgreSQL client using the pgwire protocol.
- **DCAD (Data-Centric Application Design)**: Let your schema drive the UI. Archetypes map data to UX patterns — change the archetype, transform the interface.
- **Authentication & RBAC**: Pluggable auth strategies (Local, OIDC, API Key), workspace-scoped roles, and row-level security built in.

## Quick Links

<div className="row">
  <div className="col col--4">
    <div className="card margin-bottom--lg">
      <div className="card__header">
        <h3>Get Started</h3>
      </div>
      <div className="card__body">
        <p>Set up RaisinDB and create your first content model in 5 minutes.</p>
      </div>
      <div className="card__footer">
        <a className="button button--primary" href="/docs/tutorials/quickstart">Quick Start Guide</a>
      </div>
    </div>
  </div>
  <div className="col col--4">
    <div className="card margin-bottom--lg">
      <div className="card__header">
        <h3>Core Concepts</h3>
      </div>
      <div className="card__body">
        <p>Understand nodes, NodeTypes, archetypes, and the data model.</p>
      </div>
      <div className="card__footer">
        <a className="button button--secondary" href="/docs/concepts/overview">Learn Concepts</a>
      </div>
    </div>
  </div>
  <div className="col col--4">
    <div className="card margin-bottom--lg">
      <div className="card__header">
        <h3>AI & Agents</h3>
      </div>
      <div className="card__body">
        <p>Use branching memory, vector search, and RAG patterns with AI agents.</p>
      </div>
      <div className="card__footer">
        <a className="button button--secondary" href="/docs/guides/ai/agent-memory-with-branches">AI Guide</a>
      </div>
    </div>
  </div>
</div>

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **Nodes & NodeTypes** | Hierarchical content with schema definitions |
| **Branching** | Git-like branches for parallel development |
| **SQL Interface** | PostgreSQL-compatible queries with extensions |
| **Graph Queries** | SQL/PGQ (GRAPH_TABLE) for relationship traversal |
| **Full-Text Search** | Tantivy-powered search with relevance ranking |
| **Vector Search** | Semantic similarity with embeddings |
| **Geospatial** | PostGIS-compatible location queries |
| **Serverless Functions** | JavaScript functions and triggers |
| **RAP Packages** | Installable extensions and content packages |
| **DCAD** | Data-centric application design with archetypes and element types |
| **Authentication & RBAC** | Pluggable auth, workspace-scoped roles, row-level security |

## Connect Your Way

```bash
# PostgreSQL wire protocol (psql, any PostgreSQL client)
psql -h localhost -p 5432 -U admin -d myrepo

# HTTP REST API
curl http://localhost:8080/api/repository/myrepo/main/head/default/

# JavaScript Client
import { RaisinClient } from '@raisindb/client';
const client = new RaisinClient('ws://localhost:8080');
```

## Documentation Structure

This documentation follows the [Diataxis](https://diataxis.fr) framework:

- **[Tutorials](/docs/tutorials/quickstart)** - Learning-oriented guides to get you started
- **[Concepts](/docs/concepts/overview)** - Understanding how RaisinDB works
- **[Guides](/docs/guides/installation)** - How-to guides for specific tasks
- **[Reference](/docs/reference/sql/overview)** - Technical reference for SQL, APIs, and CLI

### Additional Resources

- **[AI & Agent Guides](/docs/guides/ai/agent-memory-with-branches)** - Branching memory, vector search, RAG patterns
- **[Auth & RBAC Guides](/docs/guides/auth/authentication-setup)** - Authentication setup, roles, row-level security
- **[DCAD Concepts](/docs/concepts/dcad)** - Data-centric application design

---

Ready to dive in? Start with the [Quick Start Tutorial](/docs/tutorials/quickstart).
