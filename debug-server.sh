#!/bin/bash
# Debug script cho server Debian khi gặp 502 Bad Gateway

echo "=========================================="
echo "  QLDA Server Debug Script"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Run as root: sudo bash debug-server.sh"
    exit 1
fi

echo "[1/7] Checking Docker status..."
if ! docker ps &> /dev/null; then
    echo "❌ Docker not running!"
    systemctl status docker
    exit 1
fi
echo "✓ Docker is running"

echo ""
echo "[2/7] Checking containers..."
docker ps -a --filter "name=qlda"
RUNNING=$(docker ps --filter "name=qlda" --filter "status=running" -q)

if [ -z "$RUNNING" ]; then
    echo "❌ No QLDA containers running!"
    echo ""
    echo "Container status:"
    docker ps -a --filter "name=qlda" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo "✓ QLDA container is running"
fi

echo ""
echo "[3/7] Checking last 50 log lines..."
docker compose logs --tail=50 2>&1 | tail -20

echo ""
echo "[4/7] Checking port 3000..."
PORT_CHECK=$(netstat -tulpn 2>/dev/null | grep :3000 || ss -tulpn 2>/dev/null | grep :3000 || echo "not found")
if [ "$PORT_CHECK" = "not found" ]; then
    echo "❌ Port 3000 not listening!"
else
    echo "✓ Port 3000:"
    echo "$PORT_CHECK"
fi

echo ""
echo "[5/7] Checking disk space..."
df -h /var/lib/docker | tail -1
DISK_USAGE=$(df /var/lib/docker | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "⚠️  Disk usage high: ${DISK_USAGE}%"
    echo "Clean up: docker system prune -af"
fi

echo ""
echo "[6/7] Checking Node.js errors in logs..."
docker compose logs 2>&1 | grep -i "error\|exception\|failed\|cannot" | tail -10

echo ""
echo "[7/7] Testing internal connection..."
CONTAINER_ID=$(docker ps --filter "name=qlda" -q | head -1)
if [ -n "$CONTAINER_ID" ]; then
    echo "Testing http://localhost:3000/api/health inside container..."
    docker exec $CONTAINER_ID wget -qO- http://localhost:3000/api/health 2>&1 || echo "❌ Health check failed"
fi

echo ""
echo "=========================================="
echo "  Diagnosis Complete"
echo "=========================================="
echo ""
echo "Common fixes:"
echo "  1. Rebuild:  docker compose down && docker compose up -d --build"
echo "  2. Logs:     docker compose logs -f"
echo "  3. Shell:    docker compose exec qlda sh"
echo "  4. Restart:  docker compose restart"
echo ""
echo "If server.js has syntax errors, check:"
echo "  docker compose logs | grep -A 10 'SyntaxError'"
echo ""
