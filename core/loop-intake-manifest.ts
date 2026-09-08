// LOOP Intake Manifest — entry-trigger wiring (Decision-078, design §3)
// ============================================================================
// The machine-readable "normalized and human-confirmed" marker that makes the
// chat→LOOP handoff triggerable: an intake session writes
// library/{requirement_id}/00-需求资料/intake.manifest.json next to its
// normalized documents, and ONLY a status:"confirmed" manifest may start a
// LOOP run (loop-run --from-intake). Chat summaries and spoken confirmation
// are never inputs — this file is the single trigger contract.
//
// Closed v1 field set, fail-closed like loop-production-entry:v1: an unknown
// field is rejected so no side channel (token/command/env) can ride along.
//
// This module is PURE: no filesystem, git or child_process access. The CLI
// layer (scripts/loop-run.ts) reads the file, checks status === "confirmed",
// resolves expectedBaseSha, and freezes the production entry request.

import { isAbsolute } from "node:path";

import { validateRequirementId } from "./loop-run-state";

export const INTAKE_MANIFEST_SCHEMA = "loop-intake-manifest:v1";

export const INTAKE_STATUSES = ["draft", "confirmed"] as const;
export type IntakeManifestStatus = (typeof INTAKE_STATUSES)[number];

/** Mirrors the sdlc-requirement-intake skill's change classification. */
export const INTAKE_CHANGE_CLASSES = [
  "new",
  "supplement",
  "change",
  "rework",
  "feedback",
] as const;
export type IntakeChangeClass = (typeof INTAKE_CHANGE_CLASSES)[number];

export type IntakeManifestErrorCode =
  | "INTAKE_MANIFEST_INVALID_INPUT"
  | "INTAKE_MANIFEST_BAD_SCHEMA"
  | "INTAKE_MANIFEST_BAD_PATH"
  | "INTAKE_MANIFEST_BAD_TIME";

export class IntakeManifestError extends Error {
  readonly code: IntakeManifestErrorCode;
  constructor(code: IntakeManifestErrorCode, message: string) {
    super(message);
    this.name = "IntakeManifestError";
    this.code = code;
  }
}

function fail(code: IntakeManifestErrorCode, message: string): never {
  throw new IntakeManifestError(code, message);
}

/** The closed v1 manifest contract (design §3). No secret/command/env field. */
export interface LoopIntakeManifest {
  readonly schema: typeof INTAKE_MANIFEST_SCHEMA;
  readonly status: IntakeManifestStatus;
  readonly requirementId: string;
  readonly changeClass: IntakeChangeClass;
  readonly sourceType: string;
  readonly sourceFiles: readonly string[];
  readonly repository: string;
  readonly repositoryPath: string;
  readonly baseBranch: string;
  readonly taskBranch: string;
  readonly controlRoot: string;
  readonly confirmedAt: string;
  readonly confirmedBy: string;
}

const MANIFEST_FIELDS: readonly string[] = Object.freeze([
  "schema",
  "status",
  "requirementId",
  "changeClass",
  "sourceType",
  "sourceFiles",
  "repository",
  "repositoryPath",
  "baseBranch",
  "taskBranch",
  "controlRoot",
  "confirmedAt",
  "confirmedBy",
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function asSafeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", `${label} must be a trimmed non-empty control-free string`);
  }
  return value as string;
}

function asAbsolutePath(value: unknown, label: string): string {
  const text = asSafeText(value, label);
  if (!isAbsolute(text)) fail("INTAKE_MANIFEST_BAD_PATH", `${label} must be an absolute path`);
  return text;
}

function isPlainRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", "manifest must be a plain JSON object");
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", "manifest must be a plain JSON object");
  }
  return value as Record<string, unknown>;
}

/**
 * Parse and fully validate an intake manifest. Both draft and confirmed
 * manifests parse — the CONFIRMATION GATE (status must be "confirmed" to
 * trigger a run) is enforced by the CLI on top, so a draft manifest can be
 * round-tripped through the same closed validation while it is being built.
 * Throws IntakeManifestError on ANY contract violation.
 */
export function parseIntakeManifest(raw: unknown): LoopIntakeManifest {
  const record = isPlainRecord(raw);

  for (const key of Object.keys(record)) {
    if (!MANIFEST_FIELDS.includes(key)) {
      fail("INTAKE_MANIFEST_INVALID_INPUT", `unknown manifest field "${key}"`);
    }
  }
  for (const field of MANIFEST_FIELDS) {
    if (!(field in record)) fail("INTAKE_MANIFEST_INVALID_INPUT", `manifest is missing "${field}"`);
  }

  if (record.schema !== INTAKE_MANIFEST_SCHEMA) {
    fail("INTAKE_MANIFEST_BAD_SCHEMA", `schema must be "${INTAKE_MANIFEST_SCHEMA}"`);
  }
  if (typeof record.status !== "string" || !(INTAKE_STATUSES as readonly string[]).includes(record.status)) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", `status must be one of ${INTAKE_STATUSES.join(" | ")}`);
  }
  if (
    typeof record.changeClass !== "string" ||
    !(INTAKE_CHANGE_CLASSES as readonly string[]).includes(record.changeClass)
  ) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", `changeClass must be one of ${INTAKE_CHANGE_CLASSES.join(" | ")}`);
  }

  const requirementId = asSafeText(record.requirementId, "requirementId");
  try {
    validateRequirementId(requirementId);
  } catch (error) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", `requirementId rejected: ${(error as Error).message}`);
  }
  // The requirementId flows into the minted runId and library/ directory names
  // (loop-run mints `run-${requirementId}-<ts>`), so it must be a single safe
  // path segment — the journal's validateRequirementId alone allows ".." and
  // separators, which the production entry otherwise covers at runId level.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requirementId) || requirementId.includes("..")) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", "requirementId must be a single safe path segment ([A-Za-z0-9._-], no '..')");
  }

  const sourceType = asSafeText(record.sourceType, "sourceType");
  const repository = asSafeText(record.repository, "repository");
  const baseBranch = asSafeText(record.baseBranch, "baseBranch");
  const taskBranch = asSafeText(record.taskBranch, "taskBranch");
  const confirmedBy = asSafeText(record.confirmedBy, "confirmedBy");

  const confirmedAt = asSafeText(record.confirmedAt, "confirmedAt");
  if (!ISO_RE.test(confirmedAt)) {
    fail("INTAKE_MANIFEST_BAD_TIME", "confirmedAt must be an ISO timestamp");
  }

  const repositoryPath = asAbsolutePath(record.repositoryPath, "repositoryPath");
  const controlRoot = asAbsolutePath(record.controlRoot, "controlRoot");
  if (repositoryPath === controlRoot) {
    fail("INTAKE_MANIFEST_BAD_PATH", "repositoryPath and controlRoot must differ");
  }

  if (!Array.isArray(record.sourceFiles)) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", "sourceFiles must be an array");
  }
  if (record.sourceFiles.length === 0) {
    fail("INTAKE_MANIFEST_INVALID_INPUT", "sourceFiles must not be empty; a production run needs at least one requirement source");
  }
  const sourceFiles: string[] = [];
  for (const entry of record.sourceFiles) {
    sourceFiles.push(asAbsolutePath(entry, "sourceFiles[]"));
  }

  return Object.freeze({
    schema: INTAKE_MANIFEST_SCHEMA,
    status: record.status as IntakeManifestStatus,
    requirementId,
    changeClass: record.changeClass as IntakeChangeClass,
    sourceType,
    sourceFiles: Object.freeze(sourceFiles),
    repository,
    repositoryPath,
    baseBranch,
    taskBranch,
    controlRoot,
    confirmedAt,
    confirmedBy,
  });
}
