# Azure Blob Storage Setup — onys.online

Insurance certificates (and other contractor documents) are stored in Azure Blob Storage.
The API generates short-lived write SAS URLs so the browser uploads files directly without
proxying through the API server.

---

## 1. Create a Storage Account

1. Open the [Azure Portal](https://portal.azure.com)
2. Search for **Storage accounts** → **Create**
3. Fill in:
   - **Resource group**: `rg-onsys` (or your existing group)
   - **Storage account name**: `onsysstorage` (globally unique, 3–24 lowercase letters/digits)
   - **Region**: `Australia East`
   - **Performance**: Standard
   - **Redundancy**: LRS (dev) or GRS (production)
4. On the **Advanced** tab:
   - Enable **Allow enabling anonymous blob access**: Off
   - Enable **Require secure transfer**: On
5. Click **Review + Create** → **Create**

---

## 2. Create the Container

1. Open the storage account → **Containers** → **+ Container**
2. Name: `onys-files`
3. Public access level: **Private (no anonymous access)**
4. Click **Create**

---

## 3. Get the Connection String

1. Open the storage account → **Security + networking** → **Access keys**
2. Click **Show** next to **key1**
3. Copy the **Connection string** (starts with `DefaultEndpointsProtocol=https;...`)

---

## 4. Update apps/api/.env

Replace the placeholder in `apps/api/.env`:

```
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=onsysstorage;AccountKey=<your-key>;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=onys-files
```

Restart the API after editing `.env`.

---

## 5. Configure CORS on the Storage Account

The browser uploads directly to Azure via a SAS URL, so Azure must allow cross-origin PUT requests.

1. Open the storage account → **Resource sharing (CORS)**
2. Select the **Blob service** tab
3. Add a CORS rule:

| Field | Value |
|-------|-------|
| Allowed origins | `http://localhost:3000` (dev) — add your prod domain for prod |
| Allowed methods | `PUT, GET, HEAD` |
| Allowed headers | `*` |
| Exposed headers | `*` |
| Max age | `600` |

4. Click **Save**

---

## 6. (Production) Lock Down the Container with a Firewall

1. Open the storage account → **Networking**
2. Under **Firewall and virtual networks** → **Enabled from selected virtual networks and IP addresses**
3. Add your API server's outbound IP and your office IP for admin access
4. Click **Save**

---

## How file upload works

```
Browser                 API (Fastify)           Azure Blob
  |                        |                        |
  |-- POST /insurance/     |                        |
  |   upload-url           |                        |
  |   { file_name }        |                        |
  |                        |-- generateUploadSasUrl()|
  |                        |   (10 min write SAS)   |
  |                        |<-- { upload_url,        |
  |                        |      blob_path }        |
  |<-- { upload_url,       |                        |
  |      blob_path }       |                        |
  |                        |                        |
  |-- PUT upload_url       |                        |
  |   (PDF binary)         |                        |
  |   x-ms-blob-type:      |                        |
  |   BlockBlob            |                        |
  |                   (direct upload)               |
  |                        |                   [stored]
  |                        |                        |
  |-- POST /insurance      |                        |
  |   { ..., blob_path }   |                        |
  |                        |-- DB insert            |
  |<-- 201 Created         |                        |
```

The `blob_path` stored in the database is the path within the container
(e.g. `insurance/user-id/1234567890/cert.pdf`). The API can generate a
read-only SAS URL on demand via `generateSasUrl()` in `blob-storage.ts`.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `AZURE_STORAGE_CONNECTION_STRING is not set` | Missing env var | Add it to `apps/api/.env` |
| `403 CORS error` on PUT | CORS not configured | Add the CORS rule in step 5 |
| `403 AuthorizationPermissionMismatch` | SAS token has wrong permissions | SAS uses `cw` (create+write) — check blob-storage.ts |
| `409 BlobAlreadyExists` | Blob path collision | Path includes `Date.now()` — this shouldn't happen |
| `400 VALIDATION_ERROR: certificate_blob_path` | Upload URL step skipped | Call `/upload-url` first, upload to Azure, then POST cert |
