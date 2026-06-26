---
sidebar_position: 3
---

# Node Operations

CRUD operations, tree traversal, and relationships.

## NodeOperations

Access node operations through a workspace:

```typescript
const ws = db.workspace('content');
const nodes = ws.nodes();
```

### create()

```typescript
create(options: NodeCreateOptions): Promise<Node>
```

```typescript
interface NodeCreateOptions {
  type: string;
  path: string;
  properties?: Record<string, any>;
  content?: any;
}
```

### createDeep()

Create a node, auto-creating any missing ancestor folders along `path`. Ancestors
are created as `parentNodeType` (defaults to `raisin:Folder`).

```typescript
createDeep(options: NodeCreateDeepOptions): Promise<Node>
```

```typescript
interface NodeCreateDeepOptions extends NodeCreateOptions {
  parentNodeType?: string; // default: "raisin:Folder"
}
```

### upsertDeep()

Create-or-update a node by `path` (in place if it already exists), auto-creating any
missing ancestor folders.

```typescript
upsertDeep(options: NodeCreateDeepOptions): Promise<Node>
```

### get()

Get a node by ID.

```typescript
get(id: string): Promise<Node | null>
```

### getByPath()

Get a node by its path.

```typescript
getByPath(path: string): Promise<Node | null>
```

### update()

```typescript
update(id: string, options: NodeUpdateOptions): Promise<Node>
```

### delete()

```typescript
delete(id: string): Promise<boolean>
```

### query()

```typescript
query(options: NodeQueryOptions): Promise<Node[]>
```

### queryByType()

```typescript
queryByType(nodeType: string, limit?: number): Promise<Node[]>
```

### queryByProperty()

```typescript
queryByProperty(name: string, value: any, limit?: number): Promise<Node[]>
```

---

## History & Audit

### history()

List a node's revision history (git-style "file history"), **newest first**. This
is the structural MVCC version history and is **always available** for every node,
regardless of the NodeType `auditable` flag.

```typescript
history(id: string, options?: { limit?: number }): Promise<RevisionEntry[]>
historyByPath(path: string, options?: { limit?: number }): Promise<RevisionEntry[]>

interface RevisionEntry {
  revision: string;     // HLC revision, usable with atRevision()
  updated_at?: string;  // ISO 8601
  updated_by?: string;  // user id that authored this revision
  deleted: boolean;     // true if the node was deleted at this revision
}
```

```typescript
const ws = db.workspace('content');

// List the last 50 revisions of a node
const revisions = await ws.nodes().history(nodeId, { limit: 50 });

// Fetch the full snapshot of a historical version
for (const rev of revisions) {
  const snapshot = await ws.atRevision(rev.revision).nodes().get(nodeId);
}
```

### auditLog()

Query a node's **audit-log** entries. Audit logs are only produced for NodeTypes
marked `auditable: true`, and capture who/what/when for each operation. This is
distinct from `history()` (the always-on structural revision history).

```typescript
auditLog(id: string): Promise<AuditLogEntry[]>
auditLogByPath(path: string): Promise<AuditLogEntry[]>

interface AuditLogEntry {
  id: string;
  node_id: string;
  path: string;
  workspace: string;
  user_id?: string;   // who performed the action
  action: string;     // "Create" | "Update" | "Delete" | "Publish" | ...
  timestamp: string;  // ISO 8601
  details?: string;
}
```

Both `history()` and `auditLog()` are authorized through row-level security — you
can only read history/audit for nodes you can read.

---

## Tree Operations

### listChildren()

```typescript
listChildren(parentPath: string): Promise<Node[]>
```

### getChildren()

```typescript
getChildren(parentId: string, limit?: number): Promise<Node[]>
```

### getChildrenByPath()

```typescript
getChildrenByPath(parentPath: string, limit?: number): Promise<Node[]>
```

### getTree()

Returns a nested tree structure rooted at the given path.

```typescript
getTree(rootPath: string, maxDepth?: number): Promise<Node>
```

### getTreeFlat()

Returns a flat array of all nodes in the subtree.

```typescript
getTreeFlat(rootPath: string, maxDepth?: number): Promise<Node[]>
```

### move()

```typescript
move(fromPath: string, toParentPath: string): Promise<Node>
```

### rename()

```typescript
rename(nodePath: string, newName: string): Promise<Node>
```

### copy()

Shallow copy (node only, no children).

```typescript
copy(fromPath: string, toParentPath: string, newName?: string): Promise<Node>
```

### copyTree()

Deep copy (node and all descendants).

```typescript
copyTree(fromPath: string, toParentPath: string, newName?: string): Promise<Node>
```

## Ordering

Sibling nodes have an explicit order (see
[Child Ordering](/docs/concepts/data-model/paths-and-hierarchy#child-ordering)).
Order is per-branch and is carried automatically when a branch is merged.

### reorder()

Set the order key for a node.

```typescript
reorder(nodePath: string, orderKey: string): Promise<Node>
```

### moveChildBefore()

Move a child before a reference sibling.

```typescript
moveChildBefore(
  parentPath: string,
  childPath: string,
  referencePath: string
): Promise<Node>
```

### moveChildAfter()

Move a child after a reference sibling.

```typescript
moveChildAfter(
  parentPath: string,
  childPath: string,
  referencePath: string
): Promise<Node>
```

### applyChildOrder()

Replay a parent's child order from another branch onto the current branch.

```typescript
applyChildOrder(parentPath: string, sourceBranch: string): Promise<void>
```

Reorders the parent's children on the **current** branch to match their order on
`sourceBranch`. Only children that exist under the parent on both branches are
moved.

Use this when promoting content by **copying nodes** between branches (e.g. a
`main` → `publish` publishing flow): copying a node carries its content but not
its sibling order. A full branch [merge](/docs/guides/branching/merging-changes)
already carries order, so it does not need this call.

```typescript
// On the `publish` branch, match the child order of /menu from `main`
await db.onBranch('publish')
  .workspace('content')
  .nodes()
  .applyChildOrder('/menu', 'main');
```

---

## Relationships

### addRelation()

```typescript
addRelation(
  nodePath: string,
  relationType: string,
  targetNodePath: string,
  options?: { weight?: number; targetWorkspace?: string }
): Promise<boolean>
```

### removeRelation()

```typescript
removeRelation(nodePath: string, targetPath: string): Promise<boolean>
```

### getRelationships()

```typescript
getRelationships(nodePath: string): Promise<NodeRelationships>
```

Returns:

```typescript
interface NodeRelationships {
  outgoing: Relation[];
  incoming: Relation[];
}
```
