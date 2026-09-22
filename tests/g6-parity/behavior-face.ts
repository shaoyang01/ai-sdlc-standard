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
import { NODE_OUTPUT_ENVELOPE_BEGIN, NODE_OUTPUT_ENVELOPE_END } from "../../core/node-output-envelope";
import type { ExecutionResult } from "../../execution/types";
import type { FactScript } from "./types";
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
  for (const node of script.nodes) {
    const spec: EnvelopeSpec = { summary: "ok", body: node.content };
    if (node.node === "solution-gate") {
      gateRound += 1;
      // The findings this round's SCAN discovers: the gateway registers them
      // as the consumed ledger (the D-087 seam-2 shape); the PWR ruling
      // accepts the ledger's members. The verdict envelope itself carries
      // findings: [] — a verdict carrying its own findings blocks the chain.
      const roundFindings = script.findings
        .filter((finding) => (finding.gateRound ?? 1) === gateRound)
        .map((finding) => ({
          id: finding.findingId,
          severity: "HIGH",
          message: `${finding.findingId} discovered at the solution-gate`,
          cause: finding.category === "IMPLEMENTATION" ? "REGRESSION" : "IMPROVEMENT",
          category: finding.category,
          earliestAffectedNodeId: finding.earliest,
        }));
      if (roundFindings.length > 0 && node.gateResult === "PASS_WITH_RISK") {
        enqueue("solution-gate:adversarial_scan", { ...spec, findings: roundFindings });
      }
      enqueue("solution-gate:formal_verdict", {
        ...spec,
        ...(node.gateResult === undefined ? {} : { gateResult: node.gateResult }),
        ...(node.decisionStatus === undefined ? {} : { decisionStatus: node.decisionStatus }),
        // An absent depth is not an explicit null (the envelope rule): the
        // BLOCKED_UNKNOWN ruling declares decisionDepth: null.
        decisionDepth: node.decisionDepth ?? null,
        findings: [],
      });
    } else {
      enqueue(`${node.node}:primary`, spec);
    }
  }

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

  const invokeProduction = async (): Promise<{ final_status: "success" | "failed"; chain_status: string; blocking_reason_code?: string | null; next_execution_point: { capability: string } | null }> => {
    const result = await runProduction(parsed as never, `G6 parity ${script.requirementId}`, {
      capabilitySource: "real",
      realGatewayDeps: { adapter: { execute } as never, attemptWorkspace: () => workspace },
      runStore: stores.runStore,
      artifactStore: stores.artifactStore,
      inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
      prepareWorkspace: async () => ({ workspacePath: workspace }),
    } as never);
    return {
      final_status: result.final_status,
      chain_status: result.chain_status,
      blocking_reason_code: result.blocking_reason_code ?? null,
      next_execution_point: result.next_execution_point === null ? null : { capability: result.next_execution_point.capability },
    };
  };

  let outcome = await invokeProduction();
  // The staged resume: after a run that stopped on an OPEN finding whose
  // confirming round has been dispatched, close it (exactly as the manual
  // face publishes its finding-action between declarations) and resume.
  for (let round = 0; round < 8 && outcome.chain_status !== "COMPLETED"; round += 1) {
    const dispatchedRounds = stores.runStore
      .listCapabilityExecutions(runIdOf(script))
      .filter((event) => event.capability === "solution-gate" && event.executionRole === "formal_verdict" && event.status !== "started").length;
    const open = stores.runStore.listFindings(runIdOf(script)).filter((finding) => finding.status === "OPEN");
    // The first gate round whose verdict admits (the M1-shape finding's
    // closing round: the confirming round of the single rework wave).
    const firstPassingRound =
      script.nodes
        .filter((node) => node.node === "solution-gate")
        .findIndex((node) => node.gateResult === "PASS" || node.gateResult === "PASS_WITH_RISK") + 1;
    const due = open.filter((finding) => {
      // The script's own finding: matched by the id suffix. The gateway's
      // synthesized reflow finding: mapped to the declaration of its
      // registration round (the store sequence is the registration order).
      const declaration = script.findings.find((item) => item.findingId.endsWith(finding.findingId.split(":").pop() ?? ""))
        ?? script.findings.find((item) => (item.gateRound ?? 1) === finding.sequence);
      if (declaration === undefined) return false;
      if (declaration.action?.action === "accept") return false; // closed in-terminal by the PWR ruling
      const closingRound = declaration.closedAtRound ?? firstPassingRound;
      return closingRound <= dispatchedRounds;
    });
    if (due.length === 0) break;
    // The confirming round's verdict event: its OWN output ref/digest is the
    // closure evidence (the D-087 shape — the gateway stores the output
    // ENVELOPE, so the evidence must be read from the journal, never
    // reconstructed from the script's raw body).
    const journalEvents = stores.runStore.listCapabilityExecutions(runIdOf(script));
    const confirmingVerdict = journalEvents
      .filter(
        (event) =>
          event.capability === "solution-gate" &&
          event.executionRole === "formal_verdict" &&
          event.status === "succeeded",
      )
      .sort((a, b) => a.sequence - b.sequence)
      .at(-1);
    if (confirmingVerdict === undefined || confirmingVerdict.outputArtifactRef === null || confirmingVerdict.outputDigest === null) {
      break;
    }
    for (const finding of due) {
      const declaration = script.findings.find((item) => item.findingId.endsWith(finding.findingId.split(":").pop() ?? ""))
        ?? script.findings.find((item) => (item.gateRound ?? 1) === finding.sequence)!;
      stores.runStore.resolveFinding(runIdOf(script), finding.findingId, {
        resolvedByNodeId: finding.sourceCapability,
        // The behavior run's run id is lowercased (the production entry's
        // run-id normalization); the script declares the mixed-case form.
        resolvedByRevisionId: declaration.action!.boundRevisionId.toLowerCase(),
        resolutionEvidenceRef: confirmingVerdict.outputArtifactRef,
        resolutionEvidenceDigest: confirmingVerdict.outputDigest,
      });
    }
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
      blockingReasonCode: outcome.blocking_reason_code ?? null,
      nextExecutionPoint: outcome.next_execution_point === null ? null : outcome.next_execution_point.capability,
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
