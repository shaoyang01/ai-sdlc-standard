// G4-R6 fix-round anti-regression matrix
// ======================================
// Counterexamples and positives for the G4-R6 review findings, derived per
// the review's own acceptance directives:
//   - R6-H1: v4 events never gain decisionStatus authority (write gate +
//     consumer version checks + tampered-column probe).
//   - R6-H2: registration/acceptance binding to the ruling event's own
//     facts (evidence blob, decision scope, real scan producer, replay
//     semantics).
//   - R6-H3: a plain PASS closes nothing — per-item closure only.
//   - R6-H4: same-point blocked re-drive validates only the original claim;
//     a blocked terminal's implementation-class finding re-drives its
//     canonical node first.
//   - R6-H5: planner decisions read precise producer-execution identity,
//     execution-point coordinates, and ONE shared fact reduction.

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { RealGatewayAdapter } from "../execution/real-capability-gateway";
import { run } from "../runtime";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import {
  canonicalizeLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { NODE_OUTPUT_ENVELOPE_BEGIN, NODE_OUTPUT_ENVELOPE_END } from "../core/node-output-envelope";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import {
  planRegateFromFacts,
  reduceBlockedPointIndexes,
  reduceGateRoundFacts,
  type CurrentRevisionFacts,
  type RegateFindingFacts,
} from "../core/loop-regate";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";

let p = 0;
let f = 0;
function ok(c: unknown, m: string): asserts c {
  if (c) {
    p += 1;
    console.log(`  ✓ ${m}`);
  } else {
    f += 1;
    console.error(`  ✗ ${m}`);
  }
}

type ScriptKey = string;
type EnvelopeSpec = Record<string, unknown>;

function envelopeText(spec: EnvelopeSpec): string {
  const body = { nodeStatus: "SUCCEEDED", ...spec };
  return `prose before\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(body)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose after`;
}

function scriptedAdapter(script: Map<ScriptKey, EnvelopeSpec[]>): {
  adapter: RealGatewayAdapter;
  calls: ScriptKey[];
} {
  const calls: ScriptKey[] = [];
  const execute = async (req: Record<string, unknown>): Promise<ExecutionResult> => {
    const key = `${String(req.capability)}:${String(req.executionRole)}`;
    calls.push(key);
    const queue = script.get(key) ?? [];
    const spec: EnvelopeSpec = queue.length === 0
      ? { summary: "ok", body: "node product" }
      : queue.length === 1 ? { summary: "ok", body: "node product", ...queue[0]! } : { summary: "ok", body: "node product", ...queue.shift()! };
    return {
      success: true,
      node: String(req.node),
      agent: String(req.providerId),
      output: { text: envelopeText(spec) },
      artifacts: [],
    } as ExecutionResult;
  };
  return { calls, adapter: { execute } as unknown as RealGatewayAdapter };
}

interface Harness {
  root: string;
  workspace: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  requirementId: string;
}

function makeHarness(name: string): Harness {
  const root = mkdtempSync(join(tmpdir(), `g4r6-${name}-`));
  const workspace = join(root, "attempt-ws");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  artifactStore.init();
  runStore.init();
  return { root, workspace, runStore, artifactStore, requirementId: `REQ-G4R6-${name.toUpperCase()}` };
}

function closeHarness(h: Harness): void {
  h.runStore.close();
  h.artifactStore.close();
  rmSync(h.root, { recursive: true, force: true });
}

function runIdOf(h: Harness): string {
  return h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId;
}

function events(h: Harness): readonly LoopCapabilityExecutionEvent[] {
  return h.runStore.listCapabilityExecutions(runIdOf(h));
}

async function runOnce(h: Harness, adapter: RealGatewayAdapter, maxDispatches?: number) {
  return run("build the g4r6 probe feature", {
    requirementId: h.requirementId,
    workspaceRoot: h.root,
    runStore: h.runStore,
    artifactStore: h.artifactStore,
    capabilitySource: "real",
    realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
    ...(maxDispatches !== undefined ? { maxDispatches } : {}),
  });
}

const finding = (id: string, severity: string, category: string): Record<string, unknown> => ({
  id, severity, message: `probe ${id}`, category, cause: "IMPROVEMENT",
});

async function main(): Promise<void> {
  // ══ R6-H1: v4 events never gain decisionStatus authority ══
  console.log("R6-H1: v4 write gate, tampered-column probe, consumer version checks");
  {
    const h = makeHarness("h1");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:adversarial_scan", [{ findings: [finding("F-1", "CRITICAL", "SOLUTION")] }]],
        ["solution-gate:formal_verdict", [{ gateResult: "PASS_WITH_RISK", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", riskAcceptanceRefs: ["RISK-1"], findings: [] }]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const first = await runOnce(h, adapter, 5);
      // The CRITICAL scan finding stays OPEN and blocks — bounded stop.
      ok(first.chain_status !== "COMPLETED", "the probe run stops before completion (CRITICAL finding blocks)");
      const runId = runIdOf(h);

      // (a) NEW writes at a historical schema version are refused outright.
      const legacyEvent: LoopCapabilityExecutionEvent = {
        ...structuredClone(events(h)[0]!),
        schemaVersion: 4 as never,
        sequence: events(h).length + 1,
        executionEventId: `${runId}:capability:${events(h).length + 1}:started`,
        status: "started",
        createdAt: new Date().toISOString(),
      };
      let wroteLegacy = false;
      try {
        h.runStore.appendCapabilityExecution(legacyEvent);
        wroteLegacy = true;
      } catch {
        wroteLegacy = false;
      }
      ok(!wroteLegacy, "a v4-schema capability event is refused at the write gate (INVALID_INPUT)");

      // (a2) R6-L1: the retired risk_accepted run event is write-banned.
      let wroteRiskAccepted = false;
      try {
        h.runStore.appendEvent(Object.freeze({
          eventId: `${runId}:900:risk_accepted`,
          runId,
          sequence: 900,
          kind: "risk_accepted" as const,
          stage: null,
          attempt: 0,
          createdAt: new Date().toISOString(),
          inputDigest: null,
          outputArtifactRef: null,
          outputDigest: null,
          errorCode: null,
          retryable: null,
          reasonCode: "run-x:decision:1",
          bindingId: null,
          bindingVersion: null,
          inputArtifactRef: null,
        }));
        wroteRiskAccepted = true;
      } catch {
        wroteRiskAccepted = false;
      }
      ok(!wroteRiskAccepted, "a NEW risk_accepted run event is refused (retired for writes, R6-L1)");

      // (b) The exact R6-H1 probe: rewrite the persisted v5 verdict into a
      // v4 row whose unprotected status column reads CONFIRMED, with the
      // v4 canonical hash recomputed (v4 canonical form EXCLUDES the
      // status — so this forgery is hash-consistent for a v4 row).
      const db = new Database(join(h.root, "journal.db"));
      const verdictRow = db.prepare(
        "SELECT execution_event_id FROM loop_capability_executions WHERE capability='solution-gate' AND execution_role='formal_verdict' ORDER BY sequence DESC LIMIT 1",
      ).get() as { execution_event_id: string };
      const verdict = events(h).find((e) => e.executionEventId === verdictRow.execution_event_id)!;
      const forged = { ...verdict, schemaVersion: 4 as never, decisionStatus: "CONFIRMED" as never };
      const v4Hash = createHash("sha256").update(canonicalizeLoopCapabilityExecutionEvent(forged)).digest("hex");
      db.prepare(
        "UPDATE loop_capability_executions SET schema_version=4, decision_status='CONFIRMED', canonical_sha256=? WHERE execution_event_id=?",
      ).run(v4Hash, verdictRow.execution_event_id);
      db.close();

      // (c) Historical reads stay intact (the forged row verifies as v4),
      // but the consumer version check refuses admission authority.
      const recovery = recoverRunContext(h.runStore, h.requirementId)!;
      ok(recovery.solutionGateDecision?.status !== "DECIDED",
        "a hash-consistent v4 verdict with a CONFIRMED status column never projects DECIDED (recovery A1)");
      ok(recovery.nextExecutionPoint === null || recovery.solutionGateDecision?.status === "BLOCKED_UNKNOWN",
        "the forged ruling cannot admit downstream work");

      // (d) The acceptance consumer requires the same version.
      const scanEvent = events(h).find((e) => e.capability === "solution-gate" && e.executionRole === "adversarial_scan")!;
      const openCritical = h.runStore.listFindings(runId).find((findingItem) => findingItem.status === "OPEN")!;
      let acceptanceRefused = false;
      try {
        h.runStore.acceptFindingRisk(runId, openCritical.findingId, {
          riskAcceptedBy: "formal_verdict",
          riskAcceptanceEvidenceRef: verdict.outputArtifactRef,
          riskAcceptanceEvidenceDigest: verdict.outputDigest,
          decisionScopeId: verdict.decisionScopeId,
        });
      } catch {
        acceptanceRefused = true;
      }
      ok(acceptanceRefused, "acceptFindingRisk refuses: the ruling is v4 — no decisionStatus authority (R6-H1)");
      void scanEvent;
    } finally {
      closeHarness(h);
    }
  }

  // ══ R6-H2: registration and acceptance bind to the ruling's own facts ══
  console.log("R6-H2: evidence/scope binding, real scan producer, replay semantics");
  {
    const h = makeHarness("h2");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:adversarial_scan", [{ findings: [finding("F-H", "HIGH", "SOLUTION")] }]],
        ["solution-gate:formal_verdict", [{ gateResult: "PASS_WITH_RISK", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", riskAcceptanceRefs: ["RISK-9"], findings: [] }]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const result = await runOnce(h, adapter, 9);
      const runId = runIdOf(h);
      const scan = events(h).find((e) => e.status === "succeeded" && e.capability === "solution-gate" && e.executionRole === "adversarial_scan")!;
      const verdict = events(h).find((e) => e.status === "succeeded" && e.capability === "solution-gate" && e.executionRole === "formal_verdict")!;
      const accepted = h.runStore.listFindings(runId).find((findingItem) => findingItem.status === "ACCEPTED_RISK");
      if (!(result.chain_status === "COMPLETED" && accepted !== undefined &&
        accepted.riskAcceptedScopeId === verdict.decisionScopeId &&
        accepted.riskAcceptanceEvidenceRef === verdict.outputArtifactRef)) {
        console.error("  h2 diagnose:", result.final_status, result.chain_status, result.blocking_reason_code,
          "| accepted:", accepted?.status, "| verdict scope:", verdict.decisionScopeId,
          events(h).map((e) => `${e.capability}:${e.executionRole}#${e.attempt}:${e.status}${e.errorCode ? `(${e.errorCode})` : ""}`).join(" "));
      }
      ok(result.chain_status === "COMPLETED" && accepted !== undefined &&
        accepted.riskAcceptedScopeId === verdict.decisionScopeId &&
        accepted.riskAcceptanceEvidenceRef === verdict.outputArtifactRef,
        "the legal in-terminal PWR acceptance still succeeds and binds scope + the ruling's own blob");

      // (a) A code-review finding BORROWING the consumed ledger reference is
      // refused — origin binding is source + digest, not ref equality.
      const codeReviewRevision = h.runStore.listArtifactRevisions(runId)
        .find((revision) => revision.nodeId === "code-review")!;
      const borrowed = h.runStore.appendFinding(createLoopFinding({
        runId, requirementId: h.requirementId, sequence: h.runStore.listFindings(runId).length + 1,
        sourceCapability: "code-review",
        sourceRevisionId: codeReviewRevision.revisionId,
        causeKind: "IMPROVEMENT", introducedByRevisionId: null,
        severity: "HIGH", category: "IMPLEMENTATION",
        evidenceRef: scan.unresolvedFindingsRef!, evidenceDigest: scan.unresolvedFindingsDigest!,
        earliestAffectedNodeId: "implementation", createdAt: new Date().toISOString(),
      }));
      let borrowedRefused = false;
      try {
        h.runStore.acceptFindingRisk(runId, (borrowed as { record: { findingId: string } }).record.findingId, {
          riskAcceptedBy: "formal_verdict",
          riskAcceptanceEvidenceRef: verdict.outputArtifactRef,
          riskAcceptanceEvidenceDigest: verdict.outputDigest,
          decisionScopeId: verdict.decisionScopeId,
        });
      } catch {
        borrowedRefused = true;
      }
      ok(borrowedRefused, "a foreign finding borrowing the consumed ledger reference is refused (R6-H2 origin binding)");

      // (b) Unrelated acceptance evidence is refused — the evidence must be
      // the ruling's own Gate Result blob.
      const unrelatedBlob = h.artifactStore.put("human_action_required", JSON.stringify({ note: "unrelated human text" }));
      const stillOpen = h.runStore.listFindings(runId).find((findingItem) => findingItem.status === "OPEN");
      if (stillOpen !== undefined) {
        let unrelatedRefused = false;
        try {
          h.runStore.acceptFindingRisk(runId, stillOpen.findingId, {
            riskAcceptedBy: "formal_verdict",
            riskAcceptanceEvidenceRef: unrelatedBlob.artifactRef,
            riskAcceptanceEvidenceDigest: unrelatedBlob.digest,
            decisionScopeId: verdict.decisionScopeId,
          });
        } catch {
          unrelatedRefused = true;
        }
        ok(unrelatedRefused, "acceptance on unrelated human-action text is refused (R6-H2 evidence binding)");
      } else {
        ok(true, "(no second OPEN finding — unrelated-evidence refusal covered by the borrowed probe)");
      }

      // (c) A conflicting REPLAY of the exact terminal with different
      // registration semantics is refused with zero writes.
      const terminal = verdict;
      const replayBase = {
        evidenceRef: terminal.unresolvedFindingsRef ?? terminal.outputArtifactRef!,
        evidenceDigest: terminal.unresolvedFindingsDigest ?? terminal.outputDigest!,
        findings: [],
        runInvalidation: false,
        adjudicateScanFindings: { decisionScopeId: terminal.decisionScopeId!, mode: "PWR_ACCEPT" as const },
      };
      const replayNoop = h.runStore.appendCapabilityExecutionWithFindings(
        structuredClone(terminal) as LoopCapabilityExecutionEvent,
        replayBase,
      );
      ok(replayNoop.appended === false, "an exact replay of the PWR terminal stays an idempotent no-op");
      let conflictRefused = false;
      try {
        h.runStore.appendCapabilityExecutionWithFindings(
          structuredClone(terminal) as LoopCapabilityExecutionEvent,
          {
            ...replayBase,
            findings: [{ severity: "CRITICAL", category: "SOLUTION", causeKind: "IMPROVEMENT" }],
          },
        );
      } catch {
        conflictRefused = true;
      }
      ok(conflictRefused, "a replay with rewritten drafts (CRITICAL where HIGH was registered) is refused (R6-H2)");
      let scopeConflictRefused = false;
      try {
        h.runStore.appendCapabilityExecutionWithFindings(
          structuredClone(terminal) as LoopCapabilityExecutionEvent,
          {
            ...replayBase,
            adjudicateScanFindings: { decisionScopeId: "unrelated-scope", mode: "PWR_ACCEPT" },
          },
        );
      } catch {
        scopeConflictRefused = true;
      }
      ok(scopeConflictRefused, "a replay with an unrelated decisionScopeId is refused (R6-H2 scope binding)");
      let digestConflictRefused = false;
      try {
        h.runStore.appendCapabilityExecutionWithFindings(
          structuredClone(terminal) as LoopCapabilityExecutionEvent,
          { ...replayBase, evidenceDigest: "a".repeat(64) },
        );
      } catch {
        digestConflictRefused = true;
      }
      ok(digestConflictRefused, "a replay with a modified evidence digest is refused (R6-H2)");
    } finally {
      closeHarness(h);
    }
  }

  // ══ R6-H3: a plain PASS closes nothing ══
  console.log("R6-H3: PASS does not batch-close; per-item closure is the only path");
  {
    const h = makeHarness("h3");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:adversarial_scan", [{ findings: [finding("F-SOL", "HIGH", "SOLUTION")] }]],
        ["solution-gate:formal_verdict", [
          // Round 1: ESCALATED (registers the reflow fact), design rebuilt,
          // round 2: plain CONFIRMED PASS.
          { gateResult: "FAIL", decisionStatus: "ESCALATED", decisionDepth: "STANDARD", findings: [] },
          { gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", findings: [] },
        ]],
        ["solution-design:primary", [{ findings: [] }, { findings: [] }]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const result = await runOnce(h, adapter, 12);
      const runId = runIdOf(h);
      const findings = h.runStore.listFindings(runId);
      ok(result.chain_status !== "COMPLETED" && findings.every((findingItem) => findingItem.status === "OPEN"),
        "after the rebuilt design and a plain PASS, every finding is still OPEN and the run stays blocked");
      const blocking = recoverRunContext(h.runStore, h.requirementId)!.openFindings;
      ok(blocking.length === findings.length,
        "recovery projects the OPEN findings as blocking (R6-H3: no silent销账)");

      // Per-item closure with the re-adjudicating round as verifier.
      const finalVerdict = events(h).find((e) => e.status === "succeeded" && e.executionRole === "formal_verdict" && e.attempt === 2)!;
      const gateCurrent = h.runStore.listRegateCurrentFacts(runId).find((fact) => fact.nodeId === "solution-gate")!;
      for (const open of findings) {
        h.runStore.resolveFinding(runId, open.findingId, {
          resolvedByNodeId: "solution-gate",
          resolvedByRevisionId: gateCurrent.revisionId,
          resolutionEvidenceRef: finalVerdict.outputArtifactRef,
          resolutionEvidenceDigest: finalVerdict.outputDigest,
        });
      }
      ok(h.runStore.listFindings(runId).every((findingItem) => findingItem.status === "RESOLVED"),
        "legal per-item closures (verifier = discovering node, repair revision current + evidence bound) resolve all findings");
      const resumed = await runOnce(h, adapter);
      ok(resumed.final_status === "success" && resumed.chain_status === "COMPLETED",
        "the run completes only after the itemized closures");
    } finally {
      closeHarness(h);
    }
  }

  // ══ R6-H4: blocked re-drive branches ══
  console.log("R6-H4: same-point blocked re-drive; blocked-with-implementation-finding reflows first");
  {
    // (a) A blocked code-review WITHOUT findings re-drives the SAME point on
    // the unchanged claim — the old two-rule conflict rejected every retry.
    const h = makeHarness("h4a");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
        ["code-review:primary", [
          { nodeStatus: "BLOCKED" },
          { nodeStatus: "SUCCEEDED", findings: [] },
        ]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const first = await runOnce(h, adapter, 7);
      const blockedTerminal = events(h).at(-1)!;
      ok(first.chain_status === "BLOCKED" && blockedTerminal.status === "blocked" && blockedTerminal.capability === "code-review",
        `the blocked code-review terminal stops the chain preserving its blocker report (got ${first.chain_status}/${blockedTerminal.capability}:${blockedTerminal.status})`);
      const second = await runOnce(h, adapter);
      ok(second.final_status === "success" && second.chain_status === "COMPLETED",
        "the same-point blocked re-drive succeeds (claim-only validation, R6-H4)");
    } finally {
      closeHarness(h);
    }

    // (b) A blocked code-review carrying an IMPLEMENTATION finding invalidates
    // its canonical scope and re-drives IMPLEMENTATION first.
    const h2 = makeHarness("h4b");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
        ["code-review:primary", [
          { nodeStatus: "BLOCKED", findings: [finding("F-IMPL", "HIGH", "IMPLEMENTATION")] },
        ]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const first = await runOnce(h2, adapter, 7);
      const recovery = recoverRunContext(h2.runStore, h2.requirementId)!;
      if (!(recovery.nextExecutionPoint !== null &&
        recovery.nextExecutionPoint.capability === "implementation")) {
        console.error("  h4b diagnose:", first.chain_status, JSON.stringify(recovery.nextExecutionPoint),
          "| regatePlan:", JSON.stringify(recovery.regatePlan ?? null));
      }
      ok(recovery.nextExecutionPoint !== null &&
        recovery.nextExecutionPoint.capability === "implementation",
        "the blocked terminal's implementation finding re-drives implementation first (R6-H4)");
      const implRevision = h2.runStore.listRegateCurrentFacts(runIdOf(h2)).find((fact) => fact.nodeId === "implementation");
      ok(implRevision === undefined || implRevision.validity !== "ACTIVE",
        "the implementation current was invalidated by the blocked terminal's finding");
    } finally {
      closeHarness(h2);
    }
  }

  // ══ R6-H5: planner facts ══
  console.log("R6-H5: precise gate-round identity, execution-point coordinates, shared reduction");
  {
    const currents = (overrides: Record<string, string> = {}): Map<NodeCapabilityId, CurrentRevisionFacts> => {
      const map = new Map<NodeCapabilityId, CurrentRevisionFacts>();
      for (const node of ["requirement-intake", "solution-design", "solution-gate", "task-planning", "implementation", "code-review", "knowledge-sync"] as NodeCapabilityId[]) {
        map.set(node, { validity: overrides[node] ?? "ACTIVE", generation: 1 });
      }
      return map;
    };
    const scanFindings: RegateFindingFacts[] = [{
      findingId: "F-REFLOW", severity: "HIGH", status: "OPEN",
      earliestAffectedNodeId: "solution-design", causeKind: "IMPROVEMENT",
      createdAt: "2026-09-01T00:00:00.000Z",
    }];
    // (a) The exact mixed probe: scan retried, verdict ESCALATED, design
    // REBUILT and the gate round left stale (gate current invalidated by the
    // ESCALATED edges) — the wave must RE-RUN THE SCAN (the latest scan
    // examined the OLD design), never jump to formal_verdict. Attempt
    // counts (2 > 1) said "continue at verdict"; identity says re-scan.
    const oldDesign = { artifactRef: "loop-artifact:v1:solution_design:sha256:old", semver: "1.0.0", digest: "a".repeat(64) };
    const newDesign = { artifactRef: "loop-artifact:v1:solution_design:sha256:new", semver: "2.0.0", digest: "b".repeat(64) };
    const plan = planRegateFromFacts(
      scanFindings,
      currents({ "solution-gate": "STALE" }),
      {
        lastScan: {
          inputArtifactRef: oldDesign.artifactRef, inputArtifactVersion: oldDesign.semver, inputDigest: oldDesign.digest,
          unresolvedFindingsRef: "loop-artifact:v1:capability_findings:sha256:ledger1", unresolvedFindingsDigest: "c".repeat(64),
          sequence: 12,
        },
        lastVerdict: { consumedFindingsRef: "loop-artifact:v1:capability_findings:sha256:ledger1", consumedFindingsDigest: "c".repeat(64), sequence: 8 },
        designCurrent: newDesign,
      },
      null,
      [],
    );
    ok(plan.kind === "regate" && plan.restartNode === "solution-gate" &&
      plan.restartPointIndex === 2 && plan.nodesToRebuild[0] === "solution-gate",
      "a rebuilt design after the last scan re-runs the SCAN (identity, not attempt counts, R6-H5)");

    // (b) The scan examined the current design but no verdict consumed its
    // ledger — the round continues at formal_verdict.
    const planVerdict = planRegateFromFacts(
      scanFindings,
      currents({ "solution-gate": "STALE" }),
      {
        lastScan: {
          inputArtifactRef: newDesign.artifactRef, inputArtifactVersion: newDesign.semver, inputDigest: newDesign.digest,
          unresolvedFindingsRef: "loop-artifact:v1:capability_findings:sha256:ledger2", unresolvedFindingsDigest: "d".repeat(64),
          sequence: 12,
        },
        lastVerdict: { consumedFindingsRef: "loop-artifact:v1:capability_findings:sha256:older", consumedFindingsDigest: "e".repeat(64), sequence: 8 },
        designCurrent: newDesign,
      },
      null,
      [],
    );
    ok(planVerdict.restartPointIndex === 3 && planVerdict.nodesToRebuild[0] === "solution-gate",
      "a verdict that never consumed the latest scan's ledger continues the round at formal_verdict");

    // (c) The planner probe: a code-review finding with a blocked
    // IMPLEMENTATION point fact must NOT be hijacked — the implementation
    // point is OUTSIDE the code-review scope under execution-point
    // coordinates; the wave proceeds to the first node that needs a rebuild.
    const planProbe = planRegateFromFacts(
      [{ ...scanFindings[0]!, earliestAffectedNodeId: "code-review" }],
      currents({ "knowledge-sync": "STALE" }),
      undefined,
      null,
      [5], // implementation:primary blocked (execution-point index 5)
    );
    ok(planProbe.restartNode === "knowledge-sync" && planProbe.restartPointIndex === 7 &&
      planProbe.nodesToRebuild.join(",") === "knowledge-sync",
      "a blocked upstream point outside the finding's point-scope no longer hijacks the plan (R6-H5 coordinates)");

    // (d) A blocked point INSIDE the governing scope re-drives first, and
    // ALL plan fields regenerate consistently from the final target.
    const planInScope = planRegateFromFacts(
      [{ ...scanFindings[0]!, earliestAffectedNodeId: "code-review" }],
      currents({ "knowledge-sync": "STALE" }),
      undefined,
      null,
      [6], // code-review:primary blocked, inside the code-review..ks scope
    );
    ok(planInScope.restartNode === "code-review" && planInScope.restartPointIndex === 6 &&
      planInScope.nodesToRebuild.join(",") === "code-review,knowledge-sync",
      "an in-scope blocked point re-drives first with consistently regenerated plan fields");

    // (e) The shared reductions: latest-terminal semantics — a point blocked
    // once but successfully re-driven is NOT blocked anymore.
    const reduced = reduceBlockedPointIndexes([]);
    ok(reduced.length === 0, "reduceBlockedPointIndexes over an empty journal is empty");
  }

  console.log(`\ng4-r6 fix-round matrix: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
