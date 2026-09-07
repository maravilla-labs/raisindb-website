---
sidebar_position: 3
---

# Archetypes

An **Archetype** describes how a node of a given [NodeType](/docs/concepts/data-model/nodetypes) is edited and rendered. The NodeType says what a node *is* and which properties it stores. The archetype adds a set of editor **fields**, an optional **layout** for those fields, and rules about which [Element types](/docs/concepts/data-model/elements) may be placed inside the node's content. A node names its archetype in the `archetype` column, next to `node_type`.

A single NodeType can have several archetypes. A `blog:Article` may be edited as a plain post in one place and as a landing page with hero and text blocks in another. The stored data is the same; the archetype changes the editing experience and gives the validator a richer schema to check content against.

## What an archetype contains

```yaml
name: arch:LandingPage
title: Landing Page
base_node_type: blog:Article
fields:
  - $type: TextField
    name: title
    required: true
  - $type: TextField
    name: subtitle
  - $type: SectionField
    name: sections
    allowed_element_types:
      - arch:Hero
      - arch:TextBlock
layout:
  - type: container
    direction: Vertical
    children:
      - type: field
        name: title
      - type: field
        name: subtitle
        width: 50%
      - type: field
        name: sections
publishable: true
```

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Identifier, conventionally `namespace:Name` |
| `extends` | string | Parent archetype whose fields, layout and `strict` are inherited |
| `base_node_type` | string | The NodeType this archetype applies to. A node using the archetype must have exactly this `node_type` |
| `title`, `description`, `icon` | string | Editor labels |
| `fields` | array of field schemas | Editor fields. Same field schema as element types, tagged with `$type` |
| `layout` | array of layout nodes | How the fields are arranged in the editor |
| `strict` | bool | When true, a node may only carry properties named in the resolved fields |
| `publishable` | bool | Set by publishing. Archetypes can be used by nodes whether or not they are published |
| `initial_content` | object | Stored and returned as-is; the server does not apply it when a node is created |
| `meta` | map | Free-form data, stored untouched |

The full list of field types (`TextField`, `RichTextField`, `NumberField`, `DateField`, `BooleanField`, `MediaField`, `ReferenceField`, `TagField`, `OptionsField`, `LocationField`, `JsonObjectField`, `CompositeField`, `ElementField`, `SectionField`, `ListingField`) and the layout node types are described on the [Elements](/docs/concepts/data-model/elements) page. The important one for archetypes is `SectionField`: a list of element instances restricted to `allowed_element_types`.

## Archetype, NodeType and mixin

| Concept | Defines | Example |
|---|---|---|
| NodeType | Storage schema and behaviour: property types, `required`, `unique`, indexes, `versionable`, `publishable` | `blog:Article` |
| Archetype | Editor fields, layout and allowed elements for nodes of one NodeType | `arch:LandingPage` |
| Mixin | A NodeType with `is_mixin: true` whose properties are merged into other NodeTypes | `raisin:VirtualNode` |

Mixins change what a node stores. Archetypes change how it is edited and validated as content. See [Using Mixins](/docs/guides/data-modeling/using-mixins).

## Inheritance

An archetype can `extends` another. Resolution walks the chain (parent first), merges fields by name with the child's definition winning, takes the nearest `layout` and the nearest explicit `strict`. The chain is limited to 20 levels and cycles are rejected.

Ask the server for the merged result rather than merging yourself:

```bash
curl -s localhost:8090/api/management/docs-model/main/archetypes/arch:CampaignPage/resolved \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "archetype": { "name": "arch:CampaignPage", "extends": "arch:LandingPage", "fields": [ ... ], "version": 1 },
  "resolved_fields": [
    { "$type": "DateField", "name": "ends_on", "config": { "date_mode": "Date" } },
    { "$type": "SectionField", "name": "sections", "allowed_element_types": ["arch:Hero", "arch:TextBlock"] },
    { "$type": "TextField", "name": "subtitle", "required": true },
    { "$type": "TextField", "name": "title", "required": true }
  ],
  "resolved_layout": [ { "type": "container", "direction": "Vertical", "children": [ ... ] } ],
  "inheritance_chain": ["arch:CampaignPage", "arch:LandingPage"],
  "resolved_strict": true
}
```

Here `arch:CampaignPage` added `ends_on`, made `subtitle` required, and inherited `sections`, `title`, the layout and `strict` from `arch:LandingPage`. `resolved_fields` is sorted by name.

The JavaScript client exposes the same view as `db.archetypes().getResolved(name)`. Schemas are stored per branch, so `db.onBranch('staging')` resolves against another branch.

## What the server validates

When a node carries an `archetype`, the write is checked against the resolved archetype in addition to the NodeType rules:

- `base_node_type` must equal the node's `node_type`.
- Every field with `required: true` must be present in `properties`.
- A `SectionField` value must be a list of elements whose `element_type` is in `allowed_element_types`, and each element is validated against its element type (required fields, strict mode).
- An `ElementField` value must be an element of the declared `element_type`.
- With `strict: true`, any property not named in the resolved fields is rejected.

Examples of the errors, as returned by `POST /api/repository/{repo}/{branch}/head/{ws}/`:

```json
{"code":"VALIDATION_FAILED","message":"Archetype 'arch:LandingPage' is only valid for node type 'blog:Article', but node '' uses 'blog:Author'"}
{"code":"VALIDATION_FAILED","message":"Element type 'blog:Nope' is not allowed in field 'archetype 'arch:LandingPage'.sections'"}
{"code":"VALIDATION_FAILED","message":"Missing required field 'heading' at archetype 'arch:LandingPage'.sections[0]"}
```

Field-level settings such as `max_length` or `min_value` live in each field's `config` and are editor hints. The server does not enforce them.

:::note Strict archetypes over HTTP
The server stamps the reserved `$mixins` and `$supertypes` properties on every node before the archetype check runs, and the strict check does not exempt them. A `strict: true` archetype therefore currently rejects every node written through the REST API with `Undefined property '$mixins' in strict archetype ...`. Use `strict` on element types, or leave the archetype non-strict, until this is resolved.
:::

## Switching archetypes

Because the archetype is just a column on the node, changing it is an ordinary update. A `blog:Article` written with `arch:LandingPage` can be re-saved with `arch:CampaignPage`; the properties stay where they are and the next write is validated against the new archetype. This is what lets one data model serve different editors and front ends. See [DCAD](/docs/concepts/dcad).

## Where archetypes live

- **HTTP**: `/api/management/{repo}/{branch}/archetypes` with the same verbs as NodeTypes. Bodies are wrapped as `{"archetype": {...}}`. See [Using Archetypes](/docs/guides/data-modeling/using-archetypes).
- **Packages**: one YAML file per archetype under `package/archetypes/`, installed with the package.
- **SQL**: `CREATE ARCHETYPE 'arch:Post' BASE_NODE_TYPE 'blog:Article' TITLE 'Post' PUBLISHABLE` creates the record and `DROP ARCHETYPE 'arch:Post'` removes it. The `FIELDS (...)` clause is parsed but not stored, so define fields over HTTP or YAML.

## Next steps

- [Elements](/docs/concepts/data-model/elements) for the field and element type reference
- [Using Archetypes](/docs/guides/data-modeling/using-archetypes) for the step-by-step guide
- [NodeTypes](/docs/concepts/data-model/nodetypes) for the storage schema an archetype sits on
- [DCAD](/docs/concepts/dcad) for the design approach behind archetypes
