// Regression Test — Shadow Skill Flow Orchestrator (Single-Track 7+1)
// ===================================================================
// Verifies shadow execution of SkillFlowPlan produces correct
// deterministic results. No runtime, no agents, no Gateway.
// C03-E E0.5 update: direct_implementation_path success-condition
// assertions removed (dual-track retired per Decision-044/E0.2).

import {
  planGlobalEntryFlow,
  planFlowById,
} from "../core/skill-flow-orchestrator";
import { executeSkillFlowShadow } from "../core/skill-flow-shadow-orchestrator";

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

  console.log("Shadow Skill Flow Orchestrator Test (Single-Track 7+1)\n");

  // ── Test 1: Global entry shadow execution (main_docflow, 4 nodes) ──
  console.log("Test 1: Global entry shadow execution (main_docflow)");
  const globalPlan = planGlobalEntryFlow({ requirementId: "REQ-SHADOW-1" });
  const globalResult = executeSkillFlowShadow(globalPlan);
  assert(globalResult.mode === "shadow_only", "mode is shadow_only");
  assert(globalResult.status === "shadow_success", "status is shadow_success");
  assert(globalResult.stageResults.length === globalPlan.stages.length, "stage count matches plan");
  // 4 skill stages → 4 artifacts
  const skillArtifacts = globalResult.artifacts.filter((a) => a.type === "shadow_skill_output");
  assert(skillArtifacts.length === 4, "4 shadow_skill_output artifacts (intake/design/gate/task-planning)");
  assert(globalResult.stageResults[0].skill === "sdlc-requirement-intake", "first stage is requirement-intake");
  const firstArtifact = skillArtifacts[0];
  assert(firstArtifact.content["skill"] === "sdlc-requirement-intake", "artifact has skill name");
  assert(firstArtifact.content["mode"] === "shadow_only", "artifact mode is shadow_only");
  assert((firstArtifact.content["message"] as string).includes("no real skill invoked"), "message mentions no real skill");
  // No retired IDs
  const globalJson = JSON.stringify(globalResult);
  assert(!globalJson.includes("sdlc-requirement-normalizer"), "no requirement-normalizer (retired)");
  assert(!globalJson.includes("sdlc-specification-writer"), "no specification-writer (retired)");
  assert(!globalJson.includes("sdlc-solution-reviewer"), "no solution-reviewer (retired)");
  console.log("");

  // ── Test 2: Retired speckit flow returns invalid ──
  console.log("Test 2: Retired speckit flow returns invalid (Decision-044)");
  const speckitPlan = planFlowById({ flowId: "speckit_pipeline", requirementId: "REQ-SP" });
  assert(speckitPlan.status === "invalid", "speckit_pipeline is invalid (retired)");
  const speckitResult = executeSkillFlowShadow(speckitPlan);
  assert(speckitResult.status === "shadow_failed", "speckit shadow returns shadow_failed");
  assert(speckitResult.stageResults.length === 0, "no stage results for retired flow");
  console.log("");

  // ── Test 3: No controller stages in 7+1 topology ──
  console.log("Test 3: No controller stages in 7+1 topology (speckit PREFLIGHT/DOMAIN_ROUTE retired)");
  const allControllerResults = globalResult.stageResults.filter((s) => s.kind === "controller");
  assert(allControllerResults.length === 0, "no controller stages in active flows (speckit controllers retired)");
  console.log("");

  // ── Test 4: Invalid plan shadow failure ──
  console.log("Test 4: Invalid plan returns shadow_failed");
  const invalidPlan = planFlowById({ flowId: "unknown_flow", requirementId: "REQ-UNKNOWN" });
  const invalidResult = executeSkillFlowShadow(invalidPlan);
  assert(invalidResult.status === "shadow_failed", "status is shadow_failed");
  assert(invalidResult.stageResults.length === 0, "no stage results");
  assert(invalidResult.artifacts.length === 0, "no artifacts");
  assert(invalidResult.warnings.some((w) => w.includes("Unknown flow")), "warning includes Unknown flow");
  console.log("");

  // ── Test 5: Safety boundaries ──
  console.log("Test 5: Safety boundaries");
  assert(globalResult.safety.shadowOnly === true, `${globalResult.flowId}: shadowOnly`);
  assert(globalResult.safety.invokesRealAgents === false, `${globalResult.flowId}: no real agents`);
  assert(globalResult.safety.invokesRealSkills === false, `${globalResult.flowId}: no real skills`);
  assert(globalResult.safety.writesFiles === false, `${globalResult.flowId}: no file writes`);
  assert(globalResult.safety.changesRuntimeBehavior === false, `${globalResult.flowId}: no runtime change`);
  assert(globalResult.safety.affectsRouting === false, `${globalResult.flowId}: no routing effect`);
  assert(globalResult.safety.affectsAgentSelection === false, `${globalResult.flowId}: no agent selection effect`);
  console.log("");

  // ── Test 6: Deterministic artifact IDs ──
  console.log("Test 6: Deterministic artifact IDs");
  const plan6 = planGlobalEntryFlow({ requirementId: "REQ-DET" });
  const result1 = executeSkillFlowShadow(plan6);
  const result2 = executeSkillFlowShadow(plan6);
  assert(result1.artifacts.length === result2.artifacts.length, "same artifact count");
  for (let i = 0; i < result1.artifacts.length; i++) {
    assert(result1.artifacts[i].id === result2.artifacts[i].id,
      `artifact ${i} ID is deterministic: ${result1.artifacts[i].id}`);
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
