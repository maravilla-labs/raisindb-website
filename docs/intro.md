---
sidebar_position: 1
slug: /
---

# Welcome to RaisinDB

**RaisinDB** is a multi-model content database. Documents live as nodes in a path hierarchy, every change is recorded as a revision, and you can query the same data with SQL, graph queries, full-text search, or the REST and WebSocket APIs.

## Why RaisinDB?

- **Version control built in**: every write is a revision. Branch, merge, and read data as it was at any earlier revision.
- **Schema-driven development**: define NodeTypes with typed properties, validation, and inheritance.
- **Multi-model queries**: SQL, GRAPH_TABLE (SQL/PGQ), full-text and vector search, and a REST API over the same nodes.
- **PostgreSQL wire protocol**: connect with `psql` or any PostgreSQL driver.
- **DCAD (Data-Centric Application Design)**: archetypes and element types describe how content maps to UI, so the schema drives the app.
- **Authentication and RBAC**: admin users, end-user identities (password, magic link, OIDC), workspace-scoped roles, and row-level security.

## Quick Links

<div className="row">
  <div className="col col--4">
    <div className="card margin-bottom--lg">
      <div className="card__header">
        <h3>Get Started</h3>
      </div>
      <div className="card__body">
        <p>Install the CLI, start a server, and scaffold a project.</p>
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
| **Branching** | Git-like branches for parallel work and publishing |
| **SQL Interface** | SQL over workspaces, with JSON property operators and hierarchy predicates |
| **Graph Queries** | SQL/PGQ (GRAPH_TABLE) for relationship traversal |
| **Full-Text Search** | Tantivy-powered search with relevance ranking |
| **Vector Search** | Semantic similarity with embeddings |
| **Geospatial** | Location queries over geometry properties |
| **Serverless Functions** | JavaScript, Starlark, and WebAssembly functions with triggers |
| **RAP Packages** | Installable content and schema packages |
| **DCAD** | Data-centric application design with archetypes and element types |
| **Authentication & RBAC** | Admin and identity auth, workspace-scoped roles, row-level security |

## Connect Your Way

```bash
# PostgreSQL wire protocol: user = tenant, database = repository, password = API key
psql -h localhost -p 5432 -U default -d myrepo

# HTTP REST API
curl http://localhost:8080/api/repository/myrepo/main/head/default/ \
  -H "Authorization: Bearer $TOKEN"
```

```typescript
// JavaScript client
import { RaisinClient } from '@raisindb/client';
const client = new RaisinClient('ws://localhost:8080', { repository: 'myrepo' });
```

## Documentation Structure

This documentation follows the [Diataxis](https://diataxis.fr) framework:

- **[Tutorials](/docs/tutorials/quickstart)**: learning-oriented, step by step
- **[Concepts](/docs/concepts/overview)**: how RaisinDB works
- **[Guides](/docs/guides/installation)**: how to do specific tasks
- **[Reference](/docs/reference/sql/overview)**: lookup for SQL, APIs, and the CLI

### Additional Resources

- **[AI & Agent Guides](/docs/guides/ai/agent-memory-with-branches)**: branching memory, vector search, RAG patterns
- **[Auth & RBAC Guides](/docs/guides/auth/authentication-setup)**: authentication setup, roles, row-level security
- **[DCAD Concepts](/docs/concepts/dcad)**: data-centric application design

---

Ready to dive in? Start with the [Quick Start Tutorial](/docs/tutorials/quickstart).
