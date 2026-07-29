// LOOP Executor Kernel — Codex Output Parser
// ============================================
// Pure framing parser. Extracts exactly one multi-file unified diff from
// bounded stdout. No filesystem, child_process, Git, D04 parser, or
// Artifact Store imports.
//
// The parser handles the framing contract:
//   ```codex-unified-diff
//   <unified diff>
//   ```
// It uses the LAST closing fence to avoid being fooled by inner fences.

import { createHash } from "node:crypto";

// ═══════════════════════════════════════ Types

export interface LoopCodexOutputLimits {
  readonly maxStdoutBytes: number;
  readonly maxPatchBytes: number;
}

export const DEFAULT_OUTPUT_LIMITS: LoopCodexOutputLimits = {
  maxStdoutBytes: 1048576,
  maxPatchBytes: 1048576,
};

export type LoopCodexOutputResult =
  | {
      readonly ok: true;
      readonly patchBytes: Uint8Array;
      readonly patchDigestSha256: string;
      readonly patchSizeBytes: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

// ═══════════════════════════════════════ Constants

const OPENING_MARKER = "```codex-unified-diff";
const CLOSING_FENCE = "```";
const LF = "\n".charCodeAt(0);

// ═══════════════════════════════════════ Helpers

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasReplacementChar(text: string): boolean {
  return text.includes("\uFFFD");
}

function isWhitespaceOnly(s: string): boolean {
  return /^[\x20\x09\x0a\x0d]*$/.test(s);
}

// ═══════════════════════════════════════ Parser

/**
 * Parses bounded Codex stdout to extract exactly one multi-file unified diff.
 *
 * Framing rules:
 *  - Opening marker must appear exactly once on its own line.
 *  - The last non-empty line of stdout must be exactly the closing fence.
 *  - Only whitespace before the opening marker.
 *  - Only whitespace after the closing fence.
 *  - The extracted patch must be non-empty and end with LF.
 *
 * The parser uses the LAST closing fence line to handle inner markdown fences
 * that may appear inside the unified diff content.
 *
 * @param stdout - Raw stdout bytes from the Codex process.
 * @param limits  - Size limits.
 * @returns Discriminated parse result.
 */
export function parseLoopCodexOutput(
  stdout: Uint8Array,
  limits: LoopCodexOutputLimits = DEFAULT_OUTPUT_LIMITS,
): LoopCodexOutputResult {
  // ── Size check ──
  if (stdout.byteLength > limits.maxStdoutBytes) {
    return { ok: false, reason: "stdout too large" };
  }

  // ── UTF-8 decode ──
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
  } catch {
    return { ok: false, reason: "invalid UTF-8" };
  }

  // ── No replacement character ──
  if (hasReplacementChar(text)) {
    return { ok: false, reason: "replacement character" };
  }

  // ── Find opening marker ──
  const openIdx = text.indexOf(OPENING_MARKER);
  if (openIdx === -1) {
    return { ok: false, reason: "missing opening marker" };
  }

  // ── Only one opening marker ──
  const secondOpenIdx = text.indexOf(OPENING_MARKER, openIdx + OPENING_MARKER.length);
  if (secondOpenIdx !== -1) {
    return { ok: false, reason: "multiple opening markers" };
  }

  // ── Preamble before opening must be whitespace-only ──
  const preamble = text.slice(0, openIdx);
  if (!isWhitespaceOnly(preamble)) {
    return { ok: false, reason: "non-whitespace preamble" };
  }

  // ── Opening line must be exactly the marker (rest of line whitespace only) ──
  const openLineEnd = text.indexOf("\n", openIdx);
  if (openLineEnd === -1) {
    return { ok: false, reason: "malformed opening line" };
  }
  const openLine = text.slice(openIdx, openLineEnd);
  if (openLine !== OPENING_MARKER) {
    return { ok: false, reason: "malformed opening line"};
  }

  // ── Find the LAST closing fence line ──
  // Search from end of text backwards for the last occurrence of a line
  // that is exactly "```" (possibly preceded only by whitespace on that line).
  let lastClosingIdx = -1;
  let lastClosingLineEnd = -1;
  let searchPos = text.length;

  while (searchPos > openLineEnd + 1) {
    // Find previous newline
    const prevNewline = text.lastIndexOf("\n", searchPos - 1);
    if (prevNewline === -1) break;

    const lineStart = prevNewline + 1;
    const lineContent = text.slice(lineStart, searchPos);

    // A line is exactly "```" if trimmed it equals "```" and nothing else non-whitespace
    const trimmed = lineContent.trimEnd();
    // Remove trailing \r if any (though CR should already be rejected, be safe)
    const clean = trimmed.endsWith("\r") ? trimmed.slice(0, -1) : trimmed;

    if (clean === CLOSING_FENCE) {
      lastClosingIdx = lineStart;
      // The closing fence line should end at the start of the closing fence plus 3
      // We need the position of the fence characters themselves
      const fenceStartInLine = lineContent.indexOf(CLOSING_FENCE);
      lastClosingLineEnd = lineStart + fenceStartInLine + CLOSING_FENCE.length;
      break;
    }

    searchPos = prevNewline;
  }

  if (lastClosingIdx === -1) {
    return { ok: false, reason: "missing closing fence" };
  }

  // ── Last non-empty line check ──
  // Find the last non-empty line
  const lines = text.split("\n");
  let lastNonEmptyIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.trim().length > 0) {
      lastNonEmptyIdx = i;
      break;
    }
  }
  if (lastNonEmptyIdx === -1) {
    return { ok: false, reason: "missing closing fence" };
  }

  // The line containing the closing fence must be the last non-empty line
  const closingLineIdx = text.slice(0, lastClosingIdx).split("\n").length - 1;
  if (closingLineIdx !== lastNonEmptyIdx) {
    return { ok: false, reason: "trailing non-whitespace content" };
  }

  // ── Closing line must be exactly "```" ──
  const closingLineContent = lines[closingLineIdx]!;
  if (closingLineContent.trim() !== CLOSING_FENCE) {
    return { ok: false, reason: "malformed closing line" };
  }

  // ── Trailing text after closing fence must be whitespace-only ──
  const afterClosing = text.slice(lastClosingLineEnd);
  if (!isWhitespaceOnly(afterClosing)) {
    return { ok: false, reason: "non-whitespace trailing text" };
  }

  // ── Extract patch between opening line end and closing line start ──
  const patchText = text.slice(openLineEnd + 1, lastClosingIdx);

  // ── Patch must be non-empty ──
  if (patchText.trim().length === 0) {
    return { ok: false, reason: "empty patch" };
  }

  // ── Patch must end with LF ──
  if (patchText.length === 0 || patchText.charCodeAt(patchText.length - 1) !== LF) {
    return { ok: false, reason: "patch must end with LF" };
  }

  // ── Encode to bytes ──
  const patchBytes = new TextEncoder().encode(patchText);

  // ── Size check ──
  if (patchBytes.byteLength > limits.maxPatchBytes) {
    return { ok: false, reason: "patch too large" };
  }

  // ── Digest ──
  const patchDigestSha256 = sha256Hex(patchBytes);
  const patchSizeBytes = patchBytes.byteLength;

  return {
    ok: true,
    patchBytes,
    patchDigestSha256,
    patchSizeBytes,
  };
}
