---
sidebar_position: 3
---

# Node Operations

CRUD, tree traversal, ordering, history and relationships.

## NodeOperations

```typescript
const ws = db.workspace('content');
const nodes = ws.nodes();
```

### create()

```typescript
create(options: NodeCreateOptions): Promise<Node>

interface NodeCreateOptions {
  type: string;                          // node type, e.g. 'raisin:Page'
  path: string;                          // full path of the new node
  properties?: Record<string, PropertyValue>;
  content?: unknown;
}
```

### createDeep()

Create a node and any missing ancestor folders along `path`. Ancestors are created as `parentNodeType` (default `raisin:Folder`).

```typescript
createDeep(options: NodeCreateDeepOptions): Promise<Node>

interface NodeCreateDeepOptions extends NodeCreateOptions {
  parentNodeType?: string;
}
```

### upsertDeep()

Create-or-update by `path`, creating missing ancestors.

```typescript
upsertDeep(options: NodeCreateDeepOptions): Promise<Node>
```

### get()

```typescript
get(id: string): Promise<Node | null>
```

### getByPath()

```typescript
getByPath(path: string): Promise<Node | null>
```

### update()

`properties` replaces the stored properties.

```typescript
update(id: string, options: { properties?: Record<string, PropertyValue>; content?: unknown }): Promise<Node>
```

### delete()

```typescript
delete(id: string): Promise<boolean>
```

### query(), queryByType(), queryByProperty()

```typescript
query(options: { query: unknown; limit?: number; offset?: number }): Promise<Node[]>
queryByType(nodeType: string, limit?: number): Promise<Node[]>
queryByProperty(name: string, value: PropertyValue, limit?: number): Promise<Node[]>
```

`query()` accepts `{ type }` or `{ parent: parentId }` as the filter, which is what `queryByType()` and `getChildren()` send. `getByPath()` and `queryByProperty()` use their own request types (`node_query_by_path`, `node_query_by_property`); `queryByProperty()` matches a top-level property by exact value.

---

## History and audit

### history()

Revision history of a node, newest first. Available for every node regardless of the NodeType's `auditable` flag.

```typescript
history(id: string, options?: { limit?: number }): Promise<RevisionEntry[]>
historyByPath(path: string, options?: { limit?: number }): Promise<RevisionEntry[]>

interface RevisionEntry {
  revision: string;      // usable with atRevision()
  updated_at?: string;   // ISO 8601
  updated_by?: string;
  deleted: boolean;
}
```

```typescript
const revisions = await nodes.history(nodeId, { limit: 50 });
for (const rev of revisions) {
  const snapshot = await ws.atRevision(rev.revision).nodes().get(nodeId);
}
```

### auditLog()

Audit entries, recorded only for NodeTypes marked `auditable: true`.

```typescript
auditLog(id: string): Promise<AuditLogEntry[]>
auditLogByPath(path: string): Promise<AuditLogEntry[]>

interface AuditLogEntry {
  id: string;
  node_id: string;
  path: string;
  workspace: string;
  user_id?: string;
  action: string;        // "Create" | "Update" | "Delete" | "Publish" | ...
  timestamp: string;
  details?: string;
}
```

Both are filtered by row-level security: you only see entries for nodes you can read.

---

## Tree operations

### listChildren()

All children of a parent in editorial (drag-and-drop) order.

```typescript
listChildren(parentPath: string): Promise<Node[]>
```

### listChildrenPage()

One page of children in editorial order, with keyset pagination. Pass the previous page's `nextCursor` back as `cursor`; it is `null` on the last page.

```typescript
listChildrenPage(parentPath: string, options?: { cursor?: string; limit?: number }): Promise<{ items: Node[]; nextCursor: string | null }>
```

```typescript
let cursor: string | undefined;
do {
  const page = await nodes.listChildrenPage('/menu', { cursor, limit: 50 });
  for (const child of page.items) { /* ... */ }
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

The cursor is opaque. A page can hold fewer than `limit` items without being the last page (permission filtering happens per page), so loop on `nextCursor`, not on the item count. See [Pagination](/docs/guides/querying/pagination).

### getChildren()

```typescript
getChildren(parentId: string, limit?: number): Promise<Node[]>
getChildrenByPath(parentPath: string, limit?: number): Promise<Node[]>
```

### getTree(), getTreeFlat()

```typescript
getTree(rootPath: string, maxDepth?: number): Promise<Node>
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

### copy(), copyTree()

Shallow copy (node only) and deep copy (node and descendants).

```typescript
copy(fromPath: string, toParentPath: string, newName?: string): Promise<Node>
copyTree(fromPath: string, toParentPath: string, newName?: string): Promise<Node>
```

## Ordering

Siblings have an explicit order (see [Child Ordering](/docs/concepts/data-model/paths-and-hierarchy#child-ordering)). Order is per branch and is carried by a merge. You name a position or a neighbour and the server assigns the order key. Children are identified by **name**.

### reorder()

Move a child to a 0-based position among its siblings; a position past the end appends. Returns the node with its new `order_key`, the value the `__order` SQL column reports.

```typescript
reorder(parentPath: string, childName: string, position: number): Promise<Node>

await nodes.reorder('/articles', 'item-1', 0);   // to the front
```

### moveChildBefore(), moveChildAfter()

```typescript
moveChildBefore(parentPath: string, childName: string, beforeChildName: string): Promise<void>
moveChildAfter(parentPath: string, childName: string, afterChildName: string): Promise<void>
```

### applyChildOrder()

Reorder a parent's children on the current branch to match their order on `sourceBranch`. Only children present under the parent on both branches are moved.

```typescript
applyChildOrder(parentPath: string, sourceBranch: string): Promise<void>
```

Use it when promoting content by copying nodes between branches (for example a `main` to `publish` flow): a copy carries content but not sibling order. A full branch [merge](/docs/guides/branching/merging-changes) carries order already.

```typescript
await db.onBranch('publish').workspace('content').nodes().applyChildOrder('/menu', 'main');
```

---

## Relationships

### addRelation()

```typescript
addRelation(
  nodePath: string,
  relationType: string,
  targetNodePath: string,
  weightOrOptions?: number | { weight?: number; targetWorkspace?: string }
): Promise<boolean>
```

### removeRelation()

```typescript
removeRelation(nodePath: string, targetPath: string, options?: { targetWorkspace?: string }): Promise<boolean>
removeRelation(nodePath: string, relationType: string, targetPath: string, options?): Promise<boolean>
```

### getRelationships()

```typescript
getRelationships(nodePath: string): Promise<{ outgoing: Relation[]; incoming: Relation[] }>
```
