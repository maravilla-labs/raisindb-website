---
sidebar_position: 3
title: Asset Processing
description: How an uploaded file becomes searchable, processing rules, the task vocabulary, extraction status, and extending the pipeline with a plugin
---

# Asset Processing

Uploading a file does not make it searchable by itself. Something has to open
the bytes, pull text out, chunk it and embed it. This guide covers that
pipeline: what the core server does natively, how you configure it with
processing rules, how to find out what happened to a file, and how a plugin
adds formats the core server cannot read.

## What the core server can read

| Format | Core server |
|---|---|
| `application/pdf` | Text extraction to markdown, with OCR for scanned pages |
| `text/*` | Read as text (up to 256 KB is stored inline) |
| `image/*` | OCR of the image, and a CLIP embedding of the image itself |
| Word, PowerPoint, Excel, OpenDocument | No reader; a plugin is needed |
| Video, audio | No reader; a plugin is needed |
| Thumbnails, page previews, resized images | Not produced; a plugin is needed |

Office converters, ffmpeg and image rasterizers are large native dependencies
that stay out of the database process. A distribution adds them with a
[function-binding plugin](#extending-the-pipeline). The same processing rules
work on a server with the plugin and on one without; the difference shows up
in the extraction status and in the rule test endpoint, not as silence.

## Processing rules

A processing rule says which nodes (the matcher) get which work (an ordered
list of task slugs). Rules are per repository, evaluated in `order`, and the
first match wins. A new repository starts with three defaults: `pdf-default`
(order 10, PDFs), `image-default` (order 20, images) and `default` (order 100,
everything).

Manage them in the admin console (repository page, **AI Rules** tab), over the
[HTTP API](#http-api), or ship them in a package.

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

Rule fields: `id`, `name`, `order`, `enabled` (default true), `matcher`,
`settings`.

### Matchers

| `type` | Fields | Matches |
|---|---|---|
| `all` | none | every node |
| `node_type` | `node_type` | e.g. `raisin:Asset` |
| `path` | `pattern` | glob with `*`, `**` and `?`: `/docs/**`, `/images/*` |
| `mime_type` | `mime_type` | see below |
| `workspace` | `workspace` | one workspace by name |
| `property` | `name`, `value` | a property equals a string |
| `combined` | `matchers` | all of them (AND) |

Mimetype patterns accept four forms:

```yaml
mime_type: application/pdf                                   # exact
mime_type: image/*                                           # family
mime_type: application/vnd.openxmlformats-officedocument.*   # subtype prefix
mime_type: "*"                                               # anything with a mimetype
```

The subtype-prefix form is the convenient one for Office documents, whose
types are long and differ only at the end. Matching is case-insensitive and
ignores parameters such as `; charset=utf-8`.

### Settings

| Setting | Meaning |
|---|---|
| `tasks` | ordered list of task slugs (below) |
| `pdf_strategy` | `auto` (default), `native_only`, `ocr_only`, `force_ocr` |
| `store_extracted_text` | keep the text on the node in `__extracted_text` |
| `max_stored_text_length` | truncate the stored text |
| `trigger_embedding` | queue an embedding job after extraction |
| `generate_image_embedding` | CLIP embedding for images |
| `embedding_model` | override the tenant's embedding model for these nodes |
| `chunking` | `{ chunk_size, splitter, overlap }`, overriding the tenant default |
| `ocr_languages` | Tesseract language codes, up to 8 |
| `ocr_min_word_confidence` | 0 to 100, default 50 |

### Tasks

`settings.tasks` is an ordered list of slugs of the form `[a-z][a-z0-9_]{0,63}`.
The set is open: a slug a plugin services is valid even if this build has never
heard of it.

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
| `image_caption`, `image_keywords` | a trigger function you write |

Captioning is not a rule setting because the model and the prompt are product
decisions. Write a `node_event` trigger on `raisin:Asset` that calls
`raisin.ai.completion` with an image content part and stores the result in
`description`, `alt_text` or `keywords`. Those three fields on `raisin:Asset`
are indexed `[Fulltext, Vector]`, so a caption is searchable by meaning as
soon as it is written.

An empty list (`tasks: []`) means "match these nodes and do nothing", which is
how you write an opt-out rule ordered ahead of a broader one. An absent `tasks`
falls back to the mimetype defaults: `extract_text` for text-bearing types
and images, `image_embedding` for images.

## Shipping rules in a package

Put rule files in `processing-rules/` and they install with everything else:

```text
my-package/
  manifest.yaml
  nodetypes/
  workspaces/
  processing-rules/
    assets.yaml        # one rule, or a list of them
  content/
```

A file may hold a single rule or a list; a rule without an `id` takes the file
name. Prefer one list for rules that belong together, so their order is visible
in one place.

On install, an existing rule id is handled by the install mode. In `skip`
mode the rule already on the server is left alone, so an operator who tuned a
rule keeps their version. In `sync` (the CLI default) and `overwrite` modes the
package's rule replaces it. Rules are never merged field by field: a matcher
and its task list are one decision.

## What happened to my file? `__extract_status`

Every asset carries a record of what the extractors did with it, in
engine-owned properties:

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
| `empty` | a reader opened it and found no text | nothing |
| `unsupported` | nothing on this server can read these bytes | install a plugin for the format, then re-run |
| `delegated` | a loaded plugin was handed the work and has not written back yet | check the plugin-side job |
| `failed` | a reader claimed the file and errored | retry with `raisin.assets.reextract` |

`unsupported` and `delegated` look alike and mean different things. The first
is a durable to-do list for the day a plugin gains the format. The second means
the capability is present and the handover is still open, so an asset that
stays `delegated` points at a plugin-side failure.

```sql
-- Missing capability
SELECT path, properties->>'__extract_detail'::String FROM 'assets'
 WHERE properties->>'__extract_status'::String = 'unsupported';

-- Handover never completed
SELECT path, properties->>'__extract_detail'::String FROM 'assets'
 WHERE properties->>'__extract_status'::String = 'delegated';
```

Other engine-owned properties: `__extracted_text` (the text, indexed
`[Fulltext]`), `__extract_source` (`core-pdf`, `core-pdf-ocr`,
`core-image-ocr`, `text`, or the source a plugin named), `__extract_chars`
(full length before truncation), `__extract_confidence` (OCR), and
`__extract_fingerprint`.

### Extraction runs once per binary

The fingerprint records which bytes the text was made from. Writing the text
emits `node:updated`, the same event that queues extraction, and the
fingerprint is what stops that from looping: same bytes, nothing to do.
Replacing the file changes the fingerprint and re-extracts. To force a re-run
without replacing the file, call `raisin.assets.reextract(workspace, nodeRef)`
from a function; it clears the artifact and returns
`{ queued, node, previous_status }`.

## Extending the pipeline

A distribution adds formats by loading a function-binding plugin, which
contributes `raisin.<namespace>.*` bindings backed by native code. Plugins are
loaded once at startup from `RAISIN_PLUGIN_DIR`, or `<data_dir>/plugins` when
that is unset.

The core server names plugin methods as strings and depends on none of them,
which is what lets one rule set behave predictably on both kinds of server:

- No plugin loaded: `doc_to_markdown` is reported blocked with
  `plugin_missing: media.doc.toMarkdown`, and matching assets record
  `__extract_status = 'unsupported'`.
- Plugin loaded: the same task is planned and runs, and matching assets record
  `delegated` until the result is written back.

Calling an absent plugin binding from a function does not throw; it returns
`{ error: 'plugin_absent' }`.

### Handing text back: `raisin.assets.setExtractedText`

Plugin work runs in the function layer, so the text it produces starts life in
JavaScript. This binding is how it reaches the index:

```js
// A node_event trigger on raisin:Asset, gated on the mimetype.
// The raisin.media.* calls come from the media plugin; their exact
// shape is that plugin's contract.
const md = await convertWithPlugin(node);   // e.g. raisin.media.doc.toMarkdown(...)

const r = await raisin.assets.setExtractedText(workspace, node.id, md, {
  source: 'plugin-libreoffice',            // recorded in __extract_source; default 'plugin'
  store: true,                             // keep the text on the node; default true
});
// r => { status: 'ok', source: 'plugin-libreoffice', chars: 48, stored: true }
```

`nodeRef` is a node id or a path starting with `/`. The extraction properties
are engine-owned, so a function cannot write `__extracted_text` directly; this
binding is the one door. It takes the text and nothing else:

- No fingerprint. It is computed server-side from the node as it stands, so it
  always matches the extraction gate.
- No chunking, no embedding. Writing the text emits `node:updated`, and the
  ordinary indexing path chunks and embeds it exactly as it does text the core
  server extracted itself. Chunk ids follow one grammar, and an index built
  from a second chunker would not be found by search, so leave that to the
  server.

The core server's own PDF path produces markdown, and a plugin's document
converter produces markdown, so everything after the writeback is one
implementation.

## Checking what a server can do

### In the admin console

The repository's **AI Rules** tab shows, beyond the rules themselves:

- **Test Match**: enter a path and mimetype and see which rule matches and what
  it will do on this server: tasks that will run (with the plugin method
  servicing each) and tasks that will not, with the reason.
- **Server capabilities**: loaded plugins, the resolved per-format table, and
  any plugin file the loader rejected, for example on an ABI mismatch.
- **Asset extraction health**: counts by `__extract_status` for a workspace.

### HTTP API

```http
POST /api/repository/{repo}/ai/rules/test
{ "path": "/docs/report.docx",
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
```

```json
{
  "matched": true,
  "matched_rule": { "id": "office-documents", "name": "Office documents", "order": 15, "enabled": true,
                    "matcher": { "type": "mime_type", "mime_type": "application/vnd.openxmlformats-officedocument.*" },
                    "settings": { "tasks": ["doc_to_markdown"] } },
  "rules_evaluated": 1,
  "effective_tasks": ["doc_to_markdown"],
  "plan": {
    "runnable": [],
    "blocked": [
      { "slug": "doc_to_markdown",
        "blocked": { "reason": "plugin_missing", "method": "media.doc.toMarkdown" } }
    ]
  }
}
```

The request also accepts `node_type`, `workspace` and `properties` for the
other matcher types. `effective_tasks` is what the rule asks for; `plan` is
what will happen on this server, with `runnable` entries carrying `via` (the
plugin method, or `null` for native tasks).

Blocked reasons:

| Reason | Fix |
|---|---|
| `plugin_missing` | the plugin providing that method is not on this server |
| `handled_above` | a task for a trigger function (`image_caption`, `image_keywords`); write the trigger |
| `unknown` | nothing claims this slug; check the spelling |
| `malformed_slug` | not `[a-z][a-z0-9_]{0,63}` |

Other endpoints:

```http
GET    /api/repository/{repo}/ai/rules              # list: { repo_id, rules[] }
POST   /api/repository/{repo}/ai/rules              # create (409 if the id exists)
GET    /api/repository/{repo}/ai/rules/tasks        # task catalogue with `available` per slug
PUT    /api/repository/{repo}/ai/rules/reorder      # { "rule_ids": [...] }
GET/PUT/DELETE /api/repository/{repo}/ai/rules/{rule_id}
GET    /api/admin/management/plugins                # { plugins, methods, rejected, capabilities }
```

## Multi-node clusters

Replication carries records, not indexes. Every node rebuilds derived state
(full-text index, vectors, extracted text) from the replicated node, which
has two consequences:

- A plugin must be installed on every node, or a replica records `unsupported`
  for assets the primary extracted. Rules replicate; plugin capability does not.
- Embedding cost scales with node count, because each node fills its own index.

A node that was down or joined late has correct records and cold indexes; the
rebuild jobs are the repair. See
[Vector Index Management](./embeddings-and-vector-search.md#vector-index-management).

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md): querying what comes out
- [RAG Patterns](./rag-patterns.md): building retrieval over your documents
- [Creating Packages](../packages/creating-packages.md): shipping rules with an application
