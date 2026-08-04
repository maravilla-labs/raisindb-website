---
sidebar_position: 4
---

# Schema Tables

Four reserved table names read the **type registry** rather than content nodes.
They are how you ask RaisinDB about its own schema from SQL — which node types
exist, what fields an archetype has, what a workspace permits.

| Table | Contents | Writes |
|-------|----------|--------|
| `NodeTypes` | Registered node types | DDL only — `CREATE/ALTER/DROP NODETYPE` |
| `Archetypes` | Page templates | DDL only — `CREATE/ALTER/DROP ARCHETYPE` |
| `ElementTypes` | Content blocks | DDL only — `CREATE/ALTER/DROP ELEMENTTYPE` |
| `Workspaces` | Workspace definitions | **None — read-only** |

```sql
SELECT name, base_node_type, extends, title, fields, meta FROM Archetypes
SELECT name, allowed_children FROM NodeTypes
SELECT name, extends, description, fields, meta FROM ElementTypes
SELECT name, allowed_node_types, allowed_root_node_types FROM Workspaces
```

These names are reserved: a content workspace cannot be called `nodetypes`,
`archetypes`, `elementtypes`, or `workspaces`, because the schema table shadows
it.

:::info Why this matters in server-side functions
Inside a [server-side function](../../guides/functions/creating-functions.md), `raisin.sql`
is the **only** route to schema information — the function runtime has no
workspaces or types binding, and `raisin.asAdmin()` re-exposes only nodes and
SQL. A function that needs to answer "what may be created here?" reads these
tables.
:::

Nothing is cached. Deploy a new archetype and it is visible to the next query,
with no catalog to rebuild.

## Three rules

### Full-table SELECTs only

An equality filter on the primary key plans a point-lookup that bypasses the
schema-table read path and silently returns **no rows**. Read the table and
filter in your own code.

```sql
-- WRONG — returns nothing, with no error
SELECT fields FROM Archetypes WHERE name = 'news:ArticlePage'

-- RIGHT — read all, filter client-side
SELECT name, fields FROM Archetypes
```

### `ElementTypes` has no `title` column

Selecting it errors the whole query. Use `name` and `description`.

### `fields` and `meta` are raw, not merged

The stored `fields` plus `extends` are exposed as-is. If you need the
inheritance-merged schema, walk the `extends` chain yourself, or use the
resolved-archetype endpoint in the HTTP API.

## `Workspaces`

Read-only, and **repo-scoped rather than branch-scoped** — workspaces are shared
across branches and carry no revision history, so time-travel and branch filters
do not apply to this table.

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT | Workspace name (primary key) |
| `description` | TEXT | Optional description |
| `allowed_node_types` | JSONB | Node types permitted anywhere in the workspace |
| `allowed_root_node_types` | JSONB | Node types permitted at the workspace root |
| `depends_on` | JSONB | Workspaces this one depends on |
| `initial_structure` | JSONB | Nodes seeded when the workspace is created |
| `config` | JSONB | Workspace configuration (default branch, node type pins) |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Last modification timestamp |

Writes are rejected. Creating a workspace also builds its nodes table, seeds
`initial_structure` and registers it in the SQL catalog — a row write would do
none of that, so define workspaces in your package's `workspaces/*.yaml` and
install it, or use the management API.

```sql
-- Rejected:
INSERT INTO Workspaces (name) VALUES ('reports')
-- 'Workspaces' is read-only: workspaces are defined by package install
-- (workspaces/*.yaml) or the management API, not by SQL.
```

### Answering "what can be created here?"

`allowed_node_types` / `allowed_root_node_types` are the coarse,
**server-enforced** containment rule. Combined with `NodeTypes.allowed_children`
— structural composition, which applies to a *typed* parent — they are what an
admin UI's create menu is built from:

```sql
-- What may exist in this workspace at all, and at its root?
SELECT name, allowed_node_types, allowed_root_node_types FROM Workspaces

-- What does a given parent type accept as children?
SELECT name, allowed_children FROM NodeTypes
```

The two answer different questions and both apply:

- **Workspace** — scope-wide containment. A generic folder has no opinion of its
  own (the same folder type holds tags in one workspace and pages in another),
  so only the workspace can answer what belongs inside it.
- **`allowed_children`** — structural composition for a type that genuinely
  constrains its children regardless of workspace.

:::note An empty `allowed_children` means "no constraint" to the server
The server skips the check when the list is empty. UIs that *offer* choices
often read empty as "this type is a leaf" instead — if you are building an
offering menu, decide which reading you want and be explicit about it.
:::
