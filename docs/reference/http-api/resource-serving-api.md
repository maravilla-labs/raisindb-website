---
sidebar_position: 10
---

# Resource Serving API

Serve a subtree of nodes like a static file server — HTML, CSS, JS, images, PDFs — over a clean path-shaped URL. This backs [MCP-UI interactive widgets](../../guides/mcp/interactive-widgets.md) (`mode: uri-list`) but is useful on its own for any small static site: a public docs page, a status widget, a customer-facing microsite.

Unlike the [signed-URL asset endpoint](./nodes-api.md), this route uses the **same authentication and row-level security** as the rest of the API. It is also **deny-by-default**: a path is served only when a [`raisin:StaticSiteFolder` ancestor covers it](#what-is-servable), otherwise `404`. Underneath that gate it resolves nodes through the RLS-enforced service layer and **fails closed** — a folder is reachable exactly when the caller (or the [anonymous principal](../../guides/auth/authentication-setup.md)) is permitted to read it. No new auth mode; a folder is "public" precisely when the anonymous role already has read access via `raisin:access_control`.

## Endpoint

Served at the **site root** (not under `/api`), like the [MCP endpoint](./mcp-api.md):

```bash
GET /resources/{repo}/{branch}/{ws}/{*path}
```

- `{ws}` — the workspace the content lives in.
- `{*path}` — the full node path within that workspace (arbitrary depth: `widgets/order-card/img/logo.png`).
- Authentication is optional: send `Authorization: Bearer <token>` for authenticated reads, or omit it to resolve as the anonymous principal.

### Resolution behavior

All rows below assume the path is [servable](#what-is-servable) — i.e. a `raisin:StaticSiteFolder` ancestor covers it. Without one, every request returns `404` regardless of what the node is.

| Resolved node | Response |
|---|---|
| `raisin:Asset` | Streams the `file` bytes with the stored/guessed MIME type, inline. |
| `raisin:Folder` / `raisin:StaticSiteFolder`, or trailing-slash / empty path | Serves the folder's **index document** (`index.html` by default) if present. |
| No `raisin:StaticSiteFolder` ancestor covers the path | `404` (deny-by-default — the subtree is not published as a static site). |
| Not readable by the caller | `404` (fails closed — indistinguishable from "not found"). |

Relative references inside a served HTML file (`./style.css`, `./img/logo.png`) resolve as ordinary path lookups against the same subtree — no special handling needed.

### Caching

- **Assets** carry an `ETag` derived from the asset's `content_hash` and are cacheable; conditional requests (`If-None-Match`) get `304`.
- **The index document** defaults to `Cache-Control: no-cache` so a stale cached `index.html` never keeps serving an old SPA route table. Override per subtree with `serving_config.cache_control`.

## What is servable

`/resources` is **deny-by-default**. A path is served **only when a [`raisin:StaticSiteFolder`](#the-raisinstaticsitefolder-nodetype) ancestor covers it**. If no folder up the path is a `raisin:StaticSiteFolder`, the request returns **`404`** — even for a node the caller could otherwise read. Placing (or retyping) a `raisin:StaticSiteFolder` over a subtree is what publishes it as a static site.

- **The folder's presence *is* the allowlist.** There is no `servable`/`enabled` flag and no path-glob list to maintain. You mark a subtree servable by having a `raisin:StaticSiteFolder` somewhere at or above it; you unpublish it by deleting or retyping that folder.
- **ACL/RLS still governs per-asset reads underneath.** The gate is a coarse layer *on top of* row-level security, not a replacement for it. The order is: gate first (is this subtree published as a static site?), then RLS (may *this* caller read *this* specific node?). A published subtree is not automatically public — the anonymous or authenticated caller still needs read access via `raisin:access_control`.
- **The gate decision is the same for everyone.** It is resolved with **system auth**, so anonymous and authenticated callers get the identical published/not-published answer (RLS then differentiates who may read what underneath).
- **Bounded staleness (~60s).** The gate is **cached ~60s** (the same TTL as the CORS resolver), so creating, deleting, or retyping a `raisin:StaticSiteFolder` takes effect within about a minute — like the existing repo-level CORS config.
- **Whole workspace** servable = put a `raisin:StaticSiteFolder` at a **named** folder near the workspace root (e.g. `/site`); everything under it is then gated in. **Finer scoping** = deeper `raisin:StaticSiteFolder` folders plus ACL. Note: a `raisin:StaticSiteFolder` at the *bare* workspace root path `/` is **not discovered** — always use a named path.

### Configuring the gate through a package

Because a `raisin:StaticSiteFolder` is an ordinary content node, a **raisin package can ship it** at a fixed authoring path — the same way a package ships any other config node (an `raisin:Integration`, an `raisin:McpServer`, …). Installing the package makes that subtree servable via `/resources`; there is no server config or admin API involved.

```yaml
# content/<encoded-workspace>/<folder>/.node.yaml
node_type: raisin:StaticSiteFolder
properties:
  serving_config:
    index_document: index.html
    frame_ancestors: ["https://host.example.com"]
    cors_allowed_origins: ["https://host.example.com"]
    cache_control: "public, max-age=3600"
```

## Response headers

Headers depend on the **nearest ancestor folder** of the resolved path:

- A plain `raisin:Folder` ancestor → **no** `Content-Security-Policy: frame-ancestors` and no extra CORS headers. Safe default: the content is **not embeddable** cross-origin.
- A `raisin:StaticSiteFolder` ancestor → its [`serving_config`](#serving_config) drives the response headers for everything under it.

This is an explicit, visible opt-in per subtree rather than a capability silently present on every folder.

## The `raisin:StaticSiteFolder` NodeType

`raisin:StaticSiteFolder extends raisin:Folder` — a narrow, opt-in subtype. It does double duty: its presence is what makes a subtree [servable at all](#what-is-servable) (deny-by-default gate), and its [`serving_config`](#serving_config) drives embeddability and cross-origin behavior for everything under it. A subtree with **no** `raisin:StaticSiteFolder` ancestor is not served — every path under it returns `404`. Plain `raisin:Folder` nodes *below* a `raisin:StaticSiteFolder` still serve (the gate only needs *some* `raisin:StaticSiteFolder` ancestor); [response headers](#response-headers), however, come from the nearest ancestor folder, so a plain `raisin:Folder` nearest the path adds no header overrides of its own.

```yaml
node_type: raisin:StaticSiteFolder
properties:
  description: Order-card widget
  serving_config:
    frame_ancestors:
      - https://host.example.com
      - https://chatgpt.com
    cors_allowed_origins:
      - https://host.example.com
    cache_control: "public, max-age=3600"
    index_document: index.html
```

### `serving_config`

An optional `Object` property. All fields are optional.

| Field | Type | Effect |
|---|---|---|
| `frame_ancestors` | `string[]` | Origins allowed to iframe this subtree's pages. Emitted as `Content-Security-Policy: frame-ancestors …` (no `X-Frame-Options`, so CSP governs). **Absent ⇒ no header ⇒ not embeddable** (deny-by-default). |
| `cors_allowed_origins` | `string[]` | Origins permitted to make cross-origin fetch/XHR calls to RaisinDB from a page in this subtree. Extends the existing hierarchical CORS resolution one level deeper (folder → repo → tenant → global). See [CORS and credentials](#cors-and-credentials) for how `"*"` is handled. |
| `cache_control` | `string` | Overrides the default `Cache-Control` for this subtree, including the index document (which is otherwise `no-cache`). |
| `index_document` | `string` | Filename served for a folder/trailing-slash request. Default `index.html`. |

:::info Two mechanisms, two problems
`frame_ancestors` controls **embeddability** (may a host origin iframe these pages at all). `cors_allowed_origins` controls **cross-origin script calls** (may client-side JS on the page call back into RaisinDB from another origin). A widget iframed cross-origin that also calls RaisinDB APIs needs **both** configured.
:::

:::warning Deny-by-default
With no `serving_config` (or no `frame_ancestors`), **no** `frame-ancestors` header is emitted and the content is not embeddable cross-origin. Cross-origin framing always requires explicit origins.
:::

### CORS and credentials

For `cors_allowed_origins`, a wildcard `"*"` and credentialed requests are **mutually exclusive** — the endpoint never sends both:

- **An explicitly-listed origin** → the response **reflects that origin** in `Access-Control-Allow-Origin`, adds `Access-Control-Allow-Credentials: true`, and sets `Vary: Origin`. This is the mode you want for a widget that makes credentialed calls back into RaisinDB.
- **`"*"`** → the response sends `Access-Control-Allow-Origin: *` **without** `Access-Control-Allow-Credentials`. Browsers reject `*` combined with credentials, and reflecting an arbitrary origin *with* credentials would let any site make credentialed cross-origin reads against RLS-gated content — so a wildcard is deliberately anonymous-only.

List the specific origins whenever the page needs to send cookies or an `Authorization` header cross-origin; reserve `"*"` for content that is safe to read anonymously.

## Relationship to other byte-serving routes

| Route | Auth model | Use for |
|---|---|---|
| `GET /resources/{repo}/{branch}/{ws}/{*path}` | Session / bearer / anonymous → **RLS** | Serving a static-site / widget subtree like a file server. |
| `GET /api/repository/{repo}/{branch}/head/{ws}/{*node_path}` (`@property`, `?command=download`) | Session / bearer / anonymous → RLS | CRUD-shaped single-node byte reads / downloads. |
| Signed-URL asset endpoint (`raisin:download` / `raisin:display?sig=&exp=`) | **HMAC signature** (bypasses RLS) | Short-lived shareable / expiring links. |

The signed-URL endpoint is a deliberately different trust model and stays orthogonal to the static endpoint.

## See also

- [Interactive Widgets (MCP-UI)](../../guides/mcp/interactive-widgets.md) — the guide that puts this endpoint to work.
- [MCP API](./mcp-api.md) — the `ui` binding and `resources/read` blob reads.
