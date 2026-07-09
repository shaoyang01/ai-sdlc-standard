// Regression Test — Runtime Executor Injection
// ==============================================
// Verifies Runtime accepts executor overrides without changing default behavior.
// A fake implementation executor proves the LOOP can carry real work once stubs
// are replaced, while default executors keep the graph order unchanged.

import { run } from "../runtime";
import { NodeType } from "../sdlc_graph/types";
import { ExecutionContext } from "../core/execution-context";

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

  const testEnv: Record<string, string | undefined> = {};

  console.log("Test: Fake implementation executor injection");
  const result = await run("build a user login form with email validation", {
    env: testEnv,
    executors: {
      implementation: fakeImplementationExecutor as any,
    },
  });

  assert(result.final_status === "success", "runtime completes with success");

  const nodes = result.execution_trace.map((t) => t.node);
  const expectedOrder: NodeType[] = [
    "requirement-summary",
    "tech-design",
    "review",
    "implementation",
    "validation",
  ];
  let pos = 0;
  for (const exp of expectedOrder) {
    const idx = nodes.indexOf(exp, pos);
    assert(idx >= pos, `"${exp}" appears at expected position`);
    if (idx >= 0) pos = idx + 1;
  }

  const implTrace = result.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace !== undefined, "execution trace includes implementation");
  assert(
    implTrace!.output["result"] === "fake_implementation_completed",
    "implementation output comes from fake executor"
  );
  assert(
    implTrace!.output["fake_generated_code"] === "function fake() { return true; }",
    "fake executor output is preserved"
  );

  const implArtifact = result.artifacts.find(
    (a) => a.node === "implementation" && a.type !== "fanout_result"
  );
  assert(implArtifact !== undefined, "implementation artifact exists");
  assert(
    implArtifact!.content["result"] === "fake_implementation_completed",
    "implementation artifact content comes from fake executor"
  );
  assert(
    implArtifact!.content["skill"] === undefined || implArtifact!.content["skill"] === null,
    "no skill inferred for implementation artifact"
  );

  assert(testEnv.SDLC_EXECUTION_MODE !== "codex", "SDLC_EXECUTION_MODE is not codex");
  assert(testEnv.SDLC_KIMI_GATEWAY_REAL_DISPATCH !== "enabled", "Kimi real dispatch flag not enabled");
  assert(testEnv.SDLC_HERMES_GATEWAY_REAL_DISPATCH !== "enabled", "Hermes real dispatch flag not enabled");

  console.log("");
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
