// LOOP Executor Kernel — Durable Content-Addressed Artifact Store
// ================================================================
// Repository-external, immutable, content-addressed blob store for LOOP
// Executor artifacts (patches, test summaries, review summaries, workspace
// metadata, delivery results). The store never records or echoes artifact
// content in errors; callers are responsible for storing only approved
// artifacts. No raw prompt, stdout, stderr, credentials, environment values,
// or arbitrary metadata.
//
// Uses import * as fs so that tests can monkeypatch shared fs methods.

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

export type LoopArtifactKind =
  | "code_patch"
  | "test_summary"
  | "review_summary"
  | "delivery_result"
  | "workspace_metadata";

const LOOP_ARTIFACT_KINDS: readonly LoopArtifactKind[] = [
  "code_patch",
  "test_summary",
  "review_summary",
  "delivery_result",
  "workspace_metadata",
];

export type LoopStoredArtifact = Readonly<{
  artifactRef: string;
  kind: LoopArtifactKind;
  digest: string;
  sizeBytes: number;
}>;

export type LoopArtifactStoreOptions = Readonly<{
  controlRoot: string;
  repositoryPath: string;
  maxArtifactBytes?: number;
}>;

export type LoopArtifactStoreErrorCode =
  | "INVALID_INPUT"
  | "ARTIFACT_STORE_CLOSED"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_TOO_LARGE"
  | "ARTIFACT_DIGEST_MISMATCH"
  | "ARTIFACT_CORRUPT"
  | "ARTIFACT_IO_FAILURE";

const DEFAULT_MAX_ARTIFACT_BYTES = 1_048_576;
const MAX_MAX_ARTIFACT_BYTES = 16_777_216;
const MAX_ERROR_MESSAGE_LENGTH = 256;
const REQUIRED_BLOB_MODE = 0o600;
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;

// O_NOFOLLOW is platform-specific.
const O_NOFOLLOW: number =
  (fs.constants as Record<string, number>).O_NOFOLLOW ?? 0x100;
const O_RDONLY: number = fs.constants.O_RDONLY;

function sanitizeMessage(message: string): string {
  const withoutControl = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return withoutControl.length > MAX_ERROR_MESSAGE_LENGTH
    ? withoutControl.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : withoutControl;
}

export class LoopArtifactStoreError extends Error {
  readonly code: LoopArtifactStoreErrorCode;
  constructor(code: LoopArtifactStoreErrorCode, message: string) {
    super(sanitizeMessage(message));
    this.name = "LoopArtifactStoreError";
    this.code = code;
  }
}

// ── error helpers ──

const IO_FAILURE_MSG = "artifact storage operation failed";
const CORRUPT_MSG = "stored artifact is corrupt";

function invalid(message: string): never {
  throw new LoopArtifactStoreError("INVALID_INPUT", message);
}
function closed(): never {
  throw new LoopArtifactStoreError("ARTIFACT_STORE_CLOSED", "artifact store is not open");
}
function ioFailure(): never {
  throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", IO_FAILURE_MSG);
}
function corruptBlob(): never {
  throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", CORRUPT_MSG);
}
function ioFailureError(): LoopArtifactStoreError {
  return new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", IO_FAILURE_MSG);
}
function corruptBlobError(): LoopArtifactStoreError {
  return new LoopArtifactStoreError("ARTIFACT_CORRUPT", CORRUPT_MSG);
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    invalid(`${label} must be a trimmed absolute path`);
  }
  if (!isAbsolute(value)) invalid(`${label} must be an absolute path`);
  return value;
}

// ── containment helpers ──

function isRealDirectory(path: string): void {
  let stat;
  try { stat = fs.lstatSync(path); } catch { ioFailure(); }
  if (stat.isSymbolicLink()) corruptBlob();
  if (!stat.isDirectory()) corruptBlob();
}

function verifyDirectoryContainment(dir: string, root: string): void {
  isRealDirectory(dir);
  let realDir: string;
  try { realDir = fs.realpathSync(dir); } catch { ioFailure(); }
  if (!realDir.startsWith(root + sep)) corruptBlob();
}

// ── no-follow fd helpers ──

function openFinalBlobNoFollow(finalPath: string): { fd: number; stat: fs.Stats } {
  let fd: number;
  try {
    fd = fs.openSync(finalPath, O_NOFOLLOW | O_RDONLY);
  } catch (error) {
    if (error instanceof LoopArtifactStoreError) throw error;
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      throw new LoopArtifactStoreError("ARTIFACT_NOT_FOUND", "artifact blob does not exist");
    }
    if (code === "ELOOP" || code === "EMLINK" || code === "ENXIO") { corruptBlob(); }
    ioFailure();
  }
  let stat: fs.Stats;
  try { stat = fs.fstatSync(fd); } catch { tryFsClose(fd); ioFailure(); }
  if (!stat.isFile()) { tryFsClose(fd); corruptBlob(); }
  if ((Number(stat.mode) & 0o777) !== REQUIRED_BLOB_MODE) { tryFsClose(fd); corruptBlob(); }
  return { fd, stat };
}

/**
 * Close an fd. Returns null on success, or a typed error on failure.
 * Never throws — callers must check the return value.
 */
function tryFsClose(fd: number): LoopArtifactStoreError | null {
  try { fs.closeSync(fd); return null; } catch { return ioFailureError(); }
}

function tryFsUnlink(path: string): LoopArtifactStoreError | null {
  try { fs.unlinkSync(path); return null; } catch { return ioFailureError(); }
}

function readAndVerifyFromFd(fd: number, expectedSize: number, expectedDigest: string): Buffer {
  const bytes = Buffer.allocUnsafe(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    let bytesRead: number;
    try { bytesRead = fs.readSync(fd, bytes, offset, expectedSize - offset, offset); } catch { ioFailure(); }
    if (bytesRead <= 0) { corruptBlob(); }
    offset += bytesRead;
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
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      invalid("options must be a plain object");
    }
    const controlRoot = asAbsolutePath(options.controlRoot, "controlRoot");
    const repositoryPath = asAbsolutePath(options.repositoryPath, "repositoryPath");
    const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    if (
      typeof maxArtifactBytes !== "number" ||
      !Number.isSafeInteger(maxArtifactBytes) ||
      maxArtifactBytes < 1 ||
      maxArtifactBytes > MAX_MAX_ARTIFACT_BYTES
    ) { invalid("maxArtifactBytes must be a safe positive integer within the allowed bound"); }
    this.options = Object.freeze({ controlRoot, repositoryPath, maxArtifactBytes });
    this.maxArtifactBytes = maxArtifactBytes;
  }

  init(): void {
    if (this.artifactRoot !== null || this.wasOpened) closed();
    const controlRootInput = this.options.controlRoot;
    const repositoryInput = this.options.repositoryPath;
    let repositoryReal: string;
    try {
      const repositoryStat = fs.statSync(repositoryInput);
      if (!repositoryStat.isDirectory()) invalid("repositoryPath must be an existing directory");
      repositoryReal = fs.realpathSync(repositoryInput);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      invalid("repositoryPath must exist and be a directory");
    }
    let controlReal: string;
    try {
      fs.mkdirSync(controlRootInput, { recursive: true });
      controlReal = fs.realpathSync(controlRootInput);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      ioFailure();
    }
    if (controlReal === repositoryReal) {
      invalid("controlRoot and repositoryPath must not resolve to the same location");
    }
    if (controlReal.startsWith(repositoryReal + sep)) {
      invalid("repository must not contain the control root");
    }
    if (repositoryReal.startsWith(controlReal + sep)) {
      invalid("controlRoot must not contain the repository");
    }
    const root = join(controlReal, "artifacts", "v1");
    try {
      const rootStat = fs.lstatSync(root);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
      }
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") ioFailure();
      try { fs.mkdirSync(root, { recursive: true }); } catch { ioFailure(); }
    }
    this.artifactRoot = root;
    this.wasOpened = true;
    this.assertUsableRoot();
  }

  close(): void { this.artifactRoot = null; }

  private root(): string {
    if (this.artifactRoot === null) closed();
    return this.artifactRoot;
  }

  private assertUsableRoot(): void {
    const root = this.root();
    let stat;
    try { stat = fs.lstatSync(root); } catch { ioFailure(); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
    }
  }

  private deriveFinalPath(kind: LoopArtifactKind, digest: string): { shardDir: string; finalPath: string } {
    const root = this.root();
    const shardDir = join(root, kind, digest.slice(0, 2));
    const finalPath = join(shardDir, `${digest}.blob`);
    const resolvedShard = resolve(shardDir);
    const resolvedFinal = resolve(finalPath);
    if (!resolvedShard.startsWith(root + sep) || !resolvedFinal.startsWith(resolvedShard + sep)) {
      throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact path escapes the artifact root");
    }
    return { shardDir, finalPath };
  }

  /**
   * Parent containment: verify root, kind dir, and shard dir are real
   * directories within the canonical root. Called as both pre-check and
   * post-check before every successful return.
   */
  private verifyParentContainment(kind: LoopArtifactKind, shardDir: string): void {
    const root = this.root();
    isRealDirectory(root);
    let rootReal: string;
    try { rootReal = fs.realpathSync(root); } catch { ioFailure(); }
    const kindDir = join(root, kind);
    if (fs.existsSync(kindDir)) { verifyDirectoryContainment(kindDir, rootReal); }
    if (fs.existsSync(shardDir)) { verifyDirectoryContainment(shardDir, rootReal); }
  }

  private validateKind(kind: unknown): LoopArtifactKind {
    if (typeof kind !== "string" || !LOOP_ARTIFACT_KINDS.includes(kind as LoopArtifactKind)) {
      invalid("kind must be a canonical LoopArtifactKind");
    }
    return kind as LoopArtifactKind;
  }

  private toContentBytes(content: string | Uint8Array): Buffer {
    if (typeof content === "string") return Buffer.from(content, "utf8");
    if (content instanceof Uint8Array) return Buffer.from(content);
    invalid("content must be a string or Uint8Array");
  }

  private checkSize(bytes: Buffer): void {
    if (bytes.length > this.maxArtifactBytes) {
      throw new LoopArtifactStoreError("ARTIFACT_TOO_LARGE", "artifact exceeds the configured size limit");
    }
  }

  // ── directory fsync (cleanup failure surfaced) ──

  private fsyncDirectoryBestEffort(dir: string): LoopArtifactStoreError | null {
    let fd: number;
    try { fd = fs.openSync(dir, "r"); } catch { return ioFailureError(); }
    try { fs.fsyncSync(fd); } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "EINVAL" || code === "ENOTSUP") { /* platform limitation, continue */ }
      else { tryFsClose(fd); return ioFailureError(); }
    }
    return tryFsClose(fd);
  }

  // ── read existing final with cleanup tracking ──

  /**
   * Returns { sizeBytes } on success, null on ENOENT.
   * Throws on corruption. Cleanup failures are surfaced via the
   * returned cleanupError out-parameter pattern — but since this is
   * an internal helper called inside put(), the caller handles cleanup.
   */
  private readExistingForIdempotent(
    finalPath: string,
    digest: string,
  ): { sizeBytes: number; closeError: LoopArtifactStoreError | null } | null {
    let fd: number = -1;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) { corruptBlob(); }
      readAndVerifyFromFd(fd, expectedSize, digest);
      const closeError = tryFsClose(fd);
      fd = -1;
      return { sizeBytes: expectedSize, closeError };
    } catch (error) {
      if (fd !== -1) tryFsClose(fd);
      if (error instanceof LoopArtifactStoreError) {
        if (error.code === "ARTIFACT_NOT_FOUND") return null;
        throw error;
      }
      ioFailure();
    }
  }

  /**
   * Verify final blob. Returns { sizeBytes, closeError }.
   * Throws on corruption or read failure.
   */
  private verifyFinalBlob(
    finalPath: string,
    digest: string,
  ): { sizeBytes: number; closeError: LoopArtifactStoreError | null } {
    let fd: number = -1;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) { corruptBlob(); }
      readAndVerifyFromFd(fd, expectedSize, digest);
      const closeError = tryFsClose(fd);
      fd = -1;
      return { sizeBytes: expectedSize, closeError };
    } catch (error) {
      if (fd !== -1) tryFsClose(fd);
      if (error instanceof LoopArtifactStoreError) throw error;
      ioFailure();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // put
  // ═══════════════════════════════════════════════════════════════

  put(kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact {
    this.assertUsableRoot();
    const canonicalKind = this.validateKind(kind);
    const bytes = this.toContentBytes(content);
    this.checkSize(bytes);
    const digest = sha256Hex(bytes);
    const artifactRef = `loop-artifact:v1:${canonicalKind}:sha256:${digest}`;
    const { shardDir, finalPath } = this.deriveFinalPath(canonicalKind, digest);

    // ── parent pre-check ──
    this.verifyParentContainment(canonicalKind, shardDir);

    // ── existing final fast path ──
    if (fs.existsSync(finalPath)) {
      const existing = this.readExistingForIdempotent(finalPath, digest);
      if (existing !== null) {
        // post-check before return
        this.verifyParentContainment(canonicalKind, shardDir);
        if (existing.closeError !== null) throw existing.closeError;
        return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: existing.sizeBytes });
      }
    }

    // ── create shard directory ──
    try { fs.mkdirSync(shardDir, { recursive: true }); } catch { ioFailure(); }
    this.verifyParentContainment(canonicalKind, shardDir);

    const tempPath = join(shardDir, `.${digest}.${process.pid}.${randomUUID()}.tmp`);

    // Tracking variables — no return inside resource try
    let mainError: LoopArtifactStoreError | null = null;
    let cleanupError: LoopArtifactStoreError | null = null;
    let result: LoopStoredArtifact | null = null;
    let fd: number = -1;
    let didPublish = false;

    try {
      // ── create temp ──
      try {
        fd = fs.openSync(tempPath, "wx+", REQUIRED_BLOB_MODE);
      } catch (error) {
        if (error instanceof LoopArtifactStoreError) throw error;
        if (fs.existsSync(finalPath)) {
          // concurrent winner — read and return
          const existing = this.readExistingForIdempotent(finalPath, digest);
          if (existing !== null) {
            this.verifyParentContainment(canonicalKind, shardDir);
            if (existing.closeError !== null) throw existing.closeError;
            result = Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: existing.sizeBytes });
            return result; // jump to finally for temp cleanup (which is no-op since temp wasn't created)
          }
        }
        mainError = ioFailureError();
        return; // jump to finally
      }
      if (mainError !== null) return; // shouldn't happen, but safety

      // ── write-all ──
      let offset = 0;
      while (offset < bytes.length) {
        let written: number;
        try { written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); } catch { mainError = ioFailureError(); return; }
        if (written <= 0) { mainError = ioFailureError(); return; }
        offset += written;
      }

      // ── fsync temp ──
      try { fs.fsyncSync(fd); } catch { mainError = ioFailureError(); return; }

      // ── pre-publish temp verification (same fd) ──
      let tempStat: fs.Stats;
      try { tempStat = fs.fstatSync(fd); } catch { mainError = ioFailureError(); return; }
      if (!tempStat.isFile()) { mainError = corruptBlobError(); return; }
      if ((Number(tempStat.mode) & 0o777) !== REQUIRED_BLOB_MODE) { mainError = corruptBlobError(); return; }
      if (tempStat.size !== bytes.length) { mainError = ioFailureError(); return; }

      const verifyBuf = Buffer.allocUnsafe(bytes.length);
      let verifyOffset = 0;
      while (verifyOffset < bytes.length) {
        let bytesRead: number;
        try { bytesRead = fs.readSync(fd, verifyBuf, verifyOffset, bytes.length - verifyOffset, verifyOffset); } catch { mainError = ioFailureError(); return; }
        if (bytesRead <= 0) { mainError = ioFailureError(); return; }
        verifyOffset += bytesRead;
      }
      if (sha256Hex(verifyBuf) !== digest) { mainError = ioFailureError(); return; }

      // ── close temp (before link) ──
      const tempCloseError = tryFsClose(fd);
      fd = -1;
      if (tempCloseError !== null) { mainError = tempCloseError; return; }

      // ── hard-link to final ──
      try {
        fs.linkSync(tempPath, finalPath);
        didPublish = true;
      } catch (error) {
        if (error instanceof LoopArtifactStoreError) { mainError = error; return; }
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === "EEXIST") {
          // Another writer won — verify their blob
        } else {
          mainError = ioFailureError();
          return;
        }
      }

      // ── directory fsync ──
      const dirSyncError = this.fsyncDirectoryBestEffort(shardDir);
      if (dirSyncError !== null) { cleanupError = dirSyncError; /* fall through to final verify */ }

      // ── temp unlink (best-effort, preserve mainError) ──
      const unlinkError = tryFsUnlink(tempPath);
      if (mainError === null && unlinkError !== null && cleanupError === null) {
        cleanupError = unlinkError;
      }

      // ── verify final blob ──
      this.verifyParentContainment(canonicalKind, shardDir);
      const verified = this.verifyFinalBlob(finalPath, digest);
      if (verified.closeError !== null && cleanupError === null) { cleanupError = verified.closeError; }

      // ── parent post-check ──
      this.verifyParentContainment(canonicalKind, shardDir);

      result = Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: verified.sizeBytes });
    } finally {
      // temp fd cleanup (if still open)
      if (fd !== -1) tryFsClose(fd);
      // temp file cleanup (if not yet unlinked and we didn't publish successfully)
      if (!didPublish && mainError === null) {
        tryFsUnlink(tempPath); // best-effort temp cleanup
      }
    }

    // ── result decision ──
    if (mainError !== null) throw mainError;
    if (cleanupError !== null) throw cleanupError;
    if (result === null) ioFailure(); // should be unreachable
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // read
  // ═══════════════════════════════════════════════════════════════

  read(artifactRef: string, expectedDigest?: string): Buffer {
    this.assertUsableRoot();
    if (typeof artifactRef !== "string") invalid("artifactRef must be a string");
    const match = REF_RE.exec(artifactRef);
    if (match === null) invalid("artifactRef must match the canonical loop-artifact:v1 format");
    const kind = this.validateKind(match[1]);
    const referenceDigest = match[2]!;
    if (expectedDigest !== undefined) {
      if (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest)) {
        invalid("expectedDigest must be a 64-char lowercase SHA-256 hex");
      }
      if (expectedDigest !== referenceDigest) {
        throw new LoopArtifactStoreError("ARTIFACT_DIGEST_MISMATCH", "expected digest does not match the artifact reference");
      }
    }
    const { shardDir, finalPath } = this.deriveFinalPath(kind, referenceDigest);

    // ── parent pre-check ──
    this.verifyParentContainment(kind, shardDir);

    let fd: number = -1;
    let closeError: LoopArtifactStoreError | null = null;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) { corruptBlob(); }
      const bytes = readAndVerifyFromFd(fd, expectedSize, referenceDigest);
      closeError = tryFsClose(fd);
      fd = -1;

      // ── parent post-check ──
      this.verifyParentContainment(kind, shardDir);

      if (closeError !== null) throw closeError;
      return bytes;
    } catch (error) {
      if (fd !== -1) tryFsClose(fd);
      if (error instanceof LoopArtifactStoreError) throw error;
      ioFailure();
    }
  }
}

export { LOOP_ARTIFACT_KINDS };
