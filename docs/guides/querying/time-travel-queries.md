---
sidebar_position: 6
---

# Time-Travel Queries

Every write to a branch produces a new **revision**, and older revisions stay
readable. You can run any query as of a past revision, read a deleted node
back, tag a revision with a name, or move a branch's head to an earlier
revision.

## Revisions

A revision is identified by a hybrid logical clock value written as
`"<milliseconds>-<counter>"`, for example `1788720201397-0`. Revisions are
ordered, so a later write always has a larger value. A branch's current
revision is its **head**:

```bash
GET /api/management/repositories/{tenant}/{repo}/branches/main/head
```

```json
{"revision": "1788720201397-0"}
```

A node's own revisions are listed by the history API. From the JavaScript
client:

```typescript
const nodes = client.database('myrepo').workspace('blog').nodes();
const history = await nodes.historyByPath('/posts/post-1');
// [
//   { revision: '1788720151444-0', updated_at: '…', updated_by: 'system', deleted: false, message: 'SQL UPDATE', … },
//   { revision: '1788719850630-0', updated_at: '…', updated_by: 'system', deleted: false, message: 'SQL INSERT', … }
// ]
```

Newest first. `nodes.history(id)` does the same by node id.

## Querying a past revision in SQL

Add `__revision = …` to the `WHERE` clause. The whole query then reads the
workspace as it was at that revision:

```sql
SELECT path, properties->>'title' AS title
FROM 'blog'
WHERE path = '/posts/post-1'
  AND __revision = '1788720151444-0';
```

The value is the revision string, or just its millisecond part as a number
(`__revision = 1788720151444`), which reads the state as of that instant.
`__revision` combines with any other predicate; it is stripped from the
filter and applied to the scan.

`__revision IS NULL`, or leaving it out, reads the current head.

`SET`-style session pinning is not available; put `__revision` in each query.

### Reading a deleted node

A node deleted after a revision is still there at that revision:

```sql
DELETE FROM 'blog' WHERE path = '/posts/post-6';

SELECT path, properties->>'title' AS title
FROM 'blog'
WHERE path = '/posts/post-6' AND __revision = '1788720201397-0';
-- returns the node as it was before the delete
```

### Comparing two revisions

Run the same query twice with different revisions:

```sql
SELECT path, properties->>'title' AS title FROM 'blog'
WHERE node_type = 'raisin:Page' AND __revision = '1788719850630-0';

SELECT path, properties->>'title' AS title FROM 'blog'
WHERE node_type = 'raisin:Page' AND __revision = '1788720151444-0';
```

## Reading a past revision over REST

The `rev/{revision}` routes mirror the `head` routes:

```bash
# a node at a revision
GET /api/repository/{repo}/{branch}/rev/1788720201397-0/{workspace}/posts/post-6

# a node by id
GET /api/repository/{repo}/{branch}/rev/1788720201397-0/{workspace}/$ref/{id}

# children of a folder at a revision
GET /api/repository/{repo}/{branch}/rev/1788720201397-0/{workspace}/posts/
```

The revision must be a full `"<ms>-<counter>"` string; anything else is
rejected with `Invalid revision`.

The JavaScript client has the same idea as a scoped database:

```typescript
const past = client.database('myrepo').atRevision('1788720201397-0');
const node = await past.workspace('blog').nodes().getByPath('/posts/post-6');
```

## Tags

A tag is a name for a revision. Tags are repository-wide.

```bash
POST /api/management/repositories/{tenant}/{repo}/tags
{"name": "v1.0.0", "revision": "1788720201397-0"}
```

```json
{"name":"v1.0.0","revision":"1788720201397-0","created_at":"2026-09-06T18:43:21Z","created_by":"system","message":null,"protected":false}
```

`GET …/tags` lists them, `GET …/tags/v1.0.0` returns one, `DELETE
…/tags/v1.0.0` removes it. To query at a tag, look up its revision and use it
in `__revision`:

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published'
  AND __revision = '1788720201397-0';
```

## Rollback

Move a branch head back to an earlier revision:

```bash
PUT /api/management/repositories/{tenant}/{repo}/branches/main/head
{"revision": "1788720201397-0"}
```

The response is `204 No Content`. Queries without `__revision` now see that
revision's state. Later revisions are not deleted and remain readable with
`__revision`.

## Branches

Each branch has its own head. Create one from a revision:

```bash
POST /api/management/repositories/{tenant}/{repo}/branches
{"name": "preview", "from_revision": "1788720201397-0"}
```

```json
{"name":"preview","head":"1788720201397-0","created_at":"…","created_by":"system","created_from":"1788720201397-0","upstream_branch":null,"protected":false,"description":null}
```

Query another branch from SQL by naming it in the URL or in the statement:

```bash
POST /api/sql/{repo}/preview
```

```sql
SELECT path, properties->>'title' AS title
FROM 'blog'
WHERE path = '/posts/post-6' AND __branch = 'preview';
```

Over the PostgreSQL wire protocol, switch the session's branch with
`USE BRANCH 'preview'` (or `SET app.branch = 'preview'`). `__revision` works
on any branch.

## Use cases

**Audit a deployment.** Tag the revision you shipped, then query content as
of that tag whenever a question comes up.

**Debug "it was right yesterday".** Read the node's history, pick the
revision from yesterday, and compare its properties with the head:

```sql
SELECT properties FROM 'blog' WHERE path = '/homepage' AND __revision = '1788633600000';
SELECT properties FROM 'blog' WHERE path = '/homepage';
```

**Safe previews.** Fork a `preview` branch, edit there, and merge to `main`
when ready. See [Branches and Tags](/docs/concepts/versioning/branches-and-tags).

## Next Steps

- [Common Query Patterns](./common-query-patterns.md)
- [Filtering Data](./filtering-data.md)
- [Branches and Tags](/docs/concepts/versioning/branches-and-tags)
