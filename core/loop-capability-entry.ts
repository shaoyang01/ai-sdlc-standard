// C01 Supported Capability Entry (WP-4B)
// ========================================
// Creates or recovers one durable Requirement run, verifies the immutable
// input artifact, enforces the canonical next capability, and dispatches
// through an ExecutionGateway configured for durable capability tracing.

import type { ExecutionGateway } from "../execution/gateway";
import { types as utilTypes } from "node:util";
import type { ExecutionResult } from "../execution/types";
import type { NodeCapabilityId } from "../loop/types";
import { getBinding, getEnabledBinding, type BindingRegistry } from "./agent-capability-bindings";
import type { LoopArtifactStore } from "./loop-artifact-store";
import type { LoopRunEvent, LoopRunIdentity } from "./loop-executor-types";
import { LoopRunJournalError } from "./loop-executor-types";
import { recoverRunContext, type RunRecoveryContext } from "./loop-recovery";
import {
  canonicalizeLoopRunIdentity,
  readPlainDataRecord,
  validateLoopRunIdentity,
  validateRequirementId,
} from "./loop-run-state";
import type { LoopRunStore } from "./loop-run-store";
import {
  runtimeExecutionPointForCapability,
  type RuntimeCapabilityExecutionPoint,
} from "./runtime-capability-map";

export interface LoopCapabilityEntryOptions {
  runStore: LoopRunStore;
  artifactStore: Pick<LoopArtifactStore, "read">;
  bindingRegistry: BindingRegistry;
  gateway: Pick<ExecutionGateway, "execute">;
  now?: () => string;
}

export interface LoopCapabilityEntryRequest {
  requirementId: string;
  identity?: LoopRunIdentity;
  capability: NodeCapabilityId;
  inputArtifactRef: string;
  inputArtifactVersion: string;
  inputDigest: string;
  outputArtifactVersion: string;
  input: Record<string, unknown>;
  skill?: string;
}

export interface LoopCapabilityEntryResult {
  runId: string;
  requirementId: string;
  recovered: boolean;
  capability: NodeCapabilityId;
  nodeId: RuntimeCapabilityExecutionPoint;
  attempt: number;
  execution: ExecutionResult;
  recoveryContext: RunRecoveryContext;
}

const REQUEST_FIELDS = [
  "requirementId", "identity", "capability", "inputArtifactRef", "inputArtifactVersion",
  "inputDigest", "outputArtifactVersion", "input", "skill",
] as const;

export class LoopCapabilityEntry {
  private readonly options: LoopCapabilityEntryOptions;

  constructor(options: LoopCapabilityEntryOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new LoopRunJournalError("INVALID_INPUT", "entry options must be an object");
    }
    this.options = options;
  }

  async execute(value: LoopCapabilityEntryRequest): Promise<LoopCapabilityEntryResult> {
    if (utilTypes.isProxy(value)) {
      throw new LoopRunJournalError("INVALID_INPUT", "capability entry request must not be a Proxy");
    }
    const request = readPlainDataRecord(value, "capability entry request") as unknown as LoopCapabilityEntryRequest;
    const keys = Object.keys(request);
    if (
      keys.some((key) => !(REQUEST_FIELDS as readonly string[]).includes(key)) ||
      REQUEST_FIELDS.filter((field) => field !== "identity" && field !== "skill").some((field) => !(field in request))
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "capability entry request fields are invalid");
    }
    validateRequirementId(request.requirementId);
    const nodeId = runtimeExecutionPointForCapability(request.capability);
    if (request.identity !== undefined) {
      if (utilTypes.isProxy(request.identity)) {
        throw new LoopRunJournalError("INVALID_INPUT", "run identity must not be a Proxy");
      }
      validateLoopRunIdentity(request.identity);
    }
    const now = this.readNow();
    let recovery = recoverRunContext(this.options.runStore, request.requirementId);
    let recovered = true;
    if (recovery === undefined) {
      recovered = false;
      if (request.identity === undefined) {
        throw new LoopRunJournalError("INVALID_INPUT", "new Requirement requires a run identity");
      }
      if (request.identity.requirementId !== request.requirementId) {
        throw new LoopRunJournalError("INVALID_INPUT", "run identity Requirement ID mismatch");
      }
      this.options.runStore.createRun(request.identity);
      const startEvent = this.runLevelEvent(request.identity.runId, 2, "run_started", now);
      this.options.runStore.appendEvent(startEvent);
      recovery = recoverRunContext(this.options.runStore, request.requirementId);
    } else if (request.identity !== undefined) {
      if (canonicalizeLoopRunIdentity(request.identity) !== canonicalizeLoopRunIdentity(recovery.snapshot.state.identity)) {
        throw new LoopRunJournalError("RUN_ID_CONFLICT", "recovery identity does not match the latest Requirement run");
      }
    }
    if (recovery === undefined) {
      throw new LoopRunJournalError("STORE_FAILURE", "run recovery failed after creation");
    }
    if (recovery.status === "created") {
      this.options.runStore.appendEvent(this.runLevelEvent(
        recovery.snapshot.state.identity.runId,
        recovery.snapshot.state.lastSequence + 1,
        "run_started",
        now,
      ));
      recovery = recoverRunContext(this.options.runStore, request.requirementId);
      if (recovery === undefined) {
        throw new LoopRunJournalError("STORE_FAILURE", "run recovery failed after start");
      }
    }
    if (recovery.status !== "running") {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability entry requires a running run");
    }
    const interruptedAttempt = recovery.capabilityChainStatus === "RUNNING"
      ? recovery.lastCapabilityExecution
      : null;
    if (
      recovery.capabilityChainStatus === "RUNNING" &&
      (interruptedAttempt?.status !== "started" || interruptedAttempt.capability !== request.capability)
    ) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "request does not match the active capability execution");
    }
    // The content-addressed store independently checks ref syntax, kind,
    // containment and digest before any execution side effect.
    this.options.artifactStore.read(request.inputArtifactRef, request.inputDigest);
    const capabilityIndex = recovery.capabilityStates.findIndex(
      (state) => state.capability === request.capability,
    );
    if (capabilityIndex < 0) {
      throw new LoopRunJournalError("STORE_CORRUPT", "recovery context is missing a canonical capability");
    }
    if (capabilityIndex === 0) {
      if (!request.inputArtifactRef.startsWith("loop-artifact:v1:requirement_summary:sha256:")) {
        throw new LoopRunJournalError("INVALID_INPUT", "requirement intake requires a normalized Requirement source");
      }
    } else {
      const predecessor = recovery.capabilityStates[capabilityIndex - 1]!;
      if (
        predecessor.nextStepEligibility !== "ELIGIBLE" ||
        predecessor.effectiveOutputArtifactRef !== request.inputArtifactRef ||
        predecessor.effectiveOutputArtifactVersion !== request.inputArtifactVersion ||
        predecessor.effectiveOutputDigest !== request.inputDigest
      ) {
        throw new LoopRunJournalError("INVALID_INPUT", "capability input does not match the predecessor's effective output");
      }
    }
    if (
      interruptedAttempt !== null &&
      (
        interruptedAttempt.inputArtifactRef !== request.inputArtifactRef ||
        interruptedAttempt.inputArtifactVersion !== request.inputArtifactVersion ||
        interruptedAttempt.inputDigest !== request.inputDigest
      )
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "recovery input does not match the active capability claim");
    }
    if (interruptedAttempt !== null) {
      const historicalBinding = getBinding(this.options.bindingRegistry, interruptedAttempt.bindingId);
      if (
        historicalBinding === undefined || historicalBinding.capability !== interruptedAttempt.capability ||
        historicalBinding.bindingVersion !== interruptedAttempt.bindingVersion ||
        historicalBinding.agent !== interruptedAttempt.executorAgent ||
        historicalBinding.adapter !== interruptedAttempt.executorAdapter
      ) {
        throw new LoopRunJournalError("STORE_FAILURE", "binding registry cannot recover the active capability execution");
      }
      this.options.runStore.interruptCapabilityExecution(
        recovery.snapshot.state.identity.runId,
        interruptedAttempt.executionEventId,
        now,
        historicalBinding.failurePolicy === "retry_other_binding",
      );
      recovery = recoverRunContext(this.options.runStore, request.requirementId);
      if (recovery === undefined) {
        throw new LoopRunJournalError("STORE_FAILURE", "run recovery failed after interrupted capability closure");
      }
    }
    if (recovery.nextCapability !== request.capability) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "requested capability is not the next recoverable capability");
    }
    const capabilityState = recovery.capabilityStates.find((state) => state.capability === request.capability)!;
    const attempt = capabilityState.lastAttempt + 1;
    const binding = getEnabledBinding(this.options.bindingRegistry, request.capability);
    const execution = await this.options.gateway.execute({
      type: request.capability,
      node: nodeId,
      agent: binding.agent,
      requirementId: request.requirementId,
      input: request.input,
      ...(request.skill === undefined ? {} : { skill: request.skill }),
      loopExecution: {
        runId: recovery.snapshot.state.identity.runId,
        attempt,
        inputArtifactRef: request.inputArtifactRef,
        inputArtifactVersion: request.inputArtifactVersion,
        inputDigest: request.inputDigest,
        outputArtifactVersion: request.outputArtifactVersion,
      },
    });
    const after = recoverRunContext(this.options.runStore, request.requirementId);
    if (after === undefined) {
      throw new LoopRunJournalError("STORE_FAILURE", "run recovery failed after capability execution");
    }
    return Object.freeze({
      runId: after.snapshot.state.identity.runId,
      requirementId: request.requirementId,
      recovered,
      capability: request.capability,
      nodeId,
      attempt,
      execution,
      recoveryContext: after,
    });
  }

  private readNow(): string {
    const value = this.options.now?.() ?? new Date().toISOString();
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new LoopRunJournalError("INVALID_INPUT", "entry clock must return an ISO timestamp");
    }
    return value;
  }

  private runLevelEvent(
    runId: string,
    sequence: number,
    kind: "run_started",
    createdAt: string,
  ): LoopRunEvent {
    return Object.freeze({
      eventId: `${runId}:${sequence}:${kind}`,
      runId,
      sequence,
      kind,
      stage: null,
      attempt: 0,
      createdAt,
      inputDigest: null,
      outputArtifactRef: null,
      outputDigest: null,
      errorCode: null,
      retryable: null,
      reasonCode: null,
      bindingId: null,
      bindingVersion: null,
      inputArtifactRef: null,
    });
  }
}
