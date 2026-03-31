---
title: Mermaid diagrams
---

This page verifies Mermaid rendering.

```mermaid
flowchart LR
  A[Write docs] --> B{Build site}
  B -->|ok| C[Diagrams render]
  B -->|broken| D[Fix config]
```
