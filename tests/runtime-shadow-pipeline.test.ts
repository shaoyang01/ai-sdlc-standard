// Regression Test — Shadow SDLC Pipeline
// =======================================
// Verifies the full shadow pipeline executes correctly.
// All agent calls are simulated — no real execution.

import { run } from "../runtime";

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

  console.log("SDLC Shadow Pipeline Test\n");

  // Test 1: run() completes without throwing
  console.log("Test 1: Pipeline completes");
  let result;
  try {
    result = await run("build order sync system across inventory service");
    assert(true, "run() completed without throwing");
  } catch (e) {
    assert(false, `run() threw: ${e}`);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  console.log("");

  // Test 2: result contains execution trace
  console.log("Test 2: Result structure");
  assert(typeof result.requirement_id === "string", "has requirement_id");
  assert(Array.isArray(result.execution_trace), "execution_trace is array");
  assert(result.execution_trace.length > 0, "trace has entries");
  console.log("");

  // Test 3: trace includes all 5 expected nodes IN ORDER
  console.log("Test 3: Node order");
  const nodes = result.execution_trace.map((t: { node: string }) => t.node);
  const expected = ["requirement-summary", "tech-design", "review", "implementation", "validation"];
  assert(nodes.length >= expected.length, `trace has at least ${expected.length} nodes (got ${nodes.length})`);

  // Verify expected order: each expected node appears in sequence
  let pos = 0;
  for (const exp of expected) {
    const idx = nodes.indexOf(exp, pos);
    assert(idx >= pos, `"${exp}" appears at or after position ${pos} (found at ${idx})`);
    if (idx >= 0) pos = idx + 1;
  }
  console.log("");

  // Test 4: final status === "success" for shadow baseline
  console.log("Test 4: Final status");
  assert(result.final_status === "success", `final_status is "${result.final_status}" (expected "success")`);
  console.log("");

  // Test 5: Artifacts collection
  console.log("Test 5: Artifacts");
  assert(Array.isArray(result.artifacts), "artifacts is array");
  assert(result.artifacts.length > 0, "artifacts are emitted");
  const artifactTypes = result.artifacts.map((a: { type: string }) => a.type);
  assert(artifactTypes.includes("requirement_summary"), "has requirement_summary artifact");
  assert(artifactTypes.includes("tech_design"), "has tech_design artifact");
  assert(artifactTypes.includes("solution_review"), "has solution_review artifact");
  assert(
    artifactTypes.includes("shadow_output") || artifactTypes.includes("implementation_plan"),
    "has implementation artifact"
  );
  assert(artifactTypes.includes("validation_report"), "has validation_report artifact");
  // Verify artifact ids exist
  assert(result.artifacts.every((a: { id: string }) => typeof a.id === "string"), "all artifacts have ids");
  console.log("");

  // Test 5c: Feedback analysis
  console.log("Test 5c: Feedback analysis");
  assert(result.feedback !== undefined, "feedback exists");
  assert(Array.isArray(result.feedback.agent_scores), "agent_scores is array");
  assert(result.feedback.agent_scores.length > 0, "agent_scores has entries");
  assert(Array.isArray(result.feedback.node_outcomes), "node_outcomes is array");
  assert(result.feedback.node_outcomes.length > 0, "node_outcomes has entries");
  assert(result.feedback.review_summary !== undefined, "review_summary exists");
  assert(result.feedback.review_summary.codeReviewStatus === "PASS", "code review PASS");
  assert(result.feedback.review_summary.bugfixAttempts === 0, "no bugfix attempts");
  assert(result.feedback.review_summary.validationPassed === true, "validation passed");
  assert(Array.isArray(result.feedback.policy_suggestions), "policy_suggestions is array");
  assert(result.feedback.policy_suggestions.length > 0, "policy_suggestions has entries");
  const preferAgent = result.feedback.policy_suggestions.find(
    (s: { type: string }) => s.type === "prefer_agent"
  );
  assert(preferAgent !== undefined, "has prefer_agent suggestion in default pass path");
  console.log("");

  // Test 5b: Code review trace and artifacts
  console.log("Test 5b: Code review in default pipeline");
  const traceNodes = result.execution_trace.map((t: { node: string }) => t.node);
  assert(traceNodes.includes("code-review"), "execution_trace includes code-review node");
  assert(!traceNodes.includes("bugfix"), "execution_trace does NOT include bugfix in default pass path");
  assert(artifactTypes.includes("code_review"), "has code_review artifact");
  const codeReviewArtifact = result.artifacts.find((a: { type: string }) => a.type === "code_review");
  assert(codeReviewArtifact !== undefined, "code_review artifact exists");
  assert(codeReviewArtifact!.content["status"] === "PASS", "default code review status is PASS");
  console.log("");

  // Test 6: Multi-repo fanout produces fanout_result artifact
  console.log("Test 6: Fanout artifact");
  const fanoutRun = await run("sync inventory service with repo-A calls repo-B and integration event pipeline");
  assert(Array.isArray(fanoutRun.artifacts), "fanout artifacts is array");
  const fanoutTypes = fanoutRun.artifacts.map((a: { type: string }) => a.type);
  assert(
    fanoutTypes.includes("fanout_result"),
    "has fanout_result artifact (fanout mode)"
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
