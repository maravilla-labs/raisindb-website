---
sidebar_position: 2
---

# Defining MCP Servers

An MCP server is a `raisin:McpServer` node in the **`mcp`** workspace. The MCP engine discovers it by `slug` and assembles its live tool set on every request.

## The `raisin:McpServer` node

```yaml
node_type: raisin:McpServer
properties:
  name: Catalog                       # advertised at initialize (required)
  slug: catalog                       # → /mcp/{repo}/{branch}/catalog (required, unique)
  version: "1.0.0"
  instructions: Query and manage the product catalog.
  public: false                       # see Authentication guide
  scopes: []                          # roles/groups required to open the server

  # (A) Auto data tools — generated from your NodeTypes. No code.
  data:
    workspaces: [products, categories]  # content workspaces the tools may touch
    operations:                         # one built-in tool per entry
      - query_nodes
      - get_node
      - search_nodes
      - create_node
      - update_node
      - delete_node
      - list_workspaces
    resources: false                    # expose raisin:// resources + live subscribe

  # (B) Custom tools — each maps to a raisin:Function node.
  tools:
    - function: recommend               # name of the raisin:Function node
      name: recommend                   # tool name advertised to the client
      description: Recommend products for a customer.
      inputSchema:                      # JSON Schema for the arguments object
        type: object
        properties:
          customer_id: { type: string }
        required: [customer_id]
      scopes: [catalog:read]            # roles/groups required to call this tool
```

Set only `data:` for a pure auto server, only `tools:` for a pure custom server, or both. A single repository can hold many servers, each with a distinct `slug`.

## Auto data tools

List operations under `data.operations` and RaisinDB generates one tool each, operating on the workspaces in `data.workspaces`:

| Tool | Description |
|------|-------------|
| `query_nodes` | List nodes, optionally filtered by `node_type` or `parent_path`. |
| `get_node` | Fetch a single node by path. |
| `search_nodes` | Full-text and vector [search](../querying/full-text-search.md). |
| `create_node` | Create a node under a parent path. |
| `update_node` | Update a node's properties. |
| `delete_node` | Delete a node and its descendants. |
| `list_workspaces` | List the workspaces the server exposes. |

Every call runs under the **caller's** [row-level security](../auth/row-level-security.md) — a tool can never read or write data the caller couldn't reach directly.

## Custom function tools

A custom tool runs an existing [`raisin:Function`](../functions/creating-functions.md) **as the calling identity** (no privilege escalation). A failed function surfaces as a tool error (`isError: true`), not a transport error. There are two equivalent ways to declare one.

### Server-side: the `tools` list

List the tool on the server node (shown above). The server owns the mapping from tool name to function.

### Function-side: an `mcp` block

Add an `mcp` block to the `raisin:Function` node so the function *is* a tool wherever a server's data policy covers its workspace:

```yaml
node_type: raisin:Function
properties:
  name: recommend
  entry_file: index.js:recommend
  language: javascript
  enabled: true
  mcp:                                  # promote this function to an MCP tool
    enabled: true
    name: recommend                     # defaults to the function name
    description: Recommend products for a customer.
    inputSchema:
      type: object
      properties: { customer_id: { type: string } }
      required: [customer_id]
    scopes: [catalog:read]
```

The function receives the tool arguments as its input and returns the tool result. When a server-side `tools` entry and a function-side `mcp` block declare the same name, the server-side entry wins.

## Resources

Set `data.resources: true` to expose each node as a `raisin://{workspace}/{path}` MCP resource. Clients can:

- `resources/read` — fetch a node's content.
- `resources/subscribe` — receive live `notifications/resources/updated` over Server-Sent Events as nodes change.

## Packaging a server

Ship a turnkey server in a [package](../packages/creating-packages.md). Place the node at `content/mcp/{slug}/.node.yaml` and declare it in the manifest:

```yaml
# manifest.yaml
provides:
  mcp_servers:
    - /mcp/catalog        # path of the raisin:McpServer node (workspace mcp, path /catalog)
  functions:              # only if the server exposes custom function tools
    - /functions/lib/acme/recommend
```

Installing the package creates the server; nothing else to wire.
