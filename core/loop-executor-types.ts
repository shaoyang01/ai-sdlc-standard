// LOOP Executor Kernel — Durable Run Journal Types (LOOP-MVP-01A)
// ================================================================
// Pure state model for the durable LOOP run journal. Control-plane
// persistence only: no Runtime, Graph, ExecutionGateway, Skill Flow,
// Agent routing, Git workspace, patch execution, or target-repo commands.

import type { LoopArtifactStore } from "./loop-artifact-store";

export type LoopRunStatus =
  | "created"
  | "running"
  | "paused"
  | "blocked"
  | "failed"
  | "completed"
  | "cancelled";

export type LoopStageName =
  | "prepare_workspace"
  | "generate_patch"
  | "validate_patch"
  | "apply_patch"
  | "run_tests"
  | "review"
  | "fix"
  | "finalize";

export const LOOP_STAGE_NAMES: readonly LoopStageName[] = [
  "prepare_workspace",
  "generate_patch",
  "validate_patch",
  "apply_patch",
  "run_tests",
  "review",
  "fix",
  "finalize",
] as const;

export type LoopStageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped";

export type LoopRunEventKind =
  | "run_created"
  | "run_started"
  | "stage_started"
  | "stage_succeeded"
  | "stage_failed"
  | "run_paused"
  | "run_resumed"
  | "run_blocked"
  | "run_failed"
  | "run_completed"
  | "run_cancelled"
  // W-GW-DIAG P-K-d (Decision-083): first-class record of the human risk
  // acceptance for a PASS_WITH_RISK verdict round. reasonCode carries the
  // verdict decisionScopeId; scope binding lives in the finding proof rows
  // persisted in the same transaction.
  | "risk_accepted";

export const LOOP_RUN_EVENT_KINDS: readonly LoopRunEventKind[] = [
  "run_created",
  "run_started",
  "stage_started",
  "stage_succeeded",
  "stage_failed",
  "run_paused",
  "run_resumed",
  "run_blocked",
  "run_failed",
  "run_completed",
  "run_cancelled",
  "risk_accepted",
] as const;

export type LoopRunIdentity = Readonly<{
  runId: string;
  requirementId: string;
  repository: string;
  repositoryPath: string;
  baseBranch: string;
  expectedBaseSha: string;
  taskBranch: string;
  controlRoot: string;
  createdAt: string;
}>;

export type LoopStageState = Readonly<{
  stage: LoopStageName;
  status: LoopStageStatus;
  attempt: number;
  updatedAt: string;
}>;

export type LoopRunState = Readonly<{
  identity: LoopRunIdentity;
  status: LoopRunStatus;
  currentStage: LoopStageName | null;
  currentAttempt: number;
  fixRound: number;
  lastSequence: number;
  lastEventId: string;
  blockingReasonCode: string | null;
  failureReasonCode: string | null;
  updatedAt: string;
  stages: Readonly<Record<LoopStageName, LoopStageState>>;
}>;

export type LoopRunEvent = Readonly<{
  eventId: string;
  runId: string;
  sequence: number;
  kind: LoopRunEventKind;
  stage: LoopStageName | null;
  attempt: number;
  createdAt: string;
  inputDigest: string | null;
  outputArtifactRef: string | null;
  outputDigest: string | null;
  errorCode: string | null;
  retryable: boolean | null;
  reasonCode: string | null;
  // C01 WP-4: execution provenance. Nullable for backward compatibility with
  // events persisted before this schema extension.
  bindingId: string | null;
  bindingVersion: string | null;
  inputArtifactRef: string | null;
}>;

export type LoopRunJournalErrorCode =
  | "INVALID_INPUT"
  | "RUN_ID_CONFLICT"
  | "RUN_NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "EVENT_ID_CONFLICT"
  | "EVENT_SEQUENCE_CONFLICT"
  | "TERMINAL_RUN"
  // W-GW-DIAG P-K-d (Decision-082): a PASS_WITH_RISK verdict awaits the
  // human risk acceptance before task-planning may be dispatched.
  | "RISK_ACCEPTANCE_PENDING"
  | "STORE_CLOSED"
  | "STORE_BUSY"
  | "STORE_FAILURE"
  | "STORE_CORRUPT"
  // v2 cutover (C02-WP3.5-B, D3): known pre-v6 journal formats and v0
  // databases that already carry LOOP business tables are unsupported
  // history — never semantically migrated, never treated as corrupt.
  | "UNSUPPORTED_HISTORICAL_FORMAT"
  // A journal whose declared format is newer than this build supports.
  | "UNSUPPORTED_FUTURE_FORMAT";

/**
 * Options for LoopRunStore. busyTimeoutMs defaults to 2000 (integer 1..5000).
 *
 * artifactStore binds the durable content-addressed artifact store so that
 * artifact revisions (C02-WP2) are cross-checked against physical blobs:
 * appends are rejected when the referenced blob is missing or digest-drifted,
 * and every revision read path fails closed when a persisted revision's blob
 * no longer exists or no longer matches. When omitted the store keeps
 * journal-only semantics (used by pure-journal tests and tooling).
 */
export type LoopRunStoreOptions = Readonly<{
  busyTimeoutMs?: number;
  artifactStore?: LoopArtifactStore;
}>;

/** A fully verified, immutable read snapshot of one run. */
export type LoopRunSnapshot = Readonly<{
  state: LoopRunState;
  events: readonly LoopRunEvent[];
}>;

const MAX_ERROR_MESSAGE_LENGTH = 256;

/**
 * Last-line defense for error messages: strips control characters and bounds
 * the length. Callers must still avoid echoing external input in the first
 * place — truncation is never the primary protection for secrets.
 */
function sanitizeErrorMessage(message: string): string {
  const withoutControlCharacters = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  if (withoutControlCharacters.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return withoutControlCharacters;
  }
  return withoutControlCharacters.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/**
 * Safe bounded error. The message is a short safe explanation only — it never
 * carries raw input, payload, prompt, patch, stdout, stderr, credential, or
 * environment values, and the original input exception text is never kept.
 */
export class LoopRunJournalError extends Error {
  readonly code: LoopRunJournalErrorCode;

  constructor(code: LoopRunJournalErrorCode, message: string) {
    super(sanitizeErrorMessage(message));
    this.name = "LoopRunJournalError";
    this.code = code;
  }
}
