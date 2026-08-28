// SDLC Runtime — v2 Single-Rail Chain Runner (C02-WP3.5-C)
// ==========================================================
// The v2 seven-node single-rail chain is the ONLY runtime authority:
// requirement-intake → solution-design → solution-gate (adversarial_scan +
// formal_verdict, always two different agents) → task-planning →
// implementation → code-review → knowledge-sync.
//
// Every execution point is dispatched through LoopCapabilityEntry with full
// capability tracing: the append-only LoopRunStore (v6) journal, the
// content-addressed artifact store and the immutable BindingRegistry. The
// legacy five-node graph interpreter, its state-machine VM, the legacy LOOP
// kernel and the DocFlow engine are retired — there is no second state
// machine and no legacy entry: requests carrying retired runtime options or
// legacy node names fail closed.
//
// Entry: run(requirement: string, options?) → RuntimeResult

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  INITIAL_BINDING_REGISTRY,
  type BindingRegistry,
} from "./core/agent-capability-bindings";
import type { LoopCapabilityExecutionEvent } from "./core/loop-capability-execution";
import { LoopCapabilityEntry } from "./core/loop-capability-entry";
import { LoopArtifactStore } from "./core/loop-artifact-store";
import {
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
  createLoopArtifactRevision,
} from "./core/loop-artifact-revision";
import { deriveDispatchCommand, recoverRunContext } from "./core/loop-recovery";
import { withResumeLease } from "./core/loop-resume-lock";
import { LoopRunStore } from "./core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "./core/loop-executor-types";
import {
  developmentPathEntryGuard,
  checkDocumentationGovernanceTailCompletion,
  buildManualHandoffChecklist,
  type SolutionGateVerdict,
  type DesignDepth,
  type NodeEvidenceStatus,
  type ManualHandoffChecklist,
} from "./core/loop-c03-delivery-tail";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "./loop/types";
import type { AgentName } from "./execution/types";

// ─── Types ────────────────────────────────────────────

export interface RuntimeChainEntry {
  capability: NodeCapabilityId;
  executionRole: CapabilityExecutionRole;
  agent: AgentName;
  attempt: number;
  status: LoopCapabilityExecutionEvent["status"];
  gateResult: LoopCapabilityExecutionEvent["gateResult"];
  outputArtifactRef: string | null;
  outputDigest: string | null;
}

export interface RuntimeResult {
  requirement_id: string;
  run_id: string;
  final_status: "success" | "failed";
  chain_status: "COMPLETED" | "READY" | "RUNNING" | "BLOCKED";
  blocking_reason_code?: string | null;
  execution_trace: readonly RuntimeChainEntry[];
  next_execution_point: { capability: NodeCapabilityId; executionRole: CapabilityExecutionRole } | null;
  workspace_root: string;
  /** Set only when the runtime created the store; null when stores are injected. */
  journal_path: string | null;
  completed_at: string;
  /** C03-D d2: manual handoff checklist status (null when chain not completed or c2/c3 not invoked). */
  manual_handoff_status?: ManualHandoffChecklist["status"] | null;
  /** C03-D d2: manual handoff checklist reason (null when not invoked). */
  manual_handoff_reason?: string | null;
  /** C03-D d2: artifact ref of the persisted manual handoff checklist (null when not persisted). */
  manual_handoff_artifact_ref?: string | null;
}

/** Anything the runtime executes must go through this minimal gateway shape. */
export interface RuntimeCapabilityGateway {
  execute(request: import("./execution/types").ExecutionRequest): Promise<import("./execution/types").ExecutionResult>;
}

export interface RuntimeOptions {
  /** Stable requirement id; defaults to a timestamped REQ id. */
  requirementId?: string;
  /** Workspace root for the journal, artifacts and repo/control dirs. */
  workspaceRoot?: string;
  /** Injected stores (both or neither); used by tests and future entries. */
  runStore?: LoopRunStore;
  artifactStore?: LoopArtifactStore;
  /**
   * Injected binding registry. The default registers the dual-agent
   * solution-gate required by the v2 chain: adversarial_scan stays on codex
   * while formal_verdict moves to hermes.
   */
  bindingRegistry?: BindingRegistry;
  /** Injected execution gateway; defaults to the deterministic shadow runner. */
  gateway?: RuntimeCapabilityGateway;
  /**
   * Where node capabilities come from (W2, wiring-design §3). Defaults to
   * "deterministic" — the traced shadow, behaviour unchanged. "real" builds a
   * RealCapabilityGateway and requires a Q1 registry plus realGatewayDeps; it
   * fails closed rather than silently dropping back to the shadow.
   */
  capabilitySource?: CapabilitySource;
  /** Real CLI adapter + attempt-workspace resolver; required iff capabilitySource === "real". */
  realGatewayDeps?: RealCapabilityGatewayDeps;
  /**
   * WP4 Round 2 review H4 correction: pure LOOP SAFETY BOUND for one run()
   * invocation. Hitting it stops the invocation WITHOUT persisting any
   * durable block — plain linear progress must never be mistaken for a
   * pathological Re-Gate cycle. The durable REGATE_ROUND_BUDGET_EXHAUSTED
   * block is reserved for the round budget below.
   */
  maxDispatches?: number;
  /**
   * WP4 Round 2 review H4: maximum number of persisted backward jumps
   * (Re-Gate rounds) per run. Exceeding it is a durable, honest block
   * (REGATE_ROUND_BUDGET_EXHAUSTED) that only an explicit release decision
   * (RISK_ACCEPTED / SCOPE_RESET) can clear.
   */
  maxRegateRounds?: number;
}

// The runtime input contract is CLOSED at runtime, not just at the type
// level: JavaScript callers and boundary payloads bypass TypeScript, so any
// own-property outside this allowlist is rejected fail-closed instead of
// being silently dropped.
const RUNTIME_OPTION_ALLOWLIST: readonly string[] = Object.freeze([
  "requirementId",
  "workspaceRoot",
  "runStore",
  "artifactStore",
  "bindingRegistry",
  "gateway",
  "capabilitySource",
  "realGatewayDeps",
  "maxDispatches",
  "maxRegateRounds",
]);

// Options of the retired five-node interpreter. They fail with a specific
// message so legacy callers see the migration reason, not a generic typo.
const RETIRED_RUNTIME_OPTIONS: readonly string[] = Object.freeze([
  "requirementSummaryMode",
  "solutionChallengeMode",
  "executors",
  "executionGateway",
  "hermesRuntimeShadowAttachmentBuilder",
  "env",
]);

function validateRuntimeOptions(options: RuntimeOptions): void {
  for (const key of Object.keys(options)) {
    if (RETIRED_RUNTIME_OPTIONS.includes(key)) {
      invalid(
        `runtime option "${key}" belongs to the retired five-node interpreter ` +
          "(or carries no v2 semantics); the v2 single-rail runtime has no such option",
      );
    }
    if (!RUNTIME_OPTION_ALLOWLIST.includes(key)) {
      invalid(
        `unknown runtime option "${key}"; the v2 runtime accepts exactly: ` +
          `${RUNTIME_OPTION_ALLOWLIST.join(", ")}`,
      );
    }
  }
  // W2 closed enum for the capability source, and no silent source/gateway conflict.
  if (options.capabilitySource !== undefined && !isCapabilitySource(options.capabilitySource)) {
    invalid(`capabilitySource must be "deterministic" | "real", got ${String(options.capabilitySource)}`);
  }
  if (options.capabilitySource === "real" && options.gateway !== undefined) {
    invalid('capabilitySource "real" is mutually exclusive with an injected gateway');
  }
}

function invalid(message: string): never {
  throw new LoopRunJournalError("INVALID_INPUT", message);
}

function requireSafeId(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    invalid(`${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

// ─── Deterministic traced capability gateway ──────────
// Moved into execution/gateway.ts (C02-WP5 F3): implemented as a real
// ExecutionGateway subclass so its durable tracing is registered by the base
// constructor through that module's PRIVATE registry — no out-of-module
// registrar exists. Re-exported here for compatibility with existing callers.

import { createDeterministicCapabilityGateway } from "./execution/gateway";
export { createDeterministicCapabilityGateway };
import {
  createCapabilityGateway,
  DEFAULT_CAPABILITY_SOURCE,
  isCapabilitySource,
  type CapabilitySource,
} from "./execution/capability-gateway-source";
import type { RealCapabilityGatewayDeps } from "./execution/real-capability-gateway";

// ─── Default Q1 three-agent registry ──────────────────
// C03-E W1 (Decision-073): INITIAL_BINDING_REGISTRY now carries the full Q1
// slot map directly — Kimi owns requirement-intake/solution-design/
// task-planning/knowledge-sync, Codex owns adversarial_scan/implementation,
// Hermes owns formal_verdict/code-review — so one solution-gate round's
// adversarial_scan (codex) and formal_verdict (hermes) already run on
// different agents. The former "codex everywhere, then move formal_verdict to
// hermes" replacement is obsolete; the runtime default registry is the
// initial registry itself. Callers may still inject any registry that keeps
// the two gate roles on different enabled agents.

export function createRuntimeBindingRegistry(): BindingRegistry {
  return INITIAL_BINDING_REGISTRY;
}

// ─── MAIN RUNTIME — v2 SINGLE-RAIL CHAIN RUNNER ───────

/**
 * Round 3 review F2: materialize the node artifact revision authored by one
 * succeeded producer execution. Every revision field is a deterministic
 * function of the verified store state and the producer event, so a recovery
 * entry replays the identical append; when a racing entry already landed this
 * exact producer's revision, the resulting id/sequence conflict resolves to
 * an idempotent no-op instead of a duplicate revision.
 *
 * Re-review F2-1: exported so recovery drivers (and test fixtures seeding
 * legal precondition chains) share the runtime's exact replay derivation —
 * the dispatch window stays closed for every supported entry until this
 * materialization lands.
 */
export function materializeProducerRevision(
  runStore: LoopRunStore,
  requirementId: string,
  runId: string,
  producer: LoopCapabilityExecutionEvent,
  now: () => string,
): void {
  // The adversarial_scan round's product is its Finding Ledger (already
  // persisted by the gateway), not the node artifact — only the
  // formal_verdict round may author the solution-gate node revision.
  if (producer.capability === "solution-gate" && producer.executionRole === "adversarial_scan") {
    return;
  }
  // WP6 discovery: a FAIL adjudication authors no node revision — the
  // artifact-revision contract only admits conclusive passing Gates. The
  // BLOCKED_UNKNOWN projection seals the chain; materializing would crash
  // the invocation with INVALID_INPUT instead of failing closed honestly.
  if (
    producer.capability === "solution-gate" && producer.executionRole === "formal_verdict" &&
    producer.gateResult !== "PASS" && producer.gateResult !== "PASS_WITH_RISK"
  ) {
    return;
  }
  if (producer.outputArtifactRef === null || producer.outputDigest === null) {
    return;
  }
  const priorForNode = runStore.listArtifactRevisions(runId)
    .filter((item) => item.nodeId === producer.capability);
  const nodeIdx = NODE_CAPABILITY_IDS.indexOf(producer.capability);
  const upstreamNodeId = nodeIdx > 0 ? NODE_CAPABILITY_IDS[nodeIdx - 1]! : null;
  const upstreamCurrent = upstreamNodeId === null
    ? undefined
    : runStore.getCurrentArtifactRevision(runId, upstreamNodeId);
  try {
    runStore.appendArtifactRevision(createLoopArtifactRevision({
      runId,
      requirementId,
      nodeId: producer.capability,
      sequence: priorForNode.length + 1,
      // Round 2 review H3: generation is the RUN's feedback-opened
      // generation, never the node's attempt — retries keep the
      // generation uniform across nodes.
      generation: runStore.getRunGeneration(runId),
      stablePath: `library/${requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[producer.capability].stablePathSegment}/${requirementId}_${producer.capability}.md`,
      artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[producer.capability].artifactKind,
      semver: `${producer.attempt}.0.0`,
      artifactRef: producer.outputArtifactRef,
      digest: producer.outputDigest,
      producerExecutionId: producer.executionEventId,
      producerExecutionRole: producer.executionRole,
      gateResult: producer.gateResult,
      upstreamRevisionIds: upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
      createdAt: now(),
    }));
  } catch (error) {
    if (
      error instanceof LoopRunJournalError &&
      (error.code === "EVENT_ID_CONFLICT" || error.code === "EVENT_SEQUENCE_CONFLICT") &&
      runStore.listArtifactRevisions(runId)
        .some((item) => item.producerExecutionId === producer.executionEventId)
    ) {
      // A racing entry already materialized THIS producer's revision — the
      // replay converges to an idempotent no-op.
      return;
    }
    throw error;
  }
}

export async function run(
  requirement: string,
  options: RuntimeOptions = {}
): Promise<RuntimeResult> {
  if (typeof requirement !== "string" || requirement.trim().length === 0) {
    invalid("requirement must be a non-empty string");
  }
  validateRuntimeOptions(options);
  const requirementId = requireSafeId(options.requirementId ?? `REQ-${Date.now()}`, "requirementId");
  // R4-H2: set when this invocation completes a legacy created-only run —
  // the resuming requirement text becomes the first intake source.
  let bootstrapInput: { ref: string; version: string; digest: string } | null = null;

  const workspaceRoot = options.workspaceRoot ?? mkdtempSync(join(tmpdir(), "sdlc-runtime-v2-"));
  mkdirSync(join(workspaceRoot, "repo"), { recursive: true });
  if ((options.runStore === undefined) !== (options.artifactStore === undefined)) {
    invalid("runStore and artifactStore must be injected together");
  }
  const artifactStore =
    options.artifactStore ??
    new LoopArtifactStore({
      controlRoot: join(workspaceRoot, "control"),
      repositoryPath: join(workspaceRoot, "repo"),
    });
  // Round 2 close-out B1: the runtime's own journal store BINDS the artifact
  // store — decision-delta physical integrity must hold on the default path,
  // not only when callers inject both stores.
  const runStore =
    options.runStore ??
    new LoopRunStore(join(workspaceRoot, "journal.db"), { artifactStore });
  if (options.runStore === undefined) {
    runStore.init();
    artifactStore.init();
  }

  const bindingRegistry = options.bindingRegistry ?? createRuntimeBindingRegistry();
  const now = (): string => new Date().toISOString();
  const capabilitySource = options.capabilitySource ?? DEFAULT_CAPABILITY_SOURCE;
  const gateway =
    options.gateway ??
    createCapabilityGateway({
      source: capabilitySource,
      runStore,
      artifactStore,
      bindingRegistry,
      now,
      realDeps: options.realGatewayDeps,
    });
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry,
    gateway,
    now,
  });

  // C02-WP5 B1-1: cross-process resume lease — exactly one executor may run
  // the recovery→claim→external-execution→terminal cycle for this journal at
  // any time. Same-process nested invocations (F2 window barriers) reuse the
  // held lease via AsyncLocalStorage; independent invocations queue on the
  // companion database or fail honestly with STORE_BUSY.
  const resumeJournalPath = options.runStore !== undefined
    ? options.runStore.databaseFilePath
    : join(workspaceRoot, "journal.db");
  return withResumeLease(resumeJournalPath, async (): Promise<RuntimeResult> => {
    const identity: LoopRunIdentity = Object.freeze({
      runId: `run-${requirementId}-${Date.now()}`,
      requirementId,
      repository: "local",
      repositoryPath: join(workspaceRoot, "repo"),
      baseBranch: "main",
      expectedBaseSha: "0".repeat(40),
      taskBranch: `runtime/${requirementId}`,
      controlRoot: join(workspaceRoot, "control"),
      createdAt: now(),
    });

    let recovery = recoverRunContext(runStore, requirementId);
    // Round 3 review F2: a crashed or interrupted previous invocation may have
    // committed a succeeded producer whose node revision never landed. Finalize
    // (idempotently replay) that materialization BEFORE any dispatch decision —
    // recovery completes the producer's revision instead of re-calling the
    // agent, and the dispatch permit stays closed while it is pending.
    while (recovery !== undefined && recovery.pendingRevisionMaterialization !== null) {
      materializeProducerRevision(
        runStore,
        requirementId,
        recovery.snapshot.state.identity.runId,
        recovery.pendingRevisionMaterialization.producerExecution,
        now,
      );
      recovery = recoverRunContext(runStore, requirementId);
    }
    // C02-WP5 R4-H2: a legal created-only run (externally pre-created, no
    // provenance yet) is completed under the resume lease via the guarded
    // legacy start; the resuming requirement text then becomes the first
    // intake source (first-writer-wins — no confirmed facts exist yet to
    // violate).
    if (recovery !== undefined && recovery.status === "created") {
      const source0 = artifactStore.put("requirement_summary", requirement);
      runStore.ensureRunStarted(recovery.snapshot.state.identity.runId);
      recovery = recoverRunContext(runStore, requirementId);
      bootstrapInput = { ref: source0.artifactRef, version: "1.0.0", digest: source0.digest };
    }
    // C02-WP5 F2: the normalized Requirement source is persisted ONLY for a
    // genuinely fresh run. A recovered run consumes the ORIGINAL source pinned
    // atomically at bootstrap (run_started provenance) or by its first intake
    // claim — the `requirement` argument of a resuming call can never replace
    // already-confirmed facts.
    let inputRef: string;
    let inputVersion: string;
    let inputDigest: string;
    let firstDispatch = false;
    if (recovery === undefined) {
      const source = artifactStore.put("requirement_summary", requirement);
      inputRef = source.artifactRef;
      inputVersion = "1.0.0";
      inputDigest = source.digest;
      firstDispatch = true;
    } else {
      // Derive the initial input from the recovered authority; for a non-intake
      // next point this is the predecessor's effective output, and the per-
      // iteration predecessor adoption below refines it after each dispatch.
      const command = deriveDispatchCommand(recovery);
      inputRef = command?.inputArtifactRef ?? "";
      inputVersion = command?.inputArtifactVersion ?? "";
      inputDigest = command?.inputDigest ?? "";
      if (
        command !== null && command.inputArtifactRef === null &&
        recovery.nextExecutionPoint?.capability === "requirement-intake" &&
        bootstrapInput !== null
      ) {
        // R4-H2: the created-only run just completed its legacy start under
        // this invocation — the resuming text is the first intake source.
        inputRef = bootstrapInput.ref;
        inputVersion = bootstrapInput.version;
        inputDigest = bootstrapInput.digest;
      }
    }
    // null nextExecutionPoint on an existing run means the chain is completed
    // or blocked — it must NOT be coerced back to the first point.
    let next = recovery === undefined ? LOOP_CAPABILITY_EXECUTION_POINTS[0]! : recovery.nextExecutionPoint;
    let journalRunId = recovery?.snapshot.state.identity.runId ?? null;
    // WP4 Round 2 review H4 correction: maxDispatches is a pure loop safety
    // bound — hitting it stops the invocation WITHOUT a durable block. The
    // durable REGATE_ROUND_BUDGET_EXHAUSTED block is reserved for the round
    // budget (persisted backward jumps) below.
    const maxDispatches = options.maxDispatches ?? LOOP_CAPABILITY_EXECUTION_POINTS.length * 8;
    if (
      typeof maxDispatches !== "number" || !Number.isSafeInteger(maxDispatches) || maxDispatches < 1
    ) {
      invalid("maxDispatches must be a positive safe integer");
    }
    const maxRegateRounds = options.maxRegateRounds ?? LOOP_CAPABILITY_EXECUTION_POINTS.length;
    if (
      typeof maxRegateRounds !== "number" || !Number.isSafeInteger(maxRegateRounds) || maxRegateRounds < 1
    ) {
      invalid("maxRegateRounds must be a positive safe integer");
    }
    let dispatches = 0;
    // C02-WP5 B1: an ACTIVE STARTED claim left by a crashed process is resumed
    // through the existing interrupted-attempt semantics — the recorded input
    // lineage is reused verbatim, the entry closes the stale claim as
    // ATTEMPT_INTERRUPTED (retryable) and immediately claims attempt N+1. No
    // confirmed fact is reinterpreted; concurrent resumers race on the store's
    // claim CAS and exactly one wins deterministically.
    if (
      recovery !== undefined &&
      recovery.capabilityChainStatus === "RUNNING" &&
      recovery.lastCapabilityExecution?.status === "started"
    ) {
      if (dispatches >= maxDispatches) {
        return Object.freeze({
          requirement_id: requirementId,
          run_id: recovery.snapshot.state.identity.runId,
          final_status: "failed" as const,
          chain_status: "RUNNING" as const,
          execution_trace: Object.freeze([]),
          next_execution_point: null,
          workspace_root: workspaceRoot,
          journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : null,
          completed_at: now(),
        });
      }
      dispatches += 1;
      const active = recovery.lastCapabilityExecution;
      journalRunId = active!.runId;
      const executed = await entry.execute({
        requirementId,
        capability: active!.capability,
        executionRole: active!.executionRole,
        inputArtifactRef: active!.inputArtifactRef,
        inputArtifactVersion: active!.inputArtifactVersion,
        inputDigest: active!.inputDigest,
        outputArtifactVersion: `${active!.attempt + 1}.0.0`,
        input: {},
      });
      recovery = executed.recoveryContext;
      if (recovery !== undefined && recovery.pendingRevisionMaterialization !== null) {
        while (recovery !== undefined && recovery.pendingRevisionMaterialization !== null) {
          materializeProducerRevision(
            runStore,
            requirementId,
            recovery.snapshot.state.identity.runId,
            recovery.pendingRevisionMaterialization.producerExecution,
            now,
          );
          recovery = recoverRunContext(runStore, requirementId);
        }
      }
      if (!executed.execution.success) {
        return Object.freeze({
          requirement_id: requirementId,
          run_id: journalRunId ?? identity.runId,
          final_status: "failed" as const,
          chain_status: recovery?.capabilityChainStatus ?? "RUNNING",
          execution_trace: Object.freeze(
            runStore.listCapabilityExecutions(journalRunId ?? identity.runId).map((event) => Object.freeze({
              capability: event.capability,
              executionRole: event.executionRole,
              agent: event.executorAgent,
              attempt: event.attempt,
              status: event.status,
              gateResult: event.gateResult,
              outputArtifactRef: event.outputArtifactRef,
              outputDigest: event.outputDigest,
            })),
          ),
          next_execution_point: recovery?.nextExecutionPoint ?? null,
          workspace_root: workspaceRoot,
          journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : null,
          completed_at: now(),
        });
      }
      if (executed.producerTerminalEventId !== null) {
        const produced = runStore.listCapabilityExecutions(journalRunId!)
          .find((item) => item.executionEventId === executed.producerTerminalEventId);
        if (produced !== undefined && produced.status === "succeeded") {
          materializeProducerRevision(runStore, requirementId, journalRunId!, produced, now);
        }
      }
      recovery = recoverRunContext(runStore, requirementId);
      next = recovery?.nextExecutionPoint ?? null;
      const cmd = recovery === undefined ? null : deriveDispatchCommand(recovery);
      inputRef = cmd?.inputArtifactRef ?? "";
      inputVersion = cmd?.inputArtifactVersion ?? "";
      inputDigest = cmd?.inputDigest ?? "";
      firstDispatch = false;
    }

    // WP4 (H4): a durably blocked run never re-dispatches — only an explicit
    // release decision (RISK_ACCEPTED / SCOPE_RESET) may clear the block.
    if ((options.runStore !== undefined || recovery?.blockingReasonCode !== null && recovery?.blockingReasonCode !== undefined)) {
      if (recovery?.blockingReasonCode !== null && recovery?.blockingReasonCode !== undefined) {
        return Object.freeze({
          requirement_id: requirementId,
          run_id: recovery.snapshot.state.identity.runId,
          final_status: "failed" as const,
          chain_status: "BLOCKED" as const,
          execution_trace: Object.freeze([]),
          next_execution_point: null,
          workspace_root: workspaceRoot,
          journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : null,
          completed_at: now(),
        });
      }
    }
    // C03-D d1/d2: carry the c1 guard's resolved depth out of the chain loop
    // so the d2 tail aggregation can persist the truthful depth (not a
    // hardcoded value) in the governance_tail_result artifact.
    let resolvedImplementationDepth: DesignDepth | null = null;
    while (next !== null) {
      // Round 3 review F2: a concurrent entry may have committed a succeeded
      // producer since the last recovery recompute — finalize its revision
      // materialization (zero agent dispatches) before adjudicating a permit.
      if (recovery !== undefined && recovery.pendingRevisionMaterialization !== null) {
        materializeProducerRevision(
          runStore,
          requirementId,
          recovery.snapshot.state.identity.runId,
          recovery.pendingRevisionMaterialization.producerExecution,
          now,
        );
        recovery = recoverRunContext(runStore, requirementId);
        next = recovery?.nextExecutionPoint ?? null;
        continue;
      }
      if (dispatches >= maxDispatches) {
        // Safety bound only: stop this invocation honestly WITHOUT persisting
        // a durable block — plain linear progress resumes on the next call.
        break;
      }
      dispatches += 1;
      // Round 2 close-out B3: the round budget is adjudicated BEFORE any
      // external work as a single-transaction execution permit. An over-budget
      // backward wave performs zero agent dispatches and zero revision writes;
      // the durable block is persisted inside the same permit transaction.
      if (journalRunId !== null) {
        const targetPointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
          (point) => point.capability === next!.capability && point.executionRole === next!.executionRole,
        );
        const permit = runStore.authorizeRegateDispatch(journalRunId, targetPointIndex, maxRegateRounds);
        if (!permit.allowed) {
          recovery = recoverRunContext(runStore, requirementId);
          break;
        }
      }
      if (!firstDispatch && recovery !== undefined) {
        const predecessor = LOOP_CAPABILITY_EXECUTION_POINTS[
          LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
            (point) => point.capability === next!.capability && point.executionRole === next!.executionRole,
          ) - 1
        ];
        const predecessorState = predecessor === undefined
          ? undefined
          : recovery.executionPointStates.find(
              (state) =>
                state.capability === predecessor.capability && state.executionRole === predecessor.executionRole,
            );
        if (predecessorState !== undefined) {
          inputRef = predecessorState.effectiveOutputArtifactRef ?? inputRef;
          inputVersion = predecessorState.effectiveOutputArtifactVersion ?? inputVersion;
          inputDigest = predecessorState.effectiveOutputDigest ?? inputDigest;
        }
      }
      // C03-D d1: development_path_entry guard (Decision-044 single-rail:
      // solution-gate depth verdict is the sole authority for entering
      // implementation). Invoked BEFORE dispatching the implementation node.
      let implementationDepth: DesignDepth | null = null;
      if (next.capability === "implementation" && journalRunId !== null) {
        const verdictEvents = runStore.listCapabilityExecutions(journalRunId)
          .filter((e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict");
        const lastVerdict = verdictEvents.length > 0 ? verdictEvents[verdictEvents.length - 1]! : null;
        const gateDecision = recovery?.solutionGateDecision ?? null;
        const verdict: SolutionGateVerdict = {
          gateResult: (lastVerdict?.gateResult as SolutionGateVerdict["gateResult"]) ?? "FAIL",
          depth: (lastVerdict?.decisionDepth as DesignDepth | null) ?? null,
          decisionStatus: gateDecision?.status ?? "BLOCKED_UNKNOWN",
          // C03-D d1: when the solution-gate has already DECIDED, there are no
          // gate-blocking findings — code-review findings that trigger a rebuild
          // must NOT block re-entry into implementation (that is the whole point
          // of a rebuild wave). Only BLOCKED_UNKNOWN carries blocking findings.
          blockingFindings: gateDecision?.status === "DECIDED" ? [] : (recovery?.findingGate.blockingFindingIds ?? []),
          riskAcceptanceRefs: (recovery?.openFindings ?? [])
            .filter((f) => (f as { status?: string }).status === "ACCEPTED_RISK")
            .map((f) => (f as { riskAcceptanceEvidenceRef?: string }).riskAcceptanceEvidenceRef ?? "")
            .filter(Boolean),
          verdictArtifactRef: gateDecision?.boundVerdictArtifactRef,
        };
        const entryDecision = developmentPathEntryGuard(verdict);
        if (!entryDecision.allowed) {
          return Object.freeze({
            requirement_id: requirementId,
            run_id: journalRunId,
            final_status: "failed" as const,
            chain_status: "BLOCKED" as const,
            blocking_reason_code: "DEVELOPMENT_PATH_ENTRY_DENIED" as const,
            execution_trace: Object.freeze(
              runStore.listCapabilityExecutions(journalRunId).map((event) => Object.freeze({
                capability: event.capability,
                executionRole: event.executionRole,
                agent: event.executorAgent,
                attempt: event.attempt,
                status: event.status,
                gateResult: event.gateResult,
                outputArtifactRef: event.outputArtifactRef,
                outputDigest: event.outputDigest,
              })),
            ),
            next_execution_point: null,
            workspace_root: workspaceRoot,
            journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : null,
            completed_at: now(),
          });
        }
        implementationDepth = entryDecision.depth;
        resolvedImplementationDepth = entryDecision.depth;
      }
      const executed = await entry.execute({
        requirementId,
        ...(firstDispatch ? { identity } : {}),
        capability: next.capability,
        executionRole: next.executionRole,
        inputArtifactRef: inputRef,
        inputArtifactVersion: inputVersion,
        inputDigest,
        // WP4: the output version is generation-scoped — attempt N of a point
        // produces semver N.0.0, so a rebuild never collides with a prior
        // generation's occupied semver.
        outputArtifactVersion: `${(recovery?.executionPointStates.find(
          (state) => state.capability === next!.capability && state.executionRole === next!.executionRole,
        )?.lastAttempt ?? 0) + 1}.0.0`,
        input: {
          inputArtifactRef: inputRef,
          ...(implementationDepth !== null ? { designDepth: implementationDepth } : {}),
        },
      });
      firstDispatch = false;
      journalRunId = executed.runId;
      recovery = executed.recoveryContext;
      if (executed.execution.success !== true) {
        break;
      }
      // WP4: bind the node product as an artifact revision authored by this
      // succeeded producer execution. Currents are the facts Re-Gate planning
      // (and finding source binding) consume; upstream chains to the reused or
      // rebuilt current of the previous node.
      // Round 3 review F2: the producer is the EXACT terminal event this
      // dispatch committed (returned by the gateway/entry), never the journal
      // tail — a concurrent entry could have advanced the tail meanwhile.
      if (executed.producerTerminalEventId !== null) {
        const produced = runStore.listCapabilityExecutions(journalRunId)
          .find((item) => item.executionEventId === executed.producerTerminalEventId);
        if (
          produced === undefined || produced.status !== "succeeded" ||
          produced.capability !== next.capability || produced.executionRole !== next.executionRole
        ) {
          throw new LoopRunJournalError(
            "STORE_CORRUPT",
            "the dispatched producer terminal event is missing from the run journal",
          );
        }
        materializeProducerRevision(runStore, requirementId, journalRunId, produced, now);
      }
      // WP4: recompute recovery AFTER the revision lands — the Re-Gate target
      // must reflect the fresh current, not the pre-append projection.
      recovery = recoverRunContext(runStore, requirementId);
      if (recovery === undefined) {
        break;
      }
      next = recovery.nextExecutionPoint;
    }

    const events = runStore.listCapabilityExecutions(journalRunId ?? identity.runId);
    let chainStatus = recovery?.capabilityChainStatus ?? "BLOCKED";
    // WP4 convergence (H2): linear completion is not done. The run finishes
    // successfully only when the finding gate is ELIGIBLE and the depth
    // decision is DECIDED; otherwise it blocks honestly.
    const findingGate = recovery?.findingGate ?? { status: "ELIGIBLE" as const, blockingFindingIds: [] };
    const decision = recovery?.solutionGateDecision ?? null;
    const completedOk =
      chainStatus === "COMPLETED" &&
      findingGate.status === "ELIGIBLE" &&
      decision !== null && decision.status === "DECIDED";
    if (chainStatus === "COMPLETED" && !completedOk) {
      chainStatus = "BLOCKED";
    }
    if (recovery !== undefined && recovery.blockingReasonCode !== null) {
      // WP4 H4: durable block (e.g., REGATE_ROUND_BUDGET_EXHAUSTED) always
      // reports BLOCKED regardless of the capability projection.
      chainStatus = "BLOCKED";
    }
    const finalStatus = completedOk ? "success" : "failed";

    // C03-D d2: c2/c3 delivery tail integration — when the chain completes
    // successfully, build the documentation governance tail completion check
    // (c2) and the manual handoff checklist (c3), persist the checklist to
    // the artifact store, and expose the status in the RuntimeResult.
    let manualHandoffStatus: ManualHandoffChecklist["status"] | null = null;
    let manualHandoffReason: string | null = null;
    let manualHandoffArtifactRef: string | null = null;
    if (completedOk && journalRunId !== null) {
      // Build per-node evidence from the execution journal.
      const nodeIds: NodeCapabilityId[] = [
        "requirement-intake", "solution-design", "solution-gate",
        "task-planning", "implementation", "code-review", "knowledge-sync",
      ];
      const evidence: NodeEvidenceStatus[] = nodeIds.map((cap) => {
        const nodeEvents = events.filter((e) => e.capability === cap && e.status === "succeeded");
        const last = nodeEvents.length > 0 ? nodeEvents[nodeEvents.length - 1]! : null;
        const artifact = recovery?.currentArtifactMap.find((a) => a.nodeId === cap) ?? null;
        return {
          capability: cap,
          artifactPresent: last !== null || artifact !== null,
          artifactRef: last?.outputArtifactRef ?? artifact?.artifactRef ?? null,
          version: last?.outputArtifactVersion ?? artifact?.semver ?? null,
          gateMet: last?.gateResult === "PASS" || last?.gateResult === "PASS_WITH_RISK" ? true : last?.gateResult === "FAIL" ? false : null,
          notes: last !== null ? `succeeded attempt ${last.attempt}` : "no succeeded execution",
        };
      });

      // c2: documentation governance tail completion check.
      const tailStatus = checkDocumentationGovernanceTailCompletion(evidence);

      // c3: manual handoff checklist aggregation.
      const implEvent = events.find((e) => e.capability === "implementation" && e.status === "succeeded") ?? null;
      const reviewEvent = events.find((e) => e.capability === "code-review" && e.status === "succeeded") ?? null;
      const syncEvent = events.find((e) => e.capability === "knowledge-sync" && e.status === "succeeded") ?? null;
      const residualRisks = (recovery?.openFindings ?? [])
        .filter((f) => (f as { status?: string }).status === "OPEN")
        .map((f, i) => ({
          id: `risk-${i}`,
          description: (f as { description?: string }).description ?? "open finding",
          severity: "medium" as const,
          acceptanceRef: null,
        }));
      const checklist = buildManualHandoffChecklist({
        runId: journalRunId,
        requirementId,
        generation: recovery?.generation ?? 1,
        implementationRecord: {
          present: implEvent !== null,
          artifactRef: implEvent?.outputArtifactRef ?? null,
          summary: implEvent !== null ? `implementation succeeded attempt ${implEvent.attempt}` : "implementation not executed",
          unexecutedItems: [],
        },
        codeReview: {
          present: reviewEvent !== null,
          artifactRef: reviewEvent?.outputArtifactRef ?? null,
          summary: reviewEvent !== null ? `code review succeeded attempt ${reviewEvent.attempt}` : "code review not executed",
          openFindings: [],
          closureReviewDone: reviewEvent?.gateResult === "PASS" || reviewEvent?.gateResult === "PASS_WITH_RISK",
        },
        knowledgeSync: {
          present: syncEvent !== null,
          artifactRef: syncEvent?.outputArtifactRef ?? null,
          // C03-D R1-F3: the execution event model does not carry a knowledge-sync
          // decision (NO_CHANGE/APPLY_LOCAL/PROPOSAL_ONLY/BLOCKED_CONFLICT); that
          // semantic lives in the node's output artifact content. Persisting a
          // hardcoded "APPLY_LOCAL" would fabricate an audit fact. Use null until
          // the event model is extended to materialize the decision.
          decision: null,
          summary: syncEvent !== null ? `knowledge sync succeeded attempt ${syncEvent.attempt}` : "knowledge sync not executed",
        },
        residualRisks,
        recoveryInstructions: "Resume from the last succeeded node; re-run failed nodes with the same requirementId.",
        evidenceDigest: null,
        tailStatus,
        // C03-D R1-F3: derive pathEntry.depth from the c1 guard's actual verdict
        // (resolvedImplementationDepth), not a hardcoded value.
        pathEntry: resolvedImplementationDepth !== null
          ? { allowed: true as const, reason: "c1 guard passed at implementation dispatch", depth: resolvedImplementationDepth }
          : { allowed: false as const, reason: "no formal_verdict event with materialized depth found", blockingFindings: [] as string[] },
      });

      manualHandoffStatus = checklist.status;
      manualHandoffReason = checklist.reason;

      // Persist the checklist to the artifact store.
      try {
        const stored = artifactStore.put("governance_tail_result", JSON.stringify(checklist) + "\n");
        manualHandoffArtifactRef = stored.artifactRef;
      } catch {
        // Persistence failure is non-fatal: the checklist is still in-memory
        // and exposed via RuntimeResult. The caller may retry persistence.
        manualHandoffArtifactRef = null;
      }
    }

    return Object.freeze({
      requirement_id: requirementId,
      run_id: journalRunId ?? identity.runId,
      final_status: finalStatus,
      chain_status: chainStatus,
      execution_trace: Object.freeze(events.map((event) => Object.freeze({
        capability: event.capability,
        executionRole: event.executionRole,
        agent: event.executorAgent,
        attempt: event.attempt,
        status: event.status,
        gateResult: event.gateResult,
        outputArtifactRef: event.outputArtifactRef,
        outputDigest: event.outputDigest,
      }))),
      next_execution_point: recovery?.nextExecutionPoint ?? null,
      workspace_root: workspaceRoot,
      journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : null,
      completed_at: now(),
      manual_handoff_status: manualHandoffStatus,
      manual_handoff_reason: manualHandoffReason,
      manual_handoff_artifact_ref: manualHandoffArtifactRef,
    });
  });
}
