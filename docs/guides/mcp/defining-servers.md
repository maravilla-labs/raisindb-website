---
sidebar_position: 2
---

# Defining MCP Servers

An MCP server is a `raisin:McpServer` node in the **`mcp`** workspace. The engine looks the node up by `slug` and assembles its tool set from the node's data policy, its `tools` list and any function that carries an `mcp` block.

## The `raisin:McpServer` node

```yaml
node_type: raisin:McpServer
properties:
  name: Catalog                       # advertised at initialize (required)
  slug: catalog                       # /mcp/{repo}/{branch}/catalog (required, unique)
  version: "1.0.0"                    # default "1.0.0"
  instructions: Query and manage the product catalog.
  public: false                       # see the Authentication guide
  scopes: []                          # role or group ids required to open the server

  # (A) Auto data tools, generated from the policy. No code.
  data:
    workspaces: [products, categories]  # workspaces the tools may touch
    operations:                         # one built-in tool per entry
      - query_nodes
      - get_node
      - search_nodes
      - list_children
      - create_node
      - update_node
      - delete_node
      - move_node
      - reorder_node
      - list_workspaces
    resources: true                     # expose raisin:// resources

  # (B) Custom tools, each running a raisin:Function.
  tools:
    - function: /lib/acme/recommend     # PATH of the function node in the functions workspace
      name: recommend                   # tool name advertised to the client
      description: Recommend products for a customer.
      inputSchema:                      # JSON Schema for the arguments object
        type: object
        properties:
          customer_id: { type: string }
        required: [customer_id]
      scopes: [catalog:read]            # role or group ids required to call this tool
```

Set only `data` for a pure auto server, only `tools` for a pure custom server, or both. An unknown operation name makes the whole server fail to load, so a typo shows up at the first request rather than as a missing tool.

## Auto data tools

Each entry in `data.operations` becomes one tool. Every tool takes an optional `workspace` argument, which defaults to the first workspace in `data.workspaces` and must be one the server exposes.

| Tool | Arguments | Description |
|------|-----------|-------------|
| `query_nodes` | `node_type`, `parent_path`, `limit` (max 500) | List nodes, optionally filtered by exact type or direct parent. |
| `get_node` | `path` | Fetch one node by path. |
| `search_nodes` | `query`, `mode` (`fulltext` or `vector`), `node_type`, `limit` (max 200) | Full-text or semantic [search](../querying/full-text-search.md). Returns `hits` with `node_id`, `path`, `node_type` and `score`. |
| `list_children` | `parent_path`, `limit` | A node's direct children in editorial order. |
| `create_node` | `parent_path`, `name`, `node_type`, `properties` | Create a node under a parent. |
| `update_node` | `path`, `properties` | Set properties on an existing node. |
| `delete_node` | `path` | Delete a node and its subtree. |
| `move_node` | `path`, `new_parent_path` | Re-home a node with its subtree. |
| `reorder_node` | `parent_path`, `name`, then `before`, `after` or `position` | Change a node's position among its siblings. |
| `list_workspaces` | none | The workspaces this server exposes. |

Every call runs as the caller. A tool never reads or writes data the caller could not reach directly.

## Custom function tools

A custom tool runs an existing [`raisin:Function`](../functions/creating-functions.md) as the calling identity. The tool arguments become the function's input, and the function's return value is the tool result. A function that throws is reported as a tool error (`isError: true`), not as a transport error.

A `raisin:Function` already declares `input_schema` and `output_schema`, and a tool reuses them. When a tool entry omits `name`, `description`, `inputSchema` or `outputSchema`, the value is taken from the function. The function's `output_schema` is advertised as the tool's `outputSchema`, and a tool that has one returns its result as `structuredContent` alongside the text block:

```json
{"jsonrpc":"2.0","id":3,"result":{"resultType":"complete","content":[{"type":"text","text":"{\n  \"message\": \"hi\",\n  \"length\": 2\n}"}],"isError":false,"structuredContent":{"message":"hi","length":2}}}
```

Without an output schema, only the text block is returned. Widgets depend on `structuredContent`, so declare an `output_schema` on any function a widget renders.

There are two places to declare a custom tool.

### Server-side: the `tools` list

List the tool on the server node (shown in the node example above). `function` is the **path** of the function node in the `functions` workspace, for example `/lib/acme/recommend`. A minimal entry is `{ function, name }`; description and schemas are inherited from the function.

### Function-side: an `mcp` block

Add an `mcp` block to the `raisin:Function` node. A bare `enabled: true` is enough; everything else is inherited:

```yaml
node_type: raisin:Function
properties:
  name: recommend
  title: Recommend
  language: javascript
  entry_file: index.js:handler
  enabled: true
  input_schema:
    type: object
    properties: { customer_id: { type: string } }
    required: [customer_id]
  output_schema:
    type: object
    properties: { items: { type: array } }
  mcp:
    enabled: true
    scopes: [catalog:read]      # add name, description, inputSchema, outputSchema or ui to override
```

The engine scans the `functions` workspace and every workspace in `data.workspaces` for functions with an `mcp` block, so such a function appears on every server in the repository. The tool is advertised under the function's `name` (or the block's `name`) and invokes the function by its node path. When a server-side `tools` entry and a function-side block use the same tool name, the server-side entry wins.

### Interactive-widget tools

Add a `ui` object to a tool to have its result render as an inline HTML widget in an MCP Apps-capable host:

```yaml
tools:
  - function: /lib/acme/get-order
    name: order_card
    ui:
      entry: /widgets/order/index.html     # path of the widget's HTML asset
      workspace: assets                    # workspace the entry resolves in
      prefersBorder: true
```

See [Interactive Widgets (MCP Apps)](./interactive-widgets.md) for the full binding, shared widgets and the button-click pattern.

## Resources

Set `data.resources: true` to expose nodes as `raisin://{workspace}/{path}` resources:

- `resources/list` returns one entry per exposed workspace root, plus any widget resources.
- `resources/templates/list` returns a `raisin://{workspace}/{+path}` URI template per workspace.
- `resources/read` returns a node's JSON as a `text` entry. A `raisin:Asset` comes back as a base64 `blob` with its MIME type, so an uploaded image or PDF is readable over MCP.

Resource reads are RLS-scoped like everything else.

## Live updates

A client opens one long-lived stream with [`subscriptions/listen`](../../reference/http-api/mcp-api.md#subscriptionslisten) and names the notification types it wants:

- **`toolsListChanged`** fires when a `raisin:Function` in the `functions` workspace is created, edited or deleted. It carries no payload; the client calls `tools/list` again. Bursts within 250 ms are coalesced, so installing a package that writes twenty functions produces one notification.
- **`resourceSubscriptions`** delivers `notifications/resources/updated` for each listed URI when that node changes.

The first frame on the stream is an acknowledgement that repeats the subset the server will honour. Prompt and resource-list notifications are never granted; the resource list is static and there is no prompt registry.

## Packaging a server

Ship a server in a [package](../packages/creating-packages.md). Place the node at `content/mcp/{slug}/.node.yaml` and declare it in the manifest:

```yaml
# manifest.yaml
provides:
  mcp_servers:
    - /mcp/catalog          # path of the raisin:McpServer node (workspace mcp, path /catalog)
  functions:                # the functions the server's tools reference
    - /lib/acme/recommend
```

Installing the package creates the server node and the functions together.
