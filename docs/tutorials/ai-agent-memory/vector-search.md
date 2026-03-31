---
sidebar_position: 2
title: "Tutorial: Semantic Search with Embeddings"
description: Step-by-step tutorial on configuring embeddings and running vector similarity searches in RaisinDB
---

# Semantic Search with Embeddings

:::info Coming Soon
This tutorial is under development. Check back soon for a complete walkthrough.
:::

## What You'll Learn

This tutorial will walk you through configuring automatic embedding generation and running vector similarity searches using RaisinDB's built-in HNSW index and SQL extensions.

## Planned Outline

1. **Prerequisites** — RaisinDB instance running, OpenAI or Ollama configured
2. **Configure an embedding provider** — set up API keys and model selection
3. **Create nodes with content** — insert documents that will be auto-embedded
4. **Verify embeddings** — confirm vectors were generated via the job system
5. **Run a basic vector search** — use `VECTOR_SEARCH()` in SQL
6. **Interpret distance scores** — understand cosine distance results
7. **Hybrid search** — combine vector search with property and path filters
8. **KNN with node type filtering** — restrict search to specific content types
9. **Search modes** — compare Documents vs. Chunks mode

## Related Guides

- [Embeddings and Vector Search](/docs/guides/ai/embeddings-and-vector-search) — conceptual guide
- [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration) — provider setup
