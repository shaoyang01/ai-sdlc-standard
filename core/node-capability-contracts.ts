// Node Capability Contracts — machine projection (v2 single-rail, C02-WP3.5)
// ==========================================================================
// Machine projection of the single source of truth
// ai-sdlc/node-capability-contract.md §4 (the document is authoritative).
// The guard test PARSES the document directly and deep-compares this
// projection field-by-field; any unilateral drift on either side fails.
// No agent name may appear in any contract field.
//
// v2 (Decision-044/045): seven-node single-rail chain. solution-gate carries
// the adversarial_scan and formal_verdict execution roles; all other nodes
// are fixed to the primary role.

import type { NodeCapabilityContract } from "../loop/types";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as Readonly<T>;
}

export const NODE_CAPABILITY_CONTRACTS: readonly NodeCapabilityContract[] = deepFreeze([
  {
    capability: "requirement-intake",
    title: "需求归一化与反馈分类",
    executionRoles: ["primary"],
    inputArtifacts: ["需求来源（对话/飞书/HTML/Markdown/PDF/截图/测试反馈）"],
    outputArtifact: "library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md",
    gate: "入口义务完成（Entry Contract §3）；业务目标可识别；change record 已建立（新需求/补充/变更/返工/反馈）",
    sideEffectBoundary: "创建/恢复运行记录（run journal）；写入 00-需求资料",
    prohibited: ["生成技术方案", "裁决设计深度", "修改生产代码、specs/**、.specify/**"],
  },
  {
    capability: "solution-design",
    title: "技术方案设计与深化",
    executionRoles: ["primary"],
    inputArtifacts: ["00-需求资料/{requirement_id}_需求摘要.md（当前版本）"],
    outputArtifact: "library/{requirement_id}/01-技术方案/{requirement_id}_技术方案.md",
    gate: "需求摘要有效（当前版本）；无首轮深度前置——深度档位由 solution-gate 首次裁决，升档返工时按当前深度裁决重新设计",
    sideEffectBoundary: "写入 01-技术方案",
    prohibited: ["绕过需求摘要", "补造未定义业务规则", "修改生产代码", "恢复独立 Speckit 产物轨道"],
  },
  {
    capability: "solution-gate",
    title: "方案门禁（对抗扫描与正式裁决）",
    executionRoles: ["adversarial_scan", "formal_verdict"],
    inputArtifacts: [
      "01-技术方案/{requirement_id}_技术方案.md（当前版本）",
      "对抗扫描 Finding Ledger（formal_verdict 消费）",
    ],
    outputArtifact: "library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md（含 verdict 与设计深度裁决）",
    gate: "Specification Completeness Audit（sdlc-solution-gate）；无未解决 Blocking finding；扫描与裁决由不同 Agent binding 执行",
    sideEffectBoundary: "输出 Gate Result（PASS / FAIL / PASS_WITH_RISK）与设计深度裁决（depth + decision_status）",
    prohibited: [
      "同一 Agent 执行扫描与裁决",
      "仅凭再次执行 Agent 推定 finding 关闭",
      "无深度裁决时放行进入实现",
      "代写技术方案",
    ],
  },
  {
    capability: "task-planning",
    title: "任务规划与实现前一致性审计",
    executionRoles: ["primary"],
    inputArtifacts: ["01-技术方案（当前版本）", "02-方案审核（Gate 与深度裁决）"],
    outputArtifact: "library/{requirement_id}/03-任务规划/{requirement_id}_任务计划.md",
    gate: "方案审核通过；深度裁决为 DECIDED",
    sideEffectBoundary: "写入 03-任务规划；实现前一致性审计",
    prohibited: ["改变已批准方案行为", "跳过方案缺口直接拆任务", "把 analyze/checklist 恢复为独立产物轨道"],
  },
  {
    capability: "implementation",
    title: "实现与证据记录",
    executionRoles: ["primary"],
    inputArtifacts: ["01-技术方案（已审核通过）", "02-方案审核（Gate 与深度裁决）", "03-任务规划（任务边界）"],
    outputArtifact: "工作区改动 + 实现记录（library/{requirement_id}/04-实现记录/）",
    gate: "方案审核通过；深度裁决为 DECIDED；任务边界确定",
    sideEffectBoundary: "受已批准方案约束的代码改动；本地验证；记录证据（引用 diff/测试输出/journal 事件）",
    prohibited: ["超出已批准行为", "commit/push/PR/merge/发布", "补未定义业务规则", "以自述代替证据"],
  },
  {
    capability: "code-review",
    title: "代码审核与收敛复审",
    executionRoles: ["primary"],
    inputArtifacts: ["实现产物/diff", "01-技术方案", "03-任务规划", "02-方案审核"],
    outputArtifact: "library/{requirement_id}/05-代码审核/{requirement_id}_代码审核.md（含 Finding Ledger 与 closure review）",
    gate: "实现记录存在且证据可核验；审核范围（changed files → canonical files）确定",
    sideEffectBoundary: "输出可定位、可修复的 findings（severity + 位置/证据）；closure review 只审关闭",
    prohibited: ["输出泛泛不可执行建议", "把方案缺口只当作代码问题（应回流 solution-design）", "自审自批"],
  },
  {
    capability: "knowledge-sync",
    title: "知识同步与对账",
    executionRoles: ["primary"],
    inputArtifacts: ["七节点 current revisions", "已关闭/已接受 finding proof", "代码/测试 evidence", "目标知识现状"],
    outputArtifact: "library/{requirement_id}/06-知识同步/{requirement_id}_知识同步结果.md",
    gate: "当前 generation 七节点 current revisions 有效；无未关闭 blocking finding",
    sideEffectBoundary: "写入 06-知识同步；本地写授权下更新目标知识",
    prohibited: [
      "以 specs/**、pipeline run、sync source mode 或历史聊天为并列 authority",
      "未经 requirement-intake 直接消费原始测试/线上反馈",
      "自行选择稳定事实或标记同步完成",
    ],
  },
] as const) as readonly NodeCapabilityContract[];
