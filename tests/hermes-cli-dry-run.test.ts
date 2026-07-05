// Regression Test — Hermes CLI Dry-run Harness
// ==============================================
// Verifies dry-run behavior without CLI execution.
// No process spawn, no secrets exposed.

import { dryRunHermesCliAdapter, buildHermesCliCommandPreview } from "../execution/hermes-cli-dry-run";
import { getHermesCliAdapterConfig } from "../execution/hermes-cli-adapter-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "validation",
  node: "validation",
  agent: "hermes",
  requirementId: "REQ-HERMES-DRY-RUN",
  input: { artifacts: [{ type: "validation_report", content: "this artifact must not appear in preview" }] },
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
  console.log("Hermes CLI Dry-run Harness Test\n");

  // Test 1: Disabled
  console.log("Test 1: Disabled config");
  const d = getHermesCliAdapterConfig({});
  const r1 = dryRunHermesCliAdapter({ request, config: d });
  assert(r1.success === false && r1.decision === "disabled", "disabled");
  assert(r1.commandPreview === undefined, "no preview");
  assert(r1.audit.enabled === false && r1.audit.invokesCli === false, "audit disabled");
  console.log("");

  // Test 2: Missing command
  console.log("Test 2: Missing command");
  const nc = getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled" });
  const r2 = dryRunHermesCliAdapter({ request, config: nc });
  assert(r2.decision === "missing_cli_command", "missing command");
  assert(r2.audit.hasCommand === false, "hasCommand false");
  console.log("");

  // Test 3: Unsupported request type
  console.log("Test 3: Unsupported request type");
  const ur: ExecutionRequest = { ...request, type: "llm_task" };
  const r3 = dryRunHermesCliAdapter({ request: ur, config: validConfig });
  assert(r3.decision === "unsupported_request_type", "unsupported");
  assert(r3.audit.plannedRequestType === false, "not planned");
  console.log("");

  // Test 4: Dry-run ready
  console.log("Test 4: Dry-run ready");
  const r4 = dryRunHermesCliAdapter({ request, config: validConfig });
  assert(r4.success === true && r4.decision === "dry_run_ready", "ready");
  assert(r4.commandPreview!.command === "hermes", "command");
  assert(r4.commandPreview!.args.includes("--mode"), "args");
  assert(r4.commandPreview!.sanitized === true, "sanitized");
  assert(r4.audit.commandPreviewCreated === true, "preview created");
  assert(r4.audit.invokesCli === false && r4.audit.spawnsProcess === false, "no CLI");
  assert(r4.audit.readsApiKeys === false && r4.audit.writesFiles === false, "no files/keys");
  assert(r4.audit.affectsRuntime === false && r4.audit.affectsGateway === false, "no effects");
  console.log("");

  // Test 5: Preview excludes artifact content
  console.log("Test 5: Preview excludes artifact content");
  assert(!JSON.stringify(r4).includes("this artifact must not appear in preview"), "no artifact in JSON");
  console.log("");

  // Test 6: Secret args redacted
  console.log("Test 6: Secret-like args redacted");
  const sc: CliAdapterConfig = { ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"] };
  const pv = buildHermesCliCommandPreview(sc, request)!;
  assert(pv.args.filter(a => a === "[REDACTED]").length === 3, "3 redacted");
  assert(pv.args.includes("--safe"), "--safe preserved");
  const sr = dryRunHermesCliAdapter({ request, config: sc });
  const sj = JSON.stringify(sr);
  assert(!sj.includes("abc") && !sj.includes("xyz") && !sj.includes("sk-test"), "serialized no secrets");
  console.log("");

  // Test 7: Config helper integration
  console.log("Test 7: Config helper integration");
  const c7 = getHermesCliAdapterConfig({ SDLC_HERMES_CLI_ADAPTER: "enabled", SDLC_HERMES_CLI_COMMAND: "hermes", SDLC_HERMES_CLI_ARGS: "--mode validate" });
  assert(dryRunHermesCliAdapter({ request, config: c7 }).decision === "dry_run_ready", "integration ready");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
