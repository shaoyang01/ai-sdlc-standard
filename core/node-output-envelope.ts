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
//   - PASS_WITH_RISK risk refs are informational (Decision-086: no separate acceptance proof);
//     any other verdict must carry none;
//   - non-gate node: gateResult must be absent/null;
//   - decisionDepth/decisionStatus ride ONLY on the formal_verdict role and
//     must satisfy the frozen contract §4.3 combination table:
//     (CONFIRMED|ESCALATED, LIGHT/STANDARD/DEEP) or (BLOCKED_UNKNOWN, null —
//     an explicit null; a MISSING depth is a different fact and fails);
//   - nodeStatus (D-087 node business result) is REQUIRED on every node:
//     SUCCEEDED | BLOCKED | FAILED. A structured body declaration that
//     contradicts SUCCEEDED downgrades the node to BLOCKED (D-087 seam 1);
//   - findings: closed shape {id, severity ∈ CRITICAL/HIGH/MEDIUM/LOW, message,
//     cause? ∈ REGRESSION/IMPROVEMENT, category ∈ six-category matrix,
//     earliestAffectedNodeId? (must equal the category's canonical node)},
//     unique ids.
// The revision chain / digest / artifact ref are built by loop-artifact-revision
// from this validated envelope; this module never invents them.

import { LOOP_FINDING_CAUSE_KINDS, LOOP_FINDING_SEVERITIES, LOOP_FINDING_CATEGORIES, LOOP_FINDING_CATEGORY_EARLIEST_NODE, type LoopFindingCauseKind, type LoopFindingSeverity, type LoopFindingCategory } from "./loop-finding-lifecycle";
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
  | "ENVELOPE_BAD_FINDING"
  | "ENVELOPE_BAD_DECISION"
  | "ENVELOPE_BAD_NODE_STATUS";

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
  /** Root-cause category (frozen contract §5.1): the problem layer. */
  readonly category: LoopFindingCategory;
  /** Must equal the category's canonical earliest-affected node when declared. */
  readonly earliestAffectedNodeId: NodeCapabilityId | null;
}

export type NodeBusinessStatus = "SUCCEEDED" | "BLOCKED" | "FAILED";

export const NODE_BUSINESS_STATUSES: readonly NodeBusinessStatus[] = ["SUCCEEDED", "BLOCKED", "FAILED"];

const DECISION_DEPTH_VALUES = ["LIGHT", "STANDARD", "DEEP"] as const;
export type EnvelopeDecisionDepth = (typeof DECISION_DEPTH_VALUES)[number];

const DECISION_STATUS_VALUES = ["CONFIRMED", "ESCALATED", "BLOCKED_UNKNOWN"] as const;
export type EnvelopeDecisionStatus = (typeof DECISION_STATUS_VALUES)[number];

/**
 * D-087 seam 1: a body-declared business status that contradicts the
 * structured nodeStatus. This is NOT free-prose guessing — it matches an
 * explicit structured declaration (`status: BLOCKED` / `nodeStatus=FAILED`
 * style lines) inside the node product body. A SUCCEEDED declaration paired
 * with such a line downgrades to BLOCKED per D-087 ("不一致时降级为 BLOCKED").
 */
const BODY_STATUS_DECLARATION_RE = /^[ \t>*#-]*(?:node_?status|status)[ \t]*[:=][ \t]*["'`]?(BLOCKED|FAILED)["'`]?[ \t]*$/im;

export function bodyDeclaresBlockage(body: string): boolean {
  return BODY_STATUS_DECLARATION_RE.test(body);
}

export interface ParsedNodeOutputEnvelope {
  readonly summary: string;
  readonly body: string;
  readonly gateResult: NodeGateVerdict | null;
  readonly riskAcceptanceRefs: readonly string[];
  readonly findings: readonly NodeOutputFinding[];
  readonly decisionDepth: EnvelopeDecisionDepth | null;
  readonly decisionStatus: EnvelopeDecisionStatus | null;
  /** D-087 node business result (contradiction-downgraded, never raw). */
  readonly nodeStatus: NodeBusinessStatus;
}

const ENVELOPE_FIELDS = ["summary", "body", "gateResult", "riskAcceptanceRefs", "findings", "decisionDepth", "decisionStatus", "nodeStatus"];

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
  // G4-R5-H3: missing vs illegal vs explicit-null are three different facts.
  // The raw field presence is captured BEFORE any interpretation so the
  // §4.3 combination table can be enforced exactly.
  const hasDecisionDepthField = "decisionDepth" in record && record.decisionDepth !== undefined;
  const hasDecisionStatusField = "decisionStatus" in record && record.decisionStatus !== undefined;
  let rawDecisionDepth: unknown = null;
  if (hasDecisionDepthField) {
    rawDecisionDepth = record.decisionDepth;
    if (
      rawDecisionDepth !== null &&
      (typeof rawDecisionDepth !== "string" ||
        !(DECISION_DEPTH_VALUES as readonly string[]).includes(rawDecisionDepth))
    ) {
      fail("ENVELOPE_BAD_DECISION", "decisionDepth must be LIGHT, STANDARD, DEEP or null");
    }
  }
  let rawDecisionStatus: unknown = null;
  if (hasDecisionStatusField) {
    rawDecisionStatus = record.decisionStatus;
    if (
      rawDecisionStatus !== null &&
      (typeof rawDecisionStatus !== "string" ||
        !(DECISION_STATUS_VALUES as readonly string[]).includes(rawDecisionStatus))
    ) {
      fail("ENVELOPE_BAD_DECISION", "decisionStatus must be CONFIRMED, ESCALATED or BLOCKED_UNKNOWN");
    }
  }
  // The decision fields ride ONLY on the formal_verdict role — any other
  // role declaring them is a contract violation (fail-closed).
  if (!isVerdict && (hasDecisionDepthField || hasDecisionStatusField)) {
    fail("ENVELOPE_BAD_DECISION", "only the formal_verdict role may declare decisionDepth/decisionStatus");
  }
  let decisionDepth: EnvelopeDecisionDepth | null = null;
  let decisionStatus: EnvelopeDecisionStatus | null = null;
  if (isVerdict) {
    if (!hasDecisionStatusField || typeof rawDecisionStatus !== "string") {
      fail("ENVELOPE_BAD_DECISION", "formal_verdict must declare decisionStatus");
    }
    decisionStatus = rawDecisionStatus as EnvelopeDecisionStatus;
    // Frozen contract §4.3 combination table, enforced at the parse boundary:
    // (CONFIRMED|ESCALATED, depth) legal; (BLOCKED_UNKNOWN, explicit null)
    // legal; everything else — including a MISSING depth with BLOCKED_UNKNOWN
    // — fails here so no downstream layer can misinterpret it.
    if (decisionStatus === "BLOCKED_UNKNOWN") {
      if (!hasDecisionDepthField || rawDecisionDepth !== null) {
        fail("ENVELOPE_BAD_DECISION", "BLOCKED_UNKNOWN requires an explicit decisionDepth of null");
      }
      decisionDepth = null;
    } else {
      if (!hasDecisionDepthField || typeof rawDecisionDepth !== "string") {
        fail("ENVELOPE_BAD_DECISION", `${decisionStatus} requires a non-null decisionDepth`);
      }
      decisionDepth = rawDecisionDepth as EnvelopeDecisionDepth;
    }
  }
  // ── node business status (D-087 seam 1) ──
  const hasNodeStatusField = "nodeStatus" in record && record.nodeStatus !== undefined;
  if (!hasNodeStatusField || typeof record.nodeStatus !== "string") {
    fail("ENVELOPE_BAD_NODE_STATUS", "nodeStatus is required and must be a string");
  }
  if (!(NODE_BUSINESS_STATUSES as readonly string[]).includes(record.nodeStatus)) {
    fail("ENVELOPE_BAD_NODE_STATUS", "nodeStatus must be SUCCEEDED, BLOCKED or FAILED");
  }
  let nodeStatus = record.nodeStatus as NodeBusinessStatus;
  // D-087: an explicit structured body declaration that contradicts a
  // SUCCEEDED claim downgrades to BLOCKED (never the reverse).
  if (nodeStatus === "SUCCEEDED" && bodyDeclaresBlockage(body)) {
    nodeStatus = "BLOCKED";
  }
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
  // G4-02 (C17/Decision-086): PASS_WITH_RISK no longer requires non-empty
  // riskAcceptanceRefs — the verdict's scope-level judgment is the acceptance.
  // Risk refs are informational and travel with the finding index, not the envelope.
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
        if (!["id", "severity", "message", "cause", "category", "earliestAffectedNodeId"].includes(key)) {
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
      // G4-R5-H5: the lifecycle's category (root-cause layer) is REQUIRED —
      // the runtime derives the reflow target and the routing matrix from it.
      if (typeof f.category !== "string" || !(LOOP_FINDING_CATEGORIES as readonly string[]).includes(f.category)) {
        fail("ENVELOPE_BAD_FINDING", `finding ${id} category must be one of ${LOOP_FINDING_CATEGORIES.join("/")}`);
      }
      const category = f.category as LoopFindingCategory;
      // The reflow target is machine-derived from the category; a declared
      // value may only confirm it, never diverge from it. It is ALWAYS set —
      // the runtime's routing matrix consumes it verbatim.
      let earliestAffectedNodeId = LOOP_FINDING_CATEGORY_EARLIEST_NODE[category];
      if ("earliestAffectedNodeId" in f && f.earliestAffectedNodeId !== null && f.earliestAffectedNodeId !== undefined) {
        if (typeof f.earliestAffectedNodeId !== "string") {
          fail("ENVELOPE_BAD_FINDING", `finding ${id} earliestAffectedNodeId must be a string`);
        }
        if (f.earliestAffectedNodeId !== LOOP_FINDING_CATEGORY_EARLIEST_NODE[category]) {
          fail(
            "ENVELOPE_BAD_FINDING",
            `finding ${id} earliestAffectedNodeId must equal the canonical earliest node of category ${category}`,
          );
        }
      }
      findings.push(Object.freeze({ id, severity: severity as LoopFindingSeverity, message, cause, category, earliestAffectedNodeId }));
    }
  }

  return Object.freeze({
    summary,
    body,
    decisionDepth,
    decisionStatus,
    nodeStatus,
    gateResult,
    riskAcceptanceRefs: Object.freeze(riskAcceptanceRefs),
    findings: Object.freeze(findings),
  });
}
