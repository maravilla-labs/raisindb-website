---
sidebar_position: 7
title: Delegated Agent Workflows
description: Delegate plan tasks to specialist agents, isolate their content changes on branches, and require review before merge.
---

# Delegated Agent Workflows

RaisinDB agents can delegate one task from a persisted plan to another installed
agent. The child runs as a durable flow, and any content it changes can be kept
on an isolated branch until a person reviews it.

This is useful when one coordinating agent should remain responsible for the
outcome while specialists handle bounded parts of the work. Delegation is not
the same as creating a new agent: the coordinator normally selects an existing
`raisin:AIAgent` under `/agents`. Create another durable agent only when the
system needs a reusable role with its own instructions and tools.

## Lifecycle

1. The coordinator creates a plan and tasks with `create-plan` and `add-task`.
2. It calls `delegate-task` with a task ID, an installed agent path and a bounded objective.
3. RaisinDB starts `/flows/delegated-agent-task` and marks the task `in_progress`.
4. The child agent runs on a branch named for the flow instance and step.
5. On success, RaisinDB switches back to the base branch and preserves the child branch for review.
6. A client reads the branch diff. A person merges or discards the branch.
7. The client calls `resolve-delegation-review` to record the decision and update plan progress.

If the child fails after its retries, the task returns to `pending` with
`delegation_status: failed` and an error message. The coordinator can inspect the
failure and delegate the task again with a corrected objective or another agent.

## Give a coordinator the delegation tools

Add the built-in tools to the coordinating agent:

```yaml
node_type: raisin:AIAgent
properties:
  title: Project coordinator
  tools:
    - raisin:ref: /lib/raisin/ai/create-plan
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/add-task
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/delegate-task
      raisin:workspace: functions
    - raisin:ref: /lib/raisin/ai/get-delegation-status
      raisin:workspace: functions
```

`delegate-task` accepts:

| Field | Purpose |
|---|---|
| `task_id` | A task ID from the current conversation's plan. |
| `agent_ref` | Installed agent path such as `/agents/content-reviewer`. |
| `objective` | One bounded piece of work with a clear stopping point. |
| `context` | Only the data the child needs. |
| `max_tool_iterations` | Requested tool-loop ceiling, clamped to a safe range. |

The built-in delegated flow currently caps its child at six tool iterations.
The call returns immediately with a flow instance ID; use
`get-delegation-status` to observe `queued`, `running`, `awaiting_review`,
`merged`, `discarded`, or `failed`.

## Review the branch in a client

The review action belongs to the authenticated person, not to the coordinating
agent. Load the diff before offering merge:

```ts
const db = client.database('my-repository');
const diff = await db.branches().diff(reviewBranch, baseBranch);

const changes = [...diff.added, ...diff.modified, ...diff.deleted];
```

After explicit approval, merge and record the result:

```ts
const merge = await db.branches().merge(reviewBranch, baseBranch, {
  strategy: 'three_way',
  message: `Merge reviewed delegated task ${taskId}`,
}) as { success: boolean; conflicts: unknown[] };

if (!merge.success) {
  // Keep the branch and task awaiting review. Present conflicts to a person.
  throw new Error(`Merge has ${merge.conflicts.length} unresolved conflicts`);
}

await db.branches().delete(reviewBranch).catch(() => undefined);
await db.functions().invokeSync('/lib/raisin/ai/resolve-delegation-review', {
  task_id: taskId,
  plan_path: planPath,
  workspace: 'ai',
  branch: reviewBranch,
  action: 'merged',
});
```

To reject the work, delete the review branch and call the same function with
`action: 'discarded'`. The task returns to `pending`, ready for a revised attempt.

## Isolated branch strategies

Any flow step can opt into isolated execution:

```yaml
properties:
  step_type: ai_agent
  agent_ref: "${input.agent_ref}"
  isolated_branch: true
  branch_merge_strategy: review
```

`branch_merge_strategy` supports:

| Strategy | Successful step behavior |
|---|---|
| `auto` | Merge into the original branch and delete the temporary branch. |
| `review` | Return to the original branch and preserve the branch for review. |
| `discard` | Delete the isolated branch without merging. |

With `review`, the step output includes `branch_review.status`, `branch`, and
`base_branch`. The original agent output remains intact.

## Design rules

- Give each child one bounded objective. The coordinator owns decomposition and synthesis.
- Pass minimum context. A child should discover additional data through explicit tools.
- Keep consequential writes on `review` branches.
- Never report branch changes as live before merge succeeds.
- Treat merge conflicts as another human decision; do not silently choose a side.
- Use existing specialist agents by default. Agent creation is configuration, not task execution.

See also [Agent Plans & Custom Tools](./agent-plans-and-tools),
[Agent Memory with Branches](./agent-memory-with-branches), and
[JavaScript branch operations](../../reference/javascript-client/branches).
