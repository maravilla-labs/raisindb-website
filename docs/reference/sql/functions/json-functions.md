---
sidebar_position: 2
---

# JSON Functions

Functions for working with JSONB data.

In RaisinDB, all node data is stored in the `properties` JSONB column. These functions operate on JSONB data and are commonly used with the `properties` column when querying nodes.

## JSON_VALUE

Extract a scalar value from JSON using JSONPath.

### Syntax

```sql
JSON_VALUE(json, path) → TEXT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

TEXT - Scalar value as text, or NULL if not found.

### Examples

```sql
SELECT JSON_VALUE('{"name": "John", "age": 30}', '$.name');
-- Result: 'John'

SELECT JSON_VALUE('{"user": {"name": "Alice"}}', '$.user.name');
-- Result: 'Alice'

SELECT JSON_VALUE('{"items": [1, 2, 3]}', '$.items[0]');
-- Result: '1'

SELECT
    properties->>'title' AS title,
    JSON_VALUE(properties, '$.author') AS author
FROM default;
```

### Notes

- Returns NULL if path does not exist
- Extracts scalar values only (strings, numbers, booleans)
- Arrays and objects return NULL
- Result is always TEXT type

---

## JSON_QUERY

Extract a JSON object or array using JSONPath.

### Syntax

```sql
JSON_QUERY(json, path) → JSONB
JSON_QUERY(json, path, wrapper) → JSONB
JSON_QUERY(json, path, wrapper, on_empty, on_error) → JSONB
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |
| wrapper | TEXT | Optional. Wrapping behavior: `'WITHOUT WRAPPER'` (default), `'WITH WRAPPER'` |
| on_empty | TEXT | Optional. Behavior when path is empty |
| on_error | TEXT | Optional. Behavior on error |

### Return Value

JSONB - JSON object or array, or NULL if not found.

### Examples

```sql
SELECT JSON_QUERY('{"user": {"name": "Alice", "age": 30}}', '$.user');
-- Result: '{"name": "Alice", "age": 30}'

SELECT JSON_QUERY('{"items": [1, 2, 3]}', '$.items');
-- Result: '[1, 2, 3]'

SELECT
    properties->>'title' AS title,
    JSON_QUERY(properties, '$.tags') AS tags
FROM default;
```

### Notes

- Returns NULL if path does not exist
- Extracts objects and arrays
- Preserves JSON structure
- Result is JSONB type
- The `wrapper` parameter controls whether scalar results are wrapped in an array

---

## JSON_EXISTS

Check if a JSONPath exists in a JSON document.

### Syntax

```sql
JSON_EXISTS(json, path) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

BOOLEAN - true if path exists, false otherwise.

### Examples

```sql
SELECT JSON_EXISTS('{"name": "John"}', '$.name');
-- Result: true

SELECT JSON_EXISTS('{"name": "John"}', '$.age');
-- Result: false

SELECT * FROM default
WHERE JSON_EXISTS(properties, '$.featured');

SELECT
    properties->>'title' AS title,
    JSON_EXISTS(properties, '$.tags') AS has_tags
FROM default;
```

### Notes

- Returns false if path does not exist
- Returns true even if value is null
- Useful for filtering queries

---

## JSON_GET_TEXT

Extract a text value from JSON.

### Syntax

```sql
JSON_GET_TEXT(json, path) → TEXT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

TEXT - String value, or NULL if not found or not a string.

### Examples

```sql
SELECT JSON_GET_TEXT('{"name": "Alice"}', '$.name');
-- Result: 'Alice'

SELECT
    properties->>'title' AS title,
    JSON_GET_TEXT(properties, '$.author') AS author
FROM default;
```

---

## JSON_GET_INT

Extract an integer value from JSON.

### Syntax

```sql
JSON_GET_INT(json, path) → INT
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

INT - Integer value, or NULL if not found or not a number.

### Examples

```sql
SELECT JSON_GET_INT('{"age": 30}', '$.age');
-- Result: 30

SELECT
    properties->>'name' AS name,
    JSON_GET_INT(properties, '$.priority') AS priority
FROM default;
```

---

## JSON_GET_DOUBLE

Extract a double value from JSON.

### Syntax

```sql
JSON_GET_DOUBLE(json, path) → DOUBLE
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

DOUBLE - Floating-point value, or NULL if not found or not a number.

### Examples

```sql
SELECT JSON_GET_DOUBLE('{"price": 99.99}', '$.price');
-- Result: 99.99

SELECT
    properties->>'name' AS product,
    JSON_GET_DOUBLE(properties, '$.weight') AS weight_kg
FROM default;
```

---

## JSON_GET_BOOL

Extract a boolean value from JSON.

### Syntax

```sql
JSON_GET_BOOL(json, path) → BOOLEAN
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression |

### Return Value

BOOLEAN - Boolean value, or NULL if not found or not a boolean.

### Examples

```sql
SELECT JSON_GET_BOOL('{"active": true}', '$.active');
-- Result: true

SELECT
    properties->>'title' AS title,
    JSON_GET_BOOL(properties, '$.featured') AS featured
FROM default
WHERE JSON_GET_BOOL(properties, '$.featured') = true;
```

---

## TO_JSON

Convert a value to JSON.

### Syntax

```sql
TO_JSON(value) → JSONB
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| value | ANY | Value to convert |

### Return Value

JSONB - JSON representation of the value.

### Examples

```sql
SELECT TO_JSON('hello');
-- Result: '"hello"'

SELECT TO_JSON(42);
-- Result: '42'

SELECT TO_JSON(true);
-- Result: 'true'
```

---

## TO_JSONB

Convert a value to JSONB (alias for TO_JSON).

### Syntax

```sql
TO_JSONB(value) → JSONB
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| value | ANY | Value to convert |

### Return Value

JSONB - JSON representation of the value.

---

## JSONB_SET

Set a value in a JSON document.

### Syntax

```sql
JSONB_SET(json, path, value) → JSONB
JSONB_SET(json, path, value, create_missing) → JSONB
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| json | JSONB | JSON document |
| path | TEXT | JSONPath expression for target |
| value | JSONB | New value to set |
| create_missing | BOOLEAN | Optional. Create intermediate keys if missing (default: true) |

### Return Value

JSONB - Modified JSON document.

### Examples

```sql
SELECT JSONB_SET('{"name": "John"}', '{age}', '30');
-- Result: '{"name": "John", "age": 30}'

SELECT JSONB_SET('{"user": {"name": "Alice"}}', '{user,age}', '25');
-- Result: '{"user": {"name": "Alice", "age": 25}}'

UPDATE default
SET properties = JSONB_SET(properties, '{color}', '"blue"')
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';

-- Update nested value
UPDATE default
SET properties = JSONB_SET(
    properties,
    '{author,name}',
    '"Jane Doe"'
)
WHERE id = '01HQ3K9V5NWCR3KXM2Y7P8G6ZT';
```

### Notes

- Path uses array notation: `{key1,key2,key3}`
- Creates intermediate objects if they don't exist (when `create_missing` is true, which is the default)
- Set `create_missing` to false to only update existing keys
- Value must be valid JSON

---

## JSON Operators

### Extract Field Operator (->)

```sql
json -> key → JSONB
```

Extract JSON field by key, returns JSONB.

```sql
SELECT properties -> 'author' FROM default;

SELECT properties -> 'tags' -> 0 FROM default;
```

### Extract Text Operator (->>)

```sql
json ->> key → TEXT
```

Extract JSON field by key, returns TEXT.

```sql
SELECT properties ->> 'author' FROM default;

SELECT properties -> 'user' ->> 'name' FROM default;
```

---

## Examples

### Filter by JSON Field

```sql
SELECT * FROM default
WHERE JSON_VALUE(properties, '$.category') = 'electronics';

SELECT * FROM default
WHERE JSON_GET_BOOL(properties, '$.featured') = true;
```

### Extract Multiple Fields

```sql
SELECT
    properties->>'title' AS title,
    JSON_VALUE(properties, '$.author') AS author,
    JSON_GET_INT(properties, '$.views') AS views,
    JSON_GET_BOOL(properties, '$.featured') AS featured
FROM default;
```

### Update JSON Fields

```sql
-- Set single field
UPDATE default
SET properties = JSONB_SET(properties, '{stock}', '100')
WHERE properties->>'sku' = 'WIDGET-001';

-- Set multiple fields using merge
UPDATE default
SET properties = properties || '{"color": "blue", "size": "large"}'
WHERE properties->>'category' = 'widgets';
```

### Check JSON Structure

```sql
SELECT
    properties->>'title' AS title,
    JSON_EXISTS(properties, '$.tags') AS has_tags,
    JSON_EXISTS(properties, '$.author') AS has_author
FROM default;
```

### Extract Arrays

```sql
SELECT
    properties->>'title' AS title,
    JSON_QUERY(properties, '$.tags') AS tags
FROM default
WHERE JSON_EXISTS(properties, '$.tags');
```

### Nested JSON Access

```sql
SELECT
    properties->>'name' AS name,
    JSON_VALUE(properties, '$.contact.email') AS email,
    JSON_VALUE(properties, '$.contact.phone') AS phone
FROM default;
```

### Conditional JSON Updates

```sql
UPDATE default
SET properties = CASE
    WHEN (properties->>'view_count')::int > 1000 THEN
        JSONB_SET(properties, '{popular}', 'true')
    ELSE
        properties
END;
```
