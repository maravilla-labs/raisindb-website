---
sidebar_position: 6
---

# Time-Travel Queries

RaisinDB's git-like versioning system lets you query the state of your data at any point in history. Every commit creates an immutable revision, and you can read from any past revision using SQL.

## How Revisions Work

When you commit changes, RaisinDB creates a numbered **revision** — an immutable snapshot of the entire workspace state:

```
Revision 1  →  Initial content
Revision 2  →  Added blog posts
Revision 3  →  Updated homepage
Revision 4  →  Deleted old pages (current HEAD)
```

Revisions are sequential, immutable, and permanent. Revision 2 always returns exactly the same data, no matter what happens later.

## Querying Historical State

### SET __revision

Use `SET __revision` to pin all subsequent queries to a specific revision:

```sql
-- Pin to revision 2
SET __revision = 2;

-- All queries now return state as of revision 2
SELECT * FROM 'default'
WHERE node_type = 'blog:Article';

-- This also sees revision 2 state
SELECT * FROM 'default'
WHERE path = '/content/blog/post1';
```

### Return to Current State

Reset to the latest state by setting revision to `NULL` or starting a new session:

```sql
SET __revision = NULL;

-- Back to current HEAD
SELECT * FROM 'default' WHERE node_type = 'blog:Article';
```

### Query a Specific Revision Inline

You can also filter by the `__revision` column directly:

```sql
SELECT * FROM 'default'
WHERE __revision = 100;
```

## Comparing Across Revisions

### See What Changed

Query the same data at two different revisions to compare:

```sql
-- State before the update
SET __revision = 5;
SELECT path, properties->>'title'::String AS title
FROM 'default'
WHERE node_type = 'blog:Article';

-- State after the update
SET __revision = 6;
SELECT path, properties->>'title'::String AS title
FROM 'default'
WHERE node_type = 'blog:Article';
```

### Find Deleted Content

If a node was deleted after revision 10, you can still read it:

```sql
-- Travel back to before the delete
SET __revision = 10;

SELECT * FROM 'default'
WHERE path = '/content/blog/old-post';
-- Returns the node as it existed at revision 10
```

## Tag-Based Time Travel

Tags are immutable labels that point to specific revisions. They make time travel more readable than raw revision numbers.

### Creating Tags

Tags are created via the HTTP API:

```bash
# Tag revision 100 as a production release
POST /api/management/repositories/default/myrepo/branches/main/tags
{
  "name": "v1.0.0",
  "revision": 100
}
```

### Using Tags

Once tagged, you can reference that point in time by looking up the tag's revision:

```bash
# Get the revision for a tag
GET /api/management/repositories/default/myrepo/branches/main/tags/v1.0.0
# → {"name": "v1.0.0", "revision": 100}
```

Then query at that revision:

```sql
SET __revision = 100;

SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
  AND properties->>'status'::String = 'published';
```

Tags never move — `v1.0.0` always points to revision 100, even after hundreds of subsequent commits.

## Rollback

If you need to restore content to a previous state, update the branch HEAD:

```bash
# Current HEAD is revision 50, but revision 45 was the last good state
PUT /api/management/repositories/default/myrepo/branches/main/head
{
  "head": 45
}
```

After rollback:
- HEAD now points to revision 45
- Revisions 46–50 still exist in history
- All queries return revision 45 state by default
- You can still time-travel to revisions 46–50

## Branches and Time Travel

Different branches can point to different revisions:

```
main       → revision 50
staging    → revision 48
feature-x  → revision 42
```

Connect to a specific branch via pgwire to query its current state:

```bash
psql -h 127.0.0.1 -p 5432 -U tenant1/repo1/main
psql -h 127.0.0.1 -p 5432 -U tenant1/repo1/staging
```

Combine with `SET __revision` to time-travel within any branch.

## Use Cases

### Audit Trail

See exactly what content looked like at a specific deployment:

```sql
SET __revision = 200;
SELECT path, properties->>'title'::String AS title, properties->>'status'::String AS status
FROM 'default'
WHERE node_type = 'blog:Article';
```

### Debugging Content Issues

If a user reports that content was correct yesterday but wrong today, check recent revisions:

```sql
-- Check yesterday's state
SET __revision = 155;
SELECT properties FROM 'default' WHERE path = '/content/homepage';

-- Check today's state
SET __revision = NULL;
SELECT properties FROM 'default' WHERE path = '/content/homepage';
```

### Safe Previews

Use branches to preview changes without affecting production:

```bash
# Create a preview branch from current main
POST /api/repository/myrepo/branches
{
  "name": "preview",
  "from_revision": 50
}
```

Make changes on the preview branch, then merge to main when ready.

## Next Steps

- [Common Query Patterns](./common-query-patterns.md) — SQL recipe cookbook
- [Filtering Data](./filtering-data.md) — Advanced filters
- [Branches and Tags](/docs/concepts/versioning/branches-and-tags) — Version management
