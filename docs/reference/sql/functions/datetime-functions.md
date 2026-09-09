---
sidebar_position: 4
---

# DateTime Functions

Timestamps are `TIMESTAMPTZ`, stored and returned in UTC as ISO 8601 with microseconds. `created_at`, `updated_at` and `published_at` are timestamp columns; dates inside `properties` are JSON strings.

<!-- HANDOVER(scalar-functions): this page is owned by the scalar-function
     implementation pass. The library (CURRENT_TIMESTAMP/CURRENT_DATE, DATE_TRUNC, EXTRACT/DATE_PART, AGE, TO_CHAR, TO_TIMESTAMP, TO_DATE, MAKE_DATE, interval arithmetic on columns) was
     not present on the server verified 2026-09-08 ("Function not found: ABS(INT)",
     "Function not found: DATE_TRUNC(TEXT, TIMESTAMPTZ)"). Fill this page from that
     pass's own executed results, then delete this comment. -->

## NOW

The current UTC time.

```sql
NOW() → TIMESTAMPTZ
```

```sql
SELECT NOW() AS now, NOW()::TEXT AS as_text;
-- {"now":"2026-09-06T18:34:14.480233+00:00","as_text":"2026-09-06T18:34:14.480233+00:00"}
```

`NOW` is the only clock function today; `CURRENT_TIMESTAMP` and `CURRENT_DATE` are not recognised.

## INTERVAL literals

```sql
INTERVAL 'quantity unit'
```

Units: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years` (singular forms too). An interval is only useful in arithmetic with `NOW()`; selecting one on its own returns NULL, and adding one to a column is not supported yet.

```sql
SELECT NOW() + INTERVAL '30 minutes' AS soon,
       NOW() - INTERVAL '1 day' AS yesterday,
       NOW() - INTERVAL '1 month' AS last_month,
       NOW() - INTERVAL '1 year' AS last_year;
```

```json
{"soon":"2026-09-07T01:17:57.677086+00:00","yesterday":"2026-09-06T00:47:57.677086+00:00","last_month":"2026-08-08T00:47:57.677113+00:00","last_year":"2025-09-06T18:47:57.677086+00:00"}
```

## Comparing timestamps

A timestamp column compares with `NOW()`, with another timestamp column, or with a literal or parameter cast to `TIMESTAMPTZ`. A bare string is TEXT and is rejected (`expected TIMESTAMPTZ, got TEXT`).

```sql
SELECT name FROM 'blog' WHERE created_at < NOW();

SELECT name FROM 'blog'
WHERE created_at > '2020-01-01T00:00:00Z'::TIMESTAMPTZ AND created_at < NOW();

SELECT name FROM 'blog'
WHERE created_at BETWEEN '2020-01-01'::TIMESTAMPTZ AND '2030-01-01'::TIMESTAMPTZ;

-- parameter: {"params": ["2026-09-06T18:39:00Z"]}
SELECT name FROM 'blog' WHERE updated_at > $1::TIMESTAMPTZ;
```

Comparing a column against `NOW() - INTERVAL '...'` is not planned yet (`Range scan not supported for this predicate`), and `created_at + INTERVAL '7 days'` in the select list fails. Compute the boundary on the client and pass it as a parameter:

```json
{"sql": "SELECT name FROM 'blog' WHERE created_at > $1::TIMESTAMPTZ ORDER BY created_at DESC",
 "params": ["2026-08-30T00:00:00Z"]}
```

## Sorting and aggregating

```sql
SELECT name, updated_at FROM 'blog' ORDER BY updated_at DESC LIMIT 2;
-- {"name":"hello","updated_at":"2026-09-06T18:39:56.629731+00:00"}, {"name":"second","updated_at":"2026-09-06T18:39:56.608921+00:00"}

SELECT MIN(created_at) AS first_created, MAX(updated_at) AS last_change FROM 'blog';
```

`ORDER BY created_at DESC LIMIT n` is served by an index (`PropertyOrderScan` in `EXPLAIN`), which makes "newest n" queries cheap.

## Dates inside properties

A date in `properties` is a string. Keep it in ISO 8601 with a `Z` or offset so that text comparison and sorting agree with chronological order, and cast when you need a timestamp:

```sql
SELECT name FROM 'blog'
WHERE (properties->>'published_on')::TIMESTAMPTZ < NOW()
ORDER BY properties->>'published_on' DESC;
```

## Casting

`'2024-01-15T10:00:00Z'::TIMESTAMPTZ` (or `::TIMESTAMP`) parses an ISO 8601 string; `NOW()::TEXT` renders one. Casting a date-only string such as `'2020-01-01'` works and means midnight UTC.
