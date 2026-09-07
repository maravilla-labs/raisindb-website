---
sidebar_position: 4
---

# 4. Branching Workflow

In this tutorial you take an article through draft, review and publish on
branches, then tag the published state. Everything runs as SQL over HTTP, so
you only need `curl` and a token.

## What you'll learn

- Creating a branch for editorial work
- Writing on a branch in isolation
- Reviewing what changed and merging it into `main`
- Tagging the published revision and reading it back later

## Prerequisites

A running server, a token, and a repository with a `content` workspace that
accepts `raisin:Page` nodes. If you are starting fresh:

```bash
T=<your token>; H="Authorization: Bearer $T"; J="Content-Type: application/json"
curl -s -X POST localhost:8080/api/repositories -H "$H" -H "$J" -d '{"repo_id":"blog"}'
curl -s -X PUT localhost:8080/api/workspaces/blog/content -H "$H" -H "$J" \
  -d '{"name":"content","allowed_node_types":["raisin:Folder","raisin:Page"],"allowed_root_node_types":["raisin:Folder","raisin:Page"]}'
```

A small helper keeps the examples short. It posts SQL to a branch (the second
argument), defaulting to `main`:

```bash
sql() { curl -s -X POST "localhost:8080/api/sql/blog/${2:-main}" -H "$H" -H "$J" \
  -d "{\"sql\":$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}"; echo; }
```

## Step 1: Publish a first article on main

```bash
sql "INSERT INTO 'content' (path, node_type, name, properties)
     VALUES ('/hello', 'raisin:Page', 'hello', '{\"title\":\"Hello\"}'::jsonb)"
# {"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1,...}
```

## Step 2: Create a draft branch

```bash
sql "CREATE BRANCH 'draft/hello-rewrite' FROM 'main'"
# {"columns":["result"],"rows":[{"result":"Branch 'draft/hello-rewrite' created"}],...}
```

The branch is a copy of `main` at this moment: same nodes, same schema.

## Step 3: Write on the branch

Address the branch in the URL. A slash in the name is URL-encoded:

```bash
sql "UPDATE 'content' SET properties = '{\"title\":\"Hello from the draft\"}'::jsonb WHERE path = '/hello'" draft%2Fhello-rewrite
sql "INSERT INTO 'content' (path, node_type, name, properties)
     VALUES ('/hello-part-2', 'raisin:Page', 'hello-part-2', '{\"title\":\"Part two\"}'::jsonb)" draft%2Fhello-rewrite
```

`main` still shows the original:

```bash
sql "SELECT path, properties->>'title' AS title FROM 'content'"
# rows: [{"path":"/hello","title":"Hello"}]
sql "SELECT path, properties->>'title' AS title FROM 'content'" draft%2Fhello-rewrite
# rows: [{"path":"/hello","title":"Hello from the draft"},{"path":"/hello-part-2","title":"Part two"}]
```

## Step 4: Review the change

The editor asks what the draft changes relative to `main`:

```bash
sql "SHOW DIVERGENCE 'draft/hello-rewrite' FROM 'main'"
# rows: [{"branch":"draft/hello-rewrite","base":"main","ahead":2,"behind":0,"common_ancestor":"1788719729588-0"}]

curl -s "localhost:8080/api/management/repositories/default/blog/branches/draft%2Fhello-rewrite/diff/main" -H "$H"
# {"common_ancestor":"1788719729588-0",
#  "added":[{"node_id":"...","workspace":"content","path":"/hello-part-2","operation":"added"}],
#  "modified":[{"node_id":"...","workspace":"content","path":"/hello","operation":"modified"}],
#  "deleted":[]}
```

## Step 5: Merge into main

```bash
sql "MERGE BRANCH 'draft/hello-rewrite' INTO 'main' MESSAGE 'Publish hello rewrite'"
# rows: [{"result":"Merge completed","revision":1788719765785,"fast_forward":false,"nodes_changed":2}]

sql "SELECT path, properties->>'title' AS title FROM 'content'"
# rows: [{"path":"/hello","title":"Hello from the draft"},{"path":"/hello-part-2","title":"Part two"}]

sql "DROP BRANCH 'draft/hello-rewrite'"
```

Had someone edited `/hello` on `main` while the draft was open, the merge would
have failed with a conflict for that node. `SHOW CONFLICTS FOR MERGE ...`
lists the two versions, and [Merging Changes](/docs/guides/branching/merging-changes#conflicts)
shows how to resolve them.

## Step 6: Tag the release

Tags are created over the management API from a revision. Take the `main` head
after the merge:

```bash
REV=$(curl -s localhost:8080/api/management/repositories/default/blog/branches/main/head -H "$H" | python3 -c 'import json,sys;print(json.load(sys.stdin)["revision"])')
curl -s -X POST localhost:8080/api/management/repositories/default/blog/tags -H "$H" -H "$J" \
  -d "{\"name\":\"release-1\",\"revision\":\"$REV\",\"message\":\"First published rewrite\"}"
# {"name":"release-1","revision":"1788719765785-0","created_at":"...","created_by":"system","message":"First published rewrite","protected":false}
```

## Step 7: Read the release later

Keep editing `main`:

```bash
sql "UPDATE 'content' SET properties = '{\"title\":\"Hello v3\"}'::jsonb WHERE path = '/hello'"
```

The tag still reads the released state, over REST or SQL:

```bash
curl -s "localhost:8080/api/repository/blog/main/rev/$REV/content/hello" -H "$H"
# {"path":"/hello","properties":{"title":"Hello from the draft"}, ...}

sql "SELECT path, properties->>'title' AS title FROM 'content' WHERE __revision = '$REV'"
# rows: [{"path":"/hello","title":"Hello from the draft"},{"path":"/hello-part-2","title":"Part two"}]
```

If the newest edit was a mistake, move `main` back to the tag. History is
kept, so this can be undone the same way:

```bash
curl -s -X PUT localhost:8080/api/management/repositories/default/blog/branches/main/head \
  -H "$H" -H "$J" -d "{\"revision\":\"$REV\"}"
# 204
```

## Next steps

- [Working with Branches](/docs/guides/branching/working-with-branches) for the JavaScript client and REST forms
- [Revisions](/docs/concepts/versioning/revisions) for per-node history
