// Codex Runtime Real Smoke Test
// ================================
// Manually invoked smoke test for the full Runtime direct path with real Codex Gateway.
// Requires explicit environment confirmation. Does NOT modify files.
// Does NOT apply patches. Does NOT write generated patch to disk.
// Prints only sanitized summary data.
//
// Required environment variables:
//   SDLC_EXECUTION_MODE=codex
//   SDLC_CODEX_REAL_DISPATCH=enabled
//   SDLC_CODEX_SMOKE_CONFIRM=yes
//   SDLC_CODEX_WORKING_DIRECTORY=<absolute path to a git repository>

import { ExecutionGateway } from "../execution/gateway";
import { run } from "../runtime";
import { validateSmokeEnvironment } from "./codex-real-dispatch-smoke";

function hasEnabledSideEffectFlags(env: Record<string, string | undefined>): boolean {
  return (
    env.SDLC_POLICY_MEMORY === "enabled" ||
    env.SDLC_POLICY_MEMORY_READ === "enabled" ||
    env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION === "shadow" ||
    env.SDLC_KIMI_RUNTIME_ATTACHMENT === "enabled"
  );
}

function formatTraceSequence(trace: ReadonlyArray<{ node: string }>): string {
  return trace.map((entry) => entry.node).join(" → ");
}

async function main() {
  const validation = validateSmokeEnvironment(process.env);
  if (validation.ok === false) {
    console.error(validation.message);
    process.exit(1);
  }

  if (hasEnabledSideEffectFlags(process.env)) {
    console.error(
      "Refused: unrelated Runtime side-effect flags must remain disabled for this smoke test."
    );
    process.exit(1);
  }

  const runtimeEnv = {
    SDLC_EXECUTION_MODE: "codex" as const,
    SDLC_CODEX_REAL_DISPATCH: "enabled" as const,
  };

  const gateway = new ExecutionGateway({
    env: runtimeEnv,
    codexRealDispatchConfig: {
      workingDirectory: validation.workingDirectory,
      timeoutMs: 120_000,
      maxStdoutChars: 64_000,
      maxStderrChars: 16_000,
    },
  });

  const requirement =
    "Add an exported addNumbers(a, b) function to math.ts and return a patch only. Do not modify files.";

  const result = await run(requirement, {
    env: runtimeEnv,
    executionGateway: gateway,
  });

  const trace = result.execution_trace;
  const requiredNodes = [
    "requirement-summary",
    "tech-design",
    "review",
    "implementation",
    "code-review",
    "validation",
  ];
  const traceNodes = trace.map((entry) => entry.node);
  const hasAllRequiredNodes = requiredNodes.every((node) =>
    traceNodes.includes(node as string)
  );

  const implArtifacts = result.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "code_patch"
  );
  const shadowArtifacts = result.artifacts.filter(
    (a) => a.node === "implementation" && a.type === "shadow_output"
  );
  const implCodePatch = implArtifacts[0];
  const file = implCodePatch?.content["file"];
  const patch = implCodePatch?.content["patch"];

  const implementationTrace = trace.find((entry) => entry.node === "implementation");
  const implOutput = implementationTrace?.output ?? {};
  const executionResult = (implOutput["execution_result"] ?? {}) as Record<
    string,
    unknown
  >;

  const codeReviewTrace = trace.find((entry) => entry.node === "code-review");
  const codeReviewStatus = codeReviewTrace?.output["result"] as string | undefined;

  const passed =
    result.final_status === "success" &&
    hasAllRequiredNodes &&
    implArtifacts.length === 1 &&
    typeof file === "string" &&
    file.trim().length > 0 &&
    file !== "src/generated-shadow-implementation.ts" &&
    typeof patch === "string" &&
    patch.trim().length > 0 &&
    shadowArtifacts.length === 0 &&
    executionResult["result"] === "code_patch_generated" &&
    executionResult["codex_fallback_reason"] === undefined &&
    codeReviewStatus === "PASS" &&
    result.feedback.review_summary.validationPassed === true;

  const traceSequence = formatTraceSequence(trace);

  if (passed) {
    console.log("runtime smoke: PASS");
    console.log(`final_status: ${result.final_status}`);
    console.log(`trace sequence: ${traceSequence}`);
    console.log(`implementation artifact type: code_patch`);
    console.log(`generated file path: ${file}`);
    console.log(`patch character count: ${(patch as string).length}`);
    console.log(`code review status: ${codeReviewStatus}`);
    console.log(`validation passed: true`);
    if (executionResult["duration_ms"] !== undefined) {
      console.log(`duration_ms: ${executionResult["duration_ms"]}`);
    }
    process.exit(0);
  }

  console.log("runtime smoke: FAIL");
  console.log(`final_status: ${result.final_status}`);
  console.log(`trace sequence: ${traceSequence}`);
  console.log(
    `implementation artifact type: ${implCodePatch?.type ?? "none"}`
  );
  if (executionResult["codex_fallback_reason"] !== undefined) {
    console.log(`fallback reason: ${executionResult["codex_fallback_reason"]}`);
  }
  if (executionResult["codex_fallback_action"] !== undefined) {
    console.log(`fallback action: ${executionResult["codex_fallback_action"]}`);
  }
  console.log(`code review status: ${codeReviewStatus ?? "none"}`);
  console.log(`validation passed: ${result.feedback.review_summary.validationPassed}`);
  process.exit(1);
}

const isMain = process.argv[1] === __filename;
if (isMain) {
  main().catch(() => {
    console.error("Runtime smoke test failed with an unexpected error.");
    process.exit(1);
  });
}
