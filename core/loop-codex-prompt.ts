// LOOP Executor Kernel — Codex Implementation Prompt Builder
// =============================================================
// Pure functions only. No filesystem, child_process, network, logging,
// or environment access. Builds a bounded, phase-specific prompt for the
// LOOP Codex multi-file implementation adapter.
//
// The prompt instructs Codex to produce exactly one fenced multi-file
// unified diff block with the framing contract defined below.

// ═══════════════════════════════════════ Types

export type LoopCodexImplementationPhase = "initial" | "test_repair" | "review_repair";

export const LOOP_CODEX_IMPLEMENTATION_PHASES: readonly LoopCodexImplementationPhase[] = [
  "initial",
  "test_repair",
  "review_repair",
] as const;

export interface LoopCodexPromptInput {
  readonly phase: LoopCodexImplementationPhase;
  readonly attempt: number;
  readonly requirementId: string;
  readonly requirement: string;
  readonly designSummary?: string;
  readonly implementationConstraints?: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly repairEvidenceSummary?: string;
}

export interface LoopCodexPromptLimits {
  readonly maxRequirementBytes: number;
  readonly maxDesignSummaryBytes: number;
  readonly maxConstraintBytes: number;
  readonly maxConstraints: number;
  readonly maxAllowedPaths: number;
  readonly maxRepairEvidenceBytes: number;
  readonly maxPromptBytes: number;
}

export const DEFAULT_PROMPT_LIMITS: LoopCodexPromptLimits = {
  maxRequirementBytes: 16384,
  maxDesignSummaryBytes: 16384,
  maxConstraintBytes: 2048,
  maxConstraints: 64,
  maxAllowedPaths: 128,
  maxRepairEvidenceBytes: 32768,
  maxPromptBytes: 65536,
};

export type LoopCodexPromptResult =
  | { readonly ok: true; readonly prompt: string }
  | { readonly ok: false; readonly reason: string };

// ═══════════════════════════════════════ Constants

const NON_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const OPENING_MARKER = "```codex-unified-diff";
const CLOSING_FENCE = "```";

// ═══════════════════════════════════════ Helpers

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function asTrimmedNonEmpty(v: unknown, label: string): string {
  if (typeof v !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const t = v.trim();
  if (t.length === 0 || t !== v) {
    throw new Error(`${label} must be trimmed non-empty`);
  }
  return v;
}

function checkNoControl(s: string, label: string): void {
  if (NON_CONTROL_RE.test(s)) {
    throw new Error(`${label} contains control characters`);
  }
}

function checkMaxBytes(s: string, maxBytes: number, label: string): void {
  if (byteLength(s) > maxBytes) {
    throw new Error(`${label} exceeds max bytes`);
  }
}

// ═══════════════════════════════════════ Builder

/**
 * Builds a bounded, phase-specific Codex implementation prompt.
 * Returns a discriminated result: `{ ok: true, prompt }` on success,
 * `{ ok: false, reason }` when limits are exceeded.
 *
 * The prompt is a pure function of its input — no filesystem, process,
 * network, or environment access.
 */
export function buildLoopCodexPrompt(
  input: LoopCodexPromptInput,
  limits: LoopCodexPromptLimits = DEFAULT_PROMPT_LIMITS,
): LoopCodexPromptResult {
  try {
  // ── Validate input ──
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid input" };
  }

  const phase = input.phase;
  if (typeof phase !== "string" || !LOOP_CODEX_IMPLEMENTATION_PHASES.includes(phase)) {
    return { ok: false, reason: "invalid phase" };
  }

  const attempt = input.attempt;
  if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 0) {
    return { ok: false, reason: "invalid attempt" };
  }

  const requirementId = asTrimmedNonEmpty(input.requirementId, "requirementId");
  checkNoControl(requirementId, "requirementId");
  const requirement = asTrimmedNonEmpty(input.requirement, "requirement");
  checkNoControl(requirement, "requirement");
  checkMaxBytes(requirement, limits.maxRequirementBytes, "requirement");

  // ── Bounded design summary ──
  let designSummary = "";
  if (input.designSummary !== undefined) {
    if (typeof input.designSummary !== "string") {
      return { ok: false, reason: "invalid designSummary" };
    }
    designSummary = input.designSummary.trim();
    if (designSummary.length > 0) {
      checkMaxBytes(designSummary, limits.maxDesignSummaryBytes, "designSummary");
    }
  }

  // ── Bounded implementation constraints ──
  let constraints: readonly string[] = [];
  if (input.implementationConstraints !== undefined) {
    if (!Array.isArray(input.implementationConstraints)) {
      return { ok: false, reason: "invalid implementationConstraints" };
    }
    if (input.implementationConstraints.length > limits.maxConstraints) {
      return { ok: false, reason: "too many constraints" };
    }
    for (const c of input.implementationConstraints) {
      if (typeof c !== "string") {
        return { ok: false, reason: "invalid constraint" };
      }
      const trimmed = c.trim();
      if (trimmed.length === 0) {
        return { ok: false, reason: "empty constraint" };
      }
      checkMaxBytes(trimmed, limits.maxConstraintBytes, "constraint");
    }
    constraints = input.implementationConstraints;
  }

  // ── Allowed paths ──
  if (!Array.isArray(input.allowedPaths)) {
    return { ok: false, reason: "invalid allowedPaths" };
  }
  if (input.allowedPaths.length === 0) {
    return { ok: false, reason: "empty allowedPaths" };
  }
  if (input.allowedPaths.length > limits.maxAllowedPaths) {
    return { ok: false, reason: "too many allowedPaths" };
  }
  const seenPaths = new Set<string>();
  for (const p of input.allowedPaths) {
    if (typeof p !== "string") {
      return { ok: false, reason: "invalid allowedPath" };
    }
    const trimmed = p.trim();
    if (trimmed.length === 0 || trimmed !== p) {
      return { ok: false, reason: "invalid allowedPath" };
    }
    if (seenPaths.has(p)) {
      return { ok: false, reason: "duplicate allowedPath" };
    }
    seenPaths.add(p);
  }

  // ── Repair evidence (repair phases only) ──
  let repairEvidenceSummary = "";
  if (input.repairEvidenceSummary !== undefined) {
    if (phase === "initial") {
      return { ok: false, reason: "initial phase must not carry evidence" };
    }
    if (typeof input.repairEvidenceSummary !== "string") {
      return { ok: false, reason: "invalid repairEvidenceSummary" };
    }
    repairEvidenceSummary = input.repairEvidenceSummary.trim();
    if (repairEvidenceSummary.length === 0) {
      return { ok: false, reason: "empty repairEvidenceSummary" };
    }
    checkMaxBytes(repairEvidenceSummary, limits.maxRepairEvidenceBytes, "repairEvidenceSummary");
  } else if (phase !== "initial") {
    return { ok: false, reason: "repair phase requires evidence" };
  }

  // ── Build phase label ──
  const phaseLabel =
    phase === "initial" ? "Initial Implementation"
    : phase === "test_repair" ? "Test-Failure Repair"
    : "Review-Feedback Repair";

  // ── Build prompt sections ──
  const sections: string[] = [];

  sections.push(`# ${phaseLabel}`);
  sections.push("");
  sections.push("## Task Identity");
  sections.push(`- Requirement ID: ${requirementId}`);
  sections.push(`- Phase: ${phase}`);
  sections.push(`- Attempt: ${attempt}`);
  sections.push("");

  sections.push("## Requirement");
  sections.push(requirement);
  sections.push("");

  if (designSummary.length > 0) {
    sections.push("## Design Summary");
    sections.push(designSummary);
    sections.push("");
  }

  if (constraints.length > 0) {
    sections.push("## Implementation Constraints");
    for (const c of constraints) {
      sections.push(`- ${c}`);
    }
    sections.push("");
  }

  sections.push("## Allowed Paths");
  sections.push("You may only modify files within these exact paths:");
  for (const p of input.allowedPaths) {
    sections.push(`- ${p}`);
  }
  sections.push("");

  if (repairEvidenceSummary.length > 0) {
    sections.push("## Repair Evidence");
    sections.push("The previous attempt failed. Below is bounded evidence for the repair:");
    sections.push(repairEvidenceSummary);
    sections.push("");
  }

  sections.push("## Rules");
  sections.push("1. You are running in a read-only sandbox. The process cwd is the target workspace — you may read files for context but must not run destructive commands.");
  sections.push("2. Do NOT commit, push, create a PR, merge, or modify Git HEAD or the index.");
  sections.push("3. Do NOT run shell commands that modify the filesystem.");
  sections.push("4. Produce exactly ONE multi-file unified diff.");
  sections.push("5. The diff MUST only touch files within the allowed paths listed above.");
  sections.push("6. Do NOT include explanatory prose, shell commands, JSON, or extra code blocks.");
  sections.push("");

  sections.push("## Output Format");
  sections.push("Your entire response must be exactly one fenced block:");
  sections.push("");
  sections.push(OPENING_MARKER);
  sections.push("<unified diff content — one or more files>");
  sections.push(CLOSING_FENCE);
  sections.push("");
  sections.push("The opening line must be exactly three backtick characters followed by `codex-unified-diff`.");
  sections.push("The closing line must be exactly three backtick characters on its own line.");
  sections.push("Every unified diff must end with a final newline (LF).");
  sections.push("Do not output anything before the opening fence or after the closing fence.");

  const prompt = sections.join("\n");

  // ── Check prompt size ──
  if (byteLength(prompt) > limits.maxPromptBytes) {
    return { ok: false, reason: "prompt too large" };
  }

  return { ok: true, prompt };
  } catch {
    return { ok: false, reason: "invalid input" };
  }
}
