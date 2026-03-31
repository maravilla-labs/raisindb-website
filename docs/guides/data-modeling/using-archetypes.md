---
sidebar_position: 2
---

# Using Archetypes

Archetypes provide reusable element type collections that can be composed into NodeTypes.

## What are Archetypes?

Archetypes are collections of related element types that can be mixed into NodeTypes, similar to mixins or traits in programming. They promote:
- Code reuse across NodeTypes
- Consistent property definitions
- Modular schema design

## Creating Archetypes

### Via HTTP API

```bash
curl -X POST \
  http://localhost:8080/api/management/myapp/main/archetypes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Publishable",
    "label": "Publishable Content",
    "description": "Common properties for published content",
    "element_types": {
      "status": {
        "type": "select",
        "label": "Status",
        "options": ["draft", "review", "published", "archived"],
        "default": "draft"
      },
      "published_date": {
        "type": "date",
        "label": "Published Date"
      },
      "author": {
        "type": "text",
        "label": "Author"
      }
    }
  }'
```

### Via Package (YAML)

Create `archetypes/Publishable.yaml`:

```yaml
name: Publishable
label: Publishable Content
description: Common properties for published content

element_types:
  status:
    type: select
    label: Status
    options:
      - draft
      - review
      - published
      - archived
    default: draft

  published_date:
    type: date
    label: Published Date

  author:
    type: text
    label: Author
```

## Using Archetypes in NodeTypes

### Single Archetype

```yaml
name: Article
label: Article
archetypes:
  - Publishable

element_types:
  title:
    type: text
    required: true
  content:
    type: richtext
    required: true
```

The `Article` NodeType now has all properties from `Publishable` plus its own.

### Multiple Archetypes

```yaml
name: BlogPost
label: Blog Post
archetypes:
  - Publishable
  - Searchable
  - Taggable

element_types:
  title:
    type: text
    required: true
  content:
    type: richtext
```

## Built-in Archetypes

RaisinDB provides common archetypes out of the box:

### Searchable

Full-text search support:

```yaml
name: Searchable
element_types:
  search_keywords:
    type: text
    label: Search Keywords
    array: true
  search_boost:
    type: number
    label: Search Boost
    default: 1.0
```

### Taggable

Tagging support:

```yaml
name: Taggable
element_types:
  tags:
    type: text
    label: Tags
    array: true
  categories:
    type: reference
    label: Categories
    node_type: Category
    array: true
```

### Timestamped

Automatic timestamps (usually built-in):

```yaml
name: Timestamped
element_types:
  created_at:
    type: date
    label: Created At
    include_time: true
    auto: true
  updated_at:
    type: date
    label: Updated At
    include_time: true
    auto: true
```

### Versioned

Version tracking:

```yaml
name: Versioned
element_types:
  version:
    type: number
    label: Version
    default: 1
  revision_message:
    type: text
    label: Revision Message
```

## Common Archetype Patterns

### SEO Metadata

```yaml
name: SEOMetadata
label: SEO Metadata
description: Search engine optimization fields

element_types:
  meta_title:
    type: text
    label: Meta Title
    max_length: 60

  meta_description:
    type: text
    label: Meta Description
    max_length: 160

  og_image:
    type: reference
    label: Social Share Image
    node_type: Image

  canonical_url:
    type: text
    label: Canonical URL
```

### Geographic Location

```yaml
name: Geolocated
label: Geographic Location

element_types:
  latitude:
    type: number
    label: Latitude
    min: -90
    max: 90

  longitude:
    type: number
    label: Longitude
    min: -180
    max: 180

  address:
    type: object
    label: Address
    properties:
      street:
        type: text
      city:
        type: text
      state:
        type: text
      postal_code:
        type: text
      country:
        type: text
```

### Social Media

```yaml
name: SocialMedia
label: Social Media Links

element_types:
  twitter_handle:
    type: text
    label: Twitter Handle
    pattern: ^@?[A-Za-z0-9_]+$

  linkedin_url:
    type: text
    label: LinkedIn URL

  facebook_url:
    type: text
    label: Facebook URL

  instagram_handle:
    type: text
    label: Instagram Handle
```

### E-commerce Product

```yaml
name: Purchasable
label: Purchasable Item

element_types:
  price:
    type: number
    label: Price
    required: true
    min: 0
    decimal: true

  sale_price:
    type: number
    label: Sale Price
    min: 0
    decimal: true

  currency:
    type: select
    label: Currency
    options: [USD, EUR, GBP, JPY]
    default: USD

  in_stock:
    type: boolean
    label: In Stock
    default: true

  inventory_count:
    type: number
    label: Inventory Count
    min: 0
    default: 0
```

## Archetype Composition Example

```yaml
# Article NodeType using multiple archetypes
name: Article
label: Article
archetypes:
  - Publishable
  - Searchable
  - Taggable
  - SEOMetadata

element_types:
  title:
    type: text
    label: Title
    required: true
    max_length: 200

  slug:
    type: text
    label: URL Slug
    required: true
    unique: true
    pattern: ^[a-z0-9-]+$

  content:
    type: richtext
    label: Content
    required: true

  featured_image:
    type: reference
    label: Featured Image
    node_type: Image
```

This results in an Article with:
- `title`, `slug`, `content`, `featured_image` (own properties)
- `status`, `published_date`, `author` (from Publishable)
- `search_keywords`, `search_boost` (from Searchable)
- `tags`, `categories` (from Taggable)
- `meta_title`, `meta_description`, etc. (from SEOMetadata)

## Overriding Archetype Properties

You can override properties from archetypes:

```yaml
name: SpecialArticle
archetypes:
  - Publishable

element_types:
  # Override status from Publishable
  status:
    type: select
    label: Status
    options: [draft, published]  # Fewer options
    required: true                # Make required

  title:
    type: text
    required: true
```

## Publishing Archetypes

Like NodeTypes, archetypes must be published:

```bash
curl -X POST \
  http://localhost:8080/api/management/myapp/main/archetypes/Publishable/publish \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Best Practices

### Keep Archetypes Focused

```yaml
# Good: Focused on one concern
name: Commentable
element_types:
  comments_enabled:
    type: boolean
    default: true
  comments_count:
    type: number
    default: 0

# Bad: Too many unrelated concerns
name: Everything
element_types:
  comments_enabled: ...
  price: ...
  location: ...
  social_links: ...
```

### Use Descriptive Names

- `Publishable` not `Status`
- `Geolocated` not `Location`
- `SEOMetadata` not `Meta`

### Version Archetypes Carefully

When updating published archetypes:
1. Consider impact on existing NodeTypes
2. Add new properties with defaults
3. Avoid removing properties
4. Use new archetype version if breaking changes needed

## Next Steps

- [Defining Element Types](./defining-elements.md) for custom property types
- [Creating NodeTypes](./creating-nodetypes.md) using archetypes
