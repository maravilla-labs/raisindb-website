---
sidebar_position: 2
title: raisin.email
description: Send transactional email from a function through one of the tenant's configured providers
---

# `raisin.email`

Transactional email for server-side functions. Available identically in QuickJS
and Starlark.

Configuration — which providers exist, which is default, what address they send
as — is covered in the [Outbound Email guide](/docs/guides/auth/outbound-email).

## `send(message)`

Sends one message and returns the provider's receipt.

```js
const receipt = await raisin.email.send({
  to: ["user@example.com"],
  subject: "Your sign-in link",
  text: "Click here: https://app.example.com/…",
  html: "<a href='…'>Sign in</a>",
});
```

### Message

| Field | Type | Notes |
|---|---|---|
| `to` | `string \| string[]` | One address or several. At most **20**. |
| `subject` | `string` | Required. CR/LF is refused (header splitting). |
| `text` | `string` | Required, even alongside `html`. An HTML-only message is a spam signal and unreadable in a text client. |
| `html` | `string?` | Optional alternative body, sent *alongside* the text. |
| `provider` | `string?` | Which configured sender to use. Omit for the default. |

There is **no `from`**. The sender identity comes from the configuration, so a
function cannot send as an address the tenant never verified. A function chooses
*which* configured account to use, never *who* it is.

`provider` names an entry from [`providers()`](#providers). An unknown name
**throws**; it never falls back to the default. `null`, `""` and whitespace all
mean "the default", so an unset template variable behaves as you would expect.

### Receipt

```json
{ "message_id": "4bJ1x…", "provider": "resend", "sender": "transactional" }
```

| Field | Notes |
|---|---|
| `message_id` | The provider's id — what a later bounce or webhook correlates against |
| `provider` | The provider API: `resend`, `brevo` or `smtp` |
| `sender` | The configured name it went through |

Acceptance is not delivery.

### Errors

Every error carries a stable machine code in its message.

| Code | Means |
|---|---|
| `email:policy_denied` | The function's `email_policy` does not permit a recipient |
| `email:config` | Not enabled, no provider, unknown provider name, ambiguous default, or an incomplete entry |
| `email:invalid_message` | Missing/oversized/malformed message — refused before a socket opens |
| `email:auth_failed` | The provider rejected the credential (401/403). Rotate the secret. |
| `email:rate_limited` | The provider is throttling (429) |
| `email:provider_error` | Any other provider response |
| `email:transport` | DNS, TCP or TLS failure |
| `email:timeout` | The send exceeded 30 seconds |

The `auth_failed` / `invalid_message` split is the one that matters
operationally: the first is *your credential* failing (an operator problem), the
second is *your message* failing (a caller problem).

## `providers()`

Lists what this tenant has configured, so a function can discover the names
`send` accepts rather than hardcoding one it cannot verify.

```js
const { enabled, providers } = await raisin.email.providers();
// {
//   enabled: true,
//   providers: [
//     { name: "transactional", provider: "resend",
//       from_address: "no-reply@example.com", enabled: true, default: true },
//     { name: "relay", provider: "smtp",
//       from_address: "no-reply@example.com", enabled: false, default: false },
//   ],
// }
```

`enabled` at the top level is the tenant master switch — off means no sender
works, however many are listed. Disabled entries are included so you can tell
"not configured" from "switched off"; they cannot be selected.

Carries no credential and no `credential_ref`: a function that may send does not
thereby get to enumerate the secret store.

## Permissions

Both calls need the function's `email_policy`, which denies by default:

```yaml
email_policy:
  enabled: true
  allowed_recipients: ["*@example.com"]   # or ["*"] for mail to your users
secret_policy:
  enabled: true
  allowed_names: ["email/*"]
```

The policy runs **first** — before the configuration is read and before any
credential is decrypted — so a denied send never causes a key to be decrypted.
