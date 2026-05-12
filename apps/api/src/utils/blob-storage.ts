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

// ─── generateSasUrl ───────────────────────────────────────────────────────────

export async function generateSasUrl(
  blobPath: string,
  expiryMinutes: number,
): Promise<string> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
  }

  // Parse account name and key from connection string
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
      permissions:   BlobSASPermissions.parse('r'),
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  const client = getBlobServiceClient();
  const blobClient = client.getContainerClient(CONTAINER_NAME).getBlobClient(blobPath);
  return `${blobClient.url}?${sasToken}`;
}
