---
sidebar_position: 3
---

# Using Mixins

A mixin is a reusable set of properties that any NodeType can include. Define a
cross-cutting concern once (SEO fields, review metadata, tags) and list it on
every type that needs it.

## What is a mixin?

A mixin is stored as a NodeType with `is_mixin: true`. It carries properties
and can itself list other mixins, but nodes are not created from it directly.
When a NodeType names a mixin, the mixin's properties become part of that
type's resolved schema.

| Mechanism | Relationship | How many |
|-----------|--------------|----------|
| `extends` | "is a kind of" | one parent |
| mixins | "also has" | any number |

## Creating a mixin

### Via SQL

```sql
CREATE MIXIN 'myapp:Seo'
  DESCRIPTION 'Search engine metadata'
  PROPERTIES (
    meta_title String,
    meta_description String
  );

CREATE MIXIN 'myapp:Reviewed' (reviewed_by String REQUIRED);
```

```json
{"columns":["result","success"],"rows":[{"result":"Mixin 'myapp:Seo' created","success":true}],"row_count":1,"execution_time_ms":1}
```

The property syntax is the same as for
[`CREATE NODETYPE`](./creating-nodetypes.md#via-sql). A mixin accepts
`DESCRIPTION` and `ICON`; it has no `EXTENDS`, allowed children or behaviour
flags of its own.

### Via HTTP

`POST /api/management/{repo}/{branch}/mixins` uses the same `node_type`
envelope as the NodeTypes API. The server sets `is_mixin: true` whatever the
body says.

```bash
curl -s -X POST http://localhost:8090/api/management/myrepo/main/mixins \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"node_type":{"name":"myapp:Seo","description":"Search engine metadata","properties":[{"name":"meta_title","type":"String"},{"name":"meta_description","type":"String"}]}}'
```

```json
{"id":"6_ngsuKSafegTair","strict":null,"name":"myapp:Seo","extends":null,"overrides":null,"description":"Search engine metadata","icon":null,"version":1,"properties":[{"name":"meta_title","type":"String"},{"name":"meta_description","type":"String"}],"initial_structure":null,"versionable":null,"publishable":null,"auditable":null,"indexable":null,"created_at":"2026-09-06T18:38:23.112517Z","updated_at":"2026-09-06T18:38:23.112607Z","published_at":null,"published_by":null,"previous_version":null,"is_mixin":true}
```

`GET .../mixins` lists them, `GET|PUT|DELETE .../mixins/{name}` reads, replaces
or removes one, and `POST .../mixins/{name}/publish` and `/unpublish` work as
for NodeTypes.

### Via the admin console

Open **Models → Mixins → New**. The editor is the NodeType property builder
without the inheritance settings.

### Via a package

Mixin YAML files live in the package's `mixins/` directory and are listed under
`provides.mixins`. They are installed before `nodetypes/`, so a NodeType in the
same package can reference them.

```yaml
# mixins/seo.yaml
name: myapp:Seo
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
    - myapp:Seo
  nodetypes:
    - myapp:Article
```

## Composing mixins into a NodeType

List them in the `MIXINS (...)` clause:

```sql
CREATE NODETYPE 'myapp:Post'
  MIXINS ('myapp:Seo', 'myapp:Reviewed')
  PROPERTIES (
    title String REQUIRED FULLTEXT,
    body String
  );
```

Or in YAML / JSON:

```yaml
name: myapp:Post
mixins:
  - myapp:Seo
  - myapp:Reviewed
properties:
  - name: title
    type: String
    required: true
```

Add or remove a mixin on an existing type with
`ALTER NODETYPE 'myapp:Post' ADD MIXIN 'myapp:Tagged'` and
`DROP MIXIN 'myapp:Tagged'`.

The resolved schema shows the merged result:

```bash
curl -s http://localhost:8090/api/management/myrepo/main/nodetypes/myapp:Post/resolved \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"resolved_properties":["body","meta_description","meta_title","reviewed_by","title"],"resolved_mixins":["myapp:Seo","myapp:Reviewed"],"inheritance_chain":["myapp:Post"]}
```

(Only the property names are shown here; each entry is a full property schema.)

## How resolution works

Properties are merged in this order, later entries replacing earlier ones with
the same name:

1. the `extends` parent, fully resolved,
2. each mixin in the order listed (including mixins those mixins declare),
3. the NodeType's own properties,
4. `overrides`, which set the `default` of an already-resolved property.

A `required` property coming from a mixin is enforced exactly like one declared
on the type. Values are not filled in automatically:

```json
{"code":"VALIDATION_FAILED","message":"Failed to execute SQL query: Validation failed: Missing required property 'reviewed_by' for NodeType 'myapp:Post'"}
```

## Checking mixins at runtime

When a node is written through the node API (HTTP, WebSocket, the JS client or
a function), the server stamps two reserved properties on it: `$mixins`, the
effective mixin names, and `$supertypes`, the node's type plus every `extends`
ancestor and mixin. Both are computed by the server and cannot be set by a
client.

```json
{"title":"Two","reviewed_by":"bob","$mixins":["myapp:Seo","myapp:Reviewed"],"$supertypes":["myapp:Post","myapp:Seo","myapp:Reviewed"]}
```

### In SQL

```sql
-- Nodes carrying the Seo mixin
SELECT name FROM 'content' WHERE HAS_MIXIN(properties, 'myapp:Seo');

-- Nodes that "are a" type: by node_type, an extends ancestor, or a mixin
SELECT name FROM 'content' WHERE IS_A(properties, 'myapp:Reviewed');
```

Both take the `properties` column and a name, and return a boolean. Function
names are case-insensitive.

:::note
Nodes written with SQL `INSERT` or `UPDATE` are validated against the resolved
schema but do not receive the `$mixins` and `$supertypes` stamps, so
`HAS_MIXIN` and `IS_A` do not match them. Write through the node API when you
rely on these checks.
:::

### In functions

Nodes returned by `raisin.nodes.get` and the other node reads carry two
helpers that read the same stamps:

```js
const node = raisin.nodes.get('content', '/posts/two');
if (node.hasMixin('myapp:Seo')) {
  // populate meta tags
}
if (node.isNodeType('myapp:Reviewed')) {
  // reviewed content
}
```

## Altering and dropping mixins

```sql
ALTER MIXIN 'myapp:Seo' ADD PROPERTY og_image URL;
ALTER MIXIN 'myapp:Seo' DROP PROPERTY meta_description;
ALTER MIXIN 'myapp:Seo' SET DESCRIPTION = 'SEO fields';

DROP MIXIN 'myapp:Seo';
```

`ALTER MIXIN` also accepts `MODIFY PROPERTY` and `SET ICON = '...'`;
`DROP MIXIN` accepts `CASCADE`. A change to a mixin is visible in the resolved
schema of every type that includes it on the next resolution. Existing nodes
keep the `$mixins` stamp they were written with until they are written again.

## Guidelines

- Name a mixin for the concern, not the consumer: `myapp:Seo`,
  `myapp:Reviewed`, `myapp:Tagged`.
- Keep each mixin to one concern; small mixins compose better.
- When two mixins declare the same property, the one listed later wins. Keep
  the order deliberate.

## Next steps

- [Creating NodeTypes](./creating-nodetypes.md)
- [Data Modeling Strategy](./data-modeling-strategy.md) for inheritance versus mixins
