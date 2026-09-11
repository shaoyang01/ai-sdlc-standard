// G5-T3 (D-090-03 Δ2): manifest projection failure-code exit wiring tests —
// the three §7.2 projection stops enter the runtime run exit verbatim, and a
// lawful level-3 pending projection (catch-up) NEVER becomes an exit. The
// channel is exercised end-to-end: real LoopRunStore + real projector
// (loop-manifest-projector) routed through the runtime exit seam.
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunEvent, LoopRunIdentity } from "../core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { materializeProducerRevision } from "../runtime";
import {
  LOOP_MANIFEST_SCHEMA_VERSION,
  LOOP_MANIFEST_NODES,
  projectLoopManifest,
  sealManifest,
  type LoopManifestProjectionOutcome,
  type LoopManifestProjectionStopCode,
} from "../core/loop-manifest-projector";
import { dumpRubyYaml } from "../core/loop-manifest-yaml";
import {
  LOOP_MANIFEST_EXIT_STOP_CODES,
  manifestProjectionBlockedResult,
  routeManifestProjectionOutcome,
  type RuntimeChainEntry,
} from "../runtime";

let passed = 0;
let failed = 0;
function ok(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TS = "2026-09-11T00:00:00.000Z";
const RUN = "run-g5t3-001";
const REQ = "req-g5t3-001";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}
function dg(letter: string): string {
  return letter.repeat(64);
}

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: RUN,
    requirementId: REQ,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/g5t3-test",
    controlRoot: join(root, "control"),
    createdAt: nextTs(),
  });
}

function runEvent(sequence: number, kind: "run_started" | "run_paused"): LoopRunEvent {
  return Object.freeze({
    eventId: `${RUN}:${sequence}:${kind}`,
    runId: RUN,
    sequence,
    kind,
    stage: null,
    attempt: 0,
    createdAt: nextTs(),
    inputDigest: null,
    outputArtifactRef: null,
    outputDigest: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  });
}

function event(overrides: Partial<LoopCapabilityExecutionEvent> = {}): LoopCapabilityExecutionEvent {
  const sequence = overrides.sequence ?? 1;
  const status = overrides.status ?? "started";
  const capability = overrides.capability ?? "requirement-intake";
  const executionRole = overrides.executionRole ?? "primary";
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: `${RUN}:capability:${sequence}:${status}`,
    runId: RUN,
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
    inputArtifactRef: null,
    inputArtifactVersion: null,
    inputDigest: null,
    outputArtifactRef: null,
    outputArtifactVersion: null,
    outputDigest: null,
    gateResult: null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    consumedFindingsRef: null,
    consumedFindingsDigest: null,
    decisionDepth: null,
    decisionStatus: null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
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

type ManualBase = Record<string, unknown>;

function manualInitBase(title: string, findingIndex: readonly Record<string, unknown>[]): ManualBase {
  return {
    schema_version: LOOP_MANIFEST_SCHEMA_VERSION,
    requirement_id: REQ,
    title,
    publish_seq: 1,
    projected_through: "MANUAL",
    updated_at: nextTs(),
    depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
    entries: [
      { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: dg("b"), updated_at: nextTs(), source_event_ref: "00-需求资料/req_需求摘要.md" },
      { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
    ],
    finding_index: findingIndex,
    declaration_log: [],
    corrections: [],
    repair_records: [],
  };
}

function writeManualManifest(libraryDir: string, base: ManualBase): void {
  const sealed = sealManifest(base as never);
  writeFileSync(
    join(libraryDir, "manifest.md"),
    dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }),
    "utf8",
  );
}

function readManifestText(libraryDir: string): string {
  return readFileSync(join(libraryDir, "manifest.md"), "utf8");
}

/** Overwrite manifest.md with a rehashed tampered document (level-2 shape). */
function writeRehashedTamper(libraryDir: string, mutate: (doc: Record<string, unknown>) => void): void {
  const doc = JSON.parse(JSON.stringify(manualInitBase("探针需求", []))) as Record<string, unknown>;
  mutate(doc);
  const sealed = sealManifest(doc as never);
  writeFileSync(
    join(libraryDir, "manifest.md"),
    dumpRubyYaml({ ...doc, manifest_digest: sealed.manifest_digest }),
    "utf8",
  );
}

function traceOf(store: LoopRunStore): readonly RuntimeChainEntry[] {
  return store.listCapabilityExecutions(RUN).map((e) => Object.freeze({
    capability: e.capability,
    executionRole: e.executionRole,
    agent: e.executorAgent,
    attempt: e.attempt,
    status: e.status,
    gateResult: e.gateResult,
    outputArtifactRef: e.outputArtifactRef,
    outputDigest: e.outputDigest,
  }));
}

function exitContext(store: LoopRunStore, root: string) {
  return {
    requirement_id: REQ,
    run_id: RUN,
    execution_trace: traceOf(store),
    workspace_root: root,
    journal_path: store.databaseFilePath,
    completed_at: nextTs(),
  };
}

// ===========================================================================
console.log("G5-T3 exit wiring — §7.2 stop-code vocabulary");
{
  ok(
    JSON.stringify(LOOP_MANIFEST_EXIT_STOP_CODES) ===
      JSON.stringify(["MANIFEST_CORRUPT_STOP", "JOURNAL_MANIFEST_MISMATCH_STOP", "BLOCKED_AMBIGUOUS"]),
    "exit codes are exactly the three §7.2 file-level codes (freeze §5)",
  );
  ok(Object.isFrozen(LOOP_MANIFEST_EXIT_STOP_CODES), "the stop-code tuple is frozen");
}

// ===========================================================================
console.log("G5-T3 exit wiring — outcome routing table (catch-up never stops)");
{
  const continues: readonly LoopManifestProjectionOutcome[] = [
    { kind: "NO_OP" },
    { kind: "PUBLISHED", manifestPath: "library/x/manifest.md", manifestDigest: `sha256:${dg("a")}`, tookOver: false },
    { kind: "DEFERRED", reason: "projection precondition not applicable" },
  ];
  for (const outcome of continues) {
    const routed = routeManifestProjectionOutcome(outcome);
    ok(routed.blocksRun === false, `${outcome.kind} is run progress, never an exit (待投影差量走追平不走 STOP)`);
  }

  const stops: readonly LoopManifestProjectionStopCode[] = [
    "MANIFEST_CORRUPT_STOP",
    "JOURNAL_MANIFEST_MISMATCH_STOP",
    "BLOCKED_AMBIGUOUS",
  ];
  for (const code of stops) {
    const routed = routeManifestProjectionOutcome({ kind: "STOP", code, reason: `reason-of-${code}` });
    ok(
      routed.blocksRun && routed.code === code && routed.reason === `reason-of-${code}`,
      `STOP ${code} blocks the run with the exact code and preserved reason`,
    );
  }
}

// ===========================================================================
console.log("G5-T3 exit wiring — canonical blocked RuntimeResult");
{
  const trace: readonly RuntimeChainEntry[] = [Object.freeze({
    capability: "requirement-intake",
    executionRole: "primary",
    agent: "codex",
    attempt: 1,
    status: "succeeded",
    gateResult: "NOT_APPLICABLE",
    outputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${dg("c")}`,
    outputDigest: dg("c"),
  })];
  const result = manifestProjectionBlockedResult(
    {
      requirement_id: REQ,
      run_id: RUN,
      execution_trace: trace,
      workspace_root: "/ws",
      journal_path: "/ws/journal.db",
      completed_at: TS,
    },
    { code: "MANIFEST_CORRUPT_STOP", reason: "self-digest mismatch" },
  );
  ok(result.final_status === "failed" && result.chain_status === "BLOCKED", "blocked exit is failed/BLOCKED");
  ok(result.blocking_reason_code === "MANIFEST_CORRUPT_STOP", "blocking_reason_code is the exact §7.2 code");
  ok(result.next_execution_point === null, "no re-entry target is handed out (fail-closed, no auto-resume)");
  ok(result.execution_trace.length === 1 && result.execution_trace[0]!.capability === "requirement-intake", "trace preserved");
  ok(Object.isFrozen(result) && Object.isFrozen(result.execution_trace), "exit envelope is frozen");
  let threw = false;
  try {
    manifestProjectionBlockedResult(
      {
        requirement_id: REQ,
        run_id: RUN,
        execution_trace: [],
        workspace_root: "/ws",
        journal_path: null,
        completed_at: TS,
      },
      { code: "ADMISSION_DENIED" as LoopManifestProjectionStopCode, reason: "not a manifest code" },
    );
  } catch {
    threw = true;
  }
  ok(threw, "a non-manifest stop code cannot enter the manifest projection exit");
}

// ===========================================================================
console.log("G5-T3 exit wiring — channel integration: real store + real projector → seam → exit");
{
  const root = mkdtempSync(join(tmpdir(), "loop-g5t3-exit-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun(identity(root));
    store.appendEvent(runEvent(2, "run_started"));

    const request = { store, runId: RUN, requirementId: REQ, libraryDir };

    // (1) Legacy directory reuse: journal has events, no manifest → the run
    // must exit BLOCKED_AMBIGUOUS and must NOT rebuild the manifest.
    const ambiguous = projectLoopManifest(request);
    ok(
      ambiguous.kind === "STOP" && ambiguous.code === "BLOCKED_AMBIGUOUS",
      `no manifest + journal events → BLOCKED_AMBIGUOUS (${JSON.stringify(ambiguous)})`,
    );
    if (ambiguous.kind === "STOP") {
      const routed = routeManifestProjectionOutcome(ambiguous);
      ok(routed.blocksRun && routed.code === "BLOCKED_AMBIGUOUS", "routing blocks on BLOCKED_AMBIGUOUS");
      const exit = manifestProjectionBlockedResult(exitContext(store, root), routed.blocksRun ? routed : { code: "BLOCKED_AMBIGUOUS", reason: "" });
      ok(exit.blocking_reason_code === "BLOCKED_AMBIGUOUS", "exit carries BLOCKED_AMBIGUOUS verbatim");
    }
    ok(!writeManifestExists(libraryDir), "no manifest was rebuilt behind the stop (DP4, §6.2.7)");

    // (2) Lawful path: MANUAL takeover, then a journal tail → catch-up
    // publication routes as run progress; the replay routes as NO_OP.
    writeManualManifest(libraryDir, manualInitBase("探针需求", []));
    const takeover = projectLoopManifest({ ...request, takeoverAcceptedAt: nextTs() });
    ok(takeover.kind === "PUBLISHED" && takeover.tookOver, `takeover A publishes (${JSON.stringify(takeover)})`);
    ok(routeManifestProjectionOutcome(takeover).blocksRun === false, "takeover publication is run progress");

    const intakeRef = `loop-artifact:v1:requirement_summary:sha256:${dg("c")}`;
    const inputRef = `loop-artifact:v1:requirement_summary:sha256:${dg("a")}`;
    const started = event({ sequence: 1, status: "started", inputArtifactRef: inputRef, inputArtifactVersion: "1.0.0", inputDigest: dg("a") });
    const succeeded = event({
      ...started,
      executionEventId: `${RUN}:capability:2:succeeded`,
      sequence: 2,
      status: "succeeded",
      outputArtifactRef: intakeRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: dg("c"),
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    store.appendCapabilityExecution(started);
    store.appendCapabilityExecution(succeeded);
    materializeProducerRevision(store, REQ, RUN, succeeded, () => nextTs());

    const catchUp = projectLoopManifest(request);
    ok(catchUp.kind === "PUBLISHED", `journal tail catch-up publishes (${JSON.stringify(catchUp)})`);
    ok(routeManifestProjectionOutcome(catchUp).blocksRun === false, "level-3 catch-up never blocks the run");

    const replay = projectLoopManifest(request);
    ok(replay.kind === "NO_OP", `replay is NO_OP (${JSON.stringify(replay)})`);
    ok(routeManifestProjectionOutcome(replay).blocksRun === false, "replay no-op never blocks the run");
    ok(LOOP_MANIFEST_NODES.length === 7, "sanity: seven-node manifest vocabulary unchanged");

    // (3) Level 2: rehashed tamper of a bound slot → JOURNAL_MANIFEST_MISMATCH_STOP.
    writeRehashedTamper(libraryDir, (doc) => {
      const entries = doc.entries as Record<string, unknown>[];
      entries[0] = { ...entries[0]!, digest: dg("9") };
    });
    const beforeMismatch = readManifestText(libraryDir);
    const mismatch = projectLoopManifest(request);
    ok(
      mismatch.kind === "STOP" && mismatch.code === "JOURNAL_MANIFEST_MISMATCH_STOP",
      `rehashed tamper → JOURNAL_MANIFEST_MISMATCH_STOP (${JSON.stringify(mismatch)})`,
    );
    if (mismatch.kind === "STOP") {
      const routed = routeManifestProjectionOutcome(mismatch);
      ok(routed.blocksRun && routed.code === "JOURNAL_MANIFEST_MISMATCH_STOP", "routing blocks on true divergence");
      const exit = manifestProjectionBlockedResult(exitContext(store, root), routed.blocksRun ? routed : { code: "JOURNAL_MANIFEST_MISMATCH_STOP", reason: "" });
      ok(
        exit.final_status === "failed" && exit.chain_status === "BLOCKED" && exit.blocking_reason_code === "JOURNAL_MANIFEST_MISMATCH_STOP",
        "divergence exit is the canonical blocked envelope with the exact code",
      );
      ok(exit.execution_trace.length === 2, "exit trace covers the journal terminal events");
      ok(exit.next_execution_point === null, "divergence exit offers no re-entry target");
    }
    ok(readManifestText(libraryDir) === beforeMismatch, "routing a stop leaves the manifest bytes untouched (no repair, no rebuild)");

    // (4) Level 1: digest-breaking corruption → MANIFEST_CORRUPT_STOP.
    const beforeCorrupt = readManifestText(libraryDir);
    writeFileSync(join(libraryDir, "manifest.md"), beforeCorrupt.replace(dg("9"), dg("8")), "utf8");
    const corrupt = projectLoopManifest(request);
    ok(
      corrupt.kind === "STOP" && corrupt.code === "MANIFEST_CORRUPT_STOP",
      `digest-breaking change → MANIFEST_CORRUPT_STOP (${JSON.stringify(corrupt)})`,
    );
    if (corrupt.kind === "STOP") {
      const routed = routeManifestProjectionOutcome(corrupt);
      ok(routed.blocksRun && routed.code === "MANIFEST_CORRUPT_STOP", "routing blocks on level-1 corruption");
      const exit = manifestProjectionBlockedResult(exitContext(store, root), routed.blocksRun ? routed : { code: "MANIFEST_CORRUPT_STOP", reason: "" });
      ok(exit.blocking_reason_code === "MANIFEST_CORRUPT_STOP", "corruption exit carries MANIFEST_CORRUPT_STOP verbatim");
    }
    ok(readManifestText(libraryDir) === beforeCorrupt.replace(dg("9"), dg("8")), "corrupt manifest is never silently repaired");
  } finally {
    try {
      store.close();
    } catch {
      // cleanup tolerance
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function writeManifestExists(libraryDir: string): boolean {
  try {
    readFileSync(join(libraryDir, "manifest.md"), "utf8");
    return true;
  } catch {
    return false;
  }
}

console.log(`\ng5t3-exit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
