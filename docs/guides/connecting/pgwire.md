---
sidebar_position: 1
---

# PostgreSQL Wire Protocol

Connect to RaisinDB using any PostgreSQL client through the pgwire protocol.

## Overview

RaisinDB implements the PostgreSQL wire protocol, allowing you to use familiar PostgreSQL tools:
- `psql` command-line client
- GUI tools like pgAdmin, DBeaver, DataGrip
- PostgreSQL drivers in any language
- ORMs like Prisma, TypeORM, SQLAlchemy

## Connection Details

- **Host**: `localhost` (or your server address)
- **Port**: `5432` (default pgwire port)
- **Database**: `{tenant}/{repository}` format
- **Username**: Your RaisinDB username
- **Password**: Your RaisinDB password

## Using psql

### Basic Connection

```bash
psql -h localhost -p 5432 -U admin -d default/myapp
```

You'll be prompted for the password.

### Connection String

```bash
psql "postgresql://admin:password@localhost:5432/default/myapp"
```

### Setting Default Database

Create a `.pgpass` file in your home directory:

```bash
# ~/.pgpass
localhost:5432:default/myapp:admin:your-password
```

Make it secure:

```bash
chmod 600 ~/.pgpass
```

Now connect without password prompt:

```bash
psql -h localhost -d default/myapp -U admin
```

## Querying Data

### Standard SQL

RaisinDB supports standard SQL queries on nodes:

```sql
-- List all nodes
SELECT * FROM nodes LIMIT 10;

-- Filter by node type
SELECT * FROM nodes WHERE node_type = 'Article';

-- Query properties (JSONB column)
SELECT id, path, properties->>'title' as title
FROM nodes
WHERE node_type = 'Article'
  AND properties->>'status' = 'published';

-- Full-text search
SELECT * FROM nodes
WHERE properties->>'content' LIKE '%raisindb%';

-- Order and limit
SELECT path, properties->>'title' as title
FROM nodes
WHERE node_type = 'Article'
ORDER BY created_at DESC
LIMIT 20;
```

### Graph Queries

RaisinDB extends SQL with graph traversal functions:

```sql
-- Get all related nodes
SELECT * FROM get_related_nodes('node-id-123');

-- Get relationships
SELECT * FROM get_relationships('node-id-123');

-- Traverse hierarchy
SELECT * FROM get_descendants('/content/articles', 3);
```

### Working with Workspaces

Specify workspace in your queries:

```sql
-- Use workspace context
SET search_path TO content;

-- Query specific workspace
SELECT * FROM content.nodes WHERE node_type = 'Page';

-- Cross-workspace query
SELECT c.*, p.*
FROM content.nodes c
LEFT JOIN products.nodes p
  ON c.properties->>'product_id' = p.id;
```

## GUI Client Configuration

### DBeaver

1. Create new connection
2. Select PostgreSQL
3. Enter connection details:
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Database**: `default/myapp`
   - **Username**: `admin`
   - **Password**: your password
4. Test connection

### DataGrip

1. New Data Source → PostgreSQL
2. Configure:
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Database**: `default/myapp`
   - **User**: `admin`
   - **Password**: your password
3. Click "Test Connection"

### pgAdmin

1. Add New Server
2. General tab:
   - **Name**: RaisinDB Local
3. Connection tab:
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Maintenance database**: `default/myapp`
   - **Username**: `admin`
   - **Password**: your password

## Programming Languages

### Node.js (pg library)

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'default/myapp',
  user: 'admin',
  password: 'your-password'
});

await client.connect();

// Execute query
const result = await client.query(
  'SELECT * FROM nodes WHERE node_type = $1 LIMIT $2',
  ['Article', 10]
);

console.log(result.rows);

await client.end();
```

### Python (psycopg2)

```python
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="default/myapp",
    user="admin",
    password="your-password"
)

cur = conn.cursor()

# Execute query
cur.execute("""
    SELECT * FROM nodes
    WHERE node_type = %s
    LIMIT %s
""", ('Article', 10))

rows = cur.fetchall()
for row in rows:
    print(row)

cur.close()
conn.close()
```

### Go (pgx)

```go
package main

import (
    "context"
    "fmt"
    "github.com/jackc/pgx/v5"
)

func main() {
    conn, err := pgx.Connect(context.Background(),
        "postgres://admin:password@localhost:5432/default/myapp")
    if err != nil {
        panic(err)
    }
    defer conn.Close(context.Background())

    // Execute query
    rows, err := conn.Query(context.Background(),
        "SELECT * FROM nodes WHERE node_type = $1 LIMIT $2",
        "Article", 10)
    if err != nil {
        panic(err)
    }
    defer rows.Close()

    for rows.Next() {
        // Process rows
    }
}
```

### Java (JDBC)

```java
import java.sql.*;

public class RaisinDBExample {
    public static void main(String[] args) throws Exception {
        String url = "jdbc:postgresql://localhost:5432/default/myapp";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "your-password");

        try (Connection conn = DriverManager.getConnection(url, props)) {
            String sql = "SELECT * FROM nodes WHERE node_type = ? LIMIT ?";
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setString(1, "Article");
                stmt.setInt(2, 10);

                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        System.out.println(rs.getString("path"));
                    }
                }
            }
        }
    }
}
```

## ORM Integration

### Prisma

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = "postgresql://admin:password@localhost:5432/default/myapp"
}

generator client {
  provider = "prisma-client-js"
}

model Node {
  id         String   @id
  node_type  String
  path       String   @unique
  properties Json
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  @@map("nodes")
}
```

### TypeORM

```typescript
import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('nodes')
export class Node {
  @PrimaryColumn()
  id: string;

  @Column()
  node_type: string;

  @Column()
  path: string;

  @Column('jsonb')
  properties: Record<string, any>;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}

// Connection
const connection = await createConnection({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'your-password',
  database: 'default/myapp',
  entities: [Node]
});
```

## Advanced Features

### Prepared Statements

```sql
-- Create prepared statement
PREPARE get_articles AS
  SELECT * FROM nodes
  WHERE node_type = 'Article'
    AND properties->>'status' = $1
  LIMIT $2;

-- Execute prepared statement
EXECUTE get_articles('published', 10);

-- Deallocate
DEALLOCATE get_articles;
```

### Transactions

```sql
BEGIN;

UPDATE nodes
SET properties = jsonb_set(properties, '{status}', '"published"')
WHERE id = 'node-123';

INSERT INTO nodes (node_type, path, properties)
VALUES ('Comment', '/comments/c1', '{"text": "Great article!"}');

COMMIT;
```

### Cursors for Large Results

```sql
BEGIN;

DECLARE article_cursor CURSOR FOR
  SELECT * FROM nodes WHERE node_type = 'Article';

FETCH 100 FROM article_cursor;
FETCH 100 FROM article_cursor;

CLOSE article_cursor;
COMMIT;
```

## Authentication

### Password Authentication

The default method. Provide username and password:

```bash
psql -h localhost -d default/myapp -U admin
# Enter password when prompted
```

### API Key Authentication

Use an API key as the password:

```bash
psql -h localhost -d default/myapp -U admin
# When prompted for password, enter your API key
```

## Limitations

While RaisinDB supports the PostgreSQL protocol, some PostgreSQL features are not available:

**Not Supported:**
- User-defined functions (UDFs) via SQL
- Triggers via SQL (use RaisinDB Functions instead)
- Custom aggregates
- Foreign data wrappers
- PL/pgSQL procedural language

**Use RaisinDB Features Instead:**
- Serverless Functions for custom logic
- Event subscriptions for triggers
- HTTP API for advanced operations

## Troubleshooting

### Connection Refused

Check if pgwire is enabled:

```bash
curl http://localhost:8080/health
```

Verify port in configuration:

```toml
[server]
pgwire_port = 5432
```

### Authentication Failed

Ensure credentials are correct:

```bash
# Test HTTP authentication first
curl -u admin:password http://localhost:8080/api/repositories
```

### Database Does Not Exist

The database name must be in `{tenant}/{repository}` format:

```bash
# Correct
psql -h localhost -d default/myapp -U admin

# Incorrect
psql -h localhost -d myapp -U admin
```

### Query Performance

Add indexes for frequently queried properties:

```sql
CREATE INDEX idx_article_status
ON nodes ((properties->>'status'))
WHERE node_type = 'Article';
```

## Next Steps

- [Use the HTTP API](./http-api.md) for advanced operations
- [Install the JavaScript client](./javascript-client.md) for application development
- [Learn SQL basics](../querying/sql-basics.md) for RaisinDB
