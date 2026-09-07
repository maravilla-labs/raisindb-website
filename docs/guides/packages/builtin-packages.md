---
sidebar_position: 3
---

# Built-in Packages

The server binary embeds a set of packages. Those marked for auto-install are
installed into every repository when it is created, so a new repository comes
with roles, messaging, relationships and AI agent support out of the box. The
others are registered in each repository's package list and can be installed on
demand.

```bash
raisindb package list --repo myapp
```

```
  Name                          Version     Installed   Status
  ──────────────────────────────────────────────────────────────
  raisin-auth                   1.0.0       ✓           installed
  raisin-relationships          1.0.0       ✓           installed
  raisin-social                 1.0.0       ✓           installed
  raisin-stewardship            1.0.0       ✓           installed
  raisin-messaging              1.0.3       ✓           installed
  ai-tools                      1.0.21      ✓           installed
  raisin-mcp                    1.0.0       ✓           installed
  raisin-mcp-client             1.0.0       ✓           installed
  raisin-integrations           1.0.0       ✓           installed
  google-drive-adapter          1.5.0       -           -
  google-calendar-adapter       1.3.0       -           -
  imap-adapter                  1.7.0       -           -
  ms-graph-adapter              1.17.1      -           -
```

A manifest opts out of auto-install with `auto_install: false`; the package
then shows `-` until someone installs it.

## Auto-installed packages

### raisin-auth

Default roles and the anonymous system user, plus the functions behind magic
links and user provisioning.

- Content in `raisin:access_control`: roles `viewer`, `author`, `editor` under
  `/roles`, and `/users/system/anonymous`. The server itself adds
  `system_admin`, `anonymous` and `authenticated_user`.
- Functions under `/lib/raisin/auth`: `create-user-node`, `send-magic-link`,
  `send-test-email`.

```sql
SELECT path, properties->>'role_id' AS role_id
FROM 'raisin:access_control'
WHERE node_type = 'raisin:Role';
```

```
/roles/editor              editor
/roles/viewer              viewer
/roles/author              author
/roles/system_admin        system_admin
/roles/anonymous           anonymous
/roles/authenticated_user  authenticated_user
```

### raisin-relationships

The `raisin:RelationType` node type and the request/response workflow other
packages build on.

- Triggers `/triggers/raisin/relationships/process-relationship-request` and
  `process-relationship-response`, with Starlark handlers under
  `/lib/raisin/relationships/handlers`.

### raisin-social

Three relation types for social graphs: `friends-with`, `follows` and
`blocks`, installed under `/relation-types` in `raisin:access_control`.

### raisin-stewardship

A delegation model in which a steward acts on behalf of a ward.

- Node types `raisin:StewardshipConfig`, `raisin:EntityCircle`,
  `raisin:StewardshipOverride`.
- Relation types for families (`parent-of`, `child-of`, `guardian-of`,
  `ward-of`, `spouse-of`, `sibling-of`, `grandparent-of`, `grandchild-of`) and
  organisations (`manager-of`, `reports-to`, `assistant-of`, `has-assistant`).
- Functions `is-steward-of`, `get-stewards`, `get-wards` under
  `/lib/raisin/stewardship`, and triggers for ward invitations and stewardship
  requests.
- Configuration at `/config/stewardship`.

```sql
SELECT path FROM 'raisin:access_control'
WHERE DESCENDANT_OF('/relation-types')
ORDER BY path;
```

### raisin-messaging

The inbox/outbox pipeline: chat delivery, task assignment and system
notifications.

- Node types `raisin:Conversation` and `raisin:MessagingConfig`.
- Triggers under `/triggers/raisin/messaging`: `process-chat`,
  `process-agent-chat`, `process-task-assignment`,
  `process-system-notification`.
- Handlers under `/lib/messaging/handlers` and a `/lib/messaging/permissions`
  function.
- Allows `raisin:Conversation`, `raisin:InboxTask` and `raisin:Notification` in
  `raisin:access_control`, and `raisin:Conversation` in `default`.

```sql
SELECT path FROM 'functions'
WHERE node_type = 'raisin:Trigger'
ORDER BY path;
```

### ai-tools

AI agents, plans, tasks and tool calls, together with the `ai` workspace where
agents keep their inbox, outbox, memory and sent folders.

- Node types `raisin:AIAgent`, `raisin:AIPrompt`, `raisin:AIModel`,
  `raisin:AIPlan`, `raisin:AITask`, `raisin:AIThought`, `raisin:AIToolCall`,
  `raisin:AIToolResult`, `raisin:AIToolSingleCallResult`,
  `raisin:AIToolResultAggregator`, `raisin:AICostRecord`,
  `raisin:AICompaction`, `raisin:AgentUserContext`.
- Workspace `ai`, seeded with an `agents` folder and a `sample-assistant`.
- Functions under `/lib/raisin/ai`: `agent-handler`,
  `agent-continue-handler`, `create-plan`, `add-task`, `update-task`,
  `get-plan-status`, `remember`, `read-user-context`, `forget`, `weather`,
  `plan-approval-handler`.
- Triggers `/triggers/raisin/ai/on-user-message` and `on-tool-result`.

```sql
SELECT path, properties->>'title' AS title
FROM 'functions'
WHERE node_type = 'raisin:AIAgent';
```

### raisin-mcp

Lets a repository expose its own tools over the Model Context Protocol.
Provides the `raisin:McpServer` node type and the `mcp` workspace. Each
`raisin:McpServer` node you create there is served at
`/mcp/{repo}/{branch}/{slug}`. No server is shipped by default.

### raisin-mcp-client

The outbound direction: allows `raisin:McpConnection` nodes in the
`raisin:system` workspace. Each connection describes one remote MCP server;
tool discovery creates one `raisin:Function` proxy per remote tool under
`/mcp/{slug}/` in `functions`. The package ships no content, so nothing reaches
the network until you create and enable a connection.

### raisin-integrations

Provider-agnostic support for virtual mounts (connectors). Ships the
`webhook-refresh` function at `/lib/raisin/integrations/webhook-refresh` and
allows `raisin:Integration` and `raisin:VirtualMount` in `raisin:system`.

## Registered but not auto-installed

The provider adapters are heavier and are installed on demand, from the admin
console's Integrations gallery or with the CLI:

```bash
raisindb package install imap-adapter --repo myapp
```

| Package | What it mounts |
|---------|----------------|
| `google-drive-adapter` | A Drive folder as `raisin:Folder` / `raisin:Asset` nodes |
| `google-calendar-adapter` | A calendar as `raisin:Event` nodes (experimental) |
| `imap-adapter` | An IMAP mailbox as ephemeral message nodes, plus an outbox that sends through the tenant's email provider |
| `ms-graph-adapter` | Outlook mail, calendars, OneDrive and SharePoint libraries over Microsoft Graph (preview) |

Each adapter ships its adapter and mapper functions under `/adapters` and
`/mappers` in `functions`, and a disabled `raisin:Integration` template under
`/connectors` in `raisin:system` that you complete with your own OAuth client or
credentials. See [Virtual Nodes](../../concepts/virtual-nodes.md) for how mounts
work.

## Next steps

- [Creating Packages](./creating-packages.md)
- [Installing Packages](./installing-packages.md)
