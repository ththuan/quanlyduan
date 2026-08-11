// Webhook server - nhận push từ GitHub, tự động deploy
// Chạy: node webhook.js
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SECRET = 'qlda-deploy-secret-2026'; // đổi thành secret của bạn
const PORT = 3456;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404); res.end();
    return;
  }

  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.writeHead(403); res.end('Invalid signature');
      return;
    }

    console.log(new Date().toISOString(), 'Deploy triggered');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    try {
      execSync('git pull origin master', { cwd: __dirname, stdio: 'pipe' });
      execSync('docker compose build qlda', { cwd: __dirname, stdio: 'pipe' });
      execSync('docker compose up -d qlda', { cwd: __dirname, stdio: 'pipe' });
      console.log('Deploy success');
    } catch (e) {
      console.error('Deploy failed:', e.message);
    }
  });
});

server.listen(PORT, () => console.log(`Webhook listening on :${PORT}`));
