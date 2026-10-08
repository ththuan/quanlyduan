#!/bin/sh
# Seed lần đầu: nếu KHO-TRI-THUC/TAI-LIEU-GOC trống thì chép văn bản luật từ seed-legal vào.
set -e

SEED_DIR="/app/seed-legal"
TARGET_DIR="/app/KHO-TRI-THUC/TAI-LIEU-GOC"

if [ -d "$SEED_DIR" ] && [ -z "$(ls -A "$TARGET_DIR" 2>/dev/null)" ]; then
  echo "Seeding kho tri thức lần đầu từ seed-legal..."
  cp -n "$SEED_DIR"/*.md "$TARGET_DIR"/ 2>/dev/null || true
fi

exec node van-phong-ai-local-server.js
