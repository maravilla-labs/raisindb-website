---
sidebar_position: 1
---

# String Functions

String manipulation and utility functions.

## UPPER

Convert text to uppercase.

### Syntax

```sql
UPPER(text) → TEXT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| text | TEXT | Input string |

### Return Value

TEXT - Input string converted to uppercase.

### Examples

```sql
SELECT UPPER('hello world');
-- Result: 'HELLO WORLD'

SELECT UPPER(title) FROM pages;

SELECT UPPER(status) AS status_upper FROM nodes;
```

### Notes

- Returns NULL if input is NULL
- Uses Unicode case mapping
- Handles multi-byte UTF-8 characters correctly

---

## LOWER

Convert text to lowercase.

### Syntax

```sql
LOWER(text) → TEXT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| text | TEXT | Input string |

### Return Value

TEXT - Input string converted to lowercase.

### Examples

```sql
SELECT LOWER('HELLO WORLD');
-- Result: 'hello world'

SELECT LOWER(title) FROM pages;

SELECT slug, LOWER(slug) AS normalized FROM pages;
```

### Notes

- Returns NULL if input is NULL
- Uses Unicode case mapping
- Handles multi-byte UTF-8 characters correctly

---

## LENGTH

Return the number of characters in a text string.

### Syntax

```sql
LENGTH(text) → INT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| text | TEXT | Input string |

### Return Value

INT - Number of characters in the string.

### Examples

```sql
SELECT LENGTH('hello');
-- Result: 5

SELECT LENGTH('');
-- Result: 0

SELECT title, LENGTH(title) AS title_length
FROM pages
ORDER BY title_length DESC;

-- Filter by length
SELECT * FROM codes
WHERE LENGTH(code) = 6;
```

### Notes

- Returns NULL if input is NULL
- Counts characters, not bytes (handles multi-byte UTF-8 correctly)
- Empty string returns 0

---

## COALESCE

Return the first non-NULL argument.

### Syntax

```sql
COALESCE(value1, value2 [, ...]) → ANY
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| value1, value2, ... | ANY | Values to check for NULL |

### Return Value

Returns the type of the first non-NULL argument.

### Examples

```sql
SELECT COALESCE(NULL, 'default', 'other');
-- Result: 'default'

SELECT COALESCE(description, summary, 'No content') FROM pages;

SELECT
    title,
    COALESCE(author, 'Anonymous') AS author
FROM articles;

SELECT
    name,
    COALESCE(price, 0.0) AS price
FROM products;
```

### Notes

- Returns NULL if all arguments are NULL
- All arguments must be compatible types
- Commonly used for default values
- Type coercion follows common type rules

---

## NULLIF

Return NULL if two expressions are equal, otherwise return the first expression.

### Syntax

```sql
NULLIF(value1, value2) → ANY
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| value1 | ANY | First value |
| value2 | ANY | Second value to compare |

### Return Value

Returns NULL if value1 equals value2, otherwise returns value1.

### Examples

```sql
SELECT NULLIF('hello', 'hello');
-- Result: NULL

SELECT NULLIF('hello', 'world');
-- Result: 'hello'

-- Convert empty strings to NULL
SELECT NULLIF(description, '') FROM pages;

-- Avoid division by zero
SELECT total / NULLIF(count, 0) AS average FROM stats;

SELECT
    title,
    NULLIF(status, 'unknown') AS status
FROM pages;
```

### Notes

- Returns NULL if both values are NULL
- Both arguments must be compatible types
- Useful for converting specific values to NULL
- Commonly used to prevent division by zero

---

## String Concatenation

Concatenate strings using the `||` operator.

### Syntax

```sql
text1 || text2 → TEXT
```

### Examples

```sql
SELECT 'Hello' || ' ' || 'World';
-- Result: 'Hello World'

SELECT title || ' - ' || author FROM articles;

SELECT
    first_name || ' ' || last_name AS full_name
FROM users;

-- NULL concatenation returns NULL
SELECT 'Hello' || NULL || 'World';
-- Result: NULL

-- Use COALESCE to handle NULLs
SELECT 'Hello' || COALESCE(middle_name || ' ', '') || 'World';
```

### Notes

- NULL concatenated with any string results in NULL
- Use COALESCE to handle NULL values in concatenation
- All operands are converted to TEXT

---

## Pattern Matching with LIKE

Match text patterns using wildcards.

### Syntax

```sql
text LIKE pattern → BOOLEAN
```

### Wildcards

- `%` - Matches any sequence of characters (including empty)
- `_` - Matches exactly one character

### Examples

```sql
-- Starts with 'Guide'
SELECT * FROM pages WHERE title LIKE 'Guide%';

-- Ends with 'Tutorial'
SELECT * FROM pages WHERE title LIKE '%Tutorial';

-- Contains 'Database'
SELECT * FROM pages WHERE title LIKE '%Database%';

-- Exactly 5 characters
SELECT * FROM codes WHERE code LIKE '_____';

-- Starts with 'A' and ends with 'Z'
SELECT * FROM words WHERE word LIKE 'A%Z';

-- Second character is 'a'
SELECT * FROM names WHERE name LIKE '_a%';
```

### Notes

- Case-sensitive by default
- Use UPPER/LOWER for case-insensitive matching:
  ```sql
  WHERE UPPER(title) LIKE UPPER('%guide%')
  ```
- For complex patterns, consider full-text search
- Patterns starting with `%` cannot use indexes efficiently

---

## Examples

### Case Normalization

```sql
-- Normalize status values
SELECT
    __id,
    UPPER(status) AS normalized_status
FROM pages
WHERE LOWER(status) IN ('draft', 'published', 'archived');
```

### Default Values

```sql
-- Provide defaults for missing data
SELECT
    title,
    COALESCE(author, 'Unknown Author') AS author,
    COALESCE(description, excerpt, 'No description') AS description
FROM articles;
```

### Clean Empty Strings

```sql
-- Convert empty strings to NULL
UPDATE pages
SET
    description = NULLIF(description, ''),
    summary = NULLIF(summary, '');
```

### Build Full Names

```sql
-- Concatenate name parts with proper spacing
SELECT
    COALESCE(
        first_name || ' ' || NULLIF(middle_name, '') || ' ' || last_name,
        first_name || ' ' || last_name
    ) AS full_name
FROM users;
```

### Search with Patterns

```sql
-- Find pages with 'SQL' in title
SELECT title, slug
FROM pages
WHERE UPPER(title) LIKE '%SQL%'
ORDER BY title;
```

### Conditional String Building

```sql
-- Build display name with optional prefix
SELECT
    COALESCE(
        NULLIF(prefix, '') || ' ' || name,
        name
    ) AS display_name
FROM contacts;
```
