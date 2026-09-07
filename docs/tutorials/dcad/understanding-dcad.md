---
sidebar_position: 1
---

# Understanding DCAD

In this tutorial you create the four DCAD layers on a running server and see how the server validates content against them. You need a RaisinDB server, a repository (this page uses `myrepo`) and a token in `$TOKEN`. All calls go to the management API, so the token needs operator rights.

```bash
API=http://localhost:8080/api/management/myrepo/main
H="Authorization: Bearer $TOKEN"; J='content-type: application/json'
```

## 1. A NodeType for storage

The NodeType says what the server stores and validates. Two required strings are enough for a page.

```bash
curl -X POST $API/nodetypes -H "$H" -H "$J" -d '{
  "node_type": {
    "name": "dcad:Page",
    "properties": [
      { "name": "title", "type": "String", "required": true },
      { "name": "slug",  "type": "String", "required": true }
    ],
    "versionable": true, "publishable": true
  }
}'
curl -X POST $API/nodetypes/dcad:Page/publish -H "$H"
```

## 2. Element types for the building blocks

Each element type is a block with its own fields. Field definitions carry a `$type`.

```bash
curl -X POST $API/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "dcad:Hero", "title": "Hero Section",
    "fields": [
      { "$type": "TextField", "name": "headline", "title": "Headline", "required": true },
      { "$type": "TextField", "name": "subheadline", "title": "Subheadline" }
    ]
  }
}'
curl -X POST $API/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "dcad:TextBlock", "title": "Text Block",
    "fields": [ { "$type": "RichTextField", "name": "body", "title": "Body", "required": true } ]
  }
}'
curl -X POST $API/elementtypes/dcad:Hero/publish -H "$H"
curl -X POST $API/elementtypes/dcad:TextBlock/publish -H "$H"
```

The create call returns the stored definition:

```json
{"id":"6IGzLCMWYHdhDa32","name":"dcad:Hero","title":"Hero Section","description":null,
 "fields":[{"$type":"TextField","name":"headline","title":"Headline","required":true},
           {"$type":"TextField","name":"subheadline","title":"Subheadline"}],
 "version":1,"published_at":null,"publishable":null}
```

## 3. An archetype for presentation

The archetype sits on the NodeType and declares the editor fields. Its `SectionField` is a content area restricted to the two element types.

```bash
curl -X POST $API/archetypes -H "$H" -H "$J" -d '{
  "archetype": {
    "name": "dcad:LandingPage", "title": "Landing Page",
    "base_node_type": "dcad:Page",
    "fields": [
      { "$type": "TextField", "name": "title", "title": "Page Title", "required": true },
      { "$type": "TextField", "name": "slug", "required": true },
      { "$type": "SectionField", "name": "content", "title": "Page Content",
        "allowed_element_types": ["dcad:Hero", "dcad:TextBlock"] }
    ],
    "publishable": true
  }
}'
curl -X POST $API/archetypes/dcad:LandingPage/publish -H "$H"
```

## 4. A workspace and a node

Create a workspace that accepts the NodeType, then a node that names both the NodeType and the archetype. Elements go into `properties.content` as objects with an `element_type`.

```bash
curl -X PUT http://localhost:8080/api/workspaces/myrepo/site -H "$H" -H "$J" -d '{
  "name": "site",
  "allowed_node_types": ["raisin:Folder", "dcad:Page"],
  "allowed_root_node_types": ["raisin:Folder", "dcad:Page"]
}'

curl -X POST http://localhost:8080/api/repository/myrepo/main/head/site/ -H "$H" -H "$J" -d '{
  "name": "home", "node_type": "dcad:Page", "archetype": "dcad:LandingPage",
  "properties": {
    "title": "Home", "slug": "home",
    "content": [
      { "element_type": "dcad:Hero", "headline": "Welcome", "subheadline": "Build on data" },
      { "element_type": "dcad:TextBlock", "body": "<p>Hello</p>" }
    ]
  }
}'
```

```json
{"id":"stDiLdkWBo80p57nft8_V","name":"home","path":"/home","node_type":"dcad:Page",
 "archetype":"dcad:LandingPage",
 "properties":{"title":"Home","slug":"home",
   "content":[{"element_type":"dcad:Hero","headline":"Welcome","subheadline":"Build on data"},
              {"element_type":"dcad:TextBlock","body":"<p>Hello</p>"}],
   "$mixins":[],"$supertypes":["dcad:Page"]},
 "version":1,"workspace":"site"}
```

## 5. See the definitions do their job

Try an element the section does not allow:

```bash
curl -X POST http://localhost:8080/api/repository/myrepo/main/head/site/ -H "$H" -H "$J" -d '{
  "name": "bad", "node_type": "dcad:Page", "archetype": "dcad:LandingPage",
  "properties": { "title": "Bad", "slug": "bad",
    "content": [ { "element_type": "dcad:KanbanCard", "title": "x" } ] }
}'
```

```json
{"code":"VALIDATION_FAILED",
 "message":"Element type 'dcad:KanbanCard' is not allowed in field 'archetype 'dcad:LandingPage'.content'"}
```

And a hero without its required headline:

```json
{"code":"VALIDATION_FAILED",
 "message":"Missing required field 'headline' at archetype 'dcad:LandingPage'.content[0]"}
```

## What you have

- `dcad:Page` decides what is stored and indexed.
- `dcad:LandingPage` decides which fields an editor sees and which blocks a page may contain.
- `dcad:Hero` and `dcad:TextBlock` are the blocks.
- `/home` is content that the server has checked against all three.

A frontend that reads `archetype` and `element_type` can render this page without knowing about it in advance. That is the next tutorial: [Building Dynamic UI](/docs/tutorials/dcad/building-dynamic-ui).
