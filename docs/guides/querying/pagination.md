---
sidebar_position: 9
---

# Pagination

How to page through results in RaisinDB — over SQL, the HTTP API, and the
JavaScript client — and how to pick a cursor that stays correct while the data
underneath you changes.

## Which approach to use

| | Offset (`LIMIT … OFFSET`) | Keyset (cursor) |
| --- | --- | --- |
| Cost of page *N* | grows with *N* — the engine walks and discards every skipped row | does not grow with *N* |
| Rows inserted/deleted mid-scan | rows shift between pages: duplicates and skips | unaffected for rows away from the cursor |
| Jump to "page 47" | yes | no — only forwards/backwards from a cursor |

Use **offset** for small result sets or a numbered page picker. Use **keyset** for
anything large, infinite scroll, or a job walking every row.

:::note How far the cursor is pushed down
Keyset always avoids offset's scan-and-discard, but whether the cursor also
becomes an **index seek** depends on the shape:

- `__order` / `__tree_order` with `CHILD_OF` / `DESCENDANT_OF` — seeks directly
  into the ordering index.
- `properties->>'…'` ordered by the same property — served by the property index.
- `path` under `CHILD_OF` — bounded to that parent's children, then filtered.
- `created_at` alongside a selective filter such as `node_type` — the planner
  filters first and sorts the (small) match set, which is usually the better plan.

Check with `EXPLAIN` if a specific query matters to you.
:::

## Offset pagination

```sql
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

Straightforward, but page 500 makes the engine walk 10,000 rows to discard 9,980
of them — and if a row is inserted while a user pages, everything after it shifts
by one, so they see a row twice or miss it entirely.

## Keyset pagination

Take the sort value of the last row on a page and ask for rows *after* it:

```sql
-- Page 1
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
ORDER BY created_at DESC
LIMIT 20;

-- Page 2 — $1 = created_at of the last row from page 1
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
  AND created_at < $1
ORDER BY created_at DESC
LIMIT 20;
```

Note the comparison follows the sort direction: `DESC` pages with `<`, `ASC`
pages with `>`.

### The one rule that matters

**The cursor column and the `ORDER BY` column must be the same.**

```sql
-- WRONG: advances the cursor in one order, sorts in another.
-- Rows are silently dropped and duplicated.
WHERE __tree_order > $1 ORDER BY path
```

If they differ, "everything after the cursor" and "everything after this row in
the sort" are two different sets, and the difference is what you lose.

### Choosing a cursor column

A keyset cursor needs a column that is **sortable** and **unique** (or
tie-broken). RaisinDB gives you several:

| Cursor on | Good for | Notes |
| --- | --- | --- |
| `path` | hierarchical listings | unique; sorts siblings **alphabetically** |
| `created_at` / `updated_at` | feeds, activity logs | add a tie-break if timestamps can collide |
| `properties->>'…'` | domain ordering (publish date, score) | `->>` yields text — compare against text |
| `__order` | one parent's children in **editorial** order | opaque token |
| `__tree_order` | a whole subtree in editorial document order | opaque token |

If a cursor column can contain duplicates, two rows share a cursor value and one
page boundary can repeat or skip them. Either cursor on something unique — `path`
and `id` both are — or add a tie-break on a second column:

```sql
-- $1 = created_at of the last row, $2 = its id
SELECT * FROM 'default'
WHERE node_type = 'blog:Article'
  AND (created_at < $1 OR (created_at = $1 AND id < $2))
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

:::note
Row-value syntax — `WHERE (created_at, id) < ($1, $2)` — is **not** supported;
it is rejected at analysis. Write the expanded `OR` form above instead.
:::

## Paging a hierarchy

Sibling paths sort naturally, so `path` is an easy cursor for a listing:

```sql
-- Children of /blog, 20 at a time ($1 = last path of the previous page)
SELECT * FROM 'default'
WHERE CHILD_OF('/blog') AND path > $1
ORDER BY path
LIMIT 20;
```

That gives **alphabetical** order. To page in the order an editor arranged by
dragging, cursor on `__order` instead:

```sql
SELECT name, __order FROM 'default'
WHERE CHILD_OF('/menu') AND __order > $1
ORDER BY __order
LIMIT 20;
```

And to page an entire tree rather than one level, use `__tree_order`, which sorts
into document order — each node before its descendants, each subtree contiguous:

```sql
SELECT path, __tree_order FROM 'default'
WHERE DESCENDANT_OF('/menu') AND __tree_order > $1
ORDER BY __tree_order
LIMIT 20;
```

See [Editorial order](./common-query-patterns.md#editorial-drag-and-drop-order)
for the difference between `path` and `__order`.

:::info Opaque cursors
`__order` and `__tree_order` values are tokens. Pass them back as **bound
parameters**, exactly as received — don't parse, construct, or interpolate them.
Their internal format is not part of the API.
:::

## HTTP API

The child-listing endpoint paginates with `cursor` and `limit`:

```bash
# First page
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}?limit=50

# Next page — pass back the previous response's next_cursor
GET /api/repository/{repo}/{branch}/head/{workspace}/{path}?limit=50&cursor=<next_cursor>
```

Adding either parameter switches the response to the paginated shape:

```json
{
  "items": [ /* child nodes */ ],
  "next_cursor": "eyJsYXN0X2tleSI6…",
  "total": null
}
```

`next_cursor` is a base64 token, `null` on the last page. Children come back in
editorial order, and the cursor seeks directly into that order. `limit` defaults
to 100.

Two behaviours to code against:

- **A short page is not necessarily the last page.** Permission filtering is
  applied per page, so a page can return fewer than `limit` rows and still have
  more to come. Drive the loop from `next_cursor`, never from the row count.
- **A cursor is only valid for the listing that issued it.** Cursors are tagged
  with the ordering they belong to; one from a different listing — or from an
  older server version — is rejected with `400` and an explanatory message rather
  than silently returning the wrong rows. Restart pagination without a cursor.

## JavaScript client

```typescript
let cursor: string | undefined;
do {
  const page = await ws.nodes().listChildrenPage('/menu', { cursor, limit: 50 });
  for (const child of page.items) {
    console.log(child.name);
  }
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

`listChildren(parentPath)` fetches every child in one call — fine for a menu,
wrong for a folder with 50,000 nodes. Reach for `listChildrenPage` when the child
count is unbounded.

The same short-page rule applies: loop until `nextCursor` is `null`, not until a
page comes back smaller than `limit`.

## Counting total pages

Keyset pagination deliberately has no "page 47 of 300". If you need a total:

```sql
SELECT COUNT(*) FROM 'default' WHERE node_type = 'blog:Article';
```

Run it once and cache it — recomputing a count on every page is usually more
expensive than the page itself. For infinite scroll, prefer showing "load more"
until `next_cursor` is `null` over computing a total at all.

## Common mistakes

- **Mixing cursor and sort columns.** The single most common cause of dropped
  and duplicated rows. See [the rule](#the-one-rule-that-matters).
- **Treating a short page as the end.** Use the cursor, not the row count.
- **Cursoring on a non-unique column without a tie-break.** Rows sharing a cursor
  value straddle the page boundary.
- **Interpolating a cursor into SQL.** Use bound parameters — cursor values are
  opaque and may contain characters that need no escaping only because you never
  escaped them.
- **Offset for deep pages.** `OFFSET 100000` walks 100,000 rows to throw them
  away.
