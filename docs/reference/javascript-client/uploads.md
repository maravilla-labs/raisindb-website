---
sidebar_position: 7
---

# Uploads

Upload files as asset nodes and generate signed asset URLs. Uploads go over HTTP in chunks, so they work with both the WebSocket client and the HTTP client.

The `path` you give is the **asset node's own path**; the uploaded file becomes that node (type `raisin:Asset` unless `nodeType` says otherwise).

## Single file upload

### From a workspace

```typescript
const ws = db.workspace('content');
const upload = await ws.upload(file, '/images/photo.jpg', {
  onProgress: (p) => console.log(`${Math.round(p.progress * 100)}%`),
});
```

### From the client

```typescript
const upload = await client.upload(file, {
  repository: 'myapp',
  workspace: 'content',
  path: '/images/photo.jpg',
  onProgress: (p) => console.log(`${Math.round(p.progress * 100)}%`),
});
```

### From a file path (Node.js)

```typescript
const upload = await client.uploadFile('/local/path/report.pdf', {
  repository: 'myapp',
  workspace: 'content',
  path: '/docs/report.pdf',
});
// workspace form:
await ws.uploadFile('/local/path/report.pdf', '/docs/report.pdf');
```

---

## Batch upload

Upload several files with a concurrency limit and progress callbacks.

```typescript
const batch = await client.uploadFiles(files, {
  repository: 'myapp',
  workspace: 'content',
  basePath: '/images',
  concurrency: 3,
  onProgress: (p) => console.log(`${p.filesCompleted}/${p.filesTotal} files, ${Math.round(p.progress * 100)}%`),
  onFileComplete: (file) => console.log('done:', file),
  onFileError: (file, error) => console.error('failed:', file, error),
});
```

Workspace shorthand:

```typescript
const batch = await ws.uploadFiles(fileList, '/images', { concurrency: 3 });
```

---

## Upload management

```typescript
client.getUpload(uploadId): Upload | undefined
client.getActiveUploads(): Upload[]
await client.cancelAllUploads(): Promise<void>
```

---

## Signed asset URLs

Time-limited URLs that serve an asset's bytes without a token.

```typescript
const { url, expires_at } = await ws.signAssetUrl('/images/photo.jpg', 'display', { expiresIn: 600 });
// url: '/api/repository/myapp/main/head/content/images/photo.jpg/raisin:display?sig=...&exp=...'
```

```typescript
signAssetUrl(path: string, command?: 'download' | 'display', options?: { expiresIn?: number; propertyPath?: string }): Promise<SignedAssetUrl>

// client form
client.signAssetUrl({ repository, workspace, path, command?, expiresIn?, branch? }): Promise<SignedAssetUrl>
```

`download` sets a `Content-Disposition: attachment` header; `display` serves inline. The URL is relative to the server's HTTP base.

---

## Types

### UploadOptions

```typescript
interface UploadOptions {
  repository: string;
  workspace: string;
  path: string;                 // full path of the asset node
  branch?: string;              // default 'main'
  nodeType?: string;            // default 'raisin:Asset'
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  commitMessage?: string;
  commitActor?: string;
  autoRetry?: boolean;
  maxRetries?: number;
}
```

### BatchUploadOptions

```typescript
interface BatchUploadOptions {
  repository: string;
  workspace: string;
  basePath?: string;                               // prefix for each file's name
  pathResolver?: (file: File | Blob, index: number) => string;
  branch?: string;
  nodeType?: string;
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
  onFileComplete?: (file: string) => void;
  onFileError?: (file: string, error: Error) => void;
  signal?: AbortSignal;
  commitMessage?: string;
  commitActor?: string;
  autoRetry?: boolean;
  maxRetries?: number;
  continueOnError?: boolean;
}
```

### UploadProgress

```typescript
interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  progress: number;      // 0..1
  speed: number;         // bytes per second
  eta: number;           // seconds
  currentChunk: number;
  totalChunks: number;
  status: string;
}
```

### BatchProgress

```typescript
interface BatchProgress {
  filesTotal: number;
  filesCompleted: number;
  filesFailed: number;
  filesInProgress: number;
  filesPending: number;
  bytesUploaded: number;
  bytesTotal: number;
  progress: number;      // 0..1
  speed: number;
  eta: number;
  files: BatchFileProgress[];
}
```

---

## HTTP endpoints

The SDK drives the resumable upload API, which you can also call directly:

1. `POST /api/uploads` with `{repository, branch, workspace, path, filename, file_size, content_type?, node_type?, chunk_size?, metadata?}` returns `{upload_id, upload_url, chunk_size, total_chunks, expires_at}`. The default chunk size is 10 MiB.
2. `PATCH /api/uploads/{upload_id}` for each chunk, body `application/octet-stream`, header `Content-Range: bytes 0-53/54`. Returns `{upload_id, bytes_received, bytes_total, chunks_completed, chunks_total, progress}`.
3. `POST /api/uploads/{upload_id}/complete` with `{commit_message?, commit_actor?}` (or `{}`) returns `{upload_id, job_id, status: "completing"}`. The node is created by a background job a moment later.

`GET /api/uploads/{upload_id}` reports the session, `HEAD` returns progress headers, and `DELETE` cancels the upload.
