---
sidebar_position: 3
---

# Archetypes in Practice

This tutorial builds on the `dcad:*` definitions from the previous two pages and shows the two features you reach for once a content model grows: inheritance between archetypes (and between element types), and a layout that arranges fields for the editor.

```bash
API=http://localhost:8080/api/management/myrepo/main
H="Authorization: Bearer $TOKEN"; J='content-type: application/json'
```

## 1. Extend an archetype

A campaign page is a landing page with an end date and its own title label. Create it with `extends` and declare only what differs. A field with the same `name` as one in the parent replaces it; other parent fields are inherited. The `layout` groups fields for the editor.

```bash
curl -X POST $API/archetypes -H "$H" -H "$J" -d '{
  "archetype": {
    "name": "dcad:CampaignPage", "title": "Campaign Page",
    "extends": "dcad:LandingPage",
    "fields": [
      { "$type": "DateField", "name": "ends_on", "title": "Campaign ends" },
      { "$type": "TextField", "name": "title", "title": "Campaign Title", "required": true }
    ],
    "layout": [
      { "type": "group", "label": "Campaign", "children": [
          { "type": "field", "name": "title" },
          { "type": "field", "name": "ends_on", "width": "50%" } ] },
      { "type": "field", "name": "content" }
    ],
    "publishable": true
  }
}'
curl -X POST $API/archetypes/dcad:CampaignPage/publish -H "$H"
```

## 2. Read the resolved archetype

The `resolved` endpoint merges the chain. This is the response a form builder or an agent should read, because it contains the parent's fields as well.

```bash
curl $API/archetypes/dcad:CampaignPage/resolved -H "$H"
```

```json
{
  "archetype": { "name": "dcad:CampaignPage", "extends": "dcad:LandingPage", "...": "..." },
  "resolved_fields": [
    { "$type": "SectionField", "name": "content", "title": "Page Content",
      "allowed_element_types": ["dcad:Hero", "dcad:TextBlock"] },
    { "$type": "DateField", "name": "ends_on", "title": "Campaign ends" },
    { "$type": "TextField", "name": "slug", "required": true },
    { "$type": "TextField", "name": "title", "title": "Campaign Title", "required": true }
  ],
  "resolved_layout": [
    { "type": "group", "label": "Campaign", "children": [
        { "type": "field", "name": "title" },
        { "type": "field", "name": "ends_on", "width": "50%" } ] },
    { "type": "field", "name": "content" }
  ],
  "inheritance_chain": ["dcad:CampaignPage", "dcad:LandingPage"],
  "resolved_strict": false
}
```

`slug` and `content` came from the parent; `title` is the child's version. Layout nodes are `container`, `group`, `tab_panel`, `grid` and `field`; a `field` can carry a `width` and a `condition` for conditional display.

## 3. Extend an element type

Element types inherit the same way. A video hero is a hero plus a required media field:

```bash
curl -X POST $API/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "dcad:VideoHero", "title": "Video Hero", "extends": "dcad:Hero",
    "fields": [ { "$type": "MediaField", "name": "video", "required": true } ]
  }
}'
curl -X POST $API/elementtypes/dcad:VideoHero/publish -H "$H"
curl $API/elementtypes/dcad:VideoHero/resolved -H "$H"
```

```json
{"resolved_fields":[
   {"$type":"TextField","name":"headline","title":"Headline","required":true},
   {"$type":"TextField","name":"subheadline","title":"Subheadline"},
   {"$type":"MediaField","name":"video","required":true}],
 "inheritance_chain":["dcad:VideoHero","dcad:Hero"]}
```

A section that allows `dcad:Hero` does not automatically allow `dcad:VideoHero`; add the new name to `allowed_element_types` where you want it.

## 4. Use the new archetype

```bash
curl -X POST http://localhost:8080/api/repository/myrepo/main/head/site/ -H "$H" -H "$J" -d '{
  "name": "spring", "node_type": "dcad:Page", "archetype": "dcad:CampaignPage",
  "properties": {
    "title": "Spring Sale", "slug": "spring", "ends_on": "2026-04-30T00:00:00Z",
    "content": [ { "element_type": "dcad:Hero", "headline": "Spring Sale" } ]
  }
}'
```

The inherited section keeps its rules. A card in a campaign page's content is rejected exactly as it would be on the parent:

```json
{"code":"VALIDATION_FAILED",
 "message":"Element type 'dcad:KanbanCard' is not allowed in field 'archetype 'dcad:CampaignPage'.content'"}
```

## 5. Ship it as a package

Once the model settles, keep it in a package so it can be installed into any repository. The same definitions are YAML files under `archetypes/`, `elementtypes/`, `nodetypes/` and `workspaces/`:

```yaml
# archetypes/campaign-page.yaml
name: dcad:CampaignPage
title: Campaign Page
extends: dcad:LandingPage
fields:
  - $type: DateField
    name: ends_on
    title: Campaign ends
  - $type: TextField
    name: title
    title: Campaign Title
    required: true
layout:
  - type: group
    label: Campaign
    children:
      - type: field
        name: title
      - type: field
        name: ends_on
        width: "50%"
  - type: field
    name: content
publishable: true
```

[Define the Schema](/docs/tutorials/content-app/define-schema) walks through the package layout.

## Where the checks stop

The server validates required fields and allowed element types at the archetype's own fields and inside a top-level `SectionField`. Elements nested deeper, such as cards inside a `CompositeField` column, are stored as given, so keep the renderer's fallback for unknown `element_type` values and validate deeper structures in your editor.
