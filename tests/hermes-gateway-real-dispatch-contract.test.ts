// Regression Test — Hermes Gateway Real Dispatch Contract
// ==========================================================
// Contract-only. No Gateway, no CLI, no runtime.

import {
  evaluateHermesGatewayRealDispatchContract,
  isHermesGatewayRealDispatchEnabled,
  getHermesGatewayRealDispatchRequiredFlags,
  isHermesGatewayRealDispatchRequestTypeSupported,
  HERMES_GATEWAY_REAL_DISPATCH_FLAG,
} from "../execution/hermes-gateway-real-dispatch-contract";
import { HERMES_GATEWAY_INTEGRATION_FLAG } from "../execution/hermes-gateway-integration-contract";
import { HERMES_CLI_COMMAND_EXECUTION_FLAG } from "../execution/hermes-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "review"], timeoutMs: 120000,
};
const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-GW-REAL",
  input: { prompt: "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK" },
};
const allOn: Record<string, string | undefined> = {
  [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled",
  [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
  [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Real Dispatch Contract Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default disabled");
  const r1 = evaluateHermesGatewayRealDispatchContract({ request, config: validConfig, env: {} });
  assert(r1.decision === "real_dispatch_disabled", "real dispatch disabled");
  assert(r1.eligible === false, "not eligible");
  assert(r1.contractOnly === true, "contract only");
  assert(r1.invokesCli === false, "no CLI");
  assert(r1.spawnsProcess === false, "no spawn");
  assert(r1.changesGatewayPrimaryDispatchNow === false, "no gateway change");
  assert(r1.changesRuntimeFinalStatus === false, "no final status");
  assert(r1.changesRuntimeRouting === false, "no routing");
  console.log("");

  // Test 2: Integration flag disabled
  console.log("Test 2: Integration flag disabled");
  const r2 = evaluateHermesGatewayRealDispatchContract({ request, config: validConfig,
    env: { [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled", [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled" },
  });
  assert(r2.decision === "gateway_integration_disabled", "integration disabled");
  assert(r2.eligible === false, "not eligible");
  console.log("");

  // Test 3: Command flag disabled
  console.log("Test 3: Command flag disabled");
  const r3 = evaluateHermesGatewayRealDispatchContract({ request, config: validConfig,
    env: { [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled", [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled" },
  });
  assert(r3.decision === "command_execution_disabled", "command disabled");
  assert(r3.eligible === false, "not eligible");
  console.log("");

  // Test 4: Unsupported request types
  console.log("Test 4: Unsupported request types");
  for (const t of ["llm_task", "code_generation", "bugfix"]) {
    const r = evaluateHermesGatewayRealDispatchContract({
      request: { ...request, type: t as any }, config: validConfig, env: allOn,
    });
    assert(r.decision === "unsupported_request_type", `${t} unsupported`);
    assert(r.eligible === false, `${t} not eligible`);
  }
  console.log("");

  // Test 5: Adapter disabled
  console.log("Test 5: Adapter disabled");
  const r5 = evaluateHermesGatewayRealDispatchContract({
    request: { ...request, type: "review" },
    config: { ...validConfig, enabled: false }, env: allOn,
  });
  assert(r5.decision === "adapter_disabled", "adapter disabled");
  assert(r5.eligible === false, "not eligible");
  console.log("");

  // Test 6: Missing command
  console.log("Test 6: Missing command");
  const r6 = evaluateHermesGatewayRealDispatchContract({
    request: { ...request, type: "review" },
    config: { ...validConfig, command: "" }, env: allOn,
  });
  assert(r6.decision === "missing_cli_command", "missing command");
  assert(r6.eligible === false, "not eligible");
  console.log("");

  // Test 7: Eligible contract only
  console.log("Test 7: Eligible contract only");
  for (const t of ["review", "code_review", "validation"]) {
    const r = evaluateHermesGatewayRealDispatchContract({
      request: { ...request, type: t as any }, config: validConfig, env: allOn,
    });
    assert(r.decision === "eligible_contract_only", `${t} eligible`);
    assert(r.eligible === true, `${t} eligible true`);
    assert(r.contractOnly === true, `${t} contract only`);
    assert(r.invokesCli === false, `${t} no CLI`);
    assert(r.spawnsProcess === false, `${t} no spawn`);
    assert(r.writesFiles === false, `${t} no files`);
    assert(r.persistsAudit === false, `${t} no persist`);
    assert(r.changesGatewayPrimaryDispatchNow === false, `${t} no gateway change`);
    assert(r.changesRuntimeFinalStatus === false, `${t} no final status`);
    assert(r.changesRuntimeRouting === false, `${t} no routing`);
    assert(r.affectsPrimaryGatewayResult === false, `${t} no primary`);
  }
  console.log("");

  // Test 8: Supported / unsupported helpers
  console.log("Test 8: Supported / unsupported helpers");
  assert(isHermesGatewayRealDispatchRequestTypeSupported("review"), "review supported");
  assert(isHermesGatewayRealDispatchRequestTypeSupported("code_review"), "code_review supported");
  assert(isHermesGatewayRealDispatchRequestTypeSupported("validation"), "validation supported");
  assert(!isHermesGatewayRealDispatchRequestTypeSupported("llm_task"), "llm_task unsupported");
  assert(!isHermesGatewayRealDispatchRequestTypeSupported("code_generation"), "code_generation unsupported");
  assert(!isHermesGatewayRealDispatchRequestTypeSupported("bugfix"), "bugfix unsupported");
  console.log("");

  // Test 9: Required flags helper
  console.log("Test 9: Required flags helper");
  const flags = getHermesGatewayRealDispatchRequiredFlags();
  assert(flags.length === 3, "3 flags");
  assert(flags.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "real dispatch flag");
  assert(flags.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled"), "integration flag");
  assert(flags.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "command flag");
  console.log("");

  // Test 10: Fallback policy
  console.log("Test 10: Fallback policy");
  const fp = r1.fallbackPolicy;
  assert(fp.onIneligible === "preserve_existing_gateway_behavior", "fp onIneligible");
  assert(fp.onUnsupportedRequestType === "preserve_existing_gateway_behavior", "fp onUnsupported");
  assert(fp.onMissingCommand === "preserve_existing_gateway_behavior", "fp onMissing");
  assert(fp.onFutureExecutionFailure === "fallback_without_final_status_change", "fp onFailure");
  console.log("");

  // Test 11: No raw prompt leak
  console.log("Test 11: No raw prompt leak");
  const allResults = [r1, r2, r3, r5, r6,
    evaluateHermesGatewayRealDispatchContract({ request: { ...request, type: "review" }, config: validConfig, env: allOn }),
  ];
  for (const r of allResults) {
    assert(!JSON.stringify(r).includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), `${r.decision}: no prompt leak`);
  }
  console.log("");

  // Test 12: Markdown / JSON consistency
  console.log("Test 12: Markdown / JSON consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_CONTRACT.md", "utf-8");
  assert(md.includes("implemented_contract_only"), "md: status");
  assert(md.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "md: real flag");
  assert(md.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled"), "md: integration flag");
  assert(md.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "md: command flag");
  assert(md.includes("Feature-flagged Hermes Gateway Real Dispatch"), "md: next PR");
  const jsonRaw = fs.readFileSync("hermes-gateway-real-dispatch-contract.json", "utf-8");
  const json = JSON.parse(jsonRaw);
  assert(json.status === "implemented_contract_only", "json: status");
  assert(json.contract_only === true, "json: contract only");
  assert(json.required_flags.length === 3, "json: 3 flags");
  assert(json.recommended_next_pr.title === "Feature-flagged Hermes Gateway Real Dispatch", "json: next PR");
  console.log("");

  // Test 13: Forbidden imports
  console.log("Test 13: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-contract.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "executeHermesCliCommand", "runHermesGatewayShadowSidecar", "buildHermesRuntimeShadowAttachmentFromRequest", "child_process", "\"fs\"", "http", "https", "fetch", "policy-memory", "graph", "kimi-gateway-real-dispatch", "codex"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    const fromIdx = l.indexOf(" from ");
    if (fromIdx === -1) return false;
    const path = l.slice(fromIdx + 6).trim();
    for (const f of forbidden) {
      if (path.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
