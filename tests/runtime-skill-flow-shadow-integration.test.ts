// Regression Test — Runtime Skill Flow Shadow Integration (Sidecar)
// ==================================================================
// Verifies the feature-flagged shadow integration does not change
// default runtime behavior and is sidecar-only when enabled.
// Must save/restore env vars in try/finally.

import { run } from "../runtime";

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

  const originalFlag = process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION;

  try {
    console.log("Runtime Skill Flow Shadow Integration Test\n");

    // ── Test 1: Disabled by default ──
    console.log("Test 1: Disabled by default — no sidecar field");
    delete process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION;
    const defaultResult = await run("simple user login form validation");
    assert(defaultResult.final_status === "success", "final status is success");
    assert(defaultResult.skill_flow_shadow_integration === undefined,
      "no skill_flow_shadow_integration when disabled");
    assert(!("skill_flow_shadow_integration" in defaultResult), "sidecar key absent when disabled");
    assert(defaultResult.execution_trace.length > 0, "execution_trace exists");
    assert(defaultResult.artifacts.length > 0, "artifacts exist");
    assert(defaultResult.feedback !== undefined, "feedback exists");
    console.log("");

    // ── Test 2: Enabled shadow integration ──
    console.log("Test 2: Enabled shadow integration as sidecar");
    process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION = "shadow";
    const enabledResult = await run("simple user login form validation");
    assert(enabledResult.final_status === "success", "final status is success");
    const sfsi = enabledResult.skill_flow_shadow_integration;
    assert(sfsi !== undefined, "skill_flow_shadow_integration exists");
    assert(sfsi!.enabled === true, "integration enabled");
    assert(sfsi!.decision === "enabled_shadow_only", "decision is enabled_shadow_only");
    assert(sfsi!.mode === "shadow_only", "mode is shadow_only");
    assert(sfsi!.shadowPlanCreated === true, "shadow plan created");
    assert(sfsi!.shadowExecutionCreated === true, "shadow execution created");
    assert(sfsi!.affectsRuntimeRouting === false, "does not affect routing");
    assert(sfsi!.affectsAgentSelection === false, "does not affect agent selection");
    assert(sfsi!.invokesRealAgents === false, "does not invoke real agents");
    assert(sfsi!.invokesRealSkills === false, "does not invoke real skills");
    assert(sfsi!.writesFiles === false, "does not write files");
    // Audit trail
    const audit = sfsi!.auditTrail;
    assert(audit !== undefined, "audit trail exists");
    assert(audit!.auditMode === "runtime_sidecar_shadow", "audit mode is runtime_sidecar_shadow");
    assert(audit!.evaluated === true, "audit evaluated");
    assert(audit!.enabled === true, "audit enabled");
    assert(audit!.featureFlag === "SDLC_SKILL_FLOW_RUNTIME_INTEGRATION", "feature flag captured");
    assert(audit!.featureFlagValue === "shadow", "feature flag value captured");
    assert(audit!.triggerNode === "runtime-completed", "trigger node captured");
    assert(audit!.reason === "feature-flagged runtime shadow comparison", "reason captured");
    assert(audit!.flowId === "main_docflow", "flowId captured");
    assert(audit!.requirementId === enabledResult.requirement_id, "requirementId matches");
    assert(audit!.inputArtifactCount === enabledResult.artifacts.length, "input artifact count matches");
    assert(audit!.affectsRuntimeRouting === false, "audit: no routing");
    assert(audit!.affectsAgentSelection === false, "audit: no agent selection");
    assert(audit!.affectsFinalStatus === false, "audit: no final status effect");
    assert(audit!.affectsRuntimeTrace === false, "audit: no trace effect");
    assert(audit!.mergesArtifactsIntoRuntime === false, "audit: no merge");
    assert(audit!.invokesRealAgents === false, "audit: no real agents");
    assert(audit!.invokesRealSkills === false, "audit: no real skills");
    assert(audit!.writesFiles === false, "audit: no file writes");
    console.log("");

    // ── Test 3: Final status unchanged ──
    console.log("Test 3: Final status unchanged with integration enabled");
    assert(enabledResult.final_status === "success", "enabled final status is success");
    console.log("");

    // ── Test 4: Trace order unchanged ──
    console.log("Test 4: Trace order unchanged");
    const nodes = enabledResult.execution_trace.map((t) => t.node) as string[];
    const expected = ["requirement-summary", "tech-design", "review", "implementation", "code-review", "validation"];
    let pos = 0;
    for (const exp of expected) {
      const idx = nodes.indexOf(exp, pos);
      assert(idx >= pos, `"${exp}" appears at expected position`);
      if (idx >= 0) pos = idx + 1;
    }
    console.log("");

    // ── Test 5: Artifacts unchanged ──
    console.log("Test 5: Runtime artifacts unchanged");
    assert(enabledResult.artifacts.length > 0, "artifacts exist");
    const aTypes = enabledResult.artifacts.map((a) => a.type);
    assert(aTypes.includes("requirement_summary"), "has requirement_summary");
    assert(aTypes.includes("code_review"), "has code_review");
    assert(aTypes.includes("validation_report"), "has validation_report");
    console.log("");

    // ── Test 6: Invalid flag remains disabled ──
    console.log("Test 6: Invalid flag does not attach sidecar");
    process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION = "real";
    const invalidResult = await run("simple user login form validation");
    assert(invalidResult.final_status === "success", "final status is success");
    assert(invalidResult.skill_flow_shadow_integration === undefined,
      "no sidecar for invalid flag value");
    assert(!("skill_flow_shadow_integration" in invalidResult), "sidecar key absent for invalid flag");
    console.log("");

  } finally {
    if (originalFlag === undefined) {
      delete process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION;
    } else {
      process.env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION = originalFlag;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
