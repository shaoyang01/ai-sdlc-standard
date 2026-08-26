// Regression Test — Skill Flow Inventory (Metadata-only, 7+1 Topology)
// =======================================================================
// Verifies the machine-readable skill flow inventory is correct.
// Static metadata test. No runtime, no DB, no agents.
// C03-C update: inventory rewritten to 7+1 single-rail topology
// (Decision-044/045); speckit_pipeline/code_review_subflow/test_feedback_subflow retired.

import { loadSkillFlowInventory } from "../core/skill-flow-inventory";
import * as fs from "node:fs";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log("Skill Flow Inventory Test (7+1 Topology)\n");
  const inv = loadSkillFlowInventory("metadata/capabilities/shared/skill-flow-inventory.json");
  const defaultInv = loadSkillFlowInventory();

  function findSkill(name: string) {
    return inv.skills.find((s) => s["name"] === name);
  }

  function findFlow(id: string) {
    return inv.flows.find((f) => f["id"] === id);
  }

  // ── Test 1: Basic structure ──
  console.log("Test 1: Basic structure");
  assert(inv.version === 2, "version is 2 (C03-C 7+1 update)");
  assert(
    inv.source_report === "docs/reports/archive/capabilities/SKILL_FLOW_INVENTORY_REPORT.md",
    "source report points to archived report body"
  );
  assert(defaultInv.version === 2, "default loader loads relocated shared skill flow inventory");
  assert(
    defaultInv.global_entry_skill === inv.global_entry_skill,
    "default loader matches explicit path"
  );
  assert(inv.global_entry_skill === "sdlc-requirement-intake", "global entry is requirement-intake");
  assert(Array.isArray(inv.skills), "skills is array");
  assert(inv.skills.length === 8, `8 skills (7 nodes + docflow-writer) (got ${inv.skills.length})`);
  assert(Array.isArray(inv.flows), "flows is array");
  assert(inv.flows.length === 2, "2 active flows (main_docflow + direct_implementation_path)");
  assert(Array.isArray(inv.runtime_relationships), "runtime_relationships is array");
  assert(Array.isArray(inv.retired_flows), "retired_flows is array");
  assert(inv.retired_flows.length === 3, "3 retired flows (speckit_pipeline + code_review_subflow + test_feedback_subflow)");
  console.log("");

  // ── Test 2: Global entry correctness ──
  console.log("Test 2: Global entry correctness");
  const entry = findSkill("sdlc-requirement-intake");
  assert(entry !== undefined, "requirement-intake exists");
  assert(entry!["role"] === "global_entry", "role is global_entry");

  const codeReview = findSkill("sdlc-code-review");
  assert(codeReview !== undefined, "code-review exists");
  assert(codeReview!["role"] !== "global_entry", "code-review is NOT global_entry");
  assert(codeReview!["role"] === "flow_internal", "code-review is flow_internal");

  const docflow = findSkill("sdlc-docflow-writer");
  assert(docflow !== undefined, "docflow-writer exists");
  assert(docflow!["role"] === "utility", "docflow-writer is utility (non-node)");
  console.log("");

  // ── Test 3: Direct implementation is skillless ──
  console.log("Test 3: Direct implementation path");
  const directFlow = findFlow("direct_implementation_path");
  assert(directFlow !== undefined, "direct implementation flow exists");
  const directStages = directFlow!["stages"] as string[];
  assert(directStages.some((s) => s.includes("DIRECT_IMPLEMENTATION_AGENT_EXECUTION")),
    "direct flow includes skillless agent execution stage");
  assert(!directStages.some((s) => s.includes("speckit-implement")),
    "direct flow does NOT include sdlc-speckit-implement (retired)");
  console.log("");

  // ── Test 4: Main docflow has 4 nodes ──
  console.log("Test 4: Main docflow (4 nodes)");
  const mainFlow = findFlow("main_docflow");
  assert(mainFlow !== undefined, "main docflow exists");
  assert(mainFlow!["entrySkill"] === "sdlc-requirement-intake", "main entry is requirement-intake");
  const mainEdges = mainFlow!["edges"] as Array<Record<string, unknown>>;
  assert(mainEdges.some((e) => e["from"] === "sdlc-requirement-intake" && e["to"] === "sdlc-solution-design"),
    "intake → design edge exists");
  assert(mainEdges.some((e) => e["from"] === "sdlc-solution-design" && e["to"] === "sdlc-solution-gate"),
    "design → gate edge exists");
  assert(mainEdges.some((e) => e["from"] === "sdlc-solution-gate" && e["to"] === "sdlc-task-planning"),
    "gate → task-planning edge exists");
  console.log("");

  // ── Test 5: Retired flows ──
  console.log("Test 5: Retired flows (Decision-044 single-rail)");
  const retiredSpeckit = inv.retired_flows.find((f) => f["id"] === "speckit_pipeline");
  assert(retiredSpeckit !== undefined, "speckit_pipeline is retired");
  assert(retiredSpeckit!["retired_by"] === "Decision-044 (single-track)", "speckit retired by Decision-044");
  const retiredCR = inv.retired_flows.find((f) => f["id"] === "code_review_subflow");
  assert(retiredCR !== undefined, "code_review_subflow is retired");
  assert(retiredCR!["absorbed_into"] === "sdlc-code-review (direct_implementation_path)", "code_review absorbed into code-review");
  const retiredTF = inv.retired_flows.find((f) => f["id"] === "test_feedback_subflow");
  assert(retiredTF !== undefined, "test_feedback_subflow is retired");
  // Active flows do NOT include retired IDs
  assert(!inv.flows.some((f) => f["id"] === "speckit_pipeline"), "speckit_pipeline NOT in active flows");
  assert(!inv.flows.some((f) => f["id"] === "code_review_subflow"), "code_review_subflow NOT in active flows");
  assert(!inv.flows.some((f) => f["id"] === "test_feedback_subflow"), "test_feedback_subflow NOT in active flows");
  console.log("");

  // ── Test 6: All skills are runtimeInvoked: false ──
  console.log("Test 6: No skills are runtime-invoked");
  for (const skill of inv.skills) {
    assert(skill["runtimeInvoked"] === false, `${skill["name"]}: runtimeInvoked is false`);
  }
  console.log("");

  // ── Test 7: No legacy skill IDs in active inventory ──
  console.log("Test 7: No legacy skill IDs in active inventory (C03-C cutover)");
  const legacyIds = [
    "sdlc-requirement-normalizer", "sdlc-specification-writer", "sdlc-solution-reviewer",
    "sdlc-solution-challenger", "sdlc-implementation-recorder", "sdlc-code-review-excellence",
    "sdlc-code-review-normalizer", "sdlc-test-feedback-classifier", "sdlc-test-feedback-sync",
    "sdlc-gate-runner", "sdlc-speckit-pipeline", "sdlc-speckit-specify", "sdlc-speckit-clarify",
    "sdlc-speckit-plan", "sdlc-speckit-tasks", "sdlc-speckit-analyze", "sdlc-speckit-implement",
    "sdlc-speckit-sync", "sdlc-speckit-code-doc-reconcile", "sdlc-speckit-checklist",
  ];
  for (const legacy of legacyIds) {
    assert(!inv.skills.some((s) => s["name"] === legacy), `${legacy} NOT in active skills`);
  }
  console.log("");

  // ── Test 8: Summary ──
  console.log("Test 8: Summary");
  const summary = inv.summary;
  assert(summary["active_skill_count"] === 8, "active_skill_count is 8");
  assert(summary["flow_node_count"] === 7, "flow_node_count is 7");
  assert(summary["cross_cutting_utility_count"] === 1, "cross_cutting_utility_count is 1");
  assert(summary["active_flow_count"] === 2, "active_flow_count is 2");
  assert(summary["retired_flow_count"] === 3, "retired_flow_count is 3");
  assert(String(summary["topology"]).includes("7+1"), "topology mentions 7+1");
  console.log("");

  // ── Test 9: Archived report body and root compatibility note ──
  console.log("Test 9: archived SKILL_FLOW_INVENTORY_REPORT.md body and root note");
  const archivedReport = fs.readFileSync(
    "docs/reports/archive/capabilities/SKILL_FLOW_INVENTORY_REPORT.md",
    "utf-8"
  );
  assert(
    archivedReport.includes("# SDLC Skill Flow Inventory Report"),
    "archived SKILL_FLOW_INVENTORY_REPORT.md body is preserved"
  );
  const rootNote = fs.readFileSync("SKILL_FLOW_INVENTORY_REPORT.md", "utf-8");
  assert(rootNote.includes("# Archived Historical Report"), "root note is an archived historical report note");
  assert(rootNote.includes("non-authoritative"), "root note is non-authoritative");
  assert(
    rootNote.includes("docs/reports/archive/capabilities/SKILL_FLOW_INVENTORY_REPORT.md"),
    "root note links to archived body"
  );
  assert(rootNote.includes("temporary compatibility reference"), "root note is a temporary compatibility reference");
  assert(rootNote.includes("at least 30 days"), "root note declares minimum 30-day retention");
  assert(rootNote.includes("separate governance decision"), "root note removal requires a separate governance decision");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
