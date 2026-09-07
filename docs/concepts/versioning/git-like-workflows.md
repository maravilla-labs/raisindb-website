---
sidebar_position: 1
---

# Git-Like Workflows

RaisinDB versions content the way Git versions files. Every write is a revision, a branch is a pointer to a revision, branches fork and merge, and tags name revisions. If you know Git, the mapping is direct:

| Git | RaisinDB | Notes |
|-----|----------|-------|
| Commit | Revision | Created by every write; identified by an HLC value such as `1788719765785-0` |
| Branch | Branch | A name pointing at its newest revision |
| Fork / checkout -b | `CREATE BRANCH 'x' FROM 'main'` | Copies content and schema at the fork revision |
| Checkout | Branch in the address | `USE BRANCH`, the `{branch}` URL segment, or `db.onBranch()` |
| Log | Revision log, node history | Repository-wide commits, or one node's revisions |
| Diff | `compare` / `diff` | Commits ahead and behind, or the changed nodes |
| Merge | `MERGE BRANCH 'x' INTO 'main'` | Fast-forward or three-way with conflict detection |
| Tag | Tag | An immutable name for one revision |
| Reset | Set branch head | Moves the pointer; history is kept |

One difference from Git: there is no working directory or staging area. A write is committed the moment it happens, on the branch you addressed. A SQL transaction can group several writes into one revision with a message, but a plain `UPDATE` is a commit too, with a generated message.

The examples below use SQL over HTTP. The same operations exist over the JavaScript client and the management API; see [Branches and Tags](./branches-and-tags).

## Feature branch

Work in isolation, review, then merge.

```sql
-- fork from main
CREATE BRANCH 'feature/new-layout' FROM 'main';
```

Write on the branch by addressing it (`POST /api/sql/myapp/feature%2Fnew-layout`; a slash in a branch name is URL-encoded), or in one batch:

```sql
USE BRANCH 'feature/new-layout';
UPDATE 'content' SET properties = '{"title":"Hello","layout":"modern"}'::jsonb WHERE path = '/hello';
```

`main` is unchanged until the merge:

```sql
SHOW DIVERGENCE 'feature/new-layout' FROM 'main';
-- branch | base | ahead | behind | common_ancestor
-- feature/new-layout | main | 1 | 0 | 1788719729588-0

MERGE BRANCH 'feature/new-layout' INTO 'main' MESSAGE 'New layout';
DROP BRANCH 'feature/new-layout';
```

## Environment branches

One branch per environment, promoted by merging in one direction.

```sql
CREATE BRANCH 'staging' FROM 'main';
CREATE BRANCH 'production' FROM 'main';
ALTER BRANCH 'production' SET PROTECTED TRUE;
```

Editors work on `main`. To release, merge `main` into `staging`, test against the `staging` branch address, then remove protection and merge into `production`:

```sql
MERGE BRANCH 'main' INTO 'staging' MESSAGE 'Release candidate';
ALTER BRANCH 'production' SET PROTECTED FALSE;
MERGE BRANCH 'staging' INTO 'production' MESSAGE 'Release 2026-09-06';
ALTER BRANCH 'production' SET PROTECTED TRUE;
```

If only part of `staging` should go live, copy the reviewed subtrees with `copyNodes` instead of merging the whole branch; see [Working with Branches](/docs/guides/branching/working-with-branches).

## Editorial review

A writer drafts on a branch, an editor reviews the branch, and the approved result is merged.

```sql
CREATE BRANCH 'draft/article-123' FROM 'main';
```

```sql
USE BRANCH 'draft/article-123';
INSERT INTO 'content' (path, node_type, name, properties)
VALUES ('/blog/article-123', 'raisin:Page', 'article-123', '{"title":"Draft"}'::jsonb);
```

The editor reads the draft branch, sees exactly what changed, and merges:

```sql
SELECT path, properties->>'title' AS title FROM 'content' WHERE __branch = 'draft/article-123';
MERGE BRANCH 'draft/article-123' INTO 'main' MESSAGE 'Publish article 123';
```

Over HTTP the editor can call the `diff` endpoint for a per-node list of added, modified and deleted nodes before merging.

## Releases with tags

Tag the revision you shipped so it can be read, compared or forked later.

```typescript
const head = await db.branches().getHead('main');
await db.tags().create('v1.0', head.revision, 'First release');

// read content as it was at the release
await db.executeSql("SELECT path, properties->>'title' AS title FROM 'content' WHERE __revision = '" + head.revision + "'");

// hotfix on a branch forked at the release
await db.branches().create('hotfix/v1.0.1', { fromBranch: 'main', fromRevision: head.revision });
```

## Concurrent edits and conflicts

Two branches can change different nodes freely; a three-way merge combines them. When both change the **same node** since the fork, the merge stops and returns the conflicting nodes with their base, target and source properties:

```sql
MERGE BRANCH 'user/jane' INTO 'main';
-- error: Merge has 1 conflict(s). Use SHOW CONFLICTS FOR MERGE 'user/jane' INTO 'main' to view details ...

SHOW CONFLICTS FOR MERGE 'user/jane' INTO 'main';
-- node_id | path | conflict_type | base_properties | target_properties | source_properties
-- 260584c1-... |  | BothModified | {"title":"Hello v3"} | {"title":"Title from main"} | {"title":"Title from jane"}
```

Conflicts are detected per node, not per property. The merge is completed by sending one resolution per conflicted node, each naming the final properties, to the `resolve-merge` endpoint:

```bash
curl -X POST http://localhost:8080/api/management/repositories/default/myapp/branches/main/resolve-merge \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "source_branch": "user/jane",
    "resolutions": [{
      "node_id": "260584c1-...",
      "resolution_type": "keep-theirs",
      "resolved_properties": { "title": "Title from jane" }
    }],
    "message": "Merge jane",
    "actor": "editor"
  }'
```

See [Merging Changes](/docs/guides/branching/merging-changes) for the SQL form and the response.

## Rolling back

A branch head can be moved to any earlier revision. Nothing is deleted, so it can be moved forward again.

```typescript
const history = await db.workspace('content').nodes().historyByPath('/hello');
await db.branches().updateHead('main', history[1].revision);   // main now reads as it did one revision ago
```

## Agents on branches

The same model gives an AI agent a private copy of the data to work in: fork a branch per task, let the agent write there, inspect the diff, and merge or drop the branch. See [Agent Memory with Branches](/docs/guides/ai/agent-memory-with-branches).

## Next Steps

- **[Branches and Tags](./branches-and-tags)** - The branch and tag model in detail
- **[Revisions](./revisions)** - History, point-in-time reads and rollback
- **[Working with Branches](/docs/guides/branching/working-with-branches)** - Step-by-step branch operations
- **[Access Control](/docs/concepts/access-control)** - Who can read and write which content
