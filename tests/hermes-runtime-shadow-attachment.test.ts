// Regression Test — Hermes Runtime Shadow Attachment Helper
// =============================================================
// Fake runner only. No real Hermes CLI.

import {
  buildHermesRuntimeShadowAttachmentFromRequest,
  buildHermesRuntimeShadowAttachmentAuditMetadata,
  buildHermesRuntimeShadowAttachmentObservabilitySummary,
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

  // Test 9: Audit metadata exists
  console.log("Test 9: Audit metadata");
  for (const r of allResults) {
    assert(r.auditMetadata !== undefined, `${r.sidecarStatus}: audit exists`);
    const am = r.auditMetadata!;
    assert(am.auditVersion === 1, `${r.sidecarStatus}: audit version 1`);
    assert(am.adapter === "hermes", `${r.sidecarStatus}: audit adapter`);
    assert(am.source === "hermes_runtime_shadow_attachment_audit", `${r.sidecarStatus}: audit source`);
    assert(am.runtimeAttachmentField === "hermes_runtime_shadow_attachment", `${r.sidecarStatus}: audit field`);
    assert(am.featureFlag === "SDLC_HERMES_RUNTIME_ATTACHMENT", `${r.sidecarStatus}: audit flag`);
    assert(am.enabled === true, `${r.sidecarStatus}: audit enabled`);
    assert(typeof am.timestamp === "string" && !isNaN(Date.parse(am.timestamp)), `${r.sidecarStatus}: audit timestamp`);
    assert(am.affectsRuntimeFinalStatus === false, `${r.sidecarStatus}: audit no final status`);
    assert(am.affectsRuntimeRouting === false, `${r.sidecarStatus}: audit no routing`);
    assert(am.persistsAudit === false, `${r.sidecarStatus}: audit no persist`);
    assert(am.writesFiles === false, `${r.sidecarStatus}: audit no files`);
    assert(am.containsRawPrompt === false, `${r.sidecarStatus}: audit no raw prompt`);
    assert(am.containsRawArtifacts === false, `${r.sidecarStatus}: audit no raw artifacts`);
    assert(am.containsSecrets === false, `${r.sidecarStatus}: audit no secrets`);
  }
  // Specific checks per state
  assert(r2!.auditMetadata!.sidecarExecuted === false, "shadow disabled: sidecar false");
  assert(r2!.auditMetadata!.sidecarStatus === "shadow_disabled", "shadow disabled: status");
  assert(r3!.auditMetadata!.sidecarExecuted === true, "success: sidecar true");
  assert(r3!.auditMetadata!.sidecarStatus === "shadow_executed_success", "success: status");
  assert(r3!.auditMetadata!.validationReason === "valid_attachment", "success: validation");
  assert(r4!.auditMetadata!.sidecarStatus === "integration_ineligible", "ineligible: status");
  assert(r4!.auditMetadata!.sidecarExecuted === false, "ineligible: not executed");
  assert(r5!.auditMetadata!.sidecarStatus === "integration_ineligible", "unsupported: status");
  console.log("");

  // Test 10: Audit warnings sanitized — direct injection
  console.log("Test 10: Audit warnings sanitized — direct injection");
  const audit = buildHermesRuntimeShadowAttachmentAuditMetadata({
    requestId: "REQ-AUDIT",
    requestType: "validation",
    enabled: true,
    attached: true,
    sidecarExecuted: true,
    attachmentBuilt: true,
    sidecarStatus: "shadow_executed_success",
    validationReason: "valid_attachment",
    warnings: [
      "token=abc password=123 api_key=xyz sk-test THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"
    ],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  assert(audit.auditVersion === 1, "audit version");
  assert(audit.timestamp === "2026-01-01T00:00:00.000Z", "timestamp fixed");
  assert(audit.containsRawPrompt === false, "no raw prompt flag");
  assert(audit.containsRawArtifacts === false, "no raw artifacts flag");
  assert(audit.containsSecrets === false, "no secrets flag");
  assert(audit.persistsAudit === false, "no persist");
  assert(audit.writesFiles === false, "no files");
  const auditJson = JSON.stringify(audit);
  assert(!auditJson.includes("abc"), "audit no abc");
  assert(!auditJson.includes("123"), "audit no 123");
  assert(!auditJson.includes("xyz"), "audit no xyz");
  assert(!auditJson.includes("sk-test"), "audit no sk-test");
  assert(!auditJson.includes("THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK"), "audit no runtime prompt");
  assert(!auditJson.includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), "audit no shadow prompt");
  // Verify warnings are scrubbed
  for (const w of audit.warnings) {
    assert(!w.includes("abc"), "warning no abc");
    assert(!w.includes("THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK"), "warning no runtime prompt");
  }
  console.log("");

  // Test 11: Observability summary — enabled results
  console.log("Test 11: Observability summary in enabled results");
  for (const r of allResults) {
    assert(r.observabilitySummary !== undefined, `${r.sidecarStatus}: obs exists`);
    const os = r.observabilitySummary!;
    assert(os.observabilityVersion === 1, `${r.sidecarStatus}: obs version`);
    assert(os.adapter === "hermes", `${r.sidecarStatus}: obs adapter`);
    assert(os.source === "hermes_runtime_shadow_attachment_observability", `${r.sidecarStatus}: obs source`);
    assert(os.runtimeAttachmentField === "hermes_runtime_shadow_attachment", `${r.sidecarStatus}: obs field`);
    assert(os.enabled === true, `${r.sidecarStatus}: obs enabled`);
    assert(typeof os.timestamp === "string" && !isNaN(Date.parse(os.timestamp)), `${r.sidecarStatus}: obs timestamp`);
    assert(os.affectsRuntimeFinalStatus === false, `${r.sidecarStatus}: obs no final status`);
    assert(os.affectsRuntimeRouting === false, `${r.sidecarStatus}: obs no routing`);
    assert(os.affectsPrimaryGatewayResult === false, `${r.sidecarStatus}: obs no primary`);
    assert(os.writesFiles === false, `${r.sidecarStatus}: obs no files`);
    assert(os.persistsAudit === false, `${r.sidecarStatus}: obs no persist`);
    assert(os.containsRawPrompt === false, `${r.sidecarStatus}: obs no raw prompt`);
    assert(os.containsRawArtifacts === false, `${r.sidecarStatus}: obs no raw artifacts`);
    assert(os.containsSecrets === false, `${r.sidecarStatus}: obs no secrets`);
  }
  // State-specific outcome checks
  assert(r2!.observabilitySummary!.outcome === "sidecar_not_executed", "shadow disabled: sidecar_not_executed");
  assert(r2!.observabilitySummary!.sidecarExecuted === false, "shadow disabled: not executed");
  assert(r3!.observabilitySummary!.outcome === "attached", "success: attached");
  assert(r3!.observabilitySummary!.attached === true, "success: attached true");
  assert(r3!.observabilitySummary!.sidecarStatus === "shadow_executed_success", "success: status");
  assert(r4!.observabilitySummary!.outcome === "integration_ineligible", "ineligible: outcome");
  assert(r5!.observabilitySummary!.outcome === "integration_ineligible", "unsupported: outcome");
  assert(r6!.observabilitySummary!.outcome === "sidecar_failed", "failure: sidecar_failed");
  assert(r6!.observabilitySummary!.sidecarExecuted === true, "failure: executed");
  console.log("");

  // Test 12: Direct observability builder — outcome mapping
  console.log("Test 12: Direct observability builder — outcome mapping");
  const fixed = () => new Date("2026-01-01T00:00:00.000Z");
  const disabledObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: false, attached: false,
    sidecarExecuted: false, attachmentBuilt: false, warnings: [], now: fixed,
  });
  assert(disabledObs.outcome === "disabled", "disabled outcome");
  assert(disabledObs.timestamp === "2026-01-01T00:00:00.000Z", "disabled timestamp");
  assert(disabledObs.hasWarnings === false && disabledObs.warningCount === 0, "disabled no warnings");

  const notExecObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: false,
    sidecarExecuted: false, attachmentBuilt: false,
    sidecarStatus: "shadow_disabled", warnings: [], now: fixed,
  });
  assert(notExecObs.outcome === "sidecar_not_executed", "not executed outcome");

  const ineligibleObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: false,
    sidecarExecuted: false, attachmentBuilt: false,
    sidecarStatus: "integration_ineligible", warnings: [], now: fixed,
  });
  assert(ineligibleObs.outcome === "integration_ineligible", "ineligible outcome");

  const failedObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: false,
    sidecarExecuted: true, attachmentBuilt: false,
    sidecarStatus: "shadow_executed_failure", warnings: [], now: fixed,
  });
  assert(failedObs.outcome === "sidecar_failed", "failed outcome");

  const timeoutObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: false,
    sidecarExecuted: true, attachmentBuilt: false,
    sidecarStatus: "shadow_executed_timeout", warnings: [], now: fixed,
  });
  assert(timeoutObs.outcome === "sidecar_timeout", "timeout outcome");

  const attachedObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: true,
    sidecarExecuted: true, attachmentBuilt: true,
    sidecarStatus: "shadow_executed_success", validationReason: "valid_attachment",
    warnings: ["w1", "w2"], redactionApplied: true, now: fixed,
  });
  assert(attachedObs.outcome === "attached", "attached outcome");
  assert(attachedObs.hasWarnings === true && attachedObs.warningCount === 2, "attached warnings");
  assert(attachedObs.redactionApplied === true, "attached redaction");
  assert(attachedObs.timestamp === "2026-01-01T00:00:00.000Z", "attached timestamp");

  const notAttObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: false,
    sidecarExecuted: true, attachmentBuilt: false,
    sidecarStatus: "shadow_executed_success", warnings: [], now: fixed,
  });
  assert(notAttObs.outcome === "not_attached", "not attached outcome");
  console.log("");

  // Test 13: Observability summary contains no raw warning text
  console.log("Test 13: Observability no raw text");
  const rawObs = buildHermesRuntimeShadowAttachmentObservabilitySummary({
    requestType: "validation", enabled: true, attached: true,
    sidecarExecuted: true, attachmentBuilt: true,
    sidecarStatus: "shadow_executed_success",
    warnings: ["token=abc password=123 api_key=xyz sk-test THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"],
    now: fixed,
  });
  const obsJson = JSON.stringify(rawObs);
  assert(!obsJson.includes("abc"), "obs no abc");
  assert(!obsJson.includes("123"), "obs no 123");
  assert(!obsJson.includes("xyz"), "obs no xyz");
  assert(!obsJson.includes("sk-test"), "obs no sk-test");
  assert(!obsJson.includes("THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK"), "obs no runtime prompt");
  assert(!obsJson.includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), "obs no shadow prompt");
  console.log("");

  // Test 14: No forbidden imports
  console.log("Test 14: No forbidden imports");
  const src = fs.readFileSync("core/hermes-runtime-shadow-attachment.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "child_process", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch", "writeFile", "appendFile"];
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
