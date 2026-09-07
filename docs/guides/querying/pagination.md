---
sidebar_position: 9
---

# Pagination

How to page through results over SQL and the JavaScript client, and how to
pick a cursor that stays correct while the data underneath you changes.

## Which approach to use

| | Offset (`LIMIT … OFFSET`) | Keyset (cursor) |
|---|---|---|
| Cost of page N | grows with N: the engine walks and discards every skipped row | does not grow with N |
| Rows inserted or deleted mid-scan | rows shift between pages, so duplicates and skips | unaffected for rows away from the cursor |
| Jump to "page 47" | yes | no, only forwards or backwards from a cursor |

Use offset for small result sets or a numbered page picker. Use keyset for
anything large, for infinite scroll, or for a job that walks every row.

## Offset pagination

```sql
SELECT path FROM 'blog'
WHERE node_type = 'raisin:Page'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

Page 500 makes the engine read 10,000 rows to return 20, and a row inserted
while a user pages shifts everything after it by one.

## Keyset pagination

Take the sort value of the last row on a page and ask for rows after it:

```sql
-- page 1
SELECT path, created_at FROM 'blog'
WHERE node_type = 'raisin:Page'
ORDER BY created_at DESC
LIMIT 20;

-- page 2: $1 = created_at of the last row from page 1
SELECT path, created_at FROM 'blog'
WHERE node_type = 'raisin:Page' AND created_at < $1
ORDER BY created_at DESC
LIMIT 20;
```

The comparison follows the sort direction: `DESC` pages with `<`, `ASC` pages
with `>`. Select the cursor column so you can read it from the last row. If
you don't, it is appended to the result anyway.

### The cursor column and the ORDER BY column must match

```sql
-- wrong: advances the cursor in one order, sorts in another
WHERE __tree_order > $1 ORDER BY path
```

"Everything after the cursor" and "everything after this row in the sort" are
then two different sets, and rows in the difference are dropped or repeated.

### Choosing a cursor column

A keyset cursor needs a column that is sortable and unique, or tie-broken.

| Cursor on | Good for | Notes |
|---|---|---|
| `path` | hierarchical listings | unique; sorts siblings alphabetically |
| `created_at` / `updated_at` | feeds, activity logs | add a tie-break if timestamps can collide |
| `properties->>'…'::String` | domain ordering (publish date, score) | `->>` yields text, so compare against text |
| `__order` | one parent's children in editorial order | opaque token |
| `__tree_order` | a whole subtree in editorial document order | opaque token |

If two rows share a cursor value, a page boundary between them repeats or
skips one. Cursor on something unique (`path` and `id` both are), or add a
tie-break on a second column:

```sql
-- $1 = created_at of the last row, $2 = its id
SELECT path, id, created_at FROM 'blog'
WHERE node_type = 'raisin:Page'
  AND (created_at < $1 OR (created_at = $1 AND id < $2))
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Row-value syntax, `WHERE (created_at, id) < ($1, $2)`, is not accepted; write
the expanded `OR` form.

## Paging a hierarchy

Sibling paths sort naturally, so `path` is an easy cursor for a listing:

```sql
-- children of /posts, 20 at a time; $1 = last path of the previous page
SELECT path FROM 'blog'
WHERE CHILD_OF('/posts') AND path > $1
ORDER BY path
LIMIT 20;
```

That gives alphabetical order. To page in the order an editor arranged by
dragging, cursor on `__order`:

```sql
SELECT name, __order FROM 'blog'
WHERE CHILD_OF('/menu') AND __order > $1
ORDER BY __order
LIMIT 20;
```

To page an entire tree rather than one level, use `__tree_order`. It sorts
into document order: each node comes before its descendants and each subtree
stays contiguous.

```sql
SELECT path, __tree_order FROM 'blog'
WHERE DESCENDANT_OF('/menu') AND __tree_order > $1
ORDER BY __tree_order
LIMIT 20;
```

Both values look like `8180::1a07802e4f60000000000000000`. They are tokens:
pass them back as bound parameters exactly as received. See
[Editorial order](./common-query-patterns.md#editorial-drag-and-drop-order)
for the difference between `path` and `__order`.

## JavaScript client

`listChildrenPage` pages a parent's children in editorial order and returns
`{ items, nextCursor }`:

```typescript
const nodes = client.database('myrepo').workspace('blog').nodes();

let cursor: string | undefined;
do {
  const page = await nodes.listChildrenPage('/posts', { cursor, limit: 50 });
  for (const child of page.items) {
    console.log(child.path);
  }
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

`listChildren(parentPath)` fetches every child in one call, which is fine for
a menu and wrong for a folder with 50,000 nodes. Reach for `listChildrenPage`
when the child count is unbounded. `limit` defaults to 100.

Two behaviours to code against:

- **A short page is not necessarily the last page.** Permission filtering is
  applied per scanned batch, so a page can come back with fewer than `limit`
  rows and still have more to come. Loop until `nextCursor` is `null`, never
  on the row count.
- **A cursor belongs to the listing that issued it.** Cursors are signed and
  carry the ordering they were taken from; a tampered or foreign cursor is
  rejected with a `400` and an `Invalid cursor` message rather than returning
  the wrong rows. Restart without a cursor.

The REST directory listing (`GET
/api/repository/{repo}/{branch}/head/{workspace}/{path}/`) accepts the same
`limit` and `cursor` query parameters and returns `{ items, next_cursor,
total }` when either is present.

## Counting total pages

Keyset pagination has no "page 47 of 300". If you need a total:

```sql
SELECT COUNT(*) AS n FROM 'blog' WHERE node_type = 'raisin:Page';
```

Run it once and cache it; recomputing a count on every page is usually more
expensive than the page itself. For infinite scroll, show "load more" until
the cursor is `null` instead.

## Common mistakes

- **Mixing cursor and sort columns.** The most common cause of dropped and
  duplicated rows.
- **Treating a short page as the end.** Use the cursor, not the row count.
- **Cursoring on a non-unique column without a tie-break.** Rows sharing a
  value straddle the page boundary.
- **Interpolating a cursor into SQL.** Bind it as a parameter.
- **Offset for deep pages.** `OFFSET 100000` reads 100,000 rows to throw them
  away.
