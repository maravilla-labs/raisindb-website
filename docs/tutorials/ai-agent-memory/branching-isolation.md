---
sidebar_position: 1
title: "Tutorial: Branching for Agent Isolation"
description: Step-by-step tutorial on using RaisinDB branches to give AI agents isolated workspaces
---

# Branching for Agent Isolation

:::info Coming Soon
This tutorial is under development. Check back soon for a complete walkthrough.
:::

## What You'll Learn

This tutorial will walk you through using RaisinDB's git-like branching to give each AI agent an isolated workspace where it can read, write, and reason without interfering with other agents or production data.

## Planned Outline

1. **Prerequisites** — RaisinDB instance running, AI provider configured
2. **Create an agent branch** — branch from `main` to create an isolated workspace
3. **Agent writes findings** — store research results as nodes on the branch
4. **Commit agent work** — create immutable revisions with audit trail
5. **Inspect the branch** — query the agent's work before merging
6. **Merge to main** — bring the agent's findings into production
7. **Rollback if needed** — reset the branch HEAD to undo mistakes
8. **Clean up** — delete branches that are no longer needed

## Related Guides

- [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches) — conceptual guide
- [Embeddings and Vector Search](/docs/guides/ai/embeddings-and-vector-search) — vector search within branches
