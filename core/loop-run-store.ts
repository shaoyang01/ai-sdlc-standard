// LOOP Executor Kernel — Durable SQLite Run Journal Store
// =========================================================
// better-sqlite3 backed append-only run journal with cross-connection
// concurrency guarantees. Each store instance owns exactly one connection.
// Only fixed safe scalars are persisted — never raw prompt, patch, stdout,
// stderr, credentials, environment maps, repository content, JSON payloads,
// or arbitrary metadata.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import {
  LOOP_STAGE_NAMES,
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
  type LoopRunSnapshot,
  type LoopRunState,
  type LoopRunStatus,
  type LoopRunStoreOptions,
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
  validateRequirementId,
} from "./loop-run-state";

const DEFAULT_BUSY_TIMEOUT_MS = 2000;
const MAX_BUSY_TIMEOUT_MS = 5000;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function closed(): never {
  throw new LoopRunJournalError("STORE_CLOSED", "loop run store is not open");
}

function busy(): never {
  throw new LoopRunJournalError("STORE_BUSY", "run journal storage is busy");
}

function storageFailure(): never {
  throw new LoopRunJournalError("STORE_FAILURE", "run journal storage operation failed");
}

/**
 * STORE_CORRUPT reasons are fixed internal strings only — persisted values
 * (event ids, stages, digests, raw scalars) are never echoed.
 */
function corrupt(message: string): never {
  throw new LoopRunJournalError("STORE_CORRUPT", `persisted run journal is corrupt: ${message}`);
}

// ── persisted-data validation boundary ──
// Data read back from SQLite is untrusted: any validation or canonicalization
// failure while reading persisted rows is STORE_CORRUPT, never INVALID_INPUT.
// External API input keeps the public INVALID_INPUT semantics.

function validatePersistedIdentity(identity: unknown): void {
  try {
    validateLoopRunIdentity(identity);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted identity is invalid");
    throw error;
  }
}

function validatePersistedEvent(event: unknown): void {
  try {
    validateLoopRunEvent(event);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted event is invalid");
    throw error;
  }
}

function canonicalizePersistedEvent(event: LoopRunEvent): string {
  try {
    return canonicalizeLoopRunEvent(event);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted event canonicalization failed");
    throw error;
  }
}

function canonicalizePersistedIdentity(identity: LoopRunIdentity): string {
  try {
    return canonicalizeLoopRunIdentity(identity);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted identity canonicalization failed");
    throw error;
  }
}

function asPersistedRetryable(value: unknown): boolean | null {
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  return corrupt("persisted retryable is not canonical");
}

function asPersistedSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return corrupt("persisted integer scalar is invalid");
  }
  return value;
}

// ── SQLite error translation boundary ──
// Structured codes only. Raw SQLite messages, paths, input, event content and
// credentials are never read, kept, or echoed.

function sqliteErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isBusyCode(code: string | null): boolean {
  return code !== null && (code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED"));
}

function isConstraintCode(code: string | null): boolean {
  return code !== null && code.startsWith("SQLITE_CONSTRAINT");
}

/**
 * Synchronous bounded sleep used for busy retries. Atomics.wait is available
 * in Node.js main and worker threads.
 */
function spinWait(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
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
  binding_id: string | null;
  binding_version: string | null;
  input_artifact_ref: string | null;
  canonical_sha256: string;
};

function rowToEvent(row: EventRow): LoopRunEvent {
  return Object.freeze({
    eventId: row.event_id,
    runId: row.run_id,
    sequence: asPersistedSafeInteger(row.sequence),
    kind: row.kind as LoopRunEvent["kind"],
    stage: row.stage as LoopStageName | null,
    attempt: asPersistedSafeInteger(row.attempt),
    createdAt: row.created_at,
    inputDigest: row.input_digest,
    outputArtifactRef: row.output_artifact_ref,
    outputDigest: row.output_digest,
    errorCode: row.error_code,
    retryable: asPersistedRetryable(row.retryable),
    reasonCode: row.reason_code,
    // C01 WP-4: legacy rows without the columns map to null.
    bindingId: row.binding_id ?? null,
    bindingVersion: row.binding_version ?? null,
    inputArtifactRef: row.input_artifact_ref ?? null,
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
    binding_id: event.bindingId,
    binding_version: event.bindingVersion,
    input_artifact_ref: event.inputArtifactRef,
    canonical_sha256: sha256Hex(canonicalizeLoopRunEvent(event)),
  };
}

export class LoopRunStore {
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private db: Database.Database | null = null;
  private wasOpened = false;

  constructor(dbPath: string, options?: LoopRunStoreOptions) {
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
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        // Path (or a parent component) does not exist yet; init surfaces any
        // real storage failure via mkdir/open.
      } else if (isBusyCode(sqliteErrorCode(error))) {
        busy();
      } else {
        storageFailure();
      }
    }
    const busyTimeoutMs = options?.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (
      typeof busyTimeoutMs !== "number" ||
      !Number.isInteger(busyTimeoutMs) ||
      busyTimeoutMs < 1 ||
      busyTimeoutMs > MAX_BUSY_TIMEOUT_MS
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "busyTimeoutMs must be an integer between 1 and 5000");
    }
    this.dbPath = dbPath;
    this.busyTimeoutMs = busyTimeoutMs;
  }

  private connection(): Database.Database {
    if (this.db === null) closed();
    return this.db;
  }

  /**
   * init() tracks the Database connection in a local variable and only assigns
   * to `this.db` and `this.wasOpened` after all pragma, WAL, and schema
   * initialization succeeds. On any intermediate failure the local connection
   * is best-effort closed so no lock lingers.
   *
   * Each step directly calls the appropriate typed throw function
   * (storageFailure, busy, etc.) — no function objects are ever assigned
   * to variables.
   */
  init(): void {
    if (this.db !== null || this.wasOpened) closed();

    let db: Database.Database | null = null;

    try {
      try {
        mkdirSync(dirname(this.dbPath), { recursive: true });
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      try {
        db = new Database(this.dbPath);
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // WAL mode — ensureWalMode already throws properly typed errors
      this.ensureWalMode(db);

      // foreign_keys pragma
      try {
        db.pragma("foreign_keys = ON");
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // busy_timeout pragma
      try {
        db.pragma(`busy_timeout = ${this.busyTimeoutMs}`);
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // schema creation
      try {
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
            retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
            reason_code TEXT,
            binding_id TEXT,
            binding_version TEXT,
            input_artifact_ref TEXT,
            canonical_sha256 TEXT NOT NULL,
            UNIQUE (run_id, sequence),
            FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_loop_events_run_id ON loop_events(run_id);
        `);

        // C01 WP-4 migration: pre-extension journals lack the provenance
        // columns; add them in place (existing rows read as NULL and stay
        // canonical-compatible).
        const eventColumns = db.prepare("PRAGMA table_info(loop_events)").all() as Array<{ name: string }>;
        const existing = new Set(eventColumns.map((column) => column.name));
        const provenanceColumns: ReadonlyArray<{ name: string; ddl: string }> = [
          { name: "binding_id", ddl: "ALTER TABLE loop_events ADD COLUMN binding_id TEXT" },
          { name: "binding_version", ddl: "ALTER TABLE loop_events ADD COLUMN binding_version TEXT" },
          { name: "input_artifact_ref", ddl: "ALTER TABLE loop_events ADD COLUMN input_artifact_ref TEXT" },
        ];
        for (const column of provenanceColumns) {
          if (!existing.has(column.name)) {
            db.exec(column.ddl);
          }
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // All initialization succeeded — publish the connection.
      this.db = db;
      this.wasOpened = true;
    } catch (error) {
      // Best-effort close the local connection so no lock lingers.
      if (db !== null) {
        try { db.close(); } catch { /* cleanup failure must not overwrite original error */ }
      }

      // Re-throw the original error (already a properly typed LoopRunJournalError
      // from one of the step-specific catch blocks, or from ensureWalMode).
      if (error instanceof LoopRunJournalError) throw error;
      // Any raw error that somehow escaped → translate to STORE_FAILURE.
      storageFailure();
    }
  }

  close(): void {
    if (this.db === null) return;
    const db = this.db;
    this.db = null;
    try {
      db.close();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * journal_mode changes are not covered by SQLite's busy handler, so a
   * concurrent writer can make the WAL pragma fail instantly. Retry briefly
   * and accept an already-WAL database instead of failing outright.
   */
  private ensureWalMode(db: Database.Database): void {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let mode: string;
      try {
        mode = String(db.pragma("journal_mode", { simple: true })).toLowerCase();
      } catch (error) {
        if (isBusyCode(sqliteErrorCode(error)) && attempt < 19) {
          spinWait(50);
          continue;
        }
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }
      if (mode === "wal") return;
      try {
        db.pragma("journal_mode = WAL");
        return;
      } catch (error) {
        if (isBusyCode(sqliteErrorCode(error)) && attempt < 19) {
          spinWait(50);
          continue;
        }
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }
    }
    busy();
  }

  /**
   * createRun: first reads the full verified snapshot, then compares the
   * canonical identity from the verified snapshot with the request identity.
   * This ensures persisted corruption is detected before any business-logic
   * comparison.
   */
  createRun(identity: LoopRunIdentity): LoopRunState {
    const db = this.connection();
    validateLoopRunIdentity(identity);
    const identitySha = sha256Hex(canonicalizeLoopRunIdentity(identity));
    try {
      const snapshot = db.transaction((): LoopRunSnapshot => {
        // ── corruption-first: read full verified snapshot first ──
        const existingSnapshot = this.readRunSnapshotInTransaction(db, identity.runId);
        if (existingSnapshot !== undefined) {
          // Persisted data has been verified. Now compare canonical identity.
          const persistedIdentitySha = sha256Hex(canonicalizePersistedIdentity(existingSnapshot.state.identity));
          if (persistedIdentitySha !== identitySha) {
            throw new LoopRunJournalError("RUN_ID_CONFLICT", "runId already exists with a different identity");
          }
          // Same identity — exact idempotent success.
          return this.snapshotInTransaction(db, identity.runId);
        }

        const createdEvent = createLoopRunCreatedEvent(identity);
        const state = createInitialLoopRunState(identity);
        const eventRow = eventToRow(createdEvent);
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
        return this.snapshotInTransaction(db, identity.runId);
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      return this.translateWriterError(error, () => {
        return this.reclassifyCreateRunConstraint(db, identity.runId, identitySha);
      });
    }
  }

  /**
   * Reclassification callback for createRun constraint violations.
   * Operates within the safe storage translation boundary.
   */
  private reclassifyCreateRunConstraint(
    db: Database.Database,
    runId: string,
    identitySha: string,
  ): LoopRunSnapshot {
    try {
      const existingSnapshot = this.readRunSnapshotInTransaction(db, runId);
      if (existingSnapshot !== undefined) {
        const persistedIdentitySha = sha256Hex(canonicalizePersistedIdentity(existingSnapshot.state.identity));
        if (persistedIdentitySha === identitySha) {
          return existingSnapshot;
        }
        throw new LoopRunJournalError("RUN_ID_CONFLICT", "runId already exists with a different identity");
      }
      storageFailure();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      if (isConstraintCode(sqliteErrorCode(error))) storageFailure();
      storageFailure();
    }
  }

  /**
   * appendEvent: first reads the full verified snapshot of the owning run,
   * then locates the persisted event within that verified snapshot. This
   * ensures persisted corruption is detected before any event comparison.
   */
  appendEvent(event: LoopRunEvent): LoopRunState {
    const db = this.connection();
    validateLoopRunEvent(event);
    const eventRow = eventToRow(event);
    try {
      const snapshot = db.transaction((): LoopRunSnapshot => {
        // ── corruption-first: read full verified snapshot ──
        const current = this.readRunSnapshotInTransaction(db, event.runId);
        if (current === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }

        // ── locate the existing event within the verified snapshot ──
        const existingEvent = current.events.find((e) => e.eventId === event.eventId);
        if (existingEvent !== undefined) {
          // Persisted event has been verified — compare canonical forms.
          if (canonicalizePersistedEvent(existingEvent) === canonicalizePersistedEvent(event)) {
            return this.snapshotInTransaction(db, event.runId);
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "eventId already exists with different content");
        }

        // ── check sequence conflict ──
        const sequenceOwner = current.events.find((e) => e.sequence === event.sequence);
        if (sequenceOwner !== undefined) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "sequence already occupied by another event");
        }

        const next = applyLoopRunEvent(current.state, event);
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
        return this.snapshotInTransaction(db, event.runId);
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      return this.translateWriterError(error, () => {
        return this.reclassifyAppendEventConstraint(db, event);
      });
    }
  }

  /**
   * Reclassification callback for appendEvent constraint violations.
   * Operates within the safe storage translation boundary.
   */
  private reclassifyAppendEventConstraint(
    db: Database.Database,
    event: LoopRunEvent,
  ): LoopRunSnapshot {
    try {
      const current = this.readRunSnapshotInTransaction(db, event.runId);
      if (current === undefined) {
        throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
      }
      const existingEvent = current.events.find((e) => e.eventId === event.eventId);
      if (existingEvent !== undefined) {
        if (canonicalizePersistedEvent(existingEvent) === canonicalizePersistedEvent(event)) {
          return current;
        }
        throw new LoopRunJournalError("EVENT_ID_CONFLICT", "eventId already exists with different content");
      }
      const sequenceOwner = current.events.find((e) => e.sequence === event.sequence);
      if (sequenceOwner !== undefined) {
        throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "sequence already occupied by another event");
      }
      storageFailure();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      if (isConstraintCode(sqliteErrorCode(error))) storageFailure();
      storageFailure();
    }
  }

  getSnapshot(runId: string): LoopRunSnapshot | undefined {
    return this.readSnapshot(runId);
  }

  getRun(runId: string): LoopRunState | undefined {
    const snapshot = this.readSnapshot(runId);
    return snapshot === undefined ? undefined : snapshot.state;
  }

  listEvents(runId: string): readonly LoopRunEvent[] {
    const snapshot = this.readSnapshot(runId);
    return snapshot === undefined ? Object.freeze([]) : snapshot.events;
  }

  /**
   * Lists all verified run snapshots for one requirement, oldest first.
   * This is the cross-entry lookup that lets an entry resume the same
   * Requirement by requirementId without reinterpreting confirmed facts.
   * requirementId is external input: validated fail-closed and never echoed.
   */
  listRunsByRequirement(requirementId: string): readonly LoopRunSnapshot[] {
    validateRequirementId(requirementId);
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopRunSnapshot[] => {
        const rows = db
          .prepare(
            "SELECT run_id FROM loop_runs WHERE requirement_id = ? ORDER BY created_at ASC, run_id ASC",
          )
          .all(requirementId) as ReadonlyArray<{ run_id: string }>;
        return rows.map((row) => {
          const snapshot = this.readRunSnapshotInTransaction(db, row.run_id);
          if (snapshot === undefined) {
            // A listed row must always resolve to a verified snapshot.
            throw new LoopRunJournalError("STORE_CORRUPT", "requirement run row missing verified snapshot");
          }
          return snapshot;
        });
      })() as readonly LoopRunSnapshot[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Finds the latest verified run snapshot for a requirement, or undefined
   * when the requirement has no run yet. Primary recovery lookup for the
   * LOOP entry contract.
   */
  findLatestRunByRequirement(requirementId: string): LoopRunSnapshot | undefined {
    const runs = this.listRunsByRequirement(requirementId);
    return runs.length === 0 ? undefined : runs[runs.length - 1];
  }

  // ── storage error translation ──

  /**
   * translateWriterError is the single storage translation boundary for
   * writer operations. The reclassification callback is also guarded within
   * a safe storage translation — it must not leak raw SQLite exceptions.
   */
  private translateWriterError(
    error: unknown,
    reclassifyConstraint: () => LoopRunSnapshot,
  ): LoopRunState {
    if (error instanceof LoopRunJournalError) throw error;
    const code = sqliteErrorCode(error);
    if (isBusyCode(code)) busy();
    if (isConstraintCode(code)) {
      try {
        const snapshot = reclassifyConstraint();
        return snapshot.state;
      } catch (reclassifyError) {
        // Reclassification callback errors are already translated by the
        // callback itself. Any raw error escaping is translated to STORE_FAILURE.
        if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
        storageFailure();
      }
    }
    storageFailure();
  }

  // ── verified snapshot (single read implementation) ──

  private readSnapshot(runId: string): LoopRunSnapshot | undefined {
    const db = this.connection();
    try {
      return db.transaction((): LoopRunSnapshot | undefined => {
        const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
        if (row === undefined) return undefined;
        return this.verifySnapshotInTransaction(db, row);
      })() as LoopRunSnapshot | undefined;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  private snapshotInTransaction(db: Database.Database, runId: string): LoopRunSnapshot {
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) corrupt("run row missing inside writer transaction");
    return this.verifySnapshotInTransaction(db, row);
  }

  private readRunSnapshotInTransaction(db: Database.Database, runId: string): LoopRunSnapshot | undefined {
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) return undefined;
    return this.verifySnapshotInTransaction(db, row);
  }

  private insertEventRow(db: Database.Database, row: EventRow): void {
    db.prepare(
      `INSERT INTO loop_events (
        event_id, run_id, sequence, kind, stage, attempt, created_at,
        input_digest, output_artifact_ref, output_digest, error_code,
        retryable, reason_code, binding_id, binding_version,
        input_artifact_ref, canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.binding_id,
      row.binding_version,
      row.input_artifact_ref,
      row.canonical_sha256,
    );
  }

  private verifySnapshotInTransaction(db: Database.Database, row: RunRow): LoopRunSnapshot {
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
    validatePersistedIdentity(identity);
    if (sha256Hex(canonicalizePersistedIdentity(identity)) !== row.identity_sha256) {
      corrupt("identity hash mismatch");
    }

    const stageRows = db
      .prepare("SELECT stage, status, attempt, updated_at FROM loop_stage_states WHERE run_id = ?")
      .all(row.run_id) as Array<{ stage: string; status: string; attempt: number; updated_at: string }>;
    const canonicalStageSet = new Set<string>(LOOP_STAGE_NAMES);
    const seenStages = new Set<string>();
    for (const stageRow of stageRows) {
      if (!canonicalStageSet.has(stageRow.stage)) corrupt("unknown persisted stage row");
      seenStages.add(stageRow.stage);
      asPersistedSafeInteger(stageRow.attempt);
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
      validatePersistedEvent(event);
      if (sha256Hex(canonicalizePersistedEvent(event)) !== eventRow.canonical_sha256) {
        corrupt("persisted event canonical hash mismatch");
      }
      return event;
    });
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) {
        corrupt("event sequence is not contiguous from 1");
      }
    }
    const first = events[0]!;
    const expectedFirstEvent = createLoopRunCreatedEvent(identity);
    if (canonicalizePersistedEvent(first) !== canonicalizePersistedEvent(expectedFirstEvent)) {
      corrupt("sequence 1 is not the canonical run_created event");
    }
    const last = events[events.length - 1]!;
    if (last.eventId !== row.last_event_id) corrupt("last_event_id does not match the last persisted event");
    if (last.sequence !== row.last_sequence) corrupt("last_sequence does not match the last persisted event");

    asPersistedSafeInteger(row.current_attempt);
    asPersistedSafeInteger(row.fix_round);
    asPersistedSafeInteger(row.last_sequence);

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
    const state = Object.freeze({
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
    const frozenEvents = Object.freeze(events);
    if (state.lastSequence !== frozenEvents.length) {
      corrupt("snapshot sequence/event count invariant violated");
    }
    if (frozenEvents.length === 0 || frozenEvents[frozenEvents.length - 1]!.eventId !== state.lastEventId) {
      corrupt("snapshot last-event invariant violated");
    }
    return Object.freeze({ state, events: frozenEvents });
  }
}
