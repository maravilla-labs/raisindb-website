---
sidebar_position: 1
---

# PostgreSQL Wire Protocol

Connect to RaisinDB with `psql` or any PostgreSQL driver and run RaisinDB SQL against a repository.

## Overview

RaisinDB speaks the PostgreSQL wire protocol (pgwire), so the tools you already have work:

- the `psql` command-line client
- GUI clients such as DBeaver, DataGrip and pgAdmin
- PostgreSQL drivers in any language (node-postgres, psycopg, pgx, JDBC)

What runs over the connection is RaisinDB SQL, not PostgreSQL SQL: the workspace is the table, properties are JSON, and hierarchy and graph predicates are built in. See the [SQL Reference](../../reference/sql/overview.md).

## Enable the listener

`raisindb server start` enables the listener on port 5432 (`--pgwire-port` to change it). When you run the `raisin-server` binary yourself it is off by default; turn it on in the config file or on the command line:

```toml
[pgwire]
enabled = true
port = 5432
bind_address = "127.0.0.1"
max_connections = 100
```

```bash
raisin-server --pgwire-enabled true --pgwire-port 5432
# with the CLI, a config file's [pgwire] section is what decides:
raisindb server start --config ./raisindb.toml
```

## Connection details

| Setting | Value |
|---------|-------|
| **Host** | the server address |
| **Port** | `5432` (configurable) |
| **Database** | the **repository** name, for example `myapp` |
| **Username** | the **tenant** id, `default` on a single-tenant server |
| **Password** | an **API key** (`raisin_...`) |

The server asks for a cleartext password, so use TLS or a private network when the connection leaves the host.

### Get an API key

Create one from the admin console (Profile, then API Keys) or with the HTTP API:

```bash
curl -s -X POST http://localhost:8080/api/raisindb/me/api-keys \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"psql"}'
# {"key":{...},"token":"raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e"}
```

The admin user that owns the key needs the `pgwire_access` flag. It is off for a freshly created admin; a tenant admin turns it on with:

```bash
curl -s -X PUT http://localhost:8080/api/raisindb/sys/default/admin-users/admin \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"access_flags":{"console_login":true,"cli_access":true,"api_access":true,"pgwire_access":true,"can_impersonate":false}}'
```

Without it the connection fails with `FATAL: User does not have pgwire access permission`. A key from another tenant fails with `Tenant ID mismatch`.

## Using psql

```bash
psql -h localhost -p 5432 -U default -d myapp
# Password: raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e
```

Or as a URI:

```bash
psql "postgresql://default:raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e@localhost:5432/myapp"
```

To skip the prompt, add a line to `~/.pgpass` (`chmod 600`):

```
localhost:5432:myapp:default:raisin_DV2vMEwAg6tuRqDoLbx0z8f2wrupeB4e
```

### A first query

```sql
SELECT path, node_type, properties->>'title' AS title FROM 'content';
```

```
         path          |   node_type   |    title
-----------------------+---------------+-------------
 /articles             | raisin:Folder | Articles
 /articles/hello-world | raisin:Page   | Hello World
(2 rows)
```

## Querying data

```sql
-- filter by type
SELECT id, path FROM 'content' WHERE node_type = 'raisin:Page';

-- JSON properties: ->> yields text; cast the key for a verbatim filter
SELECT path, properties->>'title' AS title
FROM 'content'
WHERE node_type = 'raisin:Page'
  AND properties->>'status'::String = 'published';

-- hierarchy
SELECT path FROM 'content' WHERE CHILD_OF('/articles');
SELECT path FROM 'content' WHERE DESCENDANT_OF('/articles') ORDER BY path;

-- order and limit
SELECT path, properties->>'title' AS title
FROM 'content'
WHERE node_type = 'raisin:Page'
ORDER BY created_at DESC
LIMIT 20;

-- full-text search (query, language, workspace scope)
SELECT path FROM FULLTEXT_SEARCH('raisindb', 'en', workspaces => 'content');
```

Writes work too:

```sql
INSERT INTO 'content' (path, node_type, name, properties)
VALUES ('/articles/second', 'raisin:Page', 'second', '{"title":"Second"}'::jsonb);

UPDATE 'content' SET properties = '{"title":"Second, revised"}'::jsonb
WHERE path = '/articles/second';

DELETE FROM 'content' WHERE path = '/articles/second';
```

Row-level security applies to the key's owner. To run as an application user instead, set their identity token for the session:

```sql
SET app.user = '<identity access token>';
SELECT path FROM 'content';     -- filtered by that user's roles
RESET app.user;
```

### Branches

A connection starts on the repository's default branch. Switch for the session with either form:

```sql
USE BRANCH 'feature-xyz';
SET app.branch = 'feature-xyz';
SHOW CURRENT BRANCH;
```

### Parameters

Bind parameters use the standard `$1, $2, ...` placeholders through the extended query protocol, which is what drivers use. In `psql`:

```
SELECT path FROM 'content' WHERE node_type = $1 \bind 'raisin:Page' \g
```

`PREPARE` / `EXECUTE` statements are not supported; drivers' prepared statements are (they use the protocol, not the statement).

## GUI clients

Use the PostgreSQL connection type and fill in:

- **Host** `localhost`, **Port** `5432`
- **Database** `myapp` (the repository)
- **Username** `default` (the tenant)
- **Password** your API key

Clients that introspect `pg_catalog` at connect time may show errors in their schema browser; `pg_catalog.pg_type` is emulated for driver type lookups, but most other catalog tables are not. Run queries in the SQL editor and disable schema introspection where the client allows it. `psql` meta-commands such as `\dt` and `\d` are affected the same way.

## Drivers

### Node.js (pg)

```javascript
import { Client } from 'pg';

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  user: 'default',
  password: process.env.RAISIN_API_KEY,
});
await client.connect();

const result = await client.query(
  "SELECT path, properties->>'title' AS title FROM 'content' WHERE node_type = $1 LIMIT $2",
  ['raisin:Page', 10],
);
console.log(result.rows);
await client.end();
```

### Python (psycopg)

```python
import psycopg

with psycopg.connect(host="localhost", port=5432, dbname="myapp",
                     user="default", password=os.environ["RAISIN_API_KEY"]) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT path FROM 'content' WHERE node_type = %s LIMIT %s", ("raisin:Page", 10))
        for row in cur.fetchall():
            print(row)
```

### Go (pgx)

```go
conn, err := pgx.Connect(ctx, "postgres://default:"+apiKey+"@localhost:5432/myapp")
rows, err := conn.Query(ctx, "SELECT path FROM 'content' WHERE node_type = $1 LIMIT $2", "raisin:Page", 10)
```

### Java (JDBC)

```java
String url = "jdbc:postgresql://localhost:5432/myapp";
Properties props = new Properties();
props.setProperty("user", "default");
props.setProperty("password", System.getenv("RAISIN_API_KEY"));
try (Connection conn = DriverManager.getConnection(url, props);
     PreparedStatement stmt = conn.prepareStatement("SELECT path FROM 'content' WHERE node_type = ? LIMIT ?")) {
    stmt.setString(1, "raisin:Page");
    stmt.setInt(2, 10);
    try (ResultSet rs = stmt.executeQuery()) {
        while (rs.next()) System.out.println(rs.getString("path"));
    }
}
```

Set the driver's SSL mode to disabled or preferred for a local server; the listener does not negotiate TLS itself.

## What is not available over pgwire

- `PREPARE` / `EXECUTE` / `DEALLOCATE` statements and `DECLARE ... CURSOR`
- ORMs that generate PostgreSQL DDL or rely on `information_schema`; there is no `nodes` table to map an entity to
- User-defined functions, triggers and PL/pgSQL. Use [RaisinDB functions](../functions/creating-functions.md) and triggers instead
- `BEGIN` / `COMMIT` transaction blocks; each statement is applied on its own

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| `connection refused` | pgwire is not enabled (binary default), or bound to another address or port |
| `FATAL: Invalid API key` | The password is not a valid, active API key |
| `FATAL: User does not have pgwire access permission` | The key's admin user lacks `pgwire_access` |
| `FATAL: Tenant ID mismatch` | The username is not the tenant the key belongs to |
| `Table not found: pg_catalog....` | The client ran catalog introspection; run plain queries instead |
| `Permission denied: Cannot create ...` | Row-level security for the current principal denies the write |

Check the listener from the server side:

```bash
raisindb server logs
nc -zv localhost 5432
```

## Next steps

- [SQL basics](../querying/sql-basics.md)
- [HTTP API](./http-api.md) for everything beyond SQL
- [JavaScript client](./javascript-client.md) for application code
