// Regression Test — Hermes CLI Command Executor
// ================================================
// Fake runner only. No real Hermes CLI.

import {
  executeHermesCliCommand,
  isHermesCliCommandExecutionEnabled,
  HERMES_CLI_COMMAND_EXECUTION_FLAG,
  type HermesCliProcessRunner,
} from "../execution/hermes-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-EXEC",
  input: { prompt: "THIS_RAW_PROMPT_MUST_NOT_LEAK" },
};
const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "review"], timeoutMs: 120000,
};
const allOn: Record<string, string | undefined> = { [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled" };

function fr(v: any): HermesCliProcessRunner { return { run: async () => v }; }
function throwing(): HermesCliProcessRunner {
  return { run: async () => { throw new Error("nope"); } };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes CLI Command Executor Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default disabled");
  let called1 = 0;
  const r1 = await executeHermesCliCommand({
    request, config: validConfig, env: {},
    runner: { run: async () => { called1++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r1.decision === "disabled", "disabled");
  assert(r1.executed === false, "not executed");
  assert(r1.invokesCli === false, "no CLI");
  assert(r1.spawnsProcess === false, "no spawn");
  assert(r1.affectsFinalStatus === false && r1.affectsRuntimeRouting === false, "no effects");
  assert(called1 === 0, "runner not called");
  console.log("");

  // Test 2: Missing config
  console.log("Test 2: Missing config");
  const r2 = await executeHermesCliCommand({ request, env: allOn, runner: throwing() });
  assert(r2.decision === "missing_config", "missing config");
  assert(r2.executed === false, "not executed");
  console.log("");

  // Test 3: Disabled config
  console.log("Test 3: Disabled config");
  const r3 = await executeHermesCliCommand({
    request, config: { ...validConfig, enabled: false }, env: allOn, runner: throwing(),
  });
  assert(r3.decision === "missing_config", "disabled config");
  assert(r3.executed === false, "not executed");
  console.log("");

  // Test 4: Missing command
  console.log("Test 4: Missing command");
  const r4 = await executeHermesCliCommand({
    request, config: { ...validConfig, command: "" }, env: allOn, runner: throwing(),
  });
  assert(r4.decision === "missing_command", "missing command");
  assert(r4.executed === false, "not executed");
  console.log("");

  // Test 5: Fake success
  console.log("Test 5: Fake success");
  const r5 = await executeHermesCliCommand({
    request, config: validConfig, env: allOn,
    runner: fr({ exitCode: 0, durationMs: 12, stdout: "ok", stderr: "" }),
  });
  assert(r5.decision === "executed_success", "success");
  assert(r5.executed === true, "executed true");
  assert(r5.invokesCli === true, "invokes CLI");
  assert(r5.affectsFinalStatus === false, "no final status");
  assert(r5.affectsRuntimeRouting === false, "no routing");
  assert(r5.writesFiles === false, "no files");
  assert(r5.persistsAudit === false, "no persist");
  const j5 = JSON.stringify(r5);
  assert(!j5.includes("THIS_RAW_PROMPT_MUST_NOT_LEAK"), "no prompt leak");
  console.log("");

  // Test 6: Fake failure sanitizes
  console.log("Test 6: Fake failure sanitizes secrets");
  const r6 = await executeHermesCliCommand({
    request, config: validConfig, env: allOn,
    runner: fr({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test api_key=xyz" }),
  });
  assert(r6.decision === "executed_failure", "failure");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc"), "no abc");
  assert(!j6.includes("123"), "no 123");
  assert(!j6.includes("sk-test"), "no sk-test");
  assert(!j6.includes("xyz"), "no xyz");
  assert(!j6.includes("THIS_RAW_PROMPT_MUST_NOT_LEAK"), "no prompt leak");
  console.log("");

  // Test 7: Fake timeout
  console.log("Test 7: Fake timeout");
  const r7 = await executeHermesCliCommand({
    request, config: validConfig, env: allOn,
    runner: fr({ timedOut: true, durationMs: 120000, stderr: "timeout" }),
  });
  assert(r7.decision === "executed_timeout", "timeout");
  assert(r7.executed === true, "executed true");
  assert(r7.invokesCli === true, "invokes CLI");
  assert(typeof r7.error === "string" && r7.error.length > 0, "error present");
  console.log("");

  // Test 8: Fake runner throws with secrets
  console.log("Test 8: Runner throws sanitized");
  const r8 = await executeHermesCliCommand({
    request, config: validConfig, env: allOn,
    runner: { run: async () => { throw new Error("boom token=abc password=123 sk-test"); } },
  });
  assert(r8.decision === "executed_failure", "throw failure");
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc"), "no abc in throw");
  assert(!j8.includes("123"), "no 123 in throw");
  assert(!j8.includes("sk-test"), "no sk-test in throw");
  console.log("");

  // Test 9: Raw prompt does not leak
  console.log("Test 9: Raw prompt does not leak");
  for (const r of [r5, r6, r7, r8]) {
    assert(!JSON.stringify(r).includes("THIS_RAW_PROMPT_MUST_NOT_LEAK"), `no prompt leak in ${r.decision}`);
  }
  console.log("");

  // Test 10: Audit event safety
  console.log("Test 10: Audit event safety");
  for (const r of [r1, r2, r3, r4, r5, r6, r7, r8]) {
    assert(Array.isArray(r.auditEvents), `${r.decision}: audit events array`);
    for (const ae of r.auditEvents) {
      assert(ae.writesFiles === false, `${r.decision}: audit no writes`);
      assert(ae.persistsAudit === false, `${r.decision}: audit no persist`);
      assert(ae.containsRawPrompt === false, `${r.decision}: audit no raw prompt`);
      assert(ae.containsRawArtifacts === false, `${r.decision}: audit no raw artifacts`);
      assert(ae.containsSecrets === false, `${r.decision}: audit no secrets`);
    }
  }
  console.log("");

  // Test 11: No forbidden imports
  console.log("Test 11: No forbidden imports");
  const src = fs.readFileSync("execution/hermes-cli-command-executor.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    for (const f of forbidden) {
      if (l.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
