// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// Codex Real Dispatch Fake Runner
// =================================
// Test-only fake runner for Codex real dispatch. Simulates Codex CLI behavior
// without invoking the real CLI, spawning processes, using the network, or writing
// to the filesystem. Wired into ExecutionGateway only when explicitly injected.

import {
  ExecutionRequest,
  ExecutionResult,
  ExecutionArtifact,
  ExecutionArtifactType,
} from "./types";
import { createArtifact } from "../core/artifact";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";
import { CAPABILITY_ARTIFACT_TYPES, validateNodeOutputArtifact } from "../core/agent-capability-bindings";
import {
  buildCodexPrompt,
  CodexPromptBuilderInput,
  PromptBuilderLimits,
  DEFAULT_PROMPT_BUILDER_LIMITS,
  containsProhibitedContent,
} from "./codex-real-dispatch-prompt-builder";
import {
  parseCodexOutput,
  OutputParserLimits,
  DEFAULT_OUTPUT_PARSER_LIMITS,
} from "./codex-real-dispatch-output-parser";

// C01 WP-3 (Decision-020): capability-driven request types. The codex
// execution layers accept legacy code_generation plus every node capability
// request type.
const CAPABILITY_REQUEST_TYPES: ReadonlySet<string> = new Set<string>(NODE_CAPABILITY_IDS);

export function isSupportedCodexRequestType(type: string): boolean {
  return type === "code_generation" || CAPABILITY_REQUEST_TYPES.has(type);
}

const CAPABILITY_PROMPT_INPUT_MAX = 4000;
const CAPABILITY_OUTPUT_MAX = 8000;

export type CapabilitySafetyResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Fail-closed input safety for capability prompts: serializes the request
 * input and rejects circular/unserializable payloads and sensitive content
 * BEFORE any prompt is built or the process runner is invoked. Mirrors the
 * implementation path's sensitive-content detection.
 */
export function checkCapabilityInput(input: unknown): CapabilitySafetyResult {
  let json: string;
  try {
    const serialized = JSON.stringify(input);
    if (serialized === undefined) {
      return { ok: false, reason: "unsafe_input" };
    }
    json = serialized;
  } catch {
    return { ok: false, reason: "unsafe_input" };
  }
  if (containsProhibitedContent(json)) {
    return { ok: false, reason: "prohibited_input_content" };
  }
  return { ok: true, text: json.slice(0, CAPABILITY_PROMPT_INPUT_MAX) };
}

/**
 * Fail-closed output safety for capability text: empty/blank output must
 * never be reported as a successful node product (a solution review with no
 * Gate verdict or a validation with no acceptance evidence would mislead
 * downstream nodes), oversized output must NOT be silently truncated
 * (Gate/finding/test evidence would be lost), and sensitive output must
 * never be persisted as a successful artifact.
 */
export function checkCapabilityOutput(outputText: string): CapabilitySafetyResult {
  if (outputText.trim().length === 0) {
    return { ok: false, reason: "empty_output" };
  }
  if (outputText.length > CAPABILITY_OUTPUT_MAX) {
    return { ok: false, reason: "output_too_large" };
  }
  if (containsProhibitedContent(outputText)) {
    return { ok: false, reason: "prohibited_output_content" };
  }
  return { ok: true, text: outputText };
}

/** Safe human-readable message for capability output fallback reasons. */
export function capabilityOutputFallbackMessage(reason: string): string {
  switch (reason) {
    case "empty_output":
      return "Capability produced empty output";
    case "output_too_large":
      return "Capability output exceeded maximum allowed size";
    default:
      return "Output contains prohibited content";
  }
}

/**
 * Deterministic, non-empty prompt for a node capability, including the
 * (already safety-checked) request input. Used by both fake and real runners
 * for non-implementation capabilities (implementation-like requests use the
 * dedicated prompt builder with ImplementationExecutorInput).
 */
export function buildCapabilityPrompt(
  request: ExecutionRequest,
  capability: NodeCapabilityId,
  inputText: string,
): string {
  const outcomeInstructions: string[] = [];
  if (capability === "solution-gate") {
    outcomeInstructions.push("End with exactly one line: GATE_RESULT: PASS, FAIL, or PASS_WITH_RISK.");
  }
  if (capability === "solution-gate" || capability === "code-review") {
    outcomeInstructions.push("End with exactly one line: UNRESOLVED_FINDINGS_JSON: <JSON array>.");
  }
  return [
    `You are executing the ${capability} node of an SDLC loop.`,
    `Requirement ID: ${request.requirementId}`,
    `Node: ${request.node}`,
    `Input: ${inputText}`,
    ...outcomeInstructions,
  ].join("\n");
}

/** Parse only explicit, line-delimited machine outcome markers. */
export function parseCapabilityOutcomeMarkers(
  capability: NodeCapabilityId,
  outputText: string,
): Readonly<Record<string, unknown>> {
  const outcome: Record<string, unknown> = Object.create(null);
  if (capability === "solution-gate") {
    const matches = [...outputText.matchAll(/^GATE_RESULT: (PASS|FAIL|PASS_WITH_RISK)$/gm)];
    if (matches.length === 1) outcome.gateResult = matches[0]![1];
  }
  if (capability === "solution-gate" || capability === "code-review") {
    const matches = [...outputText.matchAll(/^UNRESOLVED_FINDINGS_JSON: (.+)$/gm)];
    if (matches.length === 1) {
      try {
        const parsed = JSON.parse(matches[0]![1]!);
        if (Array.isArray(parsed)) outcome.unresolvedFindings = parsed;
      } catch {
        // Missing field is intentional: the tracing Gateway will reject the
        // outcome contract instead of guessing that there are no findings.
      }
    }
  }
  return Object.freeze(outcome);
}

function fakeCapabilityOutcome(capability: NodeCapabilityId): Readonly<Record<string, unknown>> {
  if (capability === "solution-gate") {
    return Object.freeze({ gateResult: "PASS", unresolvedFindings: Object.freeze([]) });
  }
  if (capability === "code-review") {
    return Object.freeze({ unresolvedFindings: Object.freeze([]) });
  }
  return Object.freeze({});
}

/**
 * Builds the canonical output artifact for a non-implementation capability:
 * the (already safety-checked, non-truncated) executor text output becomes
 * the node product content, typed by CAPABILITY_ARTIFACT_TYPES. No code-patch
 * parsing is applied to non-implementation capabilities.
 */
export function buildCapabilityTextArtifact(
  request: ExecutionRequest,
  capability: NodeCapabilityId,
  outputText: string,
  artifactType: ExecutionArtifactType,
  agent: string,
): ExecutionArtifact {
  return createArtifact({
    id: `${request.requirementId}:${request.node}:${artifactType}:capability-text`,
    requirementId: request.requirementId,
    node: request.node,
    type: artifactType,
    content: {
      node_output: outputText,
      parser_summary: "capability_text_output",
    },
    agent: agent as ExecutionRequest["agent"],
    source: "execution_gateway",
    createdAt: new Date().toISOString(),
  });
}

export type CodexFakeRunnerScenario =
  | "success_code_patch"
  | "cli_missing"
  | "timeout"
  | "non_zero_exit"
  | "output_too_large"
  | "prohibited_output_content"
  | "missing_file_path"
  | "empty_patch"
  | "parse_error";

export interface CodexRunnerOptions {
  scenario: CodexFakeRunnerScenario;
  promptBuilderLimits?: PromptBuilderLimits;
  outputParserLimits?: OutputParserLimits;
}

export interface CodexRunner {
  run(request: ExecutionRequest): Promise<ExecutionResult>;
}

function buildShadowFallbackResult(
  request: ExecutionRequest,
  reason: string,
  fallbackAction: string,
  safeMessage: string
): ExecutionResult {
  const shadowArtifact: ExecutionArtifact = createArtifact({
    id: `${request.requirementId}:${request.node}:shadow_output:codex-fallback`,
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

function buildSyntheticStdout(scenario: CodexFakeRunnerScenario): string {
  switch (scenario) {
    case "success_code_patch":
      return [
        "```codex-code-patch",
        "FILE: src/generated-codex-patch.ts",
        "PATCH:",
        "// Generated by fake Codex runner",
        "export function generatedCodexPatch() {",
        "  return true;",
        "}",
        "```",
      ].join("\n");
    case "missing_file_path":
      return [
        "PATCH:",
        "// Missing file path",
      ].join("\n");
    case "empty_patch":
      return [
        "FILE: src/empty.ts",
        "PATCH:",
      ].join("\n");
    case "parse_error":
      return "This output does not match the expected format at all.";
    case "output_too_large":
      // Return a syntactically valid but oversized patch; parser catches size first.
      return [
        "FILE: src/large.ts",
        "PATCH:",
        "x".repeat(DEFAULT_OUTPUT_PARSER_LIMITS.maxPatchChars + 1000),
      ].join("\n");
    case "prohibited_output_content":
      return [
        "FILE: src/secret.ts",
        "PATCH:",
        "const password = 'hunter2';",
      ].join("\n");
    case "cli_missing":
    case "timeout":
    case "non_zero_exit":
    default:
      // CLI-level failures do not produce stdout for the parser.
      return "";
  }
}

/**
 * Creates a test-only fake Codex runner. The runner consumes an
 * ImplementationExecutorInput placed at `request.input.implementationExecutorInput`,
 * builds a bounded prompt, simulates the selected scenario, and returns a sanitized
 * ExecutionResult.
 */
export function createCodexFakeRunner(options: CodexRunnerOptions): CodexRunner {
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

      switch (options.scenario) {
        case "cli_missing":
          return buildShadowFallbackResult(
            request,
            "cli_missing",
            "shadow_fallback",
            "Codex CLI not available"
          );
        case "timeout":
          return buildShadowFallbackResult(
            request,
            "timeout",
            "shadow_fallback",
            "Codex CLI timed out"
          );
        case "non_zero_exit":
          return buildShadowFallbackResult(
            request,
            "non_zero_exit",
            "shadow_fallback",
            "Codex CLI exited with non-zero status"
          );
      }

      const stdout = buildSyntheticStdout(options.scenario);
      const artifactType: ExecutionArtifactType = CAPABILITY_ARTIFACT_TYPES[effectiveCapability];

      if (!isImplementationLike) {
        // Fail-closed: oversized or sensitive output must never become a
        // successful node product (no silent truncation, no secret leak).
        const outputCheck = checkCapabilityOutput(stdout);
        if (outputCheck.ok === false) {
          return buildShadowFallbackResult(
            request,
            outputCheck.reason,
            "reject_and_shadow_fallback",
            capabilityOutputFallbackMessage(outputCheck.reason)
          );
        }
      }

      // C01 WP-3: per-capability parsing and artifact construction.
      // Implementation-like requests parse a code patch; other capabilities
      // take the executor text output as the node product (no code-patch
      // parsing is applied).
      let artifact: ExecutionArtifact;
      if (isImplementationLike) {
        const parseResult = parseCodexOutput(
          stdout,
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
          id: `${request.requirementId}:${request.node}:${artifactType}:codex-fake`,
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
          stdout,
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
          output_char_count: stdout.length,
          ...fakeCapabilityOutcome(effectiveCapability),
        },
        artifacts: [artifact],
      };
    },
  };
}
