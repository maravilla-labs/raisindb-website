# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the documentation website for RaisinDB, a multi-model database with git-like version control. Built with Docusaurus 3.9.2 and React 19.

## Common Commands

```bash
# Install dependencies
yarn

# Start development server (hot reload)
yarn start

# Production build
yarn build

# Serve production build locally
yarn serve

# Type checking
yarn typecheck

# Clear Docusaurus cache (useful for troubleshooting)
yarn clear
```

## Architecture

### Documentation Structure (Diataxis Framework)

The docs follow the [Diataxis framework](https://diataxis.fr) with three navigation sections configured in `sidebars.ts`:

- **Tutorials** (`tutorialsSidebar`) - Learning-oriented, step-by-step guides for beginners
- **Docs** (`docsSidebar`) - Concepts (understanding/background) and Guides (how-to/task-oriented)
- **Reference** (`referenceSidebar`) - Information-oriented, factual lookups (SQL, HTTP API, CLI)

### Key Configuration Files

- `docusaurus.config.ts` - Main Docusaurus config (site metadata, navbar, footer, theme)
- `sidebars.ts` - Sidebar navigation structure for all three doc sections
- `src/css/custom.css` - Global CSS customizations

### Directory Layout

- `docs/` - Markdown documentation files organized by category
  - `tutorials/` - Quickstart and learning tutorials
  - `concepts/` - Data model, versioning, workspaces explanations
  - `guides/` - How-to guides for specific tasks
  - `reference/` - SQL, HTTP API, CLI, JavaScript client reference
- `src/pages/` - Custom React pages (homepage at `index.tsx`)
- `src/components/` - Reusable React components
- `static/img/` - Static images and assets

### Features Enabled

- Mermaid diagrams via `@docusaurus/theme-mermaid` (use fenced \`\`\`mermaid blocks)
- Syntax highlighting for: bash, sql, json, yaml, typescript, javascript, rust
- Dark mode (default) with system preference respect
- Doc versioning configured (current version: 0.1.0)
- Inter font from Google Fonts
