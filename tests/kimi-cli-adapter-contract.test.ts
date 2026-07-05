// Regression Test — Kimi CLI Adapter Contract Stub
// ===================================================
// Verifies contract-only CLI behavior. No process spawn, no API keys.

import {
  getKimiCliAdapterConfig,
  getKimiCliAdapterSupportMatrix,
  parseKimiCliMockOutput,
  executeKimiCliAdapterContractOnly,
} from "../execution/kimi-cli-adapter-contract";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "llm_task",
  node: "requirement-summary",
  agent: "kimi",
  requirementId: "REQ-KIMI-CLI",
  input: { prompt: "mock prompt" },
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Kimi CLI Adapter Contract Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default config disabled");
  const d = getKimiCliAdapterConfig({});
  assert(d.enabled === false, "default disabled");
  assert(d.source === "default", "source default");
  console.log("");

  // Test 2: Enabled
  console.log("Test 2: Enabled config");
  const e = getKimiCliAdapterConfig({ SDLC_KIMI_CLI_ADAPTER: "enabled", SDLC_KIMI_CLI_COMMAND: "kimi", SDLC_KIMI_CLI_ARGS: "--verbose --json", SDLC_KIMI_CLI_WORKING_DIR: "/tmp" });
  assert(e.enabled === true, "enabled");
  assert(e.command === "kimi", "command captured");
  assert(e.args.length === 2, "args parsed");
  assert(e.args.includes("--verbose"), "arg --verbose");
  assert(e.args.includes("--json"), "arg --json");
  assert(e.workingDirectory === "/tmp", "working dir captured");
  console.log("");

  // Test 3: Invalid timeout
  console.log("Test 3: Invalid timeout falls back");
  assert(getKimiCliAdapterConfig({ SDLC_KIMI_CLI_ADAPTER: "enabled", SDLC_KIMI_CLI_TIMEOUT_MS: "bad" }).timeoutMs === 120000, "bad → 120000");
  console.log("");

  // Test 4: Support matrix
  console.log("Test 4: Support matrix");
  const m = getKimiCliAdapterSupportMatrix();
  assert(m.contractOnly === true, "contractOnly");
  assert(m.invokesCli === false, "invokesCli false");
  assert(m.spawnsProcess === false, "spawnsProcess false");
  assert(m.readsApiKeys === false, "readsApiKeys false");
  assert(m.plannedRequestTypes.includes("llm_task"), "planned llm_task");
  assert(m.unsupportedRequestTypes.includes("validation"), "unsupported validation");
  assert(m.unsupportedRequestTypes.includes("bugfix"), "unsupported bugfix");
  console.log("");

  // Test 5: Parser
  console.log("Test 5: Mock CLI parser");
  assert(parseKimiCliMockOutput({ request, stdout: '{"text":"hi"}', exitCode: 0 }).success === true, "JSON stdout ok");
  assert(parseKimiCliMockOutput({ request, stdout: "plain text", exitCode: 0 }).success === true, "plain text ok");
  assert(parseKimiCliMockOutput({ request, stdout: "", exitCode: 0 }).success === false, "empty stdout fail");
  assert(parseKimiCliMockOutput({ request, stdout: "error", exitCode: 1 }).success === false, "non-zero exit fail");
  console.log("");

  // Test 6: Executor — disabled
  console.log("Test 6: Executor disabled");
  const rd = await executeKimiCliAdapterContractOnly(request, d);
  assert(rd.success === false && rd.error === "disabled", "disabled failure");
  console.log("");

  // Test 7: Executor — missing command
  console.log("Test 7: Executor missing command");
  const nc = getKimiCliAdapterConfig({ SDLC_KIMI_CLI_ADAPTER: "enabled" });
  const rm = await executeKimiCliAdapterContractOnly(request, nc);
  assert(rm.success === false && rm.error === "missing_cli_command", "missing command failure");
  console.log("");

  // Test 8: Executor — contract-only
  console.log("Test 8: Executor contract-only");
  const rc = await executeKimiCliAdapterContractOnly(request, e);
  assert(rc.success === false && rc.error === "contract_only", "contract-only failure");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
