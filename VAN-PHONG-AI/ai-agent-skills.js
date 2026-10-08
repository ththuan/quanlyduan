'use strict';

// Runtime registry distilled from alirezarezvani/claude-skills.
// The upstream repository remains a reference corpus; only bounded contracts
// are loaded into the office agent so unrelated skills cannot run implicitly.
const SKILL_REGISTRY = [
  {
    id: 'case-workflow', name: 'Điều phối quy trình hồ sơ', source: 'engineering/skills/agent-workflow-designer',
    triggers: ['hồ sơ', 'quy trình', 'bước tiếp theo', 'phê duyệt', 'xác nhận', 'biểu mẫu'],
    can: ['read_case', 'analyze_request', 'propose_next_step', 'write_draft'],
    cannot: ['sign', 'approve', 'accept_goods', 'pay', 'change_external_state'],
    output: ['normalized_request', 'missing', 'next_step', 'handoff', 'validation'],
    policy: 'Sequential workflow with bounded handoffs, timeout and output validation.'
  },
  {
    id: 'knowledge-retrieval', name: 'Tra cứu và kiểm soát tri thức', source: 'engineering/skills/rag-architect + business-operations/skills/knowledge-ops',
    triggers: ['tra cứu', 'tài liệu', 'căn cứ', 'quy định', 'mẫu', 'tủ tri thức', 'sop', 'runbook'],
    can: ['search_knowledge', 'cite_sources', 'report_retrieval_quality', 'draft_sop'],
    cannot: ['invent_source', 'delete_knowledge', 'treat_orphan_as_delete'],
    output: ['answer', 'sources', 'retrieval', 'missing_sources', 'freshness_warning'],
    policy: 'Corpus-driven retrieval; cite only returned sources; surface weak or stale evidence.'
  },
  {
    id: 'procurement-review', name: 'Rà soát mua sắm và nhà cung cấp', source: 'business-operations/skills/procurement-optimizer',
    triggers: ['mua sắm', 'nhà cung cấp', 'báo giá', 'chi tiêu', 'ngân sách', 'hợp đồng', 'thiết bị'],
    can: ['categorize_spend', 'compare_quotes', 'surface_bottlenecks', 'propose_options'],
    cannot: ['select_supplier_finally', 'consolidate_tier1_without_contingency', 'approve_spend', 'pay'],
    output: ['comparison', 'risk_flags', 'options', 'required_confirmations'],
    policy: 'Recommendation only; switching cost, concentration risk and break-glass plan are mandatory.'
  },
  {
    id: 'decision-record', name: 'Ghi nhận quyết định có hậu quả', source: 'ra-qm-team/skills/agent-decision-receipts',
    triggers: ['quyết định', 'xuất hồ sơ', 'xóa', 'giao quyền', 'thanh toán', 'phê duyệt'],
    can: ['build_decision_manifest', 'record_policy', 'prepare_receipt'],
    cannot: ['execute_payment', 'sign_as_human', 'grant_access_without_confirmation'],
    output: ['decision_manifest', 'receipt_required', 'confirmation_gate'],
    policy: 'Mint a tamper-evident receipt only for consequential side effects, never as a substitute for approval.'
  },
  {
    id: 'prompt-quality', name: 'Kiểm soát chất lượng prompt và kết quả', source: 'engineering/prompt-governance + engineering/skills/self-eval',
    triggers: ['đánh giá ai', 'kiểm thử', 'chất lượng', 'prompt', 'sai', 'không chắc'],
    can: ['validate_schema', 'compare_expected_output', 'report_confidence', 'propose_prompt_revision'],
    cannot: ['hide_failures', 'claim_success_without_evidence', 'self_promote_prompt'],
    output: ['quality_report', 'failures', 'confidence', 'rollback_recommendation'],
    policy: 'Prompts are versioned infrastructure; regressions and uncertainty must be visible.'
  }
];

const DEFAULT_SKILL_ID = 'case-workflow';

function normalizeSkillText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function listSkills() {
  return SKILL_REGISTRY.map((skill) => ({
    id: skill.id, name: skill.name, source: skill.source, triggers: skill.triggers,
    can: skill.can, cannot: skill.cannot, output: skill.output, policy: skill.policy
  }));
}

function getSkill(id) {
  return SKILL_REGISTRY.find((skill) => skill.id === id) || null;
}

function selectSkill(input, requestedId) {
  const requested = requestedId && getSkill(requestedId);
  if (requested) return requested;
  const text = normalizeSkillText(input);
  let best = null;
  let bestScore = 0;
  for (const skill of SKILL_REGISTRY) {
    const score = skill.triggers.reduce((sum, trigger) => sum + (text.includes(normalizeSkillText(trigger)) ? 1 : 0), 0);
    if (score > bestScore) { best = skill; bestScore = score; }
  }
  return best || getSkill(DEFAULT_SKILL_ID);
}

function skillInstructions(skill, mode) {
  const selected = skill || getSkill(DEFAULT_SKILL_ID);
  return [
    `Bạn đang chạy skill "${selected.id}" (${selected.name}).`,
    `Nguồn phương pháp: ${selected.source}.`,
    `Mục tiêu đầu ra: ${selected.output.join(', ')}.`,
    `Quyền được phép: ${selected.can.join(', ')}.`,
    `Quyền bị cấm: ${selected.cannot.join(', ')}.`,
    `Chính sách skill: ${selected.policy}`,
    mode === 'analyze' ? 'Nếu thiếu dữ liệu hoặc bằng chứng, ghi rõ missing/assumptions và đặt câu hỏi tiếp theo; không tự suy đoán.' : 'Phản hồi phải nêu việc đã kiểm tra, phần chưa chắc chắn và bước tiếp theo có thể thực hiện.',
    'Chỉ thực hiện hành động ngoài hệ thống khi người dùng đã xác nhận rõ và workflow cho phép.'
  ].join(' ');
}

module.exports = { listSkills, getSkill, selectSkill, skillInstructions };
