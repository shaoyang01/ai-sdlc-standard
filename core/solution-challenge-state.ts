// Solution Challenge Shared State
// ================================
// Single source of truth for SolutionChallengeState type,
// validation, result derivation, and shadow-state factory.
// Used by Runtime executor, Graph transitions, Replay, and ExecutionContext.

export type SolutionChallengeStatus =
  | "NEEDS_REVISION"
  | "READY_FOR_GATE";

export type SolutionChallengeMode =
  | "INITIAL_CHALLENGE"
  | "FOLLOW_UP_VERIFICATION";

export interface SolutionChallengeState {
  mode: SolutionChallengeMode;
  currentCycle: 1 | 2;
  maxCycles: 2;
  exhausted: boolean;
  status: SolutionChallengeStatus;
  findingIds?: string[];
  reportPath: string | null;
  artifactStatus: "shadow_only" | "generated";
}

/** Derive top-level result from SolutionChallengeState.status. */
export function deriveSolutionChallengeResult(
  status: SolutionChallengeStatus
): "PASS" | "FAIL" {
  return status === "NEEDS_REVISION" ? "FAIL" : "PASS";
}

const MAX_CHALLENGE_REVISION_CYCLES = 2;

/** Create a valid shadow-mode READY_FOR_GATE state (cycle 1).
 *  Used by disabled-mode skip, getTransitionPath, and test fixtures. */
export function createShadowReadyChallengeState(): SolutionChallengeState {
  return {
    mode: "INITIAL_CHALLENGE",
    currentCycle: 1,
    maxCycles: 2,
    exhausted: false,
    status: "READY_FOR_GATE",
    findingIds: [],
    reportPath: null,
    artifactStatus: "shadow_only",
  };
}

/** Advance to the next cycle based on a previous state.
 *  Returns a new state with incremented cycle and correct mode/exhausted. */
export function advanceChallengeCycle(
  previous?: SolutionChallengeState
): SolutionChallengeState {
  const currentCycle = (previous
    ? Math.min(previous.currentCycle + 1, MAX_CHALLENGE_REVISION_CYCLES)
    : 1) as 1 | 2;
  const exhausted = currentCycle >= MAX_CHALLENGE_REVISION_CYCLES;
  const mode: SolutionChallengeMode = previous
    ? "FOLLOW_UP_VERIFICATION"
    : "INITIAL_CHALLENGE";

  return {
    mode,
    currentCycle,
    maxCycles: 2,
    exhausted,
    status: "READY_FOR_GATE",
    findingIds: previous?.findingIds ?? [],
    reportPath: null,
    artifactStatus: "shadow_only",
  };
}

/** Validate that an object is a well-formed SolutionChallengeState.
 *  Returns the validated state or throws on malformed input. */
export function validateSolutionChallengeState(
  raw: unknown
): SolutionChallengeState {
  if (!raw || typeof raw !== "object") {
    throw new Error("solution-challenge: missing or invalid solution_challenge state");
  }
  const s = raw as Record<string, unknown>;

  // status: required, exact values
  if (s.status !== "NEEDS_REVISION" && s.status !== "READY_FOR_GATE") {
    throw new Error(`solution-challenge: invalid status: ${String(s.status)}`);
  }

  // mode: required, exact values
  if (s.mode !== "INITIAL_CHALLENGE" && s.mode !== "FOLLOW_UP_VERIFICATION") {
    throw new Error(`solution-challenge: invalid mode: ${String(s.mode)}`);
  }

  // currentCycle: required, 1 | 2
  if (s.currentCycle !== 1 && s.currentCycle !== 2) {
    throw new Error(`solution-challenge: invalid currentCycle: ${s.currentCycle}`);
  }

  // maxCycles: required, exactly 2
  if (s.maxCycles !== 2) {
    throw new Error(`solution-challenge: invalid maxCycles: ${s.maxCycles}`);
  }

  // exhausted: required boolean, consistent with currentCycle/maxCycles
  if (typeof s.exhausted !== "boolean") {
    throw new Error("solution-challenge: exhausted must be boolean");
  }
  if (s.exhausted !== (s.currentCycle >= s.maxCycles)) {
    throw new Error(
      `solution-challenge: exhausted inconsistent: cycle=${s.currentCycle}, max=${s.maxCycles}, exhausted=${s.exhausted}`
    );
  }

  // mode must match currentCycle
  if (s.currentCycle === 1 && s.mode !== "INITIAL_CHALLENGE") {
    throw new Error("solution-challenge: currentCycle=1 requires INITIAL_CHALLENGE mode");
  }
  if (s.currentCycle === 2 && s.mode !== "FOLLOW_UP_VERIFICATION") {
    throw new Error("solution-challenge: currentCycle=2 requires FOLLOW_UP_VERIFICATION mode");
  }

  // artifactStatus: required, exact values
  if (s.artifactStatus !== "shadow_only" && s.artifactStatus !== "generated") {
    throw new Error(`solution-challenge: invalid artifactStatus: ${String(s.artifactStatus)}`);
  }

  // findingIds: optional, must be array of non-empty strings
  if (s.findingIds !== undefined) {
    if (!Array.isArray(s.findingIds)) {
      throw new Error("solution-challenge: findingIds must be an array");
    }
    for (const id of s.findingIds) {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error(`solution-challenge: findingIds contains invalid entry: ${String(id)}`);
      }
    }
  }

  // reportPath: required (not optional), string | null
  if (s.reportPath !== null && typeof s.reportPath !== "string") {
    throw new Error("solution-challenge: reportPath must be string or null");
  }

  // artifact cross-field validation
  if (s.artifactStatus === "shadow_only" && s.reportPath !== null) {
    throw new Error("solution-challenge: shadow_only requires reportPath = null");
  }
  if (s.artifactStatus === "generated") {
    if (s.reportPath === null || typeof s.reportPath !== "string" || s.reportPath.trim().length === 0) {
      throw new Error("solution-challenge: generated requires non-empty reportPath string");
    }
  }

  return {
    mode: s.mode as SolutionChallengeMode,
    currentCycle: s.currentCycle as 1 | 2,
    maxCycles: 2,
    exhausted: s.exhausted as boolean,
    status: s.status as SolutionChallengeStatus,
    findingIds: s.findingIds as string[] | undefined,
    reportPath: s.reportPath as string | null,
    artifactStatus: s.artifactStatus as "shadow_only" | "generated",
  };
}

/** Normalize a solution-challenge node output.
 *  Validates the state and ensures result is derived from status. */
export function normalizeSolutionChallengeOutput(
  output: Record<string, unknown>
): Record<string, unknown> {
  const raw = output["solution_challenge"];
  const state = validateSolutionChallengeState(raw);

  return {
    ...output,
    result: deriveSolutionChallengeResult(state.status),
    solution_challenge: state,
  };
}
