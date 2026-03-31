---
sidebar_position: 4
---

# NodeTypes API

Manage NodeType schemas.

## Create NodeType

```bash
POST /api/management/{repo}/{branch}/nodetypes
```

Request:

```json
{
  "name": "Article",
  "label": "Article",
  "element_types": {
    "title": {
      "type": "text",
      "required": true
    }
  }
}
```

## List NodeTypes

```bash
GET /api/management/{repo}/{branch}/nodetypes
```

## Get NodeType

```bash
GET /api/management/{repo}/{branch}/nodetypes/{name}
```

## Update NodeType

```bash
PUT /api/management/{repo}/{branch}/nodetypes/{name}
```

## Delete NodeType

```bash
DELETE /api/management/{repo}/{branch}/nodetypes/{name}
```

## Publish NodeType

```bash
POST /api/management/{repo}/{branch}/nodetypes/{name}/publish
```

## Unpublish NodeType

```bash
POST /api/management/{repo}/{branch}/nodetypes/{name}/unpublish
```
