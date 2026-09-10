/**
 * G5-T2 (D-090-03 Δ1): the runtime manifest projector — TS-native twin of the
 * manual publisher semantics, implemented strictly against the frozen
 * projection-semantics document v1.7.0 @ a5ea687
 * (docs/reports/decision-090-g5-projection-semantics.md, G5-T1 closure report)
 * and contract manual-runtime-semantic-contract v1.0.0 §6.2.
 *
 * Scope boundaries (G5 authorization, remaining plan v1.1.0):
 *   - the ONLY write target is `library/{id}/manifest.md` (atomic rename);
 *     `00-需求资料/intake.manifest.json` is never touched
 *   - manual publisher / Skill faces / shadow paths / business repos are out
 *     of scope and never modified
 *
 * Decision numbers (D-x) below refer to the freeze document's boundary
 * decision table (D-1..D-24); section numbers (§x) refer to the same
 * document. Contract sections are written as C §x.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { NODE_CAPABILITY_CONTRACTS } from "./node-capability-contracts";
import {
  NODE_CAPABILITY_IDS,
  type NodeCapabilityId,
} from "../loop/types";
import type { LoopRunStore } from "./loop-run-store";
import type { LoopCapabilityExecutionEvent } from "./loop-capability-execution";
import type { LoopArtifactRevision } from "./loop-artifact-revision";
import type {
  LoopFinding,
  LoopFindingInvalidation,
  LoopFindingProof,
} from "./loop-finding-lifecycle";
import { recoverRunContext } from "./loop-recovery";
import {
  dumpRubyYaml,
  parseRubyYaml,
  LoopManifestYamlError,
  type YamlValue,
} from "./loop-manifest-yaml";

export const LOOP_MANIFEST_SCHEMA_VERSION = "1.0";
export const PROJECTION_PROVENANCE_SCHEMA = "g5-projection-provenance/1";

export const LOOP_MANIFEST_NODES = NODE_CAPABILITY_IDS;

/** C §6.2.7 / freeze §1.2 failure exits. */
export type LoopManifestProjectionStopCode =
  | "MANIFEST_CORRUPT_STOP"
  | "JOURNAL_MANIFEST_MISMATCH_STOP"
  | "BLOCKED_AMBIGUOUS";

export type LoopManifestProjectionOutcome =
  | Readonly<{ kind: "NO_OP" }>
  | Readonly<{ kind: "PUBLISHED"; manifestPath: string; manifestDigest: string; tookOver: boolean }>
  | Readonly<{ kind: "DEFERRED"; reason: string }>
  | Readonly<{ kind: "STOP"; code: LoopManifestProjectionStopCode; reason: string }>;

export type LoopManifestProjectionRequest = Readonly<{
  store: LoopRunStore;
  runId: string;
  requirementId: string;
  /** `library/{id}` directory holding manifest.md (the only writable target). */
  libraryDir: string;
  /**
   * Acceptance timestamp for a MANUAL takeover record (freeze §8.0
   * accepted_at). Required when a takeover-A may occur (no journal events);
   * takeover-B defaults to the last terminal event's createdAt.
   */
  takeoverAcceptedAt?: string;
}>;

// ---------------------------------------------------------------------------
// Frozen manifest document shape (freeze §2)
// ---------------------------------------------------------------------------

export type ManifestExecutionFact = Readonly<{
  status: "succeeded" | "blocked" | "failed";
  execution_event_ref: string;
  error_code: string | null;
  reason_code: string | null;
  ledger_ref: string | null;
  ledger_digest: string | null;
  blocked_report_ref: string | null;
  blocked_report_digest: string | null;
}>;

/**
 * `gate_result/decision_depth/decision_status` exist only once the entry has
 * adjudication facts (manual init rows and non-gate rows carry the seven base
 * keys only — probed real publisher shape); `execution` exists only once a
 * runtime terminal event has touched the node (runtime-face-only key, D-8).
 */
export type ManifestEntry = Readonly<{
  node: NodeCapabilityId;
  status: "pending" | "current" | "stale";
  artifact_path: string | null;
  version: string | null;
  digest: string | null;
  updated_at: string | null;
  source_event_ref: string | null;
  gate_result?: string | null;
  decision_depth?: string | null;
  decision_status?: string | null;
  execution?: ManifestExecutionFact;
}>;

export type ManifestFindingRow = Readonly<{
  finding_id: string;
  discovered_at: string;
  root_cause_category: string;
  earliest_affected_node_id: string;
  source_revision: string | null;
  evidence_ref: string;
  status: "OPEN" | "RESOLVED" | "ACCEPTED" | "SUPERSEDED";
  closed_by: string | null;
  closure_evidence_ref: string | null;
  closure_evidence_digest: string | null;
  closure_bound_revision_id: string | null;
}>;

/** Freeze §7.2: the provenance map is an OBJECT with three partitions (D-19). */
export type ManifestIdentityMap = Readonly<{
  findings: readonly ManifestMapFindingRow[];
  revisions: readonly ManifestMapRevisionRow[];
  closures: readonly ManifestMapClosureRow[];
}>;

export type ManifestMapFindingRow = Readonly<{
  manual_id: string | null;
  runtime_id: string | null;
  source: "manual" | "runtime";
  first_seen: Readonly<{
    manual_locator: { readonly artifact_path: string; readonly finding_index: number } | null;
    runtime_locator: {
      readonly source_capability: string;
      readonly producer_execution_id: string;
      readonly store_sequence: number;
    } | null;
  }>;
}>;

export type ManifestMapRevisionRow = Readonly<{
  kind: "discovery";
  manual_ref: string | null;
  runtime_revision_id: string | null;
}>;

export type ManifestMapClosureRow = Readonly<{
  manual_ref: string | null;
  runtime_revision_id: string | null;
  resolution_evidence_digest: string;
}>;

export type ProjectionProvenance = Readonly<{
  schema: typeof PROJECTION_PROVENANCE_SCHEMA;
  mode: "manual-takeover-A" | "manual-takeover-B";
  accepted_at: string;
  takeover_cursor: number;
  baseline: Readonly<{ manifest_digest_at_takeover: string }>;
  logical_identity_map: ManifestIdentityMap;
}>;

export type ManifestState = Readonly<{
  schema_version: string;
  requirement_id: string;
  title: string;
  publish_seq: number;
  projected_through: number | "MANUAL";
  updated_at: string;
  depth: Readonly<{
    decision_scope: string;
    requested_depth: string;
    initial_depth_basis: string;
    required_depth: string;
  }>;
  entries: readonly ManifestEntry[];
  finding_index: readonly ManifestFindingRow[];
  declaration_log: readonly YamlValue[];
  corrections: readonly YamlValue[];
  projection_provenance?: ProjectionProvenance;
  repair_records: readonly YamlValue[];
  manifest_digest: string;
}>;

/** `impl-fixed` sentinel: repair inside one implementation batch (real P shape, D-21). */
export const IMPL_FIXED_SENTINEL = "impl-fixed";

// ---------------------------------------------------------------------------
// Errors: infrastructure failures throw; protocol failures return STOP.
// ---------------------------------------------------------------------------

export class LoopManifestProjectionError extends Error {
  readonly code: LoopManifestProjectionStopCode;
  constructor(code: LoopManifestProjectionStopCode, reason: string) {
    super(`${code}: ${reason}`);
    this.name = "LoopManifestProjectionError";
    this.code = code;
  }
}

function stop(code: LoopManifestProjectionStopCode, reason: string): never {
  throw new LoopManifestProjectionError(code, reason);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Canonical serialization + self-digest (freeze §5, D-5)
// ---------------------------------------------------------------------------

function entryToYamlMap(entry: ManifestEntry): Record<string, YamlValue> {
  const row: Record<string, YamlValue> = {
    node: entry.node,
    status: entry.status,
    artifact_path: entry.artifact_path,
    version: entry.version,
    digest: entry.digest,
    updated_at: entry.updated_at,
    source_event_ref: entry.source_event_ref,
  };
  if ("gate_result" in entry) row.gate_result = entry.gate_result ?? null;
  if ("decision_depth" in entry) row.decision_depth = entry.decision_depth ?? null;
  if ("decision_status" in entry) row.decision_status = entry.decision_status ?? null;
  if (entry.execution !== undefined) row.execution = { ...entry.execution };
  return row;
}

function stateToYamlMap(state: ManifestState): { readonly [key: string]: YamlValue } {
  const map: Record<string, YamlValue> = {
    schema_version: state.schema_version,
    requirement_id: state.requirement_id,
    title: state.title,
    publish_seq: state.publish_seq,
    projected_through: state.projected_through === "MANUAL" ? "MANUAL" : state.projected_through,
    updated_at: state.updated_at,
    depth: { ...state.depth },
    entries: state.entries.map(entryToYamlMap),
    finding_index: state.finding_index.map((f) => ({ ...f })),
    declaration_log: [...state.declaration_log],
    corrections: [...state.corrections],
  };
  if (state.projection_provenance !== undefined) {
    map.projection_provenance = provenanceToYamlMap(state.projection_provenance);
  }
  map.repair_records = [...state.repair_records];
  // The digest key participates ONLY after sealing — the hash input is the
  // document with the key entirely absent (publisher `state.delete` semantics).
  if (state.manifest_digest !== undefined) map.manifest_digest = state.manifest_digest;
  return map;
}

function provenanceToYamlMap(p: ProjectionProvenance): YamlValue {
  return {
    schema: p.schema,
    mode: p.mode,
    accepted_at: p.accepted_at,
    takeover_cursor: p.takeover_cursor,
    baseline: { manifest_digest_at_takeover: p.baseline.manifest_digest_at_takeover },
    logical_identity_map: {
      findings: p.logical_identity_map.findings.map((f) => ({
        manual_id: f.manual_id,
        runtime_id: f.runtime_id,
        source: f.source,
        first_seen: {
          manual_locator: f.first_seen.manual_locator === null
            ? null
            : { ...f.first_seen.manual_locator },
          runtime_locator: f.first_seen.runtime_locator === null
            ? null
            : { ...f.first_seen.runtime_locator },
        },
      })),
      revisions: p.logical_identity_map.revisions.map((r) => ({ ...r })),
      closures: p.logical_identity_map.closures.map((c) => ({ ...c })),
    },
  };
}

/** Serialize WITHOUT the digest key, hash, then serialize WITH the key (freeze §5). */
export function sealManifest(state: Omit<ManifestState, "manifest_digest">): ManifestState {
  const map = stateToYamlMap({ ...state, manifest_digest: undefined } as ManifestState);
  delete (map as Record<string, YamlValue>).manifest_digest;
  const digest = `sha256:${sha256Hex(dumpRubyYaml(map))}`;
  return Object.freeze({ ...state, manifest_digest: digest });
}

/** C §6.2.2 level 1: recompute the embedded self-digest over the other keys. */
export function verifySelfDigest(state: ManifestState): void {
  const claimed = state.manifest_digest;
  const map = stateToYamlMap(state);
  delete (map as Record<string, YamlValue>).manifest_digest;
  const actual = `sha256:${sha256Hex(dumpRubyYaml(map as { readonly [key: string]: YamlValue }))}`;
  if (actual !== claimed) {
    stop("MANIFEST_CORRUPT_STOP", `self-digest mismatch (claimed ${claimed}, actual ${actual})`);
  }
}

// ---------------------------------------------------------------------------
// Node → directory-segment conversion table (D-7), derived from the frozen
// capability contracts (`library/{requirement_id}/<segment>/...`).
// ---------------------------------------------------------------------------

const NODE_DIRECTORY_SEGMENTS: Readonly<Record<NodeCapabilityId, string>> = (() => {
  const table = {} as Record<NodeCapabilityId, string>;
  for (const contract of NODE_CAPABILITY_CONTRACTS) {
    // Prose forms like implementation's "工作区改动 + 实现记录
    // （library/{requirement_id}/04-实现记录/）" still carry the segment.
    const match = /library\/\{requirement_id\}\/([^/\s）]+)/.exec(contract.outputArtifact);
    if (match === null) {
      throw new Error(`capability ${contract.capability} output artifact has no library segment`);
    }
    table[contract.capability] = match[1];
  }
  return table;
})();

/** §7.1 path semantic key = (directory segment, capability); basenames are D-7 exempt. */
function pathSemanticKey(relativePath: string, node: NodeCapabilityId): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const dir = path.posix.dirname(normalized);
  const segment = dir === "." ? "" : dir;
  const declared = NODE_DIRECTORY_SEGMENTS[node];
  // The directory segment must agree with the node's frozen conversion row;
  // basename differences (Chinese/English) are the D-7 face mapping exemption.
  const basename = path.posix.basename(normalized);
  return `${segment === declared ? segment : `${segment}!${declared}`}::${node}::${basename}`;
}

// ---------------------------------------------------------------------------
// fold machinery (freeze §3.2): full per-event reduction over three slots
// ---------------------------------------------------------------------------

function initEntry(node: NodeCapabilityId): ManifestEntry {
  return {
    node,
    status: "pending",
    artifact_path: null,
    version: null,
    digest: null,
    updated_at: null,
    source_event_ref: null,
  };
}

function executionFactOf(event: LoopCapabilityExecutionEvent): ManifestExecutionFact {
  const status: ManifestExecutionFact["status"] =
    event.status === "succeeded" ? "succeeded" : event.status === "blocked" ? "blocked" : "failed";
  return {
    status,
    execution_event_ref: event.executionEventId,
    error_code: event.errorCode,
    reason_code: event.reasonCode,
    ledger_ref: event.unresolvedFindingsRef,
    ledger_digest: event.unresolvedFindingsDigest,
    blocked_report_ref: event.status === "blocked" ? event.outputArtifactRef : null,
    blocked_report_digest: event.status === "blocked" ? event.outputDigest : null,
  };
}

/**
 * One terminal event folded onto one node entry (freeze §3.2 rule table).
 * `revision` (when defined) marks the event's output as materialized.
 */
export function foldEventOntoEntry(
  entry: ManifestEntry,
  event: LoopCapabilityExecutionEvent,
  revision: LoopArtifactRevision | undefined,
  requirementId: string,
): ManifestEntry {
  let next: ManifestEntry = { ...entry };
  if (event.status === "succeeded" && revision !== undefined) {
    next = {
      ...next,
      status: revision.validity === "ACTIVE" ? "current" : "stale",
      artifact_path: stripLibraryPrefix(revision.stablePath, requirementId),
      version: revision.semver,
      digest: revision.digest,
      // D-23: event-time domain (the producing terminal event's createdAt).
      updated_at: event.createdAt,
      source_event_ref: event.executionEventId,
    };
  }
  if (
    event.capability === "solution-gate" &&
    event.executionRole === "formal_verdict" &&
    event.status === "succeeded"
  ) {
    next = {
      ...next,
      gate_result: event.gateResult ?? "FAIL",
      decision_depth: event.decisionDepth ?? null,
      decision_status: event.decisionStatus ?? null,
    };
  }
  next = { ...next, execution: executionFactOf(event) };
  return next;
}

function stripLibraryPrefix(stablePath: string, requirementId: string): string {
  const prefix = `library/${requirementId}/`;
  return stablePath.startsWith(prefix) ? stablePath.slice(prefix.length) : stablePath;
}

/**
 * Depth reduction (freeze §3.3): ESCALATED is the ONLY required_depth raise
 * source; CONFIRMED keeps it (harmless de-escalation); BLOCKED_UNKNOWN keeps
 * it with a null decision_depth. Exported so the §3.3 reduction table is
 * assertable independently of any journal chain (fold purity).
 */
export function foldDepth(requiredDepth: string, event: LoopCapabilityExecutionEvent): string {
  if (
    event.capability === "solution-gate" &&
    event.executionRole === "formal_verdict" &&
    event.status === "succeeded" &&
    event.decisionStatus === "ESCALATED" &&
    event.decisionDepth !== null
  ) {
    return event.decisionDepth;
  }
  return requiredDepth;
}

function revisionForEvent(
  event: LoopCapabilityExecutionEvent,
  revisions: readonly LoopArtifactRevision[],
): LoopArtifactRevision | undefined {
  return revisions.find(
    (r) => r.producerExecutionId === event.executionEventId && r.nodeId === event.capability,
  );
}

/** Terminal events in sequence order (freeze §3.2 fold domain). */
function terminalEventsOf(events: readonly LoopCapabilityExecutionEvent[]): readonly LoopCapabilityExecutionEvent[] {
  return events
    .filter((e) => e.status !== "started")
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
}

// ---------------------------------------------------------------------------
// Invalidation timing (D-10): an edge's point = the registering terminal
// event's sequence, recovered by same-transaction createdAt matching (findings
// register inside the event's transaction). Zero or multiple matches are
// refused — the gateway-bound domain is the projector's applicability domain.
// ---------------------------------------------------------------------------

function registeringEvent(
  finding: LoopFinding,
  events: readonly LoopCapabilityExecutionEvent[],
): LoopCapabilityExecutionEvent | undefined {
  const matches = events.filter((e) => e.status !== "started" && e.createdAt === finding.createdAt);
  return matches.length === 1 ? matches[0] : undefined;
}

/** r_k at C: the valid revision with the largest producer-event sequence ≤ C (freeze §4.2(a)). */
function effectiveRevisionAt(
  nodeId: NodeCapabilityId,
  events: readonly LoopCapabilityExecutionEvent[],
  revisions: readonly LoopArtifactRevision[],
  sequenceAt: number,
): LoopArtifactRevision | undefined {
  const eventSeqByExecutionId = new Map<string, number>();
  for (const e of events) eventSeqByExecutionId.set(e.executionEventId, e.sequence);
  const candidates = revisions.filter(
    (r) =>
      r.nodeId === nodeId &&
      (eventSeqByExecutionId.get(r.producerExecutionId) ?? Number.POSITIVE_INFINITY) <= sequenceAt,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, r) => (r.sequence > best.sequence ? r : best));
}

function isStaleAt(
  revision: LoopArtifactRevision,
  invalidations: readonly LoopFindingInvalidation[],
  findings: readonly LoopFinding[],
  events: readonly LoopCapabilityExecutionEvent[],
  sequenceAt: number,
): boolean {
  return invalidations.some((edge) => {
    if (edge.revisionId !== revision.revisionId) return false;
    const finding = findings.find((f) => f.findingId === edge.findingId);
    if (finding === undefined) return false;
    const event = registeringEvent(finding, events);
    return event !== undefined && event.sequence <= sequenceAt;
  });
}

// ---------------------------------------------------------------------------
// finding_index row mapping (freeze §3.4, 11 fields)
// ---------------------------------------------------------------------------

function expectedFindingRow(
  finding: LoopFinding,
  proof: LoopFindingProof | undefined,
): ManifestFindingRow {
  const status =
    finding.status === "ACCEPTED_RISK"
      ? "ACCEPTED"
      : (finding.status as "OPEN" | "RESOLVED" | "SUPERSEDED");
  const resolved = finding.status === "RESOLVED";
  const accepted = finding.status === "ACCEPTED_RISK";
  return {
    finding_id: finding.findingId,
    discovered_at: finding.sourceCapability,
    root_cause_category: finding.category,
    earliest_affected_node_id: finding.earliestAffectedNodeId,
    source_revision: finding.sourceRevisionId === "" ? null : finding.sourceRevisionId,
    evidence_ref: finding.evidenceRef,
    status,
    closed_by: resolved ? proof?.resolvedByNodeId ?? null : accepted ? finding.riskAcceptedBy : null,
    closure_evidence_ref: resolved
      ? finding.resolutionEvidenceRef
      : accepted
        ? finding.riskAcceptanceEvidenceRef
        : null,
    closure_evidence_digest: resolved
      ? finding.resolutionEvidenceDigest
      : accepted
        ? finding.riskAcceptanceEvidenceDigest
        : null,
    closure_bound_revision_id: resolved ? finding.resolvedByRevisionId : null,
  };
}

// ---------------------------------------------------------------------------
// Provenance structure validation (freeze §4.1 state 3 + §8.0 + §7.2 invariants)
// ---------------------------------------------------------------------------

function validateProvenanceShape(value: unknown): ProjectionProvenance {
  const p = value as ProjectionProvenance;
  if (p === null || typeof p !== "object") stop("MANIFEST_CORRUPT_STOP", "projection_provenance is not a mapping");
  if (p.schema !== PROJECTION_PROVENANCE_SCHEMA) {
    stop("MANIFEST_CORRUPT_STOP", `provenance schema must be ${PROJECTION_PROVENANCE_SCHEMA}, got ${String(p.schema)}`);
  }
  if (p.mode !== "manual-takeover-A" && p.mode !== "manual-takeover-B") {
    stop("MANIFEST_CORRUPT_STOP", `provenance mode illegal: ${String(p.mode)}`);
  }
  if (typeof p.accepted_at !== "string" || p.accepted_at === "") {
    stop("MANIFEST_CORRUPT_STOP", "provenance accepted_at missing");
  }
  if (!Number.isInteger(p.takeover_cursor) || p.takeover_cursor < 0) {
    stop("MANIFEST_CORRUPT_STOP", "provenance takeover_cursor must be a non-negative integer");
  }
  if (p.mode === "manual-takeover-A" && p.takeover_cursor !== 0) {
    stop("MANIFEST_CORRUPT_STOP", "takeover-A cursor must be 0");
  }
  if (
    p.baseline === null || typeof p.baseline !== "object" ||
    typeof (p.baseline as { manifest_digest_at_takeover?: unknown }).manifest_digest_at_takeover !== "string" ||
    !(p.baseline as { manifest_digest_at_takeover: string }).manifest_digest_at_takeover.startsWith("sha256:")
  ) {
    stop("MANIFEST_CORRUPT_STOP", "provenance baseline anchor missing");
  }
  const map = p.logical_identity_map;
  if (map === null || typeof map !== "object") stop("MANIFEST_CORRUPT_STOP", "logical_identity_map missing");
  for (const partition of ["findings", "revisions", "closures"] as const) {
    if (!Array.isArray(map[partition])) {
      stop("MANIFEST_CORRUPT_STOP", `logical_identity_map.${partition} must be an array (D-19)`);
    }
  }
  const manualIds = new Set<string>();
  const runtimeIds = new Set<string>();
  const manualLocators = new Set<string>();
  const runtimeLocators = new Set<string>();
  for (const row of map.findings) {
    if (row === null || typeof row !== "object") stop("MANIFEST_CORRUPT_STOP", "findings row is not a mapping");
    const hasManual = typeof row.manual_id === "string" && row.manual_id !== "";
    const hasRuntime = typeof row.runtime_id === "string" && row.runtime_id !== "";
    if (!hasManual && !hasRuntime) stop("MANIFEST_CORRUPT_STOP", "findings row has both sides null (D-20)");
    if (row.source !== "manual" && row.source !== "runtime") stop("MANIFEST_CORRUPT_STOP", "findings row source illegal");
    if (row.source === "manual" && !hasManual) stop("MANIFEST_CORRUPT_STOP", "source=manual row must carry manual_id");
    if (row.source === "runtime" && !hasRuntime) stop("MANIFEST_CORRUPT_STOP", "source=runtime row must carry runtime_id");
    if (hasManual) {
      if (manualIds.has(row.manual_id!)) stop("MANIFEST_CORRUPT_STOP", `duplicate manual_id ${row.manual_id}`);
      manualIds.add(row.manual_id!);
    }
    if (hasRuntime) {
      if (runtimeIds.has(row.runtime_id!)) stop("MANIFEST_CORRUPT_STOP", `duplicate runtime_id ${row.runtime_id}`);
      runtimeIds.add(row.runtime_id!);
    }
    const locator = row.first_seen ?? { manual_locator: null, runtime_locator: null };
    if (locator.manual_locator !== null) {
      const key = `${locator.manual_locator.artifact_path}#${locator.manual_locator.finding_index}`;
      if (manualLocators.has(key)) stop("MANIFEST_CORRUPT_STOP", `duplicate manual_locator ${key} (D-22)`);
      manualLocators.add(key);
    }
    if (locator.runtime_locator !== null) {
      const key = `${locator.runtime_locator.source_capability}#${locator.runtime_locator.producer_execution_id}#${locator.runtime_locator.store_sequence}`;
      if (runtimeLocators.has(key)) stop("MANIFEST_CORRUPT_STOP", `duplicate runtime_locator ${key} (D-22)`);
      runtimeLocators.add(key);
    }
  }
  const revisionKeys = new Set<string>();
  for (const row of map.revisions) {
    if (row === null || typeof row !== "object" || row.kind !== "discovery") {
      stop("MANIFEST_CORRUPT_STOP", "revisions row kind must be discovery");
    }
    const hasManual = typeof row.manual_ref === "string" && row.manual_ref !== "";
    const hasRuntime = typeof row.runtime_revision_id === "string" && row.runtime_revision_id !== "";
    if (!hasManual && !hasRuntime) stop("MANIFEST_CORRUPT_STOP", "revisions row has both sides null");
    if (hasManual) {
      const key = `discovery:${row.manual_ref}`;
      if (revisionKeys.has(key)) stop("MANIFEST_CORRUPT_STOP", `duplicate revisions row ${row.manual_ref}`);
      revisionKeys.add(key);
    }
  }
  const closureKeys = new Set<string>();
  for (const row of map.closures) {
    if (row === null || typeof row !== "object") stop("MANIFEST_CORRUPT_STOP", "closures row is not a mapping");
    if (typeof row.resolution_evidence_digest !== "string" || row.resolution_evidence_digest === "") {
      stop("MANIFEST_CORRUPT_STOP", "closures row resolution_evidence_digest missing");
    }
    const hasManual = typeof row.manual_ref === "string" && row.manual_ref !== "";
    const hasRuntime = typeof row.runtime_revision_id === "string" && row.runtime_revision_id !== "";
    if (!hasManual && !hasRuntime) stop("MANIFEST_CORRUPT_STOP", "closures row has both sides null");
    if (hasManual) {
      if (closureKeys.has(row.manual_ref!)) stop("MANIFEST_CORRUPT_STOP", `duplicate closures row ${row.manual_ref}`);
      closureKeys.add(row.manual_ref!);
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// Document loading (freeze §4.1 three mutually exclusive states)
// ---------------------------------------------------------------------------

function coerceEntry(value: unknown): ManifestEntry {
  const e = value as ManifestEntry;
  if (e === null || typeof e !== "object") stop("MANIFEST_CORRUPT_STOP", "entry is not a mapping");
  if (!LOOP_MANIFEST_NODES.includes(e.node)) {
    stop("MANIFEST_CORRUPT_STOP", `entry node illegal: ${String(e.node)}`);
  }
  if (typeof e.status !== "string" || !["pending", "current", "stale"].includes(e.status)) {
    stop("MANIFEST_CORRUPT_STOP", `entry ${e.node} status illegal: ${String(e.status)}`);
  }
  return e;
}

function coerceFindingRow(value: unknown): ManifestFindingRow {
  const f = value as ManifestFindingRow;
  if (f === null || typeof f !== "object") stop("MANIFEST_CORRUPT_STOP", "finding_index row is not a mapping");
  if (typeof f.finding_id !== "string" || f.finding_id === "") {
    stop("MANIFEST_CORRUPT_STOP", "finding_index row missing finding_id");
  }
  if (!["OPEN", "RESOLVED", "ACCEPTED", "SUPERSEDED"].includes(f.status)) {
    stop("MANIFEST_CORRUPT_STOP", `finding ${f.finding_id} status illegal: ${String(f.status)}`);
  }
  return f;
}

function loadManifestFile(manifestPath: string): ManifestState | undefined {
  if (!fs.existsSync(manifestPath)) return undefined;
  const rawText = fs.readFileSync(manifestPath, "utf8");
  let parsed: { readonly [key: string]: YamlValue };
  try {
    parsed = parseRubyYaml(rawText);
  } catch (error) {
    if (error instanceof LoopManifestYamlError) {
      stop("MANIFEST_CORRUPT_STOP", `YAML parse failure: ${error.message}`);
    }
    throw error;
  }
  const state = parsed as unknown as ManifestState;
  if (state === null || typeof state !== "object" || typeof state.manifest_digest !== "string") {
    stop("MANIFEST_CORRUPT_STOP", "manifest_digest missing");
  }
  if (state.schema_version !== LOOP_MANIFEST_SCHEMA_VERSION) {
    stop("MANIFEST_CORRUPT_STOP", `schema_version must be ${LOOP_MANIFEST_SCHEMA_VERSION}, got ${String(state.schema_version)}`);
  }
  if (typeof state.requirement_id !== "string" || state.requirement_id === "") {
    stop("MANIFEST_CORRUPT_STOP", "requirement_id missing");
  }
  if (!Array.isArray(state.entries) || !Array.isArray(state.finding_index)) {
    stop("MANIFEST_CORRUPT_STOP", "entries/finding_index must be arrays");
  }
  if (state.depth === null || typeof state.depth !== "object" || typeof state.depth.required_depth !== "string") {
    stop("MANIFEST_CORRUPT_STOP", "depth block missing");
  }
  verifySelfDigest(state);
  const entries = Object.freeze(state.entries.map(coerceEntry));
  const findingIndex = Object.freeze(state.finding_index.map(coerceFindingRow));
  const provenance =
    parsed.projection_provenance === undefined || parsed.projection_provenance === null
      ? undefined
      : validateProvenanceShape(state.projection_provenance);
  return Object.freeze({
    ...state,
    entries,
    finding_index: findingIndex,
    projection_provenance: provenance,
  });
}

// ---------------------------------------------------------------------------
// Prefix re-derivation (freeze §4.2(a): three slots fully covered). The
// expected entry is derived purely from journal + revision store — starting
// from the manifest's own rows would let a rehashed tamper survive.
// ---------------------------------------------------------------------------

function deriveExpectedEntry(
  node: NodeCapabilityId,
  terminalEvents: readonly LoopCapabilityExecutionEvent[],
  revisions: readonly LoopArtifactRevision[],
  invalidations: readonly LoopFindingInvalidation[],
  findings: readonly LoopFinding[],
  sequenceAt: number,
  requirementId: string,
): ManifestEntry {
  let entry = initEntry(node);
  for (const event of terminalEvents.filter((e) => e.capability === node && e.sequence <= sequenceAt)) {
    entry = foldEventOntoEntry(entry, event, revisionForEvent(event, revisions), requirementId);
  }
  // Validity at C from invalidation TIMING, not the revision's current value
  // (a later invalidation must not leak into the prefix window).
  const rK = effectiveRevisionAt(node, terminalEvents, revisions, sequenceAt);
  if (rK !== undefined && entry.status !== "pending") {
    const stale = isStaleAt(rK, invalidations, findings, terminalEvents, sequenceAt);
    entry = { ...entry, status: stale ? "stale" : "current" };
  }
  return entry;
}

function fieldString(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function comparePrefixEntry(expected: ManifestEntry, actual: ManifestEntry): string | null {
  for (const field of [
    "status", "artifact_path", "version", "digest", "updated_at", "source_event_ref",
  ] as const) {
    if (fieldString(expected[field]) !== fieldString(actual[field])) {
      return `entry ${actual.node} prefix drift at ${field}: expected ${JSON.stringify(expected[field])}, got ${JSON.stringify(actual[field])}`;
    }
  }
  for (const field of ["gate_result", "decision_depth", "decision_status"] as const) {
    const expectedHas = field in expected;
    const actualHas = field in actual;
    if (expectedHas !== actualHas) {
      return `entry ${actual.node} adjudication-slot presence drift at ${field}`;
    }
    if (expectedHas && fieldString(expected[field]) !== fieldString(actual[field])) {
      return `entry ${actual.node} adjudication drift at ${field}: expected ${JSON.stringify(expected[field])}, got ${JSON.stringify(actual[field])}`;
    }
  }
  const expectedExecution = expected.execution;
  const actualExecution = actual.execution;
  if ((expectedExecution === undefined) !== (actualExecution === undefined)) {
    return `entry ${actual.node} execution-slot presence drift`;
  }
  if (expectedExecution !== undefined && actualExecution !== undefined) {
    for (const field of Object.keys(expectedExecution) as (keyof ManifestExecutionFact)[]) {
      if (fieldString(expectedExecution[field]) !== fieldString(actualExecution[field])) {
        return `entry ${actual.node} execution drift at ${field}`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// MANUAL takeover helpers (freeze §8)
// ---------------------------------------------------------------------------

function manualLocatorFor(
  findingRow: ManifestFindingRow,
  index: number,
  state: ManifestState,
): { readonly artifact_path: string; readonly finding_index: number } {
  const owner = state.entries.find((e) => e.node === findingRow.discovered_at);
  return {
    artifact_path: owner?.artifact_path ?? findingRow.discovered_at,
    finding_index: index,
  };
}

/** C §6.2.2(b) manual self-consistency for closure rows (freeze §8.1 A1). */
function manualSelfConsistencyCheck(state: ManifestState): void {
  for (const row of state.finding_index) {
    if (row.status === "OPEN" || row.status === "SUPERSEDED") {
      if (row.closed_by !== null || row.closure_evidence_ref !== null || row.closure_evidence_digest !== null) {
        stop(
          "JOURNAL_MANIFEST_MISMATCH_STOP",
          `manual row ${row.finding_id} carries closure fields in status ${row.status}`,
        );
      }
      continue;
    }
    if (row.closed_by === null || row.closure_evidence_ref === null || row.closure_evidence_digest === null) {
      stop("JOURNAL_MANIFEST_MISMATCH_STOP", `manual ${row.status} row ${row.finding_id} misses closure fields`);
    }
    if (row.status === "RESOLVED" && (row.closure_bound_revision_id === null || row.closure_bound_revision_id === "")) {
      stop("JOURNAL_MANIFEST_MISMATCH_STOP", `manual RESOLVED row ${row.finding_id} misses closure_bound_revision_id`);
    }
  }
}

function takeoverProvenance(
  mode: "manual-takeover-A" | "manual-takeover-B",
  acceptedAt: string,
  cursor: number,
  baselineDigest: string,
  map: ManifestIdentityMap,
): ProjectionProvenance {
  return Object.freeze({
    schema: PROJECTION_PROVENANCE_SCHEMA,
    mode,
    accepted_at: acceptedAt,
    takeover_cursor: cursor,
    baseline: Object.freeze({ manifest_digest_at_takeover: baselineDigest }),
    logical_identity_map: map,
  });
}

// ---------------------------------------------------------------------------
// Runtime facts bundle
// ---------------------------------------------------------------------------

type RuntimeFacts = Readonly<{
  events: readonly LoopCapabilityExecutionEvent[];
  revisions: readonly LoopArtifactRevision[];
  findings: readonly LoopFinding[];
  invalidations: readonly LoopFindingInvalidation[];
  proofByFinding: ReadonlyMap<string, LoopFindingProof>;
}>;

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function projectLoopManifest(request: LoopManifestProjectionRequest): LoopManifestProjectionOutcome {
  try {
    return projectLoopManifestInner(request);
  } catch (error) {
    // Protocol exits are structured outcomes: every stop() inside the
    // machinery (level-1 corruption, shape refusals, …) surfaces to the
    // caller as a STOP, never as an exception (freeze §5 failure exits).
    if (error instanceof LoopManifestProjectionError) {
      return { kind: "STOP", code: error.code, reason: error.message };
    }
    throw error;
  }
}

function projectLoopManifestInner(request: LoopManifestProjectionRequest): LoopManifestProjectionOutcome {
  const { store, runId, requirementId, libraryDir } = request;
  const manifestPath = path.join(libraryDir, "manifest.md");

  // D-9 preflight: pending revision materialization defers projection.
  const recovery = recoverRunContext(store, requirementId);
  if (recovery !== undefined && recovery.pendingRevisionMaterialization !== null) {
    return { kind: "DEFERRED", reason: "recovery.pendingRevisionMaterialization is non-null (D-9)" };
  }

  const state = loadManifestFile(manifestPath);
  if (state === undefined) {
    // C §6.2.7: a manifest-less directory is a read-only archive knowledge
    // source — the projector never recreates (creation belongs to intake).
    return {
      kind: "STOP",
      code: "BLOCKED_AMBIGUOUS",
      reason: `no manifest at ${manifestPath}; existing directories are never rebuilt`,
    };
  }
  const previousDigest = state.manifest_digest;

  const facts: RuntimeFacts = {
    events: store.listCapabilityExecutions(runId),
    revisions: store.listArtifactRevisions(runId),
    findings: store.listFindings(runId),
    invalidations: store.listFindingInvalidations(runId),
    proofByFinding: new Map(store.listFindingProofs(runId).map((p) => [p.findingId, p])),
  };

  // ---- Three-state recognition (freeze §4.1, mutually exclusive) ---------
  const hasProvenance = state.projection_provenance !== undefined;
  const throughIsManual = state.projected_through === "MANUAL";
  if (!hasProvenance && throughIsManual) {
    return takeover(request, state, previousDigest, facts);
  }
  if (!hasProvenance) {
    return {
      kind: "STOP",
      code: "JOURNAL_MANIFEST_MISMATCH_STOP",
      reason: `numeric projected_through ${String(state.projected_through)} without projection_provenance: takeover state tampered (D-15 state 2)`,
    };
  }

  // ---- Normal path (taken over): level 2(a) prefix check ------------------
  const projectedThrough = state.projected_through;
  if (typeof projectedThrough !== "number") {
    return {
      kind: "STOP",
      code: "MANIFEST_CORRUPT_STOP",
      reason: `taken-over manifest must carry a numeric projected_through, got ${String(projectedThrough)}`,
    };
  }
  const terminalEvents = terminalEventsOf(facts.events);
  const journalHead = terminalEvents.reduce((max, e) => Math.max(max, e.sequence), 0);
  if (projectedThrough > journalHead) {
    return {
      kind: "STOP",
      code: "JOURNAL_MANIFEST_MISMATCH_STOP",
      reason: `cursor ${projectedThrough} ahead of journal head ${journalHead}`,
    };
  }
  if (projectedThrough > 0) {
    const entriesByNode = new Map(state.entries.map((e) => [e.node, e]));
    for (const node of LOOP_MANIFEST_NODES) {
      const covered = terminalEvents.some((e) => e.capability === node && e.sequence <= projectedThrough);
      if (!covered) continue; // manual-takeover domain row: §8.3 self-consistency, not journal re-derivation
      const actual = entriesByNode.get(node);
      if (actual === undefined) {
        return { kind: "STOP", code: "MANIFEST_CORRUPT_STOP", reason: `entry ${node} missing` };
      }
      const expected = deriveExpectedEntry(
        node, terminalEvents, facts.revisions, facts.invalidations, facts.findings, projectedThrough, requirementId,
      );
      const drift = comparePrefixEntry(expected, actual);
      if (drift !== null) {
        return { kind: "STOP", code: "JOURNAL_MANIFEST_MISMATCH_STOP", reason: drift };
      }
    }
  }

  // ---- Level 2(b): findingIndex set integrity + per-row cross binding ----
  const domain = classifyFindingDomains(state, facts.findings);
  const level2 = checkFindingIndex(state, facts, domain.manualRowIds);
  if (level2 !== null) return { kind: "STOP", code: "JOURNAL_MANIFEST_MISMATCH_STOP", reason: level2 };

  // ---- Level 3: catch-up publication (tail ∪ new registrations ∪ lag) ----
  return catchUp(request, state, facts, domain.manualRowIds);
}

// ---------------------------------------------------------------------------
// Level 2(b) helpers
// ---------------------------------------------------------------------------

function classifyFindingDomains(
  state: ManifestState,
  findings: readonly LoopFinding[],
): { manualRowIds: ReadonlySet<string> } {
  const provenance = state.projection_provenance;
  const manualRowIds = new Set<string>();
  if (provenance === undefined) return { manualRowIds };
  const runtimeIds = new Set(findings.map((f) => f.findingId));
  for (const row of provenance.logical_identity_map.findings) {
    if (row.source === "manual" && row.runtime_id === null) {
      manualRowIds.add(row.manual_id!);
    } else if (row.runtime_id !== null && !runtimeIds.has(row.runtime_id)) {
      stop(
        "JOURNAL_MANIFEST_MISMATCH_STOP",
        `map row runtime_id ${row.runtime_id} not present in finding store`,
      );
    }
  }
  return { manualRowIds };
}

function checkFindingIndex(
  state: ManifestState,
  facts: RuntimeFacts,
  manualRowIds: ReadonlySet<string>,
): string | null {
  const storeIds = new Set(facts.findings.map((f) => f.findingId));
  const indexRuntimeRows = state.finding_index.filter((row) => !manualRowIds.has(row.finding_id));
  const indexIdSet = new Set(indexRuntimeRows.map((row) => row.finding_id));
  if (indexIdSet.size !== indexRuntimeRows.length) {
    return "duplicate finding_id in finding_index runtime domain";
  }
  for (const row of indexRuntimeRows) {
    if (!storeIds.has(row.finding_id)) {
      return `finding_index row ${row.finding_id} has no store authority (IM − SI)`;
    }
  }
  // Common rows: three ordered mutually exclusive steps (freeze §4.2(b)).
  for (const row of indexRuntimeRows) {
    const finding = facts.findings.find((f) => f.findingId === row.finding_id)!;
    const proof = facts.proofByFinding.get(finding.findingId);
    const expected = expectedFindingRow(finding, proof);
    for (const field of [
      "finding_id", "discovered_at", "root_cause_category", "earliest_affected_node_id", "source_revision", "evidence_ref",
    ] as const) {
      if (fieldString(row[field]) !== fieldString(expected[field])) {
        return `finding ${row.finding_id} identity drift at ${field}`;
      }
    }
    if (row.status === expected.status) {
      for (const field of Object.keys(expected) as (keyof ManifestFindingRow)[]) {
        if (fieldString(row[field]) !== fieldString(expected[field])) {
          return `finding ${row.finding_id} projection drift at ${field}`;
        }
      }
      continue;
    }
    // Step 3: lawful lag only — OPEN → RESOLVED / ACCEPTED_RISK with proof.
    if (row.status !== "OPEN" || finding.status === "OPEN" || finding.status === "SUPERSEDED") {
      return `finding ${row.finding_id} status ${row.status} vs store ${finding.status} without lawful lag`;
    }
    if (finding.status === "RESOLVED") {
      if (proof === undefined || proof.proofKind !== "RESOLUTION") {
        return `finding ${row.finding_id} OPEN→RESOLVED without durable resolution proof`;
      }
      continue;
    }
    // ACCEPTED_RISK: scan-source only (registered by an adversarial_scan
    // terminal event; contract §6.2.2 step 3) with a RISK_ACCEPTANCE proof.
    const registration = registeringEvent(finding, facts.events);
    if (registration === undefined || registration.executionRole !== "adversarial_scan") {
      return `finding ${row.finding_id} OPEN→ACCEPTED from a non-scan registration round`;
    }
    if (proof === undefined || proof.proofKind !== "RISK_ACCEPTANCE") {
      return `finding ${row.finding_id} OPEN→ACCEPTED without durable risk-acceptance proof`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Level 3 catch-up + publication (freeze §4.3, §5)
// ---------------------------------------------------------------------------

function catchUp(
  request: LoopManifestProjectionRequest,
  state: ManifestState,
  facts: RuntimeFacts,
  manualRowIds: ReadonlySet<string>,
): LoopManifestProjectionOutcome {
  const { libraryDir } = request;
  const manifestPath = path.join(libraryDir, "manifest.md");
  const through = state.projected_through as number;
  const requirementId = state.requirement_id;

  const tail = facts.events
    .filter((e) => e.status !== "started" && e.sequence > through)
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  const indexRuntimeIds = new Set(
    state.finding_index.filter((row) => !manualRowIds.has(row.finding_id)).map((row) => row.finding_id),
  );
  const newRegistrations = facts.findings.filter((f) => !indexRuntimeIds.has(f.findingId));
  const laggingRows = state.finding_index.filter(
    (row) =>
      !manualRowIds.has(row.finding_id) && row.status === "OPEN" &&
      facts.findings.some((f) => f.findingId === row.finding_id && f.status !== "OPEN"),
  );

  if (tail.length === 0 && newRegistrations.length === 0 && laggingRows.length === 0) {
    return { kind: "NO_OP" };
  }

  // Entries: tail events fold onto the manifest rows (batch independent,
  // slot-covering); finding lifecycle deltas never touch artifact bindings
  // (V9: both input classes land in ONE atomic publication).
  const entries = new Map(state.entries.map((e) => [e.node, e]));
  let requiredDepth = state.depth.required_depth;
  let lastTailEvent: LoopCapabilityExecutionEvent | undefined;
  for (const event of tail) {
    const entry = entries.get(event.capability);
    if (entry === undefined) {
      return { kind: "STOP", code: "MANIFEST_CORRUPT_STOP", reason: `entry ${event.capability} missing for tail event` };
    }
    entries.set(
      event.capability,
      foldEventOntoEntry(entry, event, revisionForEvent(event, facts.revisions), requirementId),
    );
    requiredDepth = foldDepth(requiredDepth, event);
    lastTailEvent = event;
  }

  // findingIndex: new registrations append (§3.4 mapping), lagging rows align;
  // each new registration also lands a runtime-domain map row (D-16/D-20).
  const findingRows: ManifestFindingRow[] = [...state.finding_index];
  const provenance = state.projection_provenance!;
  const mapFindings: ManifestMapFindingRow[] = [...provenance.logical_identity_map.findings];
  const mapRevisions: ManifestMapRevisionRow[] = [...provenance.logical_identity_map.revisions];
  const mapClosures: ManifestMapClosureRow[] = [...provenance.logical_identity_map.closures];

  for (const finding of newRegistrations) {
    const proof = facts.proofByFinding.get(finding.findingId);
    findingRows.push(expectedFindingRow(finding, proof));
    mapFindings.push({
      manual_id: null,
      runtime_id: finding.findingId,
      source: "runtime",
      first_seen: {
        manual_locator: null,
        runtime_locator: {
          source_capability: finding.sourceCapability,
          producer_execution_id: proof?.revisionId ?? finding.sourceRevisionId,
          store_sequence: finding.sequence,
        },
      },
    });
  }
  for (const row of laggingRows) {
    const finding = facts.findings.find((f) => f.findingId === row.finding_id)!;
    const proof = facts.proofByFinding.get(finding.findingId);
    findingRows[findingRows.findIndex((r) => r.finding_id === row.finding_id)] =
      expectedFindingRow(finding, proof);
    // D-17: a mapped OPEN→RESOLVED transition updates the SAME row and
    // appends its closure correspondence — no set-difference STOP.
    if (finding.status === "RESOLVED") {
      mapClosures.push({
        manual_ref: null,
        runtime_revision_id: finding.resolvedByRevisionId,
        resolution_evidence_digest: finding.resolutionEvidenceDigest ?? "",
      });
    }
  }

  // Provenance cursor is the takeover anchor: frozen at acceptance; the
  // projected prefix advances through projected_through (§8.5 step 5).
  const nextProvenance: ProjectionProvenance = {
    ...provenance,
    logical_identity_map: Object.freeze({
      findings: Object.freeze(mapFindings),
      revisions: Object.freeze(mapRevisions),
      closures: Object.freeze(mapClosures),
    }),
  };

  const sealed = sealManifest({
    ...state,
    publish_seq: lastTailEvent !== undefined ? lastTailEvent.sequence : state.publish_seq,
    projected_through: lastTailEvent !== undefined ? lastTailEvent.sequence : through,
    updated_at: lastTailEvent !== undefined ? lastTailEvent.createdAt : state.updated_at,
    depth: { ...state.depth, required_depth: requiredDepth },
    entries: Object.freeze(LOOP_MANIFEST_NODES.map((node) => entries.get(node) ?? initEntry(node))),
    finding_index: Object.freeze(findingRows),
    projection_provenance: Object.freeze(nextProvenance),
  });

  publishAtomically(manifestPath, dumpRubyYaml(stateToYamlMap(sealed)));
  assertPublishedSelfConsistent(libraryDir, sealed.manifest_digest);
  return { kind: "PUBLISHED", manifestPath, manifestDigest: sealed.manifest_digest, tookOver: false };
}

/** Atomic rename publication (freeze §5): sibling temp file, rename over. */
function publishAtomically(manifestPath: string, content: string): void {
  const tmpPath = `${manifestPath}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, manifestPath);
}

/**
 * Built-in determinism assertion: the published document re-parses and its
 * self-digest re-verifies (crash leaves the old or the new self-consistent
 * file, never a torn one).
 */
function assertPublishedSelfConsistent(libraryDir: string, expectedDigest: string): void {
  const reloaded = loadManifestFile(path.join(libraryDir, "manifest.md"));
  if (reloaded === undefined) {
    stop("MANIFEST_CORRUPT_STOP", "published manifest vanished immediately after atomic rename");
  }
  if (reloaded.manifest_digest !== expectedDigest) {
    stop("MANIFEST_CORRUPT_STOP", "published manifest does not match the sealed digest");
  }
}

// ---------------------------------------------------------------------------
// MANUAL takeover (freeze §8.1 / §8.2)
// ---------------------------------------------------------------------------

function takeover(
  request: LoopManifestProjectionRequest,
  state: ManifestState,
  previousDigest: string,
  facts: RuntimeFacts,
): LoopManifestProjectionOutcome {
  const { libraryDir } = request;
  const manifestPath = path.join(libraryDir, "manifest.md");
  const requirementId = state.requirement_id;

  manualSelfConsistencyCheck(state);

  const terminalEvents = terminalEventsOf(facts.events);
  const mode = terminalEvents.length === 0 ? "manual-takeover-A" : "manual-takeover-B";
  const cursor = terminalEvents.length === 0 ? 0 : terminalEvents[terminalEvents.length - 1]!.sequence;

  let acceptedAt = request.takeoverAcceptedAt;
  if (mode === "manual-takeover-A") {
    if (acceptedAt === undefined) {
      return {
        kind: "STOP",
        code: "MANIFEST_CORRUPT_STOP",
        reason: "takeover-A requires an explicit takeoverAcceptedAt (deterministic provenance)",
      };
    }
  } else if (acceptedAt === undefined) {
    acceptedAt = terminalEvents[terminalEvents.length - 1]!.createdAt;
  }

  // B2: full-event semantic reconciliation before acceptance (freeze §8.2).
  if (mode === "manual-takeover-B") {
    const mismatch = reconcileJournalAgainstManual(state, terminalEvents, facts, requirementId);
    if (mismatch !== null) return { kind: "STOP", code: "JOURNAL_MANIFEST_MISMATCH_STOP", reason: mismatch };
  }

  // Cross-face pairing (freeze §7.2/§7.4): logical-same-discovery candidates
  // match by evidence digest + source capability; ambiguity refuses.
  const pairedByRuntime = new Map<string, ManifestFindingRow>();
  const consumedManual = new Set<string>();
  for (const finding of facts.findings) {
    const candidates = state.finding_index.filter(
      (row) =>
        !consumedManual.has(row.finding_id) &&
        row.discovered_at === finding.sourceCapability &&
        (row.closure_evidence_digest === finding.evidenceDigest || row.evidence_ref === finding.evidenceRef),
    );
    if (candidates.length > 1) {
      return {
        kind: "STOP",
        code: "JOURNAL_MANIFEST_MISMATCH_STOP",
        reason: `finding ${finding.findingId} has ${candidates.length} ambiguous manual counterparts`,
      };
    }
    if (candidates.length === 1) {
      pairedByRuntime.set(finding.findingId, candidates[0]!);
      consumedManual.add(candidates[0]!.finding_id);
    }
  }

  // findingIndex after takeover = manual rows (paired or not, they are the
  // manual authority) + unpaired runtime rows projected through §3.4.
  const runtimeOnlyFindings = facts.findings.filter((f) => !pairedByRuntime.has(f.findingId));
  const findingRows: ManifestFindingRow[] = [
    ...state.finding_index,
    ...runtimeOnlyFindings.map((f) => expectedFindingRow(f, facts.proofByFinding.get(f.findingId))),
  ];

  // Map partitions (D-20): every manual index row lands a findings row
  // (paired rows carry the runtime side); unpaired runtime findings land
  // their own rows; revisions/closures follow the paired manual refs.
  const mapFindings: ManifestMapFindingRow[] = [];
  const mapRevisions: ManifestMapRevisionRow[] = [];
  const mapClosures: ManifestMapClosureRow[] = [];
  const runtimeByManual = new Map<string, LoopFinding>();
  for (const [runtimeId, manualRow] of pairedByRuntime) {
    runtimeByManual.set(manualRow.finding_id, facts.findings.find((f) => f.findingId === runtimeId)!);
  }
  const seenRevisionRefs = new Set<string>();
  state.finding_index.forEach((row, index) => {
    const match = runtimeByManual.get(row.finding_id);
    const proof = match !== undefined ? facts.proofByFinding.get(match.findingId) : undefined;
    mapFindings.push({
      manual_id: row.finding_id,
      runtime_id: match ? match.findingId : null,
      source: "manual",
      first_seen: {
        manual_locator: manualLocatorFor(row, index, state),
        runtime_locator: match
          ? {
              source_capability: match.sourceCapability,
              producer_execution_id: proof?.revisionId ?? match.sourceRevisionId,
              store_sequence: match.sequence,
            }
          : null,
      },
    });
    if (row.source_revision !== null && row.source_revision !== "" && !seenRevisionRefs.has(row.source_revision)) {
      seenRevisionRefs.add(row.source_revision);
      mapRevisions.push({
        kind: "discovery",
        manual_ref: row.source_revision,
        runtime_revision_id: match ? match.sourceRevisionId : null,
      });
    }
    if (row.status === "RESOLVED") {
      mapClosures.push({
        manual_ref: row.closure_bound_revision_id,
        runtime_revision_id: match ? match.resolvedByRevisionId : null,
        resolution_evidence_digest: row.closure_evidence_digest ?? "",
      });
    }
  });
  for (const finding of runtimeOnlyFindings) {
    const proof = facts.proofByFinding.get(finding.findingId);
    mapFindings.push({
      manual_id: null,
      runtime_id: finding.findingId,
      source: "runtime",
      first_seen: {
        manual_locator: null,
        runtime_locator: {
          source_capability: finding.sourceCapability,
          producer_execution_id: proof?.revisionId ?? finding.sourceRevisionId,
          store_sequence: finding.sequence,
        },
      },
    });
    if (finding.sourceRevisionId !== "" && !seenRevisionRefs.has(finding.sourceRevisionId)) {
      seenRevisionRefs.add(finding.sourceRevisionId);
      mapRevisions.push({
        kind: "discovery",
        manual_ref: null,
        runtime_revision_id: finding.sourceRevisionId,
      });
    }
    if (finding.status === "RESOLVED") {
      mapClosures.push({
        manual_ref: null,
        runtime_revision_id: finding.resolvedByRevisionId,
        resolution_evidence_digest: finding.resolutionEvidenceDigest ?? "",
      });
    }
  }

  const provenance = takeoverProvenance(
    mode,
    acceptedAt,
    cursor,
    previousDigest,
    Object.freeze({
      findings: Object.freeze(mapFindings),
      revisions: Object.freeze(mapRevisions),
      closures: Object.freeze(mapClosures),
    }),
  );

  const sealed = sealManifest({
    ...state,
    publish_seq: cursor,
    projected_through: cursor,
    finding_index: Object.freeze(findingRows),
    projection_provenance: provenance,
  });
  publishAtomically(manifestPath, dumpRubyYaml(stateToYamlMap(sealed)));
  assertPublishedSelfConsistent(libraryDir, sealed.manifest_digest);
  return { kind: "PUBLISHED", manifestPath, manifestDigest: sealed.manifest_digest, tookOver: true };
}

/**
 * Freeze §8.2 B2: derive expected entries from the full journal and reconcile
 * against the manual shape under §7.1 normalization (digest literal, status
 * literal, adjudication literal; paths via D-7 semantic keys; versions left
 * to face consistency). Uncovered nodes stay in the manual domain.
 */
function reconcileJournalAgainstManual(
  state: ManifestState,
  terminalEvents: readonly LoopCapabilityExecutionEvent[],
  facts: RuntimeFacts,
  requirementId: string,
): string | null {
  const entriesByNode = new Map(state.entries.map((e) => [e.node, e]));
  const cursor = terminalEvents[terminalEvents.length - 1]!.sequence;
  for (const node of LOOP_MANIFEST_NODES) {
    const actual = entriesByNode.get(node);
    if (actual === undefined) return `entry ${node} missing for reconciliation`;
    const covered = terminalEvents.some((e) => e.capability === node);
    if (!covered) continue; // manual domain row
    const expected = deriveExpectedEntry(
      node, terminalEvents, facts.revisions, facts.invalidations, facts.findings, cursor, requirementId,
    );
    if (expected.status !== actual.status) {
      return `B2 reconciliation drift at ${node}.status: journal ${expected.status} vs manual ${actual.status}`;
    }
    if (expected.digest !== null && actual.digest !== null && expected.digest !== actual.digest) {
      return `B2 reconciliation drift at ${node}.digest: journal ${expected.digest} vs manual ${actual.digest}`;
    }
    if (expected.artifact_path !== null && actual.artifact_path !== null) {
      if (pathSemanticKey(expected.artifact_path, node) !== pathSemanticKey(actual.artifact_path, node)) {
        return `B2 reconciliation drift at ${node}.artifact_path semantic key: ${expected.artifact_path} vs ${actual.artifact_path}`;
      }
    }
    if (node === "solution-gate") {
      for (const field of ["gate_result", "decision_depth", "decision_status"] as const) {
        if (fieldString(expected[field]) !== fieldString(actual[field])) {
          return `B2 reconciliation drift at ${node}.${field}: journal ${String(expected[field])} vs manual ${String(actual[field])}`;
        }
      }
    }
  }
  return null;
}
