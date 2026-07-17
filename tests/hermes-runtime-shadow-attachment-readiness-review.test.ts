// Regression Test — Hermes Runtime Shadow Attachment Readiness Review
// ======================================================================
// Review-only. No runtime, no Gateway, no CLI.

import {
  HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW,
} from "../core/hermes-runtime-shadow-attachment-readiness-review";
import * as fs from "fs";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Runtime Shadow Attachment Readiness Review Test\n");

  const r = HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW;

  // Test 1: Readiness object shape
  console.log("Test 1: Readiness object shape");
  assert(r.name === "Hermes Runtime Shadow Attachment Final Readiness Review", "name");
  assert(r.adapter === "hermes", "adapter");
  assert(r.scope === "runtime_shadow_attachment", "scope");
  assert(r.verdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(r.recommendedNextPr === "Hermes Gateway Real Dispatch Contract", "next PR");
  console.log("");

  // Test 2: Default/routing/Gateway constraints
  console.log("Test 2: Default/routing/Gateway constraints");
  assert(r.runtimeActiveByDefault === false, "not active by default");
  assert(r.defaultDisabled === true, "default disabled");
  assert(r.wiredToRuntime === true, "wired to runtime");
  assert(r.wiredToGateway === false, "not wired to gateway");
  assert(r.gatewayPrimaryDispatchChanged === false, "gateway unchanged");
  assert(r.runtimeFinalStatusChanged === false, "final status unchanged");
  assert(r.runtimeRoutingChanged === false, "routing unchanged");
  assert(r.primaryGatewayResultAffected === false, "primary gateway unaffected");
  console.log("");

  // Test 3: Sidecar field guarantees
  console.log("Test 3: Sidecar field guarantees");
  assert(r.omittedWhenDisabled === true, "omit when disabled");
  assert(r.neverUndefinedKey === true, "no undefined key");
  assert(r.hasAuditMetadata === true, "has audit metadata");
  assert(r.hasObservabilitySummary === true, "has observability");
  console.log("");

  // Test 4: Test-safety guarantees
  console.log("Test 4: Test-safety guarantees");
  assert(r.usesFakeBuilderInTests === true, "fake builder");
  assert(r.usesFakeRunnerInTests === true, "fake runner");
  assert(r.invokesRealHermesCliInTests === false, "no real CLI");
  console.log("");

  // Test 5: No persistence / no leakage
  console.log("Test 5: No persistence / no leakage");
  assert(r.persistsAudit === false, "no persist");
  assert(r.writesFiles === false, "no files");
  assert(r.containsRawPrompt === false, "no raw prompt");
  assert(r.containsRawArtifacts === false, "no raw artifacts");
  assert(r.containsSecrets === false, "no secrets");
  console.log("");

  // Test 6: Constraints and evidence
  console.log("Test 6: Constraints and evidence");
  assert(Array.isArray(r.constraints) && r.constraints.length >= 4, "constraints exist");
  assert(r.constraints.some(c => c.includes("not wired to primary Gateway")), "constraint: not wired gateway");
  assert(r.constraints.some(c => c.includes("separate Gateway real dispatch contract")), "constraint: separate dispatch");
  assert(r.constraints.some(c => c.includes("optional and omitted")), "constraint: optional omitted");
  assert(r.constraints.some(c => c.includes("final_status") || c.includes("routing")), "constraint: no final_status/routing");
  assert(Array.isArray(r.evidence) && r.evidence.length >= 5, "evidence exists");
  assert(r.evidence.includes("core/hermes-runtime-shadow-attachment.ts"), "evidence: helper");
  assert(r.evidence.includes("tests/hermes-runtime-shadow-attachment.test.ts"), "evidence: helper test");
  assert(r.evidence.includes("tests/runtime-hermes-shadow-attachment.test.ts"), "evidence: runtime test");
  assert(r.evidence.includes("core/hermes-runtime-shadow-attachment-wiring-contract.ts"), "evidence: wiring");
  assert(r.evidence.includes("tests/hermes-runtime-shadow-attachment-wiring-contract.test.ts"), "evidence: wiring test");
  assert(r.evidence.includes("docs/capabilities/hermes/HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW.md"), "evidence: md");
  assert(r.evidence.includes("metadata/capabilities/hermes/hermes-runtime-shadow-attachment-readiness-review.json"), "evidence: json");
  console.log("");

  // Test 7: Markdown consistency
  console.log("Test 7: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW.md", "utf-8");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: verdict");
  assert(md.includes("Runtime shadow attachment only"), "md: scope");
  assert(md.includes("Not wired to Gateway primary dispatch"), "md: no gateway");
  assert(md.includes("No Hermes Gateway real dispatch"), "md: no real dispatch");
  assert(md.includes("Hermes Gateway Real Dispatch Contract"), "md: next PR");
  console.log("");

  // Test 8: JSON consistency
  console.log("Test 8: JSON consistency");
  const jsonRaw = fs.readFileSync("metadata/capabilities/hermes/hermes-runtime-shadow-attachment-readiness-review.json", "utf-8");
  const json = JSON.parse(jsonRaw);
  assert(json.verdict === "READY_WITH_CONSTRAINTS", "json: verdict");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Contract", "json: next PR");
  assert(json.wired_to_runtime === true, "json: wired runtime");
  assert(json.wired_to_gateway === false, "json: not wired gateway");
  assert(json.never_undefined_key === true, "json: no undefined");
  assert(json.persists_audit === false, "json: no persist");
  assert(json.contains_raw_prompt === false && json.contains_secrets === false, "json: no raw/secrets");
  console.log("");

  // Test 9: Forbidden imports
  console.log("Test 9: Forbidden imports");
  const src = fs.readFileSync("core/hermes-runtime-shadow-attachment-readiness-review.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "buildHermesRuntimeShadowAttachmentFromRequest", "runHermesGatewayShadowSidecar", "executeHermesCliCommand", "child_process", "\"fs\"", "http", "https", "fetch", "policy-memory", "graph", "kimi-gateway-real-dispatch", "codex"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    const fromIdx = l.indexOf(" from ");
    if (fromIdx === -1) return false;
    const path = l.slice(fromIdx + 6).trim();
    for (const f of forbidden) {
      if (path.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
