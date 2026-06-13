---
sidebar_position: 6
---

# Translations & Localization

RaisinDB stores translations as a **per-locale overlay** on top of a base node.
The base node holds the source-language content; each locale contributes an
overlay containing only the translated fields. On read, you ask for a locale and
the server merges the overlay over the base — anything not translated falls back
to the base value.

This keeps content DRY (no duplicated nodes per language), preserves
non-translatable fields automatically, and lets translations be added or updated
independently of the source content.

## Marking fields translatable

Add `translatable: true` to any field that should be localized:

```yaml
# elementtypes/article.yaml
fields:
  - $type: TextField
    name: title
    translatable: true
  - $type: RichTextField
    name: body
    translatable: true
  - $type: TextField
    name: slug          # NOT translatable — same across locales
```

Only fields marked `translatable: true` may appear in a translation overlay; the
validator rejects attempts to translate anything else.

## Writing translations

There are two equivalent ways to write a translation. Both produce the same
overlay and resolve identically.

### REST: `raisin:cmd/translate`

Send a JSON-Pointer → value map for a locale:

```http
POST /<tenant>/<repo>/<branch>/main/content/homepage/raisin:cmd/translate
Content-Type: application/json

{
  "locale": "fr",
  "translations": {
    "/title": "Bonjour le monde",
    "/body": "Bienvenue sur notre site"
  }
}
```

Read it back with a locale parameter:

```http
GET /<tenant>/<repo>/<branch>/main/content/homepage?lang=fr
```

### SQL: `UPDATE … FOR LOCALE`

```sql
UPDATE Page FOR LOCALE 'fr'
    SET title = 'Bonjour le monde',
        body  = 'Bienvenue sur notre site'
    WHERE path = '/content/homepage';
```

:::note
The token after `UPDATE` (`Page` here) is the **workspace name** — the same
table identifier you use in `SELECT … FROM Page` — **not** a node type. RaisinDB
SQL tables are workspaces. To narrow by node type, add `AND node_type = '...'` to
the `WHERE` clause.
:::

See the [SQL TRANSLATE reference](/docs/reference/sql/statements/graph-dml#translate)
for the full grammar (including `IN BRANCH`).

## Repeatable content needs UUIDs

When a `CompositeField` is `multiple: true` **and** has a translatable
sub-field, each item **must** have a unique `uuid`. The overlay addresses each
item by its `uuid` so it can merge only the translated fields and preserve the
rest of the item — without UUIDs the entire array would be replaced, losing
non-translatable fields. The validator reports `COMPOSITE_MISSING_UUID`
otherwise.

```yaml
# Element type
fields:
  - $type: CompositeField
    name: features
    multiple: true
    fields:
      - { $type: TextField, name: title, translatable: true }
      - { $type: TextField, name: icon }   # not translatable
```

```yaml
# Base content (.node.yaml) — uuids on every item
features:
  - uuid: feat-fast
    icon: zap
    title: Fast Development
  - uuid: feat-scale
    icon: trending-up
    title: Scalable
```

```yaml
# French overlay (.node.fr.yaml) — uuids + translated fields only
features:
  - uuid: feat-fast
    title: Developpement rapide
  - uuid: feat-scale
    title: Evolutif
```

## Nested composites

The UUID rule applies at **every** repeatable level — a composite inside another
composite, or a composite inside a multivalue Element field. Translations are
addressed by a flat JSON pointer that alternates *field → uuid* at each array
level:

```
/sections/<section-uuid>/features/<feature-uuid>/title
```

The resolver walks this pointer to any depth, matching each `uuid` segment
against the items of the array at that level. **Every** item along the path needs
a `uuid`; if an intermediate item is missing one, the nested field cannot be
addressed and stays untranslatable.

The requirement is recursive but still conditional: a repeatable composite needs
item uuids when it has a translatable field anywhere in its sub-tree — directly
**or** inside a nested composite. Composites you never translate stay uuid-free.

```sql
-- Translate a field two array levels deep, by uuid at each level
UPDATE Page FOR LOCALE 'de'
    SET sections[uuid='s1'].features[uuid='f1'].title = 'Schnelle Entwicklung'
    WHERE path = '/home';
```

The REST command writes the same target as the pointer
`/sections/s1/features/f1/title`.

## Staleness

When source-language content changes after a translation was written, the
translation may be out of date. RaisinDB tracks a content hash per translated
pointer so the admin console can flag fields as **fresh**, **stale** (the source
changed since translation), or **missing** (never translated). Re-writing the
translation for that field clears the stale flag.
