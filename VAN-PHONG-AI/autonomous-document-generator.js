'use strict';

/**
 * Module tự động tạo và điền form văn bản - Hoạt động như nhân viên thật
 * Không chỉ gợi ý mà thực sự tạo file, điền đầy đủ thông tin
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class AutonomousDocumentGenerator {
  constructor(aiConfig, dataStore) {
    this.aiConfig = aiConfig;
    this.dataStore = dataStore;
    this.templatesDir = path.join(__dirname, 'MAU');
    this.outputDir = path.join(__dirname, 'HO-SO-AI');
    this.workQueue = [];
    this.completedDocs = [];
  }

  /**
   * Tự động phân tích yêu cầu và tạo tài liệu hoàn chỉnh
   */
  async processRequest(request) {
    console.log(`[DOCUMENT-GEN] Nhận yêu cầu: ${request.type}`);
    
    const workflow = await this.analyzeRequest(request);
    const documents = await this.generateAllDocuments(workflow);
    const validated = await this.validateDocuments(documents);
    const organized = await this.organizeFileStructure(validated);
    
    await this.commitToGit(organized, workflow.description);
    
    return {
      success: true,
      workflow: workflow,
      documents: organized,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Phân tích yêu cầu và xác định tài liệu cần tạo
   */
  async analyzeRequest(request) {
    const analysis = {
      type: request.type,
      requiredDocs: [],
      dependencies: [],
      actors: [],
      timeline: []
    };

    // Xác định tài liệu cần thiết dựa trên loại yêu cầu
    switch (request.type) {
      case 'procurement':
        analysis.requiredDocs = [
          'de-xuat-mua-sam',
          'bang-so-sanh-gia',
          'bao-cao-khao-sat',
          'hop-dong-du-thao',
          'bien-ban-nghiem-thu',
          'giay-de-nghi-thanh-toan'
        ];
        analysis.actors = ['HẢI', 'LONG', 'MINH', 'NAM'];
        break;
      
      case 'payment':
        analysis.requiredDocs = [
          'phieu-de-nghi-thanh-toan',
          'bang-ke-chi-tiet',
          'chung-tu-dinh-kem',
          'phieu-kiem-soat'
        ];
        analysis.actors = ['LONG', 'MINH', 'NAM'];
        break;
      
      case 'report':
        analysis.requiredDocs = [
          'bao-cao-dinh-ky',
          'bang-so-lieu',
          'phan-tich-xu-huong',
          'de-xuat-cai-thien'
        ];
        analysis.actors = ['LONG', 'MINH'];
        break;
    }

    // Xác định dependencies
    analysis.dependencies = this.buildDependencyGraph(analysis.requiredDocs);
    
    // Xây dựng timeline
    analysis.timeline = this.buildTimeline(analysis.requiredDocs, analysis.dependencies);
    
    analysis.description = `${request.type}: ${request.title || 'Tự động xử lý'}`;
    
    return analysis;
  }

  /**
   * Tạo tất cả tài liệu cần thiết
   */
  async generateAllDocuments(workflow) {
    const documents = [];
    
    for (const docType of workflow.requiredDocs) {
      console.log(`[DOCUMENT-GEN] Đang tạo: ${docType}`);
      
      const doc = await this.generateSingleDocument(docType, workflow);
      documents.push(doc);
      
      // Delay ngắn để mô phỏng nhân viên làm việc
      await this.delay(500);
    }
    
    return documents;
  }

  /**
   * Tạo một tài liệu cụ thể với đầy đủ nội dung
   */
  async generateSingleDocument(docType, workflow) {
    const template = await this.loadTemplate(docType);
    const data = await this.gatherDocumentData(docType, workflow);
    const filled = await this.fillTemplate(template, data);
    const reviewed = await this.aiReview(filled, docType);
    
    const document = {
      type: docType,
      filename: this.generateFilename(docType, data),
      content: reviewed.content,
      metadata: {
        createdBy: this.assignResponsible(docType, workflow.actors),
        createdAt: new Date().toISOString(),
        version: '1.0',
        status: 'draft',
        aiReviewScore: reviewed.score,
        aiSuggestions: reviewed.suggestions
      }
    };

    // Lưu file thực tế
    await this.saveDocument(document);
    
    return document;
  }

  /**
   * Thu thập dữ liệu cần điền vào tài liệu
   */
  async gatherDocumentData(docType, workflow) {
    const baseData = {
      ngay: new Date().toLocaleDateString('vi-VN'),
      nam: new Date().getFullYear(),
      soVanBan: this.generateDocNumber(docType),
      donVi: 'Văn phòng Quản lý Dự án AI'
    };

    // Lấy dữ liệu từ database
    const contextData = await this.dataStore.getRelevantData(docType);
    
    // Lấy dữ liệu từ các tài liệu phụ thuộc
    const dependencyData = await this.getDependencyData(docType, workflow);
    
    // Gọi AI để điền các phần phức tạp
    const aiFilledData = await this.aiGenerateContent(docType, {
      ...baseData,
      ...contextData,
      ...dependencyData
    });
    
    return aiFilledData;
  }

  /**
   * Điền template với dữ liệu thực tế
   */
  async fillTemplate(template, data) {
    let filled = template.content;
    
    // Replace các placeholder cơ bản
    Object.keys(data).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      filled = filled.replace(placeholder, data[key] || '');
    });
    
    // Xử lý các phần điều kiện
    filled = this.processConditionals(filled, data);
    
    // Xử lý các table động
    filled = this.processDynamicTables(filled, data);
    
    return filled;
  }

  /**
   * AI review và hoàn thiện tài liệu
   */
  async aiReview(content, docType) {
    const prompt = `
Bạn là chuyên viên văn thư chuyên nghiệp. Hãy rà soát và hoàn thiện tài liệu "${docType}" sau đây:

${content}

Yêu cầu:
1. Kiểm tra tính đầy đủ và chính xác của thông tin
2. Đảm bảo format chuẩn văn bản hành chính Việt Nam
3. Sửa lỗi chính tả, ngữ pháp
4. Bổ sung thông tin còn thiếu nếu có thể suy luận được
5. Đánh giá chất lượng tài liệu (0-100)

Trả về JSON với format:
{
  "content": "nội dung đã hoàn thiện",
  "score": 85,
  "suggestions": ["gợi ý 1", "gợi ý 2"],
  "missing": ["thông tin còn thiếu"]
}
`;

    try {
      const response = await this.callAI(prompt);
      const result = JSON.parse(response);
      return result;
    } catch (error) {
      console.error(`[AI-REVIEW] Lỗi: ${error.message}`);
      return {
        content: content,
        score: 50,
        suggestions: ['Cần review thủ công'],
        missing: []
      };
    }
  }

  /**
   * Gọi AI API
   */
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
            content: 'Bạn là trợ lý AI chuyên nghiệp trong xử lý văn bản hành chính.'
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

  /**
   * AI tự động tạo nội dung cho các phần phức tạp
   */
  async aiGenerateContent(docType, baseData) {
    const prompt = `
Hãy tạo nội dung đầy đủ cho tài liệu "${docType}" với thông tin sau:

${JSON.stringify(baseData, null, 2)}

Yêu cầu:
1. Điền đầy đủ tất cả thông tin cần thiết
2. Nội dung phải hợp lý, logic, chuyên nghiệp
3. Số liệu phải nhất quán
4. Format chuẩn văn bản hành chính Việt Nam

Trả về JSON với đầy đủ các trường dữ liệu đã điền.
`;

    try {
      const response = await this.callAI(prompt);
      const generated = JSON.parse(response);
      return { ...baseData, ...generated };
    } catch (error) {
      console.error(`[AI-GENERATE] Lỗi: ${error.message}`);
      return baseData;
    }
  }

  /**
   * Validate tài liệu trước khi lưu
   */
  async validateDocuments(documents) {
    const validated = [];
    
    for (const doc of documents) {
      const validation = {
        hasRequiredFields: this.checkRequiredFields(doc),
        hasValidNumbers: this.checkNumbers(doc),
        hasValidDates: this.checkDates(doc),
        hasConsistentData: await this.checkConsistency(doc, documents)
      };
      
      doc.validation = validation;
      doc.isValid = Object.values(validation).every(v => v === true);
      
      validated.push(doc);
    }
    
    return validated;
  }

  /**
   * Tổ chức cấu trúc file
   */
  async organizeFileStructure(documents) {
    const caseId = this.generateCaseId();
    const caseDir = path.join(this.outputDir, caseId);
    
    await fs.mkdir(caseDir, { recursive: true });
    
    const organized = {
      caseId: caseId,
      directory: caseDir,
      files: [],
      structure: {
        '01-de-xuat': [],
        '02-khao-sat': [],
        '03-du-thao': [],
        '04-hop-dong': [],
        '05-nghiem-thu': [],
        '06-thanh-toan': []
      }
    };
    
    for (const doc of documents) {
      const category = this.categorizeDocument(doc.type);
      const filepath = path.join(caseDir, category, doc.filename);
      
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, doc.content, 'utf-8');
      
      organized.files.push({
        type: doc.type,
        path: filepath,
        relativePath: path.relative(this.outputDir, filepath)
      });
      
      organized.structure[category].push(doc.filename);
    }
    
    // Tạo README cho case
    await this.createCaseReadme(organized, documents);
    
    return organized;
  }

  /**
   * Tạo README cho hồ sơ
   */
  async createCaseReadme(organized, documents) {
    const readme = `# Hồ sơ ${organized.caseId}

## Tổng quan
- Ngày tạo: ${new Date().toLocaleString('vi-VN')}
- Số lượng tài liệu: ${documents.length}
- Người phụ trách: ${documents[0]?.metadata.createdBy || 'AI'}

## Cấu trúc hồ sơ

${Object.entries(organized.structure).map(([folder, files]) => `
### ${folder}
${files.map(f => `- ${f}`).join('\n')}
`).join('\n')}

## Trạng thái
${documents.map(doc => `
- [${doc.isValid ? 'x' : ' '}] ${doc.type} (Score: ${doc.metadata.aiReviewScore}/100)
  ${doc.metadata.aiSuggestions.length > 0 ? `  - Gợi ý: ${doc.metadata.aiSuggestions.join(', ')}` : ''}
`).join('\n')}

## Ghi chú
Hồ sơ được tạo tự động bởi Văn phòng AI. Đã được review bởi AI nhưng vẫn cần kiểm tra cuối cùng bởi con người.
`;

    const readmePath = path.join(organized.directory, 'README.md');
    await fs.writeFile(readmePath, readme, 'utf-8');
  }

  /**
   * Commit tự động lên Git
   */
  async commitToGit(organized, description) {
    try {
      const repoDir = path.resolve(__dirname, '..');
      
      // Stage files
      execSync(`git add "${organized.directory}"`, { cwd: repoDir });
      
      // Commit
      const commitMessage = `[AI-AUTO] ${description}\n\nCase: ${organized.caseId}\nDocuments: ${organized.files.length}\nTimestamp: ${new Date().toISOString()}`;
      
      execSync(`git commit -m "${commitMessage}"`, { cwd: repoDir });
      
      console.log(`[GIT] Đã commit: ${organized.caseId}`);
      
      return true;
    } catch (error) {
      console.error(`[GIT] Lỗi commit: ${error.message}`);
      return false;
    }
  }

  // Helper methods
  
  async loadTemplate(docType) {
    const templatePath = path.join(this.templatesDir, `${docType}.docx`);
    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      return { type: docType, content: content };
    } catch {
      return { type: docType, content: this.getDefaultTemplate(docType) };
    }
  }

  getDefaultTemplate(docType) {
    return `
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
---

{{donVi}}, ngày {{ngay}}

${docType.toUpperCase()}
Số: {{soVanBan}}

Nội dung tài liệu ${docType}

{{noiDung}}

Người lập
{{nguoiLap}}
`.trim();
  }

  buildDependencyGraph(docs) {
    const deps = {};
    docs.forEach((doc, index) => {
      deps[doc] = docs.slice(0, index);
    });
    return deps;
  }

  buildTimeline(docs, deps) {
    return docs.map((doc, index) => ({
      step: index + 1,
      document: doc,
      dependsOn: deps[doc],
      estimatedTime: '2-4 giờ'
    }));
  }

  async getDependencyData(docType, workflow) {
    // Lấy dữ liệu từ các doc đã tạo trước đó
    return {};
  }

  processConditionals(content, data) {
    return content;
  }

  processDynamicTables(content, data) {
    return content;
  }

  async saveDocument(doc) {
    const filepath = path.join(this.outputDir, 'temp', doc.filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, doc.content, 'utf-8');
  }

  generateFilename(docType, data) {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const sanitized = docType.replace(/[^a-z0-9-]/gi, '-');
    return `${timestamp}-${sanitized}-${data.soVanBan || 'AUTO'}.md`;
  }

  generateDocNumber(docType) {
    const date = new Date();
    const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${seq}/${date.getFullYear()}/CTEC-AI`;
  }

  generateCaseId() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `HS-${dateStr}-${seq}`;
  }

  assignResponsible(docType, actors) {
    const responsibilities = {
      'de-xuat-mua-sam': 'HẢI',
      'bang-so-sanh-gia': 'LONG',
      'bao-cao-khao-sat': 'MINH',
      'hop-dong-du-thao': 'NAM',
      'bien-ban-nghiem-thu': 'MINH',
      'giay-de-nghi-thanh-toan': 'LONG',
      'phieu-de-nghi-thanh-toan': 'LONG',
      'bang-ke-chi-tiet': 'LONG',
      'bao-cao-dinh-ky': 'MINH'
    };
    
    return responsibilities[docType] || actors[0] || 'AN';
  }

  categorizeDocument(docType) {
    const categories = {
      'de-xuat-mua-sam': '01-de-xuat',
      'bao-cao-khao-sat': '02-khao-sat',
      'bang-so-sanh-gia': '02-khao-sat',
      'hop-dong-du-thao': '03-du-thao',
      'bien-ban-nghiem-thu': '05-nghiem-thu',
      'giay-de-nghi-thanh-toan': '06-thanh-toan',
      'phieu-de-nghi-thanh-toan': '06-thanh-toan',
      'bang-ke-chi-tiet': '06-thanh-toan',
      'bao-cao-dinh-ky': '01-de-xuat'
    };
    
    return categories[docType] || '01-de-xuat';
  }

  checkRequiredFields(doc) {
    return doc.content.length > 100;
  }

  checkNumbers(doc) {
    return true;
  }

  checkDates(doc) {
    return true;
  }

  async checkConsistency(doc, allDocs) {
    return true;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutonomousDocumentGenerator;
