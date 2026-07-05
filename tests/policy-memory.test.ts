// Regression Test — Policy Memory (SQLite, Opt-in, Summary-only)
// ===============================================================
// Verifies the policy memory store works correctly.
// Uses controlled temp path. Cleans up after test.
// Env vars saved/restored. Test directory always cleaned.
// No real agents. No Git. No file writes outside test path.

import * as fs from "node:fs";
import * as path from "node:path";
import { isPolicyMemoryEnabled, getPolicyMemoryPath } from "../core/policy-memory-config";
import { buildPolicyMemoryRecord } from "../core/policy-memory-builder";
import {
  initPolicyMemory,
  appendPolicyMemoryRecord,
  readPolicyMemorySummary,
} from "../core/policy-memory-store";
import { createArtifact } from "../core/artifact";
import { RuntimeFeedback } from "../core/feedback-types";

const TEST_DB_DIR = ".sdlc-runtime-test";
const TEST_DB_PATH = path.join(TEST_DB_DIR, "policy-memory.sqlite");

function cleanup() {
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
}

function makeFeedback(overrides?: Partial<RuntimeFeedback>): RuntimeFeedback {
  return {
    agent_scores: overrides?.agent_scores ?? [
      { agent: "codex", score: 0.8, reason: "good", signals: ["implementation:success", "code-review:PASS"] },
      { agent: "kimi", score: 1.0, reason: "great", signals: ["requirement-summary:success", "tech-design:success"] },
    ],
    node_outcomes: overrides?.node_outcomes ?? [
      { node: "implementation", agent: "codex", status: "success", signal: "positive", reason: "ok" },
    ],
    review_summary: overrides?.review_summary ?? {
      codeReviewStatus: "PASS",
      bugfixAttempts: 0,
      validationPassed: true,
    },
    policy_suggestions: overrides?.policy_suggestions ?? [
      { type: "prefer_agent", node: "implementation", agent: "codex", reason: "passed review", confidence: 0.7 },
    ],
  };
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

  // Save original env values
  const originalMemory = process.env.SDLC_POLICY_MEMORY;
  const originalMemoryPath = process.env.SDLC_POLICY_MEMORY_PATH;

  try {
    // Cleanup before test
    cleanup();

    console.log("Policy Memory Test\n");

    // ── Test 1: Disabled by default ──
    console.log("Test 1: Disabled by default");
    delete process.env.SDLC_POLICY_MEMORY;
    assert(isPolicyMemoryEnabled() === false, "disabled when env var not set");
    process.env.SDLC_POLICY_MEMORY = "";
    assert(isPolicyMemoryEnabled() === false, "disabled when env var is empty");
    process.env.SDLC_POLICY_MEMORY = "true";
    assert(isPolicyMemoryEnabled() === false, "disabled when env var is 'true' (not 'enabled')");
    process.env.SDLC_POLICY_MEMORY = "1";
    assert(isPolicyMemoryEnabled() === false, "disabled when env var is '1'");
    console.log("");

    // ── Test 2: Enabled only by exact value ──
    console.log("Test 2: Enabled only by exact value");
    process.env.SDLC_POLICY_MEMORY = "enabled";
    assert(isPolicyMemoryEnabled() === true, "enabled when env var is 'enabled'");
    delete process.env.SDLC_POLICY_MEMORY;
    console.log("");

    // ── Test 3: Default path ──
    console.log("Test 3: Default path");
    assert(getPolicyMemoryPath() === ".sdlc-runtime/policy-memory.sqlite", "default path is .sdlc-runtime/policy-memory.sqlite");
    console.log("");

    // ── Test 4: Init creates tables ──
    console.log("Test 4: Init creates SQLite tables");
    // Set custom path for test isolation
    process.env.SDLC_POLICY_MEMORY_PATH = TEST_DB_PATH;
    process.env.SDLC_POLICY_MEMORY = "enabled";
    initPolicyMemory(TEST_DB_PATH);
    const emptySummary = readPolicyMemorySummary(TEST_DB_PATH);
    assert(emptySummary.runCount === 0, "runCount is 0 after init");
    assert(emptySummary.agentScoreCount === 0, "agentScoreCount is 0 after init");
    assert(emptySummary.policySuggestionCount === 0, "suggestionCount is 0 after init");
    console.log("");

    // ── Test 5: Record builder stores summaries only ──
    console.log("Test 5: Record builder stores summaries only");
    const testArtifacts = [
      createArtifact({ requirementId: "REQ-T1", node: "implementation", type: "code_patch", content: { patch: "secret code" }, agent: "codex", source: "execution_gateway", id: "REQ-T1:impl:code_patch:0" }),
      createArtifact({ requirementId: "REQ-T1", node: "code-review", type: "code_review", content: { status: "PASS", findings: [] }, agent: "codex", source: "execution_gateway", id: "REQ-T1:cr:code_review:0" }),
    ];
    const testTrace = [
      { node: "implementation", agent: "codex", status: "success" as const, output: { result: "secret output" } },
      { node: "code-review", agent: "codex", status: "success" as const, output: { result: "PASS" } },
    ];
    const testFeedback = makeFeedback();

    const record = buildPolicyMemoryRecord({
      requirementId: "REQ-T1",
      finalStatus: "success",
      feedback: testFeedback,
      artifacts: testArtifacts,
      executionTrace: testTrace,
    });

    assert(typeof record.runId === "string", "record has runId");
    assert(record.artifactTypes.length === 2, "artifactTypes has 2 entries");
    assert(record.artifactTypes.includes("code_patch"), "artifactTypes includes code_patch");
    assert(record.artifactTypes.includes("code_review"), "artifactTypes includes code_review");
    assert(record.traceNodes.length === 2, "traceNodes has 2 entries");
    assert(record.traceNodes.includes("implementation"), "traceNodes includes implementation");
    // Verify no full artifact content or trace output in record
    assert(!("content" in (record as Record<string, unknown>)), "record does not have raw content field");
    console.log("");

    // ── Test 6: Append stores run, scores, and suggestions ──
    console.log("Test 6: Append stores run, scores, and suggestions");
    appendPolicyMemoryRecord(TEST_DB_PATH, record);
    const summary1 = readPolicyMemorySummary(TEST_DB_PATH);
    assert(summary1.runCount === 1, `runCount is 1 after append (got ${summary1.runCount})`);
    assert(summary1.agentScoreCount === 2, `agentScoreCount is 2 (got ${summary1.agentScoreCount})`);
    assert(summary1.policySuggestionCount === 1, `suggestionCount is 1 (got ${summary1.policySuggestionCount})`);
    console.log("");

    // ── Test 7: Append-only / idempotent ──
    console.log("Test 7: Append-only idempotent behavior");
    // Append second record with different runId
    const record2 = buildPolicyMemoryRecord({
      requirementId: "REQ-T2",
      finalStatus: "failed",
      feedback: makeFeedback({
        agent_scores: [{ agent: "hermes", score: 0.3, reason: "bad", signals: ["validation:failed"] }],
        review_summary: { codeReviewStatus: "FAIL", bugfixAttempts: 2, validationPassed: false },
        policy_suggestions: [
          { type: "retry_with_agent", node: "implementation", agent: "kimi", reason: "failed", confidence: 0.5 },
          { type: "manual_review", node: "implementation", reason: "bugfix needed", confidence: 0.6 },
        ],
      }),
      artifacts: [],
      executionTrace: [],
    });
    appendPolicyMemoryRecord(TEST_DB_PATH, record2);
    const summary2 = readPolicyMemorySummary(TEST_DB_PATH);
    assert(summary2.runCount === 2, `runCount is 2 after second append (got ${summary2.runCount})`);
    assert(summary2.agentScoreCount === 3, `agentScoreCount is 3 (2 + 1) (got ${summary2.agentScoreCount})`);
    assert(summary2.policySuggestionCount === 3, `suggestionCount is 3 (1 + 2) (got ${summary2.policySuggestionCount})`);
    console.log("");

  } finally {
    // Always cleanup test directory and restore env vars
    cleanup();
    if (originalMemory === undefined) {
      delete process.env.SDLC_POLICY_MEMORY;
    } else {
      process.env.SDLC_POLICY_MEMORY = originalMemory;
    }
    if (originalMemoryPath === undefined) {
      delete process.env.SDLC_POLICY_MEMORY_PATH;
    } else {
      process.env.SDLC_POLICY_MEMORY_PATH = originalMemoryPath;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
