#!/bin/bash
set -e

echo "=== Chip3D Development Environment Setup ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[1/4] Starting infrastructure (Postgres + Redis)..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

echo "[2/4] Waiting for Postgres..."
for i in {1..30}; do
  if docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T postgres pg_isready -U chip3d > /dev/null 2>&1; then
    echo "  Postgres is ready."
    break
  fi
  sleep 1
done

echo "[3/4] Pushing database schema..."
cd "$ROOT_DIR/apps/api"
npx prisma db push --skip-generate 2>/dev/null || npx prisma db push

echo "[4/4] Starting all services..."
cd "$ROOT_DIR"
echo ""
echo "=== Infrastructure ready! ==="
echo "  Postgres: localhost:5432 (chip3d/chip3d_dev)"
echo "  Redis:    localhost:6379"
echo ""
echo "Run 'pnpm dev' to start all services:"
echo "  API:    http://localhost:4000"
echo "  Web:    http://localhost:3000"
echo "  Worker: listening on Redis queue"
echo ""
pnpm dev
