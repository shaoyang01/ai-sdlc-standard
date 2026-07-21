// Hermes Phase 2 Code Review Canary — Dedicated Executor
// =========================================================
// Fixed-order executor: build payload → gate.claim → process runner.
// No Gateway/Runtime wiring. No generic Hermes executor. No retry.
// Does not create gates — receives an existing Task A gate.

import type { ExecutionRequest } from "./types";
import type {
  HermesPhase2CodeReviewCanaryGate,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import {
  buildHermesPhase2CanaryPayload,
  type HermesPhase2CanaryPayloadResult,
  type HermesPhase2CanaryPayloadDecision,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import {
  runHermesPhase2CanaryProcess,
  type HermesPhase2CanaryProcessRunnerConfig,
  type HermesPhase2CanaryRunnerResult,
  type HermesPhase2CanaryRunnerDecision,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";

export type HermesPhase2CanaryExecutorDecision =
  | "executed"
  | "payload_build_failed"
  | "gate_denied"
  | "runner_failed"
  | "gate_not_allowed"
  | "gate_threw"
  | "gate_malformed";

export type HermesPhase2CanaryExecutorResult = Readonly<{
  decision: HermesPhase2CanaryExecutorDecision;
  gateClaimed: boolean;
  runnerExecuted: boolean;
  payloadDecision?: HermesPhase2CanaryPayloadDecision;
  gateDecision?: string;
  runnerResult?: HermesPhase2CanaryRunnerResult;
}>;

/**
 * Execute a Phase 2 code-review canary request through:
 * 1. Payload builder
 * 2. Gate claim
 * 3. Process runner
 *
 * The executor does NOT create its own gate or maintain state beyond this call.
 */
export async function executeHermesPhase2CodeReviewCanary(
  request: ExecutionRequest,
  gate: HermesPhase2CodeReviewCanaryGate,
  runnerConfig: HermesPhase2CanaryProcessRunnerConfig,
): Promise<HermesPhase2CanaryExecutorResult> {
  // Step 1: Build payload
  const payloadResult: HermesPhase2CanaryPayloadResult =
    buildHermesPhase2CanaryPayload(request);

  if (!payloadResult.ok) {
    const pd = (payloadResult as { ok: false; decision: HermesPhase2CanaryPayloadDecision }).decision;
    return {
      decision: "payload_build_failed",
      gateClaimed: false,
      runnerExecuted: false,
      payloadDecision: pd,
    };
  }

  // payloadResult is now narrowed to ok: true
  const { payloadDigestSha256 } = payloadResult;

  // Step 2: Gate claim
  let claimResult;
  try {
    claimResult = gate.claim(request, payloadDigestSha256);
  } catch {
    return {
      decision: "gate_threw",
      gateClaimed: false,
      runnerExecuted: false,
    };
  }

  // Check gate result is well-formed
  if (
    claimResult === null ||
    claimResult === undefined ||
    typeof claimResult !== "object" ||
    typeof (claimResult as any).then === "function"
  ) {
    return {
      decision: "gate_malformed",
      gateClaimed: false,
      runnerExecuted: false,
    };
  }

  if (!claimResult.allowed) {
    return {
      decision: "gate_denied",
      gateClaimed: false,
      runnerExecuted: false,
      gateDecision: claimResult.decision,
    };
  }

  // Step 3: Runner (exactly once, no retry)
  let runnerResult: HermesPhase2CanaryRunnerResult;
  try {
    runnerResult = await runHermesPhase2CanaryProcess(runnerConfig);
  } catch {
    return {
      decision: "runner_failed",
      gateClaimed: true,
      runnerExecuted: false,
    };
  }

  return {
    decision: "executed",
    gateClaimed: true,
    runnerExecuted: true,
    gateDecision: "allow",
    runnerResult,
  };
}
