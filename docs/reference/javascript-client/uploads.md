---
sidebar_position: 7
---

# Uploads

Upload files and generate signed asset URLs.

## Single File Upload

### From the client

```typescript
const upload = await client.upload(file, {
  repository: 'myapp',
  workspace: 'content',
  path: '/images/photo.jpg',
  onProgress: (progress) => {
    console.log(`${Math.round(progress.progress * 100)}%`);
  },
});
```

### From a workspace

```typescript
const ws = db.workspace('content');
const upload = await ws.upload(file, '/images/photo.jpg');
```

### Node.js file path

```typescript
const upload = await client.uploadFile('/local/path/to/file.pdf', {
  repository: 'myapp',
  workspace: 'content',
  path: '/docs/report.pdf',
});
```

---

## Batch Upload

Upload multiple files with concurrency control and progress tracking.

```typescript
const batch = await client.uploadFiles(files, {
  repository: 'myapp',
  workspace: 'content',
  basePath: '/images/',
  concurrency: 3,
  onProgress: (progress) => {
    console.log(
      `${progress.filesCompleted}/${progress.filesTotal} files, ` +
      `${Math.round(progress.progress * 100)}%`
    );
  },
  onFileComplete: (file) => {
    console.log('Completed:', file);
  },
  onFileError: (file, error) => {
    console.error('Failed:', file, error);
  },
});
```

Workspace shorthand:

```typescript
const ws = db.workspace('content');
const batch = await ws.uploadFiles(fileList, '/images/');
```

---

## Upload Management

### Get active upload

```typescript
const upload = client.getUpload(uploadId);
```

### List all active uploads

```typescript
const uploads = client.getActiveUploads();
```

### Cancel all uploads

```typescript
await client.cancelAllUploads();
```

---

## Signed Asset URLs

Generate time-limited URLs for accessing binary assets stored in RaisinDB.

```typescript
const { url } = await client.signAssetUrl({
  repository: 'myapp',
  workspace: 'content',
  path: '/images/photo.jpg',
});
```

Workspace shorthand:

```typescript
const ws = db.workspace('content');
const { url } = await ws.signAssetUrl('/images/photo.jpg');
```

---

## Types

### UploadOptions

```typescript
interface UploadOptions {
  repository: string;
  workspace: string;
  path: string;
  branch?: string;
  nodeType?: string;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
```

### BatchUploadOptions

```typescript
interface BatchUploadOptions {
  repository: string;
  workspace: string;
  basePath: string;
  branch?: string;
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
  onFileComplete?: (file: string) => void;
  onFileError?: (file: string, error: Error) => void;
}
```

### UploadProgress

```typescript
interface UploadProgress {
  uploadId: string;
  loaded: number;
  total: number;
  progress: number; // 0..1
}
```

### BatchProgress

```typescript
interface BatchProgress {
  filesCompleted: number;
  filesTotal: number;
  loaded: number;
  total: number;
  progress: number; // 0..1
}
```
