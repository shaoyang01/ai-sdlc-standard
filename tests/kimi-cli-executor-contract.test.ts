// Regression Test — Kimi CLI Command Executor Contract
// =======================================================
// Verifies contract-only behavior. No process spawn, no CLI execution.

import {
  prepareKimiCliExecutorContract,
  buildKimiCliMockExecutorResult,
} from "../execution/kimi-cli-executor-contract";
import { getKimiCliAdapterConfig } from "../execution/kimi-cli-adapter-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-EXECUTOR-CONTRACT",
  input: { prompt: "this prompt must not appear in executor contract" },
};

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi CLI Executor Contract Test\n");

  // Test 1: Disabled
  console.log("Test 1: Disabled");
  const d = getKimiCliAdapterConfig({});
  const r1 = prepareKimiCliExecutorContract({ request, config: d });
  assert(r1.success === false && r1.decision === "disabled", "disabled");
  assert(r1.commandInput === undefined, "no input");
  assert(r1.auditEvents.length >= 1, "audit events");
  assert(r1.auditEvents.every(e => e.invokesCli === false && e.spawnsProcess === false), "audit no CLI");
  console.log("");

  // Test 2: Missing command
  console.log("Test 2: Missing command");
  const nc = getKimiCliAdapterConfig({ SDLC_KIMI_CLI_ADAPTER: "enabled" });
  const r2 = prepareKimiCliExecutorContract({ request, config: nc });
  assert(r2.decision === "missing_cli_command" && r2.success === false, "missing command");
  assert(r2.commandInput === undefined, "no input");
  assert(r2.auditEvents.some(e => e.outcome === "missing_cli_command"), "audit outcome");
  console.log("");

  // Test 3: Unsupported request type
  console.log("Test 3: Unsupported request type");
  const ur: ExecutionRequest = { ...request, type: "validation" };
  const r3 = prepareKimiCliExecutorContract({ request: ur, config: validConfig });
  assert(r3.decision === "unsupported_request_type" && r3.success === false, "unsupported");
  assert(r3.commandInput === undefined, "no input");
  console.log("");

  // Test 4: Contract ready
  console.log("Test 4: Contract ready");
  const r4 = prepareKimiCliExecutorContract({ request, config: validConfig });
  assert(r4.success === true && r4.decision === "contract_ready", "ready");
  assert(r4.commandInput!.command === "kimi", "command");
  assert(r4.commandInput!.sanitized === true, "sanitized");
  assert(r4.auditEvents.some(e => e.stage === "command_preview_built"), "preview audit");
  assert(r4.auditEvents.every(e => e.persistsAudit === false), "no persist");
  assert(r4.auditEvents.every(e => e.containsRawPrompt === false), "no raw prompt");
  assert(r4.auditEvents.every(e => e.containsRawArtifacts === false), "no raw artifacts");
  console.log("");

  // Test 5: Command input excludes prompt
  console.log("Test 5: Command input excludes prompt");
  assert(!JSON.stringify(r4).includes("this prompt must not appear in executor contract"), "no prompt in JSON");
  console.log("");

  // Test 6: Secret args redacted
  console.log("Test 6: Secret args redacted");
  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  const r6 = prepareKimiCliExecutorContract({ request, config: sc });
  assert(r6.commandInput!.args.includes("[REDACTED]"), "redacted");
  assert(r6.commandInput!.args.includes("--safe"), "--safe preserved");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc") && !j6.includes("xyz") && !j6.includes("sk-test"), "no secrets in JSON");
  console.log("");

  // Test 7: Mock success
  console.log("Test 7: Mock success");
  const r7 = buildKimiCliMockExecutorResult({ request, config: validConfig, exitCode: 0 });
  assert(r7.success === true && r7.decision === "mock_success", "mock success");
  assert(r7.auditEvents.some(e => e.outcome === "success"), "success audit");
  assert(r7.auditEvents.some(e => e.invokesCli === true), "invokesCli");
  assert(r7.auditEvents.some(e => e.spawnsProcess === true), "spawnsProcess");
  assert(r7.auditEvents.every(e => e.persistsAudit === false), "no persist");
  console.log("");

  // Test 8: Mock failure sanitizes error
  console.log("Test 8: Mock failure sanitizes error");
  const r8 = buildKimiCliMockExecutorResult({ request, config: validConfig, exitCode: 1, errorSummary: "failed token=abc password=123 sk-test" });
  assert(r8.success === false && r8.decision === "mock_failure", "mock failure");
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc") && !j8.includes("123") && !j8.includes("sk-test"), "no secrets in JSON");
  console.log("");

  // Test 9: Mock timeout
  console.log("Test 9: Mock timeout");
  const r9 = buildKimiCliMockExecutorResult({ request, config: validConfig, timedOut: true });
  assert(r9.success === false && r9.decision === "mock_timeout", "mock timeout");
  assert(r9.auditEvents.some(e => e.outcome === "timeout"), "timeout audit");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
