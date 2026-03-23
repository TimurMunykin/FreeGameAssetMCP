#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-latest}"

echo "==> Pulling latest images..."
docker pull timurmunykin/freegameassetmcp-app:"$TAG"
docker pull timurmunykin/freegameassetmcp-sandbox:"$TAG"

echo "==> Deploying..."
docker compose -f "$DIR/docker-compose.prod.yml" up -d --force-recreate

echo "==> Done!"
docker compose -f "$DIR/docker-compose.prod.yml" ps
