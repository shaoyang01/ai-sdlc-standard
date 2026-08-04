// LOOP Executor Kernel — Durable Checkpoint Current-Head Store (D10-A)
// =====================================================================
// better-sqlite3 backed current-head locator for the generation-linear
// delivery checkpoint chain. The SQLite row is ONLY a locator: it points at
// the newest trusted immutable checkpoint artifact and is never a business
// authority on its own. Every read re-verifies the artifact (digest,
// parser, generation, runId); the locator row alone is never trusted.
//
// advance() is a generation/ref/digest compare-and-swap under BEGIN
// IMMEDIATE: concurrent writers yield exactly one `advanced` and every
// loser receives CHECKPOINT_STALE; identical-candidate concurrent writers
// and exact retries after an unknown response yield `confirmed`. Loser
// orphan artifacts may exist but never become the current authority.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import {
  LOOP_DELIVERY_CHECKPOINT_MAX_BYTES,
  LOOP_DELIVERY_CHECKPOINT_SCHEMA,
  buildLoopDeliveryCheckpoint,
  parseLoopDeliveryCheckpointBytes,
  validateLoopDeliveryCheckpointTransition,
  type LoopDeliveryCheckpoint,
} from "./loop-delivery-checkpoint";
import type { LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";

const DEFAULT_BUSY_TIMEOUT_MS = 2000;
const MAX_BUSY_TIMEOUT_MS = 5000;
const MAX_ERROR_MESSAGE_LENGTH = 256;
const MAX_RUN_ID_LENGTH = 256;
const CHECKPOINT_REF_RE = /^loop-artifact:v1:delivery_checkpoint:sha256:[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeMessage(message: string): string {
  const withoutControl = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return withoutControl.length > MAX_ERROR_MESSAGE_LENGTH
    ? withoutControl.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : withoutControl;
}

// ── SQLite error translation boundary ──
// Structured codes only. Raw SQLite messages, paths, run ids, refs, artifact
// bytes and credentials are never read, kept, or echoed.

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

function isCorruptCode(code: string | null): boolean {
  return code !== null && (code === "SQLITE_NOTADB" || code.startsWith("SQLITE_CORRUPT"));
}

function spinWait(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

// ═══════════════════════════════════════ Public types

export type LoopDeliveryCheckpointStoreErrorCode =
  | "INVALID_INPUT"
  | "CHECKPOINT_STORE_CLOSED"
  | "CHECKPOINT_STORE_BUSY"
  | "CHECKPOINT_STORE_FAILURE"
  | "CHECKPOINT_STORE_CORRUPT"
  | "CHECKPOINT_STALE"
  | "CHECKPOINT_TRANSITION_INVALID"
  | "CHECKPOINT_ARTIFACT_FAILURE";

/** Safe bounded error. Never carries raw input, persisted values or SQLite text. */
export class LoopDeliveryCheckpointStoreError extends Error {
  readonly code: LoopDeliveryCheckpointStoreErrorCode;
  constructor(code: LoopDeliveryCheckpointStoreErrorCode, message: string) {
    super(sanitizeMessage(message));
    this.name = "LoopDeliveryCheckpointStoreError";
    this.code = code;
  }
}

export type LoopArtifactStoreLike = Pick<LoopArtifactStore, "read" | "put">;

export interface LoopDeliveryCheckpointStoreOptions {
  readonly dbPath: string;
  readonly artifactStore: LoopArtifactStoreLike;
  readonly busyTimeoutMs?: number;
  readonly maxCheckpointBytes?: number;
}

/** Fully verified, immutable current-head snapshot (locator + artifact facts). */
export interface LoopDeliveryCheckpointCurrent {
  readonly runId: string;
  readonly generation: number;
  readonly checkpointArtifactRef: string;
  readonly checkpointDigestSha256: string;
  readonly artifactBytes: Uint8Array;
  readonly artifactSizeBytes: number;
  readonly checkpoint: Readonly<LoopDeliveryCheckpoint>;
}

/** Checkpoint body without the store-owned schema/generation/previous ref. */
export type LoopDeliveryCheckpointAdvanceBody = Omit<
  LoopDeliveryCheckpoint,
  "schema" | "generation" | "previous_checkpoint_artifact_ref"
>;

export interface LoopDeliveryCheckpointAdvanceRequest {
  readonly runId: string;
  readonly expectedGeneration: number;
  readonly expectedCheckpointArtifactRef: string | null;
  readonly checkpoint: LoopDeliveryCheckpointAdvanceBody;
}

export type LoopDeliveryCheckpointAdvanceStatus = "advanced" | "confirmed";

export interface LoopDeliveryCheckpointAdvanceResult {
  readonly status: LoopDeliveryCheckpointAdvanceStatus;
  readonly current: Readonly<LoopDeliveryCheckpointCurrent>;
}

// ═══════════════════════════════════════ Store

type HeadRow = {
  run_id: string;
  generation: number;
  checkpoint_artifact_ref: string;
  checkpoint_digest_sha256: string;
};

type Candidate = {
  generation: number;
  previousRef: string | null;
  value: Readonly<LoopDeliveryCheckpoint>;
  bytes: Uint8Array;
  digestSha256: string;
  sizeBytes: number;
};

function closed(): never {
  throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CLOSED", "checkpoint store is not open");
}

export class LoopDeliveryCheckpointStore {
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private readonly maxCheckpointBytes: number;
  private readonly artifactStore: LoopArtifactStoreLike;
  private db: Database.Database | null = null;
  private wasOpened = false;

  constructor(options: LoopDeliveryCheckpointStoreOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "options must be a plain object");
    }
    const dbPath = options.dbPath;
    if (typeof dbPath !== "string" || dbPath.trim().length === 0 || dbPath !== dbPath.trim()) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "dbPath must be a trimmed non-empty absolute path");
    }
    if (!isAbsolute(dbPath)) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "dbPath must be an absolute path");
    }
    try {
      if (statSync(dbPath).isDirectory()) {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "dbPath must not point to a directory");
      }
    } catch (error) {
      if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
      // ENOENT / ENOTDIR: init surfaces any real storage failure.
    }
    const artifactStore = options.artifactStore;
    if (artifactStore === null || typeof artifactStore !== "object") {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore must be an object");
    }
    if (typeof artifactStore.put !== "function" || typeof artifactStore.read !== "function") {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore must expose put and read");
    }
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (typeof busyTimeoutMs !== "number" || !Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 1 || busyTimeoutMs > MAX_BUSY_TIMEOUT_MS) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "busyTimeoutMs must be an integer between 1 and 5000");
    }
    const maxCheckpointBytes = options.maxCheckpointBytes ?? LOOP_DELIVERY_CHECKPOINT_MAX_BYTES;
    if (typeof maxCheckpointBytes !== "number" || !Number.isSafeInteger(maxCheckpointBytes) || maxCheckpointBytes < 1 || maxCheckpointBytes > LOOP_DELIVERY_CHECKPOINT_MAX_BYTES) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "maxCheckpointBytes must be a safe integer in 1..1048576");
    }
    this.dbPath = dbPath;
    this.artifactStore = artifactStore;
    this.busyTimeoutMs = busyTimeoutMs;
    this.maxCheckpointBytes = maxCheckpointBytes;
  }

  private connection(): Database.Database {
    if (this.db === null) closed();
    return this.db;
  }

  init(): void {
    if (this.db !== null || this.wasOpened) closed();

    let db: Database.Database | null = null;
    try {
      try {
        mkdirSync(dirname(this.dbPath), { recursive: true });
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      try {
        db = new Database(this.dbPath);
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      this.ensureWalMode(db);

      try {
        db.pragma("foreign_keys = ON");
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      try {
        db.pragma(`busy_timeout = ${this.busyTimeoutMs}`);
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      try {
        db.pragma("synchronous = FULL");
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS loop_delivery_checkpoint_current_head (
            run_id TEXT PRIMARY KEY,
            generation INTEGER NOT NULL,
            checkpoint_artifact_ref TEXT NOT NULL,
            checkpoint_digest_sha256 TEXT NOT NULL
          );
        `);
      } catch (error) {
        if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }

      this.db = db;
      this.wasOpened = true;
    } catch (error) {
      if (db !== null) {
        try {
          db.close();
        } catch {
          // Cleanup failure must not overwrite the original error.
        }
      }
      if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
    }
  }

  close(): void {
    if (this.db === null) return;
    const db = this.db;
    this.db = null;
    try {
      db.close();
    } catch (error) {
      if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
      }
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
    }
  }

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
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
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
        if (isBusyCode(sqliteErrorCode(error))) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
      }
    }
    throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
  }

  // ═══════════════════════════════════════ Request validation

  private validateRunId(runId: unknown): string {
    if (
      typeof runId !== "string" ||
      runId.trim().length === 0 ||
      runId !== runId.trim() ||
      runId.length > MAX_RUN_ID_LENGTH ||
      /[\x00-\x1f\x7f]/.test(runId)
    ) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "runId must be a trimmed non-empty bounded string");
    }
    return runId;
  }

  private validateAdvanceRequest(request: unknown): LoopDeliveryCheckpointAdvanceRequest {
    if (request === null || typeof request !== "object" || Array.isArray(request)) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "advance request must be a plain object");
    }
    const record = request as Record<string, unknown>;
    const runId = this.validateRunId(record.runId);
    const expectedGeneration = record.expectedGeneration;
    if (typeof expectedGeneration !== "number" || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "expectedGeneration must be a non-negative safe integer");
    }
    const expectedRef = record.expectedCheckpointArtifactRef;
    let expectedRefValue: string | null = null;
    if (expectedRef !== null) {
      if (typeof expectedRef !== "string" || !CHECKPOINT_REF_RE.test(expectedRef)) {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "expectedCheckpointArtifactRef must be null or a canonical delivery_checkpoint ref");
      }
      expectedRefValue = expectedRef;
    }
    const checkpoint = record.checkpoint;
    if (checkpoint === null || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint must be a plain object");
    }
    const body = checkpoint as Record<string, unknown>;
    if ("schema" in body || "generation" in body || "previous_checkpoint_artifact_ref" in body) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint body must not carry store-owned fields");
    }
    return Object.freeze({
      runId,
      expectedGeneration,
      expectedCheckpointArtifactRef: expectedRefValue,
      checkpoint: body as LoopDeliveryCheckpointAdvanceBody,
    });
  }

  // ═══════════════════════════════════════ Locator persistence

  private readLocatorRow(db: Database.Database, runId: string): HeadRow | undefined {
    return db.prepare("SELECT * FROM loop_delivery_checkpoint_current_head WHERE run_id = ?").get(runId) as HeadRow | undefined;
  }

  private insertLocatorRow(db: Database.Database, runId: string, generation: number, ref: string, digest: string): void {
    db.prepare(
      "INSERT INTO loop_delivery_checkpoint_current_head (run_id, generation, checkpoint_artifact_ref, checkpoint_digest_sha256) VALUES (?, ?, ?, ?)",
    ).run(runId, generation, ref, digest);
  }

  private updateLocatorRow(db: Database.Database, runId: string, generation: number, ref: string, digest: string): Database.RunResult {
    return db.prepare(
      "UPDATE loop_delivery_checkpoint_current_head SET generation = ?, checkpoint_artifact_ref = ?, checkpoint_digest_sha256 = ? WHERE run_id = ?",
    ).run(generation, ref, digest, runId);
  }

  // ── persisted-data validation boundary ──
  // Data read back from SQLite is untrusted: any validation or digest
  // disagreement is CHECKPOINT_STORE_CORRUPT, never INVALID_INPUT.

  private verifyLocatorRow(row: HeadRow): void {
    if (typeof row.generation !== "number" || !Number.isSafeInteger(row.generation) || row.generation < 1) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint generation is invalid");
    }
    if (typeof row.checkpoint_artifact_ref !== "string" || !CHECKPOINT_REF_RE.test(row.checkpoint_artifact_ref)) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint ref is invalid");
    }
    if (typeof row.checkpoint_digest_sha256 !== "string" || !SHA256_RE.test(row.checkpoint_digest_sha256)) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint digest is invalid");
    }
    const refDigest = row.checkpoint_artifact_ref.split(":").pop()!;
    if (refDigest !== row.checkpoint_digest_sha256) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint ref and digest disagree");
    }
  }

  /**
   * Full read-back verification of the current authority: locator scalars,
   * artifact bytes digest, checkpoint parser, generation and runId binding.
   * Returns a frozen locator + parsed checkpoint + defensive bytes/digest
   * facts. The locator row alone is never returned as authority.
   */
  private verifyCurrent(runId: string, row: HeadRow): LoopDeliveryCheckpointCurrent {
    this.verifyLocatorRow(row);
    let bytes: Buffer;
    let bytesDigest: string;
    try {
      bytes = this.artifactStore.read(row.checkpoint_artifact_ref);
      bytesDigest = sha256Hex(bytes);
    } catch {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint artifact is unreadable");
    }
    if (bytesDigest !== row.checkpoint_digest_sha256) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint digest does not match the artifact bytes");
    }
    const parsed = parseLoopDeliveryCheckpointBytes(bytes, this.maxCheckpointBytes);
    if (!parsed.ok) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint artifact is not a valid checkpoint");
    }
    if (parsed.value.generation !== row.generation) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint generation does not match the locator");
    }
    if (parsed.value.identity.runId !== runId) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint identity does not match the locator");
    }
    if (parsed.digestSha256 !== row.checkpoint_digest_sha256) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint digest does not match the parsed bytes");
    }
    const artifactBytes = new Uint8Array(bytes);
    return Object.freeze({
      runId,
      generation: row.generation,
      checkpointArtifactRef: row.checkpoint_artifact_ref,
      checkpointDigestSha256: row.checkpoint_digest_sha256,
      artifactBytes,
      artifactSizeBytes: artifactBytes.length,
      checkpoint: parsed.value,
    });
  }

  // ═══════════════════════════════════════ Public API

  getCurrent(runId: string): Readonly<LoopDeliveryCheckpointCurrent> | undefined {
    const db = this.connection();
    const validatedRunId = this.validateRunId(runId);
    try {
      const row = this.readLocatorRow(db, validatedRunId);
      if (row === undefined) return undefined;
      return this.verifyCurrent(validatedRunId, row);
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  /**
   * Descriptor-based merge of the caller checkpoint body with store-owned
   * fields. Never invokes getters, never reads caller values through access
   * paths, rejects accessors/symbols/__proto__ and Proxy reflection failures
   * fail closed.
   */
  private mergeBodyWithStoreFields(
    body: Record<string, unknown>,
    generation: number,
    previousRef: string | null,
  ): Record<string, unknown> {
    const out = Object.create(null) as Record<string, unknown>;
    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = Object.getOwnPropertyDescriptors(body);
    } catch {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint body reflection failed");
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint body must not carry symbol keys");
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || "get" in descriptor || "set" in descriptor || !("value" in descriptor)) {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint body must be a plain data record");
      }
      out[key] = descriptor.value;
    }
    out.schema = LOOP_DELIVERY_CHECKPOINT_SCHEMA;
    out.generation = generation;
    out.previous_checkpoint_artifact_ref = previousRef;
    return out;
  }

  private buildCandidate(
    request: LoopDeliveryCheckpointAdvanceRequest,
    generation: number,
    previousRef: string | null,
  ): Candidate {
    const merged = this.mergeBodyWithStoreFields(request.checkpoint as unknown as Record<string, unknown>, generation, previousRef);
    // Cross-binding: the checkpoint identity runId must equal the request
    // runId. The merged record is descriptor-built (no caller getters), so
    // reading it is safe; any reflection failure fails closed as invalid
    // input, never as a storage error.
    let identityRunId: unknown;
    try {
      const identity = merged.identity;
      if (identity === null || typeof identity !== "object") {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint identity must be an object");
      }
      identityRunId = (identity as Record<string, unknown>).runId;
    } catch (error) {
      if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint identity is not readable");
    }
    if (typeof identityRunId !== "string" || identityRunId !== request.runId) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint identity runId must equal the request runId");
    }
    const result = buildLoopDeliveryCheckpoint(merged, this.maxCheckpointBytes);
    if (!result.ok) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_TRANSITION_INVALID", "next checkpoint is not valid");
    }
    return {
      generation,
      previousRef,
      value: result.value,
      bytes: result.bytes,
      digestSha256: result.digestSha256,
      sizeBytes: result.sizeBytes,
    };
  }

  /**
   * CAS advance. Order is strict: validate request → read and fully verify
   * the expected current → build the next checkpoint → verify the
   * transition → build canonical bytes → Artifact Store put → verify the
   * descriptor → BEGIN IMMEDIATE → re-read the locator → CAS insert/update
   * → COMMIT → read-back → advanced/confirmed. No long operation ever runs
   * while holding the SQLite write lock.
   */
  advance(request: LoopDeliveryCheckpointAdvanceRequest): Readonly<LoopDeliveryCheckpointAdvanceResult> {
    const db = this.connection();
    const validated = this.validateAdvanceRequest(request);

    let row: HeadRow | undefined;
    let verified: LoopDeliveryCheckpointCurrent | null = null;
    try {
      row = this.readLocatorRow(db, validated.runId);
      if (row !== undefined) verified = this.verifyCurrent(validated.runId, row);
    } catch (error) {
      return this.translateStorageError(error) as never;
    }

    const expectedMatches =
      row !== undefined &&
      validated.expectedGeneration === row.generation &&
      validated.expectedCheckpointArtifactRef === row.checkpoint_artifact_ref;

    try {
      if (row !== undefined && !expectedMatches) {
        // Exact retry after an unknown response: the current may already be
        // the deterministic candidate built from this identical request.
        const candidate = this.buildCandidate(validated, validated.expectedGeneration + 1, validated.expectedCheckpointArtifactRef);
        const candidateRef = `loop-artifact:v1:delivery_checkpoint:sha256:${candidate.digestSha256}`;
        if (
          candidate.generation === row.generation &&
          candidateRef === row.checkpoint_artifact_ref &&
          candidate.digestSha256 === row.checkpoint_digest_sha256
        ) {
          return Object.freeze({ status: "confirmed", current: verified! });
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STALE", "checkpoint current does not match the request expectation");
      }

      let candidate: ReturnType<LoopDeliveryCheckpointStore["buildCandidate"]>;
      if (row === undefined) {
        if (validated.expectedGeneration !== 0 || validated.expectedCheckpointArtifactRef !== null) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STALE", "checkpoint current does not exist for the run");
        }
        candidate = this.buildCandidate(validated, 1, null);
        if (candidate.value.phase !== "initialized") {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_TRANSITION_INVALID", "new runs must start at the initialized phase");
        }
      } else {
        candidate = this.buildCandidate(validated, row.generation + 1, row.checkpoint_artifact_ref);
        const transition = validateLoopDeliveryCheckpointTransition(verified!.checkpoint, candidate.value);
        if (!transition.ok) {
          throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_TRANSITION_INVALID", "checkpoint transition is invalid");
        }
      }

      const digest = candidate.digestSha256;
      const ref = `loop-artifact:v1:delivery_checkpoint:sha256:${digest}`;

      // Artifact put BEFORE the SQLite CAS. On a losing CAS the artifact may
      // remain as an unreferenced orphan blob — it never becomes authority.
      let descriptor: LoopStoredArtifact;
      try {
        descriptor = this.artifactStore.put("delivery_checkpoint", candidate.bytes);
      } catch {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_ARTIFACT_FAILURE", "checkpoint artifact store put failed");
      }
      if (
        descriptor === null || typeof descriptor !== "object" ||
        descriptor.kind !== "delivery_checkpoint" ||
        descriptor.digest !== digest ||
        descriptor.artifactRef !== ref ||
        descriptor.sizeBytes !== candidate.sizeBytes
      ) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_ARTIFACT_FAILURE", "checkpoint artifact store returned an unexpected descriptor");
      }

      const casStatus = this.casAdvance(db, validated.runId, row, candidate.generation, ref, digest);

      // Post-commit read-back of the locator + artifact.
      const readback = this.getCurrent(validated.runId);
      if (
        readback === undefined ||
        readback.generation !== candidate.generation ||
        readback.checkpointArtifactRef !== ref ||
        readback.checkpointDigestSha256 !== digest
      ) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint read-back does not match the advanced authority");
      }
      return Object.freeze({ status: casStatus, current: readback });
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private casAdvance(
    db: Database.Database,
    runId: string,
    expectedRow: HeadRow | undefined,
    generation: number,
    ref: string,
    digest: string,
  ): "advanced" | "confirmed" {
    try {
      return db.transaction((): "advanced" | "confirmed" => {
        const nowRow = this.readLocatorRow(db, runId);
        if (nowRow === undefined) {
          if (expectedRow !== undefined) {
            throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint locator disappeared");
          }
          try {
            this.insertLocatorRow(db, runId, generation, ref, digest);
            return "advanced";
          } catch (error) {
            if (isConstraintCode(sqliteErrorCode(error))) {
              // Another writer created the row between our read and CAS.
              const after = this.readLocatorRow(db, runId);
              if (
                after !== undefined &&
                after.generation === generation &&
                after.checkpoint_artifact_ref === ref &&
                after.checkpoint_digest_sha256 === digest
              ) {
                return "confirmed";
              }
              throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STALE", "checkpoint current advanced concurrently");
            }
            throw error;
          }
        }
        // Identical candidate already authoritative → exact retry / identical
        // concurrent writer → confirmed without writing a new authority.
        if (
          nowRow.generation === generation &&
          nowRow.checkpoint_artifact_ref === ref &&
          nowRow.checkpoint_digest_sha256 === digest
        ) {
          return "confirmed";
        }
        // Still the expected current → CAS update to the candidate.
        if (
          expectedRow !== undefined &&
          nowRow.generation === expectedRow.generation &&
          nowRow.checkpoint_artifact_ref === expectedRow.checkpoint_artifact_ref
        ) {
          const result = this.updateLocatorRow(db, runId, generation, ref, digest);
          if (result.changes !== 1) {
            throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint locator update failed");
          }
          return "advanced";
        }
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STALE", "checkpoint current is stale");
      }).immediate() as "advanced" | "confirmed";
    } catch (error) {
      if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
      }
      if (isCorruptCode(code)) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint storage is corrupt");
      }
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
    }
  }

  private translateStorageError(error: unknown): never {
    if (error instanceof LoopDeliveryCheckpointStoreError) throw error;
    const code = sqliteErrorCode(error);
    if (isBusyCode(code)) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_BUSY", "checkpoint store is busy");
    }
    if (isCorruptCode(code)) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint storage is corrupt");
    }
    throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_FAILURE", "checkpoint storage operation failed");
  }
}
