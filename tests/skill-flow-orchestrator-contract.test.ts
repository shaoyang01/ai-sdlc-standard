// Regression Test — Skill Flow Orchestrator Contract (Plan-only, 7+1 Topology)
// =================================================================================
// Verifies the orchestrator produces correct plans without executing
// anything. Pure tests. No runtime, no agents, no DB, no Gateway.
// C03-C update: speckit_pipeline, code_review_subflow, test_feedback_subflow
// retired per Decision-044 single-track; 7+1 topology (main_docflow 4 nodes +
// direct_implementation_path 3 nodes + docflow-writer utility).

import {
  planGlobalEntryFlow,
  planDirectImplementationPath,
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

  console.log("Skill Flow Orchestrator Contract Test (7+1 Topology)\n");

  // ── Test 1: Global entry flow (main_docflow, 4 nodes) ──
  console.log("Test 1: Global entry flow (main_docflow)");
  const globalPlan = planGlobalEntryFlow({ requirementId: "REQ-1" });
  assert(globalPlan.status === "planned", "status is planned");
  assert(globalPlan.mode === "plan_only", "mode is plan_only");
  assert(globalPlan.entrySkill === "sdlc-requirement-intake", "entrySkill is requirement-intake");
  assert(globalPlan.stages[0].skill === "sdlc-requirement-intake", "first stage is requirement-intake");
  assert(globalPlan.stages.some((s) => s.skill === "sdlc-solution-design"), "includes solution-design");
  assert(globalPlan.stages.some((s) => s.skill === "sdlc-solution-gate"), "includes solution-gate");
  assert(globalPlan.stages.some((s) => s.skill === "sdlc-task-planning"), "includes task-planning");
  assert(globalPlan.stages.length === 4, "4 stages in main docflow (intake→design→gate→task-planning)");
  assert(globalPlan.safety.invokesAgents === false, "does not invoke agents");
  assert(globalPlan.safety.invokesSkills === false, "does not invoke skills");
  // Verify canonical order
  const intakeIdx = globalPlan.stages.findIndex((s) => s.skill === "sdlc-requirement-intake");
  const designIdx = globalPlan.stages.findIndex((s) => s.skill === "sdlc-solution-design");
  const gateIdx = globalPlan.stages.findIndex((s) => s.skill === "sdlc-solution-gate");
  const taskIdx = globalPlan.stages.findIndex((s) => s.skill === "sdlc-task-planning");
  assert(intakeIdx < designIdx, "intake before design");
  assert(designIdx < gateIdx, "design before gate");
  assert(gateIdx < taskIdx, "gate before task-planning");
  console.log("");

  // ── Test 2: Direct implementation path (3 nodes + skillless) ──
  console.log("Test 2: Direct implementation path (skillless + 3 nodes)");
  const directPlan = planDirectImplementationPath({ requirementId: "REQ-DIRECT" });
  assert(directPlan.status === "planned", "status is planned");
  const directAgent = directPlan.stages.find((s) => s.stageName === "DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(directAgent !== undefined, "includes DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(directAgent!.kind === "skillless_agent_execution", "kind is skillless_agent_execution");
  assert(directAgent!.skill === undefined, "skill is undefined");
  assert(directAgent!.executionRequestPreview?.skill === undefined, "preview skill is undefined");
  assert(directPlan.stages.some((s) => s.skill === "sdlc-implementation"), "includes implementation");
  assert(directPlan.stages.some((s) => s.skill === "sdlc-code-review"), "includes code-review");
  assert(directPlan.stages.some((s) => s.skill === "sdlc-knowledge-sync"), "includes knowledge-sync");
  assert(directPlan.stages.length === 4, "4 stages (skillless + implementation + code-review + knowledge-sync)");
  // No retired speckit IDs
  assert(!directPlan.stages.some((s) => s.skill === "sdlc-speckit-implement"), "does NOT include speckit-implement");
  assert(!directPlan.stages.some((s) => s.skill === "sdlc-implementation-recorder"), "does NOT include implementation-recorder");
  assert(!directPlan.stages.some((s) => s.skill === "sdlc-code-review-excellence"), "does NOT include code-review-excellence");
  assert(!directPlan.stages.some((s) => s.skill === "sdlc-code-review-normalizer"), "does NOT include code-review-normalizer");
  console.log("");

  // ── Test 3: Retired flows return invalid ──
  console.log("Test 3: Retired flows return invalid (Decision-044 single-track)");
  const speckitPlan = planFlowById({ flowId: "speckit_pipeline", requirementId: "REQ-SP" });
  assert(speckitPlan.status === "invalid", "speckit_pipeline is invalid (retired)");
  assert(speckitPlan.stages.length === 0, "speckit_pipeline has no stages");
  const crPlan = planFlowById({ flowId: "code_review_subflow", requirementId: "REQ-CR" });
  assert(crPlan.status === "invalid", "code_review_subflow is invalid (retired, absorbed into code-review)");
  const tfPlan = planFlowById({ flowId: "test_feedback_subflow", requirementId: "REQ-TF" });
  assert(tfPlan.status === "invalid", "test_feedback_subflow is invalid (retired, absorbed into knowledge-sync)");
  console.log("");

  // ── Test 4: Unknown flow ──
  console.log("Test 4: Unknown flow");
  const unknownPlan = planFlowById({ flowId: "unknown_flow", requirementId: "REQ-X" });
  assert(unknownPlan.status === "invalid", "status is invalid");
  assert(unknownPlan.stages.length === 0, "no stages");
  assert(unknownPlan.warnings.some((w) => w.includes("Unknown flow")), "warning mentions Unknown flow");
  assert(unknownPlan.safety.planOnly === true, "planOnly remains true");
  console.log("");

  // ── Test 5: Previews carry explicit skill metadata only ──
  console.log("Test 5: Execution request previews");
  for (const stage of globalPlan.stages) {
    if (stage.kind === "skill" && stage.executionRequestPreview) {
      assert(stage.executionRequestPreview.skill === stage.skill, `${stage.skill}: preview skill matches`);
      assert(stage.executionRequestPreview.flowId === globalPlan.flowId, `${stage.skill}: preview flowId matches`);
      assert(stage.executionRequestPreview.requirementId === globalPlan.requirementId, `${stage.skill}: preview requirementId matches`);
    }
  }
  // Skillless stages have no skill in preview
  const skilllessStage = directPlan.stages.find((s) => s.kind === "skillless_agent_execution");
  assert(skilllessStage!.executionRequestPreview!.skill === undefined, "skillless preview has no skill");
  console.log("");

  // ── Test 6: No runtime side effects ──
  console.log("Test 6: No runtime side effects");
  for (const plan of [globalPlan, directPlan]) {
    assert(plan.safety.changesRuntimeBehavior === false, `${plan.flowId}: no runtime behavior change`);
    assert(plan.safety.affectsRouting === false, `${plan.flowId}: no routing effect`);
    assert(plan.safety.affectsAgentSelection === false, `${plan.flowId}: no agent selection effect`);
    assert(plan.safety.planOnly === true, `${plan.flowId}: planOnly`);
  }
  console.log("");

  // ── Test 7: No retired skill IDs in any active plan ──
  console.log("Test 7: No retired skill IDs in active plans (C03-C cutover)");
  const retiredIds = [
    "sdlc-requirement-normalizer", "sdlc-specification-writer", "sdlc-solution-reviewer",
    "sdlc-solution-challenger", "sdlc-implementation-recorder", "sdlc-code-review-excellence",
    "sdlc-code-review-normalizer", "sdlc-test-feedback-classifier", "sdlc-test-feedback-sync",
    "sdlc-gate-runner", "sdlc-speckit-pipeline", "sdlc-speckit-specify", "sdlc-speckit-clarify",
    "sdlc-speckit-plan", "sdlc-speckit-tasks", "sdlc-speckit-analyze", "sdlc-speckit-implement",
    "sdlc-speckit-sync", "sdlc-speckit-code-doc-reconcile", "sdlc-speckit-checklist",
  ];
  for (const plan of [globalPlan, directPlan]) {
    for (const stage of plan.stages) {
      if (stage.skill) {
        assert(!retiredIds.includes(stage.skill), `${plan.flowId}: ${stage.skill} is not a retired ID`);
      }
    }
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
