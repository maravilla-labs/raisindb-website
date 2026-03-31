---
sidebar_position: 5
---

# Aggregate Functions

Functions for aggregating multiple rows into a single result.

## COUNT

Count the number of rows or non-NULL values.

### Syntax

```sql
COUNT(*) → BIGINT
COUNT(expression) → BIGINT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| * | - | Count all rows including NULLs |
| expression | ANY | Count non-NULL values |

### Return Value

BIGINT - Number of rows or non-NULL values.

### Examples

```sql
-- Count all rows
SELECT COUNT(*) FROM pages;

-- Count non-NULL values
SELECT COUNT(properties->>'description') FROM default;

-- Count distinct values
SELECT COUNT(DISTINCT properties->>'status') FROM default;

-- Count by group
SELECT properties->>'status' AS status, COUNT(*) AS count
FROM default
GROUP BY properties->>'status';

-- Count with condition
SELECT COUNT(*) FROM default
WHERE properties->>'status' = 'published';
```

### Notes

- `COUNT(*)` counts all rows including NULLs
- `COUNT(column)` counts only non-NULL values
- Use `COUNT(DISTINCT expr)` for unique values
- Returns 0 if no rows match

---

## SUM

Calculate the sum of numeric values.

### Syntax

```sql
SUM(expression) → BIGINT | DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | INT \| BIGINT \| DOUBLE | Numeric expression |

### Return Value

- BIGINT if input is INT or BIGINT
- DOUBLE if input is DOUBLE
- NULL if no rows

### Examples

```sql
-- Sum all values
SELECT SUM((properties->>'view_count')::int) FROM default;

-- Sum by group
SELECT properties->>'category' AS category,
       SUM((properties->>'price')::numeric) AS total_price
FROM default
GROUP BY properties->>'category';

-- Sum with filter
SELECT SUM((properties->>'price')::numeric) FROM default
WHERE properties->>'active' = 'true';

-- Sum with expression
SELECT SUM((properties->>'price')::numeric * (properties->>'quantity')::int) AS total_value
FROM default;
```

### Notes

- NULL values are ignored
- Returns NULL if no rows (not 0)
- Use COALESCE for default: `COALESCE(SUM(col), 0)`
- Overflow may occur with very large sums

---

## AVG

Calculate the average (mean) of numeric values.

### Syntax

```sql
AVG(expression) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | INT \| BIGINT \| DOUBLE | Numeric expression |

### Return Value

DOUBLE - Average value, or NULL if no rows.

### Examples

```sql
-- Average of all values
SELECT AVG((properties->>'view_count')::int) FROM default;

-- Average by group
SELECT properties->>'status' AS status,
       AVG((properties->>'view_count')::int) AS avg_views
FROM default
GROUP BY properties->>'status';

-- Average with filter
SELECT AVG((properties->>'price')::numeric) FROM default
WHERE properties->>'category' = 'electronics';

-- Round average
SELECT ROUND(AVG((properties->>'score')::numeric), 2) AS avg_score
FROM default;
```

### Notes

- NULL values are ignored
- Returns NULL if no non-NULL rows
- Result is always DOUBLE
- Division by zero does not occur

---

## MIN

Find the minimum value.

### Syntax

```sql
MIN(expression) → same as input type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Any comparable type |

### Return Value

Same type as input - Minimum value, or NULL if no rows.

### Examples

```sql
-- Minimum numeric value
SELECT MIN((properties->>'price')::numeric) FROM default;

-- Minimum date
SELECT MIN(created_at) FROM default;

-- Minimum text (alphabetical)
SELECT MIN(properties->>'title') FROM default;

-- Minimum by group
SELECT properties->>'category' AS category,
       MIN((properties->>'price')::numeric) AS cheapest
FROM default
GROUP BY properties->>'category';

-- Find oldest record
SELECT * FROM default
WHERE created_at = (SELECT MIN(created_at) FROM default);
```

### Notes

- Works with numeric, text, date types
- NULL values are ignored
- Returns NULL if no rows
- Text comparison is case-sensitive

---

## MAX

Find the maximum value.

### Syntax

```sql
MAX(expression) → same as input type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Any comparable type |

### Return Value

Same type as input - Maximum value, or NULL if no rows.

### Examples

```sql
-- Maximum numeric value
SELECT MAX((properties->>'view_count')::int) FROM default;

-- Maximum date
SELECT MAX(updated_at) FROM default;

-- Maximum text (alphabetical)
SELECT MAX(properties->>'title') FROM default;

-- Maximum by group
SELECT properties->>'status' AS status,
       MAX((properties->>'view_count')::int) AS max_views
FROM default
GROUP BY properties->>'status';

-- Find most recent record
SELECT * FROM default
WHERE created_at = (SELECT MAX(created_at) FROM default);
```

### Notes

- Works with numeric, text, date types
- NULL values are ignored
- Returns NULL if no rows
- Text comparison is case-sensitive

---

## ARRAY_AGG

Aggregate values into an array.

### Syntax

```sql
ARRAY_AGG(expression) → ARRAY[T]
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Values to aggregate |

### Return Value

ARRAY - Array containing all values, or NULL if no rows.

### Examples

```sql
-- Collect all titles
SELECT ARRAY_AGG(properties->>'title') FROM default;

-- Collect by group
SELECT properties->>'category' AS category,
       ARRAY_AGG(properties->>'name') AS product_names
FROM default
GROUP BY properties->>'category';

-- Collect with ordering
SELECT ARRAY_AGG(properties->>'title' ORDER BY created_at DESC)
FROM default;

-- Collect distinct values
SELECT ARRAY_AGG(DISTINCT properties->>'status') FROM default;
```

### Notes

- NULL values are included in the array
- Result is NULL if no rows
- Order is undefined unless ORDER BY specified
- Can aggregate any type

---

## Examples

### Count Statistics

```sql
-- Count by multiple dimensions
SELECT
    node_type,
    properties->>'status' AS status,
    COUNT(*) AS count
FROM nodes
GROUP BY node_type, properties->>'status'
ORDER BY count DESC;
```

### Revenue Analysis

```sql
-- Total and average revenue by category
SELECT
    properties->>'category' AS category,
    COUNT(*) AS product_count,
    SUM((properties->>'price')::numeric * (properties->>'stock')::int) AS total_value,
    AVG((properties->>'price')::numeric) AS avg_price,
    MIN((properties->>'price')::numeric) AS min_price,
    MAX((properties->>'price')::numeric) AS max_price
FROM default
GROUP BY properties->>'category';
```

### Group with HAVING

```sql
-- Categories with more than 10 products
SELECT
    properties->>'category' AS category,
    COUNT(*) AS product_count
FROM default
GROUP BY properties->>'category'
HAVING COUNT(*) > 10
ORDER BY product_count DESC;
```

### Aggregates with Conditions

```sql
-- Conditional aggregation
SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN properties->>'status' = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN properties->>'status' = 'draft' THEN 1 END) AS draft,
    SUM(CASE WHEN properties->>'status' = 'published'
        THEN (properties->>'view_count')::int ELSE 0 END) AS total_views
FROM default;
```

### Array Aggregation

```sql
-- Collect related items
SELECT
    c.properties->>'name' AS category,
    ARRAY_AGG(p.properties->>'title' ORDER BY (p.properties->>'view_count')::int DESC) AS top_products
FROM default c
LEFT JOIN default p ON p.properties->>'category_id' = c.id
GROUP BY c.properties->>'name';
```

### Nested Aggregates

```sql
-- Average of group sums
SELECT AVG(category_total) AS avg_category_total
FROM (
    SELECT properties->>'category' AS category,
           SUM((properties->>'price')::numeric) AS category_total
    FROM default
    GROUP BY properties->>'category'
) AS category_sums;
```

### Time-Based Aggregation

```sql
-- Daily statistics
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS daily_count,
    AVG((properties->>'view_count')::int) AS avg_views,
    MAX((properties->>'view_count')::int) AS max_views
FROM default
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date;
```

### Percentage Calculations

```sql
-- Calculate percentages
SELECT
    properties->>'status' AS status,
    COUNT(*) AS count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS percentage
FROM default
GROUP BY properties->>'status';
```

### Multiple Metrics

```sql
-- Comprehensive statistics
SELECT
    properties->>'category' AS category,
    COUNT(*) AS total_products,
    COUNT(DISTINCT properties->>'brand') AS brand_count,
    SUM((properties->>'stock')::int) AS total_stock,
    AVG((properties->>'price')::numeric) AS avg_price,
    MIN((properties->>'price')::numeric) AS min_price,
    MAX((properties->>'price')::numeric) AS max_price,
    ARRAY_AGG(properties->>'name' ORDER BY (properties->>'price')::numeric DESC LIMIT 5) AS top_products
FROM default
GROUP BY properties->>'category'
HAVING COUNT(*) > 5
ORDER BY total_stock DESC;
```

### Hierarchical Aggregation

```sql
-- Count nodes by depth
SELECT
    DEPTH(path) AS depth,
    COUNT(*) AS node_count,
    AVG(CHAR_LENGTH(properties->>'title')) AS avg_title_length
FROM nodes
GROUP BY DEPTH(path)
ORDER BY depth;
```

### Filtering After Aggregation

```sql
-- High-value categories
SELECT
    properties->>'category' AS category,
    SUM((properties->>'price')::numeric * (properties->>'stock')::int) AS total_value,
    COUNT(*) AS product_count
FROM default
GROUP BY properties->>'category'
HAVING SUM((properties->>'price')::numeric * (properties->>'stock')::int) > 10000
ORDER BY total_value DESC;
```

---

## Notes

- Aggregate functions ignore NULL values (except COUNT(*))
- Used with GROUP BY to aggregate by groups
- Can be used with HAVING to filter aggregated results
- Return NULL for empty result sets (except COUNT(*) returns 0)
- Cannot be nested (e.g., `SUM(MAX(col))` is invalid)
- Can be combined with window functions using OVER clause
