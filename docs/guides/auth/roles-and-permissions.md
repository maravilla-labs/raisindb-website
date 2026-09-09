---
sidebar_position: 2
title: Roles and Permissions
description: Create roles, groups and users with SQL, grant and revoke roles, and understand how permissions are resolved
---

# Roles and Permissions

Permissions in RaisinDB are expressed in terms of content: a workspace, a
path pattern, node types and operations. A grant such as `read` and `update`
on `articles/**` in workspace `content` maps directly onto your content tree
rather than onto API endpoints.

Roles, groups and users are nodes in the repository's `raisin:access_control`
workspace, so they are versioned, replicated and queryable like any other
content. The SQL statements below are the usual way to manage them; they
require an admin account or a user with the `system_admin` role.

## Identity and user

Authentication is tenant-wide, authorization is per repository:

- A **global identity** answers "who are you": email, password, linked
  sign-in methods.
- A **`raisin:User` node** in each repository answers "what may you do here":
  its `roles` and `groups` properties.

The same person can be an editor in one repository and a viewer in another.
The user node is created the first time an identity logs in through
`POST /auth/{repo}/login` (see [Authentication Setup](./authentication-setup.md))
with the roles `viewer` and `authenticated_user`.

## Creating a role

```sql
CREATE ROLE 'article-reader'
  DESCRIPTION 'Reads published articles'
  PERMISSIONS (
    ALLOW READ ON 'articles' PATH '**' WHERE node.status == 'published'
  );
```

A grant inside `PERMISSIONS (...)` has the form

```
ALLOW <operations> [ON '<workspace pattern>'] PATH '<path pattern>'
      [BRANCH '<branch pattern>'] [NODE TYPES ('a', 'b')]
      [FIELDS (f1, f2)] [EXCEPT FIELDS (f3)] [WHERE <REL expression>]
```

where `<operations>` is a comma-separated list of `CREATE`, `READ`, `UPDATE`,
`DELETE`, `TRANSLATE`, `RELATE`, `UNRELATE`. Other role statements:

```sql
CREATE ROLE 'senior-reader' INHERITS ('article-reader')
  PERMISSIONS (ALLOW READ ON 'articles' PATH 'archive/**');

ALTER ROLE 'article-reader'
  ADD PERMISSION ALLOW READ, UPDATE ON 'articles' PATH 'public/**'
      NODE TYPES ('raisin:Page') EXCEPT FIELDS (internal_notes);
ALTER ROLE 'article-reader' DROP PERMISSION 1;      -- by position, 0-based
ALTER ROLE 'article-reader' ADD INHERITS ('viewer');
ALTER ROLE 'article-reader' SET DESCRIPTION 'Reads articles';

SHOW ROLES;
DESCRIBE ROLE 'article-reader';
DROP ROLE IF EXISTS 'article-reader';
```

The statement writes a `raisin:Role` node at `/roles/{role_id}`. Its
`permissions` property holds the grants as JSON objects, which is also the
shape to use when a package ships a role as a `.node.yaml` file:

```yaml
node_type: raisin:Role
properties:
  role_id: content-editor
  name: Content editor
  description: Manages articles in the content workspace
  inherits: [viewer]
  permissions:
    - workspace: content
      path: "articles/**"
      operations: [create, read, update, delete]
      node_types: ["blog:Article", "blog:Draft"]
      except_fields: [internal_notes]
      condition: "node.created_by == auth.user_id"
    - path: "media/**"
      operations: [read]
      fields: [title, url, thumbnail]
```

### Grant fields

| Field | Description |
|-------|-------------|
| `workspace` | Workspace pattern (glob). Omit for all workspaces |
| `branch_pattern` | Branch pattern (glob). Omit for all branches |
| `path` | Path pattern, required |
| `node_types` | Only these node types. Omit for all types |
| `operations` | `create`, `read`, `update`, `delete`, `translate`, `relate`, `unrelate` |
| `fields` | Only these properties are returned on reads |
| `except_fields` | All properties except these are returned on reads |
| `condition` | REL expression; see [Row-Level Security](./row-level-security.md) |

The key is `condition`, singular. `conditions` is accepted as an alias and is
translated to the equivalent expression, including the shorthand
`conditions: {owner: "$user.id"}` for "the caller's own content"; see
[the `conditions` spelling](/docs/concepts/access-control#the-conditions-spelling).
A grant with a condition that cannot be understood never applies, so a typo
denies rather than opens the grant up.

Guard every ownership condition with `auth.user_id != null`. REL treats
`null == null` as true, so the bare `node.created_by == auth.user_id` matches
every node with no recorded author when the caller has no user id.

### Path patterns

A leading `/` is optional. `*` matches any characters except `/`, so it stays
within one segment; `**` matches across segments.

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `articles/*` | `/articles/news` | `/articles/news/2024` |
| `articles/**` | `/articles`, `/articles/news`, `/articles/a/b/c` | |
| `users/*/profile` | `/users/alice/profile` | `/users/a/b/profile` |
| `**` | every path | |

When several grants match one node, the operation is allowed if any of them
applies (after its condition, if any). The most specific pattern decides which
`fields` or `except_fields` filter is used. Specificity counts exact segments
highest, then `*`, then `**`.

### Operations

| Operation | Meaning |
|-----------|---------|
| `create` | Create nodes at a matching path |
| `read` | Read and query nodes |
| `update` | Modify existing nodes |
| `delete` | Remove nodes |
| `translate` | Modify translations |
| `relate` | Create relationships between nodes |
| `unrelate` | Remove relationships |

## Role inheritance

A role gets every grant of the roles listed in `inherits`, recursively.
Cycles are tolerated (each role is visited once).

```sql
CREATE ROLE 'viewer-plus' INHERITS ('viewer')
  PERMISSIONS (ALLOW CREATE ON 'content' PATH 'drafts/**');
```

Here `viewer-plus` can read everything (from `viewer`) and create drafts.

## Groups

A group assigns a set of roles to many users at once:

```sql
CREATE GROUP 'readers' DESCRIPTION 'Article readers' ROLES ('article-reader');
ALTER GROUP 'readers' ADD ROLES ('viewer');
ALTER GROUP 'readers' DROP ROLES ('viewer');
SHOW GROUPS;
DESCRIBE GROUP 'readers';
DROP GROUP IF EXISTS 'readers';
```

Prefer groups when several users share a role set; use direct roles for
individual exceptions.

## Users

Users that log in through the identity layer are created automatically. You
can also create users with SQL, for example service accounts or fixtures:

```sql
CREATE USER 'svc-import' EMAIL 'import@example.com' DISPLAY NAME 'Importer'
  ROLES ('editor') GROUPS ('readers');
```

Optional clauses: `CAN LOGIN true|false`, `BIRTH DATE '2000-01-01'`,
`IN FOLDER '/users/service'`. The node is written at `/users/{user_id}`.

Grant and revoke on any user by its path below `/users/`. For a provisioned
identity user that is `internal/{email-slug}`:

```sql
GRANT ROLE 'article-reader' TO USER 'internal/jane-at-example-com';
GRANT GROUP 'readers' TO USER 'internal/jane-at-example-com';
REVOKE ROLE 'viewer' FROM USER 'internal/jane-at-example-com';
GRANT ROLES ('viewer', 'author') TO GROUP 'readers';

ALTER USER 'internal/jane-at-example-com' DROP ROLES ('viewer');
ALTER USER 'internal/jane-at-example-com' SET DISPLAY NAME 'Jane D.';
ALTER USER 'svc-import' SET CAN LOGIN false;

SHOW USERS;
SHOW USERS WITH ROLE 'article-reader';
SHOW USERS IN GROUP 'readers';
DESCRIBE USER 'internal/jane-at-example-com';
DROP USER IF EXISTS 'svc-import';
```

To see what a user ends up with:

```sql
SHOW EFFECTIVE ROLES FOR USER 'internal/jane-at-example-com';
-- role               | source | via
-- authenticated_user | direct | null
-- article-reader     | group  | readers

SHOW PERMISSIONS FOR USER 'internal/jane-at-example-com' ON 'articles';
-- role           | path | operations | workspace
-- article-reader | **   | ["read"]   | articles
```

## How permissions are resolved

For each request the server:

1. Finds the caller's `raisin:User` node (by identity id, email or node id).
2. Collects the node's direct `roles` and the `roles` of each group in
   `groups`.
3. Expands `inherits` recursively.
4. Concatenates the grants of every effective role.

The result is cached for five minutes per user. A user who is already making
requests sees a role change within that window; a user who logs in afterwards
sees it immediately.

Two special cases:

- **`system_admin`**: if it is among the effective roles, every check passes.
- **Anonymous callers**: when anonymous access is enabled, unauthenticated
  requests run as the user at `/users/system/anonymous`, which carries the
  `anonymous` role. Otherwise they get an empty permission set.

## Access requests and invitations

The tenant configuration carries `access_settings` (`allow_access_requests`,
`allow_invitations`, `require_approval`, `default_roles`) and routes exist
under `/repos/{repo}/access/...`, but the request, invitation and approval
flow is not implemented in this release; those routes answer `501`. Grant
access by creating the user node (first login or `CREATE USER`) and assigning
roles as shown above.

## Next steps

- [Row-Level Security](./row-level-security.md) for conditions and field filtering
- [Authentication Setup](./authentication-setup.md)
