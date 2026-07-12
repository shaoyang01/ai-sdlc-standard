// Regression Test — Kimi Request Type Expansion Contract
// =========================================================
// Contract-only. No implementation, no CLI, no runtime.

import {
  KIMI_REQUEST_TYPE_EXPANSION_CONTRACT,
  getKimiRequestTypeExpansionDecision,
  isKimiRequestTypeExpansionAllowedInThisPr,
} from "../execution/kimi-request-type-expansion-contract";
import * as fs from "node:fs";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Request Type Expansion Contract Test\n");

  // ── Test 1: isKimiRequestTypeExpansionAllowedInThisPr always false ──
  console.log("Test 1: isKimiRequestTypeExpansionAllowedInThisPr always false");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("llm_task") === false, "llm_task not allowed");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("code_generation") === false, "code_generation not allowed");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("code_review") === false, "code_review not allowed");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("bugfix") === false, "bugfix not allowed");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("validation") === false, "validation not allowed");
  assert(isKimiRequestTypeExpansionAllowedInThisPr("review") === false, "review not allowed");
  console.log("");

  // ── Test 2: Decision recommendations ──
  console.log("Test 2: Decision recommendations");
  assert(getKimiRequestTypeExpansionDecision("llm_task")?.recommendation === "approved_candidate", "llm_task approved");
  assert(getKimiRequestTypeExpansionDecision("code_generation")?.recommendation === "defer_to_codex", "code_generation defer codex");
  assert(getKimiRequestTypeExpansionDecision("code_review")?.recommendation === "defer_to_hermes", "code_review defer hermes");
  assert(getKimiRequestTypeExpansionDecision("validation")?.recommendation === "defer_to_hermes", "validation defer hermes");
  assert(getKimiRequestTypeExpansionDecision("review")?.recommendation === "defer_to_hermes", "review defer hermes");
  assert(getKimiRequestTypeExpansionDecision("bugfix")?.recommendation === "requires_separate_review", "bugfix separate review");
  assert(getKimiRequestTypeExpansionDecision("nonexistent") === undefined, "nonexistent undefined");
  console.log("");

  // ── Test 3: Every decision has all safety fields false ──
  console.log("Test 3: Safety fields on every decision");
  for (const d of KIMI_REQUEST_TYPE_EXPANSION_CONTRACT) {
    assert(d.allowedInThisPr === false, `${d.requestType}: allowedInThisPr false`);
    assert(d.implementationChanges === false, `${d.requestType}: implementationChanges false`);
    assert(d.runtimeChanges === false, `${d.requestType}: runtimeChanges false`);
    assert(d.gatewayRoutingChanges === false, `${d.requestType}: gatewayRoutingChanges false`);
    assert(d.changesFinalStatus === false, `${d.requestType}: changesFinalStatus false`);
    assert(d.requiresSeparateImplementationPr === true, `${d.requestType}: requiresSeparateImplementationPr true`);
    assert(Array.isArray(d.requiredSafetyBoundaries) && d.requiredSafetyBoundaries.length > 0, `${d.requestType}: has safety boundaries`);
  }
  console.log("");

  // ── Test 4: Forbidden imports check ──
  console.log("Test 4: Forbidden imports check");
  const src = fs.readFileSync("execution/kimi-request-type-expansion-contract.ts", "utf-8");
  const forbidden = ["runtime", "gateway", "child_process", "kimi-gateway-real-dispatch", "kimi-cli-command-executor", "\"fs\"", "http", "https", "fetch", "policy-memory", "graph"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    for (const f of forbidden) {
      if (l.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  // ── Test 5: JSON assertions ──
  console.log("Test 5: JSON contract");
  const raw = fs.readFileSync("metadata/capabilities/kimi/kimi-request-type-expansion-contract.json", "utf-8");
  const j = JSON.parse(raw);
  assert(j.status === "NO_EXPANSION_IN_THIS_PR", "json: status");
  assert(j.contract_only === true, "json: contract_only");
  assert(j.implementation_changes === false, "json: impl changes false");
  assert(j.request_type_expansion === false, "json: no expansion");
  assert(Array.isArray(j.current_supported_request_types) && j.current_supported_request_types.length === 1 && j.current_supported_request_types[0] === "llm_task", "json: current types llm_task only");
  assert(Array.isArray(j.newly_supported_request_types) && j.newly_supported_request_types.length === 0, "json: no new types");
  for (const d of j.decisions) {
    assert(d.implemented_now === false, `json: ${d.request_type} implemented_now false`);
  }
  assert(j.recommended_next_pr.title === "Hermes CLI Command Executor Implementation Behind Feature Flag", "json: next PR Hermes executor");
  console.log("");

  // ── Test 6: Markdown assertions ──
  console.log("Test 6: Markdown contract");
  const md = fs.readFileSync("docs/capabilities/kimi/KIMI_REQUEST_TYPE_EXPANSION_CONTRACT.md", "utf-8");
  assert(md.includes("NO_EXPANSION_IN_THIS_PR"), "md: verdict");
  assert(md.includes("Kimi remains `llm_task` only"), "md: Kimi remains llm_task only");
  assert(md.includes("code_generation remains Codex-owned"), "md: code_generation Codex-owned");
  assert(md.includes("deferred to Hermes"), "md: deferred to Hermes");
  assert(md.includes("This PR does not change Gateway dispatch"), "md: no gateway change");
  // Must NOT contain unsafe claims
  const unsafePhrases = [
    "Kimi now supports code_generation",
    "Kimi now supports code_review",
    "Kimi now supports validation",
    "Kimi now supports bugfix",
    "Gateway dispatch changed",
  ];
  for (const phrase of unsafePhrases) {
    assert(!md.includes(phrase), `md: no unsafe '${phrase}'`);
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
