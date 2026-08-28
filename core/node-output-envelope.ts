// Node Output Envelope — C03-E E3 (Decision-071, plan §6 E3)
// ============================================================================
// Turns an Agent CLI's UNTRUSTED free-text stdout into a field-validated node
// output the real gateway can turn into a canonical revision artifact.
//
// Anti-injection contract: the agent is prompted (E1) to emit its structured
// result exactly once between unique sentinels; prose outside the sentinels is
// ignored and can never forge a structured field. Inside the sentinels there
// must be a SINGLE JSON object with a closed field set.
//
//   <!--@loop-output-begin-->
//   { "summary": "...", "body": "...", "gateResult": "PASS",
//     "riskAcceptanceRefs": [], "findings": [] }
//   <!--@loop-output-end-->
//
// Rules (fail-closed, every violation is a distinct, decidable code):
//   - gate node (isLoopArtifactGateCapability): gateResult REQUIRED and one of
//     PASS / FAIL / PASS_WITH_RISK (an agent may never self-assert
//     NOT_APPLICABLE — that is a system projection);
//   - PASS_WITH_RISK requires non-empty riskAcceptanceRefs (delivery-tail rule);
//     any other verdict must carry none;
//   - non-gate node: gateResult must be absent/null;
//   - findings: closed shape {id, severity ∈ CRITICAL/HIGH/MEDIUM/LOW, message,
//     cause? ∈ REGRESSION/IMPROVEMENT}, unique ids.
// The revision chain / digest / artifact ref are built by loop-artifact-revision
// from this validated envelope; this module never invents them.

import { LOOP_FINDING_CAUSE_KINDS, LOOP_FINDING_SEVERITIES, type LoopFindingCauseKind, type LoopFindingSeverity } from "./loop-finding-lifecycle";
import { isLoopArtifactGateCapability } from "./loop-artifact-revision";
import type { NodeCapabilityId } from "../loop/types";

export const NODE_OUTPUT_ENVELOPE_BEGIN = "<!--@loop-output-begin-->";
export const NODE_OUTPUT_ENVELOPE_END = "<!--@loop-output-end-->";

const MAX_SUMMARY = 4000;
const MAX_BODY = 2_000_000;
const MAX_FINDINGS = 512;
const GATE_AGENT_VERDICTS = ["PASS", "FAIL", "PASS_WITH_RISK"] as const;
export type NodeGateVerdict = (typeof GATE_AGENT_VERDICTS)[number];

export type NodeOutputEnvelopeErrorCode =
  | "ENVELOPE_NOT_FOUND"
  | "ENVELOPE_AMBIGUOUS"
  | "ENVELOPE_NOT_JSON"
  | "ENVELOPE_BAD_SHAPE"
  | "ENVELOPE_EMPTY"
  | "ENVELOPE_BAD_GATE"
  | "ENVELOPE_RISK_REFS"
  | "ENVELOPE_BAD_FINDING";

export class NodeOutputEnvelopeError extends Error {
  readonly code: NodeOutputEnvelopeErrorCode;
  constructor(code: NodeOutputEnvelopeErrorCode, message: string) {
    super(message);
    this.name = "NodeOutputEnvelopeError";
    this.code = code;
  }
}

function fail(code: NodeOutputEnvelopeErrorCode, message: string): never {
  throw new NodeOutputEnvelopeError(code, message);
}

export interface NodeOutputFinding {
  readonly id: string;
  readonly severity: LoopFindingSeverity;
  readonly message: string;
  readonly cause: LoopFindingCauseKind | null;
}

export interface ParsedNodeOutputEnvelope {
  readonly summary: string;
  readonly body: string;
  readonly gateResult: NodeGateVerdict | null;
  readonly riskAcceptanceRefs: readonly string[];
  readonly findings: readonly NodeOutputFinding[];
}

const ENVELOPE_FIELDS = ["summary", "body", "gateResult", "riskAcceptanceRefs", "findings"];

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

function asNonEmptyText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") fail("ENVELOPE_BAD_SHAPE", `${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) fail("ENVELOPE_EMPTY", `${label} must not be empty`);
  if (value.length > max) fail("ENVELOPE_BAD_SHAPE", `${label} exceeds ${max} chars`);
  return value;
}

/**
 * Extract and validate the node output envelope for `capability` from raw CLI
 * stdout. Pure. Throws NodeOutputEnvelopeError on any contract violation; the
 * caller (real gateway) must treat that as an executor output failure, never as
 * a successful node result.
 */
export function parseNodeOutputEnvelope(
  raw: string,
  capability: NodeCapabilityId,
  options?: { readonly isVerdict?: boolean },
): ParsedNodeOutputEnvelope {
  if (typeof raw !== "string") fail("ENVELOPE_NOT_JSON", "agent output must be text");

  const beginCount = countOccurrences(raw, NODE_OUTPUT_ENVELOPE_BEGIN);
  const endCount = countOccurrences(raw, NODE_OUTPUT_ENVELOPE_END);
  if (beginCount === 0 || endCount === 0) {
    fail("ENVELOPE_NOT_FOUND", "agent output is missing the loop-output envelope sentinels");
  }
  if (beginCount !== 1 || endCount !== 1) {
    fail("ENVELOPE_AMBIGUOUS", "agent output must contain exactly one output envelope");
  }
  const start = raw.indexOf(NODE_OUTPUT_ENVELOPE_BEGIN) + NODE_OUTPUT_ENVELOPE_BEGIN.length;
  const end = raw.indexOf(NODE_OUTPUT_ENVELOPE_END);
  if (end <= start) fail("ENVELOPE_AMBIGUOUS", "envelope end precedes begin");
  const jsonText = raw.slice(start, end).trim();
  if (jsonText.length === 0) fail("ENVELOPE_NOT_FOUND", "envelope body is empty");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    fail("ENVELOPE_NOT_JSON", "envelope is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("ENVELOPE_BAD_SHAPE", "envelope must be a single JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.getPrototypeOf(record) !== Object.prototype) {
    fail("ENVELOPE_BAD_SHAPE", "envelope must be a plain object");
  }
  for (const key of Object.keys(record)) {
    if (!ENVELOPE_FIELDS.includes(key)) fail("ENVELOPE_BAD_SHAPE", `unknown envelope field "${key}"`);
  }

  const summary = asNonEmptyText(record.summary, "summary", MAX_SUMMARY).trim();
  const body = asNonEmptyText(record.body, "body", MAX_BODY);

  // ── gate verdict, gated by ROLE not just capability ──
  // Only solution-gate/formal_verdict may issue a verdict; its adversarial_scan
  // role is forced to NOT_APPLICABLE by the gateway and must not claim one.
  // Default (no option) keeps the capability-level gate behaviour.
  const isVerdict = options?.isVerdict ?? isLoopArtifactGateCapability(capability);
  let gateResult: NodeGateVerdict | null = null;
  const hasGate = "gateResult" in record && record.gateResult !== null;
  if (isVerdict) {
    if (!hasGate) fail("ENVELOPE_BAD_GATE", `verdict role on ${capability} must declare gateResult`);
    const verdict = record.gateResult;
    if (typeof verdict !== "string" || !(GATE_AGENT_VERDICTS as readonly string[]).includes(verdict)) {
      fail("ENVELOPE_BAD_GATE", "gateResult must be PASS, FAIL or PASS_WITH_RISK");
    }
    gateResult = verdict as NodeGateVerdict;
  } else if (hasGate) {
    fail("ENVELOPE_BAD_GATE", `non-verdict role on ${capability} must not declare gateResult`);
  }

  // ── risk acceptance refs ──
  let riskAcceptanceRefs: string[] = [];
  if ("riskAcceptanceRefs" in record && record.riskAcceptanceRefs !== undefined && record.riskAcceptanceRefs !== null) {
    if (!Array.isArray(record.riskAcceptanceRefs)) fail("ENVELOPE_RISK_REFS", "riskAcceptanceRefs must be an array");
    for (const ref of record.riskAcceptanceRefs) {
      if (typeof ref !== "string" || ref.trim().length === 0 || /[\x00-\x1f\x7f]/.test(ref)) {
        fail("ENVELOPE_RISK_REFS", "riskAcceptanceRefs entries must be non-empty control-free strings");
      }
      riskAcceptanceRefs.push(ref);
    }
  }
  if (gateResult === "PASS_WITH_RISK" && riskAcceptanceRefs.length === 0) {
    fail("ENVELOPE_RISK_REFS", "PASS_WITH_RISK requires non-empty riskAcceptanceRefs");
  }
  if (gateResult !== "PASS_WITH_RISK" && riskAcceptanceRefs.length > 0) {
    fail("ENVELOPE_RISK_REFS", "riskAcceptanceRefs are only valid with PASS_WITH_RISK");
  }

  // ── findings ──
  const findings: NodeOutputFinding[] = [];
  if ("findings" in record && record.findings !== undefined && record.findings !== null) {
    if (!Array.isArray(record.findings)) fail("ENVELOPE_BAD_FINDING", "findings must be an array");
    if (record.findings.length > MAX_FINDINGS) fail("ENVELOPE_BAD_FINDING", `findings exceed ${MAX_FINDINGS}`);
    const seen = new Set<string>();
    for (const item of record.findings) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        fail("ENVELOPE_BAD_FINDING", "each finding must be an object");
      }
      const f = item as Record<string, unknown>;
      for (const key of Object.keys(f)) {
        if (!["id", "severity", "message", "cause"].includes(key)) {
          fail("ENVELOPE_BAD_FINDING", `unknown finding field "${key}"`);
        }
      }
      const id = f.id;
      if (typeof id !== "string" || id.trim().length === 0 || /\s/.test(id)) {
        fail("ENVELOPE_BAD_FINDING", "finding id must be a non-empty whitespace-free string");
      }
      if (seen.has(id)) fail("ENVELOPE_BAD_FINDING", `duplicate finding id "${id}"`);
      seen.add(id);
      const severity = f.severity;
      if (typeof severity !== "string" || !(LOOP_FINDING_SEVERITIES as readonly string[]).includes(severity)) {
        fail("ENVELOPE_BAD_FINDING", `finding ${id} severity must be one of ${LOOP_FINDING_SEVERITIES.join("/")}`);
      }
      const message = f.message;
      if (typeof message !== "string" || message.trim().length === 0) {
        fail("ENVELOPE_BAD_FINDING", `finding ${id} message must be non-empty`);
      }
      let cause: LoopFindingCauseKind | null = null;
      if ("cause" in f && f.cause !== null && f.cause !== undefined) {
        if (typeof f.cause !== "string" || !(LOOP_FINDING_CAUSE_KINDS as readonly string[]).includes(f.cause)) {
          fail("ENVELOPE_BAD_FINDING", `finding ${id} cause must be one of ${LOOP_FINDING_CAUSE_KINDS.join("/")}`);
        }
        cause = f.cause as LoopFindingCauseKind;
      }
      findings.push(Object.freeze({ id, severity: severity as LoopFindingSeverity, message, cause }));
    }
  }

  return Object.freeze({
    summary,
    body,
    gateResult,
    riskAcceptanceRefs: Object.freeze(riskAcceptanceRefs),
    findings: Object.freeze(findings),
  });
}
