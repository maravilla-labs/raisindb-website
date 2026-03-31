---
sidebar_position: 3
---

# Operators

SQL operators for expressions and comparisons in RaisinDB.

## Comparison Operators

### Equality and Inequality

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equal to | `properties->>'status' = 'published'` |
| `!=` | Not equal to | `properties->>'status' != 'draft'` |
| `<>` | Not equal to (alternative) | `properties->>'status' <> 'draft'` |
| `<` | Less than | `(properties->>'view_count')::int < 100` |
| `<=` | Less than or equal | `(properties->>'view_count')::int <= 100` |
| `>` | Greater than | `(properties->>'view_count')::int > 100` |
| `>=` | Greater than or equal | `(properties->>'view_count')::int >= 100` |

**Examples:**

```sql
SELECT * FROM default WHERE properties->>'status' = 'published';
SELECT * FROM default WHERE (properties->>'view_count')::int > 1000;
SELECT * FROM default WHERE (properties->>'price')::numeric >= 9.99;
SELECT * FROM default WHERE properties->>'status' != 'archived';
```

### IS NULL / IS NOT NULL

Check for NULL values.

| Operator | Description |
|----------|-------------|
| `IS NULL` | Value is NULL |
| `IS NOT NULL` | Value is not NULL |

**Examples:**

```sql
SELECT * FROM default WHERE properties->>'description' IS NULL;
SELECT * FROM default WHERE properties->>'author' IS NOT NULL;
SELECT * FROM default WHERE created_at IS NULL;
```

**Notes:**
- Cannot use `= NULL` or `!= NULL`
- NULL comparisons require IS NULL / IS NOT NULL
- Three-valued logic: true, false, NULL

---

## JSON Operators

Since all node properties are stored in the `properties` JSONB column, JSON operators are used in nearly every query.

### Field Extraction

| Operator | Description | Return Type |
|----------|-------------|-------------|
| `->` | Extract JSON field by key or index | JSONB |
| `->>` | Extract JSON field as text | TEXT |
| `#>` | Extract JSON value at path | JSONB |
| `#>>` | Extract JSON value at path as text | TEXT |

**Examples:**

```sql
-- Extract as JSONB
SELECT properties -> 'tags' FROM default;
SELECT properties -> 'tags' -> 0 FROM default;

-- Extract as text
SELECT properties ->> 'title' FROM default;
SELECT properties -> 'author' ->> 'name' FROM default;

-- Extract at path
SELECT properties #> '{author,address}' FROM default;
SELECT properties #>> '{author,address,city}' FROM default;

-- In WHERE clause
SELECT * FROM default
WHERE properties ->> 'status' = 'published';

-- Nested access
SELECT
    properties -> 'author' ->> 'name' AS author_name,
    properties -> 'author' ->> 'email' AS author_email
FROM default;
```

### Containment and Existence

| Operator | Description | Return Type |
|----------|-------------|-------------|
| `@>` | JSON contains | BOOLEAN |
| `<@` | JSON is contained by | BOOLEAN |
| `?` | Key exists | BOOLEAN |
| `?|` | Any key exists | BOOLEAN |
| `?&` | All keys exist | BOOLEAN |
| `#-` | Delete key/path | JSONB |
| `@?` | JSONPath test | BOOLEAN |

**Examples:**

```sql
-- Containment
SELECT * FROM default
WHERE properties @> '{"color": "blue"}';

SELECT * FROM default
WHERE '{"color": "blue"}' <@ properties;

-- Key existence
SELECT * FROM default
WHERE properties ? 'color';

-- Delete key from JSON
SELECT properties #- '{old_field}' FROM default;

-- JSONPath test
SELECT * FROM default
WHERE properties @? '$.tags[*] ? (@ == "featured")';
```

### JSONB Merge

| Operator | Description | Return Type |
|----------|-------------|-------------|
| `||` | Merge JSONB objects | JSONB |

The `||` operator merges two JSONB objects. Keys in the right operand overwrite keys in the left operand:

```sql
-- Merge properties (used in UPDATE)
UPDATE default
SET properties = properties || '{"status": "published", "featured": true}'
WHERE path = '/content/blog/my-post';
```

---

## Logical Operators

### Boolean Logic

| Operator | Description | Example |
|----------|-------------|---------|
| `AND` | Logical AND | `properties->>'status' = 'published' AND (properties->>'view_count')::int > 100` |
| `OR` | Logical OR | `properties->>'status' = 'published' OR properties->>'status' = 'featured'` |
| `NOT` | Logical NOT | `NOT (properties->>'status' = 'draft')` |

**Examples:**

```sql
-- AND: Both conditions must be true
SELECT * FROM default
WHERE properties->>'status' = 'published'
  AND (properties->>'view_count')::int > 100;

-- OR: At least one condition must be true
SELECT * FROM default
WHERE properties->>'status' = 'draft'
  OR properties->>'status' = 'pending';

-- NOT: Negates condition
SELECT * FROM default
WHERE NOT (properties->>'status' = 'archived');

-- Complex combinations
SELECT * FROM default
WHERE (properties->>'status' = 'published' OR properties->>'status' = 'featured')
  AND (properties->>'view_count')::int > 100
  AND properties->>'category' IS NOT NULL;
```

**Truth Tables:**

AND:
| A | B | A AND B |
|---|---|---------|
| true | true | true |
| true | false | false |
| false | true | false |
| false | false | false |
| NULL | true | NULL |

OR:
| A | B | A OR B |
|---|---|--------|
| true | true | true |
| true | false | true |
| false | true | true |
| false | false | false |
| NULL | false | NULL |

---

## Arithmetic Operators

### Numeric Operations

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `(properties->>'price')::numeric + (properties->>'tax')::numeric` |
| `-` | Subtraction | `(properties->>'stock')::int - (properties->>'sold')::int` |
| `*` | Multiplication | `(properties->>'price')::numeric * (properties->>'quantity')::int` |
| `/` | Division | `(properties->>'total')::numeric / (properties->>'count')::int` |
| `%` | Modulo (remainder) | `(properties->>'value')::int % 10` |

**Examples:**

```sql
-- Addition
SELECT (properties->>'price')::numeric + (properties->>'tax')::numeric AS total_price
FROM default;

-- Multiplication
SELECT (properties->>'price')::numeric * (properties->>'quantity')::int AS line_total
FROM default;

-- Combined
SELECT
    (properties->>'price')::numeric * (properties->>'quantity')::int
    - (properties->>'discount')::numeric AS net_total
FROM default;
```

**Notes:**
- Division by zero returns error
- Use NULLIF to prevent division by zero: `total / NULLIF(count, 0)`
- Integer division truncates: `5 / 2 = 2`
- Use DOUBLE for decimal division: `5.0 / 2.0 = 2.5`

---

## String Operators

### Concatenation

| Operator | Description | Example |
|----------|-------------|---------|
| `||` | String concatenation | `properties->>'first_name' || ' ' || properties->>'last_name'` |

**Examples:**

```sql
-- Concatenate properties
SELECT properties->>'first_name' || ' ' || properties->>'last_name' AS full_name
FROM default;

-- Multiple concatenations
SELECT properties->>'category' || ': ' || properties->>'title' || ' (' || properties->>'status' || ')'
FROM default;

-- With NULL handling
SELECT properties->>'title' || COALESCE(' - ' || properties->>'subtitle', '')
FROM default;
```

**Notes:**
- NULL concatenated with any value results in NULL
- Use COALESCE to handle NULLs: `'Hello' || COALESCE(properties->>'name', 'Guest')`

### Pattern Matching

| Operator | Description | Example |
|----------|-------------|---------|
| `LIKE` | Pattern matching | `properties->>'title' LIKE '%Guide%'` |
| `NOT LIKE` | Negated pattern | `properties->>'title' NOT LIKE 'Draft%'` |

**Wildcards:**
- `%` - Matches zero or more characters
- `_` - Matches exactly one character

**Examples:**

```sql
-- Starts with
SELECT * FROM default WHERE properties->>'title' LIKE 'Guide%';

-- Ends with
SELECT * FROM default WHERE properties->>'title' LIKE '%Tutorial';

-- Contains
SELECT * FROM default WHERE properties->>'title' LIKE '%Database%';

-- NOT LIKE
SELECT * FROM default WHERE properties->>'title' NOT LIKE 'Draft%';
```

**Case-Insensitive Matching:**

```sql
-- Use UPPER or LOWER
SELECT * FROM default
WHERE UPPER(properties->>'title') LIKE UPPER('%guide%');
```

---

## Range Operators

### BETWEEN

Check if value is within a range (inclusive).

| Operator | Description |
|----------|-------------|
| `BETWEEN x AND y` | Value is between x and y (inclusive) |
| `NOT BETWEEN x AND y` | Negated range check |

**Examples:**

```sql
-- Numeric range
SELECT * FROM default
WHERE (properties->>'price')::numeric BETWEEN 10.0 AND 100.0;

-- Date range
SELECT * FROM default
WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31';

-- NOT BETWEEN
SELECT * FROM default
WHERE (properties->>'price')::numeric NOT BETWEEN 50.0 AND 150.0;
```

**Notes:**
- Inclusive of both endpoints
- Equivalent to: `value >= x AND value <= y`
- Works with numbers, dates, strings

### IN

Check if value matches any in a list.

| Operator | Description |
|----------|-------------|
| `IN (list)` | Value equals any in list |
| `NOT IN (list)` | Value not in list |

**Examples:**

```sql
-- Value list
SELECT * FROM default
WHERE properties->>'status' IN ('published', 'featured', 'archived');

-- Subquery
SELECT * FROM default
WHERE properties->>'category_id' IN (
    SELECT id FROM nodes WHERE node_type = 'Category'
      AND properties->>'active' = 'true'
);

-- NOT IN
SELECT * FROM default
WHERE properties->>'status' NOT IN ('draft', 'pending');

-- Single value
SELECT * FROM default WHERE properties->>'status' IN ('published');
```

**Notes:**
- More readable than multiple OR conditions
- Can use subqueries
- Returns false if list is empty
- NULL in list requires special handling

---

## Full-Text Search Operator

### Match Operator

| Operator | Description |
|----------|-------------|
| `@@` | Full-text match |

**Examples:**

```sql
-- Basic match
SELECT * FROM default
WHERE search_vector @@ TO_TSQUERY('database');

-- With ranking
SELECT
    properties->>'title' AS title,
    TS_RANK(search_vector, TO_TSQUERY('database')) AS rank
FROM default
WHERE search_vector @@ TO_TSQUERY('database')
ORDER BY rank DESC;

-- Complex query
SELECT * FROM default
WHERE search_vector @@ TO_TSQUERY('database & query & !tutorial');
```

---

## Vector Operators

### Distance Operators

| Operator | Description | Return Type |
|----------|-------------|-------------|
| `<->` | L2 (Euclidean) distance | DOUBLE |
| `<=>` | Cosine distance | DOUBLE |
| `<#>` | Inner product (negative) | DOUBLE |

**Examples:**

```sql
-- L2 distance for nearest neighbor search
SELECT properties->>'title' AS title, embedding <-> query_embedding AS distance
FROM default
ORDER BY distance
LIMIT 10;

-- Cosine distance
SELECT properties->>'title' AS title, embedding <=> query_embedding AS distance
FROM default
ORDER BY distance
LIMIT 10;
```

---

## Array Operators

### ANY

Check if comparison is true for any array element.

**Examples:**

```sql
-- Value in array
SELECT * FROM default
WHERE 'sql' = ANY(properties->'tags');
```

### ALL

Check if comparison is true for all array elements.

**Examples:**

```sql
-- All elements match
SELECT * FROM default
WHERE 'published' = ALL(properties->'statuses');
```

---

## Operator Precedence

From highest to lowest:

1. `::` (type cast)
2. `[]` (array subscript)
3. `->`, `->>`, `#>`, `#>>` (JSON extraction)
4. `-` (unary minus)
5. `*`, `/`, `%`
6. `+`, `-` (binary)
7. `||` (string/JSONB concatenation/merge)
8. `<->`, `<=>`, `<#>` (vector distance)
9. `@>`, `<@`, `?`, `?|`, `?&`, `#-`, `@?` (JSON containment/existence)
10. `@@` (full-text match)
11. `=`, `<`, `>`, `<=`, `>=`, `<>`, `!=`
12. `IS NULL`, `IS NOT NULL`, `LIKE`, `IN`, `BETWEEN`
13. `NOT`
14. `AND`
15. `OR`

**Examples:**

```sql
-- Without parentheses
SELECT * FROM default
WHERE properties->>'status' = 'published'
  OR properties->>'status' = 'featured'
  AND (properties->>'view_count')::int > 100;
-- Equivalent to:
WHERE properties->>'status' = 'published'
  OR (properties->>'status' = 'featured' AND (properties->>'view_count')::int > 100)

-- With parentheses for clarity
SELECT * FROM default
WHERE (properties->>'status' = 'published' OR properties->>'status' = 'featured')
  AND (properties->>'view_count')::int > 100;

-- Arithmetic precedence
SELECT (properties->>'price')::numeric + (properties->>'tax')::numeric * (properties->>'quantity')::int
FROM default;
-- Equivalent to:
SELECT (properties->>'price')::numeric + ((properties->>'tax')::numeric * (properties->>'quantity')::int)
FROM default;
```

---

## CASE Expression

Conditional expressions (not technically an operator, but commonly used).

### Simple CASE

```sql
SELECT
    properties->>'title' AS title,
    CASE properties->>'status'
        WHEN 'published' THEN 'Live'
        WHEN 'draft' THEN 'In Progress'
        WHEN 'archived' THEN 'Archived'
        ELSE 'Unknown'
    END AS status_label
FROM default;
```

### Searched CASE

```sql
SELECT
    properties->>'title' AS title,
    CASE
        WHEN (properties->>'view_count')::int > 1000 THEN 'Popular'
        WHEN (properties->>'view_count')::int > 100 THEN 'Normal'
        ELSE 'Unpopular'
    END AS popularity
FROM default;
```

---

## Examples

### Complex Filtering

```sql
SELECT * FROM default
WHERE (properties->>'status' = 'published' OR properties->>'status' = 'featured')
  AND (properties->>'view_count')::int BETWEEN 100 AND 10000
  AND created_at > NOW() - INTERVAL '30 days'
  AND properties->>'category_id' IN (
    SELECT id FROM nodes WHERE node_type = 'Category'
      AND properties->>'active' = 'true'
  )
  AND properties->>'title' NOT LIKE 'Draft%'
  AND properties->>'description' IS NOT NULL;
```

### Computed Columns

```sql
SELECT
    properties->>'title' AS title,
    (properties->>'price')::numeric AS price,
    (properties->>'tax')::numeric AS tax,
    (properties->>'price')::numeric + (properties->>'tax')::numeric AS total,
    (properties->>'price')::numeric * 0.9 AS discounted,
    ((properties->>'price')::numeric + (properties->>'tax')::numeric) * (properties->>'quantity')::int AS line_total
FROM default;
```

### String Manipulation

```sql
SELECT
    properties->>'first_name' || ' ' || properties->>'last_name' AS full_name,
    UPPER(properties->>'status') AS status_code,
    properties->>'category' || ': ' || properties->>'title' AS full_title
FROM default;
```

### Conditional Logic

```sql
SELECT
    properties->>'title' AS title,
    (properties->>'view_count')::int AS view_count,
    CASE
        WHEN (properties->>'view_count')::int > 10000 THEN 'viral'
        WHEN (properties->>'view_count')::int > 1000 THEN 'popular'
        WHEN (properties->>'view_count')::int > 100 THEN 'normal'
        ELSE 'low'
    END AS tier,
    CASE
        WHEN properties->>'status' = 'published'
            AND (properties->>'view_count')::int > 1000 THEN 'high'
        WHEN properties->>'status' = 'published' THEN 'normal'
        ELSE 'low'
    END AS priority
FROM default;
```

---

## Notes

- Use parentheses for clarity, especially with AND/OR
- NULL handling is important in all comparisons
- Type coercion applies in comparisons and arithmetic
- LIKE is case-sensitive; use UPPER/LOWER for case-insensitive
- Division by zero causes errors; use NULLIF
- String concatenation with NULL results in NULL
- Properties extracted with `->>` return TEXT; cast with `::type` for numeric comparisons
