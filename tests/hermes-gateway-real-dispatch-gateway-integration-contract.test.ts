// Regression Test — Hermes Gateway Real Dispatch Gateway Integration Contract
// Contract-only. No Gateway, no runtime, no CLI.

import fs from "fs";
import {
  evaluateHermesGatewayRealDispatchGatewayIntegrationContract,
  HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_FIELD,
  HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_RULES,
} from "../execution/hermes-gateway-real-dispatch-gateway-integration-contract";
import type { HermesGatewayRealDispatchResult } from "../execution/hermes-gateway-real-dispatch";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed++;
    console.error(`  ✗ ${message}`);
    return;
  }
  passed++;
  console.log(`  ✓ ${message}`);
}

const enabledEnv = { SDLC_HERMES_GATEWAY_REAL_DISPATCH: "enabled" };

const safeDispatchResult: HermesGatewayRealDispatchResult = {
  adapter: "hermes",
  source: "hermes_gateway_real_dispatch",
  status: "dispatch_executed_success",
  requestId: "req-hermes-gateway-integration",
  requestType: "review",
  enabled: true,
  eligible: true,
  executed: true,
  contractDecision: "eligible_contract_only",
  commandDecision: "executed_success",
  outputSummary: "ok",
  fallbackAction: "preserve_existing_gateway_behavior",
  affectsPrimaryGatewayResult: false,
  changesGatewayPrimaryDispatch: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  writesFiles: false,
  persistsAudit: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  warnings: [],
};

async function test(): Promise<void> {
  console.log("Hermes Gateway Real Dispatch Gateway Integration Contract Test\n");

  console.log("Test 1: Disabled");
  const r1 = evaluateHermesGatewayRealDispatchGatewayIntegrationContract({ env: {} });
  assert(r1.decision === "integration_disabled", "disabled decision");
  assert(r1.enabled === false, "disabled enabled false");
  assert(r1.mayAttach === false, "disabled mayAttach false");
  assert(r1.dispatchResultPresent === false, "disabled no dispatch result");
  assert(r1.contractOnly === true, "disabled contract-only");
  assert(r1.changesGatewayPrimaryDispatchNow === false, "disabled no Gateway primary change");
  assert(r1.changesGatewayFinalResultNow === false, "disabled no Gateway final result change");
  console.log("");

  console.log("Test 2: Enabled but missing dispatch result");
  const r2 = evaluateHermesGatewayRealDispatchGatewayIntegrationContract({ env: enabledEnv });
  assert(r2.decision === "missing_dispatch_result", "missing decision");
  assert(r2.enabled === true, "missing enabled true");
  assert(r2.mayAttach === false, "missing mayAttach false");
  assert(r2.dispatchResultPresent === false, "missing no dispatch result");
  console.log("");

  console.log("Test 3: Safe dispatch result may attach contract-only");
  const r3 = evaluateHermesGatewayRealDispatchGatewayIntegrationContract({
    env: enabledEnv,
    dispatchResult: safeDispatchResult,
  });
  assert(r3.decision === "safe_to_attach_contract_only", "safe decision");
  assert(r3.mayAttach === true, "safe mayAttach true");
  assert(r3.dispatchResultPresent === true, "safe dispatch result present");
  assert(r3.gatewayField === HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_FIELD, "safe gateway field");
  assert(r3.changesGatewayPrimaryDispatchNow === false, "safe no Gateway primary change");
  assert(r3.changesGatewayFinalResultNow === false, "safe no Gateway final result change");
  assert(r3.changesRuntimeFinalStatus === false, "safe no final status");
  assert(r3.changesRuntimeRouting === false, "safe no routing");
  assert(r3.affectsPrimaryGatewayResult === false, "safe no primary result effect");
  assert(r3.writesFiles === false, "safe no files");
  assert(r3.persistsAudit === false, "safe no persist");
  assert(r3.containsRawPrompt === false, "safe no raw prompt");
  assert(r3.containsRawArtifacts === false, "safe no raw artifacts");
  assert(r3.containsSecrets === false, "safe no secrets");
  console.log("");

  console.log("Test 4: Unsafe dispatch result rejected");
  const unsafeFields = [
    "changesGatewayPrimaryDispatch",
    "changesRuntimeFinalStatus",
    "changesRuntimeRouting",
    "affectsPrimaryGatewayResult",
    "writesFiles",
    "persistsAudit",
    "containsRawPrompt",
    "containsRawArtifacts",
    "containsSecrets",
  ] as const;
  for (const field of unsafeFields) {
    const unsafeDispatchResult = {
      ...safeDispatchResult,
      [field]: true,
    } as unknown as HermesGatewayRealDispatchResult;
    const result = evaluateHermesGatewayRealDispatchGatewayIntegrationContract({
      env: enabledEnv,
      dispatchResult: unsafeDispatchResult,
    });
    assert(result.decision === "unsafe_dispatch_result", `${field}: unsafe decision`);
    assert(result.mayAttach === false, `${field}: mayAttach false`);
    assert(result.dispatchResultPresent === true, `${field}: dispatch result present`);
  }
  console.log("");

  console.log("Test 5: Integration rules");
  const rules = HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_RULES;
  assert(rules.fieldName === "hermes_gateway_real_dispatch", "rules field");
  assert(rules.conditionalFieldOnly === true, "rules conditional field only");
  assert(rules.omitWhenDisabled === true, "rules omit when disabled");
  assert(rules.neverUseUndefinedKey === true, "rules never undefined key");
  assert(rules.mustNotChangePrimaryGatewayResult === true, "rules no primary Gateway change");
  assert(rules.mustNotChangeGatewayFinalResultNow === true, "rules no Gateway final result change");
  assert(rules.mustNotChangeRuntimeFinalStatus === true, "rules no Runtime final status");
  assert(rules.mustNotChangeRuntimeRouting === true, "rules no Runtime routing");
  assert(rules.mustNotMergeIntoArtifacts === true, "rules no artifact merge");
  assert(rules.mustNotPersistAudit === true, "rules no audit persistence");
  assert(rules.mustNotWriteFiles === true, "rules no files");
  assert(rules.requiresFeatureFlag === "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled", "rules flag");
  assert(rules.supportedRequestTypes.includes("review"), "rules review supported");
  assert(rules.supportedRequestTypes.includes("code_review"), "rules code_review supported");
  assert(rules.supportedRequestTypes.includes("validation"), "rules validation supported");
  assert(rules.unsupportedRequestTypes.includes("llm_task"), "rules llm_task unsupported");
  assert(rules.unsupportedRequestTypes.includes("code_generation"), "rules code_generation unsupported");
  assert(rules.unsupportedRequestTypes.includes("bugfix"), "rules bugfix unsupported");
  console.log("");

  console.log("Test 6: Markdown / JSON consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT.md", "utf-8");
  const jsonRaw = fs.readFileSync("metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-gateway-integration-contract.json", "utf-8");
  const json = JSON.parse(jsonRaw);
  assert(md.includes("implemented_contract_only"), "md status");
  assert(md.includes("hermes_gateway_real_dispatch"), "md gateway field");
  assert(md.includes("Feature-flagged Hermes Gateway Real Dispatch Gateway Integration"), "md next PR");
  assert(json.status === "implemented_contract_only", "json status");
  assert(json.gateway_field === "hermes_gateway_real_dispatch", "json gateway field");
  assert(json.omit_when_disabled === true, "json omit when disabled");
  assert(json.never_undefined_key === true, "json never undefined key");
  assert(json.recommended_next_pr.title === "Feature-flagged Hermes Gateway Real Dispatch Gateway Integration", "json next PR");
  console.log("");

  console.log("Test 7: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-gateway-integration-contract.ts", "utf-8");
  const forbidden = [
    "execution/gateway",
    "runtime",
    "dispatchHermesGatewayReal",
    "executeHermesCliCommand",
    "runHermesGatewayShadowSidecar",
    "buildHermesRuntimeShadowAttachmentFromRequest",
    "child_process",
    "\"fs\"",
    "'fs'",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "codex",
  ];
  const badLines = src.split("\n").filter((line) => {
    if (!line.includes("import ")) return false;
    const fromIdx = line.indexOf(" from ");
    if (fromIdx === -1) return false;
    const importPath = line.slice(fromIdx + 6).trim();
    return forbidden.some((item) => importPath.includes(item));
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
