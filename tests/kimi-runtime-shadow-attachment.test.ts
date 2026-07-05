// Regression Test — Kimi Runtime Shadow Attachment Helper
// =========================================================
// Verifies optional sidecar behavior. Fake runner only.

import { buildOptionalKimiRuntimeShadowAttachment } from "../core/kimi-runtime-shadow-attachment";
import type { KimiCliProcessRunner } from "../execution/kimi-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-RUNTIME-ATTACHMENT",
  input: { prompt: "this must not leak" },
};
const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};
const allOn = {
  SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled",
  SDLC_KIMI_GATEWAY_SHADOW: "enabled",
  SDLC_KIMI_GATEWAY_INTEGRATION: "enabled",
  SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled",
};

function throwingRunner(): KimiCliProcessRunner {
  return { run: async () => { throw new Error("should not be called"); } };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Runtime Shadow Attachment Test\n");

  // Test 1: Disabled returns undefined
  console.log("Test 1: Disabled returns undefined");
  const r1 = await buildOptionalKimiRuntimeShadowAttachment({ request, config: validConfig, env: {}, runner: throwingRunner() });
  assert(r1 === undefined, "undefined");
  console.log("");

  // Test 2: Attachment enabled, shadow disabled
  console.log("Test 2: Attachment enabled, shadow disabled");
  const r2 = await buildOptionalKimiRuntimeShadowAttachment({ request, config: validConfig, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" } });
  assert(r2 !== undefined && r2.enabled === true, "exists");
  assert(r2.affectsFinalStatus === false && r2.affectsRouting === false, "no effects");
  assert(r2.primaryRuntimeUnchanged === true && r2.primaryGatewayUnchanged === true, "unchanged");
  console.log("");

  // Test 3: Integration missing
  console.log("Test 3: Integration flag missing");
  const r3 = await buildOptionalKimiRuntimeShadowAttachment({ request, config: validConfig, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled", SDLC_KIMI_GATEWAY_SHADOW: "enabled" }, runner: throwingRunner() });
  assert(r3 !== undefined, "exists");
  assert(r3.sidecar !== undefined && r3.sidecar!.decision === "gateway_integration_disabled", "integration disabled");
  console.log("");

  // Test 4: All flags enabled, fake success
  console.log("Test 4: All flags enabled, fake success");
  const fr = (v: any) => ({ run: async () => v });
  const r4 = await buildOptionalKimiRuntimeShadowAttachment({ request, config: validConfig, env: allOn, runner: fr({ exitCode: 0, durationMs: 1, stdout: "ok", stderr: "" }) });
  assert(r4 !== undefined && r4.decision === "sidecar_attached_contract_only", "attached");
  assert(r4.sidecar!.executed === true && r4.sidecar!.decision === "shadow_executed_success", "success");
  assert(r4.affectsFinalStatus === false && r4.affectsRouting === false, "no effects");
  assert(r4.primaryRuntimeUnchanged === true && r4.primaryGatewayUnchanged === true, "unchanged");
  assert(!JSON.stringify(r4).includes("this must not leak"), "no prompt");
  console.log("");

  // Test 5: Fake failure
  console.log("Test 5: Fake failure");
  const r5 = await buildOptionalKimiRuntimeShadowAttachment({ request, config: validConfig, env: allOn, runner: fr({ exitCode: 1, durationMs: 1, stdout: "", stderr: "err" }) });
  assert(r5 !== undefined && r5.decision === "sidecar_attached_contract_only", "still attached");
  assert(r5.sidecar!.decision === "shadow_executed_failure", "failure");
  assert(r5.affectsFinalStatus === false, "no final status change");
  console.log("");

  // Test 6: No forbidden imports
  console.log("Test 6: No forbidden imports");
  const src = fs.readFileSync("core/kimi-runtime-shadow-attachment.ts", "utf-8");
  const bad = src.split("\n").filter(l => l.includes("import ") && (l.includes("child_process") || l.includes("\"fs\"") || l.includes("'fs'") || l.includes("policy-memory")));
  assert(bad.length === 0, `no forbidden imports (found ${bad.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
