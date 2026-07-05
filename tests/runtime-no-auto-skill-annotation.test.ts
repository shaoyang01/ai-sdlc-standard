// Regression Test — Runtime No Auto Skill Annotation
// =====================================================
// Verifies runtime-created requests do NOT auto-attach skill metadata.
// Explicit skill metadata through ExecutionGateway still works.
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

  console.log("Runtime No Auto Skill Annotation Test\n");

  // ── Test 1: Runtime still succeeds ──
  console.log("Test 1: Runtime still succeeds");
  const result = await run(
    "create a user registration form with email validation password strength meter " +
    "and phone number verification the form should include fields for first name last name " +
    "email address phone number and password with client side validation"
  );
  assert(result.final_status === "success", "final status is success");
  console.log("");

  // ── Test 2: Trace order unchanged ──
  console.log("Test 2: Trace order unchanged");
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
    assert(idx >= pos, `"${exp}" appears at expected position`);
    if (idx >= 0) pos = idx + 1;
  }
  assert(!nodes.includes("bugfix"), "bugfix not in success path");
  console.log("");

  // ── Test 3: Implementation agent unchanged ──
  console.log("Test 3: Implementation agent unchanged");
  const implTrace = result.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace !== undefined, "implementation trace exists");
  assert(implTrace!.agent === "codex", "implementation agent remains codex");
  console.log("");

  // ── Test 4: No auto skill on implementation artifact ──
  console.log("Test 4: No auto skill on implementation artifact");
  const implArtifact = result.artifacts.find(
    (a) => a.node === "implementation" && a.type !== "fanout_result"
  );
  assert(implArtifact !== undefined, "implementation artifact exists");
  assert(implArtifact!.content["skill"] === null, "skill is null (not auto-inferred)");
  const implSV = implArtifact!.content["skill_validation"] as Record<string, unknown> | null;
  assert(implSV !== null, "skill_validation exists");
  assert(implSV!["attempted"] === false, "skill_validation.attempted === false");
  assert(implSV!["valid"] === true, "no skill metadata is valid");
  assert((implSV!["reason"] as string).includes("No skill"), "reason mentions no skill");
  console.log("");

  // ── Test 5: No auto skill on code-review artifact ──
  console.log("Test 5: No auto skill on code-review artifact");
  const crArtifact = result.artifacts.find((a) => a.type === "code_review");
  assert(crArtifact !== undefined, "code_review artifact exists");
  assert(crArtifact!.content["skill"] === null, "code-review skill is null");
  const crSV = crArtifact!.content["skill_validation"] as Record<string, unknown> | null;
  assert(crSV !== null, "code-review skill_validation exists");
  assert(crSV!["attempted"] === false, "code-review skill_validation not attempted");
  console.log("");

  // ── Test 6: Fanout still succeeds ──
  console.log("Test 6: Fanout still succeeds");
  const fanoutResult = await run("sync inventory service with repo-A calls repo-B and integration event pipeline");
  assert(fanoutResult.final_status === "success", "fanout final status is success");
  assert(fanoutResult.fanout_results !== undefined, "fanout_results exists");
  const fanoutArtifact = fanoutResult.artifacts.find((a) => a.type === "fanout_result");
  assert(fanoutArtifact !== undefined, "fanout_result artifact is surfaced");
  console.log("");

  // ── Test 7: Capability metadata confirms auto annotation disabled ──
  console.log("Test 7: Capability metadata confirms auto annotation disabled");
  assert(skillsCaps["runtime_auto_skill_annotation"] === "disabled", "auto annotation is disabled");
  assert(skillsCaps["skill_metadata_explicit_only"] === true, "skill metadata is explicit-only");
  assert(skillsCaps["affects_runtime_routing"] === false, "does not affect routing");
  assert(skillsCaps["affects_agent_selection"] === false, "does not affect agent selection");
  assert(skillsCaps["affects_execution_dispatch"] === false, "does not affect dispatch");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
