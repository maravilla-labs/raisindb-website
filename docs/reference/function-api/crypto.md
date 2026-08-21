---
sidebar_position: 1
---

# `raisin.crypto`

Cryptographic primitives available inside a
[function](../../guides/functions/creating-functions.md), in both the QuickJS
(JavaScript) and Starlark runtimes. Every binding is asynchronous in JavaScript
— `await` it.

This page is the complete surface. There is no `md5`, no `sha1`, no
`randomUUID`, and no HMAC binding; if a snippet elsewhere uses one of those
names, it is wrong.

## Methods

| JavaScript | Starlark | Returns |
|---|---|---|
| `crypto.uuid()` | `crypto.uuid()` | UUID v4 string |
| `crypto.randomBytes(n)` | `crypto.random_bytes(n)` | base64url (unpadded) string of `n` CSPRNG bytes, `n` in `1..=64` |
| `crypto.hash(input, alg?)` | `crypto.hash(input, alg?)` | lowercase hex digest |
| `crypto.generateKeyPair(alg?)` | `crypto.generate_key_pair(alg?)` | `{ alg, publicJwk, privateJwk }` |
| `crypto.signJwt(claims, privateJwk, opts?)` | `crypto.sign_jwt(...)` | compact JWS string |
| `crypto.verifyJwt(token, opts)` | `crypto.verify_jwt(token, opts)` | `{ valid, claims?, error? }` |

### `randomBytes(n)`

`n` cryptographically secure random bytes from the OS generator, base64url-encoded.
`n` must be between 1 and 64 inclusive; anything else is an error, not a clamp.

This is the only CSPRNG in the runtime besides `uuid()`. Use it for short
unguessable codes, nonces and one-time tokens — never `Math.random()`.

:::note The encoding is base64url, unpadded
The returned string uses the URL-safe alphabet and carries no `=` padding, so it
is safe to drop straight into a URL, a QR payload, a filename or a JWS segment
without re-encoding. It will never contain `+`, `/` or `=`.
:::

### `hash(input, alg?)`

Lowercase hex digest of a UTF-8 string. `alg` is `"sha256"` (the default) or
`"sha512"`. Any other algorithm is rejected.

```js
await raisin.crypto.hash("hello");            // sha256, hex
await raisin.crypto.hash("hello", "sha512");  // sha512, hex
```

:::warning A bare digest is not a MAC
`hash(secret + body)` is vulnerable to length-extension and must not be used to
authenticate a webhook body. There is no `crypto.hmac` binding yet; until there
is, sign payloads with `signJwt` instead of hand-rolling a digest construction.
:::

### `generateKeyPair(alg?)`

Generates a fresh signing keypair. `alg` defaults to `"ES256"` (ECDSA on
NIST P-256); it is currently the only supported value.

```js
const { alg, publicJwk, privateJwk } = await raisin.crypto.generateKeyPair();
```

- `publicJwk` — `{ kty: "EC", crv: "P-256", alg: "ES256", use: "sig", kid, x, y }`.
  This is what you publish in a JWKS document.
- `privateJwk` — the same object plus `d`. Pass it whole to `signJwt`.
- `kid` is derived from the public point, so the same key always resolves to the
  same id in a rotating JWKS.

The private JWK is a return value and nothing else — it is never logged by the
runtime. Where it is stored is your decision; see
[Reading a signing key from `raisin.secrets`](#reading-a-signing-key-from-raisinsecrets).

### `signJwt(claims, privateJwk, opts?)`

Signs `claims` (an object) into a compact JWS: `header.payload.signature`.

`opts`:

| Key | Type | Meaning |
|---|---|---|
| `alg` | string | Must be `"ES256"` if present. Validated, never copied into the header. |
| `kid` | string | JWS header `kid`. Defaults to the private JWK's own `kid`. |
| `expiresInSec` | integer | Stamps `exp = now + expiresInSec`. Must be `> 0`. |

Behaviour worth knowing:

- The header is always `{"alg":"ES256","typ":"JWT"}` (plus `kid`). `alg` cannot
  be influenced by the caller, so `alg: "none"` confusion is impossible.
- `iat` is added if the claims do not already carry one.
- `expiresInSec` **overrides** any `exp` already present in `claims`, so a
  copied claim set cannot silently outlive its TTL.
- `expiresInSec` must be a positive whole number of **seconds**. A fractional
  float (`ttlMs / 1000` that did not divide evenly), a string, zero or a negative
  value is **rejected with an error** — never silently dropped. That strictness
  is deliberate: dropping it would mint a token with no `exp`, and while
  `verifyJwt` requires `exp` and would refuse such a token, every other JOSE
  verifier reads a missing `exp` as *never expires*. `600.0` is accepted; `899.5`
  is not.
- Passing options positionally (`signJwt(claims, key, 600)`) is an error rather
  than being read as "no options".

### `verifyJwt(token, opts)`

Verifies an RS256/ES256 token against a JWKS.

`opts = { jwks_url, issuer?, audience?, algorithms? }`. Returns
`{ valid, claims?, error? }` — an invalid or expired token is
`{ valid: false, error }`, never a throw.

A hard error is reserved for two cases: the JWKS host is not permitted by the
function's `network_policy`, or the JWKS is unreachable. The fetched key set is
cached briefly, and redirects are refused (a redirect would slip past the
network-policy check).

## Signatures are JOSE `r||s`, not DER

:::warning ES256 signature encoding
An ES256 signature produced here is the **JOSE fixed-width form**: `r` and `s`
as 32 raw bytes each, concatenated into exactly 64 bytes, then base64url-encoded
**without padding**. It is *not* the ASN.1/DER `SEQUENCE { r, s }` that many
crypto libraries emit by default.

This is what RFC 7515/7518 require, and what every JOSE verifier — `jose`,
`jsonwebtoken`, `PyJWT`, Go's `go-jose` — expects. If you are verifying these
tokens with a raw ECDSA API instead of a JOSE library, you must convert the 64
bytes to DER yourself first.
:::

All three JWS segments are base64url, unpadded. So are the JWK `x`, `y` and `d`
members.

## Sign and verify an ES256 token

Mint an offline-verifiable ticket token, then verify it against the JWKS the
same tenant publishes.

```js
export default async function issueTicket(input) {
  // 1. A signing key. Generate once, store the private half, publish the
  //    public half at /.well-known/jwks.json — do NOT generate per request.
  const jwkJson = await raisin.secrets.get("tickets/signing-key");
  const privateJwk = JSON.parse(jwkJson);

  // 2. Mint the token. `exp` comes from expiresInSec, `iat` is automatic,
  //    `kid` is taken from the key so the verifier can select it.
  const token = await raisin.crypto.signJwt(
    {
      iss: "https://tickets.example.com",
      aud: "door-scanner",
      sub: input.ticket_id,
      seat: input.seat,
      jti: await raisin.crypto.randomBytes(16),
    },
    privateJwk,
    { expiresInSec: 24 * 60 * 60 }
  );

  // 3. Verify — the same call the door scanner makes.
  const result = await raisin.crypto.verifyJwt(token, {
    jwks_url: "https://tickets.example.com/.well-known/jwks.json",
    issuer: "https://tickets.example.com",
    audience: "door-scanner",
    algorithms: ["ES256"],
  });

  if (!result.valid) {
    throw new Error(`ticket token rejected: ${result.error}`);
  }

  return { token, claims: result.claims };
}
```

The function's `network_policy` must allow `tickets.example.com`, or step 3
fails with `[crypto:policy_denied]` before any socket is opened.

Generating a keypair is a one-off:

```js
const { publicJwk, privateJwk } = await raisin.crypto.generateKeyPair("ES256");
// publish { keys: [publicJwk] }; keep privateJwk in the secret store
```

## Reading a signing key from `raisin.secrets`

A private JWK is a credential. Put it in the
[secret store](../../concepts/secrets.md) — as a named secret, or in a node
property declared `encrypted: true` — and never in an ordinary property, a
returned payload or a `console.log`.

Reading it back is gated by the function's own **`secret_policy`**, which is
deny-by-default. Without a matching grant, `raisin.secrets.get()` fails and the
function never reaches `signJwt`:

```yaml
# functions/issue-ticket.node.yaml
secret_policy:
  enabled: true
  allowed_names: ["tickets/*"]
```

```js
const privateJwk = JSON.parse(await raisin.secrets.get("tickets/signing-key"));
```

Two consequences to plan for:

- **Rotation is a secret-store operation, not a code change.** Secrets are
  versioned, so publish the new `publicJwk` in the JWKS alongside the old one,
  rotate the secret, and let in-flight tokens age out — the `kid` in each header
  tells the verifier which key to use.
- **`crypto` itself has no policy gate.** `uuid`, `randomBytes`, `hash`,
  `generateKeyPair` and `signJwt` touch nothing outside the process, so any
  function can call them. The only capability check on this page is the one you
  put on the *key* via `secret_policy` (and the `network_policy` check on
  `verifyJwt`'s `jwks_url`). A function that can read the key can mint any claim
  set it likes, so scope `allowed_names` tightly.

## Errors

Failures carry a machine-readable tag as a prefix:

| Tag | Cause |
|---|---|
| `[crypto:unsupported_alg]` | `alg` other than `ES256`, or a digest other than `sha256`/`sha512` |
| `[crypto:invalid_key]` | Malformed EC private JWK. Deliberately shapeless — it never names which component was wrong, because that would be an oracle over key material |
| `[crypto:invalid_claims]` | Claims are not an object, or not JSON-serializable |
| `[crypto:invalid_expiry]` | `expiresInSec` is not `> 0` |
| `[crypto:policy_denied]` | `verifyJwt`'s `jwks_url` is not allowed by `network_policy` |
| `[crypto:jwks_unreachable]` | The JWKS could not be fetched |

## See also

- [Creating Functions](../../guides/functions/creating-functions.md)
- [Secrets](../../concepts/secrets.md)
- [Virtual Node Adapters](../virtual-node-adapters.md) — `verifyJwt` in the
  signed-push (OIDC) path
