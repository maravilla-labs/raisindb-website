---
sidebar_position: 1
---

# `raisin.crypto`

Cryptographic primitives available inside a
[function](../../guides/functions/creating-functions.md), in both the
JavaScript (QuickJS) and Starlark runtimes. The JavaScript calls are
synchronous; `await` is harmless but not needed.

This is the complete surface. There is no `md5`, `sha1`, `randomUUID` or HMAC
binding.

## Methods

| JavaScript | Starlark | Returns |
|---|---|---|
| `crypto.uuid()` | `crypto.uuid()` | UUID v4 string |
| `crypto.randomBytes(n)` | `crypto.random_bytes(n)` | base64url (unpadded) string of `n` random bytes, `n` in `1..=64` |
| `crypto.hash(input, alg?)` | `crypto.hash(input, alg?)` | lowercase hex digest |
| `crypto.generateKeyPair(alg?)` | `crypto.generate_key_pair(alg?)` | `{ alg, publicJwk, privateJwk }` |
| `crypto.signJwt(claims, privateJwk, opts?)` | `crypto.sign_jwt(...)` | compact JWS string |
| `crypto.verifyJwt(token, opts?)` | `crypto.verify_jwt(token, opts?)` | `{ valid, claims?, error? }` |

```js
raisin.crypto.uuid();            // "20e0fd9d-85c2-4d0d-9355-c9cf1639a13e"
raisin.crypto.randomBytes(16);   // "MuK5ndZzYd2sPdh9_r0Mgw"
raisin.crypto.hash("hello");     // "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
```

### `randomBytes(n)`

`n` cryptographically secure random bytes from the operating system,
base64url-encoded without padding, so the result can go straight into a URL,
a filename or a JWS segment. `n` outside `1..=64` is an error
(`[crypto:invalid_length]`). This and `uuid()` are the only CSPRNG sources in
the runtime; `Math.random()` is not one.

### `hash(input, alg?)`

Lowercase hex digest of a UTF-8 string. `alg` is `"sha256"` (default) or
`"sha512"`; anything else is `[crypto:unsupported_alg]`.

```js
raisin.crypto.hash("hello");            // sha256
raisin.crypto.hash("hello", "sha512");  // sha512
```

A bare digest is not a message authentication code. To authenticate a payload
(for example a webhook body), sign it with `signJwt` rather than hashing
`secret + body`.

### `generateKeyPair(alg?)`

Generates a signing key pair. `alg` defaults to `"ES256"` (ECDSA on P-256)
and is currently the only supported value.

```js
const { alg, publicJwk, privateJwk } = raisin.crypto.generateKeyPair();
// publicJwk: { kty: "EC", crv: "P-256", alg: "ES256", use: "sig", kid, x, y }
// privateJwk: the same plus d
```

Publish `publicJwk` in a JWKS document; pass `privateJwk` whole to `signJwt`.
`kid` is derived from the public point, so the same key always has the same
id. The runtime never logs the private key; where you store it is up to you
(see below).

### `signJwt(claims, privateJwk, opts?)`

Signs `claims` (an object) into a compact JWS `header.payload.signature`.

| Option | Type | Meaning |
|---|---|---|
| `alg` | string | Must be `"ES256"` if given |
| `kid` | string | Header `kid`. Defaults to the private JWK's own `kid` |
| `expiresInSec` | integer | Sets `exp = now + expiresInSec`. Must be a positive whole number |

- The header is always `{"alg":"ES256","typ":"JWT","kid":...}`; the caller
  cannot change `alg`.
- `iat` is added when the claims do not carry one.
- `expiresInSec` overrides any `exp` already present in `claims`.
- A non-integer, zero, negative or string `expiresInSec` is rejected with
  `[crypto:invalid_options]` rather than ignored (`600.0` is accepted, `899.5`
  is not), because a token without `exp` is read as never expiring by most
  verifiers.
- Passing options positionally (`signJwt(claims, key, 600)`) is an error.

### `verifyJwt(token, opts?)`

Verifies an RS256 or ES256 token against a JWKS.

`opts = { jwks_url, issuer?, audience?, algorithms? }`. Returns
`{ valid: true, claims }` or `{ valid: false, error }`; an invalid or expired
token, or a missing `jwks_url`, is a `valid: false` result rather than an
exception.

The call throws only when the JWKS host is not allowed by the function's
`network_policy` (`[crypto:policy_denied]`, checked before any connection is
opened) or the JWKS cannot be fetched or parsed (`[crypto:jwks_unreachable]`,
`[crypto:jwks_invalid]`). Key sets are cached for five minutes; redirects are
not followed.

## Signature encoding

An ES256 signature is the JOSE fixed-width form: `r` and `s` as 32 raw bytes
each, concatenated into 64 bytes and base64url-encoded without padding. This
is what RFC 7515 and 7518 specify and what JOSE libraries (`jose`,
`jsonwebtoken`, `PyJWT`, `go-jose`) expect. If you verify with a raw ECDSA
API instead, convert the 64 bytes to DER first. All JWS segments and the JWK
`x`, `y` and `d` members are base64url without padding.

## Sign and verify an ES256 token

Mint an offline-verifiable ticket token, then verify it against the JWKS the
same tenant publishes.

```js
export async function issueTicket(input) {
  // 1. A signing key. Generate once, store the private half in the secret
  //    store, publish the public half at /.well-known/jwks.json.
  const privateJwk = JSON.parse(raisin.secrets.get("tickets/signing-key"));

  // 2. Mint the token. exp comes from expiresInSec, iat is automatic,
  //    kid is taken from the key so the verifier can select it.
  const token = raisin.crypto.signJwt(
    {
      iss: "https://tickets.example.com",
      aud: "door-scanner",
      sub: input.ticket_id,
      seat: input.seat,
      jti: raisin.crypto.randomBytes(16),
    },
    privateJwk,
    { expiresInSec: 24 * 60 * 60 }
  );

  // 3. Verify, the same call the door scanner makes.
  const result = raisin.crypto.verifyJwt(token, {
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
fails with `[crypto:policy_denied]`.

Generating the key pair is a one-off:

```js
const { publicJwk, privateJwk } = raisin.crypto.generateKeyPair("ES256");
// publish { keys: [publicJwk] }; keep privateJwk in the secret store
```

## Reading a signing key from `raisin.secrets`

A private JWK is a credential. Keep it in the
[secret store](../../concepts/secrets.md), either as a named secret or in a
node property declared `encrypted: true`, and not in an ordinary property or
a log line.

Reading it back requires a `secret_policy` on the function. Without a
matching grant `raisin.secrets.get()` fails with `[secrets:policy_denied]`
and `signJwt` is never reached:

```yaml
# functions/issue-ticket/.node.yaml
secret_policy:
  enabled: true
  allowed_names: ["tickets/*"]
```

```js
const privateJwk = JSON.parse(raisin.secrets.get("tickets/signing-key"));
```

Two things to plan for:

- **Rotation is a secret-store operation.** Secrets are versioned: publish
  the new `publicJwk` in the JWKS alongside the old one, rotate the secret,
  and let in-flight tokens age out. The `kid` in each header tells the
  verifier which key to use.
- **`crypto` itself has no policy gate.** `uuid`, `randomBytes`, `hash`,
  `generateKeyPair` and `signJwt` touch nothing outside the process, so any
  function can call them. The capability checks are the `secret_policy` on the
  key and the `network_policy` on `verifyJwt`'s `jwks_url`. A function that
  can read the key can mint any claims, so keep `allowed_names` narrow.

## Errors

Failures carry a machine-readable tag as a prefix of the message:

| Tag | Cause |
|---|---|
| `[crypto:unsupported_alg]` | `alg` other than `ES256`, or a digest other than `sha256`/`sha512` |
| `[crypto:invalid_length]` | `randomBytes(n)` with `n` outside `1..=64` |
| `[crypto:invalid_key]` | Malformed EC private JWK. The message does not say which component was wrong |
| `[crypto:invalid_claims]` | Claims are not an object or not JSON-serializable |
| `[crypto:invalid_options]` | `opts` is not an object, or `expiresInSec` is not a positive integer |
| `[crypto:invalid_expiry]` | `expiresInSec` is not greater than zero |
| `[crypto:policy_denied]` | `verifyJwt`'s `jwks_url` is not allowed by `network_policy` |
| `[crypto:jwks_unreachable]`, `[crypto:jwks_invalid]` | The JWKS could not be fetched or parsed |
| `[crypto:rng_failed]`, `[crypto:keygen_failed]`, `[crypto:sign_failed]` | The underlying primitive failed |

## See also

- [Creating Functions](../../guides/functions/creating-functions.md)
- [Secrets](../../concepts/secrets.md)
- [Virtual Node Adapters](../virtual-node-adapters.md), which use `verifyJwt` in the signed-push path
