// Regression Test - Hermes Gateway Real Dispatch Operator Runbook
// ===============================================================
// Runbook-only. No operator action execution, flag enablement, Gateway behavior change, Runtime behavior change, or real CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK,
} from "../execution/hermes-gateway-real-dispatch-operator-runbook";
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
  console.log("Hermes Gateway Real Dispatch Operator Runbook Test\n");

  const r = HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK;

  console.log("Test 1: runbook object shape");
  assert(r.name === "Hermes Gateway Real Dispatch Operator Runbook", "name");
  assert(r.adapter === "hermes", "adapter");
  assert(r.scope === "gateway_real_dispatch_sidecar_operator_runbook", "scope");
  assert(r.status === "runbook_only", "status");
  assert(r.recommendedNextPr === "Hermes Gateway Real Dispatch Post-Enablement Review Template", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(r.runbookOnly === true, "runbook only");
  assert(r.executingNow === false, "not executing");
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
  assert(r.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current readiness");
  assert(r.currentRolloutPlanStatus === "plan_only", "current rollout plan");
  assert(r.currentRolloutValidationChecklistStatus === "checklist_only", "current checklist");
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

  console.log("Test 5: request type operator scope");
  assertSameArray(r.initialOperatorRequestTypes, ["review"], assert, "initial operator request types");
  assertSameArray(r.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(r.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: operator approval / automatic rollout");
  assert(r.operatorApprovalRequired === true, "operator approval required");
  assert(r.rolloutMayProceedAutomatically === false, "rollout cannot proceed automatically");
  assert(r.automaticEnablementAllowed === false, "automatic enablement not allowed");
  console.log("");

  console.log("Test 7: behavior safety");
  assert(r.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(r.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(r.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(r.changesRuntimeRouting === false, "no Runtime routing change");
  assert(r.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(r.makesHermesDefault === false, "Hermes not default");
  assert(r.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(r.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 8: persistence/leakage");
  assert(r.writesFiles === false, "no writes");
  assert(r.persistsRunbookLogs === false, "no runbook logs");
  assert(r.persistsValidationLogs === false, "no validation logs");
  assert(r.persistsRolloutLogs === false, "no rollout logs");
  assert(r.persistsAudit === false, "no audit persistence");
  assert(r.persistsObservability === false, "no observability persistence");
  assert(r.persistsGuardrails === false, "no guardrail persistence");
  assert(r.containsRawPrompt === false, "no raw prompt");
  assert(r.containsRawArtifacts === false, "no raw artifacts");
  assert(r.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 9: procedures");
  assert(r.procedures.length >= 6, "at least 6 procedures");
  assert(r.requiredProcedureCount === r.procedures.length, "required procedure count matches");
  for (const procedure of r.procedures) {
    assert(procedure.status === "documented", `${procedure.id}: documented`);
    assert(procedure.executingNow === false, `${procedure.id}: not executing`);
    assert(procedure.enablesFeatureFlagsNow === false, `${procedure.id}: no flags`);
    assert(procedure.changesRuntimeBehaviorNow === false, `${procedure.id}: no runtime behavior`);
    assert(procedure.changesGatewayBehaviorNow === false, `${procedure.id}: no Gateway behavior`);
    assert(procedure.steps.length > 0, `${procedure.id}: steps`);
    assert(procedure.successCriteria.length > 0, `${procedure.id}: success criteria`);
    assert(procedure.stopCriteria.length > 0, `${procedure.id}: stop criteria`);
  }
  const procedureIds = r.procedures.map(p => p.id);
  for (const id of [
    "pre_enablement_review",
    "manual_flag_enablement_reference",
    "sidecar_validation",
    "monitoring_signals_review",
    "rollback_procedure",
    "escalation_path",
  ]) {
    assert(procedureIds.includes(id), `procedure: ${id}`);
  }
  console.log("");

  console.log("Test 10: pre-enablement / manual notes / monitoring");
  assert(r.preEnablementChecks.some(c => c.includes("Readiness verdict")), "check: readiness verdict");
  assert(r.preEnablementChecks.some(c => c.includes("Controlled rollout plan")), "check: rollout plan");
  assert(r.preEnablementChecks.some(c => c.includes("Rollout validation checklist")), "check: checklist");
  assert(r.preEnablementChecks.some(c => c.includes("Operator approval")), "check: operator approval");
  assert(r.preEnablementChecks.some(c => c.includes("review only")), "check: review only");
  assert(r.preEnablementChecks.some(c => c.includes("All three required flags") && c.includes("manually supplied")), "check: manual flags");
  assert(r.preEnablementChecks.some(c => c.includes("No repository default") && c.includes("package script") && c.includes("CI") && c.includes("test")), "check: no repo default/script/CI/test");
  assert(r.preEnablementChecks.some(c => c.includes("Rollback owner")), "check: rollback owner");
  assert(r.manualEnablementNotes.some(n => n.includes("manual operator-managed enablement only")), "note: manual only");
  assert(r.manualEnablementNotes.some(n => n.includes("must not enable Hermes dispatch by default")), "note: not default");
  assert(r.manualEnablementNotes.some(n => n.includes("scripts or package commands")), "note: no scripts");
  assert(r.manualEnablementNotes.some(n => n.includes("three required flags") && n.includes("explicitly")), "note: explicit flags");
  assert(r.manualEnablementNotes.some(n => n.includes("review request type")), "note: initial review");
  assert(r.manualEnablementNotes.some(n => n.includes("Expansion") && n.includes("approval")), "note: expansion approval");
  for (const signal of [
    "fallbackPolicy.reason",
    "fallbackPolicy.action",
    "observability.outcome",
    "observability.warningCount",
    "observability.hasWarnings",
    "guardrails.decision",
    "guardrails.allowed",
    "guardrails.checks",
  ]) {
    assert(r.monitoringSignals.includes(signal), `monitoring: ${signal}`);
  }
  console.log("");

  console.log("Test 11: rollback / escalation / constraints");
  assert(r.rollbackTriggers.some(t => t.includes("Gateway primary result")), "rollback: Gateway primary");
  assert(r.rollbackTriggers.some(t => t.includes("Gateway final result")), "rollback: Gateway final");
  assert(r.rollbackTriggers.some(t => t.includes("Runtime final_status") && t.includes("routing")), "rollback: Runtime final_status/routing");
  assert(r.rollbackTriggers.some(t => t.includes("Unsupported request type")), "rollback: unsupported request type");
  assert(r.rollbackTriggers.some(t => t.includes("raw prompt") && t.includes("raw artifact") && t.includes("secret")), "rollback: raw prompt/artifact/secret");
  assert(r.rollbackTriggers.some(t => t.includes("Guardrails reject repeatedly")), "rollback: guardrails repeated reject");
  assert(r.rollbackTriggers.some(t => t.includes("persisted") && t.includes("observability") && t.includes("guardrail")), "rollback: persisted logs");
  assert(r.rollbackTriggers.some(t => t.includes("feature flag") && t.includes("enabled by default")), "rollback: flag default");
  assert(r.escalationTriggers.some(t => t.includes("Raw prompt") && t.includes("stdout") && t.includes("stderr")), "escalation: raw/stdout/stderr persistence");
  assert(r.escalationTriggers.some(t => t.includes("final review") && t.includes("validation decision")), "escalation: final decision");
  assert(r.escalationTriggers.some(t => t.includes("default") && t.includes("primary Gateway owner")), "escalation: default/primary owner");
  assert(r.escalationTriggers.some(t => t.includes("Runtime final_status") && t.includes("routing")), "escalation: runtime dependency");
  assert(r.escalationTriggers.some(t => t.includes("Unsupported request type") && t.includes("separate contract")), "escalation: unsupported without contract");
  assert(r.runbookConstraints.some(c => c.includes("runbook-only")), "constraint: runbook-only");
  assert(r.runbookConstraints.some(c => c.includes("does not enable Hermes feature flags")), "constraint: no flags");
  assert(r.runbookConstraints.some(c => c.includes("enablement scripts or package commands")), "constraint: no scripts/package commands");
  assert(r.runbookConstraints.some(c => c.includes("sidecar metadata only")), "constraint: sidecar only");
  assert(r.runbookConstraints.some(c => c.includes("default-off")), "constraint: default-off");
  assert(r.runbookConstraints.some(c => c.includes("review-only")), "constraint: review initial");
  assert(r.runbookConstraints.some(c => c.includes("Expansion") && c.includes("approval")), "constraint: expansion approval");
  assert(r.runbookConstraints.some(c => c.includes("final review or validation owner")), "constraint: no final ownership");
  assert(r.runbookConstraints.some(c => c.includes("final_status") && c.includes("routing")), "constraint: no runtime dependency");
  assert(r.runbookConstraints.some(c => c.includes("No validation") && c.includes("persist")), "constraint: no persistence");
  assert(r.runbookConstraints.some(c => c.includes("No automatic rollout") && c.includes("automatic enablement")), "constraint: no automatic rollout/enablement");
  console.log("");

  console.log("Test 12: evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "tests/hermes-gateway-real-dispatch-operator-runbook.test.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json",
  ]) {
    assert(r.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 13: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md", "utf-8");
  assert(md.includes("runbook_only"), "md: status");
  assert(md.includes("Gateway real dispatch sidecar operator runbook only"), "md: scope");
  assert(md.includes("This PR does not execute operator actions"), "md: no operator execution");
  assert(md.includes("This PR does not enable feature flags"), "md: no feature flags");
  assert(md.includes("This PR does not add enablement scripts"), "md: no enablement scripts");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  assert(md.includes("plan_only"), "md: rollout plan status");
  assert(md.includes("checklist_only"), "md: checklist status");
  for (const flag of r.requiredFlags) {
    assert(md.includes(flag), `md: ${flag}`);
  }
  for (const id of procedureIds) {
    assert(md.includes(id), `md procedure: ${id}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Post-Enablement Review Template"), "md: next PR");
  console.log("");

  console.log("Test 14: JSON consistency");
  const json = JSON.parse(fs.readFileSync("metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json", "utf-8"));
  assert(json.status === r.status, "json: status");
  assert(json.runbook_only === true, "json: runbook only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.adds_enablement_scripts === false, "json: no enablement scripts");
  assert(json.changes_ci_behavior === false, "json: no CI behavior");
  assert(json.current_readiness_verdict === r.currentReadinessVerdict, "json: current readiness");
  assert(json.current_rollout_plan_status === r.currentRolloutPlanStatus, "json: rollout plan status");
  assert(json.current_rollout_validation_checklist_status === r.currentRolloutValidationChecklistStatus, "json: checklist status");
  assert(json.recommended_next_pr.title === r.recommendedNextPr, "json: next PR");
  assert(json.procedures.length === r.procedures.length, "json: procedure length");
  assert(json.required_procedure_count === r.requiredProcedureCount, "json: required procedure count");
  console.log("");

  console.log("Test 15: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-operator-runbook.ts", "utf-8");
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
  const checklistSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts", "utf-8");
  const packageJson = fs.readFileSync("package.json", "utf-8");
  assert(!runtimeSrc.includes("operator_runbook"), "runtime.ts no operator_runbook");
  assert(!gatewaySrc.includes("operator_runbook"), "execution/gateway.ts no operator_runbook");
  assert(!dispatchSrc.includes("operator_runbook"), "real dispatch no operator_runbook");
  assert(!checklistSrc.includes("operator_runbook"), "rollout validation checklist no operator_runbook");
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
