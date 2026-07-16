import { HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_FINAL_READINESS_REVIEW } from "../execution/hermes-gateway-real-dispatch-phase-2-final-readiness-review";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Final Readiness Review Test\n");
  const r = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_FINAL_READINESS_REVIEW;

  console.log("Test 1: object shape and verdict");
  assert(r.name === "Hermes Gateway Real Dispatch Phase-2 Final Readiness Review", "name");
  assert(r.adapter === "hermes", "adapter");
  assert(r.scope === "gateway_real_dispatch_sidecar_phase_2_final_readiness_review", "scope");
  assert(r.status === "review_only", "status");
  assert(r.reviewOnly === true, "review only");
  assert(r.verdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(r.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(r.executingNow === false, "not executing");
  assert(r.validatesNow === false, "not validating");
  assert(r.expandsRequestTypesNow === false, "no type expansion");
  assert(r.enablesFeatureFlagsNow === false, "no flags");
  assert(r.changesRuntimeBehaviorNow === false, "no runtime");
  assert(r.changesGatewayBehaviorNow === false, "no gateway");
  assert(r.addsEnablementScripts === false, "no scripts");
  assert(r.changesCiBehavior === false, "no CI");
  console.log("");

  console.log("Test 3: request type scope");
  assertSameArray(r.currentValidatedRequestTypes, ["review"], assert, "current");
  assertSameArray(r.phase2ReadinessTargets, ["code_review", "validation"], assert, "targets");
  assertSameArray(r.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported");
  assertSameArray(r.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported");
  console.log("");

  console.log("Test 4: operator/automation constraints");
  assert(r.operatorApprovalRequired === true, "operator approval");
  assert(r.automaticEnablementAllowed === false, "no auto enable");
  assert(r.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(r.phase2MayProceedAutomatically === false, "no auto phase-2");
  console.log("");

  console.log("Test 5: behavior safety and ownership");
  assert(r.changesGatewayPrimaryDispatch === false, "no primary");
  assert(r.changesGatewayFinalResult === false, "no final");
  assert(r.changesRuntimeFinalStatus === false, "no status");
  assert(r.changesRuntimeRouting === false, "no routing");
  assert(r.affectsPrimaryGatewayResult === false, "no affect");
  assert(r.makesHermesDefault === false, "not default");
  assert(r.makesHermesFinalReviewOwner === false, "not review owner");
  assert(r.makesHermesFinalCodeReviewOwner === false, "not cr owner");
  assert(r.makesHermesFinalValidationOwner === false, "not val owner");
  console.log("");

  console.log("Test 6: persistence/leakage");
  assert(r.writesFiles === false, "no writes");
  assert(r.persistsReadinessLogs === false, "no readiness logs");
  assert(r.persistsPhase2ReviewLogs === false, "no phase-2 review logs");
  assert(r.persistsValidationLogs === false, "no val logs");
  assert(r.persistsRolloutLogs === false, "no rollout logs");
  assert(r.persistsAudit === false, "no audit");
  assert(r.persistsObservability === false, "no obs");
  assert(r.persistsGuardrails === false, "no guard");
  assert(r.containsRawPrompt === false, "no prompt");
  assert(r.containsRawArtifacts === false, "no artifacts");
  assert(r.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 7: readiness criteria");
  assert(r.readinessCriteria.length >= 10, "criteria count");
  assert(r.readinessCriteria.some(c => c.includes("code_review") && c.includes("validation")), "targets");
  assert(r.readinessCriteria.some(c => c.includes("review only")), "review only");
  assert(r.readinessCriteria.some(c => c.includes("sidecar")), "sidecar");
  assert(r.readinessCriteria.some(c => c.includes("not become final review")), "not final review");
  assert(r.readinessCriteria.some(c => c.includes("not become final code_review")), "not final cr");
  assert(r.readinessCriteria.some(c => c.includes("not become final validation")), "not final val");
  assert(r.readinessCriteria.some(c => c.includes("Gateway primary")), "gateway primary");
  assert(r.readinessCriteria.some(c => c.includes("Gateway final")), "gateway final");
  assert(r.readinessCriteria.some(c => c.includes("Runtime final_status")), "runtime status");
  assert(r.readinessCriteria.some(c => c.includes("routing")), "runtime routing");
  assert(r.readinessCriteria.some(c => c.includes("default-off")), "default-off");
  assert(r.readinessCriteria.some(c => c.includes("Operator approval")), "operator");
  assert(r.readinessCriteria.some(c => c.includes("disallowed")), "auto disable");
  assert(r.readinessCriteria.some(c => c.includes("raw prompt") || c.includes("raw artifact") || c.includes("secret")), "no raw");
  assert(r.readinessCriteria.some(c => c.includes("persisted")), "no persist");
  console.log("");

  console.log("Test 8: blocking conditions");
  assert(r.blockingConditions.length >= 8, "block count");
  assert(r.blockingConditions.some(c => c.includes("Runtime") || c.includes("Gateway")), "behavior change");
  assert(r.blockingConditions.some(c => c.includes("request type expansion")), "type expansion");
  assert(r.blockingConditions.some(c => c.includes("enabled by default")), "flag default");
  assert(r.blockingConditions.some(c => c.includes("package") || c.includes("script") || c.includes("CI")), "pkg/script/CI");
  assert(r.blockingConditions.some(c => c.includes("Hermes CLI")), "real CLI");
  assert(r.blockingConditions.some(c => c.includes("final code_review") || c.includes("final validation")), "final decision");
  assert(r.blockingConditions.some(c => c.includes("raw prompt") || c.includes("raw artifact") || c.includes("secret")), "raw data");
  assert(r.blockingConditions.some(c => c.includes("persisted")), "persisted");
  assert(r.blockingConditions.some(c => c.includes("unsupported")), "unsupported");
  assert(r.blockingConditions.some(c => c.includes("automatic")), "auto");
  console.log("");

  console.log("Test 9: required prerequisites");
  assert(r.requiredPrerequisites.length >= 9, "prereq count");
  assert(r.requiredPrerequisites.some(p => p.includes("READY_WITH_CONSTRAINTS")), "readiness");
  assert(r.requiredPrerequisites.some(p => p.includes("plan_only")), "rollout plan");
  assert(r.requiredPrerequisites.some(p => p.includes("checklist_only") && p.includes("rollout validation")), "checklist");
  assert(r.requiredPrerequisites.some(p => p.includes("runbook_only") && p.includes("operator runbook")), "runbook");
  assert(r.requiredPrerequisites.some(p => p.includes("template_only") && p.includes("post-enablement")), "post-enablement");
  assert(r.requiredPrerequisites.some(p => p.includes("contract_only")), "contract");
  assert(r.requiredPrerequisites.some(p => p.includes("Phase-2 validation checklist")), "phase-2 checklist");
  assert(r.requiredPrerequisites.some(p => p.includes("Phase-2 operator runbook")), "phase-2 runbook");
  assert(r.requiredPrerequisites.some(p => p.includes("Phase-2 post-validation review template")), "phase-2 template");
  console.log("");

  console.log("Test 10: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_FINAL_READINESS_REVIEW.md", "utf-8");
  assert(md.includes("review_only"), "md: status");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: verdict");
  assert(md.includes("Phase-2 final readiness review"), "md: scope");
  assert(md.includes("does not execute Phase-2"), "md: no execute");
  assert(md.includes("code_review"), "md: cr");
  assert(md.includes("validation"), "md: val");
  assert(md.includes("Phase-2 Controlled Enablement Plan"), "md: next PR");
  console.log("");

  console.log("Test 11: JSON consistency");
  const json = JSON.parse(fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-final-readiness-review.json", "utf-8"));
  assert(json.status === r.status, "json: status");
  assert(json.verdict === r.verdict, "json: verdict");
  assert(json.review_only === true, "json: review only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.expands_request_types_now === false, "json: no expand");
  assert(json.recommended_next_pr.title === r.recommendedNextPr, "json: next PR");
  console.log("");

  console.log("Test 12: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-final-readiness-review.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "dispatchHermesGatewayReal", "executeHermesCliCommand", "runHermesGatewayShadowSidecar", "buildHermesRuntimeShadowAttachmentFromRequest", "child_process", "fs", "http", "https", "fetch", "policy-memory", "graph", "kimi-gateway-real-dispatch", "codex"];
  const bad = src.split("\n").filter((l: string) => l.includes("import ") && forbidden.some(f => l.includes(f)));
  assert(bad.length === 0, `forbidden imports: ${bad.length}`);
  console.log("");

  console.log("Test 13: forbidden runtime/script/CI changes");
  assert(!fs.readFileSync("runtime.ts", "utf-8").includes("phase_2_final_readiness"), "runtime clean");
  assert(!fs.readFileSync("execution/gateway.ts", "utf-8").includes("phase_2_final_readiness"), "gateway clean");
  assert(!fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8").includes("phase_2_final_readiness"), "dispatch clean");
  assert(!fs.readFileSync("package.json", "utf-8").includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "no flag");
  for (const dir of [".github", "scripts"]) {
    const files = readFilesRecursively(dir);
    assert(files.filter(f => fs.readFileSync(f, "utf-8").includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled")).length === 0, `${dir} clean`);
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
