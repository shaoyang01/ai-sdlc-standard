// Codex Real Dispatch Fake Runner Integration Test
// =================================================
// Verifies the minimal fake-runner implementation path without invoking real Codex.
// No child_process, network, or filesystem writes.

import { run } from "../runtime";
import { ExecutionContext } from "../core/execution-context";
import { buildImplementationExecutorInput } from "../core/runtime-executors";
import { ExecutionGateway } from "../execution/gateway";
import {
  buildCodexPrompt,
  DEFAULT_PROMPT_BUILDER_LIMITS,
} from "../execution/codex-real-dispatch-prompt-builder";
import {
  parseCodexOutput,
  DEFAULT_OUTPUT_PARSER_LIMITS,
} from "../execution/codex-real-dispatch-output-parser";
import {
  createCodexFakeRunner,
  CodexFakeRunnerScenario,
} from "../execution/codex-real-dispatch-runner";
import { ExecutionRequest } from "../execution/types";

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

  console.log("Codex Real Dispatch Fake Runner Integration Test\n");

  const originalMode = process.env.SDLC_EXECUTION_MODE;

  const implInput = {
    requirement: "build a user login page with database storage",
    requirementId: "REQ-FAKE-RUNNER",
    summary: {
      requirement_id: "REQ-FAKE-RUNNER",
      multi_repo: false,
      main_repo: "main",
      sub_requirements: [],
      parsed_at: "2026-01-01T00:00:00.000Z",
    },
    designOutput: {
      node: "tech-design",
      result: "design_completed",
      design: {
        approach: "single_service",
        components: ["ui_form", "data_store"],
        interfaces: ["user_interface"],
        dependencies: ["database"],
        test_strategy: "unit_plus_integration",
        risks: [],
      },
    },
    reviewOutput: { node: "review", result: "PASS" },
    complexity: "medium" as const,
    executionMode: "direct" as const,
  };

  const requestWithImplInput: ExecutionRequest = {
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-FAKE-RUNNER",
    input: { implementationExecutorInput: implInput },
  };

  // ── Test 1: Prompt builder success ──
  console.log("Test 1: Prompt builder success");
  const promptResult = buildCodexPrompt(implInput);
  assert(promptResult.ok === true, "prompt builder succeeds for valid input");
  if (promptResult.ok) {
    assert(promptResult.prompt.length <= DEFAULT_PROMPT_BUILDER_LIMITS.maxPromptChars, "prompt within max length");
    assert(promptResult.prompt.includes("# Task Summary"), "prompt includes task summary section");
    assert(promptResult.prompt.includes("# Requirement"), "prompt includes requirement section");
    assert(promptResult.prompt.includes("# Structured Design"), "prompt includes structured design section");
    assert(promptResult.prompt.includes("# Implementation Constraints"), "prompt includes implementation constraints section");
    assert(promptResult.prompt.includes("# Expected Output Contract"), "prompt includes expected output contract section");
    assert(promptResult.prompt.includes("REQ-FAKE-RUNNER"), "prompt includes requirement id");
    assert(promptResult.prompt.includes("```codex-code-patch"), "prompt includes structured fenced output requirement");
    assert(promptResult.prompt.includes("FILE: <relative-file-path>"), "prompt includes file path placeholder");
    assert(!promptResult.prompt.includes("raw_context"), "prompt does not include raw_context");
    assert(!promptResult.prompt.includes("raw_artifacts"), "prompt does not include raw_artifacts");
    assert(!promptResult.prompt.includes("full_patch"), "prompt does not include full_patch");
    assert(!promptResult.prompt.includes("raw_stdout"), "prompt does not include raw_stdout");
    assert(!promptResult.prompt.includes("raw_stderr"), "prompt does not include raw_stderr");
    assert(!promptResult.prompt.includes(JSON.stringify({ raw_text: "anything" })), "prompt does not dump raw context");
  }
  console.log("");

  // ── Test 2: Prompt builder rejects oversized prompt ──
  console.log("Test 2: Prompt builder rejects oversized prompt");
  const tinyLimits = {
    maxPromptChars: 50,
    maxRequirementChars: 4000,
    maxDesignChars: 4000,
    maxReviewChars: 2000,
  };
  const oversizedPrompt = buildCodexPrompt(implInput, tinyLimits);
  assert(oversizedPrompt.ok === false, "prompt builder rejects oversized prompt");
  if (!oversizedPrompt.ok) {
    assert(oversizedPrompt.reason === "prompt_too_large", "rejection reason is prompt_too_large");
    assert(oversizedPrompt.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 3: Prompt builder rejects prohibited content ──
  console.log("Test 3: Prompt builder rejects prohibited content");
  const maliciousInput = { ...implInput, requirement: "set password = 'secret_token_123'" };
  const prohibitedPrompt = buildCodexPrompt(maliciousInput);
  assert(prohibitedPrompt.ok === false, "prompt builder rejects prohibited content");
  if (!prohibitedPrompt.ok) {
    assert(prohibitedPrompt.reason === "prohibited_prompt_content", "rejection reason is prohibited_prompt_content");
  }
  console.log("");

  // ── Test 4: Output parser success ──
  console.log("Test 4: Output parser success");
  const validStdout = [
    "FILE: src/generated-codex-patch.ts",
    "PATCH:",
    "// Generated patch",
    "export function patch() { return true; }",
  ].join("\n");
  const parseSuccess = parseCodexOutput(validStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(parseSuccess.ok === true, "parser succeeds for valid stdout");
  if (parseSuccess.ok) {
    assert(parseSuccess.artifact.type === "code_patch", "artifact type is code_patch");
    assert(parseSuccess.artifact.content["file"] === "src/generated-codex-patch.ts", "artifact has file path");
    assert(typeof parseSuccess.artifact.content["patch"] === "string", "artifact has patch content");
    assert((parseSuccess.artifact.content["patch"] as string).length > 0, "patch is non-empty");
    assert(parseSuccess.artifact.content["parser_summary"] === "parsed_from_synthetic_stdout", "parser summary attached");
    assert(parseSuccess.artifact.content["raw_stdout"] === undefined, "raw stdout not attached");
    assert(parseSuccess.artifact.content["raw_stderr"] === undefined, "raw stderr not attached");
  }
  console.log("");

  // ── Test 5: Output parser rejects missing file path ──
  console.log("Test 5: Output parser rejects missing file path");
  const missingFileStdout = [
    "PATCH:",
    "// Missing file path",
  ].join("\n");
  const missingFileResult = parseCodexOutput(missingFileStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(missingFileResult.ok === false, "parser rejects missing file path");
  if (!missingFileResult.ok) {
    assert(missingFileResult.reason === "missing_file_path", "reason is missing_file_path");
    assert(missingFileResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 5b: Output parser rejects parse error ──
  console.log("Test 5b: Output parser rejects parse error");
  const parseErrorStdout = "This output does not match the expected format at all.";
  const parseErrorResult = parseCodexOutput(parseErrorStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(parseErrorResult.ok === false, "parser rejects parse error");
  if (!parseErrorResult.ok) {
    assert(parseErrorResult.reason === "parse_error", "reason is parse_error");
    assert(parseErrorResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 5c: Output parser rejects FILE without PATCH ──
  console.log("Test 5c: Output parser rejects FILE without PATCH");
  const fileOnlyStdout = [
    "FILE: src/no-patch.ts",
    "// No PATCH marker",
  ].join("\n");
  const fileOnlyResult = parseCodexOutput(fileOnlyStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(fileOnlyResult.ok === false, "parser rejects file without patch");
  if (!fileOnlyResult.ok) {
    assert(fileOnlyResult.reason === "parse_error", "reason is parse_error");
  }
  console.log("");

  // ── Test 6: Output parser rejects empty patch ──
  console.log("Test 6: Output parser rejects empty patch");
  const emptyPatchStdout = [
    "FILE: src/empty.ts",
    "PATCH:",
  ].join("\n");
  const emptyPatchResult = parseCodexOutput(emptyPatchStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(emptyPatchResult.ok === false, "parser rejects empty patch");
  if (!emptyPatchResult.ok) {
    assert(emptyPatchResult.reason.includes("empty_patch"), "reason mentions empty_patch");
    assert(emptyPatchResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 7: Output parser rejects prohibited content ──
  console.log("Test 7: Output parser rejects prohibited content");
  const prohibitedStdout = [
    "FILE: src/secret.ts",
    "PATCH:",
    "const password = 'hunter2';",
  ].join("\n");
  const prohibitedResult = parseCodexOutput(prohibitedStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(prohibitedResult.ok === false, "parser rejects prohibited content");
  if (!prohibitedResult.ok) {
    assert(prohibitedResult.reason.includes("prohibited_output_content"), "reason mentions prohibited_output_content");
    assert(prohibitedResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 8: Output parser rejects oversized output ──
  console.log("Test 8: Output parser rejects oversized output");
  const oversizedStdout = "x".repeat(DEFAULT_OUTPUT_PARSER_LIMITS.maxStdoutChars + 1);
  const oversizedResult = parseCodexOutput(oversizedStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(oversizedResult.ok === false, "parser rejects oversized output");
  if (!oversizedResult.ok) {
    assert(oversizedResult.fallbackAction === "truncate_and_shadow_fallback", "fallback action is truncate_and_shadow_fallback");
  }
  console.log("");

  // ── Test 8b: Output parser supports structured fenced output ──
  console.log("Test 8b: Output parser supports structured fenced output");
  const structuredStdout = [
    "Some preamble text",
    "```codex-code-patch",
    "FILE: src/structured.ts",
    "PATCH:",
    "// Structured output patch",
    "export const structured = true;",
    "```",
    "Some trailing text",
  ].join("\n");
  const structuredResult = parseCodexOutput(structuredStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(structuredResult.ok === true, "parser succeeds for structured fenced output");
  if (structuredResult.ok) {
    assert(structuredResult.artifact.content["file"] === "src/structured.ts", "structured artifact has file path");
    assert((structuredResult.artifact.content["patch"] as string).includes("export const structured = true;"), "structured artifact has patch content");
  }
  console.log("");

  // ── Test 8c: Output parser supports legacy simple FILE/PATCH output ──
  console.log("Test 8c: Output parser supports legacy simple FILE/PATCH output");
  const legacyStdout = [
    "FILE: src/legacy.ts",
    "PATCH:",
    "// Legacy output patch",
    "export const legacy = true;",
  ].join("\n");
  const legacyResult = parseCodexOutput(legacyStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(legacyResult.ok === true, "parser succeeds for legacy simple output");
  if (legacyResult.ok) {
    assert(legacyResult.artifact.content["file"] === "src/legacy.ts", "legacy artifact has file path");
    assert((legacyResult.artifact.content["patch"] as string).includes("export const legacy = true;"), "legacy artifact has patch content");
  }
  console.log("");

  // ── Test 8d: Output parser rejects malformed fenced output ──
  console.log("Test 8d: Output parser rejects malformed fenced output");
  const malformedFencedStdout = [
    "```codex-code-patch",
    "// Missing FILE and PATCH markers",
    "```",
  ].join("\n");
  const malformedResult = parseCodexOutput(malformedFencedStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(malformedResult.ok === false, "parser rejects malformed fenced output");
  if (!malformedResult.ok) {
    assert(malformedResult.reason === "parse_error", "malformed fenced reason is parse_error");
  }
  console.log("");

  // ── Test 8e: Output parser rejects fenced output with missing FILE ──
  console.log("Test 8e: Output parser rejects fenced output with missing FILE");
  const fencedMissingFileStdout = [
    "```codex-code-patch",
    "PATCH:",
    "// Patch without file",
    "```",
  ].join("\n");
  const fencedMissingFileResult = parseCodexOutput(fencedMissingFileStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(fencedMissingFileResult.ok === false, "parser rejects fenced output with missing file");
  if (!fencedMissingFileResult.ok) {
    assert(fencedMissingFileResult.reason === "missing_file_path", "reason is missing_file_path");
  }
  console.log("");

  // ── Test 8f: Output parser rejects fenced output with empty PATCH ──
  console.log("Test 8f: Output parser rejects fenced output with empty PATCH");
  const fencedEmptyPatchStdout = [
    "```codex-code-patch",
    "FILE: src/empty-fenced.ts",
    "PATCH:",
    "```",
  ].join("\n");
  const fencedEmptyPatchResult = parseCodexOutput(fencedEmptyPatchStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(fencedEmptyPatchResult.ok === false, "parser rejects fenced output with empty patch");
  if (!fencedEmptyPatchResult.ok) {
    assert(fencedEmptyPatchResult.reason === "empty_patch", "reason is empty_patch");
  }
  console.log("");

  // ── Test 8g: Output parser rejects unterminated fenced block ──
  console.log("Test 8g: Output parser rejects unterminated fenced block");
  const unterminatedStdout = [
    "```codex-code-patch",
    "FILE: src/unterminated.ts",
    "PATCH:",
    "// No closing fence",
  ].join("\n");
  const unterminatedResult = parseCodexOutput(unterminatedStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(unterminatedResult.ok === false, "parser rejects unterminated fenced block");
  if (!unterminatedResult.ok) {
    assert(unterminatedResult.reason === "parse_error", "reason is parse_error");
    assert(unterminatedResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 8h: Output parser rejects fenced block with no newline after marker ──
  console.log("Test 8h: Output parser rejects fenced block with no newline after marker");
  const noNewlineStdout = "```codex-code-patch FILE: src/no-newline.ts PATCH:\n// content\n```";
  const noNewlineResult = parseCodexOutput(noNewlineStdout, "REQ-FAKE-RUNNER", "implementation");
  assert(noNewlineResult.ok === false, "parser rejects fenced block with no newline after marker");
  if (!noNewlineResult.ok) {
    assert(noNewlineResult.reason === "parse_error", "reason is parse_error");
    assert(noNewlineResult.fallbackAction === "reject_and_shadow_fallback", "fallback action is reject_and_shadow_fallback");
  }
  console.log("");

  // ── Test 9: Fake runner success scenario ──
  console.log("Test 9: Fake runner success scenario");
  const successRunner = createCodexFakeRunner({ scenario: "success_code_patch" });
  const successResult = await successRunner.run(requestWithImplInput);
  assert(successResult.success === true, "success scenario returns success");
  assert(successResult.artifacts.length === 1, "success scenario returns one artifact");
  assert(successResult.artifacts[0].type === "code_patch", "success artifact is code_patch");
  assert(successResult.artifacts[0].content["file"] === "src/generated-codex-patch.ts", "success artifact has expected file path");
  assert(successResult.output["result"] === "code_patch_generated", "success output result is code_patch_generated");
  assert(successResult.output["raw_stdout"] === undefined, "success output does not expose raw stdout");
  assert(successResult.artifacts[0].content["raw_stdout"] === undefined, "success artifact does not expose raw stdout");
  console.log("");

  // ── Test 10: Fake runner CLI failure scenarios fall back to shadow ──
  console.log("Test 10: Fake runner CLI failure scenarios");
  const cliScenarios: CodexFakeRunnerScenario[] = ["cli_missing", "timeout", "non_zero_exit"];
  for (const scenario of cliScenarios) {
    const runner = createCodexFakeRunner({ scenario });
    const result = await runner.run(requestWithImplInput);
    assert(result.success === true, `${scenario} keeps Gateway success true`);
    assert(result.artifacts[0].type === "shadow_output", `${scenario} falls back to shadow_output`);
    assert(result.output["codex_fallback_action"] === "shadow_fallback", `${scenario} uses shadow_fallback`);
  }
  console.log("");

  // ── Test 11: Fake runner parser rejection scenarios ──
  console.log("Test 11: Fake runner parser rejection scenarios");
  const rejectScenarios: CodexFakeRunnerScenario[] = [
    "missing_file_path",
    "empty_patch",
    "parse_error",
    "prohibited_output_content",
  ];
  for (const scenario of rejectScenarios) {
    const runner = createCodexFakeRunner({ scenario });
    const result = await runner.run(requestWithImplInput);
    assert(result.success === true, `${scenario} keeps Gateway success true`);
    assert(result.artifacts[0].type === "shadow_output", `${scenario} falls back to shadow_output`);
    assert(result.output["codex_fallback_action"] === "reject_and_shadow_fallback", `${scenario} uses reject_and_shadow_fallback`);
    if (scenario === "parse_error") {
      assert(result.output["codex_fallback_reason"] === "parse_error", "parse_error exposes parse_error reason");
    }
    if (scenario === "missing_file_path") {
      assert(result.output["codex_fallback_reason"] === "missing_file_path", "missing_file_path exposes missing_file_path reason");
    }
  }
  console.log("");

  // ── Test 11b: Fake runner unsupported request type ──
  console.log("Test 11b: Fake runner unsupported request type");
  const unsupportedRequest: ExecutionRequest = {
    type: "llm_task",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-UNSUPPORTED",
    input: { implementationExecutorInput: implInput },
  };
  const unsupportedRunner = createCodexFakeRunner({ scenario: "success_code_patch" });
  const unsupportedResult = await unsupportedRunner.run(unsupportedRequest);
  assert(unsupportedResult.success === true, "unsupported request keeps Gateway success true");
  assert(unsupportedResult.artifacts[0].type === "shadow_output", "unsupported request falls back to shadow_output");
  assert(unsupportedResult.output["codex_fallback_reason"] === "unsupported_request_type", "unsupported request exposes unsupported_request_type reason");
  assert(unsupportedResult.output["codex_fallback_action"] === "reject_and_shadow_fallback", "unsupported request uses reject_and_shadow_fallback");
  console.log("");

  // ── Test 12: Fake runner output_too_large scenario ──
  console.log("Test 12: Fake runner output_too_large scenario");
  const largeRunner = createCodexFakeRunner({ scenario: "output_too_large" });
  const largeResult = await largeRunner.run(requestWithImplInput);
  assert(largeResult.success === true, "output_too_large keeps Gateway success true");
  assert(largeResult.artifacts[0].type === "shadow_output", "output_too_large falls back to shadow_output");
  assert(largeResult.output["codex_fallback_action"] === "truncate_and_shadow_fallback", "output_too_large uses truncate_and_shadow_fallback");
  console.log("");

  // ── Test 13: Gateway default behavior unchanged (shadow mode) ──
  console.log("Test 13: Gateway default behavior unchanged");
  delete process.env.SDLC_EXECUTION_MODE;
  const defaultGateway = new ExecutionGateway();
  const defaultResult = await defaultGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-DEFAULT",
    input: {},
  });
  assert(defaultResult.success === true, "default gateway returns success");
  assert(defaultResult.artifacts[0].type === "shadow_output", "default gateway returns shadow_output");
  console.log("");

  // ── Test 14: Gateway with injected fake runner in codex mode ──
  console.log("Test 14: Gateway with injected fake runner");
  process.env.SDLC_EXECUTION_MODE = "codex";
  const injectedGateway = new ExecutionGateway({
    codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
  });
  const injectedResult = await injectedGateway.execute(requestWithImplInput);
  assert(injectedResult.success === true, "injected gateway returns success");
  assert(injectedResult.artifacts[0].type === "code_patch", "injected gateway returns code_patch");
  assert(injectedResult.artifacts[0].content["file"] === "src/generated-codex-patch.ts", "injected gateway artifact has expected file path");
  console.log("");

  // ── Test 15: Runtime with fake runner via custom implementation executor ──
  console.log("Test 15: Runtime integration with fake runner");
  process.env.SDLC_EXECUTION_MODE = "codex";
  const fakeRunner = createCodexFakeRunner({ scenario: "success_code_patch" });

  const codexImplementationExecutor = async (
    context: Record<string, unknown>,
    execCtx: ExecutionContext
  ) => {
    const input = buildImplementationExecutorInput(context, execCtx);
    const request: ExecutionRequest = {
      type: "code_generation",
      node: "implementation",
      agent: "codex",
      requirementId: input.requirementId,
      input: { implementationExecutorInput: input },
    };

    // Route through a Gateway instance with the fake runner injected.
    const gateway = new ExecutionGateway({ codexRunner: fakeRunner });
    const result = await gateway.execute(request);

    const codePatchArtifact = result.artifacts.find((a) => a.type === "code_patch");
    if (!codePatchArtifact) {
      return {
        node: "implementation",
        mode: input.executionMode,
        result: "codex_fallback_shadow",
        code: "",
        artifacts: result.artifacts,
      };
    }

    return {
      node: "implementation",
      mode: input.executionMode,
      result: "codex_fake_implementation_completed",
      code: codePatchArtifact.content["patch"] as string,
      artifacts: [codePatchArtifact],
    };
  };

  const runtimeResult = await run("build a user login page with database storage", {
    env: {},
    executors: {
      implementation: codexImplementationExecutor as any,
    },
  });

  assert(runtimeResult.final_status === "success", "runtime completes with success");
  assert(runtimeResult.feedback.review_summary.codeReviewStatus === "PASS", "code review passes");
  assert(runtimeResult.feedback.review_summary.validationPassed === true, "validation passes");

  const codexArtifact = runtimeResult.artifacts.find(
    (a) => a.node === "implementation" && a.type === "code_patch" && a.id.includes("codex-fake")
  );
  assert(codexArtifact !== undefined, "runtime produced codex-fake code_patch artifact");
  assert(
    !(runtimeResult.artifacts as any[]).some((a) =>
      a.content["raw_stdout"] || a.content["raw_stderr"] || a.content["raw_prompt"]
    ),
    "no raw prompt/stdout/stderr exposed in artifacts"
  );
  console.log("");

  // ── Cleanup ──
  if (originalMode === undefined) {
    delete process.env.SDLC_EXECUTION_MODE;
  } else {
    process.env.SDLC_EXECUTION_MODE = originalMode;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
