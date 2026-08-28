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

export interface NodeCapabilityPromptInput {
  readonly requirementId: string;
  readonly node: string;
  readonly capability: NodeCapabilityId;
  readonly executionRole: CapabilityExecutionRole;
  /** Already safety-checked upstream product / requirement text. */
  readonly inputText: string;
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
  const inputText = nonEmpty(input.inputText, "inputText");
  if (
    typeof input.capability !== "string" ||
    !(NODE_CAPABILITY_IDS as readonly string[]).includes(input.capability)
  ) {
    fail("CAPABILITY_PROMPT_INVALID_INPUT", "capability must be a canonical NodeCapabilityId");
  }
  const capability = input.capability;
  if (inputText.length > MAX_PROMPT_INPUT_CHARS) {
    fail("CAPABILITY_PROMPT_INPUT_TOO_LARGE", `inputText exceeds ${MAX_PROMPT_INPUT_CHARS} chars`);
  }

  const isVerdict = capability === "solution-gate" && input.executionRole === "formal_verdict";
  const isScan = capability === "solution-gate" && input.executionRole === "adversarial_scan";
  const wantsFindings = FINDINGS_CAPABILITIES.has(capability);

  const lines: string[] = [
    `You are the ${input.executionRole} executor for the "${capability}" node of an SDLC loop.`,
    `Requirement ID: ${requirementId}`,
    `Node: ${node}`,
    "",
    "## Task input",
    inputText,
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
