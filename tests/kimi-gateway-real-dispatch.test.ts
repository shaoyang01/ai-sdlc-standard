// Regression Test — Kimi Gateway Real Dispatch
// ==============================================
// Fake runner only. No real Kimi CLI.

import { dispatchKimiGatewayReal } from "../execution/kimi-gateway-real-dispatch";
import type { KimiCliProcessRunner } from "../execution/kimi-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-GATEWAY-REAL",
  input: { prompt: "this prompt must not leak" },
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

function fr(v: any): KimiCliProcessRunner { return { run: async () => v }; }
function throwing(): KimiCliProcessRunner { return { run: async () => { throw new Error("nope"); } }; }

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Test\n");

  // Test 1: Default disabled
  const r1 = await dispatchKimiGatewayReal({ request, config: validConfig, env: {}, runner: throwing() });
  assert(r1.status === "disabled" && r1.executed === false, "disabled");
  assert(r1.affectsFinalStatus === false && r1.affectsRuntimeRouting === false, "no effects");
  assert(!JSON.stringify(r1).includes("this prompt must not leak"), "no prompt");
  console.log("Test 1 done\n");

  // Test 2-3: Integration/command missing
  assert((await dispatchKimiGatewayReal({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled" }, runner: throwing() })).status === "disabled", "integration missing");
  assert((await dispatchKimiGatewayReal({ request, config: validConfig, env: { SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled", SDLC_KIMI_GATEWAY_INTEGRATION: "enabled" }, runner: throwing() })).status === "disabled", "command missing");
  console.log("Tests 2-3 done\n");

  // Test 4: Unsupported type
  const r4 = await dispatchKimiGatewayReal({ request: { ...request, type: "code_generation" }, config: validConfig, env: allOn, runner: throwing() });
  assert(r4.status === "unsupported" && r4.executed === false, "unsupported");
  console.log("Test 4 done\n");

  // Test 5: Fake success
  const r5 = await dispatchKimiGatewayReal({ request, config: validConfig, env: allOn, runner: fr({ exitCode: 0, durationMs: 12, stdout: "ok", stderr: "" }) });
  assert(r5.status === "executed_success" && r5.executed === true, "success");
  assert(r5.stdoutSummary === "ok", "stdout");
  assert(r5.affectsFinalStatus === false && r5.writesFiles === false && r5.persistsAudit === false, "safe");
  console.log("Test 5 done\n");

  // Test 6: Fake failure sanitizes
  const r6 = await dispatchKimiGatewayReal({ request, config: validConfig, env: allOn, runner: fr({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test" }) });
  assert(r6.status === "executed_failure", "failure");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc") && !j6.includes("123") && !j6.includes("sk-test"), "no secrets");
  console.log("Test 6 done\n");

  // Test 7: Timeout
  const r7 = await dispatchKimiGatewayReal({ request, config: validConfig, env: allOn, runner: fr({ timedOut: true, durationMs: 120000, stderr: "timeout" }) });
  assert(r7.status === "executed_timeout", "timeout");
  console.log("Test 7 done\n");

  // Test 8: Missing config
  const r8 = await dispatchKimiGatewayReal({ request, env: allOn });
  assert(r8.status === "disabled" && r8.executed === false, "missing config");
  console.log("Test 8 done\n");

  // Test 9: No prompt
  for (const r of [r5, r6]) assert(!JSON.stringify(r).includes("this prompt must not leak"), "no prompt");
  console.log("Test 9 done\n");

  // Test 10: No forbidden imports
  const src = fs.readFileSync("execution/kimi-gateway-real-dispatch.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("./runtime") || l.includes("../runtime") || l.includes("graph") || l.includes("child_process") || l.includes("\"fs\"") || l.includes("http") || l.includes("fetch") || l.includes("policy-memory")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("Test 10 done\n");

  // Test 11: Sanitized catch error
  const r11 = await dispatchKimiGatewayReal({ request, config: validConfig, env: allOn, runner: { run: async () => { throw new Error("boom token=abc password=123 sk-test"); } } });
  assert(r11.status === "executed_failure" && r11.executed === false, "catch failure");
  const j11 = JSON.stringify(r11);
  assert(!j11.includes("abc") && !j11.includes("123") && !j11.includes("sk-test"), "catch sanitized");
  console.log("Test 11 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
