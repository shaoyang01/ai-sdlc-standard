import { HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE } from "../execution/hermes-gateway-real-dispatch-phase-2-post-validation-review-template";
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
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
  console.log("Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template Test\n");
  const t = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE;

  console.log("Test 1: template object shape");
  assert(t.name === "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template", "name");
  assert(t.adapter === "hermes", "adapter");
  assert(t.scope === "gateway_real_dispatch_sidecar_phase_2_post_validation_review_template", "scope");
  assert(t.status === "template_only", "status");
  assert(t.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Final Readiness Review", "next PR");
  console.log("");

  console.log("Test 2: non-execution / non-collection constraints");
  assert(t.templateOnly === true, "template only");
  assert(t.executingNow === false, "not executing");
  assert(t.collectsDataNow === false, "not collecting");
  assert(t.persistsDataNow === false, "not persisting");
  assert(t.validatesNow === false, "not validating");
  assert(t.expandsRequestTypesNow === false, "not expanding");
  assert(t.enablesFeatureFlagsNow === false, "no flags");
  assert(t.changesRuntimeBehaviorNow === false, "no runtime");
  assert(t.changesGatewayBehaviorNow === false, "no gateway");
  assert(t.addsEnablementScripts === false, "no scripts");
  assert(t.changesCiBehavior === false, "no CI");
  console.log("");

  console.log("Test 3: prerequisite dependency");
  assert(t.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "req readiness");
  assert(t.rolloutPlanStatusRequired === "plan_only", "req rollout");
  assert(t.rolloutValidationChecklistStatusRequired === "checklist_only", "req checklist");
  assert(t.operatorRunbookStatusRequired === "runbook_only", "req runbook");
  assert(t.postEnablementReviewTemplateStatusRequired === "template_only", "req post-enablement");
  assert(t.phase2ExpansionContractStatusRequired === "contract_only", "req phase-2 contract");
  assert(t.phase2ValidationChecklistStatusRequired === "checklist_only", "req phase-2 checklist");
  assert(t.phase2OperatorRunbookStatusRequired === "runbook_only", "req phase-2 runbook");
  assert(t.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "cur readiness");
  assert(t.currentRolloutPlanStatus === "plan_only", "cur rollout");
  assert(t.currentRolloutValidationChecklistStatus === "checklist_only", "cur checklist");
  assert(t.currentOperatorRunbookStatus === "runbook_only", "cur runbook");
  assert(t.currentPostEnablementReviewTemplateStatus === "template_only", "cur post-enablement");
  assert(t.currentPhase2ExpansionContractStatus === "contract_only", "cur phase-2 contract");
  assert(t.currentPhase2ValidationChecklistStatus === "checklist_only", "cur phase-2 checklist");
  assert(t.currentPhase2OperatorRunbookStatus === "runbook_only", "cur phase-2 runbook");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(t.gatewayField === "hermes_gateway_real_dispatch", "gateway");
  assert(t.fallbackPolicyField === "fallbackPolicy", "fallback");
  assert(t.observabilityField === "observability", "obs");
  assert(t.guardrailsField === "guardrails", "guard");
  assert(t.defaultDisabled === true, "default off");
  assert(t.featureFlagged === true, "flagged");
  assert(t.requiresMultipleFlags === true, "multi flags");
  assertSameArray(t.requiredFlags, ["SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled","SDLC_HERMES_GATEWAY_INTEGRATION=enabled","SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"], assert, "flags");
  console.log("");

  console.log("Test 5: request type scope");
  assertSameArray(t.currentValidatedRequestTypes, ["review"], assert, "current");
  assertSameArray(t.phase2ReviewTargets, ["code_review","validation"], assert, "phase-2 targets");
  assertSameArray(t.reviewTargets, ["code_review","validation"], assert, "review targets");
  assertSameArray(t.supportedRequestTypes, ["review","code_review","validation"], assert, "supported");
  assertSameArray(t.unsupportedRequestTypes, ["llm_task","code_generation","bugfix"], assert, "unsupported");
  console.log("");

  console.log("Test 6: operator/automation constraints");
  assert(t.operatorApprovalRequired === true, "operator approval");
  assert(t.automaticEnablementAllowed === false, "no auto enable");
  assert(t.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(t.phase2MayProceedAutomatically === false, "no auto phase-2");
  console.log("");

  console.log("Test 7: behavior safety");
  assert(t.changesGatewayPrimaryDispatch === false, "no primary");
  assert(t.changesGatewayFinalResult === false, "no final");
  assert(t.changesRuntimeFinalStatus === false, "no status");
  assert(t.changesRuntimeRouting === false, "no routing");
  assert(t.affectsPrimaryGatewayResult === false, "no affect");
  assert(t.makesHermesDefault === false, "not default");
  assert(t.makesHermesFinalReviewOwner === false, "not review owner");
  assert(t.makesHermesFinalCodeReviewOwner === false, "not cr owner");
  assert(t.makesHermesFinalValidationOwner === false, "not val owner");
  console.log("");

  console.log("Test 8: persistence/leakage");
  assert(t.writesFiles === false, "no write");
  assert(t.persistsPhase2PostValidationReviewLogs === false, "no review logs");
  assert(t.persistsPhase2RunbookLogs === false, "no runbook logs");
  assert(t.persistsPhase2ValidationLogs === false, "no val logs");
  assert(t.persistsExpansionLogs === false, "no exp logs");
  assert(t.persistsReviewLogs === false, "no rev logs");
  assert(t.persistsRolloutLogs === false, "no roll logs");
  assert(t.persistsAudit === false, "no audit");
  assert(t.persistsObservability === false, "no obs");
  assert(t.persistsGuardrails === false, "no guard");
  assert(t.containsRawPrompt === false, "no prompt");
  assert(t.containsRawArtifacts === false, "no artifacts");
  assert(t.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 9: sections and fields");
  assert(t.sections.length >= 8, "sections count");
  assert(t.requiredSectionCount === t.sections.length, "section count matches");
  for (const s of t.sections) {
    assert(s.status === "template", `${s.id}: template`);
    assert(s.executingNow === false, `${s.id}: no exec`);
    assert(s.collectsDataNow === false, `${s.id}: no collect`);
    assert(s.persistsDataNow === false, `${s.id}: no persist`);
    assert(s.changesRuntimeBehaviorNow === false, `${s.id}: no runtime`);
    assert(s.changesGatewayBehaviorNow === false, `${s.id}: no gateway`);
    assert(s.fields.length > 0, `${s.id}: fields`);
    assert(s.passCriteria.length > 0, `${s.id}: pass`);
    assert(s.failCriteria.length > 0, `${s.id}: fail`);
    for (const f of s.fields) {
      assert(f.required === true, `${s.id}/${f.id}: required`);
      assert(f.placeholderOnly === true, `${s.id}/${f.id}: placeholder`);
      assert(f.collectsDataNow === false, `${s.id}/${f.id}: no collect`);
      assert(f.persistsDataNow === false, `${s.id}/${f.id}: no persist`);
      assert(f.containsRawPromptAllowed === false, `${s.id}/${f.id}: no prompt`);
      assert(f.containsRawArtifactsAllowed === false, `${s.id}/${f.id}: no artifacts`);
      assert(f.containsSecretsAllowed === false, `${s.id}/${f.id}: no secrets`);
    }
  }
  const ids = t.sections.map(s => s.id);
  for (const id of ["phase_2_review_summary","target_scope_confirmation","code_review_review_section","validation_review_section","sidecar_behavior_review","gateway_runtime_safety_review","monitoring_review","rollback_and_escalation_review","phase_2_review_decision"]) {
    assert(ids.includes(id), `section: ${id}`);
  }
  const genSecs = t.sections.filter(s => s.id !== "code_review_review_section" && s.id !== "validation_review_section");
  for (const s of genSecs) assert(s.targetRequestTypes.includes("code_review") && s.targetRequestTypes.includes("validation"), `${s.id}: both targets`);
  assert(t.sections.find(s => s.id === "code_review_review_section")!.targetRequestTypes[0] === "code_review" && t.sections.find(s => s.id === "code_review_review_section")!.targetRequestTypes.length === 1, "code_review: single target");
  assert(t.sections.find(s => s.id === "validation_review_section")!.targetRequestTypes[0] === "validation" && t.sections.find(s => s.id === "validation_review_section")!.targetRequestTypes.length === 1, "validation: single target");
  console.log("");

  console.log("Test 10: placeholders / monitoring / evidence / outcomes");
  assert(t.templateFieldsArePlaceholdersOnly === true, "placeholders only");
  assert(t.rawPromptCollectionAllowed === false, "no prompt collect");
  assert(t.rawArtifactCollectionAllowed === false, "no artifact collect");
  assert(t.secretCollectionAllowed === false, "no secret collect");
  assertSameArray(t.allowedMonitoringSignals, ["fallbackPolicy.reason","fallbackPolicy.action","observability.outcome","observability.warningCount","observability.hasWarnings","guardrails.decision","guardrails.allowed","guardrails.warningCount","guardrails.checks"], assert, "signals");
  for (const item of ["raw prompts","raw artifacts","secrets","stdout","stderr","full Hermes CLI output","full warning text","customer data","credentials","tokens","unsanitized review payloads"]) assert(t.disallowedReviewEvidence.includes(item), `disallowed: ${item}`);
  assertSameArray(t.allowedReviewOutcomes, ["remain_review_only","proceed_to_phase_2_final_readiness_review","rollback","propose_separate_ownership_contract"], assert, "outcomes");
  for (const bad of ["auto_validate","auto_expand","enable_by_default","make_hermes_primary_owner","make_hermes_final_code_review_owner","make_hermes_final_validation_owner"]) assert(!t.allowedReviewOutcomes.includes(bad), `no ${bad}`);
  console.log("");

  console.log("Test 11: review constraints");
  assert(t.reviewConstraints.some(k => k.includes("template-only")), "c: template-only");
  assert(t.reviewConstraints.some(k => k.includes("does not collect Phase-2")), "c: no collect");
  assert(t.reviewConstraints.some(k => k.includes("does not persist Phase-2")), "c: no persist");
  assert(t.reviewConstraints.some(k => k.includes("does not execute Phase-2")), "c: no execute");
  assert(t.reviewConstraints.some(k => k.includes("does not expand request types")), "c: no expand");
  assert(t.reviewConstraints.some(k => k.includes("does not change actual Gateway")), "c: no gw change");
  assert(t.reviewConstraints.some(k => k.includes("does not enable") && k.includes("feature flags")), "c: no flags");
  assert(t.reviewConstraints.some(k => k.includes("does not add enablement scripts")), "c: no scripts");
  assert(t.reviewConstraints.some(k => k.includes("code_review") && k.includes("validation") && k.includes("only")), "c: targets");
  assert(t.reviewConstraints.some(k => k.includes("review only")), "c: review only");
  assert(t.reviewConstraints.some(k => k.includes("sidecar metadata only")), "c: sidecar");
  assert(t.reviewConstraints.some(k => k.includes("default-off")), "c: default-off");
  assert(t.reviewConstraints.some(k => k.includes("final review") && k.includes("code_review") && k.includes("validation") && k.includes("owner")), "c: no ownership");
  assert(t.reviewConstraints.some(k => k.includes("final_status") && k.includes("routing")), "c: no runtime dep");
  assert(t.reviewConstraints.some(k => k.includes("persist")), "c: no persist");
  assert(t.reviewConstraints.some(k => k.includes("raw prompt") && k.includes("raw artifact") && k.includes("secret") && k.includes("stdout") && k.includes("stderr") && k.includes("full CLI") && k.includes("full warning")), "c: raw/stdout/full CLI");
  assert(t.reviewConstraints.some(k => k.includes("No automatic Phase-2") && k.includes("enablement")), "c: no auto");
  console.log("");

  console.log("Test 12: evidence");
  const expected = ["execution/hermes-gateway-real-dispatch-readiness-review.ts","execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts","execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts","execution/hermes-gateway-real-dispatch-operator-runbook.ts","execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts","execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts","execution/hermes-gateway-real-dispatch-phase-2-validation-checklist.ts","execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts","HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md","HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md","HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md","HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md","HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md","HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md","HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST.md","HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK.md","hermes-gateway-real-dispatch-readiness-review.json","hermes-gateway-real-dispatch-controlled-rollout-plan.json","hermes-gateway-real-dispatch-rollout-validation-checklist.json","hermes-gateway-real-dispatch-operator-runbook.json","hermes-gateway-real-dispatch-post-enablement-review-template.json","hermes-gateway-real-dispatch-phase-2-expansion-contract.json","hermes-gateway-real-dispatch-phase-2-validation-checklist.json","hermes-gateway-real-dispatch-phase-2-operator-runbook.json","execution/hermes-gateway-real-dispatch-phase-2-post-validation-review-template.ts","tests/hermes-gateway-real-dispatch-phase-2-post-validation-review-template.test.ts","HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE.md","hermes-gateway-real-dispatch-phase-2-post-validation-review-template.json"];
  for (const f of expected) assert(t.evidence.includes(f), `evidence: ${f}`);
  console.log("");

  console.log("Test 13: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE.md","utf-8");
  assert(md.includes("template_only"),"md: status");
  assert(md.includes("Phase-2 post-validation"),"md: scope");
  assert(md.includes("does not collect Phase-2") || md.includes("does not collect"),"md: no collect");
  assert(md.includes("does not execute"),"md: no execute");
  assert(md.includes("READY_WITH_CONSTRAINTS"),"md: readiness");
  assert(md.includes("code_review"),"md: cr");
  assert(md.includes("validation"),"md: val");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Final Readiness Review"),"md: next PR");
  console.log("");

  console.log("Test 14: JSON consistency");
  const json = JSON.parse(fs.readFileSync("hermes-gateway-real-dispatch-phase-2-post-validation-review-template.json","utf-8"));
  assert(json.status === t.status,"json: status");
  assert(json.template_only === true,"json: template");
  assert(json.executing_now === false,"json: no exec");
  assert(json.collects_data_now === false,"json: no collect");
  assert(json.persists_data_now === false,"json: no persist");
  assert(json.validates_now === false,"json: no validate");
  assert(json.expands_request_types_now === false,"json: no expand");
  assert(json.recommended_next_pr.title === t.recommendedNextPr,"json: next PR");
  assert(json.sections.length === t.sections.length,"json: sections");
  assert(json.required_section_count === t.requiredSectionCount,"json: required count");
  console.log("");

  console.log("Test 15: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-post-validation-review-template.ts","utf-8");
  const forbidden = ["runtime","execution/gateway","dispatchHermesGatewayReal","executeHermesCliCommand","runHermesGatewayShadowSidecar","buildHermesRuntimeShadowAttachmentFromRequest","child_process","fs","http","https","fetch","policy-memory","graph","kimi-gateway-real-dispatch","codex"];
  const bad = src.split("\n").filter((l:string) => l.includes("import ") && forbidden.some(f => l.includes(f)));
  assert(bad.length === 0, `forbidden imports: ${bad.length}`);
  console.log("");

  console.log("Test 16: forbidden runtime/script/CI changes");
  assert(!fs.readFileSync("runtime.ts","utf-8").includes("phase_2_post_validation"),"runtime clean");
  assert(!fs.readFileSync("execution/gateway.ts","utf-8").includes("phase_2_post_validation"),"gateway clean");
  assert(!fs.readFileSync("execution/hermes-gateway-real-dispatch.ts","utf-8").includes("phase_2_post_validation"),"dispatch clean");
  assert(!fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts","utf-8").includes("phase_2_post_validation"),"runbook clean");
  assert(!fs.readFileSync("package.json","utf-8").includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"),"no flag in package");
  for (const dir of [".github","scripts"]) {
    const files = readFilesRecursively(dir);
    assert(files.filter(f => fs.readFileSync(f,"utf-8").includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled")).length === 0, `${dir} clean`);
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
