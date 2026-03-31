---
sidebar_position: 1
---

# Creating NodeTypes

NodeTypes define the schema and structure for your content in RaisinDB.

## What is a NodeType?

A NodeType is like a table schema in SQL or a class in OOP. It defines:
- What properties a node can have
- Property types and validation rules
- Which child NodeTypes are allowed
- Default values and behaviors

## Creating Your First NodeType

### Via HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/management/myapp/main/nodetypes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Article",
    "label": "Article",
    "description": "A blog article or news post",
    "element_types": {
      "title": {
        "label": "Title",
        "type": "text",
        "required": true,
        "max_length": 200
      },
      "slug": {
        "label": "URL Slug",
        "type": "text",
        "required": true,
        "pattern": "^[a-z0-9-]+$"
      },
      "content": {
        "label": "Content",
        "type": "richtext",
        "required": true
      },
      "author": {
        "label": "Author",
        "type": "text"
      },
      "published_date": {
        "label": "Published Date",
        "type": "date"
      },
      "status": {
        "label": "Status",
        "type": "select",
        "options": ["draft", "published", "archived"],
        "default": "draft"
      },
      "tags": {
        "label": "Tags",
        "type": "text",
        "array": true
      }
    }
  }'
```

### Via Admin Console

1. Navigate to **Schema** → **NodeTypes**
2. Click **Create NodeType**
3. Fill in the form:
   - **Name**: `Article`
   - **Label**: `Article`
   - **Description**: `A blog article or news post`
4. Add element types using the visual editor
5. Click **Save**

### Via Package (YAML)

Create `nodetypes/Article.yaml`:

```yaml
name: Article
label: Article
description: A blog article or news post

element_types:
  title:
    label: Title
    type: text
    required: true
    max_length: 200

  slug:
    label: URL Slug
    type: text
    required: true
    pattern: ^[a-z0-9-]+$

  content:
    label: Content
    type: richtext
    required: true

  author:
    label: Author
    type: text

  published_date:
    label: Published Date
    type: date

  status:
    label: Status
    type: select
    options:
      - draft
      - published
      - archived
    default: draft

  tags:
    label: Tags
    type: text
    array: true
```

## Property Types

### Text

Simple text field:

```yaml
title:
  type: text
  label: Title
  required: true
  max_length: 200
  min_length: 10
```

### Richtext

HTML or Markdown content:

```yaml
content:
  type: richtext
  label: Content
  format: html  # or 'markdown'
```

### Number

Integer or decimal:

```yaml
price:
  type: number
  label: Price
  min: 0
  max: 99999.99
  decimal: true

views:
  type: number
  label: View Count
  default: 0
```

### Boolean

True/false toggle:

```yaml
featured:
  type: boolean
  label: Featured
  default: false
```

### Date

Date or datetime:

```yaml
published_date:
  type: date
  label: Published Date

last_modified:
  type: date
  label: Last Modified
  include_time: true
```

### Select

Dropdown with predefined options:

```yaml
status:
  type: select
  label: Status
  options:
    - draft
    - review
    - published
  default: draft
```

### Reference

Link to another node:

```yaml
author:
  type: reference
  label: Author
  node_type: User  # Optional: restrict to specific type
  workspace: users # Optional: specify workspace

category:
  type: reference
  label: Category
  node_type: Category
  required: true
```

### Array

Multiple values:

```yaml
tags:
  type: text
  label: Tags
  array: true
  max_items: 10

related_articles:
  type: reference
  label: Related Articles
  node_type: Article
  array: true
  max_items: 5
```

### Object

Nested structure:

```yaml
metadata:
  type: object
  label: Metadata
  properties:
    author_name:
      type: text
    author_email:
      type: text
    keywords:
      type: text
      array: true
```

## Validation Rules

### Required Fields

```yaml
title:
  type: text
  required: true
```

### String Length

```yaml
summary:
  type: text
  min_length: 50
  max_length: 500
```

### Regular Expression

```yaml
email:
  type: text
  pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$

slug:
  type: text
  pattern: ^[a-z0-9-]+$
```

### Number Range

```yaml
rating:
  type: number
  min: 1
  max: 5

age:
  type: number
  min: 0
  max: 120
```

### Unique Values

```yaml
username:
  type: text
  unique: true

email:
  type: text
  unique: true
  pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

## Allowed Children

Control which NodeTypes can be children:

```yaml
name: BlogSeries
label: Blog Series

allowed_children:
  - Article
  - Chapter

element_types:
  title:
    type: text
    required: true
  description:
    type: richtext
```

## Publishing NodeTypes

NodeTypes must be published to be used:

```bash
curl -X POST \
  http://localhost:8080/api/management/myapp/main/nodetypes/Article/publish \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Once published, you can create nodes of that type:

```bash
curl -X POST \
  http://localhost:8080/api/repository/myapp/main/head/content/articles/my-first-article \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "Article",
    "properties": {
      "title": "My First Article",
      "slug": "my-first-article",
      "content": "<p>Hello world!</p>",
      "status": "draft"
    }
  }'
```

## Updating NodeTypes

Update unpublished NodeTypes freely:

```bash
curl -X PUT \
  http://localhost:8080/api/management/myapp/main/nodetypes/Article \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "element_types": {
      "excerpt": {
        "label": "Excerpt",
        "type": "text",
        "max_length": 300
      }
    }
  }'
```

To update a published NodeType:

1. Unpublish it
2. Make changes
3. Re-publish

```bash
# Unpublish
curl -X POST \
  http://localhost:8080/api/management/myapp/main/nodetypes/Article/unpublish \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update
curl -X PUT http://localhost:8080/api/management/myapp/main/nodetypes/Article ...

# Re-publish
curl -X POST \
  http://localhost:8080/api/management/myapp/main/nodetypes/Article/publish \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Best Practices

### Naming Conventions

- Use PascalCase: `BlogPost`, `UserProfile`, `ProductCategory`
- Be descriptive: `Article` not `Post`
- Singular form: `Product` not `Products`

### Property Design

- Keep properties focused and atomic
- Use descriptive labels
- Set sensible defaults
- Add validation where appropriate
- Document complex properties

### Hierarchy Planning

```yaml
# Good: Clear parent-child relationships
Website
├── Page
├── BlogPost
└── Portfolio
    └── Project

# Bad: Flat structure without relationships
Website
Page
BlogPost
Portfolio
Project
```

### Example: E-commerce Schema

```yaml
# Product NodeType
name: Product
label: Product

element_types:
  name:
    type: text
    required: true
    max_length: 200

  sku:
    type: text
    required: true
    unique: true
    pattern: ^[A-Z0-9-]+$

  description:
    type: richtext

  price:
    type: number
    required: true
    min: 0
    decimal: true

  inventory:
    type: number
    min: 0
    default: 0

  category:
    type: reference
    node_type: Category
    required: true

  images:
    type: reference
    node_type: Image
    array: true
    max_items: 10

  attributes:
    type: object
    properties:
      weight:
        type: number
      dimensions:
        type: text
      color:
        type: text

allowed_children:
  - ProductVariant
  - Review
```

## Next Steps

- [Using Archetypes](./using-archetypes.md) for reusable schemas
- [Defining Elements](./defining-elements.md) for advanced property types
- [Querying Data](../querying/sql-basics.md) with your NodeTypes
