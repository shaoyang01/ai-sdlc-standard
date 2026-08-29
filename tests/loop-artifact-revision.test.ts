// LOOP Artifact Revision and Current Authority Tests (C02 WP-2)
// ==============================================================
// Canonical revision schema, producer execution binding, SemVer progression,
// supersede + current-pointer CAS atomicity, upstream currency, STALE
// primitive, manifest cross-binding, adversarial input boundaries, tampering
// detection and v3→v4 migration. All databases live in disposable temp
// directories outside the repository. No Git, no network, no Agent.
//
// Note on same-node revision chains: the C01 capability chain admits exactly
// one succeeded execution per capability per run (re-execution authority
// arrives with C02-WP4), and every persisted revision is re-verified against
// its producer execution on every read (Decision-040 item 4, review round 1).
// A readable journal therefore cannot contain two revisions of one node: the
// second revision would require a second succeeded execution of the same
// capability. Supersede/pointer-advance success paths are WP4-era semantics;
// they are covered here at the chain-validator level, and their store-level
// coverage arrives with the WP4 re-execution chain extension.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";

import {
  LOOP_ARTIFACT_GATE_CAPABILITIES,
  LOOP_ARTIFACT_INDEX_CROSS_BIND_STOP_REASONS,
  LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES,
  LOOP_ARTIFACT_INDEX_STATUSES,
  LOOP_ARTIFACT_REVISION_KINDS,
  LOOP_ARTIFACT_REVISION_SCHEMA_VERSION,
  LOOP_ARTIFACT_REVISION_VALIDITIES,
  canonicalizeLoopArtifactRevision,
  compareLoopArtifactSemver,
  createLoopArtifactRevision,
  crossBindArtifactIndexRow,
  supersedeArtifactRevision,
  validateLoopArtifactRevision,
  validateLoopArtifactRevisionChain,
  type LoopArtifactRevision,
  type LoopArtifactRevisionDraft,
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
} from "../core/loop-artifact-revision";
import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { LoopRunStore } from "../core/loop-run-store";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";
import { materializeProducerRevision } from "../runtime";

// Re-review F2-1: synthetic multi-point chains must close the terminal→
// revision window between points — materialize an intermediate producer's
// revision exactly as the runtime replay would before the next point starts.
function seedProducerRevision(store: LoopRunStore, produced: LoopCapabilityExecutionEvent): void {
  const snapshot = store.getSnapshot(produced.runId);
  if (snapshot === undefined) throw new Error("seed producer run does not exist");
  materializeProducerRevision(store, snapshot.state.identity.requirementId, produced.runId, produced, nextTs);
}

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
    repositoryPath: "/tmp/loop-artifact-rev-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-artifact-rev-test-run-001",
    controlRoot: "/tmp/loop-artifact-rev-test/control",
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
  let sequence = 0;
  const attempts = new Map<string, number>();
  /** Begin the next attempt of a capability (retry after a retryable failure). */
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
      schemaVersion: 4,
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
      consumedFindingsRef: null,
      consumedFindingsDigest: null,
      decisionDepth: (status === "succeeded" && capability === "solution-gate" && executionRole === "formal_verdict") ? "STANDARD" as const : null,
      decisionScopeId: (status === "succeeded" && capability === "solution-gate" && executionRole === "formal_verdict") ? `runId:decision:1` : null,
      decisionDeltaRef: (status === "succeeded" && capability === "solution-gate" && executionRole === "formal_verdict") ? `loop-artifact:v1:solution_review:sha256:${sha256Hex("decision-delta")}` : null,
      decisionDeltaDigest: (status === "succeeded" && capability === "solution-gate" && executionRole === "formal_verdict") ? sha256Hex("decision-delta") : null,
      nextStepEligibility: null,
      errorCode: null,
      retryable: null,
      reasonCode: null,
      processInvocationDigest: null,
      processExitCode: null,
      processSignal: null,
      processDurationMs: null,
      processTruncated: null,
      stagingRef: null,
      stagingDigest: null,
      promotionRef: null,
      promotionDigest: null,
      humanActionRef: null,
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
    /** Append started + failed(retryable) and return the failed event. */
    fail(capability: NodeCapabilityId): LoopCapabilityExecutionEvent {
      const attempt = nextAttempt(capability, "primary");
      const started = event(capability, "started", { attempt });
      store.appendCapabilityExecution(started);
      const failed = event(capability, "failed", {
        attempt,
        nextStepEligibility: "BLOCKED",
        errorCode: "PROBE_FAILURE",
        retryable: true,
        reasonCode: "TEST",
      });
      store.appendCapabilityExecution(failed);
      return failed;
    },
    /** Append started + succeeded and return the succeeded event. */
    succeed(
      capability: NodeCapabilityId,
      output: { version: string; digest: string },
      gate?: "PASS" | "FAIL" | "PASS_WITH_RISK",
    ): LoopCapabilityExecutionEvent {
      const isGate = (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(capability);
      const gateResult = isGate ? gate ?? "PASS" : "NOT_APPLICABLE";
      let scanRef = "";
      let scanVersion = "1.0.0";
      let scanDigest = "";
      if (isGate) {
        // v2: the scan round runs first, bound to a different agent; its
        // ledger rides in unresolvedFindingsRef and its Gate is fixed to
        // NOT_APPLICABLE.
        const scanAttempt = nextAttempt(capability, "adversarial_scan");
        scanRef = `loop-artifact:v1:solution_review:sha256:${dg("a")}`;
        scanDigest = dg("a");
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
          outputArtifactVersion: scanVersion,
          outputDigest: scanDigest,
          gateResult: "NOT_APPLICABLE",
          nextStepEligibility: "ELIGIBLE",
          unresolvedFindingsRef: `loop-artifact:v1:capability_findings:sha256:${dg("a")}`,
          unresolvedFindingsDigest: dg("a"),
        }));
      }
      const executionRole = isGate ? "formal_verdict" : "primary";
      const attempt = nextAttempt(capability, executionRole);
      const started = event(capability, "started", {
        attempt, executionRole,
        ...(isGate ? {
          inputArtifactRef: scanRef,
          inputArtifactVersion: scanVersion,
          inputDigest: scanDigest,
          consumedFindingsRef: `loop-artifact:v1:capability_findings:sha256:${dg("a")}`,
          consumedFindingsDigest: dg("a"),
        } : {}),
      });
      store.appendCapabilityExecution(started);
      const outputRef = `loop-artifact:v1:${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind}:sha256:${output.digest}`;
      const succeeded = event(capability, "succeeded", {
        attempt,
        executionRole,
        ...(isGate ? {
          inputArtifactRef: scanRef,
          inputArtifactVersion: scanVersion,
          inputDigest: scanDigest,
          consumedFindingsRef: `loop-artifact:v1:capability_findings:sha256:${dg("a")}`,
          consumedFindingsDigest: dg("a"),
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

type RevisionDraftOptions = {
  nodeId: NodeCapabilityId;
  sequence: number;
  semver: string;
  digest: string;
  producerExecutionId: string;
  stablePath?: string;
  upstreamRevisionIds?: string[];
  requirementId?: string;
  gateResult?: LoopArtifactRevisionDraft["gateResult"];
  createdAt?: string;
  generation?: LoopArtifactRevisionDraft["generation"];
};

function revisionDraft(o: RevisionDraftOptions): LoopArtifactRevisionDraft {
  const isGate = (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(o.nodeId);
  return {
    producerExecutionRole: isGate ? "formal_verdict" : "primary",
    runId: "run-001",
    requirementId: o.requirementId ?? "req-001",
    nodeId: o.nodeId,
    sequence: o.sequence,
    // Round 2 review H3: the store binds generation to the run's
    // feedback-opened generation authority; runs without a verified
    // FEEDBACK_DRIVEN_CHANGE record are in generation 1.
    generation: o.generation !== undefined ? o.generation : 1,
    stablePath: o.stablePath ??
      `library/req-001/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].stablePathSegment}/req-001_${o.nodeId}.md`,
    artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].artifactKind,
    semver: o.semver,
    artifactRef: `loop-artifact:v1:${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[o.nodeId].artifactKind}:sha256:${o.digest}`,
    digest: o.digest,
    producerExecutionId: o.producerExecutionId,
    gateResult: o.gateResult !== undefined ? o.gateResult : isGate ? "PASS" : "NOT_APPLICABLE",
    upstreamRevisionIds: o.upstreamRevisionIds ?? [],
    createdAt: o.createdAt ?? nextTs(),
  };
}

/**
 * Canonical field order of the run-journal hash, replicated locally so
 * tampering can persist rows whose hash matches their content while the
 * content itself violates schema rules (e.g. a traversal-shaped stable
 * path); canonicalizeLoopArtifactRevision would refuse to serialize such
 * records.
 */
const CANONICAL_REVISION_FIELD_ORDER = [
  "schemaVersion", "revisionId", "runId", "requirementId", "nodeId",
  "sequence", "generation", "stablePath", "artifactKind", "semver",
  "artifactRef", "digest", "producerExecutionId", "producerExecutionRole",
  "gateResult", "validity",
  "supersededBy", "upstreamRevisionIds", "createdAt",
] as const;

function hashRevisionWithoutValidation(record: LoopArtifactRevision): string {
  const flat: Record<string, unknown> = {};
  for (const field of CANONICAL_REVISION_FIELD_ORDER) flat[field] = record[field];
  return createHash("sha256").update(JSON.stringify(flat)).digest("hex");
}

/**
 * Overwrite a persisted revision row with tampered content and its recomputed
 * canonical hash, bypassing the write API. The row's stored hash matches its
 * content afterwards, but the content may violate schema rules; only the
 * read-path cross-checks can still reject it.
 */
function tamperRevisionWithRehash(dir: string, originalRevisionId: string, tampered: LoopArtifactRevision): void {
  const db = new Database(join(dir, "journal.db"));
  try {
    // Tampering bypasses the write API and may rekey the row (revision_id is
    // referenced by the pointer table), so foreign key enforcement is
    // disabled on this raw connection — the drift it creates is exactly what
    // the read-path cross-checks must then reject.
    db.pragma("foreign_keys = OFF");
    db.prepare(
      `UPDATE loop_artifact_revisions SET
        revision_id = ?, run_id = ?, requirement_id = ?, node_id = ?, sequence = ?,
        schema_version = ?, generation = ?, stable_path = ?, artifact_kind = ?,
        semver = ?, artifact_ref = ?, digest = ?, producer_execution_id = ?,
        gate_result = ?, validity = ?, superseded_by = ?, created_at = ?,
        canonical_sha256 = ?
      WHERE revision_id = ?`,
    ).run(
      tampered.revisionId, tampered.runId, tampered.requirementId, tampered.nodeId,
      tampered.sequence, tampered.schemaVersion, tampered.generation, tampered.stablePath,
      tampered.artifactKind, tampered.semver, tampered.artifactRef, tampered.digest,
      tampered.producerExecutionId, tampered.gateResult, tampered.validity,
      tampered.supersededBy, tampered.createdAt,
      hashRevisionWithoutValidation(tampered),
      originalRevisionId,
    );
  } finally {
    db.close();
  }
}

/** Assert a tampered revision state fails closed on all three read paths. */
function expectCorruptOnAllReadPaths(store: LoopRunStore, nodeId: NodeCapabilityId, message: string): void {
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"), `${message} (chain read)`);
  expectThrow("STORE_CORRUPT", () => store.getCurrentArtifactRevision("run-001", nodeId),
    `${message} (current read)`);
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"), `${message} (snapshot read)`);
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

function withStore(fn: (store: LoopRunStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
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
    fn(store, dir);
  });
}

const INTAKE_OUT = { version: "1.0.0", digest: dg("c") };
const DESIGN_OUT = { version: "1.0.0", digest: dg("d") };

console.log("artifact revision: schema constants and canonical tokens");
{
  assert(LOOP_ARTIFACT_REVISION_SCHEMA_VERSION === 2, "revision schema version is 2");
  assert(
    LOOP_ARTIFACT_REVISION_VALIDITIES.join(",") === "ACTIVE,STALE,SUPERSEDED",
    "three canonical validity tokens",
  );
  assert(
    LOOP_ARTIFACT_GATE_CAPABILITIES.join(",") === "solution-gate",
    "exactly one Gate capability",
  );
  assert(LOOP_ARTIFACT_REVISION_KINDS.length === 17, "seventeen canonical artifact kinds");
  assert(
    LOOP_ARTIFACT_INDEX_STATUSES.join(",") === "draft,active,stale,replaced",
    "four canonical manifest artifact statuses",
  );
  assert(
    LOOP_ARTIFACT_INDEX_CROSS_BIND_STOP_REASONS.length === 7,
    "seven cross-bind STOP reason codes",
  );
  const mapped = Object.keys(LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES);
  assert(mapped.length === 7, "seven manifest Index rows map to capabilities");
  assert(!("04 交付总结" in LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES), "delivery summary row is not cross-bound");
  assert(!("07 交付总结" in LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES), "delivery tail row is not cross-bound");
  const indexValues = Object.values(LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES);
  assert(indexValues.length === new Set(indexValues).size, "every capability maps to exactly one Index row");
  assert(NODE_CAPABILITY_IDS.every((id) => indexValues.includes(id)),
    "every canonical capability has an Index row");
}

console.log("artifact revision: positive construction across nodes");
{
  const draft = revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  const created = createLoopArtifactRevision(draft);
  assert(created.revisionId === "run-001:revision:solution-design:1", "canonical revision id derived");
  assert(created.validity === "ACTIVE" && created.supersededBy === null, "revisions are born active");
  assert(Object.isFrozen(created) && Object.isFrozen(created.upstreamRevisionIds), "revision is deep-frozen");
  validateLoopArtifactRevision(created);
  assert(true, "non-Gate revision passes validation");
  const gateRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("e"),
    producerExecutionId: "run-001:capability:8:succeeded", gateResult: "PASS_WITH_RISK",
  }));
  validateLoopArtifactRevision(gateRevision);
  assert(gateRevision.gateResult === "PASS_WITH_RISK", "Gate revision carries a conclusive passing result");
  // Model level: generation stays nullable; the STORE binds non-null
  // revisions to the run's feedback-opened generation authority (H3).
  const withGeneration = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", generation: null,
  }));
  assert(withGeneration.generation === null, "generation reference is nullable");
  const withUpstream = createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
      producerExecutionId: "run-001:capability:6:succeeded",
    }),
    upstreamRevisionIds: ["run-001:revision:solution-design:1"],
  });
  validateLoopArtifactRevision(withUpstream);
  assert(true, "revision with an upstream reference passes validation");
  assert(compareLoopArtifactSemver("1.0.0", "1.0.0") === 0, "equal semvers compare equal");
  assert(compareLoopArtifactSemver("1.9.9", "1.10.0") === -1, "semver comparison is numeric, not lexical");
  assert(compareLoopArtifactSemver("2.0.0", "1.99.99") === 1, "major segment dominates");
  expectThrow("INVALID_INPUT", () => compareLoopArtifactSemver("1.0", "1.0.0"), "malformed semver comparison fails closed");
  // A valid two-node chain: the challenge revision consumes the design revision.
  const designRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", createdAt: nextTs(),
  }));
  const challengeRevision = createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
      producerExecutionId: "run-001:capability:6:succeeded", createdAt: nextTs(),
    }),
    upstreamRevisionIds: [designRevision.revisionId],
  });
  validateLoopArtifactRevisionChain(
    [challengeRevision, designRevision].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1)),
    "run-001",
  );
  assert(true, "multi-node revision chain passes validation");
}

console.log("artifact revision: malformed and incoherent drafts fail closed (negative)");
{
  const base = revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  for (const bad of ["1.0", "v1.0.0", "1.0.0.0", "1.0.x"]) {
    expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, semver: bad }),
      `malformed semver rejected (${bad})`);
  }
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, digest: dg("e") }),
    "artifact ref/digest mismatch rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, artifactKind: "task_plan" }),
    "artifact kind drift from the node product kind rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, artifactRef: `loop-artifact:v2:capability_output:sha256:${dg("d")}`,
  }), "non-canonical artifact ref rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, nodeId: "deploy" }),
    "unknown node capability rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, generation: 0 }),
    "non-positive generation rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, sequence: 0 }),
    "non-positive sequence rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, producerExecutionId: "run-002:capability:4:succeeded",
  }), "cross-run producer reference rejected at construction");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, producerExecutionId: "run-001:capability:4:done",
  }), "non-canonical producer execution id rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-001:revision:solution-design:1"],
  }), "self-referencing upstream rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-002:revision:solution-design:1"],
  }), "cross-run upstream reference rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-001:revision:solution-gate:1", "run-001:revision:solution-gate:1"],
  }), "duplicate upstream references rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-001:revision:deploy:1"],
  }), "upstream with unknown node rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: "FAIL",
  }), "Gate node revision with FAIL result rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: null,
  }), "Gate node revision without a Gate result rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: "NOT_APPLICABLE",
  }), "Gate node revision with NOT_APPLICABLE rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, gateResult: "PASS" }),
    "non-Gate node revision with a conclusive Gate result rejected");
  const created = createLoopArtifactRevision(base);
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "STALE", supersededBy: "run-001:revision:solution-design:2" }),
    "STALE revision must not carry supersededBy");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: null }),
    "SUPERSEDED revision requires supersededBy");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-gate:2" }),
    "supersededBy pointing at another node rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-design:1" }),
    "supersededBy pointing backwards rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, revisionId: "run-001:revision:solution-design:9" }),
    "forged revision id rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "OBSOLETE" }),
    "unknown validity token rejected");
}

console.log("artifact revision: stable paths must carry the canonical logical shape");
{
  const base = revisionDraft({
    nodeId: "task-planning", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  // The round-2 escape repro and its structural siblings: each shape names
  // (or prefixes) the canonical segment but is not the canonical logical
  // path, so containment-style guards would admit them.
  const escapePaths = [
    "03-任务规划/../01-技术方案/escape.md",
    "library/req-001/03-任务规划/../01-技术方案/escape.md",
    "/library/req-001/03-任务规划/x.md",
    "library//03-任务规划/x.md",
    "library/req-001/03-任务规划/",
    "library/./req-001/03-任务规划/x.md",
    "library\\req-001\\03-任务规划\\x.md",
    "library/req-002/03-任务规划/x.md",
    "library/req-001/01-技术方案/x.md",
    "specs/req-001/03-任务规划/x.md",
    "library/req-001/03-任务规划",
  ];
  for (const escape of escapePaths) {
    expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, stablePath: escape }),
      `creation rejects a non-canonical stable path (${escape})`);
    const valid = createLoopArtifactRevision(base);
    expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...valid, stablePath: escape }),
      `read-back rejects a non-canonical stable path (${escape})`);
  }
  const created = createLoopArtifactRevision({
    ...base,
    stablePath: "library/req-001/03-任务规划/req-001_task-planning.md",
  });
  validateLoopArtifactRevision(created);
  assert(created.stablePath === "library/req-001/03-任务规划/req-001_task-planning.md",
    "the canonical library/{requirementId}/{segment}/{file} shape passes validation");
}

console.log("artifact revision: adversarial input boundaries fail closed");
{
  const draft = revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision(new Proxy({ ...draft }, {})),
    "Proxy draft rejected");
  const accessorDraft = { ...draft };
  Object.defineProperty(accessorDraft, "sequence", { get: () => 1, enumerable: true });
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision(accessorDraft),
    "accessor property rejected before invocation");
  const symbolDraft = { ...draft } as Record<string | symbol, unknown>;
  symbolDraft[Symbol("stealth")] = "x";
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision(symbolDraft),
    "symbol-keyed field rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...draft, extra: "x" }),
    "unknown extra field rejected");
  const missing = { ...draft } as Record<string, unknown>;
  delete missing["stablePath"];
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision(missing),
    "missing required field rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...draft, schemaVersion: 1 }),
    "draft must not pre-set schema-managed fields");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...draft, upstreamRevisionIds: new Proxy(["run-001:revision:requirement-intake:1"], {}),
  }), "Proxy upstream array rejected");
  const holeArray = new Array(1);
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...draft, upstreamRevisionIds: holeArray }),
    "sparse upstream array rejected");
  const sentinel = "SENTINEL-INPUT-8f2c11";
  try {
    createLoopArtifactRevision({ ...draft, stablePath: `${sentinel}\x00` });
    assert(false, "sentinel input not echoed (no error thrown)");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    assert(!message.includes(sentinel), "error message does not echo input sentinel");
  }
}

console.log("artifact revision: chain rules are fail-closed");
{
  const at = (offset: number) => new Date(Date.parse(TS) + offset * 1000).toISOString();
  const rev = (
    nodeId: NodeCapabilityId, sequence: number, semver: string, createdAt: string,
  ): LoopArtifactRevision => createLoopArtifactRevision(revisionDraft({
    nodeId, sequence, semver, digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", createdAt,
  }));
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain(
    [rev("solution-design", 2, "1.0.0", at(1))], "run-001",
  ), "node chain must start at sequence one");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev("solution-design", 1, "1.0.0", at(1)), rev("solution-design", 1, "1.1.0", at(2)),
  ], "run-001"), "duplicate sequence inside a node chain rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev("solution-design", 1, "1.0.0", at(1)), rev("solution-design", 2, "1.0.0", at(2)),
  ], "run-001"), "semver must strictly increase inside a node chain");
}

console.log("artifact revision: per-node progression and supersede linkage fail closed");
{
  const at = (offset: number) => new Date(Date.parse(TS) + offset * 1000).toISOString();
  const rev = (
    sequence: number, semver: string, createdAt: string, o?: Record<string, unknown>,
  ): LoopArtifactRevision => {
    const draft = revisionDraft({
      nodeId: "solution-design", sequence, semver, digest: dg("d"),
      producerExecutionId: "run-001:capability:4:succeeded", createdAt,
    });
    const created = createLoopArtifactRevision(draft);
    return Object.freeze({ ...created, ...o }) as LoopArtifactRevision;
  };
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.1.0", at(1)), rev(2, "1.0.0", at(2)),
  ], "run-001"), "semver regression inside a node chain rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(2)), rev(2, "1.1.0", at(1)),
  ], "run-001"), "timestamp regression inside a node chain rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(3, "1.1.0", at(2)),
  ], "run-001"), "sequence gap inside a node chain rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-design:3" }),
    rev(2, "1.1.0", at(2)),
  ], "run-001"), "supersededBy must point at the next revision of the node");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-design:2" }),
  ], "run-001"), "superseded chain tip without a successor rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(2, "1.1.0", at(2), { requirementId: "req-002" }),
  ], "run-001"), "mixed Requirement identities rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { runId: "run-002", revisionId: "run-002:revision:solution-design:1" }),
  ], "run-001"), "run identity mismatch rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(1, "1.1.0", at(2), { nodeId: "solution-gate" }),
    rev(1, "1.2.0", at(3)),
  ], "run-001"), "interleaved node groups rejected");
  const dangling = rev(1, "1.0.0", at(1), { nodeId: "solution-gate" });
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    Object.freeze({ ...dangling, upstreamRevisionIds: Object.freeze(["run-001:revision:solution-design:9"]) }) as LoopArtifactRevision,
  ], "run-001"), "dangling upstream reference rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(2, "1.1.0", at(2)),
  ], "run-001"), "a non-terminal revision still ACTIVE rejected");
  validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-design:2" }),
    rev(2, "1.1.0", at(2)),
  ], "run-001");
  assert(true, "superseded history with an active tip passes validation");
  validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "STALE" }),
    rev(2, "1.1.0", at(2)),
  ], "run-001");
  assert(true, "a stale non-terminal revision keeps its validity when the tip advances");
}

console.log("artifact revision: supersede transition is validated as the post-transition state");
{
  const at = (offset: number) => new Date(Date.parse(TS) + offset * 1000).toISOString();
  const first = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", createdAt: at(1),
  }));
  const second = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 2, semver: "1.1.0", digest: dg("e"),
    producerExecutionId: "run-001:capability:9:succeeded", createdAt: at(2),
  }));
  const superseded = supersedeArtifactRevision(first, second.revisionId);
  assert(superseded.validity === "SUPERSEDED" && superseded.supersededBy === second.revisionId,
    "supersede backfills validity and the successor pointer");
  assert(Object.isFrozen(superseded) && Object.isFrozen(superseded.upstreamRevisionIds),
    "superseded record is deep-frozen");
  // The store write path validates exactly this post-transition chain: the
  // previous current already superseded, the new revision the active tip.
  validateLoopArtifactRevisionChain([superseded, second], "run-001");
  assert(true, "post-transition chain passes validation");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([first, second], "run-001"),
    "pre-transition chain (old and new both ACTIVE) is rejected");
  const staleFirst = Object.freeze({ ...first, validity: "STALE" }) as LoopArtifactRevision;
  expectThrow("INVALID_INPUT", () => supersedeArtifactRevision(staleFirst, second.revisionId),
    "stale revision cannot be superseded (no STALE → SUPERSEDED edge)");
  expectThrow("INVALID_INPUT", () => supersedeArtifactRevision(superseded, second.revisionId),
    "superseded revision cannot be superseded again");
  expectThrow("INVALID_INPUT", () => supersedeArtifactRevision(first, "run-001:revision:solution-design:9"),
    "supersede successor must be the next revision of the node");
  expectThrow("INVALID_INPUT", () => supersedeArtifactRevision(new Proxy(first, {}), second.revisionId),
    "Proxy previous revision rejected");
}

console.log("artifact revision: store append binds run, requirement and producer execution");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const appended = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
    stablePath: "library/req-001/00-需求资料/req-001_需求摘要.md",
  })));
  assert(appended.appended === true, "first revision appended");
  const listed = store.listArtifactRevisions("run-001");
  assert(listed.length === 1, "revision chain lists the appended revision");
  const current = store.getCurrentArtifactRevision("run-001", "requirement-intake");
  assert(current !== undefined && current.revisionId === "run-001:revision:requirement-intake:1",
    "current pointer targets the appended revision");
  assert(store.getCurrentArtifactRevision("run-001", "solution-design") === undefined,
    "a node without revisions has no current revision");
  expectThrow("INVALID_INPUT", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 2, semver: "9.9.9", digest: dg("9"),
    producerExecutionId: "run-001:capability:99:succeeded", requirementId: "req-002",
  }))), "revision requirement mismatch rejected");
  expectThrow("INVALID_INPUT", () => store.getCurrentArtifactRevision("run-001", "deploy"),
    "current read with an unknown node rejected");
});
withStore((store) => {
  expectThrow("RUN_NOT_FOUND", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "revision for a missing run rejected");
  assert(store.listArtifactRevisions("run-404").length === 0, "unknown run lists no revisions");
  assert(store.getCurrentArtifactRevision("run-404", "solution-design") === undefined,
    "unknown run has no current revision");
});

console.log("artifact revision: producer execution binding rejects any drift");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intakeSeed = driver.succeed("requirement-intake", INTAKE_OUT);
  seedProducerRevision(store, intakeSeed);
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const bind = (o: Partial<RevisionDraftOptions>) => () => store.appendArtifactRevision(
    createLoopArtifactRevision(revisionDraft({
      nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
      producerExecutionId: design.executionEventId, ...o,
    })),
  );
  expectThrow("ILLEGAL_TRANSITION", bind({ nodeId: "solution-gate" }),
    "revision node mismatching the producer capability rejected");
  expectThrow("ILLEGAL_TRANSITION", bind({ digest: dg("e") }),
    "revision ref/digest drift from the producer output rejected");
  expectThrow("ILLEGAL_TRANSITION", bind({ semver: "1.0.1" }),
    "revision version drift from the producer output rejected");
  expectThrow("ILLEGAL_TRANSITION", bind({ producerExecutionId: "run-001:capability:99:succeeded" }),
    "nonexistent producer execution rejected");
});
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const failed = driver.fail("requirement-intake");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: "1.0.0", digest: dg("c"),
    producerExecutionId: failed.executionEventId,
  }))), "revision bound to a failed producer execution rejected");
  const startedId = failed.executionEventId.replace(/failed$/, "started");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: "1.0.0", digest: dg("c"),
    producerExecutionId: startedId,
  }))), "revision bound to a non-terminal producer execution rejected");
});
withRunningStore((store) => {
  // Gate FAIL: the execution succeeded with a FAIL Gate result; any revision
  // claiming a passing Gate for it must be rejected.
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  seedProducerRevision(store, driver.succeed("solution-design", DESIGN_OUT));
  const review = driver.succeed("solution-gate", { version: "1.0.0", digest: dg("f") }, "FAIL");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS",
  }))), "revision claiming PASS for a FAIL Gate execution rejected");
});
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  seedProducerRevision(store, driver.succeed("solution-design", DESIGN_OUT));
  const review = driver.succeed("solution-gate", { version: "1.0.0", digest: dg("f") }, "PASS_WITH_RISK");
  const appended = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS_WITH_RISK",
    stablePath: "library/req-001/02-方案审核/req-001_方案审核.md",
  })));
  assert(appended.appended === true && appended.record.gateResult === "PASS_WITH_RISK",
    "Gate revision bound to a PASS_WITH_RISK execution appended");
});

console.log("artifact revision: exact replay is idempotent, conflicts fail closed");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const record = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }));
  const first = store.appendArtifactRevision(record);
  const replay = store.appendArtifactRevision(record);
  assert(first.appended === true && replay.appended === false, "exact replay does not duplicate the revision");
  assert(store.listArtifactRevisions("run-001").length === 1, "replay leaves a single persisted revision");
  const sameIdDifferent = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId, stablePath: "library/req-001/00-需求资料/other.md",
  }));
  expectThrow("EVENT_ID_CONFLICT", () => store.appendArtifactRevision(sameIdDifferent),
    "same revision id with different content rejected");
});

console.log("artifact revision: concurrent writers use CAS/conflict semantics");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  const storeB = new LoopRunStore(path);
  storeA.init();
  storeB.init();
  try {
    storeA.createRun(makeIdentity());
    storeA.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driverA = makeCapabilityDriver(storeA, "run-001");
    const intake = driverA.succeed("requirement-intake", INTAKE_OUT);
    const winner = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
      producerExecutionId: intake.executionEventId,
    }));
    assert(storeA.appendArtifactRevision(winner).appended === true, "first writer wins the revision slot");
    assert(storeB.appendArtifactRevision(winner).appended === false,
      "concurrent identical candidate replays idempotently");
    const loser = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
      producerExecutionId: intake.executionEventId, stablePath: "library/req-001/00-需求资料/loser.md",
    }));
    expectThrow("EVENT_ID_CONFLICT", () => storeB.appendArtifactRevision(loser),
      "concurrent different content on the same revision id conflicts");
    assert(storeB.listArtifactRevisions("run-001").length === 1, "conflict leaves exactly one revision");
    const current = storeB.getCurrentArtifactRevision("run-001", "requirement-intake");
    assert(current !== undefined && current.revisionId === winner.revisionId,
      "second connection observes the winner as current");
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("artifact revision: same-node advance requires WP4-era execution evidence");
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  const design = driver.succeed("solution-design", { version: "1.0.0", digest: dg("9") });
  const first = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("9"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }));
  assert(store.appendArtifactRevision(first).appended === true, "first revision appended");
  const probe = new Database(join(dir, "journal.db"), { readonly: true });
  const pointerRow = probe.prepare(
    "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
  ).get("run-001", "solution-design") as { revision_id: string };
  probe.close();
  assert(pointerRow.revision_id === first.revisionId, "persisted pointer row targets the revision");
  const replay = store.appendArtifactRevision(first);
  assert(replay.appended === false, "replay of the still-active revision stays idempotent");
  // A second revision of the same node must bind a new succeeded execution of
  // that capability. The C01 chain admits exactly one, so a candidate bound
  // to the existing producer either claims an output the producer never
  // produced or carries the producer's exact output triple — which pins its
  // semver to the current revision and cannot advance. The real path is the
  // WP4 re-execution chain extension.
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 2, semver: "1.1.0", digest: dg("d"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }))), "revision claiming an output the producer never produced rejected");
  expectThrow("EVENT_SEQUENCE_CONFLICT", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 2, semver: "1.0.0", digest: dg("9"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }))), "producer-pinned candidate semver is already occupied by the current revision");
  const chain = store.listArtifactRevisions("run-001");
  assert(chain.length === 2 && chain.every((item) => item.validity === "ACTIVE"), "rejected advances leave the chain untouched");
  const current = store.getCurrentArtifactRevision("run-001", "solution-design");
  assert(current !== undefined && current.revisionId === first.revisionId && current.validity === "ACTIVE",
    "current pointer still targets the first revision");
});

// Supersede-success, stale-pointer advance and superseded-upstream scenarios
// require a readable journal with two revisions of one node. Post round-1
// review every revision is re-verified against its producer execution on
// every read, and the C01 capability chain admits one succeeded execution
// per capability per run — so such states cannot exist until C02-WP4 extends
// the chain with re-execution authority. The validity-machine rules involved
// (supersede backfill, non-terminal ACTIVE rejection, STALE preservation) are
// covered at the chain-validator level above; non-current/non-active upstream
// rejection remains covered below by the nonexistent and STALE variants.

console.log("artifact revision: upstream consumption is fail-closed");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const intakeRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId, stablePath: "library/req-001/00-需求资料/req-001_需求摘要.md",
  }))).record;
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const withUpstream = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
    upstreamRevisionIds: [intakeRevision.revisionId],
  })));
  assert(withUpstream.appended === true, "revision consuming the current upstream appended");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 9, semver: "9.9.9", digest: dg("8"),
    producerExecutionId: design.executionEventId,
    upstreamRevisionIds: ["run-001:revision:requirement-intake:9"],
  }))), "nonexistent upstream revision rejected");
});
withRunningStore((store) => {
  // Stale upstream: the pointer still targets the STALE revision, but a STALE
  // revision can never be consumed as an upstream.
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const designRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  store.markArtifactRevisionStale("run-001", designRevision.revisionId);
  const challenge = driver.succeed("solution-gate", { version: "1.0.0", digest: dg("e") });
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("e"),
    producerExecutionId: challenge.executionEventId,
    upstreamRevisionIds: [designRevision.revisionId],
  }))), "stale upstream revision rejected even while still the pointer target");
});

console.log("artifact revision: STALE primitive and the fixed validity machine");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const marked = store.markArtifactRevisionStale("run-001", revision.revisionId);
  assert(marked.marked === true && marked.record.validity === "STALE", "active revision marked stale");
  const remarque = store.markArtifactRevisionStale("run-001", revision.revisionId);
  assert(remarque.marked === false && remarque.record.validity === "STALE",
    "re-marking a stale revision is an idempotent no-op");
  const chain = store.listArtifactRevisions("run-001");
  assert(chain.length === 1 && chain[0]!.validity === "STALE", "stale revision remains auditable in the chain");
  expectThrow("STORE_CORRUPT", () => store.getCurrentArtifactRevision("run-001", "requirement-intake"),
    "current read fails closed while the pointer targets a non-active revision");
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:solution-design:1"),
    "marking a nonexistent revision rejected");
  expectThrow("INVALID_INPUT", () => store.markArtifactRevisionStale("run-001\x05", revision.revisionId),
    "mark input validated fail-closed");
});

console.log("artifact revision: run state guards");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "revision rejected while a delivery stage is active");
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:solution-design:1"),
    "stale marking rejected while a delivery stage is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const driver = makeCapabilityDriver(store, "run-001");
  driver.start("requirement-intake");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: "1.0.0", digest: dg("c"),
    producerExecutionId: "run-001:capability:1:succeeded",
  }))), "revision rejected while a capability execution is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_failed", errorCode: "X" }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "terminal run must not accept revisions");
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:solution-design:1"),
    "terminal run must not accept stale markings");
});

console.log("artifact revision: corruption is detected through normal reads");
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_artifact_revisions SET canonical_sha256 = ? WHERE revision_id = ?")
      .run("0".repeat(64), revision.revisionId);
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "tampered revision hash raises STORE_CORRUPT");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "tampered revision hash detected through snapshot reads");
});
withRunningStore((store, dir) => {
  // A tampered row whose requirementId was rebound to another requirement —
  // with a freshly recomputed canonical hash — must still fail closed,
  // because reads cross-bind each revision to the verified run identity.
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const tampered = Object.freeze({ ...revision, requirementId: "req-002" }) as LoopArtifactRevision;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_artifact_revisions SET requirement_id = ?, canonical_sha256 = ? WHERE revision_id = ?")
      .run("req-002", hashRevisionWithoutValidation(tampered), revision.revisionId);
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "rehashed mis-bound revision raises STORE_CORRUPT on chain read");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "rehashed mis-bound revision detected through snapshot reads");
  expectThrow("STORE_CORRUPT", () => store.getCurrentArtifactRevision("run-001", "requirement-intake"),
    "rehashed mis-bound revision detected through current reads");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  })));
  const db = new Database(join(dir, "journal.db"));
  try {
    // Tampering bypasses the write API: foreign key enforcement is disabled
    // on this raw connection so the drifted pointer actually persists.
    db.pragma("foreign_keys = OFF");
    db.prepare("UPDATE loop_artifact_current SET revision_id = ? WHERE run_id = ? AND node_id = ?")
      .run("run-001:revision:requirement-intake:9", "run-001", "requirement-intake");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "pointer drift raises STORE_CORRUPT on chain read");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "pointer drift detected through snapshot reads");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const intakeRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId, stablePath: "library/req-001/00-需求资料/req-001_需求摘要.md",
  }))).record;
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const designRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
    upstreamRevisionIds: [intakeRevision.revisionId],
  }))).record;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("DELETE FROM loop_artifact_revision_upstreams WHERE revision_id = ? AND upstream_index = 0")
      .run(designRevision.revisionId);
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "upstream child-row gap raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  })));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("DELETE FROM loop_artifact_current WHERE run_id = ? AND node_id = ?")
      .run("run-001", "requirement-intake");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "a revision chain without its current pointer raises STORE_CORRUPT");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  })));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.pragma("foreign_keys = OFF");
    db.prepare(
      `INSERT INTO loop_artifact_revisions (
        revision_id, run_id, requirement_id, node_id, sequence, schema_version,
        generation, stable_path, artifact_kind, semver, artifact_ref, digest,
        producer_execution_id, producer_execution_role, gate_result, validity,
        superseded_by, created_at, canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "run-001:revision:solution-design:1", "run-001", "req-001", "solution-design", 1, 2,
      null, "01-技术方案/forged.md", "capability_output", "1.0.0",
      `loop-artifact:v1:capability_output:sha256:${dg("7")}`, dg("7"),
      "run-001:capability:99:succeeded", "formal_verdict", "NOT_APPLICABLE", "ACTIVE", null,
      nextTs(), "0".repeat(64),
    );
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "directly forged persisted revision raises STORE_CORRUPT");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "forged revision detected through snapshot reads");
});

console.log("artifact revision: producer binding drift with a recomputed hash is corrupt on every read path");
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision, producerExecutionId: "run-001:capability:99:succeeded",
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "requirement-intake",
    "rehashed revision bound to a nonexistent producer execution rejected");
});
withRunningStore((store, dir) => {
  // A retryable failure followed by a retry gives the run a failed execution
  // and a succeeded execution of the same capability; rebinding the revision
  // to the failed one must fail closed even with a recomputed hash.
  const driver = makeCapabilityDriver(store, "run-001");
  const failed = driver.fail("requirement-intake");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  assert(intake.attempt === 2, "retry succeeds as attempt two");
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision, producerExecutionId: failed.executionEventId,
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "requirement-intake",
    "rehashed revision rebound to a failed producer execution rejected");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision,
    artifactRef: `loop-artifact:v1:requirement_summary:sha256:${dg("7")}`,
    digest: dg("7"),
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "requirement-intake",
    "rehashed revision with a drifted output ref/digest rejected");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }))).record;
  const tampered = Object.freeze({ ...revision, semver: "1.0.1" }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "requirement-intake",
    "rehashed revision with a drifted output version rejected");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  seedProducerRevision(store, driver.succeed("solution-design", DESIGN_OUT));
  const review = driver.succeed("solution-gate", { version: "1.0.0", digest: dg("f") }, "PASS");
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS",
  }))).record;
  const tampered = Object.freeze({ ...revision, gateResult: "PASS_WITH_RISK" }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "solution-gate",
    "rehashed revision with a drifted Gate result rejected");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision,
    stablePath: "library/req-001/01-技术方案/../02-方案审核/escape.md",
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "solution-design",
    "rehashed traversal-shaped stable path rejected on every read path");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision,
    stablePath: "library/req-002/01-技术方案/req-002_solution-design.md",
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "solution-design",
    "rehashed foreign-requirement stable path rejected on every read path");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  seedProducerRevision(store, driver.succeed("requirement-intake", INTAKE_OUT));
  const design = driver.succeed("solution-design", DESIGN_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  // Rebinding must also carry the target node's product kind/path so the
  // tampered row is internally consistent; only the producer-binding and
  // node cross-checks on the read path can reject it.
  const tampered = Object.freeze({
    ...revision,
    revisionId: "run-001:revision:task-planning:1",
    nodeId: "task-planning",
    artifactKind: "task_plan",
    stablePath: "library/req-001/03-任务规划/req-001_task-planning.md",
    artifactRef: `loop-artifact:v1:task_plan:sha256:${revision.digest}`,
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "solution-design",
    "rehashed revision rebound to another node rejected");
});

console.log("artifact revision: another entry reads the same revision authority");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  storeA.init();
  storeA.createRun(makeIdentity());
  storeA.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const driver = makeCapabilityDriver(storeA, "run-001");
  const intake = driver.succeed("requirement-intake", INTAKE_OUT);
  const record = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId,
  }));
  storeA.appendArtifactRevision(record);
  storeA.close();

  const storeB = new LoopRunStore(path);
  storeB.init();
  try {
    const chain = storeB.listArtifactRevisions("run-001");
    assert(chain.length === 1, "second entry reads the revision chain");
    assert(
      canonicalizeLoopArtifactRevision(chain[0]!) === canonicalizeLoopArtifactRevision(record),
      "read-back revision is byte-identical across entries",
    );
    const current = storeB.getCurrentArtifactRevision("run-001", "requirement-intake");
    assert(current !== undefined && current.revisionId === record.revisionId,
      "second entry resolves the same current revision");
  } finally {
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("artifact revision: manifest Artifact Index cross-binding");
{
  const designRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
    stablePath: "library/req-001/01-技术方案/req-001_技术方案.md",
  }));
  const row = (o?: Record<string, unknown>) => Object.freeze({
    node: "01 技术方案",
    stablePath: "library/req-001/01-技术方案/req-001_技术方案.md",
    version: "1.0.0",
    status: "active",
    result: "",
    ...o,
  });
  const ok = crossBindArtifactIndexRow(row(), designRevision);
  assert(ok.status === "OK", "consistent Index row binds to the current revision");
  const draftRow = crossBindArtifactIndexRow(row({ status: "draft" }), designRevision);
  assert(draftRow.status === "OK", "current revision maps to draft or active manifest status");
  const stop = (result: ReturnType<typeof crossBindArtifactIndexRow>) =>
    result.status === "STOP" ? result.reasonCode : "NO_STOP";
  assert(stop(crossBindArtifactIndexRow(row({ node: "04 交付总结" }), null)) === "NODE_NOT_MAPPED",
    "delivery summary row is outside the cross-binding scope");
  assert(stop(crossBindArtifactIndexRow(row(), null)) === "CURRENT_REVISION_MISSING",
    "missing current revision is a STOP diagnosis");
  const intakeRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: "1.0.0", digest: dg("c"),
    producerExecutionId: "run-001:capability:2:succeeded",
  }));
  assert(stop(crossBindArtifactIndexRow(row(), intakeRevision)) === "NODE_MISMATCH",
    "revision of another node is a STOP diagnosis");
  assert(stop(crossBindArtifactIndexRow(row({ stablePath: "library/req-001/01-技术方案/other.md" }), designRevision)) === "STABLE_PATH_DRIFT",
    "stable path drift is a STOP diagnosis");
  assert(stop(crossBindArtifactIndexRow(
    row({ stablePath: "library/req-001/03-任务规划/../01-技术方案/escape.md" }),
    designRevision,
  )) === "STABLE_PATH_DRIFT", "a traversal-shaped manifest stable path cannot bind");
  expectThrow("INVALID_INPUT", () => crossBindArtifactIndexRow(
    row(),
    Object.freeze({
      ...designRevision,
      stablePath: "library/req-001/01-技术方案/../02-方案审核/escape.md",
    }) as LoopArtifactRevision,
  ), "cross-binding fails closed when the journal current carries an escape path");
  assert(stop(crossBindArtifactIndexRow(row({ version: "1.0.1" }), designRevision)) === "VERSION_DRIFT",
    "version drift is a STOP diagnosis");
  assert(stop(crossBindArtifactIndexRow(row({ status: "stale" }), designRevision)) === "STATUS_DRIFT",
    "status drift against an active revision is a STOP diagnosis");
  const staleRevision = Object.freeze({ ...designRevision, validity: "STALE" }) as LoopArtifactRevision;
  assert(crossBindArtifactIndexRow(row({ status: "stale" }), staleRevision).status === "OK",
    "stale runtime validity maps to the stale manifest status");
  assert(stop(crossBindArtifactIndexRow(row({ status: "active" }), staleRevision)) === "STATUS_DRIFT",
    "stale revision against an active manifest status is a STOP diagnosis");
  const reviewRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-gate", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: "run-001:capability:8:succeeded", gateResult: "PASS",
    stablePath: "library/req-001/02-方案审核/req-001_方案审核.md",
  }));
  const gateRow = (o?: Record<string, unknown>) => Object.freeze({
    node: "02 方案审核",
    stablePath: "library/req-001/02-方案审核/req-001_方案审核.md",
    version: "1.0.0",
    status: "active",
    result: "PASS",
    ...o,
  });
  assert(crossBindArtifactIndexRow(gateRow(), reviewRevision).status === "OK",
    "Gate row binds when the result equals the journal Gate result");
  assert(stop(crossBindArtifactIndexRow(gateRow({ result: "FAIL" }), reviewRevision)) === "RESULT_DRIFT",
    "Gate result drift is a STOP diagnosis");
  assert(stop(crossBindArtifactIndexRow(gateRow({ result: "" }), reviewRevision)) === "RESULT_DRIFT",
    "missing Gate result is a STOP diagnosis");
  expectThrow("INVALID_INPUT", () => crossBindArtifactIndexRow(row({ status: "passed" }), designRevision),
    "non-canonical manifest status rejected as input");
  expectThrow("INVALID_INPUT", () => crossBindArtifactIndexRow({ ...row(), extra: "x" }, designRevision),
    "malformed Index row rejected as input");
  expectThrow("INVALID_INPUT", () => crossBindArtifactIndexRow(new Proxy(row(), {}), designRevision),
    "Proxy Index row rejected");
}

console.log("artifact revision: closed store behavior");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  store.close();
  expectThrow("STORE_CLOSED", () => store.listArtifactRevisions("run-001"), "closed store raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.getCurrentArtifactRevision("run-001", "solution-design"),
    "closed store current read raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.markArtifactRevisionStale("run-001", "run-001:revision:solution-design:1"),
    "closed store stale marking raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "closed store append raises STORE_CLOSED");
  rmSync(dir, { recursive: true, force: true });
}

console.log("artifact revision: pre-v6 journals are rejected as unsupported history");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  // A journal marked v4 is known history: init must refuse it outright.
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
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  const raw = new Database(path);
  raw.exec("DROP TABLE loop_artifact_revision_upstreams");
  raw.exec("DROP TABLE loop_artifact_current");
  raw.exec("DROP TABLE loop_artifact_revisions");
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "v4 marker with missing revision table is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  // Schema drift on the two-foreign-key pointer table fails closed.
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.close();
  const raw = new Database(path);
  raw.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE loop_artifact_current;
    CREATE TABLE loop_artifact_current (
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (run_id, node_id),
      FOREIGN KEY (node_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE,
      FOREIGN KEY (revision_id)
        REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
    );
  `);
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "pointer table foreign key column drift is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("artifact revision: identity rewrite committed before the read starts fails closed");
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const producer = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake",
    sequence: 1,
    semver: INTAKE_OUT.version,
    digest: INTAKE_OUT.digest,
    producerExecutionId: producer.executionEventId,
  }));
  store.appendArtifactRevision(revision);
  // Pre-transaction tamper barrier: the second connection rewrites the run's
  // requirement_id AND rehashes the revision to match, and COMMITS before the
  // read starts. Snapshot verification then observes the tampered identity
  // and fails closed. (The mid-transaction window is covered by the
  // deterministic barrier tests below; this case alone cannot distinguish a
  // single-transaction read from the former two-transaction read.)
  const raw = new Database(join(dir, "journal.db"));
  raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
  raw.close();
  tamperRevisionWithRehash(dir, revision.revisionId, Object.freeze({ ...revision, requirementId: "req-tampered" }));
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "listArtifactRevisions fails closed on a pre-transaction identity rewrite");
  expectThrow("STORE_CORRUPT", () => store.getCurrentArtifactRevision("run-001", "requirement-intake"),
    "getCurrentArtifactRevision fails closed on a pre-transaction identity rewrite");
});

/**
 * Deterministic mid-transaction barrier for read-path TOCTOU regression
 * tests (Round 8, comment precision per Round 9 L1). Fires `onBarrier` when
 * the store's own connection first prepares a statement matching
 * `detailSqlMarker`. Precise position: snapshot verification itself validates
 * the revision chain through the internal reader, so the first match fires
 * INSIDE verification's chain-validation read — but always after the
 * transaction's first read (the `loop_runs` identity row), which is what pins
 * the WAL snapshot. The barrier callback commits a tamper through a SECOND
 * connection while the read transaction is still open; the tamper is
 * therefore invisible to the rest of the transaction, including the detail
 * read that produces the returned rows. A two-transaction implementation
 * would instead observe and return the spliced tampered rows, failing these
 * tests.
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

console.log("artifact revision: mid-transaction identity rewrite keeps the read's own consistent snapshot");
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const producer = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake",
    sequence: 1,
    semver: INTAKE_OUT.version,
    digest: INTAKE_OUT.digest,
    producerExecutionId: producer.executionEventId,
  }));
  store.appendArtifactRevision(revision);
  // Barrier fires at the first revision-table statement of this read (inside
  // snapshot verification's chain-validation read, after the transaction's
  // snapshot is pinned). The second connection then commits an identity
  // rewrite + rehashed revision while the read transaction is still open; the
  // returned rows are read afterwards from the same pinned snapshot.
  const tamper = () => {
    const raw = new Database(join(dir, "journal.db"));
    raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
    raw.close();
    tamperRevisionWithRehash(dir, revision.revisionId, Object.freeze({ ...revision, requirementId: "req-tampered" }));
  };
  const listed = withDetailReadBarrier(store, "FROM loop_artifact_revisions", tamper,
    () => store.listArtifactRevisions("run-001"));
  assert(listed.fired, "barrier fired inside the read transaction");
  assert(
    listed.result.length === 1 &&
      listed.result[0]!.revisionId === revision.revisionId &&
      listed.result[0]!.requirementId === "req-001",
    "listArtifactRevisions returns its own consistent pre-tamper snapshot, not the mid-transaction tamper",
  );
  expectThrow("STORE_CORRUPT", () => store.listArtifactRevisions("run-001"),
    "the committed tamper fails closed on the next read");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  const producer = driver.succeed("requirement-intake", INTAKE_OUT);
  const revision = createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake",
    sequence: 1,
    semver: INTAKE_OUT.version,
    digest: INTAKE_OUT.digest,
    producerExecutionId: producer.executionEventId,
  }));
  store.appendArtifactRevision(revision);
  const tamper = () => {
    const raw = new Database(join(dir, "journal.db"));
    raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
    raw.close();
    tamperRevisionWithRehash(dir, revision.revisionId, Object.freeze({ ...revision, requirementId: "req-tampered" }));
  };
  const current = withDetailReadBarrier(store, "FROM loop_artifact_revisions", tamper,
    () => store.getCurrentArtifactRevision("run-001", "requirement-intake"));
  assert(current.fired, "barrier fired inside the read transaction");
  assert(
    current.result !== undefined &&
      current.result.revisionId === revision.revisionId &&
      current.result.requirementId === "req-001",
    "getCurrentArtifactRevision returns the pre-tamper current revision from its own transaction snapshot",
  );
  expectThrow("STORE_CORRUPT", () => store.getCurrentArtifactRevision("run-001", "requirement-intake"),
    "the committed tamper fails closed on the next current read");
});

console.log("artifact revision: blob binding verifies the physical blob (bound artifact store)");
{
  // The store rejects a non-LoopArtifactStore binding fail-closed.
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-blob-"));
  expectThrow("INVALID_INPUT", () => new LoopRunStore(join(dir, "journal.db"), {
    artifactStore: {} as unknown as LoopArtifactStore,
  }), "bogus artifactStore binding rejected");
  rmSync(dir, { recursive: true, force: true });
}

/** Bound-store fixture: run journal + real artifact store in one temp dir. */
function withBoundStore(
  fn: (store: LoopRunStore, artifactStore: LoopArtifactStore, dir: string) => void,
): void {
  // realpath: the artifact store resolves its control root, so blob paths
  // derived by the test must be computed from the resolved directory.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loop-artifact-rev-blob-")));
  const repositoryPath = join(dir, "repo");
  mkdirSync(repositoryPath, { recursive: true });
  const controlRoot = join(dir, "control");
  const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath });
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

function sha256Hex(input: string): string {
  let h1 = 0x12345678, h2 = 0x9abcdef0;
  for (let i = 0; i < input.length; i += 1) {
    h1 = (h1 * 31 + input.charCodeAt(i)) >>> 0;
    h2 = (h2 * 17 + input.charCodeAt(i)) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4).slice(0, 64);
}


function blobPath(dir: string, kind: string, digest: string): string {
  return join(dir, "control", "artifacts", "v1", kind, digest.slice(0, 2), `${digest}.blob`);
}

{
  // 从未存在：a revision whose blob was never written must not become the
  // node's ACTIVE current, even when the producer journal binding matches.
  withBoundStore((store, _artifactStore, _dir) => {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const producer = driver.succeed("requirement-intake", INTAKE_OUT);
    const revision = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version,
      digest: INTAKE_OUT.digest, producerExecutionId: producer.executionEventId,
    }));
    expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(revision),
      "revision with a never-written blob is rejected");
    assert(store.getCurrentArtifactRevision("run-001", "requirement-intake") === undefined,
      "rejected revision leaves no current pointer");
    assert(store.listArtifactRevisions("run-001").length === 0, "rejected revision is not persisted");
  });
}
{
  // 写后丢失：the append succeeds with the blob present; deleting the blob
  // afterwards fails every read path closed.
  withBoundStore((store, artifactStore, dir) => {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const stored = artifactStore.put("requirement_summary", "requirement-intake output v1");
    const producer = driver.succeed("requirement-intake", { version: "1.0.0", digest: stored.digest });
    const revision = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: "1.0.0",
      digest: stored.digest, producerExecutionId: producer.executionEventId,
    }));
    assert(store.appendArtifactRevision(revision).appended === true,
      "revision with an existing blob appended");
    assert(store.getCurrentArtifactRevision("run-001", "requirement-intake")?.revisionId === revision.revisionId,
      "current read resolves while the blob exists");
    unlinkSync(blobPath(dir, "requirement_summary", stored.digest));
    expectCorruptOnAllReadPaths(store, "requirement-intake", "blob deleted after append fails closed");
    expectThrow("STORE_CORRUPT", () => store.markArtifactRevisionStale("run-001", revision.revisionId),
      "stale marking after blob loss fails closed");
  });
}
{
  // 内容漂移：overwriting the blob with different bytes fails every read
  // path closed, and a fresh append referencing a corrupted blob is rejected.
  withBoundStore((store, artifactStore, dir) => {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const stored = artifactStore.put("technical_design", "solution-design output v1");
    // The revision will reference the requirement_summary kind directory;
    // seed a tampered blob there (the directory may not exist yet).
    mkdirSync(join(dir, "control", "artifacts", "v1", "requirement_summary", stored.digest.slice(0, 2)),
      { recursive: true });
    writeFileSync(blobPath(dir, "requirement_summary", stored.digest), "tampered bytes");
    const producer = driver.succeed("requirement-intake", { version: "1.0.0", digest: stored.digest });
    const revision = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: "1.0.0",
      digest: stored.digest, producerExecutionId: producer.executionEventId,
    }));
    expectThrow("STORE_CORRUPT", () => store.appendArtifactRevision(revision),
      "append referencing a corrupted blob fails closed");
  });
}
{
  // Bound store, intact blobs: the full write + read flow stays healthy.
  withBoundStore((store, artifactStore, _dir) => {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const driver = makeCapabilityDriver(store, "run-001");
    const storedIntake = artifactStore.put("requirement_summary", "requirement-intake output v1");
    const intakeProducer = driver.succeed("requirement-intake", { version: "1.0.0", digest: storedIntake.digest });
    const intakeRevision = createLoopArtifactRevision(revisionDraft({
      nodeId: "requirement-intake", sequence: 1, semver: "1.0.0",
      digest: storedIntake.digest, producerExecutionId: intakeProducer.executionEventId,
    }));
    store.appendArtifactRevision(intakeRevision);
    const storedDesign = artifactStore.put("technical_design", "solution-design output v1");
    const designProducer = driver.succeed("solution-design", { version: "1.0.0", digest: storedDesign.digest });
    const designRevision = createLoopArtifactRevision(revisionDraft({
      nodeId: "solution-design", sequence: 1, semver: "1.0.0",
      digest: storedDesign.digest, producerExecutionId: designProducer.executionEventId,
      upstreamRevisionIds: [intakeRevision.revisionId],
    }));
    assert(store.appendArtifactRevision(designRevision).appended === true,
      "downstream revision with existing blobs appended");
    assert(store.listArtifactRevisions("run-001").length === 2, "bound read path lists both revisions");
    assert(store.getCurrentArtifactRevision("run-001", "solution-design")?.revisionId === designRevision.revisionId,
      "bound current read resolves the downstream revision");
  });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
