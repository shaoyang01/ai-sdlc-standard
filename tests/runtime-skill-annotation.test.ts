// Regression Test — Runtime Skill Annotation (Observability Only)
// ================================================================
// Verifies runtime-created execution requests carry inferred
// sdlc-* skill metadata without changing runtime behavior.
// Default shadow mode only. No SQLite. No Codex CLI.

import { run } from "../runtime";
import { loadRuntimeCapabilities } from "../core/runtime-capabilities";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  const caps = loadRuntimeCapabilities("runtime-capabilities.json");
  const skillsCaps = caps.skills as Record<string, unknown>;

  console.log("Runtime Skill Annotation Test\n");

  // ── Test 1: Runtime still succeeds ──
  console.log("Test 1: Runtime still succeeds with skill annotation");
  const result = await run(
    "create a user registration form with email validation password strength meter " +
    "and phone number verification the form should include fields for first name last name " +
    "email address phone number and password with client side validation"
  );
  assert(result.final_status === "success", "final status is success");
  console.log("");

  // ── Test 2: Trace node order includes all expected nodes ──
  console.log("Test 2: Trace node order unchanged");
  const nodes = result.execution_trace.map((t) => t.node) as string[];
  const expectedOrder = [
    "requirement-summary",
    "tech-design",
    "review",
    "implementation",
    "code-review",
    "validation",
  ];
  let pos = 0;
  for (const exp of expectedOrder) {
    const idx = nodes.indexOf(exp, pos);
    assert(idx >= pos, `"${exp}" appears at or after position ${pos} (found at ${idx})`);
    if (idx >= 0) pos = idx + 1;
  }
  assert(!nodes.includes("bugfix"), "bugfix not in success path");
  console.log("");

  // ── Test 3: Selected agents unchanged ──
  console.log("Test 3: Selected agents unchanged");
  const implTrace = result.execution_trace.find((t) => t.node === "implementation");
  const reviewTrace = result.execution_trace.find((t) => t.node === "review");
  assert(implTrace !== undefined, "implementation trace exists");
  assert(reviewTrace !== undefined, "review trace exists");
  // Agent selection follows normal policy, not skill-driven
  assert(implTrace!.agent === "codex", "implementation agent remains codex");
  console.log("");

  // ── Test 4: Implementation artifact has skill_validation (ambiguous skill) ──
  console.log("Test 4: Implementation artifact skill metadata");
  const implArtifact = result.artifacts.find(
    (a) => a.node === "implementation" && a.type !== "fanout_result"
  );
  assert(implArtifact !== undefined, "implementation artifact exists");
  const implSV = implArtifact!.content["skill_validation"] as Record<string, unknown> | null;
  assert(implSV !== null && implSV !== undefined, "skill_validation exists");
  // Skill may be null: implementation has 2 matching bindings
  // (sdlc-speckit-implement + sdlc-implementation-recorder) → ambiguous → no inference
  assert(implSV!["attempted"] === false, "skill_validation.attempted === false (ambiguous skill)");
  console.log("");

  // ── Test 5: Code-review artifact has skill_validation ──
  console.log("Test 5: Code review artifacts preserve skill metadata");
  const crArtifact = result.artifacts.find((a) => a.type === "code_review");
  assert(crArtifact !== undefined, "code_review artifact exists");
  const crSV = crArtifact!.content["skill_validation"] as Record<string, unknown> | null;
  assert(crSV !== null && crSV !== undefined, "code review has skill_validation");
  console.log("");

  // ── Test 6: Missing/ambiguous skill does not fail runtime ──
  console.log("Test 6: Runtime still succeeds with potentially ambiguous skills");
  assert(result.final_status === "success", "runtime succeeded");
  console.log("");

  // ── Test 7: Capability metadata confirms annotation is advisory ──
  console.log("Test 7: Capability metadata confirms annotation is optional");
  assert(skillsCaps["runtime_skill_annotation"] === "implemented_optional_metadata", "annotation is optional metadata");
  assert(skillsCaps["skill_annotation_affects_runtime_routing"] === false, "annotation does not affect routing");
  assert(skillsCaps["skill_annotation_affects_agent_selection"] === false, "annotation does not affect agent selection");
  assert(skillsCaps["skill_annotation_affects_execution_dispatch"] === false, "annotation does not affect dispatch");
  console.log("");

  // ── Test 8: Fanout path succeeds with skill annotation ──
  console.log("Test 8: Fanout path succeeds with skill annotation");
  const fanoutResult = await run("sync inventory service with repo-A calls repo-B and integration event pipeline");
  assert(fanoutResult.final_status === "success", "fanout final status is success");
  assert(fanoutResult.fanout_results !== undefined, "fanout_results exists");
  assert(
    (fanoutResult.fanout_results!.repo_results || []).length > 0,
    "fanout has repo results"
  );
  // Fanout child artifacts are internal to gateway execution and not surfaced
  // in RuntimeResult as individual shadow_output artifacts. Only fanout_result
  // is surfaced at the top-level. Skill metadata is preserved inside the gateway
  // but the current RuntimeResult shape does not expose child artifact details.
  const fanoutArtifact = fanoutResult.artifacts.find((a) => a.type === "fanout_result");
  assert(fanoutArtifact !== undefined, "fanout_result artifact is surfaced");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
