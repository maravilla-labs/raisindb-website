---
sidebar_position: 3
---

# Defining Element Types

This guide walks through creating element types, composing them, and writing nodes that use them. The field reference is on the [Elements](/docs/concepts/data-model/elements) concept page.

All examples use repository `docs-model`, branch `main`, and these shell variables:

```bash
TOKEN=$(curl -s -X POST localhost:8090/api/raisindb/sys/default/auth \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"AdminPassword123!"}' | jq -r .token)
H="Authorization: Bearer $TOKEN"; J="content-type: application/json"
B=localhost:8090/api/management/docs-model/main
```

## 1. Create an element type

The body wraps the definition in `element_type`. Each field is tagged with `$type`; type-specific settings go in `config`.

```bash
curl -s -X POST $B/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "arch:Hero",
    "title": "Hero",
    "fields": [
      { "$type": "TextField", "name": "heading", "title": "Heading",
        "required": true, "translatable": true, "config": { "max_length": 120 } },
      { "$type": "MediaField", "name": "image" },
      { "$type": "OptionsField", "name": "align",
        "config": { "options": ["left", "center"], "render_as": "Radio" } }
    ]
  }
}'
```

Response (`201 Created`):

```json
{"id":"3tPiu1sfNV89jWlU","name":"arch:Hero","title":"Hero","description":null,
 "fields":[{"$type":"TextField","name":"heading","title":"Heading","required":true,"translatable":true,"config":{"max_length":120}},
           {"$type":"MediaField","name":"image"},
           {"$type":"OptionsField","name":"align","config":{"options":["left","center"],"render_as":"Radio"}}],
 "version":1,"created_at":"2026-09-06T18:37:57.033632Z","updated_at":"2026-09-06T18:37:57.033632Z",
 "published_at":null,"published_by":null,"publishable":null,"previous_version":null}
```

Add a second, strict type. With `strict: true` an element of this type may only contain the declared fields:

```bash
curl -s -X POST $B/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "arch:TextBlock",
    "strict": true,
    "fields": [ { "$type": "RichTextField", "name": "body", "required": true } ]
  }
}'
```

## 2. Publish

Publishing bumps `version`, sets `published_at`, `published_by` and `publishable: true`, and keeps the previous record id in `previous_version`. Only published types appear under `/elementtypes/published`. An unpublished type can still be used in content; publishing is a bookkeeping state for editors and package tooling.

```bash
curl -s -X POST $B/elementtypes/arch:Hero/publish -H "$H"
```

```json
{"id":"3tPiu1sfNV89jWlU","name":"arch:Hero", ... ,"version":2,
 "published_at":"2026-09-06T18:37:57.068137Z","published_by":"system","publishable":true,
 "previous_version":"3tPiu1sfNV89jWlU"}
```

The other verbs on `/elementtypes/{name}` are `GET`, `PUT` (same body as create; `name` must match the path), `DELETE` (returns `204`), and `POST .../unpublish`. Any write accepts an optional `"commit": {"message": "...", "actor": "..."}` next to `element_type`.

## 3. Reuse fields with `extends`

```bash
curl -s -X POST $B/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "arch:BigHero",
    "extends": "arch:Hero",
    "fields": [ { "$type": "TextField", "name": "kicker" } ]
  }
}'
curl -s $B/elementtypes/arch:BigHero/resolved -H "$H"
```

The resolved view merges the chain, child fields winning by name:

```json
{"element_type": {"name":"arch:BigHero","extends":"arch:Hero", ...},
 "resolved_fields":[{"$type":"OptionsField","name":"align", ...},{"$type":"TextField","name":"heading", ...},
                    {"$type":"MediaField","name":"image"},{"$type":"TextField","name":"kicker"}],
 "resolved_layout":null,"inheritance_chain":["arch:BigHero","arch:Hero"],"resolved_strict":false}
```

## 4. Nest element types

An `ElementField` holds one element of a fixed type. A `CompositeField` is an inline group with its own `fields`; with `multiple: true` it is a repeatable list.

```bash
curl -s -X POST $B/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "arch:Feature",
    "fields": [
      { "$type": "ElementField", "name": "hero", "element_type": "arch:Hero" },
      { "$type": "CompositeField", "name": "bullets", "multiple": true,
        "fields": [ { "$type": "TextField", "name": "text", "translatable": true } ] }
    ]
  }
}'
```

A value for this type looks like:

```json
{
  "element_type": "arch:Feature",
  "hero": { "element_type": "arch:Hero", "heading": "h" },
  "bullets": [ { "uuid": "b1", "text": "one" } ]
}
```

The `uuid` on each bullet is required here because the repeatable composite has a translatable sub-field. Without it the write fails with `COMPOSITE_MISSING_UUID: Item ...bullets[0] requires a 'uuid' field because the composite has translatable sub-fields`.

## 5. Write content that uses the types

Element types are usually placed through an [archetype](/docs/guides/data-modeling/using-archetypes) `SectionField`, but any property may hold an element. The validator finds every object with an `element_type` key, wherever it sits, and checks it:

```bash
curl -s -X POST localhost:8090/api/repository/docs-model/main/head/blog/ -H "$H" -H "$J" -d '{
  "name": "with-blocks",
  "node_type": "blog:Article",
  "properties": {
    "title": "Blocks",
    "blocks": [ { "element_type": "arch:Hero", "heading": "Welcome", "align": "center" } ]
  }
}'
```

What is enforced on write:

| Rule | Error message |
|---|---|
| Unknown element type | `Failed to resolve element type 'nope:X': Not found: ElementType not found: nope:X (at element 'nope:X', path 'blocks[0]')` |
| Missing `required` field | `Missing required field 'heading' at ...sections[0]` |
| Extra key in a strict type | `Undefined property 'extra' in strict element type 'arch:TextBlock' at path '...'` |
| Wrong type in an `ElementField` | `Field '...feature' expects element type 'arch:Feature', found 'arch:Hero'` |
| Two elements in a non-`multiple` `ElementField` | `Field '...feature' does not allow multiple elements` |
| Type not in a `SectionField` list | `Element type 'blog:Nope' is not allowed in field '...sections'` |

`config` settings such as `max_length`, `min_value` or `options` are hints for editors and are not enforced by the server.

## Other ways to define element types

**Package YAML.** Put one file per type under `package/elementtypes/` and install the package with the CLI (`raisindb package create`, `raisindb package upload`, `raisindb package install`). The YAML is the same shape as the JSON body without the wrapper:

```yaml
name: events:HeroBlock
title: Hero Block
icon: image
fields:
  - $type: TextField
    name: heading
    title: Heading
    translatable: true
  - $type: MediaField
    name: background_image
    title: Background Image
```

**JavaScript client.** `HttpDatabase.elementTypes()` wraps the same endpoints:

```javascript
import { RaisinHttpClient } from '@raisindb/client';

const client = new RaisinHttpClient('http://localhost:8090');
await client.authenticate({ username: 'admin', password: 'AdminPassword123!' });
const db = client.database('docs-model');

await db.elementTypes().create('arch:Quote', {
  fields: [{ $type: 'TextField', name: 'text', required: true }],
});
await db.elementTypes().publish('arch:Quote', { message: 'publish quote' });
const resolved = await db.elementTypes().getResolved('arch:Quote');
const published = await db.elementTypes().list(true);
```

Use `db.onBranch('staging')` to manage the schema of another branch.

**SQL.** `CREATE ELEMENTTYPE 'arch:Quote' DESCRIPTION 'A quote' PUBLISHABLE` and `DROP ELEMENTTYPE 'arch:Quote'` work, but a `FIELDS (...)` clause is not stored, so the record comes back with `"fields": []`. Define fields over HTTP, the client or YAML.

## Next steps

- [Using Archetypes](./using-archetypes.md) to place element types in page templates
- [Translations](./translations.md) for translatable fields and locale overlays
- [Elements](/docs/concepts/data-model/elements) for the full field and layout reference
