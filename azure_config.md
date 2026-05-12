# Azure Key Vault — Setup & Configuration

Credentials (SSH keys, passwords, API keys) are encrypted and stored in Azure Key Vault.
This file explains what you need and where to put it.

---

## What you need from Azure

| Variable | Description |
|---|---|
| `AZURE_KEYVAULT_URL` | URL of your Key Vault, e.g. `https://onys-kv-dev.vault.azure.net/` |
| `AZURE_TENANT_ID` | Azure AD Directory (tenant) ID |
| `AZURE_CLIENT_ID` | App registration (service principal) client ID |
| `AZURE_CLIENT_SECRET` | Client secret value for the service principal |

---

## Step 1 — Create a Key Vault

1. Go to [portal.azure.com](https://portal.azure.com) → **Create a resource** → **Key Vault**
2. Settings:
   - **Name**: `onys-kv-dev` (or any unique name)
   - **Region**: your Azure region
   - **Pricing tier**: Standard
   - **Soft-delete**: leave enabled (default, required)
   - **Purge protection**: enable (recommended)
3. Click **Review + Create** → **Create**
4. After creation, open the vault and note the **Vault URI** — this is `AZURE_KEYVAULT_URL`

---

## Step 2 — Create a Service Principal (local dev)

In production (Azure VM/k3s), the app uses a **Managed Identity** — no secrets needed.
For local development you need a service principal.

```bash
# Login to Azure CLI
az login

# Create an app registration
az ad app create --display-name "onys-kv-dev-sp"

# Note the appId from the output — that's AZURE_CLIENT_ID

# Create a service principal for the app
az ad sp create --id <appId>

# Create a client secret (valid 1 year)
az ad app credential reset --id <appId> --years 1
# Note the 'password' field — that's AZURE_CLIENT_SECRET
# Note the 'tenant' field — that's AZURE_TENANT_ID
```

---

## Step 3 — Grant Key Vault access to the service principal

```bash
az keyvault set-policy \
  --name onys-kv-dev \
  --spn <appId> \
  --secret-permissions get set delete list purge
```

Or via the portal:
1. Open your Key Vault → **Access policies** → **Add Access Policy**
2. Secret permissions: **Get, Set, Delete, List, Purge**
3. Select principal: search for `onys-kv-dev-sp`
4. Click **Save**

---

## Step 4 — Add variables to apps/api/.env

Open `apps/api/.env` and add:

```env
# ── Azure Key Vault ─────────────────────────────────────────────────────────
AZURE_KEYVAULT_URL=https://onys-kv-dev.vault.azure.net/
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your_client_secret_value_here
```

**Important**: Never commit `.env` to git. It is listed in `.gitignore`.

---

## Step 5 — Restart the API

```bash
# In the apps/api directory
pnpm dev
```

The API reads the env vars at startup. After adding them you must restart.

---

## Verifying it works

Once configured, go to an active order (status = IN_PROGRESS or ACCEPTED) as a customer
and try **Store New Credential**. If Key Vault is configured correctly, the credential
will be stored and you will see a success toast.

---

## Production (Azure VM / k3s)

In production, **do not set `AZURE_CLIENT_SECRET`**. Instead:
1. Assign a **Managed Identity** to the VM or pod
2. Grant the managed identity the same Key Vault access policy as above
3. The app uses `DefaultAzureCredential()` which automatically uses the managed identity

No secrets in environment variables — Azure handles auth transparently.

---

## Secret naming convention

Secrets are stored with the name: `onys-order-{orderId}-{credentialId}`

Example: `onys-order-cmmo420mn000e0wtvztc05lfv-cmmo421ab000f0wtvztc06abc`

Secrets auto-expire based on the order's estimated completion time (hours_max × 2 days).
After an order completes, credentials are soft-deleted then purged after 48 hours.
