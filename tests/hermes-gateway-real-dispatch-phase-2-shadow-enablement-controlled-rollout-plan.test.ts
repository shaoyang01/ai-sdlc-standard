// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan
// =================================================================================
// Verifies the plan-only static controlled rollout plan artifact and its
// consistency across Markdown, metadata JSON, root JSON registries, Current
// Status, the Capability Reference Matrix, and package.json.
//
// This test only reads repository files. It never invokes a real Hermes CLI,
// a real external process, or the network. The plan itself does not execute
// rollout, does not execute operator actions, and does not enable feature flags.
// Legacy recommended_next_pr references are compatibility checks only and do
// not establish Project Controller sequencing or authorization.

import { HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN as PLAN } from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan";
import * as fs from "node:fs";

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

  function readJson(relativePath: string) {
    return JSON.parse(fs.readFileSync(relativePath, "utf-8"));
  }

  function arraysEqual(a: unknown, b: readonly unknown[]) {
    return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);
  }

  const MD_PATH = "docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN.md";
  const JSON_PATH = "metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.json";
  const TS_PATH = "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.ts";
  const TEST_PATH = "tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.test.ts";

  console.log("Hermes Phase-2 Shadow Enablement Controlled Rollout Plan Test\n");

  // ── Test 1: exact identity ──
  console.log("Test 1: exact identity");
  assert(PLAN.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan", "exact plan name");
  assert(PLAN.adapter === "hermes", "adapter is hermes");
  assert(PLAN.scope === "gateway_real_dispatch_sidecar_phase_2_shadow_enablement_controlled_rollout_plan", "exact scope");
  assert(PLAN.status === "plan_only", "status is plan_only");
  assert(PLAN.planOnly === true, "planOnly is true");
  assert(PLAN.planExists === true, "planExists is true");
  console.log("");

  // ── Test 2: non-execution fields ──
  console.log("Test 2: non-execution fields");
  const nonExecutionFalseFields = [
    "executingNow",
    "executesRolloutNow",
    "executesOperatorActionsNow",
    "enablesFeatureFlagsNow",
    "expandsRequestTypesNow",
    "changesRuntimeBehaviorNow",
    "changesGatewayPrimaryDispatchNow",
    "changesGatewayFinalResultNow",
    "changesHermesDispatchEligibilityNow",
    "makesHermesDefaultNow",
    "makesHermesFinalOwnerNow",
    "addsPackageScriptFlagEnablementNow",
    "changesCiBehaviorNow",
    "persistsLogsNow",
  ] as const;
  for (const field of nonExecutionFalseFields) {
    assert(PLAN[field] === false, `${field} is false`);
  }
  console.log("");

  // ── Test 3: prerequisites and authorization ──
  console.log("Test 3: prerequisites and authorization");
  assert(PLAN.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "readiness verdict READY_WITH_CONSTRAINTS");
  assert(PLAN.implementationStatus === "implemented_phase_2_shadow_sidecar_only", "implementation status preserved");
  assert(PLAN.validationStatus === "implemented_phase_2_shadow_sidecar_validation_only", "validation status preserved");
  assert(PLAN.operatorAcceptanceStatus === "operator_acceptance_only", "operator acceptance status preserved");
  assert(PLAN.controlledRolloutGateStatus === "controlled_rollout_gate_only", "controlled rollout gate status preserved");
  assert(PLAN.implementationAuthorizationScope === "plan_material_only", "implementation authorization scope is plan_material_only");
  assert(PLAN.operatorActionAuthorization === "not_granted", "operator action authorization not_granted");
  assert(PLAN.rolloutAuthorization === "not_granted", "rollout authorization not_granted");
  assert(PLAN.legacyRecommendedNextPrFulfilled === true, "legacy recommended_next_pr fulfilled by this plan");
  assert(PLAN.nextGovernanceDecision === "separate_operator_action_authorization", "next governance decision is separate operator action authorization");
  console.log("");

  // ── Test 4: approval model and execution state ──
  console.log("Test 4: approval model and execution state");
  assert(PLAN.operatorApprovalRequired === true, "operator approval required");
  assert(PLAN.perPhaseApprovalRequired === true, "per-phase approval required");
  assert(PLAN.perRequestOperatorApprovalRequired === true, "per-request operator approval required");
  assert(PLAN.automaticEnablementAllowed === false, "automatic enablement not allowed");
  assert(PLAN.rolloutMayProceedAutomatically === false, "rollout may not proceed automatically");
  assert(PLAN.operatorActionExecuted === false, "operator action not executed");
  assert(PLAN.rolloutExecuted === false, "rollout not executed");
  assert(PLAN.defaultDisabled === true, "default disabled");
  assert(PLAN.sidecarOnly === true, "sidecar only");
  console.log("");

  // ── Test 5: required flags exact order ──
  console.log("Test 5: required flags exact order");
  assert(
    arraysEqual(PLAN.requiredFlags, [
      "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
      "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
      "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
    ]),
    "three required flags in exact order"
  );
  console.log("");

  // ── Test 6: request type sets ──
  console.log("Test 6: request type sets");
  assert(arraysEqual(PLAN.currentValidatedRequestTypes, ["review"]), "current validated request types is review only");
  assert(arraysEqual(PLAN.phase2ShadowTargets, ["code_review", "validation"]), "phase-2 shadow targets");
  assert(arraysEqual(PLAN.supportedRequestTypes, ["review", "code_review", "validation"]), "supported request types");
  assert(arraysEqual(PLAN.initialRolloutRequestTypes, ["code_review"]), "initial rollout request types is code_review first");
  assert(arraysEqual(PLAN.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"]), "unsupported request types");
  console.log("");

  // ── Test 7: preservation and ownership ──
  console.log("Test 7: preservation and ownership");
  assert(PLAN.gatewayPrimaryResultPreserved === true, "Gateway primary result preserved");
  assert(PLAN.gatewayFinalResultPreserved === true, "Gateway final result preserved");
  assert(PLAN.runtimeFinalStatusPreserved === true, "Runtime final_status preserved");
  assert(PLAN.runtimeRoutingPreserved === true, "Runtime routing preserved");
  assert(PLAN.hermesFinalReviewOwner === false, "Hermes not final review owner");
  assert(PLAN.hermesFinalCodeReviewOwner === false, "Hermes not final code_review owner");
  assert(PLAN.hermesFinalValidationOwner === false, "Hermes not final validation owner");
  console.log("");

  // ── Test 8: phase order and per-phase shape ──
  console.log("Test 8: phase order and per-phase shape");
  const expectedPhaseIds = [
    "phase_0_plan_approval",
    "phase_1_fake_preflight",
    "phase_2_code_review_canary_one",
    "phase_3_code_review_limited_max_five",
    "phase_4_validation_canary_one",
    "phase_5_mixed_limited_max_five",
    "phase_6_post_rollout_review",
  ];
  assert(PLAN.rolloutPhases.length === 7, "exactly 7 rollout phases");
  assert(
    arraysEqual(PLAN.rolloutPhases.map((phase) => phase.id), expectedPhaseIds),
    "phase order is exact"
  );
  for (const phase of PLAN.rolloutPhases) {
    assert(phase.status === "planned", `${phase.id} status is planned`);
    assert(phase.requiresExplicitProjectControllerApproval === true, `${phase.id} requires explicit Project Controller approval`);
    assert(phase.requiresOperatorApproval === true, `${phase.id} requires operator approval`);
    assert(phase.executingNow === false, `${phase.id} executingNow is false`);
    assert(phase.operatorActionExecuted === false, `${phase.id} operatorActionExecuted is false`);
    assert(phase.rolloutExecuted === false, `${phase.id} rolloutExecuted is false`);
    assert(phase.entryCriteria.length > 0, `${phase.id} entryCriteria non-empty`);
    assert(phase.successCriteria.length > 0, `${phase.id} successCriteria non-empty`);
    assert(phase.stopCriteria.length > 0, `${phase.id} stopCriteria non-empty`);
    assert(phase.rollbackActions.length > 0, `${phase.id} rollbackActions non-empty`);
  }
  console.log("");

  // ── Test 9: per-phase execution mode, request types, and 1/5/1/5 caps ──
  console.log("Test 9: per-phase execution mode, request types, and 1/5/1/5 caps");
  const expectedPhaseShape: ReadonlyArray<readonly [string, string, readonly string[], number]> = [
    ["phase_0_plan_approval", "none", [], 0],
    ["phase_1_fake_preflight", "fake_only", [], 0],
    ["phase_2_code_review_canary_one", "controlled_real_sidecar", ["code_review"], 1],
    ["phase_3_code_review_limited_max_five", "controlled_real_sidecar", ["code_review"], 5],
    ["phase_4_validation_canary_one", "controlled_real_sidecar", ["validation"], 1],
    ["phase_5_mixed_limited_max_five", "controlled_real_sidecar", ["code_review", "validation"], 5],
    ["phase_6_post_rollout_review", "none", [], 0],
  ];
  for (const [id, executionMode, allowedRequestTypes, maxRealRequests] of expectedPhaseShape) {
    const phase = PLAN.rolloutPhases.find((candidate) => candidate.id === id)!;
    assert(phase.executionMode === executionMode, `${id} executionMode is ${executionMode}`);
    assert(arraysEqual(phase.allowedRequestTypes, allowedRequestTypes), `${id} allowedRequestTypes exact`);
    assert(phase.maxRealRequests === maxRealRequests, `${id} maxRealRequests is ${maxRealRequests}`);
  }
  const phase2 = PLAN.rolloutPhases.find((phase) => phase.id === "phase_2_code_review_canary_one")!;
  const phase3 = PLAN.rolloutPhases.find((phase) => phase.id === "phase_3_code_review_limited_max_five")!;
  const phase4 = PLAN.rolloutPhases.find((phase) => phase.id === "phase_4_validation_canary_one")!;
  const phase5 = PLAN.rolloutPhases.find((phase) => phase.id === "phase_5_mixed_limited_max_five")!;
  assert(phase2.maxRealRequests === 1 && arraysEqual(phase2.allowedRequestTypes, ["code_review"]), "phase_2 canary is exactly one code_review");
  assert(phase3.maxRealRequests === 5, "phase_3 limited is at most five additional code_review");
  assert(phase4.maxRealRequests === 1 && arraysEqual(phase4.allowedRequestTypes, ["validation"]), "phase_4 canary is exactly one validation");
  assert(phase5.maxRealRequests === 5, "phase_5 mixed limited is at most five combined requests");
  assert(!phase5.allowedRequestTypes.some((type) => ["review", "llm_task", "code_generation", "bugfix"].includes(type)), "phase_5 never includes review/llm_task/code_generation/bugfix");
  console.log("");

  // ── Test 10: evidence policy ──
  console.log("Test 10: evidence policy");
  const policy = PLAN.evidencePolicy;
  assert(policy.mode === "manual_sanitized_summary_only", "evidence mode is manual_sanitized_summary_only");
  assert(policy.automaticCollectionAllowed === false, "automatic collection not allowed");
  assert(policy.persistedByPlan === false, "not persisted by plan");
  assert(policy.repositoryPersistenceAllowed === false, "repository persistence not allowed");
  assert(policy.manualSummaryRequiredAfterEachPhase === true, "manual summary required after each phase");
  assert(policy.definesPolicyOnly === true, "policy definition only");
  assert(policy.collectsEvidenceNow === false, "collects no evidence now");
  assert(policy.persistsEvidenceNow === false, "persists no evidence now");
  assert(policy.allowedSanitizedFields.length === 23, "23 allowed sanitized fields");
  for (const field of ["source_fact_head", "phase_id", "request_type", "warning_count_max", "leakage_detected", "persistence_detected", "stop_reason_enum"]) {
    assert(policy.allowedSanitizedFields.includes(field), `allowed sanitized field ${field}`);
  }
  assert(policy.forbiddenContent.length === 16, "16 forbidden content entries");
  for (const forbidden of ["raw prompt", "stdout", "stderr", "full CLI output", "full warning text"]) {
    assert(policy.forbiddenContent.includes(forbidden), `forbidden content ${forbidden}`);
  }
  console.log("");

  // ── Test 11: global stop conditions ──
  console.log("Test 11: global stop conditions");
  assert(PLAN.globalStopConditions.length === 20, "20 global stop conditions");
  for (const needle of [
    "three required flags",
    "per-request operator approval",
    "unsupported request type invokes the dispatcher",
    "guardrails.allowed is not true",
    "Runtime final_status or Runtime routing changes",
    "full CLI output, or full warning text leaks",
    "package.json, scripts, or CI sets Hermes flags by default",
    "real Hermes CLI or an external service",
    "1/5/1/5 caps are exceeded",
    "entered automatically without a new approval",
  ]) {
    assert(
      PLAN.globalStopConditions.some((condition) => condition.includes(needle)),
      `stop condition covers: ${needle}`
    );
  }
  console.log("");

  // ── Test 12: global rollback actions ──
  console.log("Test 12: global rollback actions");
  assert(PLAN.globalRollbackActions.length === 8, "8 global rollback actions");
  for (const needle of [
    "stop new controlled requests immediately",
    "remove all three Hermes flags",
    "manual sanitized summary",
    "report the stop reason and completed request counts",
    "without a new explicit approval",
  ]) {
    assert(
      PLAN.globalRollbackActions.some((action) => action.includes(needle)),
      `rollback action covers: ${needle}`
    );
  }
  console.log("");

  // ── Test 13: Markdown consistency ──
  console.log("Test 13: Markdown consistency");
  assert(fs.existsSync(MD_PATH), "plan Markdown exists");
  const md = fs.readFileSync(MD_PATH, "utf-8");
  const mdNeedles = [
    "# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan",
    "status: `plan_only`",
    "plan exists does not mean rollout is approved",
    "this PR does not execute operator actions",
    "this PR does not execute rollout",
    "this PR does not enable feature flags",
    "operator_action_authorization: `not_granted`",
    "rollout_authorization: `not_granted`",
    "operator_action_executed: `false`",
    "rollout_executed: `false`",
    "separate operator action authorization",
    "manual_sanitized_summary_only",
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
    ...expectedPhaseIds,
  ];
  for (const needle of mdNeedles) {
    assert(md.includes(needle), `Markdown contains: ${needle}`);
  }
  console.log("");

  // ── Test 14: metadata JSON consistency ──
  console.log("Test 14: metadata JSON consistency");
  assert(fs.existsSync(JSON_PATH), "plan metadata JSON exists");
  const planJson = readJson(JSON_PATH);
  assert(planJson["name"] === PLAN.name, "JSON name mirrors TS");
  assert(planJson["adapter"] === "hermes", "JSON adapter mirrors TS");
  assert(planJson["scope"] === PLAN.scope, "JSON scope mirrors TS");
  assert(planJson["status"] === "plan_only", "JSON status plan_only");
  assert(planJson["plan_only"] === true, "JSON plan_only true");
  assert(planJson["executing_now"] === false, "JSON executing_now false");
  assert(planJson["implementation_authorization_scope"] === "plan_material_only", "JSON authorization scope plan_material_only");
  assert(planJson["operator_action_authorization"] === "not_granted", "JSON operator action authorization not_granted");
  assert(planJson["rollout_authorization"] === "not_granted", "JSON rollout authorization not_granted");
  assert(planJson["operator_action_executed"] === false, "JSON operator_action_executed false");
  assert(planJson["rollout_executed"] === false, "JSON rollout_executed false");
  assert(planJson["legacy_recommended_next_pr_fulfilled"] === true, "JSON legacy recommended_next_pr fulfilled");
  assert(planJson["next_governance_decision"] === "separate_operator_action_authorization", "JSON next governance decision mirrors TS");
  assert(arraysEqual(planJson["required_flags"], PLAN.requiredFlags), "JSON required flags mirror TS order");
  assert(planJson["rollout_phases"].length === 7, "JSON 7 phases");
  assert(
    arraysEqual(
      planJson["rollout_phases"].map((phase: Record<string, unknown>) => phase["id"]),
      expectedPhaseIds
    ),
    "JSON phase order mirrors TS"
  );
  for (const [id, executionMode, allowedRequestTypes, maxRealRequests] of expectedPhaseShape) {
    const phase = (planJson["rollout_phases"] as Array<Record<string, unknown>>).find((candidate) => candidate["id"] === id)!;
    assert(phase["execution_mode"] === executionMode, `JSON ${id} execution_mode mirrors TS`);
    assert(arraysEqual(phase["allowed_request_types"] as unknown[], allowedRequestTypes), `JSON ${id} allowed_request_types mirrors TS`);
    assert(phase["max_real_requests"] === maxRealRequests, `JSON ${id} max_real_requests mirrors TS`);
  }
  assert(planJson["evidence_policy"]["mode"] === "manual_sanitized_summary_only", "JSON evidence policy mode mirrors TS");
  assert(planJson["evidence_policy"]["allowed_sanitized_fields"].length === 23, "JSON 23 allowed sanitized fields");
  assert(planJson["evidence_policy"]["forbidden_content"].length === 16, "JSON 16 forbidden content entries");
  assert(planJson["global_stop_conditions"].length === 20, "JSON 20 stop conditions");
  assert(planJson["global_rollback_actions"].length === 8, "JSON 8 rollback actions");
  for (const path of [TS_PATH, TEST_PATH, MD_PATH, JSON_PATH]) {
    assert((planJson["evidence"] as string[]).includes(path), `JSON evidence includes ${path}`);
  }
  console.log("");

  // ── Test 15: runtime-capabilities.json consistency ──
  console.log("Test 15: runtime-capabilities.json consistency");
  const runtimeCaps = readJson("runtime-capabilities.json");
  const runtimePlan = runtimeCaps["real_agent_adapter_integration"];
  const runtimePrefix = "hermes_gateway_real_dispatch_phase_2_shadow_enablement_controlled_rollout_plan_";
  assert(runtimePlan[`${runtimePrefix}plan_status`] === "plan_only", "runtime plan_status plan_only");
  assert(runtimePlan[`${runtimePrefix}plan_exists`] === true, "runtime plan_exists true");
  assert(runtimePlan[`${runtimePrefix}executing_now`] === false, "runtime executing_now false");
  assert(runtimePlan[`${runtimePrefix}implementation_authorization_scope`] === "plan_material_only", "runtime authorization scope plan_material_only");
  assert(runtimePlan[`${runtimePrefix}operator_action_authorization`] === "not_granted", "runtime operator action authorization not_granted");
  assert(runtimePlan[`${runtimePrefix}rollout_authorization`] === "not_granted", "runtime rollout authorization not_granted");
  assert(runtimePlan[`${runtimePrefix}operator_action_executed`] === false, "runtime operator_action_executed false");
  assert(runtimePlan[`${runtimePrefix}rollout_executed`] === false, "runtime rollout_executed false");
  assert(runtimePlan[`${runtimePrefix}operator_approval_required`] === true, "runtime operator approval required");
  assert(runtimePlan[`${runtimePrefix}per_phase_approval_required`] === true, "runtime per-phase approval required");
  assert(runtimePlan[`${runtimePrefix}per_request_operator_approval_required`] === true, "runtime per-request approval required");
  assert(runtimePlan[`${runtimePrefix}default_disabled`] === true, "runtime default disabled");
  assert(runtimePlan[`${runtimePrefix}sidecar_only`] === true, "runtime sidecar only");
  assert(arraysEqual(runtimePlan[`${runtimePrefix}initial_rollout_request_types`], ["code_review"]), "runtime initial rollout request types code_review first");
  assert(arraysEqual(runtimePlan[`${runtimePrefix}phase_2_shadow_targets`], ["code_review", "validation"]), "runtime phase-2 shadow targets");
  const runtimeCapsPhaseCaps = runtimePlan[`${runtimePrefix}phase_request_caps`];
  assert(runtimeCapsPhaseCaps["code_review_canary"] === 1, "runtime cap code_review_canary 1");
  assert(runtimeCapsPhaseCaps["code_review_limited"] === 5, "runtime cap code_review_limited 5");
  assert(runtimeCapsPhaseCaps["validation_canary"] === 1, "runtime cap validation_canary 1");
  assert(runtimeCapsPhaseCaps["mixed_limited_total"] === 5, "runtime cap mixed_limited_total 5");
  assert(runtimePlan[`${runtimePrefix}evidence_mode`] === "manual_sanitized_summary_only", "runtime evidence mode manual_sanitized_summary_only");
  assert(runtimePlan[`${runtimePrefix}legacy_recommended_next_pr_fulfilled`] === true, "runtime legacy recommended_next_pr fulfilled");
  assert(runtimePlan[`${runtimePrefix}next_governance_decision`] === "separate_operator_action_authorization", "runtime next governance decision");
  for (const path of [TS_PATH, TEST_PATH, MD_PATH, JSON_PATH]) {
    assert((runtimePlan[`${runtimePrefix}evidence`] as string[]).includes(path), `runtime evidence includes ${path}`);
  }
  assert(runtimeCaps["authority"]["role"] === "canonical_machine_runtime_capability_registry", "runtime authority object unchanged");
  console.log("");

  // ── Test 16: system-capability-review.json consistency ──
  console.log("Test 16: system-capability-review.json consistency");
  const review = readJson("system-capability-review.json");
  const reviewPlan = (review["capabilities"] as Array<Record<string, unknown>>).find(
    (candidate) => candidate["name"] === PLAN.name
  )!;
  assert(reviewPlan !== undefined, "review plan capability object exists");
  assert(reviewPlan["status"] === "plan_only", "review status plan_only");
  assert(reviewPlan["plan_only"] === true, "review plan_only true");
  assert(reviewPlan["executing_now"] === false, "review executing_now false");
  assert(reviewPlan["implementation_authorization_scope"] === "plan_material_only", "review authorization scope plan_material_only");
  assert(reviewPlan["operator_action_authorization"] === "not_granted", "review operator action authorization not_granted");
  assert(reviewPlan["rollout_authorization"] === "not_granted", "review rollout authorization not_granted");
  assert(reviewPlan["operator_action_executed"] === false, "review operator_action_executed false");
  assert(reviewPlan["rollout_executed"] === false, "review rollout_executed false");
  assert(reviewPlan["changes_gateway_primary_result"] === false, "review does not change Gateway primary result");
  assert(reviewPlan["changes_gateway_final_result"] === false, "review does not change Gateway final result");
  assert(reviewPlan["changes_runtime_final_status"] === false, "review does not change Runtime final_status");
  assert(reviewPlan["changes_runtime_routing"] === false, "review does not change Runtime routing");
  assert(reviewPlan["changes_ownership"] === false, "review does not change ownership");
  assert(reviewPlan["persists_logs_now"] === false, "review persists no logs");
  const reviewPhases = reviewPlan["rollout_phases"] as Array<Record<string, unknown>>;
  assert(reviewPhases.length === 7, "review 7 phases");
  assert(arraysEqual(reviewPhases.map((phase) => phase["id"]), expectedPhaseIds), "review phase order mirrors TS");
  for (const [id, executionMode, allowedRequestTypes, maxRealRequests] of expectedPhaseShape) {
    const phase = reviewPhases.find((candidate) => candidate["id"] === id)!;
    assert(phase["execution_mode"] === executionMode, `review ${id} execution_mode mirrors TS`);
    assert(arraysEqual(phase["allowed_request_types"] as unknown[], allowedRequestTypes), `review ${id} allowed_request_types mirrors TS`);
    assert(phase["max_real_requests"] === maxRealRequests, `review ${id} max_real_requests mirrors TS`);
  }
  assert(reviewPlan["evidence_policy"]["mode"] === "manual_sanitized_summary_only", "review evidence policy mode");
  assert((reviewPlan["global_stop_conditions"] as unknown[]).length === 20, "review 20 stop conditions");
  assert((reviewPlan["global_rollback_actions"] as unknown[]).length === 8, "review 8 rollback actions");
  assert(reviewPlan["legacy_recommended_next_pr_fulfilled"] === true, "review legacy recommended_next_pr fulfilled");
  assert(reviewPlan["next_governance_decision"] === "separate_operator_action_authorization", "review next governance decision");
  for (const path of [TS_PATH, TEST_PATH, MD_PATH, JSON_PATH]) {
    assert((reviewPlan["evidence"] as string[]).includes(path), `review evidence includes ${path}`);
  }
  assert(review["authority"]["role"] === "scoped_system_capability_evidence_review_dataset", "review authority object unchanged");
  console.log("");

  // ── Test 17: real-agent-adapter-capability-matrix.json consistency ──
  console.log("Test 17: real-agent-adapter-capability-matrix.json consistency");
  const matrix = readJson("real-agent-adapter-capability-matrix.json");
  const hermes = (matrix["adapters"] as Array<Record<string, unknown>>).find(
    (candidate) => candidate["adapter"] === "hermes"
  )!;
  const matrixPrefix = "gateway_real_dispatch_phase_2_shadow_enablement_controlled_rollout_plan_";
  assert(hermes[`${matrixPrefix}plan_status`] === "plan_only", "matrix plan_status plan_only");
  assert(hermes[`${matrixPrefix}plan_exists`] === true, "matrix plan_exists true");
  assert(hermes[`${matrixPrefix}executing_now`] === false, "matrix executing_now false");
  assert(hermes[`${matrixPrefix}operator_action_authorization`] === "not_granted", "matrix operator action authorization not_granted");
  assert(hermes[`${matrixPrefix}rollout_authorization`] === "not_granted", "matrix rollout authorization not_granted");
  assert(hermes[`${matrixPrefix}operator_action_executed`] === false, "matrix operator_action_executed false");
  assert(hermes[`${matrixPrefix}rollout_executed`] === false, "matrix rollout_executed false");
  assert(arraysEqual(hermes[`${matrixPrefix}required_flags`], PLAN.requiredFlags), "matrix required flags mirror TS order");
  assert(arraysEqual(hermes[`${matrixPrefix}supported_request_types`], ["review", "code_review", "validation"]), "matrix supported request types");
  assert(arraysEqual(hermes[`${matrixPrefix}initial_rollout_request_types`], ["code_review"]), "matrix initial rollout request types code_review first");
  assert(arraysEqual(hermes[`${matrixPrefix}phase_2_shadow_targets`], ["code_review", "validation"]), "matrix phase-2 shadow targets");
  const matrixCaps = hermes[`${matrixPrefix}phase_request_caps`];
  assert(matrixCaps["code_review_canary"] === 1, "matrix cap code_review_canary 1");
  assert(matrixCaps["code_review_limited"] === 5, "matrix cap code_review_limited 5");
  assert(matrixCaps["validation_canary"] === 1, "matrix cap validation_canary 1");
  assert(matrixCaps["mixed_limited_total"] === 5, "matrix cap mixed_limited_total 5");
  assert(hermes[`${matrixPrefix}per_phase_approval_required`] === true, "matrix per-phase approval required");
  assert(hermes[`${matrixPrefix}per_request_operator_approval_required`] === true, "matrix per-request approval required");
  assert(hermes[`${matrixPrefix}evidence_mode`] === "manual_sanitized_summary_only", "matrix evidence mode");
  assert((hermes[`${matrixPrefix}global_stop_conditions`] as unknown[]).length === 20, "matrix 20 stop conditions");
  assert((hermes[`${matrixPrefix}global_rollback_actions`] as unknown[]).length === 8, "matrix 8 rollback actions");
  assert(hermes[`${matrixPrefix}legacy_recommended_next_pr_fulfilled`] === true, "matrix legacy recommended_next_pr fulfilled");
  assert(hermes[`${matrixPrefix}next_governance_decision`] === "separate_operator_action_authorization", "matrix next governance decision");
  assert(matrix["authority"]["role"] === "scoped_adapter_request_type_evidence_matrix", "matrix authority object unchanged");
  console.log("");

  // ── Test 18: Current Status consistency ──
  console.log("Test 18: Current Status consistency");
  const currentStatus = fs.readFileSync("docs/CURRENT_STATUS.md", "utf-8");
  for (const needle of [
    "721fd120d3ace9335cb010a48275ace0e2253c57",
    "controlled_rollout_plan_exists_after_this_change_merges: true",
    "controlled_rollout_plan_status: plan_only",
    "implementation_authorization_scope: plan_material_only",
    "operator_action_authorization: not_granted",
    "rollout_authorization: not_granted",
    "operator_action_executed: false",
    "rollout_executed: false",
    "initial_rollout_request_type: code_review",
    "phase_request_caps: 1/5/1/5",
    "evidence_mode: manual_sanitized_summary_only",
    "next_governance_decision: separate_operator_action_authorization",
  ]) {
    assert(currentStatus.includes(needle), `Current Status contains: ${needle}`);
  }
  console.log("");

  // ── Test 19: Capability Reference Matrix consistency ──
  console.log("Test 19: Capability Reference Matrix consistency");
  const referenceMatrix = fs.readFileSync("docs/CAPABILITY-REFERENCE-MATRIX.md", "utf-8");
  assert(
    referenceMatrix.includes(`| \`${MD_PATH}\` | Hermes Phase 2 | plan | evidence/reference |`),
    "Matrix contains the new Markdown row"
  );
  assert(
    referenceMatrix.includes(`| \`${JSON_PATH}\` | Hermes Phase 2 | plan | evidence/reference |`),
    "Matrix contains the new metadata JSON row"
  );
  assert(
    referenceMatrix.includes(
      "plan-only controlled rollout evidence; no operator, execution, rollout, planning-authority, authorization-authority or ownership authority"
    ),
    "Matrix rows carry the plan-only relationship boundary"
  );
  console.log("");

  // ── Test 20: package.json registration ──
  console.log("Test 20: package.json registration");
  const packageJson = fs.readFileSync("package.json", "utf-8");
  const planTestEntry = `tsx ${TEST_PATH}`;
  const gateTestEntry = "tsx tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-gate.test.ts";
  assert(
    packageJson.split(planTestEntry).length - 1 === 1,
    "npm test contains the plan test exactly once"
  );
  assert(
    packageJson.indexOf(gateTestEntry) !== -1 && packageJson.indexOf(gateTestEntry) < packageJson.indexOf(planTestEntry),
    "plan test is registered after the controlled rollout gate test"
  );
  console.log("");

  // ── Test 21: plan TypeScript purity ──
  console.log("Test 21: plan TypeScript purity");
  const planSource = fs.readFileSync(TS_PATH, "utf-8");
  assert(!/^import\s/m.test(planSource), "plan TypeScript has no import statements");
  for (const forbidden of ["require(", "child_process", "process.", "fetch(", "http:", "https:", "fs.read", "fs.write"]) {
    assert(!planSource.includes(forbidden), `plan TypeScript does not reference ${forbidden}`);
  }
  console.log("");

  // ── Test 22: Runtime/Gateway/dispatch files do not reference the plan symbol ──
  console.log("Test 22: Runtime, Gateway, and dispatch files stay plan-free");
  for (const path of ["runtime.ts", "execution/gateway.ts", "execution/hermes-gateway-real-dispatch.ts", "execution/types.ts"]) {
    const content = fs.readFileSync(path, "utf-8");
    assert(
      !content.includes("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN"),
      `${path} does not reference the controlled rollout plan symbol`
    );
  }
  console.log("");

  // ── Test 23: no default Hermes flag enablement in package.json, scripts, or CI ──
  console.log("Test 23: no default Hermes flag enablement in package.json, scripts, or CI");
  const enablementNeedle = "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled";
  assert(!packageJson.includes(enablementNeedle), "package.json does not enable Hermes flags");
  function collectFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...collectFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }
  for (const path of [...collectFiles("scripts"), ...collectFiles(".github")]) {
    const content = fs.readFileSync(path, "utf-8");
    assert(!content.includes(enablementNeedle), `${path} does not enable Hermes flags by default`);
  }
  console.log("");

  // ── Test 24: validator and Current Status baseline synchronization ──
  console.log("Test 24: validator and Current Status baseline synchronization");
  const validatorSource = fs.readFileSync("scripts/validate-capability-metadata-chain.rb", "utf-8");
  assert(validatorSource.includes("EXPECTED_CURRENT_STATUS_SOURCE_COMMIT"), "validator defines EXPECTED_CURRENT_STATUS_SOURCE_COMMIT");
  assert(
    validatorSource.includes('"721fd120d3ace9335cb010a48275ace0e2253c57"'),
    "validator expected current status commit is 721fd120..."
  );
  assert(validatorSource.includes("CURRENT_STATUS_AS_OF_PATTERN"), "validator defines the anchored As-of pattern");
  assert(
    validatorSource.includes("\\A- As-of source commit：`([0-9a-f]{40})`\\z"),
    "validator As-of pattern is anchored to a standalone full line"
  );
  assert(
    !validatorSource.includes("07c5d26cc9d11a010cb183934950cdb13cb58d42"),
    "validator no longer uses the old SHA as a CURRENT_STATUS needle"
  );
  const asOfLinePattern = /^- As-of source commit：`([0-9a-f]{40})`$/;
  const asOfMatches = currentStatus
    .split("\n")
    .map((line) => asOfLinePattern.exec(line.replace(/\r$/, "")))
    .filter((match) => match !== null);
  assert(asOfMatches.length === 1, `Current Status has exactly one As-of source commit line (found ${asOfMatches.length})`);
  assert(
    asOfMatches[0]![1] === "721fd120d3ace9335cb010a48275ace0e2253c57",
    "the single Current Status As-of SHA is 721fd120..."
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
