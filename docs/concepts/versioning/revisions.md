---
sidebar_position: 3
---

# Revisions

Every write in RaisinDB produces a **revision**: an immutable snapshot of the node as it was after that write, stamped with a Hybrid Logical Clock (HLC) value. A branch is a pointer to its newest revision, so reading a branch means reading the latest revision of every node that is at or below that pointer. Older revisions stay on disk, which is what makes point-in-time reads, per-node history, tags and rollback possible.

## The revision identifier

A revision is an HLC value written as `timestamp-counter`, for example `1788719765785-0`. The first part is wall-clock time in milliseconds since the Unix epoch; the counter disambiguates writes that land in the same millisecond. HLC values sort by time first and counter second, and they stay unique across the nodes of a replicated cluster without coordination.

Wherever an API accepts a revision it wants the full string. Some responses report only the millisecond part as a number (the `revision` field of a merge result is one), so keep the string form from the branch head or the history listing when you need to address a revision exactly.

## What creates a revision

Every content write does: `INSERT`, `UPDATE` and `DELETE` over SQL, node writes over REST and WebSocket, package installs, merges. Each write becomes a commit record with a parent, a branch, an actor and a message. Plain writes get a generated message such as `Updated node: <id>`; a SQL transaction can supply its own:

```sql
BEGIN;
UPDATE 'content' SET properties = '{"title":"Committed via SQL"}'::jsonb WHERE path = '/rest-page';
COMMIT WITH MESSAGE 'Retitle rest-page' ACTOR 'alice';
```

## Reading a node's history

The per-node history lists a node's revisions newest first. Each entry carries the revision, when it was written, who wrote it, the commit message, and whether the node was deleted at that revision.

```typescript
const history = await db.workspace('content').nodes().historyByPath('/rest-page');
// [
//   { revision: '1788720366608-0', updated_at: '2026-09-06T18:46:06.608Z',
//     updated_by: 'system', deleted: false, message: 'Retitle rest-page', is_system: false },
//   { revision: '1788720274647-0', ..., message: 'Updated node: 73GCnvIVgGRefcxJ31u1j' },
//   { revision: '1788720274636-0', ..., message: 'Created node: 73GCnvIVgGRefcxJ31u1j' }
// ]
```

`nodes().history(id, { limit })` does the same by id. Over HTTP the equivalent endpoints are `GET /api/history/{repo}/{branch}/{ws}/{path}` and `GET /api/history/{repo}/{branch}/{ws}/by-id/{id}`, with an optional `?limit=`.

History is always kept. It does not depend on the `auditable` flag of a NodeType, which only controls the separate audit log.

## Reading at a revision

To see a node as it was, read it at a revision instead of at `head`:

```bash
curl http://localhost:8080/api/repository/myapp/main/rev/1788719729588-0/content/hello \
  -H "Authorization: Bearer $TOKEN"
# {"id":"260584c1-...","path":"/hello","properties":{"title":"Hello"}, ...}
```

The same segment works for a workspace listing (`.../rev/{revision}/{ws}/`) and for a lookup by id (`.../rev/{revision}/{ws}/$ref/{id}`).

In SQL, an equality on the `__revision` pseudo-column pins the whole query to that point in time:

```sql
SELECT path, properties->>'title' AS title
FROM 'content'
WHERE __revision = '1788719729588-0';
```

Pass the full `timestamp-counter` string. A bare integer is accepted and is read as `timestamp-0`, which only matches a revision whose counter is zero.

## Repository-level revision log

The management API lists commits across the repository, newest first, with the nodes each one touched:

```bash
curl "http://localhost:8080/api/management/repositories/default/myapp/revisions?branch=main&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "revisions": [
    {
      "revision": "1788719765785-0",
      "parent": "1788719744056-0",
      "merge_parent": "1788719742050-0",
      "branch": "main",
      "timestamp": "2026-09-06T18:36:05.785549Z",
      "actor": "alice",
      "message": "Merge feature",
      "is_system": false,
      "changed_nodes": [
        { "node_id": "f29d5b20-...", "workspace": "content", "operation": "added" },
        { "node_id": "260584c1-...", "workspace": "content", "operation": "modified" }
      ]
    }
  ],
  "total": 1,
  "has_more": false
}
```

`merge_parent` is set on merge commits and names the source branch's head at merge time. `GET .../revisions/{revision}` returns one record and `GET .../revisions/{revision}/changes` returns just its node changes.

## Tags

A tag is a name for a revision. It never moves, which makes it the right handle for a release or a reviewed state. Tags are created over the management API or the JavaScript client, with an optional message:

```typescript
const head = await db.branches().getHead('main');   // { revision: '1788719765785-0' }
await db.tags().create('v1.0', head.revision, 'First release');
```

Read data at a tag by passing its revision to the `rev/` endpoint or a `__revision` predicate. See [Branches and Tags](./branches-and-tags) for the full tag API.

## Rolling back

A branch head can be moved to an earlier revision. Reads then return the state at that revision; the newer revisions stay in history.

```typescript
await db.branches().updateHead('main', '1788719765785-0');
```

The HTTP form is `PUT /api/management/repositories/{tenant}/{repo}/branches/{name}/head` with `{"revision": "..."}`. A protected branch rejects the change. Because history is unchanged, moving the head back forward restores the newer state.

## Next Steps

- **[Branches and Tags](./branches-and-tags)** - Branches, forks, merges and tags
- **[Git-Like Workflows](./git-like-workflows)** - Common branching patterns
- **[Time-Travel Queries](/docs/guides/querying/time-travel-queries)** - Reading historical state
