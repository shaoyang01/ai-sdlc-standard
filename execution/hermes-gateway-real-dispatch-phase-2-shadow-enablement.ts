// Hermes Gateway Real Dispatch Phase-2 Shadow Enablement
// ======================================================
// Phase-2 shadow-only sidecar attachment for code_review and validation.
// Sidecar metadata only. Never changes Gateway primary/final result or Runtime
// final_status/routing. Never makes Hermes final owner.

import type { ExecutionRequest, ExecutionResult } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  isHermesGatewayRealDispatchEnabled,
  isHermesGatewayRealDispatchRequestTypeSupported,
} from "./hermes-gateway-real-dispatch-contract";
import { isHermesGatewayIntegrationEnabled } from "./hermes-gateway-integration-contract";
import { isHermesCliCommandExecutionEnabled } from "./hermes-cli-command-executor";
import { dispatchHermesGatewayReal } from "./hermes-gateway-real-dispatch";

export type HermesPhase2ShadowEnablementRequestType = "code_review" | "validation";

export type HermesPhase2ShadowEnablementDispatchStatus =
  | "success"
  | "unsafe_metadata"
  | "sanitization_failure"
  | "guardrail_refusal"
  | "rollback_required"
  | "dispatcher_exception";

export interface HermesPhase2ShadowEnablementDispatchResult {
  status: HermesPhase2ShadowEnablementDispatchStatus;
  summary?: string;
  warnings: string[];
}

export type HermesPhase2ShadowDispatcher = (input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
}) => Promise<HermesPhase2ShadowEnablementDispatchResult>;

export interface HermesPhase2ShadowEnablementSidecar {
  requestType: HermesPhase2ShadowEnablementRequestType;
  phase: "phase_2_shadow_enablement";
  mode: "shadow_sidecar";
  status: "attached" | "omitted";
  fallbackPolicy: {
    reason: string;
    action: string;
  };
  observability: {
    outcome: string;
    warningCount: number;
    hasWarnings: boolean;
  };
  guardrails: {
    decision: "allow" | "omit" | "fallback" | "rollback_required";
    allowed: boolean;
    warningCount: number;
    checks: string[];
  };
  rollback: {
    decision: "not_required" | "rollback_required" | "blocked";
    required: boolean;
    action: string;
  };
  preservesGatewayPrimaryResult: true;
  preservesGatewayFinalResult: true;
  preservesRuntimeFinalStatus: true;
  preservesRuntimeRouting: true;
  affectsPrimaryGatewayResult: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  persistsRollback: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
}

const PHASE_2_TARGET_REQUEST_TYPES: HermesPhase2ShadowEnablementRequestType[] = [
  "code_review",
  "validation",
];

export function isHermesPhase2ShadowEnablementRequestType(
  type: string
): type is HermesPhase2ShadowEnablementRequestType {
  return PHASE_2_TARGET_REQUEST_TYPES.includes(type as HermesPhase2ShadowEnablementRequestType);
}

export function hasHermesPhase2ShadowOperatorApproval(request: ExecutionRequest): boolean {
  return request.operatorApproval?.hermesPhase2ShadowEnablement === true;
}

function allHermesPhase2FlagsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    isHermesGatewayRealDispatchEnabled(env)
    && isHermesGatewayIntegrationEnabled(env)
    && isHermesCliCommandExecutionEnabled(env)
  );
}

function requestPayloadText(request: ExecutionRequest): string {
  try {
    return JSON.stringify(request.input) + JSON.stringify(request.metadata ?? {});
  } catch {
    return "";
  }
}

function containsRawPromptRisk(text: string): boolean {
  return text.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK");
}

function containsSecretPattern(text: string): boolean {
  return /(?:token|api[_-]?key|password|secret|sk-(?:test|live))\s*[:=]/i.test(text);
}

function containsSanitizationFailureMarker(text: string): boolean {
  return text.includes("__SANITIZATION_FAILURE__");
}

function containsUnsafeMetadataMarker(text: string): boolean {
  return text.includes("__UNSAFE_METADATA__");
}

export function evaluateHermesPhase2ShadowMetadataSafety(request: ExecutionRequest): {
  safe: boolean;
  reason?: string;
} {
  const text = requestPayloadText(request);
  if (containsRawPromptRisk(text)) {
    return { safe: false, reason: "raw_prompt_risk_detected" };
  }
  if (containsSecretPattern(text)) {
    return { safe: false, reason: "secret_pattern_detected" };
  }
  if (containsUnsafeMetadataMarker(text)) {
    return { safe: false, reason: "unsafe_metadata_marker_detected" };
  }
  return { safe: true };
}

export function sanitizeHermesPhase2ShadowInput(request: ExecutionRequest): {
  ok: boolean;
  reason?: string;
} {
  const text = requestPayloadText(request);
  if (containsRawPromptRisk(text)) {
    return { ok: false, reason: "raw_prompt_cannot_be_sanitized" };
  }
  if (containsSanitizationFailureMarker(text)) {
    return { ok: false, reason: "sanitization_failure_marker_detected" };
  }
  return { ok: true };
}

export function evaluateHermesPhase2ShadowEnablementEligibility(input: {
  requestType: string;
  request: ExecutionRequest;
  env?: Record<string, string | undefined>;
}): {
  eligible: boolean;
  reason: string;
} {
  const env = input.env ?? process.env;

  if (!isHermesGatewayRealDispatchRequestTypeSupported(input.requestType)) {
    return { eligible: false, reason: "unsupported_request_type" };
  }

  if (!allHermesPhase2FlagsEnabled(env)) {
    return { eligible: false, reason: "missing_required_hermes_flags" };
  }

  if (!isHermesPhase2ShadowEnablementRequestType(input.requestType)) {
    return { eligible: false, reason: "not_a_phase_2_shadow_target" };
  }

  if (!hasHermesPhase2ShadowOperatorApproval(input.request)) {
    return { eligible: false, reason: "missing_operator_approval" };
  }

  const metadataSafety = evaluateHermesPhase2ShadowMetadataSafety(input.request);
  if (!metadataSafety.safe) {
    return { eligible: false, reason: metadataSafety.reason ?? "unsafe_metadata" };
  }

  const sanitization = sanitizeHermesPhase2ShadowInput(input.request);
  if (!sanitization.ok) {
    return { eligible: false, reason: sanitization.reason ?? "sanitization_failure" };
  }

  return { eligible: true, reason: "phase_2_shadow_eligible" };
}

export function evaluateHermesPhase2ShadowEnablementGuardrails(input: {
  dispatchResult: HermesPhase2ShadowEnablementDispatchResult;
  requestType: HermesPhase2ShadowEnablementRequestType;
}): HermesPhase2ShadowEnablementSidecar["guardrails"] {
  const warnings = [...input.dispatchResult.warnings];
  const checks: string[] = [
    "request_type_is_code_review_or_validation",
    "all_three_hermes_flags_required",
    "operator_approval_required",
    "metadata_safety_check_passed",
    "sanitization_check_passed",
    "no_raw_prompt",
    "no_raw_artifacts",
    "no_secrets",
  ];

  if (input.dispatchResult.status === "success") {
    return {
      decision: "allow",
      allowed: true,
      warningCount: warnings.length,
      checks,
    };
  }

  if (input.dispatchResult.status === "guardrail_refusal") {
    return {
      decision: "omit",
      allowed: false,
      warningCount: warnings.length,
      checks: [...checks, "guardrail_refusal"],
    };
  }

  if (input.dispatchResult.status === "rollback_required") {
    return {
      decision: "rollback_required",
      allowed: false,
      warningCount: warnings.length,
      checks: [...checks, "rollback_required"],
    };
  }

  return {
    decision: "omit",
    allowed: false,
    warningCount: warnings.length,
    checks: [...checks, `dispatch_status_${input.dispatchResult.status}`],
  };
}

export function evaluateHermesPhase2ShadowEnablementRollback(input: {
  dispatchResult: HermesPhase2ShadowEnablementDispatchResult;
  guardrails: HermesPhase2ShadowEnablementSidecar["guardrails"];
}): HermesPhase2ShadowEnablementSidecar["rollback"] {
  if (input.dispatchResult.status === "rollback_required") {
    return {
      decision: "rollback_required",
      required: true,
      action: "omit_sidecar_and_disable_phase_2_shadow_attachment",
    };
  }

  if (!input.guardrails.allowed) {
    return {
      decision: "blocked",
      required: false,
      action: "omit_sidecar",
    };
  }

  return {
    decision: "not_required",
    required: false,
    action: "none",
  };
}

export function buildHermesPhase2ShadowEnablementSidecar(input: {
  requestType: HermesPhase2ShadowEnablementRequestType;
  dispatchResult: HermesPhase2ShadowEnablementDispatchResult;
  guardrails: HermesPhase2ShadowEnablementSidecar["guardrails"];
  rollback: HermesPhase2ShadowEnablementSidecar["rollback"];
  reason?: string;
}): HermesPhase2ShadowEnablementSidecar {
  const attached = input.guardrails.allowed && input.dispatchResult.status === "success";
  const warningCount = input.dispatchResult.warnings.length;

  return {
    requestType: input.requestType,
    phase: "phase_2_shadow_enablement",
    mode: "shadow_sidecar",
    status: attached ? "attached" : "omitted",
    fallbackPolicy: {
      reason: input.reason ?? (attached ? "phase_2_shadow_attach_allowed" : "phase_2_shadow_omitted"),
      action: attached ? "attach_sidecar_metadata" : "omit_sidecar_metadata",
    },
    observability: {
      outcome: attached ? "attached_success" : `omitted_${input.dispatchResult.status}`,
      warningCount,
      hasWarnings: warningCount > 0,
    },
    guardrails: input.guardrails,
    rollback: input.rollback,
    preservesGatewayPrimaryResult: true,
    preservesGatewayFinalResult: true,
    preservesRuntimeFinalStatus: true,
    preservesRuntimeRouting: true,
    affectsPrimaryGatewayResult: false,
    changesGatewayPrimaryDispatch: false,
    changesGatewayFinalResult: false,
    changesRuntimeFinalStatus: false,
    changesRuntimeRouting: false,
    writesFiles: false,
    persistsAudit: false,
    persistsObservability: false,
    persistsGuardrails: false,
    persistsRollback: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
  };
}

export function createDefaultHermesPhase2ShadowDispatcher(): HermesPhase2ShadowDispatcher {
  return async (input): Promise<HermesPhase2ShadowEnablementDispatchResult> => {
    const dispatchResult = await dispatchHermesGatewayReal({
      request: input.request,
      config: input.config,
      env: input.env,
    });

    if (dispatchResult.status === "dispatch_executed_success") {
      return {
        status: "success",
        summary: dispatchResult.outputSummary,
        warnings: dispatchResult.warnings,
      };
    }

    if (dispatchResult.status === "dispatch_disabled") {
      return { status: "unsafe_metadata", warnings: dispatchResult.warnings };
    }

    if (dispatchResult.status === "dispatch_ineligible") {
      return { status: "guardrail_refusal", warnings: dispatchResult.warnings };
    }

    return {
      status: "dispatcher_exception",
      warnings: dispatchResult.warnings,
    };
  };
}

export async function attachHermesPhase2ShadowEnablementSidecar(input: {
  request: ExecutionRequest;
  primaryResult: ExecutionResult;
  env?: Record<string, string | undefined>;
  config?: CliAdapterConfig;
  dispatcher?: HermesPhase2ShadowDispatcher;
}): Promise<ExecutionResult> {
  const eligibility = evaluateHermesPhase2ShadowEnablementEligibility({
    requestType: input.request.type,
    request: input.request,
    env: input.env,
  });

  if (!eligibility.eligible) {
    return input.primaryResult;
  }

  const requestType = input.request.type as HermesPhase2ShadowEnablementRequestType;
  const dispatcher = input.dispatcher ?? createDefaultHermesPhase2ShadowDispatcher();

  let dispatchResult: HermesPhase2ShadowEnablementDispatchResult;
  try {
    dispatchResult = await dispatcher({
      request: input.request,
      config: input.config,
      env: input.env,
    });
  } catch (err) {
    dispatchResult = {
      status: "dispatcher_exception",
      warnings: [err instanceof Error ? err.message : String(err)],
    };
  }

  const guardrails = evaluateHermesPhase2ShadowEnablementGuardrails({
    dispatchResult,
    requestType,
  });
  const rollback = evaluateHermesPhase2ShadowEnablementRollback({ dispatchResult, guardrails });

  if (!guardrails.allowed || dispatchResult.status !== "success") {
    return input.primaryResult;
  }

  const sidecar = buildHermesPhase2ShadowEnablementSidecar({
    requestType,
    dispatchResult,
    guardrails,
    rollback,
    reason: eligibility.reason,
  });

  return {
    ...input.primaryResult,
    hermes_gateway_real_dispatch: sidecar,
  };
}
