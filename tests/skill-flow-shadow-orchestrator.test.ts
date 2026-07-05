// Regression Test — Shadow Skill Flow Orchestrator
// ==================================================
// Verifies shadow execution of SkillFlowPlan produces correct
// deterministic results. No runtime, no agents, no Gateway.

import {
  planGlobalEntryFlow,
  planDirectImplementationPath,
  planSpeckitFlow,
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

  console.log("Shadow Skill Flow Orchestrator Test\n");

  // ── Test 1: Global entry shadow execution ──
  console.log("Test 1: Global entry shadow execution");
  const globalPlan = planGlobalEntryFlow({ requirementId: "REQ-SHADOW-1" });
  const globalResult = executeSkillFlowShadow(globalPlan);
  assert(globalResult.mode === "shadow_only", "mode is shadow_only");
  assert(globalResult.status === "shadow_success", "status is shadow_success");
  assert(globalResult.stageResults.length === globalPlan.stages.length, "stage count matches plan");
  // 3 skill stages → 3 artifacts
  const skillArtifacts = globalResult.artifacts.filter((a) => a.type === "shadow_skill_output");
  assert(skillArtifacts.length === 3, "3 shadow_skill_output artifacts");
  assert(globalResult.stageResults[0].skill === "sdlc-requirement-normalizer", "first stage is requirement-normalizer");
  const firstArtifact = skillArtifacts[0];
  assert(firstArtifact.content["skill"] === "sdlc-requirement-normalizer", "artifact has skill name");
  assert(firstArtifact.content["mode"] === "shadow_only", "artifact mode is shadow_only");
  assert((firstArtifact.content["message"] as string).includes("no real skill invoked"), "message mentions no real skill");
  console.log("");

  // ── Test 2: Direct implementation remains skillless ──
  console.log("Test 2: Direct implementation remains skillless");
  const directPlan = planDirectImplementationPath({ requirementId: "REQ-DIRECT-SHADOW" });
  const directResult = executeSkillFlowShadow(directPlan);
  const directAgent = directResult.stageResults.find(
    (s) => s.stageName === "DIRECT_IMPLEMENTATION_AGENT_EXECUTION"
  );
  assert(directAgent !== undefined, "DIRECT_IMPLEMENTATION stage exists");
  assert(directAgent!.kind === "skillless_agent_execution", "kind is skillless_agent_execution");
  assert(directAgent!.skill === undefined, "no skill on skillless stage");
  const skilllessArtifact = directResult.artifacts.find(
    (a) => a.type === "shadow_skillless_output"
  );
  assert(skilllessArtifact !== undefined, "shadow_skillless_output artifact exists");
  assert(skilllessArtifact!.content["skill"] === null, "artifact skill is null");
  assert((skilllessArtifact!.content["message"] as string).includes("no real agent invoked"), "message mentions no real agent");
  // Must NOT reference sdlc-speckit-implement anywhere
  const directJson = JSON.stringify(directResult);
  assert(!directJson.includes("sdlc-speckit-implement"), "JSON does NOT include sdlc-speckit-implement");
  console.log("");

  // ── Test 3: Speckit shadow execution preserves order ──
  console.log("Test 3: Speckit shadow execution preserves canonical order");
  const speckitPlan = planSpeckitFlow({ requirementId: "REQ-SPECKIT-SHADOW" });
  const speckitResult = executeSkillFlowShadow(speckitPlan);
  assert(speckitResult.stageResults[0].skill === "sdlc-speckit-pipeline", "first stage is speckit-pipeline");
  const srSkills = speckitResult.stageResults.map((s) => s.skill ?? s.stageName);
  const ppIdx = srSkills.indexOf("sdlc-speckit-pipeline");
  const pfIdx = srSkills.indexOf("PREFLIGHT_CONTROLLER");
  const drIdx = srSkills.indexOf("DOMAIN_ROUTE_CONTROLLER");
  const spIdx = srSkills.indexOf("sdlc-speckit-specify");
  assert(ppIdx < pfIdx, "pipeline before PREFLIGHT");
  assert(pfIdx < drIdx, "PREFLIGHT before DOMAIN_ROUTE");
  assert(drIdx < spIdx, "DOMAIN_ROUTE before specify");
  const siIdx = srSkills.indexOf("sdlc-speckit-implement");
  const aiIdx = srSkills.indexOf("sdlc-speckit-analyze");
  const syncIdx = srSkills.indexOf("sdlc-speckit-sync");
  assert(aiIdx < siIdx, "analyze before implement");
  assert(siIdx < syncIdx, "implement before sync");
  // Speckit-implement artifact exists
  const siArtifact = speckitResult.artifacts.find(
    (a) => a.skill === "sdlc-speckit-implement"
  );
  assert(siArtifact !== undefined, "speckit-implement artifact exists");
  assert(siArtifact!.content["skill"] === "sdlc-speckit-implement", "artifact has speckit-implement skill");
  console.log("");

  // ── Test 4: Controller stages do not invoke skills ──
  console.log("Test 4: Controller stages are not skills");
  const controllerResults = speckitResult.stageResults.filter(
    (s) => s.kind === "controller"
  );
  assert(controllerResults.length >= 2, "at least 2 controller stages");
  for (const cr of controllerResults) {
    assert(cr.skill === undefined, `${cr.stageName}: no skill`);
    assert(cr.artifacts.length === 0, `${cr.stageName}: no artifacts produced`);
    assert(cr.output["mode"] === "shadow_only", `${cr.stageName}: mode is shadow_only`);
  }
  console.log("");

  // ── Test 5: Invalid plan shadow failure ──
  console.log("Test 5: Invalid plan returns shadow_failed");
  const invalidPlan = planFlowById({ flowId: "unknown_flow", requirementId: "REQ-UNKNOWN" });
  const invalidResult = executeSkillFlowShadow(invalidPlan);
  assert(invalidResult.status === "shadow_failed", "status is shadow_failed");
  assert(invalidResult.stageResults.length === 0, "no stage results");
  assert(invalidResult.artifacts.length === 0, "no artifacts");
  assert(invalidResult.warnings.some((w) => w.includes("Unknown flow")), "warning includes Unknown flow");
  console.log("");

  // ── Test 6: Safety boundaries ──
  console.log("Test 6: Safety boundaries");
  for (const result of [globalResult, directResult, speckitResult]) {
    assert(result.safety.shadowOnly === true, `${result.flowId}: shadowOnly`);
    assert(result.safety.invokesRealAgents === false, `${result.flowId}: no real agents`);
    assert(result.safety.invokesRealSkills === false, `${result.flowId}: no real skills`);
    assert(result.safety.writesFiles === false, `${result.flowId}: no file writes`);
    assert(result.safety.changesRuntimeBehavior === false, `${result.flowId}: no runtime change`);
    assert(result.safety.affectsRouting === false, `${result.flowId}: no routing effect`);
    assert(result.safety.affectsAgentSelection === false, `${result.flowId}: no agent selection effect`);
  }
  console.log("");

  // ── Test 7: Deterministic artifact IDs ──
  console.log("Test 7: Deterministic artifact IDs");
  const plan7 = planGlobalEntryFlow({ requirementId: "REQ-DET" });
  const result1 = executeSkillFlowShadow(plan7);
  const result2 = executeSkillFlowShadow(plan7);
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
