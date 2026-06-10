---
sidebar_position: 0
title: Shiftboard — Build an AI-Powered App on RaisinDB
---

# Shiftboard — Build an AI-Powered App on RaisinDB

This is the flagship RaisinDB tutorial. You will install and dissect **Shiftboard**, a complete working app: a cafe manager plans weekend shifts on a live board and chats with an AI agent that reads and updates the same data through tools — and, when asked, coordinates with the staff directly or starts a durable workflow.

Everything in this tutorial is a real, running example. The full source lives in the RaisinDB repository under `examples/shiftboard/`.

## What you'll build

- A **weekend shift board** — shifts and staff are plain nodes in a `staffing` workspace, installed from a package.
- An **AI planning agent** (`/agents/shift-planner`) that chats with the manager, calls tool functions (`list-shifts`, `assign-shift`, …), and updates the board you're looking at.
- A **server-side rendered SvelteKit frontend** with cookie auth, a live board over WebSocket node subscriptions, and inbox notifications.
- **Agent-to-staff coordination over chat** — the agent asks staff members themselves, handles declines, and only assigns after someone confirms.
- The **same coordination as a durable workflow** — inbox approval tasks with accept/decline buttons, deadlines, and a full audit trail, started by the agent on request.

Chat, board, notifications, and human tasks are all just **nodes and node events**. That is the whole architectural idea, and you will see it pay off in every part.

## Prerequisites

- A **running RaisinDB server** — local (`raisindb server start`) or any remote instance. The tutorial works identically against both.
- The **`raisindb` CLI** (Node 20+): `npm install -g @raisindb/cli`
- **Node.js 20+** for the frontend and test scripts.
- An **AI provider API key** — the example agent uses Groq (`llama-3.3-70b-versatile`), so a [Groq](https://groq.com) key is the fastest path. Any configured provider works; see [AI Provider Configuration](/docs/guides/ai/ai-provider-configuration).

:::info Demo credentials
The tutorial uses demo-only accounts throughout: manager `planner@example.com` / `Planner12345!`, staff `anna@example.com` and `cara@example.com` / `Staff12345!`. They are registered by you in Part 1 — don't reuse them anywhere real.
:::

## The parts

The tutorial is progressive: data and CLI basics first, then chat and tools, then the app, then multi-user coordination, and durable workflows **last**.

| Part | What you'll do |
|------|----------------|
| [1. Install the app with the CLI](./install-with-the-cli) | Log in, create a repo, configure the AI provider, deploy the package, register users — local or remote, scriptable for CI |
| [2. Chat with the agent + tools that act](./chat-and-tools) | The agent definition, tool functions with JSON schemas, the function-runtime SQL trap, token accounting |
| [3. A real app: SSR, live board, inbox notifications](./ssr-live-board) | SvelteKit SSR over HTTP, WebSocket node subscriptions, the notification bell, the live dev loop |
| [4. The agent coordinates your staff](./agent-coordination) | The agent messages real staff users, handles a decline, assigns on confirmation — and one honest lesson about chat-only coordination |
| [5. Same scenario as a durable workflow](./durable-workflow) | The `/flows/fill-shift` flow, inbox tasks as nodes, the in-app task panel, and how the agent starts workflows |
