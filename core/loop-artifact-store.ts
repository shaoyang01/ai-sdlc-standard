// LOOP Executor Kernel — Durable Content-Addressed Artifact Store
// ================================================================
// Uses `const fs = require("node:fs")` so that tests can monkeypatch
// individual fs methods through the shared require cache.
//
// No return/throw inside resource-try blocks — all outcomes flow through
// the post-finally decision point.

import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
const fs = require("node:fs") as typeof import("node:fs");
import { isAbsolute, join, resolve, sep } from "node:path";

export type LoopArtifactKind =
  | "code_patch"
  | "test_summary"
  | "review_summary"
  | "delivery_result"
  | "workspace_metadata"
  | "requirement_summary"
  | "technical_design"
  | "solution_review"
  | "executor_input"
  | "orchestration_result";

const LOOP_ARTIFACT_KINDS: readonly LoopArtifactKind[] = [
  "code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata",
  "requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result",
];

export type LoopStoredArtifact = Readonly<{ artifactRef: string; kind: LoopArtifactKind; digest: string; sizeBytes: number }>;
export type LoopArtifactStoreOptions = Readonly<{ controlRoot: string; repositoryPath: string; maxArtifactBytes?: number }>;
export type LoopArtifactStoreErrorCode =
  | "INVALID_INPUT" | "ARTIFACT_STORE_CLOSED" | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_TOO_LARGE" | "ARTIFACT_DIGEST_MISMATCH" | "ARTIFACT_CORRUPT" | "ARTIFACT_IO_FAILURE";

const DEFAULT_MAX_ARTIFACT_BYTES = 1_048_576;
const MAX_MAX_ARTIFACT_BYTES = 16_777_216;
const MAX_ERROR_MESSAGE_LENGTH = 256;
const REQUIRED_BLOB_MODE = 0o600;
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const O_NOFOLLOW: number = (fs.constants as Record<string, number>).O_NOFOLLOW ?? 0x100;
const O_RDONLY: number = fs.constants.O_RDONLY;

function sanitizeMessage(message: string): string {
  const withoutControl = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return withoutControl.length > MAX_ERROR_MESSAGE_LENGTH ? withoutControl.slice(0, MAX_ERROR_MESSAGE_LENGTH) : withoutControl;
}

export class LoopArtifactStoreError extends Error {
  readonly code: LoopArtifactStoreErrorCode;
  constructor(code: LoopArtifactStoreErrorCode, message: string) {
    super(sanitizeMessage(message));
    this.name = "LoopArtifactStoreError";
    this.code = code;
  }
}

const IO_FAILURE_MSG = "artifact storage operation failed";
const CORRUPT_MSG = "stored artifact is corrupt";

function invalid(msg: string): never { throw new LoopArtifactStoreError("INVALID_INPUT", msg); }
function closed(): never { throw new LoopArtifactStoreError("ARTIFACT_STORE_CLOSED", "artifact store is not open"); }
function ioFailure(): never { throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", IO_FAILURE_MSG); }
function corruptBlob(): never { throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", CORRUPT_MSG); }
function ioFailureError(): LoopArtifactStoreError { return new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", IO_FAILURE_MSG); }
function corruptBlobError(): LoopArtifactStoreError { return new LoopArtifactStoreError("ARTIFACT_CORRUPT", CORRUPT_MSG); }
function sha256Hex(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

function asAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) invalid(`${label} must be a trimmed absolute path`);
  if (!isAbsolute(value)) invalid(`${label} must be an absolute path`);
  return value;
}

// ── containment ──
function isRealDirectory(path: string): void {
  let stat; try { stat = fs.lstatSync(path); } catch { ioFailure(); }
  if (stat.isSymbolicLink()) corruptBlob();
  if (!stat.isDirectory()) corruptBlob();
}
function verifyDirectoryContainment(dir: string, root: string): void {
  isRealDirectory(dir);
  let realDir: string; try { realDir = fs.realpathSync(dir); } catch { ioFailure(); }
  if (!realDir.startsWith(root + sep)) corruptBlob();
}

// ── fd helpers (return typed errors, never throw) ──
function tryFsClose(fd: number): LoopArtifactStoreError | null {
  try { fs.closeSync(fd); return null; } catch { return ioFailureError(); }
}
function tryFsUnlink(path: string): LoopArtifactStoreError | null {
  try { fs.unlinkSync(path); return null; } catch { return ioFailureError(); }
}

function openFinalBlobNoFollow(finalPath: string): { fd: number; stat: Stats } {
  let fd: number;
  try { fd = fs.openSync(finalPath, O_NOFOLLOW | O_RDONLY); } catch (error) {
    if (error instanceof LoopArtifactStoreError) throw error;
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") throw new LoopArtifactStoreError("ARTIFACT_NOT_FOUND", "artifact blob does not exist");
    if (code === "ELOOP" || code === "EMLINK" || code === "ENXIO") corruptBlob();
    ioFailure();
  }
  let stat: Stats;
  try { stat = fs.fstatSync(fd); } catch { tryFsClose(fd); ioFailure(); }
  if (!stat.isFile()) { tryFsClose(fd); corruptBlob(); }
  if ((Number(stat.mode) & 0o777) !== REQUIRED_BLOB_MODE) { tryFsClose(fd); corruptBlob(); }
  return { fd, stat };
}

function readAndVerifyFromFd(fd: number, expectedSize: number, expectedDigest: string): Buffer {
  const bytes = Buffer.allocUnsafe(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    let br: number;
    try { br = fs.readSync(fd, bytes, offset, expectedSize - offset, offset); } catch { ioFailure(); }
    if (br <= 0) corruptBlob();
    offset += br;
  }
  if (sha256Hex(bytes) !== expectedDigest) corruptBlob();
  return bytes;
}

export class LoopArtifactStore {
  private readonly options: LoopArtifactStoreOptions;
  private readonly maxArtifactBytes: number;
  private artifactRoot: string | null = null;
  private wasOpened = false;

  constructor(options: LoopArtifactStoreOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) invalid("options must be a plain object");
    const cr = asAbsolutePath(options.controlRoot, "controlRoot");
    const rp = asAbsolutePath(options.repositoryPath, "repositoryPath");
    const mb = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    if (typeof mb !== "number" || !Number.isSafeInteger(mb) || mb < 1 || mb > MAX_MAX_ARTIFACT_BYTES) invalid("maxArtifactBytes must be a safe positive integer within the allowed bound");
    this.options = Object.freeze({ controlRoot: cr, repositoryPath: rp, maxArtifactBytes: mb });
    this.maxArtifactBytes = mb;
  }

  init(): void {
    if (this.artifactRoot !== null || this.wasOpened) closed();
    const ci = this.options.controlRoot;
    const ri = this.options.repositoryPath;
    let rr: string;
    try { const s = fs.statSync(ri); if (!s.isDirectory()) invalid("repositoryPath must be an existing directory"); rr = fs.realpathSync(ri); } catch (e) { if (e instanceof LoopArtifactStoreError) throw e; invalid("repositoryPath must exist and be a directory"); }
    let cr: string;
    try { fs.mkdirSync(ci, { recursive: true }); cr = fs.realpathSync(ci); } catch (e) { if (e instanceof LoopArtifactStoreError) throw e; ioFailure(); }
    if (cr === rr) invalid("controlRoot and repositoryPath must not resolve to the same location");
    if (cr.startsWith(rr + sep)) invalid("repository must not contain the control root");
    if (rr.startsWith(cr + sep)) invalid("controlRoot must not contain the repository");
    const root = join(cr, "artifacts", "v1");
    try {
      const rs = fs.lstatSync(root);
      if (rs.isSymbolicLink() || !rs.isDirectory()) throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
    } catch (e) {
      if (e instanceof LoopArtifactStoreError) throw e;
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") ioFailure();
      try { fs.mkdirSync(root, { recursive: true }); } catch { ioFailure(); }
    }
    this.artifactRoot = root;
    this.wasOpened = true;
    this.assertUsableRoot();
  }
  close(): void { this.artifactRoot = null; }
  private root(): string { if (this.artifactRoot === null) closed(); return this.artifactRoot; }
  private assertUsableRoot(): void {
    const r = this.root(); let s; try { s = fs.lstatSync(r); } catch { ioFailure(); }
    if (s.isSymbolicLink() || !s.isDirectory()) throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
  }
  private deriveFinalPath(kind: LoopArtifactKind, digest: string): { shardDir: string; finalPath: string } {
    const r = this.root();
    const sd = join(r, kind, digest.slice(0, 2));
    const fp = join(sd, `${digest}.blob`);
    if (!resolve(sd).startsWith(r + sep) || !resolve(fp).startsWith(resolve(sd) + sep)) throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact path escapes the artifact root");
    return { shardDir: sd, finalPath: fp };
  }
  private verifyParentContainment(kind: LoopArtifactKind, shardDir: string): void {
    const r = this.root(); isRealDirectory(r);
    let rr: string; try { rr = fs.realpathSync(r); } catch { ioFailure(); }
    const kd = join(r, kind);
    if (fs.existsSync(kd)) verifyDirectoryContainment(kd, rr);
    if (fs.existsSync(shardDir)) verifyDirectoryContainment(shardDir, rr);
  }
  private validateKind(kind: unknown): LoopArtifactKind {
    if (typeof kind !== "string" || !LOOP_ARTIFACT_KINDS.includes(kind as LoopArtifactKind)) invalid("kind must be a canonical LoopArtifactKind");
    return kind as LoopArtifactKind;
  }
  private toContentBytes(content: string | Uint8Array): Buffer {
    if (typeof content === "string") return Buffer.from(content, "utf8");
    if (content instanceof Uint8Array) return Buffer.from(content);
    invalid("content must be a string or Uint8Array");
  }
  private checkSize(bytes: Buffer): void { if (bytes.length > this.maxArtifactBytes) throw new LoopArtifactStoreError("ARTIFACT_TOO_LARGE", "artifact exceeds the configured size limit"); }

  private fsyncDirectoryBestEffort(dir: string): LoopArtifactStoreError | null {
    let fd: number;
    try { fd = fs.openSync(dir, "r"); } catch { return ioFailureError(); }
    try { fs.fsyncSync(fd); } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EINVAL" || code === "ENOTSUP") { /* ok */ } else { tryFsClose(fd); return ioFailureError(); }
    }
    return tryFsClose(fd);
  }

  private readExistingForIdempotent(finalPath: string, digest: string): { sizeBytes: number; closeError: LoopArtifactStoreError | null } | null {
    let fd = -1;
    try {
      const { fd: f, stat } = openFinalBlobNoFollow(finalPath); fd = f;
      const sz = Number(stat.size); if (sz > this.maxArtifactBytes) { corruptBlob(); }
      readAndVerifyFromFd(fd, sz, digest);
      const ce = tryFsClose(fd); fd = -1;
      return { sizeBytes: sz, closeError: ce };
    } catch (e) {
      if (fd !== -1) tryFsClose(fd);
      if (e instanceof LoopArtifactStoreError) { if (e.code === "ARTIFACT_NOT_FOUND") return null; throw e; }
      ioFailure();
    }
  }
  private verifyFinalBlob(finalPath: string, digest: string): { sizeBytes: number; closeError: LoopArtifactStoreError | null } {
    let fd = -1;
    try {
      const { fd: f, stat } = openFinalBlobNoFollow(finalPath); fd = f;
      const sz = Number(stat.size); if (sz > this.maxArtifactBytes) { corruptBlob(); }
      readAndVerifyFromFd(fd, sz, digest);
      const ce = tryFsClose(fd); fd = -1;
      return { sizeBytes: sz, closeError: ce };
    } catch (e) {
      if (fd !== -1) tryFsClose(fd);
      if (e instanceof LoopArtifactStoreError) throw e;
      ioFailure();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // put — zero return/throw inside resource try
  // ═══════════════════════════════════════════════════════════════
  put(kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact {
    this.assertUsableRoot();
    const ck = this.validateKind(kind);
    const bytes = this.toContentBytes(content);
    this.checkSize(bytes);
    const digest = sha256Hex(bytes);
    const ref = `loop-artifact:v1:${ck}:sha256:${digest}`;
    const { shardDir, finalPath } = this.deriveFinalPath(ck, digest);

    // Tracking state — no return/throw between try and finally
    let mainError: LoopArtifactStoreError | null = null;
    let cleanupError: LoopArtifactStoreError | null = null;
    let result: LoopStoredArtifact | null = null;
    let fd: number = -1;
    let tempPath: string | null = null;

    try {
      // ── pre-check ──
      this.verifyParentContainment(ck, shardDir);

      // ── existing final path ──
      if (fs.existsSync(finalPath)) {
        const existing = this.readExistingForIdempotent(finalPath, digest);
        if (existing !== null) {
          if (existing.closeError !== null) { mainError = existing.closeError; }
          else {
            this.verifyParentContainment(ck, shardDir);
            result = Object.freeze({ artifactRef: ref, kind: ck, digest, sizeBytes: existing.sizeBytes });
          }
        }
        // if existing === null (ENOENT race), fall through
      }

      // ── create shard ──
      if (mainError === null && result === null) {
        try { fs.mkdirSync(shardDir, { recursive: true }); } catch { mainError = ioFailureError(); }
        if (mainError === null) this.verifyParentContainment(ck, shardDir);
      }

      // ── open temp ──
      if (mainError === null && result === null) {
        tempPath = join(shardDir, `.${digest}.${process.pid}.${randomUUID()}.tmp`);
        try {
          fd = fs.openSync(tempPath, "wx+", REQUIRED_BLOB_MODE);
        } catch (e) {
          if (e instanceof LoopArtifactStoreError) { mainError = e; }
          else if (fs.existsSync(finalPath)) {
            const existing = this.readExistingForIdempotent(finalPath, digest);
            if (existing !== null) {
              if (existing.closeError !== null) { mainError = existing.closeError; }
              else {
                this.verifyParentContainment(ck, shardDir);
                result = Object.freeze({ artifactRef: ref, kind: ck, digest, sizeBytes: existing.sizeBytes });
              }
            } else { mainError = ioFailureError(); }
          } else { mainError = ioFailureError(); }
        }
      }

      // ── write-all ──
      if (mainError === null && result === null && fd !== -1) {
        let offset = 0;
        while (offset < bytes.length && mainError === null) {
          let written: number;
          try { written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); } catch { mainError = ioFailureError(); break; }
          if (written <= 0) { mainError = ioFailureError(); break; }
          offset += written;
        }
      }

      // ── fsync ──
      if (mainError === null && result === null && fd !== -1) {
        try { fs.fsyncSync(fd); } catch { mainError = ioFailureError(); }
      }

      // ── pre-publish temp verify ──
      if (mainError === null && result === null && fd !== -1) {
        let ts: Stats;
        try { ts = fs.fstatSync(fd); } catch { mainError = ioFailureError(); }
        if (mainError === null) {
          if (!ts!.isFile()) mainError = corruptBlobError();
          else if ((Number(ts!.mode) & 0o777) !== REQUIRED_BLOB_MODE) mainError = corruptBlobError();
          else if (ts!.size !== bytes.length) mainError = ioFailureError();
          else {
            const vbuf = Buffer.allocUnsafe(bytes.length);
            let vo = 0;
            while (vo < bytes.length && mainError === null) {
              let br: number;
              try { br = fs.readSync(fd, vbuf, vo, bytes.length - vo, vo); } catch { mainError = ioFailureError(); break; }
              if (br <= 0) { mainError = ioFailureError(); break; }
              vo += br;
            }
            if (mainError === null && sha256Hex(vbuf) !== digest) mainError = ioFailureError();
          }
        }
      }

      // ── close temp ──
      if (fd !== -1) {
        const ce = tryFsClose(fd);
        fd = -1;
        if (mainError === null && result === null && ce !== null) mainError = ce;
      }

      // ── hard-link ──
      if (mainError === null && result === null && tempPath !== null) {
        try { fs.linkSync(tempPath, finalPath); } catch (e) {
          if (e instanceof LoopArtifactStoreError) mainError = e;
          else if ((e as NodeJS.ErrnoException).code === "EEXIST") { /* winner race, fall through */ }
          else mainError = ioFailureError();
        }
      }

      // ── directory fsync ──
      if (mainError === null && result === null) {
        const dse = this.fsyncDirectoryBestEffort(shardDir);
        if (dse !== null) cleanupError = dse;
      }

      // ── final verify ──
      if (mainError === null && result === null) {
        this.verifyParentContainment(ck, shardDir);
        const v = this.verifyFinalBlob(finalPath, digest);
        if (v.closeError !== null && cleanupError === null) cleanupError = v.closeError;
        this.verifyParentContainment(ck, shardDir);
        result = Object.freeze({ artifactRef: ref, kind: ck, digest, sizeBytes: v.sizeBytes });
      }
    } finally {
      // ── fd cleanup ──
      if (fd !== -1) tryFsClose(fd);
      // ── own-temp cleanup ──
      if (tempPath !== null) {
        const ue = tryFsUnlink(tempPath);
        if (mainError === null && cleanupError === null && ue !== null) cleanupError = ue;
        // If mainError is set, unlink failure does not override it
      }
    }

    // ── final decision ──
    if (mainError !== null) throw mainError;
    if (cleanupError !== null) throw cleanupError;
    if (result === null) throw ioFailureError();
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // read — zero return/throw inside resource try
  // ═══════════════════════════════════════════════════════════════
  read(artifactRef: string, expectedDigest?: string): Buffer {
    this.assertUsableRoot();
    if (typeof artifactRef !== "string") invalid("artifactRef must be a string");
    const m = REF_RE.exec(artifactRef);
    if (m === null) invalid("artifactRef must match the canonical loop-artifact:v1 format");
    const kind = this.validateKind(m[1]);
    const refDigest = m[2]!;
    if (expectedDigest !== undefined) {
      if (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest)) invalid("expectedDigest must be a 64-char lowercase SHA-256 hex");
      if (expectedDigest !== refDigest) throw new LoopArtifactStoreError("ARTIFACT_DIGEST_MISMATCH", "expected digest does not match the artifact reference");
    }
    const { shardDir, finalPath } = this.deriveFinalPath(kind, refDigest);

    let mainError: LoopArtifactStoreError | null = null;
    let cleanupError: LoopArtifactStoreError | null = null;
    let result: Buffer | null = null;
    let fd: number = -1;

    try {
      this.verifyParentContainment(kind, shardDir);
      const { fd: f, stat } = openFinalBlobNoFollow(finalPath); fd = f;
      const sz = Number(stat.size); if (sz > this.maxArtifactBytes) { mainError = corruptBlobError(); }
      if (mainError === null) {
        try { result = readAndVerifyFromFd(fd, sz, refDigest); } catch (e) { mainError = e instanceof LoopArtifactStoreError ? e : ioFailureError(); }
      }
      if (fd !== -1) { const ce = tryFsClose(fd); fd = -1; if (mainError === null && ce !== null) cleanupError = ce; }
      if (mainError === null && result !== null) {
        this.verifyParentContainment(kind, shardDir);
      }
    } finally {
      if (fd !== -1) tryFsClose(fd);
    }

    if (mainError !== null) throw mainError;
    if (cleanupError !== null) throw cleanupError;
    if (result === null) throw ioFailureError();
    return result;
  }
}

export { LOOP_ARTIFACT_KINDS };
