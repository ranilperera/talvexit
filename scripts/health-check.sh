#!/bin/bash
echo "=== ONYS HEALTH CHECK ==="

echo "--- Docker containers ---"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "--- API health ---"
curl -s http://localhost:3001/health | python3 -m json.tool || \
  echo "API not responding"

echo ""
echo "--- Web health ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}" http://localhost:3000 || \
  echo "Web not responding"

echo ""
echo "--- PostgreSQL ---"
pg_isready -h localhost -p 5432 -U onys || \
  echo "PostgreSQL not responding"

echo ""
echo "--- Redis ---"
docker exec onys_redis redis-cli ping || \
  echo "Redis not responding"