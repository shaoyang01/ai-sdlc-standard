// G6 / D-090-04 offline parity harness — runtime face drivers
// ============================================================================
// Two drivers per frozen spec §4.2 (two-layer comparison, ruling B):
//   driveRuntimeStoreLevel  — artifact layer: T5-pattern same-fact journal
//     events (carrying the manual face's raw-content digests) + projector.
//   driveRuntimeFullChain   — behavior layer: the production entry itself
//     (runProduction, deterministic capability source, scripted gateway).
//     [M2 milestone: implemented after the artifact layer is green]
//
// The digest-covering-objects discovery (frozen spec §4.2): the real gateway's
// journal outputDigest covers the loop-capability-output:v1 ENVELOPE, while the
// manual publisher declares sha256(raw artifact content). The store-level
// driver carries the same raw digests as the manual face (T5 discipline), so
// the artifact layer compares digests byte-exact.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoopArtifactStore } from "../../core/loop-artifact-store";
import { LoopRunStore } from "../../core/loop-run-store";
import { projectLoopManifest } from "../../core/loop-manifest-projector";
import { materializeProducerRevision } from "../../runtime";
import { createLoopFinding, loopFindingId, type LoopFindingCategory } from "../../core/loop-finding-lifecycle";
import type { LoopCapabilityExecutionEvent } from "../../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_POINTS, type NodeCapabilityId } from "../../loop/types";
import type { FactScript, NodeFact } from "./types";
import { runtimeRunId } from "./types";
import { sha256 } from "./manual-face";

const TS = "2026-09-20T00:00:00.000Z";

export interface RuntimeStores {
  readonly root: string;
  readonly repo: string;
  readonly runStore: LoopRunStore;
  readonly artifactStore: LoopArtifactStore;
}

export function makeStores(tag: string): RuntimeStores {
  const root = mkdtempSync(join(tmpdir(), `g6-${tag}-`));
  const repo = join(root, "repo");
  const control = join(root, "control");
  mkdirSync(repo, { recursive: true });
  const artifactStore = new LoopArtifactStore({ controlRoot: control, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { root, repo, runStore, artifactStore };
}

function event(
  runId: string,
  over: Partial<LoopCapabilityExecutionEvent> & { sequence: number; status: string },
): LoopCapabilityExecutionEvent {
  const capability = (over.capability ?? "requirement-intake") as NodeCapabilityId;
  const sequence = over.sequence;
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: over.executionEventId ?? `${runId}:capability:${sequence}:${over.status}`,
    runId,
    sequence,
    capability,
    executionRole: over.executionRole ?? "primary",
    nodeId: over.nodeId ?? capability,
    attempt: over.attempt ?? 1,
    status: over.status as LoopCapabilityExecutionEvent["status"],
    createdAt: TS,
    bindingId:
      over.bindingId ??
      `binding-${over.executorAgent ?? "codex"}-${capability}-${over.executionRole ?? "primary"}`,
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: over.executorAgent ?? "codex",
    executorAdapter: "codex-real-dispatch",
    executorVersion: "1.0.0",
    inputArtifactRef: over.inputArtifactRef ?? null,
    inputArtifactVersion: over.inputArtifactVersion ?? null,
    inputDigest: over.inputDigest ?? null,
    outputArtifactRef: over.outputArtifactRef ?? null,
    outputArtifactVersion: over.outputArtifactVersion ?? null,
    outputDigest: over.outputDigest ?? null,
    gateResult: over.gateResult ?? null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    consumedFindingsRef: null,
    consumedFindingsDigest: null,
    decisionDepth: over.decisionDepth ?? null,
    decisionStatus: over.decisionStatus ?? null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
    nextStepEligibility: over.nextStepEligibility ?? null,
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
    ...over,
  }) as LoopCapabilityExecutionEvent;
}

/** Creates the run identity + run_started event. */
function startRun(stores: RuntimeStores, requirementId: string): string {
  const runId = runtimeRunId(requirementId);
  stores.runStore.createRun({
    runId,
    requirementId,
    repository: "logistics-parity-fixture",
    repositoryPath: stores.repo,
    baseBranch: "main",
    expectedBaseSha: "0".repeat(40),
    taskBranch: `parity/${runId}`,
    controlRoot: join(stores.root, "control"),
    createdAt: TS,
  });
  stores.runStore.appendEvent({
    eventId: `${runId}:2:run_started`,
    runId,
    sequence: 2,
    kind: "run_started",
    stage: null,
    attempt: 0,
    createdAt: TS,
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
  return runId;
}

export interface StoreLevelResult {
  readonly manifestPath: string;
  readonly manifestText: string;
}

/** One execution point's last succeeded output (canonical-advance + restart inputs). */
interface PointOutput {
  readonly ref: string;
  readonly version: string;
  readonly digest: string;
}

function pointKey(capability: string, executionRole: string): string {
  return `${capability}:${executionRole}`;
}

/**
 * Artifact-layer driver: replays the fact script as journal events carrying
 * the SAME raw-content digests the manual face declares (T5 discipline), then
 * projects the manifest through the real projector.
 */
export function driveRuntimeStoreLevel(
  stores: RuntimeStores,
  script: FactScript,
  libDir: string,
  manualManifestText: string,
): StoreLevelResult {
  mkdirSync(libDir, { recursive: true });
  // The projector never creates a manifest (creation belongs to intake —
  // core/loop-manifest-projector.ts:1087). The runtime-side shape for EVERY
  // scenario is therefore TAKEOVER: the manual face's manifest (intake-created,
  // declaration-driven, projected_through=MANUAL) is placed as the takeover
  // baseline and the projector re-derives every row from journal + store,
  // judging consistency (T5 takeover-B pattern).
  writeFileSync(join(libDir, "manifest.md"), manualManifestText, "utf8");
  const runId = startRun(stores, script.requirementId);
  let sequence = 1;
  // The first capability execution requires a non-null input ref (journal
  // validation); seed the requirement input. Input refs are journal-face
  // fields, not manifest entry fields — they do not enter the comparison.
  const requirementInput = stores.artifactStore.put(
    "requirement_summary" as Parameters<LoopArtifactStore["put"]>[0],
    `# ${script.requirementId} requirement input\n`,
  );
  // The canonical input rule (chain validator): a canonical advance consumes
  // the predecessor's effective output; a generation restart (the rework
  // wave's backward jump) consumes the REUSED upstream output — the last
  // succeeded output of the point immediately before the restart target.
  // Tracking per execution point (not per script node) is what makes the
  // rework wave's design-v2 input the intake output rather than the failed
  // gate round's artifact.
  const lastOutput = new Map<string, PointOutput>();
  const upstreamInputFor = (pointIndex: number): PointOutput => {
    if (pointIndex <= 0) {
      return { ref: requirementInput.artifactRef, version: "1.0.0", digest: requirementInput.digest };
    }
    const point = LOOP_CAPABILITY_EXECUTION_POINTS[pointIndex - 1]!;
    const output = lastOutput.get(pointKey(point.capability, point.executionRole));
    if (output === undefined) {
      throw new Error(`no succeeded output for upstream point ${point.capability}:${point.executionRole}`);
    }
    return output;
  };

  // Gate-round finding lifecycle (d087 pattern): a gate finding registers at
  // the FAILING verdict — its registration invalidates the examined design
  // current, which is what authorizes the rework restart — and resolves at
  // the re-adjudicating PASS verdict, binding that round's revision and
  // verdict artifact as the closure evidence. `output` is the completing
  // node's own artifact (the closure evidence for a gate finding).
  const findingSequences = new Map<string, number>();
  const resolvedFindingIds = new Set<string>();
  const settleFindings = (node: NodeFact, output: PointOutput): void => {
    const gatePassing =
      node.node === "solution-gate" && (node.gateResult === "PASS" || node.gateResult === "PASS_WITH_RISK");
    const gateFailing = node.node === "solution-gate" && node.gateResult === "FAIL";
    for (const finding of script.findings) {
      if (
        finding.registerAfter === node.node &&
        !findingSequences.has(finding.findingId) &&
        (node.node !== "solution-gate" || gateFailing)
      ) {
        const findingSequence = findingSequences.size + 1;
        findingSequences.set(finding.findingId, findingSequence);
        stores.runStore.appendFinding(
          createLoopFinding({
            runId,
            requirementId: script.requirementId,
            sequence: findingSequence,
            sourceCapability: finding.discoveredAt as NodeCapabilityId,
            sourceRevisionId: finding.sourceRevisionId,
            causeKind: "IMPROVEMENT",
            introducedByRevisionId: null,
            severity: "MEDIUM",
            category: finding.category as LoopFindingCategory,
            evidenceRef: `loop-artifact:v1:${finding.evidenceKind}:sha256:${sha256(finding.evidenceContent)}`,
            evidenceDigest: sha256(finding.evidenceContent),
            earliestAffectedNodeId: finding.earliest as NodeCapabilityId,
            createdAt: TS,
          }),
        );
        continue;
      }
      if (
        finding.resolveAfter === node.node &&
        finding.action !== undefined &&
        findingSequences.has(finding.findingId) &&
        !resolvedFindingIds.has(finding.findingId) &&
        (node.node !== "solution-gate" || gatePassing)
      ) {
        const gateRevision = stores.runStore
          .listArtifactRevisions(runId)
          .filter((item) => item.nodeId === "solution-gate")
          .sort((a, b) => b.sequence - a.sequence)[0];
        if (gateRevision === undefined) {
          throw new Error(`no gate revision to bind the closure of ${finding.findingId}`);
        }
        stores.runStore.resolveFinding(runId, loopFindingId(runId, findingSequences.get(finding.findingId)!), {
          resolvedByNodeId: finding.discoveredAt as NodeCapabilityId,
          resolvedByRevisionId: gateRevision.revisionId,
          resolutionEvidenceRef: output.ref,
          resolutionEvidenceDigest: output.digest,
        });
        resolvedFindingIds.add(finding.findingId);
      }
    }
  };

  for (const node of script.nodes) {
    const attempt = node.attempt ?? 1;
    const stored = stores.artifactStore.put(
      node.artifactKind as Parameters<LoopArtifactStore["put"]>[0],
      node.content,
    );
    const digest = stored.digest;

    if (node.node === "solution-gate") {
      // Dual-binding node: adversarial_scan (ledger-consuming scan) then
      // formal_verdict (hermes, carries the verdict fields) — T5 pattern.
      const ledger = stores.artifactStore.put(
        "capability_findings" as Parameters<LoopArtifactStore["put"]>[0],
        `[] ledger for ${script.requirementId}`,
      );
      const scanPointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
        (point) => point.capability === "solution-gate" && point.executionRole === "adversarial_scan",
      );
      const scanInput = upstreamInputFor(scanPointIndex);
      const scanStarted = event(runId, {
        sequence: sequence++,
        status: "started",
        capability: "solution-gate" as NodeCapabilityId,
        executionRole: "adversarial_scan",
        attempt,
        inputArtifactRef: scanInput.ref,
        inputArtifactVersion: scanInput.version,
        inputDigest: scanInput.digest,
      });
      const scanSucceeded = event(runId, {
        ...scanStarted,
        executionEventId: `${runId}:capability:${sequence}:succeeded`,
        sequence,
        status: "succeeded",
        outputArtifactRef: stored.artifactRef,
        outputArtifactVersion: node.version,
        outputDigest: digest,
        gateResult: "NOT_APPLICABLE",
        nextStepEligibility: "ELIGIBLE",
        unresolvedFindingsRef: ledger.artifactRef,
        unresolvedFindingsDigest: ledger.digest,
      });
      sequence += 1;
      stores.runStore.appendCapabilityExecution(scanStarted);
      stores.runStore.appendCapabilityExecution(scanSucceeded);
      materializeProducerRevision(stores.runStore, script.requirementId, runId, scanSucceeded, () => TS);
      lastOutput.set(pointKey("solution-gate", "adversarial_scan"), {
        ref: stored.artifactRef,
        version: node.version,
        digest,
      });

      // Verdict terminal shape (canonical production model): the formal_verdict
      // ALWAYS ends succeeded — it renders the decision (a verdict never ends
      // blocked, and a FAIL adjudication is a rendered decision, not a failed
      // execution; WP6: "a SUCCEEDED verdict must materialize its decision
      // triple even when the adjudication is FAIL"). The decision triple rides
      // on the event verbatim (frozen contract §4.3 v5 table): CONFIRMED with
      // a non-null depth; BLOCKED_UNKNOWN with an explicit null depth. A
      // non-passing verdict authors NO node revision (materializeProducerRevision
      // WP6 rule: the artifact-revision contract admits only conclusive passing
      // Gates) — the gate row then keeps the scan-round shape and the chain is
      // sealed (nextStepEligibility=BLOCKED; the chain validator admits no
      // canonical successor after a non-ELIGIBLE verdict).
      const failedGate = node.gateResult === "FAIL";
      const verdictEligibility = failedGate ? "BLOCKED" : "ELIGIBLE";
      const delta = stores.artifactStore.put(
        "solution_review" as Parameters<LoopArtifactStore["put"]>[0],
        `depth=${node.decisionDepth ?? "STANDARD"} decision delta for ${runId}`,
      );
      const verdictStarted = event(runId, {
        sequence: sequence++,
        status: "started",
        capability: "solution-gate" as NodeCapabilityId,
        executionRole: "formal_verdict",
        attempt,
        inputArtifactRef: stored.artifactRef,
        inputArtifactVersion: node.version,
        inputDigest: digest,
        executorAgent: "hermes",
        executorAdapter: "hermes-cli",
        bindingId: "binding-hermes-solution-gate-formal_verdict",
        consumedFindingsRef: ledger.artifactRef,
        consumedFindingsDigest: ledger.digest,
      });
      // BLOCKED_UNKNOWN = the verdict cannot be graded: the formal_verdict
      // still SUCCEEDS (it renders the "cannot grade" decision) with
      // decisionStatus=BLOCKED_UNKNOWN and an explicit null decisionDepth —
      // a missing depth is a different fact and fails (frozen contract §4.3).
      // The gate adjudication for an ungradable verdict is FAIL (G5-T2
      // projector: "UNKNOWN verdict folds a null decision_depth with the FAIL
      // adjudication"). Verdict terminal shapes (store validation): succeeded
      // = full decision set (status + depth-or-explicit-null + scope + delta);
      // a failed/blocked verdict terminal is illegal — it renders a decision.
      const verdictTerminal = event(runId, {
        ...verdictStarted,
        executionEventId: `${runId}:capability:${sequence}:succeeded`,
        sequence,
        status: "succeeded",
        outputArtifactRef: stored.artifactRef,
        outputArtifactVersion: node.version,
        outputDigest: digest,
        gateResult: node.gateResult ?? "NOT_APPLICABLE",
        decisionDepth: node.decisionDepth ?? null,
        decisionStatus: node.decisionStatus ?? null,
        decisionScopeId: `${runId}:decision:1`,
        decisionDeltaRef: delta.artifactRef,
        decisionDeltaDigest: delta.digest,
        nextStepEligibility: verdictEligibility as "ELIGIBLE" | "INELIGIBLE" | "BLOCKED",
        errorCode: null,
      });
      sequence += 1;
      stores.runStore.appendCapabilityExecution(verdictStarted);
      stores.runStore.appendCapabilityExecution(verdictTerminal);
      materializeProducerRevision(stores.runStore, script.requirementId, runId, verdictTerminal, () => TS);
      lastOutput.set(pointKey("solution-gate", "formal_verdict"), {
        ref: stored.artifactRef,
        version: node.version,
        digest,
      });
      // The failing round registers the gate finding (authorizing the rework
      // restart); the re-adjudicating PASS round resolves it.
      settleFindings(node, { ref: stored.artifactRef, version: node.version, digest });
      continue;
    }

    const nodePointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
      (point) => point.capability === node.node && point.executionRole === "primary",
    );
    const nodeInput = upstreamInputFor(nodePointIndex);
    const started = event(runId, {
      sequence: sequence++,
      status: "started",
      capability: node.node as NodeCapabilityId,
      attempt,
      inputArtifactRef: nodeInput.ref,
      inputArtifactVersion: nodeInput.version,
      inputDigest: nodeInput.digest,
    });
    const succeeded = event(runId, {
      ...started,
      executionEventId: `${runId}:capability:${sequence}:succeeded`,
      sequence,
      status: "succeeded",
      outputArtifactRef: stored.artifactRef,
      outputArtifactVersion: node.version,
      outputDigest: digest,
      gateResult: node.gateResult ?? "NOT_APPLICABLE",
      decisionDepth: node.decisionDepth ?? null,
      decisionStatus: node.decisionStatus ?? null,
      nextStepEligibility: "ELIGIBLE",
    });
    sequence += 1;
    stores.runStore.appendCapabilityExecution(started);
    stores.runStore.appendCapabilityExecution(succeeded);
    materializeProducerRevision(stores.runStore, script.requirementId, runId, succeeded, () => TS);
    lastOutput.set(pointKey(node.node, "primary"), { ref: stored.artifactRef, version: node.version, digest });
    settleFindings(node, { ref: stored.artifactRef, version: node.version, digest });
  }

  const outcome = projectLoopManifest({
    store: stores.runStore,
    runId,
    requirementId: script.requirementId,
    libraryDir: libDir,
  });
  if (outcome.kind === "STOP") {
    throw new Error(`projector STOP ${outcome.code}: ${outcome.reason}`);
  }
  const manifestPath = join(libDir, "manifest.md");
  return { manifestPath, manifestText: readFileSync(manifestPath, "utf8") };
}
