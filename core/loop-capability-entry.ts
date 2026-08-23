// C01 Supported Capability Entry (WP-4B)
// ========================================
// Creates or recovers one durable Requirement run, verifies the immutable
// input artifact, enforces the canonical next capability, and dispatches
// through an ExecutionGateway configured for durable capability tracing.

import type { ExecutionGateway } from "../execution/gateway";
import { types as utilTypes } from "node:util";
import type { ExecutionResult } from "../execution/types";
import type { NodeCapabilityId } from "../loop/types";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_EXECUTION_ROLES,
  type CapabilityExecutionRole,
} from "../loop/types";
import {
  getBinding,
  getEnabledBinding,
  validateBindingRegistry,
  type BindingRegistry,
} from "./agent-capability-bindings";
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
  /** v2 (A2): the required execution role to dispatch for this capability. */
  executionRole: CapabilityExecutionRole;
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
  nodeId: NodeCapabilityId;
  attempt: number;
  execution: ExecutionResult;
  recoveryContext: RunRecoveryContext;
  /**
   * Round 3 review F2: the exact succeeded terminal event id committed by
   * THIS dispatch (null when the dispatch did not succeed). Revision
   * materialization binds to this identity, never to the journal tail.
   */
  producerTerminalEventId: string | null;
}

const REQUEST_FIELDS = [
  "requirementId", "identity", "capability", "executionRole", "inputArtifactRef",
  "inputArtifactVersion", "inputDigest", "outputArtifactVersion", "input", "skill",
] as const;

export class LoopCapabilityEntry {
  private readonly options: LoopCapabilityEntryOptions;

  constructor(options: LoopCapabilityEntryOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new LoopRunJournalError("INVALID_INPUT", "entry options must be an object");
    }
    validateBindingRegistry(options.bindingRegistry);
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
    const nodeId = request.capability;
    // v2 (A2): the requested role must be one of the capability's required
    // roles — primary everywhere except solution-gate's two fixed roles.
    const requiredRoles = NODE_CAPABILITY_EXECUTION_ROLES[request.capability];
    if (
      typeof request.executionRole !== "string" ||
      !(requiredRoles as readonly string[]).includes(request.executionRole)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "executionRole must be a required role of the capability");
    }
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
    // Re-review F2-1: a supported entry must not treat the recovery pointer
    // as directly dispatchable while a succeeded producer's node revision is
    // still pending. The terminal→revision window closes only after the
    // materialization replay lands; until then every entry fails closed
    // before any input verification or agent dispatch.
    if (recovery.pendingRevisionMaterialization !== null) {
      throw new LoopRunJournalError(
        "ILLEGAL_TRANSITION",
        "pending revision materialization holds the dispatch window closed",
      );
    }
    const interruptedAttempt = recovery.capabilityChainStatus === "RUNNING"
      ? recovery.lastCapabilityExecution
      : null;
    if (
      recovery.capabilityChainStatus === "RUNNING" &&
      (interruptedAttempt?.status !== "started" ||
        interruptedAttempt.capability !== request.capability ||
        interruptedAttempt.executionRole !== request.executionRole)
    ) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "request does not match the active capability execution");
    }
    // The content-addressed store independently checks ref syntax, kind,
    // containment and digest before any execution side effect.
    this.options.artifactStore.read(request.inputArtifactRef, request.inputDigest);
    // v2 (A2): the predecessor is the previous EXECUTION POINT of the
    // eight-point chain, not the previous capability — solution-gate's two
    // roles chain scan → verdict inside one node.
    const pointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
      (point) => point.capability === request.capability && point.executionRole === request.executionRole,
    );
    if (pointIndex < 0) {
      throw new LoopRunJournalError("INVALID_INPUT", "request is not a canonical execution point");
    }
    if (pointIndex === 0) {
      if (!request.inputArtifactRef.startsWith("loop-artifact:v1:requirement_summary:sha256:")) {
        throw new LoopRunJournalError("INVALID_INPUT", "requirement intake requires a normalized Requirement source");
      }
    } else {
      const previousPoint = LOOP_CAPABILITY_EXECUTION_POINTS[pointIndex - 1]!;
      const previousSucceeded = [...this.options.runStore.listCapabilityExecutions(
        recovery.snapshot.state.identity.runId,
      )].reverse().find(
        (event) => event.status === "succeeded" &&
          event.capability === previousPoint.capability &&
          event.executionRole === previousPoint.executionRole,
      );
      if (
        previousSucceeded === undefined || previousSucceeded.nextStepEligibility !== "ELIGIBLE" ||
        previousSucceeded.outputArtifactRef !== request.inputArtifactRef ||
        previousSucceeded.outputArtifactVersion !== request.inputArtifactVersion ||
        previousSucceeded.outputDigest !== request.inputDigest
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
    if (recovery.nextExecutionPoint === null ||
      recovery.nextExecutionPoint.capability !== request.capability ||
      recovery.nextExecutionPoint.executionRole !== request.executionRole) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "requested execution point is not the next recoverable point");
    }
    // v2 dispatch-time role firewall (A2/G1): before dispatching the
    // formal_verdict role, the enabled binding's agent must differ from the
    // adversarial_scan agent of the same solution-gate round. The store
    // re-validates this before the result is promoted to current.
    const binding = getEnabledBinding(this.options.bindingRegistry, request.capability, request.executionRole);
    // v3 (Round 1): the formal_verdict dispatch consumes the scan round's
    // persisted Finding Ledger; without it there is nothing to adjudicate.
    let consumedLedger: { ref: string; digest: string } | undefined;
    if (request.capability === "solution-gate" && request.executionRole === "formal_verdict") {
      const executions = this.options.runStore.listCapabilityExecutions(recovery.snapshot.state.identity.runId);
      const scan = [...executions].reverse().find(
        (item) => item.status === "succeeded" &&
          item.capability === "solution-gate" && item.executionRole === "adversarial_scan",
      );
      if (
        scan === undefined || scan.unresolvedFindingsRef === null || scan.unresolvedFindingsDigest === null
      ) {
        throw new LoopRunJournalError(
          "ILLEGAL_TRANSITION",
          "formal_verdict dispatch requires the adversarial_scan Finding Ledger",
        );
      }
      consumedLedger = { ref: scan.unresolvedFindingsRef, digest: scan.unresolvedFindingsDigest };
    }
    if (request.capability === "solution-gate" && request.executionRole === "formal_verdict") {
      const scan = [...this.options.runStore.listCapabilityExecutions(
        recovery.snapshot.state.identity.runId,
      )].reverse().find(
        (event) => event.status === "succeeded" &&
          event.capability === "solution-gate" && event.executionRole === "adversarial_scan",
      );
      if (scan !== undefined && scan.executorAgent === binding.agent) {
        throw new LoopRunJournalError(
          "ILLEGAL_TRANSITION",
          "formal_verdict must be dispatched to a different agent than adversarial_scan",
        );
      }
    }
    // Attempts are tracked per execution point, not per capability.
    const pointState = recovery.executionPointStates.find(
      (state) => state.capability === request.capability && state.executionRole === request.executionRole,
    );
    if (pointState === undefined) {
      throw new LoopRunJournalError("STORE_CORRUPT", "recovery context is missing a canonical execution point");
    }
    const attempt = pointState.lastAttempt + 1;
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
        executionRole: request.executionRole,
        inputArtifactRef: request.inputArtifactRef,
        inputArtifactVersion: request.inputArtifactVersion,
        inputDigest: request.inputDigest,
        outputArtifactVersion: request.outputArtifactVersion,
        ...(consumedLedger === undefined ? {} : {
          consumedFindingsRef: consumedLedger.ref,
          consumedFindingsDigest: consumedLedger.digest,
        }),
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
      producerTerminalEventId: execution.capabilityTerminalEventId ?? null,
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
