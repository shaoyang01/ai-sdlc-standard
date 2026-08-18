// Node Capability Contract — Tests (C01 WP-2)
// ============================================
// The document ai-sdlc/node-capability-contract.md §4 is the single source
// of truth. This test PARSES the document directly and deep-compares it with
// the machine projection core/node-capability-contracts.ts — no third copy.
// Any unilateral drift on either side fails. Additional guards: canonical
// list shape, field completeness, agent neutrality (all fields including the
// capability id), and AgentMapEntry @deprecated attachment.

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
  const contract: Record<string, unknown> = {
    capability: "",
    title: "",
    inputArtifacts: [],
    outputArtifact: "",
    gate: "",
    sideEffectBoundary: "",
    prohibited: [],
  };
  let currentArrayKey: "inputArtifacts" | "prohibited" | null = null;
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
    const key = field[1] as keyof NodeCapabilityContract;
    const value = field[2].trim();
    if (key === "inputArtifacts" || key === "prohibited") {
      currentArrayKey = key;
      contract[key] = [];
    } else {
      currentArrayKey = null;
      contract[key] = stripBackticks(value);
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
