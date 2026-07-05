// Regression Test — Hermes CLI Command Executor Contract
// =========================================================
// Verifies contract-only behavior. No process spawn, no CLI execution.

import {
  prepareHermesCliExecutorContract,
  buildHermesCliMockExecutorResult,
} from "../execution/hermes-cli-executor-contract";
import { getHermesCliAdapterConfig } from "../execution/hermes-cli-adapter-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-EXECUTOR-CONTRACT",
  input: { artifacts: [{ type: "validation_report", content: "this artifact must not appear in executor contract" }] },
};

const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "validate"], timeoutMs: 120000,
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes CLI Executor Contract Test\n");

  const d = getHermesCliAdapterConfig({});
  const r1 = prepareHermesCliExecutorContract({ request, config: d });
  assert(r1.success === false && r1.decision === "disabled", "disabled");
  assert(r1.commandInput === undefined, "no input");
  assert(r1.auditEvents.every(e => e.invokesCli === false && e.spawnsProcess === false), "no CLI");
  console.log("Test 1 done\n");

  const nc = getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled" });
  const r2 = prepareHermesCliExecutorContract({ request, config: nc });
  assert(r2.decision === "missing_cli_command", "missing command");
  assert(r2.auditEvents.some(e => e.outcome === "missing_cli_command"), "audit outcome");
  console.log("Test 2 done\n");

  const ur: ExecutionRequest = { ...request, type: "llm_task" };
  const r3 = prepareHermesCliExecutorContract({ request: ur, config: validConfig });
  assert(r3.decision === "unsupported_request_type", "unsupported");
  console.log("Test 3 done\n");

  const r4 = prepareHermesCliExecutorContract({ request, config: validConfig });
  assert(r4.success === true && r4.decision === "contract_ready", "ready");
  assert(r4.commandInput!.command === "hermes" && r4.commandInput!.sanitized === true, "command");
  assert(r4.auditEvents.every(e => e.persistsAudit === false && e.invokesCli === false && e.spawnsProcess === false, "audit safety"));
  assert(!JSON.stringify(r4).includes("this artifact must not appear in executor contract"), "no artifact in JSON");
  console.log("Test 4-5 done\n");

  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  const r6 = prepareHermesCliExecutorContract({ request, config: sc });
  assert(r6.commandInput!.args.includes("[REDACTED]") && r6.commandInput!.args.includes("--safe"), "redacted + safe");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc") && !j6.includes("xyz") && !j6.includes("sk-test"), "no secrets");
  console.log("Test 6 done\n");

  const r7 = buildHermesCliMockExecutorResult({ request, config: validConfig, exitCode: 0 });
  assert(r7.success === true && r7.decision === "mock_success" && r7.auditEvents.some(e => e.outcome === "success"), "mock success");
  console.log("Test 7 done\n");

  const r8 = buildHermesCliMockExecutorResult({ request, config: validConfig, exitCode: 1, errorSummary: "failed token=abc password=123 sk-test" });
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc") && !j8.includes("123") && !j8.includes("sk-test"), "mock failure sanitized");
  console.log("Test 8 done\n");

  const r9 = buildHermesCliMockExecutorResult({ request, config: validConfig, timedOut: true });
  assert(r9.success === false && r9.decision === "mock_timeout" && r9.auditEvents.some(e => e.outcome === "timeout"), "mock timeout");
  console.log("Test 9 done\n");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
