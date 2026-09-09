---
sidebar_position: 12
---

# Access Control

RaisinDB uses role-based access control with row-level conditions and
field-level filtering. Users, groups and roles are ordinary nodes in the
`raisin:access_control` workspace of each repository, and permissions are
checked in the storage layer, so the same rules apply to REST, SQL, WebSocket
and the PostgreSQL wire protocol.

## How it works

Every request carries an authentication context: the caller's identity, the
`raisin:User` node that represents them in this repository, and the
permissions resolved from that user's roles (direct roles plus the roles of
every group they belong to). When a node is read, updated, deleted or created,
the storage layer looks for a permission that covers the operation, the
workspace, the path and the node type. If that permission carries a condition,
the condition is evaluated against the node and the caller. If nothing
matches, the operation is denied.

Resolved permissions are cached for five minutes per user. A role or group
change therefore applies to a user who is already active within five minutes,
and immediately to a user who logs in afterwards.

## Users

A `raisin:User` node represents one person in one repository. Its main
properties:

| Property | Meaning |
|----------|---------|
| `user_id` | The identity id from the authentication layer (or the id you choose for a SQL-created user) |
| `email` | Required, unique |
| `display_name` | Required |
| `status` | `active` by default |
| `roles` | Role ids assigned directly |
| `groups` | Group ids the user belongs to |
| `can_login` | Defaults to `true` |

Identity users are provisioned automatically the first time they log in
through a repository-scoped route such as `POST /auth/{repo}/login`. The node
is created at `/users/internal/{email-slug}` (for `jane@example.com` that is
`/users/internal/jane-at-example-com`) with the roles `viewer` and
`authenticated_user`. Users created with SQL live at `/users/{user_id}`.

Each user node gets child nodes `profile`, `inbox`, `outbox`, `sent` and
`notifications`.

## Groups

A `raisin:Group` assigns roles to a set of users. A user inherits every role
of every group they belong to.

| Property | Meaning |
|----------|---------|
| `group_id` | Required, unique. This is what a user's `groups` list refers to |
| `name` | Display name |
| `description` | Free text |
| `roles` | Role ids granted to all members |

## Roles

A `raisin:Role` is a named list of permission grants.

| Property | Meaning |
|----------|---------|
| `role_id` | Required, unique. This is what `roles` lists on users and groups refer to |
| `name` | Display name |
| `description` | Free text |
| `inherits` | Role ids whose permissions this role also gets |
| `permissions` | The grants, see below |

Users and groups reference roles by `role_id`, and users reference groups by
`group_id`. Node paths are not used for these references.

## Permissions

Each entry in a role's `permissions` array has this shape:

```yaml
- path: "articles/**"                  # required, glob over the node path
  operations: ["create", "read", "update"]   # required
  workspace: "content"                 # optional, glob over workspace names
  branch_pattern: "main"               # optional, glob over branch names
  node_types: ["blog:Article"]         # optional, only these node types
  fields: ["title", "body"]            # optional, only these properties are returned
  except_fields: ["internal_notes"]    # optional, all properties except these
  condition: "node.status == 'published'"   # optional, evaluated per node
```

| Field | Description |
|-------|-------------|
| `path` | Glob pattern. A leading `/` is optional. `*` matches within one path segment, `**` matches across segments |
| `operations` | Any of `create`, `read`, `update`, `delete`, `translate`, `relate`, `unrelate` |
| `workspace` | Restrict to matching workspaces. Omit for all workspaces |
| `branch_pattern` | Restrict to matching branches. Omit for all branches |
| `node_types` | Restrict to these node types |
| `fields` | Return only these properties on reads |
| `except_fields` | Return everything except these properties on reads |
| `condition` | A REL expression that must be true for the grant to apply |

Grants are additive. When several grants match a node, the operation is
allowed if any one of them applies; the most specific path pattern decides
which field filter is used.

## Conditions

A condition is a [REL expression](/docs/reference/rel). It can refer to the
caller through `auth` and to the node through `node`.

| Variable | Description |
|----------|-------------|
| `auth.user_id` | Global identity id |
| `auth.local_user_id` | Id of the caller's `raisin:User` node in this repository |
| `auth.home` | Path of that user node, for example `/users/internal/jane-at-example-com` |
| `auth.email` | Email address |
| `auth.roles` | Effective role ids |
| `auth.groups` | Group ids |
| `auth.is_anonymous` | Whether the caller is the anonymous user |
| `node.id`, `node.name`, `node.path`, `node.node_type` | Node identity |
| `node.created_by`, `node.updated_by`, `node.owner_id`, `node.workspace` | Node metadata |
| `node.<property>` | Any node property, for example `node.status` |

Examples:

```yaml
# Only the caller's own user node
- path: "users/**"
  operations: ["read", "update"]
  condition: "node.id == auth.local_user_id"

# Everything under the caller's home path
- path: "users/**/inbox/**"
  operations: ["create", "read", "update", "delete"]
  condition: "node.path.startsWith(auth.home)"

# Friends can read my profile, friends of friends see three fields
- path: "users/**/profile"
  operations: ["read"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'"
- path: "users/**/profile"
  operations: ["read"]
  fields: ["display_name", "avatar", "bio"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH' DEPTH 2"
```

`RELATES` follows relationships in the graph. It accepts `VIA 'TYPE'` or
`VIA ['A', 'B']`, `DEPTH n` (or `DEPTH min..max`), and `DIRECTION OUTGOING`,
`DIRECTION INCOMING` or `DIRECTION ANY`. The default is one hop in either
direction.

A condition that fails to parse or evaluate counts as false, so a
misconfigured grant denies rather than allows.

### The `conditions` spelling

The key the grant is read from is `condition`, singular. A grant written with
`conditions` is also accepted and is translated to the equivalent REL
expression, so roles authored either way behave the same:

```yaml
# These two grants are identical.
- path: "**"
  operations: ["update", "delete"]
  conditions:
    owner: "$user.id"

- path: "**"
  operations: ["update", "delete"]
  condition: "auth.user_id != null && (node.owner_id == auth.user_id || (node.owner_id == null && node.created_by == auth.user_id))"
```

`owner` is the ownership test rather than a property lookup: a node's owner is
`owner_id` when that is set, and its author otherwise. Any other key becomes a
property comparison, so `status: "published"` means
`node.status == 'published'`. The values `$user.id`, `$user.local_id`,
`$user.email` and `$user.home` resolve to the matching `auth` variable, and
anything else is a literal.

Translation fails closed. A `conditions` block that cannot be translated -- an
unrecognised `$variable`, for instance -- becomes a grant that never applies,
never a grant with no condition at all.

## Built-in roles

Every repository starts with these roles:

| Role | Grants |
|------|--------|
| `system_admin` | All seven operations on every path. Permission checks are skipped for this role |
| `anonymous` | `read` on the `launchpad` workspace. Used for unauthenticated callers when anonymous access is enabled |
| `authenticated_user` | Read and update of the caller's own user node, profile, inbox, outbox, sent and notifications; friends' profiles through `FRIENDS_WITH`; `display_name` of every user |
| `viewer` | `read` on every path |
| `editor` | `create`, `read`, `update`, `delete` and `translate` on every path |
| `author` | `create` and `read` on every path, plus `update` and `delete` on the author's own content only |

`viewer`, `author` and `editor` come from the built-in `raisin-auth` package.
Use `DESCRIBE ROLE 'author'` to see the exact grants before relying on them.

The `author` role's ownership rule is a condition on its `update` and `delete`
grant, and a node counts as the caller's own when `owner_id` names them, or
when `owner_id` is unset and `created_by` names them. A node with neither
belongs to nobody, so no author can modify it.

## Workspace layout

```
raisin:access_control/
├── config/
│   ├── default              (raisin:SecurityConfig)
│   └── stewardship          (raisin:StewardshipConfig)
├── users/
│   ├── internal/
│   │   └── jane-at-example-com   (raisin:User, provisioned at first login)
│   │       ├── profile      (raisin:Profile)
│   │       ├── inbox        (raisin:MessageFolder)
│   │       ├── outbox       (raisin:MessageFolder)
│   │       ├── sent         (raisin:MessageFolder)
│   │       └── notifications (raisin:Folder)
│   └── system/
│       └── anonymous        (raisin:User)
├── roles/
│   ├── system_admin, anonymous, authenticated_user
│   └── viewer, author, editor
├── groups/
├── relation-types/          (raisin:RelationType, e.g. friends-with, follows)
├── circles/
└── graph-config/
```

## Identity authentication

Authentication is handled by a tenant-wide identity layer. An identity is one
person with an email address and a password (or a magic link). Logging in
through a repository-scoped route provisions the matching `raisin:User` node
and puts its path into the token's `home` claim. Tokens are JWTs: a one-hour
access token and a thirty-day refresh token. See
[Authentication Setup](/docs/guides/auth/authentication-setup).

## Querying users and roles

SQL has dedicated statements for the access-control workspace:

```sql
SHOW ROLES;
DESCRIBE ROLE 'editor';
SHOW GROUPS;
SHOW USERS WITH ROLE 'editor';
SHOW USERS IN GROUP 'readers';
SHOW EFFECTIVE ROLES FOR USER 'internal/jane-at-example-com';
SHOW PERMISSIONS FOR USER 'internal/jane-at-example-com' ON 'articles';
```

`SHOW EFFECTIVE ROLES` returns one row per role with its `source` (`direct` or
`group`) and, for group roles, the group in `via`. The nodes can also be
queried like any other workspace:

```sql
SELECT path, properties->>'email'::String AS email,
       properties->>'roles' AS roles
FROM 'raisin:access_control'
WHERE node_type = 'raisin:User';
```

See [Roles and Permissions](/docs/guides/auth/roles-and-permissions) for the
statements that create and change roles, groups and users.

## Next steps

- [Roles and Permissions](/docs/guides/auth/roles-and-permissions)
- [Row-Level Security](/docs/guides/auth/row-level-security)
- [Workspaces](/docs/concepts/workspaces)
- [Graph Model](/docs/concepts/graph-model)
