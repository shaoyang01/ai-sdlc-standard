// LOOP Execution Provenance and Recovery — Tests (C01 WP-4)
// ==========================================================
// Guards for the event schema extension (bindingId / bindingVersion /
// inputArtifactRef), legacy journal migration, recordNodeExecution and the
// recoverRunContext cross-entry recovery protocol.

import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopRunJournalError, type LoopRunEvent, type LoopRunIdentity } from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";
import { recordNodeExecution, recoverRunContext } from "../core/loop-recovery";

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

const TS = "2026-08-19T00:00:00.000Z";

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-provenance-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-provenance-test-run-001",
    controlRoot: "/tmp/loop-provenance-test/control",
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
    createdAt: o.createdAt ?? TS,
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
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  try {
    fn(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("provenance: recordNodeExecution persists binding provenance");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  recordNodeExecution(store, {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started",
    createdAt: TS,
    provenance: {
      bindingId: "binding-codex-implementation",
      bindingVersion: "1.0.0",
      inputArtifactRef: "library/req-001/01-技术方案/req-001_技术方案.md@v2",
    },
  });
  recordNodeExecution(store, {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_succeeded",
    createdAt: TS,
    provenance: {
      bindingId: "binding-codex-implementation",
      bindingVersion: "1.0.0",
      inputArtifactRef: "library/req-001/01-技术方案/req-001_技术方案.md@v2",
    },
    outputArtifactRef: "library/req-001/03-实现记录/req-001_实现记录.md@v1",
  });

  const snapshot = store.getSnapshot("run-001");
  assert(snapshot !== undefined, "snapshot readable after provenance events");
  const started = snapshot?.events.find((e) => e.kind === "stage_started");
  const succeeded = snapshot?.events.find((e) => e.kind === "stage_succeeded");
  assert(started?.bindingId === "binding-codex-implementation", "started event carries bindingId");
  assert(started?.bindingVersion === "1.0.0", "started event carries bindingVersion");
  assert(
    started?.inputArtifactRef === "library/req-001/01-技术方案/req-001_技术方案.md@v2",
    "started event carries inputArtifactRef",
  );
  assert(succeeded?.outputArtifactRef === "library/req-001/03-实现记录/req-001_实现记录.md@v1", "succeeded event carries outputArtifactRef");
});

console.log("provenance: provenance survives reopen (durable round-trip)");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  recordNodeExecution(store1, {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started",
    createdAt: TS,
    provenance: { bindingId: "binding-codex-solution-review", bindingVersion: "1.0.0", inputArtifactRef: null },
  });
  store1.close();

  const store2 = new LoopRunStore(path);
  store2.init();
  try {
    const snapshot = store2.getSnapshot("run-001");
    const started = snapshot?.events.find((e) => e.kind === "stage_started");
    assert(started?.bindingId === "binding-codex-solution-review", "provenance read back after reopen");
    assert(started?.bindingVersion === "1.0.0", "binding version read back after reopen");
  } finally {
    store2.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("provenance: fail-closed validation");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const base = {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started" as const,
    createdAt: TS,
    provenance: { bindingId: "binding-codex-implementation", bindingVersion: "1.0.0", inputArtifactRef: null },
  };
  expectThrow(
    "INVALID_INPUT",
    () => recordNodeExecution(store, { ...base, provenance: { ...base.provenance, bindingId: 42 as unknown as string } }),
    "non-string bindingId rejected",
  );
  expectThrow(
    "INVALID_INPUT",
    () => recordNodeExecution(store, { ...base, provenance: { ...base.provenance, bindingVersion: "v\u00071.0" } }),
    "control characters in bindingVersion rejected",
  );
  expectThrow(
    "RUN_NOT_FOUND",
    () => recordNodeExecution(store, { ...base, runId: "run-missing" }),
    "unknown run rejected",
  );
});

console.log("provenance: legacy journal migration (pre-extension columns)");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  // Build a legacy journal without the provenance columns.
  const db = new Database(path);
  db.exec(`
    CREATE TABLE loop_runs (
      run_id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, repository TEXT NOT NULL,
      repository_path TEXT NOT NULL, base_branch TEXT NOT NULL, expected_base_sha TEXT NOT NULL,
      task_branch TEXT NOT NULL, control_root TEXT NOT NULL, status TEXT NOT NULL,
      current_stage TEXT, current_attempt INTEGER NOT NULL, fix_round INTEGER NOT NULL,
      last_sequence INTEGER NOT NULL, last_event_id TEXT NOT NULL,
      blocking_reason_code TEXT, failure_reason_code TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, identity_sha256 TEXT NOT NULL
    );
    CREATE TABLE loop_stage_states (
      run_id TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL,
      attempt INTEGER NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (run_id, stage),
      FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
    );
    CREATE TABLE loop_events (
      event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      kind TEXT NOT NULL, stage TEXT, attempt INTEGER NOT NULL, created_at TEXT NOT NULL,
      input_digest TEXT, output_artifact_ref TEXT, output_digest TEXT, error_code TEXT,
      retryable INTEGER, reason_code TEXT, canonical_sha256 TEXT NOT NULL,
      UNIQUE (run_id, sequence),
      FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
    );
  `);
  db.close();

  const store = new LoopRunStore(path);
  store.init();
  try {
    store.createRun(makeIdentity());
    store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
    const snapshot = store.getSnapshot("run-001");
    const created = snapshot?.events[0];
    assert(created?.bindingId === null, "legacy event reads bindingId as null");
    assert(created?.bindingVersion === null, "legacy event reads bindingVersion as null");
    assert(created?.inputArtifactRef === null, "legacy event reads inputArtifactRef as null");
    // New provenance events work after migration.
    recordNodeExecution(store, {
      runId: "run-001",
      stage: "prepare_workspace",
      attempt: 1,
      kind: "stage_started",
      createdAt: TS,
      provenance: { bindingId: "binding-codex-implementation", bindingVersion: "1.0.0", inputArtifactRef: null },
    });
    assert(
      store.getSnapshot("run-001")?.events.some((e) => e.bindingId === "binding-codex-implementation"),
      "provenance writable after migration",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("recovery: recoverRunContext");
withStore((store) => {
  assert(recoverRunContext(store, "req-001") === undefined, "no run yet returns undefined");

  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  recordNodeExecution(store, {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started",
    createdAt: TS,
    provenance: { bindingId: "binding-codex-implementation", bindingVersion: "1.0.0", inputArtifactRef: "lib@v2" },
  });

  const context = recoverRunContext(store, "req-001");
  assert(context !== undefined, "context recovered for requirement");
  assert(context?.snapshot.state.identity.requirementId === "req-001", "context snapshot bound to requirement");
  assert(context?.currentStage === "prepare_workspace", "context exposes current stage");
  assert(context?.currentAttempt === 1, "context exposes current attempt");
  assert(context?.lastExecution?.bindingId === "binding-codex-implementation", "context exposes last execution bindingId");
  assert(context?.lastExecution?.bindingVersion === "1.0.0", "context exposes last execution bindingVersion");
  assert(context?.lastExecution?.inputArtifactRef === "lib@v2", "context exposes last execution inputArtifactRef");
  assert(context?.lastExecution?.stage === "prepare_workspace", "context exposes last execution stage");
});

console.log("recovery: blocking state is recoverable");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store.appendEvent(
    makeEvent({ sequence: 3, kind: "run_blocked", reasonCode: "NEEDS_USER_INPUT", attempt: 0 }),
  );
  const context = recoverRunContext(store, "req-001");
  assert(context?.blockingReasonCode === "NEEDS_USER_INPUT", "blocking reason recoverable");
  assert(context?.status === "blocked", "blocked status recoverable");
});

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
