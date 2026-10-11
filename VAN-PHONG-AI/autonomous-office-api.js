'use strict';

/**
 * API Server cho Autonomous Office
 * Cung cấp interface để submit requests và monitor progress
 */

const express = require('express');
const OfficeOrchestrator = require('./office-orchestrator');
const fs = require('fs').promises;
const path = require('path');

// Mock DB Store (trong production sẽ dùng database thực)
class MockDBStore {
  constructor() {
    this.cases = new Map();
    this.reports = [];
    this.backups = [];
  }

  async saveCase(caseData) {
    this.cases.set(caseData.id, caseData);
    return caseData;
  }

  async updateCase(caseData) {
    this.cases.set(caseData.id, caseData);
    return caseData;
  }

  async getCase(id) {
    return this.cases.get(id);
  }

  async getLegalBasis(caseType) {
    return []; // Would query legal database
  }

  async getTemplates(caseType) {
    return []; // Would query templates
  }

  async findSimilarCases(caseType, limit) {
    return Array.from(this.cases.values())
      .filter(c => c.type === caseType)
      .slice(0, limit);
  }

  async search(field) {
    return null; // Would search database
  }

  async indexCase(caseData) {
    // Would index for search
  }

  async saveDailyReport(report) {
    this.reports.push(report);
  }

  async saveBackup(data) {
    this.backups.push(data);
  }

  async getRelevantData(docType) {
    return {}; // Would query relevant data
  }
}

// Load AI config
async function loadAIConfig() {
  try {
    const configPath = path.join(__dirname, 'ai-config.local.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load AI config:', error);
    return {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY || ''
    };
  }
}

// Initialize
let orchestrator;
const db = new MockDBStore();

async function init() {
  const aiConfig = await loadAIConfig();
  orchestrator = new OfficeOrchestrator(db, aiConfig);
  
  // Subscribe to events
  orchestrator.on('office:started', () => {
    console.log('[API] Office started successfully');
  });
  
  orchestrator.on('request:completed', (request) => {
    console.log(`[API] Request completed: ${request.id}`);
  });
  
  orchestrator.on('case:needs-human', (data) => {
    console.log(`[API] Human attention needed for case: ${data.caseId}`);
    // Would send notification
  });
  
  orchestrator.on('agent:log', (log) => {
    // Forward to logging system
  });
  
  // Start the office
  await orchestrator.start();
}

// Create API routes
function createRoutes() {
  const router = express.Router();
  
  /**
   * Submit new request
   * POST /api/autonomous-office/request
   */
  router.post('/request', async (req, res) => {
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
        data
      });
      
      res.json({
        success: true,
        requestId: requestId,
        message: 'Request submitted and queued for processing'
      });
      
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  });
  
  /**
   * Get office status
   * GET /api/autonomous-office/status
   */
  router.get('/status', (req, res) => {
    res.json(orchestrator.getStatus());
  });
  
  /**
   * Get agent status
   * GET /api/autonomous-office/agents
   */
  router.get('/agents', (req, res) => {
    const agents = Array.from(orchestrator.agents.values()).map(agent => agent.getStatus());
    res.json({ agents });
  });
  
  /**
   * Get agent worklog
   * GET /api/autonomous-office/agents/:name/log
   */
  router.get('/agents/:name/log', (req, res) => {
    const agent = orchestrator.agents.get(req.params.name);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    res.json({ worklog: agent.getWorklog(limit) });
  });
  
  /**
   * Get request status
   * GET /api/autonomous-office/request/:id
   */
  router.get('/request/:id', (req, res) => {
    const request = orchestrator.activeRequests.get(req.params.id) ||
                    orchestrator.completedRequests.find(r => r.id === req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json(request);
  });
  
  /**
   * Get case details
   * GET /api/autonomous-office/case/:id
   */
  router.get('/case/:id', async (req, res) => {
    const caseData = await db.getCase(req.params.id);
    
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.json(caseData);
  });
  
  /**
   * Get completed requests
   * GET /api/autonomous-office/completed
   */
  router.get('/completed', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const completed = orchestrator.completedRequests.slice(-limit).reverse();
    res.json({ completed });
  });
  
  /**
   * Get metrics
   * GET /api/autonomous-office/metrics
   */
  router.get('/metrics', (req, res) => {
    res.json({
      office: orchestrator.metrics,
      agents: Array.from(orchestrator.agents.values()).map(agent => ({
        name: agent.name,
        role: agent.profile.role,
        metrics: agent.metrics
      }))
    });
  });
  
  /**
   * Manual intervention - Pause/Resume office
   * POST /api/autonomous-office/control
   */
  router.post('/control', async (req, res) => {
    const { action } = req.body;
    
    try {
      if (action === 'pause') {
        await orchestrator.stop();
        res.json({ success: true, message: 'Office paused' });
      } else if (action === 'resume') {
        await orchestrator.start();
        res.json({ success: true, message: 'Office resumed' });
      } else {
        res.status(400).json({ error: 'Invalid action. Use: pause or resume' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Test endpoint - Generate sample request
   * POST /api/autonomous-office/test/generate
   */
  router.post('/test/generate', async (req, res) => {
    const sampleRequests = [
      {
        title: 'Mua sắm thiết bị văn phòng',
        type: 'procurement',
        priority: 'normal',
        description: 'Mua 5 bộ máy tính để bàn cho nhân viên mới',
        data: {
          items: [
            { name: 'Máy tính để bàn', quantity: 5, estimatedPrice: 15000000 }
          ],
          budget: 75000000,
          deadline: '2024-12-31'
        }
      },
      {
        title: 'Thanh toán nhà cung cấp tháng 11',
        type: 'payment',
        priority: 'high',
        description: 'Thanh toán các hóa đơn đã nghiệm thu tháng 11',
        data: {
          invoices: ['INV-2024-001', 'INV-2024-002'],
          totalAmount: 50000000
        }
      },
      {
        title: 'Báo cáo tình hình hoạt động Q4',
        type: 'report',
        priority: 'normal',
        description: 'Tổng hợp báo cáo hoạt động quý 4/2024',
        data: {
          period: 'Q4-2024',
          sections: ['executive-summary', 'financial', 'operations', 'recommendations']
        }
      }
    ];
    
    const request = sampleRequests[Math.floor(Math.random() * sampleRequests.length)];
    const requestId = await orchestrator.submitRequest(request);
    
    res.json({
      success: true,
      requestId: requestId,
      request: request
    });
  });
  
  return router;
}

module.exports = {
  init,
  createRoutes,
  orchestrator: () => orchestrator
};
