// Hermes Phase 2 Code Review Canary — Session Entry
// ====================================================
// Process-local, session-scoped canary request entry.
// One gate per session. No Gateway/Runtime wiring. No default runner.
//
// SCOPE: single_node_process_only
// - Does NOT share state across Node processes.
// - Does NOT share state across workers.
// - Does NOT share state across containers.
// - State is NOT preserved after process restart.
// - Does NOT support session restart or horizontal scaling.

import type { ExecutionRequest } from "./types";
import {
  createHermesPhase2CodeReviewCanaryGate,
  type HermesPhase2CodeReviewCanaryApprovalVerifier,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import {
  executeHermesPhase2CodeReviewCanary,
  type HermesPhase2CanaryProcessRunner,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-executor";
import type {
  HermesPhase2CanaryProcessRunnerConfig,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";

export const HERMES_PHASE_2_CODE_REVIEW_CANARY_SESSION_SCOPE =
  "single_node_process_only" as const;

export type HermesPhase2CanarySessionRegistrationDecision =
  | "session_registered"
  | "invalid_session_configuration"
  | "session_already_registered";

export type HermesPhase2CanarySessionRegistrationConfig = Readonly<{
  canarySessionId: string;
  verifyApproval: HermesPhase2CodeReviewCanaryApprovalVerifier;
  now: () => number;
  maxApprovalTtlMs?: number;
  processRunner: HermesPhase2CanaryProcessRunner;
  runnerConfig: HermesPhase2CanaryProcessRunnerConfig;
}>;

export type HermesPhase2CanarySanitizedResult = Readonly<{
  decision: string;
  gateClaimed: boolean;
  runnerExecuted: boolean;
  payloadDecision?: string;
  gateDecision?: string;
  runnerDecision?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  processGroupCleanupConfirmed?: boolean;
  temporaryCleanupConfirmed?: boolean;
}>;

export type HermesPhase2CodeReviewCanarySessionEntry = Readonly<{
  scope: typeof HERMES_PHASE_2_CODE_REVIEW_CANARY_SESSION_SCOPE;
  execute(request: ExecutionRequest): Promise<HermesPhase2CanarySanitizedResult>;
}>;

export type HermesPhase2CanarySessionRegistrationResult =
  | { ok: true; decision: "session_registered"; entry: HermesPhase2CodeReviewCanarySessionEntry }
  | { ok: false; decision: "invalid_session_configuration" | "session_already_registered" };

// ── Process-local registry ──
// This Set is module-level and lives only in the current Node process.
// It is NOT shared across processes, workers, or containers.
// It is NOT persisted to disk, database, or network.
// Process restart clears all registered sessions.
const registeredSessionIds = new Set<string>();

function snapshotRunnerConfig(
  config: HermesPhase2CanaryProcessRunnerConfig,
): HermesPhase2CanaryProcessRunnerConfig {
  return Object.freeze({
    executablePath: config.executablePath,
    allowedExecutablePaths: Object.freeze([...config.allowedExecutablePaths]),
    args: Object.freeze([...config.args]),
    timeoutMs: config.timeoutMs,
    termGraceMs: config.termGraceMs,
    maxStdoutBytes: config.maxStdoutBytes,
    maxStderrBytes: config.maxStderrBytes,
    credentialEnvNames: config.credentialEnvNames
      ? Object.freeze([...config.credentialEnvNames])
      : undefined,
    sourceEnv: config.sourceEnv
      ? Object.freeze({ ...config.sourceEnv })
      : undefined,
    // serializedPayload is intentionally NOT copied — it will be set by the executor
  });
}

function sanitizeResult(
  result: Awaited<ReturnType<typeof executeHermesPhase2CodeReviewCanary>>,
): HermesPhase2CanarySanitizedResult {
  const sanitized: HermesPhase2CanarySanitizedResult = {
    decision: result.decision,
    gateClaimed: result.gateClaimed,
    runnerExecuted: result.runnerExecuted,
  };
  if (result.payloadDecision !== undefined) {
    (sanitized as any).payloadDecision = result.payloadDecision;
  }
  if (result.gateDecision !== undefined) {
    (sanitized as any).gateDecision = result.gateDecision;
  }
  if (result.runnerResult !== undefined) {
    (sanitized as any).runnerDecision = result.runnerResult.decision;
    (sanitized as any).exitCode = result.runnerResult.exitCode;
    (sanitized as any).timedOut = result.runnerResult.timedOut;
    (sanitized as any).processGroupCleanupConfirmed = result.runnerResult.processGroupCleanupConfirmed;
    (sanitized as any).temporaryCleanupConfirmed = result.runnerResult.temporaryCleanupConfirmed;
  }
  return sanitized;
}

/**
 * Register a new canary session. Synchronous. No Promise.
 *
 * Each canarySessionId can only be registered once per Node process.
 * Duplicate registration returns session_already_registered without
 * creating a new gate or modifying existing state.
 *
 * Invalid configuration does NOT burn the session ID.
 */
export function registerHermesPhase2CodeReviewCanarySession(
  config: HermesPhase2CanarySessionRegistrationConfig,
): HermesPhase2CanarySessionRegistrationResult {
  // Step 1: Validate canarySessionId basic shape
  const { canarySessionId } = config;
  if (
    typeof canarySessionId !== "string" ||
    canarySessionId.length === 0 ||
    canarySessionId !== canarySessionId.trim() ||
    canarySessionId.length > 128
  ) {
    return { ok: false, decision: "invalid_session_configuration" };
  }

  // Step 2: Check if already registered
  if (registeredSessionIds.has(canarySessionId)) {
    return { ok: false, decision: "session_already_registered" };
  }

  // Step 3: Validate remaining configuration
  if (typeof config.verifyApproval !== "function") {
    return { ok: false, decision: "invalid_session_configuration" };
  }
  if (typeof config.now !== "function") {
    return { ok: false, decision: "invalid_session_configuration" };
  }
  if (typeof config.processRunner !== "function") {
    return { ok: false, decision: "invalid_session_configuration" };
  }
  if (
    config.runnerConfig === null ||
    config.runnerConfig === undefined ||
    typeof config.runnerConfig !== "object"
  ) {
    return { ok: false, decision: "invalid_session_configuration" };
  }
  // serializedPayload must not be pre-set
  if ("serializedPayload" in config.runnerConfig) {
    return { ok: false, decision: "invalid_session_configuration" };
  }

  // Step 4: Create Task A gate (exactly once)
  const gateResult = createHermesPhase2CodeReviewCanaryGate({
    canarySessionId,
    verifyApproval: config.verifyApproval,
    now: config.now,
    maxApprovalTtlMs: config.maxApprovalTtlMs,
  });

  // Step 5: Gate factory failure
  if (!gateResult.ok) {
    return { ok: false, decision: "invalid_session_configuration" };
  }

  const gate = gateResult.gate;
  const processRunner = config.processRunner;
  const runnerConfigSnapshot = snapshotRunnerConfig(config.runnerConfig);

  // Step 6: Create session entry closure
  const entry: HermesPhase2CodeReviewCanarySessionEntry = {
    scope: HERMES_PHASE_2_CODE_REVIEW_CANARY_SESSION_SCOPE,
    execute: async (request: ExecutionRequest): Promise<HermesPhase2CanarySanitizedResult> => {
      // Pass request directly to Task B executor — no reading, spreading, or cloning
      const result = await executeHermesPhase2CodeReviewCanary(
        request,
        gate,
        processRunner,
        runnerConfigSnapshot,
      );
      return sanitizeResult(result);
    },
  };

  // Step 7: Register session ID
  registeredSessionIds.add(canarySessionId);

  // Step 8: Return
  return { ok: true, decision: "session_registered", entry };
}
