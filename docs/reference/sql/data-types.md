---
sidebar_position: 2
---

# Data Types

Two type systems meet in RaisinDB SQL, and it helps to keep them apart:

- **Expression types** are what the SQL analyzer assigns to literals, columns, casts and function results while a statement runs. They are listed on this page.
- **Property types** (`String`, `Number`, `Boolean`, `Date`, `Reference`, `Object { ... }`, `Array OF ...`) describe the shape of `properties` in a NodeType, Mixin, Archetype or ElementType. They are declared with DDL and documented in [DDL Statements](./statements/ddl.md#property-types-and-modifiers).

A node has no user-defined columns. A `views` property is JSON inside `properties`; `properties->>'views'` reads it as TEXT and `(properties->>'views')::INT` turns it into an INT expression.

## Numeric types

| Type | Description |
|------|-------------|
| `INT` | 32-bit signed integer. The type of an integer literal and of `depth`, `version` and `DEPTH(path)`. |
| `BIGINT` | 64-bit signed integer. Returned by `COUNT` and the ranking window functions. |
| `DOUBLE` | 64-bit float. The type of a float literal and of every arithmetic result. |

`NUMERIC` and `DECIMAL` are not accepted as cast targets; `'1.5'::NUMERIC` fails with `Unsupported SQL type: Numeric(None)`. Use `DOUBLE`.

```sql
SELECT 1 + 2 AS a, 7 / 2 AS b, 7 % 3 AS c, (properties->>'views')::INT * 2 AS d
FROM 'blog' WHERE path = '/hello';
```

```json
{"a":3.0,"b":3.5,"c":1.0,"d":24.0}
```

Arithmetic always yields DOUBLE, so `7 / 2` is `3.5`, not `3`. Cast the result back if you need an integer: `(7 / 2)::INT`.

## Text types

| Type | Description |
|------|-------------|
| `TEXT` | UTF-8 string. The type of `name`, `node_type`, `id` and of `properties->>'key'`. |
| `UUID` | A UUID kept as text. Available as a cast target (`'...'::UUID`). |

String literals use single quotes; double a quote to escape it (`'it''s'`).

## BOOLEAN

`true`, `false` and NULL. Comparison and predicate results are BOOLEAN, and `WHERE` accepts only a BOOLEAN expression. A boolean stored in JSON reads back as the text `'true'` / `'false'` through `->>`, so compare against the string, or use `properties @> '{"published": true}'`, or `JSON_GET_BOOL(properties, 'published')`.

## Temporal types

| Type | Description |
|------|-------------|
| `TIMESTAMPTZ` | Timestamp with time zone, stored and returned in UTC as ISO 8601 (`2026-09-06T18:32:15.143528+00:00`). The type of `created_at`, `updated_at`, `published_at` and `NOW()`. |
| `INTERVAL` | A duration, written `INTERVAL '7 days'`. Used only in arithmetic with a timestamp. |

A string is not implicitly a timestamp. Cast literals before comparing them with a timestamp column:

```sql
SELECT name FROM 'blog'
WHERE created_at > '2020-01-01T00:00:00Z'::TIMESTAMPTZ AND created_at < NOW();
```

`TIMESTAMP` is accepted as a cast target and means the same as `TIMESTAMPTZ`. See [DateTime functions](./functions/datetime-functions.md) for what works with intervals.

## PATH

A hierarchical path such as `/news/first`. It is the type of the `path` column and of the results of `PARENT` and `ANCESTOR`. A TEXT literal coerces to PATH wherever a PATH is expected, so `WHERE path = '/news/first'` needs no cast. A path always starts with `/`; the workspace root is `/`.

## JSONB

A JSON value. The `properties`, `translations` and `relations` columns are JSONB, and so are the results of `->`, `properties || '{...}'`, `JSON_QUERY` and `JSONB_SET`.

A string literal is TEXT until you cast it, and the DML type check requires JSONB for `properties`:

```sql
INSERT INTO 'blog' (path, node_type, properties)
VALUES ('/news/fourth', 'raisin:Page', '{"title": "Fourth"}'::jsonb);
```

Without the cast the statement is rejected with `Type mismatch: expected JSONB, got TEXT`. In a `WHERE` comparison the right-hand side of `@>` may stay uncast; the analyzer converts it.

JSON scalars come back as their JSON type in results: `properties->'views'` returns `10`, `properties->>'views'` returns `"10"`.

## GEOMETRY

A GeoJSON geometry (Point, LineString, Polygon and the Multi* forms), produced by `ST_POINT`, `ST_GEOMFROMGEOJSON` and the other `ST_*` constructors, and read from a property that holds a geometry. Coordinates are longitude, latitude in WGS84 unless an SRID says otherwise. See [Geospatial functions](./functions/geospatial-functions.md).

## VECTOR

A fixed-width embedding vector. Vectors are produced by `EMBEDDING(text)` and `VECTOR_OF(...)` and compared with `VECTOR_L2_DISTANCE`, `VECTOR_COSINE_DISTANCE` and `VECTOR_INNER_PRODUCT`. `VECTOR` is not a cast target (`'[1,2]'::VECTOR(2)` is rejected). See [Vector functions](./functions/vector-functions.md).

## TSVECTOR and TSQUERY

Full-text search types used with the `@@` operator, `to_tsvector(language, text)` and `to_tsquery(language, text)`. Most full-text queries use `FULLTEXT_MATCH(query, language)` instead. See [Full-text functions](./functions/fulltext-functions.md).

## Arrays

`ARRAY_AGG` returns an array, rendered as a JSON array in results. Array literals (`ARRAY['a','b']`) and array casts (`'{a,b}'::text[]`) are not accepted by the analyzer; JSON arrays inside `properties` are the way to store lists.

## NULL

Every type is nullable. `NULL` compared with anything is NULL, so `WHERE x = NULL` matches nothing; use `IS NULL`, `IS NOT NULL` or `IS DISTINCT FROM`. A missing JSON key reads as NULL through `->>`, which makes `properties->>'summary' IS NULL` the usual way to find nodes without a property.

## Casting

```sql
SELECT '123'::INT AS a, CAST('1.5' AS DOUBLE) AS b, 42::TEXT AS c,
       '2024-01-15T10:00:00Z'::TIMESTAMPTZ AS d, 'true'::BOOLEAN AS e,
       '{"a":1}'::jsonb AS j, '/a/b'::PATH AS p, NOW()::TEXT AS t;
```

```json
{"a":123,"b":1.5,"c":"42","d":"2024-01-15T10:00:00+00:00","e":true,"j":"{\"a\":1}","p":"/a/b","t":"2026-09-06T18:32:58.147227+00:00"}
```

Accepted cast targets: `INT` / `INTEGER`, `BIGINT`, `DOUBLE` / `DOUBLE PRECISION`, `TEXT` / `VARCHAR` / `STRING`, `BOOLEAN`, `TIMESTAMP` / `TIMESTAMPTZ`, `JSON` / `JSONB`, `PATH`, `UUID`, `GEOMETRY`, `TSVECTOR`, `TSQUERY`, `INTERVAL`.

Implicit coercions: INT to BIGINT to DOUBLE, TEXT to PATH, and any type to its nullable form. `properties->>'k'::String` is a RaisinDB spelling that keeps the key as a verbatim row-level filter; it is documented under [Operators](./operators.md#json-operators).
