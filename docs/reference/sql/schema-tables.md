---
sidebar_position: 4
---

# Schema Tables

Four reserved table names read the type registry instead of content nodes. They are how you ask RaisinDB about its own schema from SQL: which node types exist, what fields an archetype declares, what a workspace permits.

| Table | Contents | Writes |
|-------|----------|--------|
| `NodeTypes` | Registered node types (mixins appear here too) | DDL only: `CREATE / ALTER / DROP NODETYPE`, `CREATE / ALTER / DROP MIXIN` |
| `Archetypes` | Page templates | DDL only: `CREATE / ALTER / DROP ARCHETYPE` |
| `ElementTypes` | Content blocks | DDL only: `CREATE / ALTER / DROP ELEMENTTYPE` |
| `Workspaces` | Workspace definitions | none, read-only |

```sql
SELECT name, extends, description, properties, allowed_children FROM NodeTypes;
SELECT name, base_node_type, extends, title, fields, meta FROM Archetypes;
SELECT name, extends, description, fields, meta FROM ElementTypes;
SELECT name, allowed_node_types, allowed_root_node_types FROM Workspaces;
```

```sql
SELECT name, extends, properties, allowed_children FROM NodeTypes WHERE name LIKE 'docs:%';
```

```json
{"name":"docs:Article","extends":"raisin:Page","properties":[{"name":"summary","type":"String","index":["Fulltext"],"meta":{"label":"Summary"}},{"name":"slug","type":"String","unique":true},{"name":"status","type":"String","default":"draft"}],"allowed_children":["raisin:Asset"]}
```

The names are matched case-insensitively (`nodetypes` and `NodeTypes` are the same table) and they are reserved: a content workspace called `nodetypes`, `archetypes`, `elementtypes` or `workspaces` would be shadowed by the schema table and could not be queried.

A DML statement against a schema table is rejected with a message pointing at the DDL form:

```
INSERT INTO NodeTypes (name, description) VALUES ('docs:X', 'test')
-- Direct DML operations on 'NodeTypes' are not allowed. Use DDL syntax instead: CREATE/ALTER/DROP NODETYPE
```

Nothing is cached. A type created with DDL or a package install is visible to the next query.

:::info Inside server-side functions
A function's `raisin.sql` binding is the route to schema information: the function runtime has no workspaces or types binding. A function that needs to answer "what may be created here?" reads these tables.
:::

## Columns

### `NodeTypes`

`id`, `name`, `strict`, `extends`, `mixins`, `overrides`, `description`, `icon`, `version`, `properties`, `allowed_children`, `required_nodes`, `initial_structure`, `versionable`, `publishable`, `auditable`, `indexable`, `index_types`, `created_at`, `updated_at`, `published_at`, `published_by`, `previous_version`, `__branch`.

`properties` is a JSON array of property definitions (`name`, `type`, `required`, `default`, `unique`, `index`, `items`, `structure`, `meta`). `mixins` lists the mixin names applied to the type.

### `Archetypes`

`id`, `name`, `extends`, `icon`, `title`, `description`, `base_node_type`, `fields`, `initial_content`, `view`, `meta`, `version`, `created_at`, `updated_at`, `published_at`, `published_by`, `publishable`, `previous_version`, `__branch`.

### `ElementTypes`

`id`, `name`, `extends`, `icon`, `description`, `fields`, `meta`, `initial_content`, `layout`, `view`, `version`, and the same timestamp and branch columns. There is no `title` column; selecting one fails the query with `Column not found: ElementTypes.title`. Use `name` and `description`.

### `Workspaces`

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT | Workspace name (primary key) |
| `description` | TEXT | Optional description |
| `allowed_node_types` | JSONB | Node types permitted anywhere in the workspace |
| `allowed_root_node_types` | JSONB | Node types permitted at the workspace root |
| `depends_on` | JSONB | Workspaces this one depends on |
| `initial_structure` | JSONB | Nodes seeded when the workspace is created |
| `config` | JSONB | Workspace configuration (default branch, node type pins) |
| `created_at`, `updated_at` | TEXT | Timestamps |

`Workspaces` is repository-scoped rather than branch-scoped: workspaces are shared across branches and carry no revision history, so branch filters do not apply. Creating a workspace also builds its table, seeds `initial_structure` and registers it in the SQL catalog, which is why it is done through a package's `workspaces/*.yaml` or the workspace API rather than an SQL row:

```
INSERT INTO Workspaces (name) VALUES ('reports')
-- 'Workspaces' is read-only: workspaces are defined by package install (workspaces/*.yaml)
-- or the management API, not by SQL. SELECT here to read allowed_node_types / allowed_root_node_types.
```

## Filtering schema tables

Read the whole table, or filter with `LIKE`. An equality filter on `name` is planned as a point lookup that bypasses the schema-table read path and returns no rows without an error:

```sql
-- returns nothing
SELECT fields FROM Archetypes WHERE name = 'news:ArticlePage';

-- works
SELECT name, fields FROM Archetypes;
SELECT name, fields FROM Archetypes WHERE name LIKE 'news:%';
```

`fields` and `properties` are stored as declared: `extends` is a name, not a merged result. To see the inheritance-merged schema, walk the `extends` chain yourself or use the resolved-archetype endpoint of the HTTP API.

:::note FIELDS declared with DDL
`CREATE ARCHETYPE ... FIELDS (...)` and `CREATE ELEMENTTYPE ... FIELDS (...)` are accepted, but the field list is not stored: `Archetypes.fields` reads back as NULL and `ElementTypes.fields` as `[]`. Archetype and element type fields defined in package YAML are stored in full.
:::

## Answering "what can be created here?"

`Workspaces.allowed_node_types` and `allowed_root_node_types` are the workspace-wide containment rule the server enforces on every write. `NodeTypes.allowed_children` is structural composition for a typed parent. A create menu in an admin UI is built from both:

```sql
-- What may exist in this workspace at all, and at its root?
SELECT name, allowed_node_types, allowed_root_node_types FROM Workspaces;

-- What does a given parent type accept as children?
SELECT name, allowed_children FROM NodeTypes;
```

The two answer different questions and both apply. A generic folder type has no opinion of its own (the same folder holds tags in one workspace and pages in another), so only the workspace can say what belongs inside it; `allowed_children` constrains a type that genuinely limits its children regardless of workspace.

An empty `allowed_children` means "no constraint" to the server, which skips the check. A UI that offers choices may prefer to read an empty list as "this type is a leaf"; decide which reading you want and be explicit about it.
