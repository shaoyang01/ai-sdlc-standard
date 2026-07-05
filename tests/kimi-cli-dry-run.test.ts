// Regression Test — Kimi CLI Dry-run Harness
// ============================================
// Verifies dry-run behavior without CLI execution.
// No process spawn, no secrets exposed.

import { dryRunKimiCliAdapter, buildKimiCliCommandPreview } from "../execution/kimi-cli-dry-run";
import { getKimiCliAdapterConfig } from "../execution/kimi-cli-adapter-contract";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "llm_task",
  node: "requirement-summary",
  agent: "kimi",
  requirementId: "REQ-KIMI-DRY-RUN",
  input: { prompt: "this prompt must not appear in preview" },
};

const validConfig: CliAdapterConfig = {
  adapter: "kimi",
  enabled: true,
  source: "test_override",
  command: "kimi",
  args: ["--mode", "plan"],
  timeoutMs: 120000,
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Kimi CLI Dry-run Harness Test\n");

  // Test 1: Disabled
  console.log("Test 1: Disabled config");
  const disabledCfg = getKimiCliAdapterConfig({});
  const r1 = dryRunKimiCliAdapter({ request, config: disabledCfg });
  assert(r1.success === false, "success false");
  assert(r1.decision === "disabled", "decision disabled");
  assert(r1.commandPreview === undefined, "no preview");
  assert(r1.audit.enabled === false, "audit.enabled false");
  assert(r1.audit.invokesCli === false, "audit no CLI");
  assert(r1.audit.spawnsProcess === false, "audit no spawn");
  assert(r1.audit.affectsGateway === false, "audit no gateway");
  console.log("");

  // Test 2: Missing command
  console.log("Test 2: Missing command");
  const noCmd = getKimiCliAdapterConfig({ SDLC_KIMI_CLI_ADAPTER: "enabled" });
  const r2 = dryRunKimiCliAdapter({ request, config: noCmd });
  assert(r2.success === false, "success false");
  assert(r2.decision === "missing_cli_command", "decision missing_cli_command");
  assert(r2.audit.hasCommand === false, "audit hasCommand false");
  assert(r2.commandPreview === undefined, "no preview");
  console.log("");

  // Test 3: Unsupported request type
  console.log("Test 3: Unsupported request type");
  const valReq: ExecutionRequest = { ...request, type: "validation" };
  const r3 = dryRunKimiCliAdapter({ request: valReq, config: validConfig });
  assert(r3.success === false, "success false");
  assert(r3.decision === "unsupported_request_type", "decision unsupported");
  assert(r3.audit.plannedRequestType === false, "audit not planned");
  console.log("");

  // Test 4: Dry-run ready
  console.log("Test 4: Dry-run ready");
  const r4 = dryRunKimiCliAdapter({ request, config: validConfig });
  assert(r4.success === true, "success true");
  assert(r4.decision === "dry_run_ready", "decision dry_run_ready");
  assert(r4.commandPreview!.command === "kimi", "preview command");
  assert(r4.commandPreview!.args.includes("--mode"), "preview args");
  assert(r4.commandPreview!.sanitized === true, "preview sanitized");
  assert(r4.audit.commandPreviewCreated === true, "audit preview created");
  assert(r4.audit.invokesCli === false, "audit no CLI");
  assert(r4.audit.spawnsProcess === false, "audit no spawn");
  assert(r4.audit.readsApiKeys === false, "audit no API keys");
  assert(r4.audit.writesFiles === false, "audit no files");
  assert(r4.audit.affectsRuntime === false, "audit no runtime");
  assert(r4.audit.affectsGateway === false, "audit no gateway");
  console.log("");

  // Test 5: Preview excludes prompt
  console.log("Test 5: Preview excludes prompt text");
  const json = JSON.stringify(r4);
  assert(!json.includes("this prompt must not appear in preview"), "no prompt in JSON");
  console.log("");

  // Test 6: Secret args redacted
  console.log("Test 6: Secret-like args are redacted");
  const secretCfg: CliAdapterConfig = {
    ...validConfig, args: ["--token=abc", "--api_key=xyz", "sk-test", "--safe"]
  };
  const preview = buildKimiCliCommandPreview(secretCfg, request)!;
  assert(preview !== undefined, "preview exists");
  const redacted = preview.args.filter(a => a === "[REDACTED]");
  assert(redacted.length === 3, "3 redacted args");
  assert(preview.args.includes("--safe"), "--safe preserved");
  assert(!preview.args.includes("abc"), "no abc");
  assert(!preview.args.includes("xyz"), "no xyz");
  assert(!preview.args.includes("sk-test"), "no sk-test");
  console.log("");

  // Test 7: Config helper integration
  console.log("Test 7: Config helper integration");
  const cfg7 = getKimiCliAdapterConfig({
    SDLC_KIMI_CLI_ADAPTER: "enabled",
    SDLC_KIMI_CLI_COMMAND: "kimi",
    SDLC_KIMI_CLI_ARGS: "--mode plan",
  });
  const r7 = dryRunKimiCliAdapter({ request, config: cfg7 });
  assert(r7.decision === "dry_run_ready", "integration ready");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
