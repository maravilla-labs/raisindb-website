---
sidebar_position: 3
---

# Nodes API

CRUD operations for nodes.

## Create Node

```bash
POST /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

Request:

```json
{
  "node_type": "Article",
  "properties": {
    "title": "Hello World",
    "content": "..."
  }
}
```

Response: Created node object

## Get Node

```bash
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

## Update Node

```bash
PUT /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

Request:

```json
{
  "properties": {
    "title": "Updated Title"
  }
}
```

## Delete Node

```bash
DELETE /api/repository/{repo}/{branch}/head/{workspace}/{path}
```

## Get by ID

```bash
GET /api/repository/{repo}/{branch}/head/{workspace}/$ref/{id}
```

## Time Travel

Get node at specific revision:

```bash
GET /api/repository/{repo}/{branch}/rev/{revision}/{workspace}/{path}
```
