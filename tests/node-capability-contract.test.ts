// Node Capability Contract — Tests (C01 WP-2)
// ============================================
// Guards for ai-sdlc/node-capability-contract.md §4 and its machine
// projection core/node-capability-contracts.ts:
// 1. consistency: projection is field-for-field identical to the document
//    (EXPECTED_CONTRACTS below mirrors §4; update both together);
// 2. deprecation: AgentMapEntry carries @deprecated directly attached;
// 3. agent neutrality: no agent name in ANY contract field, including
//    the capability id.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { NODE_CAPABILITY_IDS } from "../loop/types";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";
import type { NodeCapabilityContract } from "../loop/types";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const AGENT_NAMES = ["kimi", "codex", "hermes", "claude", "gpt"];

console.log("node capability: canonical list");
assert(NODE_CAPABILITY_IDS.length === 7, "exactly seven capability ids");
assert(new Set(NODE_CAPABILITY_IDS).size === 7, "capability ids are unique");
for (const id of NODE_CAPABILITY_IDS) {
  assert(/^[a-z]+(-[a-z]+)*$/.test(id), `id ${id} matches lowercase-dash format`);
}

// ── document §4 consistency guard ──
// EXPECTED_CONTRACTS mirrors ai-sdlc/node-capability-contract.md §4
// field-for-field (single source of truth for WP-3 is the projection; the
// document is the human view). When the document changes, update this table
// AND the projection together — the deep-equal assertion below fails on any
// unilateral drift.
const EXPECTED_CONTRACTS: readonly NodeCapabilityContract[] = [
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
    prohibited: ["仅凭再次执行推断问题关闭", "跳过审核直接放行"],
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
];

console.log("node capability: document §4 ↔ projection consistency");
assert(NODE_CAPABILITY_CONTRACTS.length === EXPECTED_CONTRACTS.length, "projection count matches document §4");
assert(
  JSON.stringify(NODE_CAPABILITY_CONTRACTS) === JSON.stringify(EXPECTED_CONTRACTS),
  "projection is field-for-field identical to document §4 (no weakened constraints)",
);

const contractIds = new Set(NODE_CAPABILITY_CONTRACTS.map((c) => c.capability));
assert(
  NODE_CAPABILITY_IDS.every((id) => contractIds.has(id)) &&
    contractIds.size === NODE_CAPABILITY_IDS.length,
  "contract instances cover the canonical list exactly",
);

console.log("node capability: projection completeness (non-empty fields)");
for (const contract of NODE_CAPABILITY_CONTRACTS) {
  const label = `contract ${contract.capability}`;
  assert(contract.title.trim().length > 0, `${label}: title non-empty`);
  assert(contract.inputArtifacts.length > 0, `${label}: inputArtifacts non-empty`);
  assert(contract.outputArtifact.trim().length > 0, `${label}: outputArtifact non-empty`);
  assert(contract.gate.trim().length > 0, `${label}: gate non-empty`);
  assert(contract.sideEffectBoundary.trim().length > 0, `${label}: sideEffectBoundary non-empty`);
  assert(contract.prohibited.length > 0, `${label}: prohibited non-empty`);
}

console.log("node capability: agent neutrality (all fields incl. capability)");
for (const contract of NODE_CAPABILITY_CONTRACTS) {
  const fields = [
    contract.capability,
    contract.title,
    contract.outputArtifact,
    contract.gate,
    contract.sideEffectBoundary,
    ...contract.inputArtifacts,
    ...contract.prohibited,
  ];
  const haystack = fields.join(" ").toLowerCase();
  for (const agentName of AGENT_NAMES) {
    assert(
      !haystack.includes(agentName),
      `contract ${contract.capability}: no agent name '${agentName}' in any field`,
    );
  }
}

console.log("node capability: AgentMapEntry @deprecated directly attached");
{
  const typesPath = resolve(process.cwd(), "loop/types/index.ts");
  const sourceText = readFileSync(typesPath, "utf8");
  const sourceFile = ts.createSourceFile("index.ts", sourceText, ts.ScriptTarget.Latest, true);

  let agentMapEntry: ts.InterfaceDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "AgentMapEntry") {
      agentMapEntry = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert(agentMapEntry !== undefined, "AgentMapEntry declaration exists");
  if (agentMapEntry !== undefined) {
    // jsDoc is populated by createSourceFile with setParentNodes=true but is
    // not declared on InterfaceDeclaration's public type; read it via the
    // JSDocContainer shape.
    const jsDocs = (agentMapEntry as unknown as { jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? [];
    assert(jsDocs.length === 1, "AgentMapEntry has exactly one attached jsdoc block");
    const tags = jsDocs[0].tags ?? [];
    assert(
      tags.some((tag) => tag.tagName.text === "deprecated"),
      "AgentMapEntry carries @deprecated tag",
    );
    // The jsdoc must be directly attached to the declaration: only
    // whitespace may sit between the jsdoc end and the declaration start.
    const between = sourceText.slice(jsDocs[0].end, agentMapEntry.pos);
    assert(between.trim().length === 0, "jsdoc directly attached (no comment in between)");
  }
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
