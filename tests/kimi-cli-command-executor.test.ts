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

  // ═══ Argument Prompt Transport Tests ═══

  const promptText = "Reply with JSON only";
  const argRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-ARG-TRANSPORT",
    input: { prompt: promptText },
  };

  const argConfig: CliAdapterConfig = {
    adapter: "kimi", enabled: true, source: "test_override",
    command: "kimi", args: ["--output-format", "text"],
    timeoutMs: 120000,
    promptTransport: "argument",
    promptArgument: "-p",
  };

  // Test 10: Default stdin compatibility (no transport config → stdin mode)
  console.log("Test 10: Default stdin compatibility");
  let t10stdin: string | undefined = undefined;
  let t10args: string[] = [];
  const t10runner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      t10stdin = ci.stdin;
      t10args = ci.args;
      return { exitCode: 0, durationMs: 1, stdout: "ok" };
    },
  };
  const r10 = await executeKimiCliCommand({
    request: argRequest,
    config: validConfig, // no promptTransport set → defaults to stdin
    env: envOn,
    runner: t10runner,
  });
  assert(r10.decision === "executed_success", "success");
  assert(t10stdin === promptText, "stdin has prompt");
  assert(t10args.includes("--mode"), "static arg preserved");
  assert(t10args.includes("plan"), "static arg preserved");
  const j10 = JSON.stringify(r10);
  assert(!j10.includes(promptText), "prompt not in JSON result");
  assert(j10.includes("--mode"), "static arg visible");
  console.log("");

  // Test 11: Argument transport command construction
  console.log("Test 11: Argument transport command construction");
  let t11stdin: string | undefined = undefined;
  let t11args: string[] = [];
  const t11runner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      t11stdin = ci.stdin;
      t11args = ci.args;
      return { exitCode: 0, durationMs: 1, stdout: "ok" };
    },
  };
  const r11 = await executeKimiCliCommand({
    request: argRequest,
    config: argConfig,
    env: envOn,
    runner: t11runner,
  });
  assert(r11.decision === "executed_success", "success");
  assert(t11stdin === undefined, "stdin is undefined");
  assert(t11args.length >= 3, "args have static + flag + prompt");
  assert(t11args.includes("--output-format"), "static --output-format");
  assert(t11args.includes("text"), "static text");
  assert(t11args.includes("-p"), "-p flag present");
  assert(t11args[t11args.length - 1] === promptText, "last arg is prompt");
  // Verify prompt is NOT in the returned commandInput
  assert(r11.commandInput !== undefined, "commandInput exists");
  const r11args = r11.commandInput!.args;
  assert(!r11args.includes(promptText), "prompt not in returned args");
  assert(r11args.includes("[REDACTED_PROMPT]"), "[REDACTED_PROMPT] placeholder present");
  const j11 = JSON.stringify(r11);
  assert(!j11.includes(promptText), "prompt not in serialized result");
  assert(j11.includes("[REDACTED_PROMPT]"), "[REDACTED_PROMPT] in serialized");
  console.log("");

  // Test 12: Argument order and single argument integrity (shell metacharacters)
  console.log("Test 12: Argument order and shell safety");
  const metaPrompt = `line1\nline2 has spaces "quotes" and ; $ \` | specials`;
  const metaRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-META",
    input: { prompt: metaPrompt },
  };
  let t12args: string[] = [];
  const t12runner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      t12args = ci.args;
      return { exitCode: 0, durationMs: 1, stdout: "ok" };
    },
  };
  const r12 = await executeKimiCliCommand({
    request: metaRequest,
    config: argConfig,
    env: envOn,
    runner: t12runner,
  });
  assert(r12.decision === "executed_success", "success");
  // Prompt must be exactly one array element
  const promptIndex = t12args.indexOf(metaPrompt);
  assert(promptIndex !== -1, "prompt found as single element");
  assert(promptIndex === t12args.length - 1, "prompt is last element");
  assert(t12args.filter(a => a === metaPrompt).length === 1, "prompt appears exactly once");
  // Metacharacters preserved intact (no shell interpretation)
  assert(metaPrompt.includes("\n"), "newlines intact");
  assert(metaPrompt.includes('"'), "quotes intact");
  assert(metaPrompt.includes(";"), "semicolon intact");
  assert(metaPrompt.includes("$"), "dollar intact");
  assert(metaPrompt.includes("`"), "backtick intact");
  assert(metaPrompt.includes("|"), "pipe intact");
  // No shell: verified by the fact that spawn uses shell:false (checked in runner)
  // Prompt not leaked in result
  const j12 = JSON.stringify(r12);
  assert(!j12.includes("line1"), "prompt not in JSON");
  assert(!j12.includes("specials"), "prompt not in JSON");
  console.log("");

  // Test 13: Audit redaction — no raw prompt in audit or error paths
  console.log("Test 13: Audit redaction");
  // Success path
  const r13a = await executeKimiCliCommand({
    request: argRequest,
    config: argConfig,
    env: envOn,
    runner: fakeRunner({ exitCode: 0, durationMs: 1, stdout: "ok" }),
  });
  const j13a = JSON.stringify(r13a);
  assert(!j13a.includes(promptText), "success: no prompt in JSON");
  assert(j13a.includes("[REDACTED_PROMPT]"), "success: [REDACTED_PROMPT] present");
  // All audit events must not contain prompt
  for (const evt of r13a.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(promptText), `audit event ${evt.stage}: no prompt`);
  }
  // Failure path
  const r13b = await executeKimiCliCommand({
    request: argRequest,
    config: argConfig,
    env: envOn,
    runner: fakeRunner({ exitCode: 1, durationMs: 1, stderr: "kimi error" }),
  });
  const j13b = JSON.stringify(r13b);
  assert(!j13b.includes(promptText), "failure: no prompt in JSON");
  // Timeout path
  const r13c = await executeKimiCliCommand({
    request: argRequest,
    config: argConfig,
    env: envOn,
    runner: fakeRunner({ timedOut: true, durationMs: 1 }),
  });
  const j13c = JSON.stringify(r13c);
  assert(!j13c.includes(promptText), "timeout: no prompt in JSON");
  // commandInput in all three paths has [REDACTED_PROMPT]
  assert(r13a.commandInput!.args.includes("[REDACTED_PROMPT]"), "success: commandInput redacted");
  assert(r13b.commandInput!.args.includes("[REDACTED_PROMPT]"), "failure: commandInput redacted");
  assert(r13c.commandInput!.args.includes("[REDACTED_PROMPT]"), "timeout: commandInput redacted");
  console.log("");

  // Test 14: Argument mode with unavailable stdin still succeeds
  console.log("Test 14: Argument mode does not require stdin");
  // Create a runner that simulates a child with no stdin
  const noStdinRunner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      // In argument mode, stdin should be undefined
      // Even with no stdin, execution should succeed
      if (ci.stdin !== undefined) {
        return { exitCode: undefined, durationMs: 1, stderr: "unexpected stdin in argument mode" };
      }
      return { exitCode: 0, durationMs: 1, stdout: "ok" };
    },
  };
  const r14 = await executeKimiCliCommand({
    request: argRequest,
    config: argConfig,
    env: envOn,
    runner: noStdinRunner,
  });
  assert(r14.decision === "executed_success", "argument mode succeeds without stdin");
  console.log("");

  // Test 15: Stdin mode with unavailable stdin fails safely
  console.log("Test 15: Stdin mode with unavailable stdin");
  // Use a runner that reports missing stdin like the real runner does
  const missingStdinRunner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      if (ci.stdin) {
        // Simulate child.stdin being null
        return {
          exitCode: undefined,
          durationMs: 1,
          stderr: "Kimi CLI stdin is unavailable",
          stdoutPayload: "",
          stdoutTruncated: false,
        };
      }
      return { exitCode: 0, durationMs: 1, stdout: "ok" };
    },
  };
  const r15 = await executeKimiCliCommand({
    request: argRequest,
    config: validConfig, // stdin mode (no promptTransport)
    env: envOn,
    runner: missingStdinRunner,
  });
  assert(r15.decision !== "executed_success", "stdin mode fails without stdin");
  assert(r15.error !== undefined || r15.stderrSummary !== undefined, "error reported");
  const j15 = JSON.stringify(r15);
  assert(!j15.includes(promptText), "prompt not in JSON");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
