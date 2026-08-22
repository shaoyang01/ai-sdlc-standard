// LOOP Artifact Revision and Current Authority Model (C02 WP-2)
// ==============================================================
// Pure functions only. No filesystem, SQLite, child_process, Git, network,
// process.env, ExecutionGateway, or Agent adapter imports.
//
// Canonical artifact revisions bind every node's current deliverable to the
// run journal: the stable path, the internal SemVer, the immutable
// content-addressed ref and digest, the producing capability execution, the
// Gate result, the upstream revision references and the runtime validity
// (ACTIVE / STALE / SUPERSEDED). The model never invents business facts and
// carries fixed safe scalars only — never raw prompts, document content,
// credentials or arbitrary JSON metadata.
//
// generation is recorded as a reference binding only; generation advancement
// authority belongs to the orchestration WP (C02-WP4). Finding-driven
// invalidation propagation belongs to C02-WP3; this model only fixes the
// validity state machine both sides rely on.

import { types as utilTypes } from "node:util";

import type { LoopArtifactKind } from "./loop-artifact-store";
import type { LoopCapabilityGateResult } from "./loop-capability-execution";
import { LoopRunJournalError } from "./loop-executor-types";
import { readPlainDataRecord, validateRequirementId } from "./loop-run-state";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";

export const LOOP_ARTIFACT_REVISION_SCHEMA_VERSION = 1 as const;

export const LOOP_ARTIFACT_REVISION_VALIDITIES = ["ACTIVE", "STALE", "SUPERSEDED"] as const;
export type LoopArtifactRevisionValidity = (typeof LOOP_ARTIFACT_REVISION_VALIDITIES)[number];

// Gate-producing capabilities mirror the capability execution contract
// (v2, A2): exactly solution-gate produces conclusive Gate results; every
// other capability records NOT_APPLICABLE. Role-level enforcement (only the
// formal_verdict role may write PASS/FAIL/PASS_WITH_RISK) lands with the
// executionRole model in WP3.5-B.
export const LOOP_ARTIFACT_GATE_CAPABILITIES = ["solution-gate"] as const;

// The revision artifact kinds are exactly the canonical LoopArtifactKind
// values. The list is restated here so this model stays import-pure (the
// artifact store module owns filesystem code); the compile-time check below
// fails closed if the canonical union ever drifts.
export const LOOP_ARTIFACT_REVISION_KINDS = [
  "code_patch",
  "test_summary",
  "review_summary",
  "delivery_result",
  "workspace_metadata",
  "requirement_summary",
  "technical_design",
  "solution_review",
  "executor_input",
  "orchestration_result",
  "governance_tail_result",
  "delivery_checkpoint",
  "capability_output",
  "capability_findings",
  "task_plan",
  "implementation_record",
  "knowledge_sync_result",
] as const;
type ArtifactKindDrift = Exclude<LoopArtifactKind, (typeof LOOP_ARTIFACT_REVISION_KINDS)[number]>;
const _artifactKindListComplete: [ArtifactKindDrift] extends [never] ? true : never = true;
void _artifactKindListComplete;

// The unique canonical node product projection (v2 contract §2, A4): each
// canonical node has exactly one product artifact kind and one stable-path
// directory segment. Revision creation, read-back and Manifest cross-binding
// must all agree on this projection; a legacy specs/** path or a non-node
// kind (e.g. code_patch as a node current) fails closed instead of becoming
// an internally consistent v2 current.
export const LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION: Readonly<
  Record<NodeCapabilityId, { artifactKind: LoopArtifactKind; stablePathSegment: string }>
> = Object.freeze({
  "requirement-intake": { artifactKind: "requirement_summary", stablePathSegment: "00-需求资料" },
  "solution-design": { artifactKind: "technical_design", stablePathSegment: "01-技术方案" },
  "solution-gate": { artifactKind: "solution_review", stablePathSegment: "02-方案审核" },
  "task-planning": { artifactKind: "task_plan", stablePathSegment: "03-任务规划" },
  implementation: { artifactKind: "implementation_record", stablePathSegment: "04-实现记录" },
  "code-review": { artifactKind: "review_summary", stablePathSegment: "05-代码审核" },
  "knowledge-sync": { artifactKind: "knowledge_sync_result", stablePathSegment: "06-知识同步" },
});

export type LoopArtifactRevision = Readonly<{
  schemaVersion: typeof LOOP_ARTIFACT_REVISION_SCHEMA_VERSION;
  revisionId: string;
  runId: string;
  requirementId: string;
  nodeId: NodeCapabilityId;
  sequence: number;
  generation: number | null;
  stablePath: string;
  artifactKind: LoopArtifactKind;
  semver: string;
  artifactRef: string;
  digest: string;
  producerExecutionId: string;
  gateResult: LoopCapabilityGateResult | null;
  validity: LoopArtifactRevisionValidity;
  supersededBy: string | null;
  upstreamRevisionIds: readonly string[];
  createdAt: string;
}>;

/** Builder input: the record without the schema-managed fields. */
export type LoopArtifactRevisionDraft = Readonly<{
  runId: string;
  requirementId: string;
  nodeId: NodeCapabilityId;
  sequence: number;
  generation: number | null;
  stablePath: string;
  artifactKind: LoopArtifactKind;
  semver: string;
  artifactRef: string;
  digest: string;
  producerExecutionId: string;
  gateResult: LoopCapabilityGateResult | null;
  upstreamRevisionIds: readonly string[];
  createdAt: string;
}>;

const RECORD_FIELDS = [
  "schemaVersion", "revisionId", "runId", "requirementId", "nodeId",
  "sequence", "generation", "stablePath", "artifactKind", "semver",
  "artifactRef", "digest", "producerExecutionId", "gateResult", "validity",
  "supersededBy", "upstreamRevisionIds", "createdAt",
] as const;

const DRAFT_FIELDS = [
  "runId", "requirementId", "nodeId", "sequence", "generation", "stablePath",
  "artifactKind", "semver", "artifactRef", "digest", "producerExecutionId",
  "gateResult", "upstreamRevisionIds", "createdAt",
] as const;

// Manifest Artifact Index rows that map to a canonical capability (v2, A4).
// The `07 交付总结` row belongs to the C03 Delivery Tail and has no
// capability; it is outside the cross-binding scope. Old v1 rows
// (`03 实现记录`→implementation 等) are history: v2 rows are the only
// current cross-bind surface, old files stay read-only.
export const LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES: Readonly<Record<string, NodeCapabilityId>> =
  Object.freeze({
    "00 需求资料": "requirement-intake",
    "01 技术方案": "solution-design",
    "02 方案审核": "solution-gate",
    "03 任务规划": "task-planning",
    "04 实现记录": "implementation",
    "05 代码审核": "code-review",
    "06 知识同步": "knowledge-sync",
  });

export const LOOP_ARTIFACT_INDEX_STATUSES = ["draft", "active", "stale", "replaced"] as const;
export type LoopArtifactIndexStatus = (typeof LOOP_ARTIFACT_INDEX_STATUSES)[number];

export type LoopArtifactIndexRow = Readonly<{
  node: string;
  stablePath: string;
  version: string;
  status: LoopArtifactIndexStatus;
  result: string;
}>;

export const LOOP_ARTIFACT_INDEX_CROSS_BIND_STOP_REASONS = [
  "NODE_NOT_MAPPED",
  "CURRENT_REVISION_MISSING",
  "NODE_MISMATCH",
  "STABLE_PATH_DRIFT",
  "VERSION_DRIFT",
  "STATUS_DRIFT",
  "RESULT_DRIFT",
] as const;
export type LoopArtifactIndexCrossBindStopReason =
  (typeof LOOP_ARTIFACT_INDEX_CROSS_BIND_STOP_REASONS)[number];

export type LoopArtifactIndexCrossBindResult =
  | Readonly<{ status: "OK" }>
  | Readonly<{ status: "STOP"; reasonCode: LoopArtifactIndexCrossBindStopReason; detail: string }>;

const INDEX_ROW_FIELDS = ["node", "stablePath", "version", "status", "result"] as const;

const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ARTIFACT_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;
const EXECUTION_ID_SUFFIX_RE = /^[1-9][0-9]*:(started|succeeded|failed)$/;
const GATE_RESULTS: readonly LoopCapabilityGateResult[] = ["PASS", "FAIL", "PASS_WITH_RISK", "NOT_APPLICABLE"];

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

function isoTimestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ISO_RE.test(result) || Number.isNaN(Date.parse(result))) {
    invalid(`${label} must be an ISO-8601 timestamp`);
  }
  return result;
}

function semver(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SEMVER_RE.test(result)) invalid(`${label} must be a semantic version`);
  return result;
}

function digest(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256_RE.test(result)) invalid(`${label} must be a lowercase SHA-256 hex`);
  return result;
}

/**
 * Nested-list counterpart of readPlainDataRecord. Accepts only dense plain
 * arrays with data-descriptor elements: no Proxy, no accessors, no symbol
 * keys, no holes, no extra properties.
 */
function readPlainDataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be a plain data array`);
  if (utilTypes.isProxy(value)) invalid(`${label} must not be a Proxy`);
  const arrayValue: readonly unknown[] = value;
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value as unknown);
  } catch {
    invalid(`${label} must be a plain data array`);
  }
  const elements = new Array<unknown>(arrayValue.length);
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") invalid(`${label} must be a plain data array`);
    if (key === "length") continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key)) invalid(`${label} must be a plain data array`);
    const index = Number(key);
    if (index >= arrayValue.length) invalid(`${label} must be a plain data array`);
    const descriptor = (descriptors as Record<string, PropertyDescriptor>)[key];
    if ("get" in descriptor || "set" in descriptor) invalid(`${label} must be a plain data array`);
    if (!("value" in descriptor)) invalid(`${label} must be a plain data array`);
    elements[index] = descriptor.value;
    count += 1;
  }
  if (count !== arrayValue.length) invalid(`${label} must be a plain data array`);
  return Object.freeze(elements);
}

export function isLoopArtifactGateCapability(nodeId: NodeCapabilityId): boolean {
  return (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(nodeId);
}

export function loopArtifactRevisionId(runId: string, nodeId: string, sequence: number): string {
  return `${runId}:revision:${nodeId}:${sequence}`;
}

/**
 * Numeric-segment SemVer comparison. Both values must already carry the
 * canonical `x.y.z` shape; anything else fails closed.
 */
export function compareLoopArtifactSemver(left: string, right: string): -1 | 0 | 1 {
  const a = semver(left, "semver");
  const b = semver(right, "semver");
  const aParts = a.split(".").map((part) => Number(part));
  const bParts = b.split(".").map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const av = aParts[index]!;
    const bv = bParts[index]!;
    if (!Number.isSafeInteger(av) || !Number.isSafeInteger(bv)) {
      invalid("semver segments must be safe integers");
    }
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** Parse a canonical revision id into its segments, or null when malformed. */
function parseRevisionId(
  revisionId: string,
  expectedRunId: string,
): Readonly<{ nodeId: string; sequence: number }> | null {
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
  return { nodeId, sequence };
}

/**
 * Pure logical-path syntax check for canonical stable paths (v2, A4): the
 * only accepted shape is
 *   library/{requirementId}/{canonicalNodeSegment}/{artifact file}
 * validated on segment structure alone — never against the filesystem.
 * Absolute paths, backslashes, empty segments, `.` / `..` dot segments,
 * foreign requirement directories and traversal shapes such as
 * `03-任务规划/../01-技术方案/escape.md` fail closed instead of passing a
 * substring containment test.
 */
function validateCanonicalStablePath(
  stablePath: string,
  requirementId: string,
  stablePathSegment: string,
): void {
  if (stablePath.includes("\\")) {
    invalid("stablePath must be a POSIX-style logical path without backslashes");
  }
  if (stablePath.startsWith("/")) {
    invalid("stablePath must be a relative logical path");
  }
  const segments = stablePath.split("/");
  if (segments.length < 4) {
    invalid("stablePath must be library/{requirementId}/{canonical segment}/{artifact file}");
  }
  for (const segment of segments) {
    if (segment.length === 0) {
      invalid("stablePath must not contain empty path segments");
    }
    if (segment === "." || segment === "..") {
      invalid("stablePath must not contain dot segments");
    }
  }
  if (segments[0] !== "library") {
    invalid("stablePath must live under the run's library root");
  }
  if (segments[1] !== requirementId) {
    invalid("stablePath requirement directory must match the revision requirement identity");
  }
  if (segments[2] !== stablePathSegment) {
    invalid("stablePath must live under the canonical node directory");
  }
}

/** Validate the exact fixed-scalar record contract and the validity rules. */
export function validateLoopArtifactRevision(value: unknown): void {
  if (utilTypes.isProxy(value)) invalid("artifact revision must not be a Proxy");
  const record = readPlainDataRecord(value, "artifact revision");
  exactFields(record, RECORD_FIELDS, "artifact revision");
  if (record.schemaVersion !== LOOP_ARTIFACT_REVISION_SCHEMA_VERSION) {
    invalid("artifact revision schema version is unsupported");
  }
  text(record.revisionId, "revisionId");
  const runId = text(record.runId, "runId");
  validateRequirementId(record.requirementId, "requirementId");
  if (typeof record.nodeId !== "string" || !(NODE_CAPABILITY_IDS as readonly string[]).includes(record.nodeId)) {
    invalid("nodeId must be a canonical capability id");
  }
  const nodeId = record.nodeId as NodeCapabilityId;
  const sequence = positiveInteger(record.sequence, "sequence");
  if (record.generation !== null) positiveInteger(record.generation, "generation");
  const stablePath = text(record.stablePath, "stablePath");
  if (
    typeof record.artifactKind !== "string" ||
    !(LOOP_ARTIFACT_REVISION_KINDS as readonly string[]).includes(record.artifactKind)
  ) {
    invalid("artifactKind must be a canonical artifact kind");
  }
  const artifactKind = record.artifactKind as string;
  // Canonical node product projection (v2, A4): the node's product kind and
  // stable-path directory are fixed, and the path must carry the exact
  // logical shape library/{requirementId}/{segment}/…. A legacy specs/**
  // path or a non-node kind cannot masquerade as a v2 current revision, and
  // a traversal shape cannot escape the node directory while naming it.
  const nodeProjection = LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId];
  if (nodeProjection !== undefined) {
    if (artifactKind !== nodeProjection.artifactKind) {
      invalid("artifactKind must be the canonical product kind of the node");
    }
    validateCanonicalStablePath(
      stablePath,
      record.requirementId as string,
      nodeProjection.stablePathSegment,
    );
  }
  semver(record.semver, "semver");
  const ref = text(record.artifactRef, "artifactRef");
  const refMatch = ARTIFACT_REF_RE.exec(ref);
  if (refMatch === null) invalid("artifactRef must be a canonical content-addressed artifact reference");
  if (refMatch[1] !== artifactKind) invalid("artifactRef kind must match artifactKind");
  const digestValue = digest(record.digest, "digest");
  if (refMatch[2] !== digestValue) invalid("artifactRef and digest must match");
  const producerExecutionId = text(record.producerExecutionId, "producerExecutionId");
  const producerPrefix = `${runId}:capability:`;
  if (
    !producerExecutionId.startsWith(producerPrefix) ||
    !EXECUTION_ID_SUFFIX_RE.test(producerExecutionId.slice(producerPrefix.length))
  ) {
    invalid("producerExecutionId must reference a capability execution of the same run");
  }
  if (
    record.gateResult !== null &&
    (typeof record.gateResult !== "string" || !GATE_RESULTS.includes(record.gateResult as LoopCapabilityGateResult))
  ) {
    invalid("gateResult must be a canonical Gate result or null");
  }
  if (isLoopArtifactGateCapability(nodeId)) {
    if (record.gateResult !== "PASS" && record.gateResult !== "PASS_WITH_RISK") {
      invalid("Gate node revisions require a conclusive passing Gate result");
    }
  } else if (record.gateResult !== "NOT_APPLICABLE") {
    invalid("non-Gate node revisions must use NOT_APPLICABLE");
  }
  if (
    typeof record.validity !== "string" ||
    !(LOOP_ARTIFACT_REVISION_VALIDITIES as readonly string[]).includes(record.validity)
  ) {
    invalid("validity must be a canonical artifact revision validity");
  }
  const validity = record.validity as LoopArtifactRevisionValidity;
  if (record.supersededBy !== null) {
    const supersededBy = text(record.supersededBy, "supersededBy");
    const parsed = parseRevisionId(supersededBy, runId);
    if (parsed === null || parsed.nodeId !== nodeId) {
      invalid("supersededBy must reference a revision of the same run and node");
    }
    if (parsed.sequence <= sequence) {
      invalid("supersededBy must reference a later revision of the same node");
    }
  }
  if ((validity === "SUPERSEDED") !== (record.supersededBy !== null)) {
    invalid("superseded revisions must carry supersededBy; other validities must not");
  }
  const upstreams = readPlainDataArray(record.upstreamRevisionIds, "upstreamRevisionIds");
  const seen = new Set<string>();
  for (const item of upstreams) {
    const upstreamId = text(item, "upstreamRevisionIds element");
    if (parseRevisionId(upstreamId, runId) === null) {
      invalid("upstream revision ids must reference revisions of the same run");
    }
    if (upstreamId === loopArtifactRevisionId(runId, nodeId, sequence)) {
      invalid("upstream revision ids must not self-reference");
    }
    if (seen.has(upstreamId)) invalid("upstream revision ids must be unique");
    seen.add(upstreamId);
  }
  isoTimestamp(record.createdAt, "createdAt");
  if (record.revisionId !== loopArtifactRevisionId(runId, nodeId, sequence)) {
    invalid("revisionId must match run, node and sequence");
  }
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopArtifactRevision(record: LoopArtifactRevision): string {
  validateLoopArtifactRevision(record);
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    revisionId: record.revisionId,
    runId: record.runId,
    requirementId: record.requirementId,
    nodeId: record.nodeId,
    sequence: record.sequence,
    generation: record.generation,
    stablePath: record.stablePath,
    artifactKind: record.artifactKind,
    semver: record.semver,
    artifactRef: record.artifactRef,
    digest: record.digest,
    producerExecutionId: record.producerExecutionId,
    gateResult: record.gateResult,
    validity: record.validity,
    supersededBy: record.supersededBy,
    upstreamRevisionIds: record.upstreamRevisionIds,
    createdAt: record.createdAt,
  });
}

function deepFreezeRevision(record: LoopArtifactRevision): LoopArtifactRevision {
  Object.freeze(record.upstreamRevisionIds);
  return Object.freeze(record);
}

/**
 * The only sanctioned revision constructor: validates the draft, derives the
 * schema version and canonical revision id, and returns a deep-frozen
 * revision. New revisions are always born ACTIVE with no supersededBy;
 * validity transitions happen exclusively through the run-store primitives.
 * Persisted writes still go exclusively through the run-store append API.
 */
export function createLoopArtifactRevision(draft: unknown): LoopArtifactRevision {
  if (utilTypes.isProxy(draft)) invalid("artifact revision draft must not be a Proxy");
  const record = readPlainDataRecord(draft, "artifact revision draft");
  exactFields(record, DRAFT_FIELDS, "artifact revision draft");
  const candidate = {
    schemaVersion: LOOP_ARTIFACT_REVISION_SCHEMA_VERSION,
    revisionId: loopArtifactRevisionId(String(record.runId), String(record.nodeId), Number(record.sequence)),
    runId: record.runId,
    requirementId: record.requirementId,
    nodeId: record.nodeId,
    sequence: record.sequence,
    generation: record.generation,
    stablePath: record.stablePath,
    artifactKind: record.artifactKind,
    semver: record.semver,
    artifactRef: record.artifactRef,
    digest: record.digest,
    producerExecutionId: record.producerExecutionId,
    gateResult: record.gateResult,
    validity: "ACTIVE",
    supersededBy: null,
    upstreamRevisionIds: record.upstreamRevisionIds,
    createdAt: record.createdAt,
  };
  validateLoopArtifactRevision(candidate);
  return deepFreezeRevision(candidate as unknown as LoopArtifactRevision);
}

/**
 * Compute the post-transition SUPERSEDED form of a node's previous current
 * revision during an append. The validity machine admits exactly one
 * supersede edge — ACTIVE → SUPERSEDED — and the successor must be the
 * canonical next revision of the same node; anything else fails closed. The
 * run-store write path validates the chain in this post-transition state:
 * validating the pre-transition rows (old current still ACTIVE alongside the
 * new ACTIVE revision) would reject every legitimate version advance, because
 * only the latest revision of a node may remain ACTIVE.
 */
export function supersedeArtifactRevision(
  previous: LoopArtifactRevision,
  successorRevisionId: string,
): LoopArtifactRevision {
  if (utilTypes.isProxy(previous)) invalid("previous artifact revision must not be a Proxy");
  validateLoopArtifactRevision(previous);
  if (previous.validity !== "ACTIVE") {
    invalid("only an active artifact revision can be superseded");
  }
  const expectedSuccessor = loopArtifactRevisionId(previous.runId, previous.nodeId, previous.sequence + 1);
  if (successorRevisionId !== expectedSuccessor) {
    invalid("supersede successor must be the next revision of the node");
  }
  const superseded: LoopArtifactRevision = {
    ...previous,
    validity: "SUPERSEDED",
    supersededBy: successorRevisionId,
  };
  validateLoopArtifactRevision(superseded);
  return deepFreezeRevision(superseded);
}

/**
 * Verify a complete per-run revision set. Records are grouped by node (each
 * node's revisions contiguous, sequences from one, timestamps monotonic,
 * SemVer strictly increasing); every record shares the run identity and one
 * Requirement identity; upstream references must resolve to existing
 * revisions of the same run that were created no later than the consumer; a
 * SUPERSEDED revision's supersededBy must point at its node's next sequence;
 * only the latest revision of a node may remain ACTIVE (earlier revisions are
 * SUPERSEDED with a backfilled successor, or STALE when the pointer advanced
 * past them).
 */
export function validateLoopArtifactRevisionChain(
  records: readonly LoopArtifactRevision[],
  expectedRunId: string,
): void {
  const ids = new Set<string>();
  const byId = new Map<string, LoopArtifactRevision>();
  let requirementId: string | null = null;
  let previousNodeId: string | null = null;
  let previousInGroup: LoopArtifactRevision | null = null;
  const closedNodes = new Set<string>();
  for (const record of records) {
    validateLoopArtifactRevision(record);
    if (record.runId !== expectedRunId) invalid("artifact revision run identity mismatch");
    if (ids.has(record.revisionId)) invalid("artifact revision id must be unique");
    ids.add(record.revisionId);
    byId.set(record.revisionId, record);
    if (requirementId === null) {
      requirementId = record.requirementId;
    } else if (record.requirementId !== requirementId) {
      invalid("artifact revisions must share one Requirement identity");
    }
    if (record.nodeId !== previousNodeId) {
      if (closedNodes.has(record.nodeId)) {
        invalid("artifact revisions of one node must be contiguous and grouped");
      }
      if (previousNodeId !== null) closedNodes.add(previousNodeId);
      if (record.sequence !== 1) invalid("artifact revision sequence must start at one per node");
      previousNodeId = record.nodeId;
      previousInGroup = record;
      continue;
    }
    const previous = previousInGroup!;
    if (record.sequence !== previous.sequence + 1) {
      invalid("artifact revision sequence must be contiguous per node");
    }
    if (Date.parse(record.createdAt) < Date.parse(previous.createdAt)) {
      invalid("artifact revision timestamps must be monotonic per node");
    }
    if (compareLoopArtifactSemver(record.semver, previous.semver) <= 0) {
      invalid("artifact revision semver must strictly increase per node");
    }
    previousInGroup = record;
  }
  for (const record of records) {
    const successorId = loopArtifactRevisionId(record.runId, record.nodeId, record.sequence + 1);
    if (record.validity === "ACTIVE" && byId.has(successorId)) {
      invalid("only the latest revision of a node may remain active");
    }
    if (record.validity === "SUPERSEDED") {
      if (record.supersededBy !== successorId || !byId.has(successorId)) {
        invalid("superseded revisions must reference the next revision of their node");
      }
    }
    for (const upstreamId of record.upstreamRevisionIds) {
      const upstream = byId.get(upstreamId);
      if (upstream === undefined) {
        invalid("upstream revision references must resolve to existing revisions of the run");
      }
      if (Date.parse(upstream.createdAt) > Date.parse(record.createdAt)) {
        invalid("upstream revisions must not be created after their consumer");
      }
      if (upstream.nodeId === record.nodeId && upstream.sequence >= record.sequence) {
        invalid("same-node upstream revisions must precede their consumer");
      }
    }
  }
}

function stop(reasonCode: LoopArtifactIndexCrossBindStopReason, detail: string): LoopArtifactIndexCrossBindResult {
  return Object.freeze({ status: "STOP" as const, reasonCode, detail });
}

/**
 * Journal ↔ manifest Artifact Index cross-binding (invariant: the journal
 * owns ref/digest, the manifest owns DocFlow status; neither copies the
 * other's schema). The caller supplies one parsed Index row and the journal
 * current revision for that node (null when the node has none). stablePath
 * and version must match the current revision exactly; the manifest status
 * must match the runtime validity mapping (current ACTIVE ↔ draft/active,
 * stale ↔ stale, superseded ↔ replaced); Gate rows' result must equal the
 * revision gateResult. Any drift returns a STOP diagnosis — the function
 * never silently picks a side. Malformed caller input fails closed with
 * INVALID_INPUT instead.
 */
export function crossBindArtifactIndexRow(
  row: unknown,
  currentRevision: LoopArtifactRevision | null,
): LoopArtifactIndexCrossBindResult {
  if (utilTypes.isProxy(row)) invalid("artifact index row must not be a Proxy");
  const record = readPlainDataRecord(row, "artifact index row");
  exactFields(record, INDEX_ROW_FIELDS, "artifact index row");
  const node = text(record.node, "artifact index row.node");
  text(record.stablePath, "artifact index row.stablePath");
  text(record.version, "artifact index row.version");
  if (
    typeof record.status !== "string" ||
    !(LOOP_ARTIFACT_INDEX_STATUSES as readonly string[]).includes(record.status)
  ) {
    invalid("artifact index row.status must be a canonical manifest artifact status");
  }
  const status = record.status as LoopArtifactIndexStatus;
  if (typeof record.result !== "string" || CONTROL_RE.test(record.result)) {
    invalid("artifact index row.result must be a safe string");
  }
  const result = record.result;

  const capability = LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES[node];
  if (capability === undefined) {
    return stop("NODE_NOT_MAPPED", "artifact index row has no canonical capability binding");
  }
  if (currentRevision === null) {
    return stop("CURRENT_REVISION_MISSING", "journal has no current revision for the mapped node");
  }
  validateLoopArtifactRevision(currentRevision);
  if (currentRevision.nodeId !== capability) {
    return stop("NODE_MISMATCH", "current revision node does not match the artifact index row node");
  }
  if (record.stablePath !== currentRevision.stablePath) {
    return stop("STABLE_PATH_DRIFT", "manifest stable path does not match the journal current revision");
  }
  if (record.version !== currentRevision.semver) {
    return stop("VERSION_DRIFT", "manifest version does not match the journal current revision");
  }
  const statusMatches =
    (currentRevision.validity === "ACTIVE" && (status === "draft" || status === "active")) ||
    (currentRevision.validity === "STALE" && status === "stale") ||
    (currentRevision.validity === "SUPERSEDED" && status === "replaced");
  if (!statusMatches) {
    return stop("STATUS_DRIFT", "manifest status does not match the runtime validity mapping");
  }
  if (isLoopArtifactGateCapability(capability) && result !== currentRevision.gateResult) {
    return stop("RESULT_DRIFT", "Gate row result does not match the journal Gate result");
  }
  return Object.freeze({ status: "OK" as const });
}
