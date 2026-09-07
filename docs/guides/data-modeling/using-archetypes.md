---
sidebar_position: 2
---

# Using Archetypes

An archetype gives nodes of one NodeType a set of editor fields, a layout, and a list of allowed element types. This guide creates one, extends it, and writes nodes against it. Concepts are on the [Archetypes](/docs/concepts/data-model/archetypes) page.

All examples use repository `docs-model`, branch `main`, and these shell variables:

```bash
TOKEN=$(curl -s -X POST localhost:8090/api/raisindb/sys/default/auth \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"AdminPassword123!"}' | jq -r .token)
H="Authorization: Bearer $TOKEN"; J="content-type: application/json"
B=localhost:8090/api/management/docs-model/main
```

They assume a published NodeType `blog:Article` with a required `title` property, and two element types `arch:Hero` and `arch:TextBlock` (see [Defining Element Types](./defining-elements.md)).

## 1. Create the archetype

The body wraps the definition in `archetype`. `base_node_type` ties it to a NodeType; `fields` use the same `$type` schema as element types; a `SectionField` lists which element types may be placed in that field.

```bash
curl -s -X POST $B/archetypes -H "$H" -H "$J" -d '{
  "archetype": {
    "name": "arch:LandingPage",
    "title": "Landing Page",
    "base_node_type": "blog:Article",
    "fields": [
      { "$type": "TextField", "name": "title", "required": true },
      { "$type": "TextField", "name": "subtitle" },
      { "$type": "SectionField", "name": "sections",
        "allowed_element_types": ["arch:Hero", "arch:TextBlock"] }
    ],
    "layout": [
      { "type": "container", "direction": "Vertical", "children": [
        { "type": "field", "name": "title" },
        { "type": "field", "name": "subtitle", "width": "50%" },
        { "type": "field", "name": "sections" }
      ] }
    ]
  }
}'
```

Response (`201 Created`):

```json
{"id":"Jy0EAuM50N9as-hj","name":"arch:LandingPage","title":"Landing Page","base_node_type":"blog:Article",
 "fields":[{"$type":"TextField","name":"title","required":true},{"$type":"TextField","name":"subtitle"},
           {"$type":"SectionField","name":"sections","allowed_element_types":["arch:Hero","arch:TextBlock"]}],
 "layout":[{"type":"container","direction":"Vertical","children":[{"type":"field","name":"title"},
           {"type":"field","name":"subtitle","width":"50%"},{"type":"field","name":"sections"}]}],
 "version":1,"created_at":"2026-09-06T18:37:57.126397Z","updated_at":"2026-09-06T18:37:57.126397Z",
 "published_at":null,"published_by":null,"publishable":null,"previous_version":null}
```

## 2. Publish

```bash
curl -s -X POST $B/archetypes/arch:LandingPage/publish -H "$H"
```

The response is the archetype with `version: 2`, `published_at`, `published_by` and `publishable: true` set. Publishing is not a gate: nodes can reference an unpublished archetype. It marks the archetype as ready for editors and lists it under `/archetypes/published`.

The other verbs are `GET`, `PUT` (same body; `name` must match the path), `DELETE` (`204`), `POST .../unpublish`, and `GET .../resolved`. Writes accept an optional `"commit": {"message": "..."}` next to `archetype`.

## 3. Write a node with the archetype

Set `archetype` on the node. The workspace must allow the base NodeType.

```bash
R=localhost:8090/api/repository/docs-model/main/head/arch-pages
curl -s -X POST $R/ -H "$H" -H "$J" -d '{
  "name": "spring",
  "node_type": "blog:Article",
  "archetype": "arch:LandingPage",
  "properties": {
    "title": "Spring sale",
    "subtitle": "Save big",
    "sections": [
      { "element_type": "arch:Hero", "uuid": "hero-1", "heading": "Welcome", "align": "center" },
      { "element_type": "arch:TextBlock", "body": "<p>Hi</p>" }
    ]
  }
}'
```

```json
{"id":"sG6ZNYAkwFm4LlqpZFUJj","name":"spring","path":"/spring","node_type":"blog:Article","archetype":"arch:LandingPage",
 "properties":{"title":"Spring sale","subtitle":"Save big",
   "sections":[{"element_type":"arch:Hero","uuid":"hero-1","heading":"Welcome","align":"center"},
               {"element_type":"arch:TextBlock","body":"<p>Hi</p>"}],
   "$mixins":[],"$supertypes":["blog:Article"]},
 "children":[],"order_key":"","parent":"/","version":1,"workspace":"arch-pages", ...}
```

The same works from SQL; `archetype` is a column:

```sql
INSERT INTO 'arch-pages' (path, node_type, archetype, name, properties)
VALUES ('/summer', 'blog:Article', 'arch:LandingPage', 'summer',
        '{"title":"Summer","sections":[{"element_type":"arch:Hero","heading":"Sun"}]}'::jsonb);

SELECT path, archetype, properties->>'sections' AS sections FROM 'arch-pages';
```

```json
{"columns":["path","archetype","sections"],
 "rows":[{"path":"/summer","archetype":"arch:LandingPage","sections":"[{\"element_type\":\"arch:Hero\",\"heading\":\"Sun\"}]"}]}
```

## 4. What gets rejected

| Situation | Error |
|---|---|
| `node_type` differs from `base_node_type` | `Archetype 'arch:LandingPage' is only valid for node type 'blog:Article', but node '' uses 'blog:Author'` |
| Element type not in the section's list | `Element type 'blog:Nope' is not allowed in field 'archetype 'arch:LandingPage'.sections'` |
| Required field missing in an element | `Missing required field 'heading' at archetype 'arch:LandingPage'.sections[0]` |
| Extra key in a strict element type | `Undefined property 'extra' in strict element type 'arch:TextBlock' at path '...sections[0]'` |
| Archetype does not exist | `Failed to resolve archetype 'arch:Missing' for node '': Not found: Archetype not found: arch:Missing` |

These come back as `{"code":"VALIDATION_FAILED","message":"..."}` over HTTP and as `Validation failed: ...` from SQL. NodeType rules (required properties, `unique`, NodeType `strict`) still apply on top.

:::note About `strict: true` on an archetype
A strict archetype rejects any node property not named in its resolved fields. The server stamps `$mixins` and `$supertypes` on every node before this check and does not exempt them, so a strict archetype currently rejects every REST write with `Undefined property '$mixins' in strict archetype ...`. Prefer `strict` on element types until this is fixed.
:::

## 5. Extend an archetype

A child archetype inherits fields, layout and `strict` from its parent, adds fields, and may redefine a field by name:

```bash
curl -s -X POST $B/archetypes -H "$H" -H "$J" -d '{
  "archetype": {
    "name": "arch:CampaignPage",
    "extends": "arch:LandingPage",
    "fields": [
      { "$type": "DateField", "name": "ends_on", "config": { "date_mode": "Date" } },
      { "$type": "TextField", "name": "subtitle", "required": true }
    ]
  }
}'
curl -s $B/archetypes/arch:CampaignPage/resolved -H "$H"
```

```json
{"archetype":{"name":"arch:CampaignPage","extends":"arch:LandingPage", ...},
 "resolved_fields":[{"$type":"DateField","name":"ends_on","config":{"date_mode":"Date"}},
                    {"$type":"SectionField","name":"sections","allowed_element_types":["arch:Hero","arch:TextBlock"]},
                    {"$type":"TextField","name":"subtitle","required":true},
                    {"$type":"TextField","name":"title","required":true}],
 "resolved_layout":[{"type":"container","direction":"Vertical","children":[...]}],
 "inheritance_chain":["arch:CampaignPage","arch:LandingPage"],
 "resolved_strict":false}
```

`base_node_type` is not inherited. Set it on the child too if you want the NodeType check to apply.

## 6. Switch a node's archetype

Update the node with a different `archetype`. The properties stay; the next write is validated against the new archetype's resolved fields. This is how one stored article can be edited as a landing page in one context and a campaign page in another.

## Other ways to define archetypes

**Package YAML.** One file per archetype under `package/archetypes/`, installed with `raisindb package create`, `upload` and `install`:

```yaml
name: events:LandingPage
title: Landing Page
base_node_type: events:Page
fields:
  - $type: TextField
    name: title
    title: Title
    required: true
    translatable: true
  - $type: SectionField
    name: content
    title: Content
    allowed_element_types:
      - events:HeroBlock
      - events:TextBlock
publishable: true
```

**JavaScript client.**

```javascript
import { RaisinHttpClient } from '@raisindb/client';

const client = new RaisinHttpClient('http://localhost:8090');
await client.authenticate({ username: 'admin', password: 'AdminPassword123!' });
const db = client.database('docs-model');

await db.archetypes().create('arch:Post', {
  base_node_type: 'blog:Article',
  fields: [{ $type: 'TextField', name: 'title', required: true }],
});
await db.archetypes().publish('arch:Post', { message: 'publish post' });
const resolved = await db.archetypes().getResolved('arch:Post');
```

**SQL.** `CREATE ARCHETYPE 'arch:Post' BASE_NODE_TYPE 'blog:Article' TITLE 'Post' PUBLISHABLE` creates a published archetype record and `DROP ARCHETYPE 'arch:Post'` removes it. A `FIELDS (...)` clause is parsed but not stored, so add fields over HTTP, the client or YAML.

## Next steps

- [Defining Element Types](./defining-elements.md) for the blocks an archetype allows
- [Creating NodeTypes](./creating-nodetypes.md) for the base NodeType
- [Archetypes](/docs/concepts/data-model/archetypes) for the concept and the resolved view
