#!/bin/bash
set -e

echo "=== ONYS DEPLOYMENT SCRIPT ==="
echo "Time: $(date)"

# Variables
APP_DIR="/opt/onys"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

cd $APP_DIR

echo "--- Pulling latest code from GitLab ---"
git pull origin main

echo "--- Running database migrations ---"
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE run --rm api \
  sh -c "cd apps/api && npx prisma migrate deploy"

echo "--- Building and restarting containers ---"
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build --no-cache
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --force-recreate

echo "--- Cleaning up old images ---"
docker image prune -f

echo "--- Checking service health ---"
sleep 10
docker compose -f $COMPOSE_FILE ps

echo "=== DEPLOYMENT COMPLETE ==="