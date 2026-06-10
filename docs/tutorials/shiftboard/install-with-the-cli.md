---
sidebar_position: 1
title: "Part 1: Install the App with the CLI"
---

# Part 1: Install the App with the CLI

**What you'll have at the end of this part:** the complete Shiftboard backend — workspace, seed data, tool functions, workflow, and AI agent — installed into a repository on your RaisinDB server, with a demo user registered and the AI provider configured. Entirely from the command line, against a local or remote instance.

Shiftboard ships as an installable package in `examples/shiftboard/package/`:

```
package/
  manifest.yaml                      name, version, provides, workspace_patches
  workspaces/staffing.yaml           the staffing workspace + root structure
  content/staffing/shifts/*.yaml     seed shift nodes (sat-morning, sun-evening, …)
  content/staffing/staff/*.yaml      seed staff nodes (anna, ben, cara, dave)
  content/functions/lib/shiftboard/  tool functions (.node.yaml + index.js each)
  content/functions/flows/fill-shift the durable workflow (Part 5)
  content/functions/agents/          the raisin:AIAgent node (Part 2)
  content/ai/agents/shift-planner/   the agent's home folder (inbox/outbox)
```

## 1. Authenticate

```bash
raisindb login --server http://localhost:8081 --username admin --password '...'
```

This stores the token in `.raisinrc`. In CI, skip the stored login entirely — environment variables win over `.raisinrc`:

```bash
export RAISINDB_SERVER=https://my-instance.example.com
export RAISINDB_TOKEN=eyJ...     # an admin/system token
```

Point `--server` (or `RAISINDB_SERVER`) at any remote instance and every command below works unchanged.

## 2. Create the repository

```bash
raisindb repo create shiftboard --exists-ok
```

Repository creation also auto-installs the builtin packages (`messaging`, `ai-tools`) that the agent depends on — the agent-handler function and the `ai` workspace come from there.

## 3. Configure the AI provider

The agent runs on Groq. The API key is **tenant-level configuration**, deliberately outside the package (secrets never belong in packages):

```bash
# Reads the key from stdin so it never lands in shell history or logs
raisindb ai provider set groq --api-key-stdin --enabled \
  --model llama-3.3-70b-versatile

# Verify the live connection before spending any tokens
raisindb ai provider test groq
```

`--api-key-env GROQ_API_KEY` is the CI-friendly alternative.

## 4. Register the demo users

Identity users (logins) are not package content either — register them explicitly:

```bash
raisindb user register planner@example.com \
  --password 'Planner12345!' --display-name Planner \
  --repo shiftboard --exists-ok
```

In Part 4 you'll also register `anna@example.com` and `cara@example.com` (password `Staff12345!`) so the agent can chat with them. All three are demo-only credentials.

## 5. Allow the frontend origin (CORS)

The SvelteKit dev server (Part 3) runs on port 5175:

```bash
raisindb cors add http://localhost:5175 --repo shiftboard
```

## 6. Deploy the package

One command validates, builds the `.rap`, uploads, installs, and polls to a terminal state:

```bash
raisindb deploy ./package --repo shiftboard --install
```

The install lifecycle is visible in `raisindb package list --repo shiftboard` and on the `raisin:Package` node's `status` property:

```
processing → uploaded → installing → installed   (or: failed)
```

`deploy --install` waits for `installed` and prints the error detail on `failed` — you don't script your own polling loop.

## The CI variant

The whole flow above is scripted in `examples/shiftboard/ci.sh` — auth from env, repo creation, deploy, user registration, a provider check, CORS, and a smoke test:

```bash
RAISINDB_SERVER=http://localhost:8081 REPO=shiftboard ./ci.sh
```

An excerpt of the provider check it runs (the key itself is never printed):

```bash
raisindb ai provider list --tenant "$RAISIN_TENANT" --json | python3 -c '
import sys, json
providers = json.load(sys.stdin)
groq = [p for p in providers if p.get("provider") == "groq"]
ok = groq and groq[0].get("has_api_key") and groq[0].get("enabled")
sys.exit(0 if ok else 1)
'
```

## What just got installed?

Check the repo:

```bash
raisindb package list --repo shiftboard
```

The package's `manifest.yaml` declares what it provides:

```yaml
name: shiftboard
version: 1.2.0
provides:
  workspaces:
    - staffing
  functions:
    - /lib/shiftboard/list-shifts
    - /lib/shiftboard/list-staff
    - /lib/shiftboard/assign-shift
    - /lib/shiftboard/message-staff
    - /lib/shiftboard/pick-candidates
    - /lib/shiftboard/resolve-accepter
    - /lib/shiftboard/start-shift-fill
  flows:
    - /flows/fill-shift
```

A seed shift is just a node — `content/staffing/shifts/sat-morning.yaml`:

```yaml
node_type: raisin:Node
properties:
  title: Saturday Morning
  day: saturday
  start: "08:00"
  end: "14:00"
  location: Terrace
  outdoor: true
  status: open
  assignee: null
```

That `assignee` / `status` pair is the entire data contract of the app. Every part of this tutorial — the agent's tools, the live board, the workflow — reads and writes exactly these properties.

**Next:** [Part 2 — Chat with the agent + tools that act](./chat-and-tools)
