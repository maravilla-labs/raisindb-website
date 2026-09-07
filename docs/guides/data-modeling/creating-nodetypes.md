---
sidebar_position: 1
---

# Creating NodeTypes

A NodeType is the schema for a kind of node. It names the properties a node of
that type carries, which of them are required or unique, how they are indexed,
which child types the node may contain, and a few behaviour flags such as
`versionable` and `publishable`.

NodeType names take the form `namespace:Name`: a lowercase namespace, a colon,
and a PascalCase name (`blog:Article`, `shop:Product`). Digits and underscores
are not accepted in the name.

There are three ways to create one. All three produce the same stored object.

## Via SQL

The `CREATE NODETYPE` statement is the quickest way to add a type. Run it
through the SQL endpoint or through `psql`:

```bash
curl -s -X POST http://localhost:8090/api/sql/myrepo \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d @- <<'EOF'
{"sql": "CREATE NODETYPE 'blog:Article' (
  title String REQUIRED FULLTEXT,
  slug String REQUIRED UNIQUE,
  body String FULLTEXT,
  published_on Date,
  tags Array OF String,
  author Reference
) DESCRIPTION 'A blog article' ALLOWED_CHILDREN ('raisin:Asset') VERSIONABLE PUBLISHABLE"}
EOF
```

```json
{"columns":["result","success"],"rows":[{"result":"NodeType 'blog:Article' created","success":true}],"row_count":1,"execution_time_ms":1}
```

The property list can also follow a `PROPERTIES` keyword, which is the form to
use when the type has an `EXTENDS` or `MIXINS` clause:

```sql
CREATE NODETYPE 'blog:Guide' EXTENDS 'blog:Article'
  MIXINS ('myapp:Seo')
  PROPERTIES (difficulty String)
  ICON 'book';
```

Property types accepted by the DDL are `String`, `Number`, `Boolean`, `Date`,
`URL`, `Reference`, `Resource`, `Element`, `Composite`, `NodeType`,
`Array OF <type>` and `Object { name Type, ... }`. A bare `Array` without `OF`
is a parse error.

Per-property modifiers: `REQUIRED`, `UNIQUE`, `FULLTEXT`, `VECTOR`,
`PROPERTY_INDEX`, `TRANSLATABLE`, `DEFAULT <value>`, `LABEL '...'`,
`DESCRIPTION '...'`, `ORDER <n>`, `ALLOW_ADDITIONAL_PROPERTIES`.

Type-level clauses: `EXTENDS '...'`, `MIXINS ('a', 'b')`, `DESCRIPTION '...'`,
`ICON '...'`, `ALLOWED_CHILDREN ('...')`, `REQUIRED_NODES ('...')`,
`COMPOUND_INDEX 'name' ON (col, col DESC)`, and the flags `VERSIONABLE`,
`PUBLISHABLE`, `AUDITABLE`, `INDEXABLE`, `STRICT`.

## Via HTTP

`POST /api/management/{repo}/{branch}/nodetypes` takes the NodeType wrapped in
a `node_type` key. An optional `commit` object records a message and actor for
the schema revision.

```bash
curl -s -X POST http://localhost:8090/api/management/myrepo/main/nodetypes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "node_type": {
      "name": "blog:Article",
      "description": "A blog article",
      "properties": [
        {"name": "title", "type": "String", "required": true, "index": ["Fulltext"]},
        {"name": "tags", "type": "Array", "items": {"type": "String"}},
        {"name": "published_on", "type": "Date"},
        {"name": "rating", "type": "Number", "constraints": {"min": 0, "max": 5}}
      ],
      "allowed_children": ["raisin:Asset"],
      "versionable": true,
      "publishable": true
    },
    "commit": {"message": "Add blog:Article"}
  }'
```

The response is the stored NodeType, with a generated `id` and `version: 1`:

```json
{"id":"lfnRlKa3eBv_caFu","strict":null,"name":"blog:Article","extends":null,"overrides":null,"description":"A blog article","icon":null,"version":1,"properties":[{"name":"title","type":"String","required":true,"index":["Fulltext"]},{"name":"tags","type":"Array","items":{"type":"String"}},{"name":"published_on","type":"Date"},{"name":"rating","type":"Number","constraints":{"max":5,"min":0}}],"allowed_children":["raisin:Asset"],"initial_structure":null,"versionable":true,"publishable":true,"auditable":null,"indexable":null,"created_at":"2026-09-06T18:33:16.473456Z","updated_at":"2026-09-06T18:33:16.473456Z","published_at":null,"published_by":null,"previous_version":null}
```

`PUT .../nodetypes/{name}` replaces the definition with the same body shape, and
`DELETE .../nodetypes/{name}` removes it. The full route list is in the
[NodeTypes API reference](../../reference/http-api/nodetypes-api.md).

## Via a package (YAML)

In a package folder, each NodeType is one YAML file under `nodetypes/`, listed
in the manifest under `provides.nodetypes`. The YAML keys are the same as the
JSON fields above.

```yaml
# nodetypes/article.yaml
name: blog:Article
description: A blog article
icon: file-text
version: 1

properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: slug
    type: String
    required: true
    unique: true
  - name: tags
    type: Array
    items:
      type: String
  - name: author
    type: Reference

allowed_children:
  - raisin:Asset
versionable: true
publishable: true
auditable: true
indexable: true
```

```yaml
# manifest.yaml
name: blog
version: 1.0.0
provides:
  nodetypes:
    - blog:Article
  workspaces:
    - blog
```

Deploy the folder with the CLI. `--install` installs it into the target
repository after upload:

```bash
raisindb deploy ./blog --repo myrepo --install
```

Keys the server does not know are dropped without an error. Editor hints such
as a display label belong in the free-form `meta` map on a property, not as
top-level keys.

## Property schema fields

Each entry in `properties` accepts:

| Key | Meaning |
|---|---|
| `name` | Property name |
| `type` | `String`, `Number`, `Boolean`, `Date`, `URL`, `Reference`, `Resource`, `Element`, `Composite`, `Geometry`, `NodeType`, `Array`, `Object` |
| `required` | The property must be present on every node |
| `unique` | No two nodes in the workspace may share the value |
| `default` | Default value (stored on the schema; see the note below) |
| `items` | Schema of each element, for `Array` |
| `structure` | Map of nested property schemas, for `Object` |
| `constraints` | Free-form map, for example `{"min": 0, "max": 5}` |
| `index` | Any of `Fulltext`, `Vector`, `Property`, `Spatial` |
| `is_translatable` | The value may be overlaid per locale |
| `encrypted` | The value is moved to the secret store on write |
| `meta` | Free-form map for editor hints |

## What the server validates

When a node is written, the server resolves the NodeType (including parents and
mixins) and checks:

- every `required` property is present,
- every `unique` property has no duplicate in the workspace,
- with `strict: true`, no property outside the schema is present,
- element and archetype content matches its element types.

Property values are stored as sent. Type mismatches, `constraints` and `default`
are recorded on the schema for tooling but are not enforced or applied by the
write path today. A missing required property is rejected:

```json
{"code":"VALIDATION_FAILED","message":"Missing required property 'title' for NodeType 'blog:Article'","details":"Missing required property 'title' for NodeType 'blog:Article'","timestamp":"2026-09-06T18:33:16.568668+00:00"}
```

## Allowing the type in a workspace

A node can only be created where its type is allowed. Add the type to the
workspace's `allowed_node_types` (and `allowed_root_node_types` for top-level
nodes):

```bash
curl -s -X PUT http://localhost:8090/api/workspaces/myrepo/blog \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"blog","allowed_node_types":["raisin:Folder","blog:Article"],"allowed_root_node_types":["raisin:Folder","blog:Article"]}'
```

Then create a node:

```bash
curl -s -X POST http://localhost:8090/api/repository/myrepo/main/head/blog/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"hello","node_type":"blog:Article","properties":{"title":"Hello","tags":["a","b"]}}'
```

## Publishing

Publishing stamps a NodeType as a stable version: it increments `version`, sets
`published_at` and `published_by`, and makes the type appear in the
`/nodetypes/published` listing.

```bash
curl -s -X POST http://localhost:8090/api/management/myrepo/main/nodetypes/blog:Article/publish \
  -H "Authorization: Bearer $TOKEN"
```

Publishing is not a precondition for creating nodes: a type can be used as soon
as it exists and is allowed in the workspace. Use publish to mark the definition
you consider final, and `.../unpublish` to withdraw that mark.

## Changing a NodeType

`ALTER NODETYPE` applies one or more alterations in a single statement:

```sql
ALTER NODETYPE 'blog:Article'
  ADD PROPERTY subtitle String FULLTEXT
  DROP PROPERTY body
  SET DESCRIPTION = 'A post';
```

Other alterations: `MODIFY PROPERTY name Type [modifiers]`,
`SET ICON = '...'`, `SET EXTENDS = 'parent'` or `SET EXTENDS = NULL`,
`SET ALLOWED_CHILDREN = ('a', 'b')`, `SET REQUIRED_NODES = (...)`,
`ADD MIXIN 'x'`, `DROP MIXIN 'x'`, and `SET VERSIONABLE|PUBLISHABLE|AUDITABLE = true|false`.

Every change creates a new revision of the NodeType; `version` increases and
`previous_version` points at the prior record. Remove a type with
`DROP NODETYPE 'blog:Article'` (add `CASCADE` to remove dependants).

## Naming and design

- Namespace every type (`blog:Article`, not `Article`). The namespace keeps
  packages from colliding and is required by the name pattern.
- Use the singular (`shop:Product`).
- Keep a type focused. Share cross-cutting fields with
  [mixins](./using-mixins.md) rather than growing one large type.

## Next steps

- [Using Mixins](./using-mixins.md) to compose reusable property sets
- [Using Archetypes](./using-archetypes.md) for editor-facing content templates
- [Defining Elements](./defining-elements.md) for structured block content
