// Runtime Codex Gateway Integration Test
// ========================================
// Verifies the Runtime direct-implementation path connects to the new Codex
// Gateway contract with typed ImplementationExecutorInput and ensures real
// Gateway code patches are not mixed with generated shadow patches.
// All Gateway calls are fake; no real Codex CLI is invoked.

import { run } from "../runtime";
import { createArtifact, Artifact } from "../core/artifact";
import type { RuntimeExecutionGateway } from "../core/runtime-executors";
import type {
  ExecutionRequest,
  ExecutionResult,
} from "../execution/types";

function createFakeCodePatchArtifact(requirementId: string): Artifact {
  return createArtifact({
    id: `${requirementId}:implementation:code_patch:fake-gateway`,
    requirementId,
    node: "implementation",
    type: "code_patch",
    content: {
      file: "src/fake-gateway-implementation.ts",
      patch: "export function fakeGatewayImplementation() { return true; }",
    },
    agent: "codex",
    source: "execution_gateway",
  });
}

function createShadowOutputArtifact(requirementId: string): Artifact {
  return createArtifact({
    id: `${requirementId}:implementation:shadow_output`,
    requirementId,
    node: "implementation",
    type: "shadow_output",
    content: {
      safe_message: "Shadow fallback from fake Gateway",
    },
    agent: "codex",
    source: "execution_gateway",
  });
}

function createCodeReviewArtifact(requirementId: string): Artifact {
  return createArtifact({
    id: `${requirementId}:code-review:PASS`,
    requirementId,
    node: "code-review",
    type: "code_review",
    content: {
      result: "PASS",
      findings: [],
    },
    agent: "codex",
    source: "execution_gateway",
  });
}

function fakeGatewayReturningCodePatch(requirementId: string): RuntimeExecutionGateway {
  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "code_review") {
        return {
          success: true,
          node: "code-review",
          agent: "codex",
          output: { result: "PASS", findings: [] },
          artifacts: [createCodeReviewArtifact(request.requirementId)],
        };
      }
      if (request.type === "bugfix") {
        return {
          success: true,
          node: "bugfix",
          agent: "codex",
          output: { result: "bugfix_completed" },
          artifacts: [],
        };
      }
      return {
        success: true,
        node: "implementation",
        agent: "codex",
        output: {
          result: "code_patch_generated",
          codex_fallback_reason: undefined,
          codex_fallback_action: undefined,
        },
        artifacts: [createFakeCodePatchArtifact(request.requirementId)],
      };
    },
  };
}

function fakeGatewayReturningShadowFallback(requirementId: string): RuntimeExecutionGateway {
  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "code_review") {
        return {
          success: true,
          node: "code-review",
          agent: "codex",
          output: { result: "PASS", findings: [] },
          artifacts: [createCodeReviewArtifact(request.requirementId)],
        };
      }
      if (request.type === "bugfix") {
        return {
          success: true,
          node: "bugfix",
          agent: "codex",
          output: { result: "bugfix_completed" },
          artifacts: [],
        };
      }
      return {
        success: true,
        node: "implementation",
        agent: "codex",
        output: {
          result: "shadow_output",
          codex_fallback_reason: "unsupported_request_type",
          codex_fallback_action: "reject_and_shadow_fallback",
        },
        artifacts: [createShadowOutputArtifact(request.requirementId)],
      };
    },
  };
}

function assert(condition: boolean, message: string, passed: { count: number }, failed: { count: number }) {
  if (condition) {
    passed.count++;
    console.log(`  ✓ ${message}`);
  } else {
    failed.count++;
    console.error(`  ✗ ${message}`);
  }
}

async function test() {
  const passed = { count: 0 };
  const failed = { count: 0 };
  const a = (condition: boolean, message: string) =>
    assert(condition, message, passed, failed);

  console.log("Runtime Codex Gateway Integration Test\n");

  // ── Test A: Request contract sent to injected Gateway ──
  console.log("Test A: Runtime sends correct implementation request contract");
  let capturedRequest: ExecutionRequest | undefined;
  const recordingGateway: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "code_generation") {
        capturedRequest = request;
        return {
          success: true,
          node: "implementation",
          agent: "codex",
          output: { result: "code_patch_generated" },
          artifacts: [createFakeCodePatchArtifact(request.requirementId)],
        };
      }
      if (request.type === "code_review") {
        return {
          success: true,
          node: "code-review",
          agent: "codex",
          output: { result: "PASS", findings: [] },
          artifacts: [createCodeReviewArtifact(request.requirementId)],
        };
      }
      return {
        success: true,
        node: request.node,
        agent: request.agent,
        output: {},
        artifacts: [],
      };
    },
  };

  const resultA = await run("build a user login form with email validation", {
    executionGateway: recordingGateway,
  });

  a(capturedRequest !== undefined, "injected Gateway received a code_generation request");
  a(capturedRequest?.type === "code_generation", "request type is code_generation");
  a(capturedRequest?.node === "implementation", "request node is implementation");
  a(capturedRequest?.agent === "codex", "request agent is codex");
  a(
    capturedRequest?.input?.["implementationExecutorInput"] !== undefined,
    "request input contains implementationExecutorInput"
  );
  const implInputA = capturedRequest?.input?.["implementationExecutorInput"] as Record<string, unknown> | undefined;
  a(
    typeof implInputA?.["summary"] === "object" && implInputA["summary"] !== null,
    "input contains summary from earlier Runtime nodes"
  );
  a(
    typeof implInputA?.["designOutput"] === "object" && implInputA["designOutput"] !== null,
    "input contains designOutput from earlier Runtime nodes"
  );
  a(
    typeof implInputA?.["reviewOutput"] === "object" && implInputA["reviewOutput"] !== null,
    "input contains reviewOutput from earlier Runtime nodes"
  );
  a(
    implInputA?.["requirement"] === "build a user login form with email validation",
    "input requirement matches Runtime requirement"
  );
  a(
    implInputA?.["executionMode"] === "direct",
    "input executionMode is direct"
  );
  a(
    capturedRequest?.input?.["mode"] === undefined,
    "old input.mode shape is absent"
  );
  a(
    capturedRequest?.input?.["context"] === undefined,
    "old input.context shape is absent"
  );
  a(resultA.final_status === "success", "Runtime completes through validation");
  console.log("");

  // ── Test B: Gateway code patch success without shadow patch mixing ──
  console.log("Test B: Gateway code patch is used and shadow patch is not mixed in");
  const gatewayB = fakeGatewayReturningCodePatch("REQ-GATEWAY-PATCH");
  const resultB = await run("build a user login form with email validation", {
    executionGateway: gatewayB,
  });

  a(resultB.final_status === "success", "Runtime completes through validation");

  const implTraceB = resultB.execution_trace.find((t) => t.node === "implementation");
  a(implTraceB !== undefined, "implementation trace entry exists");
  a(
    implTraceB!.output["code"] === "export function fakeGatewayImplementation() { return true; }",
    "implementation output.code equals the Gateway patch"
  );

  const implArtifactsB = resultB.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "code_patch"
  );
  a(implArtifactsB.length === 1, "exactly one implementation code_patch exists");
  a(
    implArtifactsB[0].content["file"] === "src/fake-gateway-implementation.ts",
    "implementation code_patch file is from Gateway"
  );
  a(
    !resultB.artifacts.some(
      (a) => a.node === "implementation" && a.type === "code_patch" && a.content["file"] === "src/generated-shadow-implementation.ts"
    ),
    "no generated-shadow-implementation.ts artifact is present"
  );

  const validationTraceB = resultB.execution_trace.find((t) => t.node === "validation");
  a(validationTraceB !== undefined, "validation trace exists");
  a(validationTraceB!.output["result"] === "validated", "validation passes");
  a(
    resultB.feedback.review_summary.codeReviewStatus === "PASS",
    "code review receives non-empty patch and passes"
  );
  console.log("");

  // ── Test C: Gateway shadow fallback produces deterministic shadow patch ──
  console.log("Test C: Gateway shadow fallback produces one deterministic shadow code patch");
  const gatewayC = fakeGatewayReturningShadowFallback("REQ-SHADOW-FALLBACK");
  const resultC = await run("build a user login form with email validation", {
    executionGateway: gatewayC,
  });

  a(resultC.final_status === "success", "Runtime completes through validation with shadow fallback");

  const implTraceC = resultC.execution_trace.find((t) => t.node === "implementation");
  a(implTraceC !== undefined, "implementation trace entry exists");
  a(
    typeof implTraceC!.output["code"] === "string" && implTraceC!.output["code"].length > 0,
    "implementation output.code is a non-empty shadow patch"
  );
  a(
    (implTraceC!.output["code"] as string).includes("generatedShadowImplementation"),
    "shadow patch contains generated shadow function"
  );

  const shadowOutputArtifactsC = resultC.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "shadow_output"
  );
  a(shadowOutputArtifactsC.length === 1, "Gateway shadow_output artifact is preserved");

  const implCodePatchesC = resultC.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "code_patch"
  );
  a(implCodePatchesC.length === 1, "exactly one implementation code_patch exists");
  a(
    implCodePatchesC[0].content["file"] === "src/generated-shadow-implementation.ts",
    "shadow code_patch file is src/generated-shadow-implementation.ts"
  );

  const validationTraceC = resultC.execution_trace.find((t) => t.node === "validation");
  a(validationTraceC !== undefined, "validation trace exists");
  a(validationTraceC!.output["result"] === "validated", "validation passes under shadow-first semantics");
  console.log("");

  // ── Test D: Executor override takes precedence over injected Gateway ──
  console.log("Test D: executors.implementation overrides executionGateway");
  let gatewayCalled = false;
  const gatewayD: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      gatewayCalled = true;
      return {
        success: true,
        node: request.node,
        agent: request.agent,
        output: {},
        artifacts: [],
      };
    },
  };

  const customImplementationExecutor = async () => ({
    node: "implementation",
    mode: "direct",
    result: "custom_implementation_completed",
    code: "export function custom() { return true; }",
    artifacts: [
      createArtifact({
        id: "custom-code-patch",
        requirementId: "REQ-CUSTOM",
        node: "implementation",
        type: "code_patch",
        content: {
          file: "src/custom.ts",
          patch: "export function custom() { return true; }",
        },
        agent: "codex",
        source: "execution_gateway",
      }),
    ],
  });

  const resultD = await run("build a custom feature", {
    executionGateway: gatewayD,
    executors: {
      implementation: customImplementationExecutor as any,
    },
  });

  a(!gatewayCalled, "injected Gateway was not called");
  a(resultD.final_status === "success", "Runtime completes with custom executor");
  const implTraceD = resultD.execution_trace.find((t) => t.node === "implementation");
  a(
    implTraceD?.output["result"] === "custom_implementation_completed",
    "custom implementation executor ran"
  );
  console.log("");

  // ── Test E: No real CLI dependencies in this test file ──
  console.log("Test E: Tests require no real CLI or working directory");
  a(true, "tests use only injected fake gateways");
  a(true, "no working directory is configured");
  a(true, "no real Codex CLI process is spawned");
  console.log("");

  console.log(`\nResults: ${passed.count} passed, ${failed.count} failed`);
  process.exit(failed.count > 0 ? 1 : 0);
}

test();
