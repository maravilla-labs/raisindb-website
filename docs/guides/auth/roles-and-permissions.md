---
sidebar_position: 2
title: Roles and Permissions
description: Configure workspace-scoped RBAC with role inheritance, groups, and content-centric permissions
---

# Roles and Permissions

RaisinDB uses a content-centric, workspace-scoped authorization model. Permissions are defined in terms of content paths and node types — not API endpoints. A permission like `content.articles.**` with operations `[read, update]` directly maps to your content hierarchy.

## Two-Tier Identity Model

RaisinDB separates **global identity** from **workspace-specific users**:

```
┌─────────────────────────────┐
│      Global Identity        │
│  (authentication layer)     │
│                             │
│  identity_id: "id-abc123"   │
│  email: "alice@example.com" │
└──────────────┬──────────────┘
               │
     WorkspaceAccess records
               │
    ┌──────────┼──────────┐
    ▼                     ▼
┌──────────────┐   ┌──────────────┐
│ raisin:User  │   │ raisin:User  │
│ (content ws) │   │ (media ws)   │
│              │   │              │
│ roles:       │   │ roles:       │
│  - editor    │   │  - viewer    │
│ groups:      │   │ groups:      │
│  - team-a    │   │  - team-a    │
└──────────────┘   └──────────────┘
```

- **Global Identity** handles "who are you?" — authentication, email, linked providers
- **Workspace User** handles "what can you do here?" — roles, groups, permissions

A user can be an `editor` in the `content` workspace, a `viewer` in `media`, and have no access to `analytics`. This mirrors how organizations actually divide responsibility over content.

## The raisin:access_control Workspace

Every repository has a built-in `raisin:access_control` workspace that stores all authorization entities as nodes:

```
raisin:access_control/
├── users/
│   ├── system/
│   │   └── anonymous          (raisin:User)
│   ├── alice                  (raisin:User)
│   └── bob                    (raisin:User)
├── roles/
│   ├── system_admin           (raisin:Role)
│   ├── editor                 (raisin:Role)
│   ├── viewer                 (raisin:Role)
│   └── anonymous              (raisin:Role)
└── groups/
    ├── engineering             (raisin:Group)
    └── content-team            (raisin:Group)
```

Because authorization data is stored as regular nodes, it benefits from the same versioning, replication, and query infrastructure as your application data.

## Defining Roles

A role is a named collection of permission grants:

```json
{
  "name": "content-editor",
  "description": "Can manage articles in the content workspace",
  "inherits": ["viewer"],
  "permissions": [
    {
      "workspace": "content",
      "path": "articles/**",
      "operations": ["create", "read", "update", "delete"],
      "node_types": ["blog:Article", "blog:Draft"],
      "except_fields": ["internal_notes"],
      "condition": "node.created_by == auth.user_id"
    },
    {
      "path": "media/**",
      "operations": ["read"],
      "fields": ["title", "url", "thumbnail"]
    }
  ]
}
```

### Permission Structure

Each permission grant contains:

| Field | Description |
|-------|-------------|
| `workspace` | Workspace pattern (glob). Omit for all workspaces. |
| `branch_pattern` | Branch pattern (glob). Omit for all branches. |
| `path` | Content path pattern (`articles/**`, `/users/*/profile`) |
| `node_types` | Restrict to specific node types. Omit for all types. |
| `operations` | Allowed operations: `create`, `read`, `update`, `delete`, `translate`, `relate`, `unrelate` |
| `fields` | Field whitelist — only these fields are accessible |
| `except_fields` | Field blacklist — all fields except these |
| `condition` | REL expression that must evaluate to true (see [Row-Level Security](./row-level-security.md)) |

### Path Patterns

Path patterns use glob-style matching:

| Pattern | Matches | Does Not Match |
|---------|---------|----------------|
| `/articles/*` | `/articles/news` | `/articles/news/2024` |
| `/articles/**` | `/articles`, `/articles/news`, `/articles/a/b/c` | |
| `/users/*/profile` | `/users/alice/profile` | `/users/a/b/profile` |
| `/**/blog/**` | `/blog`, `/foo/blog/post` | |

When multiple permissions match the same node, the most specific pattern wins. Specificity is scored by exact segments (100 pts), single wildcards (10 pts), and recursive wildcards (1 pt).

### Operations

Seven operations can be granted:

| Operation | Description |
|-----------|-------------|
| `create` | Create new nodes |
| `read` | View and query nodes |
| `update` | Modify existing nodes |
| `delete` | Remove nodes |
| `translate` | Modify translations on nodes |
| `relate` | Create relationships between nodes |
| `unrelate` | Remove relationships between nodes |

## Role Inheritance

Roles can inherit from other roles via the `inherits` property:

```
system_admin
    ↑ inherits
  admin
    ↑ inherits
  editor
    ↑ inherits
  viewer
```

A role inherits all permissions from its parent roles, recursively. The system detects and prevents circular inheritance.

### Example

```json
{
  "name": "viewer",
  "permissions": [
    { "path": "**", "operations": ["read"] }
  ]
}

{
  "name": "editor",
  "inherits": ["viewer"],
  "permissions": [
    { "path": "articles/**", "operations": ["create", "update", "delete"] }
  ]
}
```

The `editor` role can read everything (inherited from `viewer`) and create/update/delete articles (its own permissions).

## Groups

Groups provide a layer of indirection between users and roles. Instead of assigning roles to individual users, assign roles to groups and users to groups:

```
User: alice
  groups: ["engineering", "content-team"]

Group: engineering
  roles: ["developer", "viewer"]

Group: content-team
  roles: ["editor"]

Effective roles for alice:
  direct: []
  from groups: ["developer", "viewer", "editor"]
```

**When to use groups vs. direct roles:**

- Use **groups** when multiple users share the same role set and you want to change permissions for all of them at once
- Use **direct roles** for individual exceptions or temporary elevated access

## Permission Resolution Pipeline

When a request arrives, RaisinDB resolves permissions through this pipeline:

```
raisin:User node lookup (by email or identity_id)
    │
    ├── Direct roles (from user.roles)
    │
    ├── Group roles (user.groups → each group.roles)
    │
    ▼
Deduplicate all roles
    │
    ▼
Resolve inheritance (recursive, with cycle detection)
    │
    ▼
Collect permissions from all effective roles
    │
    ▼
ResolvedPermissions (cached for 5 minutes)
```

The result is cached per `(session_id, workspace_id)` with a 5-minute TTL for performance.

### Special Cases

**System admin:** If any effective role is `system_admin`, the user gets full access to everything. All permission checks short-circuit.

**Anonymous access:** Resolved by looking up the `anonymous` user at `/users/system/anonymous`. This goes through the normal resolution pipeline with the `anonymous` role.

## Workspace Access Workflows

Before a user gets roles in a workspace, they need workspace access. Three workflows are supported:

### Request Flow

1. User requests access to a workspace
2. Access request is created with `Pending` status
3. Admin approves or denies
4. On approval: a `raisin:User` node is created, status becomes `Active`

```bash
# Request access
POST /repos/{repo}/access/request

# Admin approves
POST /repos/{repo}/access/approve/{request_id}
```

### Invitation Flow

1. Admin sends an invitation with initial roles
2. Access record created with `Invited` status
3. User accepts or declines
4. On acceptance: `raisin:User` node created, status becomes `Active`

```bash
# Invite a user
POST /repos/{repo}/access/invite
{
  "identity_id": "id-abc123",
  "roles": ["editor"]
}
```

### Direct Grant

For programmatic access (setup scripts, CI/CD), create access that is immediately active:

```bash
POST /repos/{repo}/access/grant
{
  "identity_id": "id-abc123",
  "roles": ["viewer"]
}
```

## Access Settings

Configure workspace access policies:

```yaml
access_settings:
  allow_access_requests: true
  require_approval: true        # false = auto-approve with default_roles
  allow_invitations: true
  default_roles: ["viewer"]
  max_pending_requests: 100
  invitation_expiry_days: 7
```

## Graph-Enhanced Role Resolution

Because roles, groups, and users are stored as nodes in a content graph, RaisinDB can leverage graph traversal for role resolution. Role inheritance is a graph traversal. Group membership is a node property. Permission changes replicate across the cluster through the same CRDT mechanisms as any other data.

For large deployments, the `relates_cache` graph algorithm precomputes relation paths (user → group → role chains), turning runtime graph traversals into cache lookups.

## Next Steps

- [Row-Level Security](./row-level-security.md) — fine-grained access control with REL conditions
- [Authentication Setup](./authentication-setup.md) — configure authentication strategies
