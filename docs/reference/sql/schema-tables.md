---
sidebar_position: 4
---

# Schema Tables

Four reserved table names read the type registry instead of content nodes. They are how you ask RaisinDB about its own schema from SQL: which node types exist, what fields an archetype declares, what a workspace permits.

| Table | Contents | Writes |
|-------|----------|--------|
| `NodeTypes` | Registered node types (mixins appear here too) | DDL (`CREATE / ALTER / DROP NODETYPE`, `… MIXIN`), or `INSERT / UPDATE / DELETE` with the full JSON body |
| `Archetypes` | Page templates | DDL, or `INSERT / UPDATE / DELETE` with the full JSON body |
| `ElementTypes` | Content blocks | DDL, or `INSERT / UPDATE / DELETE` with the full JSON body |
| `Workspaces` | Workspace definitions | `INSERT / UPDATE` (no `DELETE`) |

Every write to a schema table, and every schema DDL statement, requires an operator: a system context (an API key, a server function) or the `system_admin` role. Anonymous callers and ordinary signed-in users are refused with `Forbidden`. Before v0.6.39 nothing checked this.

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

From v0.6.39 `NodeTypes`, `Archetypes` and `ElementTypes` also take DML with the same JSON a package YAML holds. That is the route for anything the DDL grammar cannot carry — an editor's field `$type` controls and `config`, the `meta.editor` layout — and for a tool that holds a schema as data. `id` is generated when omitted. Structured columns are `JSONB`, so cast the literal:

```sql
INSERT INTO NodeTypes (name, description, properties, allowed_children) VALUES (
  'crm:Deal', 'A sales opportunity',
  '[{"name":"title","type":"String","required":true,"index":["Fulltext"]},
    {"name":"stage","type":"String","index":["Property"]}]'::JSONB,
  '[]'::JSONB
);

INSERT INTO Archetypes (name, base_node_type, title, fields, meta) VALUES (
  'crm:DealPage', 'crm:Deal', 'Deal',
  '[{"$type":"TextField","name":"title","title":"Name","required":true},
    {"$type":"OptionsField","name":"stage","title":"Stage",
     "config":{"options":["lead","won","lost"],"render_as":"Dropdown"}}]'::JSONB,
  '{"editor":{"content":{"layout":[{"type":"grid","columns":2,"children":[
    {"type":"field","name":"title"},{"type":"field","name":"stage"}]}]}}}'::JSONB
);

UPDATE Archetypes SET meta = '{"editor":{}}'::JSONB WHERE name = 'crm:DealPage';
```

A schema-table `UPDATE` or `DELETE` always runs immediately and returns its own result, never as a background bulk job.

Nothing is cached. A type created with DDL or a package install is visible to the next query.

:::info Inside server-side functions
A function's `raisin.sql` binding is the route to schema information: the function runtime has no workspaces or types binding. A function that needs to answer "what may be created here?" reads these tables.
:::

## Columns

### `NodeTypes`

`id`, `name`, `strict`, `extends`, `mixins`, `overrides`, `description`, `icon`, `version`, `properties`, `allowed_children`, `required_nodes`, `initial_structure`, `versionable`, `immutable`, `publishable`, `auditable`, `indexable`, `index_types`, `created_at`, `updated_at`, `published_at`, `published_by`, `previous_version`, `__branch`.

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

`Workspaces` is repository-scoped rather than branch-scoped: workspaces are shared across branches and carry no revision history, so branch filters do not apply.

From v0.6.39 a workspace can be created and changed over SQL. The write goes through the same service as the workspace API, so it also builds the workspace's table and bootstraps its root; the new workspace is queryable in the next statement. Writable columns are `name` (insert only), `description`, `allowed_node_types`, `allowed_root_node_types` and `depends_on`. A name is lowercase letters, digits and `_`, starting with a letter. Every root type must also be an allowed type:

```sql
INSERT INTO Workspaces (name, description, allowed_node_types, allowed_root_node_types)
VALUES ('crm', 'Deals and contacts',
        '["crm:Deal","raisin:Folder"]'::JSONB, '["crm:Deal","raisin:Folder"]'::JSONB);

UPDATE Workspaces SET allowed_node_types = '["crm:Deal","crm:Contact","raisin:Folder"]'::JSONB
 WHERE name = 'crm';
```

`DELETE` is refused: removing a workspace discards every node in it. Configuration (`config`, the default branch) stays with the workspace API.

A package install in `sync` mode that re-states a workspace keeps the types an installation added since, so a runtime `UPDATE` survives the next deploy; `overwrite` mode replaces the definition entirely.

## Filtering schema tables

Any `WHERE` works:

```sql
SELECT fields FROM Archetypes WHERE name = 'news:ArticlePage';
SELECT name, fields FROM Archetypes WHERE name LIKE 'news:%';
```

Before v0.6.39 an equality filter on `name` was planned as a content-index lookup and returned no rows without an error; on those versions read the whole table or filter with `LIKE`.

`fields` and `properties` are stored as declared: `extends` is a name, not a merged result. To see the inheritance-merged schema, walk the `extends` chain yourself or use the resolved-archetype endpoint of the HTTP API.

:::note FIELDS declared with DDL
`CREATE ARCHETYPE ... FIELDS (...)` and `CREATE ELEMENTTYPE ... FIELDS (...)` store the field list, so `Archetypes.fields` and `ElementTypes.fields` read back the converted `FieldSchema` entries. The DDL type vocabulary is the property one and is mapped onto field variants; see [DDL](/docs/reference/sql/statements/ddl) for the table. What DDL still cannot express — a `SectionField`'s `allowed_element_types`, `ENCRYPTED`, a field's `$type` control and `config`, the `meta.editor` layout — is written with an `INSERT` or `UPDATE` carrying the JSON body (above), or in package YAML.
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
