// Regression Test — Kimi Gateway Integration Contract
// ======================================================
// Verifies contract-only eligibility. No Gateway wiring, no CLI.

import {
  isKimiGatewayIntegrationEnabled,
  evaluateKimiGatewayIntegrationEligibility,
} from "../execution/kimi-gateway-integration-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-GATEWAY-INTEGRATION",
  input: { prompt: "this prompt must not leak into gateway integration contract" },
};

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};

const bothOn = { SDLC_KIMI_GATEWAY_INTEGRATION: "enabled", SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled" };

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Integration Contract Test\n");

  // Test 1: Feature flag
  console.log("Test 1: Gateway integration flag");
  assert(isKimiGatewayIntegrationEnabled({}) === false, "default off");
  assert(isKimiGatewayIntegrationEnabled({ SDLC_KIMI_GATEWAY_INTEGRATION: "disabled" }) === false, "disabled off");
  assert(isKimiGatewayIntegrationEnabled({ SDLC_KIMI_GATEWAY_INTEGRATION: "enabled" }) === true, "enabled on");
  console.log("");

  // Test 2: Gateway integration disabled
  console.log("Test 2: Gateway integration disabled");
  const r2 = evaluateKimiGatewayIntegrationEligibility({ request, config: validConfig, env: {} });
  assert(r2.eligible === false && r2.decision === "gateway_integration_disabled", "gateway disabled");
  assert(r2.warnings.some(w => w.includes("Gateway integration disabled")), "warning");
  assert(r2.requiredFlags.length === 2, "2 required flags");
  assert(!JSON.stringify(r2).includes("this prompt must not leak"), "no prompt");
  console.log("");

  // Test 3: Command execution disabled
  console.log("Test 3: Command execution disabled");
  const r3 = evaluateKimiGatewayIntegrationEligibility({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_INTEGRATION: "enabled" } });
  assert(r3.eligible === false && r3.decision === "command_execution_disabled", "command disabled");
  assert(r3.warnings.some(w => w.includes("Command execution disabled")), "warning");
  console.log("");

  // Test 4: Adapter disabled
  console.log("Test 4: Adapter disabled");
  const r4 = evaluateKimiGatewayIntegrationEligibility({ request, config: { ...validConfig, enabled: false }, env: bothOn });
  assert(r4.eligible === false && r4.decision === "adapter_disabled", "adapter disabled");
  console.log("");

  // Test 5: Missing command
  console.log("Test 5: Missing command");
  const r5 = evaluateKimiGatewayIntegrationEligibility({ request, config: { ...validConfig, command: undefined }, env: bothOn });
  assert(r5.eligible === false && r5.decision === "missing_cli_command", "missing command");
  console.log("");

  // Test 6: Unsupported request type
  console.log("Test 6: Unsupported request type");
  const r6 = evaluateKimiGatewayIntegrationEligibility({ request: { ...request, type: "validation" }, config: validConfig, env: bothOn });
  assert(r6.eligible === false && r6.decision === "unsupported_request_type", "unsupported");
  console.log("");

  // Test 7: Eligible contract only
  console.log("Test 7: Eligible contract only");
  const r7 = evaluateKimiGatewayIntegrationEligibility({ request, config: validConfig, env: bothOn });
  assert(r7.eligible === true && r7.decision === "eligible_contract_only", "eligible");
  assert(r7.commandInput!.command === "kimi", "command");
  assert(r7.warnings.some(w => w.includes("Gateway not wired")), "not wired warning");
  assert(r7.auditEvents.every(e => e.persistsAudit === false), "no persist");
  assert(r7.auditEvents.every(e => e.invokesCli === false), "eligible contract no CLI");
  assert(r7.auditEvents.every(e => e.spawnsProcess === false), "eligible contract no spawn");
  assert(r7.auditEvents.every(e => e.affectsGateway === false), "eligible contract no gateway");
  assert(r7.auditEvents.every(e => e.affectsRuntime === false), "eligible contract no runtime");
  assert(r7.auditEvents.every(e => e.containsRawPrompt === false), "no raw prompt");
  assert(r7.auditEvents.every(e => e.containsRawArtifacts === false), "no raw artifacts");
  assert(!JSON.stringify(r7).includes("this prompt must not leak"), "no prompt");
  console.log("");

  // Test 8: Secret args redacted
  console.log("Test 8: Secret args redacted");
  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  const r8 = evaluateKimiGatewayIntegrationEligibility({ request, config: sc, env: bothOn });
  assert(r8.commandInput!.args.includes("[REDACTED]"), "redacted");
  assert(r8.commandInput!.args.includes("--safe"), "--safe");
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc") && !j8.includes("xyz") && !j8.includes("sk-test"), "no secrets");
  console.log("");

  // Test 9: No forbidden imports
  console.log("Test 9: No forbidden imports");
  const src = fs.readFileSync("execution/kimi-gateway-integration-contract.ts", "utf-8");
  const importLines = src.split("\n").filter(l => l.includes("import ") && (l.includes("runtime") || l.includes("gateway") || l.includes("Gateway") || l.includes("child_process") || l.includes("graph")));
  assert(importLines.length === 0, `no forbidden imports (found ${importLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
