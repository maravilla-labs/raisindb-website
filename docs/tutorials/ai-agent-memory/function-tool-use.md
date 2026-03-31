---
sidebar_position: 3
title: "Tutorial: Function-Based Tool Use"
description: Step-by-step tutorial on writing serverless functions that AI agents can call as tools
---

# Function-Based Tool Use

:::info Coming Soon
This tutorial is under development. Check back soon for a complete walkthrough.
:::

## What You'll Learn

This tutorial will walk you through writing JavaScript functions that AI agents can invoke as tools, using the `raisin.*` API to read and write data, execute SQL, and call external services.

## Planned Outline

1. **Prerequisites** — RaisinDB instance running, basic familiarity with JavaScript
2. **Create a simple function** — write a handler that reads and returns a node
3. **Use raisin.nodes** — create, read, update, and delete nodes from a function
4. **Use raisin.sql** — execute SQL queries and process results
5. **Use raisin.http** — call an external API from a sandboxed function
6. **Use raisin.events** — emit events that trigger other functions
7. **Configure triggers** — set up event-based, HTTP, and schedule triggers
8. **Resource limits** — understand memory, time, and concurrency constraints
9. **Build an agent tool** — complete example of a function an AI agent calls to process messages and store findings

## Related Guides

- [Function-Based Tool Use](/docs/guides/ai/function-based-tool-use) — conceptual guide
- [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches) — combine functions with branches
