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

  // ═══ Safety Fix Tests ═══

  // Test 16: Stderr containing dynamic prompt is fully redacted
  console.log("Test 16: Stderr prompt redaction");
  const leakPrompt = "Reply with exactly: KIMI_SAFETY_CHECK";
  const leakRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-LEAK",
    input: { prompt: leakPrompt },
  };
  // Simulate Kimi's real behavior: stderr echoes the prompt in model thinking
  const leakStderr = `• The user wants me to ${leakPrompt}. No tools needed.\n\nTo resume this session: kimi -r session_abc`;
  const leakRunner: KimiCliProcessRunner = {
    run: async (_ci: KimiCliExecutorCommandInput) => ({
      exitCode: 0, durationMs: 50,
      stdout: `{"requirement_id":"REQ-KIMI-LEAK"}`,
      stderr: leakStderr,
      stdoutPayload: `{"requirement_id":"REQ-KIMI-LEAK"}`,
    }),
  };

  // ── stdin mode with prompt in stderr ──
  const r16a = await executeKimiCliCommand({
    request: leakRequest,
    config: validConfig, // stdin mode
    env: envOn,
    runner: leakRunner,
  });
  assert(r16a.decision === "executed_success", "stdin: success");
  // Raw prompt must not appear in:
  const j16a = JSON.stringify(r16a);
  assert(!j16a.includes(leakPrompt), "stdin: prompt not in JSON result");
  assert(!(r16a.stderrSummary ?? "").includes(leakPrompt), "stdin: prompt not in stderrSummary");
  assert(!(r16a.stdoutSummary ?? "").includes(leakPrompt), "stdin: prompt not in stdoutSummary");
  assert(!(r16a.error ?? "").includes(leakPrompt), "stdin: prompt not in error");
  // Audit events must not contain prompt
  for (const evt of r16a.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(leakPrompt), `stdin audit ${evt.stage}: no prompt`);
    assert(!(evt.errorSummary ?? "").includes(leakPrompt), `stdin audit ${evt.stage}: no prompt in errorSummary`);
  }

  // ── argument mode with prompt in stderr ──
  const r16b = await executeKimiCliCommand({
    request: leakRequest,
    config: argConfig, // argument mode
    env: envOn,
    runner: leakRunner,
  });
  assert(r16b.decision === "executed_success", "argument: success");
  const j16b = JSON.stringify(r16b);
  assert(!j16b.includes(leakPrompt), "argument: prompt not in JSON result");
  assert(!(r16b.stderrSummary ?? "").includes(leakPrompt), "argument: prompt not in stderrSummary");
  assert(!(r16b.error ?? "").includes(leakPrompt), "argument: prompt not in error");
  // commandInput must not leak prompt
  const ci16b = JSON.stringify(r16b.commandInput);
  assert(!ci16b.includes(leakPrompt), "argument: prompt not in commandInput");
  // Audit events must not contain prompt
  for (const evt of r16b.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(leakPrompt), `argument audit ${evt.stage}: no prompt`);
    assert(!(evt.errorSummary ?? "").includes(leakPrompt), `argument audit ${evt.stage}: no prompt in errorSummary`);
  }
  console.log("");

  // Test 17: Missing prompt rejected without invoking runner (both transports)
  console.log("Test 17: Missing prompt rejection");

  // ── stdin mode, no prompt ──
  const noPromptRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-NOPROMPT",
    input: {}, // no prompt field
  };
  const r17a = await executeKimiCliCommand({
    request: noPromptRequest,
    config: validConfig, // stdin mode
    env: envOn,
    runner: throwingRunner(), // must NOT be called
  });
  assert(r17a.decision === "missing_prompt", "stdin: missing_prompt decision");
  assert(r17a.success === false, "stdin: failure");
  assert(r17a.error !== undefined && r17a.error.includes("missing"), "stdin: error message");
  // Audit event for missing prompt
  assert(r17a.auditEvents.some(e => e.outcome === "missing_prompt"), "stdin: missing_prompt audit");

  // ── argument mode, no prompt ──
  const r17b = await executeKimiCliCommand({
    request: noPromptRequest,
    config: argConfig, // argument mode
    env: envOn,
    runner: throwingRunner(), // must NOT be called
  });
  assert(r17b.decision === "missing_prompt", "argument: missing_prompt decision");
  assert(r17b.success === false, "argument: failure");
  // Must NOT fall through to stdin mode — runner never called
  assert(r17b.error !== undefined, "argument: error reported");

  // ── stdin mode, blank prompt ──
  const blankPromptRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-BLANK",
    input: { prompt: "   " }, // whitespace-only
  };
  const r17c = await executeKimiCliCommand({
    request: blankPromptRequest,
    config: validConfig,
    env: envOn,
    runner: throwingRunner(),
  });
  assert(r17c.decision === "missing_prompt", "stdin blank: missing_prompt decision");

  // ── argument mode, blank prompt ──
  const r17d = await executeKimiCliCommand({
    request: blankPromptRequest,
    config: argConfig,
    env: envOn,
    runner: throwingRunner(),
  });
  assert(r17d.decision === "missing_prompt", "argument blank: missing_prompt decision");

  // ── argument mode with missing prompt must NOT fall through to stdin ──
  // (verified by throwingRunner — if runner were called, it would throw)
  console.log("");

  // ═══ stdoutPayload Prompt-Leak Boundary Test ═══

  // Test 18: stdoutPayload containing dynamic prompt is rejected (not redacted)
  console.log("Test 18: stdoutPayload prompt-leak rejection");
  const leakPayloadPrompt = "build a login form with 2FA support";
  const leakPayloadRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-PAYLOAD-LEAK",
    input: { prompt: leakPayloadPrompt },
  };
  // Simulate Kimi echoing the full prompt back in stdout/stderr/stdoutPayload
  const leakedPayload = `Got it! I'll ${leakPayloadPrompt}. Here is the JSON: {"requirement_id":"REQ-KIMI-PAYLOAD-LEAK","multi_repo":false,"main_repo":"main","sub_requirements":[]}`;
  const leakedStderr = `• User asked: ${leakPayloadPrompt}. Analyzing...`;
  const payloadLeakRunner: KimiCliProcessRunner = {
    run: async (_ci: KimiCliExecutorCommandInput) => ({
      exitCode: 0,
      durationMs: 50,
      stdout: leakedPayload,
      stderr: leakedStderr,
      stdoutPayload: leakedPayload, // <-- prompt leaked into bounded payload
    }),
  };

  // ── stdin mode: stdoutPayload contains prompt → rejected ──
  let payloadLeakRunCount = 0;
  const payloadLeakCountingRunner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      payloadLeakRunCount++;
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: leakedPayload,
        stderr: leakedStderr,
        stdoutPayload: leakedPayload,
      };
    },
  };
  const r18a = await executeKimiCliCommand({
    request: leakPayloadRequest,
    config: validConfig, // stdin mode
    env: envOn,
    runner: payloadLeakCountingRunner,
  });
  assert(payloadLeakRunCount === 1, "stdin: runner called once");
  assert(r18a.decision === "executed_failure", "stdin: failure decision");
  assert(r18a.success === false, "stdin: not success");
  assert(r18a.error === "Kimi CLI structured output rejected", "stdin: generic error");
  // stdoutPayload must NOT be present in result
  const j18a = JSON.stringify(r18a);
  assert(!j18a.includes(leakPayloadPrompt), "stdin: raw prompt not in serialized result");
  assert(r18a.stdoutPayload === undefined, "stdin: stdoutPayload absent from result");
  // stderrSummary may contain [REDACTED_PROMPT] but NOT the raw prompt
  assert(!(r18a.stderrSummary ?? "").includes(leakPayloadPrompt), "stdin: prompt not in stderrSummary");
  // Audit events must not contain the prompt
  for (const evt of r18a.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(leakPayloadPrompt), `stdin audit ${evt.stage}: no prompt`);
  }

  // ── argument mode: stdoutPayload contains prompt → rejected ──
  let argLeakRunCount = 0;
  const argLeakCountingRunner: KimiCliProcessRunner = {
    run: async (ci: KimiCliExecutorCommandInput) => {
      argLeakRunCount++;
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: leakedPayload,
        stderr: leakedStderr,
        stdoutPayload: leakedPayload,
      };
    },
  };
  const r18b = await executeKimiCliCommand({
    request: leakPayloadRequest,
    config: argConfig, // argument mode
    env: envOn,
    runner: argLeakCountingRunner,
  });
  assert(argLeakRunCount === 1, "argument: runner called once");
  assert(r18b.decision === "executed_failure", "argument: failure decision");
  assert(r18b.success === false, "argument: not success");
  assert(r18b.error === "Kimi CLI structured output rejected", "argument: generic error");
  const j18b = JSON.stringify(r18b);
  assert(!j18b.includes(leakPayloadPrompt), "argument: raw prompt not in serialized result");
  assert(r18b.stdoutPayload === undefined, "argument: stdoutPayload absent from result");
  assert(!(r18b.stderrSummary ?? "").includes(leakPayloadPrompt), "argument: prompt not in stderrSummary");
  for (const evt of r18b.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(leakPayloadPrompt), `argument audit ${evt.stage}: no prompt`);
  }
  // commandInput must not leak prompt
  const ci18b = JSON.stringify(r18b.commandInput);
  assert(!ci18b.includes(leakPayloadPrompt), "argument: prompt not in commandInput");
  console.log("");

  // Test 19: Raw requirement in stdoutPayload rejected (not just full prompt)
  console.log("Test 19: Raw requirement in stdoutPayload rejected");
  const rawReqText = "deploy a kubernetes cluster with helm";
  const rawReqPrompt = `You are a requirement analysis assistant.\nRead the requirement below and return a single JSON object only.\n\nRequirement:\n${rawReqText}\n\nRequirement ID: REQ-KIMI-RAW\n\nReturn exactly this JSON shape:\n...`;
  const rawReqRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-RAW",
    input: { prompt: rawReqPrompt, requirement: rawReqText },
  };

  // ── stdin mode: stdoutPayload contains raw requirement ──
  let rawReqRunCount = 0;
  const rawReqRunner: KimiCliProcessRunner = {
    run: async (_ci: KimiCliExecutorCommandInput) => {
      rawReqRunCount++;
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: `• Processing: ${rawReqText}`,
        stderr: `• Thinking about: ${rawReqText}`,
        stdoutPayload: `• Processing: ${rawReqText}`, // raw requirement in payload
      };
    },
  };
  const r19a = await executeKimiCliCommand({
    request: rawReqRequest,
    config: validConfig, // stdin mode
    env: envOn,
    runner: rawReqRunner,
  });
  assert(rawReqRunCount === 1, "stdin: runner called once");
  assert(r19a.decision === "executed_failure", "stdin: failure decision");
  assert(r19a.success === false, "stdin: not success");
  assert(r19a.error === "Kimi CLI structured output rejected", "stdin: generic error");
  // stdoutPayload must be absent
  assert(r19a.stdoutPayload === undefined, "stdin: stdoutPayload absent");
  // Raw requirement must not appear in stderrSummary
  assert(!(r19a.stderrSummary ?? "").includes(rawReqText), "stdin: raw req not in stderrSummary");
  // Raw requirement must not appear in stdoutSummary
  assert(!(r19a.stdoutSummary ?? "").includes(rawReqText), "stdin: raw req not in stdoutSummary");
  // Serialized result must not contain raw requirement
  const j19a = JSON.stringify(r19a);
  assert(!j19a.includes(rawReqText), "stdin: raw req not in serialized result");
  // Audit events must not contain raw requirement
  for (const evt of r19a.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(rawReqText), `stdin audit ${evt.stage}: no raw req`);
  }

  // ── argument mode: stdoutPayload contains raw requirement ──
  let rawReqArgRunCount = 0;
  const rawReqArgRunner: KimiCliProcessRunner = {
    run: async (_ci: KimiCliExecutorCommandInput) => {
      rawReqArgRunCount++;
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: `• Processing: ${rawReqText}`,
        stderr: `• Thinking about: ${rawReqText}`,
        stdoutPayload: `• Processing: ${rawReqText}`,
      };
    },
  };
  const r19b = await executeKimiCliCommand({
    request: rawReqRequest,
    config: argConfig, // argument mode
    env: envOn,
    runner: rawReqArgRunner,
  });
  assert(rawReqArgRunCount === 1, "argument: runner called once");
  assert(r19b.decision === "executed_failure", "argument: failure decision");
  assert(r19b.stdoutPayload === undefined, "argument: stdoutPayload absent");
  const j19b = JSON.stringify(r19b);
  assert(!j19b.includes(rawReqText), "argument: raw req not in serialized result");
  for (const evt of r19b.auditEvents) {
    const je = JSON.stringify(evt);
    assert(!je.includes(rawReqText), `argument audit ${evt.stage}: no raw req`);
  }

  // ── Minimum length guard: short raw requirement (< 8 chars) NOT rejected ──
  const shortReq = "login";
  const shortReqRequest: ExecutionRequest = {
    type: "llm_task", node: "requirement-summary", agent: "kimi",
    requirementId: "REQ-KIMI-SHORT",
    input: { prompt: `You are a requirement analysis assistant.\n\nRequirement:\n${shortReq}\n\nRequirement ID: REQ-KIMI-SHORT`, requirement: shortReq },
  };
  let shortReqRunCount = 0;
  const shortReqRunner: KimiCliProcessRunner = {
    run: async (_ci: KimiCliExecutorCommandInput) => {
      shortReqRunCount++;
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: "ok",
        stderr: "",
        stdoutPayload: `{"requirement_id":"REQ-KIMI-SHORT","multi_repo":false,"main_repo":"main","sub_requirements":[]}`,
      };
    },
  };
  const r19c = await executeKimiCliCommand({
    request: shortReqRequest,
    config: validConfig,
    env: envOn,
    runner: shortReqRunner,
  });
  assert(shortReqRunCount === 1, "short req: runner called");
  // Short requirement (< 8 chars) should NOT trigger rejection
  // (It may succeed or fail for other reasons, but not for prompt leak)
  assert(r19c.error !== "Kimi CLI structured output rejected", "short req: not rejected as leak");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
