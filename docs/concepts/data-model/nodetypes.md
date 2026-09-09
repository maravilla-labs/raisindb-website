---
sidebar_position: 2
---

# NodeTypes

A **NodeType** is the schema of a node: which properties it may carry, which of them are required, how they are indexed, what children it accepts, and how it behaves (versioning, publishing, auditing). NodeTypes are stored per branch and are managed through the HTTP API, SQL DDL, the JavaScript client, or YAML files in a package.

## A NodeType definition

This is the JSON the server stores and returns for a NodeType:

```json
{
  "id": "lfnRlKa3eBv_caFu",
  "name": "blog:Article",
  "description": "A blog article",
  "extends": null,
  "strict": null,
  "version": 1,
  "properties": [
    { "name": "title", "type": "String", "required": true, "index": ["Fulltext"] },
    { "name": "tags", "type": "Array", "items": { "type": "String" } },
    { "name": "published_on", "type": "Date" },
    { "name": "rating", "type": "Number", "constraints": { "min": 0, "max": 5 } }
  ],
  "allowed_children": ["raisin:Asset"],
  "initial_structure": null,
  "versionable": true,
  "publishable": true,
  "auditable": null,
  "indexable": null,
  "created_at": "2026-09-06T18:33:16.473456Z",
  "updated_at": "2026-09-06T18:33:16.473456Z",
  "published_at": null,
  "published_by": null,
  "previous_version": null
}
```

The same type as YAML, the form used in packages (this is how the built-in `raisin:Page` is defined):

```yaml
name: raisin:Page
description: A basic content page
icon: description
version: 1
indexable: true
index_types: [Fulltext, Vector]
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext, Vector]
  - name: content
    type: String
    index: [Fulltext, Vector]
allowed_children: []
versionable: true
publishable: true
auditable: true
```

### Top-level fields

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | `namespace:Name`. The namespace is letters only, the name is PascalCase letters only (`^[a-zA-Z]+:(?:[A-Z][a-z]*)+$`). `blog:Article` is valid, `blog:my_type` and `blog:Article2` are not. |
| `description`, `icon` | string | Shown in editors. |
| `extends` | string | Parent NodeType. Properties and allowed children are inherited (single inheritance). |
| `mixins` | string[] | Mixin NodeTypes whose properties are merged in. See [Using Mixins](/docs/guides/data-modeling/using-mixins). |
| `overrides` | object | Property values that override inherited defaults. |
| `strict` | bool | When `true`, a node may only carry declared properties. |
| `properties` | array | Property schemas, see below. |
| `allowed_children` | string[] | NodeTypes allowed as direct children. An empty list allows any type; `"*"` also means any. |
| `required_nodes` | string[] | Stored and returned; not enforced on write. |
| `initial_structure` | object | Children to create automatically under every new node of this type. |
| `versionable`, `publishable`, `auditable` | bool | Behaviour flags, see below. |
| `indexable` | bool | Whether nodes of this type are indexed at all (absent means yes). |
| `index_types` | array | Which indexes the type participates in: `Fulltext`, `Vector`, `Property`, `Spatial`. |
| `compound_indexes` | array | Multi-column indexes for filter + `ORDER BY` queries. See the `COMPOUND_INDEX` clause in [DDL](/docs/reference/sql/statements/ddl). |
| `version`, `previous_version`, `published_at`, `published_by`, `created_at`, `updated_at` | | Managed by the server. |

Unknown top-level keys and unknown property keys are dropped silently on save. Put editor hints in `meta`.

## Property schemas

Each entry in `properties` is an object with these fields:

| Field | Meaning |
|-------|---------|
| `name` | Property key in the node's `properties`. |
| `type` | One of `String`, `Number`, `Boolean`, `Date`, `URL`, `Reference`, `Resource`, `Geometry`, `Array`, `Object`, `Element`, `Composite`, `NodeType`. Lower-case spellings are accepted. |
| `required` | The write is rejected when the key is missing. |
| `unique` | No other node in the workspace may hold the same value. |
| `default` | Default value. |
| `items` | For `Array`: the schema of each element. |
| `structure` | For `Object`: a map of nested property schemas. |
| `allow_additional_properties` | For `Object`: allow keys not listed in `structure`. |
| `constraints` | Free-form map (`min`, `max`, `pattern`, ...). Stored and returned; not enforced on write. |
| `index` | Indexes this property feeds: `Fulltext`, `Vector`, `Property`, `Spatial`. |
| `is_translatable` | The value can differ per locale. |
| `encrypted` | The value is moved to the secret store on write and the property holds a `secret://` reference. |
| `spatial` | Tuning for a `Geometry` property's spatial index. |
| `meta` | Free-form map for editor hints. Stored untouched. |

Nested objects and arrays:

```yaml
properties:
  - name: address
    type: Object
    structure:
      street: { type: String, required: true }
      city: { type: String }
      zip: { type: String, constraints: { pattern: "^\\d{5}$" } }
    allow_additional_properties: false
  - name: tags
    type: Array
    items: { type: String }
```

## What the server enforces

When a node is written, the server checks:

- every `required` property is present,
- with `strict: true`, no undeclared property is present (`$`-prefixed reserved keys are exempt),
- `unique` values do not collide,
- the workspace allows the type (and, at the root, the root type),
- archetype and element type fields, when the node uses them.

Errors come back as HTTP 400 with `code: "VALIDATION_FAILED"`, for example `Undefined property 'extra' in strict mode for NodeType 'blog:Strict'`. Property types and `constraints` are not checked on write; `rating: "nine"` is accepted for a `Number` property. The `POST .../nodetypes/validate` endpoint runs the same checks without writing.

## Creating and changing NodeTypes

**HTTP.** The body wraps the definition in `node_type`; `commit` is optional:

```bash
curl -X POST localhost:8090/api/management/docs-model/main/nodetypes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{
    "node_type": {
      "name": "blog:Article",
      "properties": [
        {"name": "title", "type": "String", "required": true, "index": ["Fulltext"]},
        {"name": "rating", "type": "Number"}
      ],
      "versionable": true, "publishable": true
    },
    "commit": {"message": "Create blog:Article", "actor": "jane"}
  }'
```

`PUT .../nodetypes/blog:Article` with the same body shape replaces the definition and bumps `version`. `DELETE` removes it. The full endpoint list is in the [NodeTypes API](/docs/reference/http-api/nodetypes-api).

**SQL.**

```sql
CREATE NODETYPE 'blog:Author' (
  name  String REQUIRED,
  email String UNIQUE,
  bio   String FULLTEXT,
  born  Date
);

CREATE NODETYPE blog:Guide EXTENDS 'blog:Article'
  PROPERTIES (difficulty String)
  DESCRIPTION 'A how-to article';
```

The DDL supports `EXTENDS`, `MIXINS (...)`, `DESCRIPTION`, `ICON`, `ALLOWED_CHILDREN (...)`, `REQUIRED_NODES (...)`, `COMPOUND_INDEX`, and the flags `VERSIONABLE`, `PUBLISHABLE`, `AUDITABLE`, `INDEXABLE`, `STRICT`. Property modifiers are `REQUIRED`, `UNIQUE`, `FULLTEXT`, `VECTOR`, `PROPERTY_INDEX`, `TRANSLATABLE`, `DEFAULT`, `LABEL`, `DESCRIPTION`, `ORDER`. Array and object types are written `Array OF String` and `Object { street String, city String }`. `ALTER NODETYPE` and `DROP NODETYPE` exist as well; see [Creating NodeTypes](/docs/guides/data-modeling/creating-nodetypes).

**JavaScript.** `db.nodeTypes().create(name, definition, commit?)`, see [Schema Management](/docs/reference/javascript-client/schema-management).

**Packages.** One YAML file per NodeType, installed with the package.

## Inheritance

`extends` names a parent. A child inherits the parent's properties and allowed children, and may add its own. The `resolved` endpoint shows the merged result:

```bash
GET /api/management/docs-model/main/nodetypes/blog:Guide/resolved
```

```json
{
  "node_type": { "name": "blog:Guide", "extends": "blog:Article", "properties": [{"name": "difficulty", "type": "String"}], "...": "..." },
  "resolved_properties": [
    { "name": "difficulty", "type": "String" },
    { "name": "published_on", "type": "Date" },
    { "name": "rating", "type": "Number", "constraints": { "min": 0, "max": 5 } },
    { "name": "tags", "type": "Array", "items": { "type": "String" } },
    { "name": "title", "type": "String", "required": true, "index": ["Fulltext"] }
  ],
  "resolved_allowed_children": ["raisin:Asset"],
  "resolved_mixins": [],
  "inheritance_chain": ["blog:Guide", "blog:Article"]
}
```

A node of type `blog:Guide` gets `"$supertypes": ["blog:Guide", "blog:Article"]`, so `WHERE IS_A(properties, 'blog:Article')` matches guides and articles alike.

`$supertypes` and `$mixins` are stamped by the server on every write, whichever door the write came through: a `POST` to the workspace root or to a node path, a SQL `INSERT` or `UPDATE`, and a WebSocket create all stamp them from the same resolution. Any `$`-prefixed property a client sends is discarded first, so the sets cannot be forged.

## Mixins

A mixin is a NodeType with `is_mixin: true`, managed under `/api/management/{repo}/{branch}/mixins`. Listing a mixin in another type's `mixins` merges its properties in, and the mixin's name appears in `resolved_mixins` and in each node's `$mixins`. `HAS_MIXIN(properties, 'app:Seo')` selects nodes that carry it. See [Using Mixins](/docs/guides/data-modeling/using-mixins).

## Initial structure

`initial_structure.children` describes nodes to create under every new node of this type:

```json
{
  "name": "blog:Section",
  "properties": [],
  "initial_structure": {
    "children": [
      { "name": "drafts", "node_type": "raisin:Folder" },
      { "name": "published", "node_type": "raisin:Folder" }
    ]
  }
}
```

Creating `/news` of type `blog:Section` then yields `/news/drafts` and `/news/published`. Each child entry accepts `name`, `node_type`, `archetype`, `properties`, `translations` and nested `children`. The referenced NodeTypes must exist when the definition is saved.

## Allowed children

`allowed_children` restricts which types may be created directly under a node of this type. An empty list means no restriction, and `"*"` means the same. A named entry matches the child's whole family: a type that extends the named type, or carries it as a mixin, is allowed too. Every write path enforces it — see [Paths and Hierarchy](/docs/concepts/data-model/paths-and-hierarchy#allowed-children).

## Behaviour flags

- **`versionable`** marks the type as content whose revisions matter to editors. Every write to any node produces a revision regardless; the flag drives the version commands (`create_version`, `restore_version`) and editor UI.
- **`publishable`** enables the `publish` / `unpublish` commands, which set `published_at` and `published_by` on the node.
- **`auditable`** writes an audit-log entry on every change (who, what, when), readable at `GET /api/audit/{repo}/{branch}/{ws}/by-id/{id}`. Revision history exists for every node; the audit log is the opt-in part.
- **`indexable`** and **`index_types`** control whether, and in which indexes, nodes of this type appear. A property is only indexed when its own `index` list names the index too.

## Publishing a NodeType

A NodeType can be used by nodes as soon as it exists. Publishing marks a definition as ready for editors: it sets `published_at` and `published_by`, bumps `version`, and makes the type appear in `GET .../nodetypes/published`. Unpublishing clears the two fields. Editors that only offer published types (the Admin Console, Studio) will not show an unpublished one.

```bash
POST /api/management/docs-model/main/nodetypes/blog:Article/publish
POST /api/management/docs-model/main/nodetypes/blog:Article/unpublish
```

## Listing NodeTypes

```bash
GET /api/management/docs-model/main/nodetypes             # all, including the built-in raisin:* types
GET /api/management/docs-model/main/nodetypes/published
GET /api/management/docs-model/main/nodetypes/blog:Article
GET /api/management/docs-model/main/nodetypes/blog:Article/resolved
```

There is no SQL statement for listing NodeTypes.

## Next steps

- **[Nodes](/docs/concepts/data-model/nodes)** for the node JSON and write semantics.
- **[Archetypes](/docs/concepts/data-model/archetypes)** and **[Elements](/docs/concepts/data-model/elements)** for editor-facing structure.
- **[Creating NodeTypes](/docs/guides/data-modeling/creating-nodetypes)** for a step-by-step guide.
