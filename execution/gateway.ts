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
import { isSupportedCodexRequestType } from "./codex-real-dispatch-runner";
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
import { NODE_CAPABILITY_IDS, NODE_CAPABILITY_EXECUTION_ROLES, type CapabilityExecutionRole, type NodeCapabilityId } from "../loop/types";
import {
  CAPABILITY_ARTIFACT_TYPES,
  getEnabledBinding,
  validateBindingRegistry,
  validateNodeOutputArtifact,
  type BindingRegistry,
} from "../core/agent-capability-bindings";
import type { LoopRunStore } from "../core/loop-run-store";
import type { LoopArtifactKind, LoopArtifactStore } from "../core/loop-artifact-store";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  type LoopCapabilityExecutionEvent,
  type LoopCapabilityGateResult,
} from "../core/loop-capability-execution";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { readPlainDataRecord } from "../core/loop-run-state";
import { types as utilTypes } from "node:util";

export type HermesGatewayRealDispatcher = typeof dispatchHermesGatewayReal;

class CapabilityExecutionTimeoutError extends Error {
  constructor() {
    super("capability execution exceeded the binding timeout");
    this.name = "CapabilityExecutionTimeoutError";
  }
}

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
  capabilityTracing?: Readonly<{
    runStore: LoopRunStore;
    artifactStore: Pick<LoopArtifactStore, "put" | "read">;
    bindingRegistry: BindingRegistry;
    executorVersions: Readonly<Record<"kimi" | "codex" | "hermes", string>>;
    now?: () => string;
  }>;
}

export class ExecutionGateway {
  constructor(private readonly options: ExecutionGatewayOptions = {}) {}

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const isCanonicalCapability =
      typeof request?.type === "string" && NODE_CAPABILITY_IDS.includes(request.type as NodeCapabilityId);
    if (
      this.options.capabilityTracing !== undefined && isCanonicalCapability &&
      request.loopExecution === undefined
    ) {
      throw new LoopRunJournalError(
        "INVALID_INPUT",
        "canonical capability request requires durable loop execution context",
      );
    }
    // ── Skill Validation — metadata only, does not affect dispatch ──
    const skillValidation = validateExecutionRequestSkill(request);
    const enriched = { ...request, skillValidation };

    if (request.loopExecution !== undefined) {
      return this.executeCapabilityWithTracing(enriched);
    }
    const primaryResult = await this.executePrimary(enriched);
    return this.attachHermesGatewayRealDispatch(enriched, primaryResult);
  }

  private async executeCapabilityWithTracing(request: ExecutionRequest): Promise<ExecutionResult> {
    const tracing = this.options.capabilityTracing;
    if (tracing === undefined) {
      throw new LoopRunJournalError("INVALID_INPUT", "loop execution context requires capability tracing configuration");
    }
    if (typeof request.type !== "string" || !NODE_CAPABILITY_IDS.includes(request.type as NodeCapabilityId)) {
      throw new LoopRunJournalError("INVALID_INPUT", "loop execution context requires a canonical capability request");
    }
    const capability = request.type as NodeCapabilityId;
    if (utilTypes.isProxy(request.loopExecution)) {
      throw new LoopRunJournalError("INVALID_INPUT", "loopExecution must not be a Proxy");
    }
    const context = readPlainDataRecord(request.loopExecution, "loopExecution");
    const contextKeys = [
      "runId", "attempt", "executionRole", "inputArtifactRef", "inputArtifactVersion", "inputDigest",
      "outputArtifactVersion",
    ];
    if (
      Object.keys(context).length !== contextKeys.length ||
      contextKeys.some((key) => !(key in context)) ||
      Object.keys(context).some((key) => !contextKeys.includes(key))
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "loopExecution must contain exactly the canonical fields");
    }
    const runId = this.requireTracingString(context.runId, "loopExecution.runId");
    const attempt = context.attempt;
    if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 1) {
      throw new LoopRunJournalError("INVALID_INPUT", "loopExecution.attempt must be a positive safe integer");
    }
    const inputArtifactRef = this.requireTracingString(context.inputArtifactRef, "loopExecution.inputArtifactRef");
    const inputArtifactVersion = this.requireSemanticVersion(context.inputArtifactVersion, "loopExecution.inputArtifactVersion");
    const inputDigest = this.requireDigest(context.inputDigest, "loopExecution.inputDigest");
    const outputArtifactVersion = this.requireSemanticVersion(context.outputArtifactVersion, "loopExecution.outputArtifactVersion");
    // v2 (A2): the dispatch role must be one of the capability's required
    // roles; the enabled binding is resolved for the exact role slot.
    const executionRoleValue = context.executionRole;
    if (
      typeof executionRoleValue !== "string" ||
      !(NODE_CAPABILITY_EXECUTION_ROLES[capability] as readonly string[]).includes(executionRoleValue)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "loopExecution.executionRole must be a required role of the capability");
    }
    const executionRole = executionRoleValue as CapabilityExecutionRole;
    validateBindingRegistry(tracing.bindingRegistry);
    const snapshot = tracing.runStore.getSnapshot(runId);
    if (snapshot === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "loop execution run does not exist");
    }
    if (snapshot.state.identity.requirementId !== request.requirementId) {
      throw new LoopRunJournalError("INVALID_INPUT", "loop execution Requirement ID does not match the run");
    }
    tracing.artifactStore.read(inputArtifactRef, inputDigest);
    const binding = getEnabledBinding(tracing.bindingRegistry, capability, executionRole);
    const executorVersion = this.requireSemanticVersion(
      tracing.executorVersions[binding.agent],
      "capability tracing executor version",
    );
    const boundRequest: ExecutionRequest = Object.freeze({ ...request, agent: binding.agent });
    const existing = tracing.runStore.listCapabilityExecutions(runId);
    const startedSequence = existing.length + 1;
    const now = (): string => {
      const value = tracing.now?.() ?? new Date().toISOString();
      if (typeof value !== "string") {
        throw new LoopRunJournalError("INVALID_INPUT", "capability tracing clock must return an ISO timestamp");
      }
      return value;
    };
    const base = {
      schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
      runId,
      capability,
      executionRole,
      nodeId: request.node,
      attempt,
      bindingId: binding.bindingId,
      bindingVersion: binding.bindingVersion,
      bindingRegistryVersion: tracing.bindingRegistry.version,
      executorAgent: binding.agent,
      executorAdapter: binding.adapter,
      executorVersion,
      inputArtifactRef,
      inputArtifactVersion,
      inputDigest,
    } as const;
    const started: LoopCapabilityExecutionEvent = Object.freeze({
      ...base,
      executionEventId: `${runId}:capability:${startedSequence}:started`,
      sequence: startedSequence,
      status: "started",
      createdAt: now(),
      outputArtifactRef: null,
      outputArtifactVersion: null,
      outputDigest: null,
      gateResult: null,
      unresolvedFindingsRef: null,
      unresolvedFindingsDigest: null,
      nextStepEligibility: null,
      errorCode: null,
      retryable: null,
      reasonCode: null,
    });
    const claim = tracing.runStore.appendCapabilityExecution(started);
    if (!claim.appended) {
      return Object.freeze({
        success: false,
        node: request.node,
        agent: binding.agent,
        output: Object.freeze({ result: "FAIL", reason: "execution_already_claimed" }),
        artifacts: Object.freeze([]),
        error: "capability execution is already active",
      });
    }

    let result: ExecutionResult;
    try {
      result = await this.executeWithinBindingTimeout(async () => {
        const primary = await this.executePrimary(boundRequest);
        return this.attachHermesGatewayRealDispatch(boundRequest, primary);
      }, binding.timeoutMs);
    } catch (error) {
      const timedOut = error instanceof CapabilityExecutionTimeoutError;
      this.appendCapabilityFailure(
        tracing,
        base,
        startedSequence + 1,
        now(),
        timedOut ? "EXECUTOR_TIMEOUT" : "EXECUTOR_EXCEPTION",
        binding.failurePolicy === "retry_other_binding",
      );
      return Object.freeze({
        success: false,
        node: request.node,
        agent: binding.agent,
        output: Object.freeze({ result: "FAIL", reason: timedOut ? "executor_timeout" : "executor_exception" }),
        artifacts: Object.freeze([]),
        error: "capability execution failed",
      });
    }

    if (result.artifacts.some((artifact) => artifact.type === "shadow_output")) {
      this.appendCapabilityFailure(
        tracing,
        base,
        startedSequence + 1,
        now(),
        "EXECUTOR_UNAVAILABLE",
        binding.failurePolicy === "retry_other_binding",
      );
      return Object.freeze({
        success: false,
        node: request.node,
        agent: binding.agent,
        output: Object.freeze({ result: "FAIL", reason: "executor_unavailable" }),
        artifacts: Object.freeze([]),
        error: "capability executor is unavailable",
      });
    }

    const expectedArtifacts = result.artifacts.filter((artifact) => {
      try {
        validateNodeOutputArtifact(artifact.type, capability);
        return true;
      } catch {
        return false;
      }
    });
    if (
      !result.success || result.node !== request.node || result.agent !== binding.agent || result.artifacts.length !== 1 ||
      expectedArtifacts.length !== 1 ||
      expectedArtifacts[0]?.requirementId !== request.requirementId || expectedArtifacts[0]?.node !== request.node ||
      expectedArtifacts[0]?.metadata.agent !== binding.agent || expectedArtifacts[0]?.metadata.source !== "execution_gateway"
    ) {
      this.appendCapabilityFailure(tracing, base, startedSequence + 1, now(), "OUTPUT_CONTRACT_VIOLATION", binding.failurePolicy === "retry_other_binding");
      return Object.freeze({
        ...result,
        success: false,
        agent: binding.agent,
        error: "capability output contract violation",
      });
    }
    const expectedArtifact = expectedArtifacts[0]!;

    let outputDescriptor: ReturnType<NonNullable<ExecutionGatewayOptions["capabilityTracing"]>["artifactStore"]["put"]>;
    let findingsDescriptor: ReturnType<NonNullable<ExecutionGatewayOptions["capabilityTracing"]>["artifactStore"]["put"]> | null;
    let gateResult: LoopCapabilityGateResult;
    let findings: unknown[];
    try {
      ({ gateResult, findings } = this.readCapabilityOutcome(result, capability, executionRole));
    } catch {
      this.appendCapabilityFailure(
        tracing,
        base,
        startedSequence + 1,
        now(),
        "OUTPUT_CONTRACT_VIOLATION",
        binding.failurePolicy === "retry_other_binding",
      );
      return Object.freeze({
        ...result,
        success: false,
        agent: binding.agent,
        error: "capability outcome contract violation",
      });
    }
    try {
      const outputEnvelope = JSON.stringify({
        schema: "loop-capability-output:v1",
        requirementId: request.requirementId,
        capability,
        nodeId: request.node,
        artifact: expectedArtifact,
      });
      if (outputEnvelope === undefined) throw new Error("capability output is not serializable");
      outputDescriptor = tracing.artifactStore.put(CAPABILITY_ARTIFACT_TYPES[capability] as LoopArtifactKind, outputEnvelope);
      if (findings.length === 0) {
        findingsDescriptor = null;
      } else {
        const findingEnvelope = JSON.stringify({
          schema: "loop-capability-findings:v1",
          requirementId: request.requirementId,
          capability,
          findings,
        });
        if (findingEnvelope === undefined) throw new Error("capability findings are not serializable");
        findingsDescriptor = tracing.artifactStore.put("capability_findings", findingEnvelope);
      }
    } catch {
      this.appendCapabilityFailure(
        tracing,
        base,
        startedSequence + 1,
        now(),
        "OUTPUT_RECORDING_FAILED",
        binding.failurePolicy === "retry_other_binding",
      );
      return Object.freeze({
        ...result,
        success: false,
        agent: binding.agent,
        error: "capability output could not be recorded safely",
      });
    }
    const succeeded: LoopCapabilityExecutionEvent = Object.freeze({
      ...base,
      executionEventId: `${runId}:capability:${startedSequence + 1}:succeeded`,
      sequence: startedSequence + 1,
      status: "succeeded",
      createdAt: now(),
      outputArtifactRef: outputDescriptor.artifactRef,
      outputArtifactVersion,
      outputDigest: outputDescriptor.digest,
      gateResult,
      unresolvedFindingsRef: findingsDescriptor?.artifactRef ?? null,
      unresolvedFindingsDigest: findingsDescriptor?.digest ?? null,
      nextStepEligibility:
        gateResult === "FAIL" ||
        (findings.length > 0 && !(capability === "solution-gate" && executionRole === "adversarial_scan"))
          ? "BLOCKED"
          : "ELIGIBLE",
      errorCode: null,
      retryable: null,
      reasonCode: null,
    });
    tracing.runStore.appendCapabilityExecution(succeeded);
    return result;
  }

  private appendCapabilityFailure(
    tracing: NonNullable<ExecutionGatewayOptions["capabilityTracing"]>,
    base: Omit<LoopCapabilityExecutionEvent,
      "executionEventId" | "sequence" | "status" | "createdAt" | "outputArtifactRef" |
      "outputArtifactVersion" | "outputDigest" | "gateResult" | "unresolvedFindingsRef" |
      "unresolvedFindingsDigest" | "nextStepEligibility" | "errorCode" | "retryable" | "reasonCode">,
    sequence: number,
    createdAt: string,
    errorCode: string,
    retryable: boolean,
  ): void {
    tracing.runStore.appendCapabilityExecution(Object.freeze({
      ...base,
      executionEventId: `${base.runId}:capability:${sequence}:failed`,
      sequence,
      status: "failed",
      createdAt,
      outputArtifactRef: null,
      outputArtifactVersion: null,
      outputDigest: null,
      gateResult: null,
      unresolvedFindingsRef: null,
      unresolvedFindingsDigest: null,
      nextStepEligibility: "BLOCKED",
      errorCode,
      retryable,
      reasonCode: null,
    }));
  }

  /**
   * Enforces the immutable binding snapshot's timeout at the durable Gateway
   * boundary. The underlying adapter may not support cancellation; any late
   * completion is deliberately observed and discarded after the failed event
   * has been committed, so it can never become a successful journal result.
   */
  private executeWithinBindingTimeout(
    operation: () => Promise<ExecutionResult>,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new CapabilityExecutionTimeoutError());
      }, timeoutMs);

      void operation().then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private readCapabilityOutcome(
    result: ExecutionResult,
    capability: NodeCapabilityId,
    executionRole: string,
  ): { gateResult: LoopCapabilityGateResult; findings: unknown[] } {
    // v2 (A2): only the formal_verdict role may return a conclusive Gate
    // result; the adversarial_scan role always records NOT_APPLICABLE.
    const isVerdictRole = capability === "solution-gate" && executionRole === "formal_verdict";
    const isScanRole = capability === "solution-gate" && executionRole === "adversarial_scan";
    const gateValue = result.output["gateResult"] ?? result.output["gate_result"];
    let gateResult: LoopCapabilityGateResult = "NOT_APPLICABLE";
    if (isVerdictRole) {
      if (gateValue !== "PASS" && gateValue !== "FAIL" && gateValue !== "PASS_WITH_RISK") {
        throw new Error("formal_verdict omitted a canonical Gate result");
      }
      gateResult = gateValue;
    } else if (!isScanRole && gateValue !== undefined && gateValue !== "NOT_APPLICABLE") {
      throw new Error("non-verdict execution returned a non-canonical Gate result");
    }

    const requiresFindings = isVerdictRole || capability === "code-review";
    const rawFindings = result.output["unresolvedFindings"] ?? result.output["unresolved_findings"];
    if (requiresFindings && !Array.isArray(rawFindings)) {
      throw new Error("finding-producing capability omitted unresolved findings");
    }
    if (rawFindings !== undefined && !Array.isArray(rawFindings)) {
      throw new Error("unresolved findings must be an array");
    }
    return { gateResult, findings: Array.isArray(rawFindings) ? [...rawFindings] : [] };
  }

  private requireTracingString(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\x00-\x1f\x7f-\x9f]/.test(value)) {
      throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a safe trimmed non-empty string`);
    }
    return value;
  }

  private requireSemanticVersion(value: unknown, label: string): string {
    const text = this.requireTracingString(value, label);
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(text)) {
      throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a semantic version`);
    }
    return text;
  }

  private requireDigest(value: unknown, label: string): string {
    const text = this.requireTracingString(value, label);
    if (!/^[0-9a-f]{64}$/.test(text)) {
      throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a lowercase SHA-256 hex`);
    }
    return text;
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
    const env = this.options.env ?? process.env;
    const shouldAttemptKimi = (request: ExecutionRequest): boolean => {
      return request.agent === "kimi"
        && request.type === "llm_task"
        && env.SDLC_KIMI_GATEWAY_REAL_DISPATCH === "enabled";
    };

    if (shouldAttemptKimi(enriched)) {
      return executeKimiGatewayRequest(
        enriched,
        this.options.kimiConfig,
        this.options.kimiRunner,
        this.options.kimiGuardrailLimits,
        env,
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
    //   - request.type is code_generation or a node capability type (WP-3)
    //   - codexRealDispatchConfig.workingDirectory is a non-empty string after trim
    // If any condition is missing, the Gateway returns shadow.
    // The legacy executeCodexAgent path is no longer reachable through ExecutionGateway.
    const mode = getExecutionMode(env);
    if (mode !== "codex" || enriched.agent !== "codex") {
      return executeShadowAgent(enriched);
    }

    if (this.options.codexRunner) {
      return this.options.codexRunner.run(enriched);
    }

    if (
      isCodexRealDispatchEnabled(env) &&
      isSupportedCodexRequestType(enriched.type) &&
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
