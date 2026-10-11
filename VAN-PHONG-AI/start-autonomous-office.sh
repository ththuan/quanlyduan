#!/bin/bash
# Khởi động Autonomous Office trên Debian server

set -e

echo "=========================================="
echo "  Văn Phòng AI Tự Động"
echo "  Autonomous AI Office - Debian Server"
echo "=========================================="
echo ""

# Check if running on Debian/Linux
if [ ! -f /etc/debian_version ]; then
    echo "⚠️  Warning: Not running on Debian. Continuing anyway..."
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/5] Checking environment..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 16+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version too old. Please upgrade to 16+"
    exit 1
fi

echo "✓ Node.js $(node -v) found"

# Check Git
if ! command -v git &> /dev/null; then
    echo "⚠️  Git not found. Auto-commit will be disabled."
fi

echo ""
echo "[2/5] Installing dependencies..."

# Install npm packages
if [ ! -d "node_modules" ]; then
    npm install --production --silent
else
    echo "✓ Dependencies already installed"
fi

echo ""
echo "[3/5] Creating directories..."

# Create required directories
mkdir -p HO-SO-AI
mkdir -p HO-SO-AI/ARCHIVE
mkdir -p HO-SO-AI/temp
mkdir -p MAU
mkdir -p logs

echo "✓ Directories created"

echo ""
echo "[4/5] Checking AI configuration..."

if [ ! -f "ai-config.local.json" ]; then
    echo "⚠️  ai-config.local.json not found"
    echo "Creating default config..."
    cat > ai-config.local.json << 'EOF'
{
  "provider": "openai",
  "baseUrl": "https://cheapkeyai.shop/v1",
  "apiMode": "responses",
  "model": "cheap-5.6-sol",
  "apiKey": "YOUR_API_KEY_HERE",
  "webSearch": true
}
EOF
    echo "❌ Please edit ai-config.local.json and add your API key"
    exit 1
fi

echo "✓ AI config found"

echo ""
echo "[5/5] Starting Autonomous Office..."
echo ""

# Set environment for production
export NODE_ENV=production

# Start the office (this will be integrated into main server)
echo "🤖 Autonomous Office is starting..."
echo ""
echo "API Endpoints:"
echo "  POST /api/autonomous-office/request     - Submit new request"
echo "  GET  /api/autonomous-office/status      - Get office status"
echo "  GET  /api/autonomous-office/agents      - Get agents status"
echo "  GET  /api/autonomous-office/metrics     - Get metrics"
echo ""
echo "Dashboard: http://your-server:3000/van-phong-ai"
echo ""
echo "✓ Office integration ready!"
echo ""
echo "To integrate into main server, add to server/index.js:"
echo "  const autonomousOffice = require('../VAN-PHONG-AI/autonomous-office-api');"
echo "  await autonomousOffice.init();"
echo "  app.use('/api/autonomous-office', autonomousOffice.createRoutes());"
echo ""
