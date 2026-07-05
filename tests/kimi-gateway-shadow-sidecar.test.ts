// Regression Test — Kimi Gateway Shadow Sidecar
// ===============================================
// Uses fake runner only. No real Kimi CLI calls.

import {
  isKimiGatewayShadowEnabled,
  buildKimiGatewayShadowSidecar,
} from "../execution/kimi-gateway-shadow-sidecar";
import type { KimiCliProcessRunner } from "../execution/kimi-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-GATEWAY-SHADOW",
  input: { prompt: "this prompt must not leak into gateway shadow sidecar" },
};

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};

const allOn = {
  SDLC_KIMI_GATEWAY_SHADOW: "enabled",
  SDLC_KIMI_GATEWAY_INTEGRATION: "enabled",
  SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled",
};

function throwingRunner(): KimiCliProcessRunner {
  return { run: async () => { throw new Error("should not be called"); } };
}
function fakeRunner(result: { exitCode: number; durationMs: number; stdout: string; stderr: string }): KimiCliProcessRunner {
  return { run: async () => result };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Shadow Sidecar Test\n");

  // Test 1: Shadow flag
  console.log("Test 1: Shadow flag");
  assert(isKimiGatewayShadowEnabled({}) === false, "default off");
  assert(isKimiGatewayShadowEnabled({ SDLC_KIMI_GATEWAY_SHADOW: "enabled" }) === true, "enabled on");
  console.log("");

  // Test 2: Shadow disabled
  console.log("Test 2: Shadow disabled does not evaluate or execute");
  const r2 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: {}, runner: throwingRunner() });
  assert(r2.enabled === false && r2.executed === false, "not executed");
  assert(r2.decision === "shadow_disabled", "shadow_disabled");
  assert(r2.primaryGatewayUnchanged === true, "gateway unchanged");
  assert(r2.affectsFinalStatus === false && r2.affectsRouting === false, "no effects");
  assert(r2.wiredToRuntime === false, "not wired");
  assert(r2.commandInput === undefined, "no command input");
  assert(!JSON.stringify(r2).includes("this prompt must not leak"), "no prompt");
  console.log("");

  // Test 3: Integration flag missing
  console.log("Test 3: Integration flag missing");
  const r3 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_SHADOW: "enabled" }, runner: throwingRunner() });
  assert(r3.decision === "gateway_integration_disabled", "integration disabled");
  assert(r3.executed === false, "not executed");
  console.log("");

  // Test 4: Command execution flag missing
  console.log("Test 4: Command execution flag missing");
  const r4 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_SHADOW: "enabled", SDLC_KIMI_GATEWAY_INTEGRATION: "enabled" }, runner: throwingRunner() });
  assert(r4.decision === "command_execution_disabled", "command disabled");
  assert(r4.executed === false, "not executed");
  console.log("");

  // Test 5: Unsupported request type
  console.log("Test 5: Unsupported request type");
  const r5 = await buildKimiGatewayShadowSidecar({ request: { ...request, type: "validation" }, config: validConfig, env: allOn, runner: throwingRunner() });
  assert(r5.decision === "unsupported_request_type", "unsupported");
  assert(r5.executed === false, "not executed");
  console.log("");

  // Test 6: Eligible + fake success
  console.log("Test 6: Eligible + fake success");
  const r6 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: allOn, runner: fakeRunner({ exitCode: 0, durationMs: 12, stdout: "ok", stderr: "" }) });
  assert(r6.enabled === true && r6.executed === true, "executed");
  assert(r6.decision === "shadow_executed_success", "success");
  assert(r6.stdoutSummary === "ok", "stdout");
  assert(r6.primaryGatewayUnchanged === true, "gateway unchanged");
  assert(r6.affectsFinalStatus === false && r6.affectsRouting === false, "no effects");
  assert(r6.wiredToRuntime === false, "not wired");
  console.log("");

  // Test 7: Fake failure sanitizes
  console.log("Test 7: Fake failure sanitizes");
  const r7 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: allOn, runner: fakeRunner({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test" }) });
  assert(r7.decision === "shadow_executed_failure", "failure");
  assert(r7.stderrSummary !== undefined && !r7.stderrSummary.includes("abc"), "no abc");
  assert(!r7.stderrSummary!.includes("123") && !r7.stderrSummary!.includes("sk-test"), "no secrets");
  const j7 = JSON.stringify(r7);
  assert(!j7.includes("abc") && !j7.includes("123") && !j7.includes("sk-test"), "JSON clean");
  console.log("");

  // Test 8: Timeout
  console.log("Test 8: Timeout");
  const tr: KimiCliProcessRunner = { run: async () => ({ timedOut: true, durationMs: 120000, stderr: "timeout" }) };
  const r8 = await buildKimiGatewayShadowSidecar({ request, config: validConfig, env: allOn, runner: tr });
  assert(r8.decision === "shadow_executed_timeout" && r8.executed === true, "timeout");
  console.log("");

  // Test 9: Secret args redacted
  console.log("Test 9: Secret args redacted");
  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  let capturedArgs: string[] = [];
  const cr: KimiCliProcessRunner = { run: async (input: any) => { capturedArgs = input.args; return { exitCode: 0, durationMs: 1, stdout: "ok" }; } };
  const r9 = await buildKimiGatewayShadowSidecar({ request, config: sc, env: allOn, runner: cr });
  assert(capturedArgs.includes("[REDACTED]"), "redacted");
  assert(capturedArgs.includes("--safe"), "--safe");
  assert(!capturedArgs.includes("abc") && !capturedArgs.includes("xyz"), "no secrets in args");
  const j9 = JSON.stringify(r9);
  assert(!j9.includes("abc") && !j9.includes("xyz") && !j9.includes("sk-test"), "JSON clean");
  console.log("");

  // Test 10: Prompt not leaked
  console.log("Test 10: Prompt not leaked");
  assert(!JSON.stringify(r6).includes("this prompt must not leak into gateway shadow sidecar"), "no prompt");
  console.log("");

  // Test 11: No forbidden imports
  console.log("Test 11: No forbidden imports");
  const src = fs.readFileSync("execution/kimi-gateway-shadow-sidecar.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("runtime") || l.includes("gateway") || l.includes("Gateway") || l.includes("child_process") || l.includes("graph")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
