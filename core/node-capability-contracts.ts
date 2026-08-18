// Node Capability Contracts — machine-verifiable instance data (C01 WP-2)
// =======================================================================
// SINGLE SOURCE OF TRUTH for WP-3 consumption: this file carries the full
// per-node contracts, field-for-field identical to
// ai-sdlc/node-capability-contract.md §4. The document is the human view;
// this file is the normative machine projection. A consistency guard test
// (EXPECTED_CONTRACTS in tests/node-capability-contract.test.ts) fails when
// either side drifts. No agent name may appear in any contract field.

import type { NodeCapabilityContract } from "../loop/types";

export const NODE_CAPABILITY_CONTRACTS: readonly NodeCapabilityContract[] = [
  {
    capability: "requirement-intake",
    title: "需求归一化",
    inputArtifacts: ["需求来源（对话/飞书/HTML/Markdown/PDF/截图）"],
    outputArtifact: "library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md",
    gate: "入口义务完成（Entry Contract §3）；业务目标可识别",
    sideEffectBoundary: "创建/恢复运行记录（run journal）；写入 00-需求资料",
    prohibited: ["生成技术方案", "决定开发路径", "修改生产代码、specs/**、.specify/**"],
  },
  {
    capability: "tech-design",
    title: "技术方案生成",
    inputArtifacts: ["00-需求资料/{requirement_id}_需求摘要.md"],
    outputArtifact: "library/{requirement_id}/01-技术方案/{requirement_id}_技术方案.md",
    gate: "需求摘要有效；Specification Audit 前置要求满足",
    sideEffectBoundary: "写入 01-技术方案",
    prohibited: ["绕过需求摘要", "补造未定义业务规则", "修改生产代码"],
  },
  {
    capability: "solution-challenge",
    title: "方案挑战",
    inputArtifacts: ["01-技术方案/{requirement_id}_技术方案.md（当前版本）"],
    outputArtifact: "方案挑战产物（findings：已解决/未解决，引用方案版本）",
    gate: "技术方案存在且为有效版本",
    sideEffectBoundary: "记录 findings；发现有效问题时回流最早受影响节点",
    prohibited: ["仅凭“再次执行了 Agent”推定问题关闭", "跳过审核直接放行"],
  },
  {
    capability: "solution-review",
    title: "方案审核",
    inputArtifacts: ["01-技术方案（当前版本）", "方案挑战 findings"],
    outputArtifact: "library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.html|md",
    gate: "Specification Completeness Audit（sdlc-solution-reviewer）；无未解决 Blocking finding",
    sideEffectBoundary: "输出 Gate Result（PASS / FAIL / PASS_WITH_RISK）与开发路径建议",
    prohibited: ["代写技术方案", "无开发路径建议时放行进入实现"],
  },
  {
    capability: "implementation",
    title: "实现",
    inputArtifacts: ["01-技术方案（已审核通过）", "02-方案审核/开发路径决定", "任务边界"],
    outputArtifact: "工作区改动 + 实现记录（library/{requirement_id}/03-实现记录/）",
    gate: "方案审核通过；路径决定为 DIRECT_IMPLEMENTATION 或 Speckit 任务准入",
    sideEffectBoundary: "受已批准方案约束的代码改动；本地验证",
    prohibited: ["超出已批准行为", "commit/push/PR/merge/发布", "补未定义业务规则"],
  },
  {
    capability: "code-review",
    title: "代码审核",
    inputArtifacts: ["实现产物/diff", "01-技术方案", "任务边界"],
    outputArtifact: "library/{requirement_id}/04-代码审核/{requirement_id}_代码审核.md",
    gate: "实现记录存在；审核范围（changed files → canonical files）确定",
    sideEffectBoundary: "输出可定位、可修复的 findings（severity + 位置/证据）",
    prohibited: ["输出泛泛不可执行建议", "把方案缺口只当作代码问题（应回流技术方案）"],
  },
  {
    capability: "test-validation",
    title: "测试验收",
    inputArtifacts: ["实现产物", "测试结果", "01-技术方案", "04-代码审核"],
    outputArtifact: "library/{requirement_id}/05-测试验收/{requirement_id}_测试验收.html|md",
    gate: "代码审核通过；测试证据可复现",
    sideEffectBoundary: "执行验证；记录未执行项、残余风险、恢复说明",
    prohibited: ["以未验证测试或历史 CI 替代本次验收", "伪造通过"],
  },
] as const;
