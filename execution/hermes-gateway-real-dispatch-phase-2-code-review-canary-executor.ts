// Hermes Phase 2 Code Review Canary — Dedicated Executor
// =========================================================
// Fixed-order: build payload → gate.claim → process runner with exact stdin.
// Does not create gates — receives an existing Task A gate.

import type { ExecutionRequest } from "./types";
import type {
  HermesPhase2CodeReviewCanaryGate,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import {
  buildHermesPhase2CanaryPayload,
  type HermesPhase2CanaryPayloadDecision,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import {
  runHermesPhase2CanaryProcess,
  type HermesPhase2CanaryProcessRunnerConfig,
  type HermesPhase2CanaryRunnerResult,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";

export type HermesPhase2CanaryExecutorDecision =
  | "executed"
  | "payload_build_failed"
  | "gate_denied"
  | "gate_threw"
  | "gate_malformed"
  | "runner_failed";

export type HermesPhase2CanaryExecutorResult = Readonly<{
  decision: HermesPhase2CanaryExecutorDecision;
  gateClaimed: boolean;
  runnerExecuted: boolean;
  payloadDecision?: HermesPhase2CanaryPayloadDecision;
  gateDecision?: string;
  runnerResult?: HermesPhase2CanaryRunnerResult;
}>;

function isValidGateResult(value: unknown): value is {
  allowed: boolean;
  decision: string;
  claimedCount: number;
  remainingCount: number;
} {
  if (value === null || value === undefined || typeof value !== "object") return false;
  if (typeof (value as any).then === "function") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.allowed !== "boolean") return false;
  if (typeof v.decision !== "string") return false;
  if (typeof v.claimedCount !== "number" || !Number.isFinite(v.claimedCount) || v.claimedCount < 0 || !Number.isInteger(v.claimedCount)) return false;
  if (typeof v.remainingCount !== "number" || !Number.isFinite(v.remainingCount) || v.remainingCount < 0 || !Number.isInteger(v.remainingCount)) return false;
  if (v.allowed === true && v.decision !== "allow") return false;
  return true;
}

export async function executeHermesPhase2CodeReviewCanary(
  request: ExecutionRequest,
  gate: HermesPhase2CodeReviewCanaryGate,
  runnerConfig: HermesPhase2CanaryProcessRunnerConfig,
): Promise<HermesPhase2CanaryExecutorResult> {
  // Step 1: Build payload
  const payloadResult = buildHermesPhase2CanaryPayload(request);

  if (!payloadResult.ok) {
    return {
      decision: "payload_build_failed",
      gateClaimed: false,
      runnerExecuted: false,
      payloadDecision: (payloadResult as { ok: false; decision: HermesPhase2CanaryPayloadDecision }).decision,
    };
  }

  const { serializedPayload, payloadDigestSha256 } = payloadResult;

  // Step 2: Gate claim
  let claimResult;
  try {
    claimResult = gate.claim(request, payloadDigestSha256);
  } catch {
    return { decision: "gate_threw", gateClaimed: false, runnerExecuted: false };
  }

  // Step 3: Validate gate result
  if (!isValidGateResult(claimResult)) {
    return { decision: "gate_malformed", gateClaimed: false, runnerExecuted: false };
  }

  if (!claimResult.allowed) {
    return {
      decision: "gate_denied",
      gateClaimed: false,
      runnerExecuted: false,
      gateDecision: claimResult.decision,
    };
  }

  // Step 4: Runner with exact serialized payload via stdin
  const finalConfig: HermesPhase2CanaryProcessRunnerConfig = {
    ...runnerConfig,
    serializedPayload,
  };

  try {
    const runnerResult = await runHermesPhase2CanaryProcess(finalConfig);
    return {
      decision: "executed",
      gateClaimed: true,
      runnerExecuted: true,
      gateDecision: "allow",
      runnerResult,
    };
  } catch {
    return {
      decision: "runner_failed",
      gateClaimed: true,
      runnerExecuted: false,
    };
  }
}
