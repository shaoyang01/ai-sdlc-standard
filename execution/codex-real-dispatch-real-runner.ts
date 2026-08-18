// Codex Real Dispatch Real Runner
// =================================
// Production-oriented Codex real-dispatch runner that orchestrates prompt building,
// process execution via an injected runner, and output parsing. Does NOT import
// child_process, fs, http, https, or fetch. The actual process spawn must be provided
// by the caller through CodexCliProcessRunner. Wired into ExecutionGateway only when
// explicitly injected.

import {
  ExecutionRequest,
  ExecutionResult,
  ExecutionArtifact,
  ExecutionArtifactType,
} from "./types";
import { createArtifact } from "../core/artifact";
import {
  isSupportedCodexRequestType,
  buildCapabilityPrompt,
  buildCapabilityTextArtifact,
  checkCapabilityInput,
  checkCapabilityOutput,
} from "./codex-real-dispatch-runner";
import { CAPABILITY_ARTIFACT_TYPES, validateNodeOutputArtifact } from "../core/agent-capability-bindings";
import type { NodeCapabilityId } from "../loop/types";
import {
  buildCodexPrompt,
  CodexPromptBuilderInput,
  PromptBuilderLimits,
  DEFAULT_PROMPT_BUILDER_LIMITS,
} from "./codex-real-dispatch-prompt-builder";
import {
  parseCodexOutput,
  OutputParserLimits,
  DEFAULT_OUTPUT_PARSER_LIMITS,
} from "./codex-real-dispatch-output-parser";
import type { CodexRunner } from "./codex-real-dispatch-runner";

export interface CodexCliProcessRunner {
  run(prompt: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr?: string;
    durationMs?: number;
    stdoutTruncated?: boolean;
    stderrTruncated?: boolean;
  }>;
}

export interface CodexRealDispatchRunnerOptions {
  processRunner: CodexCliProcessRunner;
  promptBuilderLimits?: PromptBuilderLimits;
  outputParserLimits?: OutputParserLimits;
}

function buildShadowFallbackResult(
  request: ExecutionRequest,
  reason: string,
  fallbackAction: string,
  safeMessage: string
): ExecutionResult {
  const shadowArtifact: ExecutionArtifact = createArtifact({
    id: `${request.requirementId}:${request.node}:shadow_output:codex-real-fallback`,
    requirementId: request.requirementId,
    node: request.node,
    type: "shadow_output",
    content: {
      result: `${request.node}_by_${request.agent}`,
      codex_fallback_reason: reason,
      codex_fallback_action: fallbackAction,
      safe_message: safeMessage,
      input: {
        requirementId: request.requirementId,
        node: request.node,
        agent: request.agent,
      },
    },
    agent: request.agent,
    source: "execution_gateway",
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    node: request.node,
    agent: request.agent,
    output: {
      node: request.node,
      agent: request.agent,
      result: `${request.node}_by_${request.agent}`,
      codex_fallback_reason: reason,
      codex_fallback_action: fallbackAction,
      safe_message: safeMessage,
    },
    artifacts: [shadowArtifact],
  };
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("timed out");
  }
  return false;
}

function isCliMissingError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("enoent") ||
      msg.includes("command not found") ||
      msg.includes("spawn") ||
      msg.includes("no such file")
    );
  }
  return false;
}

/**
 * Creates a Codex real-dispatch runner using an injected process runner.
 * The runner is default-off: it only runs when explicitly provided to ExecutionGateway.
 */
export function createCodexRealDispatchRunner(
  options: CodexRealDispatchRunnerOptions
): CodexRunner {
  const promptLimits = options.promptBuilderLimits ?? DEFAULT_PROMPT_BUILDER_LIMITS;
  const parserLimits = options.outputParserLimits ?? DEFAULT_OUTPUT_PARSER_LIMITS;

  return {
    async run(request: ExecutionRequest): Promise<ExecutionResult> {
      if (!isSupportedCodexRequestType(request.type)) {
        return buildShadowFallbackResult(
          request,
          "unsupported_request_type",
          "reject_and_shadow_fallback",
          "Unsupported request type"
        );
      }

      // C01 WP-3: implementation-like requests need ImplementationExecutorInput;
      // other node capabilities build a deterministic capability prompt from
      // the input and produce their own canonical output artifact.
      const isImplementationLike =
        request.type === "code_generation" || request.type === "implementation";
      const implInput = request.input
        .implementationExecutorInput as CodexPromptBuilderInput | undefined;

      if (isImplementationLike && !implInput) {
        return buildShadowFallbackResult(
          request,
          "unsupported_request_type",
          "reject_and_shadow_fallback",
          "Missing ImplementationExecutorInput"
        );
      }

      // Legacy code_generation maps to the implementation capability.
      const effectiveCapability: NodeCapabilityId =
        request.type === "code_generation" ? "implementation" : (request.type as NodeCapabilityId);
      let prompt = "";
      if (isImplementationLike) {
        const promptResult = buildCodexPrompt(implInput as CodexPromptBuilderInput, promptLimits);
        if (!promptResult.ok) {
          return buildShadowFallbackResult(
            request,
            promptResult.reason ?? "unknown_error",
            promptResult.fallbackAction ?? "shadow_fallback",
            `Prompt builder refused: ${promptResult.reason ?? "unknown_error"}`
          );
        }
        prompt = promptResult.prompt;
      } else {
        // Fail-closed: sensitive or unserializable input must never reach a
        // prompt or the process runner.
        const inputCheck = checkCapabilityInput(request.input);
        if (inputCheck.ok === false) {
          return buildShadowFallbackResult(
            request,
            inputCheck.reason,
            "reject_and_shadow_fallback",
            inputCheck.reason === "prohibited_input_content"
              ? "Input contains prohibited content"
              : "Input is not safely serializable"
          );
        }
        prompt = buildCapabilityPrompt(request, effectiveCapability, inputCheck.text);
      }

      let processResult;
      try {
        processResult = await options.processRunner.run(prompt);
      } catch (error) {
        if (isTimeoutError(error)) {
          return buildShadowFallbackResult(
            request,
            "timeout",
            "shadow_fallback",
            "Codex CLI timed out"
          );
        }
        if (isCliMissingError(error)) {
          return buildShadowFallbackResult(
            request,
            "cli_missing",
            "shadow_fallback",
            "Codex CLI not available"
          );
        }
        return buildShadowFallbackResult(
          request,
          "unknown_error",
          "shadow_fallback",
          "Codex CLI runner failed"
        );
      }

      if (processResult.exitCode !== 0) {
        return buildShadowFallbackResult(
          request,
          "non_zero_exit",
          "shadow_fallback",
          `Codex CLI exited with code ${processResult.exitCode}`
        );
      }

      if (processResult.stdoutTruncated) {
        return buildShadowFallbackResult(
          request,
          "output_too_large",
          "truncate_and_shadow_fallback",
          "Codex CLI stdout exceeded maximum allowed size"
        );
      }

      const artifactType: ExecutionArtifactType = CAPABILITY_ARTIFACT_TYPES[effectiveCapability];

      if (!isImplementationLike) {
        // Fail-closed: oversized or sensitive output must never become a
        // successful node product (no silent truncation, no secret leak).
        const outputCheck = checkCapabilityOutput(processResult.stdout);
        if (outputCheck.ok === false) {
          return buildShadowFallbackResult(
            request,
            outputCheck.reason,
            "reject_and_shadow_fallback",
            outputCheck.reason === "output_too_large"
              ? "Capability output exceeded maximum allowed size"
              : "Output contains prohibited content"
          );
        }
      }

      // C01 WP-3: per-capability parsing and artifact construction.
      // Implementation-like requests parse a code patch; other capabilities
      // take the real CLI text output as the node product (no code-patch
      // parsing is applied to them).
      let artifact: ExecutionArtifact;
      if (isImplementationLike) {
        const parseResult = parseCodexOutput(
          processResult.stdout,
          request.requirementId,
          request.node,
          parserLimits
        );

        if (!parseResult.ok) {
          return buildShadowFallbackResult(
            request,
            parseResult.reason ?? "unknown_error",
            parseResult.fallbackAction ?? "shadow_fallback",
            `Output parser refused: ${parseResult.reason ?? "unknown_error"}`
          );
        }
        artifact = createArtifact({
          id: `${request.requirementId}:${request.node}:${artifactType}:codex-real`,
          requirementId: request.requirementId,
          node: request.node,
          type: artifactType,
          content: parseResult.artifact.content,
          agent: request.agent,
          source: "execution_gateway",
          createdAt: new Date().toISOString(),
        });
      } else {
        artifact = buildCapabilityTextArtifact(
          request,
          effectiveCapability,
          processResult.stdout,
          artifactType,
          request.agent,
        );
      }

      // Production boundary: the output artifact must satisfy the WP-2 node
      // output contract for the requested capability (fail-closed).
      try {
        validateNodeOutputArtifact(artifact.type, effectiveCapability);
      } catch {
        return buildShadowFallbackResult(
          request,
          "output_contract_violation",
          "reject_and_shadow_fallback",
          "Output artifact violates node contract"
        );
      }

      return {
        success: true,
        node: request.node,
        agent: request.agent,
        output: {
          node: request.node,
          agent: request.agent,
          result: isImplementationLike ? "code_patch_generated" : "capability_completed",
          prompt_char_count: prompt.length,
          output_char_count: processResult.stdout.length,
          duration_ms: processResult.durationMs,
        },
        artifacts: [artifact],
      };
    },
  };
}
