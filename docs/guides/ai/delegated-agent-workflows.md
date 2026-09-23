---
sidebar_position: 7
title: Delegated Agent Workflows
description: Let a coordinating agent hand bounded work to other agents as durable child runs — typed objectives, narrowed tools and writes, acceptance checks, waiting, steering and interrupting.
---

# Delegated Agent Workflows

A coordinating agent can hand a bounded piece of work to another installed
agent. The helper runs as a **child run**: a durable
[agent run](../../concepts/agent-runs.md) of its own, with a typed objective,
only the tools and write subtrees it was given, and budgets carved out of the
coordinator's. When it ends, its result lands in the coordinator's durable
mailbox and completes the coordinator's waiting tool call. Nothing polls, and
a server restart in the middle loses nothing. See
[Agent Delegation](../../concepts/agent-delegation.md) for how this works in
core.

Delegation is not the same as creating a new agent: the coordinator normally
selects an existing `raisin:AIAgent` under `/agents`, or runs a worker copy of
itself. Create another durable agent only when the system needs a reusable role
with its own instructions and tools.

Delegation works only inside a run, which every conversation with an agent is.

## Give a coordinator the delegation tools

```yaml
node_type: raisin:AIAgent
properties:
  title: Project coordinator
  tools:
    - raisin:ref: /lib/raisin/ai/spawn-agent
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/wait-for-agents
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/inspect-agent
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/message-agent
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/interrupt-agent
      raisin:workspace: functions
  delegation:
    max_depth: 1            # children may not delegate further (0-2, default 1)
    max_parallel: 2         # children working at once (1-4, default 2)
    max_children: 6         # children per run (1-12, default 6)
    allowed_agents: [/agents/researcher, /agents/content-reviewer]
```

The `delegation` block is optional; without it the defaults above apply and
any installed agent may be spawned.

## The tools

### `spawn-agent`

Starts a child and returns its id at once; the child works in the background.

| Argument | Meaning |
|---|---|
| `agent_ref` | Installed agent to run, such as `/agents/researcher`. Omit it to run a worker copy of the caller. |
| `key` | Short, unique name for the child in this run, used by the other tools. |
| `task_id` | The plan task the child works on, if any. |
| `objective` | `{goal, deliverable?, done_when?, constraints?[]}`. |
| `context_mode` | `none` (only the brief, the default), `recent` (the caller's last `recent_turns` messages, 1-20, default 6), or `snapshot` (the caller's plan, objective and `context`). |
| `context` | Only the structured facts the child needs (at most 12,000 characters). |
| `tools` | Tool names the child may use. They can only **narrow** the child agent's own tools. |
| `writes` | Subtrees `[{workspace, path}]` the child may write. `[]` makes it read-only; omitted means its own rights apply. |
| `expected_artifacts` | `[{workspace, path, kind?, description?}]` the child should produce. |
| `checks` | Acceptance checks judged on stored state: `node_exists`, `property_equals`, `artifact_written`, `outcome_is`. |
| `budget` | `max_model_calls`, `max_operations`, `max_wall_s`, `max_total_tokens` (clamped). A child that overruns fails rather than pausing, so its parent never waits on a stalled child. |
| `independent` | Required to start a child while another one is still working: this work does not depend on it. |

A repeated spawn with the same `key` returns the child it already created.

### `wait-for-agents`

`{agents?: [key or run id], mode?: 'all' | 'any'}`. If the named children
(all of them by default) have already handed back, it answers at once.
Otherwise the coordinator's run parks durably and the answer arrives when the
children are done, with each child's outcome, summary, artifacts, acceptance
verdict and any messages it posted. A new user message interrupts the wait;
the children keep working.

### `inspect-agent`, `message-agent`, `interrupt-agent`

- `inspect-agent {agent?, include_events?, after_seq?}` reads one child, or
  all of them, including recent run events. Read-only.
- `message-agent {agent, text, mode: 'message' | 'steer'}` sends new input
  that the child reads at its next safe boundary: `message` adds information,
  `steer` redirects the work. A paused child is resumed.
- `interrupt-agent {agent? | all: true, mode?: 'stop' | 'pause', reason?}`
  stops or pauses children. A stopped child keeps what it already wrote and
  reports an honest partial result.

When the coordinator's own run ends, core stops every child that is still
working.

### Plan tasks: `delegate-task` and `get-delegation-status`

For agents that work from a plan, `delegate-task {task_id, agent_ref,
objective, context?, independent?}` is `spawn-agent` keyed by the task
(`task-<task_id>`): delegating the same task twice returns the first child
with `replayed: true`. `get-delegation-status {task_id}` inspects that child.
Collect results with `wait-for-agents` as usual.

## A typical exchange

1. The user asks the coordinator for a competitive summary and a reviewed
   draft.
2. The coordinator calls `spawn-agent` for `/agents/researcher` with
   `writes: []` and a `done_when`, and, marked `independent`, a second child
   for the draft with `writes: [{workspace: 'content', path: '/drafts'}]` and
   a `node_exists` check on the draft path.
3. It calls `wait-for-agents`. The conversation shows it waiting; the user can
   still stop it, or send a message that interrupts the wait.
4. Each child hands back. The draft child's check is evaluated against the
   stored node, not against the child's own claim.
5. The coordinator reads both results and answers the user.

## Isolated branch strategies

A flow step can keep an agent's content changes on a separate branch until a
person reviews them:

```yaml
properties:
  step_type: ai_agent
  agent_ref: "${input.agent_ref}"
  isolated_branch: true
  branch_merge_strategy: review
```

| Strategy | Successful step behavior |
|---|---|
| `auto` | Merge into the original branch and delete the temporary branch. |
| `review` | Return to the original branch and preserve the branch for review. |
| `discard` | Delete the isolated branch without merging. |

With `review`, the step output includes `branch_review.status`, `branch`, and
`base_branch`. Review it with the branch diff and merge it after explicit
approval:

```ts
const db = client.database('my-repository');
const diff = await db.branches().diff(reviewBranch, baseBranch);

const merge = await db.branches().merge(reviewBranch, baseBranch, {
  strategy: 'three_way',
  message: 'Merge reviewed agent changes',
}) as { success: boolean; conflicts: unknown[] };

if (!merge.success) {
  throw new Error(`Merge has ${merge.conflicts.length} unresolved conflicts`);
}
```

For finer-grained review inside one branch, have agents write through
[node-development changesets](../../concepts/node-development.md): a proposed
changeset carries a digest, and committing with `expected_digest` writes
exactly what was approved.

## Design rules

- Give each child one bounded objective with an observable `done_when`. The
  coordinator owns decomposition and synthesis.
- Pass minimum context. A child should discover additional data through its
  tools.
- Grant the fewest tools and the narrowest `writes`. `[]` is the right default
  for research.
- Run children in parallel only for work that does not depend on each other.
- Judge results with `checks` against stored state, not with the child's prose.
- Use existing specialist agents by default. Agent creation is configuration,
  not task execution.

See also [Agent Plans & Custom Tools](./agent-plans-and-tools),
[Drive an Agent Run from a Client](./drive-an-agent-run.md), and
[JavaScript branch operations](../../reference/javascript-client/branches).
