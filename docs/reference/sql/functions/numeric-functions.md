---
sidebar_position: 2
---

# Numeric Functions

Functions for numeric operations.

## ROUND

Round a number to the nearest integer or to a specified number of decimal places.

### Syntax

```sql
ROUND(number) → INT
ROUND(number, decimals) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| number | INT \| BIGINT \| DOUBLE | Number to round |
| decimals | INT | Optional. Number of decimal places (default: 0) |

### Return Value

- INT when called without decimals parameter
- DOUBLE when called with decimals parameter

### Examples

```sql
-- Round to nearest integer
SELECT ROUND(3.7);
-- Result: 4

SELECT ROUND(3.2);
-- Result: 3

SELECT ROUND(-2.5);
-- Result: -3

-- Round to specific decimal places
SELECT ROUND(3.14159, 2);
-- Result: 3.14

SELECT ROUND(99.999, 1);
-- Result: 100.0

SELECT ROUND(123.456, 0);
-- Result: 123.0

-- Use in queries
SELECT
    name,
    price,
    ROUND(price, 2) AS rounded_price
FROM products;

-- Round averages
SELECT
    category,
    ROUND(AVG(price), 2) AS avg_price
FROM products
GROUP BY category;
```

### Notes

- Returns NULL if input is NULL
- Uses banker's rounding (round half to even) for the boundary case
- Negative decimal places are not supported
