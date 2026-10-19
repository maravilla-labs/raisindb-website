---
title: Add direct uploads from a phone, kiosk or any device without a user
description: Your user is logged in on the desktop, the file is on the phone. Mint a signed one-time upload token, show a QR code, and let the device upload straight into RaisinDB. Requires engine v0.7.21.
---

# Add direct uploads from a phone, kiosk or any device without a user to your own app

*Requires engine v0.7.21 or later.*

The problem: your user is logged in on the desktop, and the file is on their phone. You do not want the phone to log in, and you do not want to give it a service account, a create grant on a shared folder, or a staging area you have to clean up.

The answer is an **upload token**: your backend, acting as the logged-in user, asks RaisinDB for a signed token that allows one upload to one destination. The phone presents it as `Authorization: Upload <token>` to the normal chunked upload endpoints. The token reaches nothing else in the API. Full contract, errors and security model: [Upload tokens](../../reference/http-api/upload-tokens.md).

## What you build

1. **Your logged-in app mints the token** (the engine checks the user may create at the destination).
2. **Your app shows a QR code or link** carrying the token in the URL fragment (`#t=...`). A fragment is never sent to a server, so the token stays out of access logs.
3. **The device page uploads** with `fetch`, in chunks, with progress.

## 1. Mint (your backend or the logged-in page)

Send the user's own bearer token. Nothing here uses a privileged key.

```javascript
// Runs as the logged-in user.
async function mintUploadToken(userToken) {
  const res = await fetch('https://db.example.com/api/uploads/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repository: 'my-repo',
      workspace: 'assets',
      folder: '/inbound/phone', // server names each file: up-<id>-<n>.jpg
      extension: 'jpg',
      allowed_mimes: ['image/*'],
      max_bytes: 20 * 1024 * 1024,
      ttl_seconds: 600,
      uses: 1,
    }),
  });
  if (!res.ok) throw new Error((await res.json()).code ?? res.status); // 403: user may not create here
  return (await res.json()).token;
}

const token = await mintUploadToken(userToken);
const link = `https://app.example.com/phone-upload#t=${token}`; // render as QR with any QR library
```

## 2. Upload (the device page, no login)

```javascript
const base = 'https://db.example.com';
const token = new URLSearchParams(location.hash.slice(1)).get('t');
history.replaceState(null, '', location.pathname); // keep the token out of the address bar
const auth = { Authorization: `Upload ${token}` };

async function check(res) {
  if (res.ok) return res;
  const { code } = await res.json().catch(() => ({}));
  throw new Error(code ?? `HTTP ${res.status}`); // TOKEN_MIME, TOKEN_TOO_LARGE, TOKEN_DESTINATION_TAKEN, 401 ...
}

async function upload(file, onProgress) {
  const open = await check(await fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_size: file.size, content_type: file.type }),
  }));
  const { upload_id, chunk_size } = await open.json();

  for (let start = 0; start < file.size; start += chunk_size) {
    const end = Math.min(start + chunk_size, file.size);
    await check(await fetch(`${base}/api/uploads/${upload_id}`, {
      method: 'PATCH',
      headers: {
        ...auth,
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: file.slice(start, end),
    }));
    onProgress?.(end / file.size);
  }

  const done = await check(await fetch(`${base}/api/uploads/${upload_id}/complete`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: '{}',
  }));
  return done.json(); // { upload_id, job_id, status }; the node appears a moment later
}

document.querySelector('input[type=file]').addEventListener('change', async (e) => {
  try {
    await upload(e.target.files[0], (p) => (bar.value = p));
    status.textContent = 'Sent';
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
  }
});
```

If the page is on another origin than the engine, allow `Authorization`, `Content-Range` and the `PATCH` method in CORS. A `409 TOKEN_DESTINATION_TAKEN` after a single-use token has completed is expected on a retry: do not retry blindly, mint a new token.

## Node variant (a script or kiosk backend)

```javascript
import { readFile } from 'node:fs/promises';

const base = 'https://db.example.com';
const auth = { Authorization: `Upload ${process.env.UPLOAD_TOKEN}` };
const bytes = await readFile('photo.jpg');

const open = await (await fetch(`${base}/api/uploads`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ file_size: bytes.length, content_type: 'image/jpeg' }),
})).json();

for (let s = 0; s < bytes.length; s += open.chunk_size) {
  const e = Math.min(s + open.chunk_size, bytes.length);
  const r = await fetch(`${base}/api/uploads/${open.upload_id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${s}-${e - 1}/${bytes.length}` },
    body: bytes.subarray(s, e),
  });
  if (!r.ok) throw new Error(JSON.stringify(await r.json()));
}
await fetch(`${base}/api/uploads/${open.upload_id}/complete`, {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}',
});
```

## curl variant

```bash
curl -s -X POST https://db.example.com/api/uploads \
  -H "Authorization: Upload $UPLOAD_TOKEN" -H "Content-Type: application/json" \
  -d '{"file_size":11,"content_type":"text/plain"}'          # -> upload_id

curl -s -X PATCH https://db.example.com/api/uploads/$UPLOAD_ID \
  -H "Authorization: Upload $UPLOAD_TOKEN" -H "Content-Type: application/octet-stream" \
  -H "Content-Range: bytes 0-10/11" --data-binary 'hello world'

curl -s -X POST https://db.example.com/api/uploads/$UPLOAD_ID/complete \
  -H "Authorization: Upload $UPLOAD_TOKEN" -H "Content-Type: application/json" -d '{}'
```

## The JavaScript client

The `@raisindb/client` upload helpers (`client.upload`, `workspace.upload`, ...) always authenticate as the connected user: they send the client's own bearer token. They have no option to send an upload token, so on the device use plain `fetch` as above. This page does not rely on any SDK method for tokens.

## Patterns and the limits to choose

| Pattern | Destination | `uses` | `ttl_seconds` | `allowed_mimes` | `max_bytes` |
| --- | --- | --- | --- | --- | --- |
| Mobile scan companion (desktop shows a QR, phone scans a document) | exact `path`, or a `folder` | 1 | 300 to 600 | `application/pdf`, `image/*` | 10 to 25 MiB |
| Customer file drop (you send a link to a customer for their contract) | `folder` per customer | 5 to 20 | up to 3600 | the types you accept | what you accept |
| Kiosk or photo booth (one token per visitor, minted by the kiosk backend) | `folder` | 1 to 3 | 300 | `image/*` | 10 MiB |
| Import from another device (a CSV or export from a laptop you do not log into) | exact `path` | 1 (always, with `path`) | 600 | `text/csv` | size of the file |

Choose the smallest `uses`, `ttl_seconds` and `max_bytes` that work. Limits are hard bounds: `ttl_seconds` 1 to 3600, `uses` up to 20 in folder mode, `max_bytes` up to 1 GiB, up to 20 MIME patterns. The token is create-only: it never overwrites an existing node. A session opened before the token expired stays usable for up to one hour.

Do not treat the token as a login. It carries no user and no permission beyond its one destination; the user's permission was checked when you minted it.
