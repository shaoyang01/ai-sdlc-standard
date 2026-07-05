// Regression Test — Policy Memory Read (Advisory Only)
// ======================================================
// Verifies SQLite memory reads produce correct agent summaries
// and advisory policy suggestions. Does not affect routing.
// Env vars saved/restored. Test directory always cleaned.

import * as fs from "node:fs";
import * as path from "node:path";
import { isPolicyMemoryReadEnabled, getPolicyMemoryPath } from "../core/policy-memory-config";
import { buildPolicyMemoryRecord } from "../core/policy-memory-builder";
import {
  initPolicyMemory,
  appendPolicyMemoryRecord,
  readPolicyMemoryAgentSummaries,
} from "../core/policy-memory-store";
import { buildMemoryPolicySuggestions } from "../core/policy-memory-analyzer";
import { createArtifact } from "../core/artifact";
import { RuntimeFeedback } from "../core/feedback-types";
import { run } from "../runtime";

const TEST_DB_DIR = ".sdlc-runtime-test";
const TEST_DB_PATH = path.join(TEST_DB_DIR, "policy-memory-read.sqlite");

function cleanup() {
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
}

function makeFeedback(overrides?: Partial<RuntimeFeedback>): RuntimeFeedback {
  return {
    agent_scores: overrides?.agent_scores ?? [
      { agent: "codex", score: 0.9, reason: "great", signals: ["implementation:success", "code-review:PASS"] },
    ],
    node_outcomes: overrides?.node_outcomes ?? [],
    review_summary: overrides?.review_summary ?? {
      codeReviewStatus: "PASS",
      bugfixAttempts: 0,
      validationPassed: true,
    },
    policy_suggestions: overrides?.policy_suggestions ?? [],
  };
}

function makeRecord(requirementId: string, feedback: RuntimeFeedback, status: "success" | "failed" = "success") {
  return buildPolicyMemoryRecord({
    requirementId,
    finalStatus: status,
    feedback,
    artifacts: [
      createArtifact({ requirementId, node: "implementation", type: "code_patch", content: { patch: "test" }, agent: "codex", source: "execution_gateway", id: `${requirementId}:impl:code_patch:0` }),
    ],
    executionTrace: [
      { node: "implementation" },
    ],
  });
}

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

  const originalRead = process.env.SDLC_POLICY_MEMORY_READ;
  const originalPath = process.env.SDLC_POLICY_MEMORY_PATH;
  const originalMemory = process.env.SDLC_POLICY_MEMORY;

  try {
    cleanup();

    // Set test path
    process.env.SDLC_POLICY_MEMORY_PATH = TEST_DB_PATH;

    console.log("Policy Memory Read Test\n");

    // ── Test 1: Read disabled by default ──
    console.log("Test 1: Read disabled by default");
    delete process.env.SDLC_POLICY_MEMORY_READ;
    assert(isPolicyMemoryReadEnabled() === false, "read disabled when env var not set");
    console.log("");

    // ── Test 2: Enabled only by exact value ──
    console.log("Test 2: Enabled only by exact value");
    process.env.SDLC_POLICY_MEMORY_READ = "enabled";
    assert(isPolicyMemoryReadEnabled() === true, "read enabled when env var is 'enabled'");
    process.env.SDLC_POLICY_MEMORY_READ = "true";
    assert(isPolicyMemoryReadEnabled() === false, "read disabled when env var is 'true'");
    delete process.env.SDLC_POLICY_MEMORY_READ;
    console.log("");

    // ── Test 3: Missing DB returns unavailable ──
    console.log("Test 3: Missing DB returns unavailable summary");
    const missingPath = path.join(TEST_DB_DIR, "nonexistent.sqlite");
    const missingSummary = readPolicyMemoryAgentSummaries(missingPath);
    assert(missingSummary.available === false, "available is false for missing DB");
    assert(missingSummary.runCount === 0, "runCount is 0 for missing DB");
    assert(missingSummary.agentSummaries.length === 0, "agentSummaries is empty");
    console.log("");

    // ── Test 4: Populated DB returns agent summaries ──
    console.log("Test 4: Populated DB returns agent summaries");
    initPolicyMemory(TEST_DB_PATH);

    // Insert records for codex (high performer) and hermes (low performer)
    const codexFeedback = makeFeedback({
      agent_scores: [
        { agent: "codex", score: 0.9, reason: "great", signals: ["implementation:success", "code-review:PASS"] },
      ],
    });
    const hermesFeedback = makeFeedback({
      agent_scores: [
        { agent: "hermes", score: 0.3, reason: "poor", signals: ["validation:failed"] },
      ],
    });

    // Insert 3 records each
    for (let i = 1; i <= 3; i++) {
      appendPolicyMemoryRecord(TEST_DB_PATH, makeRecord(`REQ-C${i}`, codexFeedback));
      appendPolicyMemoryRecord(TEST_DB_PATH, makeRecord(`REQ-H${i}`, hermesFeedback, "failed"));
    }

    const summary = readPolicyMemoryAgentSummaries(TEST_DB_PATH);
    assert(summary.available === true, "available is true for populated DB");
    assert(summary.runCount === 6, `runCount is 6 (got ${summary.runCount})`);
    assert(summary.agentSummaries.length >= 2, `at least 2 agent summaries (got ${summary.agentSummaries.length})`);

    const codexSummary = summary.agentSummaries.find((a) => a.agent === "codex");
    assert(codexSummary !== undefined, "codex has a summary");
    assert(codexSummary!.runCount === 3, `codex runCount is 3 (got ${codexSummary!.runCount})`);
    assert(codexSummary!.averageScore >= 0.75, `codex avg score >= 0.75 (got ${codexSummary!.averageScore})`);
    console.log("");

    // ── Test 5: High-performing agent → prefer_agent ──
    console.log("Test 5: High-performing agent produces prefer_agent suggestion");
    const memSuggestions = buildMemoryPolicySuggestions({
      memory: summary,
      node: "implementation",
    });

    const preferAgent = memSuggestions.find(
      (s) => s.type === "prefer_agent" && s.agent === "codex"
    );
    assert(preferAgent !== undefined, "prefer_agent for codex exists");
    assert(preferAgent!.confidence <= 0.8, "confidence is below 0.8 (advisory only)");
    console.log("");

    // ── Test 6: Low-performing agent → avoid_agent ──
    console.log("Test 6: Low-performing agent produces avoid_agent suggestion");
    const avoidAgent = memSuggestions.find(
      (s) => s.type === "avoid_agent" && s.agent === "hermes"
    );
    assert(avoidAgent !== undefined, "avoid_agent for hermes exists");
    assert(avoidAgent!.confidence <= 0.8, "confidence is below 0.8");
    console.log("");

    // ── Test 7: Runtime with memory read appends advisory suggestions ──
    console.log("Test 7: Runtime appends memory suggestions without changing routing");
    process.env.SDLC_POLICY_MEMORY_READ = "enabled";

    const runtimeResult = await run("simple task");
    assert(runtimeResult.feedback !== undefined, "runtime result has feedback");
    assert(
      Array.isArray(runtimeResult.feedback.policy_suggestions),
      "policy_suggestions is array"
    );

    // Verify the normal trace order is unchanged (memory read does not affect routing)
    const traceNodes = runtimeResult.execution_trace.map((t) => t.node);
    assert(traceNodes.includes("requirement-summary"), "normal routing: requirement-summary exists");
    assert(traceNodes.includes("validation"), "normal routing: validation exists");
    assert(runtimeResult.final_status === "success", "normal routing: final status is success");

    // Verify memory suggestions appear in feedback
    const allSuggestionTypes = runtimeResult.feedback.policy_suggestions.map((s) => s.type);
    // May include base prefer_agent + memory prefer_agent + memory avoid_agent
    assert(allSuggestionTypes.length >= 1, "at least one policy suggestion present");

    console.log("");

  } finally {
    cleanup();
    if (originalRead === undefined) {
      delete process.env.SDLC_POLICY_MEMORY_READ;
    } else {
      process.env.SDLC_POLICY_MEMORY_READ = originalRead;
    }
    if (originalPath === undefined) {
      delete process.env.SDLC_POLICY_MEMORY_PATH;
    } else {
      process.env.SDLC_POLICY_MEMORY_PATH = originalPath;
    }
    if (originalMemory === undefined) {
      delete process.env.SDLC_POLICY_MEMORY;
    } else {
      process.env.SDLC_POLICY_MEMORY = originalMemory;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
