---
sidebar_position: 2
---

# Numeric Functions

Arithmetic in RaisinDB SQL uses the operators `+`, `-`, `*`, `/`, `%` and unary `-`; every result is DOUBLE, and division by zero is an error (see [Operators](../operators.md#arithmetic)). One numeric function is implemented today.

<!-- TODO(sql-ext): fill from engine report (ABS, CEIL, FLOOR, TRUNC, SQRT, POWER, MOD, EXP, LN, LOG, PI, RANDOM, GREATEST, LEAST, ...) -->

## ROUND

Round to the nearest integer, or to a number of decimal places. Halves round away from zero.

```sql
ROUND(number) → DOUBLE
ROUND(number, decimals) → DOUBLE
```

| Parameter | Type | Description |
|-----------|------|-------------|
| number | INT, BIGINT or DOUBLE | Value to round |
| decimals | INT | Decimal places to keep (default 0) |

```sql
SELECT ROUND(3.7) AS a, ROUND(-2.5) AS b, ROUND(2.5) AS c,
       ROUND(3.14159, 2) AS d, ROUND(99.999, 1) AS e, ROUND(NULL) AS f;
```

```json
{"a":4.0,"b":-3.0,"c":3.0,"d":3.14,"e":100.0,"f":null}
```

The result is DOUBLE in both forms (`ROUND(3.7)` is `4.0`, not `4`). Cast if you need an integer: `ROUND(x)::INT`.

Rounding an aggregate:

```sql
SELECT ROUND(AVG((properties->>'views')::INT), 1) AS avg_views FROM 'blog';
-- {"avg_views":50.3}
```

## Working with numbers stored in properties

A number in `properties` is JSON; `->>` reads it as text. Cast before arithmetic or comparison:

```sql
SELECT name, (properties->>'views')::INT * 2 AS doubled
FROM 'blog' WHERE (properties->>'views')::INT > 20;
```

`NULLIF(divisor, 0)` avoids a division-by-zero error, and `COALESCE(x, 0)` supplies a default for a missing property; both are described under [String functions](./string-functions.md#coalesce).
