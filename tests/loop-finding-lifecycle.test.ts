// LOOP Finding Lifecycle and Dependency Invalidation Tests (C02 WP-3)
// ==================================================================
// Canonical finding schema, six-category routing matrix, earliest-affected
// node ordering, append guards and idempotent replay, same-transaction
// invalidation propagation, the fixed status state machine, the read-only
// finding Gate derivation, adversarial input boundaries, tampering detection
// and v4→v5 migration. All databases live in disposable temp directories
// outside the repository. No Git, no network, no Agent.
//
// Note on revision-chain limits: the C01 capability chain admits exactly one
// succeeded execution per capability per run (re-execution authority arrives
// with C02-WP4), so once a node's current revision is marked STALE it cannot
// be replaced inside WP3. Resolution and Gate-eligibility scenarios therefore
// bind findings appended before the downstream node ran, resolving against
// the later-arriving current ACTIVE revision.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LOOP_ARTIFACT_GATE_CAPABILITIES,
  canonicalizeLoopArtifactRevision,
  createLoopArtifactRevision,
  type LoopArtifactRevision,
  type LoopArtifactRevisionDraft,
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
} from "../core/loop-artifact-revision";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import {
  LOOP_FINDING_CATEGORIES,
  LOOP_FINDING_CATEGORY_CAPABILITIES,
  LOOP_FINDING_GATE_REASON_CODES,
  LOOP_FINDING_SCHEMA_VERSION,
  LOOP_FINDING_SEVERITIES,
  LOOP_FINDING_STATUSES,
  acceptLoopFindingRisk,
  canonicalizeLoopFinding,
  canonicalizeLoopFindingProof,
  computeFindingGate,
  createLoopFinding,
  createLoopFindingRiskAcceptanceProof,
  downstreamNodeIds,
  isLegalLoopFindingTransition,
  loopFindingId,
  resolveLoopFinding,
  supersedeLoopFinding,
  validateLoopFinding,
  validateLoopFindingChain,
  type LoopFinding,
  type LoopFindingDraft,
  type LoopFindingInvalidation,
  type LoopFindingProof,
} from "../core/loop-finding-lifecycle";
import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { LoopRunStore } from "../core/loop-run-store";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function expectThrow(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert(false, `${message} (no error thrown)`);
  } catch (error) {
    const actual = error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR";
    assert(actual === code, `${message} (got ${actual})`);
  }
}

const TS = "2026-08-20T00:00:00.000Z";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}

function dg(letter: string): string {
  return letter.repeat(64);
}

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-finding-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-finding-test-run-001",
    controlRoot: "/tmp/loop-finding-test/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `${o.runId ?? "run-001"}:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
    runId: o.runId ?? "run-001",
    sequence: o.sequence,
    kind: o.kind,
    stage: o.stage ?? null,
    attempt: o.attempt ?? (stageLevel ? 1 : 0),
    createdAt: o.createdAt ?? nextTs(),
    inputDigest: o.inputDigest ?? null,
    outputArtifactRef: o.outputArtifactRef ?? null,
    outputDigest: o.outputDigest ?? null,
    errorCode: o.errorCode ?? null,
    retryable: o.retryable ?? null,
    reasonCode: o.reasonCode ?? null,
    bindingId: o.bindingId ?? null,
    bindingVersion: o.bindingVersion ?? null,
    inputArtifactRef: o.inputArtifactRef ?? null,
  });
}

/** Drives the canonical single-pass capability chain inside one run. */
function makeCapabilityDriver(store: LoopRunStore, runId: string) {
  // Continue the persisted event sequence so multiple drivers can share a run.
  let sequence = store.listCapabilityExecutions(runId).length;
  const attempts = new Map<string, number>();
  function nextAttempt(capability: NodeCapabilityId, executionRole: string): number {
    const key = `${capability}:${executionRole}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    return attempt;
  }
  let predecessor = {
    ref: `loop-artifact:v1:requirement_summary:sha256:${dg("b")}`,
    version: "1.0.0",
    digest: dg("b"),
  };
  function event(
    capability: NodeCapabilityId,
    status: LoopCapabilityExecutionEvent["status"],
    overrides: Partial<LoopCapabilityExecutionEvent>,
  ): LoopCapabilityExecutionEvent {
    sequence += 1;
    const executionRole = capability === "solution-gate"
      ? (overrides.executionRole ?? "formal_verdict")
      : "primary";
    return Object.freeze({
      schemaVersion: 2,
      executionEventId: `${runId}:capability:${sequence}:${status}`,
      runId,
      sequence,
      capability,
      executionRole,
      nodeId: capability,
      attempt: 1,
      status,
      createdAt: nextTs(),
      bindingId: `binding-codex-${capability}-${executionRole}`,
      bindingVersion: "2.0.0",
      bindingRegistryVersion: "1",
      executorAgent: "codex",
      executorAdapter: "codex-real-dispatch",
      executorVersion: "1.0.0",
      inputArtifactRef: predecessor.ref,
      inputArtifactVersion: predecessor.version,
      inputDigest: predecessor.digest,
      outputArtifactRef: null,
      outputArtifactVersion: null,
      outputDigest: null,
      gateResult: null,
      unresolvedFindingsRef: null,
      unresolvedFindingsDigest: null,
      nextStepEligibility: null,
      errorCode: null,
      retryable: null,
      reasonCode: null,
      ...overrides,
    });
  }
  return {
    /** Append only the started event, leaving an active execution claim. */
    start(capability: NodeCapabilityId): LoopCapabilityExecutionEvent {
      const started = event(capability, "started", { attempt: nextAttempt(capability, "primary") });
      store.appendCapabilityExecution(started);
      return started;
    },
    /** Append started + succeeded and return the succeeded event. */
    succeed(
      capability: NodeCapabilityId,
      output: { version: string; digest: string },
      gate?: "PASS" | "FAIL" | "PASS_WITH_RISK",
    ): LoopCapabilityExecutionEvent {
      const isGate = (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(capability);
      const gateResult = isGate ? gate ?? "PASS" : "NOT_APPLICABLE";
      // Chain off the actual journal tail so multiple drivers share one run.
      const lastSucceeded = [...store.listCapabilityExecutions(runId)]
        .reverse()
        .find((item) => item.status === "succeeded");
      if (lastSucceeded?.outputArtifactRef !== null && lastSucceeded !== undefined) {
        predecessor = {
          ref: lastSucceeded.outputArtifactRef!,
          version: lastSucceeded.outputArtifactVersion!,
          digest: lastSucceeded.outputDigest!,
        };
      }
      let scanInput: { ref: string; version: string; digest: string } | null = null;
      if (isGate) {
        // v2: the scan round runs first on a different agent.
        const scanAttempt = nextAttempt(capability, "adversarial_scan");
        const scanRef = `loop-artifact:v1:solution_review:sha256:${dg("a")}`;
        scanInput = { ref: scanRef, version: "1.0.0", digest: dg("a") };
        const scanStarted = event(capability, "started", {
          attempt: scanAttempt,
          executionRole: "adversarial_scan",
          executorAgent: "kimi",
          executorAdapter: "kimi-cli",
          bindingId: `binding-kimi-${capability}-adversarial_scan`,
        });
        store.appendCapabilityExecution(scanStarted);
        store.appendCapabilityExecution(event(capability, "succeeded", {
          attempt: scanAttempt,
          executionRole: "adversarial_scan",
          executorAgent: "kimi",
          executorAdapter: "kimi-cli",
          bindingId: `binding-kimi-${capability}-adversarial_scan`,
          outputArtifactRef: scanRef,
          outputArtifactVersion: "1.0.0",
          outputDigest: dg("a"),
          gateResult: "NOT_APPLICABLE",
          nextStepEligibility: "ELIGIBLE",
        }));
      }
      const executionRole = isGate ? "formal_verdict" : "primary";
      const attempt = nextAttempt(capability, executionRole);
      const started = event(capability, "started", {
        attempt,
        executionRole,
        ...(scanInput ? {
          inputArtifactRef: scanInput.ref,
          inputArtifactVersion: scanInput.version,
          inputDigest: scanInput.digest,
        } : {}),
      });
      store.appendCapabilityExecution(started);
      const outputRef = `loop-artifact:v1:${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind}:sha256:${output.digest}`;
      const succeeded = event(capability, "succeeded", {
        attempt,
        executionRole,
        ...(scanInput ? {
          inputArtifactRef: scanInput.ref,
          inputArtifactVersion: scanInput.version,
          inputDigest: scanInput.digest,
        } : {}),
        outputArtifactRef: outputRef,
        outputArtifactVersion: output.version,
        outputDigest: output.digest,
        gateResult,
        nextStepEligibility: gateResult === "FAIL" ? "INELIGIBLE" : "ELIGIBLE",
      });
      store.appendCapabilityExecution(succeeded);
      predecessor = { ref: outputRef, version: output.version, digest: output.digest };
      return succeeded;
    },
  };
}

type CapabilityDriver = ReturnType<typeof makeCapabilityDriver>;

const NODE_OUT: Readonly<Record<NodeCapabilityId, { version: string; digest: string }>> = {
  "requirement-intake": { version: "1.0.0", digest: dg("c") },
  "solution-design": { version: "1.0.0", digest: dg("d") },
  "solution-gate": { version: "1.0.0", digest: dg("e") },
  "task-planning": { version: "1.0.0", digest: dg("f") },
  "implementation": { version: "1.0.0", digest: dg("0") },
  "code-review": { version: "1.0.0", digest: dg("1") },
  "knowledge-sync": { version: "1.0.0", digest: dg("2") },
};

function revisionDraft(o: {
  nodeId: NodeCapabilityId;
  producerExecutionId: string;
  upstreamRevisionIds?: string[];
}): LoopArtifactRevisionDraft {
  const isGate = (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(o.nodeId);
  const output = NODE_OUT[o.nodeId];
  return {
    producerExecutionRole: isGate ? "formal_verdict" : "primary",
    runId: "run-001",
    requirementId: "req-001",
    nodeId: o.nodeId,
    sequence: 1,
    generation: null,
    stablePath: `library/req-001/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].stablePathSegment}/req-001_${o.nodeId}.md`,
    artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].artifactKind,
    semver: output.version,
    artifactRef: `loop-artifact:v1:${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].artifactKind}:sha256:${output.digest}`,
    digest: output.digest,
    producerExecutionId: o.producerExecutionId,
    gateResult: isGate ? "PASS" : "NOT_APPLICABLE",
    upstreamRevisionIds: o.upstreamRevisionIds ?? [],
    createdAt: nextTs(),
  };
}

/** Drive + append one revision per node, chaining upstreams along the order. */
function driveNodes(
  store: LoopRunStore,
  driver: CapabilityDriver,
  nodes: readonly NodeCapabilityId[],
): Map<NodeCapabilityId, LoopArtifactRevision> {
  const revisions = new Map<NodeCapabilityId, LoopArtifactRevision>();
  let upstream: string[] = [];
  for (const nodeId of nodes) {
    // Idempotent: a node whose v2 current already exists (seeded by
    // withRunningStore) is reused instead of re-driven.
    const existing = store.listArtifactRevisions("run-001").find((item) => item.nodeId === nodeId);
    if (existing !== undefined) {
      revisions.set(nodeId, existing);
      upstream = [existing.revisionId];
      continue;
    }
    const execution = driver.succeed(nodeId, NODE_OUT[nodeId]);
    const revision = store.appendArtifactRevision(createLoopArtifactRevision(
      revisionDraft({ nodeId, producerExecutionId: execution.executionEventId, upstreamRevisionIds: upstream }),
    )).record;
    revisions.set(nodeId, revision);
    upstream = [revision.revisionId];
  }
  return revisions;
}

/** Seeds intake+design executions and returns the design revision id. */
function seedSourceRevision(store: LoopRunStore): string {
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, ["requirement-intake", "solution-design"]);
  return revisions.get("solution-design")!.revisionId;
}

function findingDraft(o: {
  sequence: number;
  sourceCapability: NodeCapabilityId;
  category: LoopFindingDraft["category"];
  earliestAffectedNodeId: NodeCapabilityId;
  severity?: LoopFindingDraft["severity"];
  sourceRevisionId?: string | null;
  requirementId?: string;
  createdAt?: string;
}): LoopFindingDraft {
  return {
    runId: "run-001",
    requirementId: o.requirementId ?? "req-001",
    sequence: o.sequence,
    sourceCapability: o.sourceCapability,
    sourceRevisionId: o.sourceRevisionId ?? "run-001:revision:solution-design:1",
    severity: o.severity ?? "HIGH",
    category: o.category,
    evidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("a")}`,
    evidenceDigest: dg("a"),
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: o.createdAt ?? nextTs(),
  };
}

const RESOLUTION_EVIDENCE = Object.freeze({
  resolutionEvidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("3")}`,
  resolutionEvidenceDigest: dg("3"),
});

const RISK_EVIDENCE = Object.freeze({
  riskAcceptedBy: "user:shaoyang01",
  riskAcceptanceEvidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("4")}`,
  riskAcceptanceEvidenceDigest: dg("4"),
});

/**
 * Fixed-order canonical form without validation: tampering targets states the
 * validator would reject, so the rehash cannot go through canonicalizeLoopFinding.
 */
function canonicalizeFindingUnchecked(record: LoopFinding): string {
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    findingId: record.findingId,
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    sourceCapability: record.sourceCapability,
    sourceRevisionId: record.sourceRevisionId,
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

/**
 * Overwrite a persisted finding row with tampered content and its recomputed
 * canonical hash, bypassing the write API. The row is internally consistent
 * afterwards, so only the read-path cross-checks can still reject it.
 */
function tamperFindingWithRehash(dir: string, originalFindingId: string, tampered: LoopFinding): void {
  const db = new Database(join(dir, "journal.db"));
  try {
    // Tampering bypasses the write API and may rekey the row (finding_id is
    // referenced by the invalidation table), so foreign key enforcement is
    // disabled on this raw connection — the drift it creates is exactly what
    // the read-path cross-checks must then reject.
    db.pragma("foreign_keys = OFF");
    db.prepare(
      `UPDATE loop_findings SET
        finding_id = ?, run_id = ?, requirement_id = ?, sequence = ?,
        source_capability = ?, source_revision_id = ?, severity = ?, category = ?,
        evidence_ref = ?, evidence_digest = ?, earliest_affected_node_id = ?,
        status = ?, resolved_by_revision_id = ?, resolution_evidence_ref = ?,
        resolution_evidence_digest = ?, risk_accepted_by = ?,
        risk_acceptance_evidence_ref = ?, risk_acceptance_evidence_digest = ?,
        superseded_by = ?, created_at = ?, canonical_sha256 = ?
      WHERE finding_id = ?`,
    ).run(
      tampered.findingId, tampered.runId, tampered.requirementId, tampered.sequence,
      tampered.sourceCapability, tampered.sourceRevisionId, tampered.severity,
      tampered.category, tampered.evidenceRef, tampered.evidenceDigest,
      tampered.earliestAffectedNodeId, tampered.status, tampered.resolvedByRevisionId,
      tampered.resolutionEvidenceRef, tampered.resolutionEvidenceDigest,
      tampered.riskAcceptedBy, tampered.riskAcceptanceEvidenceRef,
      tampered.riskAcceptanceEvidenceDigest, tampered.supersededBy, tampered.createdAt,
      createHash("sha256").update(canonicalizeFindingUnchecked(tampered)).digest("hex"),
      originalFindingId,
    );
  } finally {
    db.close();
  }
}

/** Assert a tampered finding state fails closed on every finding read path. */
function expectFindingCorruptOnAllReadPaths(store: LoopRunStore, message: string): void {
  expectThrow("STORE_CORRUPT", () => store.listFindings("run-001"), `${message} (chain read)`);
  expectThrow("STORE_CORRUPT", () => store.listFindingInvalidations("run-001"),
    `${message} (invalidation read)`);
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"), `${message} (snapshot read)`);
  expectThrow("STORE_CORRUPT", () => store.computeFindingGate("run-001"), `${message} (gate read)`);
}

function withStore(fn: (store: LoopRunStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  try {
    fn(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Run with run_started appended so capability executions are accepted. */
function withRunningStore(fn: (store: LoopRunStore, dir: string) => void): void {
  withStore((store, dir) => {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    // v2: every finding names an existing same-run source revision, so the
    // fixture seeds the intake and solution-design currents up front.
    seedSourceRevision(store);
    fn(store, dir);
  });
}

console.log("finding lifecycle: schema constants and canonical tokens");
{
  assert(LOOP_FINDING_SCHEMA_VERSION === 2, "finding schema version is 2");
  assert(LOOP_FINDING_SEVERITIES.join(",") === "CRITICAL,HIGH,MEDIUM,LOW", "four canonical severities");
  assert(LOOP_FINDING_CATEGORIES.join(",") === "REQUIREMENT,SOLUTION,PLANNING,IMPLEMENTATION,REVIEW,KNOWLEDGE",
    "six canonical categories");
  assert(LOOP_FINDING_STATUSES.join(",") === "OPEN,RESOLVED,ACCEPTED_RISK,SUPERSEDED",
    "four canonical statuses");
  assert(
    LOOP_FINDING_GATE_REASON_CODES.join(",") === "FINDING_OPEN,FINDING_DOWNSTREAM_STALE,FINDING_DOWNSTREAM_MISSING",
    "three canonical gate reason codes",
  );
  const routed = Object.values(LOOP_FINDING_CATEGORY_CAPABILITIES).flat();
  assert(NODE_CAPABILITY_IDS.every((id) => routed.includes(id)),
    "routing matrix covers every canonical capability at least once");
  assert(loopFindingId("run-001", 3) === "run-001:finding:3", "canonical finding id derived");
  assert(downstreamNodeIds("requirement-intake").length === 7, "intake downstream set spans all nodes");
  assert(downstreamNodeIds("implementation").join(",") === "implementation,code-review,knowledge-sync",
    "implementation downstream set is the v2 tail");
  assert(downstreamNodeIds("knowledge-sync").join(",") === "knowledge-sync",
    "knowledge-sync downstream set is itself only");
  expectThrow("INVALID_INPUT", () => downstreamNodeIds("deploy" as NodeCapabilityId),
    "unknown earliest node rejected");
  assert(isLegalLoopFindingTransition("OPEN", "RESOLVED"), "OPEN -> RESOLVED is legal");
  assert(isLegalLoopFindingTransition("OPEN", "ACCEPTED_RISK"), "OPEN -> ACCEPTED_RISK is legal");
  assert(isLegalLoopFindingTransition("OPEN", "SUPERSEDED"), "OPEN -> SUPERSEDED is legal");
  assert(isLegalLoopFindingTransition("RESOLVED", "SUPERSEDED"), "RESOLVED -> SUPERSEDED is legal");
  assert(isLegalLoopFindingTransition("ACCEPTED_RISK", "SUPERSEDED"), "ACCEPTED_RISK -> SUPERSEDED is legal");
  assert(!isLegalLoopFindingTransition("RESOLVED", "OPEN"), "RESOLVED -> OPEN is illegal");
  assert(!isLegalLoopFindingTransition("RESOLVED", "ACCEPTED_RISK"), "RESOLVED -> ACCEPTED_RISK is illegal");
  assert(!isLegalLoopFindingTransition("ACCEPTED_RISK", "RESOLVED"), "ACCEPTED_RISK -> RESOLVED is illegal");
  assert(!isLegalLoopFindingTransition("SUPERSEDED", "OPEN"), "SUPERSEDED is fully absorbing");
  assert(!isLegalLoopFindingTransition("OPEN", "OPEN"), "self-transitions are illegal");
}

console.log("finding lifecycle: positive construction");
{
  const finding = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  }));
  assert(finding.findingId === "run-001:finding:1", "finding id derived from run and sequence");
  assert(finding.status === "OPEN", "findings are born open");
  assert(finding.resolvedByRevisionId === null && finding.riskAcceptedBy === null &&
    finding.supersededBy === null, "born-open findings carry no closure fields");
  assert(Object.isFrozen(finding), "finding is frozen");
  validateLoopFinding(finding);
  assert(true, "well-formed finding passes validation");
  assert(canonicalizeLoopFinding(finding) === canonicalizeLoopFinding({ ...finding }),
    "canonical form is stable");
}

console.log("finding lifecycle: six-category routing matrix");
{
  const allowed: ReadonlyArray<readonly [LoopFindingDraft["category"], NodeCapabilityId]> = [
    ["REQUIREMENT", "requirement-intake"],
    ["REQUIREMENT", "solution-design"],
    ["REQUIREMENT", "code-review"],
    ["SOLUTION", "solution-design"],
    ["SOLUTION", "solution-gate"],
    ["SOLUTION", "implementation"],
    ["PLANNING", "task-planning"],
    ["PLANNING", "implementation"],
    ["IMPLEMENTATION", "implementation"],
    ["IMPLEMENTATION", "code-review"],
    ["REVIEW", "code-review"],
    ["KNOWLEDGE", "knowledge-sync"],
  ];
  const canonicalEarliest: Readonly<Record<LoopFindingDraft["category"], NodeCapabilityId>> = {
    REQUIREMENT: "requirement-intake",
    SOLUTION: "solution-design",
    PLANNING: "task-planning",
    IMPLEMENTATION: "implementation",
    REVIEW: "code-review",
    KNOWLEDGE: "knowledge-sync",
  };
  for (const [category, capability] of allowed) {
    const finding = createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: capability, category,
      earliestAffectedNodeId: canonicalEarliest[category],
    }));
    assert(finding.category === category, `${category} finding from ${capability} accepted`);
    assert(finding.earliestAffectedNodeId === canonicalEarliest[category],
      `${category} finding carries its canonical earliest node`);
  }
  const mismatches: ReadonlyArray<readonly [LoopFindingDraft["category"], NodeCapabilityId]> = [
    ["SOLUTION", "requirement-intake"],
    ["PLANNING", "solution-gate"],
    ["IMPLEMENTATION", "solution-design"],
    ["IMPLEMENTATION", "task-planning"],
    ["REVIEW", "solution-gate"],
    ["KNOWLEDGE", "code-review"],
  ];
  for (const [category, capability] of mismatches) {
    expectThrow("INVALID_INPUT", () => createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: capability, category, earliestAffectedNodeId: "requirement-intake",
    })), `${category} finding from ${capability} rejected`);
  }
}

console.log("finding lifecycle: earliest affected node is the category's canonical node");
{
  const ok = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-gate", category: "SOLUTION",
    earliestAffectedNodeId: "solution-design",
  }));
  assert(ok.earliestAffectedNodeId === "solution-design",
    "canonical earliest node at or before the source capability accepted");
  const discoveredLater = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "SOLUTION",
    earliestAffectedNodeId: "solution-design",
  }));
  assert(discoveredLater.earliestAffectedNodeId === "solution-design",
    "SOLUTION finding discovered at code-review still invalidates from solution-design");
  expectThrow("INVALID_INPUT", () => createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-gate", category: "SOLUTION",
    earliestAffectedNodeId: "solution-gate",
  })), "caller cannot shrink the invalidation origin to a downstream node (H1)");
  expectThrow("INVALID_INPUT", () => createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-gate", category: "SOLUTION",
    earliestAffectedNodeId: "requirement-intake",
  })), "earliest node must equal the canonical node of the category");
  expectThrow("INVALID_INPUT", () => createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-design", category: "SOLUTION",
    earliestAffectedNodeId: "implementation",
  })), "earliest node downstream of the source capability rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "deploy" as NodeCapabilityId,
  })), "unknown earliest node rejected");
}

console.log("finding lifecycle: malformed and incoherent drafts fail closed (negative)");
{
  const base = findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  });
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, severity: "BLOCKER" }),
    "unknown severity rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, category: "SECURITY" }),
    "unknown category rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, evidenceDigest: dg("b") }),
    "evidence ref/digest mismatch rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({
    ...base, evidenceRef: `loop-artifact:v2:capability_findings:sha256:${dg("a")}`,
  }), "non-canonical evidence ref rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({
    ...base, evidenceRef: `loop-artifact:v1:bogus_kind:sha256:${dg("a")}`,
  }), "evidence ref with unknown kind rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, evidenceDigest: "AB".repeat(32) }),
    "non-lowercase evidence digest rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, sequence: 0 }),
    "non-positive sequence rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, requirementId: " req-001" }),
    "untrimmed requirement identity rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, createdAt: "yesterday" }),
    "non-ISO timestamp rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, sourceRevisionId: "run-002:revision:solution-design:1" }),
    "cross-run source revision rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, sourceRevisionId: "not-a-revision" }),
    "malformed source revision rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...base, sourceCapability: "deploy" }),
    "unknown source capability rejected");
  const created = createLoopFinding(base);
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, findingId: "run-001:finding:9" }),
    "forged finding id rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, schemaVersion: 1 }),
    "unknown schema version rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, status: "TRIAGED" }),
    "unknown status rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, supersededBy: "run-001:finding:2" }),
    "open finding with a supersede pointer rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, status: "RESOLVED" }),
    "resolved finding without resolution fields rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...created, status: "ACCEPTED_RISK" }),
    "risk-accepted finding without acceptance fields rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({
    ...created, status: "ACCEPTED_RISK", severity: "CRITICAL", riskAcceptedBy: "user:x",
    riskAcceptanceEvidenceRef: RISK_EVIDENCE.riskAcceptanceEvidenceRef,
    riskAcceptanceEvidenceDigest: RISK_EVIDENCE.riskAcceptanceEvidenceDigest,
  }), "critical finding persisted as risk-accepted fails closed");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({
    ...created, status: "SUPERSEDED", supersededBy: "run-002:finding:2",
  }), "cross-run supersede pointer rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({
    ...created, status: "SUPERSEDED", supersededBy: "run-001:finding:1",
  }), "backwards supersede pointer rejected");
  const resolved = resolveLoopFinding(created, {
    resolvedByRevisionId: "run-001:revision:implementation:1",
    ...RESOLUTION_EVIDENCE,
  });
  assert(resolved.status === "RESOLVED" && resolved.resolvedByRevisionId === "run-001:revision:implementation:1",
    "resolution transition carries the current revision");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({
    ...resolved, resolvedByRevisionId: "run-001:revision:solution-design:1",
  }), "resolution revision upstream of the earliest affected node rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFinding({ ...resolved, resolutionEvidenceDigest: dg("9") }),
    "resolution evidence ref/digest mismatch rejected");
  const critical = createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "CRITICAL",
  }));
  expectThrow("INVALID_INPUT", () => acceptLoopFindingRisk(critical, RISK_EVIDENCE),
    "critical findings are not risk-acceptable");
  expectThrow("INVALID_INPUT", () => resolveLoopFinding(resolved, {
    resolvedByRevisionId: "run-001:revision:implementation:1", ...RESOLUTION_EVIDENCE,
  }), "resolving a non-open finding rejected");
  const accepted = acceptLoopFindingRisk(created, RISK_EVIDENCE);
  assert(accepted.status === "ACCEPTED_RISK" && accepted.riskAcceptedBy === "user:shaoyang01",
    "risk acceptance transition carries the acceptor");
  expectThrow("INVALID_INPUT", () => acceptLoopFindingRisk(accepted, RISK_EVIDENCE),
    "risk-accepting a non-open finding rejected");
  const replacement = createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  }));
  const superseded = supersedeLoopFinding(accepted, replacement.findingId);
  assert(superseded.status === "SUPERSEDED" && superseded.supersededBy === replacement.findingId &&
    superseded.riskAcceptedBy === null, "supersede clears prior closure fields and backfills the pointer");
  expectThrow("INVALID_INPUT", () => supersedeLoopFinding(superseded, replacement.findingId),
    "superseding a superseded finding rejected");
  expectThrow("INVALID_INPUT", () => resolveLoopFinding(new Proxy(created, {}), {
    resolvedByRevisionId: "run-001:revision:implementation:1", ...RESOLUTION_EVIDENCE,
  }), "Proxy finding rejected");
  expectThrow("INVALID_INPUT", () => resolveLoopFinding(created, {
    resolvedByRevisionId: "run-001:revision:implementation:1",
  } as never), "resolution without evidence rejected");
  expectThrow("INVALID_INPUT", () => acceptLoopFindingRisk(created, {
    riskAcceptedBy: "user:x",
  } as never), "risk acceptance without evidence rejected");
}

console.log("finding lifecycle: adversarial input boundaries fail closed");
{
  const draft = findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  });
  expectThrow("INVALID_INPUT", () => createLoopFinding(new Proxy({ ...draft }, {})),
    "Proxy draft rejected");
  const accessorDraft = { ...draft };
  Object.defineProperty(accessorDraft, "sequence", { get: () => 1, enumerable: true });
  expectThrow("INVALID_INPUT", () => createLoopFinding(accessorDraft),
    "accessor property rejected before invocation");
  const symbolDraft = { ...draft } as Record<string | symbol, unknown>;
  symbolDraft[Symbol("stealth")] = "x";
  expectThrow("INVALID_INPUT", () => createLoopFinding(symbolDraft),
    "symbol-keyed field rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...draft, extra: "x" }),
    "unknown extra field rejected");
  const missing = { ...draft } as Record<string, unknown>;
  delete missing["evidenceRef"];
  expectThrow("INVALID_INPUT", () => createLoopFinding(missing),
    "missing required field rejected");
  expectThrow("INVALID_INPUT", () => createLoopFinding({ ...draft, status: "OPEN" }),
    "draft must not pre-set schema-managed fields");
  const sentinel = "SENTINEL-INPUT-3d9e02";
  try {
    createLoopFinding({ ...draft, category: `${sentinel}\x00` });
    assert(false, "sentinel input not echoed (no error thrown)");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    assert(!message.includes(sentinel), "error message does not echo input sentinel");
  }
}

console.log("finding lifecycle: chain rules are fail-closed");
{
  const f1 = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-gate", category: "SOLUTION",
    earliestAffectedNodeId: "solution-design",
  }));
  const f2 = createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  validateLoopFindingChain([f1, f2], [], "run-001");
  assert(true, "contiguous finding chain passes validation");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f2], [], "run-001"),
    "finding chain must start at sequence one");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1, f1], [], "run-001"),
    "duplicate finding sequence rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([
    f1, Object.freeze({ ...f2, requirementId: "req-002" }) as LoopFinding,
  ], [], "run-001"), "mixed Requirement identities rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([
    Object.freeze({ ...f1, runId: "run-002", findingId: "run-002:finding:1" }) as LoopFinding,
  ], [], "run-001"), "run identity mismatch rejected");
  const supersededF1 = supersedeLoopFinding(f1, f2.findingId);
  validateLoopFindingChain([supersededF1, f2], [], "run-001");
  assert(true, "superseded finding with an existing replacement passes validation");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([supersededF1], [], "run-001"),
    "supersede pointer must resolve to an existing finding");
  const inv = (index: number, nodeId: NodeCapabilityId): LoopFindingInvalidation => Object.freeze({
    findingId: f1.findingId,
    invalidationIndex: index,
    revisionId: `run-001:revision:${nodeId}:1`,
    nodeId,
  });
  validateLoopFindingChain([f1], [inv(0, "solution-design"), inv(1, "implementation")], "run-001");
  assert(true, "ordered downstream invalidation edges pass validation");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1], [inv(1, "solution-design")], "run-001"),
    "invalidation indexes must be contiguous from zero");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1],
    [inv(0, "solution-design"), inv(1, "solution-design")], "run-001"),
    "duplicate invalidation nodes rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1], [inv(0, "requirement-intake")], "run-001"),
    "invalidation upstream of the earliest affected node rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1], [
    Object.freeze({ ...inv(0, "solution-design"), revisionId: "run-001:revision:implementation:1" }),
  ], "run-001"), "invalidation revision must belong to the named node");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1], [
    Object.freeze({ ...inv(0, "solution-design"), revisionId: "run-002:revision:solution-design:1" }),
  ], "run-001"), "cross-run invalidation revision rejected");
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([f1], [
    Object.freeze({ ...inv(0, "solution-design"), findingId: "run-001:finding:9" }),
  ], "run-001"), "invalidation for an unknown finding rejected");
  const older = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", createdAt: nextTs(),
  }));
  const newer = createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", createdAt: TS,
  }));
  expectThrow("INVALID_INPUT", () => validateLoopFindingChain([older, newer], [], "run-001"),
    "timestamp regression in the finding chain rejected");
}

console.log("finding lifecycle: pure gate derivation");
{
  const openFinding = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  const allActive = new Map<string, string>(NODE_CAPABILITY_IDS.map((id) => [id, "ACTIVE"]));
  assert(computeFindingGate([], new Map()).status === "ELIGIBLE", "no findings is eligible");
  const openGate = computeFindingGate([openFinding], allActive);
  assert(openGate.status === "BLOCKED" && openGate.blockingFindings.join(",") === openFinding.findingId &&
    openGate.reasonCodes.join(",") === "FINDING_OPEN", "an open finding blocks regardless of severity");
  const resolved = resolveLoopFinding(openFinding, {
    resolvedByRevisionId: "run-001:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  });
  assert(computeFindingGate([resolved], allActive).status === "ELIGIBLE",
    "resolved finding with all downstream currents active is eligible");
  const staleGate = computeFindingGate([resolved],
    new Map([...allActive].map(([k, v]) => [k, k === "knowledge-sync" ? "STALE" : v])));
  assert(staleGate.status === "BLOCKED" && staleGate.reasonCodes.join(",") === "FINDING_DOWNSTREAM_STALE",
    "resolved finding with a stale downstream current blocks");
  const missingGate = computeFindingGate([resolved],
    new Map([...allActive].filter(([k]) => k !== "knowledge-sync")));
  assert(missingGate.status === "BLOCKED" && missingGate.reasonCodes.join(",") === "FINDING_DOWNSTREAM_MISSING",
    "resolved finding with a missing downstream current blocks");
  const accepted = acceptLoopFindingRisk(openFinding, RISK_EVIDENCE);
  assert(computeFindingGate([accepted], allActive).status === "ELIGIBLE",
    "risk-accepted finding with evidence and active downstream is eligible");
  const replacement = createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  const superseded = supersedeLoopFinding(openFinding, replacement.findingId);
  const acceptedReplacement = acceptLoopFindingRisk(replacement, RISK_EVIDENCE);
  assert(computeFindingGate([superseded, acceptedReplacement], allActive).status === "ELIGIBLE",
    "superseded findings are absorbed by their replacement");
  const resolvedSecond = resolveLoopFinding(replacement, {
    resolvedByRevisionId: "run-001:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  });
  const mixed = computeFindingGate([openFinding, resolvedSecond], new Map());
  assert(mixed.status === "BLOCKED" &&
    mixed.blockingFindings.join(",") === [openFinding.findingId, resolvedSecond.findingId].join(",") &&
    mixed.reasonCodes.join(",") === "FINDING_OPEN,FINDING_DOWNSTREAM_MISSING",
    "mixed blocking sets report every finding and reason deterministically");
  const staleUpstreamOnly = computeFindingGate([resolved],
    new Map([...allActive].map(([k, v]) => [k, k === "implementation" ? "STALE" : v])));
  assert(staleUpstreamOnly.status === "ELIGIBLE",
    "stale currents upstream of the earliest affected node do not block");
}

console.log("finding lifecycle: store append binds run and requirement");
withRunningStore((store) => {
  const sourceRevisionId = seedSourceRevision(store);
  const finding = createLoopFinding(findingDraft({
    sourceRevisionId,
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  const appended = store.appendFinding(finding);
  assert(appended.appended === true, "first finding appended");
  const listed = store.listFindings("run-001");
  assert(listed.length === 1 && canonicalizeLoopFinding(listed[0]!) === canonicalizeLoopFinding(finding),
    "finding chain lists the appended finding byte-identically");
  assert(store.listFindingInvalidations("run-001").length === 0,
    "finding without currents records no invalidation edges");
  expectThrow("INVALID_INPUT", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", requirementId: "req-002",
  }))), "finding requirement mismatch rejected");
});
withStore((store) => {
  expectThrow("RUN_NOT_FOUND", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))), "finding for a missing run rejected");
  assert(store.listFindings("run-404").length === 0, "unknown run lists no findings");
  assert(store.listFindingInvalidations("run-404").length === 0, "unknown run lists no invalidations");
  const gate = store.computeFindingGate("run-404");
  assert(gate.status === "ELIGIBLE" && gate.blockingFindings.length === 0,
    "unknown run derives an empty eligible gate");
  expectThrow("RUN_NOT_FOUND", () => store.resolveFinding("run-404", "run-404:finding:1", {
    resolvedByRevisionId: "run-404:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  }), "resolution for a missing run rejected");
});

console.log("finding lifecycle: exact replay is idempotent, conflicts fail closed");
withRunningStore((store) => {
  const sourceRevisionId = seedSourceRevision(store);
  const finding = createLoopFinding(findingDraft({
    sourceRevisionId,
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  const first = store.appendFinding(finding);
  const replay = store.appendFinding(finding);
  assert(first.appended === true && replay.appended === false, "exact replay does not duplicate the finding");
  assert(store.listFindings("run-001").length === 1, "replay leaves a single persisted finding");
  const sameIdDifferent = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
    sourceRevisionId: store.listArtifactRevisions("run-001").find((r) => r.nodeId === "solution-design")!.revisionId, severity: "LOW",
  }));
  expectThrow("EVENT_ID_CONFLICT", () => store.appendFinding(sameIdDifferent),
    "same finding id with different content rejected");
  // The finding id is derived from (runId, sequence), so an occupied sequence
  // always surfaces as an id conflict first; the sequence guard stays as
  // defense in depth, and chain contiguity is what rejects sequence gaps.
  expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 3, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
    sourceRevisionId: store.listArtifactRevisions("run-001").find((r) => r.nodeId === "solution-design")!.revisionId,
  }))), "finding sequence gap rejected");
  const notBornOpen = acceptLoopFindingRisk(finding, RISK_EVIDENCE);
  expectThrow("INVALID_INPUT", () => store.appendFinding(notBornOpen),
    "findings carrying a closure status are rejected at the write boundary");
});

console.log("finding lifecycle: concurrent writers use CAS/conflict semantics");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  const storeB = new LoopRunStore(path);
  storeA.init();
  storeB.init();
  try {
    storeA.createRun(makeIdentity());
    storeA.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(storeA, "run-001");
    const seeded = driveNodes(storeA, driver, ["requirement-intake", "solution-design"]);
    const sourceRevisionId = seeded.get("solution-design")!.revisionId;
    const winner = createLoopFinding(findingDraft({
      sourceRevisionId,
      sequence: 1, sourceCapability: "code-review", category: "REVIEW",
      earliestAffectedNodeId: "code-review",
    }));
    assert(storeA.appendFinding(winner).appended === true, "first writer wins the finding slot");
    assert(storeB.appendFinding(winner).appended === false,
      "concurrent identical candidate replays idempotently");
    const loser = createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "code-review", category: "REVIEW",
      earliestAffectedNodeId: "code-review", severity: "MEDIUM",
    }));
    expectThrow("EVENT_ID_CONFLICT", () => storeB.appendFinding(loser),
      "concurrent different content on the same finding id conflicts");
    assert(storeB.listFindings("run-001").length === 1, "conflict leaves exactly one finding");
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("finding lifecycle: run state guards");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))), "finding rejected while a delivery stage is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const driver = makeCapabilityDriver(store, "run-001");
  driver.start("requirement-intake");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))), "finding rejected while a capability execution is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_failed", errorCode: "X" }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))), "terminal run must not accept findings");
});

console.log("finding lifecycle: source revision binding");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, ["requirement-intake", "solution-design"]);
  const design = revisions.get("solution-design")!;
  const bound = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-design", category: "SOLUTION",
    earliestAffectedNodeId: "solution-design", sourceRevisionId: design.revisionId,
  })));
  assert(bound.appended === true && bound.record.sourceRevisionId === design.revisionId,
    "finding bound to an existing revision appended");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", sourceRevisionId: "run-001:revision:code-review:9",
  }))), "finding bound to a nonexistent revision rejected");
});

console.log("finding lifecycle: invalidation propagation along the canonical node order");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  const finding = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "requirement-intake", category: "REQUIREMENT",
    earliestAffectedNodeId: "requirement-intake",
  }));
  store.appendFinding(finding);
  const revisions = store.listArtifactRevisions("run-001");
  assert(revisions.length === 7 && revisions.every((item) => item.validity === "STALE"),
    "finding at requirement-intake marks every downstream current stale");
  const invalidations = store.listFindingInvalidations("run-001");
  assert(invalidations.length === 7, "seven invalidation edges persisted");
  assert(
    invalidations.every((item, index) =>
      item.invalidationIndex === index &&
      item.findingId === finding.findingId &&
      item.nodeId === NODE_CAPABILITY_IDS[index] &&
      item.revisionId === `run-001:revision:${NODE_CAPABILITY_IDS[index]}:1`),
    "invalidation edges follow the canonical node order",
  );
});
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "implementation", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  })));
  const revisions = store.listArtifactRevisions("run-001");
  const validityOf = (nodeId: NodeCapabilityId) =>
    revisions.find((item) => item.nodeId === nodeId)!.validity;
  assert(
    validityOf("requirement-intake") === "ACTIVE" &&
    validityOf("solution-design") === "ACTIVE" &&
    validityOf("solution-gate") === "ACTIVE" &&
    validityOf("task-planning") === "ACTIVE",
    "nodes upstream of the earliest affected node stay active",
  );
  assert(
    validityOf("implementation") === "STALE" &&
    validityOf("code-review") === "STALE" &&
    validityOf("knowledge-sync") === "STALE",
    "finding at implementation marks only the implementation tail stale",
  );
  const invalidations = store.listFindingInvalidations("run-001");
  assert(invalidations.length === 3 &&
    invalidations.map((item) => item.nodeId).join(",") === "implementation,code-review,knowledge-sync",
    "exactly the implementation tail edges persisted");
});
withRunningStore((store) => {
  // Empty affected set is legal: the finding still persists without edges.
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, ["requirement-intake", "solution-design"]);
  const appended = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  })));
  assert(appended.appended === true, "finding with an empty affected set persisted");
  assert(store.listFindingInvalidations("run-001").length === 0, "no invalidation edges recorded");
  assert(store.listArtifactRevisions("run-001").every((item) => item.validity === "ACTIVE"),
    "unaffected currents stay active");
});
withRunningStore((store) => {
  // An already-STALE current stays STALE and is NOT recorded as a new edge.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS);
  store.markArtifactRevisionStale("run-001", revisions.get("solution-design")!.revisionId);
  store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "solution-gate", category: "SOLUTION",
    earliestAffectedNodeId: "solution-design",
  })));
  const invalidations = store.listFindingInvalidations("run-001");
  assert(invalidations.length === 5 &&
    !invalidations.some((item) => item.nodeId === "solution-design"),
    "already-stale revision is not double-recorded as an invalidation edge");
  assert(
    store.listArtifactRevisions("run-001").find((item) => item.nodeId === "solution-design")!.validity === "STALE",
    "already-stale revision stays stale",
  );
});
withRunningStore((store, dir) => {
  // Atomicity: a failure mid-propagation rolls back the finding, the edges
  // and the STALE marks together. A trigger forces the edge insert to abort.
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  const raw = new Database(join(dir, "journal.db"));
  raw.exec(
    "CREATE TRIGGER abort_finding_invalidation BEFORE INSERT ON loop_finding_invalidations " +
    "BEGIN SELECT RAISE(ABORT, 'forced'); END",
  );
  raw.close();
  expectThrow("STORE_FAILURE", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "requirement-intake", category: "REQUIREMENT",
    earliestAffectedNodeId: "requirement-intake",
  }))), "forced mid-propagation failure rejects the append");
  assert(store.listFindings("run-001").length === 0, "finding insert rolled back");
  assert(store.listFindingInvalidations("run-001").length === 0, "no invalidation edges persisted");
  assert(store.listArtifactRevisions("run-001").every((item) => item.validity === "ACTIVE"),
    "stale marks rolled back with the finding");
});

console.log("finding lifecycle: status transitions");
withRunningStore((store) => {
  // Resolve against a later-arriving downstream current: the finding is
  // appended before knowledge-sync ran (empty affected set), then the node
  // produces its current ACTIVE revision, which resolves the finding.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "CRITICAL",
  }))).record;
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  const resolved = store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  assert(resolved.record.status === "RESOLVED" &&
    resolved.record.resolvedByRevisionId === validationRevision.revisionId,
    "open finding resolved against the current active downstream revision");
  const listed = store.listFindings("run-001");
  assert(listed.length === 1 && listed[0]!.status === "RESOLVED" &&
    listed[0]!.resolutionEvidenceDigest === RESOLUTION_EVIDENCE.resolutionEvidenceDigest,
    "resolution persisted with its evidence");
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  }), "resolving a non-open finding rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
    "risk-accepting a resolved finding rejected");
});
withRunningStore((store) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", severity: "CRITICAL",
  }))).record;
  expectThrow("ILLEGAL_TRANSITION", () => store.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
    "critical findings are not risk-acceptable");
  expectThrow("INVALID_INPUT", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: "run-001:revision:code-review:1",
  }), "resolution without evidence fails closed");
  expectThrow("INVALID_INPUT", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: "run-001:revision:code-review:1",
    resolutionEvidenceRef: RESOLUTION_EVIDENCE.resolutionEvidenceRef,
    resolutionEvidenceDigest: dg("9"),
  }), "resolution with a mismatched evidence digest fails closed");
  expectThrow("INVALID_INPUT", () => store.acceptFindingRisk("run-001", finding.findingId, {
    riskAcceptedBy: "user:shaoyang01",
  }), "risk acceptance without evidence fails closed");
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: "run-001:revision:code-review:9", ...RESOLUTION_EVIDENCE,
  }), "resolution against a nonexistent revision rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", "run-001:finding:9", {
    resolvedByRevisionId: "run-001:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  }), "resolving a nonexistent finding rejected");
});
withRunningStore((store) => {
  // Resolution revision must be the CURRENT ACTIVE revision of a node at or
  // downstream of the earliest affected node.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS);
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "implementation", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  }))).record;
  // The append marked implementation/code-review/test-validation stale.
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: revisions.get("implementation")!.revisionId, ...RESOLUTION_EVIDENCE,
  }), "resolution against a stale current rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: revisions.get("solution-design")!.revisionId, ...RESOLUTION_EVIDENCE,
  }), "resolution against a revision upstream of the earliest affected node rejected");
});
withRunningStore((store) => {
  const first = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const second = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", severity: "MEDIUM",
  }))).record;
  const superseded = store.supersedeFinding("run-001", first.findingId, second.findingId);
  assert(superseded.record.status === "SUPERSEDED" && superseded.record.supersededBy === second.findingId,
    "finding superseded with the replacement pointer backfilled");
  const listed = store.listFindings("run-001");
  assert(listed[0]!.status === "SUPERSEDED" && listed[1]!.status === "OPEN",
    "supersede persisted while the replacement stays open");
  expectThrow("ILLEGAL_TRANSITION", () => store.supersedeFinding("run-001", first.findingId, second.findingId),
    "superseding a superseded finding rejected (absorbing)");
  expectThrow("ILLEGAL_TRANSITION", () => store.supersedeFinding("run-001", second.findingId, first.findingId),
    "superseding with an earlier finding rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.supersedeFinding("run-001", second.findingId, "run-001:finding:9"),
    "superseding with a nonexistent replacement rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.supersedeFinding("run-001", "run-001:finding:9", second.findingId),
    "superseding a nonexistent finding rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", first.findingId, {
    resolvedByRevisionId: "run-001:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  }), "resolving a superseded finding rejected");
});
withRunningStore((store) => {
  // A resolved finding can still be superseded; the closure fields are
  // cleared so the superseded status keeps one canonical field shape.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const first = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }))).record;
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", first.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  const second = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "LOW",
  }))).record;
  const superseded = store.supersedeFinding("run-001", first.findingId, second.findingId);
  assert(superseded.record.status === "SUPERSEDED" &&
    superseded.record.supersededBy === second.findingId &&
    superseded.record.resolvedByRevisionId === null &&
    superseded.record.resolutionEvidenceRef === null,
    "superseding a resolved finding clears the resolution fields");
  const gate = store.computeFindingGate("run-001");
  assert(gate.status === "BLOCKED" && gate.blockingFindings.join(",") === second.findingId,
    "the superseded finding is absorbed; the open replacement governs the gate");
});

console.log("finding lifecycle: gate derivation on the store read path");
withRunningStore((store) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const gate = store.computeFindingGate("run-001");
  assert(gate.status === "BLOCKED" && gate.blockingFindings.join(",") === finding.findingId &&
    gate.reasonCodes.join(",") === "FINDING_OPEN", "open finding blocks the gate");
  expectThrow("INVALID_INPUT", () => store.computeFindingGate(" run-001"),
    "gate read input validated fail-closed");
});
withRunningStore((store) => {
  // Resolved but the earliest affected node's current is still STALE: the
  // gate stays blocked even though the finding itself is closed.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  // The append marked code-review stale; test-validation has not run yet.
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("implementation")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  const gate = store.computeFindingGate("run-001");
  assert(gate.status === "BLOCKED" && gate.reasonCodes.join(",") === "FINDING_DOWNSTREAM_STALE",
    "resolved finding with a stale downstream current blocks the gate");
});
withRunningStore((store) => {
  // Resolved but a downstream node has no current revision at all.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 5));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const review = driver.succeed("code-review", NODE_OUT["code-review"]);
  const reviewRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "code-review", producerExecutionId: review.executionEventId,
    upstreamRevisionIds: [revisions.get("implementation")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: reviewRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  const gate = store.computeFindingGate("run-001");
  assert(gate.status === "BLOCKED" && gate.reasonCodes.join(",") === "FINDING_DOWNSTREAM_MISSING",
    "resolved finding with a missing downstream current blocks the gate");
});
withRunningStore((store) => {
  // CRITICAL resolved: eligible only once the downstream current is ACTIVE.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "CRITICAL",
  }))).record;
  const before = store.computeFindingGate("run-001");
  assert(before.status === "BLOCKED" && before.reasonCodes.join(",") === "FINDING_OPEN",
    "critical finding blocks while open");
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  const after = store.computeFindingGate("run-001");
  assert(after.status === "ELIGIBLE" && after.blockingFindings.length === 0,
    "critical finding resolved with an active downstream current is eligible");
});
withRunningStore((store) => {
  // ACCEPTED_RISK is consumable with evidence once the downstream current is
  // ACTIVE; superseded findings are absorbed by their replacement.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const first = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }))).record;
  const second = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "MEDIUM",
  }))).record;
  store.supersedeFinding("run-001", first.findingId, second.findingId);
  store.acceptFindingRisk("run-001", second.findingId, RISK_EVIDENCE);
  const missing = store.computeFindingGate("run-001");
  assert(missing.status === "BLOCKED" && missing.reasonCodes.join(",") === "FINDING_DOWNSTREAM_MISSING",
    "risk-accepted finding still blocks while the downstream current is missing");
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  })));
  const eligible = store.computeFindingGate("run-001");
  assert(eligible.status === "ELIGIBLE",
    "risk-accepted finding with evidence and an active downstream current is eligible");
});
withRunningStore((store) => {
  // Mixed set: an OPEN finding and a resolved-but-missing finding both block.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 5));
  const first = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const second = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review", severity: "LOW",
  }))).record;
  const review = driver.succeed("code-review", NODE_OUT["code-review"]);
  const reviewRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "code-review", producerExecutionId: review.executionEventId,
    upstreamRevisionIds: [revisions.get("implementation")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", first.findingId, {
    resolvedByRevisionId: reviewRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  const gate = store.computeFindingGate("run-001");
  assert(gate.status === "BLOCKED" &&
    gate.blockingFindings.join(",") === [first.findingId, second.findingId].join(",") &&
    gate.reasonCodes.join(",") === "FINDING_DOWNSTREAM_MISSING,FINDING_OPEN",
    "mixed findings block with every id and reason in chain order");
});

console.log("finding lifecycle: corruption is detected through normal reads");
withRunningStore((store, dir) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_findings SET canonical_sha256 = ? WHERE finding_id = ?")
      .run("0".repeat(64), finding.findingId);
  } finally {
    db.close();
  }
  expectFindingCorruptOnAllReadPaths(store, "tampered finding hash raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  // A tampered row whose requirementId was rebound to another requirement —
  // with a freshly recomputed canonical hash — must still fail closed,
  // because reads cross-bind each finding to the verified run identity.
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  tamperFindingWithRehash(dir, finding.findingId, Object.freeze({ ...finding, requirementId: "req-002" }));
  expectFindingCorruptOnAllReadPaths(store, "rehashed mis-bound finding raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  // Field rules are re-verified on every read: a rehashed row whose category
  // drifts off the routing matrix row of its capability fails closed.
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  tamperFindingWithRehash(dir, finding.findingId, Object.freeze({ ...finding, category: "KNOWLEDGE" }));
  expectFindingCorruptOnAllReadPaths(store, "rehashed category/capability mismatch raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  tamperFindingWithRehash(dir, finding.findingId, Object.freeze({
    ...finding, earliestAffectedNodeId: "knowledge-sync",
  }));
  expectFindingCorruptOnAllReadPaths(store, "rehashed earliest-node ordering violation raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  // Invalidation edge tampering: the edge rows carry no hash, so the
  // read-path cross-checks against the verified revision chain must reject.
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "implementation", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  })));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.pragma("foreign_keys = OFF");
    db.prepare("UPDATE loop_finding_invalidations SET node_id = ? WHERE finding_id = ? AND invalidation_index = 0")
      .run("solution-design", "run-001:finding:1");
  } finally {
    db.close();
  }
  expectFindingCorruptOnAllReadPaths(store, "tampered invalidation node raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "implementation", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  })));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ? AND invalidation_index = 1")
      .run("run-001:finding:1");
  } finally {
    db.close();
  }
  expectFindingCorruptOnAllReadPaths(store, "invalidation index gap raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  // An edge whose revision drifted back to ACTIVE (with a recomputed
  // revision hash) fails closed: invalidation edges must reference STALE
  // revisions.
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS);
  store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "implementation", category: "IMPLEMENTATION",
    earliestAffectedNodeId: "implementation",
  })));
  const target = revisions.get("implementation")!;
  const revived = Object.freeze({ ...target, validity: "ACTIVE" }) as LoopArtifactRevision;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_artifact_revisions SET validity = ?, canonical_sha256 = ? WHERE revision_id = ?")
      .run("ACTIVE", createHash("sha256").update(canonicalizeLoopArtifactRevision(revived)).digest("hex"),
        target.revisionId);
  } finally {
    db.close();
  }
  expectFindingCorruptOnAllReadPaths(store, "invalidation edge on a non-stale revision raises STORE_CORRUPT");
});

console.log("finding lifecycle: closure proofs are durable and cross-bound on read-back");
/** Fixed-order canonical form without validation, mirroring the proof schema. */
function canonicalizeProofUnchecked(proof: LoopFindingProof): string {
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
 * Append a finding before test-validation ran, then drive test-validation and
 * resolve the finding against its later-arriving current ACTIVE revision.
 */
function appendAndResolveFinding(
  store: LoopRunStore,
  driver: CapabilityDriver,
): { finding: LoopFinding; validationRevision: LoopArtifactRevision } {
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }))).record;
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  return { finding, validationRevision };
}
{
  withRunningStore((store, dir) => {
    const driver = makeCapabilityDriver(store, "run-001");
    const { finding, validationRevision } = appendAndResolveFinding(store, driver);
    const db = new Database(join(dir, "journal.db"), { readonly: true });
    try {
      const proof = db.prepare("SELECT * FROM loop_finding_proofs WHERE finding_id = ?")
        .get(finding.findingId) as Record<string, unknown> | undefined;
      assert(
        proof !== undefined &&
        proof.proof_kind === "RESOLUTION" &&
        proof.revision_id === validationRevision.revisionId &&
        proof.revision_node_id === "knowledge-sync" &&
        proof.revision_artifact_ref === validationRevision.artifactRef &&
        proof.revision_artifact_digest === validationRevision.digest,
        "resolution proof persisted with the revision content binding",
      );
      const scope = db.prepare("SELECT * FROM loop_finding_scopes WHERE finding_id = ?")
        .get(finding.findingId) as Record<string, unknown> | undefined;
      // The finding was appended before test-validation ran: the append-time
      // affected set was empty, and the empty scope is a first-class value.
      assert(
        scope !== undefined && scope.edge_count === 0,
        "append-time invalidation scope persisted, empty set included",
      );
    } finally {
      db.close();
    }
    assert(store.computeFindingGate("run-001").status === "ELIGIBLE",
      "resolved finding with a durable proof is gate-eligible");
  });
  withRunningStore((store, dir) => {
    // A programmatically forged closure: the attacker flips an OPEN finding to
    // RESOLVED with a format-valid evidence pair and recomputes the canonical
    // hash. Only the missing durable closure proof still rejects it.
    const driver = makeCapabilityDriver(store, "run-001");
    driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "code-review", category: "REVIEW",
      earliestAffectedNodeId: "code-review",
    }))).record;
    tamperFindingWithRehash(dir, finding.findingId, Object.freeze({
      ...finding,
      status: "RESOLVED",
      resolvedByRevisionId: "run-001:revision:code-review:1",
      resolutionEvidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("9")}`,
      resolutionEvidenceDigest: dg("9"),
    }));
    expectFindingCorruptOnAllReadPaths(store, "forged resolution without a durable proof raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // The review's attack: a never-accepted HIGH finding is programmatically
    // risk-accepted with an arbitrary acceptor and a forged but well-formed
    // digest, canonical hash recomputed. No proof exists → fail closed.
    const driver = makeCapabilityDriver(store, "run-001");
    driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "code-review", category: "REVIEW",
      earliestAffectedNodeId: "code-review",
    }))).record;
    tamperFindingWithRehash(dir, finding.findingId, Object.freeze({
      ...finding,
      status: "ACCEPTED_RISK",
      riskAcceptedBy: "user:mallory",
      riskAcceptanceEvidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("8")}`,
      riskAcceptanceEvidenceDigest: dg("8"),
    }));
    expectFindingCorruptOnAllReadPaths(store, "forged risk acceptance without a durable proof raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // Rehashed replacement of resolvedByRevisionId: the proof's captured
    // revision binding no longer matches the finding row's closure fields.
    const driver = makeCapabilityDriver(store, "run-001");
    const { finding } = appendAndResolveFinding(store, driver);
    const resolved = store.listFindings("run-001")[0]!;
    tamperFindingWithRehash(dir, finding.findingId, Object.freeze({
      ...resolved,
      resolvedByRevisionId: "run-001:revision:code-review:1",
    }));
    expectFindingCorruptOnAllReadPaths(store, "rehashed resolvedByRevisionId replacement raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // Deleting the durable proof of a legitimately resolved finding fails
    // every read path closed.
    const driver = makeCapabilityDriver(store, "run-001");
    const { finding } = appendAndResolveFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_proofs WHERE finding_id = ?").run(finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "deleted resolution proof raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // Tampering the proof's evidence and recomputing the proof's own hash
    // still fails closed: the proof must equal the finding row's closure
    // fields.
    const driver = makeCapabilityDriver(store, "run-001");
    const { finding } = appendAndResolveFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      const row = db.prepare("SELECT * FROM loop_finding_proofs WHERE finding_id = ?")
        .get(finding.findingId) as Record<string, unknown>;
      const tampered: LoopFindingProof = Object.freeze({
        findingId: finding.findingId,
        proofKind: "RESOLUTION",
        revisionId: row.revision_id as string,
        revisionNodeId: row.revision_node_id as LoopFindingProof["revisionNodeId"],
        revisionArtifactRef: row.revision_artifact_ref as string,
        revisionArtifactDigest: row.revision_artifact_digest as string,
        evidenceRef: `loop-artifact:v1:capability_findings:sha256:${dg("7")}`,
        evidenceDigest: dg("7"),
        riskAcceptedBy: null,
      });
      db.prepare("UPDATE loop_finding_proofs SET evidence_ref = ?, evidence_digest = ?, canonical_sha256 = ? WHERE finding_id = ?")
        .run(tampered.evidenceRef, tampered.evidenceDigest,
          createHash("sha256").update(canonicalizeProofUnchecked(tampered)).digest("hex"),
          finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "rehashed proof evidence drift raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // A forged proof attached to an OPEN finding — hash correctly computed —
    // fails closed: only closed findings may carry proofs.
    const driver = makeCapabilityDriver(store, "run-001");
    driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "code-review", category: "REVIEW",
      earliestAffectedNodeId: "code-review",
    }))).record;
    const forged = createLoopFindingRiskAcceptanceProof(finding, RISK_EVIDENCE);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare(
        `INSERT INTO loop_finding_proofs (
          finding_id, proof_kind, revision_id, revision_node_id,
          revision_artifact_ref, revision_artifact_digest,
          evidence_ref, evidence_digest, risk_accepted_by, canonical_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        forged.findingId, forged.proofKind, null, null, null, null,
        forged.evidenceRef, forged.evidenceDigest, forged.riskAcceptedBy,
        createHash("sha256").update(canonicalizeLoopFindingProof(forged, "run-001")).digest("hex"),
      );
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "forged proof on an open finding raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // Superseding clears the closure fields, so the proof must not survive;
    // re-adding one to the SUPERSEDED finding fails closed.
    const driver = makeCapabilityDriver(store, "run-001");
    const { finding, validationRevision } = appendAndResolveFinding(store, driver);
    const replacement = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 2, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
      earliestAffectedNodeId: "knowledge-sync",
    }))).record;
    store.supersedeFinding("run-001", finding.findingId, replacement.findingId);
    assert(store.listFindings("run-001")[0]!.status === "SUPERSEDED",
      "superseded finding reads back cleanly");
    const db = new Database(join(dir, "journal.db"));
    try {
      const leftover = db.prepare("SELECT * FROM loop_finding_proofs WHERE finding_id = ?")
        .get(finding.findingId);
      assert(leftover === undefined, "supersede removes the closure proof in the same transaction");
      // Re-add the removed proof: a SUPERSEDED finding must not carry one.
      db.prepare(
        `INSERT INTO loop_finding_proofs (
          finding_id, proof_kind, revision_id, revision_node_id,
          revision_artifact_ref, revision_artifact_digest,
          evidence_ref, evidence_digest, risk_accepted_by, canonical_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        finding.findingId, "RESOLUTION", validationRevision.revisionId, "knowledge-sync",
        validationRevision.artifactRef, validationRevision.digest,
        RESOLUTION_EVIDENCE.resolutionEvidenceRef, RESOLUTION_EVIDENCE.resolutionEvidenceDigest, null,
        createHash("sha256").update(canonicalizeProofUnchecked(Object.freeze({
          findingId: finding.findingId,
          proofKind: "RESOLUTION",
          revisionId: validationRevision.revisionId,
          revisionNodeId: "knowledge-sync" as NodeCapabilityId,
          revisionArtifactRef: validationRevision.artifactRef,
          revisionArtifactDigest: validationRevision.digest,
          evidenceRef: RESOLUTION_EVIDENCE.resolutionEvidenceRef,
          evidenceDigest: RESOLUTION_EVIDENCE.resolutionEvidenceDigest,
          riskAcceptedBy: null,
        }))).digest("hex"),
      );
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "proof re-added to a superseded finding raises STORE_CORRUPT");
  });
}

console.log("finding lifecycle: invalidation scope completeness is verified on read-back");
/** Drive all seven nodes ACTIVE, then append a finding that stales every one. */
function appendFullScopeFinding(store: LoopRunStore, driver: CapabilityDriver): LoopFinding {
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  // Full-chain invalidation requires the REQUIREMENT layer (canonical earliest
  // = requirement-intake); KNOWLEDGE would only stale the knowledge-sync node.
  return store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "REQUIREMENT",
    earliestAffectedNodeId: "requirement-intake",
  }))).record;
}
{
  withRunningStore((store, dir) => {
    // The demonstrated Round-1 gap: deleting the LAST edge leaves the rest
    // contiguous; only the persisted append-time scope fails closed.
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ? AND invalidation_index = 6")
        .run(finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "deleted last invalidation edge raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ? AND invalidation_index = 0")
        .run(finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "deleted first invalidation edge raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ?")
        .run(finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "deleted complete invalidation edge set raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // 重算关联事实：the attacker deletes the last edge AND recomputes the
    // finding row's canonical hash — the scope digest still fails closed.
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ? AND invalidation_index = 6")
        .run(finding.findingId);
      db.prepare("UPDATE loop_findings SET canonical_sha256 = ? WHERE finding_id = ?")
        .run(createHash("sha256").update(canonicalizeFindingUnchecked(finding)).digest("hex"),
          finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store,
      "deleted last edge with recomputed finding hash raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("DELETE FROM loop_finding_scopes WHERE finding_id = ?").run(finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "deleted invalidation scope raises STORE_CORRUPT");
  });
  withRunningStore((store, dir) => {
    // A scope digest rewritten without its canonical hash fails closed.
    const driver = makeCapabilityDriver(store, "run-001");
    const finding = appendFullScopeFinding(store, driver);
    const db = new Database(join(dir, "journal.db"));
    try {
      db.prepare("UPDATE loop_finding_scopes SET scope_digest = ? WHERE finding_id = ?")
        .run(dg("6"), finding.findingId);
    } finally {
      db.close();
    }
    expectFindingCorruptOnAllReadPaths(store, "tampered invalidation scope digest raises STORE_CORRUPT");
  });
}

console.log("finding lifecycle: a renumbered middle-edge deletion is caught by the scope digest");
withRunningStore((store, dir) => {
  // Round-2 hardening: delete a MIDDLE edge, renumber the survivors back to a
  // contiguous chain, and repair both the persisted edge count and the scope
  // row's own canonical hash — index contiguity, edge count and the canonical
  // hash all pass afterwards, so only the recomputed scope digest can still
  // reject this state.
  const driver = makeCapabilityDriver(store, "run-001");
  const finding = appendFullScopeFinding(store, driver);
  const db = new Database(join(dir, "journal.db"));
  try {
    const scope = db.prepare("SELECT scope_digest FROM loop_finding_scopes WHERE finding_id = ?")
      .get(finding.findingId) as { scope_digest: string };
    db.prepare("DELETE FROM loop_finding_invalidations WHERE finding_id = ? AND invalidation_index = 3")
      .run(finding.findingId);
    db.prepare(
      "UPDATE loop_finding_invalidations SET invalidation_index = invalidation_index - 1 " +
      "WHERE finding_id = ? AND invalidation_index > 3",
    ).run(finding.findingId);
    db.prepare("UPDATE loop_finding_scopes SET edge_count = 6, canonical_sha256 = ? WHERE finding_id = ?")
      .run(createHash("sha256").update(JSON.stringify({
        findingId: finding.findingId, edgeCount: 6, scopeDigest: scope.scope_digest,
      })).digest("hex"), finding.findingId);
  } finally {
    db.close();
  }
  expectFindingCorruptOnAllReadPaths(store,
    "renumbered middle-edge deletion with repaired count raises STORE_CORRUPT via the scope digest");
});

/** Count the persisted closure proofs of one finding, bypassing the store. */
function countFindingProofs(dir: string, findingId: string): number {
  const db = new Database(join(dir, "journal.db"), { readonly: true });
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM loop_finding_proofs WHERE finding_id = ?")
      .get(findingId) as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

/** Append a TEST finding, then produce the downstream current it resolves against. */
function setupResolvableFinding(
  store: LoopRunStore,
): { finding: LoopFinding; validationRevision: LoopArtifactRevision } {
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }))).record;
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  return { finding, validationRevision };
}

/** Two OPEN findings plus a revision either of them could resolve against. */
function setupTwoResolvableFindings(
  store: LoopRunStore,
): { first: LoopFinding; second: LoopFinding; validationRevision: LoopArtifactRevision } {
  const driver = makeCapabilityDriver(store, "run-001");
  const revisions = driveNodes(store, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const first = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }))).record;
  const second = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 2, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync", severity: "MEDIUM",
  }))).record;
  const validation = driver.succeed("knowledge-sync", NODE_OUT["knowledge-sync"]);
  const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "knowledge-sync", producerExecutionId: validation.executionEventId,
    upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
  }))).record;
  return { first, second, validationRevision };
}

console.log("finding lifecycle: proof/scope insert-point failures roll back the whole write");
withRunningStore((store, dir) => {
  // A forced failure at the scope insert rolls back the finding, the edges
  // and the STALE marks together (same trigger technique as the
  // mid-propagation atomicity test above).
  const driver = makeCapabilityDriver(store, "run-001");
  driveNodes(store, driver, NODE_CAPABILITY_IDS);
  const raw = new Database(join(dir, "journal.db"));
  raw.exec(
    "CREATE TRIGGER abort_finding_scope BEFORE INSERT ON loop_finding_scopes " +
    "BEGIN SELECT RAISE(ABORT, 'forced'); END",
  );
  raw.close();
  expectThrow("STORE_FAILURE", () => store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "requirement-intake", category: "REQUIREMENT",
    earliestAffectedNodeId: "requirement-intake",
  }))), "forced scope-insert failure rejects the append");
  assert(store.listFindings("run-001").length === 0, "finding insert rolled back with the scope failure");
  assert(store.listFindingInvalidations("run-001").length === 0,
    "no invalidation edges persisted after the scope failure");
  assert(store.listArtifactRevisions("run-001").every((item) => item.validity === "ACTIVE"),
    "stale marks rolled back with the scope failure");
});
withRunningStore((store, dir) => {
  // A forced failure at the proof insert rolls back the resolution
  // transition; once the failure clears the resolution retries cleanly.
  const { finding, validationRevision } = setupResolvableFinding(store);
  const raw = new Database(join(dir, "journal.db"));
  raw.exec(
    "CREATE TRIGGER abort_finding_proof BEFORE INSERT ON loop_finding_proofs " +
    "BEGIN SELECT RAISE(ABORT, 'forced'); END",
  );
  raw.close();
  expectThrow("STORE_FAILURE", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  }), "forced proof-insert failure rejects the resolution");
  const listed = store.listFindings("run-001");
  assert(listed.length === 1 && listed[0]!.status === "OPEN", "resolution status update rolled back");
  assert(countFindingProofs(dir, finding.findingId) === 0, "no closure proof persisted");
  const fix = new Database(join(dir, "journal.db"));
  fix.exec("DROP TRIGGER abort_finding_proof");
  fix.close();
  const retried = store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
  });
  assert(retried.record.status === "RESOLVED", "resolution retries cleanly after the failure clears");
  assert(countFindingProofs(dir, finding.findingId) === 1, "retry persists exactly one proof");
});
withRunningStore((store, dir) => {
  // Same insert-point failure for risk acceptance.
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const raw = new Database(join(dir, "journal.db"));
  raw.exec(
    "CREATE TRIGGER abort_finding_proof BEFORE INSERT ON loop_finding_proofs " +
    "BEGIN SELECT RAISE(ABORT, 'forced'); END",
  );
  raw.close();
  expectThrow("STORE_FAILURE", () => store.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
    "forced proof-insert failure rejects the risk acceptance");
  assert(store.listFindings("run-001")[0]!.status === "OPEN", "risk-acceptance status update rolled back");
  assert(countFindingProofs(dir, finding.findingId) === 0, "no risk proof persisted");
});

console.log("finding lifecycle: closure transition races settle exactly one winner");
/** Two stores on one journal: the loser of a race observes the committed winner state. */
function withTwoRunningStores(
  fn: (storeA: LoopRunStore, storeB: LoopRunStore, dir: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  const storeB = new LoopRunStore(path);
  storeA.init();
  storeB.init();
  try {
    storeA.createRun(makeIdentity());
    storeA.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    fn(storeA, storeB, dir);
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
{
  withTwoRunningStores((storeA, storeB, dir) => {
    const { finding, validationRevision } = setupResolvableFinding(storeA);
    storeA.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    });
    expectThrow("ILLEGAL_TRANSITION", () => storeB.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    }), "concurrent resolve loses to a committed resolve");
    const listed = storeB.listFindings("run-001");
    assert(listed.length === 1 && listed[0]!.status === "RESOLVED",
      "the loser observes the winner's resolved state");
    assert(countFindingProofs(dir, finding.findingId) === 1, "exactly one resolution proof persisted");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { finding } = setupResolvableFinding(storeA);
    storeA.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE);
    expectThrow("ILLEGAL_TRANSITION", () => storeB.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
      "concurrent risk acceptance loses to a committed risk acceptance");
    const listed = storeB.listFindings("run-001");
    assert(listed.length === 1 && listed[0]!.status === "ACCEPTED_RISK",
      "the loser observes the winner's accepted-risk state");
    assert(countFindingProofs(dir, finding.findingId) === 1, "exactly one risk proof persisted");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { finding, validationRevision } = setupResolvableFinding(storeA);
    storeA.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    });
    expectThrow("ILLEGAL_TRANSITION", () => storeB.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
      "concurrent risk acceptance loses to a committed resolve");
    assert(storeB.listFindings("run-001")[0]!.status === "RESOLVED",
      "the loser observes the winner's resolved state");
    assert(countFindingProofs(dir, finding.findingId) === 1, "exactly one closure proof persisted");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { finding, validationRevision } = setupResolvableFinding(storeA);
    storeA.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE);
    expectThrow("ILLEGAL_TRANSITION", () => storeB.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    }), "concurrent resolve loses to a committed risk acceptance");
    assert(storeB.listFindings("run-001")[0]!.status === "ACCEPTED_RISK",
      "the loser observes the winner's accepted-risk state");
    assert(countFindingProofs(dir, finding.findingId) === 1, "exactly one closure proof persisted");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { first, second, validationRevision } = setupTwoResolvableFindings(storeA);
    storeA.supersedeFinding("run-001", first.findingId, second.findingId);
    expectThrow("ILLEGAL_TRANSITION", () => storeB.resolveFinding("run-001", first.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    }), "concurrent resolve loses to a committed supersede");
    const listed = storeB.listFindings("run-001");
    assert(listed[0]!.status === "SUPERSEDED" && listed[1]!.status === "OPEN",
      "the loser observes the superseded finding and the open replacement");
    assert(countFindingProofs(dir, first.findingId) === 0, "supersede persists no closure proof");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { first, second } = setupTwoResolvableFindings(storeA);
    storeA.supersedeFinding("run-001", first.findingId, second.findingId);
    expectThrow("ILLEGAL_TRANSITION", () => storeB.acceptFindingRisk("run-001", first.findingId, RISK_EVIDENCE),
      "concurrent risk acceptance loses to a committed supersede");
    assert(storeB.listFindings("run-001")[0]!.status === "SUPERSEDED",
      "the loser observes the winner's superseded state");
    assert(countFindingProofs(dir, first.findingId) === 0, "supersede persists no closure proof");
  });
  withTwoRunningStores((storeA, storeB, dir) => {
    const { first, second } = setupTwoResolvableFindings(storeA);
    storeA.supersedeFinding("run-001", first.findingId, second.findingId);
    expectThrow("ILLEGAL_TRANSITION", () => storeB.supersedeFinding("run-001", first.findingId, second.findingId),
      "concurrent supersede loses to a committed supersede (absorbing)");
    const listed = storeB.listFindings("run-001");
    assert(listed[0]!.status === "SUPERSEDED" && listed[1]!.status === "OPEN",
      "the loser observes the winner's superseded state");
    assert(countFindingProofs(dir, first.findingId) === 0, "supersede persists no closure proof");
  });
}

console.log("finding lifecycle: identity rewrite committed before the read starts fails closed");
withRunningStore((store, dir) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const raw = new Database(join(dir, "journal.db"));
  raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
  raw.close();
  tamperFindingWithRehash(dir, finding.findingId, Object.freeze({ ...finding, requirementId: "req-tampered" }));
  expectThrow("STORE_CORRUPT", () => store.listFindings("run-001"),
    "listFindings fails closed on a pre-transaction identity rewrite");
  expectThrow("STORE_CORRUPT", () => store.computeFindingGate("run-001"),
    "computeFindingGate fails closed on a pre-transaction identity rewrite");
});

/**
 * Deterministic mid-transaction barrier for the read-path TOCTOU regression
 * test (same discipline as the WP2 barrier). Fires `onBarrier` when the
 * store's own connection first prepares a statement matching
 * `detailSqlMarker` — always after the transaction's first read (the
 * `loop_runs` identity row), which pins the WAL snapshot. The barrier commits
 * a tamper through a SECOND connection while the read transaction is still
 * open; the tamper is therefore invisible to the rest of the transaction.
 */
function withDetailReadBarrier<T>(
  store: LoopRunStore,
  detailSqlMarker: string,
  onBarrier: () => void,
  read: () => T,
): { result: T; fired: boolean } {
  const db = (store as unknown as { db: Database.Database }).db;
  const originalPrepare = db.prepare;
  let fired = false;
  db.prepare = function (this: Database.Database, sql: string) {
    if (!fired && sql.includes(detailSqlMarker)) {
      fired = true;
      onBarrier();
    }
    return originalPrepare.call(this, sql);
  } as typeof db.prepare;
  try {
    return { result: read(), fired };
  } finally {
    db.prepare = originalPrepare;
  }
}

console.log("finding lifecycle: mid-transaction identity rewrite keeps the read's own consistent snapshot");
withRunningStore((store, dir) => {
  const finding = store.appendFinding(createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }))).record;
  const tamper = () => {
    const raw = new Database(join(dir, "journal.db"));
    raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
    raw.close();
    tamperFindingWithRehash(dir, finding.findingId, Object.freeze({ ...finding, requirementId: "req-tampered" }));
  };
  const listed = withDetailReadBarrier(store, "FROM loop_findings", tamper,
    () => store.listFindings("run-001"));
  assert(listed.fired, "barrier fired inside the read transaction");
  assert(
    listed.result.length === 1 &&
      listed.result[0]!.findingId === finding.findingId &&
      listed.result[0]!.requirementId === "req-001",
    "listFindings returns its own consistent pre-tamper snapshot, not the mid-transaction tamper",
  );
  expectThrow("STORE_CORRUPT", () => store.listFindings("run-001"),
    "the committed tamper fails closed on the next read");
});

console.log("finding lifecycle: another entry reads the same finding chain");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  storeA.init();
  storeA.createRun(makeIdentity());
  storeA.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const driver = makeCapabilityDriver(storeA, "run-001");
  driveNodes(storeA, driver, NODE_CAPABILITY_IDS.slice(0, 6));
  const finding = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
    earliestAffectedNodeId: "knowledge-sync",
  }));
  storeA.appendFinding(finding);
  storeA.close();

  const storeB = new LoopRunStore(path);
  storeB.init();
  try {
    const chain = storeB.listFindings("run-001");
    assert(chain.length === 1, "second entry reads the finding chain");
    assert(
      canonicalizeLoopFinding(chain[0]!) === canonicalizeLoopFinding(finding),
      "read-back finding is byte-identical across entries",
    );
    const gate = storeB.computeFindingGate("run-001");
    assert(gate.status === "BLOCKED" && gate.blockingFindings.join(",") === finding.findingId,
      "second entry derives the same gate");
  } finally {
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("finding lifecycle: closed store behavior");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  store.close();
  const finding = createLoopFinding(findingDraft({
    sequence: 1, sourceCapability: "code-review", category: "REVIEW",
    earliestAffectedNodeId: "code-review",
  }));
  expectThrow("STORE_CLOSED", () => store.appendFinding(finding), "closed store append raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.listFindings("run-001"), "closed store chain read raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.listFindingInvalidations("run-001"),
    "closed store invalidation read raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.computeFindingGate("run-001"),
    "closed store gate read raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.resolveFinding("run-001", finding.findingId, {
    resolvedByRevisionId: "run-001:revision:code-review:1", ...RESOLUTION_EVIDENCE,
  }), "closed store resolution raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.acceptFindingRisk("run-001", finding.findingId, RISK_EVIDENCE),
    "closed store risk acceptance raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.supersedeFinding("run-001", finding.findingId, "run-001:finding:2"),
    "closed store supersede raises STORE_CLOSED");
  rmSync(dir, { recursive: true, force: true });
}

console.log("finding lifecycle: pre-v6 journals are rejected as unsupported history");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  // A journal marked v4 is known history: init refuses it outright — there is
  // no v4→v5 semantic migration on the v2 cutover.
  const historicalPath = join(dir, "historical.db");
  const seed = new Database(historicalPath);
  seed.pragma("user_version = 4");
  seed.close();
  const rejected = new LoopRunStore(historicalPath);
  let historicalRejected = false;
  try {
    rejected.init();
  } catch (error) {
    historicalRejected = error instanceof LoopRunJournalError && error.code === "UNSUPPORTED_HISTORICAL_FORMAT";
  }
  assert(historicalRejected, "v4 journal rejected with UNSUPPORTED_HISTORICAL_FORMAT");
  // An unversioned database that already carries LOOP tables is history too.
  const unversionedPath = join(dir, "unversioned.db");
  const raw = new Database(unversionedPath);
  raw.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
  raw.close();
  const rejected2 = new LoopRunStore(unversionedPath);
  let unversionedRejected = false;
  try {
    rejected2.init();
  } catch (error) {
    unversionedRejected = error instanceof LoopRunJournalError && error.code === "UNSUPPORTED_HISTORICAL_FORMAT";
  }
  assert(unversionedRejected, "unversioned database with LOOP tables rejected as history");
  rmSync(dir, { recursive: true, force: true });
}
{
  // Foreign key drift on the invalidation table fails closed.
  const dir = mkdtempSync(join(tmpdir(), "loop-finding-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.close();
  const raw = new Database(path);
  raw.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE loop_finding_invalidations;
    CREATE TABLE loop_finding_invalidations (
      finding_id TEXT NOT NULL,
      invalidation_index INTEGER NOT NULL,
      revision_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      PRIMARY KEY (finding_id, invalidation_index),
      FOREIGN KEY (finding_id)
        REFERENCES loop_findings(finding_id) ON DELETE CASCADE
    );
  `);
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "invalidation table foreign key drift is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("finding lifecycle: closure evidence binds to the physical blob (bound artifact store)");
/** Bound-store fixture: run journal + real artifact store in one temp dir. */
function withBoundFindingStore(
  fn: (store: LoopRunStore, artifactStore: LoopArtifactStore, dir: string) => void,
): void {
  // realpath: the artifact store resolves its control root, so blob paths
  // derived by the test must be computed from the resolved directory.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loop-finding-blob-")));
  const repositoryPath = join(dir, "repo");
  mkdirSync(repositoryPath, { recursive: true });
  const artifactStore = new LoopArtifactStore({ controlRoot: join(dir, "control"), repositoryPath });
  artifactStore.init();
  const store = new LoopRunStore(join(dir, "journal.db"), { artifactStore });
  store.init();
  try {
    fn(store, artifactStore, dir);
  } finally {
    store.close();
    artifactStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function findingBlobPath(dir: string, kind: string, digest: string): string {
  return join(dir, "control", "artifacts", "v1", kind, digest.slice(0, 2), `${digest}.blob`);
}

/** Drive the given nodes with real output blobs and matching revisions. */
function driveBoundNodes(
  store: LoopRunStore,
  artifactStore: LoopArtifactStore,
  driver: CapabilityDriver,
  nodes: readonly NodeCapabilityId[],
): Map<NodeCapabilityId, LoopArtifactRevision> {
  const revisions = new Map<NodeCapabilityId, LoopArtifactRevision>();
  let upstream: string[] = [];
  for (const nodeId of nodes) {
    const stored = artifactStore.put(LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].artifactKind, `${nodeId} output v1`);
    const execution = driver.succeed(nodeId, { version: "1.0.0", digest: stored.digest });
    const revision = store.appendArtifactRevision(createLoopArtifactRevision({
      runId: "run-001",
      requirementId: "req-001",
      nodeId,
      sequence: 1,
      generation: null,
      stablePath: `library/req-001/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].stablePathSegment}/req-001_${nodeId}.md`,
      artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].artifactKind,
      semver: "1.0.0",
      artifactRef: stored.artifactRef,
      digest: stored.digest,
      producerExecutionId: execution.executionEventId,
      producerExecutionRole: (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(nodeId)
        ? "formal_verdict"
        : "primary",
      gateResult: (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(nodeId)
        ? "PASS"
        : "NOT_APPLICABLE",
      upstreamRevisionIds: upstream,
      createdAt: nextTs(),
    })).record;
    revisions.set(nodeId, revision);
    upstream = [revision.revisionId];
  }
  return revisions;
}

{
  withBoundFindingStore((store, artifactStore, _dir) => {
    // 伪造证据：a resolution evidence digest whose blob was never written is
    // rejected at write time when the artifact store is bound.
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const revisions = driveBoundNodes(store, artifactStore, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
      earliestAffectedNodeId: "knowledge-sync",
    }))).record;
    const storedValidation = artifactStore.put("knowledge_sync_result", "knowledge-sync output v1");
    const validation = driver.succeed("knowledge-sync", {
      version: "1.0.0", digest: storedValidation.digest,
    });
    const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision({
      runId: "run-001",
      requirementId: "req-001",
      nodeId: "knowledge-sync",
      sequence: 1,
      generation: null,
      stablePath: "library/req-001/06-知识同步/req-001_knowledge-sync.md",
      artifactKind: "knowledge_sync_result",
      semver: "1.0.0",
      artifactRef: storedValidation.artifactRef,
      digest: storedValidation.digest,
      producerExecutionId: validation.executionEventId,
      producerExecutionRole: "primary",
      gateResult: "NOT_APPLICABLE",
      upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
      createdAt: nextTs(),
    })).record;
    expectThrow("ILLEGAL_TRANSITION", () => store.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId, ...RESOLUTION_EVIDENCE,
    }), "resolution with a never-written evidence blob is rejected");
    assert(store.listFindings("run-001")[0]!.status === "OPEN",
      "rejected resolution leaves the finding open");
    expectThrow("ILLEGAL_TRANSITION", () => store.acceptFindingRisk("run-001", finding.findingId,
      RISK_EVIDENCE), "risk acceptance with a never-written evidence blob is rejected");
    assert(store.computeFindingGate("run-001").status === "BLOCKED",
      "rejected closures leave the gate blocked");
  });
  withBoundFindingStore((store, artifactStore, dir) => {
    // 真实证据：a resolution whose evidence blob physically exists succeeds;
    // deleting the blob afterwards fails every read path closed.
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const revisions = driveBoundNodes(store, artifactStore, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
      earliestAffectedNodeId: "knowledge-sync",
    }))).record;
    const storedValidation = artifactStore.put("knowledge_sync_result", "knowledge-sync output v1");
    const validation = driver.succeed("knowledge-sync", {
      version: "1.0.0", digest: storedValidation.digest,
    });
    const validationRevision = store.appendArtifactRevision(createLoopArtifactRevision({
      runId: "run-001",
      requirementId: "req-001",
      nodeId: "knowledge-sync",
      sequence: 1,
      generation: null,
      stablePath: "library/req-001/06-知识同步/req-001_knowledge-sync.md",
      artifactKind: "knowledge_sync_result",
      semver: "1.0.0",
      artifactRef: storedValidation.artifactRef,
      digest: storedValidation.digest,
      producerExecutionId: validation.executionEventId,
      producerExecutionRole: "primary",
      gateResult: "NOT_APPLICABLE",
      upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
      createdAt: nextTs(),
    })).record;
    const evidence = artifactStore.put("capability_findings", "resolution gate evidence v1");
    const resolved = store.resolveFinding("run-001", finding.findingId, {
      resolvedByRevisionId: validationRevision.revisionId,
      resolutionEvidenceRef: evidence.artifactRef,
      resolutionEvidenceDigest: evidence.digest,
    });
    assert(resolved.record.status === "RESOLVED", "resolution with an existing evidence blob succeeds");
    assert(store.computeFindingGate("run-001").status === "ELIGIBLE",
      "resolved finding with verified durable evidence is gate-eligible");
    unlinkSync(findingBlobPath(dir, "capability_findings", evidence.digest));
    expectFindingCorruptOnAllReadPaths(store, "evidence blob deleted after resolution fails closed");
  });
  withBoundFindingStore((store, artifactStore, _dir) => {
    // 用户风险接受证据：a risk acceptance whose evidence blob physically
    // exists is consumed by the gate once the downstream current is ACTIVE.
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const revisions = driveBoundNodes(store, artifactStore, driver, NODE_CAPABILITY_IDS.slice(0, 6));
    const finding = store.appendFinding(createLoopFinding(findingDraft({
      sequence: 1, sourceCapability: "knowledge-sync", category: "KNOWLEDGE",
      earliestAffectedNodeId: "knowledge-sync",
    }))).record;
    const evidence = artifactStore.put("capability_findings", "user risk acceptance v1");
    const accepted = store.acceptFindingRisk("run-001", finding.findingId, {
      riskAcceptedBy: "user:shaoyang01",
      riskAcceptanceEvidenceRef: evidence.artifactRef,
      riskAcceptanceEvidenceDigest: evidence.digest,
    });
    assert(accepted.record.status === "ACCEPTED_RISK",
      "risk acceptance with an existing evidence blob succeeds");
    const storedValidation = artifactStore.put("knowledge_sync_result", "knowledge-sync output v1");
    const validation = driver.succeed("knowledge-sync", {
      version: "1.0.0", digest: storedValidation.digest,
    });
    store.appendArtifactRevision(createLoopArtifactRevision({
      runId: "run-001",
      requirementId: "req-001",
      nodeId: "knowledge-sync",
      sequence: 1,
      generation: null,
      stablePath: "library/req-001/06-知识同步/req-001_knowledge-sync.md",
      artifactKind: "knowledge_sync_result",
      semver: "1.0.0",
      artifactRef: storedValidation.artifactRef,
      digest: storedValidation.digest,
      producerExecutionId: validation.executionEventId,
      producerExecutionRole: "primary",
      gateResult: "NOT_APPLICABLE",
      upstreamRevisionIds: [revisions.get("code-review")!.revisionId],
      createdAt: nextTs(),
    }));
    assert(store.computeFindingGate("run-001").status === "ELIGIBLE",
      "accepted risk with verified durable evidence is gate-consumable");
  });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
