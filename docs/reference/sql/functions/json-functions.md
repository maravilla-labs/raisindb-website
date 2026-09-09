---
sidebar_position: 2
---

# JSON Functions

All node data lives in the `properties` JSONB column, so these functions run against `properties` in nearly every query. The operators `->`, `->>`, `@>`, `?`, `@?`, `||` and `-` are covered under [Operators](../operators.md#json-operators).

Two path notations appear below. JSONPath (`'$.author.city'`, `'$.tags[0]'`) is used by `JSON_VALUE`, `JSON_QUERY` and `JSON_EXISTS`. A plain key (`'title'`) is used by the `JSON_GET_*` family, and a brace path (`'{author,city}'`) by `JSONB_SET`.

Example node:

```json
{"path":"/news/second","properties":{"title":"Second","views":7,"published":true,"tags":["b","c"],"author":{"name":"Ana","city":"Lisbon"}}}
```

## JSON_VALUE

Extract one scalar as text with a JSONPath.

```sql
JSON_VALUE(json, jsonpath) → TEXT
```

```sql
SELECT JSON_VALUE(properties, '$.title') AS title,
       JSON_VALUE(properties, '$.author.city') AS city,
       JSON_VALUE(properties, '$.tags[0]') AS first_tag,
       JSON_VALUE(properties, '$.missing') AS missing
FROM 'blog' WHERE path = '/news/second';
```

```json
{"title":"Second","city":"Lisbon","first_tag":"b","missing":null}
```

Numbers and booleans come back as text (`'7'`, `'true'`). A path that lands on an object or array is an error (`JSON_VALUE can only extract scalar values`), and so is a wildcard path that matches several values; use `JSON_QUERY` for those.

```sql
SELECT name FROM 'blog' WHERE JSON_VALUE(properties, '$.author.city') = 'Lisbon';
-- second
```

## JSON_QUERY

Extract an object or array as JSONB.

```sql
JSON_QUERY(json, jsonpath) → JSONB
```

```sql
SELECT JSON_QUERY(properties, '$.tags') AS tags, JSON_QUERY(properties, '$.author') AS author
FROM 'blog' WHERE path = '/news/second';
```

```json
{"tags":["b","c"],"author":{"name":"Ana","city":"Lisbon"}}
```

`JSON_QUERY(properties, '$.tags[0]')` returns NULL today; read single elements with `JSON_VALUE`.

## JSON_EXISTS

Whether a JSONPath resolves to anything. A key holding JSON `null` counts as present.

```sql
JSON_EXISTS(json, jsonpath) → BOOLEAN
```

```sql
SELECT JSON_EXISTS(properties, '$.author') AS has_author,
       JSON_EXISTS(properties, '$.summary') AS has_summary
FROM 'blog' WHERE path = '/news/second';
-- {"has_author":true,"has_summary":false}

SELECT name FROM 'blog' WHERE JSON_EXISTS(properties, '$.author');
-- second
```

The operator form `properties ? 'author'` does the same for a top-level key.

## JSON_GET and JSON_GET_TEXT / INT / DOUBLE / BOOL

Read a top-level key as a typed value. The key is a plain name, not a JSONPath; nested keys are not reachable this way (use `JSON_VALUE` or `->`).

```sql
JSON_GET(json, key)        → the value, typed from the JSON
JSON_GET_TEXT(json, key)   → TEXT
JSON_GET_INT(json, key)    → INT
JSON_GET_DOUBLE(json, key) → DOUBLE
JSON_GET_BOOL(json, key)   → BOOLEAN
```

```sql
SELECT JSON_GET_TEXT(properties, 'title') AS title,
       JSON_GET_INT(properties, 'views') AS views,
       JSON_GET_DOUBLE(properties, 'views') AS views_d,
       JSON_GET_BOOL(properties, 'published') AS published,
       JSON_GET_INT(properties, 'missing') AS missing
FROM 'blog' WHERE path = '/news/second';
```

```json
{"title":"Second","views":7,"views_d":7.0,"published":true,"missing":null}
```

A missing key is NULL. A key whose value has the wrong JSON type is an error (`Value at key 'b' is not a boolean`), so these are for properties whose type the schema guarantees. `JSON_GET_TEXT` on an object returns its JSON text.

```sql
SELECT name FROM 'blog' WHERE JSON_GET_BOOL(properties, 'published') = true;
-- hello, second
```

## JSONB_SET

Return a copy of a JSON value with one path set. The path is a brace list of keys; the value is JSON text (quote strings as `'"text"'`).

```sql
JSONB_SET(json, '{key[,subkey...]}', value_json [, create_missing]) → JSONB
```

```sql
SELECT JSONB_SET('{"a":1}'::jsonb, '{b,c}', '2') AS nested,
       JSONB_SET('{"a":1}'::jsonb, '{z}', '9', false) AS no_create;
-- {"nested":{"a":1,"b":{"c":"2"}},"no_create":{"a":1}}

UPDATE 'blog' SET properties = JSONB_SET(properties, '{views}', '11') WHERE path = '/hello';
UPDATE 'blog' SET properties = JSONB_SET(properties, '{author,name}', '"Ana Silva"') WHERE path = '/news/second';
```

Intermediate objects are created unless `create_missing` is `false`. A JSONPath (`'$.views'`) is rejected: `Invalid path format '$.views'. Expected '{key}' or '{a,b,c}'`. When a value passed as text has no cast, it is stored as a string (`'2'` became `"2"` above); cast it to keep the JSON type: `JSONB_SET(properties, '{views}', '11'::jsonb)`.

To merge several keys at once use `properties || '{"a": 1, "b": 2}'`; to drop a key use `properties - 'key'`.

## TO_JSON and TO_JSONB

Convert a value, or a whole row, to JSONB. The two names are interchangeable.

```sql
TO_JSON(value) → JSONB
TO_JSON(table_alias) → JSONB
```

```sql
SELECT TO_JSON(42) AS n, TO_JSON(true) AS b, TO_JSONB(1.5) AS d,
       TO_JSON(properties->'tags') AS tags
FROM 'blog' WHERE path = '/hello';
-- {"n":42,"b":true,"d":1.5,"tags":["a","b"]}

SELECT TO_JSON(b) AS node FROM 'blog' b WHERE path = '/hello';
-- {"node":{"id":"...","path":"/hello","name":"hello","node_type":"raisin:Page","properties":{...},"created_at":"...",...}}
```

Passing a TEXT value (`TO_JSON(name)` or `TO_JSON(properties->>'title')`) currently fails with `Cannot cast 'Hello' to JSONB`; wrap the text in a JSON literal instead, or read the value with `->` so it is already JSON.

## Examples

```sql
-- typed filter on a nested field
SELECT name FROM 'blog'
WHERE JSON_EXISTS(properties, '$.author') AND JSON_GET_BOOL(properties, 'published') = true;

-- several fields at once
SELECT properties->>'title' AS title,
       JSON_VALUE(properties, '$.author.name') AS author,
       JSON_GET_INT(properties, 'views') AS views
FROM 'blog' WHERE node_type = 'raisin:Page';

-- update one field, merge several, remove one
UPDATE 'blog' SET properties = JSONB_SET(properties, '{status}', '"published"') WHERE path = '/news/first';
UPDATE 'blog' SET properties = properties || '{"status": "published", "featured": true}' WHERE path = '/news/first';
UPDATE 'blog' SET properties = properties - 'featured' WHERE path = '/news/first';
```
