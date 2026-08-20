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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
} from "../core/loop-artifact-revision";
import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { LoopRunStore } from "../core/loop-run-store";
import { runtimeExecutionPointForCapability } from "../core/runtime-capability-map";
import type { NodeCapabilityId } from "../loop/types";

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
  const attempts = new Map<NodeCapabilityId, number>();
  /** Begin the next attempt of a capability (retry after a retryable failure). */
  function nextAttempt(capability: NodeCapabilityId): number {
    const attempt = (attempts.get(capability) ?? 0) + 1;
    attempts.set(capability, attempt);
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
    return Object.freeze({
      schemaVersion: 1,
      executionEventId: `${runId}:capability:${sequence}:${status}`,
      runId,
      sequence,
      capability,
      nodeId: runtimeExecutionPointForCapability(capability),
      attempt: 1,
      status,
      createdAt: nextTs(),
      bindingId: `binding-codex-${capability}`,
      bindingVersion: "1.0.0",
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
      const started = event(capability, "started", { attempt: nextAttempt(capability) });
      store.appendCapabilityExecution(started);
      return started;
    },
    /** Append started + failed(retryable) and return the failed event. */
    fail(capability: NodeCapabilityId): LoopCapabilityExecutionEvent {
      const attempt = nextAttempt(capability);
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
      const attempt = nextAttempt(capability);
      const started = event(capability, "started", { attempt });
      store.appendCapabilityExecution(started);
      const outputRef = `loop-artifact:v1:capability_output:sha256:${output.digest}`;
      const succeeded = event(capability, "succeeded", {
        attempt,
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
};

function revisionDraft(o: RevisionDraftOptions): LoopArtifactRevisionDraft {
  const isGate = (LOOP_ARTIFACT_GATE_CAPABILITIES as readonly string[]).includes(o.nodeId);
  return {
    runId: "run-001",
    requirementId: o.requirementId ?? "req-001",
    nodeId: o.nodeId,
    sequence: o.sequence,
    generation: null,
    stablePath: o.stablePath ?? "01-技术方案/req-001_技术方案.md",
    artifactKind: "capability_output",
    semver: o.semver,
    artifactRef: `loop-artifact:v1:capability_output:sha256:${o.digest}`,
    digest: o.digest,
    producerExecutionId: o.producerExecutionId,
    gateResult: o.gateResult !== undefined ? o.gateResult : isGate ? "PASS" : "NOT_APPLICABLE",
    upstreamRevisionIds: o.upstreamRevisionIds ?? [],
    createdAt: o.createdAt ?? nextTs(),
  };
}

/**
 * Overwrite a persisted revision row with tampered content and its recomputed
 * canonical hash, bypassing the write API. The row is internally consistent
 * afterwards, so only the read-path cross-checks can still reject it.
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
      createHash("sha256").update(canonicalizeLoopArtifactRevision(tampered)).digest("hex"),
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
  assert(LOOP_ARTIFACT_REVISION_SCHEMA_VERSION === 1, "revision schema version is 1");
  assert(
    LOOP_ARTIFACT_REVISION_VALIDITIES.join(",") === "ACTIVE,STALE,SUPERSEDED",
    "three canonical validity tokens",
  );
  assert(
    LOOP_ARTIFACT_GATE_CAPABILITIES.join(",") === "solution-review,test-validation",
    "exactly two Gate capabilities",
  );
  assert(LOOP_ARTIFACT_REVISION_KINDS.length === 14, "fourteen canonical artifact kinds");
  assert(
    LOOP_ARTIFACT_INDEX_STATUSES.join(",") === "draft,active,stale,replaced",
    "four canonical manifest artifact statuses",
  );
  assert(
    LOOP_ARTIFACT_INDEX_CROSS_BIND_STOP_REASONS.length === 7,
    "seven cross-bind STOP reason codes",
  );
  const mapped = Object.keys(LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES);
  assert(mapped.length === 6, "six manifest Index rows map to capabilities");
  assert(!("04 交付总结" in LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES), "delivery summary row is not cross-bound");
  assert(!("solution-challenge" in Object.values(LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES)),
    "solution-challenge has no Index row, which is normal");
}

console.log("artifact revision: positive construction across nodes");
{
  const draft = revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  const created = createLoopArtifactRevision(draft);
  assert(created.revisionId === "run-001:revision:tech-design:1", "canonical revision id derived");
  assert(created.validity === "ACTIVE" && created.supersededBy === null, "revisions are born active");
  assert(Object.isFrozen(created) && Object.isFrozen(created.upstreamRevisionIds), "revision is deep-frozen");
  validateLoopArtifactRevision(created);
  assert(true, "non-Gate revision passes validation");
  const gateRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("e"),
    producerExecutionId: "run-001:capability:8:succeeded", gateResult: "PASS_WITH_RISK",
  }));
  validateLoopArtifactRevision(gateRevision);
  assert(gateRevision.gateResult === "PASS_WITH_RISK", "Gate revision carries a conclusive passing result");
  const withGeneration = createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }));
  assert(withGeneration.generation === null, "generation reference is nullable");
  const withUpstream = createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-challenge", sequence: 1, semver: "1.0.0", digest: dg("f"),
      producerExecutionId: "run-001:capability:6:succeeded",
    }),
    upstreamRevisionIds: ["run-001:revision:tech-design:1"],
  });
  validateLoopArtifactRevision(withUpstream);
  assert(true, "revision with an upstream reference passes validation");
  assert(compareLoopArtifactSemver("1.0.0", "1.0.0") === 0, "equal semvers compare equal");
  assert(compareLoopArtifactSemver("1.9.9", "1.10.0") === -1, "semver comparison is numeric, not lexical");
  assert(compareLoopArtifactSemver("2.0.0", "1.99.99") === 1, "major segment dominates");
  expectThrow("INVALID_INPUT", () => compareLoopArtifactSemver("1.0", "1.0.0"), "malformed semver comparison fails closed");
  // A valid two-node chain: the challenge revision consumes the design revision.
  const designRevision = createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", createdAt: nextTs(),
  }));
  const challengeRevision = createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-challenge", sequence: 1, semver: "1.0.0", digest: dg("f"),
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  });
  for (const bad of ["1.0", "v1.0.0", "1.0.0.0", "1.0.x"]) {
    expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, semver: bad }),
      `malformed semver rejected (${bad})`);
  }
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, digest: dg("e") }),
    "artifact ref/digest mismatch rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, artifactKind: "technical_design" }),
    "artifact kind drift from the ref kind rejected");
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
    ...base, upstreamRevisionIds: ["run-001:revision:tech-design:1"],
  }), "self-referencing upstream rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-002:revision:tech-design:1"],
  }), "cross-run upstream reference rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-001:revision:solution-challenge:1", "run-001:revision:solution-challenge:1"],
  }), "duplicate upstream references rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...base, upstreamRevisionIds: ["run-001:revision:deploy:1"],
  }), "upstream with unknown node rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: "FAIL",
  }), "Gate node revision with FAIL result rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: null,
  }), "Gate node revision without a Gate result rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({
    ...revisionDraft({
      nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("e"),
      producerExecutionId: "run-001:capability:8:succeeded",
    }),
    gateResult: "NOT_APPLICABLE",
  }), "Gate node revision with NOT_APPLICABLE rejected");
  expectThrow("INVALID_INPUT", () => createLoopArtifactRevision({ ...base, gateResult: "PASS" }),
    "non-Gate node revision with a conclusive Gate result rejected");
  const created = createLoopArtifactRevision(base);
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "STALE", supersededBy: "run-001:revision:tech-design:2" }),
    "STALE revision must not carry supersededBy");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: null }),
    "SUPERSEDED revision requires supersededBy");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: "run-001:revision:solution-challenge:2" }),
    "supersededBy pointing at another node rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "SUPERSEDED", supersededBy: "run-001:revision:tech-design:1" }),
    "supersededBy pointing backwards rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, revisionId: "run-001:revision:tech-design:9" }),
    "forged revision id rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevision({ ...created, validity: "OBSOLETE" }),
    "unknown validity token rejected");
}

console.log("artifact revision: adversarial input boundaries fail closed");
{
  const draft = revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
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
    [rev("tech-design", 2, "1.0.0", at(1))], "run-001",
  ), "node chain must start at sequence one");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev("tech-design", 1, "1.0.0", at(1)), rev("tech-design", 1, "1.1.0", at(2)),
  ], "run-001"), "duplicate sequence inside a node chain rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev("tech-design", 1, "1.0.0", at(1)), rev("tech-design", 2, "1.0.0", at(2)),
  ], "run-001"), "semver must strictly increase inside a node chain");
}

console.log("artifact revision: per-node progression and supersede linkage fail closed");
{
  const at = (offset: number) => new Date(Date.parse(TS) + offset * 1000).toISOString();
  const rev = (
    sequence: number, semver: string, createdAt: string, o?: Record<string, unknown>,
  ): LoopArtifactRevision => {
    const draft = revisionDraft({
      nodeId: "tech-design", sequence, semver, digest: dg("d"),
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
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:tech-design:3" }),
    rev(2, "1.1.0", at(2)),
  ], "run-001"), "supersededBy must point at the next revision of the node");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:tech-design:2" }),
  ], "run-001"), "superseded chain tip without a successor rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(2, "1.1.0", at(2), { requirementId: "req-002" }),
  ], "run-001"), "mixed Requirement identities rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { runId: "run-002", revisionId: "run-002:revision:tech-design:1" }),
  ], "run-001"), "run identity mismatch rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(1, "1.1.0", at(2), { nodeId: "solution-challenge" }),
    rev(1, "1.2.0", at(3)),
  ], "run-001"), "interleaved node groups rejected");
  const dangling = rev(1, "1.0.0", at(1), { nodeId: "solution-challenge" });
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    Object.freeze({ ...dangling, upstreamRevisionIds: Object.freeze(["run-001:revision:tech-design:9"]) }) as LoopArtifactRevision,
  ], "run-001"), "dangling upstream reference rejected");
  expectThrow("INVALID_INPUT", () => validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1)), rev(2, "1.1.0", at(2)),
  ], "run-001"), "a non-terminal revision still ACTIVE rejected");
  validateLoopArtifactRevisionChain([
    rev(1, "1.0.0", at(1), { validity: "SUPERSEDED", supersededBy: "run-001:revision:tech-design:2" }),
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded", createdAt: at(1),
  }));
  const second = createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 2, semver: "1.1.0", digest: dg("e"),
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
  expectThrow("INVALID_INPUT", () => supersedeArtifactRevision(first, "run-001:revision:tech-design:9"),
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
    stablePath: "00-需求资料/req-001_需求摘要.md",
  })));
  assert(appended.appended === true, "first revision appended");
  const listed = store.listArtifactRevisions("run-001");
  assert(listed.length === 1, "revision chain lists the appended revision");
  const current = store.getCurrentArtifactRevision("run-001", "requirement-intake");
  assert(current !== undefined && current.revisionId === "run-001:revision:requirement-intake:1",
    "current pointer targets the appended revision");
  assert(store.getCurrentArtifactRevision("run-001", "tech-design") === undefined,
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "revision for a missing run rejected");
  assert(store.listArtifactRevisions("run-404").length === 0, "unknown run lists no revisions");
  assert(store.getCurrentArtifactRevision("run-404", "tech-design") === undefined,
    "unknown run has no current revision");
});

console.log("artifact revision: producer execution binding rejects any drift");
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driver.succeed("requirement-intake", INTAKE_OUT);
  const design = driver.succeed("tech-design", DESIGN_OUT);
  const bind = (o: Partial<RevisionDraftOptions>) => () => store.appendArtifactRevision(
    createLoopArtifactRevision(revisionDraft({
      nodeId: "tech-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
      producerExecutionId: design.executionEventId, ...o,
    })),
  );
  expectThrow("ILLEGAL_TRANSITION", bind({ nodeId: "solution-challenge" }),
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
  driver.succeed("requirement-intake", INTAKE_OUT);
  driver.succeed("tech-design", DESIGN_OUT);
  driver.succeed("solution-challenge", { version: "1.0.0", digest: dg("e") });
  const review = driver.succeed("solution-review", { version: "1.0.0", digest: dg("f") }, "FAIL");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS",
  }))), "revision claiming PASS for a FAIL Gate execution rejected");
});
withRunningStore((store) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driver.succeed("requirement-intake", INTAKE_OUT);
  driver.succeed("tech-design", DESIGN_OUT);
  driver.succeed("solution-challenge", { version: "1.0.0", digest: dg("e") });
  const review = driver.succeed("solution-review", { version: "1.0.0", digest: dg("f") }, "PASS_WITH_RISK");
  const appended = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS_WITH_RISK",
    stablePath: "02-方案审核/req-001_方案审核.md",
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
    producerExecutionId: intake.executionEventId, stablePath: "00-需求资料/other.md",
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
      producerExecutionId: intake.executionEventId, stablePath: "00-需求资料/loser.md",
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
  driver.succeed("requirement-intake", INTAKE_OUT);
  const design = driver.succeed("tech-design", { version: "1.0.0", digest: dg("9") });
  const first = createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("9"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }));
  assert(store.appendArtifactRevision(first).appended === true, "first revision appended");
  const probe = new Database(join(dir, "journal.db"), { readonly: true });
  const pointerRow = probe.prepare(
    "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
  ).get("run-001", "tech-design") as { revision_id: string };
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
    nodeId: "tech-design", sequence: 2, semver: "1.1.0", digest: dg("d"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }))), "revision claiming an output the producer never produced rejected");
  expectThrow("EVENT_SEQUENCE_CONFLICT", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 2, semver: "1.0.0", digest: dg("9"),
    producerExecutionId: design.executionEventId, createdAt: nextTs(),
  }))), "producer-pinned candidate semver is already occupied by the current revision");
  const chain = store.listArtifactRevisions("run-001");
  assert(chain.length === 1 && chain[0]!.validity === "ACTIVE", "rejected advances leave the chain untouched");
  const current = store.getCurrentArtifactRevision("run-001", "tech-design");
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
    producerExecutionId: intake.executionEventId, stablePath: "00-需求资料/req-001_需求摘要.md",
  }))).record;
  const design = driver.succeed("tech-design", DESIGN_OUT);
  const withUpstream = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
    upstreamRevisionIds: [intakeRevision.revisionId],
  })));
  assert(withUpstream.appended === true, "revision consuming the current upstream appended");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 9, semver: "9.9.9", digest: dg("8"),
    producerExecutionId: design.executionEventId,
    upstreamRevisionIds: ["run-001:revision:requirement-intake:9"],
  }))), "nonexistent upstream revision rejected");
});
withRunningStore((store) => {
  // Stale upstream: the pointer still targets the STALE revision, but a STALE
  // revision can never be consumed as an upstream.
  const driver = makeCapabilityDriver(store, "run-001");
  driver.succeed("requirement-intake", INTAKE_OUT);
  const design = driver.succeed("tech-design", DESIGN_OUT);
  const designRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  store.markArtifactRevisionStale("run-001", designRevision.revisionId);
  const challenge = driver.succeed("solution-challenge", { version: "1.0.0", digest: dg("e") });
  expectThrow("ILLEGAL_TRANSITION", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-challenge", sequence: 1, semver: "1.0.0", digest: dg("e"),
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
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:tech-design:1"),
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "revision rejected while a delivery stage is active");
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:tech-design:1"),
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "terminal run must not accept revisions");
  expectThrow("ILLEGAL_TRANSITION", () => store.markArtifactRevisionStale("run-001", "run-001:revision:tech-design:1"),
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
      .run("req-002", createHash("sha256").update(canonicalizeLoopArtifactRevision(tampered)).digest("hex"), revision.revisionId);
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
  const design = driver.succeed("tech-design", DESIGN_OUT);
  const intakeRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "requirement-intake", sequence: 1, semver: INTAKE_OUT.version, digest: INTAKE_OUT.digest,
    producerExecutionId: intake.executionEventId, stablePath: "00-需求资料/req-001_需求摘要.md",
  }))).record;
  const designRevision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
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
        producer_execution_id, gate_result, validity, superseded_by, created_at,
        canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "run-001:revision:tech-design:1", "run-001", "req-001", "tech-design", 1, 1,
      null, "01-技术方案/forged.md", "capability_output", "1.0.0",
      `loop-artifact:v1:capability_output:sha256:${dg("7")}`, dg("7"),
      "run-001:capability:99:succeeded", "NOT_APPLICABLE", "ACTIVE", null,
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
    artifactRef: `loop-artifact:v1:capability_output:sha256:${dg("7")}`,
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
  driver.succeed("requirement-intake", INTAKE_OUT);
  driver.succeed("tech-design", DESIGN_OUT);
  driver.succeed("solution-challenge", { version: "1.0.0", digest: dg("e") });
  const review = driver.succeed("solution-review", { version: "1.0.0", digest: dg("f") }, "PASS");
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: review.executionEventId, gateResult: "PASS",
  }))).record;
  const tampered = Object.freeze({ ...revision, gateResult: "PASS_WITH_RISK" }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "solution-review",
    "rehashed revision with a drifted Gate result rejected");
});
withRunningStore((store, dir) => {
  const driver = makeCapabilityDriver(store, "run-001");
  driver.succeed("requirement-intake", INTAKE_OUT);
  const design = driver.succeed("tech-design", DESIGN_OUT);
  const revision = store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: DESIGN_OUT.version, digest: DESIGN_OUT.digest,
    producerExecutionId: design.executionEventId,
  }))).record;
  const tampered = Object.freeze({
    ...revision,
    revisionId: "run-001:revision:solution-challenge:1",
    nodeId: "solution-challenge",
  }) as LoopArtifactRevision;
  tamperRevisionWithRehash(dir, revision.revisionId, tampered);
  expectCorruptOnAllReadPaths(store, "tech-design",
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
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
    stablePath: "01-技术方案/req-001_技术方案.md",
  }));
  const row = (o?: Record<string, unknown>) => Object.freeze({
    node: "01 技术方案",
    stablePath: "01-技术方案/req-001_技术方案.md",
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
  assert(stop(crossBindArtifactIndexRow(row({ stablePath: "01-技术方案/other.md" }), designRevision)) === "STABLE_PATH_DRIFT",
    "stable path drift is a STOP diagnosis");
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
    nodeId: "solution-review", sequence: 1, semver: "1.0.0", digest: dg("f"),
    producerExecutionId: "run-001:capability:8:succeeded", gateResult: "PASS",
    stablePath: "02-方案审核/req-001_方案审核.md",
  }));
  const gateRow = (o?: Record<string, unknown>) => Object.freeze({
    node: "02 方案审核",
    stablePath: "02-方案审核/req-001_方案审核.md",
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
  expectThrow("STORE_CLOSED", () => store.getCurrentArtifactRevision("run-001", "tech-design"),
    "closed store current read raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.markArtifactRevisionStale("run-001", "run-001:revision:tech-design:1"),
    "closed store stale marking raises STORE_CLOSED");
  expectThrow("STORE_CLOSED", () => store.appendArtifactRevision(createLoopArtifactRevision(revisionDraft({
    nodeId: "tech-design", sequence: 1, semver: "1.0.0", digest: dg("d"),
    producerExecutionId: "run-001:capability:4:succeeded",
  }))), "closed store append raises STORE_CLOSED");
  rmSync(dir, { recursive: true, force: true });
}

console.log("artifact revision: v3 to v4 migration is atomic and retryable");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  // Simulate a pre-WP2 journal: no revision tables, format marker v3.
  const v3 = new Database(path);
  for (const table of [
    "loop_artifact_current", "loop_artifact_revision_upstreams", "loop_artifact_revisions",
  ]) {
    v3.exec(`DROP TABLE ${table}`);
  }
  v3.pragma("user_version = 3");
  v3.close();
  const store2 = new LoopRunStore(path);
  store2.init();
  assert(store2.getSnapshot("run-001") !== undefined, "v3 run remains readable after v4 migration");
  assert(store2.listArtifactRevisions("run-001").length === 0, "migrated journal has an empty revision chain");
  store2.close();
  const migrated = new Database(path, { readonly: true });
  assert(migrated.pragma("user_version", { simple: true }) === 4, "migration atomically records format v4");
  assert(
    migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_artifact_revisions'").get() !== undefined,
    "migration creates the artifact revision table",
  );
  assert(
    migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_artifact_current'").get() !== undefined,
    "migration creates the current pointer table",
  );
  migrated.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-artifact-rev-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  const v3 = new Database(path);
  for (const table of [
    "loop_artifact_current", "loop_artifact_revision_upstreams", "loop_artifact_revisions",
  ]) {
    v3.exec(`DROP TABLE ${table}`);
  }
  v3.pragma("user_version = 3");
  // A bogus pre-existing table makes the migration's schema verification fail.
  v3.exec("CREATE TABLE loop_artifact_revisions (bogus TEXT)");
  v3.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "wrong-schema revision table aborts migration");
  store2.close();
  const probe = new Database(path, { readonly: true });
  assert(probe.pragma("user_version", { simple: true }) === 3, "user_version unchanged after migration rollback");
  assert(
    probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_artifact_current'").get() === undefined,
    "pointer table not persisted after rollback",
  );
  probe.close();
  // The failed migration is retryable: removing the bogus table lets init succeed.
  const fix = new Database(path);
  fix.exec("DROP TABLE loop_artifact_revisions");
  fix.close();
  const store3 = new LoopRunStore(path);
  store3.init();
  assert(store3.getSnapshot("run-001") !== undefined, "repaired journal migrates and reads back");
  store3.close();
  const retry = new Database(path, { readonly: true });
  assert(retry.pragma("user_version", { simple: true }) === 4, "retry completes the v4 migration");
  retry.close();
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

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
