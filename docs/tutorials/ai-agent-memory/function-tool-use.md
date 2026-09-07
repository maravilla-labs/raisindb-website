---
sidebar_position: 3
title: "Tutorial: Function-Based Tool Use"
description: Step-by-step tutorial on writing serverless functions that AI agents can call as tools
---

# Function-Based Tool Use

:::info Coming Soon
This tutorial is under development. Check back soon for a complete walkthrough.
:::

## What you'll learn

This tutorial will walk you through writing JavaScript functions that AI agents
can invoke as tools, using the `raisin.*` API to read and write data, run SQL,
and call external services.

## Planned outline

1. **Prerequisites**: a running RaisinDB server and basic JavaScript
2. **Create a function**: scaffold one with `raisindb create function`, write a handler that reads and returns a node, and deploy it
3. **Use raisin.nodes**: create, read, update and delete nodes from a function
4. **Use raisin.sql**: run queries with bound parameters and process the rows
5. **Use raisin.http**: call an external API under a `network_policy`
6. **Use raisin.events**: emit events that other functions react to
7. **Configure triggers**: node event, schedule and HTTP triggers
8. **Resource limits**: memory, time and concurrency
9. **Build an agent tool**: describe the function with an `input_schema`, add it to an agent's `tools`, and watch the agent call it

## Related guides

- [Function-Based Tool Use](/docs/guides/ai/function-based-tool-use): the concepts
- [Creating Functions](/docs/guides/functions/creating-functions): the mechanics
- [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches): combine functions with branches
