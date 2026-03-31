---
sidebar_position: 3
title: Row-Level Security
description: Enforce fine-grained access control at query time with REL conditions and field-level filtering
---

# Row-Level Security

RaisinDB enforces permissions at query time through the RLS (Row-Level Security) filter. Every node read from storage passes through this filter before being returned to the caller. This means access control is enforced consistently regardless of whether data is accessed via REST, SQL, WebSocket, or PGWire.

## How the RLS Filter Works

```
Node from storage
        │
        ▼
  System context? ──── yes ──→ Return node (bypass)
        │ no
        ▼
  Permissions resolved? ──── no ──→ Deny
        │ yes
        ▼
  is_system_admin? ──── yes ──→ Return node (bypass)
        │ no
        ▼
  Find matching permission
  (scope + path + operation + node_type)
        │
  ┌─────┴─────┐
  │ no match  │ match found
  │           │
  ▼           ▼
 Deny    Evaluate REL condition
              │
        ┌─────┴─────┐
        │  false    │ true
        │           │
        ▼           ▼
       Deny    Apply field filtering
                    │
                    ▼
              Return filtered node
```

The filter evaluates permissions in order: scope match, path match, operation match, node type match, then condition evaluation. Among all matching permissions, the most specific path pattern wins.

## REL Conditions

REL (Raisin Expression Language) conditions are string expressions attached to permissions that must evaluate to true for the permission to apply. They enable dynamic, runtime access control.

### Available Variables

Two objects are available in REL conditions:

**`auth.*` — the authenticated user:**

| Variable | Type | Description |
|----------|------|-------------|
| `auth.user_id` | String | Global identity ID |
| `auth.local_user_id` | String | Workspace-specific user node ID |
| `auth.email` | String | User's email address |
| `auth.is_anonymous` | Boolean | Whether this is an anonymous request |
| `auth.roles` | Array | Effective role IDs |
| `auth.groups` | Array | Group IDs |
| `auth.home` | String | User's home path in the repository |

**`node.*` — the node being accessed:**

| Variable | Type | Description |
|----------|------|-------------|
| `node.id` | String | Node UUID |
| `node.name` | String | Node name |
| `node.path` | String | Full path in the hierarchy |
| `node.node_type` | String | Node type (e.g., `blog:Article`) |
| `node.created_by` | String | Identity ID of the creator |
| `node.updated_by` | String | Identity ID of the last updater |
| `node.owner_id` | String | Node owner identity ID |
| `node.workspace` | String | Workspace the node belongs to |
| `node.<property>` | Any | Any node property, accessed by key |

Node properties are automatically converted to REL values: strings, numbers, booleans, arrays, and objects are all supported.

### REL Syntax

REL supports standard expression syntax:

- **Comparison:** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Logical:** `&&`, `||`, `!`
- **Property access:** `node.status`, `auth.email`
- **Array indexing:** `node.tags[0]`
- **Functions:** `contains()`, `startsWith()`, `endsWith()`

### Fail-Closed Evaluation

If a REL condition fails to parse or evaluate (e.g., referencing a non-existent variable), the result is `false` — access is **denied**. This is a deliberate security choice to ensure misconfigurations never result in open access.

## Common Patterns

### Users Can Only See Their Own Content

```json
{
  "path": "posts/**",
  "operations": ["read", "update", "delete"],
  "condition": "node.created_by == auth.user_id"
}
```

With this permission, a user can only read, update, or delete posts they created.

### Editors See Everything, Viewers See Published Only

Define two roles:

```json
{
  "name": "editor",
  "permissions": [
    {
      "path": "articles/**",
      "operations": ["read", "update", "create", "delete"]
    }
  ]
}

{
  "name": "viewer",
  "permissions": [
    {
      "path": "articles/**",
      "operations": ["read"],
      "condition": "node.status == 'published'"
    }
  ]
}
```

Editors see all articles. Viewers only see articles where `status` is `published`.

### Ownership OR Admin Access

```json
{
  "path": "content/**",
  "operations": ["update", "delete"],
  "condition": "node.created_by == auth.user_id || auth.roles.contains('admin')"
}
```

Users can modify their own content, and admins can modify anything.

### Group-Based Access

```json
{
  "path": "projects/**",
  "operations": ["read", "update"],
  "condition": "auth.groups.contains('engineering')"
}
```

Only members of the `engineering` group can access project content.

### Home Directory Access

```json
{
  "path": "users/**",
  "operations": ["read", "update"],
  "condition": "node.path.startsWith(auth.home)"
}
```

Users can access content under their own home path.

### Property-Based Restrictions

```json
{
  "path": "documents/**",
  "operations": ["read"],
  "condition": "node.classification != 'confidential' || auth.roles.contains('security-cleared')"
}
```

Confidential documents are only visible to users with the `security-cleared` role.

## Field-Level Filtering

After a matching permission is found and the REL condition passes, field-level filtering controls which properties are visible.

### Field Whitelist

Only the listed fields are returned — all others are stripped:

```json
{
  "path": "users/**",
  "operations": ["read"],
  "fields": ["display_name", "avatar_url", "bio"]
}
```

A viewer with this permission can see user profiles but only the `display_name`, `avatar_url`, and `bio` fields. Sensitive fields like `email`, `phone`, or `internal_notes` are hidden.

### Field Blacklist

All fields are returned except the listed ones:

```json
{
  "path": "articles/**",
  "operations": ["read"],
  "except_fields": ["internal_notes", "admin_comments"]
}
```

Everything is visible except `internal_notes` and `admin_comments`.

If both `fields` and `except_fields` are somehow set, the whitelist takes precedence.

## Structured Conditions

In addition to REL string expressions, RaisinDB supports structured conditions for programmatic use:

| Condition Type | Example |
|---------------|---------|
| `PropertyEquals` | `author == $auth.user_id` |
| `PropertyIn` | `status IN ['draft', 'review']` |
| `PropertyGreaterThan` | `priority > 5` |
| `PropertyLessThan` | `age < 18` |
| `UserHasRole` | Check if user has a specific role |
| `UserInGroup` | Check if user is in a specific group |
| `All` | AND composition of sub-conditions |
| `Any` | OR composition of sub-conditions |

Condition values can be literals or auth variable references (`$auth.user_id`, `$auth.email`).

## Write Operation Checks

The RLS filter also applies to write operations. Before a node can be created, updated, or deleted, the system checks:

- **Update/Delete:** `can_perform(node, operation, auth)` — same matching logic as read filtering but for the requested operation
- **Create:** `can_create_at_path(path, node_type, auth)` — checks permissions against the target path and node type (since no node exists yet)

## Putting It All Together

Here's a complete example of a multi-role setup:

```json
[
  {
    "name": "viewer",
    "permissions": [
      {
        "path": "**",
        "operations": ["read"],
        "condition": "node.status == 'published' || node.created_by == auth.user_id"
      }
    ]
  },
  {
    "name": "author",
    "inherits": ["viewer"],
    "permissions": [
      {
        "path": "articles/**",
        "operations": ["create", "update"],
        "condition": "node.created_by == auth.user_id",
        "except_fields": ["featured", "editor_pick"]
      },
      {
        "path": "articles/**",
        "operations": ["delete"],
        "condition": "node.created_by == auth.user_id && node.status == 'draft'"
      }
    ]
  },
  {
    "name": "editor",
    "inherits": ["author"],
    "permissions": [
      {
        "path": "articles/**",
        "operations": ["create", "read", "update", "delete"]
      },
      {
        "path": "users/*/profile",
        "operations": ["read"],
        "fields": ["display_name", "avatar_url", "bio"]
      }
    ]
  }
]
```

This setup provides:

- **Viewers** can read published content and their own drafts
- **Authors** inherit viewer access, can create and edit their own articles (but not set `featured` or `editor_pick`), and can only delete their own drafts
- **Editors** inherit everything, can manage all articles, and can view basic user profile info

## Security Configuration

The `raisin:SecurityConfig` controls the default security posture:

```yaml
security:
  workspace: "*"              # Applies to all workspaces
  default_policy: "deny"      # Deny when no permission matches
  anonymous_enabled: false     # No unauthenticated access
```

Per-interface overrides let you allow anonymous REST access (for a public website) while requiring authentication for PGWire (internal analytics):

```yaml
security:
  workspace: "content"
  default_policy: "deny"
  anonymous_enabled: true
  anonymous_role: "anonymous"
  interfaces:
    rest:
      anonymous_enabled: true
    pgwire:
      anonymous_enabled: false
    websocket:
      anonymous_enabled: false
```

The default out-of-the-box configuration is deny-all with no anonymous access, ensuring a secure starting point.

## Next Steps

- [Roles and Permissions](./roles-and-permissions.md) — set up RBAC with inheritance and groups
- [Authentication Setup](./authentication-setup.md) — configure authentication strategies
