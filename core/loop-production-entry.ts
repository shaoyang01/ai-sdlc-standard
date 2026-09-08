// LOOP Production Entry — C03-E E1 (Decision-071, plan §4.1 / §6 E1)
// ============================================================================
// The SINGLE production door. It turns an untrusted request file / stdin JSON
// payload into a validated LoopRunIdentity BEFORE any Agent CLI is spawned:
//   - exact-schema, closed field set — an unknown/extra field is rejected, so a
//     request can never smuggle a token, API key, arbitrary command/argv or env
//     (there is simply no field that could carry them);
//   - mode must be exactly "real" (dry-run uses a separate command/evidence);
//   - expectedBaseSha is a real 40-char lowercase SHA; paths are absolute and
//     repositoryPath !== controlRoot;
//   - the resulting identity is re-validated by the journal's own
//     validateLoopRunIdentity, so the entry can never mint an identity the
//     store would later reject.
//
// This module is PURE: it does NOT touch the filesystem, git or child_process.
// Real repository / base-SHA / dirty-worktree verification is performed by
// LoopGitWorkspaceManager.prepare(identity) in the wiring layer, also before
// the first Agent call.

import { isAbsolute } from "node:path";
import { LoopRunJournalError, type LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";

export const PRODUCTION_ENTRY_SCHEMA = "loop-production-entry:v1";
const PRODUCTION_MODE = "real";

export type ProductionEntryErrorCode =
  | "PRODUCTION_ENTRY_INVALID_INPUT"
  | "PRODUCTION_ENTRY_BAD_SCHEMA"
  | "PRODUCTION_ENTRY_UNSUPPORTED_MODE"
  | "PRODUCTION_ENTRY_BAD_SHA"
  | "PRODUCTION_ENTRY_BAD_PATH"
  | "PRODUCTION_ENTRY_BAD_VERSION";

export class ProductionEntryError extends Error {
  readonly code: ProductionEntryErrorCode;
  constructor(code: ProductionEntryErrorCode, message: string) {
    super(message);
    this.name = "ProductionEntryError";
    this.code = code;
  }
}

function fail(code: ProductionEntryErrorCode, message: string): never {
  throw new ProductionEntryError(code, message);
}

/** The closed v1 request contract (plan §4.1). No secret/command/env field. */
export interface ProductionEntryRequest {
  readonly schema: typeof PRODUCTION_ENTRY_SCHEMA;
  readonly requirementId: string;
  readonly repository: string;
  readonly repositoryPath: string;
  readonly baseBranch: string;
  readonly expectedBaseSha: string;
  readonly taskBranch: string;
  readonly controlRoot: string;
  readonly sourceFiles: readonly string[];
  readonly bindingRegistryVersion: string;
  readonly executionProfileVersion: string;
  readonly mode: "real";
}

export interface ParsedProductionEntry {
  readonly request: ProductionEntryRequest;
  readonly identity: LoopRunIdentity;
}

const REQUEST_FIELDS: readonly string[] = Object.freeze([
  "schema",
  "requirementId",
  "repository",
  "repositoryPath",
  "baseBranch",
  "expectedBaseSha",
  "taskBranch",
  "controlRoot",
  "sourceFiles",
  "bindingRegistryVersion",
  "executionProfileVersion",
  "mode",
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
// runId is minted by the CLI and later embedded in derived file names inside the
// attempt workspace, so it must be a single safe path segment — never a path
// separator or a `..` traversal (Round 1 B1).
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function asSafeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) {
    fail("PRODUCTION_ENTRY_INVALID_INPUT", `${label} must be a trimmed non-empty control-free string`);
  }
  return value as string;
}

function asAbsolutePath(value: unknown, label: string): string {
  const text = asSafeText(value, label);
  if (!isAbsolute(text)) fail("PRODUCTION_ENTRY_BAD_PATH", `${label} must be an absolute path`);
  return text;
}

function isPlainRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("PRODUCTION_ENTRY_INVALID_INPUT", "request must be a plain JSON object");
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    fail("PRODUCTION_ENTRY_INVALID_INPUT", "request must be a plain JSON object");
  }
  return value as Record<string, unknown>;
}

export interface ParseProductionEntryOptions {
  /** ISO timestamp stamped onto the identity (inject for determinism). */
  readonly now: () => string;
  /** Run id minted by the caller/CLI (inject for determinism). */
  readonly runId: string;
}

/**
 * Parse and fully validate a production entry request. Returns the frozen
 * request and the journal-validated identity. Throws ProductionEntryError on
 * ANY contract violation — the caller must abort before spawning an Agent.
 */
export function parseProductionEntryRequest(
  raw: unknown,
  options: ParseProductionEntryOptions,
): ParsedProductionEntry {
  const record = isPlainRecord(raw);

  // Closed field set: every own key must be a known v1 field.
  for (const key of Object.keys(record)) {
    if (!REQUEST_FIELDS.includes(key)) {
      fail("PRODUCTION_ENTRY_INVALID_INPUT", `unknown request field "${key}"`);
    }
  }
  for (const field of REQUEST_FIELDS) {
    if (!(field in record)) fail("PRODUCTION_ENTRY_INVALID_INPUT", `request is missing "${field}"`);
  }

  if (record.schema !== PRODUCTION_ENTRY_SCHEMA) {
    fail("PRODUCTION_ENTRY_BAD_SCHEMA", `schema must be "${PRODUCTION_ENTRY_SCHEMA}"`);
  }
  if (record.mode !== PRODUCTION_MODE) {
    fail("PRODUCTION_ENTRY_UNSUPPORTED_MODE", `production entry mode must be exactly "${PRODUCTION_MODE}"`);
  }

  const requirementId = asSafeText(record.requirementId, "requirementId");
  const repository = asSafeText(record.repository, "repository");
  const baseBranch = asSafeText(record.baseBranch, "baseBranch");
  const taskBranch = asSafeText(record.taskBranch, "taskBranch");
  const bindingRegistryVersion = asSafeText(record.bindingRegistryVersion, "bindingRegistryVersion");
  const executionProfileVersion = asSafeText(record.executionProfileVersion, "executionProfileVersion");
  if (!SEMVER_RE.test(executionProfileVersion)) {
    fail("PRODUCTION_ENTRY_BAD_VERSION", "executionProfileVersion must be semantic version X.Y.Z");
  }

  const expectedBaseSha = asSafeText(record.expectedBaseSha, "expectedBaseSha");
  if (!SHA40_RE.test(expectedBaseSha)) {
    fail("PRODUCTION_ENTRY_BAD_SHA", "expectedBaseSha must be a 40-char lowercase SHA hex");
  }

  const repositoryPath = asAbsolutePath(record.repositoryPath, "repositoryPath");
  const controlRoot = asAbsolutePath(record.controlRoot, "controlRoot");
  if (repositoryPath === controlRoot) {
    fail("PRODUCTION_ENTRY_BAD_PATH", "repositoryPath and controlRoot must differ");
  }

  if (!Array.isArray(record.sourceFiles)) {
    fail("PRODUCTION_ENTRY_INVALID_INPUT", "sourceFiles must be an array (possibly empty)");
  }
  const sourceFiles: string[] = [];
  for (const entry of record.sourceFiles) {
    sourceFiles.push(asAbsolutePath(entry, "sourceFiles[]"));
  }

  const runId = asSafeText(options.runId, "runId");
  const createdAt = options.now();
  if (typeof createdAt !== "string" || !ISO_RE.test(createdAt)) {
    fail("PRODUCTION_ENTRY_INVALID_INPUT", "now() must return an ISO timestamp");
  }
  if (!RUN_ID_RE.test(runId) || runId.includes("..")) {
    fail(
      "PRODUCTION_ENTRY_INVALID_INPUT",
      "runId must be a single safe path segment ([A-Za-z0-9._-], no '..' or separator)",
    );
  }

  const identity: LoopRunIdentity = Object.freeze({
    runId,
    requirementId,
    repository,
    repositoryPath,
    baseBranch,
    expectedBaseSha,
    taskBranch,
    controlRoot,
    createdAt,
  });

  // Re-validate through the journal's own authority so the entry can never
  // mint an identity the store would reject (requirement id format, paths,
  // SHA, ISO, repositoryPath !== controlRoot).
  try {
    validateLoopRunIdentity(identity);
  } catch (error) {
    if (error instanceof LoopRunJournalError) {
      fail("PRODUCTION_ENTRY_INVALID_INPUT", `identity rejected by journal: ${error.message}`);
    }
    throw error;
  }

  const request: ProductionEntryRequest = Object.freeze({
    schema: PRODUCTION_ENTRY_SCHEMA,
    requirementId,
    repository,
    repositoryPath,
    baseBranch,
    expectedBaseSha,
    taskBranch,
    controlRoot,
    sourceFiles: Object.freeze(sourceFiles),
    bindingRegistryVersion,
    executionProfileVersion,
    mode: PRODUCTION_MODE,
  });

  return Object.freeze({ request, identity });
}
