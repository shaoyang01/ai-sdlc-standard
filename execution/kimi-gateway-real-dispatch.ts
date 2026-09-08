// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// Kimi Gateway Real Dispatch
// =============================
// Real Kimi dispatch behind explicit feature flags.
// Supports llm_task only. Default off. Gateway-controlled.

import type { ExecutionRequest, ExecutionResult } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { KimiCliProcessRunner } from "./kimi-cli-command-executor";
import { evaluateKimiGatewayRealDispatchContract, type KimiGatewayRealDispatchDecision } from "./kimi-gateway-real-dispatch-contract";
import { executeKimiCliCommand } from "./kimi-cli-command-executor";
import { getKimiCliAdapterConfig } from "./kimi-cli-adapter-contract";
import { sanitizeErrorSummary } from "./cli-adapter-audit";
import { createArtifact } from "../core/artifact";
import { classifyKimiGatewayRealDispatchFallback } from "./kimi-gateway-real-dispatch-fallback-policy";
import { normalizeKimiOneShotTextOutput } from "./kimi-output-normalizer";
import {
  buildKimiGatewayRealDispatchObservabilityEvent,
  buildObservabilitySummary,
  type KimiGatewayRealDispatchObservabilityEvent,
} from "./kimi-gateway-real-dispatch-observability";
import {
  evaluateKimiGatewayGuardrails,
  clampKimiGatewaySummary,
  KIMI_GATEWAY_GUARDRAIL_LIMITS,
  type KimiGatewayGuardrailLimits,
  type KimiGatewayGuardrailDecision,
} from "./kimi-gateway-real-dispatch-guardrails";

export type KimiGatewayRealDispatchResultStatus =
  | "disabled" | "unsupported" | "executed_success"
  | "executed_failure" | "executed_timeout" | "contract_rejected";

export interface KimiGatewayRealDispatchResult {
  adapter: "kimi";
  status: KimiGatewayRealDispatchResultStatus;
  requestId: string;
  requestType: string;
  contractDecision: KimiGatewayRealDispatchDecision;
  executed: boolean;
  primaryGatewayControlled: true;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  writesFiles: false;
  persistsAudit: false;
  stdoutSummary?: string;
  stderrSummary?: string;
  stdoutPayload?: string;
  error?: string;
  warnings: string[];
  auditEvents: unknown[];
  observabilityEvents: KimiGatewayRealDispatchObservabilityEvent[];
  guardrailDecision?: KimiGatewayGuardrailDecision;
}

export async function dispatchKimiGatewayReal(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
  guardrailLimits?: Partial<KimiGatewayGuardrailLimits>;
}): Promise<KimiGatewayRealDispatchResult> {
  const contract = evaluateKimiGatewayRealDispatchContract({
    request: input.request, config: input.config, env: input.env,
  });

  const base = {
    adapter: "kimi" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    contractDecision: contract.decision,
    primaryGatewayControlled: true as const,
    affectsRuntimeRouting: false as const,
    affectsFinalStatus: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    warnings: [...contract.warnings],
    auditEvents: [...contract.auditEvents],
  };

  if (!contract.eligible) {
    const statusMap: Record<string, KimiGatewayRealDispatchResultStatus> = {
      real_dispatch_disabled: "disabled",
      gateway_integration_disabled: "disabled",
      command_execution_disabled: "disabled",
      adapter_disabled: "disabled",
      missing_cli_command: "disabled",
      unsupported_request_type: "unsupported",
    };
    return { ...base, status: statusMap[contract.decision] ?? "disabled", executed: false,
      observabilityEvents: [buildKimiGatewayRealDispatchObservabilityEvent({
        stage: "contract_rejected", request: input.request,
        contractDecision: contract.decision,
        dispatchStatus: statusMap[contract.decision] ?? "disabled",
      })],
    };
    }

  // ── Operational Guardrails (before CLI execution) ───
  const guardrail = evaluateKimiGatewayGuardrails({
    request: input.request,
    config: input.config,
    limits: input.guardrailLimits,
  });
  if (!guardrail.allowed) {
    return {
      ...base,
      status: guardrail.decision === "unsupported_request_type" ? "unsupported" : "contract_rejected",
      executed: false,
      error: guardrail.sanitizedMessage,
      warnings: [...base.warnings, ...guardrail.warnings],
      guardrailDecision: guardrail.decision,
      observabilityEvents: [
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: "contract_rejected", request: input.request,
          contractDecision: guardrail.decision,
          dispatchStatus: guardrail.decision,
          warnings: guardrail.warnings,
        }),
      ],
    };
  }

  const limits = { ...KIMI_GATEWAY_GUARDRAIL_LIMITS, ...input.guardrailLimits };

  try {
    const execResult = await executeKimiCliCommand({
      request: input.request, config: input.config, env: input.env, runner: input.runner,
    });

    const statusMap: Record<string, KimiGatewayRealDispatchResultStatus> = {
      executed_success: "executed_success",
      executed_failure: "executed_failure",
      executed_timeout: "executed_timeout",
    };

    return {
      ...base,
      status: statusMap[execResult.decision] ?? "executed_failure",
      executed: execResult.decision.startsWith("executed"),
      stdoutSummary: clampKimiGatewaySummary({ value: execResult.stdoutSummary, maxLength: limits.maxStdoutSummaryLength }),
      stderrSummary: clampKimiGatewaySummary({ value: execResult.stderrSummary, maxLength: limits.maxStderrSummaryLength }),
      stdoutPayload: execResult.stdoutPayload,
      error: clampKimiGatewaySummary({ value: execResult.error, maxLength: limits.maxErrorSummaryLength }),
      auditEvents: [...base.auditEvents, ...execResult.auditEvents],
      observabilityEvents: [
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: "execution_started", request: input.request,
          contractDecision: contract.decision,
        }),
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: statusMap[execResult.decision] === "executed_success" ? "execution_success"
            : statusMap[execResult.decision] === "executed_timeout" ? "execution_timeout"
            : "execution_failure",
          request: input.request,
          contractDecision: contract.decision,
          dispatchStatus: statusMap[execResult.decision],
          executed: execResult.decision.startsWith("executed"),
          invokesCli: true,
          spawnsProcess: execResult.decision === "executed_success",
        }),
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "executed_failure",
      executed: false,
      error: sanitizeErrorSummary(msg) ?? "Unknown error",
      observabilityEvents: [buildKimiGatewayRealDispatchObservabilityEvent({
        stage: "execution_failure", request: input.request,
        contractDecision: contract.decision,
        executed: false,
      })],
    };
  }
}

const MAX_KIMI_LLM_PROMPT_CHARS = 16_000;

type KimiPromptBuildResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: "missing_prompt" | "prompt_too_large" };

function buildKimiLlmTaskPrompt(request: ExecutionRequest): KimiPromptBuildResult {
  let rawRequirement = "";
  if (
    request.node === "requirement-summary" &&
    request.input?.["expected_output"] === "requirement_summary"
  ) {
    const requirement = request.input["requirement"];
    if (typeof requirement !== "string" || requirement.trim().length === 0) {
      return { ok: false, reason: "missing_prompt" };
    }
    rawRequirement = requirement;
  } else {
    const prompt = request.input?.["prompt"];
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return { ok: false, reason: "missing_prompt" };
    }
    if (prompt.length > MAX_KIMI_LLM_PROMPT_CHARS) {
      return { ok: false, reason: "prompt_too_large" };
    }
    return { ok: true, prompt };
  }

  const requirementId = request.requirementId;
  const prompt = [
    "You are a requirement analysis assistant.",
    "Read the requirement below and return a single JSON object only.",
    "Do not include markdown fences, explanations, or any text outside the JSON object.",
    "",
    "Requirement:",
    rawRequirement,
    "",
    `Requirement ID: ${requirementId}`,
    "",
    "Return exactly this JSON shape:",
    JSON.stringify({
      requirement_id: requirementId,
      multi_repo: false,
      main_repo: "main",
      sub_requirements: [],
    }),
    "",
    "Rules:",
    "- requirement_id must match exactly",
    "- multi_repo must be true if the requirement describes multiple repositories, otherwise false",
    "- main_repo must be a non-empty string",
    "- sub_requirements must be an array of objects with non-empty repo and task strings",
    "- If multi_repo is false, sub_requirements must be empty",
    "- If multi_repo is true, sub_requirements must contain at least one item",
  ].join("\n");

  if (prompt.length > MAX_KIMI_LLM_PROMPT_CHARS) {
    return { ok: false, reason: "prompt_too_large" };
  }

  return { ok: true, prompt };
}

export async function executeKimiGatewayRequest(
  request: ExecutionRequest,
  config?: CliAdapterConfig,
  runner?: KimiCliProcessRunner,
  guardrailLimits?: Partial<KimiGatewayGuardrailLimits>,
  env?: Record<string, string | undefined>,
): Promise<ExecutionResult> {
  const promptResult = buildKimiLlmTaskPrompt(request);
  if (promptResult.ok === false) {
    return {
      success: false,
      node: request.node,
      agent: "kimi",
      output: {
        error: "Kimi Gateway request prompt rejected",
        fallback_reason: promptResult.reason,
        fallback_action: "return_structured_failure",
      },
      artifacts: [],
      error: promptResult.reason,
    };
  }

  const prompt = promptResult.prompt;
  const requestWithPrompt: ExecutionRequest = {
    ...request,
    input: { ...request.input, prompt },
  };

  const resolvedConfig = config ?? getKimiCliAdapterConfig(env);
  const dispatch = await dispatchKimiGatewayReal({
    request: requestWithPrompt,
    config: resolvedConfig,
    runner,
    guardrailLimits,
    env,
  });

  if (dispatch.status === "executed_success") {
    const rawPayload = dispatch.stdoutPayload ?? dispatch.stdoutSummary ?? "";
    const summaryPayload = normalizeKimiOneShotTextOutput(rawPayload);
    const artifact = createArtifact({
      requirementId: dispatch.requestId,
      node: request.node,
      type: "shadow_output",
      content: { result: `kimi_llm_task_completed`, summary: summaryPayload },
      agent: "kimi",
      source: "execution_gateway",
      id: `${dispatch.requestId}:kimi:shadow_output`,
    });
    return {
      success: true,
      node: request.node,
      agent: "kimi",
      output: {
        result: "kimi_executed_success",
        summary: summaryPayload,
        observability: buildObservabilitySummary(dispatch.observabilityEvents),
      },
      artifacts: [artifact],
    };
  }

  const fallback = classifyKimiGatewayRealDispatchFallback({
    contractDecision: dispatch.contractDecision,
    dispatchStatus: dispatch.status,
    guardrailDecision: dispatch.guardrailDecision,
    error: dispatch.error ?? dispatch.stderrSummary,
  });
  return {
    success: false, node: request.node, agent: "kimi",
    output: {
      error: fallback.sanitizedMessage,
      fallback_action: fallback.action,
      fallback_reason: fallback.reason,
      observability: buildObservabilitySummary(dispatch.observabilityEvents),
      ...(dispatch.guardrailDecision ? { guardrail_decision: dispatch.guardrailDecision } : {}),
    },
    artifacts: [],
    error: fallback.sanitizedMessage,
  };
}
