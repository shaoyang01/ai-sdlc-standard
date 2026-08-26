// Regression Test — Agent Skill Registry (Flow-Stage Based)
// ===========================================================
// Verifies the registry models skills as flow nodes, not runtime nodes.
// Metadata-only. No runtime, no DB, no agents.
// C03-C update: registry rewritten from legacy 21-package topology to 7+1
// canonical topology per Decision-045 absorption mapping and C03-B atomic
// cutover.

import {
  getAllSkillFlowBindings,
  getSkillFlowBinding,
  getSkillsByFlowId,
  getSkillsByRole,
  getGlobalEntrySkill,
  getSubflowEntrySkills,
  getDownstreamSkills,
  getEligibleSkillsForAgent,
  validateSkillInvocation,
} from "../core/agent-skill-registry";

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

  console.log("Agent Skill Registry Test (Flow-Stage Based, 7+1 Topology)\n");

  // ── Test 1: Basic registry ──
  console.log("Test 1: Basic registry (7+1 topology)");
  const all = getAllSkillFlowBindings();
  assert(all.length === 8, `8 skills (7 nodes + docflow-writer) (got ${all.length})`);
  for (const b of all) {
    assert(b.skill.startsWith("sdlc-"), `${b.skill} starts with sdlc-`);
    assert(b.runtimeInvoked === false, `${b.skill}: runtimeInvoked is false`);
    assert(b.executionMode === "metadata_only", `${b.skill}: executionMode is metadata_only`);
  }
  const expectedSkills = [
    "sdlc-requirement-intake",
    "sdlc-solution-design",
    "sdlc-solution-gate",
    "sdlc-task-planning",
    "sdlc-implementation",
    "sdlc-code-review",
    "sdlc-knowledge-sync",
    "sdlc-docflow-writer",
  ];
  for (const sk of expectedSkills) {
    assert(all.some((b) => b.skill === sk), `registry includes ${sk}`);
  }
  console.log("");

  // ── Test 2: Global entry ──
  console.log("Test 2: Global entry");
  const entry = getGlobalEntrySkill();
  assert(entry.skill === "sdlc-requirement-intake", "global entry is requirement-intake");
  assert(entry.role === "global_entry", "role is global_entry");
  assert(entry.flowIds.includes("main_docflow"), "belongs to main_docflow");
  console.log("");

  // ── Test 3: solution-gate is NOT global entry ──
  console.log("Test 3: solution-gate is flow_internal, NOT global entry");
  const gate = getSkillFlowBinding("sdlc-solution-gate");
  assert(gate !== undefined, "solution-gate exists");
  assert(gate!.role === "flow_internal", "role is flow_internal");
  assert(gate!.role !== "global_entry", "is NOT global_entry");
  assert(gate!.flowIds.includes("main_docflow"), "belongs to main_docflow");
  assert(gate!.category.includes("Auditor"), "category includes Auditor");
  assert(gate!.category.includes("Reviewer"), "category includes Reviewer");
  console.log("");

  // ── Test 4: implementation is flow_internal ──
  console.log("Test 4: implementation is flow_internal (direct_implementation_path)");
  const impl = getSkillFlowBinding("sdlc-implementation");
  assert(impl !== undefined, "implementation exists");
  assert(impl!.flowIds.includes("direct_implementation_path"), "belongs to direct_implementation_path");
  assert(impl!.stage.includes("Implementation"), "stage includes Implementation");
  assert(impl!.role === "flow_internal", "role is flow_internal");
  console.log("");

  // ── Test 5: Direct implementation is NOT a skill ──
  console.log("Test 5: Direct implementation is not modeled as a skill");
  const direct = getSkillFlowBinding("DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(direct === undefined, "no direct implementation skill exists");
  assert(!all.some((b) => b.skill.includes("DIRECT_IMPLEMENTATION")), "no DIRECT_IMPLEMENTATION skill");
  console.log("");

  // ── Test 6: Flow lookups ──
  console.log("Test 6: Flow lookups (7+1 topology)");
  const mainFlow = getSkillsByFlowId("main_docflow");
  assert(mainFlow.some((b) => b.skill === "sdlc-requirement-intake"), "main includes requirement-intake");
  assert(mainFlow.some((b) => b.skill === "sdlc-solution-design"), "main includes solution-design");
  assert(mainFlow.some((b) => b.skill === "sdlc-solution-gate"), "main includes solution-gate");
  assert(mainFlow.some((b) => b.skill === "sdlc-task-planning"), "main includes task-planning");

  const directFlow = getSkillsByFlowId("direct_implementation_path");
  const directSkills = ["sdlc-implementation", "sdlc-code-review", "sdlc-knowledge-sync"];
  for (const sk of directSkills) {
    assert(directFlow.some((b) => b.skill === sk), `direct path includes ${sk}`);
  }
  console.log("");

  // ── Test 7: Downstream lookups ──
  console.log("Test 7: Downstream lookups (7+1 topology)");
  const intakeDownstream = getDownstreamSkills("sdlc-requirement-intake");
  assert(intakeDownstream.some((b) => b.skill === "sdlc-solution-design"), "intake → solution-design");

  const designDownstream = getDownstreamSkills("sdlc-solution-design");
  assert(designDownstream.some((b) => b.skill === "sdlc-solution-gate"), "design → solution-gate");

  const gateDownstream = getDownstreamSkills("sdlc-solution-gate");
  assert(gateDownstream.some((b) => b.skill === "sdlc-task-planning"), "gate → task-planning");

  const implDownstream = getDownstreamSkills("sdlc-implementation");
  assert(implDownstream.some((b) => b.skill === "sdlc-code-review"), "implementation → code-review");

  const reviewDownstream = getDownstreamSkills("sdlc-code-review");
  assert(reviewDownstream.some((b) => b.skill === "sdlc-knowledge-sync"), "code-review → knowledge-sync");
  console.log("");

  // ── Test 8: Agent eligibility ──
  console.log("Test 8: Agent eligibility (metadata only)");
  const kimiSkills = getEligibleSkillsForAgent("kimi");
  assert(kimiSkills.some((b) => b.skill === "sdlc-requirement-intake"), "kimi eligible for requirement-intake");
  assert(kimiSkills.some((b) => b.skill === "sdlc-docflow-writer"), "kimi eligible for docflow-writer");

  const codexSkills = getEligibleSkillsForAgent("codex");
  assert(codexSkills.some((b) => b.skill === "sdlc-implementation"), "codex eligible for implementation");
  assert(codexSkills.some((b) => b.skill === "sdlc-code-review"), "codex eligible for code-review");

  const hermesSkills = getEligibleSkillsForAgent("hermes");
  assert(hermesSkills.some((b) => b.skill === "sdlc-knowledge-sync"), "hermes eligible for knowledge-sync");
  console.log("");

  // ── Test 9: Validation (flow-based, not runtime-node based) ──
  console.log("Test 9: Validation (flow-stage based)");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-intake" }).valid === true, "known skill is valid");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-intake", flowId: "main_docflow" }).valid === true, "known skill + matching flow is valid");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-intake", flowId: "direct_implementation_path" }).valid === false, "known skill + non-matching flow is invalid");
  assert(validateSkillInvocation({ skill: "unknown-skill" }).valid === false, "unknown skill is invalid");
  const empty = validateSkillInvocation({ skill: "" });
  assert(empty.attempted === false, "empty skill not attempted");
  assert(empty.valid === true, "empty skill is valid (not required)");
  console.log("");

  // ── Test 10: Subflow entry skills ──
  console.log("Test 10: Subflow entry skills (7+1 topology has no flow_controller)");
  const subEntries = getSubflowEntrySkills();
  assert(Array.isArray(subEntries), "subflow entries is array");
  // 7+1 topology: no flow_controller (speckit-pipeline retired), no subflow_normalizer
  assert(!subEntries.some((b) => b.skill === "sdlc-speckit-pipeline"), "no speckit-pipeline (retired)");
  assert(!subEntries.some((b) => b.skill === "sdlc-requirement-intake"), "does NOT include requirement-intake (global entry)");
  console.log("");

  // ── Test 11: Legacy IDs NOT in registry (C03-C consumption-face cutover) ──
  console.log("Test 11: Legacy 21 IDs NOT in registry (C03-C cutover)");
  const legacyIds = [
    "sdlc-requirement-normalizer",
    "sdlc-specification-writer",
    "sdlc-solution-challenger",
    "sdlc-solution-reviewer",
    "sdlc-implementation-recorder",
    "sdlc-code-review-excellence",
    "sdlc-code-review-normalizer",
    "sdlc-test-feedback-classifier",
    "sdlc-test-feedback-sync",
    "sdlc-gate-runner",
    "sdlc-speckit-pipeline",
    "sdlc-speckit-specify",
    "sdlc-speckit-clarify",
    "sdlc-speckit-plan",
    "sdlc-speckit-tasks",
    "sdlc-speckit-analyze",
    "sdlc-speckit-implement",
    "sdlc-speckit-sync",
    "sdlc-speckit-code-doc-reconcile",
    "sdlc-speckit-checklist",
  ];
  for (const legacy of legacyIds) {
    assert(getSkillFlowBinding(legacy) === undefined, `legacy ${legacy} NOT in registry`);
  }
  console.log("");

  // ── Test 12: docflow-writer is non-node utility ──
  console.log("Test 12: docflow-writer is non-node utility (cross-cutting)");
  const docflow = getSkillFlowBinding("sdlc-docflow-writer");
  assert(docflow !== undefined, "docflow-writer exists");
  assert(docflow!.role === "utility", "role is utility");
  assert(docflow!.flowTypes.includes("cross_cutting"), "flowType is cross_cutting");
  assert(docflow!.category.includes("Renderer"), "category includes Renderer");
  assert(docflow!.category.includes("Publisher"), "category includes Publisher");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
