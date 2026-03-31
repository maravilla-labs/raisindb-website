---
sidebar_position: 2
---

# Branches and Tags

**Branches** enable parallel lines of development, allowing teams to work on features, fixes, and experiments without affecting the main codebase. **Tags** mark specific points in history for releases, milestones, or important checkpoints.

## Branches

### What is a Branch?

A branch is an independent line of development that diverges from a base branch:

```sql
-- Main branch timeline
main: A -> B -> C -> D

-- Feature branch from C
feature: C -> E -> F

-- After merge
main: A -> B -> C -> D -> G (merge of F)
```

Each branch maintains its own state, allowing isolated changes that don't affect other branches until merged.

## Creating Branches

### Basic Creation

```sql
-- Create a branch from current HEAD of main
CREATE BRANCH feature/new-login FROM main;

-- Create from specific revision
CREATE BRANCH hotfix/bug-123 FROM main AT '2024-01-14T10:00:00Z';

-- Create from a tag
CREATE BRANCH release/v1.0.1 FROM TAG v1.0;

-- Create empty branch (no history)
CREATE BRANCH experimental FROM NULL;
```

### Branch Metadata

Branches store metadata:

```sql
SELECT
  name,
  base_branch,
  created_at,
  created_by,
  head_revision,
  protected
FROM __branches__
WHERE name = 'feature/new-login';
```

## Switching Branches

### SET BRANCH

Change your current working branch:

```sql
-- Switch to feature branch
SET BRANCH = 'feature/new-login';

-- Verify current branch
SELECT CURRENT_BRANCH();
-- Returns: 'feature/new-login'

-- Switch back to main
SET BRANCH = 'main';
```

**Important**: Switching branches changes the visible data in all queries. All subsequent queries operate on the selected branch until changed.

### Branch Context

```sql
-- Query specific branch without switching
SELECT * FROM default
WHERE __branch = 'feature/new-login';

-- Compare data across branches
SELECT
  main_data.path,
  main_data.properties AS main_props,
  feature_data.properties AS feature_props
FROM
  (SELECT path, properties FROM default WHERE __branch = 'main') main_data
FULL OUTER JOIN
  (SELECT path, properties FROM default WHERE __branch = 'feature/new-login') feature_data
  ON main_data.path = feature_data.path
WHERE main_data.properties != feature_data.properties
   OR main_data.path IS NULL
   OR feature_data.path IS NULL;
```

## Merging Branches

### Basic Merge

```sql
-- Merge feature into main
MERGE BRANCH feature/new-login INTO main;

-- Merge with message
MERGE BRANCH feature/new-login INTO main
MESSAGE 'Add new login functionality';

-- Merge creates a new revision on target branch
SELECT __revision, __message
FROM __revisions__
WHERE __branch = 'main'
ORDER BY __revision DESC
LIMIT 1;
```

### Merge Strategies

RaisinDB uses intelligent automatic merging:

**1. Fast-Forward Merge**

When target hasn't changed since branch creation:

```sql
-- main: A -> B
-- feature: B -> C -> D

MERGE BRANCH feature INTO main;

-- Result (fast-forward):
-- main: A -> B -> C -> D
```

**2. Three-Way Merge**

When both branches have new commits:

```sql
-- main: A -> B -> C
-- feature: B -> D -> E

MERGE BRANCH feature INTO main;

-- Result (merge commit):
-- main: A -> B -> C -> M (merge of C and E)
```

**3. Property-Level Merge**

Non-conflicting property changes auto-merge:

```sql
-- main: {"title": "Updated", "author": "Jane"}
-- feature: {"title": "Updated", "tags": ["new"]}

-- Merged: {"title": "Updated", "author": "Jane", "tags": ["new"]}
```

### Handling Conflicts

When the same property changes differently:

```sql
-- Attempt merge
MERGE BRANCH feature/redesign INTO main;
-- Error: Merge conflict detected

-- View conflicts
SELECT
  path,
  property_name,
  main_value,
  feature_value
FROM __merge_conflicts__
WHERE merge_id = LAST_MERGE_ID();

-- Manually resolve
SET BRANCH = 'main';
UPDATE default
SET properties = properties || '{"title": "Final Resolved Title"}'
WHERE path = '/content/blog/post1';

-- Mark as resolved
RESOLVE CONFLICT '/content/blog/post1' FOR MERGE LAST_MERGE_ID();

-- Complete merge
COMMIT MERGE LAST_MERGE_ID();
```

### Abort Merge

```sql
-- Start merge
MERGE BRANCH feature/complex INTO main;
-- Conflicts detected...

-- Abort merge (rollback)
ABORT MERGE LAST_MERGE_ID();

-- Branch state unchanged
```

## Branch Management

### Listing Branches

```sql
-- All branches
SELECT name, created_at, head_revision
FROM __branches__
ORDER BY created_at DESC;

-- Active branches (with recent commits)
SELECT name, MAX(__timestamp) AS last_commit
FROM __branches__ b
JOIN default d ON d.__branch = b.name
GROUP BY name
HAVING MAX(__timestamp) > NOW() - INTERVAL '7 days';

-- Branches by creator
SELECT name, created_by
FROM __branches__
WHERE created_by = 'user@example.com';
```

### Branch Details

```sql
-- Get branch information
SELECT
  name,
  base_branch,
  created_at,
  created_by,
  head_revision,
  (SELECT COUNT(*) FROM default WHERE __branch = name) AS node_count
FROM __branches__
WHERE name = 'feature/new-login';
```

### Deleting Branches

```sql
-- Delete a merged branch
DROP BRANCH feature/new-login;

-- Force delete (even if unmerged)
DROP BRANCH feature/abandoned FORCE;

-- Delete multiple branches
DROP BRANCH feature/old-1, feature/old-2, feature/old-3;
```

### Renaming Branches

```sql
-- Rename a branch
ALTER BRANCH feature/temp RENAME TO feature/new-name;
```

### Branch Protection

Prevent modifications to critical branches:

```sql
-- Protect production branch
ALTER BRANCH production SET PROTECTED = true;

-- Attempt to modify fails
SET BRANCH = 'production';
UPDATE default SET properties = '{}';
-- Error: Cannot modify protected branch 'production'

-- Allow only specific users (via access control)
GRANT WRITE ON BRANCH production TO ROLE admin;
```

## Tags

### What is a Tag?

A tag is a named pointer to a specific revision, typically used for releases:

```sql
-- Tag current HEAD
CREATE TAG v1.0 ON main AT HEAD;

-- Tag specific revision
CREATE TAG v1.0.1 ON main AT '2024-01-15T14:30:00Z';

-- Tag with annotation
CREATE TAG v2.0 ON main AT HEAD
MESSAGE 'Major release with new features';
```

### Tag Types

**Lightweight Tags**

Simple named pointers:

```sql
CREATE TAG milestone-1 ON main AT HEAD;
```

**Annotated Tags**

With metadata and message:

```sql
CREATE TAG v1.0 ON main AT HEAD
MESSAGE 'First stable release'
METADATA '{
  "release_notes": "https://example.com/v1.0-notes",
  "build": "2024-01-15-001"
}';
```

### Listing Tags

```sql
-- All tags
SELECT name, branch, revision, created_at, message
FROM __tags__
ORDER BY created_at DESC;

-- Tags on specific branch
SELECT name, revision
FROM __tags__
WHERE branch = 'main'
ORDER BY created_at DESC;

-- Find tag by revision
SELECT name FROM __tags__
WHERE revision = 'HLC_TIMESTAMP';
```

### Using Tags

```sql
-- Create branch from tag
CREATE BRANCH hotfix/v1.0-patch FROM TAG v1.0;

-- Query data at tagged revision
SET __revision = (SELECT revision FROM __tags__ WHERE name = 'v1.0');
SELECT * FROM default WHERE path = '/content/blog/post1';

-- Compare current to tagged version
SELECT
  current.properties AS current,
  tagged.properties AS tagged
FROM
  (SELECT properties FROM default WHERE path = '/content/blog/post1') current,
  (SELECT properties FROM default
   WHERE path = '/content/blog/post1'
     AND __revision = (SELECT revision FROM __tags__ WHERE name = 'v1.0')
  ) tagged;
```

### Deleting Tags

```sql
-- Delete a tag
DROP TAG v1.0-beta;

-- Delete multiple tags
DROP TAG v0.1, v0.2, v0.3;
```

### Moving Tags

```sql
-- Move tag to different revision (not recommended for releases)
ALTER TAG v1.0 SET REVISION = '2024-01-16T10:00:00Z';
```

## Branch Strategies

### Feature Branch Strategy

Each feature gets its own branch:

```sql
-- Start feature
CREATE BRANCH feature/user-auth FROM main;
SET BRANCH = 'feature/user-auth';

-- Develop...
INSERT INTO default (path, node_type, properties) VALUES
  ('/config/auth', 'config:Auth', '{"enabled": true}');

-- Complete feature
MERGE BRANCH feature/user-auth INTO main;
DROP BRANCH feature/user-auth;
```

### Release Branch Strategy

Maintain stable release branches:

```sql
-- Create release branch
CREATE BRANCH release/1.x FROM main;

-- Tag release
CREATE TAG v1.0 ON release/1.x AT HEAD;

-- Continue development on main
SET BRANCH = 'main';
-- ... new features for v2.0 ...

-- Hotfix on release
SET BRANCH = 'release/1.x';
UPDATE default SET properties = '{"hotfix": true}';

-- Tag hotfix
CREATE TAG v1.0.1 ON release/1.x AT HEAD;

-- Merge hotfix to main
MERGE BRANCH release/1.x INTO main;
```

### Environment Branch Strategy

One branch per environment:

```sql
-- Create environments
CREATE BRANCH development FROM main;
CREATE BRANCH staging FROM main;
CREATE BRANCH production FROM main;

-- Develop on development
SET BRANCH = 'development';
-- ... changes ...

-- Promote to staging
MERGE BRANCH development INTO staging;

-- Test staging, then promote to production
MERGE BRANCH staging INTO production;

-- Tag production deployment
CREATE TAG deploy-2024-01-15 ON production AT HEAD;
```

### User Branch Strategy

Personal branches for collaboration:

```sql
-- Each user gets a branch
CREATE BRANCH user/jane FROM main;
CREATE BRANCH user/john FROM main;

-- Jane works on her branch
SET BRANCH = 'user/jane';
UPDATE default SET properties = '{"jane_edit": true}';

-- John works on his branch
SET BRANCH = 'user/john';
UPDATE default SET properties = '{"john_edit": true}';

-- Merge both to main
MERGE BRANCH user/jane INTO main;
MERGE BRANCH user/john INTO main;
```

## Advanced Branch Operations

### Branch Comparison

```sql
-- Nodes added in feature branch
SELECT path, properties
FROM default
WHERE __branch = 'feature/new'
  AND path NOT IN (
    SELECT path FROM default WHERE __branch = 'main'
  );

-- Nodes modified in feature branch
SELECT
  f.path,
  m.properties AS main_props,
  f.properties AS feature_props
FROM
  (SELECT path, properties FROM default WHERE __branch = 'main') m
JOIN
  (SELECT path, properties FROM default WHERE __branch = 'feature/new') f
  ON m.path = f.path
WHERE m.properties != f.properties;

-- Count changes
SELECT
  'added' AS change_type,
  COUNT(*) AS count
FROM default
WHERE __branch = 'feature/new'
  AND path NOT IN (SELECT path FROM default WHERE __branch = 'main')
UNION ALL
SELECT
  'modified',
  COUNT(*)
FROM
  (SELECT path FROM default WHERE __branch = 'main') m
JOIN
  (SELECT path, properties FROM default WHERE __branch = 'feature/new') f
  ON m.path = f.path
JOIN
  (SELECT path, properties FROM default WHERE __branch = 'main') m2
  ON m2.path = f.path
WHERE f.properties != m2.properties;
```

### Branch Divergence

Check how far branches have diverged:

```sql
-- Revisions unique to each branch since divergence
SELECT
  COUNT(*) FILTER (WHERE __branch = 'main') AS main_commits,
  COUNT(*) FILTER (WHERE __branch = 'feature/new') AS feature_commits
FROM __revisions__
WHERE __revision > (
  SELECT MAX(r1.__revision)
  FROM __revisions__ r1
  JOIN __revisions__ r2 ON r1.__revision = r2.__revision
  WHERE r1.__branch = 'main' AND r2.__branch = 'feature/new'
);
```

### Stale Branch Detection

Find inactive branches:

```sql
-- Branches with no commits in 30 days
SELECT name, MAX(__timestamp) AS last_commit
FROM __branches__ b
LEFT JOIN default d ON d.__branch = b.name
GROUP BY name
HAVING MAX(__timestamp) < NOW() - INTERVAL '30 days'
   OR MAX(__timestamp) IS NULL;
```

## Best Practices

1. **Use descriptive names**: `feature/user-login` not `my-branch`
2. **Keep branches short-lived**: Merge within days, not weeks
3. **Tag releases**: Mark every production deployment
4. **Delete merged branches**: Keep branch list clean
5. **Protect important branches**: Use protection on main/production
6. **Document merge conflicts**: Leave notes for complex resolutions
7. **Use consistent naming**: Establish conventions (feature/, fix/, release/)
8. **Regular merging**: Sync with base branch frequently

## Branching Patterns

### Temporary Branches

```sql
-- Quick experiment
CREATE BRANCH experiment/test-idea FROM main;
-- ... test ...
DROP BRANCH experiment/test-idea;  -- Discard
```

### Long-Running Branches

```sql
-- Persistent environment branches
CREATE BRANCH development FROM main;
CREATE BRANCH production FROM main;

-- Never delete, continuously merge into them
```

### Branch Hierarchies

```sql
-- Nested feature development
CREATE BRANCH feature/redesign FROM main;
CREATE BRANCH feature/redesign-header FROM feature/redesign;
CREATE BRANCH feature/redesign-footer FROM feature/redesign;

-- Merge sub-features into parent
MERGE BRANCH feature/redesign-header INTO feature/redesign;
MERGE BRANCH feature/redesign-footer INTO feature/redesign;

-- Merge parent into main
MERGE BRANCH feature/redesign INTO main;
```

## Next Steps

- **[Git-Like Workflows](/docs/concepts/versioning/git-like-workflows)** - Common branching workflows
- **[Revisions](/docs/concepts/versioning/revisions)** - Understand the revision model
- **[Branching Guide](/docs/guides/branching/working-with-branches)** - Practical branching scenarios
- **[Access Control](/docs/concepts/access-control)** - Control branch permissions
