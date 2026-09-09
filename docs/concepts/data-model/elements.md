---
sidebar_position: 4
---

# Elements

An **Element type** is a reusable content block: a named set of fields such as a hero banner, a text block or a quote. An **element** is an instance of that type stored inside a node's properties. Element types are what an [Archetype](/docs/concepts/data-model/archetypes) lists in a `SectionField`, so editors can compose a page from blocks while the server validates each block against its type.

Element types and archetypes share one field schema. This page is the reference for both.

## An element type

```yaml
name: arch:Hero
title: Hero
fields:
  - $type: TextField
    name: heading
    title: Heading
    required: true
    translatable: true
    config:
      max_length: 120
  - $type: MediaField
    name: image
  - $type: OptionsField
    name: align
    config:
      options: [left, center]
      render_as: Radio
```

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Identifier, conventionally `namespace:Name` |
| `extends` | string | Parent element type; fields merge by name, child wins, 20 levels maximum |
| `title`, `description`, `icon` | string | Editor labels |
| `fields` | array | The field schemas below. Defaults to an empty list |
| `layout` | array | Optional layout tree for the editor (same format as archetypes) |
| `strict` | bool | When true, an element may only contain keys named in the resolved fields |
| `publishable` | bool | Set by publishing. Not required for the type to be used |
| `initial_content`, `meta` | object | Stored and returned untouched |

Created with `POST /api/management/{repo}/{branch}/elementtypes` and a `{"element_type": {...}}` body, or as `package/elementtypes/<name>.yaml` in a package. The response is the stored record:

```json
{"id":"3tPiu1sfNV89jWlU","name":"arch:Hero","title":"Hero","description":null,
 "fields":[{"$type":"TextField","name":"heading","title":"Heading","required":true,"translatable":true,"config":{"max_length":120}},
           {"$type":"MediaField","name":"image"},
           {"$type":"OptionsField","name":"align","config":{"options":["left","center"],"render_as":"Radio"}}],
 "version":1,"created_at":"2026-09-06T18:37:57.033632Z","updated_at":"2026-09-06T18:37:57.033632Z",
 "published_at":null,"published_by":null,"publishable":null,"previous_version":null}
```

## An element in a node

An element is a JSON object with an `element_type` key, an optional `uuid`, and the field values at the top level:

```json
{
  "name": "spring",
  "node_type": "blog:Article",
  "archetype": "arch:LandingPage",
  "properties": {
    "title": "Spring sale",
    "sections": [
      { "element_type": "arch:Hero", "uuid": "hero-1", "heading": "Welcome", "align": "center" },
      { "element_type": "arch:TextBlock", "body": "<p>Hi</p>" }
    ]
  }
}
```

The server stores the object as written and returns it in the same shape. A nested `{"element_type": "...", "content": {...}}` form is also accepted on input. `uuid` is optional in general; it becomes mandatory for items of a repeatable composite that has translatable sub-fields, because the translation overlay addresses items by uuid (see [Translations](/docs/guides/data-modeling/translations)).

Elements can appear anywhere in `properties`, not only under an archetype field. On every write the validator walks all property values, and any object with an `element_type` is checked against that element type. An unknown type is an error:

```json
{"code":"VALIDATION_FAILED","message":"Failed to resolve element type 'nope:X': Not found: ElementType not found: nope:X (at element 'nope:X', path 'blocks[0]')"}
```

## Field schemas

Every field is an object tagged with `$type`. All types share the base keys; some add a `config` object.

### Base keys

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Property key in the stored content |
| `title`, `label`, `description`, `help_text` | string | Editor text |
| `required` | bool | Enforced on write |
| `default_value` | any | Editor default. Not applied by the server |
| `multiple` | bool | Repeatable. Enforced for `ElementField`; the uuid rule above applies to `CompositeField` |
| `translatable` | bool | The field takes part in translation overlays |
| `is_hidden`, `design_value` | bool | Editor hints |
| `validations` | array of strings | Stored for clients; not evaluated by the server |
| `index` | array | `Fulltext`, `Vector`, `Property` |
| `encrypted` | bool | Value is moved to the secret store on write and read back as a `secret://` reference |
| `meta` | map | Free-form, stored untouched |

### Types

| `$type` | `config` keys | Notes |
|---|---|---|
| `TextField` | `max_length` | |
| `RichTextField` | `max_length` | |
| `NumberField` | `is_integer`, `min_value`, `max_value` | |
| `DateField` | `date_format`, `date_mode` (`DateTime`, `Date`, `Time`) | |
| `BooleanField` | | |
| `LocationField` | | |
| `MediaField` | `allowed_types` | |
| `ReferenceField` | `allowed_entry_types` | |
| `TagField` | `allowed_tags`, `max_tags` | |
| `OptionsField` | `options`, `render_as` (`Dropdown`, `Radio`, `Checkbox`), `multi_select` | |
| `JsonObjectField` | | Arbitrary JSON |
| `ListingField` | `allowed_entry_types`, `sort_by`, `sort_order`, `limit` | |
| `CompositeField` | | Has its own `fields` and optional `layout`; an inline group with no separate type |
| `ElementField` | | `element_type` names the one type allowed; the value is a single element, or a list when `multiple` |
| `SectionField` | | `allowed_element_types` lists the types allowed in the list; `render_as` is an editor hint |

`config` values are editor hints. The server enforces `required`, `strict`, the type checks on `ElementField` and `SectionField`, and the uuid rule for translatable composites. It does not check lengths, ranges or option membership.

## Layout

`layout` is a list of layout nodes, tagged by `type`:

```yaml
layout:
  - type: container
    direction: Vertical      # or Horizontal
    spacing: 8
    alignment: Leading       # Leading, Center, Trailing
    children:
      - type: field
        name: heading
      - type: group
        label: Appearance
        children:
          - type: field
            name: image
            width: 50%
          - type: field
            name: align
            condition:
              field: image
              operator: NotEquals   # Equals, NotEquals, GreaterThan, LessThan, Contains
              value: null
      - type: tab_panel
        tabs:
          - name: Advanced
            children:
              - type: field
                name: cta
      - type: grid
        rows: 1
        columns: 2
        children: []
```

The layout is stored and returned as-is; rendering it is the editor's job.

## Inheritance and the resolved view

`GET /api/management/{repo}/{branch}/elementtypes/{name}/resolved` returns the type with its `extends` chain merged:

```json
{
  "element_type": { "name": "arch:Hero", "fields": [ ... ], "version": 2, "publishable": true },
  "resolved_fields": [
    { "$type": "OptionsField", "name": "align", "config": { "options": ["left", "center"], "render_as": "Radio" } },
    { "$type": "TextField", "name": "heading", "title": "Heading", "required": true, "translatable": true, "config": { "max_length": 120 } },
    { "$type": "MediaField", "name": "image" }
  ],
  "resolved_layout": null,
  "inheritance_chain": ["arch:Hero"],
  "resolved_strict": false
}
```

`resolved_fields` is sorted by name. The JavaScript client has `db.elementTypes().getResolved(name)`; schemas are per branch, so use `db.onBranch('staging')` to resolve elsewhere.

## Strict element types

With `strict: true` on the type, an element carrying a key that is not a resolved field is rejected:

```json
{"code":"VALIDATION_FAILED","message":"Undefined property 'extra' in strict element type 'arch:TextBlock' at path 'archetype 'arch:LandingPage'.sections[0]'"}
```

## SQL

`CREATE ELEMENTTYPE 'arch:Quote' DESCRIPTION 'A quote' FIELDS (text String REQUIRED)` creates the record with its fields, `ALTER ELEMENTTYPE ... ADD FIELD / DROP FIELD / MODIFY FIELD` changes them, and `DROP ELEMENTTYPE 'arch:Quote'` removes it. Which element types a `SectionField` accepts still needs HTTP, the client or YAML. See [DDL](/docs/reference/sql/statements/ddl).

## Next steps

- [Defining Element Types](/docs/guides/data-modeling/defining-elements) for the step-by-step guide
- [Archetypes](/docs/concepts/data-model/archetypes) for where element types are used
- [Translations](/docs/guides/data-modeling/translations) for translatable fields and the uuid rule
