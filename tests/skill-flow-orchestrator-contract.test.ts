// Regression Test — Skill Flow Orchestrator Contract (Plan-only)
// ================================================================
// Verifies the orchestrator produces correct plans without executing
// anything. Pure tests. No runtime, no agents, no DB, no Gateway.

import {
  planGlobalEntryFlow,
  planDirectImplementationPath,
  planSpeckitFlow,
  planFlowById,
} from "../core/skill-flow-orchestrator";

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

  console.log("Skill Flow Orchestrator Contract Test\n");

  // ── Test 1: Global entry flow ──
  console.log("Test 1: Global entry flow");
  const globalPlan = planGlobalEntryFlow({ requirementId: "REQ-1" });
  assert(globalPlan.status === "planned", "status is planned");
  assert(globalPlan.mode === "plan_only", "mode is plan_only");
  assert(globalPlan.entrySkill === "sdlc-requirement-normalizer", "entrySkill is requirement-normalizer");
  assert(globalPlan.stages[0].skill === "sdlc-requirement-normalizer", "first stage is requirement-normalizer");
  assert(globalPlan.stages.some((s) => s.skill === "sdlc-specification-writer"), "includes specification-writer");
  assert(globalPlan.stages.some((s) => s.skill === "sdlc-solution-reviewer"), "includes solution-reviewer");
  assert(globalPlan.stages.length === 3, "3 stages in main docflow");
  assert(globalPlan.safety.invokesAgents === false, "does not invoke agents");
  assert(globalPlan.safety.invokesSkills === false, "does not invoke skills");
  console.log("");

  // ── Test 2: Direct implementation path is skillless ──
  console.log("Test 2: Direct implementation path is skillless");
  const directPlan = planDirectImplementationPath({ requirementId: "REQ-DIRECT" });
  assert(directPlan.status === "planned", "status is planned");
  const directAgent = directPlan.stages.find((s) => s.stageName === "DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(directAgent !== undefined, "includes DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(directAgent!.kind === "skillless_agent_execution", "kind is skillless_agent_execution");
  assert(directAgent!.skill === undefined, "skill is undefined");
  assert(directAgent!.executionRequestPreview?.skill === undefined, "preview skill is undefined");
  assert(!directPlan.stages.some((s) => s.skill === "sdlc-speckit-implement"), "does NOT include sdlc-speckit-implement");
  console.log("");

  // ── Test 3: Speckit flow ──
  console.log("Test 3: Speckit flow");
  const speckitPlan = planSpeckitFlow({ requirementId: "REQ-SPECKIT" });
  assert(speckitPlan.status === "planned", "status is planned");
  assert(speckitPlan.stages.some((s) => s.skill === "sdlc-speckit-pipeline"), "includes speckit-pipeline");
  assert(speckitPlan.stages.some((s) => s.stageName === "PREFLIGHT_CONTROLLER"), "includes PREFLIGHT_CONTROLLER");
  assert(speckitPlan.stages.some((s) => s.stageName === "DOMAIN_ROUTE_CONTROLLER"), "includes DOMAIN_ROUTE_CONTROLLER");
  assert(speckitPlan.stages.some((s) => s.skill === "sdlc-speckit-implement"), "includes speckit-implement");
  // Verify canonical order: pipeline → PREFLIGHT → DOMAIN_ROUTE → specify → ... → reconcile
  assert(speckitPlan.stages[0].skill === "sdlc-speckit-pipeline", "speckit-pipeline is stage index 0");
  const spIndex = speckitPlan.stages.findIndex((s) => s.skill === "sdlc-speckit-pipeline");
  const pfIndex = speckitPlan.stages.findIndex((s) => s.stageName === "PREFLIGHT_CONTROLLER");
  const drIndex = speckitPlan.stages.findIndex((s) => s.stageName === "DOMAIN_ROUTE_CONTROLLER");
  const specIndex = speckitPlan.stages.findIndex((s) => s.skill === "sdlc-speckit-specify");
  assert(spIndex < pfIndex, "pipeline before PREFLIGHT_CONTROLLER");
  assert(pfIndex < drIndex, "PREFLIGHT before DOMAIN_ROUTE");
  assert(drIndex < specIndex, "DOMAIN_ROUTE before specify");
  // Verify order: analyze < implement < sync
  const siIndex = speckitPlan.stages.findIndex((s) => s.skill === "sdlc-speckit-implement");
  const analyzeIndex = speckitPlan.stages.findIndex((s) => s.skill === "sdlc-speckit-analyze");
  const syncIndex = speckitPlan.stages.findIndex((s) => s.skill === "sdlc-speckit-sync");
  assert(analyzeIndex < siIndex, "analyze before implement");
  assert(siIndex < syncIndex, "implement before sync");
  assert(!speckitPlan.stages.some((s) => s.stageName === "DIRECT_IMPLEMENTATION_AGENT_EXECUTION"), "no DIRECT_IMPLEMENTATION in speckit");
  // Controllers should be controller kind
  const preflight = speckitPlan.stages.find((s) => s.stageName === "PREFLIGHT_CONTROLLER");
  assert(preflight!.kind === "controller", "PREFLIGHT is controller kind");
  assert(preflight!.skill === undefined, "controller has no skill");
  console.log("");

  // ── Test 4: Code review subflow ──
  console.log("Test 4: Code review subflow");
  const crPlan = planFlowById({ flowId: "code_review_subflow", requirementId: "REQ-CR" });
  assert(crPlan.stages.some((s) => s.skill === "sdlc-code-review-excellence"), "includes code-review-excellence");
  assert(crPlan.stages.some((s) => s.skill === "sdlc-code-review-normalizer"), "includes code-review-normalizer");
  assert(crPlan.entrySkill !== "sdlc-requirement-normalizer", "entry is not requirement-normalizer");
  console.log("");

  // ── Test 5: Unknown flow ──
  console.log("Test 5: Unknown flow");
  const unknownPlan = planFlowById({ flowId: "unknown_flow", requirementId: "REQ-X" });
  assert(unknownPlan.status === "invalid", "status is invalid");
  assert(unknownPlan.stages.length === 0, "no stages");
  assert(unknownPlan.warnings.some((w) => w.includes("Unknown flow")), "warning mentions Unknown flow");
  assert(unknownPlan.safety.planOnly === true, "planOnly remains true");
  console.log("");

  // ── Test 6: Previews carry explicit skill metadata only ──
  console.log("Test 6: Execution request previews");
  for (const stage of globalPlan.stages) {
    if (stage.kind === "skill" && stage.executionRequestPreview) {
      assert(stage.executionRequestPreview.skill === stage.skill, `${stage.skill}: preview skill matches`);
      assert(stage.executionRequestPreview.flowId === globalPlan.flowId, `${stage.skill}: preview flowId matches`);
      assert(stage.executionRequestPreview.requirementId === globalPlan.requirementId, `${stage.skill}: preview requirementId matches`);
    }
  }
  // Controller stages and skillless stages have no skill in preview
  const ctrlStage = speckitPlan.stages.find((s) => s.kind === "controller");
  assert(ctrlStage!.executionRequestPreview === undefined, "controller has no preview");
  const skilllessStage = directPlan.stages.find((s) => s.kind === "skillless_agent_execution");
  assert(skilllessStage!.executionRequestPreview!.skill === undefined, "skillless preview has no skill");
  console.log("");

  // ── Test 7: No runtime side effects ──
  console.log("Test 7: No runtime side effects");
  for (const plan of [globalPlan, directPlan, speckitPlan, crPlan]) {
    assert(plan.safety.changesRuntimeBehavior === false, `${plan.flowId}: no runtime behavior change`);
    assert(plan.safety.affectsRouting === false, `${plan.flowId}: no routing effect`);
    assert(plan.safety.affectsAgentSelection === false, `${plan.flowId}: no agent selection effect`);
    assert(plan.safety.planOnly === true, `${plan.flowId}: planOnly`);
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
