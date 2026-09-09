---
sidebar_position: 1
---

# String Functions

The string functions implemented today, plus the `||` operator and `LIKE` / `ILIKE`. All of them return NULL when given NULL.

<!-- HANDOVER(scalar-functions): this page is owned by the scalar-function
     implementation pass. The library (CONCAT, SUBSTRING/SUBSTR, TRIM family, REPLACE, POSITION/STRPOS, LEFT/RIGHT, LPAD/RPAD, SPLIT_PART, REGEXP_*, INITCAP, MD5, LENGTH) was
     not present on the server verified 2026-09-08 ("Function not found: ABS(INT)",
     "Function not found: DATE_TRUNC(TEXT, TIMESTAMPTZ)"). Fill this page from that
     pass's own executed results, then delete this comment. -->

## UPPER

```sql
UPPER(text) → TEXT
```

```sql
SELECT UPPER('héllo') AS u, UPPER(name) AS n FROM 'blog' WHERE path = '/hello';
-- {"u":"HÉLLO","n":"HELLO"}
```

Unicode case mapping; multi-byte characters are handled.

## LOWER

```sql
LOWER(text) → TEXT
```

```sql
SELECT LOWER('HÉLLO') AS l;
-- {"l":"héllo"}
```

A common use is case-insensitive matching, though `ILIKE` does the same without a function call:

```sql
SELECT name FROM 'blog' WHERE LOWER(properties->>'title') LIKE '%first%';
SELECT name FROM 'blog' WHERE properties->>'title' ILIKE '%FIRST%';
-- both: first
```

## COALESCE

Return the first argument that is not NULL. Any number of arguments; all must share a type.

```sql
COALESCE(value1, value2 [, ...]) → type of the arguments
```

```sql
SELECT COALESCE(NULL, 'default', 'other') AS c,
       COALESCE(properties->>'summary', properties->>'title') AS text
FROM 'blog' WHERE path = '/hello';
-- {"c":"default","text":"Hello"}
```

A missing JSON key reads as NULL through `->>`, so `COALESCE(properties->>'nickname', name)` is the idiom for "use the property if the node has one".

## NULLIF

Return NULL when the two arguments are equal, otherwise the first argument.

```sql
NULLIF(value1, value2) → type of value1
```

```sql
SELECT NULLIF('a', 'a') AS same, NULLIF('a', 'b') AS different;
-- {"same":null,"different":"a"}

-- treat an empty string as missing
SELECT COALESCE(NULLIF(properties->>'subtitle', ''), 'untitled') AS subtitle FROM 'blog';

-- avoid division by zero
SELECT (properties->>'total')::DOUBLE / NULLIF((properties->>'count')::INT, 0) AS average FROM 'blog';
```

## Concatenation with `||`

`||` joins TEXT values. NULL in either operand makes the result NULL.

```sql
SELECT name || ' (' || path || ')' AS label FROM 'blog' WHERE path = '/hello';
-- {"label":"hello (/hello)"}

SELECT 'a' || NULL AS n;
-- {"n":null}

SELECT properties->>'title' || COALESCE(' - ' || properties->>'subtitle', '') AS heading FROM 'blog';
```

`||` between two JSONB values is a merge, not a concatenation; see [Operators](../operators.md#json-operators).

## LIKE and ILIKE

`%` matches any run of characters, `_` exactly one. `LIKE` is case-sensitive, `ILIKE` is not; `NOT LIKE` negates.

```sql
SELECT name FROM 'blog' WHERE name LIKE 'h_llo';          -- hello
SELECT name FROM 'blog' WHERE name NOT LIKE 'h%';          -- news, first, second
SELECT name FROM 'blog' WHERE properties->>'title' ILIKE '%post%';   -- first
```

Regular-expression operators are not available today; use `LIKE` / `ILIKE` or full-text search (`FULLTEXT_MATCH`, [Full-text functions](./fulltext-functions.md)).

## Comparison and sorting

Text compares and sorts by Unicode code point, case-sensitively (`'Z' < 'a'`). `MIN` and `MAX` over text follow the same order:

```sql
SELECT MIN(name) AS first_name, MAX(name) AS last_name FROM 'blog';
-- {"first_name":"first","last_name":"second"}
```
