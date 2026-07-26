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
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
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
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;

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

function ioFailure(): never {
  throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", "artifact storage operation failed");
}

function corruptBlob(): never {
  throw new LoopArtifactStoreError("ARTIFACT_CORRUPT", "stored artifact is corrupt");
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

  private readExistingForIdempotent(finalPath: string, digest: string): LoopStoredArtifact | null {
    let stat;
    try {
      stat = lstatSync(finalPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") return null;
      ioFailure();
    }
    if (stat.isSymbolicLink() || !stat.isFile()) corruptBlob();
    const bytes = readFileSync(finalPath);
    if (bytes.length !== stat.size || sha256Hex(bytes) !== digest) corruptBlob();
    return null;
  }

  private verifyFinalBlob(finalPath: string, digest: string): { sizeBytes: number } {
    let stat;
    try {
      stat = lstatSync(finalPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") corruptBlob();
      ioFailure();
    }
    if (stat.isSymbolicLink() || !stat.isFile()) corruptBlob();
    const bytes = readFileSync(finalPath);
    if (bytes.length !== stat.size || sha256Hex(bytes) !== digest) corruptBlob();
    return { sizeBytes: stat.size };
  }

  put(kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact {
    this.assertUsableRoot();
    const canonicalKind = this.validateKind(kind);
    const bytes = this.toContentBytes(content);
    this.checkSize(bytes);
    const digest = sha256Hex(bytes);
    const artifactRef = `loop-artifact:v1:${canonicalKind}:sha256:${digest}`;
    const { shardDir, finalPath } = this.deriveFinalPath(canonicalKind, digest);

    if (existsSync(finalPath)) {
      this.readExistingForIdempotent(finalPath, digest);
      return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: bytes.length });
    }

    try {
      mkdirSync(shardDir, { recursive: true });
    } catch {
      ioFailure();
    }
    const shardStat = lstatSync(shardDir);
    if (shardStat.isSymbolicLink() || !shardStat.isDirectory()) corruptBlob();
    // realpath containment: no component of the shard path may escape the
    // canonical artifact root through an intermediate symlink.
    let realShard: string;
    try {
      realShard = realpathSync(shardDir);
    } catch {
      ioFailure();
    }
    const realRoot = this.root();
    if (!realShard.startsWith(realRoot + sep)) corruptBlob();

    const tempPath = join(shardDir, `.${digest}.${process.pid}.${randomUUID()}.tmp`);
    let fd: number;
    try {
      fd = openSync(tempPath, "wx", 0o600);
    } catch (error) {
      if (existsSync(finalPath)) {
        this.readExistingForIdempotent(finalPath, digest);
        return Object.freeze({ artifactRef, kind: canonicalKind, digest, sizeBytes: bytes.length });
      }
      ioFailure();
    }
    try {
      writeSync(fd, bytes, 0, bytes.length, 0);
      fsyncSync(fd);
      closeSync(fd);
      fd = -1;
      try {
        linkSync(tempPath, finalPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === "EEXIST") {
          // Another writer won the race; the existing final blob must be valid.
        } else {
          ioFailure();
        }
      }
      this.fsyncDirectoryBestEffort(shardDir);
    } finally {
      if (fd !== -1) {
        try {
          closeSync(fd);
        } catch {
          // Best-effort close.
        }
      }
      try {
        unlinkSync(tempPath);
      } catch {
        // Temp may already be gone; never block the winner's cleanup.
      }
    }
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
    const { finalPath } = this.deriveFinalPath(kind, referenceDigest);
    let stat;
    try {
      stat = lstatSync(finalPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") {
        throw new LoopArtifactStoreError("ARTIFACT_NOT_FOUND", "artifact blob does not exist");
      }
      ioFailure();
    }
    if (stat.isSymbolicLink() || !stat.isFile()) corruptBlob();
    if (stat.size > this.maxArtifactBytes) corruptBlob();
    const bytes = readFileSync(finalPath);
    if (sha256Hex(bytes) !== referenceDigest) corruptBlob();
    return Buffer.from(bytes);
  }
}

// Re-export for tests and integrators.
export { LOOP_ARTIFACT_KINDS };
