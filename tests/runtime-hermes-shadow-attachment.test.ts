// Regression Test — Hermes Runtime Shadow Attachment Integration
// ================================================================
// Fake builder only. No real Hermes CLI. No Gateway mutation.

import { run } from "../runtime";
import type { HermesRuntimeShadowAttachmentBuildResult } from "../core/hermes-runtime-shadow-attachment";

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

  // ─── Disabled baseline ───────────────────────────────
  // Default runtime (no SDLC_HERMES_RUNTIME_ATTACHMENT) — must not have Hermes field
  console.log("Test 1: Default disabled — no Hermes field");
  delete process.env.SDCLC_HERMES_RUNTIME_ATTACHMENT;
  const r1 = await run("Build a feature");
  assert(r1.final_status === "success", "final_status success");
  assert(!("hermes_runtime_shadow_attachment" in r1), "no hermes field when disabled");
  console.log("");

  // ─── Enabled via env — field present with safe result ──
  console.log("Test 2: Enabled — field present");
  // When runtime flag enabled, builder produces result even if shadow
  // is disabled (sidecar result is safe for attachment per wiring contract)
  process.env.SDLC_HERMES_RUNTIME_ATTACHMENT = "enabled";
  const r2 = await run("Build another feature");
  assert(r2.final_status === "success", "enabled final_status success");
  assert("hermes_runtime_shadow_attachment" in r2, "hermes field present when enabled");
  assert(r2.hermes_runtime_shadow_attachment !== undefined, "attachment not undefined");
  assert(r2.hermes_runtime_shadow_attachment!.enabled === true, "attachment enabled");
  assert(r2.hermes_runtime_shadow_attachment!.affectsRuntimeFinalStatus === false, "no final status effect");
  assert(r2.hermes_runtime_shadow_attachment!.affectsRuntimeRouting === false, "no routing effect");
  assert(r2.hermes_runtime_shadow_attachment!.affectsPrimaryGatewayResult === false, "no primary gateway effect");
  delete process.env.SDLC_HERMES_RUNTIME_ATTACHMENT;
  console.log("");

  // ─── Verify no undefined key ─────────────────────────
  console.log("Test 3: No undefined key");
  assert(r1.hasOwnProperty("hermes_runtime_shadow_attachment") === false, "r1 no own property");
  // r2 has own property because field was explicitly set
  assert(r2.hasOwnProperty("hermes_runtime_shadow_attachment") === true, "r2 has own property");
  assert(r2.hermes_runtime_shadow_attachment !== undefined, "r2 value not undefined");
  assert(!("hermes_runtime_shadow_attachment" in r1), "r1 not in");
  assert("hermes_runtime_shadow_attachment" in r2, "r2 in");
  console.log("");

  // ─── Safety: final_status unchanged ──────────────────
  console.log("Test 4: final_status unchanged");
  assert(r1.final_status === "success", "r1 baseline success");
  assert(r2.final_status === "success", "r2 same final_status");
  console.log("");

  // ─── Safety: no gateway change ───────────────────────
  console.log("Test 5: No Gateway change");
  const gwSrc = require("fs").readFileSync("execution/gateway.ts", "utf-8");
  assert(!gwSrc.includes("hermes_runtime_shadow_attachment"), "gateway has no hermes attachment logic");
  console.log("");

  // ─── Safety: result shape is consistent ─────────────
  console.log("Test 6: Result shape consistent");
  assert(typeof r1.requirement_id === "string" && r1.requirement_id.length > 0, "r1 has requirement_id");
  assert(Array.isArray(r1.execution_trace) && r1.execution_trace.length > 0, "r1 has trace");
  assert(Array.isArray(r1.artifacts), "r1 has artifacts");
  assert(typeof r1.feedback === "object" && r1.feedback !== null, "r1 has feedback");
  assert(typeof r2.requirement_id === "string" && r2.requirement_id.length > 0, "r2 has requirement_id");
  assert(Array.isArray(r2.execution_trace) && r2.execution_trace.length > 0, "r2 has trace");
  console.log("");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
