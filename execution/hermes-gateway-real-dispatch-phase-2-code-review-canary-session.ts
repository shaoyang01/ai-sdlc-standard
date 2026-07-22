// Hermes Phase 2 Code Review Canary — Session Entry
// ====================================================
// Process-local, session-scoped canary request entry.
// One gate per session. No Gateway/Runtime wiring. No default runner.
// Fail-closed plain data record validation for all config inputs;
// mapped-type-guarded complete runnerConfig snapshot (serializedPayload
// is never snapshotted — only the Task B executor injects it).
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
  HermesPhase2CanaryRunnerDeps,
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

// ── Compile-time snapshot completeness guard (mapped type) ──
// Every field of HermesPhase2CanaryProcessRunnerConfig except
// serializedPayload MUST appear explicitly in the snapshot object literal
// below. If the runner config gains a new field, `satisfies` fails at
// compile time until snapshotRunnerConfig covers it. Changing only the
// return type without adding the real property also fails, because the
// object literal itself is checked against the mapped type.
type RunnerConfigSnapshotField = Exclude<
  keyof HermesPhase2CanaryProcessRunnerConfig,
  "serializedPayload"
>;

type CompleteRunnerConfigSnapshot = {
  [K in RunnerConfigSnapshotField]-?:
    HermesPhase2CanaryProcessRunnerConfig[K] | undefined;
};

// ── Fail-closed plain data record scan (module-internal) ──
// Accepts only plain objects (Object.prototype or null prototype). Rejects
// arrays, class instances, accessor descriptors, and any object whose
// reflection (getPrototypeOf / getOwnPropertyDescriptors, including Proxy
// traps) throws. Values are read exclusively from data descriptor `.value`;
// no getter is ever invoked. Returns a fresh plain values object; never
// leaks the original exception; never touches the registry.
type PlainDataRecordScan =
  | { ok: true; keys: string[]; values: Record<string, unknown> }
  | { ok: false };

function scanPlainDataRecord(value: unknown): PlainDataRecordScan {
  if (value === null || typeof value !== "object") return { ok: false };
  if (Array.isArray(value)) return { ok: false };
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return { ok: false };
  }
  if (proto !== Object.prototype && proto !== null) return { ok: false };
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return { ok: false };
  }
  const keys: string[] = [];
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(descriptors)) {
    const d = descriptors[key];
    if (typeof d.get === "function" || typeof d.set === "function") {
      return { ok: false };
    }
    if (!("value" in d)) return { ok: false };
    keys.push(key);
    values[key] = d.value;
  }
  return { ok: true, keys, values };
}

function snapshotRunnerConfig(config: {
  executablePath: string;
  allowedExecutablePaths: ReadonlyArray<string>;
  args: ReadonlyArray<string>;
  timeoutMs: number | undefined;
  termGraceMs: number | undefined;
  observationMs: number | undefined;
  maxStdoutBytes: number | undefined;
  maxStderrBytes: number | undefined;
  credentialEnvNames: ReadonlyArray<string> | undefined;
  sourceEnv: Readonly<Record<string, string>> | undefined;
  deps: HermesPhase2CanaryRunnerDeps | undefined;
}): CompleteRunnerConfigSnapshot {
  // Every non-serializedPayload field appears explicitly; optional fields
  // appear as required properties whose value may be undefined.
  // serializedPayload is intentionally NOT part of the snapshot — it is
  // injected by the Task B executor at execution time.
  const completeSnapshot = {
    executablePath: config.executablePath,
    allowedExecutablePaths: config.allowedExecutablePaths,
    args: config.args,
    timeoutMs: config.timeoutMs,
    termGraceMs: config.termGraceMs,
    observationMs: config.observationMs,
    maxStdoutBytes: config.maxStdoutBytes,
    maxStderrBytes: config.maxStderrBytes,
    credentialEnvNames: config.credentialEnvNames,
    sourceEnv: config.sourceEnv,
    deps: config.deps,
  } satisfies CompleteRunnerConfigSnapshot;
  return Object.freeze(completeSnapshot);
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
 *
 * Fail-closed: any unexpected error during registration returns
 * invalid_session_configuration without burning the session ID.
 */
export function registerHermesPhase2CodeReviewCanarySession(
  config: HermesPhase2CanarySessionRegistrationConfig,
): HermesPhase2CanarySessionRegistrationResult {
  try {
    // Step 1: fail-closed plain data record scan of the top-level config.
    // The runtime config is treated as unknown: no property is read before
    // the scan completes; afterwards only data descriptor values are used.
    const configScan = scanPlainDataRecord(config);
    if (!configScan.ok) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    const cv = configScan.values;

    // Step 2: Validate canarySessionId basic shape
    const canarySessionId = cv.canarySessionId;
    if (
      typeof canarySessionId !== "string" ||
      canarySessionId.length === 0 ||
      canarySessionId !== canarySessionId.trim() ||
      canarySessionId.length > 128
    ) {
      return { ok: false, decision: "invalid_session_configuration" };
    }

    // Step 3: Check if already registered — before any runnerConfig scan,
    // gate creation, or runner interaction. A consumed gate is never touched.
    if (registeredSessionIds.has(canarySessionId)) {
      return { ok: false, decision: "session_already_registered" };
    }

    // Step 4: Scan and validate runnerConfig and nested fields
    const rcScan = scanPlainDataRecord(cv.runnerConfig);
    if (!rcScan.ok) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    const rc = rcScan.values;

    // serializedPayload must not be pre-set — rejected even as an
    // explicitly undefined key; only the Task B executor injects it.
    if ("serializedPayload" in rc) {
      return { ok: false, decision: "invalid_session_configuration" };
    }

    if (typeof rc.executablePath !== "string" || rc.executablePath.length === 0) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (!Array.isArray(rc.allowedExecutablePaths) || rc.allowedExecutablePaths.length === 0) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (!Array.isArray(rc.args)) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.timeoutMs !== undefined && (typeof rc.timeoutMs !== "number" || !Number.isFinite(rc.timeoutMs))) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.termGraceMs !== undefined && (typeof rc.termGraceMs !== "number" || !Number.isFinite(rc.termGraceMs))) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.observationMs !== undefined && (typeof rc.observationMs !== "number" || !Number.isFinite(rc.observationMs))) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.maxStdoutBytes !== undefined && (typeof rc.maxStdoutBytes !== "number" || !Number.isFinite(rc.maxStdoutBytes))) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.maxStderrBytes !== undefined && (typeof rc.maxStderrBytes !== "number" || !Number.isFinite(rc.maxStderrBytes))) {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (rc.credentialEnvNames !== undefined && !Array.isArray(rc.credentialEnvNames)) {
      return { ok: false, decision: "invalid_session_configuration" };
    }

    // sourceEnv: fail-closed scan; snapshot into a fresh frozen object.
    let sourceEnvSnapshot: Readonly<Record<string, string>> | undefined;
    if (rc.sourceEnv !== undefined) {
      const seScan = scanPlainDataRecord(rc.sourceEnv);
      if (!seScan.ok) {
        return { ok: false, decision: "invalid_session_configuration" };
      }
      sourceEnvSnapshot = Object.freeze({ ...seScan.values } as Record<string, string>);
    }

    // deps: fail-closed scan; snapshot into a fresh frozen object. Function
    // values are kept by reference (never cloned); no defaults are added.
    let depsSnapshot: HermesPhase2CanaryRunnerDeps | undefined;
    if (rc.deps !== undefined) {
      const depsScan = scanPlainDataRecord(rc.deps);
      if (!depsScan.ok) {
        return { ok: false, decision: "invalid_session_configuration" };
      }
      depsSnapshot = Object.freeze({ ...depsScan.values }) as HermesPhase2CanaryRunnerDeps;
    }

    // Array copies inside the outer fail-closed scope: a throwing iterator
    // or Proxy trap aborts registration via the outer catch — the session
    // ID is not burned. Element semantics stay with the Task B runner.
    const allowedExecutablePaths = Object.freeze([...(rc.allowedExecutablePaths as string[])]);
    const argsCopy = Object.freeze([...(rc.args as string[])]);
    const credentialEnvNames = rc.credentialEnvNames !== undefined
      ? Object.freeze([...(rc.credentialEnvNames as string[])])
      : undefined;

    // Step 5: Validate functions and maxApprovalTtlMs
    if (typeof cv.verifyApproval !== "function") {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (typeof cv.now !== "function") {
      return { ok: false, decision: "invalid_session_configuration" };
    }
    if (typeof cv.processRunner !== "function") {
      return { ok: false, decision: "invalid_session_configuration" };
    }

    // Step 6: Create Task A gate (exactly once)
    const gateResult = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId,
      verifyApproval: cv.verifyApproval as HermesPhase2CodeReviewCanaryApprovalVerifier,
      now: cv.now as () => number,
      maxApprovalTtlMs: cv.maxApprovalTtlMs as number | undefined,
    });
    if (!gateResult.ok) {
      return { ok: false, decision: "invalid_session_configuration" };
    }

    const gate = gateResult.gate;
    const processRunner = cv.processRunner as HermesPhase2CanaryProcessRunner;

    // Step 7: Create the complete runnerConfig snapshot
    const runnerConfigSnapshot = snapshotRunnerConfig({
      executablePath: rc.executablePath,
      allowedExecutablePaths,
      args: argsCopy,
      timeoutMs: rc.timeoutMs as number | undefined,
      termGraceMs: rc.termGraceMs as number | undefined,
      observationMs: rc.observationMs as number | undefined,
      maxStdoutBytes: rc.maxStdoutBytes as number | undefined,
      maxStderrBytes: rc.maxStderrBytes as number | undefined,
      credentialEnvNames,
      sourceEnv: sourceEnvSnapshot,
      deps: depsSnapshot,
    });

    // Step 8: Create session entry closure
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

    // Step 9: Register session ID (last mutation, after everything succeeded)
    registeredSessionIds.add(canarySessionId);

    // Step 10: Return
    return { ok: true, decision: "session_registered", entry };
  } catch {
    // Fail-closed: any unexpected error returns invalid without burning the
    // session ID, without writing the registry, and without leaking the
    // original error text.
    return { ok: false, decision: "invalid_session_configuration" };
  }
}
