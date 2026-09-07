---
sidebar_position: 3
---

# Operators

Operators available in RaisinDB SQL expressions, with the behaviour you get when you run them. Examples use a `blog` workspace whose pages carry `title`, `views`, `published`, `tags` and `author` properties.

## Comparison

| Operator | Meaning |
|----------|---------|
| `=` | equal |
| `!=`, `<>` | not equal |
| `<`, `<=`, `>`, `>=` | ordering |
| `IS NULL`, `IS NOT NULL` | null test |
| `IS DISTINCT FROM`, `IS NOT DISTINCT FROM` | null-safe equality |
| `BETWEEN x AND y`, `NOT BETWEEN` | inclusive range |
| `IN (...)`, `NOT IN (...)` | membership in a list or an `IN (SELECT ...)` subquery |
| `LIKE`, `NOT LIKE`, `ILIKE` | pattern match (`%` any run, `_` one character); `ILIKE` ignores case |

```sql
SELECT name FROM 'blog'
WHERE name NOT LIKE 'h%' AND name IN ('news', 'first') AND depth BETWEEN 1 AND 2;
-- rows: news, first

SELECT name FROM 'blog' WHERE properties->>'title' ILIKE '%FIRST%';
-- rows: first

SELECT name FROM 'blog' WHERE path IN (SELECT PARENT(path) FROM 'blog');
-- rows: news   (the only node that is somebody's parent)
```

Comparisons are typed. `->>` yields TEXT, so a number in JSON must be cast before a numeric comparison, and a timestamp column must be compared with a timestamp:

```sql
SELECT name FROM 'blog' WHERE (properties->>'views')::INT > 20;
SELECT name FROM 'blog' WHERE created_at > '2020-01-01T00:00:00Z'::TIMESTAMPTZ;
```

`created_at BETWEEN '2020-01-01' AND '2030-01-01'` without casts is rejected (`expected TIMESTAMPTZ, got TEXT`).

`= NULL` matches nothing; use `IS NULL`. A missing JSON key reads as NULL:

```sql
SELECT name FROM 'blog' WHERE properties->>'summary' IS NULL;
```

<!-- TODO(sql-ext): fill from engine report (regex operators ~ ~* SIMILAR TO, ANY/ALL) -->

## Logical

`AND`, `OR`, `NOT`, with three-valued logic (NULL AND true is NULL). `AND` binds tighter than `OR`:

```sql
SELECT name FROM 'blog' WHERE name = 'hello' OR name = 'news' AND depth = 2;
-- rows: hello    (parsed as hello OR (news AND depth = 2))
```

Parenthesise mixed `AND` / `OR` conditions.

## Arithmetic

`+`, `-`, `*`, `/`, `%` and unary `-`. Every arithmetic result is DOUBLE, including integer-only input, and division by zero is an error.

```sql
SELECT 1 + 2 AS a, 7 / 2 AS b, 7 % 3 AS c, -depth AS neg FROM 'blog' LIMIT 1;
-- {"a":3.0,"b":3.5,"c":1.0,"neg":-1}

SELECT 1 / 0;
-- error: Division by zero
```

Use `NULLIF(x, 0)` as a divisor to turn a zero into NULL instead of an error. NULL in any operand gives NULL.

A timestamp plus or minus an `INTERVAL` works on `NOW()` (`NOW() - INTERVAL '1 day'`). See [DateTime functions](./functions/datetime-functions.md) for the cases that do not work on columns yet.

## String concatenation

`||` joins TEXT values. NULL in either operand gives NULL; wrap optional parts in `COALESCE`.

```sql
SELECT name || ' (' || path || ')' AS label FROM 'blog' WHERE path = '/hello';
-- {"label":"hello (/hello)"}

SELECT 'a' || NULL AS n;
-- {"n":null}
```

## JSON operators

All node data lives in the `properties` JSONB column, so these are the operators you use most.

| Operator | Result | Description |
|----------|--------|-------------|
| `json -> 'key'` | JSONB | field by key; chains for nested access |
| `json ->> 'key'` | TEXT | field by key as text |
| `json @> json` | BOOLEAN | left contains right |
| `json ? 'key'` | BOOLEAN | top-level key exists |
| `json @? 'jsonpath'` | BOOLEAN | JSONPath matches (`'$.tags'`) |
| `json \|\| json` | JSONB | shallow merge; keys on the right win |
| `json - 'key'` | JSONB | remove a top-level key |

```sql
SELECT properties->'tags' AS tags,
       properties->'author'->>'name' AS author,
       properties->'views' AS views_json,
       properties->>'views' AS views_text
FROM 'blog' WHERE path = '/news/second';
-- {"tags":["b","c"],"author":"Ana","views_json":7,"views_text":"7"}

SELECT name FROM 'blog' WHERE properties @> '{"published": true}';
SELECT name FROM 'blog' WHERE properties->'tags' @> '["b"]'::jsonb;   -- array contains element
SELECT name FROM 'blog' WHERE properties ? 'tags';
SELECT name FROM 'blog' WHERE properties @? '$.tags';

SELECT properties || '{"extra": 1}' AS merged FROM 'blog' WHERE path = '/hello';
SELECT properties - 'tags' AS without_tags FROM 'blog' WHERE path = '/hello';
```

Notes on the edges:

- `->` takes a text key only. `properties->'tags'->0` is rejected (`expected TEXT, got INT`). Read an array element with `JSON_VALUE(properties, '$.tags[0]')`.
- `#>`, `#>>` and `#-` parse but currently fail at run time (`requires JSONB arguments`), and `?|` / `?&` need array literals the analyzer does not accept. Chain `->` for nested access and use `JSONB_SET` / `-` to modify.
- `@>` with a JSON scalar on the right (`properties->'tags' @> '"b"'`) matches nothing; wrap the element in an array.

### The `::String` key cast

`properties->>'key'::String = value` is a RaisinDB form that keeps the predicate as a verbatim row filter. It is always correct, including combined with `path =` or `node_type =` and on workspaces with compound indexes. The bare form (`properties->>'key' = value`) may be routed to a property or compound index.

```sql
SELECT name FROM 'blog' WHERE properties->>'views'::String = '42';
```

`->>` yields text, so compare number and boolean properties against string literals in either form.

## CASE

Both forms are supported.

```sql
SELECT name,
       CASE node_type WHEN 'raisin:Folder' THEN 'folder' ELSE 'page' END AS kind,
       CASE WHEN depth = 1 THEN 'root' ELSE 'nested' END AS level
FROM 'blog' ORDER BY name;
```

```json
{"name":"first","kind":"page","level":"nested"}
{"name":"hello","kind":"page","level":"root"}
{"name":"news","kind":"folder","level":"root"}
```

## Search operators

- `@@` matches a `TSVECTOR` against a `TSQUERY`. In practice use `FULLTEXT_MATCH(query, language)` in `WHERE`; see [Full-text functions](./functions/fulltext-functions.md).
- Vector similarity is expressed with `VECTOR_L2_DISTANCE`, `VECTOR_COSINE_DISTANCE` and `VECTOR_INNER_PRODUCT` or through `KNN` / `HYBRID_SEARCH`; see [Vector functions](./functions/vector-functions.md).

## Precedence

Precedence follows PostgreSQL: `::` casts first, then unary minus, `*` `/` `%`, `+` `-`, then `||` and the JSON operators, then comparisons and `LIKE` / `IN` / `BETWEEN` / `IS`, then `NOT`, `AND`, `OR`. A cast written directly after a JSON access applies to the extracted value: `properties->>'views'::INT > 20` and `(properties->>'views')::INT > 20` return the same rows. The parenthesised form is the unambiguous one.
