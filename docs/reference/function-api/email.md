---
sidebar_position: 2
title: raisin.email
description: Send transactional email from a function through one of the tenant's configured providers
---

# `raisin.email`

Transactional email for server-side functions, available in every runtime.

Which providers exist, which is the default and what address they send as is
configured per tenant; see the [Outbound Email guide](/docs/guides/auth/outbound-email).

## `send(message)`

Sends one message and returns the provider's receipt.

```js
const receipt = raisin.email.send({
  to: ["user@example.com"],
  subject: "Your sign-in link",
  text: "Open this link to sign in: https://app.example.com/…",
  html: "<a href='https://app.example.com/…'>Sign in</a>",
});
```

### Message

| Field | Type | Notes |
|---|---|---|
| `to` | `string \| string[]` | Required. `to`, `cc` and `bcc` together may name at most 20 recipients. |
| `cc`, `bcc` | `string \| string[]` | Optional. |
| `subject` | `string` | Required. A CR, LF or NUL character is refused. |
| `text` | `string` | Required, even alongside `html`. |
| `html` | `string` | Optional alternative body, sent alongside the text. |
| `attachments` | `EmailAttachment[]` | Optional. At most 20, 10 MiB each and 10 MiB in total by default. |
| `provider` | `string` | Which configured sender to use. Omit for the default. |

There is no `from` field. The sender identity comes from the tenant's email
configuration, so a function chooses which configured account to use, not what
address it sends as.

`provider` names an entry from [`providers()`](#providers). An unknown name is
an error; it does not fall back to the default. `null`, `""` and whitespace all
mean "the default".

### Receipt

```json
{ "message_id": "4bJ1x…", "provider": "resend", "sender": "transactional" }
```

| Field | Notes |
|---|---|
| `message_id` | The provider's id, which a later bounce or webhook correlates against |
| `provider` | The provider API: `resend` or `brevo` (`smtp` is configurable but not yet implemented) |
| `sender` | The configured account it went through |

Acceptance by the provider is not delivery.

### Errors

Every error carries a stable code in its message.

| Code | Means |
|---|---|
| `email:policy_denied` | The function has no `email_policy`, or it does not permit a recipient |
| `email:config` | Email is not enabled for the tenant, no provider is configured, the provider name is unknown, or the entry is incomplete |
| `email:invalid_message` | Missing, oversized or malformed message; refused before any connection is opened |
| `email:auth_failed` | The provider rejected the credential (401 or 403) |
| `email:rate_limited` | The provider is throttling (429) |
| `email:provider_error` | Any other provider response |
| `email:transport` | DNS, TCP or TLS failure |
| `email:timeout` | The send exceeded 30 seconds |
| `email:unsupported` | The configured provider type has no implementation yet (SMTP) |

A function that never declared a policy sees, for example:

```
Permission denied: [email:policy_denied] cannot send to ["a@example.com"]: this function
has no email_policy (sending is denied by default). Grant it by adding the recipient
domain to the function's email_policy.allowed_recipients.
```

`auth_failed` means the credential is wrong (an operator problem);
`invalid_message` means the message is wrong (a caller problem).

## `providers()`

Lists what this tenant has configured, so a function can discover the names
`send` accepts instead of hardcoding one.

```js
const { enabled, providers } = raisin.email.providers();
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

`enabled` at the top level is the tenant switch: when it is off no sender
works, however many are listed. Disabled entries are included so you can tell
"not configured" from "switched off"; they cannot be selected. The listing
carries no credentials.

## Permissions

Both calls require the function's `email_policy`, which denies by default.
`allowed_recipients` is a list of domain patterns matched against the part
after `@` in each recipient: `example.com`, `*.example.com`, or `*` for any
domain. The provider's credential is read from the tenant's email
configuration under the function's `secret_policy`, so declare that too:

```yaml
email_policy:
  enabled: true
  allowed_recipients: ["example.com", "*.example.com"]
secret_policy:
  enabled: true
  allowed_names: ["email/*"]
```

The recipient check runs first, before the configuration is read and before
any credential is decrypted.
