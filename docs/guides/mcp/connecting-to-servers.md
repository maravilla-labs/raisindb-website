---
sidebar_position: 5
---

# Connecting to External Servers

**Give your agents tools that live somewhere else — Linear, GitHub, Sentry, an internal team server — and use them exactly like the functions you wrote yourself.**

The rest of this section is about RaisinDB *serving* MCP tools to AI clients. This page is the opposite direction: RaisinDB as an MCP **client**.

## Remote tools are just tools

You register a **connection** — one remote MCP server. RaisinDB calls its `tools/list` and writes one ordinary `raisin:Function` per remote tool, under `/mcp/{slug}/{tool}`.

From that point on there is no second kind of tool. An [agent](../ai/agent-plans-and-tools.md) lists local and remote tools together, in one array, with no flag distinguishing them:

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

The model sees one flat tool list and cannot tell which is which. Everything that already works for a function keeps working, because a proxy **is** a function:

| | Works on remote tools |
|---|---|
| Row-level security on the tool node | yes — a caller who cannot read the node does not get the tool |
| `category: planning` filtering via `task_creation_enabled` | yes |
| The agent's tool-calling loop, retries, result handling | yes — same code path |
| Chat, flows, `raisin.functions.execute()`, the HTTP invoke endpoint | yes — all four reach the same executor |
| Re-exporting the tool on one of *your* MCP servers | yes |

The only thing that differs is what happens when the tool runs: instead of executing JavaScript, RaisinDB forwards one `tools/call` to the remote server and maps the result back.

:::tip Why this shape
The alternative — a distinct "MCP tool" type that every consumer has to branch on — would have meant teaching the chat handler, the flow runtime, the permission model and the tool-call machinery about a second concept. Materializing remote tools as ordinary functions means none of them changed.
:::

## Add a connection

In the admin console, open **MCP Connections** and choose **Add connection**:

| Field | Notes |
|-------|-------|
| **Title** | Display name, e.g. `Linear`. |
| **Slug** | Lowercase, URL-safe. **Permanent** — it is part of every generated tool path. |
| **URL** | The server's Streamable HTTP endpoint, e.g. `https://mcp.linear.app/mcp`. |

The connection is created **disabled**. It is not useful until it has a credential, and an enabled one would start being discovered immediately.

:::caution The slug is fixed
Changing a slug after tools are discovered would orphan every proxy and silently break any agent holding one of those paths. Pick it deliberately.
:::

## Authenticate

Three modes:

### No auth

For public servers. Nothing to configure.

### Token or API key

Paste it once. It is encrypted with `RAISIN_MASTER_KEY` immediately, and **no endpoint ever returns it** — the console shows only whether one is set. By default it is sent as `Authorization: Bearer <token>`; set a header name for servers that want something else, like `X-Api-Key`.

### OAuth 2.1

Press **Discover**. RaisinDB probes the server, reads the [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) pointer out of its `401`, follows it to the authorization server, and registers itself via [dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591). Then press **Connect** and consent in the popup.

With dynamic registration you paste **nothing** — the redirect URI is submitted at registration time rather than configured by hand on the provider's side. For servers without it, the console shows the redirect URI to register yourself.

:::warning A connection has one identity
Every agent and every user calling one of a connection's tools acts as **that** credential. There is no per-user delegation. If two people need different permissions on the remote server, they need two connections.
:::

## Discover tools

Enable the connection, then press **Refresh tools**. Discovery also runs on save and on the connection's interval.

The tools table lists what the server offers, with the path to paste into an agent. Each tool has an **Exposed** toggle — narrowing this is the cheapest way to bound what a remote server can be asked to do.

Tool states:

| State | Meaning |
|-------|---------|
| `active` | Present on the remote server. |
| `missing` | Gone upstream. The proxy is **disabled, not deleted** — deleting it would make the tool silently vanish from any agent referencing it. |
| `conflict` | The generated function name collides with an existing function; this tool was skipped. |

Discovery is incremental: a refresh where nothing changed writes nothing at all, so an hourly interval does not fill your history with revisions.

## Test a connection

**Run probe** performs a real handshake and `tools/list`, and reports what it found — the negotiated protocol version, the server's identity, and how many tools the current filter would expose. It never calls a tool: `tools/call` has side effects, and testing a connection must not file a ticket.

A broken connection still returns a readable diagnosis rather than a generic failure:

| Report | Cause |
|--------|-------|
| `auth_expired` | The credential is missing, wrong, or the OAuth token lapsed. Reconnect. |
| `config_error` | The URL is rejected by the egress policy, or the endpoint is not an MCP server. |
| `unreachable` | Network failure or a 5xx from the remote. |

## Configuration

The optional `[mcp_client]` section of the server's TOML config is the operator-owned half — where the client may connect, and how much it may buffer:

```toml
[mcp_client]
# Empty = any PUBLIC host. Entries are exact ("mcp.linear.app") or a wildcard
# suffix ("*.example.com", which matches sub-domains but NOT the bare apex).
allowed_hosts = []

# Permit loopback and private addresses, AND plain http. Local development only.
allow_private_addresses = false

max_response_bytes = 8388608
default_timeout_ms = 30000
```

Omitting the section keeps the safe defaults. Everything per-connection lives on the connection itself, so adding one never needs a restart.

## Security

**Egress is restricted by default.** Connections must be `https`, and private, loopback and link-local addresses — including cloud instance metadata at `169.254.169.254` — are refused. This is checked when you save a connection **and again before every dial**, where it resolves the hostname and judges every address that comes back: a name that resolved publicly at save time can be re-pointed at `127.0.0.1` afterwards. To reach an MCP server on `localhost`, set `allow_private_addresses = true`.

**The policy covers the whole OAuth discovery chain.** Every URL after the endpoint you typed is chosen by the remote side — its `401` names the metadata document, that names the issuer, and the issuer's metadata names the registration and token endpoints. Each one is checked before it is dialled, so an allowlisted server cannot redirect RaisinDB at an internal address. If you set `allowed_hosts`, include the **authorization server's host**: it is usually different from the MCP endpoint's (`auth.linear.app` vs `mcp.linear.app`), and leaving it out makes **Discover** fail with a message saying so.

**A remote tool sees what the model sends it.** The model has read the conversation and chooses the arguments. Nothing structurally prevents a remote server from being handed data you did not intend it to have. Bound it by exposing few tools, by the host allowlist, and by controlling who can attach a proxy to an agent.

**Credentials never leave the server.** Tokens are stored as AES-256-GCM ciphertext; refresh tokens never appear in an API response, a function sandbox, or a log line.

## Clusters

Discovery writes shared content, so it must run once per cluster rather than once per node. That is enforced by a lease from the locks subsystem, which needs the `redis` backend to span nodes:

```toml
[locks]
enabled = true
backend = "redis"
```

With locks disabled or `inprocess`, every node runs its own discovery and writes the same proxy nodes. The server logs a warning when it detects this alongside replication.

## Limits

- **Streamable HTTP only.** There is no stdio transport — spawning subprocesses inside the database would mean arbitrary process execution and node-local state that does not replicate.
- **`tools/call` is never retried automatically.** MCP has no idempotency key, so a retry could charge a card or file a ticket twice.
- **No per-user delegation.** One service-account identity per connection, as above.

## See also

- [MCP Servers Overview](./overview.md) — the inbound direction
- [MCP Connections API](../../reference/http-api/mcp-connections-api.md) — the HTTP endpoints
- [Agent Plans and Tools](../ai/agent-plans-and-tools.md) — attaching tools to an agent
