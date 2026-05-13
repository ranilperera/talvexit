import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';

// ─── Singleton client ─────────────────────────────────────────────────────────

function getBlobServiceClient(): BlobServiceClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER ?? 'onys-files';

// ─── uploadToBlob ─────────────────────────────────────────────────────────────

export async function uploadToBlob(
  blobPath: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const client = getBlobServiceClient();
  const container = client.getContainerClient(CONTAINER_NAME);
  const blob = container.getBlockBlobClient(blobPath);
  await blob.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

// ─── generateUploadSasUrl ─────────────────────────────────────────────────────

export async function generateUploadSasUrl(
  blobPath: string,
  expiryMinutes: number = 10,
): Promise<string> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  }

  const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
  const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
  if (!accountNameMatch || !accountKeyMatch) {
    throw new Error('Cannot parse AccountName/AccountKey from connection string');
  }
  const accountName = accountNameMatch[1];
  const accountKey = accountKeyMatch[1];

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName:      blobPath,
      permissions:   BlobSASPermissions.parse('cw'), // create + write
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  const client = getBlobServiceClient();
  const blobClient = client.getContainerClient(CONTAINER_NAME).getBlobClient(blobPath);
  return `${blobClient.url}?${sasToken}`;
}

// ─── listBlobsByPrefix ────────────────────────────────────────────────────────
// Returns the names of all blobs in the configured container that start with
// the given prefix. Used by the payment-evidence backfill to discover orphan
// files left behind when the legacy single-evidence column was overwritten.

export async function listBlobsByPrefix(prefix: string): Promise<string[]> {
  const client = getBlobServiceClient();
  const container = client.getContainerClient(CONTAINER_NAME);
  const out: string[] = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    out.push(blob.name);
  }
  return out;
}

// ─── downloadBlobStream ───────────────────────────────────────────────────────

export async function downloadBlobStream(blobPath: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  const client = getBlobServiceClient();
  const container = client.getContainerClient(CONTAINER_NAME);
  const blob = container.getBlobClient(blobPath);
  const downloadResponse = await blob.download();
  return {
    stream: downloadResponse.readableStreamBody as NodeJS.ReadableStream,
    contentType: downloadResponse.contentType,
    contentLength: downloadResponse.contentLength,
  };
}

// ─── generateSasUrl REMOVED ──────────────────────────────────────────────────
//
// Previously this module exported `generateSasUrl(blobPath, expiryMinutes)`,
// which minted an Azure Blob SAS URL with read permissions and returned it
// to callers (typically route handlers that then sent the URL to the
// browser).
//
// That pattern was a security problem:
//   - The signed Azure URL was exposed to the client, then leaked into
//     server logs, browser history, Referer headers, screenshots, and
//     any intermediate proxy/CDN logs.
//   - Once the URL leaked, anyone in the world could read the document
//     until expiry (up to 1 hour). No per-user authentication, no
//     audit trail, no rate limit, no revocation.
//   - It exposed the storage account name, container layout, and the
//     original user-uploaded filename in the URL itself.
//
// All callers were migrated to the streaming pattern: route handlers
// fetch the blob server-side via `downloadBlobStream` and stream it back
// through the API with proper Content-Disposition + nosniff headers.
// Azure credentials never leave the server, every download stays
// behind the JWT auth check, and sensitive views are audit-logged.
//
// Do NOT reintroduce a SAS URL helper without reviewing this history.
// If a legitimate use case appears (e.g. a long-running export pickup
// from a serverless function), keep the SAS scoped to that path with
// a sub-15-minute expiry and audit log every issuance.
