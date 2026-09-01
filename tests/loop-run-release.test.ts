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
import type { LoopRunEvent, LoopRunIdentity } from "../core/loop-executor-types";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { NODE_CAPABILITY_IDS, type NodeCapabilityId } from "../loop/types";
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

function seedGatePwrStop(fx: Fixture, severity: "MEDIUM" | "CRITICAL" = "MEDIUM"): { decisionScopeId: string; openFindingId: string } {
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
      schemaVersion: 4,
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
    nextStepEligibility: "BLOCKED" as const,
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
  const findingEvidence = fx.artifactStore.put("capability_output", `finding evidence ${nextTs()}`);
  const finding = fx.runStore.appendFinding(createLoopFinding(findingDraft({
    runId,
    requirementId: fx.identity.requirementId,
    sequence: 1,
    severity,
    evidence: findingEvidence,
  }))).record;
  return { decisionScopeId: verdictSucceeded.decisionScopeId!, openFindingId: finding.findingId };
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

  // ── shape 2: gate PASS_WITH_RISK stop → RISK_ACCEPTED accepts the findings ──
  {
    const fx = makeFixture("run-001", "req-001");
    const { decisionScopeId, openFindingId } = seedGatePwrStop(fx);
    const stores = (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } =>
      ({ runStore: fx.runStore, artifactStore: fx.artifactStore });

    check("SCOPE_RESET refused at a gate stop",
      procedureCode(() => runReleaseProcedureWithStores(stores, "req-001", "run-001", "SCOPE_RESET", "current-user", "n"))
        === "RELEASE_CODE_NOT_APPLICABLE");

    const receipt = runReleaseProcedureWithStores(stores, "req-001", "run-001", "RISK_ACCEPTED", "current-user", "risks accepted for the three-condition plan");
    check("release receipt names the run", receipt.run_id === "run-001");
    check("release receipt carries the verdict scope", receipt.decision_scope_id === decisionScopeId);
    check("release accepted exactly the open blocking finding",
      receipt.findings_accepted.length === 1 && receipt.findings_accepted[0] === openFindingId);
    check("evidence artifact is a human_action_required ref",
      (receipt.evidence_ref ?? "").startsWith("loop-artifact:v1:human_action_required:"));
    const finding = fx.runStore.listFindings("run-001").find((f) => f.findingId === openFindingId)!;
    check("finding transitioned to ACCEPTED_RISK", finding.status === "ACCEPTED_RISK");
    check("acceptance is bound to the verdict scope", finding.riskAcceptedScopeId === decisionScopeId);
    check("acceptance names the operator", finding.riskAcceptedBy === "current-user");

    check("second release refused (nothing left open)",
      procedureCode(() => runReleaseProcedureWithStores(stores, "req-001", "run-001", "RISK_ACCEPTED", "current-user", "again"))
        === "RELEASE_TARGET_NOT_RELEASABLE");
  }

  // ── shape 2b: CRITICAL blocking finding is not risk-acceptable ──
  {
    const fx = makeFixture("run-002", "req-002");
    seedGatePwrStop(fx, "CRITICAL");
    check("critical blocking finding refuses release",
      procedureCode(() => runReleaseProcedureWithStores(
        (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } => ({ runStore: fx.runStore, artifactStore: fx.artifactStore }),
        "req-002", "run-002", "RISK_ACCEPTED", "current-user", "n",
      )) === "RELEASE_CRITICAL_FINDING");
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

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
