---
sidebar_position: 3
title: Row-Level Security
description: Restrict which nodes a user can see or change with REL conditions, and which properties are returned with field filtering
---

# Row-Level Security

A permission grant can carry a condition that is evaluated per node, and a
list of properties that may be returned. Together they let one role see only
its own drafts, another only published content, and a third only three
fields of a profile. The checks run in the storage layer, so they apply the
same way to REST, SQL, WebSocket subscriptions and `psql`.

## What happens on a read

For every node that a query or a read touches:

1. Callers with a system context or the `system_admin` role get the node
   unchanged.
2. The caller's grants are matched on workspace, path, operation and node
   type, most specific path first.
3. For each matching grant, its `condition` (if any) is evaluated against
   the node and the caller. The first grant whose condition holds allows the
   read. If none does, the node is left out of the result. A path read
   returns `404`; a query simply has fewer rows.
4. The `fields` or `except_fields` of the grant that allowed the read decide
   which properties are returned.

Writes use the same matching for `update`, `delete`, `relate`, `unrelate` and
`translate`. A `create` is checked against the target path and node type,
since the node does not exist yet: a condition on a `create` grant sees only
`node.path`, `node.name` and `node.node_type`, so keep `create` grants free of
conditions on properties or on `created_by`. A denied write fails with
`Permission denied: Cannot create raisin:Page at path '/carol'` or
`Cannot update node at path '/hello'`.

## Conditions

A condition is a [REL](/docs/reference/rel) expression. It has two objects in
scope.

**`auth`, the caller:**

| Variable | Type | Description |
|----------|------|-------------|
| `auth.user_id` | String | Global identity id |
| `auth.local_user_id` | String | Id of the caller's `raisin:User` node in this repository |
| `auth.home` | String | Path of that node |
| `auth.email` | String | Email address |
| `auth.roles` | Array | Effective role ids |
| `auth.groups` | Array | Group ids |
| `auth.is_anonymous` | Boolean | See the warning below -- not the test you want |
| `auth.is_system` | Boolean | True for internal system calls |

:::warning `auth.is_anonymous` does not detect the anonymous user

When anonymous access is enabled, an unauthenticated request runs as the
built-in anonymous `raisin:User` node, and that is a resolved user like any
other: `auth.is_anonymous` is **false** for it, and `auth.user_id` holds that
node's id. The flag is true only for a context that was never resolved onto a
user at all.

To recognise the anonymous caller in a condition, test the role instead:

```
auth.roles.contains('anonymous')
```

To require any signed-in caller, test `auth.user_id != null` together with
that role check. Note also that REL treats `null == null` as true, so
`node.created_by == auth.user_id` matches every unattributed node for a caller
with no user id -- always guard an ownership test with `auth.user_id != null`.
:::

**`node`, the node being checked:**

| Variable | Type | Description |
|----------|------|-------------|
| `node.id` | String | Node id |
| `node.name` | String | Node name |
| `node.path` | String | Full path |
| `node.node_type` | String | Node type, e.g. `blog:Article` |
| `node.created_by`, `node.updated_by` | String | Actor ids |
| `node.owner_id` | String | Owner id, if set |
| `node.workspace` | String | Workspace name |
| `node.<property>` | Any | Every node property by key, e.g. `node.status` |

Syntax:

- Comparison `==`, `!=`, `<`, `<=`, `>`, `>=`; logic `&&`, `||`, `!`
- String literals in single or double quotes, numbers, `true`, `false`,
  `null`, arrays
- Methods on strings and arrays: `contains()`, `startsWith()`, `endsWith()`,
  `length()`, `isEmpty()`, `toLowerCase()`, `indexOf()`, `first()`, `last()`
- Path helpers on strings: `descendantOf(p)`, `childOf(p)`, `parent()`,
  `depth()`
- Graph: `<a> RELATES <b> VIA 'TYPE' [DEPTH n | min..max] [DIRECTION OUTGOING|INCOMING|ANY]`

A condition that does not parse, or that fails to evaluate (for example a
missing property), is treated as false. A misconfigured grant therefore
denies rather than allows.

## Common patterns

Each example is one grant inside a role's `PERMISSIONS (...)` list, or the
equivalent object in a role node's `permissions` property.

### Only published content

```sql
CREATE ROLE 'article-reader' PERMISSIONS (
  ALLOW READ ON 'articles' PATH '**' WHERE node.status == 'published'
);
```

With two pages in `articles`, one `published` and one `draft`:

```sql
-- as a user holding article-reader
SELECT path, properties->>'status'::String AS status FROM 'articles';
-- /hello | published
```

### Own content only

```sql
ALLOW READ, UPDATE, DELETE ON 'content' PATH 'posts/**'
  WHERE node.created_by == auth.user_id
```

### Ownership or a role

```sql
ALLOW UPDATE, DELETE ON 'content' PATH '**'
  WHERE node.created_by == auth.user_id || auth.roles.contains('admin')
```

### Group membership

```sql
ALLOW READ, UPDATE ON 'projects' PATH '**'
  WHERE auth.groups.contains('engineering')
```

### Under the caller's home path

```sql
ALLOW READ, UPDATE ON 'raisin:access_control' PATH 'users/**'
  WHERE node.path.startsWith(auth.home)
```

### Property-based restriction

```sql
ALLOW READ ON 'documents' PATH '**'
  WHERE node.classification != 'confidential' || auth.roles.contains('security-cleared')
```

### Graph relationship

```sql
ALLOW READ ON 'raisin:access_control' PATH 'users/**/profile'
  WHERE node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH' DEPTH 2
```

## Field-level filtering

After a grant allows a read, `fields` keeps only the listed properties and
`except_fields` removes the listed ones. If both are set, `fields` wins.

```sql
CREATE ROLE 'title-only' PERMISSIONS (
  ALLOW READ ON 'articles' PATH '**' FIELDS (title)
);
```

```sql
-- as a user holding title-only
SELECT path, properties FROM 'articles';
-- /hello | {"title":"Hello"}
-- /draft | {"title":"Draft"}
```

```sql
ALLOW READ ON 'articles' PATH '**' EXCEPT FIELDS (internal_notes, admin_comments)
```

Field filtering applies to reads. Whether a write is allowed is decided by
the grant as a whole, not per property.

## A complete setup

```sql
CREATE ROLE 'viewer-published' PERMISSIONS (
  ALLOW READ ON 'articles' PATH '**'
    WHERE node.status == 'published' || node.created_by == auth.user_id
);

CREATE ROLE 'author' INHERITS ('viewer-published') PERMISSIONS (
  ALLOW CREATE ON 'articles' PATH '**',
  ALLOW UPDATE ON 'articles' PATH '**'
    WHERE node.created_by == auth.user_id,
  ALLOW DELETE ON 'articles' PATH '**'
    WHERE node.created_by == auth.user_id && node.status == 'draft'
);

CREATE ROLE 'editor' INHERITS ('author') PERMISSIONS (
  ALLOW CREATE, READ, UPDATE, DELETE ON 'articles' PATH '**',
  ALLOW READ ON 'raisin:access_control' PATH 'users/*/profile'
    FIELDS (display_name, avatar_url, bio)
);
```

- Viewers read published articles and their own.
- Authors additionally create articles, edit their own, and delete only
  their own drafts.
- Editors manage every article and can read three fields of any profile.

## Anonymous access and defaults

With no matching grant the answer is always deny; there is no allow-by-default
mode. Unauthenticated requests are either denied outright or run as the
anonymous user (`/users/system/anonymous`, role `anonymous`), depending on
whether anonymous access is enabled:

1. per repository, by `anonymous_enabled` on a `raisin:RepoAuthConfig` node at
   `/config/repos/{repo}` in the `raisin:system` workspace;
2. otherwise per tenant, by `anonymous_enabled` in
   `PUT /api/tenants/{tenant}/auth/config`;
3. otherwise by the server configuration.

Locks and inventory are the exception to "anonymous runs as the anonymous
user": the lock endpoints refuse that principal outright, whatever the
`anonymous` role grants. See
[Locks & Inventory](../coordination/locks-and-inventory.md).

The `raisin:SecurityConfig` node at `/config/default` in
`raisin:access_control` (managed with `ALTER SECURITY CONFIG` and
`SHOW SECURITY CONFIG`) records a `default_policy` and `anonymous_enabled`,
but in this release those values are not consulted by the enforcement path
described above.

## Next steps

- [Roles and Permissions](./roles-and-permissions.md)
- [Authentication Setup](./authentication-setup.md)
