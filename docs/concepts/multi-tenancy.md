---
sidebar_position: 11
---

# Multi-Tenancy

One RaisinDB server can serve many tenants. Each tenant has its own repositories, users and schema, and every storage key is prefixed with the tenant id, so a query for one tenant never reads another tenant's data.

## How a request is assigned to a tenant

The HTTP server reads the tenant from the `x-tenant-id` request header, and checks it against the credential the request carries.

A token is issued for one tenant, and that binding wins. If the header names a different tenant the request is refused with `403`. If the header is absent the request belongs to the token's tenant — not to `default`, which is what an unauthenticated request with no header gets, and what a single-organisation installation uses without ever setting the header.

Two credentials are allowed to name any tenant in the header, because acting across tenants is their purpose: the operator superadmin bearer token, and an admin token whose `can_impersonate` flag is set. Everything else is bound.

```bash
# Explicit tenant
curl http://localhost:8080/api/repositories \
  -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: acme"

# No header: tenant "default"
curl http://localhost:8080/api/repositories -H "Authorization: Bearer $TOKEN"
```

Each client library sets the header for you:

| Client | Where the tenant comes from |
|---|---|
| JavaScript client | The `/sys/{tenant}` segment of the connection URL, for example `raisin://localhost:8080/sys/acme` |
| CLI | `raisindb login --tenant acme` |
| PostgreSQL clients | The connection **username** is the tenant id, the **database** is the repository, and the password is an API key |

A user also logs in against a tenant. The login endpoint carries the tenant in its path, and the token it returns is scoped to that tenant:

```bash
curl -X POST http://localhost:8080/api/raisindb/sys/acme/auth \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
```

An optional `x-deployment-key` header (default `production`) names a deployment environment. It is recorded in the tenant registry and used to track schema initialization per environment; it does not change where data is stored.

## Storage layout

Every key in the store starts with the tenant, then the repository, branch and workspace, separated by null bytes:

```
{tenant}\0{repo}\0{branch}\0{workspace}\0nodes\0{node_id}\0{revision}
```

Reads are prefix scans under the requesting tenant's prefix. This is what makes isolation structural rather than a filter that a query could forget: a scan for `acme` cannot produce a key that starts with `globex`, and deleting or backing up one tenant is a matter of one prefix.

Internally every service takes a scope (`tenant`, `repo`, `branch`, `workspace`) and builds keys from it, so application code above the storage layer never assembles a tenant prefix by hand.

## Tenants, repositories and workspaces

| Level | What it isolates | Example |
|---|---|---|
| Tenant | A customer or organisation. Separate users, repositories and schema. | `acme`, `globex` |
| Repository | A versioned data set inside a tenant, with its own branches. | `website`, `crm` |
| Workspace | A named group of nodes inside a repository. | `site`, `assets`, `raisin:access_control` |

Workspaces organise content and can be secured per role, but they are not a tenancy mechanism: a query can join two workspaces of the same repository, while nothing can join two tenants. Put customers in tenants and content categories in workspaces.

## Provisioning a tenant

A tenant is created by the operator, explicitly. Naming an unknown tenant in `x-tenant-id` does **not** bring it into existence: an unregistered tenant is served, but nothing is registered or seeded on its behalf. The management endpoint creates the tenant's `admin` user and initialises the built-in NodeTypes:

```bash
curl -X POST http://localhost:8080/management/admin/tenants \
  -H "Authorization: Bearer $SUPERADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"tenant_id":"acme"}'
```

```json
{"tenant_id":"acme","admin_username":"admin","admin_password":"<generated>","created_at":"2026-09-06T18:40:48.143999Z"}
```

Pass `admin_password` in the body to choose the password instead of receiving a generated one. The call returns `409` if the tenant already has an admin user. Known tenants are listed with:

```bash
curl http://localhost:8080/api/management/registry/tenants -H "Authorization: Bearer $SUPERADMIN_TOKEN"
```

```json
[{"tenant_id":"default","created_at":"2026-09-06T18:26:23.539874+00:00","last_seen":"2026-09-06T18:39:56.856291+00:00","deployments":[],"metadata":{}}]
```

## Security notes

- Isolation is enforced by key prefixes in the storage layer and applies equally to REST, WebSocket, SQL and the PostgreSQL wire protocol.
- The `x-tenant-id` header cannot overrule the tenant a token was issued for; a disagreement is a `403`.
- Tenant-scoped management endpoints answer `404` rather than `403` when a path names a tenant other than the request's tenant, so the response does not reveal whether the other tenant exists.
- A tenant is never auto-created from a request header. Provisioning is an explicit operator call.
- Revision metadata records the actor of every change, so a tenant's change history can be reviewed from the revision list.

## Next steps

- [Workspaces](/docs/concepts/workspaces) for organising content within a repository
- [Access Control](/docs/concepts/access-control) for users, roles and permissions inside a tenant
- [Replication](./replication) for running several servers
