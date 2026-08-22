// LOOP Execution Provenance and Recovery — Tests (C01 WP-4)
// ==========================================================
// Guards for the event schema extension (bindingId / bindingVersion /
// inputArtifactRef), legacy journal migration, recordNodeExecution and the
// recoverRunContext cross-entry recovery protocol.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LOOP_STAGE_NAMES,
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";
import { recordNodeExecution, recoverRunContext, type NodeExecutionRecord } from "../core/loop-recovery";
import { canonicalizeLoopRunIdentity } from "../core/loop-run-state";

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

function validProvenance(): { bindingId: string; bindingVersion: string; inputArtifactRef: string | null } {
  return { bindingId: "binding-codex-implementation", bindingVersion: "1.0.0", inputArtifactRef: null };
}

function expectThrow(code: string, fn: () => unknown, message: string): void {  try {
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
    provenance: { bindingId: "binding-codex-solution-gate", bindingVersion: "1.0.0", inputArtifactRef: null },
  });
  store1.close();

  const store2 = new LoopRunStore(path);
  store2.init();
  try {
    const snapshot = store2.getSnapshot("run-001");
    const started = snapshot?.events.find((e) => e.kind === "stage_started");
    assert(started?.bindingId === "binding-codex-solution-gate", "provenance read back after reopen");
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

console.log("provenance: recordNodeExecution input boundary (no side effects)");
withStore((store) => {
  store.createRun(makeIdentity());
  const base = {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started" as const,
    createdAt: TS,
  };
  const before = store.getSnapshot("run-001");
  const malformed: ReadonlyArray<[string, unknown]> = [
    ["null record", null],
    ["null provenance", { ...base, provenance: null }],
    ["missing provenance", { ...base }],
    ["missing runId", { ...base, runId: undefined, provenance: {} }],
    ["missing stage", { ...base, stage: undefined, provenance: validProvenance() }],
    ["missing kind", { ...base, kind: undefined, provenance: validProvenance() }],
    ["non-execution kind", { ...base, kind: "run_started", provenance: validProvenance() }],
    ["non-integer attempt", { ...base, attempt: 1.5, provenance: validProvenance() }],
    ["missing createdAt", { ...base, createdAt: undefined, provenance: validProvenance() }],
    ["missing bindingId", { ...base, provenance: { ...validProvenance(), bindingId: undefined } }],
    ["non-string bindingVersion", { ...base, provenance: { ...validProvenance(), bindingVersion: 42 } }],
    ["non-string inputArtifactRef", { ...base, provenance: { ...validProvenance(), inputArtifactRef: 42 } }],
    ["non-boolean retryable", { ...base, retryable: "yes", provenance: validProvenance() }],
    // Validation precedes any journal access: an unknown runId combined with
    // a malformed field must surface INVALID_INPUT, not RUN_NOT_FOUND.
    ["malformed field beats unknown run", { ...base, runId: "run-missing", stage: undefined, provenance: validProvenance() }],
    ["transparent proxy record", new Proxy({ ...base, provenance: validProvenance() }, {})],
    ["transparent proxy provenance", { ...base, provenance: new Proxy(validProvenance(), {}) }],
    [
      "revoked proxy record",
      (() => {
        const { proxy, revoke } = Proxy.revocable({ ...base, provenance: validProvenance() }, {});
        revoke();
        return proxy;
      })(),
    ],
    // Proxy rejection precedes any journal access: an unknown runId inside a
    // Proxy must surface INVALID_INPUT, not RUN_NOT_FOUND.
    ["proxy beats unknown run", new Proxy({ ...base, runId: "run-missing", provenance: validProvenance() }, {})],
    [
      "accessor provenance",
      {
        ...base,
        provenance: Object.defineProperty({}, "bindingId", {
          enumerable: true,
          get() {
            return "binding-codex-implementation";
          },
        }),
      },
    ],
    [
      "proxy provenance with throwing trap",
      {
        ...base,
        provenance: new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              throw new Error("trap");
            },
          },
        ),
      },
    ],
    ["array provenance", { ...base, provenance: [] }],
  ];
  for (const [label, record] of malformed) {
    expectThrow(
      "INVALID_INPUT",
      () => recordNodeExecution(store, record as unknown as NodeExecutionRecord),
      `${label} rejected`,
    );
  }
  const after = store.getSnapshot("run-001");
  assert(
    after?.events.length === before?.events.length && after?.state.lastSequence === before?.state.lastSequence,
    "rejected inputs append no event",
  );
  assert(after?.state.updatedAt === before?.state.updatedAt, "rejected inputs cause no state change");
});

console.log("provenance: recordNodeExecution returns a frozen persisted event");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  const returned = recordNodeExecution(store, {
    runId: "run-001",
    stage: "prepare_workspace",
    attempt: 1,
    kind: "stage_started",
    createdAt: TS,
    provenance: validProvenance(),
  });
  assert(Object.isFrozen(returned), "returned event is frozen");
  const persisted = store.getSnapshot("run-001")?.events.at(-1);
  assert(persisted?.eventId === returned.eventId, "returned event matches persisted event id");
  assert(
    persisted?.bindingId === returned.bindingId && persisted?.inputArtifactRef === returned.inputArtifactRef,
    "returned event matches persisted provenance",
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

// ── real historical-data regression (pre-extension rows with legacy hashes) ──
// The legacy canonical form is re-derived here from the 13 pre-extension
// fields (not imported from production code) so this test anchors the exact
// serialization historical journals were persisted with.

function legacyEventSha256(event: LoopRunEvent): string {
  const ordered = {
    eventId: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    createdAt: event.createdAt,
    inputDigest: event.inputDigest,
    outputArtifactRef: event.outputArtifactRef,
    outputDigest: event.outputDigest,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
  };
  return createHash("sha256").update(JSON.stringify(ordered), "utf8").digest("hex");
}

// The extended canonical form, likewise re-derived independently so the
// migration assertions anchor the exact post-migration serialization.
function extendedEventSha256(event: LoopRunEvent): string {
  const ordered = {
    eventId: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    createdAt: event.createdAt,
    inputDigest: event.inputDigest,
    outputArtifactRef: event.outputArtifactRef,
    outputDigest: event.outputDigest,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
    bindingId: event.bindingId,
    bindingVersion: event.bindingVersion,
    inputArtifactRef: event.inputArtifactRef,
  };
  return createHash("sha256").update(JSON.stringify(ordered), "utf8").digest("hex");
}

/**
 * Builds a journal exactly as the pre-extension store would have persisted
 * it: schema without the provenance columns, one run whose events carry a
 * canonical_sha256 computed over the legacy 13-field form. With
 * `withRunStarted`, a second (run_started) event is appended and the run row
 * is advanced consistently.
 */
function seedHistoricalLegacyJournal(path: string, opts?: { withRunStarted?: boolean }): void {
  const identity = makeIdentity();
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
  const identitySha = createHash("sha256").update(canonicalizeLoopRunIdentity(identity), "utf8").digest("hex");
  const created = makeEvent({ sequence: 1, kind: "run_created", attempt: 0 });
  const started = opts?.withRunStarted === true ? makeEvent({ sequence: 2, kind: "run_started" }) : null;
  const last = started ?? created;
  db.prepare(
    `INSERT INTO loop_runs (
      run_id, requirement_id, repository, repository_path, base_branch,
      expected_base_sha, task_branch, control_root, status, current_stage,
      current_attempt, fix_round, last_sequence, last_event_id,
      blocking_reason_code, failure_reason_code, created_at, updated_at,
      identity_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    identity.runId,
    identity.requirementId,
    identity.repository,
    identity.repositoryPath,
    identity.baseBranch,
    identity.expectedBaseSha,
    identity.taskBranch,
    identity.controlRoot,
    started === null ? "created" : "running",
    null,
    0,
    0,
    last.sequence,
    last.eventId,
    null,
    null,
    identity.createdAt,
    last.createdAt,
    identitySha,
  );
  const stageInsert = db.prepare(
    "INSERT INTO loop_stage_states (run_id, stage, status, attempt, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const stage of LOOP_STAGE_NAMES) {
    stageInsert.run(identity.runId, stage, "pending", 0, identity.createdAt);
  }
  const eventInsert = db.prepare(
    `INSERT INTO loop_events (
      event_id, run_id, sequence, kind, stage, attempt, created_at,
      input_digest, output_artifact_ref, output_digest, error_code,
      retryable, reason_code, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const legacyEvent of started === null ? [created] : [created, started]) {
    eventInsert.run(
      legacyEvent.eventId,
      legacyEvent.runId,
      legacyEvent.sequence,
      legacyEvent.kind,
      legacyEvent.stage,
      legacyEvent.attempt,
      legacyEvent.createdAt,
      legacyEvent.inputDigest,
      legacyEvent.outputArtifactRef,
      legacyEvent.outputDigest,
      legacyEvent.errorCode,
      legacyEvent.retryable,
      legacyEvent.reasonCode,
      legacyEventSha256(legacyEvent),
    );
  }
  db.close();
}

console.log("provenance: historical legacy rows read back after migration");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  seedHistoricalLegacyJournal(path);
  const created = makeEvent({ sequence: 1, kind: "run_created", attempt: 0 });
  const legacyHash = legacyEventSha256(created);
  const extendedHash = extendedEventSha256(created);

  const store = new LoopRunStore(path);
  store.init();
  try {
    const snapshot = store.getSnapshot("run-001");
    assert(snapshot !== undefined, "historical run snapshot reads back");
    assert(snapshot?.state.status === "created", "historical run status replays as created");
    const createdEvent = snapshot?.events[0];
    assert(createdEvent?.kind === "run_created", "historical run_created event present");
    assert(createdEvent?.bindingId === null, "historical event provenance reads as null");
    assert(createdEvent?.bindingVersion === null, "historical binding version reads as null");
    assert(createdEvent?.inputArtifactRef === null, "historical input artifact ref reads as null");
    const context = recoverRunContext(store, "req-001");
    assert(context?.status === "created", "historical run recoverable via recoverRunContext");
  } finally {
    store.close();
  }
  // The migration verifies the legacy hash, then atomically rewrites it to
  // the extended form and marks the journal normalized.
  const db = new Database(path, { readonly: true });
  const row = db.prepare("SELECT canonical_sha256 FROM loop_events WHERE sequence = 1").get() as
    | { canonical_sha256: string }
    | undefined;
  const formatVersion = db.pragma("user_version", { simple: true });
  db.close();
  assert(row?.canonical_sha256 === extendedHash, "legacy hash atomically rewritten to extended form");
  assert(row?.canonical_sha256 !== legacyHash, "stored hash no longer the legacy form");
  assert(formatVersion === 5, "journal migrated through finding-lifecycle schema (user_version = 5)");
  rmSync(dir, { recursive: true, force: true });
}

console.log("provenance: new provenance events append onto historical run");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  seedHistoricalLegacyJournal(path);

  const store = new LoopRunStore(path);
  store.init();
  try {
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
    const snapshot = store.getSnapshot("run-001");
    assert(snapshot?.events.length === 3, "historical run accepts new events after migration");
    assert(
      snapshot?.events.some((e) => e.bindingId === "binding-codex-implementation") === true,
      "new provenance event persisted on historical run",
    );
    const context = recoverRunContext(store, "req-001");
    assert(context?.currentStage === "prepare_workspace", "historical run continues to new stage");
    assert(
      context?.lastExecution?.bindingId === "binding-codex-implementation",
      "recovery exposes new provenance on historical run",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("provenance: tampered historical row is still STORE_CORRUPT");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  seedHistoricalLegacyJournal(path);
  // Tamper with the persisted hash itself: the init() migration cannot
  // verify it against either form and aborts before opening the store.
  const db = new Database(path);
  db.prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE sequence = 1").run("0".repeat(64));
  db.close();
  const store = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store.init(), "tampered legacy hash rejected at migration");
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  seedHistoricalLegacyJournal(path);
  // Tamper with event content while keeping the original legacy hash.
  const db = new Database(path);
  db.prepare("UPDATE loop_events SET input_digest = ? WHERE sequence = 1").run("f".repeat(64));
  db.close();
  const store = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store.init(), "tampered legacy content rejected at migration");
  store.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("provenance: extended row carrying a valid legacy hash is STORE_CORRUPT");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  // Persist a run with the current version: all hashes are extended-form.
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store1.close();
  // Replace one extended hash with the valid legacy hash of the same event.
  // After migration the format source is fixed, so this downgrade must fail.
  const legacyHash = legacyEventSha256(makeEvent({ sequence: 2, kind: "run_started" }));
  const db = new Database(path);
  db.prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE sequence = 2").run(legacyHash);
  db.close();
  const store2 = new LoopRunStore(path);
  store2.init();
  try {
    expectThrow("STORE_CORRUPT", () => store2.getSnapshot("run-001"), "downgraded legacy hash rejected on read");
    expectThrow("STORE_CORRUPT", () => store2.getRun("run-001"), "downgraded legacy hash rejected for getRun");
  } finally {
    store2.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("provenance: failed migration rolls back columns, hashes and user_version");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
  const path = join(dir, "journal.db");
  // Two historical events: the first has a valid legacy hash, the second is
  // corrupt. The migration must fail on the second row without persisting
  // any partial work from the first.
  seedHistoricalLegacyJournal(path, { withRunStarted: true });
  const firstLegacyHash = legacyEventSha256(makeEvent({ sequence: 1, kind: "run_created", attempt: 0 }));
  const db0 = new Database(path);
  db0.prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE sequence = 2").run("0".repeat(64));
  db0.close();

  const store = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store.init(), "corrupt second event aborts migration");
  store.close();

  const db = new Database(path, { readonly: true });
  const rows = db.prepare("SELECT sequence, canonical_sha256 FROM loop_events ORDER BY sequence ASC").all() as Array<{
    sequence: number;
    canonical_sha256: string;
  }>;
  const columns = db.prepare("PRAGMA table_info(loop_events)").all() as Array<{ name: string }>;
  const formatVersion = db.pragma("user_version", { simple: true });
  db.close();
  assert(rows[0]?.canonical_sha256 === firstLegacyHash, "first row hash not rewritten after rollback");
  assert(rows[1]?.canonical_sha256 === "0".repeat(64), "corrupt row untouched after rollback");
  assert(formatVersion === 0, "user_version still 0 after rollback");
  assert(
    !columns.some((c) => c.name === "binding_id" || c.name === "binding_version" || c.name === "input_artifact_ref"),
    "provenance columns not persisted after rollback",
  );
  const dbCapability = new Database(path, { readonly: true });
  const capabilityTable = dbCapability
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_capability_executions'")
    .get();
  dbCapability.close();
  assert(capabilityTable === undefined, "capability execution table not persisted after rollback");
  // The failed migration is retryable: fixing the corruption lets init succeed.
  const dbFix = new Database(path);
  dbFix
    .prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE sequence = 2")
    .run(legacyEventSha256(makeEvent({ sequence: 2, kind: "run_started" })));
  dbFix.close();
  const store2 = new LoopRunStore(path);
  store2.init();
  try {
    const snapshot = store2.getSnapshot("run-001");
    assert(snapshot?.events.length === 2, "repaired journal migrates and reads back");
    assert(snapshot?.state.status === "running", "repaired journal replays to running");
  } finally {
    store2.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("provenance: unknown journal format version is STORE_CORRUPT");
{
  for (const badVersion of [6, -1]) {
    const dir = mkdtempSync(join(tmpdir(), "loop-provenance-"));
    const path = join(dir, "journal.db");
    const store = new LoopRunStore(path);
    store.init();
    store.createRun(makeIdentity());
    store.close();
    const db = new Database(path);
    db.pragma(`user_version = ${badVersion}`);
    db.close();
    const store2 = new LoopRunStore(path);
    expectThrow("STORE_CORRUPT", () => store2.init(), `user_version ${badVersion} rejected`);
    store2.close();
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
