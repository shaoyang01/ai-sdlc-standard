// Regression Test — Hermes Runtime Shadow Attachment Wiring Contract
// ======================================================================
// Contract-only. No Runtime, no Gateway, no CLI.

import {
  evaluateHermesRuntimeShadowAttachmentWiringContract,
  HERMES_RUNTIME_ATTACHMENT_WIRING_RULES,
  HERMES_RUNTIME_ATTACHMENT_FIELD,
} from "../core/hermes-runtime-shadow-attachment-wiring-contract";
import { HERMES_RUNTIME_ATTACHMENT_FLAG } from "../execution/hermes-runtime-attachment-contract";
import type { HermesRuntimeShadowAttachmentBuildResult } from "../core/hermes-runtime-shadow-attachment";
import * as fs from "fs";

const safeAttachment: HermesRuntimeShadowAttachmentBuildResult = {
  adapter: "hermes",
  source: "hermes_runtime_shadow_attachment_helper",
  requestId: "REQ-WIRING",
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
const flagOn: Record<string, string | undefined> = {
  [HERMES_RUNTIME_ATTACHMENT_FLAG]: "enabled",
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Runtime Shadow Attachment Wiring Contract Test\n");

  // Test 1: Disabled
  console.log("Test 1: Disabled");
  const r1 = evaluateHermesRuntimeShadowAttachmentWiringContract({ attachment: safeAttachment, env: {} });
  assert(r1.decision === "wiring_disabled", "wiring disabled");
  assert(r1.enabled === false, "not enabled");
  assert(r1.mayAttach === false, "may not attach");
  assert(r1.attachmentPresent === false, "no attachment");
  assert(r1.changesRuntimeResultShapeNow === false, "no shape change");
  assert(r1.affectsRuntimeFinalStatus === false && r1.affectsRuntimeRouting === false, "no effects");
  console.log("");

  // Test 2: Flag enabled but missing attachment
  console.log("Test 2: Missing attachment");
  const r2 = evaluateHermesRuntimeShadowAttachmentWiringContract({ env: flagOn });
  assert(r2.decision === "missing_attachment", "missing");
  assert(r2.enabled === true, "enabled");
  assert(r2.mayAttach === false, "may not attach");
  assert(r2.attachmentPresent === false, "no attachment");
  console.log("");

  // Test 3: Safe attachment may attach contract-only
  console.log("Test 3: Safe attachment contract-only");
  const r3 = evaluateHermesRuntimeShadowAttachmentWiringContract({ attachment: safeAttachment, env: flagOn });
  assert(r3.decision === "safe_to_attach_contract_only", "safe");
  assert(r3.mayAttach === true, "may attach");
  assert(r3.contractOnly === true, "contract only");
  assert(r3.runtimeField === HERMES_RUNTIME_ATTACHMENT_FIELD, "correct field");
  assert(r3.changesRuntimeResultShapeNow === false, "no shape change now");
  assert(r3.affectsRuntimeFinalStatus === false, "no final status");
  assert(r3.affectsRuntimeRouting === false, "no routing");
  assert(r3.affectsPrimaryGatewayResult === false, "no primary gateway");
  assert(r3.writesFiles === false && r3.persistsAudit === false, "no files/persist");
  assert(r3.containsRawPrompt === false && r3.containsRawArtifacts === false && r3.containsSecrets === false, "no raw/secrets");
  console.log("");

  // Test 4: Unsafe attachment rejected
  console.log("Test 4: Unsafe attachment rejected");
  const unsafeFields: Array<{ key: keyof HermesRuntimeShadowAttachmentBuildResult; label: string }> = [
    { key: "affectsRuntimeFinalStatus", label: "finalStatus" },
    { key: "affectsRuntimeRouting", label: "routing" },
    { key: "affectsPrimaryGatewayResult", label: "primaryGateway" },
    { key: "writesFiles", label: "writesFiles" },
    { key: "persistsAudit", label: "persistsAudit" },
    { key: "containsRawPrompt", label: "rawPrompt" },
    { key: "containsRawArtifacts", label: "rawArtifacts" },
    { key: "containsSecrets", label: "secrets" },
  ];
  for (const { key, label } of unsafeFields) {
    const unsafe = { ...safeAttachment, [key]: true as any };
    const r = evaluateHermesRuntimeShadowAttachmentWiringContract({ attachment: unsafe, env: flagOn });
    assert(r.decision === "unsafe_attachment", `${label} unsafe`);
    assert(r.mayAttach === false, `${label} may not attach`);
  }
  console.log("");

  // Test 5: Wiring rules
  console.log("Test 5: Wiring rules");
  const wr = HERMES_RUNTIME_ATTACHMENT_WIRING_RULES;
  assert(wr.fieldName === "hermes_runtime_shadow_attachment", "field name");
  assert(wr.conditionalFieldOnly === true, "conditional");
  assert(wr.omitWhenDisabled === true, "omit when disabled");
  assert(wr.neverUseUndefinedKey === true, "no undefined key");
  assert(wr.mustNotChangeFinalStatus === true, "no final status");
  assert(wr.mustNotChangeRuntimeRouting === true, "no routing");
  assert(wr.mustNotAffectPrimaryGatewayResult === true, "no primary gateway");
  assert(wr.mustNotMergeIntoArtifacts === true, "no merge artifacts");
  assert(wr.mustNotPersistAudit === true, "no persist audit");
  assert(wr.mustNotWriteFiles === true, "no write files");
  assert(wr.requiresFeatureFlag === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "flag");
  console.log("");

  // Test 6: No forbidden imports
  console.log("Test 6: No forbidden imports");
  const src = fs.readFileSync("core/hermes-runtime-shadow-attachment-wiring-contract.ts", "utf-8");
  const forbidden = [
    { pattern: /"runtime"/, label: "runtime" },
    { pattern: /"execution\/gateway"/, label: "execution/gateway" },
    { pattern: /buildHermesRuntimeShadowAttachmentFromRequest/, label: "buildHermesRuntimeShadowAttachmentFromRequest" },
    { pattern: /runHermesGatewayShadowSidecar/, label: "runHermesGatewayShadowSidecar" },
    { pattern: /executeHermesCliCommand/, label: "executeHermesCliCommand" },
    { pattern: /child_process/, label: "child_process" },
    { pattern: /kimi-gateway-real-dispatch/, label: "kimi-gateway-real-dispatch" },
    { pattern: /codex/, label: "codex" },
    { pattern: /policy-memory/, label: "policy-memory" },
    { pattern: /graph/, label: "graph" },
    { pattern: /"fs"/, label: "fs" },
    { pattern: /http/, label: "http" },
    { pattern: /https/, label: "https" },
    { pattern: /fetch/, label: "fetch" },
  ];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    const fromIdx = l.indexOf(" from ");
    if (fromIdx === -1) return false;
    const path = l.slice(fromIdx + 6).trim();
    for (const { pattern, label } of forbidden) {
      if (pattern.test(path) || pattern.test(l)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
