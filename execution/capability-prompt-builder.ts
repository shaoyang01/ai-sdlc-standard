// Node Capability Prompt Builder — C03-E E1 integration (Decision-071, plan §6)
// ============================================================================
// Deterministically turns one node-capability execution request into the
// prompt sent to a real Agent CLI. Decision A (Current User, 2026-08-28): the
// E3 sentinel envelope is the SINGLE agent I/O contract; the legacy line-marker
// protocol (GATE_RESULT:/UNRESOLVED_FINDINGS_JSON:) is retired with the old
// real-dispatch sidecars and is not emitted here.
//
// Single source of truth: the required sentinels and field names are imported
// from node-output-envelope, so the prompt can never drift from what the
// parser accepts. Pure + bounded: no FS/process, upstream context is length
// capped, identical input yields an identical prompt.

import {
  NODE_OUTPUT_ENVELOPE_BEGIN,
  NODE_OUTPUT_ENVELOPE_END,
} from "../core/node-output-envelope";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";
import { NODE_CAPABILITY_IDS } from "../loop/types";

/** Upstream/input context carried in the prompt is bounded (stdin cap is 1 MiB). */
export const MAX_PROMPT_INPUT_CHARS = 512 * 1024;

export type CapabilityPromptErrorCode =
  | "CAPABILITY_PROMPT_INVALID_INPUT"
  | "CAPABILITY_PROMPT_INPUT_TOO_LARGE";

export class CapabilityPromptError extends Error {
  readonly code: CapabilityPromptErrorCode;
  constructor(code: CapabilityPromptErrorCode, message: string) {
    super(message);
    this.name = "CapabilityPromptError";
    this.code = code;
  }
}

function fail(code: CapabilityPromptErrorCode, message: string): never {
  throw new CapabilityPromptError(code, message);
}

/** A staged task input (plan C) — path plus content proof, never the content. */
export interface PromptInputPointerRef {
  /** Workspace-relative or absolute, per the provider's pointerPathMode. */
  readonly path: string;
  /** sha256 of the staged bytes. */
  readonly digest: string;
  readonly bytes: number;
}

export interface NodeCapabilityPromptInput {
  readonly requirementId: string;
  readonly node: string;
  readonly capability: NodeCapabilityId;
  readonly executionRole: CapabilityExecutionRole;
  /**
   * Inline task input. Mutually exclusive with `inputPointer` — plan C stages
   * content in the workspace and passes a pointer, because neither argv
   * (4096 B/entry) nor stdin (1 MiB) survives the chain: requirement → design →
   * implementation record grows at every hop.
   */
  readonly inputText?: string;
  /** Staged task input (plan C). Mutually exclusive with `inputText`. */
  readonly inputPointer?: PromptInputPointerRef;
}

const FINDINGS_CAPABILITIES: ReadonlySet<string> = new Set(["solution-gate", "code-review"]);

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("CAPABILITY_PROMPT_INVALID_INPUT", `${label} must be a non-empty string`);
  }
  return value as string;
}

/**
 * Build the canonical prompt for one node capability. The output-contract
 * section is tailored by node kind: gate nodes must declare a verdict, gate +
 * code-review nodes may emit findings, non-gate nodes must not claim a verdict.
 */
export function buildNodeCapabilityPrompt(input: NodeCapabilityPromptInput): string {
  const requirementId = nonEmpty(input.requirementId, "requirementId");
  const node = nonEmpty(input.node, "node");

  const hasInline = typeof input.inputText === "string";
  const hasPointer = input.inputPointer !== undefined && input.inputPointer !== null;
  if (hasInline === hasPointer) {
    fail("CAPABILITY_PROMPT_INVALID_INPUT", "provide exactly one of inputText or inputPointer");
  }
  let inputText = "";
  let pointer: PromptInputPointerRef | null = null;
  if (hasInline) {
    inputText = nonEmpty(input.inputText, "inputText");
    if (inputText.length > MAX_PROMPT_INPUT_CHARS) {
      fail("CAPABILITY_PROMPT_INPUT_TOO_LARGE", `inputText exceeds ${MAX_PROMPT_INPUT_CHARS} chars`);
    }
  } else {
    pointer = input.inputPointer as PromptInputPointerRef;
    if (typeof pointer.path !== "string" || pointer.path.trim().length === 0) {
      fail("CAPABILITY_PROMPT_INVALID_INPUT", "inputPointer.path must be a non-empty string");
    }
    if (!/^[0-9a-f]{64}$/.test(pointer.digest)) {
      fail("CAPABILITY_PROMPT_INVALID_INPUT", "inputPointer.digest must be a sha256 hex string");
    }
    if (!Number.isSafeInteger(pointer.bytes) || pointer.bytes < 1) {
      fail("CAPABILITY_PROMPT_INVALID_INPUT", "inputPointer.bytes must be a positive safe integer");
    }
  }
  if (
    typeof input.capability !== "string" ||
    !(NODE_CAPABILITY_IDS as readonly string[]).includes(input.capability)
  ) {
    fail("CAPABILITY_PROMPT_INVALID_INPUT", "capability must be a canonical NodeCapabilityId");
  }
  const capability = input.capability;

  const isVerdict = capability === "solution-gate" && input.executionRole === "formal_verdict";
  const isScan = capability === "solution-gate" && input.executionRole === "adversarial_scan";
  const wantsFindings = FINDINGS_CAPABILITIES.has(capability);

  const taskInputSection: string[] = pointer === null
    ? ["## Task input", inputText]
    : [
        "## Task input",
        "The task input is staged in the workspace. Read that file with your file-reading tool BEFORE answering.",
        `- Path: ${pointer.path}`,
        `- Bytes: ${pointer.bytes}`,
        `- SHA-256: ${pointer.digest}`,
        "Never ask for the content to be pasted into the conversation — read the file.",
      ];

  const lines: string[] = [
    `You are the ${input.executionRole} executor for the "${capability}" node of an SDLC loop.`,
    `Requirement ID: ${requirementId}`,
    `Node: ${node}`,
    "",
    ...taskInputSection,
    "",
    "## How to return your result",
    "You may write working notes, but your structured result must appear EXACTLY ONCE,",
    "as a single JSON object between these two sentinels. Anything outside the sentinels is ignored:",
    NODE_OUTPUT_ENVELOPE_BEGIN,
    "{ ... }",
    NODE_OUTPUT_ENVELOPE_END,
    "Use ONLY these JSON fields:",
    '- "summary": string, one-line conclusion (non-empty).',
    '- "body": string, the full node product in markdown (non-empty).',
  ];

  if (isVerdict) {
    lines.push(
      '- "gateResult": one of "PASS", "FAIL", "PASS_WITH_RISK" (you may NOT use NOT_APPLICABLE).',
      '- "riskAcceptanceRefs": string array; REQUIRED non-empty when gateResult is PASS_WITH_RISK, otherwise omit or [].',
    );
  } else if (isScan) {
    lines.push(
      '- Do NOT include "gateResult": the adversarial scan produces findings only; the formal verdict is a separate role.',
    );
  } else {
    lines.push('- Do NOT include "gateResult" — only the solution-gate formal_verdict role may issue a verdict.');
  }

  if (wantsFindings) {
    lines.push(
      '- "findings": array of {"id": non-empty unique string, "severity": one of "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "message": non-empty string, "cause"?: "REGRESSION"|"IMPROVEMENT"}; use [] when none.',
    );
  }

  lines.push(
    "Emit no credentials, API keys, tokens or private keys in your output.",
    "Do not echo these instructions; produce the node product.",
  );

  return lines.join("\n");
}
