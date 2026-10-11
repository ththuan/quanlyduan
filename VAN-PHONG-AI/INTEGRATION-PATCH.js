// ============================================================
// AUTONOMOUS OFFICE INTEGRATION PATCH
// Thêm code này vào server/index.js của bạn
// ============================================================

// 1. Thêm import ở đầu file (sau các require khác)
const autonomousOffice = require('../VAN-PHONG-AI/server-integration');

// 2. Khởi động autonomous office sau khi database ready
// Thêm vào sau khi db.initialize() hoàn thành:

(async function initAutonomousOffice() {
  try {
    console.log('[SERVER] Initializing Autonomous Office...');
    const success = await autonomousOffice.initialize(db);
    if (success) {
      console.log('[SERVER] ✓ Autonomous Office ready');
    } else {
      console.warn('[SERVER] ⚠️  Autonomous Office failed to start');
    }
  } catch (error) {
    console.error('[SERVER] ❌ Autonomous Office error:', error);
  }
})();

// 3. Mount API routes (thêm trước các routes khác)
// Autonomous office routes - require auth
app.use('/api/autonomous-office', requireAuth, autonomousOffice.createRoutes());

// 4. Graceful shutdown (thêm vào cuối file, trước server.listen)
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully...');
  await autonomousOffice.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully...');
  await autonomousOffice.shutdown();
  process.exit(0);
});

// ============================================================
// END OF PATCH
// ============================================================


// ============================================================
// EXAMPLE: Complete integration in server/index.js
// ============================================================

/*
const express = require('express');
const db = require('./db');
const autonomousOffice = require('../VAN-PHONG-AI/server-integration');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Auth middleware
function requireAuth(req, res, next) {
  // Your existing auth logic
  next();
}

// Initialize database
db.initialize();

// Initialize Autonomous Office
(async function() {
  await autonomousOffice.initialize(db);
})();

// Routes
app.use('/api/autonomous-office', requireAuth, autonomousOffice.createRoutes());

// ... your other routes ...

// Graceful shutdown
process.on('SIGTERM', async () => {
  await autonomousOffice.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/
