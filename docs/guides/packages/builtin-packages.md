---
sidebar_position: 3
---

# Built-in Packages

RaisinDB ships with several built-in packages that provide common application features out of the box. Built-in packages are automatically installed when you create a new repository.

## raisin-auth

Authentication, authorization, and user management.

**What it provides:**
- User account management with email/password authentication
- Role-based access control (RBAC)
- API key generation and validation
- Session management

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `raisin:User` | User account with credentials and profile |
| `raisin:Role` | Named role with permission sets |
| `raisin:ApiKey` | API key for programmatic access |
| `raisin:Session` | Active user session |

**Install:**

```bash
raisindb package install raisin-auth --repo myapp
```

**Usage:**

```sql
-- Find all users
SELECT * FROM 'users'
WHERE node_type = 'raisin:User';

-- Find users with a specific role
SELECT * FROM GRAPH_TABLE (
  users
  MATCH (u:User)-[:HAS_ROLE]->(r:Role)
  WHERE r.properties->>'name'::String = 'admin'
  COLUMNS (u.properties->>'email'::String AS email)
);
```

## raisin-messaging

Conversations, inbox/outbox, and notifications.

**What it provides:**
- Direct messaging between users
- Conversation threads with participants
- Inbox and outbox views
- Notification delivery

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `raisin:Conversation` | Message thread with participants |
| `raisin:Message` | Individual message within a conversation |
| `raisin:Notification` | System or user notification |
| `raisin:Inbox` | User's message inbox |

**Install:**

```bash
raisindb package install raisin-messaging --repo myapp
```

**Usage:**

```sql
-- Get messages in a conversation
SELECT * FROM 'messaging'
WHERE PATH_STARTS_WITH(path, '/conversations/conv-123/messages/')
ORDER BY created_at ASC;

-- Get unread notifications for a user
SELECT * FROM 'messaging'
WHERE node_type = 'raisin:Notification'
  AND properties->>'recipient_id'::String = $1
  AND properties->>'read'::String = 'false'
ORDER BY created_at DESC;
```

## raisin-relationships

Follow/friend graph infrastructure.

**What it provides:**
- Follow/unfollow between users
- Friend request and acceptance workflow
- Follower/following counts
- Social graph traversal

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `raisin:Follow` | Directed follow relationship |
| `raisin:FriendRequest` | Pending friend request |
| `raisin:Friendship` | Confirmed bidirectional friendship |

**Install:**

```bash
raisindb package install raisin-relationships --repo myapp
```

**Usage:**

```sql
-- Find who a user follows
SELECT * FROM NEIGHBORS('/users/jane', 'OUT', 'FOLLOWS');

-- Find mutual friends
SELECT * FROM GRAPH_TABLE (
  users
  MATCH (a:User)-[:FOLLOWS]->(mutual:User)<-[:FOLLOWS]-(b:User)
  WHERE a.path = '/users/jane' AND b.path = '/users/john'
  COLUMNS (mutual.properties->>'name'::String AS mutual_friend)
);
```

## raisin-social

Social features and interactions.

**What it provides:**
- Likes, reactions, and bookmarks
- Comments and replies
- Share/repost functionality
- Activity feed generation

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `raisin:Like` | User like on content |
| `raisin:Comment` | Comment on a node |
| `raisin:Bookmark` | User bookmark |
| `raisin:Share` | Content share/repost |

**Install:**

```bash
raisindb package install raisin-social --repo myapp
```

**Usage:**

```sql
-- Count likes on a post
SELECT COUNT(*) AS like_count
FROM NEIGHBORS('/content/blog/post-1', 'IN', 'LIKES');

-- Get comments on a post
SELECT * FROM 'social'
WHERE node_type = 'raisin:Comment'
  AND properties->>'target_id'::String = $1
ORDER BY created_at ASC;
```

## raisin-stewardship

Delegation system for stewards and wards.

**What it provides:**
- Steward/ward relationships (e.g., parent/child, manager/employee accounts)
- Delegated permissions — stewards can act on behalf of their wards
- Stewardship lifecycle management (create, revoke, transfer)

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `raisin:Stewardship` | Active steward-ward relationship |
| `raisin:StewardshipRequest` | Pending delegation request |

**Install:**

```bash
raisindb package install raisin-stewardship --repo myapp
```

**Usage:**

```sql
-- Find all wards of a steward
SELECT * FROM GRAPH_TABLE (
  users
  MATCH (steward:User)-[:STEWARD_OF]->(ward:User)
  WHERE steward.path = '/users/parent-1'
  COLUMNS (ward.properties->>'name'::String AS ward_name)
);
```

## ai-tools

AI agent handlers, message triggers, and LLM integration.

**What it provides:**
- AI agent node types for defining LLM-powered handlers
- Chat functionality with conversation history
- Message triggers that invoke functions on events
- Integration with configured AI providers

**Key NodeTypes:**

| NodeType | Description |
|----------|-------------|
| `ai:Agent` | AI agent definition with system prompt and tools |
| `ai:Chat` | Chat conversation with AI context |
| `ai:Trigger` | Event-based trigger that invokes a function |

**Dependencies:** Requires `core-functions` package.

**Install:**

```bash
raisindb package install ai-tools --repo myapp
```

**Usage:**

```sql
-- List all AI agents
SELECT * FROM 'functions'
WHERE node_type = 'ai:Agent';

-- Get chat history
SELECT * FROM 'functions'
WHERE PATH_STARTS_WITH(path, '/chats/session-123/')
ORDER BY created_at ASC;
```

## Installing All Built-in Packages

When `builtin: true` is set in a package manifest, it is automatically installed on new repositories. You can also install any package manually:

```bash
# Install a specific built-in package
raisindb package install raisin-auth --repo myapp

# List installed packages
raisindb package list --repo myapp
```

## Next Steps

- [Creating Packages](./creating-packages.md) — Build your own packages
- [Installing Packages](./installing-packages.md) — Manage package lifecycle
- [Sync and Watch](./sync-and-watch.md) — Development workflow
