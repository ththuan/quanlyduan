#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BRANCH="${DEPLOY_BRANCH:-master}"

echo "==> Kéo code mới nhất từ GitHub ($BRANCH)..."
git pull --ff-only origin "$BRANCH"

echo "==> Build & deploy QLDA..."
docker compose build qlda
docker compose up -d qlda

echo "==> Dọn image cũ..."
docker image prune -f >/dev/null 2>&1 || true

echo "==> Hoàn tất: $(git rev-parse --short HEAD)"
