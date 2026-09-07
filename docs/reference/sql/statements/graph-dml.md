---
sidebar_position: 7
---

# Graph DML Statements

Statements that create and remove relations between nodes, and that move,
copy, reorder, restore and translate nodes. Node endpoints are always written
as `path='…'` or `id='…'`.

## RELATE

Create a directed relation from a source node to a target node.

### Syntax

```sql
RELATE [IN BRANCH 'branch']
    FROM path|id='value' [IN WORKSPACE 'workspace']
    TO   path|id='value' [IN WORKSPACE 'workspace']
    [TYPE 'relation_type']
    [WEIGHT number]
```

- `IN WORKSPACE` names the workspace of each endpoint. Omit it only when the
  node lives in the repository's default workspace; otherwise the statement
  fails with `Node at path '…' not found`.
- `TYPE` defaults to `references`. Types are free-form strings and are matched
  case-sensitively by `GRAPH_TABLE`.
- `WEIGHT` stores a number on the edge (read back as `r.weight`).
- `IN BRANCH` writes the relation on another branch instead of the one the
  connection is using.

The statement returns `{"affected_rows": 1}`. Relating the same pair with the
same type again replaces the edge rather than adding a second one.

### Examples

```sql
-- typed relation
RELATE FROM path='/bob' IN WORKSPACE 'social'
       TO   path='/alice' IN WORKSPACE 'social'
       TYPE 'follows';

-- weighted
RELATE FROM path='/dave' IN WORKSPACE 'social'
       TO   path='/bob' IN WORKSPACE 'social'
       TYPE 'follows' WEIGHT 2.5;

-- by id
RELATE FROM id='ad2f8f08-2704-41f6-bec0-876c6d53a41b' IN WORKSPACE 'social'
       TO   id='6637869b-390e-4599-80a9-726c95ff6f54' IN WORKSPACE 'social'
       TYPE 'follows';

-- across workspaces
RELATE FROM path='/alice' IN WORKSPACE 'social'
       TO   path='/zurich-hb' IN WORKSPACE 'places'
       TYPE 'lives_near';

-- on a branch
RELATE IN BRANCH 'feature'
       FROM path='/alice' IN WORKSPACE 'social'
       TO   path='/advanced-graphs' IN WORKSPACE 'social'
       TYPE 'authored';
```

---

## UNRELATE

Remove a relation.

### Syntax

```sql
UNRELATE [IN BRANCH 'branch']
    FROM path|id='value' [IN WORKSPACE 'workspace']
    TO   path|id='value' [IN WORKSPACE 'workspace']
    [TYPE 'relation_type']
```

### Examples

```sql
UNRELATE FROM path='/bob' IN WORKSPACE 'social'
         TO   path='/alice' IN WORKSPACE 'social'
         TYPE 'follows';
```

Returns `{"affected_rows": 1}` when an edge was removed.

---

## MOVE

Move a node, with its descendants, under a new parent. The node keeps its id
and name.

### Syntax

```sql
MOVE workspace [IN BRANCH 'branch']
    SET path|id='source'
    TO  path|id='new_parent'
```

### Examples

```sql
-- /erin becomes /team/erin
MOVE social SET path='/erin' TO path='/team';

MOVE social IN BRANCH 'feature' SET id='abc123' TO path='/archive';
```

---

## COPY

Copy a node under a new parent. `COPY` copies one node, `COPY TREE` copies the
node and all its descendants. Copies get new ids and their publish state is
cleared.

### Syntax

```sql
COPY [TREE] workspace [IN BRANCH 'branch']
    SET path|id='source'
    TO  path|id='new_parent'
    [AS 'new_name']
```

### Examples

```sql
COPY social SET path='/team/erin' TO path='/archive' AS 'erin-copy';
-- {"affected_rows": 1, "copied_root_path": "/archive/erin-copy"}

COPY TREE social SET path='/team' TO path='/archive';
-- {"affected_rows": 2, "copied_root_path": "/archive/team"}
```

---

## ORDER

Change a node's position among its siblings. Editorial order is what
`ORDER BY __order` returns.

### Syntax

```sql
ORDER workspace [IN BRANCH 'branch']
    SET path|id='node'
    ABOVE|BELOW path|id='sibling'
```

### Examples

```sql
ORDER social SET path='/carol' ABOVE path='/alice';

SELECT name, __order FROM 'social' WHERE CHILD_OF('/') ORDER BY __order;
-- carol, alice, bob, dave, …
```

---

## RESTORE

Restore a node to the state it had at an earlier revision. The node stays at
its current path; `RESTORE TREE` also restores its descendants.

### Syntax

```sql
RESTORE [TREE] NODE path|id='node'
    TO REVISION HEAD~n | branch~n | <hlc>
    [TRANSLATIONS ('locale', ...)]
```

### Examples

```sql
RESTORE NODE path='/dave' TO REVISION HEAD~1;
-- {"result": "Node '/dave' restored to revision 1788719664571-0", "affected_rows": 1, ...}

RESTORE TREE NODE path='/products/category' TO REVISION HEAD~5;

RESTORE NODE path='/articles/my-article' TO REVISION HEAD~2 TRANSLATIONS ('en', 'de');

RESTORE NODE path='/articles/my-article' TO REVISION 1734567890123_42;
```

A node with fewer revisions than requested fails with
`Node '/team' only has 1 revisions, cannot go back 1 revisions (HEAD~1)`.

---

## UPDATE … FOR LOCALE (translations)

Create or update the translation of a node's fields for one locale.
Translations are an overlay on the base node: only the fields you set are
translated, everything else falls back to the base content.

### Syntax

```sql
UPDATE workspace FOR LOCALE 'locale' [IN BRANCH 'branch']
    SET <path> = <value> [, ...]
    WHERE path = '…' | id = '…' [AND node_type = '…']
```

- `workspace` is the table name, the same identifier used in
  `SELECT … FROM workspace`. To restrict by node type add
  `AND node_type = '…'` to the `WHERE` clause.
- `FOR LOCALE` takes a locale code such as `'de'`, `'fr'` or `'en-US'`.
- The `WHERE` clause is required and identifies the node by `path` or `id`.

### Paths

A `SET` target is a path into the node's content:

| Path form | Targets |
|-----------|---------|
| `title` | a top-level field |
| `metadata.author` | a nested object field |
| `blocks[uuid='b1'].text` | a field on a repeatable item, addressed by its `uuid` |
| `sections[uuid='s1'].features[uuid='f1'].title` | a field nested inside two array levels |

`array[uuid='…']` addressing works to any depth; each array item along the
path must carry a `uuid`. See the
[Translations guide](/docs/guides/data-modeling/translations) for how to model
translatable composites.

### Examples

```sql
UPDATE pages FOR LOCALE 'es'
    SET title = 'Bienvenidos',
        description = 'Pagina principal'
    WHERE path = '/content/homepage';

UPDATE pages FOR LOCALE 'fr'
    SET blocks[uuid='hero-1'].heading = 'Bonjour'
    WHERE path = '/content/homepage';

UPDATE pages FOR LOCALE 'de'
    SET sections[uuid='s1'].features[uuid='f1'].title = 'Schnelle Entwicklung'
    WHERE path = '/home';
```

---

## Notes

- Relations live in a relation index, not in the node record; `RELATE` and
  `UNRELATE` do not create a node revision.
- `MOVE` updates the paths of the node and its descendants; relations keep
  pointing at the same ids.
- All of these statements are branch-scoped and take an `IN BRANCH` override
  except `RESTORE`, which uses the connection's branch.
