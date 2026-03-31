---
sidebar_position: 1
---

# Git-Like Workflows

RaisinDB brings Git's powerful version control model to your database. Every change is tracked, branches enable parallel development, and merges reconcile concurrent modifications. This enables collaborative workflows familiar to developers while making them accessible to content teams.

## Draft vs Commit Model

RaisinDB distinguishes between two types of content operations:

| Operation | Creates Revision | Use Case |
|-----------|------------------|----------|
| **Draft** (PUT/POST/DELETE) | No | Real-time editing, autosave, collaboration |
| **Commit** (Transaction) | Yes | Releases, deployments, milestones |

**Draft operations** update the workspace's current HEAD without creating a snapshot — like working directory changes in Git. They're fast and immediate.

**Commit operations** create immutable, sequentially numbered revisions (1, 2, 3, ...) that snapshot the entire workspace state. Revisions can be tagged, branched from, or restored.

## The Git Mental Model

If you understand Git, you already understand RaisinDB versioning:

| Git Concept | RaisinDB Equivalent | Description |
|-------------|---------------------|-------------|
| Working directory | Workspace HEAD (mutable) | Current draft state |
| Repository | Repository | Container for all versioned data |
| Branch | Branch | Named pointer to a revision |
| Commit | Revision | Immutable snapshot of workspace state |
| Tag | Tag | Immutable label for a specific revision |
| Merge | Merge / Update branch pointer | Combine changes from different branches |
| Checkout | SET BRANCH | Switch to a different branch |
| Log | Revision history | View change timeline |

## Core Workflow

### 1. Main Branch Development

Start with the main branch:

```sql
-- Connect to repository
\c blog

-- Check current branch
SELECT CURRENT_BRANCH();
-- Returns: 'main'

-- Make changes directly on main
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/post1',
  'blog:Article',
  '{"title": "First Post", "published": false}'
);

-- Each change creates a new revision automatically
SELECT __revision, __timestamp, properties->>'title'
FROM default
WHERE path = '/content/blog/post1'
ORDER BY __revision DESC;
```

### 2. Feature Branch Development

Create a branch for isolated work:

```sql
-- Create a feature branch
CREATE BRANCH feature/new-design FROM main;

-- Switch to the branch
SET BRANCH = 'feature/new-design';

-- Verify current branch
SELECT CURRENT_BRANCH();
-- Returns: 'feature/new-design'

-- Make changes (isolated from main)
UPDATE default
SET properties = properties || '{"layout": "modern"}'
WHERE node_type = 'blog:Article';

-- Switch back to main (changes are isolated)
SET BRANCH = 'main';

-- Query main branch (no layout changes visible)
SELECT properties FROM default WHERE path = '/content/blog/post1';
```

### 3. Merge Changes

Bring feature branch changes into main:

```sql
-- Merge feature branch into main
MERGE BRANCH feature/new-design INTO main;

-- Changes from feature branch now in main
SELECT properties->>'layout' FROM default
WHERE path = '/content/blog/post1';
-- Returns: 'modern'

-- Delete feature branch (optional)
DROP BRANCH feature/new-design;
```

## Common Workflows

### Editorial Workflow

Content teams use branches for editorial stages:

```sql
-- Writer creates draft branch
CREATE BRANCH draft/article-123 FROM main;
SET BRANCH = 'draft/article-123';

-- Write content
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/new-article',
  'blog:Article',
  '{"title": "New Article", "body": "Draft content..."}'
);

-- Editor creates review branch from draft
CREATE BRANCH review/article-123 FROM draft/article-123;
SET BRANCH = 'review/article-123';

-- Editor makes revisions
UPDATE default
SET properties = properties || '{"body": "Revised content..."}'
WHERE path = '/content/blog/new-article';

-- Approve and merge to main
MERGE BRANCH review/article-123 INTO main;

-- Publish
SET BRANCH = 'main';
UPDATE default
SET properties = properties || '{"published": true, "publishedAt": NOW()}'
WHERE path = '/content/blog/new-article';
```

### Environment Branches

Separate development, staging, and production:

```sql
-- Create environment branches
CREATE BRANCH development FROM main;
CREATE BRANCH staging FROM main;
CREATE BRANCH production FROM main;

-- Develop on development branch
SET BRANCH = 'development';
INSERT INTO default (path, node_type, properties) VALUES (
  '/config/feature-flags',
  'config:Settings',
  '{"newFeature": true}'
);

-- Promote to staging
MERGE BRANCH development INTO staging;

-- Test on staging
SET BRANCH = 'staging';
-- ... run tests ...

-- Promote to production
MERGE BRANCH staging INTO production;
```

### Release Workflow

Tag releases for version tracking:

```sql
-- Development on main
SET BRANCH = 'main';
-- ... make changes ...

-- Create release branch
CREATE BRANCH release/v1.0 FROM main;

-- Tag the release
CREATE TAG v1.0 ON release/v1.0 AT HEAD;

-- Continue development on main
SET BRANCH = 'main';
-- ... new features ...

-- Hotfix on release branch
SET BRANCH = 'release/v1.0';
UPDATE default SET properties = properties || '{"hotfix": true}';

-- Tag hotfix
CREATE TAG v1.0.1 ON release/v1.0 AT HEAD;

-- Merge hotfix back to main
MERGE BRANCH release/v1.0 INTO main;
```

### Collaborative Editing

Multiple editors work simultaneously:

```sql
-- Editor 1: Create branch for section A
CREATE BRANCH edit/section-a FROM main;
SET BRANCH = 'edit/section-a';
UPDATE default
SET properties = properties || '{"sectionA": "Updated content"}'
WHERE path = '/content/page';

-- Editor 2: Create branch for section B
CREATE BRANCH edit/section-b FROM main;
SET BRANCH = 'edit/section-b';
UPDATE default
SET properties = properties || '{"sectionB": "Updated content"}'
WHERE path = '/content/page';

-- Merge Editor 1's changes
MERGE BRANCH edit/section-a INTO main;

-- Merge Editor 2's changes (automatic merge if no conflicts)
MERGE BRANCH edit/section-b INTO main;

-- Both edits now in main
SET BRANCH = 'main';
SELECT properties FROM default WHERE path = '/content/page';
-- Contains both sectionA and sectionB updates
```

## Conflict Resolution

When changes conflict, RaisinDB requires manual resolution:

```sql
-- Branch 1: Update title
SET BRANCH = 'branch1';
UPDATE default
SET properties = properties || '{"title": "Title from Branch 1"}'
WHERE path = '/content/blog/post1';

-- Branch 2: Update title differently
SET BRANCH = 'branch2';
UPDATE default
SET properties = properties || '{"title": "Title from Branch 2"}'
WHERE path = '/content/blog/post1';

-- Attempt merge
MERGE BRANCH branch2 INTO branch1;
-- Error: Conflict on /content/blog/post1 property 'title'

-- View conflicts
SELECT * FROM __conflicts__
WHERE merge_id = LAST_MERGE_ID();

-- Resolve manually
SET BRANCH = 'branch1';
UPDATE default
SET properties = properties || '{"title": "Resolved Title"}'
WHERE path = '/content/blog/post1';

-- Mark conflict as resolved
RESOLVE CONFLICT '/content/blog/post1' IN MERGE LAST_MERGE_ID();

-- Complete merge
COMMIT MERGE LAST_MERGE_ID();
```

### Automatic Merge Strategies

RaisinDB uses intelligent merge strategies:

```sql
-- Strategy 1: Non-overlapping properties (auto-merge)
-- Branch A: {"title": "New Title"}
-- Branch B: {"author": "Jane"}
-- Merged: {"title": "New Title", "author": "Jane"}

-- Strategy 2: Array concatenation (auto-merge)
-- Branch A: {"tags": ["tag1", "tag2"]}
-- Branch B: {"tags": ["tag3"]}
-- Merged: {"tags": ["tag1", "tag2", "tag3"]}

-- Strategy 3: Same property, same value (auto-merge)
-- Branch A: {"status": "published"}
-- Branch B: {"status": "published"}
-- Merged: {"status": "published"}

-- Strategy 4: Same property, different values (conflict)
-- Branch A: {"title": "Title A"}
-- Branch B: {"title": "Title B"}
-- Conflict: Manual resolution required
```

## Branch Management

### List Branches

```sql
-- Get all branches
SELECT * FROM __branches__ ORDER BY created_at DESC;

-- Get current branch
SELECT CURRENT_BRANCH();

-- Get branch information
SELECT name, base_branch, created_at, head_revision
FROM __branches__
WHERE name = 'feature/new-design';
```

### Branch Comparison

```sql
-- See changes between branches
SELECT path, properties
FROM default
WHERE __branch = 'feature/new-design'
  AND path NOT IN (
    SELECT path FROM default WHERE __branch = 'main'
  );

-- Count changes per branch
SELECT
  'main' AS branch,
  COUNT(*) AS node_count
FROM default
WHERE __branch = 'main'
UNION ALL
SELECT
  'feature/new-design',
  COUNT(*)
FROM default
WHERE __branch = 'feature/new-design';
```

### Branch Protection

Prevent accidental changes to important branches:

```sql
-- Protect production branch
ALTER BRANCH production SET PROTECTED = true;

-- Attempt to modify fails
SET BRANCH = 'production';
UPDATE default SET properties = '{}';
-- Error: Branch 'production' is protected

-- Unprotect (admin only)
ALTER BRANCH production SET PROTECTED = false;
```

## Advanced Patterns

### Cherry-Pick Changes

Apply specific changes from one branch to another:

```sql
-- Get a specific revision from another branch
SET BRANCH = 'main';

INSERT INTO default
SELECT path, node_type, properties
FROM default
WHERE __branch = 'feature/redesign'
  AND path = '/content/blog/specific-post'
  AND __revision = 'HLC_TIMESTAMP_HERE';
```

### Rebase Branch

Replay branch changes on top of updated base:

```sql
-- Feature branch diverged from main
-- Main has new changes
-- Rebase feature on latest main

-- Create new branch from current main
CREATE BRANCH feature/redesign-rebased FROM main;

-- Apply feature changes on top
SET BRANCH = 'feature/redesign-rebased';

-- Manually replay changes (no automatic rebase in RaisinDB)
-- Apply each change from feature/redesign
```

### Stash Changes

Temporarily save uncommitted work:

```sql
-- Save current state
CREATE BRANCH __stash__/temp-work FROM CURRENT_BRANCH();

-- Switch to other work
SET BRANCH = 'other-branch';
-- ... do other work ...

-- Restore stashed changes
MERGE BRANCH __stash__/temp-work INTO CURRENT_BRANCH();
DROP BRANCH __stash__/temp-work;
```

### Branch Naming Conventions

Follow these patterns for clarity:

```sql
-- Feature branches
feature/new-login-page
feature/user-profiles

-- Bug fix branches
fix/header-alignment
fix/missing-images

-- Release branches
release/v1.0
release/v2.0

-- Hotfix branches
hotfix/security-patch
hotfix/critical-bug

-- User branches (collaborative editing)
user/jane/draft-article
user/john/review-edits

-- Environment branches
development
staging
production
```

## Best Practices

1. **Keep main stable**: Only merge tested, approved changes to main
2. **Use descriptive branch names**: Clear purpose in the name
3. **Delete merged branches**: Clean up after merging (unless tagged)
4. **Merge frequently**: Avoid long-lived branches to reduce conflicts
5. **Tag releases**: Mark important milestones with tags
6. **Protect critical branches**: Use branch protection for production
7. **Document merge conflicts**: Leave notes on complex resolutions
8. **Test before merging**: Verify changes on branch before merging

## Workflow Comparison

### Centralized Workflow

All work happens on main (simple, no branching):

```sql
-- Everyone works on main
SET BRANCH = 'main';

-- Make changes
UPDATE default SET properties = '{}';

-- No branches, no merges
```

**Pros**: Simple, no merge complexity
**Cons**: No isolation, changes immediately visible

### Feature Branch Workflow

Each feature gets its own branch:

```sql
-- Create feature branch
CREATE BRANCH feature/new-feature FROM main;
SET BRANCH = 'feature/new-feature';

-- Develop feature
-- ... changes ...

-- Merge when ready
MERGE BRANCH feature/new-feature INTO main;
```

**Pros**: Isolated work, clean main
**Cons**: Requires merging, potential conflicts

### Gitflow Workflow

Structured branching for releases:

```sql
-- Development branch
CREATE BRANCH develop FROM main;

-- Feature branches from develop
CREATE BRANCH feature/xyz FROM develop;

-- Release branches
CREATE BRANCH release/v1.0 FROM develop;

-- Hotfix from main
CREATE BRANCH hotfix/critical FROM main;
```

**Pros**: Organized, supports releases
**Cons**: Complex, many branches

## Time-Travel Within Workflow

Combine branches with revision history:

```sql
-- View historical state on a branch
SET BRANCH = 'feature/redesign';
SET __revision = '2024-01-14T10:00:00Z';

SELECT * FROM default WHERE path = '/content/blog/post1';

-- Reset to current
SET __revision = DEFAULT;
```

## Next Steps

- **[Branches and Tags](/docs/concepts/versioning/branches-and-tags)** - Deep dive into branching
- **[Revisions](/docs/concepts/versioning/revisions)** - Understand revision history
- **[Branching Guide](/docs/guides/branching/working-with-branches)** - Practical branching scenarios
- **[Access Control](/docs/concepts/access-control)** - Control who can create/merge branches
