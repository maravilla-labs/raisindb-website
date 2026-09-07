---
sidebar_position: 1
title: "Part 1: Install the App with the CLI"
---

# Part 1: Install the App with the CLI

**What you'll have at the end of this part:** the complete Shiftboard backend (workspace, seed data, tool functions, workflow, and two AI agents) installed into a repository on your RaisinDB server, with the demo users registered and the AI provider configured. Entirely from the command line, against a local or remote instance.

Shiftboard ships as an installable package in `examples/shiftboard/package/`:

```
package/
  manifest.yaml                      name, version, provides, workspace_patches
  workspaces/staffing.yaml           the staffing workspace + root structure
  content/staffing/shifts/*.yaml     seed shift nodes (sat-morning, sun-evening, ...)
  content/staffing/staff/*.yaml      seed staff nodes (anna, ben, cara, dave)
  content/functions/lib/shiftboard/  tool functions (.node.yaml + index.js each)
  content/functions/flows/fill-shift the durable workflow (Part 5)
  content/functions/agents/          the two raisin:AIAgent nodes (Parts 2 and 6)
  content/ai/agents/                 each agent's home folder (inbox, outbox, memory)
```

## 1. Authenticate

```bash
raisindb login --server http://localhost:8081 --username admin --password '...'
```

This stores the server URL and token in `.raisinrc` in your home directory. In CI, skip the stored login entirely. Environment variables win over `.raisinrc`:

```bash
export RAISINDB_SERVER=https://my-instance.example.com
export RAISINDB_TOKEN=eyJ...     # an admin/system token
export RAISINDB_REPO=shiftboard  # optional default for --repo
```

Point `--server` (or `RAISINDB_SERVER`) at any remote instance and every command below works unchanged.

## 2. Create the repository

```bash
raisindb repo create shiftboard --exists-ok
```

```
Repository 'shiftboard' created.
```

Repository creation also installs the builtin packages that the agents depend on. The `ai-tools` package brings the `raisin:AIAgent` node type, the `ai` workspace, the agent-handler function and the planning tools; `raisin-messaging` brings the delivery pipeline. They take a few seconds to land; `raisindb package list --repo shiftboard` shows them once installed.

## 3. Configure the AI provider

The agents run on Groq. The API key is tenant-level configuration and stays outside the package. Creating a new provider slug requires `--kind`; later updates to the same slug do not:

```bash
# Reads the key from stdin so it never lands in shell history or logs
raisindb ai provider set groq --kind groq --api-key-stdin --enabled \
  --model llama-3.3-70b-versatile

# Verify the live connection before spending any tokens
raisindb ai provider test groq
```

`--api-key-env GROQ_API_KEY` is the CI-friendly alternative to `--api-key-stdin`. `raisindb ai provider list --json` reports `has_api_key` and `enabled` per provider without ever printing the key.

## 4. Register the demo users

Identity users (logins) are not package content either. Register them explicitly:

```bash
raisindb user register planner@example.com \
  --password 'Planner12345!' --display-name Planner \
  --repo shiftboard --exists-ok
```

```
Identity user 'planner@example.com' created (repo: shiftboard, tenant: default).
```

Part 4 needs `anna@example.com` and `cara@example.com` (password `Staff12345!`) as well, so the agent can chat with them. All three are demo-only credentials.

## 5. Allow the frontend origin (CORS)

The SvelteKit dev server (Part 3) runs on port 5175:

```bash
raisindb cors add http://localhost:5175 --repo shiftboard
```

```
Origin 'http://localhost:5175' added to repo 'shiftboard' CORS allow-list.
```

## 6. Deploy the package

One command validates, builds the `.rap`, uploads it, installs it, and waits for a terminal state:

```bash
raisindb deploy ./package --repo shiftboard --install
```

```
Deploying shiftboard v1.3.0...
...
Package 'shiftboard-1.3.0' uploaded successfully!
Installing package 'shiftboard' in repository 'shiftboard' (branch: main)...
  status: installing
  status: installed
Package 'shiftboard' installed successfully!
Deployed shiftboard v1.3.0 successfully (installed).
```

`deploy` is an alias for `package deploy`. With `--install` the CLI polls the package until its `status` is `installed`, and prints the server's error detail if it becomes `failed`, so you do not script your own polling loop. Re-deploying an existing package applies it with `--mode sync` by default; `--mode skip` leaves existing content alone and `--mode overwrite` replaces it.

## The CI variant

The whole flow above is scripted in `examples/shiftboard/ci.sh`: auth from env, repo creation, deploy, user registration, a provider check, CORS, and the smoke test from Part 2:

```bash
RAISINDB_SERVER=http://localhost:8081 REPO=shiftboard ./ci.sh
```

The script fetches a system token with `RAISIN_USER` / `RAISIN_PASSWORD` when `RAISINDB_TOKEN` is not set, and `RUN_SMOKE=0` skips the Groq-spending smoke run. Its provider check is a good pattern for any pipeline; the key itself is never printed:

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

```
Packages in repository 'shiftboard':

  Name                          Version     Installed   Status
  ──────────────────────────────────────────────────────────────
  ai-tools                      1.0.21      ✓           installed
  raisin-messaging              1.0.3       ✓           installed
  shiftboard                    1.3.0       ✓           installed
  ...
```

The package's `manifest.yaml` declares what it provides:

```yaml
name: shiftboard
version: 1.3.0
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

workspace_patches:
  functions:
    allowed_node_types:
      add:
        - raisin:AIAgent
  ai:
    allowed_node_types:
      add:
        - raisin:Folder
```

The `workspace_patches` block extends two workspaces that other packages own: the `functions` workspace gets `raisin:AIAgent` as an allowed type so the agent nodes can live there, and the `ai` workspace accepts the agents' home folders.

A seed shift is just a node, `content/staffing/shifts/sat-morning.yaml`:

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

You can read it back over HTTP with the same token the CLI uses:

```bash
curl -s http://localhost:8081/api/repository/shiftboard/main/head/staffing/shifts/sat-morning \
  -H "Authorization: Bearer $RAISINDB_TOKEN"
```

```json
{
  "id": "DP4ki7s3E2RUOECMo9glW",
  "name": "sat-morning",
  "path": "/shifts/sat-morning",
  "node_type": "raisin:Node",
  "properties": {
    "title": "Saturday Morning", "day": "saturday", "start": "08:00", "end": "14:00",
    "location": "Terrace", "outdoor": true, "status": "open", "assignee": null
  },
  "workspace": "staffing",
  "version": 1,
  "created_by": "system",
  "...": "..."
}
```

That `assignee` / `status` pair is the entire data contract of the app. Every part of this tutorial (the agent's tools, the live board, the workflow) reads and writes exactly these properties.

**Next:** [Part 2: Chat with the agent + tools that act](./chat-and-tools)
