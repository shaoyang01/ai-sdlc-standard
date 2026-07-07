// Regression Test - Hermes Gateway Real Dispatch Phase-2 Operator Runbook
// ========================================================================
// Runbook-only. No Phase-2 validation execution, no request type expansion, no flag enablement, no Gateway/Runtime behavior change.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK,
} from "../execution/hermes-gateway-real-dispatch-phase-2-operator-runbook";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Operator Runbook Test\n");

  const r = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK;

  console.log("Test 1: runbook object shape");
  assert(r.name === "Hermes Gateway Real Dispatch Phase-2 Operator Runbook", "name");
  assert(r.adapter === "hermes", "adapter");
  assert(r.scope === "gateway_real_dispatch_sidecar_phase_2_operator_runbook", "scope");
  assert(r.status === "runbook_only", "status");
  assert(r.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(r.runbookOnly === true, "runbook only");
  assert(r.executingNow === false, "not executing");
  assert(r.validatesNow === false, "not validating");
  assert(r.expandsRequestTypesNow === false, "does not expand request types");
  assert(r.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(r.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(r.changesGatewayBehaviorNow === false, "no Gateway behavior change");
  assert(r.addsEnablementScripts === false, "no enablement scripts");
  assert(r.changesCiBehavior === false, "no CI behavior change");
  console.log("");

  console.log("Test 3: prerequisite dependency");
  assert(r.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "required readiness");
  assert(r.rolloutPlanStatusRequired === "plan_only", "required rollout plan");
  assert(r.rolloutValidationChecklistStatusRequired === "checklist_only", "required checklist");
  assert(r.operatorRunbookStatusRequired === "runbook_only", "required runbook");
  assert(r.postEnablementReviewTemplateStatusRequired === "template_only", "required post-enablement template");
  assert(r.phase2ExpansionContractStatusRequired === "contract_only", "required phase-2 expansion contract");
  assert(r.phase2ValidationChecklistStatusRequired === "checklist_only", "required phase-2 validation checklist");
  assert(r.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current readiness");
  assert(r.currentRolloutPlanStatus === "plan_only", "current rollout plan");
  assert(r.currentRolloutValidationChecklistStatus === "checklist_only", "current checklist");
  assert(r.currentOperatorRunbookStatus === "runbook_only", "current runbook");
  assert(r.currentPostEnablementReviewTemplateStatus === "template_only", "current post-enablement template");
  assert(r.currentPhase2ExpansionContractStatus === "contract_only", "current phase-2 expansion contract");
  assert(r.currentPhase2ValidationChecklistStatus === "checklist_only", "current phase-2 validation checklist");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(r.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(r.fallbackPolicyField === "fallbackPolicy", "fallback field");
  assert(r.observabilityField === "observability", "observability field");
  assert(r.guardrailsField === "guardrails", "guardrails field");
  assert(r.defaultDisabled === true, "default disabled");
  assert(r.featureFlagged === true, "feature flagged");
  assert(r.requiresMultipleFlags === true, "requires multiple flags");
  assertSameArray(r.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 5: request type scope");
  assertSameArray(r.currentValidatedRequestTypes, ["review"], assert, "current validated request types");
  assertSameArray(r.phase2OperatorTargets, ["code_review", "validation"], assert, "phase-2 operator targets");
  assertSameArray(r.operatorTargets, ["code_review", "validation"], assert, "operator targets");
  assertSameArray(r.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(r.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: operator/automation constraints");
  assert(r.operatorApprovalRequired === true, "operator approval required");
  assert(r.automaticEnablementAllowed === false, "automatic enablement not allowed");
  assert(r.rolloutMayProceedAutomatically === false, "rollout cannot proceed automatically");
  assert(r.phase2MayProceedAutomatically === false, "phase-2 cannot proceed automatically");
  console.log("");

  console.log("Test 7: behavior safety and ownership");
  assert(r.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(r.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(r.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(r.changesRuntimeRouting === false, "no Runtime routing change");
  assert(r.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(r.makesHermesDefault === false, "Hermes not default");
  assert(r.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(r.makesHermesFinalCodeReviewOwner === false, "Hermes not code review owner");
  assert(r.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 8: persistence/leakage");
  assert(r.writesFiles === false, "no writes");
  assert(r.persistsPhase2RunbookLogs === false, "no phase-2 runbook logs");
  assert(r.persistsPhase2ValidationLogs === false, "no phase-2 validation logs");
  assert(r.persistsExpansionLogs === false, "no expansion logs");
  assert(r.persistsReviewLogs === false, "no review logs");
  assert(r.persistsRolloutLogs === false, "no rollout logs");
  assert(r.persistsAudit === false, "no audit persistence");
  assert(r.persistsObservability === false, "no observability persistence");
  assert(r.persistsGuardrails === false, "no guardrail persistence");
  assert(r.containsRawPrompt === false, "no raw prompt");
  assert(r.containsRawArtifacts === false, "no raw artifacts");
  assert(r.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 9: procedures");
  assert(r.procedures.length >= 7, "at least 7 procedures");
  assert(r.requiredProcedureCount === r.procedures.length, "required procedure count matches");
  for (const proc of r.procedures) {
    assert(proc.status === "documented", `${proc.id}: documented`);
    assert(proc.requiredBeforePhase2Enablement === true, `${proc.id}: required before phase-2`);
    assert(proc.executingNow === false, `${proc.id}: not executing`);
    assert(proc.validatesNow === false, `${proc.id}: not validating`);
    assert(proc.expandsRequestTypesNow === false, `${proc.id}: does not expand request types`);
    assert(proc.enablesFeatureFlagsNow === false, `${proc.id}: no flags`);
    assert(proc.changesRuntimeBehaviorNow === false, `${proc.id}: no runtime behavior`);
    assert(proc.changesGatewayBehaviorNow === false, `${proc.id}: no Gateway behavior`);
    assert(proc.steps.length > 0, `${proc.id}: steps`);
    assert(proc.successCriteria.length > 0, `${proc.id}: success criteria`);
    assert(proc.stopCriteria.length > 0, `${proc.id}: stop criteria`);
  }
  const procIds = r.procedures.map(p => p.id);
  for (const id of [
    "phase_2_pre_validation_review",
    "phase_2_manual_environment_reference",
    "code_review_sidecar_validation",
    "validation_sidecar_validation",
    "phase_2_monitoring_review",
    "phase_2_rollback_procedure",
    "phase_2_escalation_path",
  ]) {
    assert(procIds.includes(id), `procedure: ${id}`);
  }
  const generalProcs = r.procedures.filter(p =>
    p.id !== "code_review_sidecar_validation" && p.id !== "validation_sidecar_validation"
  );
  for (const proc of generalProcs) {
    assert(proc.targetRequestTypes.includes("code_review") && proc.targetRequestTypes.includes("validation"), `${proc.id}: targets code_review/validation`);
  }
  const crProc = r.procedures.find(p => p.id === "code_review_sidecar_validation");
  assert(crProc!.targetRequestTypes.length === 1 && crProc!.targetRequestTypes[0] === "code_review", "code_review_sidecar: targets code_review only");
  const valProc = r.procedures.find(p => p.id === "validation_sidecar_validation");
  assert(valProc!.targetRequestTypes.length === 1 && valProc!.targetRequestTypes[0] === "validation", "validation_sidecar: targets validation only");
  console.log("");

  console.log("Test 10: checks / notes / monitoring / evidence controls");
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("readiness verdict")), `pre-validation check: readiness`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("controlled rollout")), `pre-validation check: rollout`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("rollout validation checklist")), `pre-validation check: validation checklist`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("operator runbook")), `pre-validation check: runbook`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("post-enablement")), `pre-validation check: post-enablement template`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("phase-2 expansion contract")), `pre-validation check: phase-2 contract`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("phase-2 validation checklist")), `pre-validation check: phase-2 validation checklist`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("current validated") && c.toLowerCase().includes("review")), `pre-validation check: review only`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("code_review") && c.toLowerCase().includes("validation")), `pre-validation check: phase-2 targets`);
  assert(r.preValidationChecks.some(c => c.toLowerCase().includes("operator approval")), `pre-validation check: operator approval`);
  assert(r.manualEnvironmentNotes.some(n => n.includes("documentation-only")), "manual note: documentation-only");
  assert(r.manualEnvironmentNotes.some(n => n.includes("must not enable")), "manual note: must not enable by default");
  assert(r.manualEnvironmentNotes.some(n => n.includes("scripts") && n.includes("package") && n.includes("CI")), "manual note: no scripts/package/CI");
  assert(r.manualEnvironmentNotes.some(n => n.includes("three required flags")), "manual note: three flags manually");
  assert(r.manualEnvironmentNotes.some(n => n.includes("code_review") && n.includes("validation")), "manual note: phase-2 targets");
  assert(r.manualEnvironmentNotes.some(n => n.includes("llm_task") && n.includes("code_generation") && n.includes("bugfix")), "manual note: unsupported types");
  assertSameArray(r.allowedMonitoringSignals, [
    "fallbackPolicy.reason",
    "fallbackPolicy.action",
    "observability.outcome",
    "observability.warningCount",
    "observability.hasWarnings",
    "guardrails.decision",
    "guardrails.allowed",
    "guardrails.warningCount",
    "guardrails.checks",
  ], assert, "allowed monitoring signals");
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
    assert(r.disallowedOperatorEvidence.includes(item), `disallowed evidence: ${item}`);
  }
  console.log("");

  console.log("Test 11: rollback / escalation / outcomes / constraints");
  assert(r.rollbackTriggers.some(t => t.includes("final code review decision")), "rollback: final code review decision");
  assert(r.rollbackTriggers.some(t => t.includes("final validation decision")), "rollback: final validation decision");
  assert(r.rollbackTriggers.some(t => t.includes("Gateway primary result")), "rollback: Gateway primary result");
  assert(r.rollbackTriggers.some(t => t.includes("Gateway final result")), "rollback: Gateway final result");
  assert(r.rollbackTriggers.some(t => t.includes("final_status") || t.includes("routing")), "rollback: Runtime final_status/routing");
  assert(r.rollbackTriggers.some(t => t.includes("Unsupported")), "rollback: unsupported request type");
  assert(r.rollbackTriggers.some(t => t.includes("raw prompt") || t.includes("raw artifact") || t.includes("secret")), "rollback: raw prompt/artifact/secret");
  assert(r.rollbackTriggers.some(t => t.includes("Guardrails") && t.includes("reject")), "rollback: guardrails repeated reject");
  assert(r.rollbackTriggers.some(t => t.includes("persisted")), "rollback: persisted logs");
  assert(r.rollbackTriggers.some(t => t.includes("enabled by default")), "rollback: feature flag enabled by default");
  assert(r.escalationTriggers.some(t => t.includes("raw prompt") && t.includes("stdout") && t.includes("secret")), "escalation: raw/secret/stdout");
  assert(r.escalationTriggers.some(t => t.includes("final code_review") || t.includes("final validation")), "escalation: final code_review or validation decision");
  assert(r.escalationTriggers.some(t => t.includes("default") || t.includes("primary Gateway owner")), "escalation: Hermes default or primary Gateway");
  assert(r.escalationTriggers.some(t => t.includes("final_status") || t.includes("routing")), "escalation: Runtime final_status/routing dependency");
  assert(r.escalationTriggers.some(t => t.includes("bugfix") || t.includes("llm_task") || t.includes("code_generation")), "escalation: bugfix/llm_task/code_generation");
  assertSameArray(r.allowedOperatorOutcomes, ["remain_review_only", "complete_phase_2_operator_validation", "rollback", "propose_separate_ownership_contract"], assert, "allowed outcomes");
  for (const bad of ["auto_validate", "auto_expand", "enable_by_default", "make_hermes_primary_owner", "make_hermes_final_code_review_owner", "make_hermes_final_validation_owner"]) {
    assert(!r.allowedOperatorOutcomes.includes(bad), `outcome does not include ${bad}`);
  }
  assert(r.runbookConstraints.some(k => k.includes("runbook-only")), "constraint: runbook-only");
  assert(r.runbookConstraints.some(k => k.includes("does not execute Phase-2 validation")), "constraint: does not execute Phase-2 validation");
  assert(r.runbookConstraints.some(k => k.includes("does not expand request types now")), "constraint: does not expand request types");
  assert(r.runbookConstraints.some(k => k.includes("does not change actual Gateway dispatch behavior")), "constraint: does not change Gateway dispatch");
  assert(r.runbookConstraints.some(k => k.includes("does not enable") && k.includes("feature flags")), "constraint: does not enable feature flags");
  assert(r.runbookConstraints.some(k => k.includes("code_review") && k.includes("validation") && k.includes("only")), "constraint: phase-2 targets only");
  assert(r.runbookConstraints.some(k => k.includes("review only")), "constraint: current validated request type review only");
  assert(r.runbookConstraints.some(k => k.includes("sidecar metadata only")), "constraint: sidecar metadata only");
  assert(r.runbookConstraints.some(k => k.includes("default-off")), "constraint: default-off");
  assert(r.runbookConstraints.some(k => k.includes("final review") && k.includes("code_review") && k.includes("validation") && k.includes("owner")), "constraint: no final ownership");
  assert(r.runbookConstraints.some(k => k.includes("final_status") && k.includes("routing")), "constraint: no Runtime final_status/routing dependency");
  assert(r.runbookConstraints.some(k => k.includes("persist")), "constraint: no persistence");
  assert(r.runbookConstraints.some(k => k.includes("raw prompt") && k.includes("raw artifact") && k.includes("secret") && k.includes("stdout") && k.includes("stderr") && k.includes("full CLI") && k.includes("full warning")), "constraint: raw/stdout/stderr/full CLI/full warning disallowed");
  assert(r.runbookConstraints.some(k => k.includes("No automatic Phase-2") && k.includes("enablement")), "constraint: no automatic phase-2/enablement");
  console.log("");

  console.log("Test 12: evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts",
    "execution/hermes-gateway-real-dispatch-phase-2-validation-checklist.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "hermes-gateway-real-dispatch-operator-runbook.json",
    "hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
    "hermes-gateway-real-dispatch-phase-2-validation-checklist.json",
    "execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-operator-runbook.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK.md",
    "hermes-gateway-real-dispatch-phase-2-operator-runbook.json",
  ]) {
    assert(r.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 13: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK.md", "utf-8");
  assert(md.includes("runbook_only"), "md: status");
  assert(md.includes("Phase-2 operator"), "md: scope");
  assert(md.includes("does not execute Phase-2 validation"), "md: no phase-2 validation");
  assert(md.includes("This PR does not expand request types now"), "md: no request type expansion");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  assert(md.includes("plan_only"), "md: rollout plan status");
  assert(md.includes("checklist_only"), "md: checklist/validation status");
  assert(md.includes("runbook_only"), "md: runbook status");
  assert(md.includes("template_only"), "md: template status");
  assert(md.includes("contract_only"), "md: contract status");
  assert(md.includes("code_review"), "md: code_review");
  assert(md.includes("validation"), "md: validation");
  for (const id of procIds) {
    assert(md.includes(id), `md procedure: ${id}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template"), "md: next PR");
  console.log("");

  console.log("Test 14: JSON consistency");
  const json = JSON.parse(fs.readFileSync("hermes-gateway-real-dispatch-phase-2-operator-runbook.json", "utf-8"));
  assert(json.status === r.status, "json: status");
  assert(json.runbook_only === true, "json: runbook only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.validates_now === false, "json: not validating");
  assert(json.expands_request_types_now === false, "json: no request type expansion");
  assert(json.current_readiness_verdict === r.currentReadinessVerdict, "json: current readiness");
  assert(json.current_rollout_plan_status === r.currentRolloutPlanStatus, "json: rollout plan status");
  assert(json.current_rollout_validation_checklist_status === r.currentRolloutValidationChecklistStatus, "json: checklist status");
  assert(json.current_operator_runbook_status === r.currentOperatorRunbookStatus, "json: runbook status");
  assert(json.current_post_enablement_review_template_status === r.currentPostEnablementReviewTemplateStatus, "json: template status");
  assert(json.current_phase_2_expansion_contract_status === r.currentPhase2ExpansionContractStatus, "json: phase-2 expansion contract status");
  assert(json.current_phase_2_validation_checklist_status === r.currentPhase2ValidationChecklistStatus, "json: phase-2 validation checklist status");
  assert(json.recommended_next_pr.title === r.recommendedNextPr, "json: next PR");
  assert(json.procedures.length === r.procedures.length, "json: procedures length");
  assert(json.required_procedure_count === r.requiredProcedureCount, "json: required procedure count");
  console.log("");

  console.log("Test 15: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts", "utf-8");
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
  const packageJson = fs.readFileSync("package.json", "utf-8");
  assert(!runtimeSrc.includes("phase_2_operator"), "runtime.ts no phase_2_operator");
  assert(!gatewaySrc.includes("phase_2_operator"), "execution/gateway.ts no phase_2_operator");
  assert(!dispatchSrc.includes("phase_2_operator"), "real dispatch no phase_2_operator");
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
