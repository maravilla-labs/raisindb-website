---
sidebar_position: 3
---

# Archetypes

An **Archetype** defines HOW data is presented. It bridges raw data and interaction patterns by specifying fields, layout structure, and which ElementTypes are allowed. While a NodeType defines *what* the data is, an archetype defines *how* that data is experienced.

## What is an Archetype?

An archetype is a UX structural template that extends a [NodeType](/docs/concepts/data-model/nodetypes). It specifies:

- **Fields** — Which properties are exposed and how they're configured
- **Layout** — The structural arrangement of content areas
- **Allowed ElementTypes** — Which UI building blocks can be used
- **Inheritance** — Archetypes can extend other archetypes
- **Strictness** — Whether only declared fields are permitted

```yaml
name: landing-page
extends: base-page
base_node_type: page
fields:
  - name: title
    type: string
    required: true
  - name: hero_image
    type: media
  - name: sections
    type: children
    allowed_element_types:
      - hero-section
      - feature-grid
      - text-block
      - cta-banner
layout:
  - type: stack
    direction: vertical
    children:
      - field: hero_image
      - field: sections
strict: true
```

## Archetype vs NodeType vs Mixin

These three concepts serve different purposes in the data model:

| Concept | Defines | Example |
|---------|---------|---------|
| **NodeType** | What this data IS — schema, validation, system behaviors (versionable, indexable) | `page`, `article`, `product` |
| **Archetype** | How this data is PRESENTED — fields, layout, allowed elements, UX pattern | `landing-page`, `kanban-board`, `article-view` |
| **Mixin** | Reusable property sets that can be mixed into NodeTypes (the `is_mixin` flag) | `Publishable`, `Taggable`, `SEO` |

A single NodeType like `page` can have multiple archetypes: one for landing pages, one for kanban boards, one for dashboards. The underlying data is the same — the archetype changes the presentation.

:::tip Archetypes vs Mixins
Archetypes define presentation patterns (how data is rendered). Mixins define shared property sets (reusable schema fragments). Don't confuse the two — they serve different purposes in the data model.
:::

## Archetype Structure

An archetype has the following fields:

```yaml
name: kanban-board
extends: null                  # Parent archetype (optional)
base_node_type: page           # The NodeType this archetype applies to
fields:                        # Field definitions (Vec<FieldSchema>)
  - name: title
    type: string
    required: true
  - name: columns
    type: children
    allowed_element_types:
      - kanban-column
  - name: card_template
    type: reference
layout:                        # Layout tree (Vec<LayoutNode>)
  - type: header
    children:
      - field: title
  - type: stack
    direction: horizontal
    children:
      - field: columns
strict: true                   # Only declared fields allowed
```

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier for the archetype |
| `extends` | string? | Parent archetype to inherit from |
| `base_node_type` | string | The NodeType this archetype is built on |
| `fields` | Vec\<FieldSchema\> | Field definitions with types and constraints |
| `layout` | Vec\<LayoutNode\> | Hierarchical layout structure for rendering |
| `strict` | bool | If true, only fields declared in the archetype are allowed |

## Inheritance

Archetypes support inheritance via the `extends` field. A child archetype inherits all fields and layout from its parent and can override or add to them.

```yaml
# Parent archetype
name: base-page
base_node_type: page
fields:
  - name: title
    type: string
    required: true
  - name: meta_description
    type: string
    max_length: 160
layout:
  - type: stack
    direction: vertical

---

# Child archetype — inherits title and meta_description
name: marketing-page
extends: base-page
fields:
  - name: hero
    type: children
    allowed_element_types:
      - hero-section
  - name: cta_text
    type: string
```

**Field merging rules:**
- Child fields are merged with parent fields
- If a child declares a field with the same name as the parent, the child's definition wins
- Inheritance chains can go up to **20 levels deep**

## Examples

### Landing Page Archetype

```yaml
name: landing-page
extends: base-page
base_node_type: page
fields:
  - name: title
    type: string
    required: true
  - name: subtitle
    type: string
  - name: hero_image
    type: media
  - name: sections
    type: children
    allowed_element_types:
      - hero-section
      - feature-grid
      - text-block
      - testimonial-carousel
      - cta-banner
layout:
  - type: stack
    direction: vertical
    children:
      - field: hero_image
      - field: title
      - field: subtitle
      - field: sections
strict: true
```

### Kanban Board Archetype

```yaml
name: kanban-board
extends: base-page
base_node_type: page
fields:
  - name: title
    type: string
    required: true
  - name: columns
    type: children
    allowed_element_types:
      - kanban-column
  - name: default_card_type
    type: string
layout:
  - type: header
    children:
      - field: title
  - type: stack
    direction: horizontal
    scroll: true
    children:
      - field: columns
strict: true
```

### Article View Archetype

```yaml
name: article-view
extends: base-page
base_node_type: article
fields:
  - name: title
    type: string
    required: true
  - name: author
    type: reference
  - name: published_at
    type: datetime
  - name: body
    type: richtext
  - name: sidebar_elements
    type: children
    allowed_element_types:
      - author-card
      - related-articles
      - table-of-contents
layout:
  - type: grid
    columns: [3, 1]
    children:
      - type: stack
        children:
          - field: title
          - field: author
          - field: body
      - type: stack
        children:
          - field: sidebar_elements
strict: false
```

## Switching Archetypes

This is the power move of [DCAD](/docs/concepts/dcad): the same node can use different archetypes to produce entirely different user experiences — without changing the underlying data.

A `page` node at `/content/home` with a `landing-page` archetype renders as a marketing page with hero sections and CTAs. Switch it to `kanban-board`, and the same node renders as a project board with columns and cards.

The data doesn't change. The archetype changes. The UI follows.

This enables:
- **A/B testing** — swap archetypes to test different layouts
- **Role-based views** — editors see a form view, visitors see a published view
- **Progressive redesigns** — change the presentation without migrating data

## Relationship to DCAD

Archetypes are the core mechanism that makes [Data-Centric Application Design](/docs/concepts/dcad) possible. They are the bridge between the data layer (Nodes, NodeTypes) and the presentation layer (ElementTypes, UI components). By separating *what data is* from *how it's presented*, archetypes enable the schema-driven, AI-native application architecture that DCAD describes.

## Next Steps

- **[DCAD](/docs/concepts/dcad)** — Understand the paradigm archetypes enable
- **[NodeTypes](/docs/concepts/data-model/nodetypes)** — The base classifications archetypes extend
- **[Elements](/docs/concepts/data-model/elements)** — The UI building blocks archetypes contain
- **[Nodes](/docs/concepts/data-model/nodes)** — The data instances that use archetypes
