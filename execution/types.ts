// Execution Types — Stable Gateway Contracts
// ===========================================
// Generic enough for future real agents.
// No Git / PR / branch / commit fields.
// No target repository write operations.

import { Artifact } from "../core/artifact";
import type { HermesGatewayRealDispatchResult } from "./hermes-gateway-real-dispatch";
import type { HermesPhase2ShadowEnablementSidecar } from "./hermes-gateway-real-dispatch-phase-2-shadow-enablement";
import type { NodeCapabilityId } from "../loop/types";

export type AgentName = "kimi" | "codex" | "hermes";

// C01 WP-3 (Decision-020): capability-driven request types — every supported
// agent can execute every node capability; the binding layer chooses the
// executor. Legacy request types are retained for existing callers.
export type ExecutionRequestType =
  | "llm_task"
  | "code_generation"
  | "review"
  | "validation"
  | "code_review"
  | "bugfix"
  | NodeCapabilityId;

export type HermesPhase2CodeReviewCanaryApproval = Readonly<{
  approvalId: string;
  operatorIdentityReference: string;
  phaseId: "phase_2_code_review_canary_one";
  requestType: "code_review";
  requestIdentity: string;
  payloadDigestSha256: string;
  canarySessionId: string;
  issuedAtIso: string;
  expiresAtIso: string;
  nonce: string;
  singleUse: true;
  proof: string;
}>;

export type ExecutionRequest = Readonly<{
  type: ExecutionRequestType;
  node: string;
  agent: AgentName;
  requirementId: string;
  input: Record<string, unknown>;
  metadata?: Readonly<Record<string, unknown>>;
  skill?: string;
  skillValidation?: Readonly<{
    attempted: boolean;
    valid: boolean;
    reason: string;
  }>;
  operatorApproval?: Readonly<{
    hermesPhase2ShadowEnablement?: true;
    hermesPhase2CodeReviewCanary?: HermesPhase2CodeReviewCanaryApproval;
  }>;
  /** C01 WP-4B durable capability-attempt context. */
  loopExecution?: Readonly<{
    runId: string;
    attempt: number;
    /** v2 (C02-WP3.5-B, A2): the required execution role being dispatched. */
    executionRole: import("../loop/types").CapabilityExecutionRole;
    inputArtifactRef: string;
    inputArtifactVersion: string;
    inputDigest: string;
    outputArtifactVersion: string;
    /** v3 (Round 1): formal_verdict claims the exact Finding Ledger it consumes. */
    consumedFindingsRef?: string;
    consumedFindingsDigest?: string;
  }>;
}>;

export type ExecutionArtifactType =
  | "requirement_summary"
  | "tech_design"
  | "solution_challenge"
  | "solution_review"
  | "code_patch"
  | "code_review"
  | "bugfix_patch"
  | "validation_report"
  | "shadow_output"
  // v2 canonical capability artifact types (C02-WP3.5, A4)
  | "technical_design"
  | "task_plan"
  | "implementation_record"
  | "review_summary"
  | "knowledge_sync_result";

export type ExecutionArtifact = Artifact;

/**
 * E5-W1 (G-S09b): bounded, non-sensitive process evidence for ONE real CLI
 * invocation, mapped by the tracing gateway into the terminal journal event.
 * `signal` is a canonical PROCESS_SIGNALS name or null; `invocationDigest` is
 * the sha256 of the normalized invocation shape only (no dynamic content —
 * the prompt travels on stdin). The journal validator requires the digest
 * whenever any process fact is persisted, so it is always present here.
 */
export interface CapabilityProcessEvidence {
  readonly invocationDigest: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number | null;
  readonly truncated: boolean;
}

/**
 * E5-W1 (G-S09b): raised by the real chain when a dispatch FAILS but the
 * process ran far enough to leave bounded evidence. The tracing gateway
 * persists this evidence on the failed terminal event; every other failure
 * keeps the all-null shadow shape. Evidence-carrying errors must never embed
 * raw process output in `message` (INV-E13).
 */
export class CapabilityProcessEvidenceError extends Error {
  readonly processEvidence: CapabilityProcessEvidence | null;
  /**
   * W-GW-DIAG P-A: when present, the tracing gateway journals this instead of
   * the generic EXECUTOR_EXCEPTION — post-process output-contract failures
   * keep their real cause code next to the persisted process evidence.
   */
  readonly capabilityErrorCode: string | null;
  constructor(message: string, processEvidence: CapabilityProcessEvidence | null, capabilityErrorCode?: string) {
    super(message);
    this.name = "CapabilityProcessEvidenceError";
    this.processEvidence = processEvidence;
    this.capabilityErrorCode = capabilityErrorCode ?? null;
  }
}

export type ExecutionResult = Readonly<{
  success: boolean;
  node: string;
  agent: AgentName;
  output: Record<string, unknown>;
  artifacts: ReadonlyArray<ExecutionArtifact>;
  error?: string;
  hermes_gateway_real_dispatch?: HermesGatewayRealDispatchResult | HermesPhase2ShadowEnablementSidecar;
  /**
   * E5-W1 (G-S09b): present ONLY on real process results. Deterministic /
   * shadow results omit it, keeping the terminal journal event all-null.
   * A succeeded result must carry exitCode 0 and no signal (journal
   * validator enforces this on the event).
   */
  processEvidence?: CapabilityProcessEvidence;
  /**
   * Round 3 review F2: on the loop capability-tracing path, the exact
   * succeeded terminal journal event THIS dispatch committed. Callers binding
   * downstream facts (e.g. the node artifact revision) must use this identity
   * instead of re-reading the journal tail, which a concurrent entry could
   * have advanced.
   */
  capabilityTerminalEventId?: string;
}>;
