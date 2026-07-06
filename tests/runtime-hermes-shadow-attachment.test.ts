// Regression Test — Hermes Runtime Shadow Attachment Integration
// ================================================================
// Fake builder only. No real Hermes CLI. No Gateway mutation.

import { run, RuntimeOptions } from "../runtime";
import type { HermesRuntimeShadowAttachmentBuildResult } from "../core/hermes-runtime-shadow-attachment";
import * as fs from "fs";

const safeAttachment: HermesRuntimeShadowAttachmentBuildResult = {
  adapter: "hermes",
  source: "hermes_runtime_shadow_attachment_helper",
  requestId: "REQ-TEST-INT",
  requestType: "validation",
  enabled: true,
  sidecarExecuted: true,
  attachmentBuilt: true,
  sidecarStatus: "shadow_executed_success",
  validationReason: "valid_attachment",
  affectsRuntimeFinalStatus: false,
  affectsRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  writesFiles: false,
  persistsAudit: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  warnings: [],
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Runtime Shadow Attachment Integration Test\n");

  // Test 1: Disabled — builder not called
  console.log("Test 1: Disabled — builder not called");
  let calls1 = 0;
  const r1 = await run("Build a feature", {
    env: {},
    hermesRuntimeShadowAttachmentBuilder: async (input) => {
      calls1++;
      return safeAttachment;
    },
  });
  assert(calls1 === 0, "builder not called when disabled");
  assert(r1.final_status === "success", "final_status success");
  assert(!("hermes_runtime_shadow_attachment" in r1), "no hermes field");
  assert(r1.hasOwnProperty("hermes_runtime_shadow_attachment") === false, "no own property");
  console.log("");

  // Test 2: Enabled — builder returns undefined, field omitted
  console.log("Test 2: Enabled — builder returns undefined");
  let calls2 = 0;
  const r2 = await run("Build another feature", {
    env: { SDLC_HERMES_RUNTIME_ATTACHMENT: "enabled" },
    hermesRuntimeShadowAttachmentBuilder: async (input) => {
      calls2++;
      return undefined;
    },
  });
  assert(calls2 === 1, "builder called once");
  assert(r2.final_status === "success", "final_status success");
  assert(!("hermes_runtime_shadow_attachment" in r2), "no hermes field when undefined");
  assert(r2.hasOwnProperty("hermes_runtime_shadow_attachment") === false, "no own property");
  console.log("");

  // Test 3: Enabled — safe attachment attached
  console.log("Test 3: Enabled — safe attachment");
  let calls3 = 0;
  const r3 = await run("Build a third feature", {
    env: { SDLC_HERMES_RUNTIME_ATTACHMENT: "enabled" },
    hermesRuntimeShadowAttachmentBuilder: async (input) => {
      calls3++;
      return { ...safeAttachment, requestId: input.request.requirementId };
    },
  });
  assert(calls3 === 1, "builder called once");
  assert(r3.final_status === "success", "final_status success");
  assert("hermes_runtime_shadow_attachment" in r3, "hermes field present");
  assert(r3.hasOwnProperty("hermes_runtime_shadow_attachment") === true, "has own property");
  assert(r3.hermes_runtime_shadow_attachment !== undefined, "not undefined");
  assert(r3.hermes_runtime_shadow_attachment!.enabled === true, "attachment enabled");
  assert(r3.hermes_runtime_shadow_attachment!.affectsRuntimeFinalStatus === false, "no final status");
  assert(r3.hermes_runtime_shadow_attachment!.affectsRuntimeRouting === false, "no routing");
  assert(r3.hermes_runtime_shadow_attachment!.affectsPrimaryGatewayResult === false, "no primary gateway");
  assert(r3.hermes_runtime_shadow_attachment!.writesFiles === false, "no files");
  assert(r3.hermes_runtime_shadow_attachment!.persistsAudit === false, "no persist");
  assert(r3.hermes_runtime_shadow_attachment!.containsRawPrompt === false, "no raw prompt");
  assert(r3.hermes_runtime_shadow_attachment!.containsRawArtifacts === false, "no raw artifacts");
  assert(r3.hermes_runtime_shadow_attachment!.containsSecrets === false, "no secrets");
  console.log("");

  // Test 4: No raw prompt / secret leak (safe fake builder)
  console.log("Test 4: No raw prompt / secret leak");
  // The attachment itself is safe (all safety fields false)
  assert(r3.hermes_runtime_shadow_attachment!.containsRawPrompt === false, "attachment no raw prompt");
  assert(r3.hermes_runtime_shadow_attachment!.containsRawArtifacts === false, "attachment no raw artifacts");
  assert(r3.hermes_runtime_shadow_attachment!.containsSecrets === false, "attachment no secrets");
  // Verify attachment warnings don't contain markers
  const aWarnings = r3.hermes_runtime_shadow_attachment!.warnings;
  for (const w of aWarnings) {
    assert(!w.includes("THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK"), "warning no runtime prompt");
    assert(!w.includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), "warning no shadow prompt");
    assert(!w.includes("token=abc") && !w.includes("password=123") && !w.includes("api_key=xyz") && !w.includes("sk-test"), "warning no secrets");
  }
  console.log("");

  // Test 5: No Gateway change
  console.log("Test 5: No Gateway change");
  const gwSrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  assert(!gwSrc.includes("hermes_runtime_shadow_attachment"), "gateway has no hermes attachment logic");
  console.log("");

  // Test 6: No real Hermes CLI in tests
  console.log("Test 6: No real Hermes CLI in tests");
  const testSrc = fs.readFileSync("tests/runtime-hermes-shadow-attachment.test.ts", "utf-8");
  const badImports = testSrc.split("\n").filter(l =>
    l.includes("import ") && (
      l.includes("executeHermesCliCommand") ||
      l.includes("runHermesGatewayShadowSidecar") ||
      l.includes("child_process")
    )
  );
  assert(badImports.length === 0, `no forbidden imports in test (found ${badImports.length})`);
  console.log("");

  // Test 7: Backward compatibility — run(requirement) still works
  console.log("Test 7: Backward compatibility");
  const r7 = await run("simple");
  assert(r7.final_status === "success", "backward compat success");
  assert(typeof r7.requirement_id === "string" && r7.requirement_id.length > 0, "backward compat requirement_id");
  assert(Array.isArray(r7.execution_trace) && r7.execution_trace.length > 0, "backward compat trace");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
