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
