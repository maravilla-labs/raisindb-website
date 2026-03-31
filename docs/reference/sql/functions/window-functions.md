---
sidebar_position: 6
---

# Window Functions

Analytical functions that operate over a set of rows related to the current row.

## Overview

Window functions perform calculations across rows that are related to the current row, without collapsing them into a single output row like aggregate functions do.

### Syntax

```sql
function() OVER (
    [ PARTITION BY partition_expression [, ...] ]
    [ ORDER BY sort_expression [ ASC | DESC ] [, ...] ]
    [ frame_clause ]
)
```

## ROW_NUMBER

Assign a unique sequential number to each row within a partition.

### Syntax

```sql
ROW_NUMBER() OVER ( ... ) → BIGINT
```

### Return Value

BIGINT - Sequential row number starting from 1.

### Examples

```sql
-- Number all rows
SELECT
    title,
    ROW_NUMBER() OVER (ORDER BY __created_at) AS row_num
FROM pages;

-- Number within partitions
SELECT
    category,
    title,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY view_count DESC) AS rank_in_category
FROM pages;

-- Top 3 per category
SELECT * FROM (
    SELECT
        category,
        title,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY view_count DESC) AS rn
    FROM pages
) ranked
WHERE rn <= 3;
```

### Notes

- Each row gets a unique number
- No gaps in sequence
- Deterministic with ORDER BY
- Useful for pagination and top-N queries

---

## RANK

Assign a rank with gaps for tied values.

### Syntax

```sql
RANK() OVER ( ... ) → BIGINT
```

### Return Value

BIGINT - Rank with gaps after ties.

### Examples

```sql
-- Rank by view count
SELECT
    title,
    view_count,
    RANK() OVER (ORDER BY view_count DESC) AS rank
FROM pages;

-- Rank within categories
SELECT
    category,
    title,
    view_count,
    RANK() OVER (PARTITION BY category ORDER BY view_count DESC) AS category_rank
FROM pages;
```

### Notes

- Tied values get the same rank
- Next rank skips numbers (1, 2, 2, 4, 5)
- Use DENSE_RANK for no gaps
- Requires ORDER BY

---

## DENSE_RANK

Assign a rank without gaps for tied values.

### Syntax

```sql
DENSE_RANK() OVER ( ... ) → BIGINT
```

### Return Value

BIGINT - Dense rank without gaps.

### Examples

```sql
-- Dense rank by view count
SELECT
    title,
    view_count,
    DENSE_RANK() OVER (ORDER BY view_count DESC) AS dense_rank
FROM pages;

-- Compare RANK vs DENSE_RANK
SELECT
    title,
    view_count,
    RANK() OVER (ORDER BY view_count DESC) AS rank,
    DENSE_RANK() OVER (ORDER BY view_count DESC) AS dense_rank
FROM pages;
```

### Notes

- Tied values get the same rank
- No gaps in sequence (1, 2, 2, 3, 4)
- Useful when you want consecutive ranks
- Requires ORDER BY

---

## LAG

Access value from a previous row.

### Syntax

```sql
LAG(expression [, offset [, default]]) OVER ( ... ) → same as expression type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Value to retrieve from previous row |
| offset | INT | Number of rows back (default: 1) |
| default | ANY | Default if no previous row exists |

### Return Value

Same type as expression - Value from previous row, or default.

### Examples

```sql
-- Previous row value
SELECT
    title,
    view_count,
    LAG(view_count) OVER (ORDER BY __created_at) AS prev_views
FROM pages;

-- View count change
SELECT
    title,
    view_count,
    view_count - LAG(view_count) OVER (ORDER BY __created_at) AS view_change
FROM pages;

-- With partition
SELECT
    category,
    title,
    view_count,
    LAG(view_count) OVER (PARTITION BY category ORDER BY __created_at) AS prev_in_category
FROM pages;

-- With offset and default
SELECT
    title,
    LAG(title, 2, 'N/A') OVER (ORDER BY __created_at) AS two_rows_back
FROM pages;
```

### Notes

- Default offset is 1
- Returns NULL (or default) for first row
- Useful for calculating differences
- Can access multiple rows back

---

## LEAD

Access value from a following row.

### Syntax

```sql
LEAD(expression [, offset [, default]]) OVER ( ... ) → same as expression type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Value to retrieve from following row |
| offset | INT | Number of rows forward (default: 1) |
| default | ANY | Default if no following row exists |

### Return Value

Same type as expression - Value from following row, or default.

### Examples

```sql
-- Next row value
SELECT
    title,
    view_count,
    LEAD(view_count) OVER (ORDER BY __created_at) AS next_views
FROM pages;

-- Compare with next
SELECT
    title,
    view_count,
    LEAD(view_count) OVER (ORDER BY __created_at) - view_count AS diff_to_next
FROM pages;

-- With partition
SELECT
    category,
    title,
    LEAD(title) OVER (PARTITION BY category ORDER BY __created_at) AS next_in_category
FROM pages;
```

### Notes

- Default offset is 1
- Returns NULL (or default) for last row
- Useful for comparing with future values
- Can access multiple rows forward

---

## FIRST_VALUE

Return the first value in the window frame.

### Syntax

```sql
FIRST_VALUE(expression) OVER ( ... ) → same as expression type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Value to retrieve |

### Return Value

Same type as expression - First value in window frame.

### Examples

```sql
-- First value in partition
SELECT
    category,
    title,
    view_count,
    FIRST_VALUE(title) OVER (PARTITION BY category ORDER BY view_count DESC) AS top_page
FROM pages;

-- Compare to first
SELECT
    title,
    view_count,
    view_count - FIRST_VALUE(view_count) OVER (ORDER BY view_count DESC) AS diff_from_top
FROM pages;
```

### Notes

- Returns first value based on ORDER BY
- Affected by frame clause
- Useful for comparison with baseline

---

## LAST_VALUE

Return the last value in the window frame.

### Syntax

```sql
LAST_VALUE(expression) OVER ( ... ) → same as expression type
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | ANY | Value to retrieve |

### Return Value

Same type as expression - Last value in window frame.

### Examples

```sql
-- Last value in partition
SELECT
    category,
    title,
    view_count,
    LAST_VALUE(title) OVER (
        PARTITION BY category
        ORDER BY view_count
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS bottom_page
FROM pages;
```

### Notes

- Returns last value based on ORDER BY
- Default frame may not include all rows
- Use `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` for all rows

---

## Aggregate Functions as Window Functions

Regular aggregate functions can be used with OVER clause.

### Examples

```sql
-- Running total
SELECT
    title,
    view_count,
    SUM(view_count) OVER (ORDER BY __created_at) AS running_total
FROM pages;

-- Moving average
SELECT
    title,
    view_count,
    AVG(view_count) OVER (
        ORDER BY __created_at
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS moving_avg_3
FROM pages;

-- Count in partition
SELECT
    category,
    title,
    COUNT(*) OVER (PARTITION BY category) AS category_count
FROM pages;

-- Max in partition
SELECT
    category,
    title,
    view_count,
    MAX(view_count) OVER (PARTITION BY category) AS max_in_category
FROM pages;
```

---

## PARTITION BY

Divide rows into groups for window function calculation.

### Examples

```sql
-- Rank within each category
SELECT
    category,
    title,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY view_count DESC) AS rank
FROM pages;

-- Multiple partitions
SELECT
    category,
    status,
    title,
    ROW_NUMBER() OVER (PARTITION BY category, status ORDER BY __created_at) AS num
FROM pages;
```

### Notes

- Similar to GROUP BY but doesn't collapse rows
- Each partition processed independently
- Can partition by multiple columns

---

## ORDER BY

Define ordering within window frame.

### Examples

```sql
-- Ascending order (default)
SELECT
    title,
    ROW_NUMBER() OVER (ORDER BY __created_at) AS num
FROM pages;

-- Descending order
SELECT
    title,
    ROW_NUMBER() OVER (ORDER BY view_count DESC) AS rank
FROM pages;

-- Multiple columns
SELECT
    title,
    ROW_NUMBER() OVER (ORDER BY category ASC, view_count DESC) AS num
FROM pages;
```

---

## Window Frames

Define which rows are included in window calculations.

### Frame Syntax

```sql
{ ROWS | RANGE } BETWEEN frame_start AND frame_end
```

### Frame Bounds

- `UNBOUNDED PRECEDING` - From partition start
- `N PRECEDING` - N rows before current
- `CURRENT ROW` - Current row
- `N FOLLOWING` - N rows after current
- `UNBOUNDED FOLLOWING` - To partition end

### Examples

```sql
-- Last 3 rows including current
SELECT
    title,
    view_count,
    AVG(view_count) OVER (
        ORDER BY __created_at
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS moving_avg
FROM pages;

-- All rows from start to current
SELECT
    title,
    view_count,
    SUM(view_count) OVER (
        ORDER BY __created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_sum
FROM pages;

-- Centered window
SELECT
    title,
    view_count,
    AVG(view_count) OVER (
        ORDER BY __created_at
        ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
    ) AS centered_avg
FROM pages;
```

---

## Complete Examples

### Top N Per Group

```sql
-- Top 5 pages per category
SELECT * FROM (
    SELECT
        category,
        title,
        view_count,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY view_count DESC) AS rn
    FROM pages
) ranked
WHERE rn <= 5;
```

### Running Totals

```sql
-- Cumulative view count over time
SELECT
    __created_at,
    title,
    view_count,
    SUM(view_count) OVER (ORDER BY __created_at) AS cumulative_views
FROM pages
ORDER BY __created_at;
```

### Percentile Analysis

```sql
-- Quartile ranking
SELECT
    title,
    view_count,
    NTILE(4) OVER (ORDER BY view_count) AS quartile
FROM pages;
```

### Gap Analysis

```sql
-- Find gaps in sequence
SELECT
    title,
    __created_at,
    LAG(__created_at) OVER (ORDER BY __created_at) AS prev_created,
    __created_at - LAG(__created_at) OVER (ORDER BY __created_at) AS time_gap
FROM pages;
```

### Moving Averages

```sql
-- 7-day moving average
SELECT
    DATE(__created_at) AS date,
    COUNT(*) AS daily_count,
    AVG(COUNT(*)) OVER (
        ORDER BY DATE(__created_at)
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7day
FROM pages
WHERE __created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date;
```

---

## Notes

- Window functions do not reduce the number of rows
- Can combine multiple window functions in single query
- PARTITION BY is optional (processes all rows as one partition)
- ORDER BY affects ranking and frame calculations
- Frame clause is optional (defaults vary by function)
- Window functions execute after WHERE, GROUP BY, HAVING
- Cannot be used in WHERE clause (use subquery instead)
