// LOOP Finding Lifecycle and Dependency Invalidation Model (C02 WP-3)
// ==================================================================
// Pure functions only. No filesystem, SQLite, child_process, Git, network,
// process.env, ExecutionGateway, or Agent adapter imports.
//
// Canonical findings bind every review/test/intake problem to the run journal:
// the fixed severity/category enums, the six problem-layer categories whose
// canonical earliest affected node is fixed per category (category expresses
// WHERE the root cause lives, not where it was found — v2, A3), the mandatory
// non-empty source capability and same-run current source revision, the
// evidence reference and the fixed status state machine
// (OPEN → RESOLVED / ACCEPTED_RISK → SUPERSEDED).
// Invalidation propagation along the linear NODE_CAPABILITY_IDS order is
// computed by the run store inside the append transaction — callers never
// submit invalidation lists. This model never invents business facts and
// carries fixed safe scalars only — never raw prompts, review text,
// credentials or arbitrary JSON metadata.

import { types as utilTypes } from "node:util";

import { LOOP_ARTIFACT_REVISION_KINDS } from "./loop-artifact-revision";
import { LoopRunJournalError } from "./loop-executor-types";
import { readPlainDataRecord, validateRequirementId } from "./loop-run-state";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";

// v2 (C02-WP3.5-B, A3): a finding must name the current revision it was
// raised against — `sourceRevisionId` is mandatory and must reference a
// revision of the same run. The v1 schema allowed null and is not silently
// accepted.
// v3 (C02-WP4 Round 2 review H2): every finding carries DIRECT causal
// evidence — `causeKind` declares REGRESSION (re-drives its rebuild scope)
// or IMPROVEMENT (blocks completion only), and a REGRESSION must bind the
// fix-wave revision that introduced it via `introducedByRevisionId`.
// Restart authorization is never inferred from a revision's sequence number.
export const LOOP_FINDING_SCHEMA_VERSION = 3 as const;

export const LOOP_FINDING_CAUSE_KINDS = ["REGRESSION", "IMPROVEMENT"] as const;
export type LoopFindingCauseKind = (typeof LOOP_FINDING_CAUSE_KINDS)[number];

export const LOOP_FINDING_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type LoopFindingSeverity = (typeof LOOP_FINDING_SEVERITIES)[number];

export const LOOP_FINDING_CATEGORIES = [
  "REQUIREMENT",
  "SOLUTION",
  "PLANNING",
  "IMPLEMENTATION",
  "REVIEW",
  "KNOWLEDGE",
] as const;
export type LoopFindingCategory = (typeof LOOP_FINDING_CATEGORIES)[number];

export const LOOP_FINDING_STATUSES = ["OPEN", "RESOLVED", "ACCEPTED_RISK", "SUPERSEDED"] as const;
export type LoopFindingStatus = (typeof LOOP_FINDING_STATUSES)[number];

// The six-category routing matrix (v2 contract §2, A3): a finding's category
// expresses the problem layer (root cause), not where it was found. Allowed
// source capabilities for a category are the canonical chain suffix starting
// at the category's canonical earliest affected node — a problem layer cannot
// be discovered before the node that produces it (e.g. a SOLUTION finding can
// surface at implementation/code-review, but never at requirement-intake).
// Any other pairing fails closed. TEST no longer exists as a category:
// offline test and online feedback are external change input that re-enters
// via requirement-intake (changeKind=FEEDBACK_DRIVEN_CHANGE), not findings of
// a test-validation node.
export const LOOP_FINDING_CATEGORY_CAPABILITIES: Readonly<Record<LoopFindingCategory, readonly NodeCapabilityId[]>> =
  Object.freeze({
    REQUIREMENT: Object.freeze(NODE_CAPABILITY_IDS.slice(0) as readonly NodeCapabilityId[]),
    SOLUTION: Object.freeze(NODE_CAPABILITY_IDS.slice(1) as readonly NodeCapabilityId[]),
    PLANNING: Object.freeze(NODE_CAPABILITY_IDS.slice(3) as readonly NodeCapabilityId[]),
    IMPLEMENTATION: Object.freeze(NODE_CAPABILITY_IDS.slice(4) as readonly NodeCapabilityId[]),
    REVIEW: Object.freeze(NODE_CAPABILITY_IDS.slice(5) as readonly NodeCapabilityId[]),
    KNOWLEDGE: Object.freeze(NODE_CAPABILITY_IDS.slice(6) as readonly NodeCapabilityId[]),
  });

// The unique canonical earliest affected node per category (v2 contract §2,
// A3): the invalidation origin is fixed by the problem layer, never chosen by
// the caller. `earliestAffectedNodeId` must equal this value on creation;
// failing closed prevents a caller from shrinking the invalidation start to a
// downstream node.
export const LOOP_FINDING_CATEGORY_EARLIEST_NODE: Readonly<Record<LoopFindingCategory, NodeCapabilityId>> =
  Object.freeze({
    REQUIREMENT: "requirement-intake",
    SOLUTION: "solution-design",
    PLANNING: "task-planning",
    IMPLEMENTATION: "implementation",
    REVIEW: "code-review",
    KNOWLEDGE: "knowledge-sync",
  });

export const LOOP_FINDING_GATE_STATUSES = ["ELIGIBLE", "BLOCKED"] as const;
export type LoopFindingGateStatus = (typeof LOOP_FINDING_GATE_STATUSES)[number];

export const LOOP_FINDING_GATE_REASON_CODES = [
  "FINDING_OPEN",
  "FINDING_DOWNSTREAM_STALE",
  "FINDING_DOWNSTREAM_MISSING",
] as const;
export type LoopFindingGateReasonCode = (typeof LOOP_FINDING_GATE_REASON_CODES)[number];

export type LoopFinding = Readonly<{
  schemaVersion: typeof LOOP_FINDING_SCHEMA_VERSION;
  findingId: string;
  runId: string;
  requirementId: string;
  sequence: number;
  sourceCapability: NodeCapabilityId;
  sourceRevisionId: string;
  causeKind: LoopFindingCauseKind;
  introducedByRevisionId: string | null;
  severity: LoopFindingSeverity;
  category: LoopFindingCategory;
  evidenceRef: string;
  evidenceDigest: string;
  earliestAffectedNodeId: NodeCapabilityId;
  status: LoopFindingStatus;
  resolvedByRevisionId: string | null;
  resolutionEvidenceRef: string | null;
  resolutionEvidenceDigest: string | null;
  riskAcceptedBy: string | null;
  riskAcceptanceEvidenceRef: string | null;
  riskAcceptanceEvidenceDigest: string | null;
  supersededBy: string | null;
  createdAt: string;
}>;

/** Builder input: the record without the schema-managed fields. */
export type LoopFindingDraft = Readonly<{
  runId: string;
  requirementId: string;
  sequence: number;
  sourceCapability: NodeCapabilityId;
  sourceRevisionId: string;
  causeKind: LoopFindingCauseKind;
  introducedByRevisionId: string | null;
  severity: LoopFindingSeverity;
  category: LoopFindingCategory;
  evidenceRef: string;
  evidenceDigest: string;
  earliestAffectedNodeId: NodeCapabilityId;
  createdAt: string;
}>;

/** One persisted invalidation edge: a revision marked STALE by a finding. */
export type LoopFindingInvalidation = Readonly<{
  findingId: string;
  invalidationIndex: number;
  revisionId: string;
  nodeId: NodeCapabilityId;
}>;

/**
 * The durable closure proof of a RESOLVED / ACCEPTED_RISK finding (contract
 * §5): a separate persisted fact, written in the same transition transaction,
 * that re-binds the closure to facts the finding row alone cannot prove.
 * RESOLUTION proofs carry the resolving revision's immutable content binding
 * (node id + artifact ref + digest) captured at transition time, so a
 * rehashed finding row pointing at a different revision fails closed on
 * read-back; RISK_ACCEPTANCE proofs carry the acceptor and the evidence. The
 * resolving revision's VALIDITY is deliberately not captured: a resolution
 * revision may legitimately go STALE later, which is a Gate matter
 * (FINDING_DOWNSTREAM_STALE), not corruption.
 */
export const LOOP_FINDING_PROOF_KINDS = ["RESOLUTION", "RISK_ACCEPTANCE"] as const;
export type LoopFindingProofKind = (typeof LOOP_FINDING_PROOF_KINDS)[number];

export type LoopFindingProof = Readonly<{
  findingId: string;
  proofKind: LoopFindingProofKind;
  revisionId: string | null;
  revisionNodeId: NodeCapabilityId | null;
  revisionArtifactRef: string | null;
  revisionArtifactDigest: string | null;
  evidenceRef: string;
  evidenceDigest: string;
  riskAcceptedBy: string | null;
}>;

/**
 * The persisted append-time invalidation scope of a finding (contract §4):
 * the exact edge set the store computed inside the append transaction,
 * reduced to the edge count and a digest over the ordered edges. Read-back
 * recomputes the digest from the SURVIVING edges and compares — deleting the
 * first, middle, last or every edge fails closed, as does a scope row whose
 * digest was rewritten without its canonical hash. An empty scope (edge
 * count zero) is a first-class verified value.
 */
export type LoopFindingInvalidationScope = Readonly<{
  findingId: string;
  edgeCount: number;
  scopeDigest: string;
}>;

/** resolveFinding closure payload: the current revision and the Gate evidence. */
export type LoopFindingResolution = Readonly<{
  resolvedByRevisionId: string;
  resolutionEvidenceRef: string;
  resolutionEvidenceDigest: string;
}>;

/** acceptFindingRisk closure payload: the acceptor and the risk evidence. */
export type LoopFindingRiskAcceptance = Readonly<{
  riskAcceptedBy: string;
  riskAcceptanceEvidenceRef: string;
  riskAcceptanceEvidenceDigest: string;
}>;

export type LoopFindingGateResult = Readonly<{
  status: LoopFindingGateStatus;
  blockingFindings: readonly string[];
  reasonCodes: readonly LoopFindingGateReasonCode[];
}>;

const RECORD_FIELDS = [
  "schemaVersion", "findingId", "runId", "requirementId", "sequence",
  "sourceCapability", "sourceRevisionId", "causeKind", "introducedByRevisionId",
  "severity", "category",
  "evidenceRef", "evidenceDigest", "earliestAffectedNodeId", "status",
  "resolvedByRevisionId", "resolutionEvidenceRef", "resolutionEvidenceDigest",
  "riskAcceptedBy", "riskAcceptanceEvidenceRef", "riskAcceptanceEvidenceDigest",
  "supersededBy", "createdAt",
] as const;

const DRAFT_FIELDS = [
  "runId", "requirementId", "sequence", "sourceCapability", "sourceRevisionId",
  "causeKind", "introducedByRevisionId",
  "severity", "category", "evidenceRef", "evidenceDigest",
  "earliestAffectedNodeId", "createdAt",
] as const;

const INVALIDATION_FIELDS = ["findingId", "invalidationIndex", "revisionId", "nodeId"] as const;

const PROOF_FIELDS = [
  "findingId", "proofKind", "revisionId", "revisionNodeId",
  "revisionArtifactRef", "revisionArtifactDigest",
  "evidenceRef", "evidenceDigest", "riskAcceptedBy",
] as const;

const SCOPE_FIELDS = ["findingId", "edgeCount", "scopeDigest"] as const;

const RESOLUTION_FIELDS = ["resolvedByRevisionId", "resolutionEvidenceRef", "resolutionEvidenceDigest"] as const;

const RISK_ACCEPTANCE_FIELDS = [
  "riskAcceptedBy", "riskAcceptanceEvidenceRef", "riskAcceptanceEvidenceDigest",
] as const;

// The fixed status state machine (contract §2): RESOLVED and ACCEPTED_RISK
// are absorbing for closure semantics; SUPERSEDED is fully absorbing.
const LEGAL_TRANSITIONS: Readonly<Record<LoopFindingStatus, readonly LoopFindingStatus[]>> = Object.freeze({
  OPEN: Object.freeze(["RESOLVED", "ACCEPTED_RISK", "SUPERSEDED"] as const),
  RESOLVED: Object.freeze(["SUPERSEDED"] as const),
  ACCEPTED_RISK: Object.freeze(["SUPERSEDED"] as const),
  SUPERSEDED: Object.freeze([] as const),
});

const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const EVIDENCE_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;

function invalid(message: string): never {
  throw new LoopRunJournalError("INVALID_INPUT", message);
}

function exactFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !(field in record)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    invalid(`${label} must contain exactly the canonical fields`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || CONTROL_RE.test(value)) {
    invalid(`${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalid(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ISO_RE.test(result) || Number.isNaN(Date.parse(result))) {
    invalid(`${label} must be an ISO-8601 timestamp`);
  }
  return result;
}

function digest(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256_RE.test(result)) invalid(`${label} must be a lowercase SHA-256 hex`);
  return result;
}

function nodeCapabilityId(value: unknown, label: string): NodeCapabilityId {
  if (typeof value !== "string" || !(NODE_CAPABILITY_IDS as readonly string[]).includes(value)) {
    invalid(`${label} must be a canonical capability id`);
  }
  return value as NodeCapabilityId;
}

function nodeIndex(nodeId: NodeCapabilityId): number {
  return NODE_CAPABILITY_IDS.indexOf(nodeId);
}

/**
 * Evidence references use the canonical content-addressed artifact form
 * `loop-artifact:v1:<kind>:sha256:<digest>` and must match their digest.
 */
function evidenceReference(refValue: unknown, digestValue: unknown, label: string): void {
  const ref = text(refValue, `${label} ref`);
  const refMatch = EVIDENCE_REF_RE.exec(ref);
  if (refMatch === null) invalid(`${label} ref must be a canonical content-addressed artifact reference`);
  if (!(LOOP_ARTIFACT_REVISION_KINDS as readonly string[]).includes(refMatch[1]!)) {
    invalid(`${label} ref kind must be a canonical artifact kind`);
  }
  if (refMatch[2] !== digest(digestValue, `${label} digest`)) {
    invalid(`${label} ref and digest must match`);
  }
}

/** Parse a canonical finding id into its sequence, or null when malformed. */
function parseFindingId(
  findingId: string,
  expectedRunId: string,
): number | null {
  const prefix = `${expectedRunId}:finding:`;
  if (!findingId.startsWith(prefix)) return null;
  const sequenceText = findingId.slice(prefix.length);
  if (!POSITIVE_INTEGER_RE.test(sequenceText)) return null;
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence)) return null;
  return sequence;
}

/** Parse a canonical revision id into its segments, or null when malformed. */
function parseRevisionReference(
  revisionId: string,
  expectedRunId: string,
): Readonly<{ nodeId: NodeCapabilityId; sequence: number }> | null {
  const prefix = `${expectedRunId}:revision:`;
  if (!revisionId.startsWith(prefix)) return null;
  const rest = revisionId.slice(prefix.length);
  const separator = rest.lastIndexOf(":");
  if (separator <= 0) return null;
  const nodeId = rest.slice(0, separator);
  const sequenceText = rest.slice(separator + 1);
  if (!POSITIVE_INTEGER_RE.test(sequenceText)) return null;
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence)) return null;
  if (!(NODE_CAPABILITY_IDS as readonly string[]).includes(nodeId)) return null;
  return { nodeId: nodeId as NodeCapabilityId, sequence };
}

export function loopFindingId(runId: string, sequence: number): string {
  return `${runId}:finding:${sequence}`;
}

/** The fixed status state machine edge set (contract §2). */
export function isLegalLoopFindingTransition(from: LoopFindingStatus, to: LoopFindingStatus): boolean {
  return (LEGAL_TRANSITIONS[from] as readonly LoopFindingStatus[]).includes(to);
}

/**
 * The canonical downstream node set of an affected node: every node at or
 * after earliestAffectedNodeId in the linear NODE_CAPABILITY_IDS order.
 */
export function downstreamNodeIds(earliestAffectedNodeId: NodeCapabilityId): readonly NodeCapabilityId[] {
  const index = nodeIndex(nodeCapabilityId(earliestAffectedNodeId, "earliestAffectedNodeId"));
  return Object.freeze(NODE_CAPABILITY_IDS.slice(index));
}

/** Validate the exact fixed-scalar record contract and the status rules. */
export function validateLoopFinding(value: unknown): void {
  if (utilTypes.isProxy(value)) invalid("finding must not be a Proxy");
  const record = readPlainDataRecord(value, "finding");
  exactFields(record, RECORD_FIELDS, "finding");
  if (record.schemaVersion !== LOOP_FINDING_SCHEMA_VERSION) {
    invalid("finding schema version is unsupported");
  }
  text(record.findingId, "findingId");
  const runId = text(record.runId, "runId");
  validateRequirementId(record.requirementId, "requirementId");
  const sequence = positiveInteger(record.sequence, "sequence");
  const sourceCapability = nodeCapabilityId(record.sourceCapability, "sourceCapability");
  // v2 (A3): the source revision is mandatory and must reference a revision
  // of the same run. Round 1 (H1-4): the referenced revision's embedded node
  // must equal the source capability — a finding binds to the current
  // revision of the capability that produced it, never to another node's.
  const sourceRevisionId = text(record.sourceRevisionId, "sourceRevisionId");
  const parsedSource = parseRevisionReference(sourceRevisionId, runId);
  if (parsedSource === null) {
    invalid("sourceRevisionId must reference a revision of the same run");
  }
  if (parsedSource !== null && parsedSource.nodeId !== sourceCapability) {
    invalid("sourceRevisionId must be a revision of the sourceCapability node");
  }
  // v3 (Round 2 review H2): DIRECT causal evidence. The cause kind is a
  // mandatory declared fact, never inferred from revision sequence numbers;
  // a REGRESSION must bind the same-run fix-wave revision that introduced it.
  if (
    typeof record.causeKind !== "string" ||
    !(LOOP_FINDING_CAUSE_KINDS as readonly string[]).includes(record.causeKind)
  ) {
    invalid("causeKind must be a canonical finding cause kind");
  }
  if (record.causeKind === "REGRESSION") {
    const introducedBy = text(record.introducedByRevisionId, "introducedByRevisionId");
    if (parseRevisionReference(introducedBy, runId) === null) {
      invalid("introducedByRevisionId must reference a revision of the same run");
    }
  } else if (record.introducedByRevisionId !== null) {
    invalid("improvement findings must not carry introducedByRevisionId");
  }
  if (
    typeof record.severity !== "string" ||
    !(LOOP_FINDING_SEVERITIES as readonly string[]).includes(record.severity)
  ) {
    invalid("severity must be a canonical finding severity");
  }
  const severity = record.severity as LoopFindingSeverity;
  if (
    typeof record.category !== "string" ||
    !(LOOP_FINDING_CATEGORIES as readonly string[]).includes(record.category)
  ) {
    invalid("category must be a canonical finding category");
  }
  const category = record.category as LoopFindingCategory;
  if (!(LOOP_FINDING_CATEGORY_CAPABILITIES[category] as readonly string[]).includes(sourceCapability)) {
    invalid("category and sourceCapability must bind on the same routing matrix row");
  }
  evidenceReference(record.evidenceRef, record.evidenceDigest, "evidence");
  const earliestAffectedNodeId = nodeCapabilityId(record.earliestAffectedNodeId, "earliestAffectedNodeId");
  // The earliest affected node is the category's unique canonical node (A3):
  // the caller must not shrink the invalidation origin to a downstream node.
  if (earliestAffectedNodeId !== LOOP_FINDING_CATEGORY_EARLIEST_NODE[category]) {
    invalid("earliestAffectedNodeId must equal the canonical earliest node of the category");
  }
  if (nodeIndex(earliestAffectedNodeId) > nodeIndex(sourceCapability)) {
    invalid("earliestAffectedNodeId must not follow the source capability");
  }
  if (
    typeof record.status !== "string" ||
    !(LOOP_FINDING_STATUSES as readonly string[]).includes(record.status)
  ) {
    invalid("status must be a canonical finding status");
  }
  const status = record.status as LoopFindingStatus;
  const hasResolution = record.resolvedByRevisionId !== null;
  const hasResolutionEvidence =
    record.resolutionEvidenceRef !== null || record.resolutionEvidenceDigest !== null;
  const hasRisk =
    record.riskAcceptedBy !== null ||
    record.riskAcceptanceEvidenceRef !== null ||
    record.riskAcceptanceEvidenceDigest !== null;
  isoTimestamp(record.createdAt, "createdAt");
  if (record.findingId !== loopFindingId(runId, sequence)) {
    invalid("findingId must match run and sequence");
  }
  if (status === "OPEN") {
    if (hasResolution || hasResolutionEvidence || hasRisk || record.supersededBy !== null) {
      invalid("open findings must not carry closure fields");
    }
    return;
  }
  if (status === "RESOLVED") {
    const resolvedByRevisionId = text(record.resolvedByRevisionId, "resolvedByRevisionId");
    const parsed = parseRevisionReference(resolvedByRevisionId, runId);
    if (parsed === null) {
      invalid("resolvedByRevisionId must reference a revision of the same run");
    }
    if (nodeIndex(parsed.nodeId) < nodeIndex(earliestAffectedNodeId)) {
      invalid("resolvedByRevisionId must belong to the earliest affected node or a downstream node");
    }
    evidenceReference(record.resolutionEvidenceRef, record.resolutionEvidenceDigest, "resolution evidence");
    if (hasRisk || record.supersededBy !== null) {
      invalid("resolved findings must not carry risk acceptance or supersede fields");
    }
    return;
  }
  if (status === "ACCEPTED_RISK") {
    if (severity === "CRITICAL") {
      invalid("critical findings are not risk-acceptable");
    }
    text(record.riskAcceptedBy, "riskAcceptedBy");
    evidenceReference(
      record.riskAcceptanceEvidenceRef,
      record.riskAcceptanceEvidenceDigest,
      "risk acceptance evidence",
    );
    if (hasResolution || hasResolutionEvidence || record.supersededBy !== null) {
      invalid("risk-accepted findings must not carry resolution or supersede fields");
    }
    return;
  }
  // SUPERSEDED: the replacement pointer is mandatory; closure fields of the
  // previous status are cleared so every status has exactly one field shape.
  const supersededBy = text(record.supersededBy, "supersededBy");
  const supersedingSequence = parseFindingId(supersededBy, runId);
  if (supersedingSequence === null) {
    invalid("supersededBy must reference a finding of the same run");
  }
  if (supersedingSequence <= sequence) {
    invalid("supersededBy must reference a later finding of the same run");
  }
  if (hasResolution || hasResolutionEvidence || hasRisk) {
    invalid("superseded findings must not carry resolution or risk acceptance fields");
  }
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopFinding(record: LoopFinding): string {
  validateLoopFinding(record);
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    findingId: record.findingId,
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    sourceCapability: record.sourceCapability,
    sourceRevisionId: record.sourceRevisionId,
    causeKind: record.causeKind,
    introducedByRevisionId: record.introducedByRevisionId,
    severity: record.severity,
    category: record.category,
    evidenceRef: record.evidenceRef,
    evidenceDigest: record.evidenceDigest,
    earliestAffectedNodeId: record.earliestAffectedNodeId,
    status: record.status,
    resolvedByRevisionId: record.resolvedByRevisionId,
    resolutionEvidenceRef: record.resolutionEvidenceRef,
    resolutionEvidenceDigest: record.resolutionEvidenceDigest,
    riskAcceptedBy: record.riskAcceptedBy,
    riskAcceptanceEvidenceRef: record.riskAcceptanceEvidenceRef,
    riskAcceptanceEvidenceDigest: record.riskAcceptanceEvidenceDigest,
    supersededBy: record.supersededBy,
    createdAt: record.createdAt,
  });
}

/** Validate one persisted invalidation edge row. */
export function validateLoopFindingInvalidation(value: unknown): void {
  if (utilTypes.isProxy(value)) invalid("finding invalidation must not be a Proxy");
  const record = readPlainDataRecord(value, "finding invalidation");
  exactFields(record, INVALIDATION_FIELDS, "finding invalidation");
  text(record.findingId, "finding invalidation findingId");
  nonNegativeInteger(record.invalidationIndex, "finding invalidation invalidationIndex");
  text(record.revisionId, "finding invalidation revisionId");
  nodeCapabilityId(record.nodeId, "finding invalidation nodeId");
}

/** Validate one persisted closure proof row against the run identity. */
export function validateLoopFindingProof(value: unknown, expectedRunId: string): void {
  if (utilTypes.isProxy(value)) invalid("finding proof must not be a Proxy");
  const record = readPlainDataRecord(value, "finding proof");
  exactFields(record, PROOF_FIELDS, "finding proof");
  const findingId = text(record.findingId, "finding proof findingId");
  if (parseFindingId(findingId, expectedRunId) === null) {
    invalid("finding proof must reference a finding of the same run");
  }
  if (
    typeof record.proofKind !== "string" ||
    !(LOOP_FINDING_PROOF_KINDS as readonly string[]).includes(record.proofKind)
  ) {
    invalid("finding proof kind must be canonical");
  }
  const proofKind = record.proofKind as LoopFindingProofKind;
  evidenceReference(record.evidenceRef, record.evidenceDigest, "finding proof evidence");
  if (proofKind === "RESOLUTION") {
    const revisionId = text(record.revisionId, "finding proof revisionId");
    const parsed = parseRevisionReference(revisionId, expectedRunId);
    if (parsed === null) {
      invalid("finding proof revision must reference a revision of the same run");
    }
    if (record.revisionNodeId !== parsed.nodeId) {
      invalid("finding proof revision node must match the revision reference");
    }
    // The resolving revision's content binding reuses the canonical
    // content-addressed artifact form: ref kind and digest must match.
    evidenceReference(
      record.revisionArtifactRef,
      record.revisionArtifactDigest,
      "finding proof revision artifact",
    );
    if (record.riskAcceptedBy !== null) {
      invalid("resolution proofs must not carry a risk acceptor");
    }
    return;
  }
  if (
    record.revisionId !== null ||
    record.revisionNodeId !== null ||
    record.revisionArtifactRef !== null ||
    record.revisionArtifactDigest !== null
  ) {
    invalid("risk acceptance proofs must not carry revision binding fields");
  }
  text(record.riskAcceptedBy, "finding proof riskAcceptedBy");
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopFindingProof(proof: LoopFindingProof, expectedRunId: string): string {
  validateLoopFindingProof(proof, expectedRunId);
  return JSON.stringify({
    findingId: proof.findingId,
    proofKind: proof.proofKind,
    revisionId: proof.revisionId,
    revisionNodeId: proof.revisionNodeId,
    revisionArtifactRef: proof.revisionArtifactRef,
    revisionArtifactDigest: proof.revisionArtifactDigest,
    evidenceRef: proof.evidenceRef,
    evidenceDigest: proof.evidenceDigest,
    riskAcceptedBy: proof.riskAcceptedBy,
  });
}

/**
 * Derive the RESOLUTION proof for a finding transition from the validated
 * resolution payload and the resolving revision's immutable content binding
 * (revision id, node id, artifact ref, digest), captured by the store inside
 * the transition transaction.
 */
export function createLoopFindingResolutionProof(
  finding: LoopFinding,
  resolution: LoopFindingResolution,
  revision: Readonly<{ revisionId: string; nodeId: NodeCapabilityId; artifactRef: string; digest: string }>,
): LoopFindingProof {
  validateLoopFinding(finding);
  const valid = validateLoopFindingResolution(resolution);
  if (valid.resolvedByRevisionId !== revision.revisionId) {
    invalid("resolution revision binding must match the resolution payload");
  }
  const proof: LoopFindingProof = Object.freeze({
    findingId: finding.findingId,
    proofKind: "RESOLUTION",
    revisionId: revision.revisionId,
    revisionNodeId: revision.nodeId,
    revisionArtifactRef: revision.artifactRef,
    revisionArtifactDigest: revision.digest,
    evidenceRef: valid.resolutionEvidenceRef,
    evidenceDigest: valid.resolutionEvidenceDigest,
    riskAcceptedBy: null,
  });
  validateLoopFindingProof(proof, finding.runId);
  return proof;
}

/** Derive the RISK_ACCEPTANCE proof for a finding transition. */
export function createLoopFindingRiskAcceptanceProof(
  finding: LoopFinding,
  acceptance: LoopFindingRiskAcceptance,
): LoopFindingProof {
  validateLoopFinding(finding);
  const valid = validateLoopFindingRiskAcceptance(acceptance);
  const proof: LoopFindingProof = Object.freeze({
    findingId: finding.findingId,
    proofKind: "RISK_ACCEPTANCE",
    revisionId: null,
    revisionNodeId: null,
    revisionArtifactRef: null,
    revisionArtifactDigest: null,
    evidenceRef: valid.riskAcceptanceEvidenceRef,
    evidenceDigest: valid.riskAcceptanceEvidenceDigest,
    riskAcceptedBy: valid.riskAcceptedBy,
  });
  validateLoopFindingProof(proof, finding.runId);
  return proof;
}

/**
 * Cross-verify the proof set against the verified finding chain (pure part):
 * exactly one proof per RESOLVED / ACCEPTED_RISK finding, none for OPEN /
 * SUPERSEDED findings; the proof kind matches the status; every closure field
 * of the finding row equals its proof counterpart; a RESOLUTION proof's
 * revision node must be at or downstream of the earliest affected node. The
 * store additionally re-binds the proof's revision content fields to the
 * verified revision chain and the evidence to the bound artifact store.
 */
export function validateLoopFindingProofs(
  findings: readonly LoopFinding[],
  proofs: readonly LoopFindingProof[],
  expectedRunId: string,
): void {
  const byId = new Map<string, LoopFinding>();
  for (const finding of findings) byId.set(finding.findingId, finding);
  const proofByFinding = new Map<string, LoopFindingProof>();
  for (const proof of proofs) {
    validateLoopFindingProof(proof, expectedRunId);
    const finding = byId.get(proof.findingId);
    if (finding === undefined) {
      invalid("finding proof must reference an existing finding");
    }
    if (proofByFinding.has(proof.findingId)) {
      invalid("finding must carry at most one closure proof");
    }
    proofByFinding.set(proof.findingId, proof);
    if (finding.status === "RESOLVED") {
      if (proof.proofKind !== "RESOLUTION") {
        invalid("resolved findings must carry a resolution proof");
      }
      if (
        finding.resolvedByRevisionId !== proof.revisionId ||
        finding.resolutionEvidenceRef !== proof.evidenceRef ||
        finding.resolutionEvidenceDigest !== proof.evidenceDigest
      ) {
        invalid("resolution proof must match the finding closure fields");
      }
      const parsed = parseRevisionReference(proof.revisionId!, expectedRunId)!;
      if (nodeIndex(parsed.nodeId) < nodeIndex(finding.earliestAffectedNodeId)) {
        invalid("resolution proof revision is upstream of the earliest affected node");
      }
    } else if (finding.status === "ACCEPTED_RISK") {
      if (proof.proofKind !== "RISK_ACCEPTANCE") {
        invalid("risk-accepted findings must carry a risk acceptance proof");
      }
      if (
        finding.riskAcceptedBy !== proof.riskAcceptedBy ||
        finding.riskAcceptanceEvidenceRef !== proof.evidenceRef ||
        finding.riskAcceptanceEvidenceDigest !== proof.evidenceDigest
      ) {
        invalid("risk acceptance proof must match the finding closure fields");
      }
    } else {
      invalid("open or superseded findings must not carry a closure proof");
    }
  }
  for (const finding of findings) {
    if (
      (finding.status === "RESOLVED" || finding.status === "ACCEPTED_RISK") &&
      !proofByFinding.has(finding.findingId)
    ) {
      invalid("closed findings must carry a closure proof");
    }
  }
}

/** Validate one persisted invalidation scope row against the run identity. */
export function validateLoopFindingInvalidationScope(value: unknown, expectedRunId: string): void {
  if (utilTypes.isProxy(value)) invalid("finding invalidation scope must not be a Proxy");
  const record = readPlainDataRecord(value, "finding invalidation scope");
  exactFields(record, SCOPE_FIELDS, "finding invalidation scope");
  const findingId = text(record.findingId, "finding invalidation scope findingId");
  if (parseFindingId(findingId, expectedRunId) === null) {
    invalid("finding invalidation scope must reference a finding of the same run");
  }
  nonNegativeInteger(record.edgeCount, "finding invalidation scope edgeCount");
  digest(record.scopeDigest, "finding invalidation scope scopeDigest");
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopFindingInvalidationScope(
  scope: LoopFindingInvalidationScope,
  expectedRunId: string,
): string {
  validateLoopFindingInvalidationScope(scope, expectedRunId);
  return JSON.stringify({
    findingId: scope.findingId,
    edgeCount: scope.edgeCount,
    scopeDigest: scope.scopeDigest,
  });
}

/**
 * Fixed-order canonical representation of one finding's ordered invalidation
 * edge list. The store hashes this string into the scope's scopeDigest at
 * append time and recomputes it from the surviving edges on every read-back;
 * the edges MUST be ordered by invalidationIndex (chain validation enforces
 * contiguity, so the order is canonical).
 */
export function canonicalizeLoopFindingInvalidationEdges(
  edges: readonly LoopFindingInvalidation[],
): string {
  return JSON.stringify(
    edges.map((edge) => ({
      invalidationIndex: edge.invalidationIndex,
      revisionId: edge.revisionId,
      nodeId: edge.nodeId,
    })),
  );
}

/** Validate a resolveFinding closure payload. */
export function validateLoopFindingResolution(value: unknown): LoopFindingResolution {
  if (utilTypes.isProxy(value)) invalid("finding resolution must not be a Proxy");
  const record = readPlainDataRecord(value, "finding resolution");
  exactFields(record, RESOLUTION_FIELDS, "finding resolution");
  text(record.resolvedByRevisionId, "resolvedByRevisionId");
  evidenceReference(record.resolutionEvidenceRef, record.resolutionEvidenceDigest, "resolution evidence");
  return Object.freeze({
    resolvedByRevisionId: record.resolvedByRevisionId as string,
    resolutionEvidenceRef: record.resolutionEvidenceRef as string,
    resolutionEvidenceDigest: record.resolutionEvidenceDigest as string,
  });
}

/** Validate an acceptFindingRisk closure payload. */
export function validateLoopFindingRiskAcceptance(value: unknown): LoopFindingRiskAcceptance {
  if (utilTypes.isProxy(value)) invalid("finding risk acceptance must not be a Proxy");
  const record = readPlainDataRecord(value, "finding risk acceptance");
  exactFields(record, RISK_ACCEPTANCE_FIELDS, "finding risk acceptance");
  text(record.riskAcceptedBy, "riskAcceptedBy");
  evidenceReference(
    record.riskAcceptanceEvidenceRef,
    record.riskAcceptanceEvidenceDigest,
    "risk acceptance evidence",
  );
  return Object.freeze({
    riskAcceptedBy: record.riskAcceptedBy as string,
    riskAcceptanceEvidenceRef: record.riskAcceptanceEvidenceRef as string,
    riskAcceptanceEvidenceDigest: record.riskAcceptanceEvidenceDigest as string,
  });
}

/**
 * The only sanctioned finding constructor: validates the draft, derives the
 * schema version and canonical finding id, and returns a frozen finding. New
 * findings are always born OPEN with no closure fields; status transitions
 * happen exclusively through the run-store primitives.
 */
export function createLoopFinding(draft: unknown): LoopFinding {
  if (utilTypes.isProxy(draft)) invalid("finding draft must not be a Proxy");
  const record = readPlainDataRecord(draft, "finding draft");
  exactFields(record, DRAFT_FIELDS, "finding draft");
  const candidate = {
    schemaVersion: LOOP_FINDING_SCHEMA_VERSION,
    findingId: loopFindingId(String(record.runId), Number(record.sequence)),
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    sourceCapability: record.sourceCapability,
    sourceRevisionId: record.sourceRevisionId,
    causeKind: record.causeKind,
    introducedByRevisionId: record.introducedByRevisionId,
    severity: record.severity,
    category: record.category,
    evidenceRef: record.evidenceRef,
    evidenceDigest: record.evidenceDigest,
    earliestAffectedNodeId: record.earliestAffectedNodeId,
    status: "OPEN",
    resolvedByRevisionId: null,
    resolutionEvidenceRef: null,
    resolutionEvidenceDigest: null,
    riskAcceptedBy: null,
    riskAcceptanceEvidenceRef: null,
    riskAcceptanceEvidenceDigest: null,
    supersededBy: null,
    createdAt: record.createdAt,
  };
  validateLoopFinding(candidate);
  return Object.freeze(candidate as unknown as LoopFinding);
}

function transitionFinding(
  finding: LoopFinding,
  to: LoopFindingStatus,
  closure: Partial<LoopFinding>,
): LoopFinding {
  if (utilTypes.isProxy(finding)) invalid("finding must not be a Proxy");
  validateLoopFinding(finding);
  if (!isLegalLoopFindingTransition(finding.status, to)) {
    invalid(`finding status transition ${finding.status} -> ${to} is not legal`);
  }
  const transitioned: LoopFinding = {
    ...finding,
    status: to,
    resolvedByRevisionId: null,
    resolutionEvidenceRef: null,
    resolutionEvidenceDigest: null,
    riskAcceptedBy: null,
    riskAcceptanceEvidenceRef: null,
    riskAcceptanceEvidenceDigest: null,
    supersededBy: null,
    ...closure,
  };
  validateLoopFinding(transitioned);
  return Object.freeze(transitioned);
}

/** OPEN → RESOLVED with the current revision and the Gate evidence. */
export function resolveLoopFinding(finding: LoopFinding, resolution: LoopFindingResolution): LoopFinding {
  const valid = validateLoopFindingResolution(resolution);
  return transitionFinding(finding, "RESOLVED", {
    resolvedByRevisionId: valid.resolvedByRevisionId,
    resolutionEvidenceRef: valid.resolutionEvidenceRef,
    resolutionEvidenceDigest: valid.resolutionEvidenceDigest,
  });
}

/** OPEN → ACCEPTED_RISK with the acceptor and the risk evidence. */
export function acceptLoopFindingRisk(
  finding: LoopFinding,
  acceptance: LoopFindingRiskAcceptance,
): LoopFinding {
  const valid = validateLoopFindingRiskAcceptance(acceptance);
  return transitionFinding(finding, "ACCEPTED_RISK", {
    riskAcceptedBy: valid.riskAcceptedBy,
    riskAcceptanceEvidenceRef: valid.riskAcceptanceEvidenceRef,
    riskAcceptanceEvidenceDigest: valid.riskAcceptanceEvidenceDigest,
  });
}

/** OPEN / RESOLVED / ACCEPTED_RISK → SUPERSEDED with the replacement pointer. */
export function supersedeLoopFinding(finding: LoopFinding, supersedingFindingId: string): LoopFinding {
  return transitionFinding(finding, "SUPERSEDED", { supersededBy: supersedingFindingId });
}

/**
 * Verify a complete per-run finding set with its invalidation edges. Sequences
 * are contiguous from one with monotonic timestamps; every record shares the
 * run identity and one Requirement identity; a SUPERSEDED finding's
 * supersededBy must resolve to an existing later finding; invalidation edges
 * are contiguous per finding from index zero, carry unique node ids, reference
 * same-run revisions of the named node, and only target nodes at or
 * downstream of the finding's earliest affected node.
 */
export function validateLoopFindingChain(
  records: readonly LoopFinding[],
  invalidations: readonly LoopFindingInvalidation[],
  expectedRunId: string,
): void {
  const byId = new Map<string, LoopFinding>();
  let requirementId: string | null = null;
  let previous: LoopFinding | null = null;
  for (const record of records) {
    validateLoopFinding(record);
    if (record.runId !== expectedRunId) invalid("finding run identity mismatch");
    if (byId.has(record.findingId)) invalid("finding id must be unique");
    byId.set(record.findingId, record);
    if (requirementId === null) {
      requirementId = record.requirementId;
    } else if (record.requirementId !== requirementId) {
      invalid("findings must share one Requirement identity");
    }
    if (previous !== null) {
      if (record.sequence !== previous.sequence + 1) {
        invalid("finding sequence must be contiguous from one");
      }
      if (Date.parse(record.createdAt) < Date.parse(previous.createdAt)) {
        invalid("finding timestamps must be monotonic");
      }
    } else if (record.sequence !== 1) {
      invalid("finding sequence must start at one");
    }
    previous = record;
  }
  for (const record of records) {
    if (record.status === "SUPERSEDED" && !byId.has(record.supersededBy!)) {
      invalid("superseded findings must reference an existing replacement finding");
    }
  }
  const byFinding = new Map<string, LoopFindingInvalidation[]>();
  for (const invalidation of invalidations) {
    validateLoopFindingInvalidation(invalidation);
    const finding = byId.get(invalidation.findingId);
    if (finding === undefined) {
      invalid("finding invalidation must reference an existing finding");
    }
    if (parseFindingId(invalidation.findingId, expectedRunId) === null) {
      invalid("finding invalidation must reference a finding of the same run");
    }
    const group = byFinding.get(invalidation.findingId);
    if (group === undefined) byFinding.set(invalidation.findingId, [invalidation]);
    else group.push(invalidation);
  }
  for (const [findingId, group] of byFinding) {
    const finding = byId.get(findingId)!;
    const ordered = [...group].sort((a, b) => a.invalidationIndex - b.invalidationIndex);
    const seenNodes = new Set<string>();
    ordered.forEach((invalidation, index) => {
      if (invalidation.invalidationIndex !== index) {
        invalid("finding invalidation indexes must be contiguous from zero");
      }
      if (seenNodes.has(invalidation.nodeId)) {
        invalid("finding invalidation nodes must be unique per finding");
      }
      seenNodes.add(invalidation.nodeId);
      if (nodeIndex(invalidation.nodeId) < nodeIndex(finding.earliestAffectedNodeId)) {
        invalid("finding invalidation nodes must be at or downstream of the earliest affected node");
      }
      const parsed = parseRevisionReference(invalidation.revisionId, expectedRunId);
      if (parsed === null || parsed.nodeId !== invalidation.nodeId) {
        invalid("finding invalidation revision must reference a same-run revision of the named node");
      }
    });
  }
}

/**
 * The fixed next-eligibility derivation (contract §6), a pure read-only
 * function over the verified finding chain and the per-node current revision
 * validity facts (nodes without a current revision are absent from the map):
 * any OPEN finding blocks; any closed (RESOLVED / ACCEPTED_RISK) finding whose
 * earliest-affected-or-downstream current revision is STALE or missing blocks;
 * SUPERSEDED findings are absorbed by their replacement. Anything else is
 * ELIGIBLE. The result is deterministic: blocking finding ids follow the
 * chain order, reason codes follow first appearance.
 */
export function computeFindingGate(
  findings: readonly LoopFinding[],
  currentValidityByNode: ReadonlyMap<string, string>,
): LoopFindingGateResult {
  const blockingFindings: string[] = [];
  const reasonCodes: LoopFindingGateReasonCode[] = [];
  const block = (findingId: string, reasonCode: LoopFindingGateReasonCode): void => {
    if (!blockingFindings.includes(findingId)) blockingFindings.push(findingId);
    if (!reasonCodes.includes(reasonCode)) reasonCodes.push(reasonCode);
  };
  for (const finding of findings) {
    validateLoopFinding(finding);
    if (finding.status === "SUPERSEDED") continue;
    if (finding.status === "OPEN") {
      block(finding.findingId, "FINDING_OPEN");
      continue;
    }
    for (const nodeId of downstreamNodeIds(finding.earliestAffectedNodeId)) {
      const validity = currentValidityByNode.get(nodeId);
      if (validity === undefined) {
        block(finding.findingId, "FINDING_DOWNSTREAM_MISSING");
        break;
      }
      if (validity !== "ACTIVE") {
        block(finding.findingId, "FINDING_DOWNSTREAM_STALE");
        break;
      }
    }
  }
  return Object.freeze({
    status: blockingFindings.length === 0 ? "ELIGIBLE" : "BLOCKED",
    blockingFindings: Object.freeze(blockingFindings),
    reasonCodes: Object.freeze(reasonCodes),
  });
}
