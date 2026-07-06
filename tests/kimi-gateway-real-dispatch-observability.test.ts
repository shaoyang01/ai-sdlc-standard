// Regression Test — Kimi Gateway Real Dispatch Observability
// =============================================================
// Verifies in-memory observability events. No CLI, no persistence.

import { buildKimiGatewayRealDispatchObservabilityEvent } from "../execution/kimi-gateway-real-dispatch-observability";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-OBS", input: { prompt: "this prompt must not leak" },
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Observability Test\n");

  // Test 1: Defaults
  const e1 = buildKimiGatewayRealDispatchObservabilityEvent({ stage: "pre_execution", request });
  assert(e1.source === "kimi_gateway_real_dispatch", "source");
  assert(e1.agent === "kimi", "agent");
  assert(e1.executed === false, "executed false");
  assert(e1.invokesCli === false && e1.spawnsProcess === false, "no CLI");
  assert(e1.affectsFinalStatus === false && e1.affectsRuntimeRouting === false, "no effects");
  assert(e1.writesFiles === false && e1.persistsAudit === false, "no persist/files");
  assert(e1.containsRawPrompt === false && e1.containsRawArtifacts === false && e1.containsSecrets === false, "no raw data");
  console.log("Test 1 done\n");

  // Test 2: No prompt leak
  assert(!JSON.stringify(e1).includes("this prompt must not leak"), "no prompt");
  console.log("Test 2 done\n");

  // Test 3: Warning sanitization (no raw secrets)
  const e3 = buildKimiGatewayRealDispatchObservabilityEvent({
    stage: "execution_failure", request,
    warnings: ["failed token=abc password=123 sk-test api_key=xyz"],
  });
  const j3 = JSON.stringify(e3);
  assert(!j3.includes("abc") && !j3.includes("123") && !j3.includes("sk-test") && !j3.includes("xyz"), "sanitized");
  console.log("Test 3 done\n");

  // Test 4: Contract rejected
  const e4 = buildKimiGatewayRealDispatchObservabilityEvent({
    stage: "contract_rejected", request,
    contractDecision: "command_execution_disabled",
  });
  assert(e4.stage === "contract_rejected" && e4.contractDecision === "command_execution_disabled", "rejected");
  assert(e4.invokesCli === false && e4.executed === false, "no CLI");
  console.log("Test 4 done\n");

  // Test 5: Success
  const e5 = buildKimiGatewayRealDispatchObservabilityEvent({
    stage: "execution_success", request,
    dispatchStatus: "executed_success", executed: true, invokesCli: true,
  });
  assert(e5.stage === "execution_success" && e5.executed === true, "success");
  console.log("Test 5 done\n");

  // Test 6: Fallback
  const e6 = buildKimiGatewayRealDispatchObservabilityEvent({
    stage: "fallback", request,
    fallbackReason: "cli_timeout", fallbackAction: "return_structured_timeout",
  });
  assert(e6.fallbackReason === "cli_timeout" && e6.fallbackAction === "return_structured_timeout", "fallback");
  console.log("Test 6 done\n");

  // Test 7: No forbidden imports
  const src = fs.readFileSync("execution/kimi-gateway-real-dispatch-observability.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("./runtime") || l.includes("gateway.ts") || l.includes("child_process") || l.includes("\"fs\"") || l.includes("graph") || l.includes("http") || l.includes("fetch") || l.includes("policy-memory")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("Test 7 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
