// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Routes to shadow adapter by default.
// Routes to Codex only when SDLC_EXECUTION_MODE=codex AND agent=codex.
// Routes code_review and bugfix to their dedicated adapters.
// Skill metadata is preserved but does not affect dispatch.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";
import { executeCodeReview } from "./code-review-adapter";
import { executeBugfix } from "./bugfix-adapter";
import { getExecutionMode, isCodexRealDispatchEnabled } from "./config";
import type { CodexRunner } from "./codex-real-dispatch-runner";
import { createCodexRealDispatchRunner } from "./codex-real-dispatch-real-runner";
import type { CodexCliProcessRunner } from "./codex-real-dispatch-real-runner";
import { createCodexCliProcessRunner } from "./codex-cli-process-runner";
import type { CodexCliProcessRunnerOptions } from "./codex-cli-process-runner";
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
import {
  attachHermesPhase2ShadowEnablementSidecar,
  isHermesPhase2ShadowEnablementRequestType,
  type HermesPhase2ShadowDispatcher,
} from "./hermes-gateway-real-dispatch-phase-2-shadow-enablement";
import {
  evaluateHermesGatewayRealDispatchFallbackPolicy,
} from "./hermes-gateway-real-dispatch-fallback-policy";
import {
  buildHermesGatewayRealDispatchObservability,
} from "./hermes-gateway-real-dispatch-observability";
import {
  evaluateHermesGatewayRealDispatchGuardrails,
  type HermesGatewayRealDispatchGuardrailLimits,
} from "./hermes-gateway-real-dispatch-guardrails";

export type HermesGatewayRealDispatcher = typeof dispatchHermesGatewayReal;

export interface CodexGatewayRealDispatchConfig {
  workingDirectory: string;
  command?: string;
  timeoutMs?: number;
  maxStdoutChars?: number;
  maxStderrChars?: number;
}

export interface ExecutionGatewayOptions {
  env?: Record<string, string | undefined>;
  codexRunner?: CodexRunner;
  codexProcessRunner?: CodexCliProcessRunner;
  codexRealDispatchConfig?: CodexGatewayRealDispatchConfig;
  kimiConfig?: CliAdapterConfig;
  kimiRunner?: KimiCliProcessRunner;
  kimiGuardrailLimits?: Partial<KimiGatewayGuardrailLimits>;
  hermesConfig?: CliAdapterConfig;
  hermesRunner?: HermesCliProcessRunner;
  hermesGatewayRealDispatcher?: HermesGatewayRealDispatcher;
  hermesPhase2ShadowDispatcher?: HermesPhase2ShadowDispatcher;
  hermesGuardrailLimits?: Partial<HermesGatewayRealDispatchGuardrailLimits>;
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
    // Default behavior is shadow unless SDLC_EXECUTION_MODE is explicitly "codex".
    // When mode is codex and agent is codex, the Gateway uses an explicitly injected
    // codexRunner if provided. Otherwise real dispatch is permitted only when all of
    // the following are true:
    //   - SDLC_EXECUTION_MODE=codex
    //   - SDLC_CODEX_REAL_DISPATCH=enabled
    //   - agent === "codex"
    //   - request.type === "code_generation"
    //   - codexRealDispatchConfig.workingDirectory is a non-empty string after trim
    // If any condition is missing, the Gateway returns shadow.
    // The legacy executeCodexAgent path is no longer reachable through ExecutionGateway.
    const env = this.options.env ?? process.env;
    const mode = getExecutionMode(env);
    if (mode !== "codex" || enriched.agent !== "codex") {
      return executeShadowAgent(enriched);
    }

    if (this.options.codexRunner) {
      return this.options.codexRunner.run(enriched);
    }

    if (
      isCodexRealDispatchEnabled(env) &&
      enriched.type === "code_generation" &&
      typeof this.options.codexRealDispatchConfig?.workingDirectory === "string" &&
      this.options.codexRealDispatchConfig.workingDirectory.trim().length > 0
    ) {
      const config = this.options.codexRealDispatchConfig;
      const workingDirectory = config.workingDirectory.trim();
      const processRunner =
        this.options.codexProcessRunner ??
        createCodexCliProcessRunner({
          workingDirectory,
          command: config.command,
          timeoutMs: config.timeoutMs,
          maxStdoutChars: config.maxStdoutChars,
          maxStderrChars: config.maxStderrChars,
        } satisfies CodexCliProcessRunnerOptions);

      const realDispatchRunner = createCodexRealDispatchRunner({ processRunner });
      return realDispatchRunner.run(enriched);
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

    if (isHermesPhase2ShadowEnablementRequestType(request.type)) {
      return attachHermesPhase2ShadowEnablementSidecar({
        request,
        primaryResult,
        env: this.options.env,
        config: this.options.hermesConfig,
        dispatcher: this.options.hermesPhase2ShadowDispatcher,
      });
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
      const fallbackPolicy = evaluateHermesGatewayRealDispatchFallbackPolicy({
        requestType: request.type,
        dispatchResult,
        integrationMayAttach: integration.mayAttach,
        realDispatchEnabled: true,
      });
      const attached = integration.mayAttach && fallbackPolicy.shouldAttachSidecar;
      const observability = buildHermesGatewayRealDispatchObservability({
        requestType: request.type,
        dispatchResult,
        fallbackPolicy,
        attached,
        omitted: !attached,
        safeToAttach: integration.mayAttach,
        realDispatchEnabled: true,
      });
      const guardrails = evaluateHermesGatewayRealDispatchGuardrails({
        requestType: request.type,
        dispatchResult,
        fallbackPolicy,
        observability,
        realDispatchEnabled: true,
        integrationMayAttach: integration.mayAttach,
        limits: this.options.hermesGuardrailLimits,
      });

      if (attached && guardrails.shouldAttachSidecar) {
        return {
          ...primaryResult,
          hermes_gateway_real_dispatch: {
            ...dispatchResult,
            fallbackPolicy,
            observability,
            guardrails,
          },
        };
      }
    } catch (err) {
      const fallbackPolicy = evaluateHermesGatewayRealDispatchFallbackPolicy({
        requestType: request.type,
        dispatcherException: err,
        realDispatchEnabled: true,
      });
      buildHermesGatewayRealDispatchObservability({
        requestType: request.type,
        fallbackPolicy,
        attached: false,
        omitted: true,
        safeToAttach: false,
        dispatcherException: err,
        realDispatchEnabled: true,
      });
      // Hermes real dispatch is sidecar metadata only. Dispatcher failures must not affect Gateway output.
    }

    return primaryResult;
  }
}

export const executionGateway = new ExecutionGateway();
