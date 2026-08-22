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
  CAPABILITY_ARTIFACT_TYPES,
  getEnabledBinding,
  INITIAL_BINDING_REGISTRY,
  replaceBinding,
  type BindingRegistry,
} from "./core/agent-capability-bindings";
import type { LoopCapabilityExecutionEvent } from "./core/loop-capability-execution";
import { LoopCapabilityEntry } from "./core/loop-capability-entry";
import { LoopArtifactStore, type LoopArtifactKind } from "./core/loop-artifact-store";
import {
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
  createLoopArtifactRevision,
} from "./core/loop-artifact-revision";
import { recoverRunContext } from "./core/loop-recovery";
import { LoopRunStore } from "./core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "./core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "./loop/types";
import type { AgentName, ExecutionRequest, ExecutionResult } from "./execution/types";

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
  execution_trace: readonly RuntimeChainEntry[];
  next_execution_point: { capability: NodeCapabilityId; executionRole: CapabilityExecutionRole } | null;
  workspace_root: string;
  /** Set only when the runtime created the store; null when stores are injected. */
  journal_path: string | null;
  completed_at: string;
}

/** Anything the runtime executes must go through this minimal gateway shape. */
export interface RuntimeCapabilityGateway {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
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

// ─── Deterministic shadow capability gateway ──────────
// The default dispatch surface: resolves the enabled binding per execution
// point from the registry (so the solution-gate dual-agent separation comes
// from the registry, not from the request), persists the started/terminal
// capability events through the run journal and stores the node product (plus
// the scan round's immutable Finding Ledger) in the artifact store. Real
// dispatch (codex real runner) is injected via options.gateway; production
// entry wiring is a separately authorized work package (WP5).

const SHADOW_EXECUTOR_VERSIONS: Readonly<Record<AgentName, string>> = Object.freeze({
  codex: "1.0.0",
  kimi: "1.0.0",
  hermes: "1.0.0",
});

export function createDeterministicCapabilityGateway(options: {
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  bindingRegistry: BindingRegistry;
  now: () => string;
}): RuntimeCapabilityGateway {
  const { runStore, artifactStore, bindingRegistry, now } = options;
  return Object.freeze({
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const context = request.loopExecution;
      if (context === undefined) {
        invalid("capability dispatch requires a loopExecution tracing context");
      }
      // Closed dispatch contract: node must repeat the canonical capability
      // exactly. A canonical type paired with a retired or arbitrary node name
      // is a legacy/malformed dispatch and is rejected BEFORE any journal
      // write — never silently canonicalized.
      if (request.node !== request.type) {
        invalid(
          `dispatch node "${String(request.node)}" must equal the canonical capability ` +
            `"${String(request.type)}"; mismatched or legacy node names are rejected`,
        );
      }
      const capability = request.type as NodeCapabilityId;
      if (!NODE_CAPABILITY_IDS.includes(capability)) {
        invalid(`"${String(request.type)}" is not a v2 chain capability; the legacy node set is retired`);
      }
      const executionRole = context.executionRole as CapabilityExecutionRole;
      const binding = getEnabledBinding(bindingRegistry, capability, executionRole);
      const agent = binding.agent;
      const existing = runStore.listCapabilityExecutions(context.runId);
      const sequence = existing.length + 1;
      const consumedRef = typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null;
      const consumedDigest =
        typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null;
      const base = {
        schemaVersion: 3 as const,
        runId: context.runId,
        capability,
        executionRole,
        nodeId: capability,
        attempt: context.attempt,
        bindingId: binding.bindingId,
        bindingVersion: binding.bindingVersion,
        bindingRegistryVersion: bindingRegistry.version,
        executorAgent: agent,
        executorAdapter: binding.adapter,
        executorVersion: SHADOW_EXECUTOR_VERSIONS[agent],
        inputArtifactRef: context.inputArtifactRef,
        inputArtifactVersion: context.inputArtifactVersion,
        inputDigest: context.inputDigest,
        consumedFindingsRef: consumedRef,
        consumedFindingsDigest: consumedDigest,
      };
      runStore.appendCapabilityExecution(Object.freeze({
        ...base,
        executionEventId: `${context.runId}:capability:${sequence}:started`,
        sequence,
        status: "started" as const,
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
      }));
      const product = artifactStore.put(
        CAPABILITY_ARTIFACT_TYPES[capability] as LoopArtifactKind,
        `runtime shadow product for ${capability}/${executionRole} attempt ${context.attempt}`,
      );
      const isScanRound = capability === "solution-gate" && executionRole === "adversarial_scan";
      const ledger = isScanRound
        ? artifactStore.put("capability_findings", `[] shadow ledger for ${capability} attempt ${context.attempt}`)
        : null;
      const gateResult = capability === "solution-gate" && executionRole === "formal_verdict"
        ? ("PASS" as const)
        : ("NOT_APPLICABLE" as const);
      runStore.appendCapabilityExecution(Object.freeze({
        ...base,
        executionEventId: `${context.runId}:capability:${sequence + 1}:succeeded`,
        sequence: sequence + 1,
        status: "succeeded" as const,
        createdAt: now(),
        outputArtifactRef: product.artifactRef,
        outputArtifactVersion: context.outputArtifactVersion,
        outputDigest: product.digest,
        gateResult,
        unresolvedFindingsRef: ledger?.artifactRef ?? null,
        unresolvedFindingsDigest: ledger?.digest ?? null,
        nextStepEligibility: "ELIGIBLE" as const,
        errorCode: null,
        retryable: null,
        reasonCode: null,
      }));
      return Object.freeze({
        success: true,
        node: capability,
        agent,
        output: Object.freeze({
          result: "SUCCESS",
          capability,
          executionRole,
          gate_result: gateResult,
          artifact_ref: product.artifactRef,
        }),
        artifacts: Object.freeze([]),
      });
    },
  });
}

// ─── Default dual-agent registry ──────────────────────
// The initial registry enables codex for every execution point, which would
// collide with the v2 rule that one solution-gate round's adversarial_scan
// and formal_verdict are executed by different agents. The runtime default
// moves the formal_verdict slot to hermes; callers may inject any registry
// that keeps the two gate roles on different enabled agents.

export function createRuntimeBindingRegistry(): BindingRegistry {
  return replaceBinding(
    INITIAL_BINDING_REGISTRY,
    "binding-codex-solution-gate-formal_verdict",
    "binding-hermes-solution-gate-formal_verdict",
  ).registry;
}

// ─── MAIN RUNTIME — v2 SINGLE-RAIL CHAIN RUNNER ───────

export async function run(
  requirement: string,
  options: RuntimeOptions = {}
): Promise<RuntimeResult> {
  if (typeof requirement !== "string" || requirement.trim().length === 0) {
    invalid("requirement must be a non-empty string");
  }
  validateRuntimeOptions(options);
  const requirementId = requireSafeId(options.requirementId ?? `REQ-${Date.now()}`, "requirementId");

  const workspaceRoot = options.workspaceRoot ?? mkdtempSync(join(tmpdir(), "sdlc-runtime-v2-"));
  mkdirSync(join(workspaceRoot, "repo"), { recursive: true });
  if ((options.runStore === undefined) !== (options.artifactStore === undefined)) {
    invalid("runStore and artifactStore must be injected together");
  }
  const runStore = options.runStore ?? new LoopRunStore(join(workspaceRoot, "journal.db"));
  const artifactStore =
    options.artifactStore ??
    new LoopArtifactStore({
      controlRoot: join(workspaceRoot, "control"),
      repositoryPath: join(workspaceRoot, "repo"),
    });
  if (options.runStore === undefined) {
    runStore.init();
    artifactStore.init();
  }

  const bindingRegistry = options.bindingRegistry ?? createRuntimeBindingRegistry();
  const now = (): string => new Date().toISOString();
  const gateway =
    options.gateway ??
    createDeterministicCapabilityGateway({ runStore, artifactStore, bindingRegistry, now });
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry,
    gateway,
    now,
  });

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

  // The chain's first input is the normalized Requirement source artifact.
  const source = artifactStore.put("requirement_summary", requirement);
  let inputRef = source.artifactRef;
  let inputVersion = "1.0.0";
  let inputDigest = source.digest;

  let recovery = recoverRunContext(runStore, requirementId);
  let firstDispatch = recovery === undefined;
  // null nextExecutionPoint on an existing run means the chain is completed
  // or blocked — it must NOT be coerced back to the first point.
  let next = recovery === undefined ? LOOP_CAPABILITY_EXECUTION_POINTS[0]! : recovery.nextExecutionPoint;
  let journalRunId = recovery?.snapshot.state.identity.runId ?? null;
  // WP4: Re-Gate generations can legally re-dispatch earlier points; the
  // bound keeps a pathological finding/rebuild cycle from running forever
  // (bounded retry semantics carried over from C01).
  const maxDispatches = LOOP_CAPABILITY_EXECUTION_POINTS.length * 8;
  let dispatches = 0;
  while (next !== null) {
    if (dispatches >= maxDispatches) {
      break;
    }
    dispatches += 1;
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
      input: { inputArtifactRef: inputRef },
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
    const produced = runStore.listCapabilityExecutions(journalRunId).at(-1);
    // The adversarial_scan round's product is its Finding Ledger (already
    // persisted by the gateway), not the node artifact — only the
    // formal_verdict round may author the solution-gate node revision.
    const isScanRound =
      produced !== undefined &&
      produced.capability === "solution-gate" &&
      produced.executionRole === "adversarial_scan";
    if (
      produced !== undefined && produced.status === "succeeded" &&
      !isScanRound &&
      produced.capability === next.capability && produced.executionRole === next.executionRole &&
      produced.outputArtifactRef !== null && produced.outputDigest !== null
    ) {
      const priorForNode = runStore.listArtifactRevisions(journalRunId)
        .filter((item) => item.nodeId === next.capability);
      const nodeIdx = NODE_CAPABILITY_IDS.indexOf(next.capability);
      const upstreamNodeId = nodeIdx > 0 ? NODE_CAPABILITY_IDS[nodeIdx - 1]! : null;
      const upstreamCurrent = upstreamNodeId === null
        ? undefined
        : runStore.getCurrentArtifactRevision(journalRunId, upstreamNodeId);
      runStore.appendArtifactRevision(createLoopArtifactRevision({
        runId: journalRunId,
        requirementId,
        nodeId: next.capability,
        sequence: priorForNode.length + 1,
        generation: produced.attempt,
        stablePath: `library/${requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[next.capability].stablePathSegment}/${requirementId}_${next.capability}.md`,
        artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[next.capability].artifactKind,
        semver: `${produced.attempt}.0.0`,
        artifactRef: produced.outputArtifactRef,
        digest: produced.outputDigest,
        producerExecutionId: produced.executionEventId,
        producerExecutionRole: produced.executionRole,
        gateResult: produced.gateResult,
        upstreamRevisionIds: upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
        createdAt: now(),
      }));
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
  const chainStatus = recovery?.capabilityChainStatus ?? "BLOCKED";
  const finalStatus = chainStatus === "COMPLETED" ? "success" : "failed";
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
  });
}
