---
sidebar_position: 5
---

# Environment Variables in Package YAML

A package usually carries a few values that are not content: a preview server
URL, a public domain, the repository it syncs against. Written literally, the
package only works on the machine it was written on.

Write `{env:NAME}` instead. The CLI substitutes the value when the package is
validated, built or pushed.

```yaml
# content/stories/my-site/.node.yaml
properties:
  domain: "{env:SITE_DOMAIN:-my-site.localhost}"
  dev_url: "{env:PREVIEW_SERVER:-http://localhost:5173}"
```

With nothing set, the inline defaults apply and the package builds against
`localhost`. With `PREVIEW_SERVER` exported, the same source builds for
production:

```bash
raisindb package create ./package                                   # dev defaults

PREVIEW_SERVER=https://preview.example.ch SITE_DOMAIN=example.ch \
  raisindb package create ./package                                 # production
```

## Syntax

| Form | Meaning |
|------|---------|
| `{env:NAME}` | Substitute `NAME`; the command fails if it is not set |
| `{env:NAME:-fallback}` | Substitute `NAME`, or `fallback` when it is not set |
| `\{env:NAME}` | Escaped; emits the literal text `{env:NAME}` |

`NAME` must match `[A-Za-z_][A-Za-z0-9_]*`. Text that does not parse as a token
(`{env:}`, `{env:9BAD}`, `{environment}`) is left alone. A default may contain
anything except `}`.

A token may appear anywhere in a text file: a top-level scalar, a value nested
in a list, a flow-style mapping, a multi-line block. Substitution is textual and
runs before the YAML is parsed, so quote the scalar (`"{env:X}"`) whenever the
substituted value could be read as a YAML special, such as a URL with a colon, a
bare number or `true`.

:::note Not the same as workflow templates
Workflow steps use `{{ trigger.node.properties.email }}` and `${step.output}`,
which the flow engine resolves at run time. `{env:...}` is resolved by the CLI at
build time. The CLI leaves `{{ }}` and `${ }` untouched.
:::

## Where values come from

Lowest precedence first; later entries override earlier ones:

1. `.env` in the package directory
2. `.env.<profile>`, only with `--env <profile>`
3. `.env.local`
4. `.env.<profile>.local`, only with `--env <profile>`
5. each `--env-file <path>`, in the order given
6. the process environment, which always wins

A typical layout is a committed `.env` with dev defaults, a gitignored
`.env.local` for personal overrides, and real environment variables in CI:

```bash
# package/.env  (committed)
PREVIEW_SERVER=http://localhost:5173
SITE_DOMAIN=my-site.localhost
```

```bash
# package/.env.production  (committed, no secrets)
PREVIEW_SERVER=https://preview.example.ch
SITE_DOMAIN=example.ch
```

```bash
raisindb package create ./package --env production
```

`.env` and `.env.*` are on the default ignore lists of both `package create`
and `sync`, so the files stay local and only the resolved values reach the
server.

:::warning Values are baked in
Substitution happens before the bytes leave your machine. The `.rap` contains
the resolved values, readable by anyone who can read the package or the
installed node. Use tokens for environment configuration such as URLs, domains
and repository names. For credentials, declare the field `encrypted: true` in
its schema so the server stores it in the secret store instead.
:::

## Which commands substitute

| Command | Behaviour |
|---------|-----------|
| `package create` / `deploy` | Resolves tokens into the built `.rap` |
| `package validate` | Validates the resolved bytes, so validation matches what ships |
| `sync --push` / `--watch` | Resolves each file before uploading it |
| `.raisindb-cli.yaml` | Resolved when the sync configuration is loaded |

All of them accept the same two flags:

| Option | Description |
|--------|-------------|
| `-e, --env <profile>` | Load `.env.<profile>` and `.env.<profile>.local` |
| `--env-file <path...>` | Additional env file(s), applied after the conventional ones. A path that does not exist is an error. |

Only text files are substituted: `.yaml`, `.yml`, `.json`, `.js`, `.py`,
`.star` and `.md`. Binary assets are copied byte for byte.

## Unresolved variables fail the command

A token with no value and no inline default is a validation error with a file
and line, and no `.rap` is written:

```
$ raisindb package create ./package
Validating package: /work/package
content/blog/site.yaml: ERROR [UNRESOLVED_ENV_TOKEN] {env:TICKET_URL} could not be resolved. Set TICKET_URL in the environment or a .env file, or give it an inline default: {env:TICKET_URL:-fallback}
Validation: 2 file(s), 1 error(s), 0 warning(s)
Error: Package validation failed with 1 error(s). Fix errors before creating package, or use --no-validate to skip.
```

Shipping a literal `{env:TICKET_URL}` as a URL would look fine at build time and
break at run time, which is why the build stops instead. `package validate`
reports the same error, so it is the quickest check before a release:

```bash
raisindb package validate ./package --env production
```

With `--no-validate`, the packer performs its own check and aborts with the
same list of unresolved tokens before writing anything.

## An environment-agnostic sync config

The same syntax works in the CLI's `.raisindb-cli.yaml`, so one committed file
can target local, staging and production:

```yaml
version: 1
server: "{env:RAISIN_SERVER:-http://localhost:8080}"
repository: "{env:RAISIN_REPO:-studio}"
branch: "{env:RAISIN_BRANCH:-main}"
conflict_strategy: prompt
```

```bash
raisindb sync ./package --push                     # localhost
RAISIN_SERVER=https://db.example.ch \
  raisindb sync ./package --push                   # production
```

The CLI does not write resolved values back over this file: `sync --init`
leaves a config that uses `{env:...}` untouched and tells you to edit it
directly.

## Pulling: tokens are protected

The server only stores resolved values, so pulling one back into a local file
would replace your tokens with one environment's URLs. `sync --pull` therefore
skips any local file containing `{env:...}`:

```
✗ content/stories/my-site/.node.yaml: local file contains {env:...} tokens;
  pull would replace them with this environment's resolved values
  (use --force to overwrite anyway)
```

Pass `--force` only when you want the server's version, tokens and all.
Otherwise treat token-bearing files as push-only and edit them locally.

## Next steps

- [Creating Packages](./creating-packages.md)
- [Sync and Watch](./sync-and-watch.md)
- [CLI Commands](../../reference/cli/commands.md)
