// LOOP Run Store — Tests (LOOP-MVP-01A)
// ======================================
// SQLite durable journal tests. All databases live in disposable temp
// directories outside the repository. No Git, no network, no Agent.

import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
  type LoopStageName,
} from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";

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

const TS = "2026-07-26T00:00:00.000Z";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-store-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-store-test-run-001",
    controlRoot: "/tmp/loop-store-test/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `run-001:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
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

function openStore(dir: string, name = "journal.db"): LoopRunStore {
  const store = new LoopRunStore(join(dir, name));
  store.init();
  return store;
}

function test(): void {
  console.log("LOOP Run Store Tests (01A)\n");

  const tempRoot = mkdtempSync(join(tmpdir(), "loop-mvp-01a-store-"));
  try {
    // ── constructor and init guards ──
    console.log("constructor and init guards");
    expectThrow("INVALID_INPUT", () => new LoopRunStore(""), "empty dbPath rejected");
    expectThrow("INVALID_INPUT", () => new LoopRunStore("relative/journal.db"), "relative dbPath rejected");
    expectThrow("INVALID_INPUT", () => new LoopRunStore(tempRoot), "directory dbPath rejected");
    {
      const store = new LoopRunStore(join(tempRoot, "guards.db"));
      expectThrow("STORE_CLOSED", () => store.createRun(makeIdentity()), "createRun before init rejected");
      expectThrow("STORE_CLOSED", () => store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" })), "appendEvent before init rejected");
      expectThrow("STORE_CLOSED", () => store.getRun("run-001"), "getRun before init rejected");
      expectThrow("STORE_CLOSED", () => store.listEvents("run-001"), "listEvents before init rejected");
      store.init();
      store.close();
      expectThrow("STORE_CLOSED", () => store.getRun("run-001"), "getRun after close rejected");
      expectThrow("STORE_CLOSED", () => store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" })), "appendEvent after close rejected");
      expectThrow("STORE_CLOSED", () => store.init(), "re-init same instance rejected");
      store.close();
      store.close();
      assert(true, "close is idempotent");
    }

    // ── schema, pragmas, indexes ──
    console.log("schema and pragmas");
    const schemaDir = mkdtempSync(join(tempRoot, "schema-"));
    {
      const store = openStore(schemaDir);
      const db = new Database(join(schemaDir, "journal.db"), { readonly: true });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
      assert(tables.includes("loop_runs") && tables.includes("loop_stage_states") && tables.includes("loop_events"), "three schema tables exist");
      const journalMode = (db.pragma("journal_mode", { simple: true }) as string).toLowerCase();
      assert(journalMode === "wal", "WAL mode enabled");
      const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
      assert(foreignKeys === 1, "foreign_keys ON");
      const busyTimeout = db.pragma("busy_timeout", { simple: true }) as number;
      assert(busyTimeout > 0 && busyTimeout <= 5000, "busy_timeout fixed positive <= 5000");
      const runIndexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'loop_runs'").all() as Array<{ name: string }>).map((row) => row.name);
      assert(runIndexes.includes("idx_loop_runs_status"), "loop_runs.status index exists");
      const eventIndexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'loop_events'").all() as Array<{ name: string }>).map((row) => row.name);
      assert(eventIndexes.includes("idx_loop_events_run_id"), "loop_events.run_id index exists");
      const stageIndexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'loop_stage_states'").all() as Array<{ name: string }>).map((row) => row.name);
      assert(stageIndexes.includes("idx_loop_stage_states_run_id"), "loop_stage_states.run_id index exists");
      const eventUnique = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'loop_events'").get() as { sql: string }).sql;
      assert(eventUnique.includes("UNIQUE (run_id, sequence)"), "UNIQUE(run_id, sequence) constraint exists");
      const stagePk = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'loop_stage_states'").get() as { sql: string }).sql;
      assert(stagePk.includes("PRIMARY KEY (run_id, stage)"), "stage PRIMARY KEY(run_id, stage) exists");
      assert(stagePk.includes("ON DELETE CASCADE") && eventUnique.includes("ON DELETE CASCADE"), "foreign keys cascade");
      const allColumns = ["loop_runs", "loop_stage_states", "loop_events"].flatMap(
        (table) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name),
      );
      const forbiddenColumn = allColumns.find((name) => /payload|context|metadata|^raw_/i.test(name));
      assert(forbiddenColumn === undefined, "no payload/context/metadata/raw_* columns");
      db.close();
      store.close();
    }

    // ── createRun and reconstruction ──
    console.log("createRun and reconstruction");
    const mainDir = mkdtempSync(join(tempRoot, "main-"));
    {
      const store = openStore(mainDir);
      const identity = makeIdentity();
      const state = store.createRun(identity);
      assert(state.status === "created" && state.lastSequence === 1, "createRun returns initial state");
      assert(Object.keys(state.stages).length === 8, "eight stage rows");
      const events = store.listEvents("run-001");
      assert(events.length === 1 && events[0]!.kind === "run_created" && events[0]!.eventId === "run-001:1:run_created", "run_created event persisted");
      const readBack = store.getRun("run-001");
      assert(readBack !== undefined && readBack.status === "created", "getRun reconstructs state");
      assert(store.getRun("run-missing") === undefined, "getRun missing returns undefined");
      assert(store.listEvents("run-missing").length === 0, "listEvents missing returns empty array");

      // idempotent create
      const again = store.createRun(identity);
      assert(again.lastSequence === 1 && store.listEvents("run-001").length === 1, "exact identity create is idempotent (no new event)");
      const readAgain = store.getRun("run-001")!;
      assert(readAgain.updatedAt === readBack!.updatedAt, "idempotent create keeps updated_at");

      // conflicting identity
      expectThrow("RUN_ID_CONFLICT", () => store.createRun(makeIdentity({ requirementId: "req-other" })), "conflicting identity rejected");
      assert(store.listEvents("run-001").length === 1, "conflict leaves DB unmodified");

      // independent runs
      const identity2 = makeIdentity({ runId: "run-002" });
      const state2 = store.createRun(identity2);
      assert(state2.identity.runId === "run-002", "independent run created");
      assert(store.getRun("run-001")!.lastSequence === 1, "independent run does not affect run-001");
      store.close();

      // restart persistence with a new instance
      const reopened = new LoopRunStore(join(mainDir, "journal.db"));
      reopened.init();
      const persisted = reopened.getRun("run-001");
      assert(persisted !== undefined && persisted.status === "created", "restart persistence: run survives process restart");
      assert(reopened.listEvents("run-002").length === 1, "restart persistence: second run survives");
      reopened.close();
    }

    // ── append, ordering, idempotency, conflicts, rollback ──
    console.log("append and integrity");
    const appendDir = mkdtempSync(join(tempRoot, "append-"));
    {
      const store = openStore(appendDir);
      store.createRun(makeIdentity());
      let state = store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
      assert(state.status === "running" && state.lastSequence === 2, "append run_started");
      state = store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }));
      assert(state.currentStage === "prepare_workspace" && state.currentAttempt === 1, "append stage_started");
      const succeededEvent = makeEvent({ sequence: 4, kind: "stage_succeeded", stage: "prepare_workspace", attempt: 1, outputDigest: "d".repeat(64) });
      state = store.appendEvent(succeededEvent);
      assert(state.stages.prepare_workspace.status === "succeeded" && state.currentStage === null, "append stage_succeeded");
      assert(store.listEvents("run-001").map((event) => event.sequence).join(",") === "1,2,3,4", "listEvents ordered by sequence");

      // exact duplicate event idempotency
      const replayed = store.appendEvent(succeededEvent);
      assert(replayed.lastSequence === 4 && store.listEvents("run-001").length === 4, "exact duplicate event is idempotent replay");

      // conflicting duplicate event id
      expectThrow("EVENT_ID_CONFLICT", () =>
        store.appendEvent(makeEvent({
          sequence: 4,
          kind: "stage_succeeded",
          stage: "prepare_workspace",
          attempt: 1,
          eventId: "run-001:4:stage_succeeded:prepare_workspace",
          outputDigest: "e".repeat(64),
        })),
        "conflicting duplicate eventId rejected",
      );

      // sequence conflict
      expectThrow("EVENT_SEQUENCE_CONFLICT", () =>
        store.appendEvent(makeEvent({ sequence: 4, kind: "run_paused", eventId: "run-001:4:run_paused" })),
        "sequence conflict rejected",
      );
      expectThrow("EVENT_SEQUENCE_CONFLICT", () =>
        store.appendEvent(makeEvent({ sequence: 6, kind: "run_paused" })),
        "skipped sequence rejected",
      );

      // RUN_NOT_FOUND
      expectThrow("RUN_NOT_FOUND", () =>
        store.appendEvent(makeEvent({ sequence: 2, kind: "run_started", runId: "run-ghost", eventId: "run-ghost:2:run_started" })),
        "append to missing run rejected",
      );

      // illegal transition rollback
      const before = store.getRun("run-001")!;
      expectThrow("ILLEGAL_TRANSITION", () =>
        store.appendEvent(makeEvent({ sequence: 5, kind: "run_completed" })),
        "illegal run_completed rejected",
      );
      const after = store.getRun("run-001")!;
      assert(
        after.lastSequence === before.lastSequence && after.status === before.status && after.updatedAt === before.updatedAt,
        "illegal transition rolls back loop_runs",
      );
      assert(store.listEvents("run-001").length === 4, "illegal transition rolls back loop_events");
      const stageRow = after.stages.prepare_workspace;
      assert(stageRow.status === "succeeded" && stageRow.attempt === 1, "stage rows unchanged after rollback");

      // terminal mutation rollback
      const failed = store.appendEvent(makeEvent({ sequence: 5, kind: "run_failed", errorCode: "EXEC_ERROR" }));
      assert(failed.status === "failed", "run -> failed terminal");
      expectThrow("TERMINAL_RUN", () =>
        store.appendEvent(makeEvent({ sequence: 6, kind: "run_resumed" })),
        "terminal mutation rejected",
      );
      assert(store.getRun("run-001")!.status === "failed", "terminal rollback keeps failed status");
      assert(store.listEvents("run-001").length === 5, "terminal rollback keeps event count");
      store.close();
    }

    // ── corruption detection ──
    console.log("corruption detection");
    const corruptDir = mkdtempSync(join(tempRoot, "corrupt-"));
    const corruptDbPath = join(corruptDir, "journal.db");
    {
      const store = new LoopRunStore(corruptDbPath);
      store.init();
      store.createRun(makeIdentity());
      store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
      store.close();

      const tamper = (sql: string, params: unknown[]): void => {
        const db = new Database(corruptDbPath);
        db.prepare(sql).run(...params);
        db.close();
      };
      const reopenExpectingCorrupt = (message: string): void => {
        const store2 = new LoopRunStore(corruptDbPath);
        store2.init();
        expectThrow("STORE_CORRUPT", () => store2.getRun("run-001"), message);
        store2.close();
      };
      const restoreFrom = (backup: string): void => {
        const db = new Database(corruptDbPath);
        db.exec(`DELETE FROM loop_events; DELETE FROM loop_stage_states; DELETE FROM loop_runs;`);
        db.exec(backup);
        db.close();
      };
      const db = new Database(corruptDbPath);
      const backupRuns = (db.prepare("SELECT * FROM loop_runs").all() as Array<Record<string, unknown>>);
      const backupStages = (db.prepare("SELECT * FROM loop_stage_states").all() as Array<Record<string, unknown>>);
      const backupEvents = (db.prepare("SELECT * FROM loop_events").all() as Array<Record<string, unknown>>);
      const backupSql = (() => {
        const quote = (value: unknown): string => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
        const runs = backupRuns.map((row) => `INSERT INTO loop_runs VALUES (${Object.values(row).map(quote).join(",")});`).join("\n");
        const stages = backupStages.map((row) => `INSERT INTO loop_stage_states VALUES (${Object.values(row).map(quote).join(",")});`).join("\n");
        const events = backupEvents.map((row) => `INSERT INTO loop_events VALUES (${Object.values(row).map(quote).join(",")});`).join("\n");
        return `${runs}\n${stages}\n${events}`;
      })();
      db.close();

      // missing stage row
      tamper("DELETE FROM loop_stage_states WHERE run_id = ? AND stage = ?", ["run-001", "review"]);
      reopenExpectingCorrupt("missing stage row corruption detected");
      restoreFrom(backupSql);

      // unknown stage row
      tamper("INSERT INTO loop_stage_states (run_id, stage, status, attempt, updated_at) VALUES (?, ?, ?, ?, ?)", ["run-001", "bogus_stage", "pending", 0, TS]);
      reopenExpectingCorrupt("unknown stage row corruption detected");
      restoreFrom(backupSql);

      // event hash corruption
      tamper("UPDATE loop_events SET canonical_sha256 = ? WHERE event_id = ?", ["0".repeat(64), "run-001:2:run_started"]);
      reopenExpectingCorrupt("event hash corruption detected");
      restoreFrom(backupSql);

      // identity hash corruption
      tamper("UPDATE loop_runs SET identity_sha256 = ? WHERE run_id = ?", ["1".repeat(64), "run-001"]);
      reopenExpectingCorrupt("identity hash corruption detected");
      restoreFrom(backupSql);

      // last_event_id corruption
      tamper("UPDATE loop_runs SET last_event_id = ? WHERE run_id = ?", ["bogus", "run-001"]);
      reopenExpectingCorrupt("last_event_id corruption detected");
      restoreFrom(backupSql);

      // sequence gap corruption
      tamper("DELETE FROM loop_events WHERE event_id = ?", ["run-001:2:run_started"]);
      tamper("UPDATE loop_runs SET last_sequence = ?, last_event_id = ? WHERE run_id = ?", [1, "run-001:1:run_created", "run-001"]);
      const storeGap = new LoopRunStore(corruptDbPath);
      storeGap.init();
      expectThrow("STORE_CORRUPT", () => storeGap.listEvents("run-001"), "sequence gap corruption detected via listEvents");
      storeGap.close();
      restoreFrom(backupSql);

      // persisted state mismatch corruption
      tamper("UPDATE loop_runs SET status = ? WHERE run_id = ?", ["completed", "run-001"]);
      reopenExpectingCorrupt("persisted-vs-replayed state mismatch corruption detected");
      restoreFrom(backupSql);

      // clean restore passes again
      const storeOk = new LoopRunStore(corruptDbPath);
      storeOk.init();
      assert(storeOk.getRun("run-001")!.status === "running", "clean restore passes corruption check");
      storeOk.close();
    }

    // ── Finding A: persisted validation error classification ──
    console.log("persisted error classification");
    const classDir = mkdtempSync(join(tempRoot, "class-"));
    const classDbPath = join(classDir, "journal.db");
    {
      const store = new LoopRunStore(classDbPath);
      store.init();
      store.createRun(makeIdentity());
      store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
      store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }));
      store.close();

      const tamper = (sql: string, params: unknown[]): void => {
        const db = new Database(classDbPath);
        db.prepare(sql).run(...params);
        db.close();
      };
      const restore = (sql: string, params: unknown[]): void => tamper(sql, params);
      const expectCorruptBoth = (message: string): void => {
        const store2 = new LoopRunStore(classDbPath);
        store2.init();
        expectThrow("STORE_CORRUPT", () => store2.getRun("run-001"), `${message} (getRun)`);
        expectThrow("STORE_CORRUPT", () => store2.listEvents("run-001"), `${message} (listEvents consistent)`);
        store2.close();
      };

      tamper("UPDATE loop_runs SET repository_path = ? WHERE run_id = ?", ["relative/path", "run-001"]);
      expectCorruptBoth("persisted relative repository_path classified as STORE_CORRUPT");
      restore("UPDATE loop_runs SET repository_path = ? WHERE run_id = ?", ["/tmp/loop-store-test/target-repo", "run-001"]);

      tamper("UPDATE loop_runs SET expected_base_sha = ? WHERE run_id = ?", ["not-a-sha", "run-001"]);
      expectCorruptBoth("persisted invalid expected_base_sha classified as STORE_CORRUPT");
      restore("UPDATE loop_runs SET expected_base_sha = ? WHERE run_id = ?", ["a".repeat(40), "run-001"]);

      tamper("UPDATE loop_runs SET created_at = ? WHERE run_id = ?", ["not-a-date", "run-001"]);
      expectCorruptBoth("persisted invalid created_at classified as STORE_CORRUPT");
      restore("UPDATE loop_runs SET created_at = ? WHERE run_id = ?", [TS, "run-001"]);

      tamper("UPDATE loop_events SET kind = ? WHERE event_id = ?", ["bogus_kind", "run-001:3:stage_started:prepare_workspace"]);
      expectCorruptBoth("persisted invalid event kind classified as STORE_CORRUPT");
      restore("UPDATE loop_events SET kind = ? WHERE event_id = ?", ["stage_started", "run-001:3:stage_started:prepare_workspace"]);

      tamper("UPDATE loop_events SET stage = ? WHERE event_id = ?", ["bogus_stage", "run-001:3:stage_started:prepare_workspace"]);
      expectCorruptBoth("persisted invalid event stage classified as STORE_CORRUPT");
      restore("UPDATE loop_events SET stage = ? WHERE event_id = ?", ["prepare_workspace", "run-001:3:stage_started:prepare_workspace"]);

      tamper("UPDATE loop_events SET attempt = ? WHERE event_id = ?", [-1, "run-001:3:stage_started:prepare_workspace"]);
      expectCorruptBoth("persisted invalid event attempt classified as STORE_CORRUPT");
      restore("UPDATE loop_events SET attempt = ? WHERE event_id = ?", [1, "run-001:3:stage_started:prepare_workspace"]);

      tamper("UPDATE loop_events SET input_digest = ? WHERE event_id = ?", ["zz", "run-001:3:stage_started:prepare_workspace"]);
      expectCorruptBoth("persisted invalid event digest classified as STORE_CORRUPT");
      restore("UPDATE loop_events SET input_digest = ? WHERE event_id = ?", [null, "run-001:3:stage_started:prepare_workspace"]);

      tamper("UPDATE loop_events SET attempt = ? WHERE event_id = ?", [1.5, "run-001:3:stage_started:prepare_workspace"]);
      expectCorruptBoth("non-canonical persisted integer classified as STORE_CORRUPT");
      restore("UPDATE loop_events SET attempt = ? WHERE event_id = ?", [1, "run-001:3:stage_started:prepare_workspace"]);

      const storeClean = new LoopRunStore(classDbPath);
      storeClean.init();
      assert(storeClean.getRun("run-001")!.status === "running", "classification restores cleanly");
      storeClean.close();
    }

    // ── Finding B: full canonical run_created trust root ──
    console.log("full canonical run_created verification");
    const trustDir = mkdtempSync(join(tempRoot, "trust-"));
    const trustDbPath = join(trustDir, "journal.db");
    {
      const store = new LoopRunStore(trustDbPath);
      store.init();
      store.createRun(makeIdentity());
      store.close();

      const recomputeFirstHash = (): void => {
        const db = new Database(trustDbPath);
        const row = db.prepare("SELECT * FROM loop_events WHERE event_id = ?").get("run-001:1:run_created") as Record<string, unknown>;
        const canonical = JSON.stringify({
          eventId: row.event_id,
          runId: row.run_id,
          sequence: row.sequence,
          kind: row.kind,
          stage: row.stage,
          attempt: row.attempt,
          createdAt: row.created_at,
          inputDigest: row.input_digest,
          outputArtifactRef: row.output_artifact_ref,
          outputDigest: row.output_digest,
          errorCode: row.error_code,
          retryable: row.retryable === null ? null : row.retryable === 1,
          reasonCode: row.reason_code,
        });
        const { createHash } = require("node:crypto");
        const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
        db.prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE event_id = ?").run(hash, "run-001:1:run_created");
        db.close();
      };
      const expectTrustCorrupt = (message: string): void => {
        const store2 = new LoopRunStore(trustDbPath);
        store2.init();
        expectThrow("STORE_CORRUPT", () => store2.getRun("run-001"), message);
        store2.close();
      };

      // drift input_digest to a format-valid non-null value and re-sync the hash
      {
        const db = new Database(trustDbPath);
        db.prepare("UPDATE loop_events SET input_digest = ? WHERE event_id = ?").run("f".repeat(64), "run-001:1:run_created");
        db.close();
        recomputeFirstHash();
        expectTrustCorrupt("run_created drift with synced hash rejected (input_digest)");
      }
      // restore via fresh DB
      {
        rmSync(trustDbPath, { force: true });
        const store2 = new LoopRunStore(trustDbPath);
        store2.init();
        store2.createRun(makeIdentity());
        store2.close();
      }
      // drift createdAt with synced hash
      {
        const db = new Database(trustDbPath);
        db.prepare("UPDATE loop_events SET created_at = ? WHERE event_id = ?").run("2026-07-26T01:00:00.000Z", "run-001:1:run_created");
        db.close();
        recomputeFirstHash();
        expectTrustCorrupt("run_created drift with synced hash rejected (createdAt)");
      }
      // drift reason_code with synced hash
      {
        rmSync(trustDbPath, { force: true });
        const store2 = new LoopRunStore(trustDbPath);
        store2.init();
        store2.createRun(makeIdentity());
        store2.close();
        const db = new Database(trustDbPath);
        db.prepare("UPDATE loop_events SET reason_code = ? WHERE event_id = ?").run("SOME_REASON", "run-001:1:run_created");
        db.close();
        recomputeFirstHash();
        expectTrustCorrupt("run_created drift with synced hash rejected (reason_code)");
      }
      // clean DB still passes
      {
        rmSync(trustDbPath, { force: true });
        const store2 = new LoopRunStore(trustDbPath);
        store2.init();
        store2.createRun(makeIdentity());
        assert(store2.getRun("run-001")!.status === "created", "clean run_created trust root passes");
        store2.close();
      }
    }

    // ── Finding C: raw retryable canonicality ──
    console.log("raw retryable canonicality");
    const retryDir = mkdtempSync(join(tempRoot, "retry-"));
    const retryDbPath = join(retryDir, "journal.db");
    {
      // Simulate a pre-existing DB without the CHECK constraint (older or
      // externally damaged database): the read path must still defend.
      const setup = new Database(retryDbPath);
      setup.exec(`
        CREATE TABLE loop_runs (
          run_id TEXT PRIMARY KEY,
          requirement_id TEXT NOT NULL,
          repository TEXT NOT NULL,
          repository_path TEXT NOT NULL,
          base_branch TEXT NOT NULL,
          expected_base_sha TEXT NOT NULL,
          task_branch TEXT NOT NULL,
          control_root TEXT NOT NULL,
          status TEXT NOT NULL,
          current_stage TEXT,
          current_attempt INTEGER NOT NULL,
          fix_round INTEGER NOT NULL,
          last_sequence INTEGER NOT NULL,
          last_event_id TEXT NOT NULL,
          blocking_reason_code TEXT,
          failure_reason_code TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          identity_sha256 TEXT NOT NULL
        );
        CREATE INDEX idx_loop_runs_status ON loop_runs(status);
        CREATE TABLE loop_stage_states (
          run_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (run_id, stage),
          FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
        );
        CREATE INDEX idx_loop_stage_states_run_id ON loop_stage_states(run_id);
        CREATE TABLE loop_events (
          event_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          kind TEXT NOT NULL,
          stage TEXT,
          attempt INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          input_digest TEXT,
          output_artifact_ref TEXT,
          output_digest TEXT,
          error_code TEXT,
          retryable INTEGER,
          reason_code TEXT,
          canonical_sha256 TEXT NOT NULL,
          UNIQUE (run_id, sequence),
          FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
        );
        CREATE INDEX idx_loop_events_run_id ON loop_events(run_id);
      `);
      setup.close();

      const store = new LoopRunStore(retryDbPath);
      store.init();
      store.createRun(makeIdentity());
      store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
      store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1, retryable: false }));
      store.close();

      // raw retryable = 2 without touching canonical hash must be rejected
      {
        const db = new Database(retryDbPath);
        db.prepare("UPDATE loop_events SET retryable = ? WHERE event_id = ?").run(2, "run-001:3:stage_started:prepare_workspace");
        db.close();
        const store2 = new LoopRunStore(retryDbPath);
        store2.init();
        expectThrow("STORE_CORRUPT", () => store2.getRun("run-001"), "raw retryable=2 rejected via getRun");
        expectThrow("STORE_CORRUPT", () => store2.listEvents("run-001"), "raw retryable=2 rejected via listEvents");
        store2.close();
      }
      // schema CHECK for new databases
      {
        const freshDir = mkdtempSync(join(tempRoot, "retry-fresh-"));
        const freshStore = new LoopRunStore(join(freshDir, "journal.db"));
        freshStore.init();
        const db = new Database(join(freshDir, "journal.db"), { readonly: true });
        const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'loop_events'").get() as { sql: string }).sql;
        assert(sql.includes("retryable IS NULL OR retryable IN (0, 1)"), "new schema has retryable CHECK constraint");
        db.close();
        freshStore.close();
      }
    }

    // ── Finding D: safe bounded error messages ──
    console.log("safe bounded error messages");
    const sentinelDir = mkdtempSync(join(tempRoot, "sentinel-"));
    const sentinelDbPath = join(sentinelDir, "journal.db");
    {
      const store = new LoopRunStore(sentinelDbPath);
      store.init();
      store.createRun(makeIdentity());
      store.close();

      const sentinelStage = "UNIQUE_SECRET_SENTINEL_STAGE";
      const sentinelEventId = "RAW_PROMPT_SENTINEL_EVENT_ID";
      {
        const db = new Database(sentinelDbPath);
        db.prepare("INSERT INTO loop_stage_states (run_id, stage, status, attempt, updated_at) VALUES (?, ?, ?, ?, ?)").run(
          "run-001", sentinelStage, "pending", 0, TS,
        );
        db.prepare("UPDATE loop_events SET event_id = ? WHERE event_id = ?").run(sentinelEventId, "run-001:1:run_created");
        db.close();
        const store2 = new LoopRunStore(sentinelDbPath);
        store2.init();
        try {
          store2.getRun("run-001");
          assert(false, "sentinel corruption throws (no error)");
        } catch (error) {
          const journalError = error as LoopRunJournalError;
          assert(journalError.code === "STORE_CORRUPT", "sentinel corruption classified STORE_CORRUPT");
          assert(!journalError.message.includes("UNIQUE_SECRET_SENTINEL"), "corrupt message does not echo persisted stage sentinel");
          assert(!journalError.message.includes("RAW_PROMPT_SENTINEL"), "corrupt message does not echo persisted eventId sentinel");
          assert(journalError.message.length <= 256, "corrupt message within length bound");
          assert(!/[\x00-\x1f\x7f]/.test(journalError.message), "corrupt message has no control characters");
        }
        store2.close();
      }
    }

    // ── no sensitive sentinel data in DB ──
    console.log("no sensitive data in DB");
    {
      const db = new Database(corruptDbPath, { readonly: true });
      const texts: string[] = [];
      for (const table of ["loop_runs", "loop_stage_states", "loop_events"]) {
        const rows = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
        for (const row of rows) {
          for (const value of Object.values(row)) {
            if (typeof value === "string") texts.push(value);
          }
        }
      }
      const sentinel = ["RAW_PROMPT", "PATCH_BODY", "STDOUT", "STDERR", "SECRET", "PASSWORD", "TOKEN", "process.env"];
      const hit = texts.find((text) => sentinel.some((word) => text.includes(word)));
      assert(hit === undefined, "DB contains no raw prompt/patch/stdout/stderr/credential sentinels");
      db.close();
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    assert(!existsSync(tempRoot), "temp directory removed (db, wal, shm cleaned)");
    const leftovers = readdirSync(tmpdir()).filter((name) => name.startsWith("loop-mvp-01a-store-"));
    assert(leftovers.length === 0, "no leftover temp dirs");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test();
