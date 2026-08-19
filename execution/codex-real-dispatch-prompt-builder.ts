// Codex Real Dispatch Prompt Builder
// ===================================
// Builds a bounded, sanitized prompt from ImplementationExecutorInput for future
// real Codex dispatch. Default-off; used only when a runner is explicitly injected.
// No child_process, network, filesystem, or CLI imports.
// Does not dump raw Runtime context, raw artifacts, or full patch content.

import type { RequirementSummary } from "../core/runtime-executors";

export interface PromptBuilderResult {
  ok: boolean;
  prompt?: string;
  reason?: string;
  fallbackAction?: "reject_and_shadow_fallback";
}

export interface PromptBuilderLimits {
  maxPromptChars: number;
  maxRequirementChars: number;
  maxDesignChars: number;
  maxReviewChars: number;
}

export const DEFAULT_PROMPT_BUILDER_LIMITS: PromptBuilderLimits = {
  maxPromptChars: 16000,
  maxRequirementChars: 4000,
  maxDesignChars: 4000,
  maxReviewChars: 2000,
};

// Structural match for ImplementationExecutorInput so callers can pass the real
// typed object without creating a circular dependency between execution/ and core/.
export interface CodexPromptBuilderInput {
  requirement: string;
  requirementId: string;
  summary: RequirementSummary;
  designOutput: unknown;
  reviewOutput: unknown;
  complexity?: "low" | "medium" | "high";
  executionMode: "direct" | "speckit";
}

const PROHIBITED_PATTERNS = [
  "secret",
  "secrets",
  "token",
  "tokens",
  "api_key",
  "api-key",
  "apikey",
  "password",
  "passwords",
  "private_key",
  "private-key",
  "privatekey",
  "credential",
  "credentials",
  "environment_variable",
  "env_var",
  "envvar",
  "BEGIN RSA PRIVATE KEY",
  "BEGIN OPENSSH PRIVATE KEY",
  "BEGIN PRIVATE KEY",
  "AKIA",
  "ghp_",
  "sk-",
];

/**
 * Shared sensitive-content detection used by the implementation prompt
 * builder and the capability paths (C01 WP-3). Case-insensitive substring
 * match against known credential/secret patterns.
 */
export function containsProhibitedContent(value: string): boolean {
  const lower = value.toLowerCase();
  return PROHIBITED_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function safeJsonPreview(value: unknown, maxChars: number): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return truncate(json, maxChars);
  } catch {
    return truncate(String(value), maxChars);
  }
}

/**
 * Builds a bounded Codex prompt from the structured implementation executor input.
 * Returns a fallback result if limits are exceeded or prohibited content is detected.
 */
export function buildCodexPrompt(
  input: CodexPromptBuilderInput,
  limits: PromptBuilderLimits = DEFAULT_PROMPT_BUILDER_LIMITS
): PromptBuilderResult {
  const requirement = truncate(input.requirement ?? "", limits.maxRequirementChars);
  const designPreview = safeJsonPreview(input.designOutput, limits.maxDesignChars);
  const reviewPreview = safeJsonPreview(input.reviewOutput, limits.maxReviewChars);
  const summaryPreview = safeJsonPreview(input.summary, limits.maxRequirementChars);

  const candidateText = [
    requirement,
    designPreview,
    reviewPreview,
    summaryPreview,
    input.requirementId,
    input.complexity ?? "",
    input.executionMode,
  ].join(" ");

  if (containsProhibitedContent(candidateText)) {
    return {
      ok: false,
      reason: "prohibited_prompt_content",
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  const prompt = [
    "# Task Summary",
    `Requirement ID: ${input.requirementId}`,
    `Execution mode: ${input.executionMode}`,
    `Complexity: ${input.complexity ?? "unspecified"}`,
    "",
    "# Requirement",
    requirement,
    "",
    "# Structured Design",
    designPreview,
    "",
    "# Implementation Constraints",
    "- Generate a single code patch.",
    "- Include the target file path.",
    "- Do not include secrets, credentials, or environment variables.",
    "",
    "# Expected Output Contract",
    "Return the output inside a structured fenced block with the exact format below:",
    "",
    "```codex-code-patch",
    "FILE: <relative-file-path>",
    "PATCH:",
    "<sanitized unified diff or code patch>",
    "```",
    "",
    "Do not include raw stdout, raw stderr, secrets, credentials, or environment variables.",
  ].join("\n");

  if (prompt.length > limits.maxPromptChars) {
    return {
      ok: false,
      reason: "prompt_too_large",
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  return { ok: true, prompt };
}
