// Runtime Kimi Requirement Summary Test
// ======================================
// Verifies that requirement-summary can optionally route to the Kimi Gateway
// real-dispatch capability while preserving deterministic fallback.
// All Gateway calls are fake; no real Kimi or Codex CLI is invoked.

import { run } from "../runtime";
import { ExecutionGateway } from "../execution/gateway";
import { createArtifact, Artifact } from "../core/artifact";
import type { RuntimeExecutionGateway } from "../core/runtime-executors";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { KimiCliProcessRunner, KimiCliProcessResult } from "../execution/kimi-cli-command-executor";

function createCodeReviewArtifact(requirementId: string, attempt = 0): Artifact {
  return createArtifact({
    id: `${requirementId}:code-review:PASS:${attempt}`,
    requirementId,
    node: "code-review",
    type: "code_review",
    content: { status: "PASS", findings: [] },
    agent: "codex",
    source: "execution_gateway",
  });
}

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

function fakeGatewayForValidKimiSummary(
  requirementId: string,
  summary: { multi_repo: boolean; sub_requirements: { repo: string; task: string }[] }
): RuntimeExecutionGateway {
  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "llm_task" && request.node === "requirement-summary") {
        return {
          success: true,
          node: "requirement-summary",
          agent: "kimi",
          output: {
            result: "kimi_executed_success",
            summary: JSON.stringify({
              requirement_id: request.requirementId,
              multi_repo: summary.multi_repo,
              main_repo: "main",
              sub_requirements: summary.sub_requirements,
            }),
          },
          artifacts: [],
        };
      }
      if (request.type === "code_generation") {
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
  const a = (condition: boolean, message: string) => assert(condition, message, passed, failed);

  console.log("Runtime Kimi Requirement Summary Test\n");

  // ── Test A: default remains deterministic ──
  console.log("Test A: default requirement-summary remains deterministic");
  let llmTaskCalledA = false;
  const gatewayA: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "llm_task") {
        llmTaskCalledA = true;
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

  const resultA = await run("build a simple login form", {
    executionGateway: gatewayA,
  });

  a(!llmTaskCalledA, "Gateway received no llm_task request in default mode");
  const reqSummaryTraceA = resultA.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceA?.output["execution_source"] === "deterministic", "execution_source is deterministic");
  a(resultA.final_status === "success", "Runtime completes successfully");
  console.log("");

  // ── Test B: valid Kimi single-repository summary ──
  console.log("Test B: valid Kimi summary is used and Runtime reaches Codex implementation");
  const requirementIdB = "REQ-KIMI-SINGLE";
  const gatewayB = fakeGatewayForValidKimiSummary(requirementIdB, {
    multi_repo: false,
    sub_requirements: [],
  });
  let capturedRequirementB: ExecutionRequest | undefined;
  const recordingGatewayB: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "llm_task" && request.node === "requirement-summary") {
        capturedRequirementB = request;
      }
      return gatewayB.execute(request);
    },
  };

  const resultB = await run("build a simple login form", {
    executionGateway: recordingGatewayB,
    requirementSummaryMode: "kimi_gateway",
  });

  a(capturedRequirementB !== undefined, "Gateway received a requirement-summary llm_task request");
  a(capturedRequirementB?.type === "llm_task", "request type is llm_task");
  a(capturedRequirementB?.node === "requirement-summary", "node is requirement-summary");
  a(capturedRequirementB?.agent === "kimi", "agent is kimi");
  a(
    capturedRequirementB?.input?.["expected_output"] === "requirement_summary",
    "expected_output is requirement_summary"
  );
  a(resultB.final_status === "success", "Runtime completes successfully");
  const reqSummaryTraceB = resultB.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceB?.output["execution_source"] === "kimi_real", "execution_source is kimi_real");
  a(reqSummaryTraceB?.output["multi_repo"] === false, "Kimi multi_repo false is preserved");
  const implTraceB = resultB.execution_trace.find((t) => t.node === "implementation");
  a(implTraceB !== undefined, "Runtime reached implementation");
  const implCodePatchB = resultB.artifacts.find(
    (a) => a.node === "implementation" && a.type === "code_patch"
  );
  a(
    implCodePatchB?.content["file"] === "src/fake-gateway-implementation.ts",
    "Codex implementation used the fake Gateway patch"
  );
  console.log("");

  // ── Test C: valid multi-repository Kimi summary routes to fanout ──
  console.log("Test C: valid multi-repo Kimi summary routes to fanout");
  const gatewayC = fakeGatewayForValidKimiSummary("REQ-KIMI-MULTI", {
    multi_repo: true,
    sub_requirements: [
      { repo: "repo-auth", task: "implement auth service" },
      { repo: "repo-ui", task: "implement login ui" },
    ],
  });

  const resultC = await run("build a login system with auth service and login ui", {
    executionGateway: gatewayC,
    requirementSummaryMode: "kimi_gateway",
  });

  a(resultC.final_status === "success", "Runtime completes successfully");
  const reqSummaryTraceC = resultC.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceC?.output["execution_source"] === "kimi_real", "execution_source is kimi_real");
  a(reqSummaryTraceC?.output["multi_repo"] === true, "Kimi multi_repo true is preserved");
  const implTraceC = resultC.execution_trace.find((t) => t.node === "implementation");
  a(implTraceC?.output["mode"] === "fanout", "implementation mode is fanout");
  const fanoutArtifactC = resultC.artifacts.find((a) => a.type === "fanout_result");
  a(fanoutArtifactC !== undefined, "fanout_result artifact exists");
  console.log("");

  // ── Test D: malformed Kimi output falls back to deterministic ──
  console.log("Test D: malformed Kimi output falls back to deterministic summary");
  const malformedOutputs = [
    JSON.stringify({ requirement_id: "WRONG-ID", multi_repo: false, main_repo: "main", sub_requirements: [] }),
    JSON.stringify({ multi_repo: false, main_repo: "main", sub_requirements: [] }),
    JSON.stringify({ requirement_id: "REQ-KIMI-MALFORMED", multi_repo: true, main_repo: "main", sub_requirements: [] }),
    JSON.stringify({ requirement_id: "REQ-KIMI-MALFORMED", multi_repo: false, main_repo: "main", sub_requirements: [{ repo: "", task: "task" }] }),
    "not valid json",
  ];

  for (const malformed of malformedOutputs) {
    const gatewayD: RuntimeExecutionGateway = {
      async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        if (request.type === "llm_task" && request.node === "requirement-summary") {
          return {
            success: true,
            node: "requirement-summary",
            agent: "kimi",
            output: { result: "kimi_executed_success", summary: malformed },
            artifacts: [],
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

    const resultD = await run("build a simple login form", {
      executionGateway: gatewayD,
      requirementSummaryMode: "kimi_gateway",
    });

    a(resultD.final_status === "success", "Runtime completes after malformed Kimi fallback");
    const reqSummaryTraceD = resultD.execution_trace.find((t) => t.node === "requirement-summary");
    a(
      reqSummaryTraceD?.output["execution_source"] === "kimi_fallback",
      `execution_source is kimi_fallback for malformed output: ${malformed.slice(0, 40)}`
    );
  }
  console.log("");

  // ── Test E: Gateway shadow fallback falls back to deterministic ──
  console.log("Test E: Gateway shadow_output falls back to deterministic summary");
  const gatewayE: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "llm_task" && request.node === "requirement-summary") {
        return {
          success: true,
          node: "requirement-summary",
          agent: "kimi",
          output: { result: "requirement-summary_by_kimi" },
          artifacts: [
            createArtifact({
              id: `${request.requirementId}:requirement-summary:shadow_output`,
              requirementId: request.requirementId,
              node: "requirement-summary",
              type: "shadow_output",
              content: { safe_message: "Kimi shadow fallback" },
              agent: "kimi",
              source: "execution_gateway",
            }),
          ],
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

  const resultE = await run("build a simple login form", {
    executionGateway: gatewayE,
    requirementSummaryMode: "kimi_gateway",
  });

  a(resultE.final_status === "success", "Runtime completes after shadow fallback");
  const reqSummaryTraceE = resultE.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceE?.output["execution_source"] === "kimi_fallback", "execution_source is kimi_fallback");
  console.log("");

  // ── Test F: Gateway exception falls back without exposing raw error ──
  console.log("Test F: Gateway exception falls back to deterministic summary");
  const gatewayF: RuntimeExecutionGateway = {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.type === "llm_task" && request.node === "requirement-summary") {
        throw new Error("raw error containing token api_key password private_key");
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

  const resultF = await run("build a simple login form", {
    executionGateway: gatewayF,
    requirementSummaryMode: "kimi_gateway",
  });

  a(resultF.final_status === "success", "Runtime completes after Gateway exception");
  const reqSummaryTraceF = resultF.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceF?.output["execution_source"] === "kimi_fallback", "execution_source is kimi_fallback");
  a(
    !JSON.stringify(reqSummaryTraceF?.output).includes("api_key"),
    "raw error text is not exposed in requirement-summary output"
  );
  console.log("");

  // ── Test G: End-to-end through ExecutionGateway with fake Kimi process runner ──
  console.log("Test G: fake process runner end-to-end through ExecutionGateway");

  function buildValidKimiJson(requirementId: string): string {
    return JSON.stringify({
      requirement_id: requirementId,
      multi_repo: false,
      main_repo: "main",
      sub_requirements: [],
    });
  }

  const envG = {
    SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled",
    SDLC_KIMI_GATEWAY_INTEGRATION: "enabled",
    SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled",
    SDLC_KIMI_CLI_ADAPTER: "enabled",
    SDLC_KIMI_CLI_COMMAND: "kimi",
  };

  // G1: prompt propagation and valid structured stdout
  let capturedStdinG1: string | undefined;
  const runnerG1: KimiCliProcessRunner = {
    async run(commandInput): Promise<KimiCliProcessResult> {
      capturedStdinG1 = commandInput.stdin;
      const requirementId = commandInput.requestId;
      return {
        exitCode: 0,
        durationMs: 10,
        stdout: buildValidKimiJson(requirementId),
        stderr: "",
        stdoutPayload: buildValidKimiJson(requirementId),
      };
    },
  };

  const gatewayG1 = new ExecutionGateway({
    env: envG,
    kimiRunner: runnerG1,
  });

  const requirementG = "build a simple login form with email validation";
  const resultG1 = await run(requirementG, {
    executionGateway: gatewayG1,
    requirementSummaryMode: "kimi_gateway",
  });

  a(capturedStdinG1 !== undefined, "fake Kimi process runner received stdin");
  a(
    typeof capturedStdinG1 === "string" && capturedStdinG1.includes(requirementG),
    "stdin contains the original requirement"
  );
  a(
    typeof capturedStdinG1 === "string" && capturedStdinG1.includes("JSON object only"),
    "stdin instructs JSON-only output"
  );
  a(
    typeof capturedStdinG1 === "string" && capturedStdinG1.includes("multi_repo"),
    "stdin references multi_repo"
  );
  a(
    typeof capturedStdinG1 === "string" && capturedStdinG1.includes("sub_requirements"),
    "stdin references sub_requirements"
  );
  a(
    !JSON.stringify(resultG1).includes(capturedStdinG1 ?? ""),
    "raw prompt is not exposed in Runtime result"
  );
  a(resultG1.final_status === "success", "Runtime completes with valid Kimi stdout");
  const reqSummaryTraceG1 = resultG1.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceG1?.output["execution_source"] === "kimi_real", "execution_source is kimi_real");

  // G2: multiline JSON preserved exactly
  let capturedPayloadG2: string | undefined;
  const runnerG2: KimiCliProcessRunner = {
    async run(commandInput): Promise<KimiCliProcessResult> {
      const requirementId = commandInput.requestId;
      const payload = JSON.stringify(
        {
          requirement_id: requirementId,
          multi_repo: false,
          main_repo: "main",
          sub_requirements: [],
        },
        null,
        2
      );
      capturedPayloadG2 = payload;
      return {
        exitCode: 0,
        durationMs: 10,
        stdout: payload,
        stderr: "",
        stdoutPayload: payload,
      };
    },
  };
  const gatewayG2 = new ExecutionGateway({ env: envG, kimiRunner: runnerG2 });
  const resultG2 = await run("build a login form", {
    executionGateway: gatewayG2,
    requirementSummaryMode: "kimi_gateway",
  });
  a(resultG2.final_status === "success", "Runtime completes with multiline JSON");
  const reqSummaryTraceG2 = resultG2.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceG2?.output["execution_source"] === "kimi_real", "multiline JSON execution_source is kimi_real");
  a(
    JSON.stringify(reqSummaryTraceG2?.output["multi_repo"]) === "false",
    "multiline JSON parsed correctly"
  );
  a(
    capturedPayloadG2 !== undefined && capturedPayloadG2.includes("\n"),
    "multiline payload was returned by runner"
  );

  // G3: oversized stdout triggers fallback
  const runnerG3: KimiCliProcessRunner = {
    async run(): Promise<KimiCliProcessResult> {
      return {
        exitCode: 0,
        durationMs: 10,
        stdout: "x".repeat(20_000),
        stderr: "",
        stdoutPayload: "x".repeat(20_000),
        stdoutTruncated: true,
      };
    },
  };
  const gatewayG3 = new ExecutionGateway({ env: envG, kimiRunner: runnerG3 });
  const resultG3 = await run("build a login form", {
    executionGateway: gatewayG3,
    requirementSummaryMode: "kimi_gateway",
  });
  a(resultG3.final_status === "success", "Runtime completes after oversized stdout fallback");
  const reqSummaryTraceG3 = resultG3.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceG3?.output["execution_source"] === "kimi_fallback", "oversized stdout execution_source is kimi_fallback");

  // G4: malformed stdout triggers fallback
  const malformedPayloadsG4 = [
    "Here is the result: {\"requirement_id\": \"x\", \"multi_repo\": false}",
    "```json\n{\"requirement_id\": \"x\"}\n```",
    "not valid json",
  ];
  for (const malformed of malformedPayloadsG4) {
    const runnerG4: KimiCliProcessRunner = {
      async run(): Promise<KimiCliProcessResult> {
        return {
          exitCode: 0,
          durationMs: 10,
          stdout: malformed,
          stderr: "",
          stdoutPayload: malformed,
        };
      },
    };
    const gatewayG4 = new ExecutionGateway({ env: envG, kimiRunner: runnerG4 });
    const resultG4 = await run("build a login form", {
      executionGateway: gatewayG4,
      requirementSummaryMode: "kimi_gateway",
    });
    a(resultG4.final_status === "success", "Runtime completes after malformed stdout fallback");
    const reqSummaryTraceG4 = resultG4.execution_trace.find((t) => t.node === "requirement-summary");
    a(
      reqSummaryTraceG4?.output["execution_source"] === "kimi_fallback",
      `malformed stdout fallback: ${malformed.slice(0, 40)}`
    );
  }
  console.log("");

  // H: prompt too large is rejected before runner and falls back safely
  console.log("Test H: oversized prompt is rejected and Runtime falls back");
  const hugeRequirement = "x".repeat(20_000);
  let runnerCalledH = 0;
  const runnerH: KimiCliProcessRunner = {
    async run(): Promise<KimiCliProcessResult> {
      runnerCalledH++;
      return {
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          requirement_id: "REQ-KIMI-HUGE",
          multi_repo: false,
          main_repo: "main",
          sub_requirements: [],
        }),
        stderr: "",
      };
    },
  };
  const gatewayH = new ExecutionGateway({ env: envG, kimiRunner: runnerH });
  const resultH = await run(hugeRequirement, {
    executionGateway: gatewayH,
    requirementSummaryMode: "kimi_gateway",
  });
  a(runnerCalledH === 0, "runner is not invoked for oversized prompt");
  a(resultH.final_status === "success", "Runtime completes after oversized prompt fallback");
  const reqSummaryTraceH = resultH.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceH?.output["execution_source"] === "kimi_fallback", "execution_source is kimi_fallback for oversized prompt");
  a(
    !JSON.stringify(resultH).includes(hugeRequirement),
    "raw requirement text is not exposed in Runtime result"
  );
  console.log("");

  // I: stdoutPayload containing the dynamic prompt is rejected and Runtime falls back
  console.log("Test I: stdoutPayload prompt leak rejected, Runtime falls back safely");
  const requirementI = "deploy a kubernetes cluster with helm";
  // The prompt that the real Gateway builds includes the requirement text —
  // if Kimi echoes it back in the structured output, it must be rejected.
  let runnerCallCountI = 0;
  let capturedStdinI: string | undefined;
  const runnerI: KimiCliProcessRunner = {
    async run(commandInput): Promise<KimiCliProcessResult> {
      runnerCallCountI++;
      capturedStdinI = commandInput.stdin;
      // Simulate Kimi echoing the full prompt back in stdoutPayload
      // The built prompt contains the requirement text
      return {
        exitCode: 0,
        durationMs: 50,
        stdout: `• Processing: ${requirementI}. Result: {"requirement_id":"REQ-KIMI-LEAK-I","multi_repo":false}`,
        stderr: `• User asked about ${requirementI}. Thinking...`,
        stdoutPayload: `• Processing: ${requirementI}. Result: {"requirement_id":"REQ-KIMI-LEAK-I","multi_repo":false}`,
      };
    },
  };
  const gatewayI = new ExecutionGateway({
    env: envG,
    kimiRunner: runnerI,
  });
  const resultI = await run(requirementI, {
    executionGateway: gatewayI,
    requirementSummaryMode: "kimi_gateway",
  });
  a(runnerCallCountI === 1, "runner is called exactly once");
  a(resultI.final_status === "success", "Runtime completes after stdoutPayload leak fallback");
  const reqSummaryTraceI = resultI.execution_trace.find((t) => t.node === "requirement-summary");
  a(reqSummaryTraceI?.output["execution_source"] === "kimi_fallback", "execution_source is kimi_fallback");
  // The leaked stdoutPayload must not appear in the Gateway output.summary
  const gatewaySummaryI = reqSummaryTraceI?.output["summary"] as string | undefined;
  a(
    gatewaySummaryI === undefined || !gatewaySummaryI.includes(requirementI),
    "Gateway output.summary does not contain raw requirement"
  );
  // The Gateway result (full output) must not contain the leaked prompt text
  const gatewayOutputI = JSON.stringify(reqSummaryTraceI?.output ?? {});
  a(
    !gatewayOutputI.includes(requirementI),
    "Gateway output does not contain raw requirement"
  );
  // Observability must not contain raw prompt
  const obsI = reqSummaryTraceI?.output["observability"];
  if (obsI) {
    a(
      !JSON.stringify(obsI).includes(requirementI),
      "observability does not contain raw requirement"
    );
  }
  // The leaked error message must not contain the prompt
  const errorI = reqSummaryTraceI?.output["error"] as string | undefined;
  a(
    errorI === undefined || !errorI.includes(requirementI),
    "error message does not contain raw requirement"
  );
  console.log("");

  console.log(`\nResults: ${passed.count} passed, ${failed.count} failed`);
  process.exit(failed.count > 0 ? 1 : 0);
}

test();
