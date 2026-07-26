// LOOP Executor Kernel — Durable SQLite Run Journal Store (LOOP-MVP-01A)
// ======================================================================
// better-sqlite3 backed append-only run journal. Each store instance owns
// exactly one connection. Only fixed safe scalars are persisted — never raw
// prompt, patch, stdout, stderr, credentials, environment maps, repository
// content, JSON payloads, or arbitrary metadata.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import {
  LOOP_STAGE_NAMES,
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
  type LoopRunState,
  type LoopRunStatus,
  type LoopStageName,
  type LoopStageState,
  type LoopStageStatus,
} from "./loop-executor-types";
import {
  applyLoopRunEvent,
  canonicalizeLoopRunEvent,
  canonicalizeLoopRunIdentity,
  createInitialLoopRunState,
  createLoopRunCreatedEvent,
  validateLoopRunEvent,
  validateLoopRunIdentity,
} from "./loop-run-state";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function closed(): never {
  throw new LoopRunJournalError("STORE_CLOSED", "loop run store is not open");
}

function corrupt(message: string): never {
  throw new LoopRunJournalError("STORE_CORRUPT", `persisted run journal is corrupt: ${message}`);
}

type RunRow = {
  run_id: string;
  requirement_id: string;
  repository: string;
  repository_path: string;
  base_branch: string;
  expected_base_sha: string;
  task_branch: string;
  control_root: string;
  status: string;
  current_stage: string | null;
  current_attempt: number;
  fix_round: number;
  last_sequence: number;
  last_event_id: string;
  blocking_reason_code: string | null;
  failure_reason_code: string | null;
  created_at: string;
  updated_at: string;
  identity_sha256: string;
};

type EventRow = {
  event_id: string;
  run_id: string;
  sequence: number;
  kind: string;
  stage: string | null;
  attempt: number;
  created_at: string;
  input_digest: string | null;
  output_artifact_ref: string | null;
  output_digest: string | null;
  error_code: string | null;
  retryable: number | null;
  reason_code: string | null;
  canonical_sha256: string;
};

function rowToEvent(row: EventRow): LoopRunEvent {
  return Object.freeze({
    eventId: row.event_id,
    runId: row.run_id,
    sequence: row.sequence,
    kind: row.kind as LoopRunEvent["kind"],
    stage: row.stage as LoopStageName | null,
    attempt: row.attempt,
    createdAt: row.created_at,
    inputDigest: row.input_digest,
    outputArtifactRef: row.output_artifact_ref,
    outputDigest: row.output_digest,
    errorCode: row.error_code,
    retryable: row.retryable === null ? null : row.retryable === 1,
    reasonCode: row.reason_code,
  });
}

function eventToRow(event: LoopRunEvent): EventRow {
  return {
    event_id: event.eventId,
    run_id: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    created_at: event.createdAt,
    input_digest: event.inputDigest,
    output_artifact_ref: event.outputArtifactRef,
    output_digest: event.outputDigest,
    error_code: event.errorCode,
    retryable: event.retryable === null ? null : event.retryable ? 1 : 0,
    reason_code: event.reasonCode,
    canonical_sha256: sha256Hex(canonicalizeLoopRunEvent(event)),
  };
}

function eventRowMatches(row: EventRow, event: LoopRunEvent): boolean {
  const expected = eventToRow(event);
  return (
    row.event_id === expected.event_id &&
    row.run_id === expected.run_id &&
    row.sequence === expected.sequence &&
    row.kind === expected.kind &&
    row.stage === expected.stage &&
    row.attempt === expected.attempt &&
    row.created_at === expected.created_at &&
    row.input_digest === expected.input_digest &&
    row.output_artifact_ref === expected.output_artifact_ref &&
    row.output_digest === expected.output_digest &&
    row.error_code === expected.error_code &&
    row.retryable === expected.retryable &&
    row.reason_code === expected.reason_code &&
    row.canonical_sha256 === expected.canonical_sha256
  );
}

export class LoopRunStore {
  private readonly dbPath: string;
  private db: Database.Database | null = null;
  private wasOpened = false;

  constructor(dbPath: string) {
    if (typeof dbPath !== "string" || dbPath.trim().length === 0 || dbPath !== dbPath.trim()) {
      throw new LoopRunJournalError("INVALID_INPUT", "dbPath must be a trimmed non-empty absolute path");
    }
    if (!isAbsolute(dbPath)) {
      throw new LoopRunJournalError("INVALID_INPUT", "dbPath must be an absolute path");
    }
    try {
      if (statSync(dbPath).isDirectory()) {
        throw new LoopRunJournalError("INVALID_INPUT", "dbPath must not point to a directory");
      }
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      // Non-existent path is acceptable; parent is created in init().
    }
    this.dbPath = dbPath;
  }

  private connection(): Database.Database {
    if (this.db === null) closed();
    return this.db;
  }

  init(): void {
    if (this.db !== null || this.wasOpened) closed();
    mkdirSync(dirname(this.dbPath), { recursive: true });
    const db = new Database(this.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 2000");
    db.exec(`
      CREATE TABLE IF NOT EXISTS loop_runs (
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
      CREATE INDEX IF NOT EXISTS idx_loop_runs_status ON loop_runs(status);

      CREATE TABLE IF NOT EXISTS loop_stage_states (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (run_id, stage),
        FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_loop_stage_states_run_id ON loop_stage_states(run_id);

      CREATE TABLE IF NOT EXISTS loop_events (
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
      CREATE INDEX IF NOT EXISTS idx_loop_events_run_id ON loop_events(run_id);
    `);
    this.db = db;
    this.wasOpened = true;
  }

  close(): void {
    if (this.db === null) return;
    const db = this.db;
    this.db = null;
    db.close();
  }

  createRun(identity: LoopRunIdentity): LoopRunState {
    const db = this.connection();
    validateLoopRunIdentity(identity);
    const identitySha = sha256Hex(canonicalizeLoopRunIdentity(identity));
    const existing = db
      .prepare("SELECT run_id, identity_sha256 FROM loop_runs WHERE run_id = ?")
      .get(identity.runId) as { run_id: string; identity_sha256: string } | undefined;
    if (existing !== undefined) {
      if (existing.identity_sha256 === identitySha) {
        const state = this.getRun(identity.runId);
        if (state === undefined) corrupt("run row exists but run cannot be reconstructed");
        return state;
      }
      throw new LoopRunJournalError("RUN_ID_CONFLICT", "runId already exists with a different identity");
    }

    const createdEvent = createLoopRunCreatedEvent(identity);
    const state = createInitialLoopRunState(identity);
    const eventRow = eventToRow(createdEvent);
    const create = db.transaction(() => {
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
        state.status,
        null,
        state.currentAttempt,
        state.fixRound,
        state.lastSequence,
        state.lastEventId,
        null,
        null,
        identity.createdAt,
        state.updatedAt,
        identitySha,
      );
      const stageInsert = db.prepare(
        "INSERT INTO loop_stage_states (run_id, stage, status, attempt, updated_at) VALUES (?, ?, ?, ?, ?)",
      );
      for (const stage of LOOP_STAGE_NAMES) {
        stageInsert.run(identity.runId, stage, "pending", 0, identity.createdAt);
      }
      this.insertEventRow(db, eventRow);
    });
    create();
    return state;
  }

  appendEvent(event: LoopRunEvent): LoopRunState {
    const db = this.connection();
    validateLoopRunEvent(event);
    const eventRow = eventToRow(event);
    const existing = db
      .prepare("SELECT * FROM loop_events WHERE event_id = ?")
      .get(event.eventId) as EventRow | undefined;
    if (existing !== undefined) {
      if (eventRowMatches(existing, event)) {
        const state = this.getRun(event.runId);
        if (state === undefined) corrupt("event exists but its run cannot be reconstructed");
        return state;
      }
      throw new LoopRunJournalError("EVENT_ID_CONFLICT", "eventId already exists with different content");
    }

    const apply = db.transaction(() => {
      const current = this.readRunOrThrow(db, event.runId);
      const sequenceOwner = db
        .prepare("SELECT event_id FROM loop_events WHERE run_id = ? AND sequence = ?")
        .get(event.runId, event.sequence) as { event_id: string } | undefined;
      if (sequenceOwner !== undefined) {
        throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "sequence already occupied by another event");
      }
      const next = applyLoopRunEvent(current, event);
      this.insertEventRow(db, eventRow);
      db.prepare(
        `UPDATE loop_runs SET
          status = ?, current_stage = ?, current_attempt = ?, fix_round = ?,
          last_sequence = ?, last_event_id = ?, blocking_reason_code = ?,
          failure_reason_code = ?, updated_at = ?
        WHERE run_id = ?`,
      ).run(
        next.status,
        next.currentStage,
        next.currentAttempt,
        next.fixRound,
        next.lastSequence,
        next.lastEventId,
        next.blockingReasonCode,
        next.failureReasonCode,
        next.updatedAt,
        next.identity.runId,
      );
      if (event.stage !== null) {
        const stageState = next.stages[event.stage];
        db.prepare(
          "UPDATE loop_stage_states SET status = ?, attempt = ?, updated_at = ? WHERE run_id = ? AND stage = ?",
        ).run(stageState.status, stageState.attempt, stageState.updatedAt, next.identity.runId, event.stage);
      }
    });
    apply();
    const state = this.getRun(event.runId);
    if (state === undefined) corrupt("run missing after append");
    return state;
  }

  getRun(runId: string): LoopRunState | undefined {
    const db = this.connection();
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) return undefined;
    return this.reconstructAndVerify(db, row);
  }

  listEvents(runId: string): readonly LoopRunEvent[] {
    const db = this.connection();
    const state = this.getRun(runId);
    if (state === undefined) return Object.freeze([]);
    const rows = db
      .prepare("SELECT * FROM loop_events WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as EventRow[];
    const events = rows.map((row) => rowToEvent(row));
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) {
        corrupt("event sequence is not contiguous from 1");
      }
    }
    return Object.freeze(events);
  }

  private insertEventRow(db: Database.Database, row: EventRow): void {
    db.prepare(
      `INSERT INTO loop_events (
        event_id, run_id, sequence, kind, stage, attempt, created_at,
        input_digest, output_artifact_ref, output_digest, error_code,
        retryable, reason_code, canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.event_id,
      row.run_id,
      row.sequence,
      row.kind,
      row.stage,
      row.attempt,
      row.created_at,
      row.input_digest,
      row.output_artifact_ref,
      row.output_digest,
      row.error_code,
      row.retryable,
      row.reason_code,
      row.canonical_sha256,
    );
  }

  private readRunOrThrow(db: Database.Database, runId: string): LoopRunState {
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
    }
    return this.reconstructAndVerify(db, row);
  }

  private reconstructAndVerify(db: Database.Database, row: RunRow): LoopRunState {
    const identity: LoopRunIdentity = Object.freeze({
      runId: row.run_id,
      requirementId: row.requirement_id,
      repository: row.repository,
      repositoryPath: row.repository_path,
      baseBranch: row.base_branch,
      expectedBaseSha: row.expected_base_sha,
      taskBranch: row.task_branch,
      controlRoot: row.control_root,
      createdAt: row.created_at,
    });
    validateLoopRunIdentity(identity);
    if (sha256Hex(canonicalizeLoopRunIdentity(identity)) !== row.identity_sha256) {
      corrupt("identity hash mismatch");
    }

    const stageRows = db
      .prepare("SELECT stage, status, attempt, updated_at FROM loop_stage_states WHERE run_id = ?")
      .all(row.run_id) as Array<{ stage: string; status: string; attempt: number; updated_at: string }>;
    const canonicalStageSet = new Set<string>(LOOP_STAGE_NAMES);
    const seenStages = new Set<string>();
    for (const stageRow of stageRows) {
      if (!canonicalStageSet.has(stageRow.stage)) corrupt(`unknown stage row ${stageRow.stage}`);
      seenStages.add(stageRow.stage);
    }
    for (const stage of LOOP_STAGE_NAMES) {
      if (!seenStages.has(stage)) corrupt(`missing stage row ${stage}`);
    }

    const eventRows = db
      .prepare("SELECT * FROM loop_events WHERE run_id = ? ORDER BY sequence ASC")
      .all(row.run_id) as EventRow[];
    if (eventRows.length === 0) corrupt("run has no events");
    const events = eventRows.map((eventRow) => {
      const event = rowToEvent(eventRow);
      validateLoopRunEvent(event);
      if (sha256Hex(canonicalizeLoopRunEvent(event)) !== eventRow.canonical_sha256) {
        corrupt(`event ${eventRow.event_id} canonical hash mismatch`);
      }
      return event;
    });
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) {
        corrupt("event sequence is not contiguous from 1");
      }
    }
    const first = events[0]!;
    if (first.kind !== "run_created" || first.eventId !== `${row.run_id}:1:run_created`) {
      corrupt("sequence 1 is not the canonical run_created event");
    }
    const last = events[events.length - 1]!;
    if (last.eventId !== row.last_event_id) corrupt("last_event_id does not match the last persisted event");
    if (last.sequence !== row.last_sequence) corrupt("last_sequence does not match the last persisted event");

    let replayed = createInitialLoopRunState(identity);
    try {
      for (const event of events.slice(1)) {
        replayed = applyLoopRunEvent(replayed, event);
      }
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted history cannot be replayed");
      throw error;
    }

    if (
      replayed.status !== row.status ||
      replayed.currentStage !== (row.current_stage as LoopStageName | null) ||
      replayed.currentAttempt !== row.current_attempt ||
      replayed.fixRound !== row.fix_round ||
      replayed.lastSequence !== row.last_sequence ||
      replayed.lastEventId !== row.last_event_id ||
      replayed.blockingReasonCode !== row.blocking_reason_code ||
      replayed.failureReasonCode !== row.failure_reason_code ||
      replayed.updatedAt !== row.updated_at
    ) {
      corrupt("persisted run state does not match replayed state");
    }

    const stageByName = new Map(stageRows.map((stageRow) => [stageRow.stage, stageRow]));
    for (const stage of LOOP_STAGE_NAMES) {
      const persistedStage = stageByName.get(stage)!;
      const replayedStage: LoopStageState = replayed.stages[stage];
      if (
        persistedStage.status !== replayedStage.status ||
        persistedStage.attempt !== replayedStage.attempt ||
        persistedStage.updated_at !== replayedStage.updatedAt
      ) {
        corrupt(`stage ${stage} state does not match replayed state`);
      }
    }

    const stageMap = Object.create(null) as Record<LoopStageName, LoopStageState>;
    for (const stage of LOOP_STAGE_NAMES) {
      stageMap[stage] = replayed.stages[stage];
    }
    return Object.freeze({
      identity,
      status: replayed.status as LoopRunStatus,
      currentStage: replayed.currentStage,
      currentAttempt: replayed.currentAttempt,
      fixRound: replayed.fixRound,
      lastSequence: replayed.lastSequence,
      lastEventId: replayed.lastEventId,
      blockingReasonCode: replayed.blockingReasonCode,
      failureReasonCode: replayed.failureReasonCode,
      updatedAt: replayed.updatedAt,
      stages: Object.freeze(stageMap),
    });
  }
}
