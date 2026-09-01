---
sidebar_position: 3
title: Asset Processing
description: How an uploaded file becomes searchable — processing rules, the task vocabulary, extraction status, and extending the pipeline with a plugin
---

# Asset Processing

Uploading a file does not make it searchable. Something has to open the bytes,
pull text out, chunk it and embed it. This guide covers that pipeline: what
RaisinDB does natively, how you configure it, how to find out what went wrong,
and how a distribution extends it to formats the core server cannot read.

## What the core server can read

RaisinDB's binary vocabulary is deliberately narrow:

| Format | Core server |
|---|---|
| `application/pdf` | Text extraction to markdown, with OCR fallback for scanned pages |
| `image/*` | CLIP embedding of the image itself |
| Word, PowerPoint, Excel, OpenDocument | **Nothing** — no reader |
| Video, audio | **Nothing** |
| Thumbnails, page previews, resized derivatives | **Nothing** — there is no rasterizer |

That is a boundary, not a backlog. LibreOffice, ffmpeg, ImageMagick and headless
Chrome are large native dependencies that must not live inside the database
process. They are added by a [function-binding plugin](#extending-the-pipeline),
and the pipeline is built so that the *same configuration* works on a server with
one and a server without — it just reports honestly which is which.

## Processing rules

A **processing rule** is the routing table for uploaded binaries. It says WHICH
nodes (matcher) get WHICH work (an ordered list of task slugs). Rules are
per-repository, evaluated in `order`, and the first match wins.

Manage them in the Admin Console under **AI → Processing Rules**, over the
[HTTP API](#http-api), or ship them in a package (below).

```yaml
- id: pdfs
  name: PDFs
  order: 10
  matcher:
    type: mime_type
    mime_type: application/pdf
  settings:
    tasks: [extract_text]
    pdf_strategy: auto          # auto | native_only | ocr_only | force_ocr
    store_extracted_text: true
    trigger_embedding: true

- id: images
  name: Images
  order: 20
  matcher:
    type: mime_type
    mime_type: image/*
  settings:
    tasks: [image_embedding]
```

### Matchers

| `type` | Fields | Matches |
|---|---|---|
| `all` | — | every node |
| `node_type` | `node_type` | e.g. `raisin:Asset` |
| `path` | `pattern` | glob: `/docs/**`, `/images/*` |
| `mime_type` | `mime_type` | see below |
| `workspace` | `workspace` | one workspace by name |
| `property` | `name`, `value` | a property equals a string |
| `combined` | `matchers` | **all** of them (AND) |

Mimetype patterns accept four forms:

```yaml
mime_type: application/pdf                              # exact
mime_type: image/*                                      # family
mime_type: application/vnd.openxmlformats-officedocument.*   # subtype prefix
mime_type: "*"                                          # anything
```

The subtype-prefix form matters for Office documents: the OOXML types run past
60 characters and differ only near the end, so spelling all three out invites a
typo — and a mistyped mimetype matches nothing, with no error anywhere.

### Tasks

`settings.tasks` is an ordered list of slugs. The set is **open** — a slug a
plugin services is valid even if this build has never heard of it.

| Slug | Performed by |
|---|---|
| `extract_text` | the core server |
| `image_embedding` | the core server (CLIP) |
| `doc_to_markdown` | a plugin providing `media.doc.toMarkdown` |
| `doc_to_pdf` | a plugin providing `media.doc.toPdf` |
| `doc_thumbnail` | a plugin providing `media.doc.thumbnail` |
| `image_resize` | a plugin providing `media.image.resize` |
| `image_ocr` | a plugin providing `media.image.ocr` |
| `video_thumbnail` | a plugin providing `media.video.thumbnail` |
| `video_extract_audio` | a plugin providing `media.video.extractAudio` |
| `image_caption`, `image_keywords` | **you**, in a trigger function |

Captioning is deliberately not a rule setting. Generating alt text is a
judgement call with a model and a prompt behind it — both product decisions — so
it belongs in a trigger function calling `raisin.ai.completion`. RaisinDB's half
of that contract is the retrieval side, and it is already done: `raisin:Asset`
marks `description`, `alt_text` and `keywords` as `[Fulltext, Vector]`, so
whatever your trigger writes there becomes semantically searchable through the
ordinary write path.

:::note `tasks: []` is not the same as omitting `tasks`
An **empty** list means "match these nodes and deliberately do nothing" — a real
configuration for an opt-out rule ordered ahead of a broader one. An **absent**
list means "fall back to the legacy boolean settings and the mimetype defaults".
:::

## Shipping rules in a package

Put them in `processing-rules/` and they install with everything else:

```
my-package/
  manifest.yaml
  nodetypes/
  workspaces/
  processing-rules/
    assets.yaml        # one rule, or a list of them
  content/
```

One file may hold a single rule or a list. Prefer a list for rules that only
make sense together, because splitting them across files hides the **order**.

This exists so an application's handling of uploaded files travels with the
application. Without it, a package could ship the node type for its documents,
the workspace they live in and the trigger that captions them — and still need a
human to retype four rules into a console, or the uploads would sit unindexed
with nothing saying why.

:::warning Install policy: an existing rule is left alone
Reinstalling a package **never** overwrites a rule id that already exists. An
operator who narrowed a rule on their server — turned OCR off because it was too
slow, pointed a matcher at one path — keeps their version across every redeploy.

This differs from how a workspace merges. A workspace adds `allowed_node_types`
additively, because permitting one more type cannot break what is there. A rule
cannot merge that way: its matcher and its task list are one decision, and half
your rule combined with half the operator's is a third rule neither of you
wrote. To push a change, rename the id.
:::

## What happened to my file? `__extract_status`

Every asset carries a durable record of what the extractors did with it, in
engine-owned properties. Read it with SQL:

```sql
SELECT path,
       properties->>'__extract_status'::String AS status,
       properties->>'__extract_detail'::String AS detail,
       properties->>'__extract_source'::String AS source,
       properties->>'__extract_chars'::String  AS chars
  FROM 'assets'
 WHERE node_type = 'raisin:Asset';
```

| Status | Meaning | What to do |
|---|---|---|
| `ok` | text extracted and stored | nothing |
| `empty` | a reader opened it; it genuinely holds no text | nothing |
| `unsupported` | **nothing on this server can read these bytes** | install a plugin that can, then re-run |
| `delegated` | **a loaded plugin was handed the work and has not written back** | investigate the plugin-side job |
| `failed` | a reader claimed the file and errored | retryable |

The two that need action look similar and are completely different diagnoses:

```sql
-- The capability is MISSING. A durable to-do list for the day you install
-- a plugin that reads these formats.
SELECT path, properties->>'__extract_detail'::String FROM 'assets'
 WHERE properties->>'__extract_status'::String = 'unsupported';

-- The capability is PRESENT and the handover was dropped. This is an alert,
-- not a backlog — a plugin-side job died or a trigger never fired.
SELECT path, properties->>'__extract_detail'::String FROM 'assets'
 WHERE properties->>'__extract_status'::String = 'delegated';
```

A durable status is the point. Before it, a `.docx` uploaded to a server with no
reader became a node with no text and **no record that anything was skipped** —
indistinguishable from an empty document forever, and impossible to find later
when a plugin gained the format.

### Extraction runs once per binary

The artifact carries a fingerprint of the bytes it was made from. Writing it
emits `node:updated`, which is the same event that queues extraction — so
without a gate one upload would extract forever. The gate compares the stored
fingerprint against the node's current binary: same bytes, nothing to do.
**Replacing the file** changes the fingerprint and re-extracts.

## Extending the pipeline

A distribution adds formats by loading a **function-binding plugin**, which
contributes `raisin.<namespace>.*` bindings and the trusted native callbacks
behind them. Plugins are loaded once at startup from the plugin directory
(`RAISIN_PLUGIN_DIR`, else `<data_dir>/plugins`).

The core server names plugin methods as plain strings and depends on none of
them. That is what lets one rule set behave correctly on both kinds of server:

- **No plugin loaded** — `doc_to_markdown` is reported blocked with the reason
  `plugin_missing: media.doc.toMarkdown`, and matching assets record
  `__extract_status = 'unsupported'`.
- **Plugin loaded** — the same task is planned and runs, and matching assets
  record `delegated` until the result is written back.

### Handing text back: `raisin.assets.setExtractedText`

Because plugin work happens in the function layer, the text it produces starts
its life in JavaScript. This binding is how it reaches the index:

```js
// A node_event trigger on raisin:Asset, gated on the mimetype
const staged = raisin.media.upload(node.getResource('./file'));
const job    = raisin.media.doc.toMarkdown(staged.key);
// ...poll the job, then:
const md = raisin.media.fetch(job.outputKey);

await raisin.assets.setExtractedText(workspace, node.id, md.text, {
  source: 'plugin-libreoffice',
});
// → { status: 'ok', source, chars, stored }
```

The extraction properties are engine-owned, so a function cannot write
`__extracted_text` directly — this is the sanctioned door, and it is narrow on
purpose. It takes the text and **nothing the server already knows**:

- **No fingerprint.** Stamped server-side from the node as it stands. A
  fingerprint computed on the caller's side that disagreed by one byte would
  never match the extraction gate, so every writeback would re-trigger
  extraction, which would delegate again — an unbounded loop minting a node
  revision, a full-text reindex and an embedding call each turn.
- **No chunking, no embedding.** Writing the property emits `node:updated`, and
  the ordinary indexing path takes it from there — the same path, the same
  chunker and the same index ids as text the core server extracted itself.

:::danger Never chunk or embed in a function
Chunk ids follow a fixed grammar (`{node}#doc#{chunk}`). An index built with ids
the live search path never produces returns zero rows and reports no fault — no
error, no log line. Hand the server the text and stop.
:::

Note the symmetry that makes this safe: the core server's own PDF path produces
**markdown** too. Both sides of the boundary speak the same thing, and
everything after the writeback is one implementation.

## Checking what a server can do

### In the Admin Console

**AI → Processing Rules** shows three things beyond the rules themselves:

- **Test Match** — enter a path and mimetype and see which rule matches *and*
  what it will actually do here: tasks that will run (with the plugin method
  servicing each) and tasks that will not, with the reason.
- **Server capabilities** — loaded plugins, the resolved per-format table, and
  any plugin file the loader **refused**. A rejected plugin (an ABI mismatch
  above all) leaves a server that boots perfectly and has silently lost those
  bindings for every tenant; this is where you see it.
- **Asset extraction health** — counts by `__extract_status` for a workspace.

### HTTP API

```http
POST /api/repository/{repo}/ai/rules/test
{ "path": "/docs/report.docx",
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
```

```json
{
  "matched": true,
  "matched_rule": { "id": "office-documents", "...": "..." },
  "effective_tasks": ["doc_to_markdown"],
  "plan": {
    "runnable": [],
    "blocked": [
      { "slug": "doc_to_markdown",
        "blocked": { "reason": "plugin_missing",
                     "method": "media.doc.toMarkdown" } }
    ]
  }
}
```

`effective_tasks` is what the rule **asks for**; `plan` is what will **happen on
this server**. A rule is portable configuration; a plan is that configuration
resolved against one machine's loaded plugins, and the two are routinely
different.

Blocked reasons, each a different fix:

| Reason | Fix |
|---|---|
| `plugin_missing` | the plugin providing that method is not on this server |
| `handled_above` | a real task, but the product layer's — write the trigger |
| `unknown` | nothing claims this slug; check the spelling |
| `malformed_slug` | not `[a-z][a-z0-9_]{0,63}` |

Other endpoints:

```http
GET    /api/repository/{repo}/ai/rules          # list
POST   /api/repository/{repo}/ai/rules          # create
GET    /api/repository/{repo}/ai/rules/tasks    # task catalogue + availability here
PUT    /api/repository/{repo}/ai/rules/reorder
GET/PUT/DELETE /api/repository/{repo}/ai/rules/{rule_id}
GET    /api/admin/management/plugins            # loaded, refused, capabilities
```

## Multi-node clusters

Derived state — the full-text index, vectors, extracted text — is rebuilt on
**every** node, because replication carries records, not indexes. Two
consequences:

- **A plugin must be installed on every node**, or a replica parks its assets on
  `unsupported` while the primary reports `ok`. Rules replicate; plugin
  capability does not.
- **Embedding cost scales with node count.** Each node fills its own index and
  pays its own embedder calls.

A node that was down or joined late has correct records and cold indexes. The
rebuild jobs are the repair — see
[Vector Index Management](./embeddings-and-vector-search.md#vector-index-management).

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md) — querying what comes out
- [RAG Patterns](./rag-patterns.md) — building retrieval over your documents
- [Creating Packages](../packages/creating-packages.md) — shipping rules with an application
