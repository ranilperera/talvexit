# LiveKit On-Premises Setup — onys.online

LiveKit is an open-source, self-hosted WebRTC server. This guide gets it running
locally (for development) and in production on a VM or container host.

---

## 1. Local Development (Docker Compose)

LiveKit is already in `docker-compose.yml`. Start it with:

```bash
docker compose up -d livekit
```

The service runs with a hardcoded dev keypair:

| Setting    | Value       |
|------------|-------------|
| API Key    | `devkey`    |
| API Secret | `devsecret` |
| Port       | `7880`      |

### Environment variables (apps/api/.env)

```env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
```

### Environment variables (apps/web/.env.local)

```env
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

### Verify it's running

```bash
curl http://localhost:7880/         # should return a 404 or text response
docker compose logs livekit         # watch the logs
```

---

## 2. How the KYC Video Flow Works

```
Admin schedules session (POST /admin/sessions/kyc)
  └─ API creates VideoSession in DB
  └─ API calls livekitService.createRoom(roomName)  ← non-fatal if server down

Admin opens /admin/kyc → clicks "Join KYC Room"
  └─ Browser → /admin/kyc/room/:sessionId
  └─ Page calls GET /api/v1/sessions/:sessionId/join
  └─ API generates LiveKit JWT token (host role)
  └─ Page renders <LiveKitRoom> + <VideoConference>

Contractor opens /contractor/kyc → clicks "Join Session"
  └─ Browser → /contractor/kyc/room?session=:sessionId
  └─ Page calls GET /api/v1/sessions/:sessionId/join
  └─ API generates LiveKit JWT token (participant role)
  └─ Page renders <LiveKitRoom> + <VideoConference>

When admin clicks "End Session"
  └─ POST /sessions/:sessionId/end
  └─ kyc_status → COMPLETED_PENDING_REVIEW

Admin submits outcome (APPROVED/REJECTED)
  └─ POST /admin/sessions/:sessionId/kyc-outcome
  └─ kyc_status → APPROVED or REJECTED
```

---

## 3. Production Setup — Single VM (Ubuntu 22.04)

### Prerequisites

- A VM with at least 2 vCPU, 4 GB RAM (t3.medium or similar)
- A domain name pointing to the VM: e.g. `livekit.yourdomain.com`
- Ports open: **80, 443, 7880, 7881, 7882/udp**

### Step 1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
```

### Step 2 — Create LiveKit config

Create `/opt/livekit/livekit.yaml`:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true          # auto-detect public IP

keys:
  yourapikey: yourapisecret      # replace with strong random values

logging:
  level: info

# TLS via Let's Encrypt (recommended)
# Remove this block if you terminate TLS at a load balancer
```

> Generate strong keys:
> ```bash
> openssl rand -hex 16   # API key
> openssl rand -hex 32   # API secret
> ```

### Step 3 — Run LiveKit

```bash
docker run -d \
  --name livekit \
  --restart unless-stopped \
  --network host \
  -v /opt/livekit/livekit.yaml:/livekit.yaml \
  livekit/livekit-server:latest \
  --config /livekit.yaml
```

Using `--network host` is recommended for WebRTC to work correctly
(avoids NAT issues with UDP).

### Step 4 — TLS with Caddy (recommended)

Install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```caddyfile
livekit.yourdomain.com {
    reverse_proxy localhost:7880
}
```

```bash
sudo systemctl enable --now caddy
```

LiveKit will now be accessible at `wss://livekit.yourdomain.com`.

### Step 5 — Update environment variables

**apps/api/.env (production)**
```env
LIVEKIT_URL=wss://livekit.yourdomain.com
LIVEKIT_API_KEY=yourapikey
LIVEKIT_API_SECRET=yourapisecret
```

**apps/web (production environment)**
```env
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.yourdomain.com
```

---

## 4. Recording to Azure Blob (Egress)

The API uses LiveKit Egress to record KYC sessions to Azure Blob Storage.
Egress requires a **separate** LiveKit Egress service.

### Add to docker-compose (production)

```yaml
livekit-egress:
  image: livekit/egress:latest
  container_name: onsys_livekit_egress
  restart: unless-stopped
  environment:
    EGRESS_CONFIG_FILE: /egress.yaml
  volumes:
    - /opt/livekit/egress.yaml:/egress.yaml
  network_mode: host
```

Create `/opt/livekit/egress.yaml`:

```yaml
api_key: yourapikey
api_secret: yourapisecret
ws_url: ws://localhost:7880

azure:
  account_name: YOUR_AZURE_STORAGE_ACCOUNT
  account_key: YOUR_AZURE_STORAGE_KEY
  container_name: recordings
```

### Recording flow

When admin clicks "Start Recording" in the KYC room:
1. `POST /admin/sessions/:sessionId/recording/start`
2. API calls `livekitService.startEgressRecording(...)` → Azure Blob
3. When session ends, egress stops and MP4 is saved at:
   `recordings/video_kyc/{sessionId}/{sessionId}.mp4`

---

## 5. Security Checklist

- [ ] Use strong random API key + secret (not `devkey`/`devsecret` in production)
- [ ] Restrict LiveKit port 7880 to internal traffic only; expose only via Caddy/443
- [ ] Set `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` via Azure Key Vault or secrets manager
- [ ] Enable firewall: allow 443, 7881 (TCP), 7882 (UDP) only
- [ ] LiveKit tokens expire in 2 hours (`ttl: 7200` in `livekit.service.ts`)
- [ ] Recording consent is enforced before `startEgressRecording` is called

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Failed to join session" on room page | LiveKit not running | `docker compose up -d livekit` |
| Video/audio not connecting | NAT/firewall blocking UDP 7882 | Open UDP 7882 in firewall |
| `createRoom failed (non-fatal)` in API logs | LiveKit down at schedule time | Harmless — room created lazily on join |
| TURN relay needed | Symmetric NAT / corporate firewall | Add TURN config to livekit.yaml |
| Egress fails | Egress service not running | Start livekit-egress container |
| Azure Blob upload fails | Wrong account key or container | Check `AZURE_STORAGE_ACCOUNT_KEY` |

---

## 7. TURN Server (Optional — for restrictive networks)

If participants are behind corporate firewalls that block UDP, add a TURN server:

```yaml
# livekit.yaml
rtc:
  turn_servers:
    - host: turn.yourdomain.com
      port: 3478
      protocol: udp
      username: turnuser
      credential: turnpassword
```

A simple TURN server: [coturn](https://github.com/coturn/coturn).

```bash
sudo apt install coturn
```

For most office/home networks, TURN is not required.
