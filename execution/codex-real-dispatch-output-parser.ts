// Codex Real Dispatch Output Parser
// ==================================
// Parses synthetic Codex-like stdout into a sanitized code_patch artifact.
// No child_process, network, filesystem, or CLI imports.
// Does not expose or persist raw stdout/stderr.

import { createArtifact, Artifact } from "../core/artifact";

export interface OutputParserResult {
  ok: boolean;
  artifact?: Artifact;
  reason?: string;
  fallbackAction?: "reject_and_shadow_fallback" | "truncate_and_shadow_fallback";
}

export interface OutputParserLimits {
  maxStdoutChars: number;
  maxPatchChars: number;
  maxFilePathChars: number;
  maxSafeMessageChars: number;
}

export const DEFAULT_OUTPUT_PARSER_LIMITS: OutputParserLimits = {
  maxStdoutChars: 64000,
  maxPatchChars: 32000,
  maxFilePathChars: 512,
  maxSafeMessageChars: 512,
};

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

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function containsProhibitedContent(value: string): boolean {
  const lower = value.toLowerCase();
  return PROHIBITED_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

function safeMessage(reason: string, limits: OutputParserLimits): string {
  return truncate(reason, limits.maxSafeMessageChars);
}

interface ParsedPatch {
  file: string;
  patch: string;
}

function extractStructuredOutput(stdout: string): string {
  const fenceStart = stdout.indexOf("```codex-code-patch");
  if (fenceStart === -1) return stdout;

  const contentStart = stdout.indexOf("\n", fenceStart);
  if (contentStart === -1) return stdout;

  const fenceEnd = stdout.indexOf("```", contentStart + 1);
  if (fenceEnd === -1) return stdout;

  return stdout.slice(contentStart + 1, fenceEnd).trim();
}

function parsePatch(stdout: string): { kind: "ok"; parsed: ParsedPatch } | { kind: "missing_file_path" | "empty_patch" | "parse_error" } {
  const hasFile = stdout.includes("FILE:");
  const hasPatch = stdout.includes("PATCH:");

  // No FILE and no PATCH, or FILE without PATCH => parse_error
  if ((!hasFile && !hasPatch) || (hasFile && !hasPatch)) {
    return { kind: "parse_error" };
  }

  // PATCH exists but FILE missing => missing_file_path
  const fileMatch = stdout.match(/FILE:\s*(.+)/);
  if (!fileMatch) {
    return { kind: "missing_file_path" };
  }

  const file = fileMatch[1].trim();
  const patchIndex = stdout.indexOf("PATCH:");
  if (patchIndex === -1) {
    return { kind: "parse_error" };
  }
  const patch = stdout.slice(patchIndex + 6).trim();

  if (patch.length === 0) {
    return { kind: "empty_patch" };
  }

  return { kind: "ok", parsed: { file, patch } };
}

/**
 * Parses synthetic Codex stdout into a sanitized code_patch artifact.
 * Returns a fallback result on missing file path, empty patch, oversized output,
 * or prohibited content.
 */
export function parseCodexOutput(
  stdout: string,
  requirementId: string,
  node: string,
  limits: OutputParserLimits = DEFAULT_OUTPUT_PARSER_LIMITS
): OutputParserResult {
  if (stdout.length > limits.maxStdoutChars) {
    return {
      ok: false,
      reason: safeMessage("output_too_large", limits),
      fallbackAction: "truncate_and_shadow_fallback",
    };
  }

  const structuredOutput = extractStructuredOutput(stdout);
  const parsed = parsePatch(structuredOutput);
  if (parsed.kind !== "ok") {
    return {
      ok: false,
      reason: safeMessage(parsed.kind, limits),
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  const { file, patch } = parsed.parsed;

  if (file.length > limits.maxFilePathChars) {
    return {
      ok: false,
      reason: safeMessage("missing_file_path", limits),
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  if (patch.length > limits.maxPatchChars) {
    return {
      ok: false,
      reason: safeMessage("output_too_large", limits),
      fallbackAction: "truncate_and_shadow_fallback",
    };
  }

  if (containsProhibitedContent(patch) || containsProhibitedContent(file)) {
    return {
      ok: false,
      reason: safeMessage("prohibited_output_content", limits),
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  const artifact = createArtifact({
    id: `${requirementId}:${node}:code_patch:codex-fake`,
    requirementId,
    node,
    type: "code_patch",
    content: {
      file,
      patch,
      parser_summary: "parsed_from_synthetic_stdout",
    },
    agent: "codex",
    source: "execution_gateway",
    createdAt: new Date().toISOString(),
  });

  return { ok: true, artifact };
}
