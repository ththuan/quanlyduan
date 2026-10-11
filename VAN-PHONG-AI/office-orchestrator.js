'use strict';

/**
 * Office Orchestrator - Điều phối toàn bộ văn phòng AI tự động
 * Phân công việc, giám sát tiến độ, đảm bảo chất lượng
 */

const { EventEmitter } = require('events');
const AIWorkerAgent = require('./ai-worker-agent');
const AutonomousCaseManager = require('./autonomous-case-manager');
const AutonomousDocumentGenerator = require('./autonomous-document-generator');

class OfficeOrchestrator extends EventEmitter {
  constructor(dbStore, aiConfig) {
    super();
    this.db = dbStore;
    this.aiConfig = aiConfig;
    this.caseManager = new AutonomousCaseManager(dbStore, aiConfig);
    this.docGenerator = new AutonomousDocumentGenerator(aiConfig, dbStore);
    
    // Khởi tạo team
    this.agents = new Map();
    this.initializeTeam();
    
    // Queue và state
    this.requestQueue = [];
    this.activeRequests = new Map();
    this.completedRequests = [];
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      completed: 0,
      failed: 0,
      averageTime: 0,
      averageQuality: 0
    };
    
    this.isRunning = false;
  }

  /**
   * Khởi tạo team nhân viên AI
   */
  initializeTeam() {
    const team = [
      {
        name: 'HẢI',
        profile: {
          role: 'Tiếp nhận và điều phối',
          skills: { coordination: 0.92, forms: 0.64, control: 0.62 },
          traits: { social: 0.78, careful: 0.68, initiative: 0.82 }
        }
      },
      {
        name: 'LONG',
        profile: {
          role: 'Tài chính và số liệu',
          skills: { finance: 0.95, analysis: 0.91, control: 0.76 },
          traits: { social: 0.42, careful: 0.91, initiative: 0.62 }
        }
      },
      {
        name: 'MINH',
        profile: {
          role: 'Biểu mẫu và tổng hợp',
          skills: { forms: 0.95, coordination: 0.72, records: 0.68 },
          traits: { social: 0.66, careful: 0.86, initiative: 0.68 }
        }
      },
      {
        name: 'NAM',
        profile: {
          role: 'Lưu trữ và hệ thống',
          skills: { records: 0.94, system: 0.9, control: 0.7 },
          traits: { social: 0.54, careful: 0.88, initiative: 0.74 }
        }
      }
    ];
    
    team.forEach(member => {
      const agent = new AIWorkerAgent(
        member.name,
        member.profile,
        this.aiConfig,
        {
          docGen: this.docGenerator,
          caseManager: this.caseManager,
          db: this.db
        }
      );
      
      // Subscribe to agent events
      agent.on('task:completed', (data) => this.handleTaskCompleted(data));
      agent.on('task:failed', (data) => this.handleTaskFailed(data));
      agent.on('log', (log) => this.emit('agent:log', log));
      
      this.agents.set(member.name, agent);
    });
    
    console.log(`[ORCHESTRATOR] Team initialized: ${this.agents.size} agents`);
  }

  /**
   * Khởi động văn phòng tự động
   */
  async start() {
    if (this.isRunning) {
      console.log('[ORCHESTRATOR] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('[ORCHESTRATOR] Starting autonomous office...');
    
    // Listen to case manager events
    this.caseManager.on('case:created', (data) => this.emit('case:created', data));
    this.caseManager.on('case:completed', (data) => this.handleCaseCompleted(data));
    this.caseManager.on('case:needs-human', (data) => this.emit('case:needs-human', data));
    
    // Start processing queue
    this.processQueue();
    
    // Start daily routine
    this.startDailyRoutine();
    
    this.emit('office:started');
    console.log('[ORCHESTRATOR] Office is now running autonomously');
  }

  /**
   * Dừng văn phòng
   */
  async stop() {
    this.isRunning = false;
    console.log('[ORCHESTRATOR] Stopping office...');
    
    // Wait for current tasks to complete
    for (const [name, agent] of this.agents) {
      if (agent.status === 'working') {
        console.log(`[ORCHESTRATOR] Waiting for ${name} to finish current task...`);
        // In production, we'd have proper graceful shutdown
      }
    }
    
    this.emit('office:stopped');
    console.log('[ORCHESTRATOR] Office stopped');
  }

  /**
   * Nhận yêu cầu mới từ bên ngoài
   */
  async submitRequest(request) {
    console.log(`[ORCHESTRATOR] New request: ${request.title}`);
    
    const enriched = {
      ...request,
      id: this.generateRequestId(),
      submittedAt: new Date().toISOString(),
      status: 'queued'
    };
    
    this.requestQueue.push(enriched);
    this.metrics.totalRequests++;
    
    this.emit('request:received', enriched);
    
    return enriched.id;
  }

  /**
   * Xử lý queue requests
   */
  async processQueue() {
    while (this.isRunning) {
      if (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();
        await this.processRequest(request);
      }
      
      // Check every 5 seconds
      await this.delay(5000);
    }
  }

  /**
   * Xử lý một request
   */
  async processRequest(request) {
    console.log(`[ORCHESTRATOR] Processing request: ${request.id}`);
    
    request.status = 'analyzing';
    this.activeRequests.set(request.id, request);
    this.emit('request:started', request);
    
    try {
      // AI phân tích và lập chiến lược
      const strategy = await this.analyzeAndStrategize(request);
      request.strategy = strategy;
      
      // Tạo case
      const caseData = await this.caseManager.createCase({
        title: request.title,
        type: request.type,
        priority: request.priority,
        sourceRequest: request.id
      });
      
      request.caseId = caseData.id;
      
      // Phân công tasks cho agents
      await this.delegateTasks(strategy, caseData);
      
      // Monitor và điều phối
      await this.monitorCase(caseData.id);
      
    } catch (error) {
      console.error(`[ORCHESTRATOR] Error processing ${request.id}:`, error);
      request.status = 'failed';
      request.error = error.message;
      this.metrics.failed++;
      this.emit('request:failed', request);
    }
  }

  /**
   * AI phân tích request và lập chiến lược xử lý
   */
  async analyzeAndStrategize(request) {
    console.log(`[ORCHESTRATOR] Analyzing request ${request.id}`);
    
    const prompt = `
Bạn là trưởng nhóm văn phòng AI. Phân tích yêu cầu và lập chiến lược xử lý:

Request:
${JSON.stringify(request, null, 2)}

Team hiện tại:
${Array.from(this.agents.values()).map(a => `- ${a.name}: ${a.profile.role} (Status: ${a.status}, Queue: ${a.taskQueue.length})`).join('\n')}

Hãy:
1. Xác định loại công việc và độ phức tạp
2. Phân tích các bước cần thực hiện
3. Xác định nhân viên phù hợp cho từng bước
4. Ước tính thời gian và rủi ro
5. Đề xuất chiến lược tối ưu

Trả về JSON:
{
  "complexity": "low|medium|high",
  "estimatedTime": "2 days",
  "phases": [
    {
      "phase": "information-gathering",
      "tasks": [
        {
          "id": "task-1",
          "title": "Thu thập thông tin nhà cung cấp",
          "assignTo": "HẢI",
          "dependencies": [],
          "estimatedTime": "2h",
          "priority": "high"
        }
      ]
    }
  ],
  "risks": ["risk1"],
  "recommendations": ["recommendation1"]
}
`;

    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.error('[ORCHESTRATOR] Strategy analysis failed:', error);
      return this.getDefaultStrategy(request);
    }
  }

  /**
   * Phân công tasks cho các agents
   */
  async delegateTasks(strategy, caseData) {
    console.log(`[ORCHESTRATOR] Delegating tasks for case ${caseData.id}`);
    
    for (const phase of strategy.phases) {
      for (const task of phase.tasks) {
        const agent = this.agents.get(task.assignTo);
        
        if (!agent) {
          console.warn(`[ORCHESTRATOR] Agent ${task.assignTo} not found, reassigning...`);
          const available = this.findAvailableAgent(task);
          if (available) {
            await available.assignTask({
              ...task,
              caseId: caseData.id,
              phase: phase.phase
            });
          }
        } else {
          await agent.assignTask({
            ...task,
            caseId: caseData.id,
            phase: phase.phase
          });
        }
      }
      
      // Đợi phase hoàn thành trước khi chuyển phase tiếp theo
      // (trong production sẽ có logic phức tạp hơn)
    }
  }

  /**
   * Monitor case và điều chỉnh nếu cần
   */
  async monitorCase(caseId) {
    console.log(`[ORCHESTRATOR] Monitoring case ${caseId}`);
    
    // This would be more sophisticated in production
    // with real-time monitoring, automatic interventions, etc.
  }

  /**
   * Xử lý khi task hoàn thành
   */
  handleTaskCompleted(data) {
    console.log(`[ORCHESTRATOR] Task completed: ${data.task.title} by ${data.agent}`);
    this.emit('task:completed', data);
    
    // Check if case is complete
    this.checkCaseCompletion(data.task.caseId);
  }

  /**
   * Xử lý khi task thất bại
   */
  handleTaskFailed(data) {
    console.error(`[ORCHESTRATOR] Task failed: ${data.task.title} by ${data.agent}`);
    this.emit('task:failed', data);
    
    // Try to reassign or escalate
    this.handleFailedTask(data);
  }

  /**
   * Xử lý task thất bại - reassign hoặc escalate
   */
  async handleFailedTask(data) {
    const task = data.task;
    
    // Nếu failed < 3 lần, thử assign cho agent khác
    task.failCount = (task.failCount || 0) + 1;
    
    if (task.failCount < 3) {
      const agent = this.findAvailableAgent(task, [data.agent]);
      if (agent) {
        console.log(`[ORCHESTRATOR] Reassigning task to ${agent.name}`);
        await agent.assignTask(task);
        return;
      }
    }
    
    // Escalate to human
    this.emit('task:escalated', {
      task: task,
      reason: 'Multiple failures',
      previousAgents: [data.agent]
    });
  }

  /**
   * Xử lý khi case hoàn thành
   */
  handleCaseCompleted(caseData) {
    console.log(`[ORCHESTRATOR] Case completed: ${caseData.id}`);
    
    const request = this.activeRequests.get(caseData.sourceRequest);
    if (request) {
      request.status = 'completed';
      request.completedAt = new Date().toISOString();
      request.result = caseData;
      
      this.completedRequests.push(request);
      this.activeRequests.delete(request.id);
      
      this.metrics.completed++;
      this.updateMetrics(request);
      
      this.emit('request:completed', request);
    }
  }

  /**
   * Tìm agent phù hợp và rảnh
   */
  findAvailableAgent(task, excludeAgents = []) {
    const candidates = Array.from(this.agents.values())
      .filter(agent => !excludeAgents.includes(agent.name))
      .map(agent => ({
        agent: agent,
        score: this.calculateAgentScore(agent, task)
      }))
      .sort((a, b) => b.score - a.score);
    
    return candidates.length > 0 ? candidates[0].agent : null;
  }

  /**
   * Tính điểm phù hợp của agent cho task
   */
  calculateAgentScore(agent, task) {
    let score = 0;
    
    // Skill match
    if (task.requiredSkill && agent.profile.skills[task.requiredSkill]) {
      score += agent.profile.skills[task.requiredSkill] * 50;
    }
    
    // Workload (ít việc hơn = điểm cao hơn)
    score += (1 - agent.taskQueue.length / 10) * 30;
    
    // Status (idle = điểm cao nhất)
    if (agent.status === 'idle') score += 20;
    else if (agent.status === 'working') score += 10;
    
    // Performance history
    score += agent.metrics.averageQuality * 0.2;
    
    return score;
  }

  /**
   * Kiểm tra xem case đã hoàn thành chưa
   */
  async checkCaseCompletion(caseId) {
    // This would check if all tasks for the case are done
    // For now, we rely on case manager to emit completion event
  }

  /**
   * Daily routine - Báo cáo, dọn dẹp, backup
   */
  startDailyRoutine() {
    setInterval(async () => {
      console.log('[ORCHESTRATOR] Running daily routine...');
      
      // Generate daily report
      await this.generateDailyReport();
      
      // Cleanup old data
      await this.cleanup();
      
      // Backup
      await this.backup();
      
    }, 24 * 60 * 60 * 1000); // Every 24 hours
  }

  /**
   * Tạo báo cáo hàng ngày
   */
  async generateDailyReport() {
    const report = {
      date: new Date().toISOString(),
      metrics: this.metrics,
      agents: Array.from(this.agents.values()).map(a => a.getStatus()),
      activeRequests: this.activeRequests.size,
      completedToday: this.completedRequests.filter(r => 
        new Date(r.completedAt).toDateString() === new Date().toDateString()
      ).length
    };
    
    console.log('[ORCHESTRATOR] Daily Report:', JSON.stringify(report, null, 2));
    this.emit('daily:report', report);
    
    // Save to file
    await this.db.saveDailyReport(report);
  }

  /**
   * Dọn dẹp dữ liệu cũ
   */
  async cleanup() {
    console.log('[ORCHESTRATOR] Cleaning up old data...');
    
    // Keep only last 1000 completed requests
    if (this.completedRequests.length > 1000) {
      this.completedRequests = this.completedRequests.slice(-1000);
    }
    
    // Clear agent worklogs
    for (const agent of this.agents.values()) {
      if (agent.worklog.length > 500) {
        agent.worklog = agent.worklog.slice(-500);
      }
    }
  }

  /**
   * Backup dữ liệu
   */
  async backup() {
    console.log('[ORCHESTRATOR] Backing up data...');
    
    const backupData = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      completedRequests: this.completedRequests.slice(-100),
      agents: Array.from(this.agents.values()).map(a => ({
        name: a.name,
        metrics: a.metrics,
        completedTasks: a.completedTasks.length
      }))
    };
    
    await this.db.saveBackup(backupData);
  }

  // Helper methods

  async callAI(prompt) {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${this.aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: this.aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  updateMetrics(request) {
    if (request.status === 'completed') {
      const duration = (new Date(request.completedAt) - new Date(request.submittedAt)) / 1000 / 60 / 60; // hours
      this.metrics.averageTime = (this.metrics.averageTime * (this.metrics.completed - 1) + duration) / this.metrics.completed;
      
      const quality = request.result?.metrics?.quality || 0;
      this.metrics.averageQuality = (this.metrics.averageQuality * (this.metrics.completed - 1) + quality) / this.metrics.completed;
    }
  }

  generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `REQ-${timestamp}-${random}`.toUpperCase();
  }

  getDefaultStrategy(request) {
    return {
      complexity: 'medium',
      estimatedTime: '1 day',
      phases: [
        {
          phase: 'execution',
          tasks: [
            {
              id: 'task-default',
              title: request.title,
              assignTo: 'HẢI',
              dependencies: [],
              estimatedTime: '4h',
              priority: request.priority || 'normal'
            }
          ]
        }
      ],
      risks: [],
      recommendations: []
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      metrics: this.metrics,
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      agents: Array.from(this.agents.values()).map(a => a.getStatus())
    };
  }
}

module.exports = OfficeOrchestrator;
