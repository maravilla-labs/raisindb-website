---
sidebar_position: 10
---

# Resource Serving API

Serve a subtree of nodes like a static file server: HTML, CSS, JavaScript, images and PDFs over a path-shaped URL. This backs [MCP-UI interactive widgets](../../guides/mcp/interactive-widgets.md) and works on its own for any small static site: a docs page, a status widget, a customer-facing microsite.

## Endpoint

```
GET /resources/{repo}/{branch}/{workspace}/{path}
```

- `{path}` is the node path inside the workspace, at any depth (`site/index.html`, `widgets/order-card/img/logo.png`).
- Authentication is optional. Send `Authorization: Bearer <token>` to read as that user, or omit it to read as the anonymous principal.

Example, after uploading `index.html` under a `raisin:StaticSiteFolder` named `site`:

```bash
curl -i http://localhost:8080/resources/myapp/main/content/site/index.html \
  -H "Authorization: Bearer $TOKEN"
```

```
HTTP/1.1 200 OK
content-type: text/html
content-length: 54
cache-control: public, max-age=60

<html><body><h1>Hello from RaisinDB</h1></body></html>
```

## What is served

A path is served only when a `raisin:StaticSiteFolder` sits at or above it. Marking a folder with that type is what publishes the subtree; retyping or deleting the folder unpublishes it. There is no separate flag or allowlist.

Underneath that gate, the normal row-level security applies: the caller (or the anonymous role) must be allowed to read the specific node. A subtree is therefore public exactly when the `anonymous` role can read it via `raisin:access_control`.

| Resolved node | Response |
|---|---|
| `raisin:Asset` | Streams the `file` bytes with the stored MIME type |
| A folder, or a path ending in `/` | Serves the folder's index document (`index.html` by default) |
| No covering `raisin:StaticSiteFolder` | `404` |
| Not readable by the caller | `404` |

Both denial cases return `404` so that existence is not revealed. Relative references inside a served HTML file (`./style.css`, `./img/logo.png`) resolve as ordinary path lookups in the same subtree.

The "is this subtree published" decision is resolved with system auth and cached for about 60 seconds, so creating or retyping a `raisin:StaticSiteFolder` takes effect within a minute. Put the folder at a named path such as `/site`; a `raisin:StaticSiteFolder` at the bare workspace root `/` is not discovered.

## Caching

- The index document is served with `Cache-Control: no-cache` unless `serving_config.cache_control` overrides it, so a cached `index.html` never keeps an old SPA route table alive.
- Other assets default to `Cache-Control: public, max-age=3600`.
- If the asset node has a `content_hash` string property, it is sent as the `ETag` and `If-None-Match` requests get `304`.

## The `raisin:StaticSiteFolder` NodeType

`raisin:StaticSiteFolder` extends `raisin:Folder`. Its presence publishes the subtree, and its optional `serving_config` property drives response headers for everything beneath it. Plain `raisin:Folder` nodes below it still serve; headers come from the nearest `raisin:StaticSiteFolder` ancestor.

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

Because it is an ordinary node, a package can ship it at a fixed path (`content/<workspace>/<folder>/.node.yaml`), so installing the package publishes the subtree. Over HTTP:

```bash
curl -X POST http://localhost:8080/api/repository/myapp/main/head/content/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"site","node_type":"raisin:StaticSiteFolder","properties":{"serving_config":{"index_document":"index.html","cache_control":"public, max-age=60"}}}'
```

### `serving_config`

All fields are optional.

| Field | Type | Effect |
|---|---|---|
| `frame_ancestors` | `string[]` | Origins allowed to embed pages from this subtree in an iframe. Emitted as `Content-Security-Policy: frame-ancestors ...`. When absent no header is sent and browsers refuse cross-origin framing. |
| `cors_allowed_origins` | `string[]` | Origins allowed to make cross-origin requests to these resources. Extends the hierarchical CORS resolution (folder, then repo, then tenant, then server config). |
| `cache_control` | `string` | Overrides `Cache-Control` for the subtree, including the index document. |
| `index_document` | `string` | File served for a folder or trailing-slash request. Default `index.html`. |

:::info Two settings, two questions
`frame_ancestors` answers "may a host page iframe this?". `cors_allowed_origins` answers "may script on that page call back into RaisinDB from another origin?". A widget that is iframed cross-origin and also calls the API needs both.
:::

### CORS and credentials

- An explicitly listed origin is reflected in `Access-Control-Allow-Origin`, with `Access-Control-Allow-Credentials: true` and `Vary: Origin`. Use this for a widget that sends cookies or a bearer token.
- `"*"` sends `Access-Control-Allow-Origin: *` without the credentials header. Browsers do not allow a wildcard with credentials, so a wildcard is only useful for content that is readable anonymously.

## Related routes

| Route | Auth model | Use for |
|---|---|---|
| `GET /resources/{repo}/{branch}/{ws}/{path}` | Bearer token or anonymous, then row-level security | Serving a static-site or widget subtree |
| `GET /api/repository/{repo}/{branch}/head/{ws}/{path}?command=download` (or `@file`) | Bearer token or anonymous, then row-level security | Single-node byte reads and downloads |
| `.../{path}/raisin:download?sig=&exp=` from `raisin:sign` | HMAC signature, no token | Short-lived shareable links |

## See also

- [Interactive Widgets (MCP-UI)](../../guides/mcp/interactive-widgets.md)
- [MCP API](./mcp-api.md)
