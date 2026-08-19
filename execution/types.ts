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
    inputArtifactRef: string;
    inputArtifactVersion: string;
    inputDigest: string;
    outputArtifactVersion: string;
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
  | "shadow_output";

export type ExecutionArtifact = Artifact;

export type ExecutionResult = Readonly<{
  success: boolean;
  node: string;
  agent: AgentName;
  output: Record<string, unknown>;
  artifacts: ReadonlyArray<ExecutionArtifact>;
  error?: string;
  hermes_gateway_real_dispatch?: HermesGatewayRealDispatchResult | HermesPhase2ShadowEnablementSidecar;
}>;
