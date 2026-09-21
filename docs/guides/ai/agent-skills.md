---
sidebar_position: 7
title: Agent Skills
description: Teach agents procedures with raisin:Skill nodes — declared per agent, shared globally, added per workflow step, loaded on demand so prompts stay small
---

# Agent Skills

A skill is a procedure an agent can follow: how to build an automation, how to
write a refund email, how to triage a support ticket. It is a `raisin:Skill`
node — a name, a one-sentence description, and a Markdown body of
instructions.

Skills solve a specific problem. Everything you put in an agent's
`system_prompt` is sent on **every turn**, so an agent that has to know how to
do ten things carries ten procedures into every request, relevant or not.
With skills, the prompt carries only a short **index** — one line per skill,
its name and description — and the agent loads a skill's full body with the
`load-skill` tool when the task in front of it calls for it.

Skills follow the Agent Skills shape: `name` and `description` as frontmatter,
a Markdown body. A skill written for another tool that uses that shape reads
the same way here.

:::info Tools and skills
A **tool** lets an agent *do* something — it is a `raisin:Function` that runs.
A **skill** tells an agent *how* to do something — it is instructions the agent
reads. An agent usually needs both: a skill describing a procedure often names
the tools the procedure uses.
:::

## Write a skill

A skill is a node of type `raisin:Skill`, usually in the `functions`
workspace next to your agents:

```yaml
# functions workspace, /skills/refund-reply/.node.yaml
node_type: raisin:Skill
properties:
  name: refund-reply
  description: >
    How to answer a customer asking for a refund, including when to escalate.
  body: |
    ## Answering a refund request

    1. Look up the order with the `find-order` tool. Never quote an amount
       you have not read from the order.
    2. If the order is older than 30 days, do not promise a refund — create a
       task for a person instead.
    3. Otherwise confirm the amount and the refund method, and say how many
       working days it takes (5 for card, 10 for invoice).

    Keep the reply under 120 words. Match the customer's language.
```

| Property | Required | What it is |
|---|---|---|
| `name` | yes | Lowercase letters, digits and single hyphens (`refund-reply`), at most 64 characters. A skill whose name breaks this rule is ignored. |
| `description` | yes | One sentence saying what the skill is for. This is the **only** part of the skill the agent sees until it loads it, so write it for the model: say when to use it. Indexed, including fulltext. |
| `body` | — | The instructions, in Markdown. Never placed in the prompt; returned by `load-skill`. Fulltext-indexed. |
| `enabled` | — | Defaults to `true`. `false` makes the skill absent everywhere. |
| `license`, `metadata` | — | Optional, carried from the Agent Skills shape. |

:::note A skill cannot grant tools
The Agent Skills format has an `allowed-tools` key. RaisinDB deliberately does
not map it: loading a skill never widens what an agent is allowed to call. An
agent's tools are exactly its `tools:` list, whatever skills it reads.
:::

## Give skills to an agent

List skills on the agent with `skills:`, in exactly the reference shape
`tools:` already uses:

```yaml
# functions workspace, /agents/support/.node.yaml
node_type: raisin:AIAgent
properties:
  title: Support Assistant
  provider: openai
  model: gpt-4o
  system_prompt: You answer customer questions for Acme.
  tools:
    - raisin:ref: /lib/acme/find-order
      raisin:workspace: functions
  skills:
    - raisin:ref: /skills/refund-reply
      raisin:workspace: functions
    - raisin:ref: /skills/shipping-delay
      raisin:workspace: functions
```

The agent's prompt now ends with an index like this, placed after its
`system_prompt` and before its `## Rules`:

```text
## Skills
Load a skill with the load-skill tool before doing work its description covers; its instructions then apply.
- refund-reply — How to answer a customer asking for a refund, including when to escalate.
- shipping-delay — How to explain a late delivery and what compensation to offer.
```

and the `load-skill` tool is added to its tools automatically. When a customer
asks about a refund, the model calls `load-skill` with `{ "name":
"refund-reply" }`, reads the body, and follows it.

An agent with no skills — and no global skills — gets exactly the prompt it
had before skills existed, byte for byte. Adding skills to one agent changes
nothing for any other.

## Global skills

Some procedures every agent should know. Put those skills in a
conventional folder and every agent gets them without listing them:

| Location | Who writes it |
|---|---|
| `functions:/skills/<name>` | **Packages.** Skills a package ships for every agent. |
| `functions:/local/skills/<name>` | **The installation.** Your own skills, never overwritten by a package. |

The installation layer wins:

- A local skill with the **same name** as a package skill **replaces** it.
- A local skill with that name and `enabled: false` **hides** the package
  skill — that is how an installation switches one off.

An agent can opt out of global skills entirely:

```yaml
properties:
  global_skills: false   # only the skills in this agent's own skills: list
```

When the same name appears more than once, the first one wins, in this order:
the agent's own `skills:` (as listed), then a workflow step's `skills:`, then
installation globals, then package globals.

## How `load-skill` behaves

`load-skill` lives at `functions:/lib/raisin/ai/load-skill` and ships with the
built-in `ai-tools` package. It takes one argument, `name`.

```json
{ "success": true, "name": "refund-reply", "description": "…", "body": "## Answering a refund request …" }
```

It **only returns skills the calling agent was given** — its own, a step's,
and the globals it has not opted out of. Anything else is refused, and the
refusal says what is available so the model can correct itself:

```json
{ "success": false, "reason": "not_granted", "name": "payroll-export", "available": ["refund-reply", "shipping-delay"] }
```

Other refusals are `not_found`, `disabled`, and `no_grant` (the call carried no
context to decide from).

The grant is worked out by the server from the conversation or the workflow
step — never from anything the model puts in its arguments. Row-level security
still applies on top: an agent cannot load a skill it could not read.

## Skills in workflows

Workflow agent steps get their agent's skills automatically: an `ai_agent`
step, an `ai_sequence` container and a `chat` step see the same index and can
call `load-skill` exactly as the agent does in a conversation.

A step can also add skills **of its own**, for that step only:

```yaml
- id: draft-reply
  node_type: raisin:FlowStep
  properties:
    action: Draft the customer reply
    step_type: ai_agent
    agent_ref: /agents/support
    prompt: "Draft a reply to: {{ input.message }}"
    skills:
      - raisin:ref: /skills/holiday-tone
        raisin:workspace: functions
```

`holiday-tone` is available to this step and to no other use of
`/agents/support`. This lets one workflow teach an agent something specific to
that workflow without editing the agent.

Steps whose job is to return a structured decision — AI-routed `or`
containers, `competition` referees and agent-assigned human tasks — do not
receive the skills index. They cannot run tools, so an instruction to load a
skill would only get in the way of the decision they are asked for.

:::caution `ai_sequence` in explicit or hybrid tool mode
Skills work in an `ai_sequence` running in the default `tool_mode: auto`. In
`explicit` or `hybrid` mode a `load-skill` call is parked as a child step like
any other tool call, and it does not carry the step's grant — so it is refused
with `no_grant`. The skills are still listed in the index but cannot be opened.
Use `tool_mode: auto` for agents that rely on skills.
:::

## Ship skills in a package

A package ships a skill like any other node — a `.node.yaml` under
`content/functions/skills/<name>/`, which is where package global skills live.

You can also ship a skill as a `SKILL.md` file, the Agent Skills format:

```markdown
---
name: refund-reply
description: How to answer a customer asking for a refund, including when to escalate.
---

## Answering a refund request

1. Look up the order with the `find-order` tool. …
```

Put it at `content/functions/skills/refund-reply/SKILL.md`. The package
installer reads the frontmatter into the skill's properties and the rest into
`body`, and names the node after its **directory**. It refuses — rather than
installing something broken — when the frontmatter `name` does not match the
directory name, or when a directory holds both a `SKILL.md` and a
`.node.yaml`. Other files in the skill's directory (for example
`references/*.md`) install as its children.

:::note
`SKILL.md` is read by the package installer (`raisindb deploy --install`).
`raisindb sync` does not map it yet; use `.node.yaml` if you sync packages
rather than install them.
:::

## Limits

The index is kept small on purpose, because it is sent on every turn:

| Limit | Value | When exceeded |
|---|---|---|
| Skills listed in the index | 40 | Further skills are omitted and the index ends with `[index truncated: N more skills not listed]`; a warning is logged. |
| Index size | 6000 characters | Same as above. |
| Description shown in the index | 200 characters | Cut, ending in `…`. Whitespace is collapsed to single spaces. |
| Body returned by `load-skill` | 20000 characters | Cut, ending in `[truncated: first 20000 of N characters shown]`. |

A skill that is truncated out of the index is still **granted** — the agent can
load it by name. The index is a view; the grant is the full set.

## Find skills

Skills are ordinary nodes, so the usual queries work:

```sql
-- Every skill, with what it is for
SELECT path, properties->>'name' AS name, properties->>'description' AS description
FROM 'functions'
WHERE node_type = 'raisin:Skill';
```

Because `description` and `body` are fulltext-indexed, you can also search
skills by what they cover. See [Full-Text Search Functions](/docs/reference/sql/functions/fulltext-functions).

## Related

- [Agent Plans & Custom Tools](./agent-plans-and-tools) — the tools side of an agent.
- [AI Steps](../workflows/ai-steps) — using agents inside workflows.
- [Built-in Packages](../packages/builtin-packages) — what `ai-tools` provides.
