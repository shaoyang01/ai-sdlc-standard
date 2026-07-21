// Hermes Phase 2 Code Review Canary — Dedicated Executor (Round 2)
// =================================================================
// Fixed-order: build payload → gate.claim(exact digest) → injected processRunner(exact serializedPayload).
// Does not create gates. Does not import or call the production runner.

import type { ExecutionRequest } from "./types";
import type {
  HermesPhase2CodeReviewCanaryGate,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import {
  buildHermesPhase2CanaryPayload,
  type HermesPhase2CanaryPayloadDecision,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import {
  type HermesPhase2CanaryProcessRunnerConfig,
  type HermesPhase2CanaryRunnerResult,
} from "./hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";

/** Injected process runner — the executor never imports the production runner. */
export type HermesPhase2CanaryProcessRunner = (
  config: HermesPhase2CanaryProcessRunnerConfig,
) => Promise<HermesPhase2CanaryRunnerResult>;

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

function isValidGateResult(v: unknown): v is {
  allowed: boolean;
  decision: string;
  claimedCount: number;
  remainingCount: number;
} {
  if (v === null || v === undefined || typeof v !== "object") return false;
  if (typeof (v as any).then === "function") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.allowed !== "boolean") return false;
  if (typeof o.decision !== "string") return false;
  if (typeof o.claimedCount !== "number" || !Number.isFinite(o.claimedCount) || o.claimedCount < 0 || !Number.isInteger(o.claimedCount)) return false;
  if (typeof o.remainingCount !== "number" || !Number.isFinite(o.remainingCount) || o.remainingCount < 0 || !Number.isInteger(o.remainingCount)) return false;
  if (o.allowed === true && o.decision !== "allow") return false;
  return true;
}

export async function executeHermesPhase2CodeReviewCanary(
  request: ExecutionRequest,
  gate: HermesPhase2CodeReviewCanaryGate,
  processRunner: HermesPhase2CanaryProcessRunner,
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

  // Step 2: Gate claim with exact digest
  let claimResult;
  try {
    claimResult = gate.claim(request, payloadDigestSha256);
  } catch {
    return { decision: "gate_threw", gateClaimed: false, runnerExecuted: false };
  }

  // Step 3: Validate gate result shape
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

  // Step 4: Injected runner exactly once with exact serializedPayload
  try {
    const finalConfig: HermesPhase2CanaryProcessRunnerConfig = {
      ...runnerConfig,
      serializedPayload,
    };
    const runnerResult = await processRunner(finalConfig);

    // Only accept full success
    if (
      runnerResult.decision === "executed" &&
      runnerResult.exitCode === 0 &&
      runnerResult.processGroupCleanupConfirmed === true &&
      runnerResult.temporaryCleanupConfirmed === true
    ) {
      return {
        decision: "executed",
        gateClaimed: true,
        runnerExecuted: true,
        gateDecision: "allow",
        runnerResult,
      };
    }

    return {
      decision: "runner_failed",
      gateClaimed: true,
      runnerExecuted: true,
      gateDecision: "allow",
      runnerResult,
    };
  } catch {
    return { decision: "runner_failed", gateClaimed: true, runnerExecuted: false };
  }
}
