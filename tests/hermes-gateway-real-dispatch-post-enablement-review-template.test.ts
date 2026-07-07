// Regression Test - Hermes Gateway Real Dispatch Post-Enablement Review Template
// ================================================================================
// Template-only. No data collection, log persistence, operator action execution, Gateway behavior change, Runtime behavior change, or real CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE,
} from "../execution/hermes-gateway-real-dispatch-post-enablement-review-template";
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
  console.log("Hermes Gateway Real Dispatch Post-Enablement Review Template Test\n");

  const t = HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE;

  console.log("Test 1: template object shape");
  assert(t.name === "Hermes Gateway Real Dispatch Post-Enablement Review Template", "name");
  assert(t.adapter === "hermes", "adapter");
  assert(t.scope === "gateway_real_dispatch_sidecar_post_enablement_review_template", "scope");
  assert(t.status === "template_only", "status");
  assert(t.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Expansion Contract", "next PR");
  console.log("");

  console.log("Test 2: non-execution / non-collection constraints");
  assert(t.templateOnly === true, "template only");
  assert(t.executingNow === false, "not executing");
  assert(t.collectsDataNow === false, "does not collect data");
  assert(t.persistsDataNow === false, "does not persist data");
  assert(t.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(t.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(t.changesGatewayBehaviorNow === false, "no Gateway behavior change");
  assert(t.addsEnablementScripts === false, "no enablement scripts");
  assert(t.changesCiBehavior === false, "no CI behavior change");
  console.log("");

  console.log("Test 3: prerequisite dependency");
  assert(t.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "required readiness");
  assert(t.rolloutPlanStatusRequired === "plan_only", "required rollout plan");
  assert(t.rolloutValidationChecklistStatusRequired === "checklist_only", "required checklist");
  assert(t.operatorRunbookStatusRequired === "runbook_only", "required runbook");
  assert(t.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current readiness");
  assert(t.currentRolloutPlanStatus === "plan_only", "current rollout plan");
  assert(t.currentRolloutValidationChecklistStatus === "checklist_only", "current checklist");
  assert(t.currentOperatorRunbookStatus === "runbook_only", "current runbook");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(t.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(t.fallbackPolicyField === "fallbackPolicy", "fallback field");
  assert(t.observabilityField === "observability", "observability field");
  assert(t.guardrailsField === "guardrails", "guardrails field");
  assert(t.defaultDisabled === true, "default disabled");
  assert(t.featureFlagged === true, "feature flagged");
  assert(t.requiresMultipleFlags === true, "requires multiple flags");
  assertSameArray(t.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 5: review/request scope");
  assertSameArray(t.reviewRequestTypes, ["review"], assert, "review request types");
  assertSameArray(t.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(t.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  assert(t.operatorApprovalRequired === true, "operator approval required");
  assert(t.automaticEnablementAllowed === false, "automatic enablement not allowed");
  assert(t.rolloutMayProceedAutomatically === false, "rollout cannot proceed automatically");
  console.log("");

  console.log("Test 6: behavior safety");
  assert(t.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(t.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(t.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(t.changesRuntimeRouting === false, "no Runtime routing change");
  assert(t.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(t.makesHermesDefault === false, "Hermes not default");
  assert(t.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(t.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 7: persistence/leakage");
  assert(t.writesFiles === false, "no writes");
  assert(t.persistsReviewLogs === false, "no review logs");
  assert(t.persistsRunbookLogs === false, "no runbook logs");
  assert(t.persistsValidationLogs === false, "no validation logs");
  assert(t.persistsRolloutLogs === false, "no rollout logs");
  assert(t.persistsAudit === false, "no audit persistence");
  assert(t.persistsObservability === false, "no observability persistence");
  assert(t.persistsGuardrails === false, "no guardrail persistence");
  assert(t.containsRawPrompt === false, "no raw prompt");
  assert(t.containsRawArtifacts === false, "no raw artifacts");
  assert(t.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 8: sections and fields");
  assert(t.sections.length >= 8, "at least 8 sections");
  assert(t.requiredSectionCount === t.sections.length, "required section count matches");
  for (const section of t.sections) {
    assert(section.status === "template", `${section.id}: template`);
    assert(section.executingNow === false, `${section.id}: not executing`);
    assert(section.collectsDataNow === false, `${section.id}: no data collection`);
    assert(section.persistsDataNow === false, `${section.id}: no data persistence`);
    assert(section.changesRuntimeBehaviorNow === false, `${section.id}: no runtime behavior`);
    assert(section.changesGatewayBehaviorNow === false, `${section.id}: no Gateway behavior`);
    assert(section.fields.length > 0, `${section.id}: fields`);
    assert(section.passCriteria.length > 0, `${section.id}: pass criteria`);
    assert(section.failCriteria.length > 0, `${section.id}: fail criteria`);
    for (const field of section.fields) {
      assert(field.required === true, `${field.id}: required`);
      assert(field.placeholderOnly === true, `${field.id}: placeholder only`);
      assert(field.collectsDataNow === false, `${field.id}: no data collection`);
      assert(field.persistsDataNow === false, `${field.id}: no data persistence`);
      assert(field.containsRawPromptAllowed === false, `${field.id}: no raw prompt`);
      assert(field.containsRawArtifactsAllowed === false, `${field.id}: no raw artifacts`);
      assert(field.containsSecretsAllowed === false, `${field.id}: no secrets`);
    }
  }
  const sectionIds = t.sections.map(s => s.id);
  for (const id of [
    "review_summary",
    "scope_confirmation",
    "sidecar_attach_omit_behavior",
    "gateway_runtime_safety",
    "fallback_policy_review",
    "observability_review",
    "guardrails_review",
    "rollback_and_escalation_review",
    "post_enablement_decision",
  ]) {
    assert(sectionIds.includes(id), `section: ${id}`);
  }
  console.log("");

  console.log("Test 9: placeholder and collection restrictions");
  assert(t.templateFieldsArePlaceholdersOnly === true, "template fields placeholders only");
  assert(t.rawPromptCollectionAllowed === false, "no raw prompt collection");
  assert(t.rawArtifactCollectionAllowed === false, "no raw artifact collection");
  assert(t.secretCollectionAllowed === false, "no secret collection");
  console.log("");

  console.log("Test 10: constraints / signals / disallowed evidence / outcomes");
  assert(t.reviewConstraints.some(c => c.includes("template-only")), "constraint: template-only");
  assert(t.reviewConstraints.some(c => c.includes("does not collect") || c.includes("no data collection")), "constraint: no data collection");
  assert(t.reviewConstraints.some(c => c.includes("does not persist") || c.includes("no log persistence")), "constraint: no log persistence");
  assert(t.reviewConstraints.some(c => c.includes("placeholders only")), "constraint: placeholders only");
  assert(t.reviewConstraints.some(c => c.includes("raw prompts") && c.includes("raw artifacts") && c.includes("secrets") && c.includes("stdout") && c.includes("stderr")), "constraint: no raw prompts/artifacts/secrets/stdout/stderr");
  assert(t.reviewConstraints.some(c => c.includes("sidecar metadata only")), "constraint: sidecar metadata only");
  assert(t.reviewConstraints.some(c => c.includes("default-off")), "constraint: default-off");
  assert(t.reviewConstraints.some(c => c.includes("review-only")), "constraint: review-only");
  assert(t.reviewConstraints.some(c => c.includes("phase-2") && c.includes("separate contract")), "constraint: phase-2 expansion requires separate contract");
  assert(t.reviewConstraints.some(c => c.includes("final review") && c.includes("validation owner")), "constraint: no final ownership");
  assert(t.reviewConstraints.some(c => c.includes("final_status") && c.includes("routing")), "constraint: no Runtime dependency");
  assert(t.reviewConstraints.some(c => c.includes("No automatic rollout") || c.includes("automatic enablement")), "constraint: no automatic rollout/enablement");
  assertSameArray(t.nonPersistedSignalsAllowed, [
    "fallbackPolicy.reason",
    "fallbackPolicy.action",
    "observability.outcome",
    "observability.warningCount",
    "observability.hasWarnings",
    "guardrails.decision",
    "guardrails.allowed",
    "guardrails.warningCount",
    "guardrails.checks",
  ], assert, "non-persisted signals");
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
  ]) {
    assert(t.disallowedEvidence.includes(item), `disallowed: ${item}`);
  }
  assertSameArray(t.reviewOutcomes, ["remain_current_phase", "rollback", "propose_phase_2_contract"], assert, "review outcomes");
  assert(!t.reviewOutcomes.includes("auto_expand"), "outcome does not include auto_expand");
  assert(!t.reviewOutcomes.includes("enable_by_default"), "outcome does not include enable_by_default");
  assert(!t.reviewOutcomes.includes("make_hermes_primary_owner"), "outcome does not include make_hermes_primary_owner");
  console.log("");

  console.log("Test 11: evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "hermes-gateway-real-dispatch-operator-runbook.json",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "tests/hermes-gateway-real-dispatch-post-enablement-review-template.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "hermes-gateway-real-dispatch-post-enablement-review-template.json",
  ]) {
    assert(t.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 12: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md", "utf-8");
  assert(md.includes("template_only"), "md: status");
  assert(md.includes("Gateway real dispatch sidecar post-enablement review template only"), "md: scope");
  assert(md.includes("This PR does not collect post-enablement data"), "md: no data collection");
  assert(md.includes("This PR does not persist review logs"), "md: no review logs");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  assert(md.includes("plan_only"), "md: rollout plan status");
  assert(md.includes("checklist_only"), "md: checklist status");
  assert(md.includes("runbook_only"), "md: runbook status");
  assert(md.includes("hermes_gateway_real_dispatch"), "md: gateway field");
  assert(md.includes("fallbackPolicy"), "md: fallback field");
  assert(md.includes("observability"), "md: observability field");
  assert(md.includes("guardrails"), "md: guardrails field");
  for (const id of sectionIds) {
    assert(md.includes(id), `md section: ${id}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Expansion Contract"), "md: next PR");
  console.log("");

  console.log("Test 13: JSON consistency");
  const json = JSON.parse(fs.readFileSync("hermes-gateway-real-dispatch-post-enablement-review-template.json", "utf-8"));
  assert(json.status === t.status, "json: status");
  assert(json.template_only === true, "json: template only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.collects_data_now === false, "json: no data collection");
  assert(json.persists_data_now === false, "json: no data persistence");
  assert(json.current_readiness_verdict === t.currentReadinessVerdict, "json: current readiness");
  assert(json.current_rollout_plan_status === t.currentRolloutPlanStatus, "json: rollout plan status");
  assert(json.current_rollout_validation_checklist_status === t.currentRolloutValidationChecklistStatus, "json: checklist status");
  assert(json.current_operator_runbook_status === t.currentOperatorRunbookStatus, "json: runbook status");
  assert(json.recommended_next_pr.title === t.recommendedNextPr, "json: next PR");
  assert(json.sections.length === t.sections.length, "json: section length");
  assert(json.required_section_count === t.requiredSectionCount, "json: required section count");
  console.log("");

  console.log("Test 14: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts", "utf-8");
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

  console.log("Test 15: forbidden runtime/script/CI changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  const dispatchSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const runbookSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch-operator-runbook.ts", "utf-8");
  const packageJson = fs.readFileSync("package.json", "utf-8");
  assert(!runtimeSrc.includes("post_enablement"), "runtime.ts no post_enablement");
  assert(!gatewaySrc.includes("post_enablement"), "execution/gateway.ts no post_enablement");
  assert(!dispatchSrc.includes("post_enablement"), "real dispatch no post_enablement");
  assert(!runbookSrc.includes("post_enablement"), "operator runbook no post_enablement");
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
