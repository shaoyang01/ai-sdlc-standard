// Kimi Request Type Expansion Contract
// ========================================
// Contract-only. Defines whether Kimi Gateway real dispatch
// should support request types beyond llm_task.
// No implementation changes. No gateway/runtime modification.

import type { ExecutionRequestType } from "./types";

export type KimiExpansionRecommendation =
  | "approved_candidate"
  | "defer_to_codex"
  | "defer_to_hermes"
  | "not_recommended"
  | "requires_separate_review";

export interface KimiRequestTypeExpansionDecision {
  requestType: ExecutionRequestType | string;
  recommendation: KimiExpansionRecommendation;
  rationale: string;
  allowedInThisPr: false;
  implementationChanges: false;
  runtimeChanges: false;
  gatewayRoutingChanges: false;
  changesFinalStatus: false;
  requiresSeparateImplementationPr: true;
  requiredSafetyBoundaries: string[];
}

export const KIMI_REQUEST_TYPE_EXPANSION_CONTRACT: KimiRequestTypeExpansionDecision[] = [
  {
    requestType: "llm_task",
    recommendation: "approved_candidate",
    rationale: "Already supported behind explicit feature flags. No expansion needed.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "no_default_enablement",
      "explicit_flags_required",
      "no_runtime_final_status_change",
    ],
  },
  {
    requestType: "code_generation",
    recommendation: "defer_to_codex",
    rationale: "Codex already owns code_generation. Expanding Kimi to code_generation risks agent ownership drift. Requires separate architecture review before any dual-agent generation.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "dual_agent_ownership_review",
      "no_codex_dispatch_override",
      "explicit_routing_rules_required",
    ],
  },
  {
    requestType: "code_review",
    recommendation: "defer_to_hermes",
    rationale: "Hermes is the intended review/validation-oriented adapter. Kimi review expansion may be considered later only after Hermes real dispatch contract.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "hermes_dispatch_contract_first",
      "no_review_loop_bypass",
      "artifact_safety_review_required",
    ],
  },
  {
    requestType: "validation",
    recommendation: "defer_to_hermes",
    rationale: "Validation aligns better with Hermes review/validation path. Must wait for Hermes real dispatch contract.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "hermes_dispatch_contract_first",
      "validation_report_safety",
      "no_runtime_validation_bypass",
    ],
  },
  {
    requestType: "review",
    recommendation: "defer_to_hermes",
    rationale: "Review-like tasks should remain Hermes candidate until Hermes path is implemented.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "hermes_dispatch_contract_first",
      "review_artifact_safety",
      "no_gateway_routing_change",
    ],
  },
  {
    requestType: "bugfix",
    recommendation: "requires_separate_review",
    rationale: "Bugfix can mutate implementation artifacts conceptually. Requires review loop semantics, artifact safety, and patch application boundary review. Not suitable for direct Kimi expansion now.",
    allowedInThisPr: false,
    implementationChanges: false,
    runtimeChanges: false,
    gatewayRoutingChanges: false,
    changesFinalStatus: false,
    requiresSeparateImplementationPr: true,
    requiredSafetyBoundaries: [
      "review_loop_semantics_review",
      "artifact_patch_safety",
      "bounded_retry_compatibility",
      "no_auto_application",
    ],
  },
];

export function getKimiRequestTypeExpansionDecision(
  requestType: string
): KimiRequestTypeExpansionDecision | undefined {
  return KIMI_REQUEST_TYPE_EXPANSION_CONTRACT.find(
    (d) => d.requestType === requestType
  );
}

export function isKimiRequestTypeExpansionAllowedInThisPr(
  _requestType: string
): false {
  return false;
}
