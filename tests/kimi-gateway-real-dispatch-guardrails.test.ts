// Regression Test — Kimi Gateway Real Dispatch Guardrails
// =========================================================
// Verifies guardrail decisions. No CLI, no runtime.

import { evaluateKimiGatewayGuardrails, clampKimiGatewaySummary } from "../execution/kimi-gateway-real-dispatch-guardrails";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: [], timeoutMs: 120000,
};

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-GR", input: { prompt: "test" },
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Guardrails Test\n");

  // Test 1: Allowed
  const r1 = evaluateKimiGatewayGuardrails({ request, config: validConfig });
  assert(r1.allowed === true && r1.decision === "allowed", "allowed");
  assert(r1.affectsFinalStatus === false && r1.affectsRuntimeRouting === false, "no effects");
  console.log("Test 1 done\n");

  // Test 2: Unsupported type
  assert(evaluateKimiGatewayGuardrails({ request: { ...request, type: "code_generation" }, config: validConfig }).decision === "unsupported_request_type", "unsupported");
  console.log("Test 2 done\n");

  // Test 3: Prompt too large
  const r3 = evaluateKimiGatewayGuardrails({ request: { ...request, input: { prompt: "x".repeat(100) } }, config: validConfig, limits: { maxPromptLength: 50 } });
  assert(r3.allowed === false && r3.decision === "prompt_too_large", "prompt too large");
  assert(!JSON.stringify(r3).includes("xxx"), "no prompt in result");
  console.log("Test 3 done\n");

  // Test 4: Serialized input too large
  const r4 = evaluateKimiGatewayGuardrails({ request: { ...request, input: { data: "x".repeat(200) } }, config: validConfig, limits: { maxSerializedInputLength: 50 } });
  assert(r4.allowed === false && r4.decision === "request_too_large", "request too large");
  console.log("Test 4 done\n");

  // Test 5-7: Config
  assert(evaluateKimiGatewayGuardrails({ request }).decision === "invalid_cli_config", "missing config");
  assert(evaluateKimiGatewayGuardrails({ request, config: { ...validConfig, enabled: false } }).decision === "invalid_cli_config", "disabled config");
  assert(evaluateKimiGatewayGuardrails({ request, config: { ...validConfig, command: "" } }).decision === "missing_cli_command", "missing command");
  console.log("Tests 5-7 done\n");

  // Test 8-9: Timeout
  assert(evaluateKimiGatewayGuardrails({ request, config: { ...validConfig, timeoutMs: 500 } }).decision === "timeout_out_of_range", "timeout too low");
  assert(evaluateKimiGatewayGuardrails({ request, config: { ...validConfig, timeoutMs: 999999 } }).decision === "timeout_out_of_range", "timeout too high");
  console.log("Tests 8-9 done\n");

  // Test 10: Clamp summary
  const clamped = clampKimiGatewaySummary({ value: "token=abc password=123 sk-test api_key=xyz " + "y".repeat(500), maxLength: 100 });
  assert(clamped !== undefined && !clamped.includes("abc") && !clamped.includes("sk-test"), "sanitized");
  assert(!clamped!.includes("123") && !clamped!.includes("xyz"), "no secrets");
  assert(clamped!.length <= 113, `length <= 113 (got ${clamped!.length})`); // 100 + "…[truncated]"
  console.log("Test 10 done\n");

  // Test 11: No forbidden imports
  const src = fs.readFileSync("execution/kimi-gateway-real-dispatch-guardrails.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("./runtime") || l.includes("gateway.ts") || l.includes("child_process") || l.includes("\"fs\"") || l.includes("graph") || l.includes("http") || l.includes("fetch")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("Test 11 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
