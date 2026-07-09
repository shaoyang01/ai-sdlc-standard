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

function parsePatch(stdout: string): ParsedPatch | null {
  const fileMatch = stdout.match(/FILE:\s*(.+)/);
  if (!fileMatch) return null;
  const file = fileMatch[1].trim();

  const patchIndex = stdout.indexOf("PATCH:");
  if (patchIndex === -1) return null;
  const patch = stdout.slice(patchIndex + 6).trim();

  return { file, patch };
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

  const parsed = parsePatch(stdout);
  if (!parsed) {
    return {
      ok: false,
      reason: safeMessage("missing_file_path", limits),
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  if (parsed.file.length > limits.maxFilePathChars) {
    return {
      ok: false,
      reason: safeMessage("missing_file_path", limits),
      fallbackAction: "reject_and_shadow_fallback",
    };
  }

  if (parsed.patch.length === 0 || parsed.patch.length > limits.maxPatchChars) {
    return {
      ok: false,
      reason: safeMessage(parsed.patch.length === 0 ? "empty_patch" : "output_too_large", limits),
      fallbackAction: parsed.patch.length === 0 ? "reject_and_shadow_fallback" : "truncate_and_shadow_fallback",
    };
  }

  if (containsProhibitedContent(parsed.patch) || containsProhibitedContent(parsed.file)) {
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
      file: parsed.file,
      patch: parsed.patch,
      parser_summary: "parsed_from_synthetic_stdout",
    },
    agent: "codex",
    source: "execution_gateway",
    createdAt: new Date().toISOString(),
  });

  return { ok: true, artifact };
}
