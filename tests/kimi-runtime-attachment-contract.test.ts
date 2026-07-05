// Regression Test — Kimi Runtime Attachment Contract
// =====================================================
// Verifies contract-only attachment rules. No CLI, no runtime.

import {
  isKimiRuntimeAttachmentEnabled,
  validateKimiGatewayShadowSidecarForRuntimeAttachment,
  buildKimiRuntimeShadowAttachment,
} from "../execution/kimi-runtime-attachment-contract";
import type { KimiGatewayShadowSidecar } from "../execution/kimi-gateway-shadow-sidecar";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "llm_task", node: "requirement-summary", agent: "kimi",
  requirementId: "REQ-KIMI-RUNTIME-ATTACHMENT",
  input: { prompt: "this prompt must not leak into runtime attachment contract" },
};

const validSidecar: KimiGatewayShadowSidecar = {
  enabled: true, executed: false, decision: "shadow_eligible_not_executed",
  requestId: "REQ-KIMI-RUNTIME-ATTACHMENT",
  primaryGatewayUnchanged: true, affectsFinalStatus: false,
  affectsRouting: false, wiredToRuntime: false,
  requiresFlags: ["SDLC_KIMI_GATEWAY_SHADOW=enabled", "SDLC_KIMI_GATEWAY_INTEGRATION=enabled", "SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"],
  warnings: ["test sidecar"],
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Runtime Attachment Contract Test\n");

  // Test 1: Flag
  console.log("Test 1: Attachment flag");
  assert(isKimiRuntimeAttachmentEnabled({}) === false, "default off");
  assert(isKimiRuntimeAttachmentEnabled({ SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" }) === true, "enabled on");
  console.log("");

  // Test 2: Attachment disabled
  console.log("Test 2: Attachment disabled");
  const r2 = buildKimiRuntimeShadowAttachment({ request, sidecar: validSidecar, env: {} });
  assert(r2.enabled === false && r2.decision === "attachment_disabled", "disabled");
  assert(r2.sidecar === undefined, "no sidecar");
  assert(r2.primaryRuntimeUnchanged === true && r2.primaryGatewayUnchanged === true, "unchanged");
  assert(r2.affectsFinalStatus === false && r2.affectsRouting === false, "no effects");
  assert(!JSON.stringify(r2).includes("this prompt must not leak"), "no prompt");
  console.log("");

  // Test 3: Sidecar absent
  console.log("Test 3: Sidecar absent");
  const r3 = buildKimiRuntimeShadowAttachment({ request, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" } });
  assert(r3.enabled === true && r3.decision === "sidecar_absent", "absent");
  assert(r3.sidecar === undefined, "no sidecar");
  assert(r3.warnings.some(w => w.includes("sidecar absent")), "warning");
  console.log("");

  // Test 4: Valid sidecar
  console.log("Test 4: Valid sidecar attached contract-only");
  const r4 = buildKimiRuntimeShadowAttachment({ request, sidecar: validSidecar, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" } });
  assert(r4.enabled === true && r4.decision === "sidecar_attached_contract_only", "attached");
  assert(r4.sidecar !== undefined, "sidecar present");
  assert(r4.primaryRuntimeUnchanged === true, "runtime unchanged");
  assert(r4.persistsAudit === false && r4.writesFiles === false, "no persist/files");
  assert(r4.warnings.some(w => w.includes("Contract only")), "contract-only warning");
  console.log("");

  // Test 5: Invalid sidecar rejected
  console.log("Test 5: Invalid sidecar rejected");
  const bad: KimiGatewayShadowSidecar = { ...validSidecar, affectsFinalStatus: true as any };
  const r5 = buildKimiRuntimeShadowAttachment({ request, sidecar: bad, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" } });
  assert(r5.decision === "sidecar_rejected_invalid", "rejected");
  assert(r5.sidecar === undefined, "sidecar stripped");
  assert(r5.warnings.some(w => w.includes("affectsFinalStatus")), "warning mentions field");
  console.log("");

  // Test 6: Validation helper
  console.log("Test 6: Validation helper");
  const v1 = validateKimiGatewayShadowSidecarForRuntimeAttachment(validSidecar);
  assert(v1.valid === true && v1.warnings.length === 0, "valid sidecar");
  const v2 = validateKimiGatewayShadowSidecarForRuntimeAttachment(undefined);
  assert(v2.valid === false, "undefined invalid");
  const bad2: KimiGatewayShadowSidecar = { ...validSidecar, primaryGatewayUnchanged: false as any };
  const v3 = validateKimiGatewayShadowSidecarForRuntimeAttachment(bad2);
  assert(v3.valid === false && v3.warnings.some(w => w.includes("primaryGatewayUnchanged")), "primaryGatewayUnchanged invalid");
  // Structural validation
  const noDecision: any = { ...validSidecar, decision: undefined };
  assert(validateKimiGatewayShadowSidecarForRuntimeAttachment(noDecision).warnings.some(w => w.includes("decision")), "missing decision");
  const noRequestId: any = { ...validSidecar, requestId: undefined };
  assert(validateKimiGatewayShadowSidecarForRuntimeAttachment(noRequestId).warnings.some(w => w.includes("requestId")), "missing requestId");
  const badEnabled: any = { ...validSidecar, enabled: "yes" };
  assert(validateKimiGatewayShadowSidecarForRuntimeAttachment(badEnabled).warnings.some(w => w.includes("enabled")), "enabled not boolean");
  const badExecuted: any = { ...validSidecar, executed: "yes" };
  assert(validateKimiGatewayShadowSidecarForRuntimeAttachment(badExecuted).warnings.some(w => w.includes("executed")), "executed not boolean");
  const badWarnings: any = { ...validSidecar, warnings: "not array" };
  assert(validateKimiGatewayShadowSidecarForRuntimeAttachment(badWarnings).warnings.some(w => w.includes("warnings")), "warnings not array");
  // buildKimiRuntimeShadowAttachment rejects structural invalids
  assert(buildKimiRuntimeShadowAttachment({ request, sidecar: noDecision, env: { SDLC_KIMI_RUNTIME_ATTACHMENT: "enabled" } }).decision === "sidecar_rejected_invalid", "rejects missing decision");
  console.log("");

  // Test 7: No forbidden imports
  console.log("Test 7: No forbidden imports");
  const src = fs.readFileSync("execution/kimi-runtime-attachment-contract.ts", "utf-8");
  const badImports = src.split("\n").filter(l => l.includes("import ") && (l.includes("./runtime") || l.includes("../runtime") || l.includes("execution-gateway") || l.includes("ExecutionGateway") || l.includes("child_process") || l.includes("graph") || l.includes("\"fs\"") || l.includes("'fs'")));
  assert(badImports.length === 0, `no forbidden imports (found ${badImports.length})`);
  console.log("");

  // Test 8: No prompt leakage
  console.log("Test 8: No prompt leakage");
  for (const r of [r2, r3, r4, r5]) {
    assert(!JSON.stringify(r).includes("this prompt must not leak"), "no prompt in serialized");
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
