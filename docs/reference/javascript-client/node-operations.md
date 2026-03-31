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
