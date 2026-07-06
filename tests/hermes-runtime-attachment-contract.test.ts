// Regression Test — Hermes Runtime Shadow Attachment Contract
// ==============================================================
// Contract-only. No Runtime, no Gateway, no CLI.

import {
  validateHermesRuntimeAttachment,
  buildHermesRuntimeShadowAttachment,
  isHermesRuntimeAttachmentEnabled,
  HERMES_RUNTIME_ATTACHMENT_FLAG,
  type HermesRuntimeShadowAttachment,
} from "../execution/hermes-runtime-attachment-contract";
import type { HermesGatewayShadowSidecarResult } from "../execution/hermes-gateway-shadow-sidecar";
import * as fs from "fs";

const safeSidecar: HermesGatewayShadowSidecarResult = {
  adapter: "hermes",
  source: "hermes_gateway_shadow_sidecar",
  status: "shadow_executed_success",
  requestId: "REQ-ATTACH",
  requestType: "validation",
  enabled: true,
  executed: true,
  integrationDecision: "eligible_contract_only",
  commandDecision: "executed_success",
  outputSummary: "ok",
  errorSummary: undefined,
  affectsPrimaryGatewayResult: false,
  affectsRuntimeRouting: false,
  affectsFinalStatus: false,
  writesFiles: false,
  persistsAudit: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  auditEvents: [],
  warnings: [],
};

const attachmentOn: Record<string, string | undefined> = {
  [HERMES_RUNTIME_ATTACHMENT_FLAG]: "enabled",
};

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Runtime Shadow Attachment Contract Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default disabled");
  const v1 = validateHermesRuntimeAttachment({ sidecarResult: safeSidecar, env: {} });
  assert(v1.valid === false, "not valid");
  assert(v1.reason === "attachment_disabled", "disabled");
  assert(v1.affectsRuntimeFinalStatus === false && v1.affectsRuntimeRouting === false, "no effects");
  const b1 = buildHermesRuntimeShadowAttachment({ sidecarResult: safeSidecar, env: {} });
  assert(b1 === undefined, "build undefined");
  console.log("");

  // Test 2: Flag enabled but missing sidecar
  console.log("Test 2: Missing sidecar");
  const v2 = validateHermesRuntimeAttachment({ env: attachmentOn });
  assert(v2.valid === false, "not valid");
  assert(v2.reason === "missing_sidecar_result", "missing sidecar");
  console.log("");

  // Test 3: Safe sidecar attaches
  console.log("Test 3: Safe sidecar attaches");
  const v3 = validateHermesRuntimeAttachment({ sidecarResult: safeSidecar, env: attachmentOn });
  assert(v3.valid === true, "valid");
  assert(v3.reason === "valid_attachment", "valid attachment");
  const a3 = buildHermesRuntimeShadowAttachment({ sidecarResult: safeSidecar, env: attachmentOn })!;
  assert(a3 !== undefined, "attachment exists");
  assert(a3.adapter === "hermes", "adapter hermes");
  assert(a3.source === "hermes_runtime_shadow_attachment", "source");
  assert(a3.attached === true, "attached true");
  assert(a3.enabled === true, "enabled true");
  assert(a3.sidecarStatus === "shadow_executed_success", "sidecar status");
  assert(a3.integrationDecision === "eligible_contract_only", "integration decision");
  assert(a3.commandDecision === "executed_success", "command decision");
  assert(a3.affectsRuntimeFinalStatus === false, "no final status");
  assert(a3.affectsRuntimeRouting === false, "no routing");
  assert(a3.affectsPrimaryGatewayResult === false, "no primary gateway");
  assert(a3.writesFiles === false, "no files");
  assert(a3.persistsAudit === false, "no persist");
  assert(a3.containsRawPrompt === false, "no raw prompt");
  assert(a3.containsRawArtifacts === false, "no raw artifacts");
  assert(a3.containsSecrets === false, "no secrets");
  console.log("");

  // Test 4: Unsafe sidecar rejected
  console.log("Test 4: Unsafe sidecar rejected");
  const unsafeFields: Array<{ key: keyof HermesGatewayShadowSidecarResult; label: string }> = [
    { key: "affectsFinalStatus", label: "affectsFinalStatus" },
    { key: "affectsPrimaryGatewayResult", label: "affectsPrimaryGatewayResult" },
    { key: "affectsRuntimeRouting", label: "affectsRuntimeRouting" },
    { key: "writesFiles", label: "writesFiles" },
    { key: "persistsAudit", label: "persistsAudit" },
    { key: "containsRawPrompt", label: "containsRawPrompt" },
    { key: "containsRawArtifacts", label: "containsRawArtifacts" },
    { key: "containsSecrets", label: "containsSecrets" },
  ];
  for (const { key, label } of unsafeFields) {
    const unsafe = { ...safeSidecar, [key]: true as any };
    const v = validateHermesRuntimeAttachment({ sidecarResult: unsafe, env: attachmentOn });
    assert(v.valid === false, `${label} invalid`);
    assert(v.reason === "unsafe_sidecar_result", `${label} unsafe reason`);
    assert(v.warnings.some(w => w.includes(label) || w.includes("not false")), `${label} has warning`);
    const b = buildHermesRuntimeShadowAttachment({ sidecarResult: unsafe, env: attachmentOn });
    assert(b === undefined, `${label} build undefined`);
  }
  console.log("");

  // Test 5: Output/error summary is sanitized
  console.log("Test 5: Output/error summary sanitized");
  const secretSidecar2 = {
    ...safeSidecar,
    outputSummary: "token=abc secret=xyz",
    errorSummary: "password=123",
    warnings: ["api_key=abc sk-test"],
  };
  const a5 = buildHermesRuntimeShadowAttachment({ sidecarResult: secretSidecar2, env: attachmentOn })!;
  const j5 = JSON.stringify(a5);
  assert(!j5.includes("abc"), "no abc");
  assert(!j5.includes("123"), "no 123");
  assert(!j5.includes("xyz"), "no xyz");
  assert(!j5.includes("sk-test"), "no sk-test");
  assert(a5.outputSummary !== undefined, "output summary present");
  assert(a5.containsRawPrompt === false, "no raw prompt flag");
  assert(a5.containsRawArtifacts === false, "no raw artifacts flag");
  assert(a5.containsSecrets === false, "no secrets flag");
  console.log("");

  // Test 6: No forbidden imports
  console.log("Test 6: No forbidden imports");
  const src = fs.readFileSync("execution/hermes-runtime-attachment-contract.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "executeHermesCliCommand", "runHermesGatewayShadowSidecar", "child_process", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
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
