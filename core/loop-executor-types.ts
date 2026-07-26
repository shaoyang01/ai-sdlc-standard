// LOOP Executor Kernel — Durable Run Journal Types (LOOP-MVP-01A)
// ================================================================
// Pure state model for the durable LOOP run journal. Control-plane
// persistence only: no Runtime, Graph, ExecutionGateway, Skill Flow,
// Agent routing, Git workspace, patch execution, or target-repo commands.

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
  | "run_cancelled";

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
}>;

export type LoopRunJournalErrorCode =
  | "INVALID_INPUT"
  | "RUN_ID_CONFLICT"
  | "RUN_NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "EVENT_ID_CONFLICT"
  | "EVENT_SEQUENCE_CONFLICT"
  | "TERMINAL_RUN"
  | "STORE_CLOSED"
  | "STORE_CORRUPT";

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
