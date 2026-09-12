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

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

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
import {
  projectLoopManifest,
  type LoopManifestProjectionOutcome,
  type LoopManifestProjectionStopCode,
} from "./core/loop-manifest-projector";
import { LoopRunJournalError, type LoopRunIdentity } from "./core/loop-executor-types";
import { validateLoopRunIdentity } from "./core/loop-run-state";
import {
  PRODUCTION_ENTRY_SCHEMA,
  type ParsedProductionEntry,
} from "./core/loop-production-entry";
import type { LoopGitWorkspaceSnapshot } from "./core/loop-git-workspace";
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
   * G5-T4 (Δ3): the requirement library directory holding `manifest.md`
   * (`library/{requirementId}`). When set, the run performs the entry
   * readiness preflight and keeps the manifest in step with the journal at
   * every node terminal. Absent by default so the non-production path and
   * every existing caller stay byte-for-byte unchanged.
   */
  manifestLibraryDir?: string;
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
   * Production ONLY (W3 / E1-T4): a journal-validated identity minted by
   * parseProductionEntryRequest and supplied through runProduction(). When
   * absent, run() is the non-production / test entry and mints a local
   * placeholder identity (unchanged behaviour).
   */
  productionIdentity?: LoopRunIdentity;
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
  "manifestLibraryDir",
  "productionIdentity",
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
  // G4-R5-H5: this producer's OWN finding registration may have invalidated
  // its upstream current in the same terminal transaction (a code-review
  // REGRESSION finding stales the implementation product it examined). The
  // append-time upstream rule admits only ACTIVE upstreams, but the
  // pending-revision window must still clear — so the revision materializes
  // with its upstream lineage cut (empty upstreams, schema-legal): the
  // invalidation edges on the finding record exactly why, and the rebuild
  // wave authors the lineage-restoring current.
  let upstreamCurrent: ReturnType<LoopRunStore["getCurrentArtifactRevision"]>;
  let upstreamInvalidated = false;
  try {
    upstreamCurrent = upstreamNodeId === null
      ? undefined
      : runStore.getCurrentArtifactRevision(runId, upstreamNodeId);
  } catch (error) {
    if (
      error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT" &&
      upstreamNodeId !== null
    ) {
      const pointer = runStore.listArtifactRevisions(runId)
        .filter((item) => item.nodeId === upstreamNodeId)
        .sort((a, b) => b.sequence - a.sequence)[0];
      if (pointer !== undefined && pointer.validity === "STALE") {
        upstreamInvalidated = true;
        upstreamCurrent = undefined;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
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
      upstreamRevisionIds: upstreamInvalidated
        ? []
        : upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
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

// ─── G5-T3 (Δ2): manifest projection failure-code exit wiring ─────────
// Freeze §5 / contract §7.2: the three projection failure exits enter the
// runtime run exit verbatim — `MANIFEST_CORRUPT_STOP` (level-1 corrupt),
// `JOURNAL_MANIFEST_MISMATCH_STOP` (level-2 true divergence) and
// `BLOCKED_AMBIGUOUS` (structural ambiguity, §6.2.7 legacy reuse). A lawful
// level-3 pending projection (journal tail + finding lifecycle delta) is run
// progress, never an exit: catch-up publishes idempotently (NO_OP /
// PUBLISHED / DEFERRED all continue). The exit offers no repair and no
// rebuild (DP4) — trust reconstruction is the §6.2.6 repair path, judged by
// the crash-recovery re-entry, not by this routing.

export const LOOP_MANIFEST_EXIT_STOP_CODES: readonly LoopManifestProjectionStopCode[] = Object.freeze([
  "MANIFEST_CORRUPT_STOP",
  "JOURNAL_MANIFEST_MISMATCH_STOP",
  "BLOCKED_AMBIGUOUS",
]);

/** Single routing point from a projection outcome to the run exit decision. */
export type ManifestProjectionRouting =
  | Readonly<{ blocksRun: false }>
  | Readonly<{ blocksRun: true; code: LoopManifestProjectionStopCode; reason: string }>;

export function routeManifestProjectionOutcome(
  outcome: LoopManifestProjectionOutcome,
): ManifestProjectionRouting {
  switch (outcome.kind) {
    case "NO_OP":
    case "PUBLISHED":
    case "DEFERRED":
      return Object.freeze({ blocksRun: false as const });
    case "STOP":
      return Object.freeze({ blocksRun: true as const, code: outcome.code, reason: outcome.reason });
  }
}

/** Everything the canonical manifest-stop exit needs from the call site. */
export interface ManifestProjectionExitContext {
  readonly requirement_id: string;
  readonly run_id: string;
  readonly execution_trace: readonly RuntimeChainEntry[];
  readonly workspace_root: string;
  readonly journal_path: string | null;
  readonly completed_at: string;
}

/**
 * The one canonical failed RuntimeResult for a manifest projection stop —
 * same shape as every other blocked exit (final_status failed, chain_status
 * BLOCKED, exact §7.2 code, no next execution point: a corrupt/diverged
 * manifest must never hand the run a re-entry target).
 */
export function manifestProjectionBlockedResult(
  context: ManifestProjectionExitContext,
  stop: Readonly<{ code: LoopManifestProjectionStopCode; reason: string }>,
): RuntimeResult {
  if (!(LOOP_MANIFEST_EXIT_STOP_CODES as readonly string[]).includes(stop.code)) {
    throw new Error(`non-manifest stop code ${stop.code} cannot enter the manifest projection exit`);
  }
  return Object.freeze({
    requirement_id: context.requirement_id,
    run_id: context.run_id,
    final_status: "failed" as const,
    chain_status: "BLOCKED" as const,
    blocking_reason_code: stop.code,
    execution_trace: Object.freeze(context.execution_trace.map((entry) => Object.freeze({ ...entry }))),
    next_execution_point: null,
    workspace_root: context.workspace_root,
    journal_path: context.journal_path,
    completed_at: context.completed_at,
  });
}

// ─── G5-T4 (Δ3): entry readiness preflight + terminal projection ──────
// The manifest is the requirement library's self-证明 artifact (contract
// §6.2). The runtime face keeps it in step with the journal, and the three
// entry states are distinct (Δ3 / §6.2.7 / DP4):
//
//   FRESH              — no library directory yet; a brand-new requirement.
//                        requirement-intake owns creation, so the runtime
//                        projects nothing and never mints a manifest here.
//   LEGACY_NO_MANIFEST — the directory exists without a manifest: a legacy
//                        read-only archive source. `BLOCKED_AMBIGUOUS`,
//                        never rebuilt and never repaired into shape.
//   MANIFEST_PRESENT   — the §6.2.2 three-tier judgement decides: level-1
//                        corrupt / level-2 divergence are stops, a lawful
//                        level-3 pending delta is catch-up publication.
//
// A path that exists but is not a directory is NOT "fresh" — it is an
// unreadable shape, so it takes the fail-closed legacy exit instead of
// letting a run proceed over an object it cannot interpret.

export type ManifestReadiness =
  | Readonly<{ kind: "FRESH" }>
  | Readonly<{ kind: "LEGACY_NO_MANIFEST"; libraryDir: string }>
  | Readonly<{ kind: "MANIFEST_PRESENT"; libraryDir: string }>;

export function resolveManifestReadiness(libraryDir: string): ManifestReadiness {
  let dirStat: import("node:fs").Stats | null = null;
  try {
    dirStat = statSync(libraryDir);
  } catch {
    return Object.freeze({ kind: "FRESH" as const });
  }
  if (!dirStat.isDirectory()) {
    return Object.freeze({ kind: "LEGACY_NO_MANIFEST" as const, libraryDir });
  }
  try {
    if (statSync(join(libraryDir, "manifest.md")).isFile()) {
      return Object.freeze({ kind: "MANIFEST_PRESENT" as const, libraryDir });
    }
  } catch {
    // A missing/unreadable manifest inside an existing directory is the
    // legacy-archive state, not a fresh requirement.
  }
  return Object.freeze({ kind: "LEGACY_NO_MANIFEST" as const, libraryDir });
}

/**
 * Durably records a manifest projection stop before the run exits (T3-R1
 * S-2). The `run_blocked` event carries the §7.2 code in `reasonCode` — the
 * journal fact that survives the return value — and the projector's
 * human-readable reason is persisted as a digest-bound artifact so the audit
 * trail never lives only in the caller's memory. A detail-artifact write that
 * fails must not degrade the durable block into an unrecorded stop, so the
 * event is appended regardless; the run stays fail-closed either way.
 */
function appendManifestProjectionBlockEvent(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  runId: string,
  stop: Readonly<{ code: LoopManifestProjectionStopCode; reason: string }>,
): void {
  let detailRef: string | null = null;
  let detailDigest: string | null = null;
  try {
    const stored = artifactStore.put(
      "human_action_required",
      JSON.stringify({
        schema: "loop-manifest-projection-stop:v1",
        code: stop.code,
        reason: stop.reason,
      }) + "\n",
    );
    detailRef = stored.artifactRef;
    detailDigest = stored.digest;
  } catch {
    // The block event below is the fail-closed anchor.
  }
  const snapshot = runStore.getSnapshot(runId);
  if (snapshot === undefined) return;
  // Idempotence: the durable fact is already there when the run is blocked
  // for the same code. A re-entry that re-judges the same stop must not append
  // a second identical block event (the journal grows only on new facts).
  if (snapshot.state.blockingReasonCode === stop.code) return;
  const sequence = snapshot.state.lastSequence + 1;
  runStore.appendEvent(Object.freeze({
    eventId: `${runId}:${sequence}:run_blocked`,
    runId,
    sequence,
    kind: "run_blocked" as const,
    stage: null,
    attempt: 0,
    createdAt: new Date().toISOString(),
    inputDigest: null,
    outputArtifactRef: detailRef,
    outputDigest: detailDigest,
    errorCode: null,
    retryable: null,
    reasonCode: stop.code,
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  }));
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
  // Only the self-built (non-production) path needs a scratch repo dir; when
  // stores are injected (production / tests) their repository paths are real.
  if (options.runStore === undefined) {
    mkdirSync(join(workspaceRoot, "repo"), { recursive: true });
  }
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
  // C02-WP5 B1-1: cross-process resume lease — exactly one executor may run
  // the recovery→claim→external-execution→terminal cycle for this journal at
  // any time. Same-process nested invocations (F2 window barriers) reuse the
  // held lease via AsyncLocalStorage; independent invocations queue on the
  // companion database or fail honestly with STORE_BUSY.
  const resumeJournalPath = options.runStore !== undefined
    ? options.runStore.databaseFilePath
    : join(workspaceRoot, "journal.db");
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry,
    gateway,
    now,
    // E4-T3: the runtime entry owns the lease, so it arms the dispatch-window
    // firewall. Any future path that reaches this entry without holding the
    // lease now fails closed instead of claiming and spawning unguarded.
    requireResumeLeaseJournal: resumeJournalPath,
  });
  return withResumeLease(resumeJournalPath, async (): Promise<RuntimeResult> => {
    const localIdentity: LoopRunIdentity = Object.freeze({
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
    const identity: LoopRunIdentity = options.productionIdentity ?? localIdentity;
    if (options.productionIdentity !== undefined) {
      // Production door (W3 / E1-T4): re-validate through the journal authority
      // and pin consistency. The non-production local-identity path is untouched.
      validateLoopRunIdentity(identity);
      if (identity.requirementId !== requirementId) {
        invalid("productionIdentity.requirementId must match the run requirementId");
      }
      if (identity.expectedBaseSha === "0".repeat(40)) {
        invalid("production identity must carry a real expectedBaseSha, not the local placeholder");
      }
    }

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

    // G5-T4 (Δ3) readiness preflight — BEFORE any dispatch and BEFORE the
    // durable-block short circuit below, so a repaired-manifest re-entry is
    // re-judged rather than reported as an opaque BLOCKED. The projection
    // precondition (D-9) holds here: every pending revision materialization
    // was drained above, so the projector never runs against a pending
    // producer. A fresh requirement projects nothing (requirement-intake
    // owns creation); a legacy directory without a manifest is
    // BLOCKED_AMBIGUOUS and is never rebuilt. Re-entry re-judges the same
    // three states, so crash recovery converges without a second rule.
    const manifestLibraryDir = options.manifestLibraryDir;
    const manifestBlockedExit = (
      stop: Readonly<{ code: LoopManifestProjectionStopCode; reason: string }>,
    ): RuntimeResult => {
      const snapshot = runStore.findLatestRunByRequirement(requirementId);
      const blockRunId = snapshot?.state.identity.runId ?? journalRunId ?? identity.runId;
      try {
        appendManifestProjectionBlockEvent(runStore, artifactStore, blockRunId, stop);
      } catch {
        // The exit below is the fail-closed outcome regardless: a journal
        // that cannot take the block event must not turn a manifest stop
        // into a run that proceeds.
      }
      return manifestProjectionBlockedResult(
        {
          requirement_id: requirementId,
          run_id: blockRunId,
          execution_trace: runStore.listCapabilityExecutions(blockRunId).map((event) => Object.freeze({
            capability: event.capability,
            executionRole: event.executionRole,
            agent: event.executorAgent,
            attempt: event.attempt,
            status: event.status,
            gateResult: event.gateResult,
            outputArtifactRef: event.outputArtifactRef,
            outputDigest: event.outputDigest,
          })),
          workspace_root: workspaceRoot,
          journal_path: options.runStore === undefined
            ? join(workspaceRoot, "journal.db")
            : runStore.databaseFilePath,
          completed_at: now(),
        },
        stop,
      );
    };
    if (manifestLibraryDir !== undefined) {
      const readiness = resolveManifestReadiness(manifestLibraryDir);
      if (readiness.kind === "LEGACY_NO_MANIFEST") {
        return manifestBlockedExit({
          code: "BLOCKED_AMBIGUOUS",
          reason: `library directory ${manifestLibraryDir} exists without a manifest.md; ` +
            "legacy archive sources are never rebuilt (§6.2.7 / DP4)",
        });
      }
      if (readiness.kind === "MANIFEST_PRESENT") {
        const projected = projectLoopManifest({
          store: runStore,
          runId: journalRunId ?? identity.runId,
          requirementId,
          libraryDir: readiness.libraryDir,
          // A takeover acceptance is the entry decision itself; the run's
          // creation instant is that moment (freeze §8.0 accepted_at).
          takeoverAcceptedAt: identity.createdAt,
        });
        const routed = routeManifestProjectionOutcome(projected);
        if (routed.blocksRun) {
          return manifestBlockedExit({ code: routed.code, reason: routed.reason });
        }
      }
    }
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
    // G4-R7-B5 (§7.3 A2): read the latest ruling's PWR risk provenance from
    // its persisted, digest-verified decision delta. Returns null when there
    // is no verdict, no delta, a non-v1 delta, or EMPTY refs — provenance is
    // only ever REAL facts, never a placeholder.
    const readPwrProvenance = (): {
      riskAcceptanceRefs: readonly string[];
      decisionDeltaRef: string;
      decisionDeltaDigest: string;
    } | null => {
      if (journalRunId === null) return null;
      const verdictEvents = runStore.listCapabilityExecutions(journalRunId)
        .filter((e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict" && e.status === "succeeded");
      const lastVerdict = verdictEvents[verdictEvents.length - 1] ?? null;
      if (lastVerdict === null || lastVerdict.decisionDeltaRef === null || lastVerdict.decisionDeltaDigest === null) {
        return null;
      }
      try {
        const blob = artifactStore.read(lastVerdict.decisionDeltaRef, lastVerdict.decisionDeltaDigest);
        const delta = JSON.parse(blob.toString("utf8")) as { schema?: unknown; riskAcceptanceRefs?: unknown };
        if (delta.schema !== "loop-decision-delta:v1" || !Array.isArray(delta.riskAcceptanceRefs)) return null;
        const refs = (delta.riskAcceptanceRefs as unknown[]).filter(
          (ref): ref is string => typeof ref === "string" && ref.length > 0,
        );
        if (refs.length === 0) return null;
        return {
          riskAcceptanceRefs: refs,
          decisionDeltaRef: lastVerdict.decisionDeltaRef!,
          decisionDeltaDigest: lastVerdict.decisionDeltaDigest!,
        };
      } catch {
        return null;
      }
    };
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
          journal_path: options.runStore === undefined
            ? join(workspaceRoot, "journal.db")
            : options.runStore.databaseFilePath,
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
          journal_path: options.runStore === undefined
            ? join(workspaceRoot, "journal.db")
            : options.runStore.databaseFilePath,
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
      // G5-T4 (Δ3) terminal→projector call point: the node terminal just
      // landed and its revision materialized, so the D-9 precondition holds
      // and the manifest catches up with the journal (idempotent by
      // construction — a replay converges to no-op). A stop here is a stop
      // for the run: the same blocksRun routing and the same durable block
      // event as the entry preflight, never a second exit rule.
      if (manifestLibraryDir !== undefined) {
        const projectedAfterTerminal = projectLoopManifest({
          store: runStore,
          runId: journalRunId ?? identity.runId,
          requirementId,
          libraryDir: manifestLibraryDir,
          takeoverAcceptedAt: identity.createdAt,
        });
        const routedAfterTerminal = routeManifestProjectionOutcome(projectedAfterTerminal);
        if (routedAfterTerminal.blocksRun) {
          return manifestBlockedExit({
            code: routedAfterTerminal.code,
            reason: routedAfterTerminal.reason,
          });
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
          journal_path: options.runStore === undefined
            ? join(workspaceRoot, "journal.db")
            : options.runStore.databaseFilePath,
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
      // G4-R5-H2 (frozen contract §7.3 A1): dispatching task-planning is an
      // ADMITTED transition — the verdict's §4.3 ruling must be CONFIRMED
      // with an admitting Gate Result (recovery projects DECIDED) and no
      // OPEN finding whose §5.2 blocking scope covers task-planning (problem
      // layers at or upstream of planning). ESCALATED and BLOCKED_UNKNOWN
      // verdicts never satisfy A1 even when the literal Gate Result reads
      // PASS/PWR. The refusal is an honest BLOCKED stop (§7 ADMISSION_DENIED),
      // not an exception that escapes the run.
      if (next.capability === "task-planning" && journalRunId !== null && recovery !== undefined) {
        const planningNodeIdx = NODE_CAPABILITY_IDS.indexOf("task-planning");
        // G4-R7-B4: the A1 blocking scope follows §5.2 — an OPEN finding
        // blocks the ADMISSION of its earliest node's DOWNSTREAM products,
        // while the earliest node itself is the rework target that must run
        // to produce the repair evidence. A finding whose earliest node IS
        // task-planning therefore must not block the planning re-run; only
        // strictly-upstream findings (whose scope covers planning as a
        // downstream product) block it.
        const blockingOpenFindings = recovery.openFindings.filter(
          (finding) =>
            (NODE_CAPABILITY_IDS as readonly string[]).indexOf(finding.earliestAffectedNodeId) <
            planningNodeIdx,
        );
        if (recovery.solutionGateDecision?.status !== "DECIDED" || blockingOpenFindings.length > 0) {
          return Object.freeze({
            requirement_id: requirementId,
            run_id: journalRunId,
            final_status: "failed" as const,
            chain_status: "BLOCKED" as const,
            blocking_reason_code: "ADMISSION_DENIED" as const,
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
            journal_path: options.runStore === undefined
              ? join(workspaceRoot, "journal.db")
              : options.runStore.databaseFilePath,
            completed_at: now(),
          });
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
        // G4-R6-M2: the risk references are read back from the ruling's OWN
        // persisted decision delta (digest-verified artifact read) — never a
        // fabricated placeholder. Empty refs are legal (Decision-086 PWR
        // auto-proceed; admission authority is the §4.3 ruling itself, and
        // the delta artifact stays the durable trace for downstream inputs).
        let pwrRiskRefs: readonly string[] = [];
        if (
          lastVerdict !== null && lastVerdict.decisionDeltaRef !== null &&
          lastVerdict.decisionDeltaDigest !== null
        ) {
          try {
            const deltaBlob = artifactStore.read(lastVerdict.decisionDeltaRef, lastVerdict.decisionDeltaDigest);
            const delta = JSON.parse(deltaBlob.toString("utf8")) as {
              schema?: unknown;
              riskAcceptanceRefs?: unknown;
            };
            if (delta.schema === "loop-decision-delta:v1" && Array.isArray(delta.riskAcceptanceRefs)) {
              pwrRiskRefs = (delta.riskAcceptanceRefs as unknown[]).filter(
                (ref): ref is string => typeof ref === "string" && ref.length > 0,
              );
            }
          } catch {
            // A drifted delta yields EMPTY refs — never a placeholder.
            pwrRiskRefs = [];
          }
        }
        const verdict: SolutionGateVerdict = {
          gateResult: (lastVerdict?.gateResult as SolutionGateVerdict["gateResult"]) ?? "FAIL",
          depth: (lastVerdict?.decisionDepth as DesignDepth | null) ?? null,
          decisionStatus: gateDecision?.status ?? "BLOCKED_UNKNOWN",
          // C03-D d1: when the solution-gate has already DECIDED, there are no
          // gate-blocking findings — code-review findings that trigger a rebuild
          // must NOT block re-entry into implementation (that is the whole point
          // of a rebuild wave). Only BLOCKED_UNKNOWN carries blocking findings.
          blockingFindings: gateDecision?.status === "DECIDED" ? [] : (recovery?.findingGate.blockingFindingIds ?? []),
          riskAcceptanceRefs: pwrRiskRefs,
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
            // W-GW-DIAG P-I: an injected store still owns a real journal file —
            // surface its path so operators don't lose the diagnostic anchor.
            journal_path: options.runStore === undefined
              ? join(workspaceRoot, "journal.db")
              : options.runStore.databaseFilePath,
            completed_at: now(),
          });
        }
        implementationDepth = entryDecision.depth;
        resolvedImplementationDepth = entryDecision.depth;
      }
      // G4-R7-B4 (§7.3 A4): knowledge-sync is admitted only with NO OPEN
      // blocking finding — checked BEFORE the tail dispatch, not first
      // executed and only then flipped to BLOCKED by the completion check.
      // The predicate is OPEN-based: a CLOSED (resolved/accepted) finding
      // whose downstream tail currents are missing is the NORMAL pre-tail
      // state (the tail has not produced its products yet) and must not
      // deadlock the tail's own admission.
      // G4-R8-F3: the blocking scope follows §5.2, the same rework-target
      // semantics as A1 — an OPEN finding whose earliest node IS
      // knowledge-sync names the tail as the rework target itself and must
      // stay dispatchable to produce its own repair evidence; only strictly
      // upstream OPEN findings block the tail. This predicate is SHARED with
      // the direct entry/claim admission boundary (loop-capability-entry).
      const knowledgeSyncNodeIdx = NODE_CAPABILITY_IDS.indexOf("knowledge-sync");
      if (
        next!.capability === "knowledge-sync" && journalRunId !== null &&
        recovery !== undefined &&
        recovery.openFindings.some(
          (finding) =>
            (NODE_CAPABILITY_IDS as readonly string[]).indexOf(finding.earliestAffectedNodeId) <
            knowledgeSyncNodeIdx,
        )
      ) {
        return Object.freeze({
          requirement_id: requirementId,
          run_id: journalRunId,
          final_status: "failed" as const,
          chain_status: "BLOCKED" as const,
          blocking_reason_code: "ADMISSION_DENIED" as const,
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
          journal_path: options.runStore === undefined
            ? join(workspaceRoot, "journal.db")
            : options.runStore.databaseFilePath,
          completed_at: now(),
        });
      }
      // G4-R7-B5 (§7.3 A2 随行): the verified PWR risk provenance — the
      // ruling's digest-checked decision delta and its non-empty risk refs —
      // rides the ACTUAL downstream dispatch inputs, so it reaches the
      // adapter's staged/stdin/prompt carriers instead of stopping at the
      // entry guard. Empty refs stay legal (no fabrication); a missing or
      // drifted delta yields no provenance block (never a placeholder).
      const pwrProvenance = journalRunId !== null ? readPwrProvenance() : null;
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
          ...(pwrProvenance !== null ? {
            riskAcceptanceRefs: pwrProvenance.riskAcceptanceRefs,
            decisionDeltaRef: pwrProvenance.decisionDeltaRef,
            decisionDeltaDigest: pwrProvenance.decisionDeltaDigest,
          } : {}),
        },
      });
      firstDispatch = false;
      journalRunId = executed.runId;
      recovery = executed.recoveryContext;
      if (executed.execution.success !== true) {
        break;
      }
      // G4-R5-H4: a BLOCKED node business result is a completed attempt with
      // a blocker report — the invocation stops honestly (the recovery
      // re-derives the same point on the next resume) and the blocker
      // product is never materialized as a node revision.
      if (executed.producerTerminalEventId !== null) {
        const produced = runStore.listCapabilityExecutions(journalRunId)
          .find((item) => item.executionEventId === executed.producerTerminalEventId);
        if (produced !== undefined && produced.status === "blocked") {
          if (produced.capability !== next.capability || produced.executionRole !== next.executionRole) {
            throw new LoopRunJournalError(
              "STORE_CORRUPT",
              "the dispatched producer terminal event does not match the dispatched point",
            );
          }
          recovery = recoverRunContext(runStore, requirementId);
          break;
        }
        // WP4: bind the node product as an artifact revision authored by this
        // succeeded producer execution. Currents are the facts Re-Gate planning
        // (and finding source binding) consume; upstream chains to the reused or
        // rebuilt current of the previous node.
        // Round 3 review F2: the producer is the EXACT terminal event this
        // dispatch committed (returned by the gateway/entry), never the journal
        // tail — a concurrent entry could have advanced the tail meanwhile.
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
      // G5-T4 (Δ3) terminal→projector call point (main dispatch loop): the
      // node terminal landed and its revision materialized, so the D-9
      // precondition holds and the manifest catches up with the journal.
      // Idempotent by construction — a replayed terminal converges to a
      // projection no-op. A stop here is a stop for the run, routed through
      // the same blocksRun seam and durable block event as the entry
      // preflight; there is no second exit rule.
      //
      // Scope: this point only keeps an EXISTING manifest in step. A fresh
      // requirement has no manifest yet — creation belongs to
      // requirement-intake — so projecting here would misread a lawful fresh
      // run as the §6.2.7 legacy-reuse case ("no manifest + journal events").
      // The three-state judgement is the entry preflight's job, judged once
      // per invocation; mid-run this point never re-judges it.
      if (manifestLibraryDir !== undefined) {
        const readiness = resolveManifestReadiness(manifestLibraryDir);
        if (readiness.kind === "MANIFEST_PRESENT") {
          const routedAfterTerminal = routeManifestProjectionOutcome(
            projectLoopManifest({
              store: runStore,
              runId: journalRunId ?? identity.runId,
              requirementId,
              libraryDir: readiness.libraryDir,
              takeoverAcceptedAt: identity.createdAt,
            }),
          );
          if (routedAfterTerminal.blocksRun) {
            return manifestBlockedExit({ code: routedAfterTerminal.code, reason: routedAfterTerminal.reason });
          }
        }
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
    // G4-R5-H4 (D-087): a blocked node business result is an honest BLOCKED
    // stop — the recovery keeps the point dispatchable for the re-attempt,
    // but the invocation's visible status must not read READY.
    if (
      recovery !== undefined &&
      recovery.lastCapabilityExecution?.status === "blocked"
    ) {
      chainStatus = "BLOCKED";
    }
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
      journal_path: options.runStore === undefined ? join(workspaceRoot, "journal.db") : options.runStore.databaseFilePath,
      completed_at: now(),
      manual_handoff_status: manualHandoffStatus,
      manual_handoff_reason: manualHandoffReason,
      manual_handoff_artifact_ref: manualHandoffArtifactRef,
    });
  });
}

// ─── PRODUCTION DOOR — C03-E W3 (E1-T3/T4, wiring §4/§5) ──────────────
// The single production entry into the chain kernel. It accepts ONLY the
// frozen product of parseProductionEntryRequest (never raw JSON), runs a
// read-only preflight BEFORE any dispatch, and then delegates to the same run()
// kernel with the real identity — no second interpreter. It does NOT create a
// git worktree (that is workspaceManager.prepare(), deferred to the authorized
// E5 real activation) and it does NOT select the real capability source.

/** Read-only slice of the git snapshot the production preflight consumes. */
export type ProductionPreflightSnapshot = Pick<
  LoopGitWorkspaceSnapshot,
  "baseDrifted" | "taskHasChanges" | "sourceWipDigestSha256"
>;

export type ProductionRunErrorCode =
  | "PRODUCTION_ENTRY_NOT_PARSED"
  | "PRODUCTION_ENTRY_INVALID_INPUT"
  | "PRODUCTION_REAL_NOT_AUTHORIZED"
  | "PRODUCTION_BASE_DRIFT"
  | "PRODUCTION_DIRTY_SOURCE"
  | "PRODUCTION_ISOLATION_VIOLATED";

export class ProductionRunError extends Error {
  constructor(
    public readonly code: ProductionRunErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductionRunError";
  }
}

/**
 * G4-R8-F4: the durable fail-closed anchor for a CONFIRMED production
 * isolation violation. The journal block (run_blocked) is the primary
 * persistent fact, but the journal itself can be the failing component — a
 * block write that fails must never be reported as "already durably
 * blocked". The marker lives under the SAME controlRoot as the journal
 * (no second control plane), is bound to the requirement identity, and
 * every later real invocation of that requirement treats its presence as
 * an un-discharged containment that keeps the run fail-closed with zero
 * dispatches.
 */
const PRODUCTION_CONTAINMENT_MARKER_DIR = "production-containment";

function productionContainmentMarkerPath(identity: LoopRunIdentity): string {
  return join(identity.controlRoot, PRODUCTION_CONTAINMENT_MARKER_DIR, `${identity.requirementId}.json`);
}

/**
 * G4-R9-F4: the marker's three observable states. "absent" means the anchor
 * verifiably does not exist; "present" means a valid containment marker was
 * read back; "invalid" means SOMETHING occupies the marker path (or its
 * content is not a valid marker) and it is undecidable whether an
 * un-discharged containment is hiding behind it — never equated with
 * "absent".
 */
type ProductionContainmentMarkerState = "present" | "absent" | "invalid";

function readProductionContainmentMarker(identity: LoopRunIdentity): ProductionContainmentMarkerState {
  let raw: string;
  try {
    raw = readFileSync(productionContainmentMarkerPath(identity), "utf8");
  } catch (error) {
    // G4-R9-F4: only a verifiable ENOENT is "no marker". An unreadable path
    // (directory occupying the file path, permission, I/O error) must stay
    // fail-closed — treating it as "no marker" let a re-entry resume past an
    // isolation failure whose anchor was smothered.
    // G4-R10-F4: readFileSync FOLLOWS symlinks, so its ENOENT only proves
    // the READ TARGET was not found — not that the anchor path is free. A
    // dangling symlink occupying the marker path is an EXISTING anchor that
    // cannot be validated: it is "invalid" (occupied), never "absent", or
    // the re-entry guard skips past an un-discharged containment and a
    // write would follow the link into its target. The anchor ITSELF is
    // verified with lstat, which never follows links.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      try {
        lstatSync(productionContainmentMarkerPath(identity));
        return "invalid";
      } catch (anchorError) {
        return (anchorError as NodeJS.ErrnoException)?.code === "ENOENT" ? "absent" : "invalid";
      }
    }
    return "invalid";
  }
  try {
    const marker = JSON.parse(raw) as { reasonCode?: unknown };
    return marker?.reasonCode === "PRODUCTION_ISOLATION_VIOLATED" ? "present" : "invalid";
  } catch {
    return "invalid";
  }
}

function writeProductionContainmentMarker(identity: LoopRunIdentity): void {
  const path = productionContainmentMarkerPath(identity);
  // G4-R9-F4: "already contained" means a VALID marker is verifiably in
  // place. An existing but invalid/unreadable object at the marker path is
  // an anomaly on the fail-closed anchor — never smoothed over as a
  // successful write, and never overwritten (the occupier may itself be
  // evidence).
  const existing = readProductionContainmentMarker(identity);
  if (existing === "present") return;
  if (existing === "invalid") {
    throw new ProductionRunError(
      "PRODUCTION_ISOLATION_VIOLATED",
      `production isolation violation confirmed, but the containment marker path ${path} is ` +
        `occupied by an invalid or unreadable object and was NOT overwritten. The occupier must ` +
        `be discharged before this requirement can proceed.`,
    );
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        reasonCode: "PRODUCTION_ISOLATION_VIOLATED",
        requirementId: identity.requirementId,
        discoveredAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    throw new ProductionRunError(
      "PRODUCTION_ISOLATION_VIOLATED",
      `production isolation violation confirmed, but persisting its containment marker failed: ` +
        `${(error as Error).message}. The polluted state must be discharged before this run can proceed.`,
    );
  }
  // Write-then-verify: the write only counts as persisted when the anchor
  // reads back as a valid marker (G4-R9-F4: a silently swallowed write left
  // the writer and the re-entry guard disagreeing about the same path).
  if (readProductionContainmentMarker(identity) !== "present") {
    throw new ProductionRunError(
      "PRODUCTION_ISOLATION_VIOLATED",
      `production isolation violation confirmed, but the containment marker at ${path} did not ` +
        `persist as a valid marker. The polluted state must be discharged before this run can proceed.`,
    );
  }
}

/** The persisted isolation block event, shared by the terminal verification and the marker-driven re-entry guard. */
function appendProductionIsolationBlockEvent(runStore: LoopRunStore, runId: string, lastSequence: number): void {
  runStore.appendEvent(Object.freeze({
    eventId: `${runId}:${lastSequence + 1}:run_blocked`,
    runId,
    sequence: lastSequence + 1,
    kind: "run_blocked" as const,
    stage: null,
    attempt: 0,
    createdAt: new Date().toISOString(),
    inputDigest: null,
    outputArtifactRef: null,
    outputDigest: null,
    errorCode: null,
    retryable: null,
    reasonCode: "PRODUCTION_ISOLATION_VIOLATED",
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  }));
}

export interface ProductionRunDeps {
  /**
   * G5-T4 (Δ3): override for the requirement library directory holding
   * `manifest.md`. Defaults to `library/{requirementId}` under the run's
   * repository — the same stable path the manual face uses, so the runtime
   * projection and the manual publisher write the same object.
   */
  manifestLibraryDir?: string;
  /**
   * Read-only git preflight (workspaceManager.inspect bound to a manager). It
   * must NEVER create a worktree. Omit only in tests that isolate the kernel.
   */
  inspectWorkspace?: (identity: LoopRunIdentity) => Promise<ProductionPreflightSnapshot>;
  /**
   * W-GW-PREP (P-B, Decision-079): optional worktree preparation, wired by the
   * production entry (LoopGitWorkspaceManager.prepare). When provided, the
   * kernel prepares BEFORE inspecting — a fresh requirement has no task
   * worktree yet, and inspect alone would refuse it forever. Requires
   * inspectWorkspace; preparation is a LOCAL git worktree operation and never
   * touches remote Git state.
   */
  prepareWorkspace?: (identity: LoopRunIdentity) => Promise<unknown>;
  /** W3: "deterministic" (default); "real" requires injected realGatewayDeps. */
  capabilitySource?: CapabilitySource;
  /**
   * G4-R5-H7: the real-chain assembly surface. Injecting it is what AUTHORIZES
   * capabilitySource "real" through the production door: the adapter + attempt
   * workspace resolver are caller-supplied (offline fake adapters verify the
   * assembly; the real adapter keeps its own operator env authorization for
   * actual CLI spawning). Omitting it keeps the real door refused.
   */
  realGatewayDeps?: RealCapabilityGatewayDeps;
  /** Inject both or neither; when omitted, real stores are built under controlRoot. */
  runStore?: LoopRunStore;
  artifactStore?: LoopArtifactStore;
  gateway?: RuntimeCapabilityGateway;
  maxDispatches?: number;
  maxRegateRounds?: number;
}

export async function runProduction(
  parsed: ParsedProductionEntry,
  requirementText: string,
  deps: ProductionRunDeps = {},
): Promise<RuntimeResult> {
  // (0) Closed door: must be the frozen product of the production-entry parser.
  const request = (parsed as { request?: unknown })?.request as
    | { schema?: unknown; mode?: unknown }
    | undefined;
  const identity = (parsed as { identity?: LoopRunIdentity })?.identity;
  if (
    request?.schema !== PRODUCTION_ENTRY_SCHEMA ||
    request.mode !== "real" ||
    identity === undefined
  ) {
    throw new ProductionRunError(
      "PRODUCTION_ENTRY_NOT_PARSED",
      "runProduction requires the frozen result of parseProductionEntryRequest, never raw JSON",
    );
  }
  if (typeof requirementText !== "string" || requirementText.trim().length === 0) {
    throw new ProductionRunError("PRODUCTION_ENTRY_INVALID_INPUT", "requirementText must be a non-empty string");
  }
  if (deps.capabilitySource !== undefined && !isCapabilitySource(deps.capabilitySource)) {
    throw new ProductionRunError("PRODUCTION_ENTRY_INVALID_INPUT", "capabilitySource must be deterministic|real");
  }
  // (1) G4-R5-H7: authorization and ASSEMBLY are separated. The real chain
  // through the production door requires the caller to inject the real
  // gateway surface (adapter + attempt-workspace resolver): offline fake
  // adapters verify the full production assembly without spawning CLIs, and
  // the real adapter keeps its own operator-env authorization for actual CLI
  // spawning. A bare capabilitySource "real" with no injected surface stays
  // refused.
  if (deps.capabilitySource === "real" && deps.realGatewayDeps === undefined) {
    throw new ProductionRunError(
      "PRODUCTION_REAL_NOT_AUTHORIZED",
      "capability-source real requires injected realGatewayDeps (adapter + attempt workspace); " +
        "real CLI spawning additionally needs the operator environment confirmations",
    );
  }
  const source: CapabilitySource = deps.capabilitySource ?? DEFAULT_CAPABILITY_SOURCE;
  if (deps.prepareWorkspace !== undefined && deps.inspectWorkspace === undefined) {
    throw new ProductionRunError(
      "PRODUCTION_ENTRY_INVALID_INPUT",
      "prepareWorkspace requires inspectWorkspace (preparation is always verified before dispatch)",
    );
  }

  // (2) Read-only preflight BEFORE any dispatch. Duplicate runId is rejected by
  // the store's createRun uniqueness and concurrent resume by withResumeLease
  // (STORE_BUSY); base drift / dirty source are checked here.
  // G4-R5-H7: when the entry wires worktree preparation, the PREPARED
  // worktree path (workspacePathFor(identity)) — never the business root —
  // becomes the attempt workspace the real gateway resolves for every
  // dispatch. An inspect-only preflight (no prepare) leaves the injected
  // resolver untouched.
  let attemptWorkspaceRoot: string | null = null;
  let preflightSnapshot: ProductionPreflightSnapshot | null = null;
  if (deps.inspectWorkspace !== undefined) {
    // W-GW-PREP (P-B C1): prepare-then-inspect when the entry wires worktree
    // preparation — a fresh requirement has no task worktree yet. Without the
    // hook the preflight stays strictly read-only (injected-stub tests).
    if (deps.prepareWorkspace !== undefined) {
      const prepared = await deps.prepareWorkspace(identity);
      attemptWorkspaceRoot = (prepared as { workspacePath?: unknown } | null | undefined)
        ?.workspacePath as string | undefined ?? null;
      if (attemptWorkspaceRoot !== null && typeof attemptWorkspaceRoot !== "string") {
        throw new ProductionRunError(
          "PRODUCTION_ENTRY_INVALID_INPUT",
          "prepareWorkspace returned a non-string workspacePath",
        );
      }
    }
    const snapshot = await deps.inspectWorkspace(identity);
    preflightSnapshot = snapshot;
    if (snapshot.baseDrifted) {
      throw new ProductionRunError(
        "PRODUCTION_BASE_DRIFT",
        `repository base moved away from expectedBaseSha ${identity.expectedBaseSha}`,
      );
    }
    if (snapshot.taskHasChanges) {
      throw new ProductionRunError(
        "PRODUCTION_DIRTY_SOURCE",
        "task branch/worktree has uncommitted changes; refuse to start a production run",
      );
    }
  }
  // G4-R6-H6: for the real production door, isolation is an ASSEMBLED
  // constraint, not an optional hook. The run must hold a verified prepared
  // attempt workspace BEFORE any dispatch: a missing, non-existent,
  // non-directory, or business-root workspace is refused here, and the
  // prepared path PINS the resolver below — a caller-injected resolver that
  // answers with the business root can no longer fall through.
  if (source === "real") {
    if (attemptWorkspaceRoot === null || preflightSnapshot === null) {
      throw new ProductionRunError(
        "PRODUCTION_ENTRY_INVALID_INPUT",
        "capability-source real requires a prepared and inspected attempt workspace " +
          "(prepareWorkspace + inspectWorkspace); dispatching into the business root is not a fallback",
      );
    }
    let preparedStat: import("node:fs").Stats;
    try {
      preparedStat = statSync(attemptWorkspaceRoot);
    } catch {
      throw new ProductionRunError(
        "PRODUCTION_ENTRY_INVALID_INPUT",
        `prepared attempt workspace does not exist: ${attemptWorkspaceRoot}`,
      );
    }
    if (!preparedStat.isDirectory()) {
      throw new ProductionRunError(
        "PRODUCTION_ENTRY_INVALID_INPUT",
        "the prepared attempt workspace path is not a directory",
      );
    }
  // G4-R7-B6: the business-root comparison is by PHYSICAL identity —
  // realpath, not lexically resolved spelling. A symlink alias pointing
  // back at the repository root previously passed `resolve()` equality
  // and received real dispatches with the adapter cwd physically at the
  // business root. Both paths exist at this point (statSync above).
  // S1 (G4-R8): a missing repositoryPath surfaces as the production entry
  // error class instead of a raw filesystem ENOENT.
  let repositoryRealPath: string;
  try {
    repositoryRealPath = realpathSync(identity.repositoryPath);
  } catch {
    throw new ProductionRunError(
      "PRODUCTION_ENTRY_INVALID_INPUT",
      `the repository path does not exist: ${identity.repositoryPath}`,
    );
  }
  if (realpathSync(attemptWorkspaceRoot) === repositoryRealPath) {
      throw new ProductionRunError(
        "PRODUCTION_ENTRY_INVALID_INPUT",
        "the prepared attempt workspace must not be the business repository root",
      );
    }
  }

  // (3) Stores: inject both/neither, else build the shared control-plane journal
  // under controlRoot (one repository journal; --resume keys by requirementId).
  if ((deps.runStore === undefined) !== (deps.artifactStore === undefined)) {
    throw new ProductionRunError("PRODUCTION_ENTRY_INVALID_INPUT", "runStore and artifactStore must be injected together");
  }
  let runStore: LoopRunStore = deps.runStore as LoopRunStore;
  let artifactStore: LoopArtifactStore = deps.artifactStore as LoopArtifactStore;
  if (deps.runStore === undefined) {
    artifactStore = new LoopArtifactStore({
      controlRoot: identity.controlRoot,
      repositoryPath: identity.repositoryPath,
    });
    runStore = new LoopRunStore(join(identity.controlRoot, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
  }

  // (4) Delegate to the single chain kernel with the real identity — no copy.
  // G4-R8-F4: BEFORE any dispatch, an un-discharged containment marker from a
  // previous invocation of this requirement keeps this call fail-closed with
  // zero dispatches: the journal block is re-attempted (idempotent heal) and
  // the invocation returns BLOCKED. This is what prevents the write-failure
  // scenario from leaking: the first invocation propagated its persistence
  // error, and the marker stops the next call from re-taking the polluted
  // source state as a clean baseline and reusing the unverified outputs.
  // G4-R9-F4: an existing-but-invalid/unreadable object at the marker path
  // is NOT "no marker". With no journal run fact yet it is a FIRST invocation
  // for this requirement — the run proceeds and the terminal verification
  // hits the same anchor anomaly through the marker writer. Once a journal
  // run already exists, the anchor anomaly is an un-discharged containment:
  // fail closed exactly like a confirmed marker.
  let containmentHold =
    source === "real" && deps.inspectWorkspace !== undefined &&
    readProductionContainmentMarker(identity) === "present";
  if (
    source === "real" && deps.inspectWorkspace !== undefined &&
    !containmentHold && readProductionContainmentMarker(identity) === "invalid"
  ) {
    containmentHold = runStore.findLatestRunByRequirement(identity.requirementId) !== undefined;
  }
  if (containmentHold) {
    let runIdForBlock: string | null = null;
    try {
      const runState = runStore.findLatestRunByRequirement(identity.requirementId)?.state;
      if (runState !== undefined) {
        runIdForBlock = runState.identity.runId;
        if (
          runState.status === "running" &&
          (runState.blockingReasonCode === null || runState.blockingReasonCode === undefined)
        ) {
          appendProductionIsolationBlockEvent(runStore, runState.identity.runId, runState.lastSequence);
        }
      }
    } catch {
      // The marker is the fail-closed anchor; a journal heal that fails
      // again changes nothing about the BLOCKED outcome below.
    }
    return Object.freeze({
      requirement_id: identity.requirementId,
      run_id: runIdForBlock ?? identity.runId,
      final_status: "failed" as const,
      chain_status: "BLOCKED" as const,
      blocking_reason_code: "PRODUCTION_ISOLATION_VIOLATED" as const,
      execution_trace: Object.freeze([]),
      next_execution_point: null,
      workspace_root: identity.controlRoot,
      journal_path: deps.runStore === undefined
        ? join(identity.controlRoot, "journal.db")
        : runStore.databaseFilePath,
      completed_at: new Date().toISOString(),
    });
  }
  // G4-R5-H7: the real-chain attempt workspace is BOUND to the prepared
  // worktree for this identity when one was prepared — a caller-supplied
  // resolver pointing at the business root can no longer bypass the
  // prepared-worktree isolation. The binding wraps (never replaces) the
  // injected resolver so non-workspace resolvers stay verifiable offline.
  const boundRealGatewayDeps =
    deps.realGatewayDeps === undefined ? undefined
      : attemptWorkspaceRoot === null ? deps.realGatewayDeps
        : {
            ...deps.realGatewayDeps,
            // The prepared worktree pins the answer: the injected resolver's
            // own root choice (e.g. the business root in an old smoke) can no
            // longer bypass the prepared-worktree isolation.
            attemptWorkspace: () => attemptWorkspaceRoot!,
          };
  const result = await run(requirementText, {
    requirementId: identity.requirementId,
    workspaceRoot: identity.controlRoot,
    runStore,
    artifactStore,
    bindingRegistry: createRuntimeBindingRegistry(),
    productionIdentity: identity,
    capabilitySource: source,
    // G5-T4 (Δ3): the production door always wires the manifest library, so
    // readiness preflight and terminal projection are part of the entry.
    manifestLibraryDir:
      deps.manifestLibraryDir ?? join(identity.repositoryPath, "library", identity.requirementId),
    ...(deps.gateway !== undefined ? { gateway: deps.gateway } : {}),
    ...(boundRealGatewayDeps !== undefined ? { realGatewayDeps: boundRealGatewayDeps } : {}),
    ...(deps.maxDispatches !== undefined ? { maxDispatches: deps.maxDispatches } : {}),
    ...(deps.maxRegateRounds !== undefined ? { maxRegateRounds: deps.maxRegateRounds } : {}),
  });
  // G4-R7-B7: the post-run containment verification runs for EVERY exit of
  // a real invocation (completed, blocked or failed) — an isolation failure
  // is not a property of the returned object but a FACT about the run. It is
  // therefore persisted durably (run_blocked / PRODUCTION_ISOLATION_VIOLATED)
  // so a later resume of the same run cannot treat the polluted source state
  // as the new clean baseline and reuse the run's outputs as a success. The
  // preflight has inspected once; this is the second and final inspection.
  // G4-R8-F4: the containment marker is written BEFORE the journal block is
  // attempted, so even a journal write failure leaves a durable fail-closed
  // anchor for this requirement. A failing block write is NEVER reported as
  // "already durably blocked": the persisted facts are re-read, and only a
  // confirmed durable block allows the BLOCKED return — otherwise the
  // persistence error propagates and the caller sees the real failure.
  if (source === "real" && deps.inspectWorkspace !== undefined && preflightSnapshot !== null) {
    const post = await deps.inspectWorkspace(identity);
    const rootSideEffects =
      post.baseDrifted || post.sourceWipDigestSha256 !== preflightSnapshot.sourceWipDigestSha256;
    if (rootSideEffects) {
      writeProductionContainmentMarker(identity);
      try {
        const runState = runStore.findLatestRunByRequirement(identity.requirementId)?.state;
        if (
          runState !== undefined && runState.status === "running" &&
          (runState.blockingReasonCode === null || runState.blockingReasonCode === undefined)
        ) {
          appendProductionIsolationBlockEvent(runStore, runState.identity.runId, runState.lastSequence);
        }
      } catch (error) {
        const persisted = runStore.findLatestRunByRequirement(identity.requirementId)?.state;
        const durablyBlocked =
          persisted !== undefined && persisted.status !== "running" &&
          persisted.blockingReasonCode === "PRODUCTION_ISOLATION_VIOLATED";
        if (!durablyBlocked) {
          throw new ProductionRunError(
            "PRODUCTION_ISOLATION_VIOLATED",
            `production isolation violation confirmed at terminal verification, but persisting its durable run block failed: ` +
              `${(error as Error).message}. The containment marker under controlRoot keeps every later invocation of ` +
              `this requirement fail-closed; the polluted state must be discharged before this run can proceed.`,
          );
        }
      }
      return Object.freeze({
        ...result,
        final_status: "failed" as const,
        chain_status: "BLOCKED" as const,
        blocking_reason_code: "PRODUCTION_ISOLATION_VIOLATED" as const,
        next_execution_point: null,
        completed_at: new Date().toISOString(),
      });
    }
  }
  return result;
}
