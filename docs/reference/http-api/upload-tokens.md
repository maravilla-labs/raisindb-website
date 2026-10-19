---
title: Upload tokens
description: Signed one-time tokens that let a device without a user upload into one destination. Available from engine v0.7.21.
---

# Upload tokens (device uploads without a user)

*Available from engine v0.7.21.*

An upload token lets a signed-in user authorize **one destination** for a device that has no account, for example a phone that scanned a QR code. The device uploads through the normal [resumable upload endpoints](../javascript-client/uploads.md#http-endpoints) with `Authorization: Upload <token>`. No service identity, create grant or staging folder is needed.

Without a token, an upload needs an authenticated user who owns the session, and that user needs `create` on the destination (`update` when a node is already there).

## How it works

1. A signed-in user, allowed to create at the destination, mints a token with `POST /api/uploads/tokens`. The engine checks that permission at mint time.
2. The token is handed to the device. A QR URL **fragment** (`#t=...`) is a good carrier: a fragment is never sent to a server, so it stays out of access logs.
3. The device opens an upload session, sends chunks and completes, all with `Authorization: Upload <token>`.

The destination, size limit and content types come from the signed claim, never from the request body. The token is read by the upload endpoints only; on every other route `Authorization: Upload ...` is not a credential, and `Bearer <token>` is not a valid login.

## Mint a token

```
POST /api/uploads/tokens
Authorization: Bearer <user token>
Content-Type: application/json
```

Anonymous callers and upload tokens are refused (`401`). The caller's `create` permission on the destination, and on any folder the upload would have to create, is checked with the same rules as a direct upload (`403` otherwise).

```json
{
  "repository": "my-repo",
  "branch": "main",
  "workspace": "assets",
  "folder": "/inbound/phone",
  "extension": "jpg",
  "max_bytes": 20971520,
  "allowed_mimes": ["image/*"],
  "ttl_seconds": 600,
  "uses": 1
}
```

Give exactly one of:

- `path`: the exact destination, for example `/documents/2026/scan.pdf`. One use.
- `folder`: a folder. Each use is stored as `<folder>/up-<id>-<n>[.<extension>]`, a name the server chooses. `uses` is how many files the token may add.

| Field | Default | Limit |
| --- | --- | --- |
| `repository`, `workspace` | required | |
| `branch` | `main` | |
| `node_type` | `raisin:Asset` | |
| `extension` | none | folder mode; 1 to 8 letters or digits |
| `max_bytes` | 50 MiB | 1 GiB |
| `allowed_mimes` | any | up to 20; `image/*` wildcards allowed |
| `ttl_seconds` | 600 | 1 to 3600 |
| `uses` | 1 | 1 to 20 (folder mode; always 1 with `path`) |

Response `201`:

```json
{
  "token": "rut1.<payload>.<signature>",
  "expires_at": "2026-10-20T09:10:00Z",
  "upload_url": "/api/uploads",
  "max_bytes": 20971520,
  "uses": 1
}
```

```bash
curl -s -X POST https://db.example.com/api/uploads/tokens \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repository":"my-repo","workspace":"assets","folder":"/inbound/phone","extension":"jpg","allowed_mimes":["image/*"]}'
```

## Upload with the token

Every call carries `Authorization: Upload <token>` and no other credential.

### 1. Open a session

```
POST /api/uploads
```

```json
{ "file_size": 1234567, "content_type": "image/jpeg" }
```

`chunk_size` is optional. The repository, branch, workspace, path and file name come from the token. A body that names a repository, branch, workspace or path outside the token is refused with `403 TOKEN_SCOPE`; other metadata in the body is ignored. This call takes one of the token's uses; a refused request does not.

Response `201`: `upload_id`, `upload_url` (`/api/uploads/{id}`), `chunk_size`, `total_chunks`, `expires_at`.

### 2. Send chunks

```
PATCH /api/uploads/{id}
Content-Range: bytes <start>-<end>/<file_size>
```

The chunk is the request body. Repeat until all bytes are sent. `HEAD` and `GET` on the same URL report progress.

### 3. Complete

```
POST /api/uploads/{id}/complete
```

Body `{}`. Returns `{upload_id, job_id, status}`; the node is written by a background job. The write runs as the system, as for any upload, and is attributed to the actor `upload-token`; a token cannot choose the commit actor or message. The authorization happened at mint time.

`DELETE /api/uploads/{id}` cancels a session. A token reaches only the sessions it opened; any other id answers `404`.

### Phone side, JavaScript

```javascript
const token = new URLSearchParams(location.hash.slice(1)).get('t');
const base = 'https://db.example.com';
const auth = { Authorization: `Upload ${token}` };

async function upload(file) {
  const open = await fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_size: file.size, content_type: file.type }),
  });
  if (!open.ok) throw new Error((await open.json()).code);
  const { upload_id, chunk_size } = await open.json();

  for (let start = 0; start < file.size; start += chunk_size) {
    const end = Math.min(start + chunk_size, file.size);
    const res = await fetch(`${base}/api/uploads/${upload_id}`, {
      method: 'PATCH',
      headers: {
        ...auth,
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: file.slice(start, end),
    });
    if (!res.ok) throw new Error((await res.json()).code);
  }

  const done = await fetch(`${base}/api/uploads/${upload_id}/complete`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!done.ok) throw new Error((await done.json()).code);
  return done.json();
}
```

The same flow with curl:

```bash
curl -s -X POST https://db.example.com/api/uploads \
  -H "Authorization: Upload $UPLOAD_TOKEN" -H "Content-Type: application/json" \
  -d '{"file_size":11,"content_type":"text/plain"}'
# -> {"upload_id":"...", ...}

curl -s -X PATCH https://db.example.com/api/uploads/$UPLOAD_ID \
  -H "Authorization: Upload $UPLOAD_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-Range: bytes 0-10/11" --data-binary 'hello world'

curl -s -X POST https://db.example.com/api/uploads/$UPLOAD_ID/complete \
  -H "Authorization: Upload $UPLOAD_TOKEN" -H "Content-Type: application/json" -d '{}'
```

A page served from another origin than the engine needs the usual CORS allowance for the `Authorization` and `Content-Range` headers and the `PATCH` method.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | | Token missing, malformed, signed for another tenant, bad signature, or expired when the session is opened. One answer for every reason. |
| 403 | `TOKEN_SCOPE` | The body names a repository, branch, workspace or path the token does not cover. |
| 404 | | The session does not exist or was not opened by this token. |
| 409 | `TOKEN_DESTINATION_TAKEN` | A node already exists at the destination, or another session of this token is already heading there. |
| 413 | `TOKEN_TOO_LARGE` | `file_size` is over the token's `max_bytes`. Also returned while a chunk streams past the declared size. |
| 415 | `TOKEN_MIME` | The content type is outside `allowed_mimes`, or none was sent when a list is set. |
| 410 | `SESSION_EXPIRED` | The upload session itself expired. |

Minting returns `401` for anonymous callers, `403` when the caller may not create at the destination, and `400` for a bad request (neither or both of `path` and `folder`, an invalid path or extension, more than 20 MIME patterns).

## Security model and limits

- **Signed claim.** The token is an HMAC-SHA256 signature over the claim: tenant, repository, branch, workspace, destination, limits, expiry, token id and uses. It is compared in constant time.
- **Per-tenant key.** The key is derived per tenant from the signing secret with a domain separator of its own. A token for one tenant fails on another, and a signed asset URL is never an upload token.
- **No identity.** The token carries no user and no permission. Authorization happened when it was minted.
- **Expiry gates opening a session.** A session opened in time stays usable for up to one hour, so a slow upload can finish after the token's own expiry. It is still limited to that one session.
- **Size** is enforced twice: when the session opens, and while each chunk streams.
- **Create-only.** Opening a session and completing it both refuse with `409 TOKEN_DESTINATION_TAKEN` when a node already exists at the destination. A node that appeared after the token was minted is never overwritten, and a use that has completed cannot be replayed.
- **Single use per destination.** Every use writes one node at a destination derived from the token. A destination that already holds a node refuses the next open and the completion with `409 TOKEN_DESTINATION_TAKEN`, so a use that has completed never repeats, across restarts and across cluster nodes. The count of opened uses is kept in the server process, like the upload sessions.
- **Logging.** Neither the token nor its signature is logged, only the token id.

## Configuration and key rotation

Tokens are signed with the engine signing secret, `RAISINDB_SIGNING_SECRET` (see [configuration](../configuration.md)). To rotate it, set the old value as `RAISINDB_SIGNING_SECRET_PREVIOUS` while you switch. Tokens signed with the old secret keep verifying until they expire (at most one hour). Remove the variable afterwards.

See also: [Let a phone upload into a folder](../../guides/connecting/phone-upload-qr.md) and the [JavaScript client uploads](../javascript-client/uploads.md).
