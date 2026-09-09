---
sidebar_position: 5
---

# Paths and Hierarchy

Nodes in a workspace form a tree. Each node's `path` is its address in that tree, and the SQL layer offers functions for walking it. Sibling order is stored separately from paths, so editors can arrange children by hand.

## Path structure

```
/blog/2024/my-first-post
 └─┬┘ └─┬┘ └─────┬─────┘
  root  child    grandchild   (depth 1, 2, 3)
```

- A path starts with `/` and is unique within its workspace.
- Each segment is the slug of the node's `name`: lower-case, whitespace becomes `-`, and only `a-z`, `0-9`, `-`, `_` and `.` survive. A node named `My First Post` under `/blog` gets the path `/blog/my-first-post`. Names containing `/` are rejected.
- Paths are case-sensitive, but slugs are always lower-case, so two names that differ only in case collide.
- A node's `parent` field holds the parent's **name** (`"blog"`), or `"/"` for a root-level node. The full parent path is the path with the last segment removed.

## Path functions in SQL

All examples use a workspace called `nodes-a` with `/blog`, `/blog/first-post`, `/blog/second`, `/blog/first-post/jane2` and `/archive`.

### CHILD_OF(path)

Direct children of a node:

```sql
SELECT path, name, node_type FROM 'nodes-a' WHERE CHILD_OF('/blog') ORDER BY path;
```

```json
{"rows":[{"path":"/blog/first-post","name":"first-post","node_type":"blog:Article"},
         {"path":"/blog/second","name":"second","node_type":"blog:Article"}]}
```

### DESCENDANT_OF(path)

Every node below a path, at any depth. The planner turns this into a prefix scan:

```sql
SELECT path, node_type FROM 'nodes-a' WHERE DESCENDANT_OF('/blog');
```

```json
{"rows":[{"path":"/blog/second","node_type":"blog:Article"},
         {"path":"/blog/first-post","node_type":"blog:Article"},
         {"path":"/blog/first-post/jane2","node_type":"blog:Author"}]}
```

Combine it with other predicates as usual:

```sql
SELECT path FROM 'nodes-a'
WHERE DESCENDANT_OF('/blog') AND node_type = 'blog:Article'
ORDER BY __tree_order;
```

Use `DESCENDANT_OF` with a concrete path. `DESCENDANT_OF('/')` currently returns no rows; to scan a whole workspace, omit the predicate.

### DEPTH(path), PARENT(path), ANCESTOR(path, n), PATH_STARTS_WITH(path, prefix)

```sql
SELECT path, DEPTH(path) AS depth, PARENT(path) AS parent FROM 'nodes-a' ORDER BY path;
```

```json
{"rows":[{"path":"/archive","depth":1,"parent":"/"},
         {"path":"/blog","depth":1,"parent":"/"},
         {"path":"/blog/first-post","depth":2,"parent":"/blog"},
         {"path":"/blog/second","depth":2,"parent":"/blog"}]}
```

```sql
SELECT ANCESTOR('/a/b/c', 2) AS a, PATH_STARTS_WITH('/blog/x', '/blog') AS s;
-- {"a":"/a/b","s":true}

SELECT path FROM 'nodes-a' WHERE DEPTH(path) = 1;               -- root-level nodes
SELECT path FROM 'nodes-a' WHERE PARENT(path) = '/blog';         -- same result as CHILD_OF
SELECT path FROM 'nodes-a' WHERE PATH_STARTS_WITH(path, '/blog'); -- includes /blog itself
SELECT path FROM 'nodes-a' WHERE path LIKE '/blog/%';            -- plain LIKE works too
```

`SELECT *` also exposes `depth` and `parent_name` as columns.

### Aggregating over the tree

```sql
SELECT PARENT(path) AS parent, COUNT(*) AS n
FROM 'nodes-a'
WHERE node_type = 'blog:Article'
GROUP BY PARENT(path);
```

```json
{"rows":[{"parent":"/archive","n":1},{"parent":"/blog","n":3}]}
```

## Reading the tree over HTTP

```bash
# root-level nodes
GET /api/repository/docs-model/main/head/nodes-a/

# direct children of /blog, in sibling order
GET /api/repository/docs-model/main/head/nodes-a/blog?level=1

# three levels, nested under "children"
GET /api/repository/docs-model/main/head/nodes-a/blog?level=3

# same, as a flat array
GET /api/repository/docs-model/main/head/nodes-a/blog?level=3&flatten=true
```

`level` is capped at 10. Every node in a listing carries `has_children`, so a UI can decide whether to offer expansion before fetching the next level.

## Sibling order

Children of one parent have an explicit, editable order that is independent of their names. It is what a menu or a page's sections render from.

- Each child carries an `order_key`, an opaque sortable string (a fractional index), so a node can be inserted between two siblings without renumbering the others. Listings with `?level=` return children in this order.
- Order is stored per branch and travels with a branch merge.
- SQL exposes it as `__order` (position among siblings) and `__tree_order` (position within a subtree, in document order, populated by tree traversals). Both work as keyset cursors.

```sql
SELECT name, __order FROM 'nodes-a' WHERE CHILD_OF('/blog') ORDER BY __order;
```

```json
{"rows":[{"name":"second","__order":"7f80::1a0780319f80000000000000000"},
         {"name":"first-post","__order":"80::1a078026f560000000000000000"}]}
```

Reorder with the `reorder` command, giving the sibling to place the node next to:

```bash
curl -X POST localhost:8090/api/repository/docs-model/main/head/nodes-a/blog/second/raisin:cmd/reorder \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"targetPath": "/blog/first-post", "movePosition": "before"}'
```

`movePosition` is `before` or `after`. The JavaScript client wraps this as `reorder`, `moveChildBefore` and `moveChildAfter`; see [Node Operations](/docs/reference/javascript-client/node-operations#ordering).

`path` and `__order` both sort parents before children, but `path` sorts siblings alphabetically while `__order` sorts them editorially. Do not page with a cursor on one and an `ORDER BY` on the other.

:::tip Copying nodes between branches
A branch merge carries sibling order. Copying individual nodes to another branch carries the content only; replay the order on the target with `applyChildOrder()` in the JavaScript client.
:::

## Moving and renaming

Moving and renaming are commands on the node. `targetPath` is the node's new full path:

```bash
POST .../head/nodes-a/blog/pg/raisin:cmd/move      {"targetPath": "/archive/pg"}
POST .../head/nodes-a/blog/second-post/raisin:cmd/rename  {"newName": "second"}
```

A move fails with `VALIDATION_FAILED` if a child with that name already exists at the destination. Descendants move with their parent and their paths are rewritten. In SQL, `UPDATE 'nodes-a' SET path = '/archive/sql-post' WHERE path = '/blog/sql-post'` does the same.

## Allowed children

A NodeType's `allowed_children` lists the types that may be created directly beneath it; an empty list or `"*"` allows anything. A named entry matches the child's whole family, not just its exact type: if a parent allows `raisin:Asset`, a NodeType that extends `raisin:Asset` or carries it as a mixin is allowed too.

The workspace adds its own limits with `allowed_node_types` and `allowed_root_node_types`:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Workspace 'nodes-a' does not allow root nodes of type 'blog:Article'. Allowed root types: [\"raisin:Folder\", \"raisin:Page\"]"
}
```

Both rules apply on every write path — a `POST` to a node path, a SQL `INSERT`, and a WebSocket create all run through the transaction layer, which checks them. A violation is a `VALIDATION_FAILED` naming the child type, the parent type, and the allowed list.

One deliberate exception: if the parent node cannot be resolved at all, the child is written. `allowed_children` is a schema rule, not a referential one, and a node whose parent is missing has a different problem.

## Designing paths

Paths are addresses, not categories. A few patterns that work well:

- **Dated content**: `/blog/2024/01/my-post`. Query a month with `DESCENDANT_OF('/blog/2024/01')`.
- **Containers as folders**: `raisin:Folder` nodes for structure, content types beneath them.
- **Taxonomies as references**: keep a node in one place and link it to categories with a `Reference` property or a relation, rather than duplicating it under several paths. See [Graph Model](/docs/concepts/graph-model).

Keep hierarchies shallow enough to be readable; `level` listings stop at 10.

## Next steps

- **[Nodes](/docs/concepts/data-model/nodes)** for the node JSON and write commands.
- **[Workspaces](/docs/concepts/workspaces)** for `allowed_node_types` and root rules.
- **[Editorial ordering](/docs/guides/querying/common-query-patterns#editorial-drag-and-drop-order)** for paging with `__order` and `__tree_order`.
