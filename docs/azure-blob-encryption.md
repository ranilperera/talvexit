# Azure Blob Storage — Encryption Analysis

**Audited:** 2026-05-06
**Codebase:** `talvex-v1` @ `main`
**Scope:** Documents and media stored in Azure Blob (`onys-files` container)

---

## What's currently stored in Azure Blob (sensitive items)

From the schema and routes, the platform writes these blob types to a single container (`onys-files` by default):

| Blob | Stored at | Sensitivity |
|---|---|---|
| KYC identity documents (passport, license scans) | `ContractorProfile.identity_document_blob_path` | **Critical — government ID PII** |
| Live video KYC recordings | `VideoSession.recording_blob_path` | **Critical — face + voice biometric** |
| Insurance certificates (PI / PL / cyber) | `InsuranceCertificate.certificate_blob_path` | **High — commercial confidence + PI numbers** |
| Compliance docs (BUSINESS_REGISTRATION, BOARD_RESOLUTION, TAX_CERTIFICATE) | `User.compliance_documents[]`, `ConsultingCompany.authorization_doc_blob_path` | **High — corporate registers + ABN/ACN** |
| AML documents | `User`/`ConsultingCompany` metadata blobs | **High — regulated AML/CTF data** |
| Payment evidence (bank transfer screenshots) | `Order.payment_evidence_blob_path[]` | **High — bank account numbers visible** |
| Dispute evidence (uploaded by both parties) | `Dispute.evidence_blob_paths[]` | **High — can include any of the above** |
| Order deliverables | `Order` deliverable blobs | **Medium — customer's IT data** |
| Tender / proposal attachments | `TenderProposal.attachment_blob_paths[]` | **Medium** |
| Generated PDFs (invoices, receipts, commission) | various `*_pdf_blob_path` columns | **Medium — billing records** |
| Company / contractor logos | `logo_blob_path` columns | **Low — public-ish branding** |

## What protects them today

In [apps/api/src/utils/blob-storage.ts](../apps/api/src/utils/blob-storage.ts):

1. **Azure default SSE is on** — every blob is AES-256 encrypted at rest with Microsoft-managed keys. Mandatory and free, but transparent to anyone with the storage account key.
2. **Account-key authentication** ([blob-storage.ts:11](../apps/api/src/utils/blob-storage.ts#L11)) — `AZURE_STORAGE_CONNECTION_STRING` env contains the **root account key**. Anyone with it can read every blob.
3. **Downloads stream through the API** ([auth.routes.ts:712](../apps/api/src/routes/auth.routes.ts#L712), etc.) — SAS URLs are not exposed to the browser. ✅ Good.
4. **SAS URLs only used for uploads** — short-expiry, write-only ([blob-storage.ts:37](../apps/api/src/utils/blob-storage.ts#L37)). ✅ Reasonable.
5. **One container for everything**, paths name-spaced by entity (`compliance-docs/<userId>/...`, `insurance/<userId>/...`).

## The threats encryption would (and wouldn't) close

| Threat | Default SSE | SSE-CMK (Key Vault) | App-level encryption |
|---|---|---|---|
| Disk theft from datacentre | ✅ closed | ✅ closed | ✅ closed |
| Microsoft insider with storage access | ❌ open | ✅ closed | ✅ closed |
| Connection-string leak (env, logs, container image) | ❌ **fully open** | ❌ **fully open** | ✅ closed |
| API server compromise | ❌ open | ❌ open | ❌ **still open** (the API has the keys) |
| Replicated geo-redundant copy exfiltrated | ✅ closed | ✅ closed | ✅ closed |
| Operator with Azure tenant access | ❌ open | ✅ closed (revoke key) | ✅ closed |
| Audit / "who downloaded blob X" forensics | ❌ Azure logs only | ✅ Key Vault audit | ✅ Key Vault audit |

**The biggest current risk** is not the lack of encryption — it's the storage **account key** sitting in your connection string. If `AZURE_STORAGE_CONNECTION_STRING` ever leaks (CI logs, container image scan, errant `printenv` call, HAProxy logs, …), the attacker gets every blob in plaintext, **regardless** of which encryption layer is on.

## Recommended approach — three layers, ordered by leverage

### Layer 1 — Replace the account key with **Managed Identity**  *(highest leverage, smallest change)*

Today: `AZURE_STORAGE_CONNECTION_STRING=...AccountKey=<root-key>...`
Change to: `DefaultAzureCredential` from `@azure/identity` + a managed identity attached to the API container (Azure Container Apps / VM / AKS all support this).

- No long-lived secret in env
- RBAC scoped per-action ("Storage Blob Data Contributor" vs "Reader")
- Compromised env file = no blob access
- **Effort: ~1 day. No data migration.**

### Layer 2 — **SSE with Customer-Managed Keys (Key Vault)**  *(application-transparent)*

Today: Azure encrypts with Microsoft-owned keys — invisible to you.
Change to: Azure encrypts using a key in **your** Key Vault. Revoke the key → every blob becomes unreadable instantly.

- Key rotation, audit log of every encrypt/decrypt, RBAC on the key itself
- Fully transparent to the application — `uploadToBlob` / `downloadBlobStream` unchanged
- Doesn't protect against API compromise (the API still reads decrypted bytes)
- **Effort: ~half day of Azure config. No code change. No data migration if applied to the existing container.**

### Layer 3 — **Application-level envelope encryption** for the highest-sensitivity classes only

For KYC ID documents + video recordings + AML docs — encrypt **before** `uploadToBlob`, decrypt **after** `downloadBlobStream`.

- Per-blob random 256-bit DEK (Data Encryption Key)
- DEK wrapped with the platform's master key (Azure Key Vault, never in env)
- Wrapped DEK + IV + auth tag stored alongside the blob (sidecar JSON or filename suffix)
- For PDFs / images (small): straightforward — read into Buffer, AES-256-GCM, upload ciphertext
- For video recordings (potentially GB): streaming AES-GCM with chunked tags

The existing [secret-vault.ts](../apps/api/src/utils/secret-vault.ts) already implements AES-256-GCM for small payloads — same pattern, but the master key has to come from Key Vault rather than `MFA_ENCRYPTION_KEY` env.

**Effort: 2–3 days, plus a one-time migration of existing blobs.**

### What I would NOT recommend

**Application-level encryption on every single blob.** The cost/benefit gets thin for invoices, deliverables, logos. You take all the operational risk (key loss, performance, broken AV scanning, broken preview, broken search) and save little marginal threat surface — those blobs are mostly already protected by Layer 1 + Layer 2. Reserve app-level encryption for the regulated PII tier.

## Concrete risks of app-level encryption (the ones to plan for)

| Risk | Mitigation |
|---|---|
| **Key loss = total data loss.** No recovery for an enterprise that loses its key. | Key Vault with soft-delete + purge protection + backup vault in a second region. Document the key-rotation runbook before shipping. |
| **Performance / memory.** Buffering a 500 MB video into RAM to encrypt = OOM risk on the API container. | Use streaming AES-GCM (chunked) for anything over ~50 MB. The Node `crypto.createCipheriv('aes-256-gcm')` API supports stream piping. |
| **AV scanning impossible.** Once ciphertext is in blob, no scanner can inspect it. | Scan **before** encrypting, reject if clean fails. Wire in clamav or Defender for Storage at the API ingress. |
| **In-browser preview breaks.** Browser can't decrypt. | Already streaming through the API on download — just decrypt server-side mid-stream. No client change. |
| **Migration of existing plaintext blobs.** ~hundreds–thousands of files already there. | Lazy migration: encrypt-on-next-overwrite. OR a one-time backfill script that reads → re-encrypts → re-uploads. Either way, audit-log every conversion. |
| **Key rotation.** Re-wrapping every DEK on a new master = nontrivial. | Envelope encryption design naturally supports this — DEKs are unchanged on rotation, only the wrapping changes. Schedule yearly. |
| **Compliance perception.** Auditors sometimes prefer "platform-level encryption" to SSE-CMK because they understand it. | Document the threat model and which layer covers which threat. Auditors generally accept SSE-CMK for ISO 27001 / SOC 2 if Key Vault audit logs are exported. |

## Specific code changes needed if you go with all three layers

**Layer 1 — Managed Identity:**
- `apps/api/src/utils/blob-storage.ts` — replace `BlobServiceClient.fromConnectionString()` with `new BlobServiceClient(accountUrl, new DefaultAzureCredential())`
- `apps/api/src/app.ts` — drop `AZURE_STORAGE_CONNECTION_STRING` from `validateEnv`'s required list, replace with `AZURE_STORAGE_ACCOUNT_URL`
- Container deployment — assign the API container's managed identity the **Storage Blob Data Contributor** role on the storage account

**Layer 2 — SSE-CMK:**
- Pure Azure portal / Bicep / Terraform work. Zero code change.
- Create a Key Vault, generate an RSA key, configure the storage account to use it, add the Key Vault access policy.

**Layer 3 — App-level envelope encryption:**
- Extend `apps/api/src/utils/blob-storage.ts` with `uploadEncryptedBlob(path, buffer | stream)` and `downloadEncryptedBlobStream(path)`
- New `apps/api/src/utils/blob-encryption.ts` with `wrapDek(dek)`, `unwrapDek(wrapped)`, plus the streaming `encrypt(stream)` / `decrypt(stream)` helpers
- New env: `AZURE_KEYVAULT_URL`, plus the key name. Master key never leaves Key Vault.
- Storage layout per encrypted blob:
  ```
  blob path: same as before (e.g. compliance-docs/<userId>/.../doc.pdf)
  blob metadata: { x-talvex-enc: "v1", x-talvex-wrapped-dek: <base64>, x-talvex-iv: <base64>, x-talvex-tag: <base64> }
  ```
  Storing crypto envelope in **blob metadata** rather than DB keeps blob and key co-located and atomic.
- A small `BlobEncryptionPolicy` constant somewhere central, listing which `blob_path` prefixes get app-level encryption (`identity-documents/`, `kyc-recordings/`, `aml/`) and which only get Layer 2.
- Migration: a one-time script under `apps/api/src/scripts/encrypt-existing-blobs.ts` that walks the listed prefixes, re-encrypts in place, marks `x-talvex-enc-migrated-at` metadata.

## Recommendation

1. **Do Layer 1 first** (managed identity) — it removes the root credential from your environment, which is the actual most-common cause of cloud-storage breaches in industry incident data.
2. **Do Layer 2 second** (SSE-CMK) — half a day of Azure config, gives you key revocation + audit + rotation, no code risk.
3. **Decide on Layer 3 deliberately.** Look at the threat model, regulatory regime (privacy-act KYC retention rules), and operational maturity. If you have a 24/7 ops team with key-recovery drills, it's worth it for KYC IDs and video recordings. If you don't yet, defer — the operational risk of losing a master key is real, and Layers 1+2 already give you a strong posture.
