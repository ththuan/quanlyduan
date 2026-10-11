# Autonomous Office - Debian Server Deployment Guide

## Hệ thống yêu cầu

- **OS:** Debian 11+ (Bullseye hoặc mới hơn)
- **Node.js:** 16.x hoặc 18.x (recommended)
- **RAM:** Tối thiểu 2GB, khuyến nghị 4GB+
- **Disk:** 10GB+ để lưu hồ sơ
- **Docker:** 20.10+ (nếu dùng Docker)

## Cách 1: Docker Deployment (Khuyến nghị)

### Bước 1: Chuẩn bị

```bash
# SSH vào server Debian
ssh user@your-server

# Clone repository (nếu chưa có)
cd /opt
git clone <your-repo> quanlyduan
cd quanlyduan

# Tạo thư mục cần thiết
mkdir -p VAN-PHONG-AI/{HO-SO-AI,logs,MAU}
```

### Bước 2: Cấu hình

```bash
# Tạo file AI config
cat > VAN-PHONG-AI/ai-config.local.json << 'EOF'
{
  "provider": "openai",
  "baseUrl": "https://cheapkeyai.shop/v1",
  "apiMode": "responses",
  "model": "cheap-5.6-sol",
  "apiKey": "YOUR_API_KEY_HERE",
  "webSearch": true
}
EOF

# Set API key từ environment variable
export AI_API_KEY="sk-your-actual-key-here"

# Tạo .env file
cat > .env << EOF
AI_API_KEY=${AI_API_KEY}
AI_API_URL=https://cheapkeyai.shop/v1
AI_MODEL=cheap-5.6-sol
AUTONOMOUS_OFFICE_ENABLED=true
AI_AUTO_COMMIT=true
EOF

# Set permissions
chmod 600 .env
chmod 600 VAN-PHONG-AI/ai-config.local.json
```

### Bước 3: Build và Deploy

```bash
# Build Docker image
docker-compose -f docker-compose.yml -f VAN-PHONG-AI/docker-compose.autonomous.yml build

# Start services
docker-compose -f docker-compose.yml -f VAN-PHONG-AI/docker-compose.autonomous.yml up -d

# Check logs
docker-compose logs -f --tail=100

# Bạn sẽ thấy:
# [AUTONOMOUS-OFFICE] Initializing...
# [AUTONOMOUS-OFFICE] Team initialized: 4 agents
# [AUTONOMOUS-OFFICE] ✓ Initialized successfully
```

### Bước 4: Verify

```bash
# Check status
curl http://localhost:3000/api/autonomous-office/health

# Expected response:
# {"status":"running","uptime":123,"timestamp":"..."}

# Test submit request
curl -X POST http://localhost:3000/api/autonomous-office/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test request",
    "type": "report",
    "priority": "normal"
  }'
```

## Cách 2: Direct Deployment (Không dùng Docker)

### Bước 1: Cài đặt Node.js

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify
node -v  # Should be v18.x
npm -v
```

### Bước 2: Setup Application

```bash
# Clone and setup
cd /opt
git clone <your-repo> quanlyduan
cd quanlyduan

# Install dependencies
cd server && npm ci --production
cd ../VAN-PHONG-AI && npm ci --production
cd ..

# Create directories
mkdir -p VAN-PHONG-AI/{HO-SO-AI,logs,MAU}

# Configure AI
nano VAN-PHONG-AI/ai-config.local.json
# (paste your config and save)

# Set permissions
chmod +x VAN-PHONG-AI/start-autonomous-office.sh
```

### Bước 3: Setup Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/qlda.service
```

Paste nội dung:

```ini
[Unit]
Description=QLDA Autonomous Office
After=network.target

[Service]
Type=simple
User=qlda
WorkingDirectory=/opt/quanlyduan
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="AUTONOMOUS_OFFICE_ENABLED=true"
Environment="AI_AUTO_COMMIT=true"
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=qlda

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/quanlyduan/VAN-PHONG-AI/HO-SO-AI /opt/quanlyduan/VAN-PHONG-AI/logs /opt/quanlyduan/server/data

[Install]
WantedBy=multi-user.target
```

```bash
# Create user
sudo useradd -r -s /bin/false qlda
sudo chown -R qlda:qlda /opt/quanlyduan

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable qlda
sudo systemctl start qlda

# Check status
sudo systemctl status qlda

# View logs
sudo journalctl -u qlda -f
```

## Tích hợp vào server hiện tại

### Sửa file server/index.js

Thêm code sau vào `server/index.js` (xem chi tiết trong INTEGRATION-PATCH.js):

```javascript
// Import
const autonomousOffice = require('../VAN-PHONG-AI/server-integration');

// Initialize (sau khi db.initialize())
(async function() {
  await autonomousOffice.initialize(db);
})();

// Mount routes
app.use('/api/autonomous-office', requireAuth, autonomousOffice.createRoutes());

// Graceful shutdown
process.on('SIGTERM', async () => {
  await autonomousOffice.shutdown();
  process.exit(0);
});
```

### Restart service

```bash
# Docker
docker-compose restart

# Systemd
sudo systemctl restart qlda
```

## Monitoring

### View Logs

```bash
# Docker
docker-compose logs -f qlda

# Systemd
sudo journalctl -u qlda -f

# Application logs
tail -f VAN-PHONG-AI/logs/*.log
```

### Check Status

```bash
# API health check
curl http://localhost:3000/api/autonomous-office/health

# Office status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/autonomous-office/status

# Agents status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/autonomous-office/agents
```

### Performance Monitoring

```bash
# System resources
htop

# Docker stats
docker stats qlda-app

# Disk usage
du -sh VAN-PHONG-AI/HO-SO-AI
```

## Git Auto-commit

### Setup Git credentials

```bash
# Configure git inside container/server
git config --global user.name "Autonomous Office AI"
git config --global user.email "ai@your-domain.com"

# Setup SSH key for GitHub (recommended)
ssh-keygen -t ed25519 -C "ai@your-domain.com"
cat ~/.ssh/id_ed25519.pub
# Add this to GitHub SSH keys

# Test connection
ssh -T git@github.com
```

### Enable auto-push (optional)

Edit `autonomous-document-generator.js`:

```javascript
async commitToGit(organized, description) {
  try {
    execSync(`git add "${organized.directory}"`, { cwd: repoDir });
    execSync(`git commit -m "${commitMessage}"`, { cwd: repoDir });
    
    // Auto push (nếu muốn)
    if (process.env.AI_AUTO_PUSH === 'true') {
      execSync('git push origin main', { cwd: repoDir });
    }
    
    return true;
  } catch (error) {
    console.error(`[GIT] Error:`, error.message);
    return false;
  }
}
```

## Backup và Recovery

### Backup

```bash
#!/bin/bash
# backup-autonomous-office.sh

BACKUP_DIR="/backup/autonomous-office"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup hồ sơ
tar -czf $BACKUP_DIR/ho-so-$DATE.tar.gz VAN-PHONG-AI/HO-SO-AI/

# Backup database
sqlite3 server/data/qlda.db ".backup $BACKUP_DIR/db-$DATE.sqlite"

# Backup logs
tar -czf $BACKUP_DIR/logs-$DATE.tar.gz VAN-PHONG-AI/logs/

# Keep only last 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
# Add to crontab
crontab -e

# Backup daily at 2 AM
0 2 * * * /opt/quanlyduan/backup-autonomous-office.sh
```

### Recovery

```bash
# Restore hồ sơ
cd /opt/quanlyduan
tar -xzf /backup/autonomous-office/ho-so-YYYYMMDD_HHMMSS.tar.gz

# Restore database
sqlite3 server/data/qlda.db < /backup/autonomous-office/db-YYYYMMDD_HHMMSS.sqlite

# Restart service
docker-compose restart
# or
sudo systemctl restart qlda
```

## Troubleshooting

### Autonomous Office không khởi động

```bash
# Check logs
docker-compose logs qlda | grep AUTONOMOUS
# or
sudo journalctl -u qlda | grep AUTONOMOUS

# Common issues:
# 1. AI API key không đúng
nano VAN-PHONG-AI/ai-config.local.json

# 2. Dependencies thiếu
cd VAN-PHONG-AI && npm install

# 3. Permissions
sudo chown -R qlda:qlda /opt/quanlyduan/VAN-PHONG-AI
```

### Agents không xử lý requests

```bash
# Check agent status
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/autonomous-office/agents

# Check if office is running
curl http://localhost:3000/api/autonomous-office/health

# Restart
docker-compose restart
```

### Git commit fails

```bash
# Check git config
git config --list

# Check permissions
ls -la .git/

# Manual test
cd /opt/quanlyduan
git add VAN-PHONG-AI/HO-SO-AI/test
git commit -m "test"
```

### High memory usage

```bash
# Restart service để clear memory
docker-compose restart

# Increase Docker memory limit
# Edit docker-compose.yml:
services:
  qlda:
    mem_limit: 4g
    memswap_limit: 4g
```

## Production Best Practices

1. **Security**
   - Không commit API keys vào Git
   - Sử dụng environment variables
   - Restrict file permissions (600 cho config files)

2. **Performance**
   - Monitor RAM usage
   - Rotate logs định kỳ
   - Archive old cases

3. **Reliability**
   - Setup alerts cho failures
   - Daily backups
   - Test recovery procedures

4. **Maintenance**
   - Update dependencies monthly
   - Review AI-generated content weekly
   - Monitor quality metrics

## Support

Check logs:
- `/opt/quanlyduan/VAN-PHONG-AI/logs/`
- `docker-compose logs`
- `journalctl -u qlda`

API Documentation:
- http://your-server:3000/api-docs (nếu có Swagger)

Dashboard:
- http://your-server:3000/van-phong-ai

---

**Hệ thống sẵn sàng hoạt động 24/7 trên Debian server!** 🚀
