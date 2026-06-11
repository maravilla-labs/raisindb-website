---
sidebar_position: 3
---

# Using Mixins

Mixins are reusable property sets that you compose into NodeTypes — trait-like
composition for your schema. Define a cross-cutting concern (SEO fields,
timestamps, taggability) once as a mixin and include it in any NodeType.

## What is a Mixin?

A mixin is a NodeType flagged with `is_mixin: true`. It carries properties but is
not meant to be instantiated on its own. When a NodeType lists a mixin, the mixin's
properties are merged into that NodeType's effective schema.

Use a mixin when several unrelated NodeTypes need the *same* set of properties and
single-parent `EXTENDS` inheritance doesn't fit:

| Mechanism | Relationship | Cardinality |
|-----------|--------------|-------------|
| `EXTENDS` | "is a kind of" (single parent) | One parent |
| Mixins    | "also has" (composition)       | Many per NodeType |
| Archetypes | Reusable base templates       | One archetype |

## Creating a Mixin

### Via SQL

```sql
CREATE MIXIN 'myapp:SEO'
  DESCRIPTION 'Search engine metadata'
  PROPERTIES (
    meta_title String,
    meta_description String,
    canonical_url String
  );

CREATE MIXIN 'myapp:Timestamps'
  PROPERTIES (
    created_at Date REQUIRED,
    updated_at Date REQUIRED
  );
```

### Via the Admin Console

Open **Models → Mixins → New Mixin**. The mixin editor is the same visual /
YAML property builder used for NodeTypes, minus the inheritance settings
(mixins have no `extends`, mixins, or allowed children of their own).

### Via a YAML Package

Mixins live in a package's `mixins/` directory and are declared under
`provides.mixins`. They install *before* NodeTypes, so any NodeType can reference
them.

```yaml
# mixins/myapp:SEO.yaml
name: 'myapp:SEO'
is_mixin: true
description: Search engine metadata
properties:
  - name: meta_title
    type: String
  - name: meta_description
    type: String
```

```yaml
# manifest.yaml
provides:
  mixins:
    - 'myapp:SEO'
    - 'myapp:Timestamps'
  nodetypes:
    - 'myapp:Article'
```

## Composing Mixins into a NodeType

List mixins with the `MIXINS (...)` clause:

```sql
CREATE NODETYPE 'myapp:Article'
  MIXINS ('myapp:SEO', 'myapp:Timestamps')
  PROPERTIES (
    title String REQUIRED,
    body String
  );
```

`myapp:Article` now has `title`, `body`, and every property from `myapp:SEO` and
`myapp:Timestamps`.

In a YAML NodeType:

```yaml
name: 'myapp:Article'
mixins:
  - 'myapp:SEO'
  - 'myapp:Timestamps'
properties:
  - name: title
    type: String
    required: true
```

## How Resolution Works

When a NodeType is resolved, properties are merged in this order:

1. The `EXTENDS` parent (and its ancestors)
2. Each mixin, **in the order listed** — later mixins win on conflicts
3. The NodeType's own properties
4. Any property `overrides`

So a property defined on the NodeType always wins over one from a mixin, and a
later mixin wins over an earlier one.

**Validation:** When you create or update a node, it is validated against this
fully resolved schema. A required property from a mixin (e.g. `created_at`) is
enforced just as if it were declared directly on the NodeType. Note that mixin
properties are *recognized and validated* — values are not auto-populated, so
required ones must still be supplied.

You can inspect the resolved schema, including merged mixins, via the API:

```bash
curl http://localhost:8080/api/management/myapp/main/nodetypes/myapp:Article/resolved
```

The response includes `resolved_properties` (the full merged property list) and
`resolved_mixins` (the effective mixin names, transitively).

## Checking Mixins at Runtime

Every node is stamped on write with its effective mixin set, so membership checks
are fast (no schema resolution at query time).

### In SQL

```sql
-- Nodes carrying the SEO mixin
SELECT * FROM 'workspace' WHERE has_mixin(properties, 'myapp:SEO');

-- Nodes that "are a" given type — by node_type, an EXTENDS ancestor, or a mixin
SELECT * FROM 'workspace' WHERE is_a(properties, 'myapp:Article');
```

- `has_mixin(properties, name)` — true if the node carries `name` as a mixin.
- `is_a(properties, name)` — true if the node's `node_type`, any `EXTENDS`
  ancestor, or any mixin equals `name`.

### In Server-Side Functions

```js
export default function (node) {
  if (node.hasMixin('myapp:SEO')) {
    // ... populate meta tags
  }
  if (node.isNodeType('myapp:Article')) {
    // ... article-specific logic
  }
}
```

## Altering and Dropping Mixins

```sql
-- Add or remove a property on a mixin
ALTER MIXIN 'myapp:SEO' ADD PROPERTY og_image String;
ALTER MIXIN 'myapp:SEO' DROP PROPERTY canonical_url;

-- Remove a mixin entirely
DROP MIXIN 'myapp:SEO';
```

:::note
Changing a mixin's properties updates the effective schema of every NodeType that
uses it. Existing nodes carry a materialized copy of their effective mixin set;
that copy is refreshed the next time each node is written.
:::

## Best Practices

- **Name mixins for the concern**, not the consumer: `myapp:SEO`,
  `myapp:Timestamps`, `myapp:Taggable`.
- **Keep mixins focused** — one cross-cutting concern per mixin composes best.
- **Prefer mixins over deep `EXTENDS` chains** when the relationship is "also has"
  rather than "is a kind of".
- **Order matters**: when two mixins define the same property, the later one in the
  `MIXINS (...)` list wins.

## Next Steps

- [Creating NodeTypes](./creating-nodetypes.md) — the types that compose mixins
- [Data Modeling Strategy](./data-modeling-strategy.md) — inheritance vs. mixins vs. archetypes
- [SQL DDL Reference](../../reference/sql/statements/ddl.md) — full `CREATE/ALTER/DROP MIXIN` syntax
