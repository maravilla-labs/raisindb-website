---
sidebar_position: 1
---

# Using the Admin Console

The Admin Console provides a web interface for managing RaisinDB.

## Accessing the Console

Navigate to:

```
http://localhost:8080/admin
```

Login with your credentials.

## Main Features

### Workspace Selector

When you access the Content section, you'll see a workspace selector showing all available workspaces:

![Workspace Selector](/img/admin-console/workspace-selector.png)

### Content Browser

Browse and manage content within workspaces:

![Content Browser](/img/admin-console/content-browser.png)

- Navigate workspace hierarchies
- Create, edit, delete nodes
- Preview content
- Search across workspaces

### Schema Designer

Manage NodeTypes and schemas:

![NodeTypes List](/img/admin-console/nodetypes-list.png)

#### Visual NodeType Editor

The visual editor provides a drag-and-drop interface for building schemas:

![NodeType Visual Editor](/img/admin-console/nodetype-visual-editor.png)

- **Types Palette**: Drag element types (String, Number, Boolean, Date, Array, Object, Reference, etc.) onto your schema
- **Properties List**: View and reorder all defined properties
- **Settings Panel**: Configure NodeType metadata, versioning, and indexing options

#### YAML Editor

Switch to the YAML tab for direct schema editing:

![NodeType YAML Editor](/img/admin-console/nodetype-yaml-editor.png)

- Full syntax highlighting
- Direct access to all schema options
- Copy/paste schema definitions

### SQL Query Console

Execute SQL queries directly:

![SQL Query Console](/img/admin-console/sql-query-console.png)

- Syntax highlighting
- Query history
- Export results
- Visual explain plans

### Branch Management

Manage Git-like branches and tags:

![Branch Management](/img/admin-console/branches.png)

- Create/delete branches
- Compare branches
- Merge with conflict resolution
- View commit history

### Functions

Serverless JavaScript functions:

![Functions](/img/admin-console/functions.png)

#### JavaScript Code Editor

Open any function file to edit it in the built-in code editor:

![Function JS Editor](/img/admin-console/function-js-editor.png)

- **File Explorer**: Navigate the functions directory structure
- **Code Editor**: Syntax-highlighted JavaScript editing
- **Run Button**: Test functions with JSON or Node input
- **Output Panel**: View execution results, problems, and logs
- **Node Info**: View function metadata and path

### Packages

Browse and manage RAP packages:

![Packages](/img/admin-console/packages.png)

- Browse installed packages
- Upload new packages
- Install/uninstall packages
- View package contents

### Access Control

Manage users and permissions:
- Create users and groups
- Assign roles
- Configure workspace access
- API key management

## Keyboard Shortcuts

- `Cmd+K` / `Ctrl+K`: Command palette
- `Cmd+S` / `Ctrl+S`: Save
- `Cmd+Enter` / `Ctrl+Enter`: Execute query
- `Esc`: Close dialog

## Next Steps

- [Workspaces](/docs/concepts/workspaces) - Learn about workspace organization
- [NodeTypes](/docs/concepts/data-model/nodetypes) - Understand schema definitions
- [SQL Reference](/docs/reference/sql/overview) - SQL query syntax
- [Branching Workflows](/docs/concepts/versioning/git-like-workflows) - Git-like version control
