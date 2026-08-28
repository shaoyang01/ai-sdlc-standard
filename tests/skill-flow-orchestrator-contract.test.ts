// Regression Test — Skill Flow Orchestrator Contract (Plan-only, Single-Track 7+1)
// =================================================================================
// Verifies the orchestrator produces correct plans without executing
// anything. Pure tests. No runtime, no agents, no DB, no Gateway.
// C03-E E0.5 update: direct_implementation_path success-condition assertions
// removed (dual-track retired per Decision-044/E0.2); only global entry
// flow and retired-flow rejection are tested.

import {
  planGlobalEntryFlow,
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

  console.log("Skill Flow Orchestrator Contract Test (Single-Track 7+1)\n");

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

  // ── Test 2: Retired flows return invalid ──
  console.log("Test 2: Retired flows return invalid (Decision-044 single-track)");
  const speckitPlan = planFlowById({ flowId: "speckit_pipeline", requirementId: "REQ-SP" });
  assert(speckitPlan.status === "invalid", "speckit_pipeline is invalid (retired)");
  assert(speckitPlan.stages.length === 0, "speckit_pipeline has no stages");
  const crPlan = planFlowById({ flowId: "code_review_subflow", requirementId: "REQ-CR" });
  assert(crPlan.status === "invalid", "code_review_subflow is invalid (retired, absorbed into code-review)");
  const tfPlan = planFlowById({ flowId: "test_feedback_subflow", requirementId: "REQ-TF" });
  assert(tfPlan.status === "invalid", "test_feedback_subflow is invalid (retired, absorbed into knowledge-sync)");
  console.log("");

  // ── Test 3: Unknown flow ──
  console.log("Test 3: Unknown flow");
  const unknownPlan = planFlowById({ flowId: "unknown_flow", requirementId: "REQ-X" });
  assert(unknownPlan.status === "invalid", "status is invalid");
  assert(unknownPlan.stages.length === 0, "no stages");
  assert(unknownPlan.warnings.some((w) => w.includes("Unknown flow")), "warning mentions Unknown flow");
  assert(unknownPlan.safety.planOnly === true, "planOnly remains true");
  console.log("");

  // ── Test 4: Previews carry explicit skill metadata only ──
  console.log("Test 4: Execution request previews");
  for (const stage of globalPlan.stages) {
    if (stage.kind === "skill" && stage.executionRequestPreview) {
      assert(stage.executionRequestPreview.skill === stage.skill, `${stage.skill}: preview skill matches`);
      assert(stage.executionRequestPreview.flowId === globalPlan.flowId, `${stage.skill}: preview flowId matches`);
      assert(stage.executionRequestPreview.requirementId === globalPlan.requirementId, `${stage.skill}: preview requirementId matches`);
    }
  }
  console.log("");

  // ── Test 5: No runtime side effects ──
  console.log("Test 5: No runtime side effects");
  assert(globalPlan.safety.changesRuntimeBehavior === false, `${globalPlan.flowId}: no runtime behavior change`);
  assert(globalPlan.safety.affectsRouting === false, `${globalPlan.flowId}: no routing effect`);
  assert(globalPlan.safety.affectsAgentSelection === false, `${globalPlan.flowId}: no agent selection effect`);
  assert(globalPlan.safety.planOnly === true, `${globalPlan.flowId}: planOnly`);
  console.log("");

  // ── Test 6: No retired skill IDs in active plan ──
  console.log("Test 6: No retired skill IDs in active plans (C03-C cutover)");
  const retiredIds = [
    "sdlc-requirement-normalizer", "sdlc-specification-writer", "sdlc-solution-reviewer",
    "sdlc-solution-challenger", "sdlc-implementation-recorder", "sdlc-code-review-excellence",
    "sdlc-code-review-normalizer", "sdlc-test-feedback-classifier", "sdlc-test-feedback-sync",
    "sdlc-gate-runner", "sdlc-speckit-pipeline", "sdlc-speckit-specify", "sdlc-speckit-clarify",
    "sdlc-speckit-plan", "sdlc-speckit-tasks", "sdlc-speckit-analyze", "sdlc-speckit-implement",
    "sdlc-speckit-sync", "sdlc-speckit-code-doc-reconcile", "sdlc-speckit-checklist",
  ];
  for (const stage of globalPlan.stages) {
    if (stage.skill) {
      assert(!retiredIds.includes(stage.skill), `${globalPlan.flowId}: ${stage.skill} is not a retired ID`);
    }
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
