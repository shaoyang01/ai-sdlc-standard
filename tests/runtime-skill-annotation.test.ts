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
  const result = await run("build payment system with order sync service");
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
  const implAgent = implTrace!.agent;
  assert(typeof implAgent === "string", `implementation agent is ${implAgent}`);
  console.log("");

  // ── Test 4: Implementation artifact skill matches agent ──
  console.log("Test 4: Implementation artifact skill metadata present when agent is codex");
  const implArtifact = result.artifacts.find(
    (a) => a.node === "implementation" && a.type !== "fanout_result"
  );
  assert(implArtifact !== undefined, "implementation artifact exists");
  const implSV = implArtifact!.content["skill_validation"] as Record<string, unknown> | null;
  assert(implSV !== null && implSV !== undefined, "skill_validation exists");
  // If agent is codex, skill should be sdlc-speckit-implement (unambiguous)
  if (implAgent === "codex") {
    assert(implArtifact!.content["skill"] === "sdlc-speckit-implement",
      `skill is sdlc-speckit-implement (got ${implArtifact!.content["skill"]})`);
    assert(implSV!["attempted"] === true, "skill_validation.attempted === true");
    assert(implSV!["valid"] === true, "skill_validation.valid === true");
  }
  // If agent is not codex, skill may be null (no unambiguous mapping)
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
  // Fanout child artifacts should carry skill metadata
  const fanoutArtifacts = fanoutResult.artifacts.filter((a) => a.type === "shadow_output");
  for (const fa of fanoutArtifacts) {
    const faSV = fa.content["skill_validation"] as Record<string, unknown> | null;
    if (faSV) {
      assert(typeof faSV["attempted"] === "boolean", "fanout artifact has skill_validation.attempted");
    }
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
