---
sidebar_position: 5
---

# DDL Statements

Data Definition Language (DDL) statements define and modify database schema in RaisinDB.

## CREATE NODETYPE

Define a new node type schema.

### Syntax

```sql
CREATE NODETYPE type_name (
    column_name data_type [ DEFAULT default_value ] [ NOT NULL ],
    ...
);
```

### Examples

```sql
-- Simple node type
CREATE NODETYPE page (
    title TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'draft'
);

-- Node type with various data types
CREATE NODETYPE product (
    name TEXT NOT NULL,
    price DOUBLE,
    stock_count INT,
    active BOOLEAN DEFAULT true,
    metadata JSONB
);

-- Node type with hierarchical and spatial data
CREATE NODETYPE store (
    name TEXT NOT NULL,
    address TEXT,
    location GEOMETRY,
    opening_hours JSONB,
    parent_store_path PATH
);
```

### Compound Indexes

Add multi-column indexes to a NodeType for efficient queries on property combinations:

```sql
CREATE NODETYPE 'type_name' (
    PROPERTIES (
        column_name data_type,
        ...
    )
    COMPOUND_INDEX 'index_name' ON (
        column_name [ ASC | DESC ],
        ...
    )
)
```

A NodeType can have multiple compound indexes:

```sql
CREATE NODETYPE 'myapp:Article' (
    PROPERTIES (
        title String NOT NULL,
        category String,
        status String DEFAULT 'draft',
        priority Integer
    )
    COMPOUND_INDEX 'idx_category_status_created' ON (
        category,
        status,
        __created_at DESC
    )
    COMPOUND_INDEX 'idx_status_priority' ON (
        status,
        priority DESC
    )
)
```

**Index columns** can be any property defined on the NodeType, plus these system properties:

| System Column | Type | Description |
|---------------|------|-------------|
| `__node_type` | String | The node's type name |
| `__created_at` | Timestamp | Node creation time |
| `__updated_at` | Timestamp | Last modification time |

**Sort direction** — each column can specify `ASC` (default) or `DESC`. This matters especially for timestamp columns: `__created_at DESC` means newest-first in a forward index scan.

**Column types** are inferred automatically from the property type:

| Property Type | Index Column Type | Encoding |
|---------------|-------------------|----------|
| `TEXT` | String | Lexicographic |
| `INT`, `BIGINT` | Integer | Numeric |
| `BOOLEAN` | Boolean | Binary |
| `__created_at`, `__updated_at` | Timestamp | Direction-aware |

**How the query planner uses them** — the planner matches equality conditions on leading columns, with an optional ORDER BY on the trailing column:

```sql
-- ✅ Uses idx_category_status_created: prefix match + ORDER BY
SELECT * FROM 'default'
WHERE properties->>'category'::String = 'tech'
  AND properties->>'status'::String = 'published'
ORDER BY __created_at DESC
LIMIT 20;

-- ✅ Uses idx_category_status_created: partial prefix
SELECT * FROM 'default'
WHERE properties->>'category'::String = 'tech';

-- ❌ Cannot use index: skips leading column (category)
SELECT * FROM 'default'
WHERE properties->>'status'::String = 'published';
```

When you add a compound index to a NodeType that already has data, RaisinDB automatically schedules a background job to build the index from existing nodes.

## CREATE ARCHETYPE

Define an archetype schema (template for node types).

### Syntax

```sql
CREATE ARCHETYPE archetype_name (
    column_name data_type [ DEFAULT default_value ] [ NOT NULL ],
    ...
);
```

### Examples

```sql
-- Base archetype for content
CREATE ARCHETYPE content (
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    published_at TIMESTAMPTZ
);

-- Archetype with metadata
CREATE ARCHETYPE searchable (
    search_vector TSVECTOR,
    keywords ARRAY[TEXT],
    category TEXT
);
```

## CREATE ELEMENTTYPE

Define an element type (used for array or collection elements).

### Syntax

```sql
CREATE ELEMENTTYPE type_name (
    column_name data_type [ DEFAULT default_value ] [ NOT NULL ],
    ...
);
```

### Examples

```sql
-- Element type for tags
CREATE ELEMENTTYPE tag (
    name TEXT NOT NULL,
    color TEXT,
    description TEXT
);

-- Element type for address
CREATE ELEMENTTYPE address (
    street TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    location GEOMETRY
);
```

## ALTER Statements

Modify existing schema definitions.

### ALTER NODETYPE

```sql
-- Add column
ALTER NODETYPE page
ADD COLUMN author TEXT;

-- Add column with default
ALTER NODETYPE page
ADD COLUMN view_count INT DEFAULT 0;

-- Drop column
ALTER NODETYPE page
DROP COLUMN legacy_field;

-- Modify column type
ALTER NODETYPE page
ALTER COLUMN priority TYPE BIGINT;

-- Set default value
ALTER NODETYPE page
ALTER COLUMN status SET DEFAULT 'draft';

-- Remove default value
ALTER NODETYPE page
ALTER COLUMN status DROP DEFAULT;

-- Set NOT NULL constraint
ALTER NODETYPE page
ALTER COLUMN title SET NOT NULL;

-- Remove NOT NULL constraint
ALTER NODETYPE page
ALTER COLUMN description DROP NOT NULL;
```

### ALTER ARCHETYPE

```sql
-- Add column to archetype
ALTER ARCHETYPE content
ADD COLUMN featured BOOLEAN DEFAULT false;

-- Modify archetype column
ALTER ARCHETYPE content
ALTER COLUMN status TYPE TEXT;
```

### ALTER ELEMENTTYPE

```sql
-- Add column to element type
ALTER ELEMENTTYPE tag
ADD COLUMN priority INT;

-- Modify element type column
ALTER ELEMENTTYPE tag
ALTER COLUMN name SET NOT NULL;
```

## DROP Statements

Remove schema definitions.

### DROP NODETYPE

```sql
-- Drop node type
DROP NODETYPE old_type;

-- Drop if exists (no error if missing)
DROP NODETYPE IF EXISTS temporary_type;
```

### DROP ARCHETYPE

```sql
-- Drop archetype
DROP ARCHETYPE legacy_archetype;

-- Drop if exists
DROP ARCHETYPE IF EXISTS old_archetype;
```

### DROP ELEMENTTYPE

```sql
-- Drop element type
DROP ELEMENTTYPE unused_element;

-- Drop if exists
DROP ELEMENTTYPE IF EXISTS temp_element;
```

## Data Types

Available data types for schema definitions:

### Numeric Types

```sql
INT           -- 32-bit integer
BIGINT        -- 64-bit integer
DOUBLE        -- 64-bit floating point
```

### Text Types

```sql
TEXT          -- UTF-8 string
UUID          -- UUID string
BOOLEAN       -- true/false
```

### Temporal Types

```sql
TIMESTAMPTZ   -- Timestamp with timezone (UTC)
INTERVAL      -- Time interval/duration
```

### RaisinDB-Specific Types

```sql
PATH              -- Hierarchical path
JSONB             -- JSON data
VECTOR(n)         -- n-dimensional vector for embeddings
GEOMETRY          -- GeoJSON geometry (PostGIS compatible)
```

### Full-Text Types

```sql
TSVECTOR      -- Full-text search document
TSQUERY       -- Full-text search query
```

### Collection Types

```sql
ARRAY[T]      -- Array of type T
              -- Example: ARRAY[TEXT], ARRAY[INT]
```

### Nullable Modifier

All types can be nullable (default) or NOT NULL:

```sql
column_name TEXT              -- Nullable
column_name TEXT NOT NULL     -- Not nullable
```

## Constraints

### NOT NULL Constraint

```sql
CREATE NODETYPE page (
    title TEXT NOT NULL,
    content TEXT
);
```

### DEFAULT Values

```sql
CREATE NODETYPE page (
    status TEXT DEFAULT 'draft',
    created_count INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Schema Inheritance

Node types can inherit from archetypes:

```sql
-- Define archetype
CREATE ARCHETYPE content (
    title TEXT NOT NULL,
    status TEXT DEFAULT 'draft'
);

-- Node type inheriting from archetype
CREATE NODETYPE article INHERITS content (
    author TEXT,
    content TEXT,
    category TEXT
);
```

## Examples

### Blog Schema

```sql
-- Base content archetype
CREATE ARCHETYPE content (
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    published_at TIMESTAMPTZ
);

-- Blog post node type
CREATE NODETYPE post INHERITS content (
    author TEXT NOT NULL,
    content TEXT,
    excerpt TEXT,
    tags ARRAY[TEXT],
    view_count INT DEFAULT 0,
    search_vector TSVECTOR
);

-- Category node type
CREATE NODETYPE category (
    name TEXT NOT NULL,
    description TEXT,
    color TEXT
);

-- Tag element type
CREATE ELEMENTTYPE tag (
    name TEXT NOT NULL,
    slug TEXT NOT NULL
);
```

### E-commerce Schema

```sql
-- Product node type
CREATE NODETYPE product (
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    description TEXT,
    price DOUBLE NOT NULL,
    stock INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    metadata JSONB,
    images ARRAY[TEXT]
);

-- Store location node type
CREATE NODETYPE store (
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    location GEOMETRY,
    opening_hours JSONB
);

-- Order node type
CREATE NODETYPE order (
    order_number TEXT NOT NULL,
    customer_id UUID NOT NULL,
    total DOUBLE NOT NULL,
    status TEXT DEFAULT 'pending',
    items JSONB,
    shipping_address JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Document Management Schema

```sql
-- Document archetype
CREATE ARCHETYPE document (
    title TEXT NOT NULL,
    description TEXT,
    file_type TEXT,
    file_size BIGINT,
    search_vector TSVECTOR
);

-- Contract node type
CREATE NODETYPE contract INHERITS document (
    contract_number TEXT NOT NULL,
    party_a TEXT NOT NULL,
    party_b TEXT NOT NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    value DOUBLE,
    metadata JSONB
);

-- Invoice node type
CREATE NODETYPE invoice INHERITS document (
    invoice_number TEXT NOT NULL,
    customer_id UUID NOT NULL,
    amount DOUBLE NOT NULL,
    due_date TIMESTAMPTZ,
    paid BOOLEAN DEFAULT false,
    line_items JSONB
);
```

## Branch DDL

For branch management statements (CREATE BRANCH, ALTER BRANCH, DROP BRANCH, MERGE BRANCH), see [Branch Statements](./branch.md).

## Notes

- Schema changes may require data migration
- Dropping a node type removes all nodes of that type
- ALTER operations may fail if incompatible with existing data
- System pseudo-columns (`__id`, `__path`, etc.) are automatically included
- NOT NULL constraints are validated on INSERT and UPDATE
- DEFAULT values apply only to INSERT when column is omitted
- Type changes may require explicit CAST of existing data
- In RaisinDB, the workspace name is used as the table name in SQL queries
