---
sidebar_position: 6
---

# Branch Statements

SQL statements for managing branches and version control in RaisinDB.

## CREATE BRANCH

Create a new branch.

### Syntax

```sql
CREATE BRANCH branch_name
    [ FROM source_branch ]
    [ AT REVISION revision_number ]
    [ DESCRIPTION 'description' ]
    [ PROTECTED ]
    [ UPSTREAM upstream_branch ]
    [ WITH HISTORY ]
```

### Examples

```sql
-- Create a simple branch from current branch
CREATE BRANCH feature_auth;

-- Create from a specific branch
CREATE BRANCH hotfix_login FROM main;

-- Create at a specific revision
CREATE BRANCH rollback_v2 FROM main AT REVISION 42;

-- Create with description
CREATE BRANCH feature_search
    FROM main
    DESCRIPTION 'Add full-text search to products';

-- Create a protected branch
CREATE BRANCH production
    FROM main
    PROTECTED
    DESCRIPTION 'Production release branch';

-- Create with upstream tracking
CREATE BRANCH feature_ui
    FROM develop
    UPSTREAM develop;

-- Create with full history
CREATE BRANCH audit_copy
    FROM main
    WITH HISTORY;
```

---

## DROP BRANCH

Delete a branch.

### Syntax

```sql
DROP BRANCH [ IF EXISTS ] branch_name
```

### Examples

```sql
-- Drop a branch
DROP BRANCH feature_old;

-- Drop if exists (no error if missing)
DROP BRANCH IF EXISTS temporary_branch;
```

---

## ALTER BRANCH

Modify branch settings.

### Syntax

```sql
ALTER BRANCH branch_name
    RENAME TO new_name
    | SET UPSTREAM upstream_branch
    | UNSET UPSTREAM
    | SET PROTECTED
```

### Examples

```sql
-- Rename a branch
ALTER BRANCH feature_auth RENAME TO feature_authentication;

-- Set upstream branch for tracking
ALTER BRANCH feature_ui SET UPSTREAM develop;

-- Remove upstream tracking
ALTER BRANCH feature_ui UNSET UPSTREAM;

-- Mark branch as protected
ALTER BRANCH release_v2 SET PROTECTED;
```

---

## MERGE BRANCH

Merge one branch into another.

### Syntax

```sql
MERGE BRANCH source_branch INTO target_branch
    [ USING strategy ]
```

### Merge Strategies

- Default merge strategy is used when no strategy is specified

### Examples

```sql
-- Merge feature branch into main
MERGE BRANCH feature_auth INTO main;

-- Merge with explicit strategy
MERGE BRANCH hotfix INTO main USING 'recursive';
```

---

## USE BRANCH / CHECKOUT BRANCH

Switch the active branch for the current connection.

### Syntax

```sql
USE BRANCH branch_name
CHECKOUT BRANCH branch_name
```

### Examples

```sql
-- Switch to a branch
USE BRANCH feature_auth;

-- Equivalent syntax
CHECKOUT BRANCH feature_auth;

-- Switch back to main
USE BRANCH main;
```

---

## USE LOCAL BRANCH

Switch the active branch for the current session only, without affecting the workspace default.

### Syntax

```sql
USE LOCAL BRANCH branch_name
```

### Examples

```sql
-- Switch branch for this session only
USE LOCAL BRANCH feature_preview;
```

---

## Transaction Control

### BEGIN

Start a transaction.

```sql
BEGIN;
```

### COMMIT

Commit a transaction with optional metadata.

### Syntax

```sql
COMMIT [ MESSAGE 'commit message' ] [ ACTOR 'actor_name' ]
```

### Examples

```sql
-- Simple commit
BEGIN;
INSERT INTO products (name, price) VALUES ('Widget', 9.99);
COMMIT;

-- Commit with message
BEGIN;
UPDATE products SET price = 12.99 WHERE name = 'Widget';
COMMIT MESSAGE 'Update widget pricing';

-- Commit with message and actor
BEGIN;
DELETE FROM products WHERE status = 'discontinued';
COMMIT MESSAGE 'Remove discontinued products' ACTOR 'admin';
```

---

## SET

Configure session settings.

### Syntax

```sql
SET validate_schema = true | false
```

### Examples

```sql
-- Enable schema validation
SET validate_schema = true;

-- Disable schema validation (for bulk imports)
SET validate_schema = false;
```

---

## Examples

### Feature Branch Workflow

```sql
-- Create feature branch
CREATE BRANCH feature_new_ui FROM main;

-- Switch to it
USE BRANCH feature_new_ui;

-- Make changes
INSERT INTO pages (title, content)
VALUES ('New Design', 'Updated UI components');

COMMIT MESSAGE 'Add new UI pages';

-- Merge back to main
MERGE BRANCH feature_new_ui INTO main;

-- Clean up
DROP BRANCH feature_new_ui;
```

### Protected Branch Setup

```sql
-- Create and protect release branches
CREATE BRANCH release_v1
    FROM main
    PROTECTED
    DESCRIPTION 'Version 1.0 release';

-- Set upstream tracking
ALTER BRANCH release_v1 SET UPSTREAM main;
```

### Review Changes on Branch

```sql
-- Switch to branch and query data
USE LOCAL BRANCH feature_preview;

-- View data on this branch
SELECT * FROM products WHERE status = 'new';

-- Switch back (session-only change reverts automatically)
```

---

## Notes

- Branch names are case-sensitive
- Protected branches cannot be deleted without removing protection first
- `USE BRANCH` affects the connection; `USE LOCAL BRANCH` affects only the session
- `CHECKOUT BRANCH` is an alias for `USE BRANCH`
- Merge conflicts may require manual resolution
- Each commit increments the revision counter
- `COMMIT MESSAGE` and `COMMIT ACTOR` are optional metadata
