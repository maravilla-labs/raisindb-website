---
sidebar_position: 1
---

# Quick Start

Get up and running with RaisinDB in about ten minutes. You will install the CLI, start a local server, scaffold a project with AI agent support, and deploy your first content package.

## Prerequisites

- Node.js (v18 or later) and npm
- Optionally, an AI coding agent ([Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), or any agent that supports [Agent Skills](https://skills.sh))

## Step 1: Install the CLI and start the server

```bash
npm install -g @raisindb/cli
raisindb server start
```

The CLI downloads the server binary for your platform into `~/.raisindb/bin/`, verifies its checksum, and starts it in development mode. On the first start it generates an admin password and prints it once:

```
  RaisinDB v0.x  Development Mode

  HTTP         http://localhost:8080
  PgSQL        postgresql://localhost:5432
  Admin        http://localhost:8080/admin

  Username     admin
  Password     <generated>

  ! Save this password — it won't be shown again.
```

Data is stored in `./.data/rocksdb` under the directory you ran the command in. Useful follow-up commands: `raisindb server status`, `raisindb server logs`, `raisindb server stop`.

:::note PostgreSQL protocol
`raisindb server start` also enables the PostgreSQL wire listener on port 5432 (`--pgwire-port` to change it). Connect with `psql -h localhost -p 5432 -U default -d <repo>`, using an API key as the password. See [Connect via PostgreSQL](/docs/guides/connecting/pgwire).
:::

:::tip Alternative installation
Download binaries from [GitHub Releases](https://github.com/maravilla-labs/raisindb/releases) or [build from source](/docs/guides/installation#build-from-source).
:::

## Step 2: Log in and create a repository

Authenticate the CLI. With no options it opens a browser flow against `http://localhost:8080`; in a terminal-only environment pass the credentials directly:

```bash
raisindb login
# or, non-interactive:
raisindb login --username admin --password '<generated password>'
```

The token is saved to `.raisinrc`, so later commands (`deploy`, `sync`, `repo`) use it automatically.

Then create a repository. Its name is what your frontend and your SQL connections will refer to:

```bash
raisindb repo create demo
```

You can also do this from the admin console at [http://localhost:8080/admin](http://localhost:8080/admin) or with the HTTP API (`POST /api/repositories` with `{"repo_id":"demo"}`).

:::tip Remote servers
```bash
raisindb login --server https://my-raisindb.example.com
```
:::

## Step 3: Scaffold your project

```bash
raisindb package init my-app
```

This does three things:

1. **Scaffolds** the project structure (below).
2. **Runs `npm install`**, which installs `@raisindb/functions-types` (TypeScript definitions for the server-side function runtime).
3. **Installs AI agent skills** with `npx skills add maravilla-labs/raisindb/packages/raisindb-skills`.

Pass `--skip-install` to do only the first step.

The resulting project:

```
my-app/
├── package.json          # npm scripts + @raisindb/functions-types
├── AGENT.md, CLAUDE.md, GEMINI.md   # instructions for AI agents
├── README.md
├── package/              # RaisinDB content package (YAML)
│   ├── manifest.yaml
│   ├── nodetypes/
│   ├── mixins/
│   ├── archetypes/
│   ├── elementtypes/
│   ├── workspaces/
│   ├── content/
│   └── static/
└── frontend/             # your web app goes here
```

The installed skills cover content modeling, SQL, SvelteKit and React frontends, auth, access control, translations, file uploads, functions and triggers, workflows, MCP servers and widgets, messaging agents, branch workflows, and virtual-mount adapters. Agents load only the skills relevant to the task at hand.

:::tip Adding skills to an existing project
```bash
npx skills add maravilla-labs/raisindb/packages/raisindb-skills
```
:::

## Step 4: Build with your AI agent

Open the project in your AI coding tool and describe what you want. Example prompts:

### Define your content model

> "Create a blog with Article and Author node types. Articles should have a title, body, excerpt, featured image, and tags. Add a LandingPage archetype with Hero and TextBlock elements."

The agent creates YAML files in `package/nodetypes/`, `package/archetypes/`, and `package/elementtypes/`, then validates them with `npm run validate`.

### Build the frontend

> "Create a SvelteKit frontend that renders pages from the content package using path-based routing. The repository name is `demo`."

### Add authentication

> "Add login and register pages with anonymous access for public content."

### Deploy your content

```bash
npm run deploy              # validate + build + upload to the server
# or
npm run sync                # watch the package directory and sync changes
```

## Available npm scripts

| Script | Runs |
|--------|------|
| `npm run validate` | `raisindb package create ./package --check` |
| `npm run build` | `raisindb package create ./package` (builds the `.rap` file) |
| `npm run deploy` | `raisindb package deploy ./package` |
| `npm run sync` | `raisindb package sync . --watch` inside `package/` |
| `npm run dev` | `npm run dev` inside `frontend/` |

## How it works

RaisinDB apps follow a **content-to-component pipeline**:

```
NodeType (schema)  →  Archetype (page template)  →  ElementTypes (blocks)
      ↕                       ↕                           ↕
YAML in package/       maps to a page component    map to element components
```

1. **Content lives at paths** such as `/home` and `/about` inside a workspace.
2. **The frontend route** `/{slug}` queries `WHERE path = '/{slug}'` in that workspace.
3. **The archetype** on the node decides which page component renders it.
4. **Elements** in `properties.content[]` map to block components.

Your URL structure is your content structure: add a page to the package and it appears at that URL.

## Next steps

- [Core Concepts](/docs/concepts/overview): the data model in depth
- [DCAD: Schema-Driven Apps](/docs/concepts/dcad): how your schema defines your app
- [SQL Reference](/docs/reference/sql/overview): the query language
- [JavaScript Client](/docs/reference/javascript-client/overview): SDK reference
- [Creating Packages](/docs/guides/packages/creating-packages): the package format
