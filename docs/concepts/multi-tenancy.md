---
sidebar_position: 11
---

# Multi-Tenancy

RaisinDB supports multi-tenancy through storage key prefixing and scoped services, allowing multiple customers to share a single deployment with complete data isolation.

## Isolation Modes

RaisinDB offers three isolation modes to match your requirements:

### Single Tenant

No tenant prefix — keys are stored directly. Suitable for simple applications or embedded usage.

```
nodes:default:node-1
nodes:default:node-2
```

**Use when:** Single organization, embedded database, prototyping.

### Shared Database (Recommended)

All tenants share one database instance. Data isolation is achieved through automatic key prefixing:

```
/acme/production/nodes:default:node-1
/acme/production/nodes:default:node-2
/techco/production/nodes:default:node-1
```

Each tenant's data is logically isolated. Prefix scans are efficient — querying Acme's data never touches TechCo's keys.

**Use when:** SaaS applications, cost-effective multi-tenancy, easy tenant provisioning.

### Dedicated Database

Each tenant gets their own physical database instance. Complete hardware-level isolation.

**Use when:** Enterprise customers, strict compliance requirements, independent scaling needs.

## Storage Prefix Pattern

In shared database mode, every storage key is prefixed with `/{tenant_id}/{deployment}/`:

```
/acme/production/nodes:content:page-1      # Acme's production page
/acme/preview/nodes:content:page-1         # Acme's preview page
/techco/production/nodes:content:page-1    # TechCo's production page
```

This enables:
- Complete logical isolation between tenants
- Efficient prefix scans (fast queries within a tenant)
- Simple per-tenant backup and deletion
- Separate deployment environments (production, staging, preview)

## ScopedStorage

The `ScopedStorage` wrapper automatically applies the tenant prefix to all storage operations. Business logic code doesn't need to know about multi-tenancy:

```
Your code calls: get_node("content", "page-1")
ScopedStorage translates to: get("/acme/production/nodes:content:page-1")
```

This is transparent — the same business logic works in single-tenant and multi-tenant mode without changes.

## Tenant Resolution

RaisinDB uses a pluggable `TenantResolver` to extract tenant identity from incoming requests:

### Subdomain Resolver

Extracts the tenant from the request subdomain:

```
acme.myapp.com    → tenant: "acme"
techco.myapp.com  → tenant: "techco"
```

### Fixed Resolver

Always returns the same tenant — useful for single-tenant deployments:

```
any request → tenant: "default"
```

### Custom Resolvers

Implement your own resolver for JWT tokens, API keys, headers, or any other scheme.

## Workspaces vs Tenancy

Workspaces and tenancy are orthogonal concepts:

| Concept | Purpose | Example |
|---------|---------|---------|
| **Tenant** | Isolate different customers | Acme Corp, TechCo |
| **Deployment** | Isolate environments per tenant | production, staging, preview |
| **Workspace** | Organize content within a repository | content, media, users |

Each tenant can have multiple deployments, and each deployment can have multiple workspaces:

```
/acme/production/
  ├── nodes:content:page-1      # Acme's website pages
  ├── nodes:media:logo           # Acme's media assets
  └── nodes:users:jane           # Acme's users
/acme/staging/
  ├── nodes:content:page-1      # Acme's staging pages
  └── nodes:media:logo           # Acme's staging assets
/techco/production/
  ├── nodes:content:page-1      # TechCo's website pages
  └── nodes:users:admin          # TechCo's users
```

## Deployment Environments

Each tenant can have multiple deployment environments:

| Environment | Purpose |
|-------------|---------|
| `production` | Live customer data |
| `staging` | Pre-production testing |
| `preview` | Content preview |
| `dev` | Development |
| `feature-x` | Feature branch environment |

Changes to one environment never affect another.

## Security

- **Automatic isolation**: `ScopedStorage` makes it structurally impossible to access another tenant's data through normal APIs
- **Type-safe at compile time**: The Rust type system enforces that scoped services can only access their tenant's data
- **No cross-tenant queries**: Standard SQL queries are always scoped to the authenticated tenant
- **Audit support**: All operations can be logged with tenant context for compliance

## Next Steps

- [Replication](./replication) — Multi-master CRDT replication across nodes
- [Workspaces](/docs/concepts/workspaces) — Organizing content within a repository
