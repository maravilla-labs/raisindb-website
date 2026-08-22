---
sidebar_position: 4
title: Outbound Email
description: Configure one or more transactional email providers (Resend, Brevo, SMTP), mark one default, and send from functions
---

# Outbound Email

Transactional mail — magic-link sign-in, notifications, receipts — goes out
through **your own** provider accounts, from **your own** verified domains.

There is deliberately no platform fallback sender. A repository that has
configured nothing cannot send at all, rather than sending as somebody else.

## Configure it

Everything below lives on the **Email** page of the admin console, per
repository branch. Under the hood it is a `raisin:EmailConfig` node at
`/config/email` in the `raisin:system` workspace — versioned, auditable and
diffable like any other node.

The **credentials are not on that node**. Each provider carries a
`credential_ref` such as `secret://email/api_key`; the key itself lives in the
secret store, which has no route that returns a value.

### One or more providers, one default

You configure a list of senders and mark one default:

```yaml
enabled: true
base_url: https://app.example.com
default_provider: transactional
providers:
  - name: transactional          # the name a function passes to send()
    provider: resend             # which API it talks to
    from_address: no-reply@example.com
    from_name: Example
    credential_ref: secret://email/resend_api_key

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
      port: 587
      username: account@example.com
      security: starttls
```

`name` is **not** the provider API. Two Resend accounts are two entries with the
same `provider` and different names — which is the point of naming them.

:::info The default is what your users see
The default provider is what **system mail** goes through: magic-link sign-in
above all, plus notifications and any function that names no provider. Set it
before you enable email.
:::

### Which provider a send uses

1. A send that **names** one gets that one. It must exist and be enabled — an
   unknown name is an **error**, never a quiet fall-back to the default. Mail
   leaving through the wrong account is worse than mail not leaving.
2. A send that names none gets the default: `default_provider`, else the entry
   flagged `default`, else the only enabled provider.
3. Several enabled providers and no default is a configuration error, for the
   same reason as (1).

`enabled` on the configuration outranks all of it. Off means nothing sends,
however many providers are configured — and it is the most common reason for
"I configured it and nothing happens".

## Providers

### Resend

An API key from **resend.com → API Keys**. The sending domain must be verified
there.

### Brevo

`provider: brevo` uses Brevo's **REST transactional API**.

:::danger Brevo has two different credentials, both called a key
The REST API needs a **v3 API key** from *Settings → API keys*.

The **SMTP key** from *Settings → SMTP & API → SMTP* is a **different
credential** for Brevo's relay. Put it in a `brevo` provider and every send
returns **401**, with nothing in the error naming the mix-up. This is the single
most common reason a correct-looking Brevo configuration never delivers.

To use an SMTP key, configure an `smtp` provider against `smtp-relay.brevo.com`
instead.
:::

Brevo also requires an HTML part. RaisinDB derives an escaped one from your text
body when you send text only, so a plain-text message still works.

### SMTP

Any relay — a provider's SMTP endpoint, a corporate MTA, your own Postfix.

| Field | Notes |
|---|---|
| `host` | Submission host, e.g. `smtp-relay.brevo.com` |
| `port` | 587 for STARTTLS (default), 465 for implicit TLS |
| `username` | Often the account login; leave empty only for a relay that authenticates by source address |
| `security` | `starttls`, `tls` or `none` |

The password is the secret named by `credential_ref`, exactly like an API key.

`starttls` **requires** the upgrade rather than attempting it, so a relay that
lost TLS support fails instead of sending your password in the clear. `none`
sends the credential unencrypted and is only ever right on a trusted network.

:::note Where a relay may live
The relay host goes through the server's egress guard: it must resolve to a
public address unless the operator has enabled private egress server-wide. An
operator-typed hostname is dialled by the server, so a loopback or
private-network relay would otherwise be an SSRF primitive.
:::

## Prove it works

A saved configuration proves the fields are filled in. The Secrets page proves a
key **exists**. Neither proves the key is the **right** key — nothing reads a
secret's value back.

The **Send test** button on the Email page is the only signal that is not
indirect. It invokes the built-in `send-test-email` function, which calls
`raisin.email.send` like any other function would, so a green result proves the
whole chain: configuration, provider selection, secret, provider account and
sending domain.

Test sends run on `main`, so run them from the `main` branch's Email page.

## Send from a function

One definition serves both runtimes, so QuickJS and Starlark see the same call.

```js
// The default provider — the same one a magic link uses
const receipt = await raisin.email.send({
  to: ["a@example.com"],
  subject: "Your receipt",
  text: "Thanks!",
  html: "<p>Thanks!</p>",
});
// { message_id, provider: "resend", sender: "transactional" }

// …or a named provider
await raisin.email.send({
  to: "a@example.com",
  subject: "News",
  text: "…",
  provider: "marketing",
});

// What is configured, with no credential in the answer
const { enabled, providers } = await raisin.email.providers();
```

```python
# Starlark
raisin.email.send({"to": ["a@example.com"], "subject": "Hi", "text": "..."})
```

A function chooses **which** configured account to use — never **who** it is.
`from`, `from_name` and `reply_to` come from the configuration, so a function
cannot send as an address you never verified.

See the [`raisin.email` reference](/docs/reference/function-api/email) for the
full shapes.

## Grant a function permission to send

Sending is **denied by default, per function**. Declare an `email_policy` in the
function's `.node.yaml`:

```yaml
email_policy:
  enabled: true
  allowed_recipients: ["*@example.com"]
secret_policy:
  enabled: true
  allowed_names: ["email/*"]
```

Every recipient must be allowed. There is no partial send: a message to one
permitted and one forbidden address is refused whole, because silently dropping
a recipient would let you believe it went somewhere it did not.

`enabled: true` with an empty `allowed_recipients` still denies everything —
"opted in" never silently means "unrestricted".

:::tip Mail to your own users needs `*`, and that is not a lapse
A sign-in link or a password reset goes to whatever address the person typed;
you do not own those domains and cannot enumerate them. The built-in
`send-magic-link` function ships with `*` for exactly this reason, so
passwordless sign-in works out of the box. Narrowing it to your own domains is
the single edit that turns it into a closed-audience mailer.
:::

The `secret_policy` matters too: a function may hold `email_policy` and still be
refused the credential, which surfaces as a separate, later error.

## Magic links

Magic-link sign-in needs two things from this page:

- **`base_url`** — the origin every link is built from. It is *never* derived
  from the request's `Host` or `Origin` header: an attacker who can set those
  could otherwise poison a link so that the victim's one-time token is delivered
  to their host.
- **A working default provider** — the link is rendered and sent by the built-in
  `send-magic-link` function, which names no provider.

If sign-in links never arrive, work down this list in order: is `enabled` on?
is there a default provider? does its secret exist? does **Send test** succeed?

## Limits

At most 20 recipients per send. Transactional mail is one-to-one or
one-to-a-handful; an unbounded list is an amplification primitive, and anything
larger belongs to a campaign tool.

A receipt means the provider **accepted** the message. Delivery is a later,
separate event.
