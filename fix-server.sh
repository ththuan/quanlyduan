#!/bin/bash
# Auto-fix script cho 502 Bad Gateway

set -e

echo "=========================================="
echo "  QLDA Server Auto-Fix"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "❌ Run as root: sudo bash fix-server.sh"
    exit 1
fi

cd /root/quanlyduan || cd ~/quanlyduan || { echo "❌ Cannot find quanlyduan directory"; exit 1; }

echo "[1/5] Stopping containers..."
docker compose down --remove-orphans 2>/dev/null || true
sleep 2

echo "[2/5] Pulling latest code..."
git fetch origin
git reset --hard origin/master
echo "✓ Code updated"

echo "[3/5] Cleaning Docker..."
docker system prune -f --volumes 2>/dev/null || true
docker image prune -f 2>/dev/null || true

echo "[4/5] Building fresh..."
docker compose build --no-cache 2>&1 | tail -20

echo "[5/5] Starting services..."
docker compose up -d

echo ""
echo "=========================================="
echo "  Waiting 30 seconds for server to start..."
echo "=========================================="
sleep 30

echo ""
echo "Checking health..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✓ Server is responding!"
else
    echo "⚠️  Server not ready yet. Check logs:"
    echo "    docker compose logs -f"
fi

echo ""
echo "Access at: https://quanlyduanctec.dpdns.org"
echo ""
