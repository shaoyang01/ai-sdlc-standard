// G6 / D-090-04 — behavior-layer driver (frozen spec §4.2, ruling B)
// ============================================================================
// The behavior layer is driven by the production entry ITSELF: runProduction
// (the --capability-source real door with an injected scripted gateway — the
// offline assembly the spec calls "非 shadow") replaying the same FactScript
// the manual face declares. It observes the DECISION trajectory: the dispatch
// sequence, the two gate roles per round, the verdict triples, the reflow
// jumps and the terminal. It never compares digests (the artifact layer's
// job); it proves both faces make the same decisions.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProductionEntryRequest, PRODUCTION_ENTRY_SCHEMA } from "../../core/loop-production-entry";
import { createRuntimeBindingRegistry, runProduction } from "../../runtime";
import { createLoopRequirementChangeRecord } from "../../core/loop-change-classification";
import { NODE_OUTPUT_ENVELOPE_BEGIN, NODE_OUTPUT_ENVELOPE_END } from "../../core/node-output-envelope";
import type { ExecutionResult } from "../../execution/types";
import type { FactScript, FindingFact } from "./types";
import { makeStores, type RuntimeStores } from "./runtime-face";

function runIdOf(script: FactScript): string {
  return `g6-${script.requirementId}`.toLowerCase();
}

/** One scripted envelope answer (the d087 pattern, generalized to any script). */
type EnvelopeSpec = Record<string, unknown>;

function envelopeText(spec: EnvelopeSpec): string {
  const body = { nodeStatus: "SUCCEEDED", ...spec };
  return `prose\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(body)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose`;
}

export interface BehaviorVerdict {
  readonly capability: string;
  readonly executionRole: string;
  readonly attempt: number;
  readonly gateResult: string | null;
  readonly decisionStatus: string | null;
  readonly decisionDepth: string | null;
}

/** The observed decision trajectory of one behavior-layer run. */
export interface BehaviorTrace {
  /** Dispatched capability:role keys, in dispatch order (repeats included). */
  readonly dispatched: readonly string[];
  /** Every terminal capability event, in journal order. */
  readonly terminals: readonly { capability: string; executionRole: string; attempt: number; status: string }[];
  /** Verdict-bearing terminal events (the formal_verdict rounds). */
  readonly verdicts: readonly BehaviorVerdict[];
  /** Nodes re-dispatched after an earlier round (the reflow targets). */
  readonly reflowTargets: readonly string[];
  readonly finalStatus: string;
  readonly chainStatus: string;
  readonly blockingReasonCode: string | null;
  readonly nextExecutionPoint: string | null;
  /**
   * H1-remediation: the production entry's REAL final handoff (the c2/c3
   * manual-handoff checklist), captured verbatim from the invocation result —
   * never derived from a success proxy. Null status = the chain never
   * completed (the entry builds no handoff artifact).
   */
  readonly handoff: {
    readonly status: string | null;
    readonly reason: string | null;
    readonly artifactRef: string | null;
  };
}

export interface BehaviorRunResult {
  readonly trace: BehaviorTrace;
  readonly manifestText: string | null;
}

/**
 * Runs the fact script through the production entry with a scripted gateway.
 * Each script node answers its capability's dispatch in script order (the
 * rework waves repeat a capability, so each queue holds its rounds); the
 * gate node's envelope carries the verdict triple.
 */
export async function driveBehaviorLayer(stores: RuntimeStores, script: FactScript, workspace: string): Promise<BehaviorRunResult> {
  const queues = new Map<string, EnvelopeSpec[]>();
  const enqueue = (key: string, spec: EnvelopeSpec): void => {
    const queue = queues.get(key) ?? [];
    queue.push(spec);
    queues.set(key, queue);
  };
  // The gate round each script node belongs to (the gate stage's own counter).
  let gateRound = 0;
  // Capabilities whose queue a script node already answered — a rework wave
  // repeats a capability, and only the discovering round carries the discovery
  // (a repeat registration is a duplicate fact the store refuses).
  const answeredCapabilities = new Set<string>();
  const envelopeFinding = (finding: FindingFact) => ({
    id: finding.findingId,
    severity: "HIGH",
    message: `${finding.findingId} discovered at the ${finding.discoveredAt}`,
    cause: finding.category === "IMPLEMENTATION" ? "REGRESSION" : "IMPROVEMENT",
    category: finding.category,
    earliestAffectedNodeId: finding.earliest,
  });
  for (const node of script.nodes) {
    const spec: EnvelopeSpec = { summary: "ok", body: node.content };
    if (node.node === "solution-gate") {
      gateRound += 1;
      // The findings this round's SCAN discovers: the gateway registers them
      // as the consumed ledger (the D-087 seam-2 shape); the PWR ruling
      // accepts the ledger's members. Only gate-DISCOVERED findings belong to
      // a gate round — a review-stage discovery registers on its own node.
      const roundFindings = script.findings
        .filter((finding) => finding.discoveredAt === "solution-gate" && (finding.gateRound ?? 1) === gateRound)
        .map(envelopeFinding);
      if (roundFindings.length > 0 && node.gateResult === "PASS_WITH_RISK") {
        enqueue("solution-gate:adversarial_scan", { ...spec, findings: roundFindings });
      }
      // A gate-round finding of a NON-reflow class (the D shape: a REQUIREMENT
      // discovery at the gate) rides the VERDICT envelope: only a verdict
      // registration propagates the §5.4 invalidation edges that reflow to the
      // finding's own earliest node — a scan registration is edge-less by
      // design and leaves the requirement reflow unauthorized. SOLUTION
      // findings stay on the synthesis path: the non-admitting verdict owes
      // the synthetic solution-design reflow fact itself.
      const verdictFindings = roundFindings.filter((finding) => finding.category !== "SOLUTION");
      enqueue("solution-gate:formal_verdict", {
        ...spec,
        ...(node.gateResult === undefined ? {} : { gateResult: node.gateResult }),
        ...(node.decisionStatus === undefined ? {} : { decisionStatus: node.decisionStatus }),
        // An absent depth is not an explicit null (the envelope rule): the
        // BLOCKED_UNKNOWN ruling declares decisionDepth: null.
        decisionDepth: node.decisionDepth ?? null,
        findings: verdictFindings,
      });
    } else {
      // A non-gate completion that discovers findings (the B/C/E shapes:
      // review-round discoveries) carries them on its OWN envelope — the only
      // registration channel a non-gate node has — and the terminal registers
      // them WITH §5.4 edges, authorizing the backward restart to the
      // finding's earliest node.
      const discovering = !answeredCapabilities.has(node.node);
      answeredCapabilities.add(node.node);
      const nodeFindings = discovering
        ? script.findings.filter((finding) => finding.registerAfter === node.node).map(envelopeFinding)
        : [];
      enqueue(`${node.node}:primary`, nodeFindings.length > 0 ? { ...spec, findings: nodeFindings } : spec);
    }
  }

  // ── Between-invocation settlement (settle-then-register mirror) ─────────
  // Finding transitions are legal ONLY between invocations: the store refuses
  // them while a capability execution is active ("finding transitions cannot
  // advance while a capability execution is active" — an adapter call runs
  // inside an open claim). So a wave whose closure must land mid-wave (the
  // multi-round/G shapes: each round's synthesized reflow stales the previous
  // round's fix revision, and the D/E shapes: the requirement reflow must
  // re-derive the normalized source across an invocation boundary) runs ONE
  // dispatch per invocation (maxDispatches 1 — the pure safety bound, no
  // durable block), and every closure lands in the between-runs window — the
  // same seam as the manual face's between-declarations finding-action. A
  // finding closes as soon as the revision that fixed it is CURRENT-ACTIVE
  // (the store's currency rule — for the gate waves that window is exactly
  // "after the fix revision materialized, before the next round's verdict
  // synthesizes its reflow row"). The evidence is the terminal that AUTHORED
  // the bound revision (the behavior run's store carries journal output
  // envelopes, never the script's raw artifact contents — the artifact layer
  // judges the declared evidence); for the M1 shape the author IS the
  // confirming verdict, the established convention.
  const declarationForFinding = (finding: { readonly findingId: string; readonly sequence: number }) =>
    script.findings.find((item) => item.findingId.endsWith(finding.findingId.split(":").pop() ?? ""))
      ?? script.findings.find((item) => (item.gateRound ?? 1) === finding.sequence);

  const settleOpenFindings = (): void => {
    const runId = runIdOf(script);
    const open = stores.runStore.listFindings(runId).filter((finding) => finding.status === "OPEN");
    if (open.length === 0) return;
    const revisions = stores.runStore.listArtifactRevisions(runId);
    const journal = stores.runStore.listCapabilityExecutions(runId);
    for (const finding of open) {
      const declaration = declarationForFinding(finding);
      // The PWR ruling risk-accepts its scan findings in-terminal; an
      // accept-action declaration never routes through resolveFinding.
      if (declaration?.action?.action === "accept") continue;
      // The closure revision: the script-declared bound revision for a
      // declared finding; a SYNTHESIZED reflow row (the FAIL/ESCALATED
      // verdict's own §5.4 fact with no script declaration — the D wave's
      // extra SOLUTION row) binds the current revision of its own earliest
      // node.
      const boundRevisionId = declaration?.action !== undefined
        ? declaration.action.boundRevisionId.toLowerCase()
        : revisions.find((item) => item.nodeId === finding.earliestAffectedNodeId && item.validity === "ACTIVE")?.revisionId;
      if (boundRevisionId === undefined) continue;
      const bound = revisions.find((item) => item.revisionId === boundRevisionId);
      // The currency rule — the settle-then-register window itself.
      // resolveFinding re-enforces it authoritatively.
      if (bound === undefined || bound.validity !== "ACTIVE") continue;
      const producer = journal.find((event) => event.executionEventId === bound.producerExecutionId);
      if (producer === undefined || producer.outputArtifactRef === null || producer.outputDigest === null) continue;
      stores.runStore.resolveFinding(runId, finding.findingId, {
        resolvedByNodeId: finding.sourceCapability,
        resolvedByRevisionId: boundRevisionId,
        resolutionEvidenceRef: producer.outputArtifactRef,
        resolutionEvidenceDigest: producer.outputDigest,
      });
    }
  };

  const dispatched: string[] = [];
  const execute = async (request: Record<string, unknown>): Promise<ExecutionResult> => {
    const key = `${String(request.capability)}:${String(request.executionRole)}`;
    dispatched.push(key);
    const queue = queues.get(key) ?? [];
    const scripted = queue.shift();
    const spec: EnvelopeSpec = scripted ?? { summary: "ok", body: "node product" };
    return {
      success: true,
      node: String(request.node),
      agent: String(request.providerId),
      output: { text: envelopeText(spec) },
      artifacts: [],
    } as ExecutionResult;
  };

  const repositoryPath = join(stores.root, "repo");
  const parsed = parseProductionEntryRequest(
    {
      schema: PRODUCTION_ENTRY_SCHEMA,
      requirementId: script.requirementId,
      repository: "g6-parity-fixture",
      repositoryPath,
      baseBranch: "main",
      expectedBaseSha: "a".repeat(40),
      taskBranch: `runtime/${script.requirementId}`,
      controlRoot: join(stores.root, "control"),
      sourceFiles: [],
      bindingRegistryVersion: createRuntimeBindingRegistry().version,
      executionProfileVersion: "1.0.0",
      mode: "real",
    },
    { now: () => new Date().toISOString(), runId: `g6-${script.requirementId}`.toLowerCase() },
  );

  // Waves that need a mid-invocation-observable grain run one dispatch per
  // invocation: multi-round/G (a closure must land between rounds — the next
  // round's synthesized reflow would stale the bound revision), D/E (the
  // requirement reflow re-derives the normalized source only across an
  // invocation boundary), F (the WP-1 record is appended between runs). Every
  // other wave runs whole and stops on a real block — the M1 shape.
  const boundedRuns = script.findings.some(
    (finding) => (finding.gateRound ?? 1) >= 2 || finding.earliest === "requirement-intake",
  ) || script.nodes.some((node) => node.opensFeedbackChange === true);

  const invokeProduction = async (): Promise<{ final_status: "success" | "failed"; chain_status: string; blocking_reason_code?: string | null; next_execution_point: { capability: string } | null; handoff_status: string | null; handoff_reason: string | null; handoff_artifact_ref: string | null }> => {
    const result = await runProduction(parsed as never, `G6 parity ${script.requirementId}`, {
      capabilitySource: "real",
      realGatewayDeps: { adapter: { execute } as never, attemptWorkspace: () => workspace },
      runStore: stores.runStore,
      artifactStore: stores.artifactStore,
      inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
      prepareWorkspace: async () => ({ workspacePath: workspace }),
      ...(boundedRuns ? { maxDispatches: 1 } : {}),
      // The over-limit pause waves spend the entry's OWN backward-jump budget:
      // the option is forwarded verbatim from the script — the same knob class
      // as maxDispatches, never a shadow substitution.
      ...(script.maxRegateRounds !== undefined ? { maxRegateRounds: script.maxRegateRounds } : {}),
    } as never);
    return {
      final_status: result.final_status,
      chain_status: result.chain_status,
      blocking_reason_code: result.blocking_reason_code ?? null,
      next_execution_point: result.next_execution_point === null ? null : { capability: result.next_execution_point.capability },
      // H1-remediation: the REAL handoff triple, verbatim from the entry's
      // result (null status = the chain never completed, so c2/c3 was never
      // invoked). The previous driver DISCARDED these fields, which let the
      // comparator's success-proxy report MATCH on a BLOCKED handoff.
      handoff_status: result.manual_handoff_status ?? null,
      handoff_reason: result.manual_handoff_reason ?? null,
      handoff_artifact_ref: result.manual_handoff_artifact_ref ?? null,
    };
  };

  // F — the WP-1 FEEDBACK_DRIVEN_CHANGE record (the re-gate path that needs
  // no finding). Recorded in the between-runs window once the trigger node's
  // terminal has settled (the store-level driver's shape); the production
  // recovery reads the classified record and drives the full generation-2
  // rebuild from requirement-intake itself. Recording counts as an advance
  // even after the first generation COMPLETED — that is the shape.
  const feedbackTrigger = script.nodes.find((node) => node.opensFeedbackChange === true);
  let feedbackRecorded = false;
  const recordFeedbackChangeIfDue = (): boolean => {
    if (feedbackRecorded || feedbackTrigger === undefined) return false;
    const events = stores.runStore.listCapabilityExecutions(runIdOf(script));
    const settled = (event: { capability: string; executionRole: string; status: string }): boolean =>
      event.capability === feedbackTrigger.node &&
      event.status === "succeeded" &&
      (feedbackTrigger.node === "solution-gate" ? event.executionRole === "formal_verdict" : true);
    const triggerTerminal = [...events].reverse().find(settled);
    if (triggerTerminal === undefined) return false;
    const previousGeneration = stores.runStore.getRunGeneration(runIdOf(script));
    stores.runStore.appendRequirementChange(
      createLoopRequirementChangeRecord({
        runId: runIdOf(script),
        requirementId: script.requirementId,
        sequence: previousGeneration,
        status: "CLASSIFIED",
        changeKind: "FEEDBACK_DRIVEN_CHANGE",
        payloadForm: "DELTA_CHANGE",
        previousGeneration,
        currentChangeScope: `G6 feedback wave (generation ${previousGeneration + 1})`,
        confirmedFactsPreserved: ["G6-CONFIRMED-FACT"],
        sourceRefs: [
          {
            sourceType: "CONVERSATION",
            locator: "g6-parity-feedback",
            priority: 1,
            sourceVersion: null,
            observedAt: triggerTerminal.createdAt,
          },
        ],
        triggerEvidence: ["source:g6-parity-feedback"],
        classificationReason: "外部反馈开启新代际",
        blockedReasonCode: null,
        createdAt: triggerTerminal.createdAt,
      }),
    );
    feedbackRecorded = true;
    return true;
  };

  // The journal's durable block (the over-limit pause's
  // REGATE_ROUND_BUDGET_EXHAUSTED): an honest terminal that only an explicit
  // release decision (RISK_ACCEPTED / SCOPE_RESET — releaseRunRegateBlock) can
  // advance. The manual face's "the person stops waiting" issues no release,
  // so re-invoking would only spin on the same permit denial (recovery keeps
  // reporting the regate target as the next point). Read from the run
  // snapshot — the same channel the release guard reads; the invocation
  // result does not carry the reason on its final-return path.
  const durableBlockReason = (): string | null => {
    const snapshot = stores.runStore.getSnapshot(runIdOf(script));
    return snapshot?.state.blockingReasonCode ?? null;
  };

  let outcome = await invokeProduction();
  // The staged resume: after a run that stopped, close whatever is now
  // closable — the manual face publishes its finding-action between
  // declarations; the store's currency rule subsumes the per-stage round
  // bookkeeping (a finding's bound revision is current only inside its
  // confirming round's window). Resume while the chain is live: a closure or
  // the WP-1 record advanced the state, or the stop carries a live next point
  // (the safety-bound stop of boundedRuns — plain progress resumes). A stop
  // with nothing advancing and no live next point is an honest terminal.
  for (let round = 0; round < 128 && durableBlockReason() === null; round += 1) {
    const advanced = recordFeedbackChangeIfDue();
    const openBefore = stores.runStore.listFindings(runIdOf(script)).filter((finding) => finding.status === "OPEN").length;
    settleOpenFindings();
    const openAfter = stores.runStore.listFindings(runIdOf(script)).filter((finding) => finding.status === "OPEN").length;
    if (!advanced && openAfter === openBefore && outcome.next_execution_point === null) break;
    outcome = await invokeProduction();
  }

  const events = stores.runStore.listCapabilityExecutions(runIdOf(script));
  const terminals = events
    .filter((event) => event.status !== "started")
    .map((event) => ({
      capability: event.capability,
      executionRole: event.executionRole,
      attempt: event.attempt,
      status: event.status,
    }));
  const verdicts = events
    .filter(
      (event) =>
        event.capability === "solution-gate" &&
        event.executionRole === "formal_verdict" &&
        event.status !== "started",
    )
    .map((event) => ({
      capability: event.capability,
      executionRole: event.executionRole,
      attempt: event.attempt,
      gateResult: event.gateResult,
      decisionStatus: event.decisionStatus,
      decisionDepth: event.decisionDepth,
    }));
  // The reflow targets: a dispatch whose node sits BEFORE the previously
  // dispatched node in canonical order (a backward jump). The gate's
  // re-dispatch after a rework is a forward re-adjudication, not a reflow;
  // the scan→verdict pair within one round is not a jump at all.
  const NODE_ORDER = [
    "requirement-intake", "solution-design", "solution-gate", "task-planning",
    "implementation", "code-review", "knowledge-sync",
  ];
  const reflowTargets: string[] = [];
  let previousIndex = -1;
  for (const terminal of terminals) {
    const index = NODE_ORDER.indexOf(terminal.capability);
    if (index < previousIndex && !reflowTargets.includes(terminal.capability)) {
      reflowTargets.push(terminal.capability);
    }
    previousIndex = index;
  }
  return {
    trace: {
      dispatched,
      terminals,
      verdicts,
      reflowTargets,
      finalStatus: outcome.final_status,
      chainStatus: outcome.chain_status,
      blockingReasonCode: outcome.blocking_reason_code ?? durableBlockReason(),
      nextExecutionPoint: outcome.next_execution_point === null ? null : outcome.next_execution_point.capability,
      handoff: {
        status: outcome.handoff_status,
        reason: outcome.handoff_reason,
        artifactRef: outcome.handoff_artifact_ref,
      },
    },
    manifestText: null,
  };
}

/** Builds a behavior workspace root the caller must clean up. */
export function makeBehaviorWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "g6-behavior-ws-"));
}

export function removeBehaviorWorkspace(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
