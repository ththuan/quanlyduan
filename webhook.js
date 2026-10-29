// Webhook server - nhận push từ GitHub, tự động deploy
// Chạy: WEBHOOK_SECRET=... node webhook.js
// Mặc định chỉ nghe trên loopback; đặt WEBHOOK_HOST=0.0.0.0 nếu thật sự cần.
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = Number(process.env.WEBHOOK_PORT || 3456);
const HOST = process.env.WEBHOOK_HOST || '127.0.0.1';
const BRANCH = process.env.WEBHOOK_BRANCH || 'master';
const MAX_BODY = 1024 * 1024;

if (!SECRET) {
  console.error('[webhook] Thiếu WEBHOOK_SECRET. Từ chối khởi động.');
  process.exit(1);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  let tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > MAX_BODY) {
      tooLarge = true;
      res.writeHead(413);
      res.end('Payload too large');
      req.destroy();
    }
  });

  req.on('end', () => {
    if (tooLarge) return;

    const sig = String(req.headers['x-hub-signature-256'] || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    if (!safeEqual(sig, expected)) {
      res.writeHead(403);
      res.end('Invalid signature');
      return;
    }

    if (String(req.headers['x-github-event'] || '') !== 'push') {
      res.writeHead(202);
      res.end('Ignored event');
      return;
    }

    let payload = {};
    try {
      payload = JSON.parse(body || '{}');
    } catch (_) {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    if (payload.ref !== `refs/heads/${BRANCH}`) {
      res.writeHead(202);
      res.end('Ignored branch');
      return;
    }

    console.log(new Date().toISOString(), 'Deploy triggered');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    try {
      execSync(`git pull --ff-only origin ${BRANCH}`, { cwd: __dirname, stdio: 'pipe' });
      execSync('docker compose build qlda', { cwd: __dirname, stdio: 'pipe' });
      execSync('docker compose up -d qlda', { cwd: __dirname, stdio: 'pipe' });
      console.log('Deploy success');
    } catch (e) {
      console.error('Deploy failed:', e.message);
    }
  });
});

server.listen(PORT, HOST, () => console.log(`Webhook listening on ${HOST}:${PORT}`));
