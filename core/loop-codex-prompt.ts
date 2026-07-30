// LOOP Executor Kernel — Codex Implementation Prompt Builder
// =============================================================
// Pure functions only. No filesystem, child_process, network, logging,
// or environment access. Builds a bounded, phase-specific prompt for the
// LOOP Codex multi-file implementation adapter.
//
// The prompt instructs Codex to produce exactly one fenced multi-file
// unified diff block with the framing contract defined below.
//
// R1: Dynamic data is placed in a deterministic structured JSON payload
// inside fixed text boundaries. No dynamic fields appear as free-form
// Markdown sections. User input is isolated through JSON escaping.

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

export type LoopCodexPromptFailureReason =
  | "invalid_input"
  | "requirement_too_large"
  | "design_summary_too_large"
  | "constraint_too_large"
  | "too_many_constraints"
  | "too_many_allowed_paths"
  | "repair_evidence_too_large"
  | "prompt_too_large";

export type LoopCodexPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: LoopCodexPromptFailureReason };

/** Type guard: narrows a LoopCodexPromptResult to the failure branch. */
export function isPromptFailure(r: LoopCodexPromptResult): r is { ok: false; reason: LoopCodexPromptFailureReason } {
  return !r.ok;
}

// ═══════════════════════════════════════ Constants

const JSON_BOUNDARY_OPEN = "BEGIN LOOP CODEX REQUEST JSON";
const JSON_BOUNDARY_CLOSE = "END LOOP CODEX REQUEST JSON";
const OPENING_MARKER = "```codex-unified-diff";
const CLOSING_FENCE = "```";

// Character classes for validation
const C0_CONTROL_EXCEPT_LF_CR_TAB_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const C1_CONTROL_RE = /[\x80-\x9f]/;
const NUL_RE = /\x00/;
const REPLACEMENT_RE = /\uFFFD/;

// For single-line fields: no CR, LF, TAB, or any C0/C1
const SINGLE_LINE_FORBIDDEN_RE = /[\x00-\x1f\x7f-\x9f]/;
// For free-form fields: no NUL, U+FFFD, C0 except LF/CR/TAB, no C1
const FREE_FORM_FORBIDDEN_RE = /[\x00\x0b\x0c\x0e-\x1f\x7f-\x9f]/;
// ASCII whitespace (for allowed paths)
const ASCII_WHITESPACE_RE = /[\x20\x09\x0a\x0d\x0b\x0c]/;

// ═══════════════════════════════════════ Helpers

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * Validate a single-line field: no leading/trailing whitespace, non-empty,
 * no CR/LF/TAB, no C0/C1 control chars, no NUL, no U+FFFD.
 */
function validateSingleLine(v: unknown, label: string): string {
  if (typeof v !== "string") {
    throw new Error("invalid_input");
  }
  if (v.length === 0) {
    throw new Error("invalid_input");
  }
  if (v.trim() !== v) {
    throw new Error("invalid_input");
  }
  if (SINGLE_LINE_FORBIDDEN_RE.test(v)) {
    throw new Error("invalid_input");
  }
  if (NUL_RE.test(v)) {
    throw new Error("invalid_input");
  }
  if (REPLACEMENT_RE.test(v)) {
    throw new Error("invalid_input");
  }
  return v;
}

/**
 * Validate a free-form text field: must be string, must reject NUL, U+FFFD,
 * C0 controls except LF/CR/TAB, and C1 controls. Allows normal UTF-8, LF, TAB.
 * Returns trimmed value (empty allowed for optional, caller checks).
 */
function validateFreeForm(v: unknown, label: string): string {
  if (typeof v !== "string") {
    throw new Error("invalid_input");
  }
  if (NUL_RE.test(v)) {
    throw new Error("invalid_input");
  }
  if (REPLACEMENT_RE.test(v)) {
    throw new Error("invalid_input");
  }
  if (C0_CONTROL_EXCEPT_LF_CR_TAB_RE.test(v)) {
    throw new Error("invalid_input");
  }
  if (C1_CONTROL_RE.test(v)) {
    throw new Error("invalid_input");
  }
  return v;
}

/**
 * Validate an allowed path: single-line, plus must not contain any ASCII whitespace.
 */
function validateAllowedPath(v: unknown): string {
  const s = validateSingleLine(v, "allowedPath");
  if (ASCII_WHITESPACE_RE.test(s)) {
    throw new Error("invalid_input");
  }
  return s;
}

// ═══════════════════════════════════════ Builder

/**
 * Builds a bounded, phase-specific Codex implementation prompt.
 *
 * R1: All dynamic data is placed in a deterministic structured JSON payload
 * inside fixed text boundaries. The static prompt structure contains no
 * dynamic fields. User input is isolated through JSON.stringify escaping.
 *
 * Returns a discriminated result: `{ ok: true, prompt }` on success,
 * `{ ok: false, reason }` with a specific failure reason on error.
 */
export function buildLoopCodexPrompt(
  input: LoopCodexPromptInput,
  limits: LoopCodexPromptLimits = DEFAULT_PROMPT_LIMITS,
): LoopCodexPromptResult {
  // ── Phase 1: Structural validation (fail-closed) ──
  try {
    // Validate input shape
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, reason: "invalid_input" };
    }
    // Check for symbol keys, accessors, __proto__
    let inputKeys: Array<string | symbol>;
    try {
      inputKeys = Reflect.ownKeys(input) as Array<string | symbol>;
    } catch {
      return { ok: false, reason: "invalid_input" };
    }
    for (const k of inputKeys) {
      if (typeof k === "symbol") return { ok: false, reason: "invalid_input" };
      if (k === "__proto__") return { ok: false, reason: "invalid_input" };
      let desc: PropertyDescriptor | undefined;
      try { desc = Object.getOwnPropertyDescriptor(input, k); } catch {
        return { ok: false, reason: "invalid_input" };
      }
      if (!desc) return { ok: false, reason: "invalid_input" };
      if ("get" in desc || "set" in desc) return { ok: false, reason: "invalid_input" };
    }
    // Check for unknown keys
    const knownKeys = new Set([
      "phase", "attempt", "requirementId", "requirement",
      "designSummary", "implementationConstraints", "allowedPaths",
      "repairEvidenceSummary",
    ]);
    for (const k of inputKeys) {
      if (!knownKeys.has(k as string)) return { ok: false, reason: "invalid_input" };
    }

    // Validate phase
    const phase = input.phase;
    if (typeof phase !== "string" || !LOOP_CODEX_IMPLEMENTATION_PHASES.includes(phase)) {
      return { ok: false, reason: "invalid_input" };
    }

    // Validate attempt
    const attempt = input.attempt;
    if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 0) {
      return { ok: false, reason: "invalid_input" };
    }

    // Validate requirementId (single-line)
    let requirementId: string;
    try { requirementId = validateSingleLine(input.requirementId, "requirementId"); } catch {
      return { ok: false, reason: "invalid_input" };
    }

    // Validate requirement (free-form, non-empty after trim)
    const requirementRaw = validateFreeForm(input.requirement, "requirement");
    const requirement = requirementRaw.trim();
    if (requirement.length === 0) {
      return { ok: false, reason: "invalid_input" };
    }
    if (byteLength(requirement) > limits.maxRequirementBytes) {
      return { ok: false, reason: "requirement_too_large" };
    }

    // Validate designSummary (free-form, optional)
    let designSummary: string | null = null;
    if (input.designSummary !== undefined) {
      const ds = validateFreeForm(input.designSummary, "designSummary");
      const trimmed = ds.trim();
      if (trimmed.length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      if (byteLength(trimmed) > limits.maxDesignSummaryBytes) {
        return { ok: false, reason: "design_summary_too_large" };
      }
      designSummary = trimmed;
    }

    // Validate implementationConstraints (optional)
    let constraints: string[] | null = null;
    if (input.implementationConstraints !== undefined) {
      if (!Array.isArray(input.implementationConstraints)) {
        return { ok: false, reason: "invalid_input" };
      }
      if (input.implementationConstraints.length > limits.maxConstraints) {
        return { ok: false, reason: "too_many_constraints" };
      }
      constraints = [];
      for (const c of input.implementationConstraints) {
        let constraint: string;
        try { constraint = validateSingleLine(c, "constraint"); } catch {
          return { ok: false, reason: "invalid_input" };
        }
        if (byteLength(constraint) > limits.maxConstraintBytes) {
          return { ok: false, reason: "constraint_too_large" };
        }
        constraints.push(constraint);
      }
    }

    // Validate allowedPaths (required, non-empty)
    if (!Array.isArray(input.allowedPaths)) {
      return { ok: false, reason: "invalid_input" };
    }
    if (input.allowedPaths.length === 0) {
      return { ok: false, reason: "invalid_input" };
    }
    if (input.allowedPaths.length > limits.maxAllowedPaths) {
      return { ok: false, reason: "too_many_allowed_paths" };
    }
    const seenPaths = new Set<string>();
    for (const p of input.allowedPaths) {
      let path: string;
      try { path = validateAllowedPath(p); } catch {
        return { ok: false, reason: "invalid_input" };
      }
      if (seenPaths.has(path)) {
        return { ok: false, reason: "invalid_input" };
      }
      seenPaths.add(path);
    }
    const allowedPaths = input.allowedPaths as readonly string[];

    // Validate repairEvidenceSummary (repair phases only)
    let repairEvidenceSummary: string | null = null;
    if (input.repairEvidenceSummary !== undefined) {
      if (phase === "initial") {
        return { ok: false, reason: "invalid_input" };
      }
      const ev = validateFreeForm(input.repairEvidenceSummary, "repairEvidenceSummary");
      const trimmed = ev.trim();
      if (trimmed.length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      if (byteLength(trimmed) > limits.maxRepairEvidenceBytes) {
        return { ok: false, reason: "repair_evidence_too_large" };
      }
      repairEvidenceSummary = trimmed;
    } else if (phase !== "initial") {
      return { ok: false, reason: "invalid_input" };
    }

    // ── Phase 2: Build deterministic JSON payload ──
    // Fixed property order — no dynamic key injection
    const payload: Record<string, unknown> = {};
    payload.schema = "loop-codex-implementation-request-v1";
    payload.phase = phase;
    payload.attempt = attempt;
    payload.requirement_id = requirementId;
    payload.requirement = requirement;
    payload.design_summary = designSummary;
    payload.implementation_constraints = constraints ?? [];
    payload.allowed_paths = allowedPaths;
    payload.repair_evidence_summary = repairEvidenceSummary;

    // Use JSON.stringify for deterministic escaping — all user input is
    // contained within the JSON string, isolated from the prompt structure.
    const jsonPayload = JSON.stringify(payload);

    // ── Phase 3: Build the full prompt ──
    const sections: string[] = [];

    // Static prompt: role and task
    sections.push("# Codex Multi-File Implementation");
    sections.push("");
    sections.push("You are a code-implementation agent operating in a read-only sandbox.");
    sections.push("Your task is to produce exactly one multi-file unified diff.");
    sections.push("");

    // Static rules
    sections.push("## Workspace & Rules");
    sections.push("1. The process cwd is the target workspace — you may read files for context but must not run destructive commands.");
    sections.push("2. Do NOT commit, push, create a PR, merge, or modify Git HEAD or the index.");
    sections.push("3. Do NOT run shell commands that modify the filesystem.");
    sections.push("4. Produce exactly ONE multi-file unified diff.");
    sections.push("5. Only modify files within the allowed paths listed in the request data.");
    sections.push("6. Do NOT include explanatory prose, shell commands, JSON, or extra code blocks.");
    sections.push("");

    // Dynamic data boundary — all dynamic content is in the JSON payload
    sections.push(JSON_BOUNDARY_OPEN);
    sections.push(jsonPayload);
    sections.push(JSON_BOUNDARY_CLOSE);
    sections.push("");

    // Static output format
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

    // ── Phase 4: Check total prompt size ──
    if (byteLength(prompt) > limits.maxPromptBytes) {
      return { ok: false, reason: "prompt_too_large" };
    }

    return { ok: true, prompt };

  } catch (e) {
    // Only truly unexpected internal exceptions fall through here
    if (e instanceof Error && e.message === "invalid_input") {
      return { ok: false, reason: "invalid_input" };
    }
    return { ok: false, reason: "invalid_input" };
  }
}
