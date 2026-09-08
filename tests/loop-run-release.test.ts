// W-GW-DIAG P-E — minimal release gate tests (Decision-079).
// ============================================================================
// The release gate closes a blocked LOOP stop by an explicit human decision:
//   - journal "blocked" with REGATE_ROUND_BUDGET_EXHAUSTED → the store's own
//     release event (RISK_ACCEPTED | SCOPE_RESET);
//   - gate PASS_WITH_RISK stop → RISK_ACCEPTED only: every OPEN blocking
//     finding becomes ACCEPTED_RISK bound to the verdict's decisionScopeId,
//     each carrying a hash-verified human_action_required evidence artifact;
//     CRITICAL findings are refused; SCOPE_RESET is refused (rework flows
//     through the Re-Gate machinery, not a release);
//   - anything else is not releasable (fail-closed matrix).
// argv contract: --release requires --resume + --request-file + non-empty
// --release-by/--release-note; conflicts with --from-intake/--prepare-only.
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LOOP_ARTIFACT_GATE_CAPABILITIES,
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
  createLoopArtifactRevision,
} from "../core/loop-artifact-revision";
import { createLoopFinding, type LoopFindingDraft } from "../core/loop-finding-lifecycle";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { LoopRunJournalError, type LoopRunEvent, type LoopRunIdentity } from "../core/loop-executor-types";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";
import { deriveDispatchCommand, recoverRunContext } from "../core/loop-recovery";
import {
  LoopRunCliError,
  parseLoopRunArgs,
  runReleaseProcedureWithStores,
} from "../scripts/loop-run";

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function argvCode(argv: string[]): string {
  try {
    parseLoopRunArgs(argv);
  } catch (error) {
    if (error instanceof LoopRunCliError) return error.code;
    throw error;
  }
  throw new Error("expected LoopRunCliError");
}

const TS = "2026-09-01T11:00:00.000Z";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}
function dg(letter: string): string {
  return letter.repeat(64);
}

const NODE_OUT: Readonly<Record<NodeCapabilityId, { version: string; digest: string }>> = {
  "requirement-intake": { version: "1.0.0", digest: dg("c") },
  "solution-design": { version: "1.0.0", digest: dg("d") },
  "solution-gate": { version: "1.0.0", digest: dg("e") },
  "task-planning": { version: "1.0.0", digest: dg("f") },
  "implementation": { version: "1.0.0", digest: dg("0") },
  "code-review": { version: "1.0.0", digest: dg("1") },
  "knowledge-sync": { version: "1.0.0", digest: dg("2") },
};

interface Fixture {
  dir: string;
  controlRoot: string;
  identity: LoopRunIdentity;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
}

function makeFixture(runId: string, requirementId: string): Fixture {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loop-release-")));
  const controlRoot = join(dir, "control");
  const repositoryPath = join(dir, "repo");
  mkdirSync(controlRoot, { recursive: true });
  mkdirSync(repositoryPath, { recursive: true });
  const identity = Object.freeze({
    runId,
    requirementId,
    repository: "local/release-test",
    repositoryPath,
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: `runtime/${requirementId}`,
    controlRoot,
    createdAt: TS,
  }) as LoopRunIdentity;
  const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath });
  const runStore = new LoopRunStore(join(controlRoot, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  runStore.createRun(identity);
  runStore.ensureRunStarted(runId);
  return { dir, controlRoot, identity, runStore, artifactStore };
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  return Object.freeze({
    eventId: `${o.runId ?? "run-001"}:${o.sequence}:${o.kind}`,
    runId: o.runId ?? "run-001",
    sequence: o.sequence,
    kind: o.kind,
    stage: null,
    attempt: 0,
    createdAt: nextTs(),
    inputDigest: null,
    outputArtifactRef: null,
    outputDigest: null,
    errorCode: null,
    retryable: null,
    reasonCode: o.reasonCode ?? null,
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  });
}

function findingDraft(o: {
  runId: string;
  requirementId: string;
  sequence: number;
  severity?: LoopFindingDraft["severity"];
  evidence: { artifactRef: string; digest: string };
}): LoopFindingDraft {
  const evidence = o.evidence;
  return {
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: o.sequence,
    sourceCapability: "solution-design",
    sourceRevisionId: `${o.runId}:revision:solution-design:1`,
    causeKind: "REGRESSION",
    introducedByRevisionId: `${o.runId}:revision:solution-gate:1`,
    category: "SOLUTION",
    earliestAffectedNodeId: "solution-design",
    severity: o.severity ?? "MEDIUM",
    evidenceRef: evidence.artifactRef,
    evidenceDigest: evidence.digest,
    createdAt: nextTs(),
  };
}

function seedGatePwrStop(fx: Fixture, severity: "MEDIUM" | "CRITICAL" = "MEDIUM", verdictEligibility: "ELIGIBLE" | "BLOCKED" = "ELIGIBLE", withFinding = true): { decisionScopeId: string; openFindingId: string; verdictEventId: string; verdictArtifactRef: string; verdictDigest: string } {
  const runId = fx.identity.runId;
  let sequence = fx.runStore.listCapabilityExecutions(runId).length;
  let predecessor = {
    ref: `loop-artifact:v1:requirement_summary:sha256:${dg("b")}`,
    version: "1.0.0",
    digest: dg("b"),
  };
  const driverEvent = (
    capability: NodeCapabilityId,
    executionRole: "primary" | "adversarial_scan" | "formal_verdict",
    status: LoopCapabilityExecutionEvent["status"],
    overrides: Partial<LoopCapabilityExecutionEvent> = {},
  ): LoopCapabilityExecutionEvent => {
    sequence += 1;
    const isSucceededVerdict = status === "succeeded" && executionRole === "formal_verdict";
    const delta = isSucceededVerdict
      ? fx.artifactStore.put("solution_review", `decision delta ${nextTs()}`)
      : null;
    const executorAgent = executionRole === "primary" ? "kimi" : executionRole === "adversarial_scan" ? "codex" : "hermes";
    return Object.freeze({
      schemaVersion: 5,
      executionEventId: `${runId}:capability:${sequence}:${status}`,
      runId,
      sequence,
      capability,
      executionRole,
      nodeId: capability,
      attempt: 1,
      status,
      createdAt: nextTs(),
      bindingId: `binding-${executorAgent}-${capability}-${executionRole}`,
      bindingVersion: "2.0.0",
      bindingRegistryVersion: "1",
      executorAgent,
      executorAdapter: executorAgent === "codex" ? "codex-real-dispatch" : `${executorAgent}-cli`,
      executorVersion: "1.0.0",
      inputArtifactRef: predecessor.ref,
      inputArtifactVersion: predecessor.version,
      inputDigest: predecessor.digest,
      outputArtifactRef: null,
      outputArtifactVersion: null,
      outputDigest: null,
      gateResult: status === "succeeded" ? ("NOT_APPLICABLE" as const) : null,
      nextStepEligibility: status === "succeeded" ? ("ELIGIBLE" as const) : null,
      unresolvedFindingsRef: null,
      unresolvedFindingsDigest: null,
      consumedFindingsRef: null,
      consumedFindingsDigest: null,
      decisionDepth: isSucceededVerdict ? ("STANDARD" as const) : null,
      decisionStatus: isSucceededVerdict ? ("CONFIRMED" as const) : null,
      decisionScopeId: isSucceededVerdict ? `${runId}:decision:1` : null,
      decisionDeltaRef: delta?.artifactRef ?? null,
      decisionDeltaDigest: delta?.digest ?? null,
      errorCode: null,
      retryable: null,
      reasonCode: null,
      processInvocationDigest: null,
      processExitCode: null,
      processSignal: null,
      processDurationMs: null,
      processTruncated: null,
      stagingRef: null,
      stagingDigest: null,
      promotionRef: null,
      promotionDigest: null,
      humanActionRef: null,
      ...overrides,
    });
  };
  // requirement-intake then solution-design, each with its current revision.
  let upstream: string[] = [];
  for (const nodeId of ["requirement-intake", "solution-design"] as NodeCapabilityId[]) {
    const blob = fx.artifactStore.put(
      LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].artifactKind,
      `${nodeId} body ${nextTs()}`,
    );
    const started = driverEvent(nodeId, "primary", "started");
    fx.runStore.appendCapabilityExecution(started);
    const succeeded = driverEvent(nodeId, "primary", "succeeded", {
      outputArtifactRef: blob.artifactRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: blob.digest,
    });
    predecessor = { ref: blob.artifactRef, version: "1.0.0", digest: blob.digest };
    fx.runStore.appendCapabilityExecution(succeeded);
    const revision = fx.runStore.appendArtifactRevision(createLoopArtifactRevision({
      producerExecutionRole: "primary",
      runId,
      requirementId: fx.identity.requirementId,
      nodeId,
      sequence: 1,
      generation: 1,
      stablePath: `library/${fx.identity.requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].stablePathSegment}/${fx.identity.requirementId}_${nodeId}.md`,
      artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[nodeId].artifactKind,
      semver: "1.0.0",
      artifactRef: succeeded.outputArtifactRef!,
      digest: succeeded.outputDigest!,
      producerExecutionId: succeeded.executionEventId,
      gateResult: "NOT_APPLICABLE",
      upstreamRevisionIds: upstream,
      createdAt: nextTs(),
    })).record;
    upstream = [revision.revisionId];
  }
  // gate: adversarial_scan (other agent) then formal_verdict PASS_WITH_RISK.
  const scanStarted = driverEvent("solution-gate", "adversarial_scan", "started");
  fx.runStore.appendCapabilityExecution(scanStarted);
  const scanBlob = fx.artifactStore.put("solution_review", `scan ledger ${nextTs()}`);
  const scanLedger = fx.artifactStore.put("capability_findings", JSON.stringify({ findings: [] }));
  const scanSucceeded = driverEvent("solution-gate", "adversarial_scan", "succeeded", {
    outputArtifactRef: scanBlob.artifactRef,
    outputArtifactVersion: "1.0.0",
    outputDigest: scanBlob.digest,
    unresolvedFindingsRef: scanLedger.artifactRef,
    unresolvedFindingsDigest: scanLedger.digest,
  });
  fx.runStore.appendCapabilityExecution(scanSucceeded);
  predecessor = { ref: scanBlob.artifactRef, version: "1.0.0", digest: scanBlob.digest };
  const verdictStarted = driverEvent("solution-gate", "formal_verdict", "started", {
    consumedFindingsRef: scanLedger.artifactRef,
    consumedFindingsDigest: scanLedger.digest,
    executorAgent: "hermes",
    executorAdapter: "hermes-cli",
    bindingId: `binding-hermes-solution-gate-formal_verdict`,
  });
  fx.runStore.appendCapabilityExecution(verdictStarted);
  fx.runStore.appendCapabilityExecution(verdictStarted);
  const verdictBlob = fx.artifactStore.put("solution_review", `verdict ${nextTs()}`);
  const verdictSucceeded = driverEvent("solution-gate", "formal_verdict", "succeeded", {
    outputArtifactRef: verdictBlob.artifactRef,
    outputArtifactVersion: "1.0.0",
    outputDigest: verdictBlob.digest,
    gateResult: "PASS_WITH_RISK" as const,
    nextStepEligibility: verdictEligibility,
    consumedFindingsRef: scanLedger.artifactRef,
    consumedFindingsDigest: scanLedger.digest,
    executorAgent: "hermes",
    executorAdapter: "hermes-cli",
    bindingId: `binding-hermes-solution-gate-formal_verdict`,
  });
  fx.runStore.appendCapabilityExecution(verdictSucceeded);
  const gateRevision = fx.runStore.appendArtifactRevision(createLoopArtifactRevision({
    producerExecutionRole: "formal_verdict",
    runId,
    requirementId: fx.identity.requirementId,
    nodeId: "solution-gate",
    sequence: 1,
    generation: 1,
    stablePath: `library/${fx.identity.requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["solution-gate"].stablePathSegment}/${fx.identity.requirementId}_solution-gate.md`,
    artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["solution-gate"].artifactKind,
    semver: "1.0.0",
    artifactRef: verdictSucceeded.outputArtifactRef!,
    digest: verdictBlob.digest,
    producerExecutionId: verdictSucceeded.executionEventId,
    gateResult: "PASS_WITH_RISK",
    upstreamRevisionIds: upstream,
    createdAt: nextTs(),
  })).record;
  let openFindingId = "";
  if (withFinding) {
    const findingEvidence = fx.artifactStore.put("capability_output", `finding evidence ${nextTs()}`);
    const finding = fx.runStore.appendFinding(createLoopFinding(findingDraft({
      runId,
      requirementId: fx.identity.requirementId,
      sequence: 1,
      severity,
      evidence: findingEvidence,
    }))).record;
    openFindingId = finding.findingId;
  }
  return { decisionScopeId: verdictSucceeded.decisionScopeId!, openFindingId, verdictEventId: verdictSucceeded.executionEventId, verdictArtifactRef: verdictSucceeded.outputArtifactRef!, verdictDigest: verdictSucceeded.outputDigest! };
}

function procedureCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof LoopRunCliError) return error.code;
    throw error;
  }
  throw new Error("expected LoopRunCliError");
}

async function main(): Promise<void> {
  // ── argv contract ──
  check("invalid release code rejected",
    argvCode(["--request-file", "/r.json", "--resume", "run-x", "--release", "MAYBE"]) === "INVALID_RELEASE_CODE");
  check("release without resume rejected",
    argvCode(["--request-file", "/r.json", "--release", "RISK_ACCEPTED", "--release-by", "u", "--release-note", "n"]) === "RELEASE_REQUIRES_RESUME");
  check("release without audit metadata rejected",
    argvCode(["--request-file", "/r.json", "--resume", "run-x", "--release", "RISK_ACCEPTED"]) === "RELEASE_METADATA_REQUIRED");
  check("release-by without release rejected",
    argvCode(["--request-file", "/r.json", "--release-by", "u"]) === "RELEASE_FLAG_WITHOUT_RELEASE");
  check("release conflicts with from-intake",
    argvCode(["--from-intake", "/i", "--resume", "run-x", "--release", "RISK_ACCEPTED", "--release-by", "u", "--release-note", "n"]) === "FLAG_CONFLICT");
  {
    const ok = parseLoopRunArgs(["--request-file", "/r.json", "--resume", "run-x", "--release", "SCOPE_RESET", "--release-by", "current-user", "--release-note", "accepted"]);
    check("valid release argv parses",
      ok.release === "SCOPE_RESET" && ok.resumeRunId === "run-x" && ok.releaseBy === "current-user");
  }

  // ── shape 2: gate PASS_WITH_RISK → the human RISK_ACCEPTED ritual is retired ──
  // G4-R5-H6 (Decision-086/087): the CONFIRMED PWR ruling accepted its
  // scan-source findings inside the verdict's terminal transaction; there is
  // no human risk-acceptance release left to perform.
  {
    const fx = makeFixture("run-001", "req-001");
    seedGatePwrStop(fx);
    const stores = (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } =>
      ({ runStore: fx.runStore, artifactStore: fx.artifactStore });

    check("SCOPE_RESET refused at a gate stop",
      procedureCode(() => runReleaseProcedureWithStores(stores, "req-001", "run-001", "SCOPE_RESET", "current-user", "n"))
        === "RELEASE_CODE_NOT_APPLICABLE");
    check("RISK_ACCEPTED refused: the formal_verdict ruling is the acceptance (no human ritual)",
      procedureCode(() => runReleaseProcedureWithStores(stores, "req-001", "run-001", "RISK_ACCEPTED", "current-user", "risks accepted"))
        === "RELEASE_CODE_NOT_APPLICABLE");
  }

  // ── shape 2b: CRITICAL blocking finding is not risk-acceptable (store rule) ──
  {
    const fx = makeFixture("run-002", "req-002");
    const seeded = seedGatePwrStop(fx, "CRITICAL");
    let criticalCode = "";
    try {
      fx.runStore.acceptFindingRisk(fx.identity.runId, seeded.openFindingId, {
        riskAcceptedBy: "formal_verdict",
        riskAcceptanceEvidenceRef: seeded.verdictArtifactRef,
        riskAcceptanceEvidenceDigest: seeded.verdictDigest,
        decisionScopeId: seeded.decisionScopeId,
      });
    } catch (error) {
      criticalCode = error instanceof LoopRunJournalError ? error.code : "OTHER";
    }
    check("critical finding refuses acceptance with the store rule (ILLEGAL_TRANSITION)",
      criticalCode === "ILLEGAL_TRANSITION");
  }

  // ── shape 1: durably blocked regate budget → both codes via the store ──
  {
    const fx = makeFixture("run-003", "req-003");
    fx.runStore.appendEvent(makeEvent({
      sequence: 3, kind: "run_blocked", runId: "run-003",
      reasonCode: "REGATE_ROUND_BUDGET_EXHAUSTED",
    }));
    const receipt = runReleaseProcedureWithStores(
      (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } => ({ runStore: fx.runStore, artifactStore: fx.artifactStore }),
      "req-003", "run-003", "SCOPE_RESET", "current-user", "scope reset",
    );
    check("budget block released via the store event", receipt.findings_accepted.length === 0);
    const after = fx.runStore.getSnapshot("run-003")!;
    check("release cleared the durable block", after.state.status === "running" && after.state.blockingReasonCode === null);
  }

  // ── not releasable: fresh/running run without any stop ──
  {
    const fx = makeFixture("run-004", "req-004");
    check("run without a stop is not releasable",
      procedureCode(() => runReleaseProcedureWithStores(
        (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } => ({ runStore: fx.runStore, artifactStore: fx.artifactStore }),
        "req-004", "run-004", "RISK_ACCEPTED", "current-user", "n",
      )) === "RELEASE_TARGET_NOT_RELEASABLE");
    check("unknown runId is not releasable",
      procedureCode(() => runReleaseProcedureWithStores(
        (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } => ({ runStore: fx.runStore, artifactStore: fx.artifactStore }),
        "req-004", "run-404", "RISK_ACCEPTED", "current-user", "n",
      )) === "RELEASE_TARGET_NOT_RELEASABLE");
  }

  // ── P-K: PWR stop + acceptance rederives verdict eligibility (recovery) ──
  {
    const fx = makeFixture("run-005", "req-005");
    const seed = seedGatePwrStop(fx);
    const { decisionScopeId, openFindingId } = seed;

    const before = recoverRunContext(fx.runStore, "req-005");
    // Invalidation semantics: the OPEN finding staled the design current AND
    // its downstream (the round-1 gate revision included), so the round-1
    // verdict lost its current binding — BLOCKED_UNKNOWN until the rework
    // re-materializes a bound gate current.
    check("before rework: round-1 verdict decision BLOCKED_UNKNOWN (invalidation semantics)",
      before.solutionGateDecision?.status === "BLOCKED_UNKNOWN");
    check("before rework: the OPEN finding routes a rework restart at solution-design",
      before.nextExecutionPoint?.capability === "solution-design");

    // Rework round: regenerate the design (attempt 2) and re-adjudicate
    // (scan attempt 2, verdict attempt 3) — mirrors the real run4 rework
    // chain, with a NEW verdict scope (decision:2) and fresh revisions.
    const runId = fx.identity.runId;
    let seq = fx.runStore.listCapabilityExecutions(runId).length;
    let attemptOf = (cap: string, role: string): number =>
      Math.max(0, ...fx.runStore.listCapabilityExecutions(runId)
        .filter((e) => e.capability === cap && e.executionRole === role)
        .map((e) => e.attempt)) + 1;
    const ev = (
      capability: NodeCapabilityId,
      executionRole: "primary" | "adversarial_scan" | "formal_verdict",
      status: "started" | "succeeded",
      o: Partial<LoopCapabilityExecutionEvent> = {},
    ): LoopCapabilityExecutionEvent => {
      seq += 1;
      const attempt = o.attempt ?? attemptOf(capability, executionRole);
      const isSucceededVerdict = status === "succeeded" && executionRole === "formal_verdict";
      const delta = isSucceededVerdict ? fx.artifactStore.put("solution_review", `delta ${nextTs()}`) : null;
      const agent = executionRole === "primary" ? "kimi" : executionRole === "adversarial_scan" ? "codex" : "hermes";
      return Object.freeze({
        schemaVersion: 5,
        executionEventId: `${runId}:capability:${seq}:${status}`,
        runId, sequence: seq, capability, executionRole, nodeId: capability,
        attempt, status, createdAt: nextTs(),
        bindingId: `binding-${agent}-${capability}-${executionRole}`,
        bindingVersion: "2.0.0", bindingRegistryVersion: "1",
        executorAgent: agent, executorAdapter: agent === "codex" ? "codex-real-dispatch" : `${agent}-cli`,
        executorVersion: "1.0.0",
        inputArtifactRef: o.inputArtifactRef ?? `loop-artifact:v1:requirement_summary:sha256:${dg("b")}`,
        inputArtifactVersion: o.inputArtifactVersion ?? "1.0.0", inputDigest: o.inputDigest ?? dg("b"),
        outputArtifactRef: o.outputArtifactRef ?? null,
        outputArtifactVersion: o.outputArtifactVersion ?? null,
        outputDigest: o.outputDigest ?? null,
        gateResult: o.gateResult ?? (status === "succeeded" ? ("NOT_APPLICABLE" as const) : null),
        unresolvedFindingsRef: o.unresolvedFindingsRef ?? null,
        unresolvedFindingsDigest: o.unresolvedFindingsDigest ?? null,
        consumedFindingsRef: o.consumedFindingsRef ?? null,
        consumedFindingsDigest: o.consumedFindingsDigest ?? null,
        decisionDepth: isSucceededVerdict ? ("LIGHT" as const) : null,
        decisionStatus: isSucceededVerdict ? ("CONFIRMED" as const) : null,
        decisionScopeId: isSucceededVerdict ? `${runId}:decision:2` : null,
        decisionDeltaRef: delta?.artifactRef ?? null,
        decisionDeltaDigest: delta?.digest ?? null,
        nextStepEligibility: o.nextStepEligibility ?? (status === "succeeded" ? ("ELIGIBLE" as const) : null),
        errorCode: null, retryable: null, reasonCode: null,
        processInvocationDigest: null, processExitCode: null, processSignal: null,
        processDurationMs: null, processTruncated: null,
        stagingRef: null, stagingDigest: null, promotionRef: null, promotionDigest: null,
        humanActionRef: null,
      });
    };
    const tailOutput = (): { ref: string; version: string; digest: string } => {
      const last = [...fx.runStore.listCapabilityExecutions(runId)]
        .reverse().find((e) => e.status === "succeeded");
      return last === undefined
        ? { ref: `loop-artifact:v1:requirement_summary:sha256:${dg("b")}`, version: "1.0.0", digest: dg("b") }
        : { ref: last.outputArtifactRef!, version: last.outputArtifactVersion!, digest: last.outputDigest! };
    };
    // design attempt 2
    // regate restart at solution-design consumes the REUSED upstream output
    // (requirement-intake's actual succeeded output), not the journal tail.
    const intakeSucceeded = fx.runStore.listCapabilityExecutions(runId)
      .find((e) => e.capability === "requirement-intake" && e.status === "succeeded")!;
    const t0 = {
      ref: intakeSucceeded.outputArtifactRef!,
      version: intakeSucceeded.outputArtifactVersion!,
      digest: intakeSucceeded.outputDigest!,
    };
    const d2s = ev("solution-design", "primary", "started", { attempt: 2, inputArtifactRef: t0.ref, inputArtifactVersion: t0.version, inputDigest: t0.digest });
    fx.runStore.appendCapabilityExecution(d2s);
    const design2 = fx.artifactStore.put("technical_design", `reworked design ${nextTs()}`);
    const d2 = ev("solution-design", "primary", "succeeded", {
      attempt: 2, inputArtifactRef: t0.ref, inputArtifactVersion: t0.version, inputDigest: t0.digest,
      outputArtifactRef: design2.artifactRef, outputArtifactVersion: "2.0.0", outputDigest: design2.digest,
    });
    fx.runStore.appendCapabilityExecution(d2);
    fx.runStore.appendArtifactRevision(createLoopArtifactRevision({
      producerExecutionRole: "primary", runId, requirementId: "req-005",
      nodeId: "solution-design", sequence: 2, generation: 1,
      stablePath: `library/req-005/01-技术方案/req-005_solution-design.md`,
      artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["solution-design"].artifactKind,
      semver: "2.0.0", artifactRef: design2.artifactRef, digest: design2.digest,
      producerExecutionId: d2.executionEventId, gateResult: "NOT_APPLICABLE",
      upstreamRevisionIds: [`${runId}:revision:requirement-intake:1`], createdAt: nextTs(),
    })).record;
    // scan attempt 2 + verdict attempt 3 (new scope decision:2)
    const scanLedger2 = fx.artifactStore.put("capability_findings", JSON.stringify({ findings: [] }));
    const s2t = tailOutput();
    const s2started = ev("solution-gate", "adversarial_scan", "started", { attempt: 2, inputArtifactRef: s2t.ref, inputArtifactVersion: s2t.version, inputDigest: s2t.digest });
    fx.runStore.appendCapabilityExecution(s2started);
    const scanBlob2 = fx.artifactStore.put("solution_review", `rework scan ${nextTs()}`);
    const s2 = ev("solution-gate", "adversarial_scan", "succeeded", {
      attempt: 2, inputArtifactRef: s2t.ref, inputArtifactVersion: s2t.version, inputDigest: s2t.digest,
      outputArtifactRef: scanBlob2.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: scanBlob2.digest,
      unresolvedFindingsRef: scanLedger2.artifactRef, unresolvedFindingsDigest: scanLedger2.digest,
    });
    fx.runStore.appendCapabilityExecution(s2);
    const v3t = tailOutput();
    const v3started = ev("solution-gate", "formal_verdict", "started", {
      attempt: 2, inputArtifactRef: v3t.ref, inputArtifactVersion: v3t.version, inputDigest: v3t.digest,
      consumedFindingsRef: scanLedger2.artifactRef, consumedFindingsDigest: scanLedger2.digest,
    });
    fx.runStore.appendCapabilityExecution(v3started);
    const verdictBlob2 = fx.artifactStore.put("solution_review", `rework verdict ${nextTs()}`);
    const v3 = ev("solution-gate", "formal_verdict", "succeeded", {
      attempt: 2, inputArtifactRef: v3t.ref, inputArtifactVersion: v3t.version, inputDigest: v3t.digest,
      outputArtifactRef: verdictBlob2.artifactRef, outputArtifactVersion: "2.0.0", outputDigest: verdictBlob2.digest,
      gateResult: "PASS_WITH_RISK" as const,
      // G4-R5-H2: a CONFIRMED PWR verdict with no unresolved own findings
      // admits — exactly what the real gateway writes (Decision-086).
      nextStepEligibility: "ELIGIBLE" as const,
      consumedFindingsRef: scanLedger2.artifactRef, consumedFindingsDigest: scanLedger2.digest,
    });
    fx.runStore.appendCapabilityExecution(v3);
    fx.runStore.appendArtifactRevision(createLoopArtifactRevision({
      producerExecutionRole: "formal_verdict", runId, requirementId: "req-005",
      nodeId: "solution-gate", sequence: 2, generation: 1,
      stablePath: `library/req-005/02-方案审核/req-005_solution-gate.md`,
      artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["solution-gate"].artifactKind,
      semver: "2.0.0", artifactRef: verdictBlob2.artifactRef, digest: verdictBlob2.digest,
      producerExecutionId: v3.executionEventId, gateResult: "PASS_WITH_RISK",
      upstreamRevisionIds: [`${runId}:revision:solution-design:2`], createdAt: nextTs(),
    })).record;
    // acceptance is NOT a human action any more (G4-R5-H6): the only legal
    // subject is the formal_verdict ruling itself, and a design-source
    // finding is not scan-source — it can never be risk-accepted at all.
    const refusalCode = (subject: string): string => {
      try {
        fx.runStore.acceptFindingRisk(fx.identity.runId, openFindingId, {
          riskAcceptedBy: subject,
          riskAcceptanceEvidenceRef: verdictBlob2.artifactRef,
          riskAcceptanceEvidenceDigest: verdictBlob2.digest,
          decisionScopeId: `${runId}:decision:2`,
        });
        return "NO_ERROR";
      } catch (error) {
        return error instanceof LoopRunJournalError ? error.code : "OTHER";
      }
    };
    check("human 'current-user' acceptance is refused (subject rule, §5.2)",
      refusalCode("current-user") === "ILLEGAL_TRANSITION");
    check("formal_verdict acceptance is refused for a non-scan-source finding",
      refusalCode("formal_verdict") === "ILLEGAL_TRANSITION");
    // The design-source finding closes through REWORK: the discovering node
    // (solution-design) re-verifies against its fresh revision (§5.2 —
    // closure verifier = discovering node) and registers the resolution.
    const resolved = fx.runStore.resolveFinding(fx.identity.runId, openFindingId, {
      resolvedByNodeId: "solution-design",
      resolvedByRevisionId: `${runId}:revision:solution-design:2`,
      resolutionEvidenceRef: design2.artifactRef,
      resolutionEvidenceDigest: design2.digest,
    });
    check("discovering node resolves the reworked finding", resolved.record.status === "RESOLVED");
    const after = recoverRunContext(fx.runStore, "req-005");
    check("with the CONFIRMED PWR ruling: gateDecision DECIDED without any acceptance ritual",
      after.solutionGateDecision?.status === "DECIDED");
    check("with the CONFIRMED PWR ruling: chain advances to task-planning",
      after.nextExecutionPoint?.capability === "task-planning");

    // ── P-K-d (rewritten per G4-R5-H2/Decision-086) ──
    // The old "PWR parks pending human acceptance" shape is retired: a
    // CONFIRMED PWR verdict with a bound gate current IS the admitting
    // ruling — recovery projects DECIDED and the walk advances to
    // task-planning. There is no post-hoc acceptance rederivation left.
    const fx2 = makeFixture("run-006", "req-006");
    const seeded2 = seedGatePwrStop(fx2, "MEDIUM", "ELIGIBLE", false);
    const rec2 = recoverRunContext(fx2.runStore, "req-006");
    check("CONFIRMED PWR with a bound gate current: DECIDED, dispatch advances",
      rec2.solutionGateDecision?.status === "DECIDED" &&
        rec2.nextExecutionPoint?.capability === "task-planning");
    const command2 = deriveDispatchCommand(rec2);
    check("dispatch command derives task-planning on the pinned verdict output",
      command2 !== null && command2.capability === "task-planning" &&
        command2.inputArtifactRef === seeded2.verdictArtifactRef);
  }

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
