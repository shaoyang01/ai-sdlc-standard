// LOOP Executor Kernel — Durable Content-Addressed Artifact Store
// ================================================================
// Repository-external, immutable, content-addressed blob store for LOOP
// Executor artifacts (patches, test summaries, review summaries, workspace
// metadata, delivery results). The store never records or echoes artifact
// content in errors; callers are responsible for storing only approved
// artifacts. No raw prompt, stdout, stderr, credentials, environment values,
// or arbitrary metadata.

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
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

// O_NOFOLLOW is platform-specific; fall back to the macOS value on platforms
// where Node.js doesn't expose it (the flag is supported on macOS and Linux).
const O_NOFOLLOW: number =
  (fsConstants as Record<string, number>).O_NOFOLLOW ??
  0x100;

const O_RDONLY: number = fsConstants.O_RDONLY;

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

function invalid(message: string): never {
  throw new LoopArtifactStoreError("INVALID_INPUT", message);
}

function closed(): never {
  throw new LoopArtifactStoreError("ARTIFACT_STORE_CLOSED", "artifact store is not open");
}

const IO_FAILURE_MSG = "artifact storage operation failed";
const CORRUPT_MSG = "stored artifact is corrupt";

function ioFailure(): never {
  throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", IO_FAILURE_MSG);
}

function corruptBlob(): never {
  throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", CORRUPT_MSG);
}

/** Return an error object without throwing — for error-tracking patterns. */
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
  try {
    stat = lstatSync(path);
  } catch {
    ioFailure();
  }
  if (stat.isSymbolicLink()) corruptBlob();
  if (!stat.isDirectory()) corruptBlob();
}

/**
 * Verify that a directory path, after realpath resolution, is still within the
 * canonical artifact root. The directory must exist, not be a symlink, and its
 * realpath must start with root + sep.
 */
function verifyDirectoryContainment(dir: string, root: string): void {
  isRealDirectory(dir);
  let realDir: string;
  try {
    realDir = realpathSync(dir);
  } catch {
    ioFailure();
  }
  if (!realDir.startsWith(root + sep)) corruptBlob();
}

/**
 * Open a final blob with O_NOFOLLOW, verify it is a regular file with mode
 * exactly 0600, and return the fd and stat. The caller owns the fd and must
 * close it.
 */
function openFinalBlobNoFollow(finalPath: string): { fd: number; stat: ReturnType<typeof fstatSync> } {
  let fd: number;
  try {
    fd = openSync(finalPath, O_NOFOLLOW | O_RDONLY);
  } catch (error) {
    if (error instanceof LoopArtifactStoreError) throw error;
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      throw new LoopArtifactStoreError("ARTIFACT_NOT_FOUND", "artifact blob does not exist");
    }
    if (code === "ELOOP" || code === "EMLINK" || code === "ENXIO") {
      corruptBlob();
    }
    ioFailure();
  }

  let stat: ReturnType<typeof fstatSync>;
  try {
    stat = fstatSync(fd);
  } catch {
    try { closeSync(fd); } catch { /* best-effort */ }
    ioFailure();
  }

  if (!stat.isFile()) {
    try { closeSync(fd); } catch { /* best-effort */ }
    corruptBlob();
  }

  const mode = Number(stat.mode) & 0o777;
  if (mode !== REQUIRED_BLOB_MODE) {
    try { closeSync(fd); } catch { /* best-effort */ }
    corruptBlob();
  }

  return { fd, stat };
}

/**
 * Read and verify bytes from an already-opened fd. The caller must ensure the
 * fd is positioned at offset 0 and that stat.size is trusted (from fstat on
 * the same fd without TOCTOU).
 */
function readAndVerifyFromFd(fd: number, expectedSize: number, expectedDigest: string): Buffer {
  const bytes = Buffer.allocUnsafe(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    let bytesRead: number;
    try {
      bytesRead = readSync(fd, bytes, offset, expectedSize - offset, offset);
    } catch {
      ioFailure();
    }
    if (bytesRead <= 0) {
      corruptBlob();
    }
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
    ) {
      invalid("maxArtifactBytes must be a safe positive integer within the allowed bound");
    }
    this.options = Object.freeze({ controlRoot, repositoryPath, maxArtifactBytes });
    this.maxArtifactBytes = maxArtifactBytes;
  }

  init(): void {
    if (this.artifactRoot !== null || this.wasOpened) closed();
    const controlRootInput = this.options.controlRoot;
    const repositoryInput = this.options.repositoryPath;
    let repositoryReal: string;
    try {
      const repositoryStat = statSync(repositoryInput);
      if (!repositoryStat.isDirectory()) invalid("repositoryPath must be an existing directory");
      repositoryReal = realpathSync(repositoryInput);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      invalid("repositoryPath must exist and be a directory");
    }
    let controlReal: string;
    try {
      mkdirSync(controlRootInput, { recursive: true });
      controlReal = realpathSync(controlRootInput);
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
      const rootStat = lstatSync(root);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
      }
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") ioFailure();
      try {
        mkdirSync(root, { recursive: true });
      } catch {
        ioFailure();
      }
    }
    this.artifactRoot = root;
    this.wasOpened = true;
    this.assertUsableRoot();
  }

  close(): void {
    this.artifactRoot = null;
  }

  private root(): string {
    if (this.artifactRoot === null) closed();
    return this.artifactRoot;
  }

  private assertUsableRoot(): void {
    const root = this.root();
    let stat;
    try {
      stat = lstatSync(root);
    } catch {
      ioFailure();
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "artifact root is not a plain directory");
    }
  }

  /**
   * Derive the shard directory and final blob path for a given kind+digest,
   * and verify that both are contained lexically within the artifact root.
   * Full realpath containment verification is performed at access time.
   */
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
   * Verify that the kind directory (parent of shard) and the shard directory
   * are real directories contained within the canonical artifact root. Also
   * verifies the root itself hasn't been replaced with a symlink.
   *
   * Returns the canonical (realpath-resolved) artifact root for use by callers.
   */
  private verifyParentContainment(kind: LoopArtifactKind, shardDir: string): string {
    const root = this.root();
    // Verify root itself hasn't been replaced with a symlink
    isRealDirectory(root);
    let rootReal: string;
    try {
      rootReal = realpathSync(root);
    } catch {
      ioFailure();
    }

    const kindDir = join(root, kind);
    if (existsSync(kindDir)) {
      verifyDirectoryContainment(kindDir, rootReal);
    }

    if (existsSync(shardDir)) {
      verifyDirectoryContainment(shardDir, rootReal);
    }

    return rootReal;
  }

  private validateKind(kind: unknown): LoopArtifactKind {
    if (typeof kind !== "string" || !LOOP_ARTIFACT_KINDS.includes(kind as LoopArtifactKind)) {
      invalid("kind must be a canonical LoopArtifactKind");
    }
    return kind as LoopArtifactKind;
  }

  private toContentBytes(content: string | Uint8Array): Buffer {
    if (typeof content === "string") {
      return Buffer.from(content, "utf8");
    }
    if (content instanceof Uint8Array) {
      return Buffer.from(content);
    }
    invalid("content must be a string or Uint8Array");
  }

  private checkSize(bytes: Buffer): void {
    if (bytes.length > this.maxArtifactBytes) {
      throw new LoopArtifactStoreError("ARTIFACT_TOO_LARGE", "artifact exceeds the configured size limit");
    }
  }

  private fsyncDirectoryBestEffort(dir: string): void {
    let fd: number;
    try {
      fd = openSync(dir, "r");
    } catch {
      ioFailure();
    }
    try {
      fsyncSync(fd);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "EINVAL" || code === "ENOTSUP") {
        // Platform does not support directory fsync; continue.
      } else {
        ioFailure();
      }
    } finally {
      try {
        closeSync(fd);
      } catch {
        // Ignore close failure after a handled fsync attempt.
      }
    }
  }

  /**
   * Read an existing final blob using no-follow fd. Returns the verified
   * size or null if the file does not exist. Throws on corruption or I/O error.
   */
  private readExistingForIdempotent(finalPath: string, digest: string): { sizeBytes: number } | null {
    let fd: number = -1;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) {
        try { closeSync(fd); } catch { /* best-effort */ }
        corruptBlob();
      }
      readAndVerifyFromFd(fd, expectedSize, digest);
      return { sizeBytes: expectedSize };
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) {
        if (error.code === "ARTIFACT_NOT_FOUND") return null;
        throw error;
      }
      ioFailure();
    } finally {
      if (fd !== -1) {
        try { closeSync(fd); } catch { /* best-effort */ }
      }
    }
  }

  /**
   * Verify a final blob using no-follow fd. Returns the verified size or throws.
   */
  private verifyFinalBlob(finalPath: string, digest: string): { sizeBytes: number } {
    let fd: number = -1;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) {
        try { closeSync(fd); } catch { /* best-effort */ }
        corruptBlob();
      }
      readAndVerifyFromFd(fd, expectedSize, digest);
      return { sizeBytes: expectedSize };
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      ioFailure();
    } finally {
      if (fd !== -1) {
        try { closeSync(fd); } catch { /* best-effort */ }
      }
    }
  }

  put(kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact {
    this.assertUsableRoot();
    const canonicalKind = this.validateKind(kind);
    const bytes = this.toContentBytes(content);
    this.checkSize(bytes);
    const digest = sha256Hex(bytes);
    const artifactRef = `loop-artifact:v1:${canonicalKind}:sha256:${digest}`;
    const { shardDir, finalPath } = this.deriveFinalPath(canonicalKind, digest);

    // ── parent containment: verify kind and shard directories ──
    this.verifyParentContainment(canonicalKind, shardDir);

    // ── existing final fast path ──
    if (existsSync(finalPath)) {
      const existing = this.readExistingForIdempotent(finalPath, digest);
      if (existing !== null) {
        // Re-verify parent containment after the read
        this.verifyParentContainment(canonicalKind, shardDir);
        return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: existing.sizeBytes });
      }
      // ENOENT race — the file disappeared between existsSync and open; fall through
    }

    // ── create shard directory ──
    try {
      mkdirSync(shardDir, { recursive: true });
    } catch {
      ioFailure();
    }
    // Re-verify shard containment after creation
    this.verifyParentContainment(canonicalKind, shardDir);

    const tempPath = join(shardDir, `.${digest}.${process.pid}.${randomUUID()}.tmp`);
    let fd: number = -1;
    let mainError: LoopArtifactStoreError | null = null;

    try {
      // ── create temp file (read-write so we can verify before publishing) ──
      try {
        fd = openSync(tempPath, "wx+", REQUIRED_BLOB_MODE);
      } catch (error) {
        if (error instanceof LoopArtifactStoreError) throw error;
        if (existsSync(finalPath)) {
          // Another writer may have completed while we were creating temp
          const existing = this.readExistingForIdempotent(finalPath, digest);
          if (existing !== null) {
            return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: existing.sizeBytes });
          }
        }
        ioFailure();
      }

      // ── write-all with partial write handling ──
      let offset = 0;
      while (offset < bytes.length) {
        let written: number;
        try {
          written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
        } catch {
          mainError = ioFailureError();
          break;
        }
        if (written <= 0) {
          mainError = ioFailureError();
          break;
        }
        offset += written;
      }

      if (mainError === null) {
        // ── fsync temp ──
        try {
          fsyncSync(fd);
        } catch {
          mainError = ioFailureError();
        }
      }

      // ── pre-publish temp verification (using the still-open fd) ──
      if (mainError === null) {
        let tempStat: ReturnType<typeof fstatSync>;
        try {
          tempStat = fstatSync(fd);
        } catch {
          mainError = ioFailureError();
        }
        if (mainError === null) {
          if (!tempStat!.isFile()) {
            mainError = corruptBlobError();
          } else if ((Number(tempStat!.mode) & 0o777) !== REQUIRED_BLOB_MODE) {
            mainError = corruptBlobError();
          } else if (tempStat!.size !== bytes.length) {
            mainError = ioFailureError();
          }
        }
        // Verify temp digest using the fd
        if (mainError === null) {
          const verifyBuf = Buffer.allocUnsafe(bytes.length);
          let verifyOffset = 0;
          while (verifyOffset < bytes.length) {
            let bytesRead: number;
            try {
              bytesRead = readSync(fd, verifyBuf, verifyOffset, bytes.length - verifyOffset, verifyOffset);
            } catch {
              mainError = ioFailureError();
              break;
            }
            if (bytesRead <= 0) {
              mainError = ioFailureError();
              break;
            }
            verifyOffset += bytesRead;
          }
          if (mainError === null && sha256Hex(verifyBuf) !== digest) {
            mainError = ioFailureError();
          }
        }
      }

      // ── close temp ──
      try {
        closeSync(fd);
      } catch {
        if (mainError === null) {
          mainError = ioFailureError();
        }
        // If mainError is already set, preserve it
      }
      fd = -1;

      // ── if pre-publish verification failed, stop here (don't publish) ──
      if (mainError !== null) throw mainError;

      // ── hard-link temp to final ──
      try {
        linkSync(tempPath, finalPath);
      } catch (error) {
        if (error instanceof LoopArtifactStoreError) throw error;
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === "EEXIST") {
          // Another writer won the race; the existing final blob must be valid.
          // Fall through to verifyFinalBlob below.
        } else {
          mainError = ioFailureError();
          throw mainError;
        }
      }

      this.fsyncDirectoryBestEffort(shardDir);
    } finally {
      // ── temp cleanup ──
      if (fd !== -1) {
        try {
          closeSync(fd);
        } catch {
          // Best-effort close of temp fd; preserve mainError.
        }
      }
      try {
        unlinkSync(tempPath);
      } catch {
        // Temp may already be gone (successful link) or may fail to unlink.
        if (mainError === null && existsSync(tempPath)) {
          mainError = ioFailureError();
        }
      }
    }

    if (mainError !== null) throw mainError;

    // ── verify final blob after publish ──
    this.verifyParentContainment(canonicalKind, shardDir);
    const verified = this.verifyFinalBlob(finalPath, digest);
    return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: verified.sizeBytes });
  }

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

    // ── parent containment verification ──
    this.verifyParentContainment(kind, shardDir);

    // ── no-follow fd-based read ──
    let fd: number = -1;
    try {
      const result = openFinalBlobNoFollow(finalPath);
      fd = result.fd;
      const expectedSize = Number(result.stat.size);
      if (expectedSize > this.maxArtifactBytes) {
        try { closeSync(fd); } catch { /* best-effort */ }
        corruptBlob();
      }
      const bytes = readAndVerifyFromFd(fd, expectedSize, referenceDigest);
      return bytes;
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) throw error;
      ioFailure();
    } finally {
      if (fd !== -1) {
        try { closeSync(fd); } catch { /* best-effort */ }
      }
    }
  }
}

// Re-export for tests and integrators.
export { LOOP_ARTIFACT_KINDS };
