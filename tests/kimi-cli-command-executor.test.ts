// Regression Test — Kimi CLI Command Executor
// =============================================
// Uses fake runner only. No real Kimi CLI calls.

import {
  isKimiCliCommandExecutionEnabled,
  executeKimiCliCommand,
  type KimiCliProcessRunner,
  type KimiCliProcessResult,
} from "../execution/kimi-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import type { KimiCliExecutorCommandInput } from "../execution/kimi-cli-executor-contract";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-COMMAND-EXECUTOR",
  input: { prompt: "this prompt must not leak into executor output" },
};

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};

const envOn = { SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled" };

function throwingRunner(): KimiCliProcessRunner {
  return { run: async () => { throw new Error("should not be called"); } };
}

function fakeRunner(result: KimiCliProcessResult): KimiCliProcessRunner {
  return {
    run: async (_input: KimiCliExecutorCommandInput) => result,
  };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi CLI Command Executor Test\n");

  // Test 1: Feature flag
  console.log("Test 1: Feature flag defaults off");
  assert(isKimiCliCommandExecutionEnabled({}) === false, "default off");
  assert(isKimiCliCommandExecutionEnabled({ SDLC_KIMI_CLI_COMMAND_EXECUTION: "disabled" }) === false, "disabled off");
  assert(isKimiCliCommandExecutionEnabled({ SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled" }) === true, "enabled on");
  console.log("");

  // Test 2: Execution gate blocks
  console.log("Test 2: Execution gate blocks");
  const r2 = await executeKimiCliCommand({ request, config: validConfig, runner: throwingRunner() });
  assert(r2.decision === "execution_not_enabled", "not enabled");
  assert(r2.success === false, "success false");
  assert(r2.commandInput !== undefined, "command input exists");
  assert(r2.auditEvents.some(e => e.outcome === "skipped_contract_only"), "skipped audit");
  assert(r2.auditEvents.every(e => e.persistsAudit === false), "no persist");
  console.log("");

  // Test 3: Contract failure
  console.log("Test 3: Contract failure does not execute");
  const r3 = await executeKimiCliCommand({ request: { ...request, type: "validation" }, config: validConfig, env: envOn, runner: throwingRunner() });
  assert(r3.decision === "unsupported_request_type", "unsupported");
  console.log("");

  // Test 4: Fake runner success
  console.log("Test 4: Fake runner success");
  const r4 = await executeKimiCliCommand({ request, config: validConfig, env: envOn, runner: fakeRunner({ exitCode: 0, durationMs: 12, stdout: "ok", stderr: "" }) });
  assert(r4.decision === "executed_success" && r4.success === true, "success");
  assert(r4.stdoutSummary === "ok", "stdout");
  assert(r4.auditEvents.some(e => e.outcome === "success"), "success audit");
  console.log("");

  // Test 5: Fake runner failure sanitizes
  console.log("Test 5: Fake runner failure sanitizes stderr");
  const r5 = await executeKimiCliCommand({ request, config: validConfig, env: envOn, runner: fakeRunner({ exitCode: 1, durationMs: 5, stderr: "failed token=abc password=123 sk-test" }) });
  assert(r5.decision === "executed_failure" && r5.success === false, "failure");
  assert(r5.stderrSummary !== undefined && !r5.stderrSummary.includes("abc"), "no abc");
  assert(!r5.stderrSummary!.includes("123"), "no 123");
  assert(!r5.stderrSummary!.includes("sk-test"), "no sk-test");
  const j5 = JSON.stringify(r5);
  assert(!j5.includes("abc") && !j5.includes("123") && !j5.includes("sk-test"), "JSON clean");
  console.log("");

  // Test 6: Timeout
  console.log("Test 6: Fake runner timeout");
  const r6 = await executeKimiCliCommand({ request, config: validConfig, env: envOn, runner: fakeRunner({ timedOut: true, durationMs: 120000, stderr: "timeout" }) });
  assert(r6.decision === "executed_timeout" && r6.success === false, "timeout");
  assert(r6.auditEvents.some(e => e.outcome === "timeout"), "timeout audit");
  console.log("");

  // Test 7: Prompt not leaked
  console.log("Test 7: Prompt not leaked");
  const j4 = JSON.stringify(r4);
  assert(!j4.includes("this prompt must not leak into executor output"), "prompt not in JSON");
  console.log("");

  // Test 8: Secret args redacted
  console.log("Test 8: Secret args redacted before runner");
  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  let capturedArgs: string[] = [];
  const capRunner: KimiCliProcessRunner = { run: async (input: KimiCliExecutorCommandInput) => { capturedArgs = input.args; return { exitCode: 0, durationMs: 1, stdout: "ok" }; } };
  const r8 = await executeKimiCliCommand({ request, config: sc, env: envOn, runner: capRunner });
  assert(capturedArgs.includes("[REDACTED]"), "redacted in args");
  assert(capturedArgs.includes("--safe"), "--safe preserved");
  assert(!capturedArgs.includes("abc"), "no abc in args");
  assert(!capturedArgs.includes("xyz"), "no xyz in args");
  assert(!capturedArgs.includes("sk-test"), "no sk-test in args");
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc") && !j8.includes("xyz") && !j8.includes("sk-test"), "JSON clean");
  console.log("");

  // Test 9: No runtime/Gateway imports (comments mentioning them are fine)
  console.log("Test 9: No runtime/Gateway imports");
  const fs = require("fs");
  const src = fs.readFileSync("execution/kimi-cli-command-executor.ts", "utf-8");
  // Check imports only — the file may mention them in comments as "not wired"
  const importLines = src.split("\n").filter(l => l.includes("import ") && (l.includes("runtime") || l.includes("gateway") || l.includes("Gateway") || l.includes("graph")));
  assert(importLines.length === 0, `no runtime/gateway/graph imports (found ${importLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
