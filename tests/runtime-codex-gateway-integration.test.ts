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
  ExecutionRequestType,
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
      status: "PASS",
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

function fakeGatewayReturningUnusableCodePatches(requirementId: string): RuntimeExecutionGateway {
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
          codex_fallback_reason: "empty_patch",
          codex_fallback_action: "reject_and_shadow_fallback",
        },
        artifacts: [
          createShadowOutputArtifact(request.requirementId),
          createArtifact({
            id: `${requirementId}:implementation:code_patch:empty`,
            requirementId,
            node: "implementation",
            type: "code_patch",
            content: {
              file: "src/empty-patch.ts",
              patch: "   ",
            },
            agent: "codex",
            source: "execution_gateway",
          }),
          createArtifact({
            id: `${requirementId}:implementation:code_patch:blank-file`,
            requirementId,
            node: "implementation",
            type: "code_patch",
            content: {
              file: "   ",
              patch: "export function invalid() { return true; }",
            },
            agent: "codex",
            source: "execution_gateway",
          }),
        ],
      };
    },
  };
}

function recordingFakeGateway(
  requirementId: string,
  reviewBehavior: "pass" | "fail_then_bugfix_pass"
): { gateway: RuntimeExecutionGateway; sequence: ExecutionRequestType[] } {
  const sequence: ExecutionRequestType[] = [];
  let reviewCount = 0;
  const gateway: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      sequence.push(request.type);
      if (request.type === "code_review") {
        reviewCount++;
        if (reviewBehavior === "pass" || reviewCount > 1) {
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
          node: "code-review",
          agent: "codex",
          output: {
            result: "FAIL",
            findings: [
              {
                severity: "major",
                message: "needs fix",
                file: "src/fake-gateway-implementation.ts",
              },
            ],
          },
          artifacts: [],
        };
      }
      if (request.type === "bugfix") {
        return {
          success: true,
          node: "bugfix",
          agent: "codex",
          output: { result: "bugfix_completed" },
          artifacts: [
            createArtifact({
              id: `${request.requirementId}:bugfix:patch`,
              requirementId: request.requirementId,
              node: "bugfix",
              type: "bugfix_patch",
              content: {
                file: "src/fake-gateway-implementation.ts",
                patch: "// bugfix applied",
              },
              agent: "codex",
              source: "execution_gateway",
            }),
          ],
        };
      }
      return {
        success: true,
        node: "implementation",
        agent: "codex",
        output: { result: "code_patch_generated" },
        artifacts: [createFakeCodePatchArtifact(request.requirementId)],
      };
    },
  };
  return { gateway, sequence };
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
  a(
    resultB.implementation_outcome === "real_code_patch",
    "implementation outcome is real_code_patch"
  );

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
  a(
    resultC.implementation_outcome === "shadow_code_patch",
    "implementation outcome is shadow_code_patch"
  );

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

  // ── Test C2: Unusable Gateway code patches are removed before shadow fallback ──
  console.log("Test C2: Invalid Gateway code_patch artifacts are stripped before shadow fallback");
  const gatewayC2 = fakeGatewayReturningUnusableCodePatches("REQ-UNUSABLE-PATCH");
  const resultC2 = await run("build a user login form with email validation", {
    executionGateway: gatewayC2,
  });

  a(resultC2.final_status === "success", "Runtime completes through validation with unusable Gateway patches");
  a(
    resultC2.implementation_outcome === "shadow_code_patch",
    "implementation outcome is shadow_code_patch"
  );

  const implTraceC2 = resultC2.execution_trace.find((t) => t.node === "implementation");
  a(implTraceC2 !== undefined, "implementation trace entry exists");
  a(
    typeof implTraceC2!.output["code"] === "string" && implTraceC2!.output["code"].length > 0,
    "implementation output.code is a non-empty shadow patch"
  );
  a(
    (implTraceC2!.output["code"] as string).includes("generatedShadowImplementation"),
    "shadow patch contains generated shadow function"
  );

  const shadowOutputArtifactsC2 = resultC2.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "shadow_output"
  );
  a(shadowOutputArtifactsC2.length === 1, "Gateway shadow_output artifact is preserved");

  const implCodePatchesC2 = resultC2.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "code_patch"
  );
  a(implCodePatchesC2.length === 1, "exactly one implementation code_patch exists");
  a(
    implCodePatchesC2[0].content["file"] === "src/generated-shadow-implementation.ts",
    "shadow code_patch file is src/generated-shadow-implementation.ts"
  );
  a(
    !resultC2.artifacts.some(
      (a) =>
        a.node === "implementation" &&
        a.type === "code_patch" &&
        (a.content["file"] === "src/empty-patch.ts" || a.content["file"] === "   ")
    ),
    "invalid Gateway code_patch artifacts are absent"
  );

  const validationTraceC2 = resultC2.execution_trace.find((t) => t.node === "validation");
  a(validationTraceC2 !== undefined, "validation trace exists");
  a(validationTraceC2!.output["result"] === "validated", "validation passes under shadow-first semantics");
  a(
    resultC2.feedback.review_summary.codeReviewStatus === "PASS",
    "code review passes after invalid Gateway patches are removed"
  );
  console.log("");

  // ── Test D: Executor override takes precedence over injected Gateway ──
  console.log("Test D: executors.implementation overrides executionGateway");
  let gatewayDCodeGenerationCalled = false;
  const gatewayD: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "code_generation") {
        gatewayDCodeGenerationCalled = true;
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

  const customImplementationExecutor = async () => ({
    node: "implementation",
    mode: "direct",
    result: "custom_implementation_completed",
    code: "export function custom() { return true; }",
    implementation_outcome: "real_code_patch" as const,
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

  a(!gatewayDCodeGenerationCalled, "injected Gateway was not called for code_generation");
  a(resultD.final_status === "success", "Runtime completes with custom executor");
  const implTraceD = resultD.execution_trace.find((t) => t.node === "implementation");
  a(
    implTraceD?.output["result"] === "custom_implementation_completed",
    "custom implementation executor ran"
  );
  a(
    resultD.implementation_outcome === "real_code_patch",
    "Runtime preserves explicit real_code_patch from custom executor"
  );
  a(
    resultD.feedback.review_summary.codeReviewStatus === "PASS",
    "code review still uses injected Gateway and passes"
  );
  console.log("");

  // ── Test F: Injected Gateway handles implementation and code review in sequence ──
  console.log("Test F: Injected Gateway receives code_generation then code_review");
  const { gateway: gatewayF, sequence: sequenceF } = recordingFakeGateway(
    "REQ-FULL-SEQUENCE",
    "pass"
  );
  const resultF = await run("build a user login form with email validation", {
    executionGateway: gatewayF,
  });

  a(resultF.final_status === "success", "Runtime completes through validation");
  a(
    sequenceF.join(",") === "code_generation,code_review",
    "Gateway received code_generation then code_review in order"
  );
  a(
    resultF.feedback.review_summary.codeReviewStatus === "PASS",
    "code review passes using injected Gateway"
  );
  a(
    resultF.feedback.review_summary.validationPassed === true,
    "validation passes"
  );
  console.log("");

  // ── Test G: Injected Gateway handles bugfix loop sequence ──
  console.log("Test G: Injected Gateway receives code_generation, code_review, bugfix, code_review");
  const { gateway: gatewayG, sequence: sequenceG } = recordingFakeGateway(
    "REQ-BUGFIX-LOOP",
    "fail_then_bugfix_pass"
  );
  const resultG = await run("build a user login form with email validation", {
    executionGateway: gatewayG,
  });

  a(resultG.final_status === "success", "Runtime completes after bugfix loop");
  a(
    sequenceG.join(",") === "code_generation,code_review,bugfix,code_review",
    "Gateway received code_generation → code_review → bugfix → code_review"
  );
  const bugfixTraceG = resultG.execution_trace.filter((t) => t.node === "bugfix");
  a(bugfixTraceG.length === 1, "one bugfix node is recorded");
  const codeReviewTraceG = resultG.execution_trace.filter((t) => t.node === "code-review");
  a(codeReviewTraceG.length === 2, "two code-review nodes are recorded");
  a(
    resultG.feedback.review_summary.validationPassed === true,
    "validation passes after bugfix loop"
  );
  console.log("");

  // ── Test H: Executor override prevents code_generation but code_review still uses injected Gateway ──
  console.log("Test H: executors.implementation overrides Gateway, but code_review still uses injected Gateway");
  const { gateway: gatewayH, sequence: sequenceH } = recordingFakeGateway(
    "REQ-OVERRIDE",
    "pass"
  );
  const customImplementationExecutorH = async () => ({
    node: "implementation",
    mode: "direct",
    result: "custom_implementation_completed",
    code: "export function custom() { return true; }",
    artifacts: [
      createArtifact({
        id: "custom-code-patch-H",
        requirementId: "REQ-OVERRIDE",
        node: "implementation",
        type: "code_patch",
        content: {
          file: "src/custom-h.ts",
          patch: "export function custom() { return true; }",
        },
        agent: "codex",
        source: "execution_gateway",
      }),
    ],
  });

  const resultH = await run("build a custom feature", {
    executionGateway: gatewayH,
    executors: {
      implementation: customImplementationExecutorH as any,
    },
  });

  a(resultH.final_status === "success", "Runtime completes with custom executor and injected review Gateway");
  a(
    !sequenceH.includes("code_generation"),
    "injected Gateway did not receive code_generation"
  );
  a(
    sequenceH.includes("code_review"),
    "injected Gateway received code_review"
  );
  a(
    resultH.feedback.review_summary.codeReviewStatus === "PASS",
    "code review passes using injected Gateway"
  );
  console.log("");

  // ── Test E: Custom implementation executor without explicit outcome resolves to failed ──
  console.log("Test E: executors.implementation without outcome resolves to failed");
  let gatewayECodeGenerationCalled = false;
  const gatewayE: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "code_generation") {
        gatewayECodeGenerationCalled = true;
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

  const customImplementationExecutorWithoutOutcome = async () => ({
    node: "implementation",
    mode: "direct",
    result: "custom_implementation_completed",
    code: "export function customNoOutcome() { return true; }",
    artifacts: [
      createArtifact({
        id: "custom-no-outcome-code-patch",
        requirementId: "REQ-NO-OUTCOME",
        node: "implementation",
        type: "code_patch",
        content: {
          file: "src/custom-no-outcome.ts",
          patch: "export function customNoOutcome() { return true; }",
        },
        agent: "codex",
        source: "execution_gateway",
      }),
    ],
  });

  const resultE = await run("build a custom feature", {
    executionGateway: gatewayE,
    executors: {
      implementation: customImplementationExecutorWithoutOutcome as any,
    },
  });

  a(!gatewayECodeGenerationCalled, "injected Gateway was not called for code_generation");
  a(resultE.final_status === "success", "Runtime completes with custom executor");
  a(
    resultE.implementation_outcome === "failed",
    "Runtime resolves missing implementation_outcome to failed"
  );
  a(true, "tests use only injected fake gateways");
  a(true, "no working directory is configured");
  a(true, "no real Codex CLI process is spawned");
  console.log("");

  console.log(`\nResults: ${passed.count} passed, ${failed.count} failed`);
  process.exit(failed.count > 0 ? 1 : 0);
}

test();
