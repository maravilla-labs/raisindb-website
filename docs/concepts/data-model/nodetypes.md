---
sidebar_position: 2
---

# NodeTypes

**NodeTypes** are schema definitions that specify the structure, validation rules, and behavior of nodes. They're like classes in object-oriented programming—defining properties, constraints, and inheritance relationships for your content.

## What is a NodeType?

A NodeType defines:

- **Property schema**: Required and optional fields with data types
- **Validation rules**: Constraints, patterns, and default values
- **Metadata flags**: Versioning, publishing, and indexing behavior
- **Inheritance**: Extend other NodeTypes (object-oriented style)
- **Composition**: Mix in archetypes (trait-based style)
- **Allowed children**: Hierarchical content restrictions

**Example NodeType definition:**

```yaml
name: blog:Article
properties:
  title:
    type: string
    required: true
    maxLength: 200
  slug:
    type: string
    required: true
    pattern: "^[a-z0-9-]+$"
  author:
    type: string
    required: true
  body:
    type: richtext
  published:
    type: boolean
    default: false
  publishedAt:
    type: datetime
  tags:
    type: array
    items:
      type: string
versionable: true
indexable: true
```

## Creating NodeTypes

NodeTypes are managed via the **HTTP API** or **Admin Console**, not SQL. They are stored in the `raisin:system` workspace.

### Using the Admin Console

1. Navigate to your repository → **NodeTypes**
2. Click **Create NodeType**
3. Define the schema visually or in YAML/JSON

### Using the HTTP API

```bash
curl -X POST http://localhost:8080/api/management/myrepo/main/nodetypes \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": {
      "name": "blog:Article",
      "properties": {
        "title": {"type": "string", "required": true},
        "body": {"type": "richtext"},
        "published": {"type": "boolean", "default": false}
      },
      "versionable": true,
      "indexable": true
    },
    "commit": {
      "message": "Create blog:Article NodeType",
      "actor": "admin"
    }
  }'
```

Once defined, nodes can use this NodeType:

```sql
-- Create a node with this NodeType
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/my-post',
  'blog:Article',
  '{
    "title": "My First Post",
    "body": "<p>Content here...</p>",
    "published": false
  }'
);
```

RaisinDB validates the properties against the schema automatically.

## Property Types

### Primitive Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text field | `"Hello World"` |
| `number` | Integer or float | `42`, `3.14` |
| `boolean` | True/false | `true`, `false` |
| `datetime` | ISO 8601 timestamp | `"2024-01-15T10:30:00Z"` |
| `date` | Date only | `"2024-01-15"` |
| `time` | Time only | `"14:30:00"` |

### Complex Types

| Type | Description | Example |
|------|-------------|---------|
| `richtext` | HTML content | `"<p>Rich <strong>text</strong></p>"` |
| `json` | Arbitrary JSON | `{"key": "value"}` |
| `array` | List of items | `["tag1", "tag2"]` |
| `object` | Nested object | `{"address": {"city": "NYC"}}` |

### Reference Types

| Type | Description | Example |
|------|-------------|---------|
| `reference` | Link to another node (path) | `"/content/authors/jane"` |
| `media` | Media file reference | `"/media/images/header.jpg"` |

### Specialized Types

| Type | Description | Example |
|------|-------------|---------|
| `email` | Email address | `"user@example.com"` |
| `url` | Web URL | `"https://example.com"` |
| `uuid` | UUID identifier | `"550e8400-e29b-41d4-a716-446655440000"` |
| `geo` | Geospatial coordinates | `{"lat": 40.7128, "lng": -74.0060}` |

## Property Constraints

### Required Fields

```yaml
title:
  type: string
  required: true
```

### Default Values

```yaml
published:
  type: boolean
  default: false
createdDate:
  type: datetime
  default: "NOW()"
```

### String Constraints

```yaml
title:
  type: string
  minLength: 10
  maxLength: 200
  pattern: "^[A-Z].*"
slug:
  type: string
  pattern: "^[a-z0-9-]+$"
```

### Number Constraints

```yaml
age:
  type: number
  minimum: 0
  maximum: 120
price:
  type: number
  minimum: 0
  multipleOf: 0.01
```

### Array Constraints

```yaml
tags:
  type: array
  items:
    type: string
  minItems: 1
  maxItems: 10
  uniqueItems: true
```

### Enum Values

```yaml
status:
  type: string
  enum: [draft, review, published, archived]
priority:
  type: number
  enum: [1, 2, 3, 4, 5]
```

## Property Metadata and Nested Schema

Beyond the validation keys above, every property supports three open-ended maps for advanced schemas and custom tooling. In the stored schema these are distinct objects on the property, and the Admin Console exposes all three in the property editor's **Metadata** tab.

### Constraints

The validation keys shown above (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `minItems`, `maxItems`, `uniqueItems`, …) are stored together in a `constraints` map. You can also set constraint keys the visual editor doesn't surface directly — anything you put here is preserved and available to validators and integrations:

```yaml
sku:
  type: string
  constraints:
    pattern: "^[A-Z0-9-]+$"
    maxLength: 32
    # custom keys are kept as-is
    examples: ["AB-1234", "ZZ-9999"]
```

### Structure (nested object schemas)

`Object` properties describe their shape with a `structure` map — nested property schemas keyed by field name. Each value is itself a full property schema, so structures can nest arbitrarily:

```yaml
address:
  type: object
  structure:
    street:
      type: string
      required: true
    city:
      type: string
    zip:
      type: string
      constraints:
        pattern: "^\\d{5}(-\\d{4})?$"
  allow_additional_properties: false
```

Set `allow_additional_properties: true` to permit keys not listed in `structure`.

In the Admin Console you can build a structure visually by dropping nested properties onto an object in the NodeType canvas, or edit the whole structure as JSON in the property editor's **Metadata** tab.

### Meta (arbitrary metadata)

`meta` is a free-form key/value map that RaisinDB stores and round-trips untouched. The database never interprets it — use it to attach editor hints, integration configuration, or any custom data to a property:

```yaml
hero_image:
  type: media
  meta:
    group: "appearance"
    editorWidth: "full"
    docs: "https://example.com/style-guide#hero"
```

Values may be strings, numbers, booleans, arrays, or objects.

## Inheritance with Extend

NodeTypes can extend other NodeTypes (single inheritance):

**Base NodeType:**

```yaml
name: content:BaseContent
properties:
  title:
    type: string
    required: true
  description:
    type: string
  created:
    type: datetime
    default: "NOW()"
```

**Extended NodeType:**

```yaml
name: blog:Article
extends: content:BaseContent
properties:
  body:
    type: richtext
    required: true
  author:
    type: string
    required: true
  published:
    type: boolean
    default: false
```

`blog:Article` inherits all properties from `content:BaseContent` and adds its own.

## Composition with Mixins

Use archetypes as mixins for trait-based composition:

**Archetypes (reusable property sets):**

```yaml
name: Publishable
properties:
  published:
    type: boolean
  publishedAt:
    type: datetime
```

**NodeType with mixins:**

```yaml
name: blog:Article
mixins:
  - Publishable
  - Taggable
  - Authorable
properties:
  title:
    type: string
    required: true
  body:
    type: richtext
```

The NodeType gets all properties from all mixins plus its own properties.

Learn more: [Archetypes](/docs/concepts/data-model/archetypes)

## Metadata Flags

Control node behavior with metadata flags:

### Versionable

```yaml
versionable: true
```

When enabled:
- Every change creates a new revision with HLC timestamp
- Full revision history is maintained
- Time-travel queries are supported
- Nodes can be rolled back

### Indexable

```yaml
indexable: true
```

When enabled:
- Nodes are included in full-text search indexes
- Automatically indexed on creation/update
- Searchable with `FULLTEXT_SEARCH()` function

### Auditable

```yaml
auditable: true
```

When enabled:
- Every change is written to the **audit log** (user, action, timestamp)
- For compliance and security requirements

This is **opt-in** and independent of revision history: every node always has full
structural MVCC [revision history](/docs/concepts/data-model/nodes#working-with-revisions)
regardless of `auditable` — the flag only controls whether audit-log entries are
produced. Query the audit log with the client `nodes().auditLog(id)` method, the
REST endpoint `GET /api/audit/{repo}/{branch}/{ws}/by-id/{id}`, or the WebSocket
`audit_query` request.

## Hierarchical Constraints

Control which NodeTypes can be children of others:

```yaml
name: content:Folder
allowed_children:
  - blog:Article
  - content:Folder
properties:
  name:
    type: string
    required: true
```

RaisinDB enforces these constraints when creating nodes.

## Querying NodeTypes

List NodeTypes via the API:

```bash
# List all NodeTypes
curl http://localhost:8080/api/management/myrepo/main/nodetypes

# Get a specific NodeType
curl http://localhost:8080/api/management/myrepo/main/nodetypes/blog:Article

# Get resolved NodeType (with inherited properties)
curl http://localhost:8080/api/management/myrepo/main/nodetypes/blog:Article/resolved
```

Or query the system workspace:

```sql
-- Query NodeTypes from the system workspace
SELECT path, properties->>'name' AS name
FROM "raisin:system"
WHERE node_type = 'raisin:NodeType';
```

## Updating NodeTypes

Update via the HTTP API:

```bash
curl -X PUT http://localhost:8080/api/management/myrepo/main/nodetypes/blog:Article \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": {
      "name": "blog:Article",
      "properties": {
        "title": {"type": "string", "required": true},
        "body": {"type": "richtext"},
        "published": {"type": "boolean", "default": false},
        "featured": {"type": "boolean", "default": false}
      },
      "versionable": true
    },
    "commit": {
      "message": "Add featured field to Article",
      "actor": "admin"
    }
  }'
```

**Warning**: Schema changes affect existing nodes. RaisinDB validates all nodes against the new schema.

## Validation Errors

When creating or updating nodes, RaisinDB validates against the schema:

```sql
-- Missing required field
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/bad',
  'blog:Article',
  '{"body": "Content only"}'
);
-- Error: Required property 'title' is missing

-- Wrong type
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/bad',
  'blog:Article',
  '{"title": 123, "body": "Content"}'
);
-- Error: Property 'title' must be type 'string', got 'number'

-- Pattern violation
INSERT INTO default (path, node_type, properties) VALUES (
  '/content/blog/bad',
  'blog:Article',
  '{"title": "Title", "slug": "Invalid Slug!"}'
);
-- Error: Property 'slug' does not match pattern '^[a-z0-9-]+$'
```

## Common Patterns

### Content Types

```yaml
name: blog:Article
properties:
  title:
    type: string
    required: true
  slug:
    type: string
    required: true
    pattern: "^[a-z0-9-]+$"
  body:
    type: richtext
  excerpt:
    type: string
    maxLength: 500
  author:
    type: reference
  category:
    type: reference
  tags:
    type: array
    items:
      type: string
  featuredImage:
    type: media
  published:
    type: boolean
  publishedAt:
    type: datetime
versionable: true
indexable: true
```

### E-commerce Types

```yaml
name: ecommerce:Product
properties:
  name:
    type: string
    required: true
  sku:
    type: string
    required: true
    pattern: "^[A-Z0-9-]+$"
  description:
    type: richtext
  price:
    type: number
    minimum: 0
    multipleOf: 0.01
  salePrice:
    type: number
    minimum: 0
  inventory:
    type: number
    minimum: 0
  images:
    type: array
    items:
      type: media
  category:
    type: reference
  published:
    type: boolean
versionable: true
indexable: true
```

### User Profile Types

```yaml
name: user:Profile
properties:
  username:
    type: string
    required: true
    pattern: "^[a-z0-9_]+$"
  email:
    type: email
    required: true
  displayName:
    type: string
  bio:
    type: string
    maxLength: 500
  avatar:
    type: media
  location:
    type: geo
  socialLinks:
    type: object
  preferences:
    type: json
versionable: false
auditable: true
```

## Best Practices

1. **Use namespaces**: Prefix NodeType names with a namespace (e.g., `blog:`, `ecommerce:`)
2. **Define constraints**: Use `required`, `pattern`, `min`/`max` for data integrity
3. **Enable versioning selectively**: Only for content that needs audit trails
4. **Use archetypes for shared properties**: DRY principle with mixins
5. **Index strategically**: Only index fields you query frequently
6. **Document your schemas**: Use clear property names
7. **Version your NodeTypes**: Track schema changes in version control

## Next Steps

- **[Nodes](/docs/concepts/data-model/nodes)** - Create and query typed content
- **[Archetypes](/docs/concepts/data-model/archetypes)** - Build reusable property templates
- **[Elements](/docs/concepts/data-model/elements)** - Define UI components for forms
- **[Data Modeling Guide](/docs/guides/data-modeling/creating-nodetypes)** - Build complex content models
