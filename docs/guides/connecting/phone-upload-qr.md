---
title: Let a phone upload into a folder (QR code flow)
description: Mint an upload token on the desktop, show it as a QR code, and let a phone without an account upload a photo. Requires engine v0.7.21.
---

# Let a phone upload into a folder (QR code flow)

*Requires engine v0.7.21 or later.*

Goal: a signed-in user shows a QR code, a phone scans it and uploads one photo into `/inbound/phone`, and the phone never needs an account. Background and the full contract: [Upload tokens](../../reference/http-api/upload-tokens.md).

## 1. Mint a token (desktop, signed in)

The signed-in user must be allowed to create in the folder.

```javascript
const res = await fetch('https://db.example.com/api/uploads/tokens', {
  method: 'POST',
  headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    repository: 'my-repo',
    workspace: 'assets',
    folder: '/inbound/phone',
    extension: 'jpg',
    allowed_mimes: ['image/*'],
    max_bytes: 20 * 1024 * 1024,
    ttl_seconds: 600,
    uses: 1,
  }),
});
const { token } = await res.json();
```

## 2. Show it as a QR code

Put the token in the URL fragment, so it never reaches a server log:

```javascript
const url = `https://app.example.com/phone-upload#t=${token}`;
// render `url` with any QR library
```

## 3. Upload from the phone

The page at `/phone-upload` reads the fragment and runs the three calls (open, chunks, complete) from the [reference](../../reference/http-api/upload-tokens.md#phone-side-javascript), sending `Authorization: Upload <token>` and nothing else. If the page is on another origin than the engine, allow `Authorization`, `Content-Range` and `PATCH` in CORS.

## 4. Check the result

On success the file is stored as `/inbound/phone/up-<id>-0.jpg`, written by a background job a moment after `complete`. A second attempt with the same single-use token is refused. If the token expired before the phone opened a session, the phone gets `401` and the desktop mints a new one.
