---
sidebar_position: 2
---

# 2. Install & Query

:::note Coming Soon
This tutorial is under development. See the [Quick Start](/docs/tutorials/quickstart) for installation basics and the [Common Query Patterns](/docs/guides/querying/common-query-patterns) cookbook for SQL recipes.
:::

## What you'll learn

- Installing a RAP package into a running RaisinDB instance with `raisindb package deploy ./package -r <repo> --install`
- Querying content with SQL over `psql` (`SELECT ... FROM '<workspace>'`)
- Filtering by JSON properties with the `properties->>'key'::String = ...` form
- Navigating hierarchical paths with `CHILD_OF`, `DESCENDANT_OF`, `PATH_STARTS_WITH(path, ...)` and `DEPTH(path)`
