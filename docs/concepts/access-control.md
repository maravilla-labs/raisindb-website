---
sidebar_position: 12
---

# Access Control

RaisinDB provides **role-based access control (RBAC)** with graph-aware conditions, field-level filtering, and row-level security. Users, groups, and roles are stored as nodes in the `raisin:access_control` workspace and enforced automatically on every data access.

## How It Works

Every request flows through a single enforcement point:

```
Client (REST / SQL / WebSocket / pgwire)
    ↓
  NodeService
    ↓
  RLS Filter  ←  AuthContext (user, roles, groups)
    ↓
  Storage
```

Permissions are resolved once per request from the user's roles (direct + inherited via groups), then cached. The RLS filter matches each operation against path patterns, workspace scopes, node types, and runtime conditions before allowing it through.

## Users

Users are `raisin:User` nodes stored under `/users/` in the `raisin:access_control` workspace.

```yaml
# raisin:User properties
email: "jane@example.com"        # required, unique
display_name: "Jane Developer"   # required
groups: ["editors"]              # group memberships
roles: ["editor"]                # direct role assignments
metadata: {}                     # custom data
```

Each user automatically gets child folders: `profile`, `inbox`, `outbox`, `sent`, and `notifications`.

## Groups

Groups assign roles to collections of users. A user inherits all roles from every group they belong to.

```yaml
# raisin:Group properties
name: "editors"                  # required, unique
description: "Content editors"
roles: ["editor", "reviewer"]    # roles inherited by all group members
```

## Roles

Roles define permissions — what operations are allowed on which paths.

```yaml
# raisin:Role properties
name: "editor"                   # required, unique
description: "Can edit content"
inherits: ["viewer"]             # inherit permissions from other roles
permissions:                     # permission grants (see below)
  - path: "**"
    operations: ["read"]
  - path: "articles/**"
    operations: ["create", "update", "delete"]
```

Roles support **inheritance**: if `editor` inherits from `viewer`, the editor gets all viewer permissions plus its own.

## Permissions

Each permission grant has this structure:

```yaml
- path: "articles/**"                    # glob pattern
  operations: ["create", "read", "update"]
  workspace: "content"                   # optional — scope to workspace
  branch: "main"                         # optional — scope to branch
  node_types: ["Article", "BlogPost"]    # optional — only these types
  fields: ["title", "body", "status"]    # optional — only these properties
  condition: "node.path.startsWith(auth.home)"  # optional — runtime check
```

| Field | Description |
|-------|-------------|
| `path` | Glob pattern: `**` (everything), `users/**` (subtree), `posts/*/comments` (one level) |
| `operations` | `create`, `read`, `update`, `delete`, `translate`, `relate`, `unrelate` |
| `workspace` | Restrict to a specific workspace (glob pattern supported) |
| `branch` | Restrict to a specific branch |
| `node_types` | Only apply to these node types |
| `fields` | Limit which properties the user can see (field-level security) |
| `condition` | REL expression evaluated at runtime (see below) |

## Auth Variables

Conditions can reference the authenticated user via `auth`:

| Variable | Description |
|----------|-------------|
| `auth.local_user_id` | Workspace-specific `raisin:User` node ID |
| `auth.user_id` | Global identity ID |
| `auth.home` | User's home path (e.g., `/users/jane`) |
| `auth.email` | User's email |
| `auth.roles` | Array of effective role IDs |
| `auth.groups` | Array of group IDs |

## Conditions

Conditions are [REL expressions](/docs/reference/rel) evaluated at runtime. They enable ownership checks, path-based rules, and graph-based social access.

### Ownership

```yaml
# User can only read/update their own node
- path: "users/**"
  operations: ["read", "update"]
  condition: "node.id == auth.local_user_id"
```

### Path-Based

```yaml
# User can manage everything under their home path
- path: "users/**/inbox/**"
  operations: ["create", "read", "update", "delete"]
  condition: "node.path.startsWith(auth.home)"
```

### Graph-Based (Social)

Permissions can follow relationships in the graph. This enables patterns like "friends can see my profile":

```yaml
# Friends can read my profile
- path: "users/**/profile"
  operations: ["read"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'"

# Friends-of-friends see limited fields (2 hops)
- path: "users/**/profile"
  operations: ["read"]
  fields: ["display_name", "avatar", "bio"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH' DEPTH 2"

# Public — everyone sees display_name only
- path: "users/**"
  operations: ["read"]
  fields: ["display_name"]
```

The `RELATES` operator traverses relationships in the graph. It supports:
- **Relation type filtering**: `VIA 'FRIENDS_WITH'` or `VIA ['FOLLOWS', 'FRIENDS_WITH']`
- **Depth control**: `DEPTH 2` (up to 2 hops)
- **Direction**: `DIRECTION OUTGOING` or `DIRECTION INCOMING`

## Built-in Roles

RaisinDB ships with three system roles:

### system_admin

Full access to everything:

```yaml
permissions:
  - path: "**"
    operations: ["create", "read", "update", "delete", "translate", "relate", "unrelate"]
```

### anonymous

Read-only access to the `launchpad` workspace (for unauthenticated visitors):

```yaml
permissions:
  - path: "**"
    operations: ["read"]
    workspace: "launchpad"
```

### authenticated_user

Default role for all signed-in users. Includes:
- Read/update own user node and profile
- Read friends' profiles (via `FRIENDS_WITH` relationship)
- Read friends-of-friends' limited profile fields (2 hops)
- Read `display_name` for all users (public)
- Full CRUD on own inbox, outbox, sent, and notifications

## Workspace Organization

```
raisin:access_control/
├── config/
│   └── default          (raisin:SecurityConfig)
├── users/
│   ├── jane             (raisin:User)
│   │   ├── profile      (raisin:Profile)
│   │   ├── inbox        (raisin:MessageFolder)
│   │   ├── outbox       (raisin:MessageFolder)
│   │   ├── sent         (raisin:MessageFolder)
│   │   └── notifications(raisin:Folder)
│   └── system/
│       └── anonymous    (raisin:User)
├── roles/
│   ├── system_admin     (raisin:Role)
│   ├── anonymous        (raisin:Role)
│   └── authenticated_user (raisin:Role)
├── groups/
│   └── editors          (raisin:Group)
├── relation-types/      (raisin:RelationType)
├── circles/             (raisin:EntityCircle)
└── graph-config/
```

## Identity Authentication

RaisinDB supports multiple authentication methods:

| Method | Description |
|--------|-------------|
| Email / password | Built-in local authentication |
| Magic link | Passwordless email login |
| OIDC | Google, Okta, Azure AD, Keycloak, etc. |
| Admin credentials | Database operator accounts |
| JWT | External token authentication |

When a user authenticates, the system:
1. Validates credentials against the `Identity` (global per tenant)
2. Finds or creates a `raisin:User` node in the target workspace (just-in-time provisioning)
3. Links the identity to the workspace via a `WorkspaceAccess` record
4. Issues JWT tokens (short-lived access + rotated refresh)

## Querying Users and Roles

```sql
-- List all users
SELECT path, properties->>'email'::String AS email,
       properties->>'display_name'::String AS display_name
FROM "raisin:access_control"
WHERE node_type = 'raisin:User';

-- Find users with a specific role
SELECT path, properties->>'display_name'::String AS name
FROM "raisin:access_control"
WHERE node_type = 'raisin:User'
  AND properties->'roles' ? 'editor';

-- List all roles
SELECT path, properties->>'name'::String AS role_name,
       properties->>'description'::String AS description
FROM "raisin:access_control"
WHERE node_type = 'raisin:Role';
```

## Best Practices

1. **Use groups** — assign roles to groups, then add users to groups
2. **Inherit roles** — build a hierarchy (e.g. editor inherits viewer) instead of duplicating permissions
3. **Prefer path patterns** — use `articles/**` instead of listing individual node types
4. **Use field filtering** — expose only what's needed for each role
5. **Use graph conditions** for social features — they're evaluated efficiently via precomputed circles

## Next Steps

- [Workspaces](/docs/concepts/workspaces) — Organize content with workspace isolation
- [Graph Model](/docs/concepts/graph-model) — Relationships and graph queries
- [JavaScript Client — Authentication](/docs/reference/javascript-client/connection) — Client-side auth API
- [Flows](/docs/guides/flows/defining-flows) — Automate workflows
