---
sidebar_position: 5
title: raisin.nodeDev
description: Function bindings for the node-development surface — typed reads, changesets with review and idempotency, and branch worktrees, confined to a run's grant.
---

# `raisin.nodeDev`

The [node-development surface](../../concepts/node-development.md) from
inside a function. JavaScript (QuickJS) uses `raisin.nodeDev.*` with camelCase
names; the generated guest SDKs use the registry names `node_dev_*` (Rust:
`raisin_sdk::node_dev::dry_run(request)`, plus typed `*_as<T>` variants). Each
method takes one request object, the same body as the
[HTTP API](../http-api/node-dev-api.md). The JavaScript calls are synchronous.

| JavaScript | Registry method |
|---|---|
| `stat`, `read`, `list`, `diff`, `watch` | `node_dev_stat`, `node_dev_read`, `node_dev_list`, `node_dev_diff`, `node_dev_watch` |
| `dryRun`, `propose`, `getChangeset`, `listChangesets` | `node_dev_dry_run`, `node_dev_propose`, `node_dev_get_changeset`, `node_dev_list_changesets` |
| `commit`, `discard`, `apply` | `node_dev_commit`, `node_dev_discard`, `node_dev_apply` |
| `forkBranch`, `diffBranch`, `mergeBranch`, `discardBranch` | `node_dev_fork_branch`, `node_dev_diff_branch`, `node_dev_merge_branch`, `node_dev_discard_branch` |

**Who is calling.** The caller is the function's own auth context; a function
without one runs as the system. Reads are filtered by row- and field-level
security, and writes need the caller's own permissions.

**Inside an agent run.** Pass the tool's `__raisin_context` through. The
binding then:

- confines the call to the run's grant (`executor_config.node_dev.roots` on the
  run record, looked up on the function's own branch). Roots in the request
  can only narrow it;
- answers with a `raisin.tool-result/1` envelope, errors included;
- defaults `idempotency_key` to `run:<run_id>:<operation_id>`, so a
  re-dispatched tool call cannot commit twice.

## Example: an agent tool that archives a node safely

```js
export function handler(input) {
  const ctx = input.__raisin_context;               // present when a run calls the tool
  return raisin.nodeDev.apply({
    __raisin_context: ctx,
    workspace: 'content',
    message: `Archive ${input.path}`,
    ops: [{
      op: 'move',
      target: input.path,
      to_parent: '/archive',
      expected_revision: input.revision,            // the revision the agent read
    }],
  });
  // Inside a run: a raisin.tool-result/1 envelope whose writes carry
  // `from` for the move, or a `conflict` diagnostic when the node changed.
}
```

Outside a run, the same call returns the typed `CommitOutcome`:
`{result: "committed", receipt}` or `{result: "conflict", conflicts, digest}`.

## Agent tools

The `ai-tools` package ships these bindings as ready-made agent tools under
`/lib/raisin/node-dev/`: `node-stat`, `node-list`, `node-read`, `node-diff`,
`node-watch`, `node-dry-run`, `node-propose`, `node-apply`,
`node-changeset` (`action: get | commit | discard | list`) and `node-branch`
(`action: fork | diff | merge | discard`). Add them to an agent's `tools` and
give the agent a `node_dev.roots` grant.

## Related

- [Node Development](../../concepts/node-development.md)
- [`raisin.agentRuns`](./agent-runs.md)
