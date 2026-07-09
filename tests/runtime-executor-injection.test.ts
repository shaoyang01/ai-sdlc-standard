// Regression Test — Runtime Executor Injection
// ==============================================
// Verifies Runtime accepts executor overrides without changing default behavior.
// A fake implementation executor proves the LOOP can carry real work once stubs
// are replaced, while default executors keep the graph order unchanged.

import { run } from "../runtime";
import { NodeType } from "../sdlc_graph/types";
import { ExecutionContext } from "../core/execution-context";
import { createArtifact, Artifact } from "../core/artifact";

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

  console.log("");
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
