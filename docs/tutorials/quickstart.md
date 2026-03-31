---
sidebar_position: 1
---

# Quick Start

Get up and running with RaisinDB in under 10 minutes. You'll install the server, create a content schema as a RAP package, query data with SQL, and explore branching.

## Prerequisites

- Node.js (v18 or later) and npm
- Optional: `psql` (PostgreSQL client) for SQL queries

## Step 1: Install & Start

```bash
npm install -g @raisindb/cli
raisindb server start
```

The CLI automatically downloads the right server binary for your platform (macOS, Linux, or Windows) and starts it. RaisinDB is now running with:

- **HTTP API** on port **8080**
- **PGWire** (PostgreSQL protocol) on port **5432**
- **Admin Console** at [http://localhost:8080/admin](http://localhost:8080/admin) — log in with `admin` / `admin`

:::tip Alternative installation
You can also download binaries directly from [GitHub Releases](https://github.com/maravilla-labs/raisindb/releases) or [build from source](/docs/guides/installation#build-from-source).
:::

## Step 2: Create a RAP Package

A RAP (Raisin Archive Package) bundles everything RaisinDB needs: type definitions, workspace config, and seed content. It's like npm for your database schema.

Create a project directory with this structure:

```
my-project/
  manifest.yaml
  nodetypes/
    myapp_Article.yaml
    myapp_Author.yaml
  workspaces/
    content.yaml
  content/
    content/
      articles/
        welcome/
          node.yaml
          index.md
      authors/
        alice/
          node.yaml
```

### manifest.yaml

```yaml
name: my-project
version: 1.0.0
title: My Project
description: A starter project with articles and authors

provides:
  nodetypes:
    - myapp:Article
    - myapp:Author
  workspaces:
    - content
  content:
    - content/articles/welcome
    - content/authors/alice

workspace_patches:
  content:
    allowed_node_types:
      add:
        - myapp:Article
        - myapp:Author
```

### nodetypes/myapp_Article.yaml

```yaml
name: myapp:Article
description: A content article
properties:
  title:
    type: string
    required: true
  body:
    type: richtext
  author:
    type: string
  tags:
    type: array
    items:
      type: string
  published:
    type: boolean
    default: false
versionable: true
indexable: true
```

### nodetypes/myapp_Author.yaml

```yaml
name: myapp:Author
description: A content author
properties:
  name:
    type: string
    required: true
  bio:
    type: string
  email:
    type: string
    unique: true
```

### workspaces/content.yaml

```yaml
name: content
description: Main content workspace
allowed_node_types:
  - raisin:Folder
  - myapp:Article
  - myapp:Author
allowed_root_node_types:
  - raisin:Folder
```

### content/content/articles/welcome/node.yaml

```yaml
node_type: myapp:Article
properties:
  title: Welcome to RaisinDB
  author: Alice
  body: file:index.md
  published: true
  tags:
    - welcome
    - getting-started
```

### content/content/articles/welcome/index.md

```markdown
# Welcome to RaisinDB

RaisinDB is a multi-tenant content database with Git-like versioning,
SQL queries, and graph relationships — all in one package.
```

### content/content/authors/alice/node.yaml

```yaml
node_type: myapp:Author
properties:
  name: Alice
  bio: Technical writer and RaisinDB enthusiast.
  email: alice@example.com
```

:::tip What just happened?
A RAP package bundles everything RaisinDB needs: type definitions, workspace config, and seed content. It's like npm for your database schema.
:::

## Step 3: Install the Package

```bash
raisindb package install ./my-project
```

This registers the `myapp:Article` and `myapp:Author` node types, creates the `content` workspace, and imports the seed content — all in one step.

## Step 4: Query with SQL

Connect to RaisinDB using any PostgreSQL client:

```bash
psql -h localhost -p 5432 -U admin -d raisindb
```

**List all articles:**

```sql
SELECT path, properties->>'title'::String AS title
FROM 'content'
WHERE node_type = 'myapp:Article';
```

**Filter by author:**

```sql
SELECT * FROM 'content'
WHERE properties->>'author'::String = 'Alice';
```

**Create a relationship between author and article:**

```sql
RELATE FROM path='/content/authors/alice'
  TO path='/content/articles/welcome'
  TYPE 'AUTHORED';
```

**Query the graph:**

```sql
SELECT * FROM NEIGHBORS('/content/authors/alice', 'OUT', 'AUTHORED');
```

:::tip What just happened?
RaisinDB workspaces map to SQL tables. The `->>'key'::String` syntax extracts JSON properties. `RELATE` creates graph edges between nodes.
:::

## Step 5: Branch Your Data

Branches work like Git — create isolated environments for drafts, testing, or AI agent tasks, then merge when ready.

```sql
CREATE BRANCH draft FROM main;

-- Switch to the draft branch (reconnect or use SET)
INSERT INTO 'content' (path, node_type, properties)
VALUES ('/content/articles/second-post', 'myapp:Article',
  '{"title": "Draft Article", "author": "Alice", "published": false}');

-- Merge back to main when ready
MERGE BRANCH draft INTO main;
```

:::tip What just happened?
Branches work like Git. Create isolated workspaces for drafts, agent tasks, or A/B testing. Merge when ready.
:::

## Next Steps

- [Core Concepts](/docs/concepts/overview) — Understand the data model
- [DCAD: Schema-Driven Apps](/docs/concepts/dcad) — How your schema defines your app
- [AI Agent Memory](/docs/guides/ai/agent-memory-with-branches) — Use branches for AI agent isolation
- [SQL Reference](/docs/reference/sql/overview) — Full query language reference
- [RAP Package Format](/docs/guides/packages/creating-packages) — Build reusable packages
