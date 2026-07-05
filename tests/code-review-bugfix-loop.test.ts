// Regression Test — Code Review + Bugfix Loop (Failure Path)
// ===========================================================
// Verifies the bounded review/fix loop when code-review fails.
// Uses force_review_fail marker to trigger failure without real Codex.
// All agent calls are simulated — no real execution.

import { runCodeReviewBugfixLoop } from "../runtime";
import { createArtifact } from "../core/artifact";

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

  console.log("Code Review + Bugfix Loop Test\n");

  // ── Test 1: Default pass path (no force_review_fail) ──
  console.log("Test 1: Default pass path");
  const passArtifacts = [
    createArtifact({
      requirementId: "REQ-PASS",
      node: "implementation",
      type: "code_patch",
      content: { patch: "# test patch" },
      agent: "codex",
      source: "execution_gateway",
      id: "REQ-PASS:implementation:code_patch:0",
    }),
  ];

  const passResult = await runCodeReviewBugfixLoop({
    requirementId: "REQ-PASS",
    artifacts: passArtifacts,
    agent: "codex",
  });

  assert(passResult.finalReviewStatus === "PASS", "default path returns PASS");
  assert(passResult.artifacts.length === 1, "pass path has 1 artifact (code_review)");
  assert(passResult.artifacts[0].type === "code_review", "artifact is code_review");
  assert(passResult.artifacts[0].content["status"] === "PASS", "code_review status is PASS");
  assert(passResult.traceEntries.length === 1, "pass path has 1 trace entry (code-review)");
  assert(passResult.traceEntries[0].node === "code-review", "trace entry is code-review");
  assert(!passResult.traceEntries.some((t) => t.node === "bugfix"), "no bugfix in pass path");
  console.log("");

  // ── Test 2: Failure path with force_review_fail marker ──
  console.log("Test 2: Failure path triggers bugfix loop");
  const failArtifacts = [
    createArtifact({
      requirementId: "REQ-FAIL",
      node: "implementation",
      type: "code_patch",
      content: {
        patch: "# buggy patch",
        force_review_fail: true,
      },
      agent: "codex",
      source: "execution_gateway",
      id: "REQ-FAIL:implementation:code_patch:0",
    }),
  ];

  const failResult = await runCodeReviewBugfixLoop({
    requirementId: "REQ-FAIL",
    artifacts: failArtifacts,
    agent: "codex",
  });

  // Code review should appear
  assert(
    failResult.traceEntries.some((t) => t.node === "code-review"),
    "trace includes code-review node"
  );

  // Bugfix should appear
  assert(
    failResult.traceEntries.some((t) => t.node === "bugfix"),
    "trace includes bugfix node"
  );

  // bugfix_patch artifact should exist
  const bugfixArtifact = failResult.artifacts.find((a) => a.type === "bugfix_patch");
  assert(bugfixArtifact !== undefined, "has bugfix_patch artifact");
  assert(bugfixArtifact!.content["attempt"] === 1, "bugfix attempt is 1 (first attempt)");
  assert(
    Array.isArray(bugfixArtifact!.content["findings"]),
    "bugfix has findings array"
  );
  assert(bugfixArtifact!.content["patch"] === "shadow bugfix patch", "bugfix patch is shadow");
  console.log("");

  // ── Test 3: Loop is bounded (exact retry counts) ──
  console.log("Test 3: Bounded retry loop (exact counts)");
  // With MAX_BUGFIX_ATTEMPTS=2 and always-failing artifacts:
  // review(0,FAIL) → bugfix(1) → review(1,FAIL) → bugfix(2) → review(2,FAIL) → exit
  const reviewCount = failResult.traceEntries.filter((t) => t.node === "code-review").length;
  const bugfixCount = failResult.traceEntries.filter((t) => t.node === "bugfix").length;
  assert(reviewCount === 3, `review count is exactly 3 (got ${reviewCount})`);
  assert(bugfixCount === 2, `bugfix count is exactly 2 (got ${bugfixCount})`);
  assert(failResult.finalReviewStatus === "FAIL", "exhausted loop returns FAIL");

  // Exact trace order: code-review → bugfix → code-review → bugfix → code-review
  const expectedOrder = ["code-review", "bugfix", "code-review", "bugfix", "code-review"];
  const actualOrder = failResult.traceEntries.map((t) => t.node);
  for (let i = 0; i < expectedOrder.length; i++) {
    assert(
      actualOrder[i] === expectedOrder[i],
      `trace[${i}] is "${actualOrder[i]}" (expected "${expectedOrder[i]}")`
    );
  }
  console.log("");

  // ── Test 4: Failure path artifacts include code_review and bugfix_patch ──
  console.log("Test 4: Failure path artifact types + unique IDs");
  const failTypes = failResult.artifacts.map((a) => a.type);
  assert(failTypes.includes("code_review"), "failure path has code_review artifact");
  assert(failTypes.includes("bugfix_patch"), "failure path has bugfix_patch artifact");
  // Verify all artifacts have valid ids
  assert(
    failResult.artifacts.every((a) => typeof a.id === "string" && a.id.length > 0),
    "all artifacts have valid ids"
  );
  // All artifact IDs must be unique
  const artifactIds = failResult.artifacts.map((a) => a.id);
  const uniqueIds = new Set(artifactIds);
  assert(
    uniqueIds.size === artifactIds.length,
    `all artifact IDs are unique (${uniqueIds.size} unique out of ${artifactIds.length})`
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
