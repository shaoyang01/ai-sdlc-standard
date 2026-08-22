// Node Capability Contract — Tests (C01 WP-2, rebaselined by C02-WP3.5-C)
// =======================================================================
// The document ai-sdlc/node-capability-contract.md §4 is the single source
// of truth. This test PARSES the document directly and deep-compares it with
// the machine projection core/node-capability-contracts.ts — no third copy.
// Any unilateral drift on either side fails. Additional guards: canonical
// list shape, field completeness, and agent neutrality (all fields including
// the capability id). The AgentMapEntry @deprecated attachment guard retired
// with the legacy type in WP3.5-C.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const CONTRACT_FIELDS = [
  "capability",
  "title",
  "executionRoles",
  "inputArtifacts",
  "outputArtifact",
  "gate",
  "sideEffectBoundary",
  "prohibited",
] as const;
const ARRAY_FIELDS = new Set(["executionRoles", "inputArtifacts", "prohibited"]);

function stripBackticks(value: string): string {
  return value.replace(/`/g, "");
}

// ── document §4 parser ──
// Parses each ```text block under "### 4.x" headings. Scalar fields are
// "key: value" single lines; array fields (inputArtifacts / prohibited) are
// "key:" followed by "  - item" lines. Markdown backticks are display marks
// and are stripped before comparison.
function parseDocumentContracts(mdPath: string): NodeCapabilityContract[] {
  const text = readFileSync(mdPath, "utf8");
  const blocks = [...text.matchAll(/### 4\.\d+[^\n]*\n\n```text\n([\s\S]*?)```/g)];
  if (blocks.length !== 7) {
    throw new Error(`expected 7 capability blocks in ${mdPath}, got ${blocks.length}`);
  }
  return blocks.map((match) => parseBlock(match[1]));
}

function parseBlock(block: string): NodeCapabilityContract {
  const contract: Record<string, unknown> = {};
  const seen = new Set<string>();
  let currentArrayKey: "executionRoles" | "inputArtifacts" | "prohibited" | null = null;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) continue;
    if (/^  - /.test(line)) {
      if (currentArrayKey === null) {
        throw new Error(`array item outside array field: ${line}`);
      }
      (contract[currentArrayKey] as string[]).push(stripBackticks(line.replace(/^  - /, "").trim()));
      continue;
    }
    const field = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (field === null) {
      throw new Error(`unparseable contract line: ${line}`);
    }
    const key = field[1];
    // Fail-closed: only the canonical fields, each exactly once.
    if (!CONTRACT_FIELDS.includes(key as (typeof CONTRACT_FIELDS)[number])) {
      throw new Error(`unknown contract field: ${key}`);
    }
    if (seen.has(key)) {
      throw new Error(`duplicate contract field: ${key}`);
    }
    seen.add(key);
    const value = field[2].trim();
    if (ARRAY_FIELDS.has(key)) {
      currentArrayKey = key as "executionRoles" | "inputArtifacts" | "prohibited";
      contract[key] = [];
    } else {
      currentArrayKey = null;
      contract[key] = stripBackticks(value);
    }
  }
  // Fail-closed: every canonical field must be present exactly once.
  for (const field of CONTRACT_FIELDS) {
    if (!seen.has(field)) {
      throw new Error(`missing contract field: ${field}`);
    }
  }
  return contract as unknown as NodeCapabilityContract;
}

console.log("node capability: canonical list");
assert(NODE_CAPABILITY_IDS.length === 7, "exactly seven capability ids");
assert(new Set(NODE_CAPABILITY_IDS).size === 7, "capability ids are unique");
for (const id of NODE_CAPABILITY_IDS) {
  assert(/^[a-z]+(-[a-z]+)*$/.test(id), `id ${id} matches lowercase-dash format`);
}

console.log("node capability: execution role shape");
{
  const byCapability = new Map(NODE_CAPABILITY_CONTRACTS.map((c) => [c.capability, c.executionRoles]));
  assert(
    JSON.stringify(byCapability.get("solution-gate")) === JSON.stringify(["adversarial_scan", "formal_verdict"]),
    "solution-gate carries exactly [adversarial_scan, formal_verdict]",
  );
  for (const id of NODE_CAPABILITY_IDS) {
    if (id === "solution-gate") continue;
    assert(
      JSON.stringify(byCapability.get(id)) === JSON.stringify(["primary"]),
      `${id} carries exactly [primary]`,
    );
  }
}

console.log("node capability: document §4 ↔ projection deep comparison");
{
  const docPath = resolve(process.cwd(), "ai-sdlc/node-capability-contract.md");
  const parsed = parseDocumentContracts(docPath);
  assert(parsed.length === NODE_CAPABILITY_CONTRACTS.length, "document §4 block count matches projection");

  for (let i = 0; i < parsed.length; i++) {
    const doc = parsed[i];
    const proj = NODE_CAPABILITY_CONTRACTS[i];
    const label = `contract ${proj.capability}`;
    assert(proj.capability === doc.capability, `${label}: capability matches document`);
    assert(proj.title === doc.title, `${label}: title matches document`);
    assert(
      JSON.stringify(proj.executionRoles) === JSON.stringify(doc.executionRoles),
      `${label}: executionRoles matches document`,
    );
    assert(
      JSON.stringify(proj.inputArtifacts) === JSON.stringify(doc.inputArtifacts),
      `${label}: inputArtifacts matches document`,
    );
    assert(proj.outputArtifact === doc.outputArtifact, `${label}: outputArtifact matches document`);
    assert(proj.gate === doc.gate, `${label}: gate matches document`);
    assert(proj.sideEffectBoundary === doc.sideEffectBoundary, `${label}: sideEffectBoundary matches document`);
    assert(
      JSON.stringify(proj.prohibited) === JSON.stringify(doc.prohibited),
      `${label}: prohibited matches document`,
    );
  }
}

console.log("node capability: parser is fail-closed");
{
  const fullBlock = [
    "capability:          requirement-intake",
    "title:               需求归一化与反馈分类",
    "executionRoles:",
    "  - primary",
    "inputArtifacts:",
    "  - 需求来源（对话/飞书/HTML/Markdown/PDF/截图/测试反馈）",
    "outputArtifact:      library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md",
    "gate:                入口义务完成（Entry Contract §3）；业务目标可识别；change record 已建立（新需求/补充/变更/返工/反馈）",
    "sideEffectBoundary:  创建/恢复运行记录（run journal）；写入 00-需求资料",
    "prohibited:",
    "  - 生成技术方案",
    "  - 裁决设计深度",
    "  - 修改生产代码、specs/**、.specify/**",
  ].join("\n");

  function expectParseFail(block: string, label: string): void {
    try {
      parseBlock(block);
      assert(false, `${label} (no error thrown)`);
    } catch {
      assert(true, label);
    }
  }

  // Unknown field (e.g. an agent binding sneaking into the contract) must
  // fail instead of being silently ignored.
  expectParseFail(
    fullBlock.replace("sideEffectBoundary:  创建/恢复运行记录（run journal）；写入 00-需求资料", "sideEffectBoundary:  创建/恢复运行记录（run journal）；写入 00-需求资料\nagent:               codex"),
    "unknown field rejected",
  );
  // Duplicate field must fail.
  expectParseFail(
    fullBlock.replace("gate:                入口义务完成（Entry Contract §3）；业务目标可识别", "gate:                入口义务完成（Entry Contract §3）；业务目标可识别\ngate:                重复"),
    "duplicate field rejected",
  );
  // Missing canonical field must fail at end-of-block field-set check.
  expectParseFail(
    fullBlock.replace("outputArtifact:      library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md\n", ""),
    "missing field rejected",
  );
  // Array item outside an array field must fail.
  expectParseFail(
    fullBlock.replace("gate:                入口义务完成（Entry Contract §3）；业务目标可识别", "gate:                入口义务完成（Entry Contract §3）；业务目标可识别\n  - 游离数组项"),
    "array item outside array field rejected",
  );
}

console.log("node capability: projection completeness (non-empty fields)");
for (const contract of NODE_CAPABILITY_CONTRACTS) {
  const label = `contract ${contract.capability}`;
  assert(contract.title.trim().length > 0, `${label}: title non-empty`);
  assert(contract.executionRoles.length > 0, `${label}: executionRoles non-empty`);
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
    ...contract.executionRoles,
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

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
