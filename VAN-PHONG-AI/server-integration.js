'use strict';

/**
 * Server Integration - Tích hợp Autonomous Office vào Express server hiện tại
 */

const path = require('path');
const fs = require('fs').promises;

// Lazy load để tránh circular dependency
let OfficeOrchestrator;
let orchestrator;

/**
 * Initialize autonomous office
 * Call this from server/index.js after database is ready
 */
async function initialize(dbInstance) {
  console.log('[AUTONOMOUS-OFFICE] Initializing...');
  
  try {
    // Load modules
    OfficeOrchestrator = require('./office-orchestrator');
    
    // Load AI config
    const aiConfig = await loadAIConfig();
    
    // Create DB adapter that wraps existing DB
    const dbAdapter = createDBAdapter(dbInstance);
    
    // Create orchestrator
    orchestrator = new OfficeOrchestrator(dbAdapter, aiConfig);
    
    // Setup event handlers
    setupEventHandlers(orchestrator);
    
    // Start the office
    await orchestrator.start();
    
    console.log('[AUTONOMOUS-OFFICE] ✓ Initialized successfully');
    return true;
    
  } catch (error) {
    console.error('[AUTONOMOUS-OFFICE] Failed to initialize:', error);
    return false;
  }
}

/**
 * Load AI configuration
 */
async function loadAIConfig() {
  try {
    const configPath = path.join(__dirname, 'ai-config.local.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('[AUTONOMOUS-OFFICE] Using default AI config');
    return {
      provider: 'openai',
      baseUrl: process.env.AI_API_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4',
      apiKey: process.env.AI_API_KEY || '',
      webSearch: false
    };
  }
}

/**
 * Create DB adapter to wrap existing database
 */
function createDBAdapter(db) {
  return {
    // Original db instance
    _db: db,
    
    // Autonomous office methods
    saveCase: async function(caseData) {
      // Save to cases table (you may need to create this table)
      const stmt = this._db.prepare(`
        INSERT INTO autonomous_cases (id, data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
      `);
      
      try {
        stmt.run(
          caseData.id,
          JSON.stringify(caseData),
          caseData.createdAt,
          caseData.updatedAt || caseData.createdAt
        );
      } catch (error) {
        // Table might not exist yet, create it
        this._db.exec(`
          CREATE TABLE IF NOT EXISTS autonomous_cases (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        stmt.run(
          caseData.id,
          JSON.stringify(caseData),
          caseData.createdAt,
          caseData.updatedAt || caseData.createdAt
        );
      }
      
      return caseData;
    },
    
    updateCase: async function(caseData) {
      return this.saveCase(caseData);
    },
    
    getCase: async function(id) {
      try {
        const row = this._db.prepare('SELECT data FROM autonomous_cases WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
      } catch {
        return null;
      }
    },
    
    findSimilarCases: async function(type, limit) {
      try {
        const rows = this._db.prepare(
          'SELECT data FROM autonomous_cases ORDER BY created_at DESC LIMIT ?'
        ).all(limit);
        return rows.map(row => JSON.parse(row.data));
      } catch {
        return [];
      }
    },
    
    getLegalBasis: async function(type) {
      // Query from existing legal database
      try {
        const rows = this._db.prepare(`
          SELECT * FROM legal_documents 
          WHERE tags LIKE ? OR category LIKE ?
          LIMIT 10
        `).all(`%${type}%`, `%${type}%`);
        return rows || [];
      } catch {
        return [];
      }
    },
    
    getTemplates: async function(type) {
      // Query templates
      return [];
    },
    
    search: async function(field) {
      // Generic search
      return null;
    },
    
    indexCase: async function(caseData) {
      // Index for search
      return true;
    },
    
    saveDailyReport: async function(report) {
      try {
        this._db.prepare(`
          INSERT INTO autonomous_reports (date, data, created_at)
          VALUES (?, ?, ?)
        `).run(report.date, JSON.stringify(report), new Date().toISOString());
      } catch (error) {
        // Create table if not exists
        this._db.exec(`
          CREATE TABLE IF NOT EXISTS autonomous_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `);
        this._db.prepare(`
          INSERT INTO autonomous_reports (date, data, created_at)
          VALUES (?, ?, ?)
        `).run(report.date, JSON.stringify(report), new Date().toISOString());
      }
    },
    
    saveBackup: async function(data) {
      // Save backup
      const backupPath = path.join(__dirname, 'logs', `backup-${Date.now()}.json`);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
    },
    
    getRelevantData: async function(docType) {
      return {};
    }
  };
}

/**
 * Setup event handlers
 */
function setupEventHandlers(orchestrator) {
  orchestrator.on('office:started', () => {
    console.log('[AUTONOMOUS-OFFICE] Office started');
  });
  
  orchestrator.on('request:completed', (request) => {
    console.log(`[AUTONOMOUS-OFFICE] Request completed: ${request.id}`);
  });
  
  orchestrator.on('case:needs-human', (data) => {
    console.log(`[AUTONOMOUS-OFFICE] ⚠️  Human attention needed: ${data.caseId}`);
    // TODO: Send notification via existing notification system
  });
  
  orchestrator.on('task:escalated', (data) => {
    console.log(`[AUTONOMOUS-OFFICE] ⚠️  Task escalated: ${data.task.title}`);
  });
}

/**
 * Create Express routes
 */
function createRoutes() {
  const express = require('express');
  const router = express.Router();
  
  // All routes require authentication
  // This will be applied in main server: app.use('/api/autonomous-office', requireAuth, autonomousOfficeRoutes)
  
  /**
   * Submit new request
   */
  router.post('/request', async (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    
    try {
      const { title, type, priority, description, data } = req.body;
      
      if (!title || !type) {
        return res.status(400).json({
          error: 'Missing required fields: title, type'
        });
      }
      
      const requestId = await orchestrator.submitRequest({
        title,
        type,
        priority: priority || 'normal',
        description,
        data,
        submittedBy: req.user.username,
        submittedById: req.user.id
      });
      
      res.json({
        success: true,
        requestId: requestId,
        message: 'Yêu cầu đã được tiếp nhận và đang xử lý tự động'
      });
      
    } catch (error) {
      console.error('[AUTONOMOUS-OFFICE] Error submitting request:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get office status
   */
  router.get('/status', (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    res.json(orchestrator.getStatus());
  });
  
  /**
   * Get agents status
   */
  router.get('/agents', (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    
    const agents = Array.from(orchestrator.agents.values()).map(agent => agent.getStatus());
    res.json({ agents });
  });
  
  /**
   * Get request details
   */
  router.get('/request/:id', (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    
    const request = orchestrator.activeRequests.get(req.params.id) ||
                    orchestrator.completedRequests.find(r => r.id === req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json(request);
  });
  
  /**
   * Get completed requests
   */
  router.get('/completed', (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    
    const limit = parseInt(req.query.limit) || 20;
    const completed = orchestrator.completedRequests.slice(-limit).reverse();
    res.json({ completed });
  });
  
  /**
   * Get metrics
   */
  router.get('/metrics', (req, res) => {
    if (!orchestrator) {
      return res.status(503).json({ error: 'Office not initialized' });
    }
    
    res.json({
      office: orchestrator.metrics,
      agents: Array.from(orchestrator.agents.values()).map(agent => ({
        name: agent.name,
        role: agent.profile.role,
        metrics: agent.metrics,
        status: agent.status
      }))
    });
  });
  
  /**
   * Health check
   */
  router.get('/health', (req, res) => {
    res.json({
      status: orchestrator ? 'running' : 'not-initialized',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
  
  return router;
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (orchestrator) {
    console.log('[AUTONOMOUS-OFFICE] Shutting down...');
    await orchestrator.stop();
  }
}

module.exports = {
  initialize,
  createRoutes,
  shutdown,
  getOrchestrator: () => orchestrator
};
