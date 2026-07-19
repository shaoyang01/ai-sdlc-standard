// Regression Test — Skill Flow Inventory (Metadata-only)
// =======================================================
// Verifies the machine-readable skill flow inventory is correct.
// Static metadata test. No runtime, no DB, no agents.

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

  console.log("Skill Flow Inventory Test\n");
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
  assert(inv.version === 1, "version is 1");
  assert(
    inv.source_report === "docs/reports/archive/capabilities/SKILL_FLOW_INVENTORY_REPORT.md",
    "source report points to archived report body"
  );
  assert(defaultInv.version === 1, "default loader loads relocated shared skill flow inventory");
  assert(
    defaultInv.global_entry_skill === inv.global_entry_skill,
    "default loader matches explicit path"
  );
  assert(inv.global_entry_skill === "sdlc-requirement-normalizer", "global entry is requirement-normalizer");
  assert(Array.isArray(inv.skills), "skills is array");
  assert(inv.skills.length === 21, `21 skills (got ${inv.skills.length})`);
  assert(Array.isArray(inv.flows), "flows is array");
  assert(Array.isArray(inv.runtime_relationships), "runtime_relationships is array");
  console.log("");

  // ── Test 2: Global entry correctness ──
  console.log("Test 2: Global entry correctness");
  const entry = findSkill("sdlc-requirement-normalizer");
  assert(entry !== undefined, "requirement-normalizer exists");
  assert(entry!["role"] === "global_entry", "role is global_entry");

  const crn = findSkill("sdlc-code-review-normalizer");
  assert(crn !== undefined, "code-review-normalizer exists");
  assert(crn!["role"] !== "global_entry", "code-review-normalizer is NOT global_entry");
  assert(crn!["role"] === "subflow_normalizer", "code-review-normalizer is subflow_normalizer");
  console.log("");

  // ── Test 3: Direct implementation is skillless ──
  console.log("Test 3: Direct implementation is skillless");
  const directFlow = findFlow("direct_implementation_path");
  assert(directFlow !== undefined, "direct implementation flow exists");
  const directStages = directFlow!["stages"] as string[];
  assert(directStages.some((s) => s.includes("DIRECT_IMPLEMENTATION_AGENT_EXECUTION")),
    "direct flow includes skillless agent execution stage");
  assert(!directStages.some((s) => s.includes("speckit-implement")),
    "direct flow does NOT include sdlc-speckit-implement");
  console.log("");

  // ── Test 4: Speckit implementation is internal stage ──
  console.log("Test 4: Speckit implementation correctness");
  const speckitFlow = findFlow("speckit_pipeline");
  assert(speckitFlow !== undefined, "speckit pipeline flow exists");
  const speckitStages = speckitFlow!["stages"] as string[];
  assert(speckitStages.includes("Implement"), "speckit flow includes Implement stage");
  const speckitEdges = speckitFlow!["edges"] as Array<Record<string, unknown>>;
  const implEdge = speckitEdges.find((e) => e["from"] === "sdlc-speckit-implement");
  assert(implEdge !== undefined, "speckit-implement is an internal edge source");
  assert(implEdge!["to"] === "sdlc-speckit-sync", "speckit-implement → speckit-sync");

  // Verify speckit stage order: analyze → implement → sync
  const siIndex = speckitStages.indexOf("Implement");
  const analyzeIndex = speckitStages.indexOf("Analyze");
  const syncIndex = speckitStages.indexOf("Sync");
  assert(analyzeIndex < siIndex, "Analyze before Implement");
  assert(siIndex < syncIndex, "Implement before Sync");
  console.log("");

  // ── Test 5: Runtime relationships ──
  console.log("Test 5: Runtime relationships");
  const implRel = inv.runtime_relationships.find((r) => r["runtimeNode"] === "implementation");
  assert(implRel !== undefined, "implementation runtime relationship exists");
  assert(implRel!["relationshipType"] === "skillless_agent_execution", "implementation is skillless_agent_execution");
  assert(implRel!["runtimeInvokesSkill"] === false, "implementation does not invoke skill");
  const implSkills = implRel!["relatedSkills"] as string[];
  assert(implSkills.includes("sdlc-speckit-pipeline"), "implementation relatedSkills includes sdlc-speckit-pipeline");
  assert(!implSkills.includes("sdlc-speckit-implement"), "implementation relatedSkills does NOT include sdlc-speckit-implement");
  const implNotes = implRel!["notes"] as string;
  assert(implNotes.includes("Direct implementation is skillless"), "notes mention direct implementation is skillless");
  assert(implNotes.includes("sdlc-speckit-pipeline"), "notes mention sdlc-speckit-pipeline");

  const bugfixRel = inv.runtime_relationships.find((r) => r["runtimeNode"] === "bugfix");
  assert(bugfixRel !== undefined, "bugfix runtime relationship exists");
  assert((bugfixRel!["relatedSkills"] as string[]).length === 0, "bugfix has no related skills");
  assert(bugfixRel!["relationshipType"] === "no_evidence", "bugfix has no evidence of skill mapping");
  console.log("");

  // ── Test 6: All skills are runtimeInvoked: false ──
  console.log("Test 6: No skills are runtime-invoked");
  for (const skill of inv.skills) {
    assert(skill["runtimeInvoked"] === false, `${skill["name"]}: runtimeInvoked is false`);
  }
  console.log("");

  // ── Test 7: Safety boundaries ──
  console.log("Test 7: Safety boundaries");
  const sb = inv.safety_boundaries;
  assert(sb["metadata_only"] === true, "metadata_only is true");
  assert(sb["changes_runtime_behavior"] === false, "does not change runtime behavior");
  assert(sb["changes_graph_routing"] === false, "does not change graph routing");
  assert(sb["changes_agent_selection"] === false, "does not change agent selection");
  assert(sb["invokes_sdlc_skills"] === false, "does not invoke sdlc skills");
  assert(sb["renames_skills"] === false, "does not rename skills");
  assert(sb["adds_new_skills"] === false, "does not add new skills");
  console.log("");

  // ── Test 8: Recommendations ──
  console.log("Test 8: Recommendations");
  const recs = inv.recommendations;
  const doNotContinue = recs["do_not_continue"] as string[];
  assert(doNotContinue.some((r) => r.includes("runtime_node_to_skill_inference")),
    "recommends against runtime node to skill inference");
  assert(doNotContinue.some((r) => r.includes("speckit_implement_to_generic_implementation")),
    "recommends against mapping speckit-implement to generic implementation");
  assert(recs["recommended_next_pr"] === "deprecate_runtime_auto_skill_annotation",
    "recommended_next_pr is deprecate_runtime_auto_skill_annotation");
  const futureWork = recs["recommended_future_work"] as string[];
  assert(futureWork.some((r) => r.includes("skillless")),
    "recommends modeling direct implementation as skillless");
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
