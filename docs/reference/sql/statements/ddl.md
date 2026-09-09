---
sidebar_position: 5
---

# DDL Statements

DDL statements create, alter and drop the schema objects that shape node data: node types, mixins, archetypes and element types. They are the SQL equivalent of a package's `nodetypes/*.yaml`, `archetypes/*.yaml` and `elementtypes/*.yaml` files.

A DDL statement returns one row with `result` and `success`:

```sql
CREATE NODETYPE 'docs:Article' EXTENDS 'raisin:Page' PROPERTIES (summary String);
```

```json
{"columns":["result","success"],"rows":[{"result":"NodeType 'docs:Article' created","success":true}],"row_count":1,"execution_time_ms":0}
```

Object names are `namespace:Name` and are written as string literals. The quotes are optional when the name has no characters other than letters, digits, `_` and `:` (`CREATE NODETYPE docs:Article ...` also parses). Keywords are case-insensitive. The parser reports where a statement went wrong (`DDL parse error at position 30: Unexpected trailing content: ...`), and an unknown property type is named in the error together with the accepted list.

Other statement families that create objects have their own pages: branches ([Branch statements](./branch.md)), roles, groups and users (`CREATE / ALTER / DROP ROLE | GROUP | USER`, `ALTER SECURITY CONFIG`), AI and embedding configuration (`ALTER AI CONFIG`, `ALTER EMBEDDING CONFIG`, [Vector functions](../functions/vector-functions.md)) and spatial indexes (`ALTER SPATIAL INDEX`, [Geospatial functions](../functions/geospatial-functions.md)). There is no `CREATE WORKSPACE`; workspaces come from packages or the workspace API ([Schema tables](../schema-tables.md#workspaces)).

## CREATE NODETYPE

```sql
CREATE NODETYPE 'ns:Name'
  [ EXTENDS 'ns:Parent' ]
  [ MIXINS ('ns:MixinA', 'ns:MixinB') ]
  [ DESCRIPTION 'text' ]
  [ ICON 'icon-name' ]
  [ PROPERTIES ( property_def [, ...] ) ]
  [ ALLOWED_CHILDREN ('ns:TypeA', 'ns:TypeB') ]
  [ REQUIRED_NODES ('ns:TypeA') ]
  [ COMPOUND_INDEX 'name' ON (column [ASC|DESC] [, ...]) ] [ ... ]
  [ VERSIONABLE ] [ IMMUTABLE ] [ PUBLISHABLE ] [ AUDITABLE ] [ INDEXABLE ] [ STRICT ]
```

Clauses can appear in any order. The whole clause list may be wrapped in parentheses, and a bare property list directly after the name is accepted as shorthand for `PROPERTIES (...)`:

```sql
CREATE NODETYPE 'docs:Note' (title String REQUIRED, body String FULLTEXT);
```

A fuller example, with the registry row it produces:

```sql
CREATE NODETYPE 'docs:Article'
  EXTENDS 'raisin:Page'
  DESCRIPTION 'Blog article'
  ICON 'article'
  PROPERTIES (
    summary String FULLTEXT LABEL 'Summary',
    slug String UNIQUE,
    status String DEFAULT 'draft',
    views Number DEFAULT 0,
    tags Array OF String,
    seo Object { meta_title String, meta_description String TRANSLATABLE }
  )
  ALLOWED_CHILDREN ('raisin:Asset')
  VERSIONABLE PUBLISHABLE;

SELECT name, extends, properties, allowed_children, versionable FROM NodeTypes WHERE name LIKE 'docs:%';
```

```json
{"name":"docs:Article","extends":"raisin:Page",
 "properties":[
   {"name":"summary","type":"String","index":["Fulltext"],"meta":{"label":"Summary"}},
   {"name":"slug","type":"String","unique":true},
   {"name":"status","type":"String","default":"draft"},
   {"name":"views","type":"Number","default":0.0},
   {"name":"tags","type":"Array","items":{"type":"String"}},
   {"name":"seo","type":"Object","structure":{"meta_title":{"name":"meta_title","type":"String"},"meta_description":{"name":"meta_description","type":"String","is_translatable":true}}}],
 "allowed_children":["raisin:Asset"],"versionable":true}
```

`EXTENDS` inherits the parent's properties and constraints; `raisin:Page` requires a `title`, so `docs:Article` does too. `ALLOWED_CHILDREN` limits which node types may be created under a node of this type (an empty list means no constraint). `REQUIRED_NODES` names child types that must exist. The flags switch on version history, immutability, publishing, audit logging, full-text indexing and strict property validation for the type. See [Behaviour flags](/docs/concepts/data-model/nodetypes#behaviour-flags) for what each one does.

`IMMUTABLE` rejects any later write that changes a node's `properties`; structural changes (path, parent, `node_type`) and delete stay allowed:

```sql
CREATE NODETYPE 'audit:LedgerEntry'
  PROPERTIES (amount Number REQUIRED, memo String)
  IMMUTABLE;
```

### Property types and modifiers

```
property_def := name type [ modifier ... ]
type         := String | Number | Boolean | Date | URL | Reference | Resource
              | Composite | Element | NodeType
              | Array OF type
              | Object { property_def [, ...] }
```

| Type | Stored as |
|------|-----------|
| `String` | JSON string |
| `Number` | JSON number (integer or float) |
| `Boolean` | JSON boolean |
| `Date` | ISO 8601 timestamp string |
| `URL` | `{"raisin:url": "..."}` with optional metadata |
| `Reference` | `{"raisin:ref": id, "raisin:workspace": ws, "raisin:path": path}`; see [Path functions](../functions/path-functions.md#references) |
| `Resource` | A binary asset reference |
| `Composite`, `Element` | Block content built from element types |
| `NodeType` | The name of a node type |
| `Array OF type` | JSON array of the item type (`Array OF String`, `Array OF Object { ... }`) |
| `Object { ... }` | Nested object with its own typed fields; nests to any depth |

Modifiers, in any order after the type:

| Modifier | Effect |
|----------|--------|
| `REQUIRED` | Writes without the property are rejected (`Missing required property 'title' for NodeType ...`). |
| `UNIQUE` | Value must be unique within the workspace. |
| `DEFAULT value` | Applied when the property is absent. `value` is a quoted string, a number, `true` / `false` or `NULL`. |
| `FULLTEXT` | Index the field for `FULLTEXT_MATCH`. |
| `VECTOR` | Embed the field for vector search. |
| `PROPERTY_INDEX` | Maintain a property index for equality lookups. |
| `TRANSLATABLE` | The field takes per-locale values. |
| `LABEL 'text'`, `DESCRIPTION 'text'`, `ORDER n` | Editor metadata, stored under `meta`. |
| `ALLOW_ADDITIONAL_PROPERTIES` | On an `Object`, permit keys beyond the declared fields. |

The DDL type names are the property schema, not SQL expression types: a `Number` property is read in SQL as `(properties->>'views')::INT` or `::DOUBLE`. See [Data Types](../data-types.md).

### Compound indexes

A compound index serves queries that filter on several properties and sort on a trailing one. Declare it in `CREATE NODETYPE` or add it later:

```sql
ALTER NODETYPE 'docs:Article' ADD COMPOUND_INDEX 'by_status_created' ON (status, __created_at DESC);
ALTER NODETYPE 'docs:Article' DROP COMPOUND_INDEX 'by_status_created';
```

Index columns are property names of the type plus the system columns `__node_type`, `__created_at` and `__updated_at`; each may carry `ASC` (default) or `DESC`. Adding an index to a type that already has nodes schedules a background job that builds it. The planner uses the index for equality on a leading prefix of the columns with an optional `ORDER BY` on the next one. In SQL the timestamp columns are spelled `created_at` / `updated_at`; the `__created_at` spelling belongs to the index declaration only. `EXPLAIN` shows which scan a query gets.

## ALTER NODETYPE

```sql
ALTER NODETYPE 'ns:Name' alteration [ alteration ... ]
```

| Alteration | Example |
|------------|---------|
| `ADD PROPERTY def` | `ADD PROPERTY subtitle String FULLTEXT` |
| `DROP PROPERTY name` | `DROP PROPERTY legacy_field` |
| `MODIFY PROPERTY def` | `MODIFY PROPERTY status String DEFAULT 'review'` |
| `SET DESCRIPTION = 'text'`, `SET ICON = 'name'` | `SET DESCRIPTION = 'Updated'` |
| `SET EXTENDS = 'ns:Parent'` / `SET EXTENDS = NULL` | |
| `SET ALLOWED_CHILDREN = ('a', 'b')`, `SET REQUIRED_NODES = (...)` | |
| `ADD MIXIN 'ns:Mixin'`, `DROP MIXIN 'ns:Mixin'` | |
| `SET VERSIONABLE = true`, and likewise `IMMUTABLE`, `PUBLISHABLE`, `AUDITABLE`, `INDEXABLE`, `STRICT` | |
| `ADD COMPOUND_INDEX ...`, `DROP COMPOUND_INDEX 'name'` | see above |

Several alterations may follow each other in one statement:

```sql
ALTER NODETYPE 'docs:Article'
  ADD PROPERTY subtitle String FULLTEXT
  DROP PROPERTY legacy_field
  SET DESCRIPTION = 'Updated description';
```

```json
{"result":"NodeType 'docs:Article' altered","success":true}
```

The `SET` forms take `=`; `SET DESCRIPTION 'Updated'` without it is a parse error.

## DROP NODETYPE

```sql
DROP NODETYPE 'ns:Name' [ CASCADE ]
```

`IF EXISTS` is not part of the grammar. Dropping a name that does not exist still answers `NodeType 'x' dropped` with `success: true`, so check `NodeTypes` if you need to know whether the type was there.

## CREATE MIXIN

A mixin is a reusable property set composed into node types. See [Using Mixins](../../../guides/data-modeling/using-mixins.md).

```sql
CREATE MIXIN 'ns:Name'
  [ DESCRIPTION 'text' ] [ ICON 'icon-name' ]
  PROPERTIES ( property_def [, ...] );

ALTER MIXIN 'ns:Name' ADD PROPERTY def | DROP PROPERTY name | MODIFY PROPERTY def
                     | SET DESCRIPTION = 'text' | SET ICON = 'name';

DROP MIXIN 'ns:Name' [ CASCADE ];
```

```sql
CREATE MIXIN 'docs:SEO' DESCRIPTION 'Search metadata' PROPERTIES (meta_title String, canonical_url URL);
ALTER NODETYPE 'docs:Article' ADD MIXIN 'docs:SEO';
SELECT name, mixins FROM NodeTypes WHERE name LIKE 'docs:%';
```

```json
{"name":"docs:Article","mixins":["docs:SEO"]}
{"name":"docs:SEO","mixins":null}
```

Mixins are registered alongside node types, so they appear in `NodeTypes`. They are applied in order after the `EXTENDS` parent and before the type's own properties; a later mixin wins on a property conflict. `CREATE NODETYPE ... MIXINS ('docs:SEO')` attaches a mixin at creation time.

## CREATE ARCHETYPE

An archetype is a page template bound to a base node type.

```sql
CREATE ARCHETYPE 'ns:Name'
  [ BASE_NODE_TYPE 'ns:Type' ] [ EXTENDS 'ns:Parent' ]
  [ TITLE 'text' ] [ DESCRIPTION 'text' ] [ ICON 'icon-name' ]
  [ FIELDS ( property_def [, ...] ) ]
  [ PUBLISHABLE ];

ALTER ARCHETYPE 'ns:Name' ADD FIELD def | DROP FIELD name | MODIFY FIELD def
                         | SET TITLE = 'text' | SET DESCRIPTION = 'text' | SET ICON = 'name'
                         | SET BASE_NODE_TYPE = 'ns:Type' | SET EXTENDS = 'ns:Parent' | SET PUBLISHABLE = true;

DROP ARCHETYPE 'ns:Name' [ CASCADE ];
```

```sql
CREATE ARCHETYPE 'docs:BlogPost' BASE_NODE_TYPE 'docs:Article' TITLE 'Blog Post' FIELDS (hero Element, body Composite);
SELECT name, base_node_type, title, fields FROM Archetypes;
```

```json
{"name":"docs:BlogPost","base_node_type":"docs:Article","title":"Blog Post",
 "fields":[{"$type":"SectionField","name":"hero"},
           {"$type":"SectionField","name":"body","multiple":true}]}
```

`FIELDS` is stored, as are `BASE_NODE_TYPE`, `TITLE`, `DESCRIPTION`, `ICON` and `PUBLISHABLE`. `ADD FIELD`, `DROP FIELD` and `MODIFY FIELD` on `ALTER ARCHETYPE` all take effect: `ADD FIELD` on a name that already exists replaces it, and `DROP` or `MODIFY` on a name that does not exist is an error rather than a silent no-op.

The `=` in the `SET` clauses is optional, so `SET DESCRIPTION 'text'` and `SET DESCRIPTION = 'text'` both work.

## CREATE ELEMENTTYPE

An element type is a content block used inside `Composite` and `Element` properties.

```sql
CREATE ELEMENTTYPE 'ns:Name'
  [ DESCRIPTION 'text' ] [ ICON 'icon-name' ]
  [ FIELDS ( property_def [, ...] ) ];

ALTER ELEMENTTYPE 'ns:Name' ADD FIELD def | DROP FIELD name | MODIFY FIELD def
                           | SET DESCRIPTION = 'text' | SET ICON = 'name' | SET PUBLISHABLE = true;

DROP ELEMENTTYPE 'ns:Name' [ CASCADE ];
```

```sql
CREATE ELEMENTTYPE 'docs:Hero' DESCRIPTION 'Hero block' FIELDS (heading String REQUIRED TRANSLATABLE, image Resource);
SELECT name, description, fields FROM ElementTypes WHERE name LIKE 'docs:%';
```

```json
{"name":"docs:Hero","description":"Hero block",
 "fields":[{"$type":"TextField","name":"heading","required":true,"translatable":true},
           {"$type":"MediaField","name":"image"}]}
```

`FIELDS` is stored, and `ALTER ELEMENTTYPE`'s `ADD FIELD` / `DROP FIELD` / `MODIFY FIELD` behave as they do for archetypes.

### How a DDL type becomes a field

Fields are a tagged set (`$type`), while the DDL type vocabulary is the property one. The mapping:

| DDL type | Field |
|---|---|
| `String`, `URL` | `TextField` |
| `Number` | `NumberField` |
| `Boolean` | `BooleanField` |
| `Date` | `DateField` |
| `Reference`, `NodeType` | `ReferenceField` |
| `Resource` | `MediaField` |
| `Object` | `JsonObjectField` |
| `Element` | `SectionField`, accepting any element type |
| `Composite` | `SectionField`, `multiple` |
| `Array<T>` | the field for `T`, `multiple` |

`REQUIRED`, `TRANSLATABLE`, the index list, the default value, the label and the description all carry through. Two things the DDL grammar cannot yet say: which element types a `SectionField` accepts, and `ENCRYPTED`. Declare those in package YAML.

## Reading the result

The schema tables show what a DDL statement stored:

```sql
SELECT name, extends, mixins, properties, allowed_children FROM NodeTypes WHERE name LIKE 'docs:%';
SELECT name, base_node_type, title FROM Archetypes;
SELECT name, description FROM ElementTypes;
```

Use `LIKE` rather than `=` on `name`; see [Schema Tables](../schema-tables.md#filtering-schema-tables).
