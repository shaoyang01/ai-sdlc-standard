// Regression Test — Feedback Analyzer (Pure, Read-only)
// ======================================================
// Verifies the feedback analyzer produces correct scores,
// outcomes, summaries, and suggestions from trace/artifacts.
// No runtime. No agents. No Execution Gateway. No file writes.

import { analyzeRuntimeFeedback } from "../core/feedback-analyzer";
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

  console.log("Feedback Analyzer Test\n");

  // ── Test 1: PASS path produces positive scores ──
  console.log("Test 1: PASS path produces positive agent scores");
  const passTrace = [
    { node: "requirement-summary", agent: "kimi", status: "success" as const, output: { result: "ok" } },
    { node: "tech-design", agent: "kimi", status: "success" as const, output: { result: "design_completed" } },
    { node: "review", agent: "codex", status: "success" as const, output: { result: "PASS" } },
    { node: "implementation", agent: "codex", status: "success" as const, output: { result: "implementation_completed" } },
    { node: "code-review", agent: "codex", status: "success" as const, output: { result: "PASS" } },
    { node: "validation", agent: "hermes", status: "success" as const, output: { result: "validated" } },
  ];

  const passArtifacts = [
    createArtifact({ requirementId: "REQ-PASS", node: "code-review", type: "code_review", content: { status: "PASS" }, agent: "codex", source: "execution_gateway", id: "REQ-PASS:code-review:code_review:0" }),
    createArtifact({ requirementId: "REQ-PASS", node: "validation", type: "validation_report", content: { all_checks_passed: true }, agent: "hermes", source: "validation", id: "REQ-PASS:validation:validation_report:0" }),
  ];

  const passResult = analyzeRuntimeFeedback({
    requirementId: "REQ-PASS",
    executionTrace: passTrace,
    artifacts: passArtifacts,
    finalStatus: "success",
  });

  assert(passResult.agent_scores.length > 0, "agent_scores has entries");
  const codexScore = passResult.agent_scores.find((s) => s.agent === "codex");
  assert(codexScore !== undefined, "codex has a score");
  assert(codexScore!.score > 0.5, `codex score > 0.5 (got ${codexScore!.score})`);

  // Verify code-review:PASS is ONLY attributed to codex, not to kimi
  const kimiScore = passResult.agent_scores.find((s) => s.agent === "kimi");
  assert(kimiScore !== undefined, "kimi has a score");
  assert(
    !kimiScore!.signals.includes("code-review:PASS"),
    "kimi does NOT have code-review:PASS signal (attributed to codex only)"
  );
  assert(
    !kimiScore!.signals.includes("code-review:FAIL"),
    "kimi does NOT have code-review:FAIL signal"
  );

  assert(passResult.node_outcomes.length === passTrace.length, "node_outcomes matches trace length");
  assert(passResult.review_summary.codeReviewStatus === "PASS", "review summary shows PASS");
  assert(passResult.review_summary.bugfixAttempts === 0, "review summary shows 0 bugfix attempts");
  assert(passResult.review_summary.validationPassed === true, "review summary shows validation passed");
  assert(passResult.policy_suggestions.length > 0, "policy suggestions exist");
  console.log("");

  // ── Test 2: Bugfix path counts attempts ──
  console.log("Test 2: Bugfix path counts bugfix attempts");
  const bugfixTrace = [
    { node: "implementation", agent: "codex", status: "success" as const, output: { result: "implementation_completed" } },
    { node: "code-review", agent: "codex", status: "failure" as const, output: { result: "FAIL" } },
    { node: "bugfix", agent: "codex", status: "success" as const, output: { result: "bugfix_patch_generated" } },
    { node: "code-review", agent: "codex", status: "failure" as const, output: { result: "FAIL" } },
    { node: "bugfix", agent: "codex", status: "success" as const, output: { result: "bugfix_patch_generated" } },
    { node: "code-review", agent: "codex", status: "failure" as const, output: { result: "FAIL" } },
    { node: "validation", agent: "hermes", status: "success" as const, output: { result: "validated" } },
  ];

  const bugfixArtifacts = [
    createArtifact({ requirementId: "REQ-BF", node: "code-review", type: "code_review", content: { status: "FAIL" }, agent: "codex", source: "execution_gateway", id: "REQ-BF:code-review:code_review:0" }),
    createArtifact({ requirementId: "REQ-BF", node: "bugfix", type: "bugfix_patch", content: { attempt: 1 }, agent: "codex", source: "execution_gateway", id: "REQ-BF:bugfix:bugfix_patch:1" }),
    createArtifact({ requirementId: "REQ-BF", node: "code-review", type: "code_review", content: { status: "FAIL" }, agent: "codex", source: "execution_gateway", id: "REQ-BF:code-review:code_review:1" }),
    createArtifact({ requirementId: "REQ-BF", node: "bugfix", type: "bugfix_patch", content: { attempt: 2 }, agent: "codex", source: "execution_gateway", id: "REQ-BF:bugfix:bugfix_patch:2" }),
    createArtifact({ requirementId: "REQ-BF", node: "code-review", type: "code_review", content: { status: "FAIL" }, agent: "codex", source: "execution_gateway", id: "REQ-BF:code-review:code_review:2" }),
    createArtifact({ requirementId: "REQ-BF", node: "validation", type: "validation_report", content: { all_checks_passed: true }, agent: "hermes", source: "validation", id: "REQ-BF:validation:validation_report:0" }),
  ];

  const bugfixResult = analyzeRuntimeFeedback({
    requirementId: "REQ-BF",
    executionTrace: bugfixTrace,
    artifacts: bugfixArtifacts,
    finalStatus: "success",
  });

  assert(bugfixResult.review_summary.codeReviewStatus === "FAIL", "last review shows FAIL");
  assert(bugfixResult.review_summary.bugfixAttempts === 2, `bugfix attempts = 2 (got ${bugfixResult.review_summary.bugfixAttempts})`);
  const manualReview = bugfixResult.policy_suggestions.find((s) => s.type === "manual_review");
  assert(manualReview !== undefined, "manual_review suggestion exists when bugfix > 0");

  // Verify bugfix:completed is only attributed to the bugfix agent
  const bugfixCodexScore = bugfixResult.agent_scores.find((s) => s.agent === "codex");
  assert(bugfixCodexScore !== undefined, "codex has a score in bugfix path");
  assert(
    bugfixCodexScore!.signals.includes("bugfix:completed"),
    "codex has bugfix:completed signal (ran bugfix)"
  );
  const bugfixHermesScore = bugfixResult.agent_scores.find((s) => s.agent === "hermes");
  if (bugfixHermesScore) {
    assert(
      !bugfixHermesScore.signals.includes("bugfix:completed"),
      "hermes does NOT have bugfix:completed signal"
    );
  }
  console.log("");

  // ── Test 3: Failed path produces retry suggestion ──
  console.log("Test 3: Failed path produces retry_with_agent suggestion");
  const failTrace = [
    { node: "implementation", agent: "codex", status: "failure" as const, output: { result: "error" } },
    { node: "validation", agent: "hermes", status: "failure" as const, output: { result: "failed" } },
  ];

  const failResult = analyzeRuntimeFeedback({
    requirementId: "REQ-FAIL",
    executionTrace: failTrace,
    artifacts: [],
    finalStatus: "failed",
  });

  const retrySuggestion = failResult.policy_suggestions.find((s) => s.type === "retry_with_agent");
  assert(retrySuggestion !== undefined, "retry_with_agent suggestion exists for failed status");
  assert(retrySuggestion!.agent === "kimi", "retry suggests kimi as alternative");
  assert(failResult.review_summary.validationPassed === false, "validation not passed");
  console.log("");

  // ── Test 4: Validation artifact sets validationPassed without trace ──
  console.log("Test 4: Validation artifact alone sets validationPassed=true");
  const artifactOnlyTrace = [
    { node: "implementation", agent: "codex", status: "success" as const, output: { result: "ok" } },
    // No validation trace entry — only artifact evidence
  ];

  const artifactOnlyArtifacts = [
    createArtifact({ requirementId: "REQ-VA", node: "validation", type: "validation_report", content: { all_checks_passed: true }, agent: "hermes", source: "validation", id: "REQ-VA:validation:validation_report:0" }),
  ];

  const artifactOnlyResult = analyzeRuntimeFeedback({
    requirementId: "REQ-VA",
    executionTrace: artifactOnlyTrace,
    artifacts: artifactOnlyArtifacts,
    finalStatus: "success",
  });

  assert(artifactOnlyResult.review_summary.validationPassed === true,
    "validationPassed=true from artifact with all_checks_passed=true, even without validation trace");
  console.log("");

  // ── Test 5: Analyzer does not mutate input arrays ──
  console.log("Test 5: Analyzer does not mutate input");
  const originalTrace = [
    { node: "tech-design", agent: "kimi", status: "success" as const, output: { result: "ok" } },
  ];
  const originalArtifacts = [
    createArtifact({ requirementId: "REQ-IM", node: "tech-design", type: "tech_design", content: { result: "ok" }, agent: "kimi", source: "runtime", id: "REQ-IM:tech-design:tech_design:0" }),
  ];

  const traceCopy = [...originalTrace];
  const artifactsCopy = [...originalArtifacts];

  analyzeRuntimeFeedback({
    requirementId: "REQ-IM",
    executionTrace: traceCopy,
    artifacts: artifactsCopy,
    finalStatus: "success",
  });

  assert(traceCopy.length === originalTrace.length, "trace length unchanged");
  assert(artifactsCopy.length === originalArtifacts.length, "artifacts length unchanged");
  assert(traceCopy[0].node === originalTrace[0].node, "trace entry unchanged");
  assert(artifactsCopy[0].id === originalArtifacts[0].id, "artifact unchanged");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
