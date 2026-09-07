---
sidebar_position: 4
title: Outbound Email
description: Configure one or more transactional email providers (Resend, Brevo, SMTP), mark one as default, and send from functions
---

# Outbound Email

Transactional mail (magic-link sign-in, notifications, receipts) goes out
through provider accounts you own, from domains you have verified. There is
no platform sender: a repository that has configured nothing cannot send.

## Configuration

Email is configured per repository on the **Email** page of the admin
console. The settings are stored as a `raisin:EmailConfig` node at
`/config/email` in the `raisin:system` workspace, so they are versioned and
auditable like any other node. Every repository starts with this node
present and `enabled: false`.

Credentials are not stored on the node. Each provider entry names a secret
with `credential_ref`, and the key itself lives in the
[secret store](../../concepts/secrets.md), which never returns a value.

```yaml
enabled: true
base_url: https://app.example.com        # used to build magic-link redirects
default_provider: transactional
redirect_allowlist: []                   # extra origins magic links may redirect to
providers:
  - name: transactional                  # the name a function passes as `provider`
    provider: resend                     # resend | brevo | smtp
    from_address: no-reply@example.com
    from_name: Example
    reply_to: support@example.com        # optional
    credential_ref: secret://email/resend_api_key
    enabled: true                        # default true
    default: false                       # alternative to default_provider

  - name: marketing
    provider: brevo
    from_address: hello@example.com
    credential_ref: secret://email/brevo_api_key

  - name: relay
    provider: smtp
    from_address: no-reply@example.com
    credential_ref: secret://email/smtp_password
    smtp:
      host: smtp-relay.brevo.com
      port: 587                          # default
      username: account@example.com
      security: starttls                 # starttls (default) | tls | none
```

`name` identifies the entry; `provider` selects the API. Two Resend accounts
are two entries with the same `provider` and different names.

Store each credential under the referenced name:

```bash
raisindb secret set email/resend_api_key -r myrepo
```

### Which provider a send uses

1. A send that names a provider uses that entry. An unknown name is an
   error that lists the configured names; a disabled entry is an error too.
   There is no fallback to the default.
2. A send that names none uses the default: `default_provider` if set,
   otherwise the single entry flagged `default`, otherwise the only enabled
   entry. Several enabled entries with no default is a configuration error.
3. `enabled: false` on the configuration stops every send regardless of the
   providers listed. This is the most common reason for "configured but
   nothing happens".

The default provider is what system mail uses: magic-link sign-in,
notifications, and any function that does not name a provider.

## Providers

### Resend

An API key from **resend.com, API Keys**. The sending domain must be verified
there.

### Brevo

`provider: brevo` uses Brevo's REST transactional API and needs a **v3 API
key** from *Settings, API keys*.

:::note Two Brevo credentials look alike
The **SMTP key** from *Settings, SMTP & API, SMTP* is a different credential
for Brevo's relay. Used with a `brevo` provider it makes every send fail with
`401`. To send through the SMTP key, configure an `smtp` provider against
`smtp-relay.brevo.com` instead.
:::

Brevo requires an HTML part. When you send text only, RaisinDB derives an
escaped HTML part from the text body.

### SMTP

Any relay: a provider's SMTP endpoint, a corporate MTA, your own Postfix.

| Field | Notes |
|---|---|
| `host` | Submission host |
| `port` | Defaults to 587 (STARTTLS); use 465 with `security: tls` |
| `username` | Account login; leave empty only for a relay that authenticates by source address |
| `security` | `starttls` (default), `tls` (implicit TLS) or `none` |

The password is the secret named by `credential_ref`. With `starttls` the TLS
upgrade is required, not attempted, so a relay without TLS fails instead of
receiving the password in the clear. `none` sends the credential unencrypted
and is only appropriate on a trusted network.

The relay host must resolve to a public address unless the operator has
enabled private egress for the server; loopback and private-network relays
are refused by the egress guard.

## Checking that it works

A saved configuration shows the fields are filled in and the Secrets page
shows the key exists; neither shows the key is correct. The **Send test**
button on the Email page invokes the built-in `send-test-email` function,
which calls `raisin.email.send` like any other function, so a successful
result confirms the whole chain: configuration, provider selection, secret,
provider account and sending domain. Test sends run on `main`.

## Sending from a function

The `raisin.email` binding is the same in JavaScript and Starlark. In
JavaScript the calls are synchronous.

```js
// The default provider, the same one a magic link uses
const receipt = raisin.email.send({
  to: ["a@example.com"],            // string or array; cc and bcc likewise
  subject: "Your receipt",
  text: "Thanks!",                  // required
  html: "<p>Thanks!</p>",           // optional
});
// { message_id, provider: "resend", sender: "transactional" }

// A named provider
raisin.email.send({ to: "a@example.com", subject: "News", text: "...", provider: "marketing" });

// What is configured, without credentials
const { enabled, providers } = raisin.email.providers();
// providers: [{ name, provider, from_address, enabled, default }]
```

```python
# Starlark
raisin.email.send({"to": ["a@example.com"], "subject": "Hi", "text": "..."})
```

A function chooses which configured account to use, not who it is. The
sender address, name and reply-to come from the configuration, so a function
cannot send as an address you have not verified. A receipt means the provider
accepted the message; delivery is a later, separate event. At most 20
recipients per send.

See the [`raisin.email` reference](/docs/reference/function-api/email) for the
full shapes, including attachments.

## Allowing a function to send

Sending is denied per function until the function declares an `email_policy`
in its `.node.yaml`, and reading the provider credential needs a matching
`secret_policy`:

```yaml
email_policy:
  enabled: true
  allowed_recipients: ["example.com", "*.example.com"]
secret_policy:
  enabled: true
  allowed_names: ["email/*"]
```

`allowed_recipients` matches the **domain** of each address, case-insensitive,
with glob patterns: `example.com`, `*.example.com`, or `*` for any domain.
Every recipient in `to`, `cc` and `bcc` must match; a message with one
disallowed address is refused as a whole with `[email:policy_denied]`.
`enabled: true` with an empty list denies everything.

The built-in `send-magic-link` and `send-test-email` functions ship with
`allowed_recipients: ["*"]`, because a sign-in link goes to whatever address
the person typed. Narrow it to your own domains if you want a closed-audience
mailer.

## Magic links

Magic-link sign-in needs two things from this configuration:

- **`base_url`**, the origin the user is redirected to after verifying. It is
  taken from the configuration, never from the request's `Host` or `Origin`
  header. A caller-supplied `redirect_url` must sit under `base_url` or match
  an entry in `redirect_allowlist`.
- **A working default provider.** The link is sent by the built-in
  `send-magic-link` function, which names no provider.

If sign-in links never arrive, check in this order: is `enabled` on, is there
a default provider, does its secret exist, does **Send test** succeed?
