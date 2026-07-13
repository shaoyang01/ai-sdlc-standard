// Regression Test - Hermes Gateway Real Dispatch Phase-2 Expansion Contract
// ========================================================================
// Contract-only. No phase-2 execution, no request type expansion, no flag enablement, no Gateway/Runtime behavior change.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-expansion-contract";
import * as fs from "node:fs";
import * as path from "node:path";

function assertSameArray(actual: readonly string[], expected: readonly string[], assert: (c: boolean, m: string) => void, message: string) {
  assert(actual.length === expected.length && expected.every((v, i) => actual[i] === v), message);
}

function readFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readFilesRecursively(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function test() {
  let passed = 0;
  let failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Real Dispatch Phase-2 Expansion Contract Test\n");

  const c = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Hermes Gateway Real Dispatch Phase-2 Expansion Contract", "name");
  assert(c.adapter === "hermes", "adapter");
  assert(c.scope === "gateway_real_dispatch_sidecar_phase_2_expansion_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Validation Checklist", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(c.contractOnly === true, "contract only");
  assert(c.executingNow === false, "not executing");
  assert(c.expandsRequestTypesNow === false, "does not expand request types");
  assert(c.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(c.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(c.changesGatewayBehaviorNow === false, "no Gateway behavior change");
  assert(c.addsEnablementScripts === false, "no enablement scripts");
  assert(c.changesCiBehavior === false, "no CI behavior change");
  console.log("");

  console.log("Test 3: prerequisite dependency");
  assert(c.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "required readiness");
  assert(c.rolloutPlanStatusRequired === "plan_only", "required rollout plan");
  assert(c.rolloutValidationChecklistStatusRequired === "checklist_only", "required checklist");
  assert(c.operatorRunbookStatusRequired === "runbook_only", "required runbook");
  assert(c.postEnablementReviewTemplateStatusRequired === "template_only", "required post-enablement template");
  assert(c.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current readiness");
  assert(c.currentRolloutPlanStatus === "plan_only", "current rollout plan");
  assert(c.currentRolloutValidationChecklistStatus === "checklist_only", "current checklist");
  assert(c.currentOperatorRunbookStatus === "runbook_only", "current runbook");
  assert(c.currentPostEnablementReviewTemplateStatus === "template_only", "current post-enablement template");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(c.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(c.fallbackPolicyField === "fallbackPolicy", "fallback field");
  assert(c.observabilityField === "observability", "observability field");
  assert(c.guardrailsField === "guardrails", "guardrails field");
  assert(c.defaultDisabled === true, "default disabled");
  assert(c.featureFlagged === true, "feature flagged");
  assert(c.requiresMultipleFlags === true, "requires multiple flags");
  assertSameArray(c.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 5: request type scope");
  assertSameArray(c.currentValidatedRequestTypes, ["review"], assert, "current validated request types");
  assertSameArray(c.phase2ExpansionTargets, ["code_review", "validation"], assert, "phase-2 expansion targets");
  assertSameArray(c.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(c.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: operator/automation constraints");
  assert(c.operatorApprovalRequired === true, "operator approval required");
  assert(c.automaticEnablementAllowed === false, "automatic enablement not allowed");
  assert(c.rolloutMayProceedAutomatically === false, "rollout cannot proceed automatically");
  assert(c.phase2MayProceedAutomatically === false, "phase-2 cannot proceed automatically");
  console.log("");

  console.log("Test 7: behavior safety and ownership");
  assert(c.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(c.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(c.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(c.changesRuntimeRouting === false, "no Runtime routing change");
  assert(c.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(c.makesHermesDefault === false, "Hermes not default");
  assert(c.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(c.makesHermesFinalCodeReviewOwner === false, "Hermes not code review owner");
  assert(c.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 8: persistence/leakage");
  assert(c.writesFiles === false, "no writes");
  assert(c.persistsExpansionLogs === false, "no expansion logs");
  assert(c.persistsReviewLogs === false, "no review logs");
  assert(c.persistsRolloutLogs === false, "no rollout logs");
  assert(c.persistsAudit === false, "no audit persistence");
  assert(c.persistsObservability === false, "no observability persistence");
  assert(c.persistsGuardrails === false, "no guardrail persistence");
  assert(c.containsRawPrompt === false, "no raw prompt");
  assert(c.containsRawArtifacts === false, "no raw artifacts");
  assert(c.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 9: expansion targets");
  assert(c.expansionTargets.length === 2, "exactly 2 expansion targets");
  const targetTypes = c.expansionTargets.map(t => t.requestType);
  assert(targetTypes.includes("code_review") && targetTypes.includes("validation"), "targets are code_review and validation");
  for (const target of c.expansionTargets) {
    assert(target.status === "contracted_not_enabled", `${target.requestType}: contracted not enabled`);
    assert(target.eligibleForFutureOperatorValidation === true, `${target.requestType}: eligible for future validation`);
    assert(target.enabledNow === false, `${target.requestType}: not enabled now`);
    assert(target.executesNow === false, `${target.requestType}: not executing now`);
    assert(target.finalDecisionOwner === false, `${target.requestType}: not final decision owner`);
    assert(target.sidecarOnly === true, `${target.requestType}: sidecar only`);
    assert(target.requiresSeparateOperatorApproval === true, `${target.requestType}: requires separate operator approval`);
    assert(target.requiresPostEnablementReviewForReviewScope === true, `${target.requestType}: requires post-enablement review`);
    assert(target.passCriteria.length > 0, `${target.requestType}: pass criteria`);
    assert(target.failCriteria.length > 0, `${target.requestType}: fail criteria`);
  }
  const codeReviewTarget = c.expansionTargets.find(t => t.requestType === "code_review");
  assert(codeReviewTarget!.failCriteria.some(f => f.includes("final code review decision")), "code_review fail: final code review decision");
  const validationTarget = c.expansionTargets.find(t => t.requestType === "validation");
  assert(validationTarget!.failCriteria.some(f => f.includes("final validation decision")), "validation fail: final validation decision");
  console.log("");

  console.log("Test 10: expansion gates");
  assert(c.expansionGates.length >= 7, "at least 7 gates");
  assert(c.requiredGateCount === c.expansionGates.length, "required gate count matches");
  for (const gate of c.expansionGates) {
    assert(gate.status === "required", `${gate.id}: required`);
    assert(gate.requiredBeforeExpansion === true, `${gate.id}: required before expansion`);
    assert(gate.executingNow === false, `${gate.id}: not executing`);
    assert(gate.expandsRequestTypesNow === false, `${gate.id}: does not expand request types`);
    assert(gate.enablesFeatureFlagsNow === false, `${gate.id}: no flags`);
    assert(gate.changesRuntimeBehaviorNow === false, `${gate.id}: no runtime behavior`);
    assert(gate.changesGatewayBehaviorNow === false, `${gate.id}: no Gateway behavior`);
    assertSameArray(gate.targetRequestTypes, ["code_review", "validation"], assert, `${gate.id}: target request types`);
    assert(gate.passCriteria.length > 0, `${gate.id}: pass criteria`);
    assert(gate.failCriteria.length > 0, `${gate.id}: fail criteria`);
  }
  const gateIds = c.expansionGates.map(g => g.id);
  for (const id of [
    "post_enablement_review_gate",
    "request_scope_gate",
    "sidecar_safety_gate",
    "gateway_runtime_safety_gate",
    "ownership_boundary_gate",
    "operator_approval_gate",
    "rollback_gate",
  ]) {
    assert(gateIds.includes(id), `gate: ${id}`);
  }
  console.log("");

  console.log("Test 11: constraints / evidence / outcomes");
  assert(c.contractConstraints.some(k => k.includes("contract-only")), "constraint: contract-only");
  assert(c.contractConstraints.some(k => k.includes("does not execute phase-2 expansion")), "constraint: does not execute phase-2 expansion");
  assert(c.contractConstraints.some(k => k.includes("does not change actual Gateway dispatch behavior")), "constraint: does not change Gateway dispatch behavior");
  assert(c.contractConstraints.some(k => k.includes("does not enable") && k.includes("feature flags")), "constraint: does not enable feature flags");
  assert(c.contractConstraints.some(k => k.includes("code_review") && k.includes("validation") && k.includes("only")), "constraint: phase-2 targets only");
  assert(c.contractConstraints.some(k => k.includes("review only")), "constraint: current validated request type review only");
  assert(c.contractConstraints.some(k => k.includes("sidecar metadata only")), "constraint: sidecar metadata only");
  assert(c.contractConstraints.some(k => k.includes("default-off")), "constraint: default-off");
  assert(c.contractConstraints.some(k => k.includes("final review") && k.includes("code_review") && k.includes("validation") && k.includes("owner")), "constraint: no final ownership");
  assert(c.contractConstraints.some(k => k.includes("final_status") && k.includes("routing")), "constraint: no Runtime final_status/routing dependency");
  assert(c.contractConstraints.some(k => k.includes("persist")), "constraint: no persistence");
  assert(c.contractConstraints.some(k => k.includes("raw prompt") && k.includes("raw artifact") && k.includes("secret") && k.includes("stdout") && k.includes("stderr") && k.includes("full CLI") && k.includes("full warning")), "constraint: raw/stdout/stderr/full CLI/full warning disallowed");
  assert(c.contractConstraints.some(k => k.includes("No automatic phase-2") || k.includes("automatic enablement")), "constraint: no automatic phase-2 expansion/enablement");
  for (const item of [
    "review-only post-enablement decision",
    "attach/omit summary",
    "fallbackPolicy reason/action summary",
    "observability outcome/count summary",
    "guardrail decision/check summary",
    "rollback/escalation summary",
    "operator approval reference",
  ]) {
    assert(c.requiredPostEnablementEvidence.some(e => e.includes(item)), `required evidence: ${item}`);
  }
  for (const item of [
    "raw prompts",
    "raw artifacts",
    "secrets",
    "stdout",
    "stderr",
    "full Hermes CLI output",
    "full warning text",
    "customer data",
    "credentials",
    "tokens",
    "unsanitized review payloads",
  ]) {
    assert(c.disallowedExpansionEvidence.includes(item), `disallowed evidence: ${item}`);
  }
  assertSameArray(c.allowedPhase2Outcomes, ["remain_review_only", "proceed_to_phase_2_validation_checklist", "rollback"], assert, "allowed phase-2 outcomes");
  assert(!c.allowedPhase2Outcomes.includes("auto_expand"), "outcome does not include auto_expand");
  assert(!c.allowedPhase2Outcomes.includes("enable_by_default"), "outcome does not include enable_by_default");
  assert(!c.allowedPhase2Outcomes.includes("make_hermes_primary_owner"), "outcome does not include make_hermes_primary_owner");
  assert(!c.allowedPhase2Outcomes.includes("make_hermes_final_code_review_owner"), "outcome does not include make_hermes_final_code_review_owner");
  assert(!c.allowedPhase2Outcomes.includes("make_hermes_final_validation_owner"), "outcome does not include make_hermes_final_validation_owner");
  console.log("");

  console.log("Test 12: evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-expansion-contract.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
  ]) {
    assert(c.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 13: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md", "utf-8");
  assert(md.includes("contract_only"), "md: status");
  assert(md.includes("Gateway real dispatch sidecar phase-2 expansion contract only"), "md: scope");
  assert(md.includes("This PR does not execute phase-2 expansion"), "md: no phase-2 execution");
  assert(md.includes("This PR does not expand request types now"), "md: no request type expansion");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  assert(md.includes("plan_only"), "md: rollout plan status");
  assert(md.includes("checklist_only"), "md: checklist status");
  assert(md.includes("runbook_only"), "md: runbook status");
  assert(md.includes("template_only"), "md: template status");
  assert(md.includes("code_review"), "md: code_review");
  assert(md.includes("validation"), "md: validation");
  for (const id of gateIds) {
    assert(md.includes(id), `md gate: ${id}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Validation Checklist"), "md: next PR");
  console.log("");

  console.log("Test 14: JSON consistency");
  const json = JSON.parse(fs.readFileSync("hermes-gateway-real-dispatch-phase-2-expansion-contract.json", "utf-8"));
  assert(json.status === c.status, "json: status");
  assert(json.contract_only === true, "json: contract only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.expands_request_types_now === false, "json: no request type expansion");
  assert(json.current_readiness_verdict === c.currentReadinessVerdict, "json: current readiness");
  assert(json.current_rollout_plan_status === c.currentRolloutPlanStatus, "json: rollout plan status");
  assert(json.current_rollout_validation_checklist_status === c.currentRolloutValidationChecklistStatus, "json: checklist status");
  assert(json.current_operator_runbook_status === c.currentOperatorRunbookStatus, "json: runbook status");
  assert(json.current_post_enablement_review_template_status === c.currentPostEnablementReviewTemplateStatus, "json: template status");
  assert(json.recommended_next_pr.title === c.recommendedNextPr, "json: next PR");
  assert(json.expansion_targets.length === c.expansionTargets.length, "json: expansion targets length");
  assert(json.expansion_gates.length === c.expansionGates.length, "json: expansion gates length");
  assert(json.required_gate_count === c.requiredGateCount, "json: required gate count");
  console.log("");

  console.log("Test 15: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts", "utf-8");
  const forbidden = [
    "runtime",
    "execution/gateway",
    "dispatchHermesGatewayReal",
    "executeHermesCliCommand",
    "runHermesGatewayShadowSidecar",
    "buildHermesRuntimeShadowAttachmentFromRequest",
    "child_process",
    "fs",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "codex",
  ];
  const badLines = src.split("\n").filter((line: string) => {
    if (!line.includes("import ")) return false;
    return forbidden.some(f => line.includes(f));
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log("Test 16: forbidden runtime/script/CI changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  const dispatchSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const postEnablementSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts", "utf-8");
  const packageJson = fs.readFileSync("package.json", "utf-8");
  assert(!runtimeSrc.includes("phase_2_expansion"), "runtime.ts no phase_2_expansion");
  assert(!gatewaySrc.includes("phase_2_expansion"), "execution/gateway.ts no phase_2_expansion");
  assert(!dispatchSrc.includes("phase_2_expansion"), "real dispatch no phase_2_expansion");
  assert(!postEnablementSrc.includes("phase_2_expansion"), "post-enablement template no phase_2_expansion");
  assert(!packageJson.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "package.json does not enable Hermes dispatch");
  for (const dir of [".github", "scripts"]) {
    const files = readFilesRecursively(dir);
    const enablingFiles = files.filter(file => fs.readFileSync(file, "utf-8").includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"));
    assert(enablingFiles.length === 0, `${dir}: no Hermes dispatch flag enablement`);
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
