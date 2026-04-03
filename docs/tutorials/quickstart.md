---
sidebar_position: 1
---

# Quick Start

Get up and running with RaisinDB in under 10 minutes. You'll install the server, scaffold a project with AI agent support, and build your first content-driven app.

## Prerequisites

- Node.js (v18 or later) and npm
- An AI coding agent ([Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), or any agent that supports [Agent Skills](https://skills.sh))

## Step 1: Install the CLI & Start the Server

```bash
npm install -g @raisindb/cli
raisindb server start
```

The CLI downloads the right server binary for your platform and starts RaisinDB with:

- **Admin Console** at [http://localhost:8080/admin](http://localhost:8080/admin)
- **HTTP API** on port **8080**
- **PGWire** (PostgreSQL protocol) on port **5432**

On first start, you'll see the admin credentials in the terminal output. Log in to the admin console and change the password.

:::tip Alternative installation
Download binaries directly from [GitHub Releases](https://github.com/maravilla-labs/raisindb/releases) or [build from source](/docs/guides/installation#build-from-source).
:::

## Step 2: Login & Create a Repository

Authenticate with the server (opens your browser):

```bash
raisindb login
```

This saves your credentials to `.raisinrc` — all subsequent CLI commands (`deploy`, `sync`, `upload`) will use this authentication automatically.

Then in the admin console at [http://localhost:8080/admin](http://localhost:8080/admin):

1. Click **"Create Repository"**
2. Give it a name (e.g., `demo`) — remember this name, your frontend will use it

:::tip Remote servers
To connect to a remote server instead of localhost:
```bash
raisindb login --server https://my-raisindb.example.com
```
:::

## Step 3: Scaffold Your Project

```bash
raisindb package init my-app
```

This does three things automatically:
1. **Scaffolds** the project structure
2. **Runs `npm install`** — installs `@raisindb/functions-types` (TypeScript definitions for the server-side function runtime)
3. **Installs AI agent skills** via `npx skills add` — 10 skill files that teach your AI agent how to build RaisinDB apps

The resulting project:

```
my-app/
├── package.json          # npm scripts + @raisindb/functions-types
├── .gitignore
├── AGENT.md              # Instructions for AI agents
├── README.md
├── package/              # RaisinDB content package (YAML)
│   ├── manifest.yaml
│   ├── nodetypes/
│   ├── archetypes/
│   ├── elementtypes/
│   ├── workspaces/
│   └── content/
└── frontend/             # Your web app (SvelteKit or React)
```

The installed skills:

| Skill | What it teaches |
|-------|----------------|
| `raisindb-overview` | Core concepts, path-as-URL routing, project structure |
| `raisindb-content-modeling` | NodeTypes, Archetypes, ElementTypes in YAML |
| `raisindb-frontend-sveltekit` | SvelteKit frontend with dynamic routing |
| `raisindb-frontend-react` | React Router frontend with SSR |
| `raisindb-sql` | SQL queries, JSONB, hierarchy, graph |
| `raisindb-auth` | Login, register, anonymous access |
| `raisindb-translations` | Multi-language content |
| `raisindb-file-uploads` | File upload, thumbnails, signed URLs |
| `raisindb-functions-triggers` | Server-side functions and event triggers |
| `raisindb-access-control` | Roles, permissions, row-level security |

Skills use progressive loading — your agent only reads the ones relevant to the current task.

:::tip Adding skills to an existing project
If you have an existing project (or used `--skip-install`), install the skills manually:

```bash
npx skills add maravilla-labs/raisindb/packages/raisindb-skills
```

This works with any project — not just ones created with `raisindb package init`.
:::

## Step 4: Build with Your AI Agent

Open your project in your AI coding tool and start building. Here are example prompts:

### Define your content model

> "Create a blog with Article and Author node types. Articles should have a title, body, excerpt, featured image, and tags. Add a LandingPage archetype with Hero and TextBlock elements."

The agent will create YAML files in `package/nodetypes/`, `package/archetypes/`, and `package/elementtypes/`, then validate with `npm run validate`.

### Build the frontend

> "Create a SvelteKit frontend that renders pages from the content package using path-based routing. The repository name is `demo`."

The agent will scaffold the SvelteKit app in `frontend/`, set up the RaisinDB client with WebSocket connection, create component registries for archetypes and elements, and wire up the `[...slug]` route.

### Add authentication

> "Add login and register pages with anonymous access for public content."

### Deploy your content

```bash
npm run deploy              # Validate + build + upload to server
# or
npm run sync                # Live sync during development
```

## Available npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run validate` | Validate all YAML in `package/` |
| `npm run build` | Build `.rap` package file |
| `npm run deploy` | Validate + build + upload to server |
| `npm run sync` | Live sync package changes (watch mode) |
| `npm run dev` | Start frontend dev server |

## How It Works

RaisinDB apps follow a **content-to-component pipeline**:

```
NodeType (schema)  →  Archetype (page template)  →  ElementTypes (blocks)
      ↕                       ↕                           ↕
YAML in package/       Maps to Page Component      Maps to Element Components
```

1. **Content lives at paths** like `/workspace/home`, `/workspace/about`
2. **The frontend route** `/{slug}` queries `WHERE path = '/workspace/{slug}'`
3. **The archetype** on the node determines which page component renders it
4. **Elements** in `properties.content[]` map to inline block components

This means your URL structure IS your content structure. Add a page in YAML, it appears at that URL.

## Next Steps

- [Core Concepts](/docs/concepts/overview) — Understand the data model in depth
- [DCAD: Schema-Driven Apps](/docs/concepts/dcad) — How your schema defines your app
- [SQL Reference](/docs/reference/sql/overview) — Full query language reference
- [JavaScript Client](/docs/reference/javascript-client/overview) — SDK reference
- [Creating Packages](/docs/guides/packages/creating-packages) — Package format reference
