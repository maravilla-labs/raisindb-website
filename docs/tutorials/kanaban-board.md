# Developing a Kanban Board

This is a developer tutorial for building a **Kanban Board** package. You’ll define content schemas (workspace, node types, elements) and then access the data in your app with a loader and a query-by-path function.

## What you’ll build

- A `launchpad` workspace (content “container”)
- A base page node type: `launchpad:Page`
- Reusable element types for composing pages:
  - `launchpad:Hero`
  - `launchpad:FeatureGrid`
  - `launchpad:TextBlock`
  - `launchpad:ListKanbanBoards`
  - `launchpad:KanbanCard`
- A TypeScript page loader and a parameterized SQL query example

## Package structure

Here’s how a typical package is laid out. When you add new content models, you’ll mostly work in `workspaces/`, `nodetypes/`, and `elementtypes/`.

```shell
Package
├── README.md
├── archetypes
│   ├── kanban-board.yaml
│   └── landing-page.yaml
├── content
│   ├── functions
│   │   ├── lib
│   │   │   └── launchpad
│   │   │       └── handle-friendship-request
│   │   │           └── index.js
│   │   └── triggers
│   │       └── on-friendship-request
│   └── launchpad
│       └── launchpad
│           ├── about
│           ├── contact
│           ├── home
│           └── tasks
│               └── sprint-board
├── elementtypes
│   ├── feature-grid.yaml
│   ├── hero.yaml
│   ├── kanban-card.yaml
│   ├── list-kanban-boards.yaml
│   └── text-block.yaml
├── manifest.yaml
├── nodetypes
│   └── page.yaml
├── static
│   └── teaser_background.png
└── workspaces
    └── launchpad.yaml
```

### Folder guide (quick)

- `workspaces/`: rules for allowed content types and root structure
- `nodetypes/`: the “document” schemas (pages, boards, etc.)
- `elementtypes/`: reusable blocks rendered by your frontend
- `archetypes/`: templates/scaffolds for generating content quickly
- `content/`: starter content + triggers/functions
- `static/`: package assets (images, icons, etc.)

## 1) Define a workspace

The workspace defines **what can exist**, **where it can exist**, and the initial root skeleton.

**Save as:** `workspaces/launchpad.yaml`

```yaml
name: launchpad
title: Launchpad
description: Content workspace for Launchpad portal
icon: rocket
color: "#6366f1"

allowed_node_types:
  - launchpad:Page
  - raisin:Folder

allowed_root_node_types:
  - raisin:Folder
  - launchpad:Page

root_structure:
  - name: pages
    node_type: raisin:Folder
    title: Pages
    description: Site pages
```

### Why this matters

- `allowed_node_types` makes invalid content impossible to create.
- A predictable `/pages` root keeps routing and querying straightforward.

## 2) Define a page node type

Pages are the canonical “routed documents” your UI will load.

**Save as:** `nodetypes/page.yaml`

```yaml
name: launchpad:Page
title: Page
description: Base page type for Launchpad content
icon: file-text
color: "#6366f1"
version: 1

properties:
  - name: title
    title: Title
    type: String
    required: true
    index:
      - Fulltext
  - name: slug
    title: Slug
    type: String
    required: true
  - name: description
    title: Description
    type: String
    required: false

versionable: true
auditable: true
indexable: true
```

### Developer notes

- Treat `slug` as the stable input for routing.
- Indexing `title` makes search/autocomplete much nicer later.
- Versioning + publishing unlock preview environments and drafts.

## 3) Define element types (page blocks)

Elements are your reusable components. Your frontend will typically render each element type with a corresponding UI component.

### Text block

Use this for long-form content sections.

**Save as:** `elementtypes/text-block.yaml`

```yaml
name: launchpad:TextBlock
title: Text Block
description: Rich text content block
icon: align-left
color: "#10b981"
version: 1

fields:
  - $type: TextField
    name: heading
    title: Heading
    required: false

  - $type: RichTextField
    name: content
    title: Content
    required: true
```

### Hero

Use this for the top-of-page section with a CTA.

**Save as:** `elementtypes/hero.yaml`

```yaml
name: launchpad:Hero
title: Hero Section
description: Full-width hero section with headline, subheadline, and call-to-action
icon: image
color: "#8b5cf6"
version: 1

fields:
  - $type: TextField
    name: headline
    title: Headline
    required: true

  - $type: TextField
    name: subheadline
    title: Subheadline
    required: false

  - $type: TextField
    name: cta_text
    title: CTA Button Text
    required: false

  - $type: TextField
    name: cta_link
    title: CTA Button Link
    description: URL to navigate to when clicked
    required: false

  - $type: TextField
    name: cta_action
    title: CTA Action
    description: Action to trigger (e.g., createBoard). Used instead of cta_link.
    required: false

  - $type: MediaField
    name: background_image
    title: Background Image
    required: false
```

Tip: `cta_action` is a clean way to drive client-side behavior (open modal, start wizard) without baking logic into URLs.

### Feature grid

Use this for a list of feature cards.

**Save as:** `elementtypes/feature-grid.yaml`

```yaml
name: launchpad:FeatureGrid
title: Feature Grid
description: Grid of feature cards with icons and descriptions
icon: grid-3x3
color: "#f59e0b"
version: 1

fields:
  - $type: TextField
    name: heading
    title: Section Heading
    required: false

  - $type: CompositeField
    name: features
    title: Features
    repeatable: true
    fields:
      - $type: TextField
        name: icon
        title: Icon Name
        required: false

      - $type: TextField
        name: title
        title: Feature Title
        required: true

      - $type: TextField
        name: description
        title: Feature Description
        required: true
```

### List Kanban boards

This element is typically rendered as a grid/list of board links.

**Save as:** `elementtypes/list-kanban-boards.yaml`

```yaml
name: launchpad:ListKanbanBoards
title: List Kanban Boards
description: Displays a grid of Kanban board links for navigation
icon: layout-grid
color: "#8b5cf6"
version: 1

fields:
  - $type: TextField
    name: heading
    title: Section Heading
    required: false
```

### Kanban card

This element models a single task card.

**Save as:** `elementtypes/kanban-card.yaml`

```yaml
name: launchpad:KanbanCard
title: Kanban Card
description: A task card for Kanban boards
icon: square-check
color: "#8b5cf6"
version: 1

fields:
  - $type: TextField
    name: title
    title: Card Title
    required: true

  - $type: TextField
    name: description
    title: Card Description
    required: false
  - $type: TextField
    name: note
    title: Note
    required: false
```

## 4) Access the data from your app

Once the schemas exist and content is created, your app needs a consistent way to load a page.

The common flow:

1. map route params → a canonical content `path`
2. fetch the page by path
3. return `{ page }` or a controlled `{ error }`

### Universal loader (TypeScript)

This snippet shows a page loader that maps `params.slug` to a content path and then calls `getPageByPath`.

**Typical location:** your route loader file (e.g., SvelteKit `+page.ts` / `+page.server.ts`).

```ts
import type { PageLoad } from './$types';
import { getPageByPath } from '$lib/raisin';

export const load: PageLoad = async ({ params }) => {
  const slug = params.slug || 'home';
  const path = `/${slug}`;

  try {
    const page = await getPageByPath(path);
    return { page };
  } catch (error) {
    console.error(`Failed to load page: ${path}`, error);
    return {
      page: null,
      error: error instanceof Error ? error.message : 'Page not found'
    };
  }
};
```

### Query-by-path (SQL)

Inside `getPageByPath`, you’ll commonly run a parameterized SQL query to fetch the stored page payload.

**Typical location:** a data access module like `src/lib/raisin.ts`.

```ts
const sql = `
  SELECT properties
  FROM launchpad
  WHERE path = $1
  LIMIT 1
`;

const result = await db.executeSql(sql, [page.path]);
```

What to verify:

- You’re using `$1` parameters (not string concatenation).
- Your `path` format is consistent everywhere (leading slash, etc.).
- Decide and document whether missing pages return `null` or throw.



## Functions (server-side automation)

This section shows how to add **server-side automation** to your package using:

- **Triggers**: declarative configs that say *when* to run something.
- **Functions**: executable code that defines *what* happens.

In the package layout, these live under:

- `content/functions/triggers/` → trigger definitions
- `content/functions/lib/` → function definitions + implementation

The example below isn’t strictly “Kanban” yet—it’s a **friendship request** workflow—but the pattern is exactly the same for Kanban automations (e.g., “when a card is created, assign default status”, “when status moves to Done, stamp completed_at”, etc.).

### 1) Trigger: when an outbox message is created

**File:** `content/functions/triggers/on-friendship-request/.node.yaml`

**What it does:**

- listens for a `Created` node event
- only matches message nodes (`raisin:Message`) in `**/users/**/outbox/*`
- only matches messages that look like a friendship request (`message_type: friendship_request`, `status: pending`)
- dispatches execution to the function at `function_path`

```yaml
node_type: raisin:Trigger
properties:
  title: Process Friendship Request
  name: launchpad-friendship-request
  description: |
    Handles friendship request messages by finding recipient by email
    and creating a message in their inbox.
  enabled: true
  trigger_type: node_event
  config:
    event_kinds:
      - Created
  filters:
    workspaces:
      - "raisin:access_control"
    paths:
      - "**/users/**/outbox/*"
    node_types:
      - raisin:Message
    property_filters:
      message_type: "friendship_request"
      status: "pending"
  priority: 10
  max_retries: 3
  function_path: /lib/launchpad/handle-friendship-request
```

Developer notes:

- Keep your `filters` as specific as possible to avoid accidental executions.
- Treat `max_retries` as part of your error-handling strategy (idempotency matters).
- `function_path` points into `content/functions/lib/...` and should remain stable.

### 2) Function definition: metadata + entrypoint

**Folder:** `content/functions/lib/launchpad/handle-friendship-request/`

This YAML describes how the runtime should execute your function and how it should validate/shape input and output.

**File:** `content/functions/lib/launchpad/handle-friendship-request/.node.yaml`

```yaml
node_type: "raisin:Function"
properties:
  name: "handle-friendship-request"
  title: "Handle Friendship Request"
  description: |
    Processes friendship request messages from user outbox.
    Finds the recipient by email and creates a message in their inbox.
  execution_mode: "async"
  enabled: true
  language: "javascript"
  entry_file: "index.js:handleFriendshipRequest"
  version: 1
  input_schema:
    type: "object"
    description: "Trigger context with event and workspace"
    properties:
      flow_input:
        type: "object"
        properties:
          event:
            type: "object"
            properties:
              type:
                type: "string"
              node_id:
                type: "string"
              node_type:
                type: "string"
              node_path:
                type: "string"
          workspace:
            type: "string"
  output_schema:
    type: "object"
    properties:
      success:
        type: "boolean"
      error:
        type: "string"
      inbox_message_path:
        type: "string"

```

Developer notes:

- `entry_file` should point to `file.js:functionName`.
- Keep schemas small but accurate; they become your contract and doc.
- Prefer returning `{ success: false, error: '...' }` over throwing for known failures.

### 3) Function implementation (JavaScript)

**File:** `content/functions/lib/launchpad/handle-friendship-request/index.js`

This implementation is heavily logged on purpose—when you’re developing triggers, logs are your fastest feedback loop.

Key steps:

1. Load the message node that triggered the event
2. Extract and validate the recipient email
3. Query the access control workspace for the user
4. Create a message in the recipient’s inbox
5. Update the original outbox message to `sent` (or `error`)

```js
/**
 * Handle Friendship Request
 *
 * Triggered when a friendship_request message is created in a user's outbox.
 * Finds the recipient by email and creates a message in their inbox.
 *
 * @param {Object} context - Trigger context
 * @param {Object} context.flow_input - Flow input containing event and workspace
 * @param {Object} context.flow_input.event - Node event details
 * @param {string} context.flow_input.workspace - Workspace where event occurred
 */
async function handleFriendshipRequest(context) {
  const { event, workspace } = context.flow_input;
  const ACCESS_CONTROL = 'raisin:access_control';

  console.log('[friendship] Trigger fired for:', event.node_path);

  // 1. Get the message node from event
  const message = await raisin.nodes.get(workspace, event.node_path);
  if (!message) {
    console.error('[friendship] Message not found:', event.node_path);
    return { success: false, error: 'Message not found' };
  }

  console.log('[friendship] Processing request:', JSON.stringify(message.properties, null, 2));

  // 2. Extract recipient email from message body
  const recipientEmail = message.properties.body?.recipient_email;
  console.log('[friendship] Searching for email:', recipientEmail);
  if (!recipientEmail) {
    console.error('[friendship] No recipient_email in message body');
    return { success: false, error: 'Missing recipient_email' };
  }

  console.log('[friendship] Searching for user in workspace:', ACCESS_CONTROL);

  // 3. Query for user with that email (raisin:User has indexed email property)
  const result = await raisin.sql.query(`
    SELECT id, path, properties FROM '${ACCESS_CONTROL}'
    WHERE node_type = 'raisin:User'
    AND properties->>'email' LIKE $1
  `, [recipientEmail]);

  console.log('[friendship] Query result:', JSON.stringify(result, null, 2));

  // Handle different result formats - could be array or { rows: [] }
  const rows = Array.isArray(result) ? result : (result?.rows || []);

  if (!rows || rows.length === 0) {
    console.log('[friendship] User not found:', recipientEmail);
    // Update original message with error status
    await raisin.nodes.update(workspace, event.node_path, {
      properties: {
        ...message.properties,
        status: 'error',
        error: `User not found: ${recipientEmail}`
      }
    });
    return { success: false, error: 'User not found' };
  }

  const recipient = rows[0];
  console.log('[friendship] Found recipient row:', JSON.stringify(recipient, null, 2));

  const recipientPath = recipient.path;
  if (!recipientPath) {
    console.error('[friendship] Recipient has no path property');
    return { success: false, error: 'Recipient path not found' };
  }

  const recipientInboxPath = `${recipientPath}/inbox`;
  console.log('[friendship] Recipient inbox path:', recipientInboxPath);

  // 4. Create message in recipient's inbox
  try {
    const inboxMessage = await raisin.nodes.create(ACCESS_CONTROL, recipientInboxPath, {
      name: `friend-req-${Date.now()}`,
      node_type: 'raisin:Message',
      properties: {
        message_type: 'friendship_request',
        subject: 'Friendship Request',
        body: {
          sender_email: message.properties.body?.sender_email,
          sender_display_name: message.properties.body?.sender_display_name,
          message: message.properties.body?.message
        },
        sender_id: message.properties.sender_id,
        recipient_id: recipient.id,
        status: 'delivered',
        created_at: new Date().toISOString()
      }
    });
    console.log('[friendship] Created inbox message:', inboxMessage.path);

    // 5. Update original message status to sent and add recipient_id
    await raisin.nodes.update(workspace, event.node_path, {
      properties: {
        ...message.properties,
        status: 'sent',
        recipient_id: recipient.id
      }
    });

    return { success: true, inbox_message_path: inboxMessage.path };

  } catch (err) {
    console.error('[friendship] Failed to create inbox message:', err);
    // Update original message with error
    await raisin.nodes.update(workspace, event.node_path, {
      properties: {
        ...message.properties,
        status: 'error',
        error: err.message || 'Failed to create inbox message'
      }
    });
    return { success: false, error: err.message || 'Failed to create inbox message' };
  }
}

module.exports = {
  handleFriendshipRequest
};

```

### Pitfalls and best practices

- **Idempotency:** triggers may retry. Make sure repeated execution doesn’t create duplicate inbox messages. A common approach is to store a correlation id on the original message and check before creating.
- **Workspace boundaries:** note the function reads from `workspace` (event workspace) but writes into `raisin:access_control`. Make that boundary explicit in your design.
- **Query strictness:** prefer `=` over `LIKE` for exact email matches unless you intentionally want partial matching.
- **Schema drift:** if your `properties.body.recipient_email` shape changes, update both the function and any docs/tests.

## Next steps

- Add a `launchpad:Board` node type and store boards under `/pages/tasks/`.
- Add card `status` and `order` fields for real Kanban columns.
- Add triggers in `content/functions/triggers/` to react to updates.