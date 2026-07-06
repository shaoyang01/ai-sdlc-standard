// Regression Test — Hermes Gateway Integration Contract
// =========================================================
// Contract-only. No CLI, no Gateway, no runtime.

import {
  evaluateHermesGatewayIntegrationContract,
  isHermesGatewayRequestTypeSupportedByContract,
  getHermesGatewayIntegrationRequiredFlags,
  HERMES_GATEWAY_INTEGRATION_FLAG,
} from "../execution/hermes-gateway-integration-contract";
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
  requirementId: "REQ-HERMES-GW",
  input: { prompt: "THIS_HERMES_GATEWAY_PROMPT_MUST_NOT_LEAK" },
};
const bothOn: Record<string, string | undefined> = {
  [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
  [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Integration Contract Test\n");

  // Test 1: Gateway flag disabled
  console.log("Test 1: Gateway flag disabled");
  const r1 = evaluateHermesGatewayIntegrationContract({
    request, config: validConfig,
    env: { [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled" },
  });
  assert(r1.decision === "gateway_integration_disabled", "gateway disabled");
  assert(r1.eligible === false, "not eligible");
  assert(r1.invokesCli === false, "no CLI");
  assert(r1.spawnsProcess === false, "no spawn");
  assert(r1.changesGatewayRouting === false, "no gateway routing");
  assert(r1.changesRuntimeRouting === false, "no runtime routing");
  assert(r1.changesFinalStatus === false, "no final status");
  console.log("");

  // Test 2: Command execution flag disabled
  console.log("Test 2: Command execution flag disabled");
  const r2 = evaluateHermesGatewayIntegrationContract({
    request, config: validConfig,
    env: { [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled" },
  });
  assert(r2.decision === "command_execution_disabled", "command disabled");
  assert(r2.eligible === false, "not eligible");
  console.log("");

  // Test 3: Unsupported request types
  console.log("Test 3: Unsupported request types");
  const unsupported = ["llm_task", "code_generation", "bugfix"];
  for (const t of unsupported) {
    const r = evaluateHermesGatewayIntegrationContract({
      request: { ...request, type: t as any }, config: validConfig, env: bothOn,
    });
    assert(r.decision === "unsupported_request_type", `${t} unsupported`);
    assert(r.eligible === false, `${t} not eligible`);
  }
  console.log("");

  // Test 4: Supported request types
  console.log("Test 4: Supported request types");
  const supported = ["review", "code_review", "validation"];
  for (const t of supported) {
    const r = evaluateHermesGatewayIntegrationContract({
      request: { ...request, type: t as any }, config: validConfig, env: bothOn,
    });
    assert(r.decision === "eligible_contract_only", `${t} eligible`);
    assert(r.eligible === true, `${t} eligible true`);
    assert(r.contractOnly === true, `${t} contract only`);
    assert(r.invokesCli === false, `${t} no CLI`);
    assert(r.spawnsProcess === false, `${t} no spawn`);
    assert(r.writesFiles === false, `${t} no files`);
    assert(r.persistsAudit === false, `${t} no persist`);
  }
  console.log("");

  // Test 5: Adapter disabled
  console.log("Test 5: Adapter disabled");
  const r5 = evaluateHermesGatewayIntegrationContract({
    request: { ...request, type: "review" },
    config: { ...validConfig, enabled: false }, env: bothOn,
  });
  assert(r5.decision === "adapter_disabled", "adapter disabled");
  assert(r5.eligible === false, "not eligible");
  console.log("");

  // Test 6: Missing command
  console.log("Test 6: Missing command");
  const r6 = evaluateHermesGatewayIntegrationContract({
    request: { ...request, type: "review" },
    config: { ...validConfig, command: "" }, env: bothOn,
  });
  assert(r6.decision === "missing_cli_command", "missing command");
  assert(r6.eligible === false, "not eligible");
  console.log("");

  // Test 7: Required flags helper
  console.log("Test 7: Required flags helper");
  const flags = getHermesGatewayIntegrationRequiredFlags();
  assert(flags.length === 2, "2 flags");
  assert(flags.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled"), "gateway flag");
  assert(flags.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "command flag");
  console.log("");

  // Test 8: Audit event safety
  console.log("Test 8: Audit event safety");
  const allResults = [
    r1, r2, r5, r6,
    ...unsupported.map(t => evaluateHermesGatewayIntegrationContract({
      request: { ...request, type: t as any }, config: validConfig, env: bothOn,
    })),
    ...supported.map(t => evaluateHermesGatewayIntegrationContract({
      request: { ...request, type: t as any }, config: validConfig, env: bothOn,
    })),
  ];
  for (const r of allResults) {
    assert(Array.isArray(r.auditEvents) && r.auditEvents.length > 0, `${r.decision}: audit events exist`);
    for (const ae of r.auditEvents) {
      assert(ae.contractOnly === true, `${r.decision}: audit contractOnly`);
      assert(ae.invokesCli === false, `${r.decision}: audit no CLI`);
      assert(ae.spawnsProcess === false, `${r.decision}: audit no spawn`);
      assert(ae.writesFiles === false, `${r.decision}: audit no writes`);
      assert(ae.persistsAudit === false, `${r.decision}: audit no persist`);
      assert(ae.containsRawPrompt === false, `${r.decision}: audit no raw prompt`);
      assert(ae.containsRawArtifacts === false, `${r.decision}: audit no raw artifacts`);
      assert(ae.containsSecrets === false, `${r.decision}: audit no secrets`);
    }
  }
  console.log("");

  // Test 9: Raw prompt does not leak
  console.log("Test 9: Raw prompt does not leak");
  for (const r of allResults) {
    assert(!JSON.stringify(r).includes("THIS_HERMES_GATEWAY_PROMPT_MUST_NOT_LEAK"), `${r.decision}: no prompt leak`);
  }
  console.log("");

  // Test 10: No forbidden imports
  console.log("Test 10: No forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-integration-contract.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "child_process", "executeHermesCliCommand", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    for (const f of forbidden) {
      if (l.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
