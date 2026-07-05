// Regression Test — Kimi Gateway Real Dispatch Contract
// ========================================================
// Verifies contract-only eligibility. No Gateway wiring, no CLI.

import {
  isKimiGatewayRealDispatchEnabled,
  evaluateKimiGatewayRealDispatchContract,
  KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES,
} from "../execution/kimi-gateway-real-dispatch-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-REAL-DISPATCH",
  input: { prompt: "this prompt must not leak into real dispatch contract" },
};
const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};
const allOn = {
  SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled",
  SDLC_KIMI_GATEWAY_INTEGRATION: "enabled",
  SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled",
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Contract Test\n");

  // Test 1: Flag
  assert(isKimiGatewayRealDispatchEnabled({}) === false, "default off");
  assert(isKimiGatewayRealDispatchEnabled({ SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled" }) === true, "enabled on");
  console.log("Test 1 done\n");

  // Test 2: Default disabled
  const r2 = evaluateKimiGatewayRealDispatchContract({ request, config: validConfig, env: {} });
  assert(r2.eligible === false && r2.decision === "real_dispatch_disabled", "disabled");
  assert(r2.invokesCli === false && r2.spawnsProcess === false, "no CLI");
  assert(r2.primaryGatewayUnchanged === true, "gateway unchanged");
  assert(!JSON.stringify(r2).includes("this prompt must not leak"), "no prompt");
  console.log("Test 2 done\n");

  // Test 3-6: Various ineligible
  assert(evaluateKimiGatewayRealDispatchContract({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled" } }).decision === "gateway_integration_disabled", "integration missing");
  assert(evaluateKimiGatewayRealDispatchContract({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled", SDLC_KIMI_GATEWAY_INTEGRATION: "enabled" } }).decision === "command_execution_disabled", "command missing");
  assert(evaluateKimiGatewayRealDispatchContract({ request, config: { ...validConfig, enabled: false }, env: allOn }).decision === "adapter_disabled", "adapter disabled");
  assert(evaluateKimiGatewayRealDispatchContract({ request, config: { ...validConfig, command: undefined }, env: allOn }).decision === "missing_cli_command", "missing command");
  assert(evaluateKimiGatewayRealDispatchContract({ request: { ...request, type: "code_generation" }, config: validConfig, env: allOn }).decision === "unsupported_request_type", "unsupported type");
  // Missing config entirely
  assert(evaluateKimiGatewayRealDispatchContract({ request, env: allOn }).decision === "adapter_disabled", "missing config");
  console.log("Tests 3-7 done\n");

  // Test 8: Eligible
  const r8 = evaluateKimiGatewayRealDispatchContract({ request, config: validConfig, env: allOn });
  assert(r8.eligible === true && r8.decision === "real_dispatch_eligible_contract_only", "eligible");
  assert(r8.invokesCli === false && r8.spawnsProcess === false, "no CLI");
  assert(r8.writesFiles === false && r8.persistsAudit === false, "no files");
  assert(r8.affectsRuntimeRouting === false && r8.affectsFinalStatus === false, "no effects");
  assert(r8.auditEvents.every(e => e.invokesCli === false && e.spawnsProcess === false && e.affectsGateway === false), "audit safe");
  assert(r8.warnings.some(w => w.includes("contract only")), "contract-only warning");
  console.log("Test 8 done\n");

  // Test 9: Supported types
  assert(KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES.length === 1, "1 supported type");
  assert(KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES.includes("llm_task" as never), "llm_task");
  assert(!KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES.includes("code_generation" as never), "no code_gen");
  assert(!KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES.includes("review" as never), "no review");
  console.log("Test 9 done\n");

  // Test 10: No prompt
  for (const r of [r2, r8]) assert(!JSON.stringify(r).includes("this prompt must not leak"), "no prompt");
  console.log("Test 10 done\n");

  // Test 11: No forbidden imports
  const src = fs.readFileSync("execution/kimi-gateway-real-dispatch-contract.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("getKimiCliAdapterConfig") || l.includes("kimi-cli-adapter-contract") || l.includes("executeKimiCliCommand") || l.includes("kimi-cli-command-executor") || l.includes("execution-gateway") || l.includes("gateway.ts") || l.includes("./runtime") || l.includes("child_process") || l.includes("\"fs\"") || l.includes("'fs'") || l.includes("graph") || l.includes("policy-memory") || l.includes("http") || l.includes("fetch")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("Test 11 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
