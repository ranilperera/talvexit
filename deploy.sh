#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# onys.online — Production Deploy Script
# Usage:  ./deploy.sh [branch]
# Default branch: main
# Requires: /opt/onsys/.env.prod to exist with all production values
# ─────────────────────────────────────────────────────────────────────────────
set -e

BRANCH="${1:-main}"
APP_DIR="/opt/talvex/app"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  onys.online deploy — branch: $BRANCH"
echo "  Started: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Guard: .env.prod must exist
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "  Copy .env.prod from this repo's root and fill in all CHANGE_ME values."
  exit 1
fi

cd "$APP_DIR"

# ── 1. Pull latest ────────────────────────────────────────────────────────────
echo ""
echo "[1/4] Pulling code..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "      $(git log --oneline -1)"

# ── 2. Build images ───────────────────────────────────────────────────────────
echo ""
echo "[2/4] Building images (api, web, workers)..."
$COMPOSE build --no-cache api workers web

# ── 3. Start / restart all services ──────────────────────────────────────────
# migrate runs as a one-shot container before api/workers start (depends_on)
echo ""
echo "[3/4] Starting services..."
$COMPOSE up -d --force-recreate --remove-orphans

# ── 4. Health check ───────────────────────────────────────────────────────────
echo ""
echo "[4/4] Waiting 45s for services to initialise..."
sleep 45

API_STATUS=$(curl -sf http://localhost:3001/api/v1/health > /dev/null && echo "OK" || echo "FAIL")
WEB_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Finished: $(date)"
echo "  Commit:   $(git log --oneline -1)"
echo "  API:      $API_STATUS  (http://localhost:3001/api/v1/health)"
echo "  Web:      HTTP $WEB_STATUS  (http://localhost:3000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$API_STATUS" = "OK" ] && [ "$WEB_STATUS" = "200" ]; then
  echo "  All systems healthy"

  # Prune dangling images to reclaim disk
  docker image prune -f --filter "label!=keep" > /dev/null

  exit 0
else
  echo "  WARNING: one or more services need attention"
  $COMPOSE ps
  echo ""
  echo "  Check logs with:"
  echo "    docker logs onys_api --tail=50"
  echo "    docker logs onys_web --tail=50"
  echo "    docker logs onys_migrate --tail=50"
  exit 1
fi
