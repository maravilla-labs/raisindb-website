---
sidebar_position: 3
---

# Defining Element Types

Element types are the building blocks of properties in your NodeTypes.

## Element Type Basics

An element type defines:
- Data type (text, number, date, etc.)
- Validation rules
- Default values
- UI presentation hints

## Core Element Types

### Text

Simple string values:

```yaml
name:
  type: text
  label: Name
  required: true
  min_length: 1
  max_length: 100
  placeholder: Enter name...
  help_text: The person's full name
```

Options:
- `min_length`: Minimum character count
- `max_length`: Maximum character count
- `pattern`: Regular expression for validation
- `placeholder`: UI hint
- `help_text`: Description for editors

### Richtext

HTML or Markdown formatted content:

```yaml
content:
  type: richtext
  label: Content
  format: html  # or 'markdown'
  toolbar:
    - bold
    - italic
    - link
    - heading
    - list
```

### Number

Numeric values:

```yaml
quantity:
  type: number
  label: Quantity
  min: 0
  max: 1000
  step: 1        # Integer steps
  default: 1

price:
  type: number
  label: Price
  min: 0
  decimal: true  # Allow decimals
  step: 0.01
  default: 0.00
```

### Boolean

True/false toggle:

```yaml
active:
  type: boolean
  label: Active
  default: false

featured:
  type: boolean
  label: Featured
  default: true
  help_text: Show on homepage
```

### Date

Date and datetime values:

```yaml
birth_date:
  type: date
  label: Birth Date
  min: 1900-01-01
  max: 2024-12-31

event_time:
  type: date
  label: Event Time
  include_time: true
  default: now
```

### Select

Dropdown with predefined options:

```yaml
size:
  type: select
  label: Size
  options:
    - Small
    - Medium
    - Large
  default: Medium

status:
  type: select
  label: Status
  options:
    - value: draft
      label: Draft
    - value: published
      label: Published
    - value: archived
      label: Archived
  default: draft
```

### Reference

Link to another node:

```yaml
author:
  type: reference
  label: Author
  node_type: User
  workspace: users
  required: true

category:
  type: reference
  label: Category
  node_type: Category
  allow_create: true  # Allow creating new categories
```

### Array

Multiple values:

```yaml
tags:
  type: text
  label: Tags
  array: true
  min_items: 1
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
address:
  type: object
  label: Address
  properties:
    street:
      type: text
      label: Street Address
    city:
      type: text
      label: City
    state:
      type: text
      label: State
    zip:
      type: text
      label: ZIP Code
      pattern: ^\d{5}(-\d{4})?$

dimensions:
  type: object
  label: Dimensions
  properties:
    width:
      type: number
      label: Width
    height:
      type: number
      label: Height
    depth:
      type: number
      label: Depth
    unit:
      type: select
      label: Unit
      options: [cm, in, ft]
```

## Advanced Validation

### Pattern Matching

```yaml
email:
  type: text
  label: Email
  pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
  error_message: Please enter a valid email address

phone:
  type: text
  label: Phone
  pattern: ^\+?1?\d{9,15}$
  error_message: Please enter a valid phone number

slug:
  type: text
  label: Slug
  pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$
  error_message: Only lowercase letters, numbers, and hyphens allowed
```

### Unique Constraints

```yaml
username:
  type: text
  label: Username
  unique: true
  min_length: 3
  max_length: 30
  pattern: ^[a-zA-Z0-9_]+$

email:
  type: text
  label: Email
  unique: true
  pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

### Conditional Requirements

```yaml
# Via JSON schema
product_type:
  type: select
  label: Product Type
  options: [physical, digital]

shipping_weight:
  type: number
  label: Shipping Weight (kg)
  required_if:
    field: product_type
    value: physical

download_url:
  type: text
  label: Download URL
  required_if:
    field: product_type
    value: digital
```

## Custom Validation

### JSON Schema

Use full JSON Schema for complex validation:

```yaml
config:
  type: object
  label: Configuration
  json_schema:
    type: object
    properties:
      host:
        type: string
        format: hostname
      port:
        type: integer
        minimum: 1
        maximum: 65535
      ssl:
        type: boolean
    required: [host, port]
```

### Validation Functions

Reference a serverless function for validation:

```yaml
custom_field:
  type: text
  label: Custom Field
  validate: validate-custom-field  # Function name
```

## UI Presentation

### Display Options

```yaml
description:
  type: text
  label: Description
  multiline: true
  rows: 5

bio:
  type: richtext
  label: Biography
  toolbar_position: top
  min_height: 200px

color:
  type: text
  label: Color
  widget: color-picker
  default: "#000000"
```

### Grouping

```yaml
# NodeType with field groups
name: Product
element_types:
  # Basic Information
  name:
    type: text
    group: basic
  sku:
    type: text
    group: basic

  # Pricing
  price:
    type: number
    group: pricing
  sale_price:
    type: number
    group: pricing

  # Inventory
  stock:
    type: number
    group: inventory
  warehouse:
    type: text
    group: inventory

groups:
  basic:
    label: Basic Information
    order: 1
  pricing:
    label: Pricing
    order: 2
  inventory:
    label: Inventory
    order: 3
```

## Computed Properties

### Auto-generated Values

```yaml
created_at:
  type: date
  label: Created At
  auto: true
  immutable: true

updated_at:
  type: date
  label: Updated At
  auto: true
  on_update: true

id:
  type: text
  label: ID
  auto: true
  generator: ulid
  immutable: true
```

### Derived Values

Use functions to compute values:

```yaml
full_name:
  type: text
  label: Full Name
  computed: true
  compute: compute-full-name  # Function that combines first_name + last_name

total_price:
  type: number
  label: Total Price
  computed: true
  compute: calculate-total  # Function that sums line items
```

## Internationalization

### Translatable Fields

```yaml
title:
  type: text
  label: Title
  translatable: true

description:
  type: richtext
  label: Description
  translatable: true

# Non-translatable
sku:
  type: text
  label: SKU
  translatable: false
```

When `translatable: true`, values are stored per locale:

```json
{
  "title": {
    "en": "Hello World",
    "es": "Hola Mundo",
    "fr": "Bonjour le monde"
  }
}
```

## Real-World Examples

### User Profile

```yaml
name: UserProfile
element_types:
  username:
    type: text
    label: Username
    required: true
    unique: true
    min_length: 3
    max_length: 30
    pattern: ^[a-zA-Z0-9_]+$

  email:
    type: text
    label: Email
    required: true
    unique: true
    pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$

  display_name:
    type: text
    label: Display Name
    max_length: 50

  bio:
    type: richtext
    label: Bio
    max_length: 500

  avatar:
    type: reference
    label: Avatar
    node_type: Image

  social_links:
    type: object
    label: Social Links
    properties:
      twitter:
        type: text
      linkedin:
        type: text
      github:
        type: text
```

### Product Catalog

```yaml
name: Product
element_types:
  name:
    type: text
    label: Product Name
    required: true
    max_length: 200
    translatable: true

  sku:
    type: text
    label: SKU
    required: true
    unique: true
    pattern: ^[A-Z0-9-]+$

  description:
    type: richtext
    label: Description
    translatable: true

  price:
    type: number
    label: Price
    required: true
    min: 0
    decimal: true

  images:
    type: reference
    label: Images
    node_type: Image
    array: true
    max_items: 10

  variants:
    type: object
    label: Variants
    array: true
    properties:
      size:
        type: select
        options: [XS, S, M, L, XL]
      color:
        type: text
      sku:
        type: text
      price_adjustment:
        type: number
```

## Next Steps

- [Creating NodeTypes](./creating-nodetypes.md) with element types
- [Using Archetypes](./using-archetypes.md) for reusable elements
- [Querying Data](../querying/sql-basics.md) with your schema
