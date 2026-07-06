// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Routes to shadow adapter by default.
// Routes to Codex only when SDLC_EXECUTION_MODE=codex AND agent=codex.
// Routes code_review and bugfix to their dedicated adapters.
// Skill metadata is preserved but does not affect dispatch.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";
import { executeCodexAgent } from "./codex-adapter";
import { executeCodeReview } from "./code-review-adapter";
import { executeBugfix } from "./bugfix-adapter";
import { getExecutionMode } from "./config";
import { Artifact } from "../core/artifact";
import { CodeReviewFinding } from "../core/review-types";
import { validateExecutionRequestSkill } from "./skill-request-validation";
import { executeKimiGatewayRequest } from "./kimi-gateway-real-dispatch";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { KimiCliProcessRunner } from "./kimi-cli-command-executor";
import type { KimiGatewayGuardrailLimits } from "./kimi-gateway-real-dispatch-guardrails";
import {
  dispatchHermesGatewayReal,
  type HermesGatewayRealDispatchResult,
} from "./hermes-gateway-real-dispatch";
import type { HermesCliProcessRunner } from "./hermes-cli-command-executor";
import {
  isHermesGatewayRealDispatchEnabled,
  isHermesGatewayRealDispatchRequestTypeSupported,
} from "./hermes-gateway-real-dispatch-contract";
import {
  evaluateHermesGatewayRealDispatchGatewayIntegrationContract,
} from "./hermes-gateway-real-dispatch-gateway-integration-contract";

export type HermesGatewayRealDispatcher = typeof dispatchHermesGatewayReal;

export interface ExecutionGatewayOptions {
  env?: Record<string, string | undefined>;
  kimiConfig?: CliAdapterConfig;
  kimiRunner?: KimiCliProcessRunner;
  kimiGuardrailLimits?: Partial<KimiGatewayGuardrailLimits>;
  hermesConfig?: CliAdapterConfig;
  hermesRunner?: HermesCliProcessRunner;
  hermesGatewayRealDispatcher?: HermesGatewayRealDispatcher;
}

export class ExecutionGateway {
  constructor(private readonly options: ExecutionGatewayOptions = {}) {}

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // ── Skill Validation — metadata only, does not affect dispatch ──
    const skillValidation = validateExecutionRequestSkill(request);
    const enriched = { ...request, skillValidation };

    const primaryResult = await this.executePrimary(enriched);
    return this.attachHermesGatewayRealDispatch(enriched, primaryResult);
  }

  private async executePrimary(enriched: ExecutionRequest): Promise<ExecutionResult> {
    // ── Code Review Route ──
    if (enriched.type === "code_review") {
      const attempt = (enriched.metadata?.["attempt"] as number) ?? 0;
      const artifacts = (enriched.input["artifacts"] as Artifact[]) ?? [];
      return executeCodeReview({
        requirementId: enriched.requirementId,
        artifacts,
        agent: enriched.agent,
        attempt,
        skill: enriched.skill,
        skillValidation: enriched.skillValidation,
      });
    }

    // ── Bugfix Route ──
    if (enriched.type === "bugfix") {
      const attempt = (enriched.metadata?.["attempt"] as number) ?? 1;
      const artifacts = (enriched.input["artifacts"] as Artifact[]) ?? [];
      const findings = (enriched.input["findings"] as CodeReviewFinding[]) ?? [];
      return executeBugfix({
        requirementId: enriched.requirementId,
        artifacts,
        findings,
        agent: enriched.agent,
        attempt,
        skill: enriched.skill,
        skillValidation: enriched.skillValidation,
      });
    }

    // ── Kimi Real Dispatch (feature-flagged, llm_task only) ──
    // Only intercepts when real dispatch flag is explicitly enabled.
    // Falls through to default shadow when flag is off.
    const shouldAttemptKimi = (request: ExecutionRequest): boolean => {
      return request.agent === "kimi"
        && request.type === "llm_task"
        && process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH === "enabled";
    };

    if (shouldAttemptKimi(enriched)) {
      return executeKimiGatewayRequest(
        enriched,
        this.options.kimiConfig,
        this.options.kimiRunner,
        this.options.kimiGuardrailLimits,
      );
    }

    // ── Default: shadow or codex ──
    const mode = getExecutionMode();
    if (mode === "codex" && enriched.agent === "codex") {
      return executeCodexAgent(enriched);
    }
    return executeShadowAgent(enriched);
  }

  private shouldAttemptHermesGatewayRealDispatch(request: ExecutionRequest): boolean {
    const env = this.options.env ?? process.env;
    return isHermesGatewayRealDispatchEnabled(env)
      && isHermesGatewayRealDispatchRequestTypeSupported(request.type);
  }

  private async attachHermesGatewayRealDispatch(
    request: ExecutionRequest,
    primaryResult: ExecutionResult
  ): Promise<ExecutionResult> {
    if (!this.shouldAttemptHermesGatewayRealDispatch(request)) {
      return primaryResult;
    }

    try {
      const dispatcher = this.options.hermesGatewayRealDispatcher ?? dispatchHermesGatewayReal;
      const dispatchResult: HermesGatewayRealDispatchResult = await dispatcher({
        request,
        config: this.options.hermesConfig,
        env: this.options.env,
        runner: this.options.hermesRunner,
      });
      const integration = evaluateHermesGatewayRealDispatchGatewayIntegrationContract({
        dispatchResult,
        env: this.options.env,
      });

      if (integration.mayAttach && dispatchResult.enabled && dispatchResult.eligible) {
        return {
          ...primaryResult,
          hermes_gateway_real_dispatch: dispatchResult,
        };
      }
    } catch {
      // Hermes real dispatch is sidecar metadata only. Dispatcher failures must not affect Gateway output.
    }

    return primaryResult;
  }
}

export const executionGateway = new ExecutionGateway();
