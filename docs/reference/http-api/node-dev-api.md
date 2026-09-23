---
title: Node Development API
description: HTTP routes of the node-development surface — typed reads, changesets with dry-run, propose and digest-bound commit, and branch worktrees.
---

# Node Development API

The [node-development surface](../../concepts/node-development.md) over HTTP.
Every method is one `POST` whose body is the request object; the same entry
point serves the function bindings, so a client gets exactly the shapes and
rules an agent's tool gets.

```
GET  /api/node-dev/{repo}                   → { "methods": [ … ] }
POST /api/node-dev/{repo}/{method}?branch=  one call; body = the request
```

Authentication is required; anonymous callers are refused. The tenant comes
from the usual tenant header. The branch is `?branch=`, else the body's
`branch`, else `main`. Every call runs with the caller's own permissions,
including row- and field-level security.

## Common request fields

| Field | Notes |
|---|---|
| `roots` | `[{workspace, path?, ops?}]`: the working roots. `path` defaults to `/`; `ops` (`read`, `create`, `update`, `delete`, `move`, `copy`) defaults to all. |
| `workspace` | Shorthand for one root covering a whole workspace. |
| `branch` | Branch, if not given as a query parameter. |
| `envelope` | `true` returns a `raisin.tool-result/1` envelope instead of the typed result. |
| `__raisin_context` | `{run_id, operation_id}`, set when an agent run's tool calls the API. Implies `envelope`, applies the run's grant (`executor_config.node_dev.roots`), and defaults `idempotency_key` to `run:<run_id>:<operation_id>`. |

A **target** is a path string (relative paths resolve against the first root)
or `{workspace?, path?, node_id?}`; the node id wins.

## Methods

| Method | Body | Result |
|---|---|---|
| `stat` | `{target}` | `{exists, locator?, node_type?, archetype?, child_count, version}` |
| `read` | `{target, keys?}` | `{locator, node_type, archetype?, properties, children, updated_by?}` |
| `list` | `{target?, limit?}` | `{parent?, children: [{locator, name, node_type, archetype?, has_children}], truncated}` |
| `diff` | `{target, from?: {branch?, revision?}, to?: {branch?, revision?}}` | `{from?, to?, moved, changed: [{key, from, to}]}` |
| `watch` | `{since?, limit?}` | `{changes: [{revision, operation, locator}], cursor}` |
| `dry_run` | `{ops, …}` | `{ops: [PlannedOp], conflicts, digest}` |
| `propose` | `{ops, idempotency_key?, message?, primary?, kind?}` | `{changeset, created}` |
| `get_changeset` | `{changeset_id}` | the changeset record |
| `list_changesets` | `{status?, limit?}` | changeset records |
| `commit` | `{changeset_id, expected_digest?}` | `CommitOutcome` |
| `discard` | `{changeset_id}` | the discarded record |
| `apply` | `{ops, idempotency_key?, message?, primary?, kind?}` | `CommitOutcome` |
| `fork_branch` | `{name}` | `{name, head, upstream?, protected}` |
| `diff_branch` | `{base?}` (default `main`) | `{branch, base, common_ancestor, changes: [{operation, workspace, node_id, path?, locale?}]}` |
| `merge_branch` | `{target, dry_run?, message?}` | `{merged, dry_run, conflicts, nodes_changed, fast_forward}` |
| `discard_branch` | `{}` | `{deleted}` |

`primary` is the index of the op whose node is the result's primary artifact,
and `kind` the artifact kind reported in tool results.

### Operations

```json
{ "op": "create", "path": "/articles/launch", "node_type": "myapp:Article",
  "archetype": "myapp:ArticlePage", "properties": { "title": "Launch" }, "workspace": "content" }
{ "op": "patch", "target": "/articles/launch", "expected_revision": "a93f…",
  "set": { "status": "review" }, "unset": ["draft_note"] }
{ "op": "move", "target": "/articles/launch", "to_parent": "/archive/2026", "new_name": "launch" }
{ "op": "rename", "target": "/articles/launch", "new_name": "launch-2026" }
{ "op": "copy", "source": "/templates/article", "to_parent": "/articles", "new_name": "draft" }
{ "op": "delete", "target": "/articles/old", "recursive": true }
```

`expected_revision` is either the revision value or `{value, alg}`.

### Plans

A `PlannedOp` is `{index, action, workspace, node_id?, before?, after_path?,
node_type, changed_properties, moved_descendants, descendants, referrers}`.
`digest` is `sha256:…` over the ops and the revisions they were planned
against.

### Commit outcomes

```json
{ "result": "committed", "receipt": {
    "changeset_id": "3f9c…", "repository": "myapp", "branch": "main", "committed_revision": "…",
    "replayed": false,
    "ops": [{ "index": 0, "action": "moved",
              "old": { "path": "/articles/launch", "…": "…" },
              "new": { "path": "/archive/2026/launch", "…": "…" },
              "changed_properties": [],
              "moved_descendants": [{ "from_path": "/articles/launch/hero", "to": {} }],
              "rewritten_references": [{ "workspace": "content", "node_id": "…", "path": "/home",
                                         "property": "featured", "target_id": "…" }] }] } }
```

```json
{ "result": "conflict", "changeset_id": "…", "digest": "sha256:…",
  "conflicts": [{ "index": 0, "code": "stale_revision", "message": "the node changed since it was read",
                  "expected": "a93f…", "actual": {} }] }
```

Conflict codes: `stale_revision`, `missing`, `exists`, `not_empty`,
`invalid_move`, `published`, `digest_mismatch`. A conflict writes nothing.

A changeset record is `{changeset_id, idempotency_key?, owner, repository,
branch, request, status: proposed | committed | discarded, plan, created_at,
committed_by?, receipt?}`.

## Errors

| Code | Status |
|---|---|
| `invalid_request` | 400 |
| `path_escape`, `forbidden` | 403 |
| `not_found` | 404 |
| `conflict`, `idempotency_key_reused`, `already_committed`, `discarded` | 409 |
| `validation_failed`, `invalid_name`, `engine_owned_property`, `invalid_property` | 422 |
| `busy` | 503: another cluster node is committing on this branch; retry. |

## Example: review a move before committing it

```bash
BASE=http://localhost:8080/api/node-dev/myapp
AUTH="Authorization: Bearer $TOKEN"

# 1. Read the node and keep its revision.
curl -s -X POST $BASE/stat -H "$AUTH" -H 'content-type: application/json' \
  -d '{"workspace":"content","target":"/articles/launch"}'

# 2. Propose the move against that revision.
curl -s -X POST $BASE/propose -H "$AUTH" -H 'content-type: application/json' -d '{
  "workspace": "content",
  "idempotency_key": "archive-launch",
  "ops": [{"op":"move","target":"/articles/launch","to_parent":"/archive/2026",
           "expected_revision":"a93f…"}]
}'
# → {"changeset": {"changeset_id": "3f9c…", "status": "proposed", "plan": {"digest": "sha256:…", …}}, "created": true}

# 3. After review, commit exactly what was approved.
curl -s -X POST $BASE/commit -H "$AUTH" -H 'content-type: application/json' \
  -d '{"workspace":"content","changeset_id":"3f9c…","expected_digest":"sha256:…"}'
```

The JavaScript client wraps these calls in
[`db.nodeDev()`](../javascript-client/node-dev.md).
