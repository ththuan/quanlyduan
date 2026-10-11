'use strict';

/**
 * AI Worker Agent - Mô phỏng nhân viên thực tế làm việc độc lập
 * Có thể nhận task, tự lập kế hoạch, thực hiện và báo cáo
 */

const { EventEmitter } = require('events');

class AIWorkerAgent extends EventEmitter {
  constructor(name, profile, aiConfig, tools) {
    super();
    this.name = name;
    this.profile = profile; // { role, skills, traits }
    this.aiConfig = aiConfig;
    this.tools = tools; // { docGen, caseManager, db }
    
    this.currentTask = null;
    this.taskQueue = [];
    this.completedTasks = [];
    this.worklog = [];
    this.metrics = {
      tasksCompleted: 0,
      averageQuality: 0,
      averageTime: 0,
      errors: 0
    };
    
    this.status = 'idle'; // idle, working, blocked, break
    this.energy = 100;
    this.focus = 100;
  }

  /**
   * Nhận task mới và bắt đầu xử lý
   */
  async assignTask(task) {
    console.log(`[${this.name}] Nhận task: ${task.title}`);
    
    this.taskQueue.push({
      ...task,
      assignedAt: new Date().toISOString(),
      status: 'queued'
    });
    
    this.emit('task:assigned', { agent: this.name, task });
    
    // Nếu đang rảnh thì bắt đầu ngay
    if (this.status === 'idle') {
      await this.processNextTask();
    }
    
    return task.id;
  }

  /**
   * Xử lý task tiếp theo trong queue
   */
  async processNextTask() {
    if (this.taskQueue.length === 0) {
      this.status = 'idle';
      this.log('No more tasks in queue', 'info');
      return;
    }
    
    this.currentTask = this.taskQueue.shift();
    this.status = 'working';
    this.currentTask.status = 'in-progress';
    this.currentTask.startedAt = new Date().toISOString();
    
    this.emit('task:started', { agent: this.name, task: this.currentTask });
    this.log(`Bắt đầu: ${this.currentTask.title}`, 'task-start');
    
    try {
      // AI phân tích task và lập kế hoạch
      const plan = await this.analyzueAndPlan(this.currentTask);
      this.currentTask.plan = plan;
      
      // Thực hiện từng bước
      const result = await this.executeWorkflow(plan);
      
      // Tự review kết quả
      const review = await this.selfReview(result);
      
      // Nếu không đạt, tự sửa
      if (review.quality < 70) {
        this.log('Quality không đạt, đang sửa lại', 'warning');
        const improved = await this.improveResult(result, review.issues);
        result.content = improved;
        result.improved = true;
      }
      
      // Hoàn thành
      this.currentTask.status = 'completed';
      this.currentTask.completedAt = new Date().toISOString();
      this.currentTask.result = result;
      this.currentTask.review = review;
      this.currentTask.duration = this.calculateDuration(this.currentTask);
      
      this.completedTasks.push(this.currentTask);
      this.updateMetrics(this.currentTask);
      
      this.emit('task:completed', { agent: this.name, task: this.currentTask });
      this.log(`Hoàn thành: ${this.currentTask.title} (Quality: ${review.quality}/100)`, 'task-complete');
      
    } catch (error) {
      this.currentTask.status = 'failed';
      this.currentTask.error = error.message;
      this.metrics.errors++;
      
      this.emit('task:failed', { agent: this.name, task: this.currentTask, error });
      this.log(`Lỗi: ${error.message}`, 'error');
    } finally {
      this.currentTask = null;
      
      // Nghỉ ngắn trước khi làm task tiếp
      await this.takeBreak();
      
      // Xử lý task tiếp theo
      await this.processNextTask();
    }
  }

  /**
   * AI phân tích task và lập kế hoạch chi tiết
   */
  async analyzeAndPlan(task) {
    this.log('Đang phân tích task và lập kế hoạch...', 'planning');
    
    const prompt = `
Bạn là ${this.name}, ${this.profile.role}.

Kỹ năng của bạn:
${JSON.stringify(this.profile.skills, null, 2)}

Đặc điểm:
${JSON.stringify(this.profile.traits, null, 2)}

Task cần làm:
${JSON.stringify(task, null, 2)}

Hãy phân tích task và lập kế hoạch chi tiết để thực hiện. Xác định:
1. Các bước cần thực hiện (steps)
2. Công cụ/tài nguyên cần dùng (tools)
3. Dữ liệu cần thu thập (dataNeeded)
4. Điểm có thể gặp khó khăn (challenges)
5. Thời gian ước tính (estimatedTime)
6. Tiêu chí đánh giá hoàn thành (successCriteria)

Trả về JSON với format:
{
  "steps": [
    {
      "id": 1,
      "action": "Thu thập thông tin nhà cung cấp",
      "tool": "database-search",
      "dataNeeded": ["supplier name", "contact"],
      "estimatedTime": "30m"
    }
  ],
  "challenges": ["Có thể thiếu dữ liệu giá"],
  "successCriteria": ["Đầy đủ thông tin", "Format chuẩn", "Số liệu chính xác"],
  "totalEstimatedTime": "2h"
}
`;

    try {
      const response = await this.callAI(prompt);
      const plan = JSON.parse(response);
      this.log(`Đã lập kế hoạch: ${plan.steps.length} bước`, 'planning');
      return plan;
    } catch (error) {
      this.log(`Lỗi planning: ${error.message}`, 'error');
      return this.getDefaultPlan(task);
    }
  }

  /**
   * Thực hiện workflow theo kế hoạch
   */
  async executeWorkflow(plan) {
    const result = {
      steps: [],
      outputs: {},
      issues: [],
      metrics: {}
    };
    
    for (const [index, step] of plan.steps.entries()) {
      this.log(`Bước ${index + 1}/${plan.steps.length}: ${step.action}`, 'step');
      
      try {
        const stepResult = await this.executeStep(step, result.outputs);
        
        result.steps.push({
          ...step,
          status: 'completed',
          output: stepResult,
          completedAt: new Date().toISOString()
        });
        
        result.outputs[step.id] = stepResult;
        
        // Update energy/focus
        this.energy = Math.max(0, this.energy - 2);
        this.focus = Math.max(0, this.focus - 3);
        
        this.emit('step:completed', { agent: this.name, step: step.id, result: stepResult });
        
      } catch (error) {
        result.issues.push({
          step: step.id,
          error: error.message,
          action: step.action
        });
        
        this.log(`Lỗi bước ${step.id}: ${error.message}`, 'error');
        
        // Thử giải quyết tự động
        const resolved = await this.tryResolveIssue(step, error);
        if (resolved) {
          result.outputs[step.id] = resolved;
        }
      }
    }
    
    return result;
  }

  /**
   * Thực hiện một bước cụ thể
   */
  async executeStep(step, previousOutputs) {
    switch (step.tool) {
      case 'database-search':
        return await this.searchDatabase(step.dataNeeded);
      
      case 'document-generate':
        return await this.generateDocument(step, previousOutputs);
      
      case 'data-analysis':
        return await this.analyzeData(step, previousOutputs);
      
      case 'calculation':
        return await this.performCalculation(step, previousOutputs);
      
      case 'form-fill':
        return await this.fillForm(step, previousOutputs);
      
      case 'ai-assist':
        return await this.aiAssist(step, previousOutputs);
      
      default:
        throw new Error(`Unknown tool: ${step.tool}`);
    }
  }

  /**
   * Tìm kiếm dữ liệu từ database
   */
  async searchDatabase(dataNeeded) {
    this.log(`Tìm kiếm: ${dataNeeded.join(', ')}`, 'search');
    
    const results = {};
    for (const field of dataNeeded) {
      try {
        results[field] = await this.tools.db.search(field);
      } catch {
        results[field] = null;
      }
    }
    
    return results;
  }

  /**
   * Tạo tài liệu
   */
  async generateDocument(step, previousOutputs) {
    this.log(`Tạo tài liệu: ${step.docType}`, 'generate');
    
    const docData = {
      ...step.data,
      ...this.extractRelevantData(previousOutputs)
    };
    
    const doc = await this.tools.docGen.generateSingleDocument(step.docType, {
      type: step.docType,
      data: docData
    });
    
    return doc;
  }

  /**
   * Phân tích dữ liệu
   */
  async analyzeData(step, previousOutputs) {
    this.log('Phân tích dữ liệu', 'analyze');
    
    const data = previousOutputs[step.dataSource];
    
    const prompt = `
Phân tích dữ liệu sau và đưa ra insights:

${JSON.stringify(data, null, 2)}

Yêu cầu: ${step.analysisType}

Trả về JSON với: { summary, insights, recommendations, data: {} }
`;

    const response = await this.callAI(prompt);
    return JSON.parse(response);
  }

  /**
   * Tính toán
   */
  async performCalculation(step, previousOutputs) {
    this.log('Thực hiện tính toán', 'calculate');
    
    const values = this.extractValues(step.inputs, previousOutputs);
    
    let result;
    switch (step.operation) {
      case 'sum':
        result = values.reduce((a, b) => a + b, 0);
        break;
      case 'average':
        result = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'formula':
        result = eval(step.formula.replace(/\{(\w+)\}/g, (_, key) => values[key]));
        break;
      default:
        throw new Error(`Unknown operation: ${step.operation}`);
    }
    
    return { operation: step.operation, result, inputs: values };
  }

  /**
   * Điền form
   */
  async fillForm(step, previousOutputs) {
    this.log(`Điền form: ${step.formType}`, 'fill-form');
    
    const formData = this.extractRelevantData(previousOutputs);
    
    // AI điền các trường phức tạp
    const prompt = `
Điền đầy đủ form "${step.formType}" với dữ liệu:

${JSON.stringify(formData, null, 2)}

Trả về JSON với tất cả các trường đã điền đầy đủ.
`;

    const filled = await this.callAI(prompt);
    return JSON.parse(filled);
  }

  /**
   * AI hỗ trợ cho tác vụ phức tạp
   */
  async aiAssist(step, previousOutputs) {
    this.log('Yêu cầu AI hỗ trợ', 'ai-assist');
    
    const prompt = `
${step.instruction}

Dữ liệu hiện có:
${JSON.stringify(previousOutputs, null, 2)}

${step.additionalContext || ''}

Hãy thực hiện yêu cầu và trả về kết quả dạng JSON.
`;

    const response = await this.callAI(prompt);
    return JSON.parse(response);
  }

  /**
   * Tự review kết quả công việc
   */
  async selfReview(result) {
    this.log('Tự review kết quả', 'review');
    
    const prompt = `
Bạn là ${this.name} vừa hoàn thành task. Hãy tự review kết quả:

${JSON.stringify(result, null, 2)}

Tiêu chí đánh giá từ plan:
${JSON.stringify(this.currentTask.plan.successCriteria, null, 2)}

Đánh giá:
1. Quality (0-100)
2. Completeness (0-100)
3. Accuracy (0-100)
4. Issues (nếu có)
5. Suggestions (để cải thiện)

Trả về JSON:
{
  "quality": 85,
  "completeness": 90,
  "accuracy": 95,
  "overallScore": 90,
  "issues": [],
  "suggestions": [],
  "passedCriteria": ["criteria1"],
  "failedCriteria": []
}
`;

    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch (error) {
      return {
        quality: 50,
        completeness: 50,
        accuracy: 50,
        overallScore: 50,
        issues: ['Self-review failed'],
        suggestions: [],
        passedCriteria: [],
        failedCriteria: []
      };
    }
  }

  /**
   * Cải thiện kết quả dựa trên review
   */
  async improveResult(result, issues) {
    this.log('Đang cải thiện kết quả', 'improve');
    
    const prompt = `
Kết quả hiện tại:
${JSON.stringify(result, null, 2)}

Các vấn đề cần sửa:
${JSON.stringify(issues, null, 2)}

Hãy sửa lại để khắc phục tất cả vấn đề. Trả về kết quả đã cải thiện.
`;

    const improved = await this.callAI(prompt);
    return improved;
  }

  /**
   * Thử giải quyết issue tự động
   */
  async tryResolveIssue(step, error) {
    this.log(`Trying to resolve: ${error.message}`, 'resolve');
    
    // Simple retry logic
    try {
      await this.delay(1000);
      return await this.executeStep(step, {});
    } catch {
      return null;
    }
  }

  /**
   * Nghỉ ngắn để phục hồi năng lượng
   */
  async takeBreak() {
    if (this.energy < 30 || this.focus < 30) {
      this.status = 'break';
      this.log('Nghỉ ngắn để phục hồi năng lượng', 'break');
      
      await this.delay(2000); // 2 seconds break
      
      this.energy = Math.min(100, this.energy + 20);
      this.focus = Math.min(100, this.focus + 25);
      
      this.status = 'idle';
    }
  }

  // Helper methods

  extractRelevantData(outputs) {
    const relevant = {};
    Object.values(outputs).forEach(output => {
      if (typeof output === 'object') {
        Object.assign(relevant, output);
      }
    });
    return relevant;
  }

  extractValues(inputs, outputs) {
    return inputs.map(input => {
      if (typeof input === 'number') return input;
      if (input.startsWith('step')) {
        const stepId = parseInt(input.replace('step', ''));
        return outputs[stepId];
      }
      return 0;
    });
  }

  updateMetrics(task) {
    this.metrics.tasksCompleted++;
    
    const quality = task.review?.overallScore || 0;
    this.metrics.averageQuality = (this.metrics.averageQuality * (this.metrics.tasksCompleted - 1) + quality) / this.metrics.tasksCompleted;
    
    const time = task.duration || 0;
    this.metrics.averageTime = (this.metrics.averageTime * (this.metrics.tasksCompleted - 1) + time) / this.metrics.tasksCompleted;
  }

  calculateDuration(task) {
    if (!task.startedAt || !task.completedAt) return 0;
    return (new Date(task.completedAt) - new Date(task.startedAt)) / 1000 / 60; // minutes
  }

  getDefaultPlan(task) {
    return {
      steps: [
        { id: 1, action: 'Execute task', tool: 'ai-assist', dataNeeded: [], estimatedTime: '1h' }
      ],
      challenges: [],
      successCriteria: ['Task completed'],
      totalEstimatedTime: '1h'
    };
  }

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
        messages: [
          {
            role: 'system',
            content: `Bạn là ${this.name}, ${this.profile.role}. ${JSON.stringify(this.profile)}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  log(message, level = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      level: level,
      message: message,
      task: this.currentTask?.id || null
    };
    
    this.worklog.push(logEntry);
    console.log(`[${this.name}] ${level.toUpperCase()}: ${message}`);
    
    this.emit('log', logEntry);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      name: this.name,
      role: this.profile.role,
      status: this.status,
      energy: this.energy,
      focus: this.focus,
      currentTask: this.currentTask ? {
        id: this.currentTask.id,
        title: this.currentTask.title,
        status: this.currentTask.status
      } : null,
      queueLength: this.taskQueue.length,
      metrics: this.metrics
    };
  }

  getWorklog(limit = 50) {
    return this.worklog.slice(-limit);
  }
}

module.exports = AIWorkerAgent;
