// Regression Test — Runtime Executor Injection
// ==============================================
// Verifies Runtime accepts executor overrides without changing default behavior.
// A fake implementation executor proves the LOOP can carry real work once stubs
// are replaced, while default executors keep the graph order unchanged.

import { run } from "../runtime";
import { NodeType } from "../sdlc_graph/types";
import { ExecutionContext } from "../core/execution-context";
import { buildExecutionContext } from "../core/context-builder";
import { createArtifact, Artifact } from "../core/artifact";
import { buildImplementationExecutorInput } from "../core/runtime-executors";

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

  console.log("Runtime Executor Injection Test\n");

  const testEnv: Record<string, string | undefined> = {};

  // ── Test 0: buildImplementationExecutorInput ──
  console.log("Test 0: Implementation executor input builder");
  const summary = {
    requirement_id: "REQ-BUILDER",
    multi_repo: false,
    main_repo: "main",
    sub_requirements: [],
    parsed_at: new Date().toISOString(),
  };
  const designOutput = { node: "tech-design", result: "design_completed" };
  const reviewOutput = { node: "review", result: "PASS" };
  const ctx = buildExecutionContext("implementation", { requirement: "build login" }, { requirementId: "REQ-BUILDER", complexity: "medium" });

  const input0 = buildImplementationExecutorInput(
    {
      raw_text: "build login",
      requirement_id: "REQ-BUILDER",
      execution_mode: "direct",
      "requirement-summary": summary,
      "tech-design": designOutput,
      "review": reviewOutput,
    },
    ctx
  );
  assert(input0.requirement === "build login", "requirement from context");
  assert(input0.requirementId === "REQ-BUILDER", "requirementId from context");
  assert(input0.summary === summary, "summary from context");
  assert(input0.designOutput === designOutput, "designOutput from context");
  assert(input0.reviewOutput === reviewOutput, "reviewOutput from context");
  assert(input0.complexity === "medium", "complexity from execCtx");
  assert(input0.executionMode === "direct", "executionMode from context");

  // Fallback: when raw_text / requirement_id are missing, read from execCtx
  const input0Fallback = buildImplementationExecutorInput(
    {
      "requirement-summary": summary,
      "tech-design": designOutput,
      "review": reviewOutput,
    },
    ctx
  );
  assert(input0Fallback.requirement === "build login", "fallback requirement from execCtx");
  assert(input0Fallback.requirementId === "REQ-BUILDER", "fallback requirementId from execCtx");
  assert(input0Fallback.executionMode === "direct", "default executionMode is direct");
  console.log("");

  // ── Test 1: Inline implementation output ──
  console.log("Test 1: Inline implementation executor output");
  const executionId1 = "test-executor-injection-001";
  const fakeImplementationOutput = {
    node: "implementation",
    mode: "direct",
    result: "fake_implementation_completed",
    fake_generated_code: "function fake() { return true; }",
  };

  const fakeImplementationExecutor = async (
    _context: Record<string, unknown>,
    _execCtx: ExecutionContext
  ) => fakeImplementationOutput;

  const result1 = await run("build a user login form with email validation", {
    env: testEnv,
    executionId: executionId1,
    executors: {
      implementation: fakeImplementationExecutor as any,
    },
  });

  assert(result1.final_status === "success", "runtime completes with success");
  assert(result1.graph_status === "completed", "graph_status is completed");
  assert(result1.graph_replay_trace.executionId === executionId1, "explicit executionId is used");

  const expectedOrder: NodeType[] = [
    "requirement-summary",
    "tech-design",
    "review",
    "implementation",
    "validation",
  ];

  // Observability trace node order (regression compatibility)
  const observabilityNodes1 = result1.execution_trace.map((t) => t.node);
  let posObs = 0;
  for (const exp of expectedOrder) {
    const idx = observabilityNodes1.indexOf(exp, posObs);
    assert(idx >= posObs, `observability trace: "${exp}" appears at expected position`);
    if (idx >= 0) posObs = idx + 1;
  }

  // Canonical trace node order
  const canonicalNodes1 = result1.graph_replay_trace.events.map((e) => e.node);
  let posCanonical = 0;
  for (const exp of expectedOrder) {
    const idx = canonicalNodes1.indexOf(exp, posCanonical);
    assert(idx >= posCanonical, `canonical trace: "${exp}" appears at expected position`);
    if (idx >= 0) posCanonical = idx + 1;
  }

  const requirementText = "build a user login form with email validation";

  // Canonical input safety: must include requirement_id, must not leak raw requirement
  for (const event of result1.graph_replay_trace.events) {
    assert(
      event.input["requirement_id"] === result1.requirement_id,
      `canonical event ${event.node} input.requirement_id matches result requirement_id`
    );
    assert(
      !("requirement" in event.input),
      `canonical event ${event.node} input does not contain requirement property`
    );
    assert(
      !JSON.stringify(event.input).includes(requirementText),
      `canonical event ${event.node} input string does not contain raw requirement`
    );
  }

  // Explicit coverage for disabled solution-challenge skipped event
  const skippedChallengeEvent = result1.graph_replay_trace.events.find(
    (e) => e.node === "solution-challenge" && e.kind === "node_skipped"
  );
  assert(skippedChallengeEvent !== undefined, "disabled solution-challenge skipped event exists in canonical trace");
  assert(skippedChallengeEvent!.kind === "node_skipped", "skipped solution-challenge event kind is node_skipped");
  assert(
    skippedChallengeEvent!.skipReason === "solution_challenge_disabled",
    "skipped solution-challenge event skipReason is solution_challenge_disabled"
  );
  assert(
    skippedChallengeEvent!.input["requirement_id"] === result1.requirement_id,
    "skipped solution-challenge event input.requirement_id matches result requirement_id"
  );
  assert(
    !("requirement" in skippedChallengeEvent!.input),
    "skipped solution-challenge event input does not contain requirement property"
  );
  assert(
    !JSON.stringify(skippedChallengeEvent!.input).includes(requirementText),
    "skipped solution-challenge event input string does not contain raw requirement"
  );

  const implTrace1 = result1.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace1 !== undefined, "execution trace includes implementation");
  assert(
    implTrace1!.output["result"] === "fake_implementation_completed",
    "implementation output comes from fake executor"
  );

  const canonicalImpl1 = result1.graph_replay_trace.events.find((e) => e.node === "implementation");
  assert(canonicalImpl1 !== undefined, "canonical trace includes implementation event");
  assert(
    canonicalImpl1!.output["result"] === "fake_implementation_completed",
    "canonical implementation event contains fake executor output"
  );
  assert(
    canonicalImpl1!.output["fake_generated_code"] === "function fake() { return true; }",
    "canonical implementation event preserves fake executor output fields"
  );

  for (let i = 0; i < result1.graph_replay_trace.events.length; i++) {
    const event = result1.graph_replay_trace.events[i];
    assert(event.sequence === i + 1, `canonical event ${i} sequence is ${i + 1}`);
    assert(event.eventId === `${executionId1}:${i + 1}`, `canonical event ${i} eventId is stable`);
  }

  const implArtifact1 = result1.artifacts.find(
    (a) => a.node === "implementation" && a.type !== "fanout_result"
  );
  assert(implArtifact1 !== undefined, "implementation artifact exists");
  assert(
    implArtifact1!.content["result"] === "fake_implementation_completed",
    "implementation artifact content comes from fake executor"
  );
  assert(
    implArtifact1!.content["skill"] === undefined || implArtifact1!.content["skill"] === null,
    "no skill inferred for implementation artifact"
  );
  console.log("");

  // ── Test 2: Artifact passthrough from executor ──
  console.log("Test 2: Artifact passthrough from executor");
  const fakeArtifact: Artifact = createArtifact({
    id: "fake-artifact-1",
    requirementId: "REQ-FAKE",
    node: "implementation",
    type: "code_patch",
    content: {
      file: "src/fake.ts",
      patch: "export const fake = true;",
    },
    agent: "codex",
    source: "execution_gateway",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  const artifactPassthroughExecutor = async (
    _context: Record<string, unknown>,
    _execCtx: ExecutionContext
  ) => ({
    node: "implementation",
    mode: "direct",
    result: "fake_artifact_passthrough_completed",
    artifacts: [fakeArtifact],
  });

  const result2 = await run("build a fake feature", {
    env: testEnv,
    executors: {
      implementation: artifactPassthroughExecutor as any,
    },
  });

  assert(result2.final_status === "success", "runtime completes with artifact passthrough");

  const implTrace2 = result2.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace2 !== undefined, "execution trace includes implementation");
  assert(
    implTrace2!.output["result"] === "fake_artifact_passthrough_completed",
    "artifact passthrough result is recorded in trace"
  );

  const passedArtifact = result2.artifacts.find((a) => a.id === "fake-artifact-1");
  assert(passedArtifact !== undefined, "fake artifact appears in result.artifacts");
  assert(passedArtifact!.type === "code_patch", "fake artifact type is preserved");
  assert(
    passedArtifact!.content["file"] === "src/fake.ts",
    "fake artifact content is preserved"
  );
  assert(
    passedArtifact!.content["patch"] === "export const fake = true;",
    "fake artifact patch is preserved"
  );
  assert(
    passedArtifact!.metadata.source === "execution_gateway",
    "fake artifact source is preserved"
  );
  assert(
    passedArtifact!.metadata.agent === "codex",
    "fake artifact agent is preserved"
  );

  assert(testEnv.SDLC_EXECUTION_MODE !== "codex", "SDLC_EXECUTION_MODE is not codex");
  assert(testEnv.SDLC_KIMI_GATEWAY_REAL_DISPATCH !== "enabled", "Kimi real dispatch flag not enabled");
  assert(testEnv.SDLC_HERMES_GATEWAY_REAL_DISPATCH !== "enabled", "Hermes real dispatch flag not enabled");

  const validationTrace2 = result2.execution_trace.find((t) => t.node === "validation");
  assert(validationTrace2 !== undefined, "validation trace exists after artifact passthrough");
  assert(validationTrace2!.output["result"] === "validated", "validation passes when implementation has artifacts");
  assert(validationTrace2!.output["all_checks_passed"] === true, "validation all_checks_passed is true");

  const validationArtifact2 = result2.artifacts.find((a) => a.node === "validation" && a.type === "validation_report");
  assert(validationArtifact2 !== undefined, "validation artifact exists");
  assert(validationArtifact2!.content["all_checks_passed"] === true, "validation artifact records all_checks_passed true");
  assert(result2.feedback.review_summary.validationPassed === true, "feedback reflects validation passed");

  console.log("");

  // ── Test 3: Empty implementation fails validation ──
  console.log("Test 3: Empty implementation fails validation");
  const emptyImplementationExecutor = async (
    _context: Record<string, unknown>,
    _execCtx: ExecutionContext
  ) => ({
    node: "implementation",
    mode: "direct",
    result: "empty",
  });

  const result3 = await run("build nothing", {
    env: testEnv,
    executors: {
      implementation: emptyImplementationExecutor as any,
    },
  });

  // Current semantics: final_status reflects fanout completion only.
  // Validation failure is advisory feedback in the shadow-first Runtime;
  // it is intentionally exposed through feedback and artifacts, not final_status.
  assert(result3.final_status === "success", "runtime completes despite validation failure");
  assert(result3.graph_status === "completed", "graph_status is completed after validation failure");

  const canonicalEvents3 = result3.graph_replay_trace.events;
  const lastCanonical3 = canonicalEvents3[canonicalEvents3.length - 1];
  assert(lastCanonical3 !== undefined, "canonical trace has a last event");
  assert(lastCanonical3.node === "validation", "canonical last event is validation");
  assert(lastCanonical3.kind === "node_executed", "canonical last event kind is node_executed");

  const implTrace3 = result3.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace3 !== undefined, "execution trace includes empty implementation");
  assert(implTrace3!.output["result"] === "empty", "empty implementation result recorded");

  const validationTrace3 = result3.execution_trace.find((t) => t.node === "validation");
  assert(validationTrace3 !== undefined, "validation trace exists after empty implementation");
  assert(validationTrace3!.output["result"] === "FAIL", "validation fails when implementation has no product");
  assert(validationTrace3!.output["all_checks_passed"] === false, "validation all_checks_passed is false");

  const validationArtifact3 = result3.artifacts.find((a) => a.node === "validation" && a.type === "validation_report");
  assert(validationArtifact3 !== undefined, "validation artifact exists for empty implementation");
  assert(validationArtifact3!.content["all_checks_passed"] === false, "validation artifact records all_checks_passed false");
  assert(result3.feedback.review_summary.validationPassed === false, "feedback reflects validation failed");

  console.log("");

  // ── Test 4: Design-aware fake implementation executor ──
  console.log("Test 4: Design-aware fake implementation executor");
  const designAwareExecutor = async (
    context: Record<string, unknown>,
    execCtx: ExecutionContext
  ) => {
    const input = buildImplementationExecutorInput(context, execCtx);
    const design = input.designOutput as Record<string, unknown> | undefined;
    const designBody = design?.["design"] as Record<string, unknown> | undefined;
    const approach = (designBody?.["approach"] as string | undefined) ?? "unknown";
    const components = Array.isArray(designBody?.["components"])
      ? (designBody["components"] as unknown[])
      : [];

    const patch = [
      `// Design-aware implementation for ${input.requirementId}`,
      `// Approach: ${approach}`,
      `// Components: ${components.join(",")}`,
      "export function designAwareImplementation() {",
      "  return true;",
      "}",
    ].join("\n");

    return {
      node: "implementation",
      mode: "direct",
      result: "fake_design_aware_implementation_completed",
      code: patch,
      artifacts: [
        createArtifact({
          id: `${input.requirementId}:implementation:code_patch:design-aware`,
          requirementId: input.requirementId,
          node: "implementation",
          type: "code_patch",
          content: {
            file: "src/design-aware.ts",
            patch,
          },
          agent: "codex",
          source: "execution_gateway",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    };
  };

  const result4 = await run("build a user login page with database storage", {
    env: testEnv,
    executors: {
      implementation: designAwareExecutor as any,
    },
  });

  assert(result4.final_status === "success", "design-aware runtime completes with success");

  const implTrace4 = result4.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace4 !== undefined, "execution trace includes design-aware implementation");
  assert(
    implTrace4!.output["result"] === "fake_design_aware_implementation_completed",
    "design-aware implementation result recorded"
  );

  const designAwareArtifact = result4.artifacts.find((a) => a.id.includes("design-aware"));
  assert(designAwareArtifact !== undefined, "design-aware code_patch artifact exists");
  assert(designAwareArtifact!.type === "code_patch", "design-aware artifact is code_patch");

  const patch4 = designAwareArtifact!.content["patch"] as string;
  assert(
    patch4.includes("single_service") || patch4.includes("multi_repo_fanout"),
    "patch includes design approach"
  );
  assert(
    patch4.includes("ui_form") || patch4.includes("data_store") || patch4.includes("service"),
    "patch includes a design component"
  );

  assert(result4.feedback.review_summary.codeReviewStatus === "PASS", "design-aware code review passes");
  assert(result4.feedback.review_summary.validationPassed === true, "design-aware validation passes");

  assert(testEnv.SDLC_EXECUTION_MODE !== "codex", "SDLC_EXECUTION_MODE is not codex");
  assert(testEnv.SDLC_KIMI_GATEWAY_REAL_DISPATCH !== "enabled", "Kimi real dispatch flag not enabled");
  assert(testEnv.SDLC_HERMES_GATEWAY_REAL_DISPATCH !== "enabled", "Hermes real dispatch flag not enabled");

  console.log("");

  // ── Test 5: executionId validation ──
  console.log("Test 5: executionId validation");
  let emptyRejected = false;
  try {
    await run("build nothing", { executionId: "" });
  } catch (e) {
    emptyRejected = true;
  }
  assert(emptyRejected, "empty executionId is rejected");

  let whitespaceRejected = false;
  try {
    await run("build nothing", { executionId: "   \t\n  " });
  } catch (e) {
    whitespaceRejected = true;
  }
  assert(whitespaceRejected, "whitespace-only executionId is rejected");

  console.log("");
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
