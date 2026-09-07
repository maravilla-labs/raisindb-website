---
sidebar_position: 5
---

# Connecting to External Servers

Give your agents tools that live somewhere else, such as Linear, GitHub, Sentry or an internal team server, and use them exactly like the functions you wrote yourself.

The rest of this section is about RaisinDB serving MCP tools to AI clients. This page is the opposite direction: RaisinDB as an MCP **client**.

## Remote tools are just tools

You register a **connection** to one remote MCP server. RaisinDB calls its `tools/list` and writes one ordinary `raisin:Function` per remote tool at `/mcp/{slug}/{tool}` in the `functions` workspace.

From then on there is no second kind of tool. An [agent](../ai/agent-plans-and-tools.md) lists local and remote tools together:

```yaml
node_type: raisin:AIAgent
properties:
  system_prompt: |
    You help the team triage incoming bugs.
  tools:
    - /lib/raisin/ai/remember           # a function you wrote
    - /lib/myapp/list-shifts            # another one
    - /mcp/linear/search-issues         # Linear, via a connection
    - /mcp/linear/create-issue          # same connection
    - /mcp/sentry/get-issue             # a different server
```

The model sees one flat tool list. Row-level security on the function node, the agent's tool-calling loop, chat, flows, `raisin.functions.execute()` and the HTTP invoke endpoint all work unchanged, because a proxy is a function. The only difference is what happens when it runs: instead of executing code, RaisinDB forwards one `tools/call` to the remote server and maps the result back. A proxy carries an `mcp_proxy` block naming its connection and the remote tool; discovery manages that block and overwrites hand edits.

## Add a connection

In the admin console, open **MCP Connections** and choose **Add connection**:

| Field | Notes |
|-------|-------|
| **Title** | Display name, e.g. `Linear`. |
| **Slug** | Lowercase letters, digits and hyphens, up to 48 characters. It becomes part of every generated tool path, so it cannot be changed later. |
| **URL** | The server's Streamable HTTP endpoint, e.g. `https://mcp.linear.app/mcp`. Must be `https` unless private addresses are enabled (see [Configuration](#configuration)). |

The connection is created **disabled**. Enable it once it has a credential; a disabled connection is never called and never discovered.

## Authenticate

Three modes, chosen under **Authentication**:

### No auth

For public servers. Nothing to configure.

### Token / API key

Paste it once. It is stored encrypted, and no endpoint returns it afterwards; the console only shows whether one is set. By default it is sent as `Authorization: Bearer <token>`. Set a header name for servers that expect something else, such as `X-Api-Key`.

### OAuth 2.1

Press **Discover**. RaisinDB probes the server, reads the [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) pointer from its `401`, follows it to the authorization server and registers itself through [dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591). Then press **Connect** and consent in the popup.

With dynamic registration you paste nothing. For servers without it, enter the client id (and secret, if the server requires one) the provider issued you; the console shows the redirect URI to register on the provider's side.

Access tokens are refreshed before they expire by the same periodic sweep that refreshes connector tokens.

:::note A connection has one identity
Every agent and every user calling one of a connection's tools acts as that credential. There is no per-user delegation. If two people need different permissions on the remote server, create two connections.
:::

## Discover tools

Enable the connection, then press **Refresh tools**. Discovery also runs when the connection is saved (`refresh_policy.on_save`, on by default) and, when `refresh_policy.mode` is `interval`, every `interval_secs` (default 3600). A new connection starts in `manual` mode, so switch to `interval` if you want the list to stay fresh without notifications.

The tools table lists what the server offers with the **Agent path** to paste into an agent. Each tool has an **Exposed** toggle; turning tools off is the cheapest way to bound what a remote server can be asked to do.

| State | Meaning |
|-------|---------|
| `active` | Present on the remote server. |
| `missing` | Gone upstream. The proxy is disabled but kept, so an agent referencing it fails visibly instead of silently losing a tool. |
| `conflict` | The generated function name collides with an existing function; this tool was skipped. |

Discovery is incremental. A refresh where nothing changed writes nothing, so a frequent interval does not fill your history with revisions. Tool slugs are assigned deterministically from the remote names, so a server that reorders its listing does not renumber your paths.

## Live tool updates

MCP's `notifications/tools/list_changed` tells a client to re-list. It carries no payload, so receiving one schedules a discovery run.

**Opportunistic updates need no configuration.** A server may attach the notification to any response, including an ordinary tool call, and RaisinDB acts on it. A connection your agents use stays fresh on its own.

**A held-open stream is opt-in.** Turn on **Live updates** on the connection (`refresh_policy.notifications`) to also cover a server whose tools change while nobody is calling it. The remote server has to support it, either by speaking the 2026-07-28 revision or by advertising `tools.listChanged`; otherwise RaisinDB logs that and falls back to the interval. A server that acknowledges the subscription but declines tool notifications is also logged, and the listener stands down.

:::note Clusters need Redis locks
One node holds each stream, elected through a per-connection lease. With `[locks]` disabled or set to `inprocess` while replication is on, listeners are not started at all, because every node would otherwise hold its own copy of the stream.
:::

RaisinDB's own MCP server advertises `tools.listChanged` and emits the notification when a function changes, so one RaisinDB connected to another gets live updates in both directions.

## Removing tools that are gone

A tool that vanishes upstream is disabled, not deleted. Those `missing` entries accumulate until you clear them: **Prune missing** on the tools table removes them all, or delete one tool at a time.

Either way RaisinDB first checks whether an agent still lists the path and refuses with the agent names if so. Pass `force` to delete anyway. There is no automatic age-based prune.

## Test a connection

**Run probe** performs a real handshake and `tools/list` and reports what it found: the negotiated protocol version, the server's identity and how many tools the current filter would expose. It never calls a tool.

A broken connection still returns a readable diagnosis:

| Report | Cause |
|--------|-------|
| `auth_expired` | The credential is missing, wrong, or the OAuth token lapsed. Reconnect. |
| `config_error` | The URL is rejected by the egress policy, or the endpoint is not an MCP server. |
| `transient_error` | Network failure, DNS failure or a 5xx from the remote. |
| `rate_limited` | The remote answered 429. |
| `protocol_error` | The remote answered with something that is not valid MCP. |
| `session_expired` | The remote dropped the session; the next call opens a new one. |

## Configuration

The optional `[mcp_client]` section of the server's TOML config sets the operator-owned half: where the client may connect and how much it may buffer.

```toml
[mcp_client]
# Empty = any PUBLIC host. Entries are exact ("mcp.linear.app") or a wildcard
# suffix ("*.example.com", which matches sub-domains but NOT the bare apex).
allowed_hosts = []

# Permit loopback and private addresses, and plain http. Local development only.
allow_private_addresses = false

max_response_bytes = 8388608
default_timeout_ms = 30000
```

Omitting the section keeps these defaults. Everything per connection lives on the connection itself, so adding one never needs a restart. A connection can lower its own call timeout with `refresh_policy.call_timeout_ms`.

## Security

**Egress is restricted by default.** Connections must be `https`, and private, loopback and link-local addresses, including cloud instance metadata at `169.254.169.254`, are refused. The check runs when you save a connection and again before every dial, against the addresses the hostname resolves to at that moment. To reach an MCP server on `localhost`, set `allow_private_addresses = true`.

**The policy covers the OAuth discovery chain.** Every URL after the endpoint you typed is chosen by the remote side: its `401` names the metadata document, that names the issuer, and the issuer's metadata names the registration and token endpoints. Each one is checked before it is dialled. If you set `allowed_hosts`, include the authorization server's host as well as the MCP endpoint's; they are usually different (`auth.linear.app` vs `mcp.linear.app`), and leaving it out makes **Discover** fail with a message saying so.

**A remote tool sees what the model sends it.** The model has read the conversation and chooses the arguments, so a remote server can receive data you did not intend it to have. Bound that by exposing few tools, by the host allowlist, and by controlling who can attach a proxy to an agent.

**Credentials stay on the server.** Tokens are stored as AES-256-GCM ciphertext. Refresh tokens never appear in an API response, a function sandbox or a log line.

## Clusters

Discovery writes shared content, so it runs once per cluster rather than once per node. A lease from the locks subsystem enforces that, which needs the `redis` backend to span nodes:

```toml
[locks]
enabled = true
backend = "redis"
```

With locks disabled or `inprocess`, every node runs its own discovery and writes the same proxy nodes. The server logs a warning when it detects this alongside replication.

## Limits

- **Streamable HTTP only.** There is no stdio transport; the database does not spawn subprocesses.
- **`tools/call` is never retried automatically.** MCP has no idempotency key, so a retry could charge a card or file a ticket twice. Only session recovery replays a call, once.
- **No per-user delegation.** One identity per connection, as above.

## See also

- [MCP Servers Overview](./overview.md) covers the inbound direction.
- [MCP Connections API](../../reference/http-api/mcp-connections-api.md) lists the HTTP endpoints.
- [Agent Plans and Tools](../ai/agent-plans-and-tools.md) shows how to attach tools to an agent.
