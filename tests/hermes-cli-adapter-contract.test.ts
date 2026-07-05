// Regression Test — Hermes CLI Adapter Contract Stub
// =====================================================
// Verifies contract-only CLI behavior. No process spawn, no API keys.

import {
  getHermesCliAdapterConfig,
  getHermesCliAdapterSupportMatrix,
  parseHermesCliMockOutput,
  executeHermesCliAdapterContractOnly,
} from "../execution/hermes-cli-adapter-contract";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "validation",
  node: "validation",
  agent: "hermes",
  requirementId: "REQ-HERMES-CLI",
  input: { artifacts: [] },
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Hermes CLI Adapter Contract Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default config disabled");
  const d = getHermesCliAdapterConfig({});
  assert(d.enabled === false, "default disabled");
  assert(d.source === "default", "source default");
  console.log("");

  // Test 2: Enabled
  console.log("Test 2: Enabled config");
  const e = getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled", SDLC_HERMES_CLI_COMMAND: "hermes", SDLC_HERMES_CLI_ARGS: "--validate", SDLC_HERMES_CLI_WORKING_DIR: "/tmp" });
  assert(e.enabled === true, "enabled");
  assert(e.command === "hermes", "command captured");
  assert(e.args.includes("--validate"), "arg captured");
  assert(e.workingDirectory === "/tmp", "working dir captured");
  console.log("");

  // Test 3: Invalid timeout
  console.log("Test 3: Invalid timeout falls back");
  assert(getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled", SDLC_HERMES_CLI_TIMEOUT_MS: "bad" }).timeoutMs === 120000, "bad → 120000");
  console.log("");

  // Test 4: Support matrix
  console.log("Test 4: Support matrix");
  const m = getHermesCliAdapterSupportMatrix();
  assert(m.contractOnly === true, "contractOnly");
  assert(m.invokesCli === false, "invokesCli false");
  assert(m.spawnsProcess === false, "spawnsProcess false");
  assert(m.readsApiKeys === false, "readsApiKeys false");
  assert(m.plannedRequestTypes.includes("validation"), "planned validation");
  assert(m.unsupportedRequestTypes.includes("llm_task"), "unsupported llm_task");
  assert(m.unsupportedRequestTypes.includes("code_generation"), "unsupported code_generation");
  assert(m.unsupportedRequestTypes.includes("code_review"), "unsupported code_review");
  assert(m.unsupportedRequestTypes.includes("bugfix"), "unsupported bugfix");
  console.log("");

  // Test 5: Parser
  console.log("Test 5: Mock CLI parser");
  assert(parseHermesCliMockOutput({ request, stdout: '{"verdict":"PASS"}', exitCode: 0 }).success === true, "JSON stdout ok");
  assert(parseHermesCliMockOutput({ request, stdout: "all good", exitCode: 0 }).success === true, "plain text ok");
  assert(parseHermesCliMockOutput({ request, stdout: "", exitCode: 0 }).success === false, "empty stdout fail");
  assert(parseHermesCliMockOutput({ request, stdout: "fail", exitCode: 1 }).success === false, "non-zero exit fail");
  console.log("");

  // Test 6: Executor — disabled
  console.log("Test 6: Executor disabled");
  const rd = await executeHermesCliAdapterContractOnly(request, d);
  assert(rd.success === false && rd.error === "disabled", "disabled failure");
  console.log("");

  // Test 7: Executor — missing command
  console.log("Test 7: Executor missing command");
  const nc = getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled" });
  const rm = await executeHermesCliAdapterContractOnly(request, nc);
  assert(rm.success === false && rm.error === "missing_cli_command", "missing command failure");
  console.log("");

  // Test 8: Executor — contract-only
  console.log("Test 8: Executor contract-only");
  const rc = await executeHermesCliAdapterContractOnly(request, e);
  assert(rc.success === false && rc.error === "contract_only", "contract-only failure");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
