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
//
// R1: Exact framing — no leading/trailing spaces on opening/closing lines,
// CR rejection, single opening marker enforcement, precise closing rules.

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
const CR = "\r".charCodeAt(0);

// ═══════════════════════════════════════ Helpers

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasReplacementChar(text: string): boolean {
  return text.includes("\uFFFD");
}

function hasCR(text: string): boolean {
  return text.includes("\r");
}

function isWhitespaceOnly(s: string): boolean {
  return /^[\x20\x09\x0a\x0d]*$/.test(s);
}

// ═══════════════════════════════════════ Parser

/**
 * Parses bounded Codex stdout to extract exactly one multi-file unified diff.
 *
 * R1 framing rules:
 *  - Opening marker must appear exactly once on its own line.
 *  - Opening marker line must consist of exactly `\`\`\`codex-unified-diff`
 *    with no leading spaces, no trailing spaces, and no other characters.
 *  - Only whitespace before the opening marker on preceding lines (preamble).
 *  - The last non-empty line of stdout must be exactly the closing fence `\`\`\``.
 *  - Closing line must have no leading or trailing whitespace.
 *  - Only whitespace after the closing fence.
 *  - No CR characters anywhere in stdout.
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

  // ── UTF-8 decode (fatal) ──
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

  // ── No CR characters ──
  if (hasCR(text)) {
    return { ok: false, reason: "CR not allowed" };
  }

  // ── Find opening marker position ──
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

  // ── Opening line must be EXACTLY the marker with no leading/trailing spaces ──
  // Check: no space/tab before the marker on the same line
  const lineStart = text.lastIndexOf("\n", openIdx - 1) + 1;
  if (lineStart !== openIdx) {
    return { ok: false, reason: "leading whitespace on opening line" };
  }

  // Find end of opening line
  const openLineEnd = text.indexOf("\n", openIdx);
  if (openLineEnd === -1) {
    return { ok: false, reason: "malformed opening line" };
  }
  const openLine = text.slice(openIdx, openLineEnd);
  // Must be exactly the marker — no trailing spaces
  if (openLine !== OPENING_MARKER) {
    return { ok: false, reason: "malformed opening line" };
  }

  // ── Find the LAST closing fence line ──
  // Search backwards for a line that is EXACTLY "```" (no leading/trailing whitespace)
  const lines = text.split("\n");
  let lastClosingLineNum = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line === CLOSING_FENCE) {
      lastClosingLineNum = i;
      break;
    }
  }

  if (lastClosingLineNum === -1) {
    return { ok: false, reason: "missing closing fence" };
  }

  // ── Closing line must be the last non-empty line ──
  let lastNonEmptyLineNum = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.length > 0) {
      lastNonEmptyLineNum = i;
      break;
    }
  }
  if (lastNonEmptyLineNum === -1) {
    return { ok: false, reason: "missing closing fence" };
  }
  if (lastClosingLineNum !== lastNonEmptyLineNum) {
    return { ok: false, reason: "trailing non-whitespace content" };
  }

  // ── Closing line must be EXACTLY "```" with no leading/trailing whitespace ──
  const closingLine = lines[lastClosingLineNum]!;
  if (closingLine !== CLOSING_FENCE) {
    return { ok: false, reason: "malformed closing line" };
  }

  // ── Trailing text after closing fence (after the closing line's newline)
  // must be whitespace-only ──
  // Find the byte position of the closing line end
  let closingLineEndPos = 0;
  for (let i = 0, lineNum = 0; i < text.length && lineNum <= lastClosingLineNum; i++) {
    if (lineNum === lastClosingLineNum) {
      closingLineEndPos = i + closingLine.length;
      break;
    }
    if (text[i] === "\n") lineNum++;
  }

  const afterClosing = text.slice(closingLineEndPos);
  if (!isWhitespaceOnly(afterClosing)) {
    return { ok: false, reason: "non-whitespace trailing text" };
  }

  // ── Extract patch between opening line end and closing line start ──
  // Find the byte position of the closing line start
  let closingLineStartPos = 0;
  for (let i = 0, lineNum = 0; i < text.length; i++) {
    if (lineNum === lastClosingLineNum) {
      closingLineStartPos = i;
      break;
    }
    if (text[i] === "\n") lineNum++;
  }

  const patchText = text.slice(openLineEnd + 1, closingLineStartPos);

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
