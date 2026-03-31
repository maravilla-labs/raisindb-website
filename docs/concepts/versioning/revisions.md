---
sidebar_position: 3
---

# Revisions

Every change in RaisinDB creates a **revision**—a complete snapshot of a node at a point in time. Revisions use Hybrid Logical Clock (HLC) timestamps, enabling distributed, conflict-free version control with time-travel queries.

## What is a Revision?

A revision captures the state of a node at a specific moment:

```sql
-- Node with revision history
{
  "path": "/content/blog/post1",
  "node_type": "blog:Article",
  "properties": {"title": "Current Title"},
  "__revision": "2024-01-15T14:30:00.123456Z-0001",  -- HLC timestamp
  "__timestamp": "2024-01-15T14:30:00.123456Z"
}
```

Every INSERT, UPDATE, or DELETE creates a new revision:

```sql
-- Create node (revision 1)
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/post1',
  'blog:Article',
  '{"title": "First Version"}'
);

-- Update node (revision 2)
UPDATE default
SET properties = properties || '{"title": "Second Version"}'
WHERE path = '/content/blog/post1';

-- Update again (revision 3)
UPDATE default
SET properties = properties || '{"title": "Third Version"}'
WHERE path = '/content/blog/post1';

-- View all revisions
SELECT __revision, __timestamp, properties->>'title' AS title
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC;

-- Results:
-- __revision                           | __timestamp                 | title
-- 2024-01-15T14:32:00.123456Z-0001   | 2024-01-15T14:32:00.123456Z | Third Version
-- 2024-01-15T14:31:00.123456Z-0001   | 2024-01-15T14:31:00.123456Z | Second Version
-- 2024-01-15T14:30:00.123456Z-0001   | 2024-01-15T14:30:00.123456Z | First Version
```

## Hybrid Logical Clock (HLC)

RaisinDB uses HLC timestamps for revisions, combining:

- **Physical time**: Wall-clock timestamp (UTC)
- **Logical counter**: Ensures unique ordering even at the same microsecond

Format: `YYYY-MM-DDTHH:MM:SS.ssssssZ-LLLL`

Example: `2024-01-15T14:30:00.123456Z-0001`

- `2024-01-15T14:30:00.123456Z` - Physical timestamp
- `0001` - Logical counter

### Why HLC?

1. **Total ordering**: Every revision has a unique, sortable timestamp
2. **Distributed-ready**: Works across multiple nodes without coordination
3. **Causality tracking**: Preserves happened-before relationships
4. **Conflict-free merging**: Deterministic merge ordering

## Querying Revisions

### Get All Revisions

```sql
-- All revisions of a node
SELECT __revision, __timestamp, __branch, properties
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC;
```

### Get Current Revision

```sql
-- Latest revision (current state)
SELECT __revision, properties
FROM default
WHERE path = '/content/blog/post1'
LIMIT 1;

-- Or explicitly
SELECT __revision, properties
FROM default
WHERE path = '/content/blog/post1'
  AND __revision = (
    SELECT MAX(__revision)
    FROM default
    WHERE path = '/content/blog/post1'
  );
```

### Get Specific Revision

```sql
-- By revision timestamp
SELECT properties
FROM default
WHERE path = '/content/blog/post1'
  AND __revision = '2024-01-15T14:30:00.123456Z-0001';

-- By index (nth revision)
SELECT properties
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision ASC
OFFSET 2 LIMIT 1;  -- 3rd revision (0-indexed)
```

## Time-Travel Queries

Query data as it existed at any point in time:

### Set Revision

```sql
-- View data as of specific time
SET __revision = '2024-01-14T10:00:00Z';

-- All queries now return data from that revision
SELECT * FROM default WHERE path = '/content/blog/post1';

-- Reset to current
SET __revision = DEFAULT;
```

### Inline Revision Queries

```sql
-- Query specific revision without setting session
SELECT properties
FROM default
WHERE path = '/content/blog/post1'
  AND __revision <= '2024-01-14T10:00:00Z'
ORDER BY __revision DESC
LIMIT 1;

-- Compare current to past
SELECT
  current.properties AS current_state,
  past.properties AS past_state
FROM
  (SELECT properties FROM default
   WHERE path = '/content/blog/post1'
   ORDER BY __revision DESC LIMIT 1) current,
  (SELECT properties FROM default
   WHERE path = '/content/blog/post1'
     AND __revision <= '2024-01-14T10:00:00Z'
   ORDER BY __revision DESC LIMIT 1) past;
```

### Relative Time-Travel

```sql
-- 1 hour ago
SET __revision = NOW() - INTERVAL '1 hour';

-- Yesterday at noon
SET __revision = DATE_TRUNC('day', NOW() - INTERVAL '1 day') + INTERVAL '12 hours';

-- Beginning of month
SET __revision = DATE_TRUNC('month', NOW());

-- Query and reset
SELECT * FROM default WHERE path = '/content/blog/post1';
SET __revision = DEFAULT;
```

## Revision Metadata

Every revision includes metadata:

| Field | Type | Description |
|-------|------|-------------|
| `__revision` | HLC | Unique revision identifier |
| `__timestamp` | timestamp | Physical clock time |
| `__branch` | string | Branch where revision was created |
| `__user` | string | User who made the change |
| `__operation` | string | Operation type (INSERT, UPDATE, DELETE) |
| `__message` | string | Optional commit message |

### Querying Metadata

```sql
-- Revision with metadata
SELECT
  __revision,
  __timestamp,
  __branch,
  __user,
  __operation,
  __message,
  properties->>'title' AS title
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC;

-- Find who made a change
SELECT __user, __timestamp, __operation
FROM default
WHERE path = '/content/blog/post1'
  AND properties->>'title' = 'Specific Title';

-- Changes by user
SELECT path, __revision, __operation
FROM default
WHERE __user = 'jane@example.com'
  AND __timestamp >= NOW() - INTERVAL '7 days'
ORDER BY __revision DESC;
```

## Revision History

### Timeline View

```sql
-- Chronological changes
SELECT
  __timestamp,
  __user,
  __operation,
  properties->>'title' AS title
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision ASC;

-- Output:
-- __timestamp              | __user           | __operation | title
-- 2024-01-15T10:00:00Z    | jane@example.com | INSERT      | First Draft
-- 2024-01-15T11:30:00Z    | john@example.com | UPDATE      | Revised Title
-- 2024-01-15T14:00:00Z    | jane@example.com | UPDATE      | Final Title
```

### Change Detection

```sql
-- Find when a property changed
SELECT
  __revision,
  __timestamp,
  properties->>'status' AS status,
  LAG(properties->>'status') OVER (ORDER BY __revision) AS previous_status
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision;

-- Find all changes to a specific property
SELECT __revision, __timestamp,
  properties->>'title' AS title
FROM default
WHERE path = '/content/blog/post1'
  AND properties->>'title' != COALESCE(
    LAG(properties->>'title') OVER (ORDER BY __revision),
    properties->>'title'
  )
ORDER BY __revision;
```

### Diff Between Revisions

```sql
-- Compare two revisions
WITH rev1 AS (
  SELECT properties FROM default
  WHERE path = '/content/blog/post1'
    AND __revision = '2024-01-15T10:00:00Z-0001'
),
rev2 AS (
  SELECT properties FROM default
  WHERE path = '/content/blog/post1'
    AND __revision = '2024-01-15T14:00:00Z-0001'
)
SELECT
  rev1.properties AS old_version,
  rev2.properties AS new_version,
  rev2.properties - rev1.properties AS added_properties,
  rev1.properties - rev2.properties AS removed_properties
FROM rev1, rev2;
```

## Audit Trail

For compliance and debugging:

```sql
-- Complete audit log
SELECT
  __revision,
  __timestamp,
  __user,
  __operation,
  __branch,
  path,
  node_type,
  properties
FROM default
WHERE __timestamp BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY __revision DESC;

-- Changes to sensitive nodes
SELECT
  __revision,
  __timestamp,
  __user,
  __operation
FROM default
WHERE PATH_STARTS_WITH(path, '/config/security')
ORDER BY __revision DESC;

-- Deletions
SELECT
  path,
  __timestamp,
  __user,
  properties
FROM default
WHERE __operation = 'DELETE'
  AND __timestamp >= NOW() - INTERVAL '30 days'
ORDER BY __revision DESC;
```

## Revision Retention

Control how long revisions are kept:

```sql
-- Keep all revisions (default)
ALTER TABLE default SET REVISION_RETENTION = 'INFINITE';

-- Keep last 100 revisions per node
ALTER TABLE default SET REVISION_RETENTION = 'LAST 100';

-- Keep revisions for 90 days
ALTER TABLE default SET REVISION_RETENTION = 'DURATION 90 DAYS';

-- Keep revisions based on size (10GB max)
ALTER TABLE default SET REVISION_RETENTION = 'SIZE 10GB';
```

### Prune Old Revisions

```sql
-- Manually prune revisions older than 1 year
DELETE FROM default.__revisions__
WHERE __timestamp < NOW() - INTERVAL '1 year'
  AND __revision != (
    SELECT MAX(__revision)
    FROM default.__revisions__ r2
    WHERE r2.path = __revisions__.path
  );  -- Keep latest revision
```

## Reverting Changes

### Rollback to Previous Revision

```sql
-- Get previous state
SELECT properties FROM default
WHERE path = '/content/blog/post1'
  AND __revision < (
    SELECT MAX(__revision)
    FROM default
    WHERE path = '/content/blog/post1'
  )
ORDER BY __revision DESC
LIMIT 1;

-- Restore previous state (creates new revision)
UPDATE default
SET properties = (
  SELECT properties FROM default
  WHERE path = '/content/blog/post1'
    AND __revision < (
      SELECT MAX(__revision)
      FROM default
      WHERE path = '/content/blog/post1'
    )
  ORDER BY __revision DESC
  LIMIT 1
)
WHERE path = '/content/blog/post1';
```

### Restore Deleted Node

```sql
-- Find last revision before deletion
SELECT properties FROM default
WHERE path = '/content/blog/deleted-post'
  AND __operation != 'DELETE'
ORDER BY __revision DESC
LIMIT 1;

-- Restore
INSERT INTO default (path, node_type, properties)
SELECT path, node_type, properties
FROM default
WHERE path = '/content/blog/deleted-post'
  AND __operation != 'DELETE'
ORDER BY __revision DESC
LIMIT 1;
```

## Revision Performance

### Indexing

```sql
-- Index for revision queries
CREATE INDEX idx_revision ON default (__revision);
CREATE INDEX idx_timestamp ON default (__timestamp);
CREATE INDEX idx_path_revision ON default (path, __revision);

-- Index for user audits
CREATE INDEX idx_user_timestamp ON default (__user, __timestamp);
```

### Efficient Queries

```sql
-- Good: Uses index
SELECT * FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC
LIMIT 10;

-- Bad: Full table scan
SELECT * FROM default
WHERE __timestamp::date = '2024-01-15';

-- Better: Range query
SELECT * FROM default
WHERE __timestamp >= '2024-01-15 00:00:00'
  AND __timestamp < '2024-01-16 00:00:00';
```

## Advanced Patterns

### Snapshot at Regular Intervals

```sql
-- Daily snapshots
CREATE TAG daily-$(date +%Y-%m-%d) ON main AT HEAD;

-- Query from daily snapshot
SET __revision = (SELECT revision FROM __tags__ WHERE name = 'daily-2024-01-15');
SELECT * FROM default;
```

### Event Sourcing

Use revisions as event log:

```sql
-- All events for a node
SELECT
  __revision AS event_id,
  __timestamp AS event_time,
  __operation AS event_type,
  properties AS event_data
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision ASC;

-- Rebuild state from events
SELECT
  path,
  (SELECT properties
   FROM default d2
   WHERE d2.path = d1.path
   ORDER BY __revision DESC
   LIMIT 1) AS current_state
FROM (SELECT DISTINCT path FROM default) d1;
```

### Change Data Capture (CDC)

Track all changes for replication:

```sql
-- Changes since last sync
SELECT
  path,
  __revision,
  __timestamp,
  __operation,
  properties
FROM default
WHERE __revision > :last_synced_revision
ORDER BY __revision ASC;
```

### Temporal Queries

```sql
-- Find nodes that were published in January 2024
SELECT DISTINCT path
FROM default
WHERE (properties->>'published')::boolean = true
  AND __timestamp >= '2024-01-01'
  AND __timestamp < '2024-02-01'
  AND (
    SELECT (properties->>'published')::boolean
    FROM default d2
    WHERE d2.path = default.path
      AND d2.__revision < '2024-01-01'
    ORDER BY __revision DESC
    LIMIT 1
  ) IS DISTINCT FROM true;  -- Wasn't published before January
```

## Best Practices

1. **Use time-travel for debugging**: Investigate issues by viewing historical state
2. **Tag important milestones**: Mark releases, deployments for easy reference
3. **Set retention policies**: Balance storage with audit requirements
4. **Index strategically**: Add indexes for common revision queries
5. **Include commit messages**: Document why changes were made
6. **Regular snapshots**: Create periodic tags for quick rollback
7. **Monitor storage**: Revisions consume disk space, monitor growth
8. **Audit sensitive data**: Track all changes to critical nodes

## Next Steps

- **[Git-Like Workflows](/docs/concepts/versioning/git-like-workflows)** - Use revisions in branching workflows
- **[Branches and Tags](/docs/concepts/versioning/branches-and-tags)** - Organize revisions with branches
- **[Access Control](/docs/concepts/access-control)** - Control who can view revision history
- **[SQL Reference](/docs/reference/sql/functions/string-functions)** - Complete revision function documentation
