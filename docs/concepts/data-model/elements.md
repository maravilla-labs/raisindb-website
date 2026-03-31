---
sidebar_position: 4
---

# Elements

**Elements** (also called ElementTypes) define UI component specifications for rendering forms in the Admin Console and client applications. They map NodeType properties to visual field components, providing a schema-driven approach to building content editing interfaces.

## What is an Element?

An Element defines how a property should be displayed and edited in a user interface:

```yaml
name: rich-text-editor
component: RichTextEditor
properties:
  placeholder:
    type: string
  toolbar:
    type: array
  maxLength:
    type: number
defaultProps:
  toolbar: [bold, italic, link, heading]
```

When you define a NodeType property, you can specify which Element to use:

```yaml
name: blog:Article
properties:
  body:
    type: richtext
    element: rich-text-editor       # Maps to Element
    elementProps:
      placeholder: "Write your article..."
      maxLength: 50000
```

The Admin Console automatically renders the appropriate UI component based on the Element definition.

## Built-in Element Types

RaisinDB includes standard elements for common field types:

### Text Input

```yaml
name: text-input
component: TextInput
properties:
  placeholder:
    type: string
  maxLength:
    type: number
  pattern:
    type: string
  autocomplete:
    type: string
```

Usage:

```yaml
title:
  type: string
  element: text-input
  elementProps:
    placeholder: "Enter title..."
    maxLength: 200
```

### Textarea

```yaml
name: textarea
component: Textarea
properties:
  placeholder:
    type: string
  rows:
    type: number
  maxLength:
    type: number
```

### Rich Text Editor

```yaml
name: rich-text-editor
component: RichTextEditor
properties:
  toolbar:
    type: array
  allowedFormats:
    type: array
  imageUpload:
    type: boolean
```

### Number Input

```yaml
name: number-input
component: NumberInput
properties:
  min:
    type: number
  max:
    type: number
  step:
    type: number
  precision:
    type: number
```

### Checkbox

```yaml
name: checkbox
component: Checkbox
properties:
  label:
    type: string
  helpText:
    type: string
```

### Select Dropdown

```yaml
name: select
component: Select
properties:
  options:
    type: array
  multiple:
    type: boolean
  searchable:
    type: boolean
```

Usage:

```yaml
status:
  type: string
  element: select
  elementProps:
    options:
      - value: draft
        label: Draft
      - value: review
        label: In Review
      - value: published
        label: Published
```

### Date Picker

```yaml
name: date-picker
component: DatePicker
properties:
  format:
    type: string
  includeTime:
    type: boolean
  minDate:
    type: datetime
  maxDate:
    type: datetime
```

### Media Picker

```yaml
name: media-picker
component: MediaPicker
properties:
  accept:
    type: array
  maxSize:
    type: number
  multiple:
    type: boolean
  uploadPath:
    type: string
```

Usage:

```yaml
featuredImage:
  type: media
  element: media-picker
  elementProps:
    accept: [image/jpeg, image/png, image/webp]
    maxSize: 5242880  # 5MB in bytes
```

### Reference Picker

```yaml
name: reference-picker
component: ReferencePicker
properties:
  nodeType:
    type: string
  workspace:
    type: string
  multiple:
    type: boolean
  searchable:
    type: boolean
```

Usage:

```yaml
author:
  type: reference
  element: reference-picker
  elementProps:
    nodeType: user:Profile
    workspace: default
    searchable: true
```

### Tag Input

```yaml
name: tag-input
component: TagInput
properties:
  suggestions:
    type: array
  allowCustom:
    type: boolean
  maxTags:
    type: number
```

### Color Picker

```yaml
name: color-picker
component: ColorPicker
properties:
  format:
    type: string    # hex, rgb, hsl
  presets:
    type: array
```

### Geolocation Picker

```yaml
name: geo-picker
component: GeoLocationPicker
properties:
  mapProvider:
    type: string
  zoom:
    type: number
  searchEnabled:
    type: boolean
```

## Creating Custom Elements

Define custom elements in `raisin:system.element_types`:

```sql
-- Custom markdown editor element
INSERT INTO raisin:system.element_types (name, component, properties, defaultProps) VALUES (
  'markdown-editor',
  'MarkdownEditor',
  '{
    "placeholder": {"type": "string"},
    "preview": {"type": "boolean"},
    "syntax": {"type": "string"}
  }',
  '{
    "preview": true,
    "syntax": "github"
  }'
);
```

Use in NodeType:

```sql
{
  "content": {
    "type": "string",
    "element": "markdown-editor",
    "elementProps": {
      "placeholder": "Write markdown content..."
    }
  }
}
```

## Element Properties

### Common Properties

All elements support these common properties:

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Field label shown in UI |
| `helpText` | string | Descriptive help text |
| `placeholder` | string | Placeholder text |
| `disabled` | boolean | Disable field editing |
| `required` | boolean | Mark as required (visual indicator) |
| `validation` | object | Custom validation rules |

### Validation Rules

Elements can specify UI-level validation:

```yaml
email:
  type: email
  element: text-input
  elementProps:
    label: Email Address
    placeholder: "user@example.com"
    validation:
      pattern: "^[^@]+@[^@]+\\.[^@]+$"
      message: "Please enter a valid email address"
```

## Conditional Elements

Show/hide elements based on other field values:

```yaml
properties:
  hasExpiration:
    type: boolean
    element: checkbox
    elementProps:
      label: Content expires
  expiresAt:
    type: datetime
    element: date-picker
    elementProps:
      label: Expiration date
      condition:
        field: hasExpiration
        equals: true
```

The `expiresAt` field only appears when `hasExpiration` is true.

## Element Groups

Group related fields together:

```yaml
name: blog:Article
properties:
  title:
    type: string
    element: text-input
  body:
    type: richtext
    element: rich-text-editor
elementGroups:
  - name: seo
    label: SEO Settings
    fields: [metaTitle, metaDescription, ogImage]
    collapsible: true
    collapsed: true
  - name: publish
    label: Publishing
    fields: [published, publishedAt, author]
```

In the Admin Console, fields are organized into collapsible groups.

## Element Layouts

Control field layout:

```yaml
elementLayout:
  columns: 2
  fields:
    title:
      span: 2       # Full width
    author:
      span: 1       # Half width
    category:
      span: 1       # Half width
    body:
      span: 2       # Full width
```

## Default Element Mapping

If no element is specified, RaisinDB uses defaults:

| Property Type | Default Element |
|---------------|-----------------|
| `string` | `text-input` |
| `number` | `number-input` |
| `boolean` | `checkbox` |
| `datetime` | `date-picker` |
| `date` | `date-picker` |
| `richtext` | `rich-text-editor` |
| `array` | `tag-input` |
| `reference` | `reference-picker` |
| `media` | `media-picker` |
| `geo` | `geo-picker` |

## Admin Console Integration

The Admin Console automatically generates forms based on Elements:

1. User navigates to create/edit a node
2. Console fetches the NodeType schema
3. For each property, renders the specified Element
4. Applies validation rules from both schema and element
5. Submits validated data to RaisinDB

Example workflow:

```sql
-- 1. Define NodeType with elements
INSERT INTO raisin:system.node_types (name, properties) VALUES (
  'blog:Article',
  '{
    "title": {
      "type": "string",
      "required": true,
      "element": "text-input",
      "elementProps": {"maxLength": 200}
    },
    "body": {
      "type": "richtext",
      "element": "rich-text-editor"
    }
  }'
);

-- 2. User opens Admin Console
-- 3. Navigates to create Article
-- 4. Form auto-renders with TextInput and RichTextEditor
-- 5. User fills form, clicks Save
-- 6. Console validates and inserts node
```

## Custom Element Development

Build custom React components for elements:

```jsx
// CustomSlugInput.jsx
import React from 'react';

export default function CustomSlugInput({ value, onChange, elementProps }) {
  const handleChange = (e) => {
    // Auto-convert to slug format
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    onChange(slug);
  };

  return (
    <input
      type="text"
      value={value || ''}
      onChange={handleChange}
      placeholder={elementProps.placeholder}
      maxLength={elementProps.maxLength}
    />
  );
}
```

Register in RaisinDB:

```sql
INSERT INTO raisin:system.element_types (name, component, properties) VALUES (
  'slug-input',
  'CustomSlugInput',
  '{
    "placeholder": {"type": "string"},
    "maxLength": {"type": "number"}
  }'
);
```

Use in NodeType:

```sql
{
  "slug": {
    "type": "string",
    "element": "slug-input",
    "elementProps": {
      "placeholder": "article-slug",
      "maxLength": 100
    }
  }
}
```

## Element Inheritance

Elements can extend other elements:

```sql
-- Base text input
INSERT INTO raisin:system.element_types (name, component, properties) VALUES (
  'text-input',
  'TextInput',
  '{"placeholder": {"type": "string"}}'
);

-- Extended slug input
INSERT INTO raisin:system.element_types (name, extend, component, properties) VALUES (
  'slug-input',
  'text-input',
  'SlugInput',
  '{"autoGenerate": {"type": "boolean"}}'
);
```

`slug-input` inherits all properties from `text-input` and adds `autoGenerate`.

## Querying Elements

List available elements:

```sql
-- Get all element types
SELECT name, component, properties
FROM raisin:system.element_types
ORDER BY name;

-- Find elements for a specific component
SELECT name, properties
FROM raisin:system.element_types
WHERE component = 'RichTextEditor';
```

## Real-World Example

Complete blog article editing interface:

```sql
-- Define custom elements
INSERT INTO raisin:system.element_types (name, component, properties) VALUES
  ('slug-generator', 'SlugGenerator', '{"sourceField": {"type": "string"}}'),
  ('featured-image', 'FeaturedImagePicker', '{"aspectRatio": {"type": "string"}}');

-- Define NodeType with elements
INSERT INTO raisin:system.node_types (name, properties, elementGroups) VALUES (
  'blog:Article',
  '{
    "title": {
      "type": "string",
      "required": true,
      "element": "text-input",
      "elementProps": {"maxLength": 200, "placeholder": "Article title"}
    },
    "slug": {
      "type": "string",
      "required": true,
      "element": "slug-generator",
      "elementProps": {"sourceField": "title"}
    },
    "excerpt": {
      "type": "string",
      "element": "textarea",
      "elementProps": {"rows": 3, "maxLength": 500}
    },
    "body": {
      "type": "richtext",
      "required": true,
      "element": "rich-text-editor",
      "elementProps": {
        "toolbar": ["heading", "bold", "italic", "link", "image"],
        "imageUpload": true
      }
    },
    "featuredImage": {
      "type": "media",
      "element": "featured-image",
      "elementProps": {"aspectRatio": "16:9"}
    },
    "author": {
      "type": "reference",
      "required": true,
      "element": "reference-picker",
      "elementProps": {
        "nodeType": "user:Profile",
        "searchable": true
      }
    },
    "tags": {
      "type": "array",
      "element": "tag-input",
      "elementProps": {
        "allowCustom": true,
        "maxTags": 10
      }
    },
    "published": {
      "type": "boolean",
      "element": "checkbox",
      "elementProps": {"label": "Publish immediately"}
    },
    "publishedAt": {
      "type": "datetime",
      "element": "date-picker",
      "elementProps": {
        "includeTime": true,
        "condition": {"field": "published", "equals": true}
      }
    }
  }',
  '[
    {
      "name": "content",
      "label": "Content",
      "fields": ["title", "slug", "excerpt", "body", "featuredImage"]
    },
    {
      "name": "meta",
      "label": "Metadata",
      "fields": ["author", "tags", "published", "publishedAt"],
      "collapsible": true
    }
  ]'
);
```

This creates a professional content editing interface with:
- Auto-generating slug from title
- Rich text editor with media upload
- Featured image with aspect ratio enforcement
- Author reference picker
- Conditional publishing date
- Organized field groups

## Best Practices

1. **Use semantic elements**: Choose elements that match the data type
2. **Provide helpful props**: Set placeholder, labels, and help text
3. **Validate at both levels**: Schema validation + UI validation
4. **Group related fields**: Use elementGroups for better UX
5. **Consider mobile**: Choose elements that work on all devices
6. **Custom elements sparingly**: Only when built-ins don't fit
7. **Test thoroughly**: Ensure elements handle edge cases

## Next Steps

- **[NodeTypes](/docs/concepts/data-model/nodetypes)** - Define schemas that use elements
- **[Admin Console Guide](/docs/guides/admin-console/using-admin-console)** - Use the visual interface
- **[Archetypes](/docs/concepts/data-model/archetypes)** - Reusable fields with elements
- **[Data Modeling Guide](/docs/guides/data-modeling/creating-nodetypes)** - Build complete content models
