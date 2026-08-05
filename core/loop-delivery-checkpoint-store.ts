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
  LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS,
  LOOP_DELIVERY_CHECKPOINT_BODY_KEYS,
  LOOP_DELIVERY_CHECKPOINT_IDENTITY_KEYS,
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

/** Fixed persistent schema version of the locator DB (D10-A-R-004). */
export const LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION = 1 as const;

// Exact public-input key sequences (D10-A-R-001/R-003). Constructor options
// may appear as a canonical subsequence prefix (optional fields omittable);
// the advance request and checkpoint body must appear exactly as listed.
const OPTION_KEYS: readonly string[] = ["dbPath", "artifactStore", "busyTimeoutMs", "maxCheckpointBytes"];
const ADVANCE_REQUEST_KEYS: readonly string[] = ["runId", "expectedGeneration", "expectedCheckpointArtifactRef", "checkpoint"];
const STORE_OWNED_BODY_KEYS: readonly string[] = ["schema", "generation", "previous_checkpoint_artifact_ref"];

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeMessage(message: string): string {
  const withoutControl = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return withoutControl.length > MAX_ERROR_MESSAGE_LENGTH
    ? withoutControl.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : withoutControl;
}

// ── Public-input descriptor snapshots (D10-A-R-003) ──
// Every public input (constructor options, advance request, checkpoint body,
// nested identity) is read exclusively through own-key descriptor snapshots:
// getters are never invoked, values are never read through access paths, and
// any reflection failure (Proxy traps, revoked proxies) fails closed as
// INVALID_INPUT with a bounded static diagnostic. Raw exception text, paths,
// artifact bytes and credential material are never propagated.

/**
 * Descriptor-based snapshot of a public input record. `allowed` is the exact
 * canonical own-key sequence: reordered, extra, missing, symbol and
 * `__proto__` keys, accessors, class instances and non-plain prototypes are
 * all rejected. When `exact` is false the keys must be a canonical prefix of
 * `allowed` (used for constructor options where trailing optional fields may
 * be omitted). `hintKeys` get a dedicated "must not carry" diagnostic.
 */
function snapshotSequence(
  value: unknown,
  allowed: readonly string[],
  label: string,
  exact: boolean,
  hintKeys: readonly string[],
): Record<string, unknown> {
  // Array.isArray / typeof on a revoked proxy can throw — any reflection
  // failure fails closed before anything else runs.
  let notPlain: boolean;
  try {
    notPlain = value === null || typeof value !== "object" || Array.isArray(value);
  } catch {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must be a plain object`);
  }
  if (notPlain) {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must be a plain object`);
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} prototype reflection failed`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must be a plain object`);
  }
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} ownKeys reflection failed`);
  }
  const stringKeys: string[] = [];
  for (const key of keys) {
    if (typeof key === "symbol") {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must not carry symbol keys`);
    }
    if (key === "__proto__") {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must not carry a __proto__ key`);
    }
    if (!allowed.includes(key)) {
      if (hintKeys.includes(key)) {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must not carry ${key}`);
      }
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} carries an unknown key`);
    }
    stringKeys.push(key);
  }
  if (exact) {
    if (stringKeys.length !== allowed.length) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} is missing required keys`);
    }
  } else if (stringKeys.length < 2) {
    throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} is missing required keys`);
  }
  for (let index = 0; index < stringKeys.length; index += 1) {
    if (stringKeys[index] !== allowed[index]) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} has keys in the wrong order`);
    }
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of stringKeys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} key descriptor is missing`);
    }
    if ("get" in descriptor || "set" in descriptor) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} must not carry accessor properties`);
    }
    if (!("value" in descriptor)) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", `${label} key has no value`);
    }
    out[key] = descriptor.value;
  }
  return out;
}

/**
 * Artifact Store capability check that never invokes getters: `put`/`read`
 * are located through own-key descriptors along the prototype chain, so
 * accessor properties and reflection failures fail closed without executing
 * them. Legitimate LoopArtifactStore instances and compatible injected
 * objects (including class instances with prototype methods) are accepted.
 */
function checkArtifactStoreCapability(value: object): void {
  for (const name of ["put", "read"]) {
    let found = false;
    let cursor: unknown = value;
    for (let depth = 0; depth < 64 && cursor !== null && cursor !== undefined; depth += 1) {
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(cursor, name);
      } catch {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore capability reflection failed");
      }
      if (descriptor !== undefined) {
        if ("get" in descriptor || "set" in descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
          throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore must expose put and read as functions");
        }
        found = true;
        break;
      }
      try {
        cursor = Object.getPrototypeOf(cursor);
      } catch {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore capability reflection failed");
      }
    }
    if (!found) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore must expose put and read");
    }
  }
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
    // Descriptor-based snapshot of the public options record (R-003 9.1):
    // keys must appear as a canonical prefix of dbPath/artifactStore/
    // busyTimeoutMs/maxCheckpointBytes; getters are never invoked; any
    // reflection failure fails closed as INVALID_INPUT.
    const snapshot = snapshotSequence(options, OPTION_KEYS, "options", false, []);
    const dbPath = snapshot.dbPath;
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
    const artifactStore = snapshot.artifactStore;
    if (artifactStore === null || typeof artifactStore !== "object") {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "artifactStore must be an object");
    }
    checkArtifactStoreCapability(artifactStore);
    const busyTimeoutMs = snapshot.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (typeof busyTimeoutMs !== "number" || !Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 1 || busyTimeoutMs > MAX_BUSY_TIMEOUT_MS) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "busyTimeoutMs must be an integer between 1 and 5000");
    }
    const maxCheckpointBytes = snapshot.maxCheckpointBytes ?? LOOP_DELIVERY_CHECKPOINT_MAX_BYTES;
    if (typeof maxCheckpointBytes !== "number" || !Number.isSafeInteger(maxCheckpointBytes) || maxCheckpointBytes < 1 || maxCheckpointBytes > LOOP_DELIVERY_CHECKPOINT_MAX_BYTES) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "maxCheckpointBytes must be a safe integer in 1..1048576");
    }
    this.dbPath = dbPath;
    this.artifactStore = artifactStore as LoopArtifactStoreLike;
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

      // ── Exact persistent schema gate (D10-A-R-004) ──
      // Only a strictly fresh empty DB (user_version 0, no user tables) is
      // initialized: exact table creation, user_version 1, then read-back
      // verification. Any other state is an existing DB that must already
      // carry the exact supported schema — no migration, no auto-repair,
      // no IF NOT EXISTS acceptance of an unknown schema.
      const version = this.readUserVersion(db);
      const userTables = this.readUserTables(db);
      if (version === 0 && userTables.length === 0) {
        this.createExactSchema(db);
        this.setUserVersion(db, LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION);
        this.verifyExactSchema(db);
      } else if (
        version === LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION &&
        userTables.length === 1 &&
        userTables[0] === "loop_delivery_checkpoint_current_head"
      ) {
        this.verifyExactSchema(db);
      } else {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint store schema is not the exact supported schema");
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

  // ── exact persistent schema helpers (D10-A-R-004) ──
  // Schema shape mismatches are CHECKPOINT_STORE_CORRUPT and are never
  // migrated or repaired. Failed init always closes the opened connection,
  // never retains this.db and leaves no observable lock.

  private readUserVersion(db: Database.Database): number {
    try {
      return Number(db.pragma("user_version", { simple: true }));
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private readUserTables(db: Database.Database): string[] {
    try {
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      return rows.map((row) => String(row.name));
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private readTableInfo(db: Database.Database): Array<{ cid: number; name: string; type: string; notnull: number; pk: number }> {
    try {
      return db.prepare("PRAGMA table_info(loop_delivery_checkpoint_current_head)").all() as Array<{ cid: number; name: string; type: string; notnull: number; pk: number }>;
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private setUserVersion(db: Database.Database, version: number): void {
    try {
      db.pragma(`user_version = ${version}`);
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private createExactSchema(db: Database.Database): void {
    try {
      db.exec(`
        CREATE TABLE loop_delivery_checkpoint_current_head (
          run_id TEXT NOT NULL PRIMARY KEY,
          generation INTEGER NOT NULL,
          checkpoint_artifact_ref TEXT NOT NULL,
          checkpoint_digest_sha256 TEXT NOT NULL
        );
      `);
    } catch (error) {
      return this.translateStorageError(error) as never;
    }
  }

  private verifyExactSchema(db: Database.Database): void {
    const expected: ReadonlyArray<{ name: string; type: string; notnull: number; pk: number }> = [
      { name: "run_id", type: "TEXT", notnull: 1, pk: 1 },
      { name: "generation", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "checkpoint_artifact_ref", type: "TEXT", notnull: 1, pk: 0 },
      { name: "checkpoint_digest_sha256", type: "TEXT", notnull: 1, pk: 0 },
    ];
    const columns = this.readTableInfo(db);
    if (columns.length !== expected.length) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint store schema is not the exact supported schema");
    }
    for (let index = 0; index < expected.length; index += 1) {
      const column = columns[index]!;
      const want = expected[index]!;
      if (column.name !== want.name || column.type !== want.type || column.notnull !== want.notnull || column.pk !== want.pk) {
        throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint store schema is not the exact supported schema");
      }
    }
    if (this.readUserVersion(db) !== LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint store schema is not the exact supported schema");
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
    // Descriptor-based exact-sequence snapshot of the whole request record
    // (R-003 9.2): getters are never invoked and reflection failures fail
    // closed as INVALID_INPUT before any value is read.
    const snapshot = snapshotSequence(request, ADVANCE_REQUEST_KEYS, "advance request", true, []);
    const runId = this.validateRunId(snapshot.runId);
    const expectedGeneration = snapshot.expectedGeneration;
    if (typeof expectedGeneration !== "number" || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "expectedGeneration must be a non-negative safe integer");
    }
    const expectedRef = snapshot.expectedCheckpointArtifactRef;
    let expectedRefValue: string | null = null;
    if (expectedRef !== null) {
      if (typeof expectedRef !== "string" || !CHECKPOINT_REF_RE.test(expectedRef)) {
        throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "expectedCheckpointArtifactRef must be null or a canonical delivery_checkpoint ref");
      }
      expectedRefValue = expectedRef;
    }
    // Checkpoint body: exact BODY_KEYS sequence via descriptors (R-003 9.3).
    // Store-owned fields (schema/generation/previous_checkpoint_artifact_ref)
    // are not part of the body sequence and are rejected explicitly.
    const body = snapshotSequence(
      snapshot.checkpoint,
      LOOP_DELIVERY_CHECKPOINT_BODY_KEYS,
      "checkpoint body",
      true,
      STORE_OWNED_BODY_KEYS,
    );
    // Nested identity: descriptor-based exact nine-field snapshot before any
    // identity value is read (R-003 9.4). The caller identity object is never
    // accessed through property paths afterwards — cross-binding reads the
    // trusted frozen checkpoint built by the builder.
    if (body.identity !== null && body.identity !== undefined) {
      body.identity = snapshotSequence(body.identity, LOOP_DELIVERY_CHECKPOINT_IDENTITY_KEYS, "identity", true, []);
    }
    return Object.freeze({
      runId,
      expectedGeneration,
      expectedCheckpointArtifactRef: expectedRefValue,
      checkpoint: Object.freeze(body) as LoopDeliveryCheckpointAdvanceBody,
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

  private updateLocatorRow(
    db: Database.Database,
    runId: string,
    generation: number,
    ref: string,
    digest: string,
    expected: HeadRow,
  ): Database.RunResult {
    // Full-locator CAS predicate (D10-A-R-002): the update only applies when
    // run_id, generation, ref AND digest all equal the expected authority.
    return db.prepare(
      "UPDATE loop_delivery_checkpoint_current_head SET generation = ?, checkpoint_artifact_ref = ?, checkpoint_digest_sha256 = ? WHERE run_id = ? AND generation = ? AND checkpoint_artifact_ref = ? AND checkpoint_digest_sha256 = ?",
    ).run(generation, ref, digest, runId, expected.generation, expected.checkpoint_artifact_ref, expected.checkpoint_digest_sha256);
  }

  // ── persisted-data validation boundary ──
  // Data read back from SQLite is untrusted: any validation or digest
  // disagreement is CHECKPOINT_STORE_CORRUPT, never INVALID_INPUT.

  /**
   * Full locator verification (D10-A-R-002): generation must be a positive
   * safe integer, ref a canonical delivery_checkpoint ref, digest lowercase
   * SHA-256, the digest embedded in the ref must equal the locator digest,
   * and the run_id must match the operation target. Any disagreement is
   * CHECKPOINT_STORE_CORRUPT — a malformed locator is never overwritten.
   */
  private verifyLocatorRow(row: HeadRow, runId: string): void {
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
    if (row.run_id !== runId) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "persisted checkpoint locator run id mismatch");
    }
  }

  /**
   * Full read-back verification of the current authority: locator scalars,
   * artifact bytes digest, checkpoint parser, generation and runId binding.
   * Returns a frozen locator + parsed checkpoint + defensive bytes/digest
   * facts. The locator row alone is never returned as authority.
   */
  private verifyCurrent(runId: string, row: HeadRow): LoopDeliveryCheckpointCurrent {
    this.verifyLocatorRow(row, runId);
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
   * Store-owned merge of the (already descriptor-snapshotted) checkpoint body
   * with schema/generation/previous ref. The complete checkpoint object is
   * constructed explicitly in the exact canonical root key sequence
   * (D10-A-R-001 7.3): the store never relies on the builder to reorder its
   * own record, and the body itself was validated in the exact BODY_KEYS
   * sequence (full root sequence minus the three store-owned fields).
   */
  private mergeBodyWithStoreFields(
    body: Record<string, unknown>,
    generation: number,
    previousRef: string | null,
  ): Record<string, unknown> {
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS) {
      if (key === "schema") {
        out.schema = LOOP_DELIVERY_CHECKPOINT_SCHEMA;
      } else if (key === "generation") {
        out.generation = generation;
      } else if (key === "previous_checkpoint_artifact_ref") {
        out.previous_checkpoint_artifact_ref = previousRef;
      } else {
        out[key] = body[key];
      }
    }
    return out;
  }

  private buildCandidate(
    request: LoopDeliveryCheckpointAdvanceRequest,
    generation: number,
    previousRef: string | null,
  ): Candidate {
    const merged = this.mergeBodyWithStoreFields(request.checkpoint as unknown as Record<string, unknown>, generation, previousRef);
    const result = buildLoopDeliveryCheckpoint(merged, this.maxCheckpointBytes);
    if (!result.ok) {
      throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_TRANSITION_INVALID", "next checkpoint is not valid");
    }
    // Cross-binding (R-003 9.4): the checkpoint identity runId must equal the
    // request runId, read from the successfully built trusted frozen
    // checkpoint — never from the caller's identity object.
    if (result.value.identity.runId !== request.runId) {
      throw new LoopDeliveryCheckpointStoreError("INVALID_INPUT", "checkpoint identity runId must equal the request runId");
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

  /**
   * Full-locator CAS advance (D10-A-R-002). Inside the transaction the
   * locator is re-read and fully verified before any classification:
   * malformed / ref-digest disagreement / disappeared previously-verified
   * locator → CHECKPOINT_STORE_CORRUPT (never overwritten); exact candidate
   * already authoritative → confirmed; exact expected authority → CAS update
   * guarded by the full generation/ref/digest WHERE predicate; any other
   * valid authority → CHECKPOINT_STALE.
   */
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
            // A locator that was fully verified before the CAS disappeared.
            throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint locator disappeared");
          }
          try {
            this.insertLocatorRow(db, runId, generation, ref, digest);
            return "advanced";
          } catch (error) {
            if (isConstraintCode(sqliteErrorCode(error))) {
              // Another writer created the row between our read and CAS.
              const after = this.readLocatorRow(db, runId);
              if (after === undefined) {
                throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint locator disappeared during CAS");
              }
              this.verifyLocatorRow(after, runId);
              if (
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
        // Freshly re-read locator is untrusted persisted data: full
        // verification first (malformed rows are corrupt and must never be
        // overwritten by a CAS update).
        this.verifyLocatorRow(nowRow, runId);
        // Exact candidate already authoritative → exact retry / identical
        // concurrent writer → confirmed without writing a new authority.
        if (
          nowRow.generation === generation &&
          nowRow.checkpoint_artifact_ref === ref &&
          nowRow.checkpoint_digest_sha256 === digest
        ) {
          return "confirmed";
        }
        // Still exactly the expected authority → CAS update with the full
        // generation/ref/digest predicate.
        if (
          expectedRow !== undefined &&
          nowRow.generation === expectedRow.generation &&
          nowRow.checkpoint_artifact_ref === expectedRow.checkpoint_artifact_ref &&
          nowRow.checkpoint_digest_sha256 === expectedRow.checkpoint_digest_sha256
        ) {
          const result = this.updateLocatorRow(db, runId, generation, ref, digest, expectedRow);
          if (result.changes !== 1) {
            // The authority moved between the in-transaction read and the
            // update: re-read, full-verify and classify.
            const after = this.readLocatorRow(db, runId);
            if (after === undefined) {
              throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STORE_CORRUPT", "checkpoint locator disappeared during CAS");
            }
            this.verifyLocatorRow(after, runId);
            if (
              after.generation === generation &&
              after.checkpoint_artifact_ref === ref &&
              after.checkpoint_digest_sha256 === digest
            ) {
              return "confirmed";
            }
            throw new LoopDeliveryCheckpointStoreError("CHECKPOINT_STALE", "checkpoint current is stale");
          }
          return "advanced";
        }
        // Valid but changed authority → stale, never overwritten.
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
