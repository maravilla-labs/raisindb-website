---
sidebar_position: 4
---

# NodeTypes API

Manage NodeType schemas on a branch. All routes live under `/api/management/{repo}/{branch}/nodetypes` and require a bearer token. Write requests wrap the definition in a `node_type` object and accept an optional `commit` object that becomes the revision's message and author:

```json
{
  "node_type": { "name": "blog:Article", "properties": [ "..." ] },
  "commit": { "message": "Create blog:Article", "actor": "jane", "is_system": false }
}
```

Without `commit`, the server records a generated message with actor `system`. The NodeType JSON itself is described in [NodeTypes](/docs/concepts/data-model/nodetypes).

Errors use the common shape `{"code": "...", "message": "...", "timestamp": "..."}`. Codes on these routes: `VALIDATION_FAILED` (400, for example an invalid name) and `NODE_TYPE_NOT_FOUND` (404).

## Create

```
POST /api/management/{repo}/{branch}/nodetypes
```

`POST` is an **upsert**. Posting a name that already exists replaces that definition rather than failing, which is what package install and provisioning scripts rely on. The status code says which happened: `201 Created` when the name was free, `200 OK` when an existing definition was replaced. Use `PUT .../nodetypes/{name}` when you mean to update one.

```bash
curl -X POST localhost:8090/api/management/docs-model/main/nodetypes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"node_type":{"name":"blog:Article","description":"A blog article",
       "properties":[{"name":"title","type":"String","required":true,"index":["Fulltext"]},
                     {"name":"rating","type":"Number","constraints":{"min":0,"max":5}}],
       "allowed_children":["raisin:Asset"],"versionable":true,"publishable":true}}'
```

Response `201 Created` with the stored definition:

```json
{
  "id": "lfnRlKa3eBv_caFu",
  "strict": null,
  "name": "blog:Article",
  "extends": null,
  "overrides": null,
  "description": "A blog article",
  "icon": null,
  "version": 1,
  "properties": [
    {"name": "title", "type": "String", "required": true, "index": ["Fulltext"]},
    {"name": "rating", "type": "Number", "constraints": {"max": 5, "min": 0}}
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

Posting a name that already exists stores a new version of that NodeType (the response carries the incremented `version` and `previous_version`); it does not fail.

## List

```
GET /api/management/{repo}/{branch}/nodetypes
GET /api/management/{repo}/{branch}/nodetypes/published
```

Both return a JSON array of NodeType objects. The first includes every type visible on the branch, built-in `raisin:*` types included; the second only those with `published_at` set.

## Get

```
GET /api/management/{repo}/{branch}/nodetypes/{name}
```

Returns the NodeType object, or `404` with `NODE_TYPE_NOT_FOUND`.

## Get resolved

```
GET /api/management/{repo}/{branch}/nodetypes/{name}/resolved[?workspace={ws}]
```

Returns the definition together with everything inherited through `extends` and `mixins`. Pass `workspace` to resolve against that workspace's pinned NodeType versions.

```json
{
  "node_type": { "name": "blog:Guide", "extends": "blog:Article", "properties": [{"name": "difficulty", "type": "String"}], "...": "..." },
  "resolved_properties": [
    {"name": "difficulty", "type": "String"},
    {"name": "rating", "type": "Number", "constraints": {"min": 0, "max": 5}},
    {"name": "title", "type": "String", "required": true, "index": ["Fulltext"]}
  ],
  "resolved_allowed_children": ["raisin:Asset"],
  "resolved_mixins": [],
  "inheritance_chain": ["blog:Guide", "blog:Article"]
}
```

`resolved_properties` is sorted by name; a child's property replaces a parent's property of the same name.

## Update

```
PUT /api/management/{repo}/{branch}/nodetypes/{name}
```

Same body as create. The definition is replaced as a whole (send the full `properties` list), `version` is incremented and `previous_version` points at the replaced record. Response `200` with the stored definition.

```bash
curl -X PUT localhost:8090/api/management/docs-model/main/nodetypes/blog:Author \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"node_type":{"name":"blog:Author","properties":[{"name":"name","type":"String","required":true},{"name":"website","type":"URL"}]},
       "commit":{"message":"Add website","actor":"jane"}}'
```

## Delete

```
DELETE /api/management/{repo}/{branch}/nodetypes/{name}
```

Response `204 No Content`. Existing nodes of that type are not touched.

## Publish and unpublish

```
POST /api/management/{repo}/{branch}/nodetypes/{name}/publish
POST /api/management/{repo}/{branch}/nodetypes/{name}/unpublish
```

Publish sets `published_at` and `published_by` and bumps `version`; unpublish clears the two fields. Both respond `200` with an empty body. An optional `commit` body sets the actor recorded in `published_by`. Nodes can use a NodeType whether or not it is published; publishing controls what editors list.

## Validate a node

```
POST /api/management/{repo}/{branch}/nodetypes/validate
```

Runs the write-time checks (required properties, strict mode, uniqueness, archetype and element fields) against a node without storing it.

```bash
curl -X POST localhost:8090/api/management/docs-model/main/nodetypes/validate \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"workspace":"blog","node":{"name":"x","node_type":"blog:Article","properties":{"rating":9}}}'
```

```json
{"valid": false, "errors": ["Validation failed: Missing required property 'title' for NodeType 'blog:Article'"]}
```

## Related routes

Archetypes, element types and mixins have the same set of routes under `/archetypes`, `/elementtypes` and `/mixins` (mixins have no `/resolved`). Their write bodies wrap the definition in `archetype`, `element_type` and `node_type` respectively.
