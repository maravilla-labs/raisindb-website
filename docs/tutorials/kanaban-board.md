# Developing a Kanban Board

This tutorial builds the content model for a Kanban board package. You define a workspace, a page node type, reusable element types and a board archetype, then load the data in your app with a route loader and a query-by-path function. The finished package is the `launchpad` example in the RaisinDB repository under `examples/launchpad/package/`; every file below is taken from it.

## What you'll build

- A `launchpad` workspace (the content container)
- A base page node type: `launchpad:Page`
- Reusable element types for composing pages:
  - `launchpad:Hero`
  - `launchpad:FeatureGrid`
  - `launchpad:TextBlock`
  - `launchpad:ListKanbanBoards`
  - `launchpad:KanbanCard`
- A `launchpad:KanbanBoard` archetype that arranges cards in columns
- A TypeScript page loader and a parameterized SQL query
- A trigger and a function for server-side automation

## Package structure

A package is a directory with a `manifest.yaml`. When you add content models, you mostly work in `workspaces/`, `nodetypes/`, `elementtypes/` and `archetypes/`:

```shell
package
├── manifest.yaml
├── workspaces
│   └── launchpad.yaml
├── nodetypes
│   └── page.yaml
├── elementtypes
│   ├── feature-grid.yaml
│   ├── hero.yaml
│   ├── kanban-card.yaml
│   ├── list-kanban-boards.yaml
│   └── text-block.yaml
├── archetypes
│   ├── kanban-board.yaml
│   └── landing-page.yaml
├── content
│   ├── functions
│   │   ├── lib/launchpad/handle-friendship-request
│   │   │   ├── .node.yaml
│   │   │   └── index.js
│   │   └── triggers/on-friendship-request
│   │       └── .node.yaml
│   └── launchpad
│       └── launchpad
│           ├── home
│           ├── about
│           └── tasks
│               └── sprint-board
└── static
    └── teaser_background.png
```

### Folder guide

- `workspaces/`: allowed content types and the root structure
- `nodetypes/`: the document schemas (pages, boards)
- `elementtypes/`: reusable blocks rendered by your frontend
- `archetypes/`: templates that extend a node type with a specific layout
- `content/`: starter content, plus triggers and functions
- `static/`: package assets (images, icons)

The manifest lists what the package provides:

```yaml
name: launchpad
version: 1.0.25
title: Launchpad
provides:
  nodetypes:
    - launchpad:Page
  archetypes:
    - launchpad:LandingPage
    - launchpad:KanbanBoard
  elementtypes:
    - launchpad:Hero
    - launchpad:TextBlock
    - launchpad:FeatureGrid
    - launchpad:ListKanbanBoards
    - launchpad:KanbanCard
  workspaces:
    - launchpad
```

## 1) Define a workspace

The workspace defines what can exist, where it can exist, and the initial root skeleton.

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

`allowed_node_types` rejects any node of another type at write time, and a predictable root keeps routing and querying straightforward.

## 2) Define a page node type

Pages are the routed documents your UI loads.

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
publishable: true
auditable: true
indexable: true
```

- Treat `slug` as the stable input for routing.
- `index: [Fulltext]` on `title` makes the page findable with `FULLTEXT_SEARCH`.
- `versionable` and `publishable` give you revision history and a publish step; `auditable` writes audit-log entries for changes.

## 3) Define element types (page blocks)

Elements are your reusable components. Your frontend renders each element type with a corresponding UI component. Fields are declared with a `$type`; the ones used here are `TextField`, `RichTextField`, `MediaField` and `CompositeField`.

### Text block

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

`cta_action` is a clean way to drive client-side behavior (open a modal, start a wizard) without encoding logic in URLs.

### Feature grid

A `CompositeField` with `repeatable: true` holds a list of sub-records.

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

Rendered as a grid of board links.

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

A single task card.

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

## 4) Define the board archetype

An archetype extends a node type (`base_node_type`) with a specific layout. The Kanban board is a page whose `columns` field is a repeatable composite, and each column has a `cards` section that only accepts `launchpad:KanbanCard` elements.

**Save as:** `archetypes/kanban-board.yaml`

```yaml
name: launchpad:KanbanBoard
title: Kanban Board
description: A Kanban board page with columns and draggable cards for task management
icon: kanban
color: "#8b5cf6"
base_node_type: launchpad:Page
version: 1

fields:
  - $type: TextField
    name: title
    title: Board Title
    required: true

  - $type: TextField
    name: slug
    title: URL Slug
    required: true

  - $type: TextField
    name: description
    title: Board Description
    required: false

  - $type: CompositeField
    name: columns
    title: Columns
    repeatable: true
    fields:
      - $type: TextField
        name: id
        title: Column ID
        required: true

      - $type: TextField
        name: title
        title: Column Title
        required: true

      - $type: SectionField
        name: cards
        title: Cards
        allowed_element_types:
          - launchpad:KanbanCard

publishable: true
```

A board instance is a `launchpad:Page` node with `archetype: launchpad:KanbanBoard`. Seed content ships in the package as YAML, `content/launchpad/launchpad/tasks/sprint-board/.node.yaml`:

```yaml
node_type: launchpad:Page
archetype: launchpad:KanbanBoard
properties:
  title: Sprint Board
  slug: sprint-board
  description: Current sprint tasks and progress tracking
  columns:
    - id: col-backlog
      title: Backlog
      cards:
        - uuid: card-1
          element_type: launchpad:KanbanCard
          title: Setup project repository
          description: Initialize Git repo and configure CI/CD pipeline
    - id: col-in-progress
      title: In Progress
      cards:
        - uuid: card-4
          element_type: launchpad:KanbanCard
          title: Implement user authentication
          description: Add JWT-based auth with refresh tokens
```

Each element in a section carries a `uuid` and an `element_type`; the remaining keys are the element type's fields.

Deploy the package with the CLI:

```bash
raisindb deploy ./package --repo launchpad --install
```

## 5) Access the data from your app

Once the schemas exist and content is created, your app needs a consistent way to load a page:

1. map route params to a canonical content `path`
2. fetch the page by path
3. return `{ page }` or a controlled `{ error }`

### Route loader (SvelteKit)

From `examples/launchpad/frontend/src/routes/[...slug]/+page.ts`:

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

### Query by path (SQL)

Inside `getPageByPath` run a parameterized SQL query. The workspace is the table, and `archetype` is a column, so the frontend can pick the component from the row. From `examples/launchpad/frontend/src/lib/raisin.ts`:

```ts
const sql = `
  SELECT id, path, name, node_type, archetype, properties
  FROM launchpad
  WHERE path = $1
  LIMIT 1
`;

const result = await db.executeSql(sql, [nodePath]);
const page = result.rows[0] ?? null;
```

`db` is `client.database('launchpad')` from `@raisindb/client`, and `executeSql` returns `{ columns, rows, row_count }`. Use `$1` parameters rather than string concatenation, keep the `path` format consistent (leading slash), and decide whether a missing page returns `null` or throws.

## Functions (server-side automation)

Server-side automation in a package uses two node types:

- **Triggers** (`raisin:Trigger`) declare when to run something.
- **Functions** (`raisin:Function`) hold the code that runs.

In the package layout they live under `content/functions/triggers/` and `content/functions/lib/`.

The example below is a friendship-request workflow from the launchpad package rather than a Kanban automation, but the pattern is the same for Kanban (for example "when a card is created, assign a default status").

### 1) Trigger: when an outbox message is created

**File:** `content/functions/triggers/on-friendship-request/.node.yaml`

It listens for a `Created` node event, matches only `raisin:Message` nodes under `**/users/**/outbox/*` in the `raisin:access_control` workspace whose properties look like a pending friendship request, and dispatches to the function at `function_path`:

```yaml
node_type: raisin:Trigger
properties:
  title: Process Friendship Request
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
      - raisin:access_control
    paths:
      - "**/users/**/outbox/*"
    node_types:
      - raisin:Message
    property_filters:
      message_type: friendship_request
      status: pending
  priority: 10
  max_retries: 3
  function_path: /lib/launchpad/handle-friendship-request
```

- Keep `filters` as specific as possible so the function only runs for the events you mean.
- `max_retries` means the function can run more than once for the same event; make it idempotent.
- `function_path` points into `content/functions/lib/`.

### 2) Function definition: metadata and entrypoint

**File:** `content/functions/lib/launchpad/handle-friendship-request/.node.yaml`

```yaml
node_type: raisin:Function
properties:
  name: handle-friendship-request
  title: Handle Friendship Request
  description: |
    Processes friendship request messages from user outbox.
    Finds the recipient by email and creates a message in their inbox.
  execution_mode: async
  enabled: true
  language: javascript
  entry_file: index.js:handleFriendshipRequest
  version: 1
  input_schema:
    type: object
    description: Trigger context with event and workspace
    properties:
      flow_input:
        type: object
        properties:
          event:
            type: object
            properties:
              type:
                type: string
              node_id:
                type: string
              node_type:
                type: string
              node_path:
                type: string
          workspace:
            type: string
  output_schema:
    type: object
    properties:
      success:
        type: boolean
      error:
        type: string
      inbox_message_path:
        type: string
```

- `entry_file` is `file.js:functionName`. The function is looked up on the module exports or as a top-level function of that name.
- Keep schemas small but accurate; they are the function's contract.
- Return `{ success: false, error: '...' }` for expected failures so the trigger does not retry them.

### 3) Function implementation (JavaScript)

**File:** `content/functions/lib/launchpad/handle-friendship-request/index.js`

The steps:

1. Load the message node that triggered the event
2. Read and validate the recipient email
3. Query the access-control workspace for the user
4. Create a message in the recipient's inbox
5. Update the original outbox message to `sent` (or `error`)

```js
/**
 * Triggered when a friendship_request message is created in a user's outbox.
 * Finds the recipient by email and creates a message in their inbox.
 */
async function handleFriendshipRequest(context) {
  const { event, workspace } = context.flow_input;
  const ACCESS_CONTROL = 'raisin:access_control';

  console.log('[friendship] Trigger fired for:', event.node_path);

  // 1. Get the message node from the event
  const message = await raisin.nodes.get(workspace, event.node_path);
  if (!message) return { success: false, error: 'Message not found' };

  // 2. Recipient email from the message body
  const recipientEmail = message.properties.body?.recipient_email;
  if (!recipientEmail) return { success: false, error: 'Missing recipient_email' };

  // 3. Find the user. In the function runtime raisin.sql.query returns
  //    the row array directly.
  const rows = await raisin.sql.query(
    `SELECT id, path FROM '${ACCESS_CONTROL}'
     WHERE node_type = 'raisin:User' AND properties->>'email'::String = $1`,
    [recipientEmail],
  );
  if (!rows.length) {
    await raisin.nodes.update(workspace, event.node_path, {
      properties: { ...message.properties, status: 'error', error: `User not found: ${recipientEmail}` },
    });
    return { success: false, error: 'User not found' };
  }
  const recipient = rows[0];

  // 4. Create the message in the recipient's inbox
  try {
    const inboxMessage = await raisin.nodes.create(ACCESS_CONTROL, `${recipient.path}/inbox`, {
      name: `friend-req-${Date.now()}`,
      node_type: 'raisin:Message',
      properties: {
        message_type: 'friendship_request',
        subject: 'Friendship Request',
        body: {
          sender_email: message.properties.body?.sender_email,
          sender_display_name: message.properties.body?.sender_display_name,
          message: message.properties.body?.message,
        },
        sender_id: message.properties.sender_id,
        recipient_id: recipient.id,
        status: 'delivered',
        created_at: new Date().toISOString(),
      },
    });

    // 5. Mark the original as sent
    await raisin.nodes.update(workspace, event.node_path, {
      properties: { ...message.properties, status: 'sent', recipient_id: recipient.id },
    });

    return { success: true, inbox_message_path: inboxMessage.path };
  } catch (err) {
    await raisin.nodes.update(workspace, event.node_path, {
      properties: { ...message.properties, status: 'error', error: err.message },
    });
    return { success: false, error: err.message };
  }
}
```

The bindings used here are `raisin.nodes.get(workspace, path)`, `raisin.nodes.create(workspace, parentPath, { name, node_type, properties })`, `raisin.nodes.update(workspace, path, { properties })` and `raisin.sql.query(sql, params)`. `raisin.nodes.update` replaces the properties object, which is why the code spreads the existing properties first.

The shipped version in the example goes one step further: it writes the inbox message and a notification in one transaction (`raisin.nodes.beginTransaction()`, `tx.createDeep(...)`, `tx.commit()`) and then moves the outbox message to the sender's `sent` folder with `raisin.nodes.move`.

### Practices

- **Idempotency:** triggers may retry. Store a correlation id on the original message and check for it before creating a second inbox message.
- **Workspace boundaries:** the function reads from the event's `workspace` but writes into `raisin:access_control`. Make that boundary explicit in your design.
- **Exact matches:** `properties->>'email'::String = $1` compares the property as text; use `LIKE` only when you want partial matching.
- **Schema drift:** if the shape of `properties.body.recipient_email` changes, update the function and its schema together.

## Next steps

- Add card `status` and `order` fields for real Kanban columns.
- Add triggers in `content/functions/triggers/` that react to card updates.
- Read [Data-Centric Application Design](./data_driven_development/intro) for the model behind archetypes.
