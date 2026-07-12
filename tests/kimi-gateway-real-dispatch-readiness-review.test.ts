// Regression Test — Kimi Gateway Real Dispatch Readiness Review
// ================================================================
// Verifies the JSON and Markdown readiness review is accurate.
// Review-only. No implementation, no CLI, no runtime.

import * as fs from "node:fs";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Gateway Real Dispatch Readiness Review Test\n");

  // ── JSON assertions ──
  console.log("Test 1: JSON review");
  const raw = fs.readFileSync("metadata/capabilities/kimi/kimi-gateway-real-dispatch-readiness-review.json", "utf-8");
  const review = JSON.parse(raw);

  assert(review.status === "READY_WITH_CONSTRAINTS", "status READY_WITH_CONSTRAINTS");
  assert(review.review_only === true, "review_only true");
  assert(review.implementation_changes === false, "implementation_changes false");
  assert(review.runtime_changes === false, "runtime_changes false");
  assert(review.gateway_routing_changes === false, "gateway_routing_changes false");
  assert(review.request_type_expansion === false, "request_type_expansion false");
  assert(review.default_enabled === false, "default_enabled false");

  // Supported request types
  const rt = review.supported_request_types as string[];
  assert(rt.length === 1, "supported_request_types length 1");
  assert(rt.includes("llm_task"), "supports llm_task");
  assert(!rt.includes("code_generation"), "no code_generation");
  assert(!rt.includes("code_review"), "no code_review");
  assert(!rt.includes("bugfix"), "no bugfix");
  assert(!rt.includes("validation"), "no validation");

  // Flags
  const flags = review.requires_flags as string[];
  assert(flags.includes("SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled"), "flag: real dispatch");
  assert(flags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "flag: integration");
  assert(flags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "flag: command execution");

  // Safety boundaries
  const sb = review.safety_boundaries;
  assert(sb.changes_runtime_final_status === false, "sb: no final_status change");
  assert(sb.changes_default_runtime_routing === false, "sb: no routing change");
  assert(sb.changes_codex_behavior === false, "sb: no codex change");
  assert(sb.changes_hermes_behavior === false, "sb: no hermes change");
  assert(sb.invokes_real_sdlc_skills === false, "sb: no real skills");
  assert(sb.writes_files === false, "sb: no file writes");
  assert(sb.persists_audit === false, "sb: no audit persist");
  assert(sb.calls_real_kimi_cli_in_tests === false, "sb: no real CLI in tests");
  assert(sb.uses_fake_runners_in_tests === true, "sb: uses fake runners");

  // Capability stack
  const stack = review.capability_stack as string[];
  assert(stack.includes("kimi_gateway_real_dispatch_feature_flagged"), "stack: real dispatch");
  assert(stack.includes("kimi_gateway_real_dispatch_fallback_policy"), "stack: fallback");
  assert(stack.includes("kimi_gateway_real_dispatch_observability"), "stack: observability");
  assert(stack.includes("kimi_gateway_real_dispatch_guardrails"), "stack: guardrails");

  // Known limitations
  const lim = review.known_limitations as string[];
  assert(lim.includes("llm_task_only"), "lim: llm_task only");
  assert(lim.includes("not_default_enabled"), "lim: not default");
  assert(lim.includes("not_automatic_runtime_routing"), "lim: not auto routing");
  assert(lim.includes("not_request_type_expanded"), "lim: not expanded");

  // Next PR
  assert(review.recommended_next_pr.title === "Kimi Gateway Request Type Expansion Contract", "next PR: expansion contract");
  console.log("");

  // ── Markdown assertions ──
  console.log("Test 2: Markdown review");
  const md = fs.readFileSync("docs/capabilities/kimi/KIMI_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md", "utf-8");

  // Must contain
  assert(md.includes("READY_WITH_CONSTRAINTS"), "MD: verdict");
  assert(md.includes("llm_task"), "MD: llm_task");
  assert(md.includes("not ready for request type expansion"), "MD: not ready expansion");
  assert(md.includes("not ready to become default routing"), "MD: not ready default routing");
  assert(md.includes("No implementation behavior is changed"), "MD: no impl changes");
  assert(md.includes("No request types are expanded"), "MD: no type expansion");
  assert(md.includes("No Runtime final_status behavior changes"), "MD: no final_status");
  assert(md.includes("No Gateway default routing changes"), "MD: no routing");

  // Must NOT contain unsafe claims (careful substring checks)
  // "READY" alone (without "NOT_READY" or "READY_WITH_CONSTRAINTS") would be unsafe
  // The doc contains "READY_WITH_CONSTRAINTS" which is fine
  // Check that standalone unsafe phrases don't appear
  const mdLines = md.split("\n");
  const unsafeLine = mdLines.find((l: string) => {
    const trimmed = l.trim();
    // "default enabled" as a standalone claim (not "not default enabled")
    if (/^\s*[-*]\s+.*\bdefault enabled\b/i.test(trimmed) && !/not default enabled/i.test(trimmed)) return true;
    // "supports code_generation" as a positive claim
    if (/\bsupports code_generation\b/i.test(trimmed) && !/not ready for.*code_generation/i.test(trimmed) && !/cannot handle.*code_generation/i.test(trimmed)) return true;
    // "supports code_review" as a positive claim (not in "not ready" context)
    if (/\bsupports code_review\b/i.test(trimmed) && !/not ready/i.test(trimmed) && !/cannot handle/i.test(trimmed)) return true;
    // "automatic runtime routing enabled" 
    if (/\bautomatic runtime routing enabled\b/i.test(trimmed)) return true;
    return false;
  });
  assert(unsafeLine === undefined, `MD: no unsafe claim (found: ${unsafeLine ? unsafeLine.trim().slice(0, 60) : "none"})`);

  // "READY" on its own line as a standalone status (not READY_WITH_CONSTRAINTS)
  const readyStandalone = mdLines.find((l: string) => /^\s*\*{0,2}READY\*{0,2}\s*$/i.test(l.trim()) && !l.includes("READY_WITH_CONSTRAINTS"));
  assert(readyStandalone === undefined, `MD: no standalone READY (found: ${readyStandalone ? readyStandalone.trim() : "none"})`);

  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
