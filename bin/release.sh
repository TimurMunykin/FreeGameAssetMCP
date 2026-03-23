#!/usr/bin/env bash
set -euo pipefail

REPO="timurmunykin/freegameassetmcp"
TAG="${1:-latest}"

echo "==> Building app image..."
docker build -t "$REPO-app:$TAG" .

echo "==> Building sandbox image..."
docker build -t "$REPO-sandbox:$TAG" ./sandbox

echo "==> Pushing to Docker Hub..."
docker push "$REPO-app:$TAG"
docker push "$REPO-sandbox:$TAG"

echo "==> Done! Pushed:"
echo "    $REPO-app:$TAG"
echo "    $REPO-sandbox:$TAG"
