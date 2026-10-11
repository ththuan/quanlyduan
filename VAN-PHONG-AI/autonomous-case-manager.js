'use strict';

/**
 * Module quản lý hồ sơ tự động - Mô phỏng hệ thống quản lý thực tế
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class AutonomousCaseManager extends EventEmitter {
  constructor(dbStore, aiConfig) {
    super();
    this.db = dbStore;
    this.aiConfig = aiConfig;
    this.activeCases = new Map();
    this.caseHistory = [];
    this.workQueue = [];
  }

  /**
   * Tạo hồ sơ mới hoàn toàn tự động
   */
  async createCase(request) {
    console.log(`[CASE-MANAGER] Tạo hồ sơ mới: ${request.title}`);
    
    const caseData = {
      id: this.generateCaseId(),
      title: request.title,
      type: request.type,
      priority: request.priority || 'normal',
      status: 'creating',
      createdAt: new Date().toISOString(),
      createdBy: 'AI-AUTO',
      assignedTo: await this.autoAssign(request),
      workflow: await this.determineWorkflow(request.type),
      documents: [],
      timeline: [],
      metrics: {
        totalSteps: 0,
        completedSteps: 0,
        blockers: [],
        quality: 0
      }
    };

    // Lưu vào database
    await this.db.saveCase(caseData);
    this.activeCases.set(caseData.id, caseData);
    
    // Bắt đầu xử lý tự động
    this.processCase(caseData.id);
    
    this.emit('case:created', caseData);
    
    return caseData;
  }

  /**
   * Xử lý hồ sơ tự động từ đầu đến cuối
   */
  async processCase(caseId) {
    const caseData = this.activeCases.get(caseId);
    if (!caseData) return;

    console.log(`[CASE-MANAGER] Bắt đầu xử lý hồ sơ: ${caseId}`);
    
    try {
      // Phase 1: Thu thập và phân tích
      await this.phaseGatherInfo(caseData);
      
      // Phase 2: Tạo tài liệu
      await this.phaseGenerateDocuments(caseData);
      
      // Phase 3: Review và hoàn thiện
      await this.phaseReviewAndFinalize(caseData);
      
      // Phase 4: Chuẩn bị trình
      await this.phasePrepareSubmission(caseData);
      
      // Phase 5: Lưu trữ và đóng hồ sơ
      await this.phaseArchive(caseData);
      
      caseData.status = 'completed';
      caseData.completedAt = new Date().toISOString();
      
      await this.db.updateCase(caseData);
      this.emit('case:completed', caseData);
      
      console.log(`[CASE-MANAGER] Hoàn thành hồ sơ: ${caseId}`);
      
    } catch (error) {
      console.error(`[CASE-MANAGER] Lỗi xử lý hồ sơ ${caseId}:`, error);
      caseData.status = 'error';
      caseData.error = error.message;
      await this.db.updateCase(caseData);
      this.emit('case:error', { caseId, error });
    }
  }

  /**
   * Phase 1: Thu thập thông tin
   */
  async phaseGatherInfo(caseData) {
    console.log(`[PHASE-1] Thu thập thông tin cho ${caseData.id}`);
    caseData.status = 'gathering-info';
    this.emit('case:phase-change', { caseId: caseData.id, phase: 'gathering-info' });
    
    // Tự động thu thập thông tin từ các nguồn
    const gathered = {
      legalBasis: await this.gatherLegalBasis(caseData.type),
      templates: await this.gatherTemplates(caseData.type),
      relatedCases: await this.findRelatedCases(caseData.type),
      requiredData: await this.identifyRequiredData(caseData.type),
      constraints: await this.identifyConstraints(caseData)
    };
    
    caseData.gathered = gathered;
    
    // AI phân tích và đưa ra kế hoạch
    caseData.plan = await this.aiCreatePlan(caseData, gathered);
    
    this.logTimeline(caseData, 'gathering-completed', 'Đã thu thập đầy đủ thông tin và lập kế hoạch');
    
    await this.db.updateCase(caseData);
  }

  /**
   * Phase 2: Tạo tài liệu
   */
  async phaseGenerateDocuments(caseData) {
    console.log(`[PHASE-2] Tạo tài liệu cho ${caseData.id}`);
    caseData.status = 'generating-documents';
    this.emit('case:phase-change', { caseId: caseData.id, phase: 'generating-documents' });
    
    const AutonomousDocumentGenerator = require('./autonomous-document-generator');
    const docGen = new AutonomousDocumentGenerator(this.aiConfig, this.db);
    
    // Tạo từng tài liệu theo kế hoạch
    for (const docSpec of caseData.plan.documents) {
      const doc = await docGen.generateSingleDocument(docSpec.type, {
        ...caseData,
        ...docSpec.data
      });
      
      caseData.documents.push(doc);
      this.logTimeline(caseData, 'document-created', `Đã tạo ${docSpec.type}`);
      
      // Thông báo tiến độ
      caseData.metrics.completedSteps++;
      this.emit('case:progress', {
        caseId: caseData.id,
        progress: (caseData.metrics.completedSteps / caseData.metrics.totalSteps * 100).toFixed(1)
      });
    }
    
    await this.db.updateCase(caseData);
  }

  /**
   * Phase 3: Review và hoàn thiện
   */
  async phaseReviewAndFinalize(caseData) {
    console.log(`[PHASE-3] Review và hoàn thiện ${caseData.id}`);
    caseData.status = 'reviewing';
    this.emit('case:phase-change', { caseId: caseData.id, phase: 'reviewing' });
    
    // AI tự động review toàn bộ hồ sơ
    const review = await this.aiReviewCase(caseData);
    
    caseData.review = review;
    
    // Tự động sửa các vấn đề nhỏ
    if (review.autoFixable.length > 0) {
      for (const issue of review.autoFixable) {
        await this.autoFixIssue(caseData, issue);
      }
    }
    
    // Đánh dấu các vấn đề cần con người
    if (review.requiresHuman.length > 0) {
      caseData.status = 'pending-human-review';
      caseData.blockers = review.requiresHuman;
      this.emit('case:needs-human', { caseId: caseData.id, issues: review.requiresHuman });
      
      // Đợi human approval
      await this.waitForHumanApproval(caseData);
    }
    
    // Tính toán quality score
    caseData.metrics.quality = this.calculateQuality(caseData);
    
    this.logTimeline(caseData, 'review-completed', `Review hoàn tất. Quality: ${caseData.metrics.quality}/100`);
    
    await this.db.updateCase(caseData);
  }

  /**
   * Phase 4: Chuẩn bị trình
   */
  async phasePrepareSubmission(caseData) {
    console.log(`[PHASE-4] Chuẩn bị trình ${caseData.id}`);
    caseData.status = 'preparing-submission';
    this.emit('case:phase-change', { caseId: caseData.id, phase: 'preparing-submission' });
    
    // Tạo bộ trình hoàn chỉnh
    const submission = {
      coverLetter: await this.generateCoverLetter(caseData),
      checklist: await this.generateChecklist(caseData),
      summary: await this.generateExecutiveSummary(caseData),
      appendices: caseData.documents.map(d => ({
        title: d.type,
        filename: d.filename,
        pages: this.estimatePages(d)
      }))
    };
    
    caseData.submission = submission;
    
    // Tạo file PDF tổng hợp
    await this.createSubmissionPackage(caseData);
    
    this.logTimeline(caseData, 'submission-ready', 'Bộ hồ sơ đã sẵn sàng trình');
    
    await this.db.updateCase(caseData);
  }

  /**
   * Phase 5: Lưu trữ
   */
  async phaseArchive(caseData) {
    console.log(`[PHASE-5] Lưu trữ ${caseData.id}`);
    caseData.status = 'archiving';
    
    // Tổ chức file theo chuẩn lưu trữ
    const archiveStructure = await this.organizeForArchive(caseData);
    
    // Tạo index và metadata
    await this.createArchiveIndex(caseData, archiveStructure);
    
    // Backup
    await this.backupCase(caseData);
    
    // Update search index
    await this.updateSearchIndex(caseData);
    
    this.logTimeline(caseData, 'archived', 'Hồ sơ đã được lưu trữ');
    
    caseData.status = 'archived';
    await this.db.updateCase(caseData);
  }

  /**
   * AI tự động lập kế hoạch xử lý
   */
  async aiCreatePlan(caseData, gathered) {
    const prompt = `
Bạn là trưởng nhóm AI chuyên nghiệp. Hãy lập kế hoạch chi tiết để xử lý hồ sơ sau:

Loại hồ sơ: ${caseData.type}
Tiêu đề: ${caseData.title}
Ưu tiên: ${caseData.priority}

Thông tin đã thu thập:
${JSON.stringify(gathered, null, 2)}

Yêu cầu:
1. Xác định danh sách tài liệu cần tạo (type, dependencies, data requirements)
2. Xác định workflow và timeline
3. Xác định điểm cần con người kiểm tra
4. Đánh giá rủi ro và đề xuất giảm thiểu

Trả về JSON với format:
{
  "documents": [
    {
      "type": "de-xuat-mua-sam",
      "dependencies": [],
      "dataRequirements": ["supplier info", "budget"],
      "estimatedTime": "2h",
      "assignedTo": "HẢI"
    }
  ],
  "workflow": {
    "steps": ["step1", "step2"],
    "checkpoints": ["checkpoint1"],
    "risks": ["risk1"]
  },
  "totalSteps": 10,
  "estimatedDuration": "2 days"
}
`;

    try {
      const response = await this.callAI(prompt);
      const plan = JSON.parse(response);
      
      caseData.metrics.totalSteps = plan.totalSteps || plan.documents.length * 2;
      
      return plan;
    } catch (error) {
      console.error('[AI-PLAN] Lỗi:', error);
      return this.getDefaultPlan(caseData.type);
    }
  }

  /**
   * AI review toàn bộ hồ sơ
   */
  async aiReviewCase(caseData) {
    const prompt = `
Bạn là chuyên viên kiểm soát chất lượng. Hãy review toàn bộ hồ sơ sau:

${JSON.stringify(caseData, null, 2)}

Yêu cầu:
1. Kiểm tra tính đầy đủ và nhất quán của tài liệu
2. Xác định các vấn đề có thể tự động sửa
3. Xác định các vấn đề cần con người xử lý
4. Đánh giá chất lượng tổng thể (0-100)

Trả về JSON:
{
  "overallQuality": 85,
  "issues": [
    {
      "severity": "high|medium|low",
      "description": "mô tả vấn đề",
      "location": "document/section",
      "autoFixable": true/false,
      "suggestion": "gợi ý sửa"
    }
  ],
  "autoFixable": [],
  "requiresHuman": [],
  "strengths": ["điểm mạnh 1"],
  "improvements": ["cần cải thiện"]
}
`;

    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.error('[AI-REVIEW] Lỗi:', error);
      return {
        overallQuality: 50,
        issues: [],
        autoFixable: [],
        requiresHuman: [{ description: 'Cần review thủ công', severity: 'high' }],
        strengths: [],
        improvements: []
      };
    }
  }

  // Helper methods

  async gatherLegalBasis(caseType) {
    // Query legal database
    return await this.db.getLegalBasis(caseType);
  }

  async gatherTemplates(caseType) {
    // Find relevant templates
    return await this.db.getTemplates(caseType);
  }

  async findRelatedCases(caseType) {
    // Search similar cases
    return await this.db.findSimilarCases(caseType, 5);
  }

  async identifyRequiredData(caseType) {
    const requirements = {
      procurement: ['supplier', 'budget', 'specifications', 'timeline'],
      payment: ['invoice', 'contract', 'acceptance', 'bankInfo'],
      report: ['data', 'period', 'metrics', 'analysis']
    };
    return requirements[caseType] || [];
  }

  async identifyConstraints(caseData) {
    return {
      deadline: this.calculateDeadline(caseData),
      budget: await this.getBudgetConstraint(caseData),
      regulations: await this.getApplicableRegulations(caseData)
    };
  }

  async autoFixIssue(caseData, issue) {
    console.log(`[AUTO-FIX] Sửa: ${issue.description}`);
    // Implement auto-fix logic
  }

  async waitForHumanApproval(caseData) {
    console.log(`[HUMAN-REQUIRED] Đang chờ approval cho ${caseData.id}`);
    // This would integrate with notification system
    // For now, we'll just log it
  }

  calculateQuality(caseData) {
    if (!caseData.review) return 0;
    
    let score = caseData.review.overallQuality || 0;
    
    // Điều chỉnh dựa trên các yếu tố khác
    if (caseData.documents.every(d => d.isValid)) score += 5;
    if (caseData.review.requiresHuman.length === 0) score += 5;
    if (caseData.metrics.completedSteps === caseData.metrics.totalSteps) score += 5;
    
    return Math.min(100, score);
  }

  async generateCoverLetter(caseData) {
    return `Kính gửi: Ban Giám Đốc\n\nVề việc: ${caseData.title}\n\n...`;
  }

  async generateChecklist(caseData) {
    return caseData.documents.map((d, i) => `${i + 1}. ${d.type} - ${d.isValid ? '✓' : '⚠'}`).join('\n');
  }

  async generateExecutiveSummary(caseData) {
    const prompt = `Viết tóm tắt executive summary cho hồ sơ:\n${JSON.stringify(caseData, null, 2)}`;
    return await this.callAI(prompt);
  }

  async createSubmissionPackage(caseData) {
    // Create PDF package
    console.log(`[SUBMISSION] Tạo package cho ${caseData.id}`);
  }

  async organizeForArchive(caseData) {
    const archiveDir = path.join(__dirname, 'HO-SO-AI', 'ARCHIVE', caseData.id);
    await fs.mkdir(archiveDir, { recursive: true });
    return { path: archiveDir, structure: {} };
  }

  async createArchiveIndex(caseData, structure) {
    const indexPath = path.join(structure.path, 'INDEX.json');
    await fs.writeFile(indexPath, JSON.stringify(caseData, null, 2));
  }

  async backupCase(caseData) {
    console.log(`[BACKUP] Backup ${caseData.id}`);
  }

  async updateSearchIndex(caseData) {
    await this.db.indexCase(caseData);
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
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  logTimeline(caseData, event, description) {
    caseData.timeline.push({
      timestamp: new Date().toISOString(),
      event: event,
      description: description
    });
  }

  generateCaseId() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `HS-${year}${month}${day}-${seq}`;
  }

  async autoAssign(request) {
    // Auto-assign based on workload and skills
    const staff = ['HẢI', 'LONG', 'MINH', 'NAM'];
    return staff[Math.floor(Math.random() * staff.length)];
  }

  async determineWorkflow(caseType) {
    const workflows = {
      procurement: ['request', 'survey', 'compare', 'contract', 'acceptance', 'payment'],
      payment: ['request', 'verify', 'approve', 'execute'],
      report: ['collect', 'analyze', 'draft', 'review', 'publish']
    };
    return workflows[caseType] || ['create', 'review', 'complete'];
  }

  getDefaultPlan(caseType) {
    return {
      documents: [{ type: 'default-doc', dependencies: [], dataRequirements: [], estimatedTime: '1h', assignedTo: 'AN' }],
      workflow: { steps: ['create', 'review'], checkpoints: ['final-check'], risks: [] },
      totalSteps: 2,
      estimatedDuration: '1 day'
    };
  }

  calculateDeadline(caseData) {
    const now = new Date();
    const days = caseData.priority === 'high' ? 3 : (caseData.priority === 'urgent' ? 1 : 7);
    now.setDate(now.getDate() + days);
    return now.toISOString();
  }

  async getBudgetConstraint(caseData) {
    return null; // Get from DB
  }

  async getApplicableRegulations(caseData) {
    return []; // Get from legal DB
  }

  estimatePages(doc) {
    return Math.ceil(doc.content.length / 2000);
  }
}

module.exports = AutonomousCaseManager;
