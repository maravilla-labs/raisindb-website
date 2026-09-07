---
sidebar_position: 6
---

# Translations & Localization

RaisinDB stores translations as a per-locale overlay on top of a base node.
The base node holds the source-language content; each locale contributes an
overlay containing only the translated fields. When you read with a locale, the
server merges the overlay over the base, and anything not translated falls back
to the base value.

There is one node per piece of content, not one per language, so non-translated
fields stay in sync automatically and translations can be added or changed
independently of the source.

## Repository language settings

Each repository has a default language, a list of supported languages, and
optional fallback chains. Read and change them through the translation config
endpoint:

```bash
curl -s http://localhost:8090/api/repositories/myrepo/translation-config \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"default_language":"en","supported_languages":["en"],"locale_fallback_chains":{}}
```

```bash
curl -s -X PATCH http://localhost:8090/api/repositories/myrepo/translation-config \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"supported_languages":["en","fr","fr-CA","de"],"locale_fallback_chains":{"fr-CA":["fr","en"]}}'
```

The default language cannot be changed and is always kept in
`supported_languages`. Every locale named in a fallback chain must already be
in `supported_languages`, so add the languages first if you send the two
settings in separate requests.

A locale with a region always falls back to its language on its own
(`fr-CA` to `fr`) even without a configured chain. Configured chains extend
that with any further steps you want.

## Marking fields translatable

Set `is_translatable: true` on a NodeType property, or use the `TRANSLATABLE`
modifier in SQL:

```sql
CREATE NODETYPE 'site:Page' (
  title String REQUIRED TRANSLATABLE,
  body String TRANSLATABLE,
  slug String
);
```

On element type fields the flag is `translatable: true`:

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
    name: slug
```

The flag drives the staleness report (below) and editor tooling, and it decides
which repeatable items need a `uuid`. The translate command itself accepts any
pointer, so keep translation writes to the fields you have marked.

## Writing translations

### REST: `raisin:cmd/translate`

Post a map of JSON pointers to values for one locale on the node's path:

```bash
curl -s -X POST "http://localhost:8090/api/repository/myrepo/main/head/site/home/raisin:cmd/translate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"locale":"fr","translations":{"/title":"Bienvenue"},"message":"French title"}'
```

```json
{"node_id":"suQMLzS9o8nMVn3AQ53_F","locale":"fr","revision":"1788720173765-0","timestamp":"2026-09-06T18:42:53.765757+00:00"}
```

Pointers address the node's properties: `/title` is the `title` property. The
optional `message` and `actor` are recorded with the revision.

Read the node back with the `lang` query parameter. Fields without a
translation keep their base value:

```bash
curl -s "http://localhost:8090/api/repository/myrepo/main/head/site/home?lang=fr" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"properties":{"title":"Bienvenue","body":"Hello there","slug":"home","$mixins":[],"$supertypes":["site:Page"]}}
```

Without `lang` the base content is returned. `lang` also works on folder
listings under the same route.

### SQL: `UPDATE ... FOR LOCALE`

```sql
UPDATE site FOR LOCALE 'fr'
    SET title = 'Bienvenue',
        body  = 'Bienvenue sur notre site'
    WHERE path = '/home';
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,"execution_time_ms":2}
```

The token after `UPDATE` is the workspace name, written as a bare identifier
(no quotes). The `WHERE` clause accepts `path = '...'` or `id = '...'`,
optionally combined with `AND node_type = '...'`. Add `IN BRANCH 'name'` after
the locale to target another branch. Both forms write the same overlay.

### Removing and hiding

- `POST .../raisin:cmd/delete-translation` with `{"locale":"fr"}` removes the
  whole overlay for that locale (204).
- `POST .../raisin:cmd/hide-in-locale` with `{"locale":"de"}` hides the node
  in that locale: a read with `?lang=de` returns 404 and the node is left out
  of listings for that locale. `unhide-in-locale` reverses it.

## Repeatable content needs UUIDs

When a `CompositeField` is `multiple: true` and has a translatable sub-field,
each item must carry a `uuid`. The overlay addresses items by `uuid` so it can
merge only the translated fields and keep the rest of the item. Writing a node
whose items lack one fails validation with `COMPOSITE_MISSING_UUID`.

```yaml
# Element type
fields:
  - $type: CompositeField
    name: features
    multiple: true
    fields:
      - { $type: TextField, name: title, translatable: true }
      - { $type: TextField, name: icon }
```

```yaml
# Base content: a uuid on every item
features:
  - uuid: feat-fast
    icon: zap
    title: Fast Development
  - uuid: feat-scale
    icon: trending-up
    title: Scalable
```

The translation for one item names it by uuid:

```sql
UPDATE site FOR LOCALE 'fr'
    SET features[uuid='feat-fast'].title = 'Developpement rapide'
    WHERE path = '/home';
```

The REST equivalent is the pointer `/features/feat-fast/title`.

### Nested composites

The rule applies at every repeatable level. A pointer alternates field and
uuid at each array level, and the resolver walks it to any depth:

```
/sections/<section-uuid>/features/<feature-uuid>/title
```

```sql
UPDATE site FOR LOCALE 'de'
    SET sections[uuid='s1'].features[uuid='f1'].title = 'Schnelle Entwicklung'
    WHERE path = '/home';
```

A repeatable composite needs item uuids when it has a translatable field
anywhere in its subtree. Composites you never translate can stay without them.

## Staleness

The server keeps a hash of the source value for every translated pointer. When
the source changes after a translation was written, that pointer is reported
as stale:

```bash
curl -s -X POST "http://localhost:8090/api/repository/myrepo/main/head/site/home/raisin:cmd/translation-staleness" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"locale":"fr"}'
```

```json
{"stale":["/title"],"missing":[{"pointer":"/body","current_original_hash":"cb5e5c03..."}],"fresh":[],"unknown":[]}
```

`fresh` pointers are translated and current, `stale` ones were translated
before the source changed, and `missing` ones are translatable fields with no
translation in this locale. Re-translating a field clears the stale flag, or
accept the source change without retranslating:

```bash
curl -s -X POST ".../home/raisin:cmd/acknowledge-staleness" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"locale":"fr","pointer":"/title"}'
```

```json
{"acknowledged":true,"pointer":"/title","locale":"fr"}
```
