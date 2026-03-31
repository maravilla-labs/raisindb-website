---
sidebar_position: 2
---

# Data Types

RaisinDB supports a comprehensive set of SQL data types for various use cases.

## Numeric Types

### INT

32-bit signed integer.

**Range:** -2,147,483,648 to 2,147,483,647

**Examples:**
```sql
CREATE NODETYPE product (
    stock INT,
    priority INT DEFAULT 0
);

INSERT INTO product (stock) VALUES (100);
SELECT * FROM product WHERE stock > 50;
```

---

### BIGINT

64-bit signed integer.

**Range:** -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807

**Examples:**
```sql
CREATE NODETYPE stats (
    total_views BIGINT,
    user_count BIGINT
);

INSERT INTO stats (total_views) VALUES (10000000000);
```

---

### DOUBLE

64-bit floating-point number.

**Precision:** ~15 decimal digits

**Examples:**
```sql
CREATE NODETYPE product (
    price DOUBLE,
    weight_kg DOUBLE
);

INSERT INTO product (price) VALUES (99.99);
SELECT * FROM product WHERE price > 50.0;
```

**Notes:**
- Use for decimal numbers
- Subject to floating-point precision limitations
- For exact decimal arithmetic, store as integers (cents instead of dollars)
- `NUMERIC` and `DECIMAL` are accepted as type aliases but convert to DOUBLE internally

---

## Text Types

### TEXT

Variable-length UTF-8 string.

**Examples:**
```sql
CREATE NODETYPE page (
    title TEXT NOT NULL,
    content TEXT,
    description TEXT
);

INSERT INTO page (title, content)
VALUES ('Welcome', 'Hello world');

SELECT * FROM page WHERE title LIKE '%Guide%';
```

**Notes:**
- No length limit
- UTF-8 encoded
- Case-sensitive comparisons

---

### UUID

Universally Unique Identifier stored as text.

**Format:** `550e8400-e29b-41d4-a716-446655440000`

**Examples:**
```sql
CREATE NODETYPE user (
    external_id UUID,
    name TEXT
);

INSERT INTO user (external_id, name)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'John');

SELECT * FROM user
WHERE external_id = '550e8400-e29b-41d4-a716-446655440000';
```

**Notes:**
- Stored as 36-character string with hyphens
- System `__id` column is UUID type
- Can be generated externally or auto-generated

---

## Boolean Type

### BOOLEAN

Logical true/false value.

**Values:** `true`, `false`, `NULL`

**Examples:**
```sql
CREATE NODETYPE product (
    name TEXT,
    active BOOLEAN DEFAULT true,
    featured BOOLEAN
);

INSERT INTO product (name, active) VALUES ('Widget', true);
SELECT * FROM product WHERE active = true;
SELECT * FROM product WHERE featured IS NULL;
```

**Notes:**
- Three-valued logic (true, false, NULL)
- Use `IS NULL` / `IS NOT NULL` to check for NULL

---

## Temporal Types

### TIMESTAMPTZ

Timestamp with timezone, stored in UTC.

**Format:** ISO 8601 with timezone

**Examples:**
```sql
CREATE NODETYPE event (
    name TEXT,
    event_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO event (name, event_time)
VALUES ('Launch', '2024-01-15T10:00:00Z');

SELECT * FROM event
WHERE event_time > NOW() - INTERVAL '7 days';
```

**Notes:**
- Always stored in UTC
- Microsecond precision
- System columns `__created_at` and `__updated_at` are TIMESTAMPTZ

---

### INTERVAL

Time duration or interval.

**Units:** microseconds, milliseconds, seconds, minutes, hours, days, weeks, months, years

**Examples:**
```sql
SELECT NOW() + INTERVAL '1 day';
SELECT NOW() - INTERVAL '7 days';

CREATE NODETYPE task (
    name TEXT,
    duration INTERVAL
);

INSERT INTO task (name, duration)
VALUES ('Backup', INTERVAL '2 hours');
```

**Notes:**
- Used for date/time arithmetic
- Supports various time units
- Can be positive or negative

---

## RaisinDB-Specific Types

### PATH

Hierarchical path for node organization.

**Format:** Unix-style path strings like `/content/blog/post1`

**Examples:**
```sql
-- PATH is automatically managed for __path column
SELECT * FROM nodes WHERE __path = '/content/blog';

SELECT * FROM nodes
WHERE CHILD_OF(__path, '/content/docs');

SELECT * FROM nodes
WHERE DEPTH(__path) = 2;
```

**Notes:**
- Used for hierarchical organization
- Supports path functions (DEPTH, PARENT, ANCESTOR, etc.)
- Always starts with `/`
- System column `__path` is PATH type

---

### JSONB

JSON Binary format for structured data.

**Examples:**
```sql
CREATE NODETYPE product (
    name TEXT,
    metadata JSONB
);

INSERT INTO product (name, metadata)
VALUES (
    'Widget',
    '{"color": "blue", "size": "large", "tags": ["new", "featured"]}'::JSONB
);

SELECT * FROM product
WHERE JSON_VALUE(metadata, '$.color') = 'blue';

UPDATE product
SET metadata = JSONB_SET(metadata, '{price}', '99.99')
WHERE name = 'Widget';
```

**Notes:**
- Binary storage format (more efficient than text JSON)
- Supports JSONPath queries
- Can contain nested objects and arrays
- Use JSON functions for manipulation

---

### GEOMETRY

GeoJSON geometry for spatial data.

**Types:** Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon

**Examples:**
```sql
CREATE NODETYPE location (
    name TEXT,
    point GEOMETRY,
    area GEOMETRY
);

-- Insert point
INSERT INTO location (name, point)
VALUES ('Office', ST_POINT(-122.4194, 37.7749));

-- Insert polygon from GeoJSON
INSERT INTO location (name, area)
VALUES (
    'Service Area',
    ST_GEOMFROMGEOJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-122.5, 37.7],
            [-122.5, 37.8],
            [-122.4, 37.8],
            [-122.4, 37.7],
            [-122.5, 37.7]
        ]]
    }')
);

-- Spatial queries
SELECT * FROM location
WHERE ST_DWITHIN(point, ST_POINT(-122.4194, 37.7749), 5000);
```

**Notes:**
- PostGIS-compatible
- Coordinates in WGS84 (longitude, latitude)
- Use ST_* functions for operations

---

### VECTOR(n)

Fixed-dimension vector for embeddings and similarity search.

**Dimensions:** Specified as VECTOR(n) where n is the dimension count

**Examples:**
```sql
CREATE NODETYPE document (
    title TEXT,
    embedding VECTOR(768)  -- 768-dimensional vector
);

-- Insert vector (example with 3 dimensions)
INSERT INTO document (title, embedding)
VALUES (
    'Example Doc',
    ARRAY[0.1, 0.2, 0.3]::VECTOR(3)
);
```

**Notes:**
- Used for machine learning embeddings
- Dimension must be specified
- Fixed size for all values in column
- Useful for semantic search and similarity

---

## Full-Text Search Types

### TSVECTOR

Full-text search document representation.

**Examples:**
```sql
CREATE NODETYPE article (
    title TEXT,
    content TEXT,
    search_vector TSVECTOR
);

UPDATE article
SET search_vector = TO_TSVECTOR(title || ' ' || content);

SELECT * FROM article
WHERE search_vector @@ TO_TSQUERY('database & query');
```

**Notes:**
- Normalized, stemmed text for searching
- Generated from text using TO_TSVECTOR
- Use with @@ operator for matching

---

### TSQUERY

Full-text search query representation.

**Examples:**
```sql
-- Create query
SELECT TO_TSQUERY('database & query');
SELECT TO_TSQUERY('sql | database');
SELECT TO_TSQUERY('database & !tutorial');

-- Use in search
SELECT * FROM article
WHERE search_vector @@ TO_TSQUERY('database');
```

**Notes:**
- Normalized query with boolean operators
- Supports &, |, ! operators
- Generated from text using TO_TSQUERY

---

## Collection Types

### ARRAY[T]

Array of elements of type T.

**Element Types:** Any base type (INT, TEXT, etc.)

**Examples:**
```sql
CREATE NODETYPE article (
    title TEXT,
    tags ARRAY[TEXT],
    ratings ARRAY[INT]
);

INSERT INTO article (title, tags)
VALUES ('SQL Guide', ARRAY['sql', 'database', 'tutorial']);

SELECT * FROM article WHERE 'sql' = ANY(tags);
```

**Notes:**
- Homogeneous (all elements same type)
- Can be nested: ARRAY[ARRAY[INT]]
- Use ARRAY_AGG to create arrays

---

## Nullable Types

All types can be nullable by default or explicitly marked NOT NULL.

### NULLABLE[T]

Any type with NULL support (default).

**Examples:**
```sql
CREATE NODETYPE page (
    title TEXT NOT NULL,          -- Not nullable
    description TEXT,              -- Nullable (default)
    view_count INT                 -- Nullable (default)
);

-- NULL values
INSERT INTO page (title) VALUES ('Example');  -- description is NULL

SELECT * FROM page WHERE description IS NULL;
SELECT * FROM page WHERE description IS NOT NULL;

-- COALESCE for defaults
SELECT COALESCE(description, 'No description') FROM page;
```

---

## Type Coercion

RaisinDB supports implicit type coercion in some cases:

### Numeric Coercion

```sql
INT → BIGINT → DOUBLE
```

```sql
-- INT to BIGINT
SELECT 42::INT + 1000000000000::BIGINT;  -- Result: BIGINT

-- INT to DOUBLE
SELECT 10::INT / 3::DOUBLE;  -- Result: DOUBLE
```

### Text Coercion

```sql
-- TEXT to PATH (for comparisons)
SELECT * FROM nodes WHERE __path = '/content';  -- String coerced to PATH
```

### Explicit Casting

```sql
-- CAST syntax
SELECT CAST('123' AS INT);
SELECT CAST(NOW() AS TEXT);
SELECT CAST(price AS BIGINT) FROM products;

-- :: syntax (PostgreSQL-style)
SELECT '123'::INT;
SELECT NOW()::TEXT;
SELECT price::BIGINT FROM products;
```

---

## Type Comparison

| Type | Storage Size | Range/Precision | Use Case |
|------|-------------|-----------------|----------|
| INT | 4 bytes | ±2 billion | Counters, IDs |
| BIGINT | 8 bytes | ±9 quintillion | Large numbers |
| DOUBLE | 8 bytes | ~15 digits | Decimals, measurements |
| TEXT | Variable | Unlimited | Strings, text |
| BOOLEAN | 1 byte | true/false/NULL | Flags, conditions |
| TIMESTAMPTZ | 8 bytes | Microsecond | Dates and times |
| PATH | Variable | - | Hierarchy |
| JSONB | Variable | - | Structured data |
| GEOMETRY | Variable | - | Spatial data |
| VECTOR(n) | 4n bytes | n dimensions | Embeddings |
| TSVECTOR | Variable | - | Search documents |

---

## Notes

- Choose the smallest type that fits your data
- Use NOT NULL when values are required
- Use JSONB for flexible schemas
- Use appropriate types for domain (TIMESTAMPTZ for dates, not TEXT)
- Type constraints are enforced at INSERT and UPDATE
- NULL is distinct from empty string or zero
- System pseudo-columns have fixed types (UUID, PATH, TIMESTAMPTZ)
