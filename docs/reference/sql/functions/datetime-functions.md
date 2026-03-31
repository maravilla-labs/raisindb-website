---
sidebar_position: 4
---

# DateTime Functions

Functions for date and time operations.

## NOW

Return the current UTC timestamp.

### Syntax

```sql
NOW() → TIMESTAMPTZ
```

### Return Value

TIMESTAMPTZ - Current timestamp in UTC timezone.

### Examples

```sql
SELECT NOW();
-- Result: '2024-01-15T10:30:45.123Z'

-- Use in INSERT
INSERT INTO events (name, created_at)
VALUES ('User Login', NOW());

-- Use in UPDATE
UPDATE pages
SET last_modified = NOW()
WHERE __id = '550e8400-e29b-41d4-a716-446655440000';

-- Use in WHERE clause
SELECT * FROM events
WHERE event_time < NOW() - INTERVAL '7 days';
```

### Notes

- Always returns UTC time
- Timestamp includes microsecond precision
- Equivalent to CURRENT_TIMESTAMP

---

## CURRENT_TIMESTAMP

Alias for NOW(). Returns current UTC timestamp.

### Syntax

```sql
CURRENT_TIMESTAMP → TIMESTAMPTZ
```

### Return Value

TIMESTAMPTZ - Current timestamp in UTC timezone.

### Examples

```sql
SELECT CURRENT_TIMESTAMP;
-- Result: '2024-01-15T10:30:45.123Z'

-- Same as NOW()
SELECT CURRENT_TIMESTAMP = NOW();
-- Result: true
```

---

## INTERVAL Literals

Represent time durations for date arithmetic.

### Syntax

```sql
INTERVAL 'quantity unit'
```

### Supported Units

- `microseconds`, `milliseconds`, `seconds`, `minutes`, `hours`
- `days`, `weeks`, `months`, `years`

### Examples

```sql
-- Add intervals to timestamps
SELECT NOW() + INTERVAL '1 day';
SELECT NOW() + INTERVAL '2 hours';
SELECT NOW() + INTERVAL '30 minutes';

-- Subtract intervals
SELECT NOW() - INTERVAL '7 days';
SELECT NOW() - INTERVAL '1 month';

-- Use in WHERE clauses
SELECT * FROM events
WHERE event_time > NOW() - INTERVAL '24 hours';

SELECT * FROM pages
WHERE __created_at BETWEEN
    NOW() - INTERVAL '30 days' AND NOW();
```

### Interval Examples

```sql
INTERVAL '1 second'
INTERVAL '5 minutes'
INTERVAL '2 hours'
INTERVAL '1 day'
INTERVAL '7 days'
INTERVAL '1 week'
INTERVAL '1 month'
INTERVAL '1 year'
```

---

## Date Arithmetic

Perform calculations with timestamps and intervals.

### Addition

```sql
timestamp + INTERVAL → TIMESTAMPTZ
```

```sql
SELECT NOW() + INTERVAL '1 day';
SELECT __created_at + INTERVAL '7 days' FROM pages;
```

### Subtraction

```sql
timestamp - INTERVAL → TIMESTAMPTZ
timestamp - timestamp → INTERVAL
```

```sql
SELECT NOW() - INTERVAL '1 hour';
SELECT NOW() - __created_at AS age FROM pages;
```

---

## Timestamp Comparisons

Compare timestamps using standard operators.

### Examples

```sql
-- Greater than
SELECT * FROM events
WHERE event_time > '2024-01-01T00:00:00Z';

-- Less than or equal
SELECT * FROM pages
WHERE __created_at <= NOW() - INTERVAL '30 days';

-- Between range
SELECT * FROM events
WHERE event_time BETWEEN '2024-01-01' AND '2024-12-31';

-- Equal (exact match)
SELECT * FROM events
WHERE DATE(event_time) = '2024-01-15';
```

---

## Examples

### Recent Items Query

```sql
-- Items created in last 7 days
SELECT * FROM pages
WHERE __created_at > NOW() - INTERVAL '7 days'
ORDER BY __created_at DESC;
```

### Age Calculation

```sql
-- Calculate age of records
SELECT
    title,
    __created_at,
    NOW() - __created_at AS age
FROM pages
ORDER BY age DESC;
```

### Time-Based Filtering

```sql
-- Events happening today
SELECT * FROM events
WHERE event_time >= DATE_TRUNC('day', NOW())
  AND event_time < DATE_TRUNC('day', NOW()) + INTERVAL '1 day';

-- Future events only
SELECT * FROM events
WHERE event_time > NOW()
ORDER BY event_time;
```

### Expired Records

```sql
-- Find expired items
SELECT * FROM subscriptions
WHERE end_date < NOW()
  AND status = 'active';
```

### Range Queries

```sql
-- Last 30 days
SELECT * FROM events
WHERE event_time BETWEEN NOW() - INTERVAL '30 days' AND NOW();

-- Specific month
SELECT * FROM events
WHERE event_time BETWEEN '2024-01-01' AND '2024-02-01';
```

### Update Timestamps

```sql
-- Set expiration date
UPDATE sessions
SET expires_at = NOW() + INTERVAL '1 hour'
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

-- Archive old records
UPDATE pages
SET
    status = 'archived',
    archived_at = NOW()
WHERE __updated_at < NOW() - INTERVAL '1 year';
```

### Scheduled Events

```sql
-- Events in next 7 days
SELECT
    name,
    event_time,
    event_time - NOW() AS time_until
FROM events
WHERE event_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY event_time;
```

### Retention Policies

```sql
-- Delete old logs
DELETE FROM logs
WHERE __created_at < NOW() - INTERVAL '90 days';

-- Archive old data
UPDATE documents
SET status = 'archived'
WHERE __updated_at < NOW() - INTERVAL '2 years'
  AND status = 'published';
```

### Time-Series Grouping

```sql
-- Count events by date
SELECT
    DATE(__created_at) AS date,
    COUNT(*) AS event_count
FROM events
WHERE __created_at > NOW() - INTERVAL '30 days'
GROUP BY date
ORDER BY date;
```

### Activity Tracking

```sql
-- Recently active users
SELECT
    user_id,
    MAX(__updated_at) AS last_activity,
    NOW() - MAX(__updated_at) AS inactive_duration
FROM user_sessions
GROUP BY user_id
HAVING MAX(__updated_at) > NOW() - INTERVAL '1 hour';
```

### Conditional Based on Time

```sql
-- Mark as urgent if deadline is near
SELECT
    title,
    deadline,
    CASE
        WHEN deadline < NOW() THEN 'overdue'
        WHEN deadline < NOW() + INTERVAL '1 day' THEN 'urgent'
        WHEN deadline < NOW() + INTERVAL '7 days' THEN 'soon'
        ELSE 'normal'
    END AS priority
FROM tasks
WHERE deadline IS NOT NULL;
```

### Default Timestamps in INSERT

```sql
-- Auto-set creation time
INSERT INTO events (name, event_time, created_at)
VALUES ('System Startup', NOW(), NOW());
```

---

## Notes

- All timestamps are stored in UTC
- INTERVAL arithmetic handles month and year boundaries correctly
- Timestamp comparisons are timezone-aware
- Use ISO 8601 format for timestamp literals: `'2024-01-15T10:30:00Z'`
- System pseudo-columns `__created_at` and `__updated_at` are TIMESTAMPTZ
