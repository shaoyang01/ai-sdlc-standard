// Regression Test — CLI Adapter Audit Trail
// ===========================================
// Verifies audit event construction, sanitization, and safety.
// No CLI execution, no process spawn.

import {
  sanitizeCliArgs,
  sanitizeErrorSummary,
  buildCliAdapterAuditEvent,
  buildCliCommandPreviewAudit,
  buildCliExecutionSkippedAudit,
  buildCliExecutionResultAudit,
} from "../execution/cli-adapter-audit";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("CLI Adapter Audit Trail Test\n");

  // Test 1: Arg sanitizer
  console.log("Test 1: Arg sanitizer");
  const args = sanitizeCliArgs(["--token=abc", "--api_key=xyz", "sk-test", "--safe"]);
  assert(args.filter(a => a === "[REDACTED]").length === 3, "3 redacted");
  assert(args.includes("--safe"), "--safe preserved");
  assert(!args.includes("abc") && !args.includes("xyz") && !args.includes("sk-test"), "no secrets");
  console.log("");

  // Test 2: Error sanitizer
  console.log("Test 2: Error sanitizer");
  const s = sanitizeErrorSummary("failed with token=abc\nmore with sk-test and password=123");
  assert(s !== undefined && !s.includes("\n"), "single line");
  assert(!s!.includes("token=") && !s!.includes("sk-") && !s!.includes("password="), "no secret patterns");
  assert(s!.length <= 300, "length <= 300");
  console.log("");

  // Test 3: Command preview audit
  console.log("Test 3: Command preview audit");
  const cfg: CliAdapterConfig = {
    adapter: "kimi", enabled: true, source: "test_override",
    command: "kimi", args: ["--mode", "plan", "--token=abc"], timeoutMs: 120000,
  };
  const e3 = buildCliCommandPreviewAudit({ adapter: "kimi", requestId: "R1", requestType: "llm_task", config: cfg });
  assert(e3.adapter === "kimi", "adapter kimi");
  assert(e3.stage === "command_preview_built", "stage preview");
  assert(e3.outcome === "dry_run_ready", "outcome ready");
  assert(e3.command === "kimi", "command");
  assert(e3.args!.some(a => a === "[REDACTED]"), "redacted");
  assert(e3.invokesCli === false, "no CLI");
  assert(e3.spawnsProcess === false, "no spawn");
  assert(e3.persistsAudit === false, "no persist");
  assert(e3.writesFiles === false, "no files");
  assert(e3.affectsRuntime === false, "no runtime");
  assert(e3.affectsGateway === false, "no gateway");
  assert(e3.containsRawPrompt === false, "no raw prompt");
  assert(e3.containsRawArtifacts === false, "no raw artifacts");
  assert(e3.containsSecrets === false, "no secrets");
  assert(e3.sanitized === true, "sanitized");
  const j3 = JSON.stringify(e3);
  assert(!j3.includes("abc"), "JSON no abc");
  console.log("");

  // Test 4: Missing command preview
  console.log("Test 4: Missing command preview");
  const nc: CliAdapterConfig = { adapter: "hermes", enabled: true, source: "test_override", args: [], timeoutMs: 120000 };
  const e4 = buildCliCommandPreviewAudit({ adapter: "hermes", requestId: "R2", requestType: "validation", config: nc });
  assert(e4.outcome === "missing_cli_command", "outcome missing");
  assert(e4.invokesCli === false && e4.spawnsProcess === false, "no CLI");
  console.log("");

  // Test 5: Execution skipped
  console.log("Test 5: Execution skipped");
  const e5 = buildCliExecutionSkippedAudit({ adapter: "kimi", requestId: "R3", requestType: "bugfix", reason: "unsupported_request_type" });
  assert(e5.stage === "execution_skipped", "stage skipped");
  assert(e5.outcome === "unsupported_request_type", "outcome unsupported");
  assert(e5.invokesCli === false && e5.spawnsProcess === false, "no CLI");
  console.log("");

  // Test 6: Execution success
  console.log("Test 6: Execution success audit");
  const e6 = buildCliExecutionResultAudit({ adapter: "kimi", requestId: "R4", requestType: "llm_task", exitCode: 0, durationMs: 123 });
  assert(e6.stage === "execution_completed", "stage completed");
  assert(e6.outcome === "success", "outcome success");
  assert(e6.invokesCli === true, "invokes CLI");
  assert(e6.spawnsProcess === true, "spawns process");
  assert(e6.persistsAudit === false, "no persist");
  assert(e6.containsRawPrompt === false, "no raw prompt");
  assert(e6.containsRawArtifacts === false, "no raw artifacts");
  console.log("");

  // Test 7: Execution failure
  console.log("Test 7: Execution failure audit");
  const e7 = buildCliExecutionResultAudit({ adapter: "hermes", requestId: "R5", requestType: "validation", exitCode: 1, errorSummary: "failed with token=abc" });
  assert(e7.stage === "execution_failed", "stage failed");
  assert(e7.outcome === "failure", "outcome failure");
  assert(e7.errorSummary !== undefined && !e7.errorSummary.includes("token="), "sanitized error");
  const j7 = JSON.stringify(e7);
  assert(!j7.includes("token="), "JSON no secret pattern");
  console.log("");

  // Test 8: Timeout
  console.log("Test 8: Timeout audit");
  const e8 = buildCliExecutionResultAudit({ adapter: "kimi", requestId: "R6", requestType: "llm_task", timedOut: true });
  assert(e8.stage === "execution_failed", "stage failed");
  assert(e8.outcome === "timeout", "outcome timeout");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
