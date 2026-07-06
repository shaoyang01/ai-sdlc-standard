// Regression Test — Hermes Runtime Shadow Attachment Helper
// =============================================================
// Fake runner only. No real Hermes CLI.

import {
  buildHermesRuntimeShadowAttachmentFromRequest,
} from "../core/hermes-runtime-shadow-attachment";
import { HERMES_RUNTIME_ATTACHMENT_FLAG } from "../execution/hermes-runtime-attachment-contract";
import { HERMES_GATEWAY_SHADOW_FLAG } from "../execution/hermes-gateway-shadow-sidecar";
import { HERMES_GATEWAY_INTEGRATION_FLAG } from "../execution/hermes-gateway-integration-contract";
import { HERMES_CLI_COMMAND_EXECUTION_FLAG } from "../execution/hermes-cli-command-executor";
import type { HermesCliProcessRunner } from "../execution/hermes-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "review"], timeoutMs: 120000,
};
const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-HELPER",
  input: { prompt: "THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK" },
};
const allOn: Record<string, string | undefined> = {
  [HERMES_RUNTIME_ATTACHMENT_FLAG]: "enabled",
  [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
  [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
  [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
};
function fr(v: any): HermesCliProcessRunner { return { run: async () => v }; }

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Runtime Shadow Attachment Helper Test\n");

  // Test 1: Default disabled returns undefined
  console.log("Test 1: Default disabled returns undefined");
  let called1 = 0;
  const r1 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request, config: validConfig, env: {
      [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
      [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
      [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
    },
    runner: { run: async () => { called1++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r1 === undefined, "undefined when disabled");
  assert(called1 === 0, "runner not called");
  console.log("");

  // Test 2: Attachment enabled but shadow flag disabled
  console.log("Test 2: Attachment enabled, shadow disabled");
  let called2 = 0;
  const r2 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request, config: validConfig, env: {
      [HERMES_RUNTIME_ATTACHMENT_FLAG]: "enabled",
      [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
      [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
    },
    runner: { run: async () => { called2++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r2 !== undefined, "result exists");
  assert(r2!.enabled === true, "enabled");
  assert(r2!.sidecarExecuted === false, "not executed");
  assert(r2!.sidecarStatus === "shadow_disabled", "shadow disabled");
  assert(called2 === 0, "runner not called");
  assert(r2!.affectsRuntimeFinalStatus === false && r2!.affectsRuntimeRouting === false, "no effects");
  console.log("");

  // Test 3: All flags enabled fake success
  console.log("Test 3: All flags enabled fake success");
  let called3 = 0;
  const r3 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request, config: validConfig, env: allOn,
    runner: { run: async () => { called3++; return { exitCode: 0, durationMs: 5, stdout: "ok", stderr: "" }; } },
  });
  assert(r3 !== undefined, "result exists");
  assert(r3!.sidecarExecuted === true, "executed");
  assert(r3!.attachmentBuilt === true, "attachment built");
  assert(r3!.attachment !== undefined, "attachment exists");
  assert(r3!.attachment!.sidecarStatus === "shadow_executed_success", "sidecar success");
  assert(r3!.attachment!.commandDecision === "executed_success", "command success");
  assert(called3 === 1, "runner called once");
  assert(r3!.affectsRuntimeFinalStatus === false, "no final status");
  assert(r3!.affectsRuntimeRouting === false, "no routing");
  assert(r3!.affectsPrimaryGatewayResult === false, "no primary gateway");
  console.log("");

  // Test 4: Integration ineligible
  console.log("Test 4: Integration ineligible");
  let called4 = 0;
  const r4 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request, config: validConfig, env: {
      [HERMES_RUNTIME_ATTACHMENT_FLAG]: "enabled",
      [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
      [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
    },
    runner: { run: async () => { called4++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r4 !== undefined, "result exists");
  assert(r4!.sidecarExecuted === false, "not executed");
  assert(r4!.sidecarStatus === "integration_ineligible", "ineligible");
  assert(called4 === 0, "runner not called");
  assert(r4!.affectsRuntimeFinalStatus === false && r4!.affectsRuntimeRouting === false, "no effects");
  console.log("");

  // Test 5: Unsupported request type
  console.log("Test 5: Unsupported request type");
  let called5 = 0;
  const r5 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request: { ...request, type: "llm_task" as any }, config: validConfig, env: allOn,
    runner: { run: async () => { called5++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r5 !== undefined, "result exists");
  assert(r5!.sidecarStatus === "integration_ineligible", "ineligible");
  assert(r5!.sidecarExecuted === false, "not executed");
  assert(called5 === 0, "runner not called");
  console.log("");

  // Test 6: Fake failure sanitizes
  console.log("Test 6: Fake failure sanitizes");
  const r6 = await buildHermesRuntimeShadowAttachmentFromRequest({
    request, config: validConfig, env: allOn,
    runner: fr({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test api_key=xyz" }),
  });
  assert(r6 !== undefined, "result exists");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc"), "no abc");
  assert(!j6.includes("123"), "no 123");
  assert(!j6.includes("sk-test"), "no sk-test");
  assert(!j6.includes("xyz"), "no xyz");
  console.log("");

  // Test 7: Raw prompt does not leak
  console.log("Test 7: Raw prompt does not leak");
  const j3 = JSON.stringify(r3);
  assert(!j3.includes("THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK"), "no runtime prompt");
  assert(!j3.includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), "no shadow prompt");
  console.log("");

  // Test 8: Safety fields
  console.log("Test 8: Safety fields");
  const allResults = [r2, r3, r4, r5, r6].filter((r): r is NonNullable<typeof r> => r !== undefined);
  for (const r of allResults) {
    assert(r.affectsRuntimeFinalStatus === false, `${r.sidecarStatus}: no final status`);
    assert(r.affectsRuntimeRouting === false, `${r.sidecarStatus}: no routing`);
    assert(r.affectsPrimaryGatewayResult === false, `${r.sidecarStatus}: no primary gateway`);
    assert(r.writesFiles === false, `${r.sidecarStatus}: no files`);
    assert(r.persistsAudit === false, `${r.sidecarStatus}: no persist`);
    assert(r.containsRawPrompt === false, `${r.sidecarStatus}: no raw prompt`);
    assert(r.containsRawArtifacts === false, `${r.sidecarStatus}: no raw artifacts`);
    assert(r.containsSecrets === false, `${r.sidecarStatus}: no secrets`);
  }
  console.log("");

  // Test 9: No forbidden imports
  console.log("Test 9: No forbidden imports");
  const src = fs.readFileSync("core/hermes-runtime-shadow-attachment.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "child_process", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
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
