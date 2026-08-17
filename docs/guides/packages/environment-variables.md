---
sidebar_position: 5
---

# Environment Variables in Package YAML

A package usually carries at least one value that is **not** part of the
content: a preview server URL, a public domain, the repository it syncs
against. Hardcode those and the package only works on the machine it was
written on — shipping it to staging or production means hand-editing YAML,
and that edit is easy to commit by accident.

Write `{env:NAME}` instead, and the CLI substitutes the value when the package
is built, validated or pushed.

```yaml
# content/stories/my-site/.node.yaml
properties:
  domain: "{env:SITE_DOMAIN:-my-site.localhost}"
  dev_url: "{env:PREVIEW_SERVER:-http://localhost:5173}"
  embed_rules:
    - uuid: embed-default
      element_type: studio:EmbedRule
      pattern: /**
      base_url: "{env:PREVIEW_SERVER:-http://localhost:5173}"
```

With nothing set, this builds against `localhost` — the dev default stays in
the file, visible and version-controlled. With `PREVIEW_SERVER` exported, the
same source builds against production.

```bash
# dev: inline defaults apply
raisindb package create ./package

# production
PREVIEW_SERVER=https://preview.example.ch SITE_DOMAIN=example.ch \
  raisindb package create ./package
```

## Syntax

| Form | Meaning |
|------|---------|
| `{env:NAME}` | Substitute `NAME`; **fail** the command if it is not set |
| `{env:NAME:-fallback}` | Substitute `NAME`, or `fallback` when it is not set |
| `\{env:NAME}` | Escaped — emits the literal text `{env:NAME}` |

`NAME` must match `[A-Za-z_][A-Za-z0-9_]*`. Anything that doesn't parse as a
token (`{env:}`, `{env:9BAD}`, `{environment}`) is left alone.

A token may appear anywhere in the file — a top-level scalar, a value nested
inside a list of mappings, a flow-style mapping, or inside a multi-line HTML
block. Substitution is textual and runs before the YAML is parsed, so quoting
works as you'd expect: quote the scalar (`"{env:X}"`) whenever the substituted
value could otherwise be read as a YAML special (a URL with a colon, a bare
number, `true`).

:::note Not the same as `{{ }}` workflow templates
Workflow steps use `{{ trigger.node.properties.email }}` and `${step.output}`,
which are resolved by the flow engine **at run time** against instance data.
`{env:...}` is resolved by the CLI **at build time** against your shell. They
never collide — the CLI leaves `{{ }}` and `${ }` untouched.
:::

## Where values come from

Lowest precedence first — later entries override earlier ones:

1. `.env` in the package directory
2. `.env.<profile>` — only with `--env <profile>`
3. `.env.local`
4. `.env.<profile>.local` — only with `--env <profile>`
5. each `--env-file <path>`, in the order given
6. the **process environment** — always wins

So the usual layout is a committed `.env` holding dev defaults, a gitignored
`.env.local` for personal overrides, and real environment variables in CI:

```bash
# package/.env — committed, the shared dev baseline
PREVIEW_SERVER=http://localhost:5173
SITE_DOMAIN=my-site.localhost
```

```bash
# package/.env.production — committed, no secrets
PREVIEW_SERVER=https://preview.example.ch
SITE_DOMAIN=example.ch
```

```bash
raisindb package create ./package --env production
```

`.env` and `.env.*` are **never packaged and never pushed**. They are in the
default ignore lists for both `package create` and `sync`, so only the
resolved values reach the server — the files themselves stay local.

:::warning Values are baked in, and the server sees them
Substitution happens before the bytes leave your machine. The `.rap` contains
resolved values, so anything you substitute is readable by anyone who can read
the package or the installed node. Use this for environment *configuration* —
URLs, domains, repository names — not for credentials. For secrets, declare
the field `encrypted: true` in its schema so the server vaults it.
:::

## Which commands substitute

| Command | Behaviour |
|---------|-----------|
| `package create` / `deploy` | Resolves tokens into the shipped `.rap` |
| `package validate` | Validates the **resolved** bytes, so validation matches what ships |
| `sync --push` / `--watch` | Resolves before uploading each file |
| `.raisin-sync.yaml` | Resolved when the sync config is loaded |

All of them accept the same two flags:

| Option | Description |
|--------|-------------|
| `-e, --env <profile>` | Load `.env.<profile>` and `.env.<profile>.local` |
| `--env-file <path...>` | Additional env file(s), applied after the conventional ones |

Only text files are substituted (`.yaml`, `.yml`, `.json`, `.js`, `.py`,
`.star`, `.md`). Binary assets are copied byte-for-byte and never scanned.

## Unresolved variables fail the command

A token with no value and no inline default is an error, not a warning:

```
Error: Failed to create package: Unresolved {env:...} tokens:
  content/stories/my-site/footer/.node.yaml:56:14  {env:TICKET_URL}

Set TICKET_URL in the environment or a .env file, or give the token an inline default: {env:NAME:-fallback}
Env sources consulted: process environment
```

No `.rap` is written. The alternative — shipping a literal
`{env:TICKET_URL}` as a URL — would look fine at build time and break at run
time, so the build stops instead.

`package validate` reports the same problem as a normal validation error with
a file and line, which makes it the fastest way to check a package before a
release:

```bash
raisindb package validate ./package --env production
```

## An environment-agnostic sync config

The same syntax works in `.raisin-sync.yaml`, so one committed file can target
local, staging and production:

```yaml
version: 1
server: "{env:RAISIN_SERVER:-http://localhost:8080}"
repository: "{env:RAISIN_REPO:-studio}"
branch: "{env:RAISIN_BRANCH:-main}"
conflict_strategy: prompt
```

```bash
raisindb sync ./package --push                     # → localhost
RAISIN_SERVER=https://db.example.ch \
  raisindb sync ./package --push                   # → production
```

The CLI will not write resolved values back over this file: `sync --init`
refuses to overwrite a config that uses `{env:...}` and tells you to edit it
directly.

## Pulling: tokens are protected

The server only ever stores the **resolved** value, so pulling that value back
into a local file would silently replace your tokens with one environment's
URLs. `sync --pull` therefore skips any local file containing `{env:...}`:

```
✗ content/stories/my-site/.node.yaml: local file contains {env:...} tokens;
  pull would replace them with this environment's resolved values
  (use --force to overwrite anyway)
```

Pass `--force` only when you genuinely want the server's version, tokens and
all. Otherwise, treat token-bearing files as **push-only** and edit them
locally.

## Next Steps

- [Creating Packages](./creating-packages.md) — Package format and structure
- [Sync and Watch](./sync-and-watch.md) — The local development loop
- [CLI Commands](../../reference/cli/commands.md) — Full flag reference
