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
    executors: {
      implementation: fakeImplementationExecutor as any,
    },
  });

  assert(result1.final_status === "success", "runtime completes with success");

  const nodes1 = result1.execution_trace.map((t) => t.node);
  const expectedOrder: NodeType[] = [
    "requirement-summary",
    "tech-design",
    "review",
    "implementation",
    "validation",
  ];
  let pos = 0;
  for (const exp of expectedOrder) {
    const idx = nodes1.indexOf(exp, pos);
    assert(idx >= pos, `"${exp}" appears at expected position`);
    if (idx >= 0) pos = idx + 1;
  }

  const implTrace1 = result1.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace1 !== undefined, "execution trace includes implementation");
  assert(
    implTrace1!.output["result"] === "fake_implementation_completed",
    "implementation output comes from fake executor"
  );

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

  assert(result3.final_status === "success", "runtime completes despite validation failure");

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
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
