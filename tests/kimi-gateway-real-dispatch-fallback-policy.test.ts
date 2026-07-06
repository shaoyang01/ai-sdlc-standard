// Regression Test — Kimi Gateway Real Dispatch Fallback Policy
// ==============================================================
// Verifies fallback policy produces correct actions for all states.
// Contract-only. No CLI, no Gateway.

import { classifyKimiGatewayRealDispatchFallback } from "../execution/kimi-gateway-real-dispatch-fallback-policy";
import * as fs from "fs";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Fallback Policy Test\n");

  // Test 1: Flags-off → fall_through_to_shadow
  const p1 = classifyKimiGatewayRealDispatchFallback({ contractDecision: "real_dispatch_disabled" });
  assert(p1.action === "fall_through_to_shadow", "flags-off → shadow");
  assert(p1.affectsFinalStatus === false && p1.affectsRuntimeRouting === false, "no effects");
  console.log("Test 1 done\n");

  // Test 2-4: Structured disabled
  assert(classifyKimiGatewayRealDispatchFallback({ contractDecision: "gateway_integration_disabled" }).action === "return_structured_disabled", "integration → disabled");
  assert(classifyKimiGatewayRealDispatchFallback({ contractDecision: "command_execution_disabled" }).action === "return_structured_disabled", "command → disabled");
  assert(classifyKimiGatewayRealDispatchFallback({ contractDecision: "adapter_disabled" }).action === "return_structured_disabled", "adapter → disabled");
  assert(classifyKimiGatewayRealDispatchFallback({ contractDecision: "missing_cli_command" }).action === "return_structured_disabled", "missing cmd → disabled");
  console.log("Tests 2-4 done\n");

  // Test 5: Unsupported → structured unsupported
  assert(classifyKimiGatewayRealDispatchFallback({ contractDecision: "unsupported_request_type" }).action === "return_structured_unsupported", "unsupported");
  console.log("Test 5 done\n");

  // Test 6: CLI failure → structured failure
  const p6 = classifyKimiGatewayRealDispatchFallback({ dispatchStatus: "executed_failure" });
  assert(p6.action === "return_structured_failure" && p6.success === false, "cli failure");
  console.log("Test 6 done\n");

  // Test 7: CLI timeout → structured timeout
  assert(classifyKimiGatewayRealDispatchFallback({ dispatchStatus: "executed_timeout" }).action === "return_structured_timeout", "timeout");
  console.log("Test 7 done\n");

  // Test 7b: Guardrail rejection → structured failure
  const p7b = classifyKimiGatewayRealDispatchFallback({
    dispatchStatus: "contract_rejected",
    guardrailDecision: "prompt_too_large",
  });
  assert(p7b.reason === "guardrail_rejected", "guardrail reason");
  assert(p7b.action === "return_structured_failure", "guardrail action");
  assert(p7b.success === false && p7b.affectsFinalStatus === false, "guardrail no effects");
  console.log("Test 7b done\n");

  // Test 8: Sanitization
  const p8 = classifyKimiGatewayRealDispatchFallback({ error: "failed token=abc password=123 sk-test api_key=xyz" });
  const j8 = JSON.stringify(p8);
  assert(!j8.includes("abc") && !j8.includes("123") && !j8.includes("sk-test") && !j8.includes("xyz"), "sanitized");
  console.log("Test 8 done\n");

  // Test 9: No forbidden imports
  const src = fs.readFileSync("execution/kimi-gateway-real-dispatch-fallback-policy.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("./runtime") || l.includes("gateway.ts") || l.includes("child_process") || l.includes("\"fs\"") || l.includes("graph") || l.includes("policy-memory")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("Test 9 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
