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
import { createLoopRequirementChangeRecord } from "../../core/loop-change-classification";
import type { LoopCapabilityExecutionEvent } from "../../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_POINTS, type NodeCapabilityId } from "../../loop/types";
import type { FactScript, NodeFact } from "./types";
import { runtimeRunId } from "./types";
import { sha256 } from "./manual-face";

const TS = "2026-09-20T00:00:00.000Z";
/**
 * Distinct per-event timestamps (T5 pattern). A shared clock makes the
 * invalidation-edge recovery undecidable — the projector recovers a finding's
 * registering event by createdAt matching and refuses on multi-candidate
 * collisions (RC1-1) — and the finding's own createdAt IS the scan terminal's
 * (the membership receipt).
 */
const stamp = (n: number): string => new Date(Date.parse(TS) + n * 1000).toISOString();

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
    createdAt: stamp(sequence),
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
  /**
   * The run's STORE-assigned finding ids (journal fact, read from the store at
   * the end). The artifact comparator's D-17 id exemption is proven against
   * this set (R1-H3): a closure row's id flip is forgiven only for an id that
   * is actually one of these.
   */
  readonly findingIds: readonly string[];
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
  intermediateManifestText?: string,
): StoreLevelResult {
  mkdirSync(libDir, { recursive: true });
  // The projector never creates a manifest (creation belongs to intake —
  // core/loop-manifest-projector.ts:1087). The runtime-side shape for EVERY
  // scenario is therefore TAKEOVER: the manual face's manifest (intake-created,
  // declaration-driven, projected_through=MANUAL) is placed as the takeover
  // baseline and the projector re-derives every row from journal + store,
  // judging consistency (T5 takeover-B pattern).
  //
  // S-MANIFEST reconcile: with a mid-takeover checkpoint the baseline is the
  // INTERMEDIATE manual manifest — the takeover projection runs there (the
  // journal prefix vs the manual prefix) and the remaining nodes are caught
  // up by the FINAL projection on the same library dir (V9: the journal tail
  // and a finding delta land in one publish).
  const midTakeover = script.midTakeoverAfter;
  if (midTakeover === undefined) {
    writeFileSync(join(libDir, "manifest.md"), manualManifestText, "utf8");
  }
  // S-MANIFEST corrupt: a tampered baseline's self-digest must fail closed.
  if (script.tamperTakeoverBaseline === true) {
    const tampered = manualManifestText.replace(
      /(manifest_digest:\s*sha256:)([0-9a-f]{64})/,
      (_match, prefix: string, digest: string) => `${prefix}${digest.startsWith("0") ? "1" : "0"}${digest.slice(1)}`,
    );
    writeFileSync(join(libDir, "manifest.md"), tampered, "utf8");
  }
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

  // Gate-round finding lifecycle (d087 / T5-ACCEPTED patterns). REGISTRATION
  // happens at the SCAN terminal — the gateway-era membership receipt (the
  // finding's createdAt IS the scan terminal's) and BEFORE any verdict: a
  // finding registered after a PWR verdict would invalidate the very gate
  // revision that verdict authored. SETTLEMENT happens at the verdict:
  // resolve (rework wave: binds the re-adjudicating PASS revision) or accept
  // (PWR: the ruling risk-accepts the scan-source finding under its own
  // decision scope with the ruling's Gate Result blob as evidence).
  const findingSequences = new Map<string, number>();
  const settledFindingIds = new Set<string>();
  let rollbackBaseline: string | undefined;
  // Re-gate rounds are counted PER STAGE, never shared across the flow: the
  // solution-gate stage and the code-review stage each keep their own rework
  // round counter (both stages can trigger a re-gate, but their round numbers
  // are independent sequences — Current User ruling 2026-09-22).
  let gateRoundCounter = 0;
  let reviewRoundCounter = 0;
  /**
   * Registers the findings a node's completion discovers (registerAfter names
   * the node). Gate rounds pass their scan-ledger blob (a scan-sourced
   * finding's evidence IS the consumed ledger — the only origin the
   * risk-acceptance path admits); non-gate rounds (code-review rework)
   * anchor to their own artifact. terminalCreatedAt is the producing
   * terminal's own timestamp — the invalidation-edge recovery identifies the
   * registering event by it, so it must match exactly one terminal.
   */
  const registerNodeFindings = (
    node: NodeFact,
    ledger: { artifactRef: string; digest: string } | null,
    terminalCreatedAt: string,
  ): void => {
    // The finding's round fields refer to ITS OWN stage's counter — the stage
    // where it registers (and settles).
    const stageRound = node.node === "solution-gate" ? gateRoundCounter : reviewRoundCounter;
    for (const finding of script.findings) {
      if (finding.registerAfter !== node.node || findingSequences.has(finding.findingId)) continue;
      // Multi-round waves register one finding per stage round; a finding
      // whose round has not been reached yet waits for that round's terminal.
      if ((finding.gateRound ?? 1) > stageRound) continue;
      const findingSequence = findingSequences.size + 1;
      findingSequences.set(finding.findingId, findingSequence);
      // A scan-sourced finding's evidence IS the consumed Finding Ledger (the
      // only origin the risk-acceptance path admits); other rounds anchor to
      // their own node artifact.
      const scanSourced = finding.evidenceKind === "capability_findings" && ledger !== null;
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
          evidenceRef: scanSourced ? ledger!.artifactRef : `loop-artifact:v1:${finding.evidenceKind}:sha256:${sha256(finding.evidenceContent)}`,
          evidenceDigest: scanSourced ? ledger!.digest : sha256(finding.evidenceContent),
          earliestAffectedNodeId: finding.earliest as NodeCapabilityId,
          // The membership receipt: the finding's createdAt IS the producing
          // terminal's own (a later borrower is refused).
          createdAt: terminalCreatedAt,
        }),
      );
    }
  };
  /** Whether this node's completion discovers a yet-unregistered finding. */
  const nodeCompletionBlocks = (node: NodeFact): boolean =>
    script.findings.some(
      (finding) => finding.registerAfter === node.node && !findingSequences.has(finding.findingId),
    );
  /**
   * The WP-1 FEEDBACK_DRIVEN_CHANGE record (the re-gate path that needs no
   * finding): external feedback closes the current generation and opens the
   * next, so the feedback wave restarts at the first lagging node — a full
   * rebuild from requirement-intake that subsumes any finding-driven scope.
   */
  const recordFeedbackChange = (node: NodeFact, terminalCreatedAt: string): void => {
    if (node.opensFeedbackChange !== true) return;
    const previousGeneration = stores.runStore.getRunGeneration(runId);
    stores.runStore.appendRequirementChange(
      createLoopRequirementChangeRecord({
        runId,
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
            observedAt: terminalCreatedAt,
          },
        ],
        triggerEvidence: ["source:g6-parity-feedback"],
        classificationReason: "外部反馈开启新代际",
        blockedReasonCode: null,
        createdAt: terminalCreatedAt,
      }),
    );
  };
  const settleFindingActions = (
    node: NodeFact,
    ruling: { scopeId: string } | null,
    gateRound: number,
    onlyRoundSettled = false,
  ): void => {
    const gatePassing =
      node.node === "solution-gate" && (node.gateResult === "PASS" || node.gateResult === "PASS_WITH_RISK");
    for (const finding of script.findings) {
      if (finding.resolveAfter !== node.node || finding.action === undefined) continue;
      if (!findingSequences.has(finding.findingId) || settledFindingIds.has(finding.findingId)) continue;
      // Findings close at THEIR confirming round (persistent-set model): a
      // finding with closedAtRound settles at that round's verdict terminal
      // (pass or FAIL — the closure validation is revision/evidence-based,
      // verdict outcome does not participate); without it, the M1 shape:
      // settle at the first passing gate round.
      if (finding.closedAtRound !== undefined) {
        if (finding.closedAtRound !== gateRound) continue;
      } else if (onlyRoundSettled) {
        // The scan-terminal pass closes ONLY this round's confirmed findings;
        // M1-shape findings (no closedAtRound) settle at the verdict terminal.
        continue;
      } else if (node.node === "solution-gate" && !gatePassing) {
        continue;
      }
      const findingId = loopFindingId(runId, findingSequences.get(finding.findingId)!);
      // The closure evidence is the SCRIPT-DECLARED artifact — the same one
      // the manual face cites — not implicitly the settling node's output.
      // The real flows prove the spread: a gate-round finding closes on the
      // round's gate artifact, a review-local finding on the RE-REVIEW
      // artifact, and a design-level finding (even when discovered at the
      // review) on the DESIGN artifact that fixed it (wms-monitor
      // lifecycle-actions CR-F12: closure evidence = the design artifact,
      // bound = the design revision). The store verifies the blob exists.
      const evidenceRef = `loop-artifact:v1:${finding.action.evidenceKind}:sha256:${sha256(finding.action.evidenceContent)}`;
      const evidenceDigest = sha256(finding.action.evidenceContent);
      if (finding.action.action === "accept") {
        if (ruling === null) throw new Error(`no PWR ruling to accept the risk of ${finding.findingId}`);
        stores.runStore.acceptFindingRisk(runId, findingId, {
          riskAcceptedBy: "formal_verdict",
          riskAcceptanceEvidenceRef: evidenceRef,
          riskAcceptanceEvidenceDigest: evidenceDigest,
          decisionScopeId: ruling.scopeId,
        });
      } else {
        // The closure revision is the script-declared bound revision (the
        // revision that fixed it — the confirming round's design or
        // implementation revision, or the re-adjudicating gate revision in
        // the M1 single-wave shape). The store enforces existence,
        // currency and earliest-node ordering.
        const boundId = finding.action.boundRevisionId;
        const revisions = stores.runStore.listArtifactRevisions(runId);
        if (!revisions.some((item) => item.revisionId === boundId)) {
          throw new Error(`bound closure revision ${boundId} of ${finding.findingId} does not exist in the run`);
        }
        stores.runStore.resolveFinding(runId, findingId, {
          resolvedByNodeId: finding.discoveredAt as NodeCapabilityId,
          resolvedByRevisionId: boundId,
          resolutionEvidenceRef: evidenceRef,
          resolutionEvidenceDigest: evidenceDigest,
        });
      }
      settledFindingIds.add(finding.findingId);
    }
  };

  const projectNow = (baselineText?: string): void => {
    if (baselineText !== undefined) {
      writeFileSync(join(libDir, "manifest.md"), baselineText, "utf8");
    }
    const mid = projectLoopManifest({
      store: stores.runStore,
      runId,
      requirementId: script.requirementId,
      libraryDir: libDir,
    });
    if (mid.kind === "STOP") {
      throw new Error(`projector STOP ${mid.code}: ${mid.reason}`);
    }
  };
  let midTakeoverDone = false;
  const checkpointProjection = (node: NodeFact, baselineText: string | undefined): void => {
    if (midTakeover === undefined || node.node !== midTakeover || midTakeoverDone) return;
    midTakeoverDone = true;
    if (baselineText === undefined) {
      throw new Error(`mid-takeover checkpoint ${midTakeover} has no intermediate manual snapshot`);
    }
    projectNow(baselineText);
    if (script.loseManifestWrite === true) {
      // S-CRASH pre-manifest-write: the takeover has PUBLISHED (provenance +
      // cursor). The crash point is the catch-up's LOST WRITE — so the state
      // to roll back to is the taken-over document, captured after the
      // checkpoint projection. Rolling back to the manual baseline instead
      // would turn the resume into a fresh takeover reconciling the FULL
      // journal against the intermediate manifest (a guaranteed drift).
      rollbackBaseline = readFileSync(join(libDir, "manifest.md"), "utf8");
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
        node.ledgerContent ??
          `${JSON.stringify({ schema: "loop-capability-findings:v1", findings: [] })}\n`,
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
      materializeProducerRevision(stores.runStore, script.requirementId, runId, scanSucceeded, () => scanSucceeded.createdAt);
      lastOutput.set(pointKey("solution-gate", "adversarial_scan"), {
        ref: stored.artifactRef,
        version: node.version,
        digest,
      });
      gateRoundCounter += 1;
      // The re-review first CLOSES what it confirms (binding the revision that
      // fixed them — still current at this point), THEN registers what it
      // newly discovered: the new finding's invalidation would otherwise stale
      // that very revision before the closures bind it.
      settleFindingActions(node, null, gateRoundCounter, true);
      // Gate-round findings register at the SCAN terminal (membership receipt
      // + before the verdict can author a gate revision).
      registerNodeFindings(node, { artifactRef: ledger.artifactRef, digest: ledger.digest }, scanSucceeded.createdAt);

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
      materializeProducerRevision(stores.runStore, script.requirementId, runId, verdictTerminal, () => verdictTerminal.createdAt);
      lastOutput.set(pointKey("solution-gate", "formal_verdict"), {
        ref: stored.artifactRef,
        version: node.version,
        digest,
      });
      // The failing round's finding stays OPEN (it authorizes the rework
      // restart); the re-adjudicating PASS round resolves it; a PWR ruling
      // risk-accepts the scan-source finding.
      settleFindingActions(
        node,
        verdictTerminal.decisionScopeId === null ? null : { scopeId: verdictTerminal.decisionScopeId },
        gateRoundCounter,
      );
      recordFeedbackChange(node, verdictTerminal.createdAt);
      checkpointProjection(node, intermediateManifestText);
      continue;
    }

    const nodePointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
      (point) => point.capability === node.node && point.executionRole === "primary",
    );
    const nodeInput = upstreamInputFor(nodePointIndex);
    // A completion that discovers a finding blocks the chain: the canonical
    // advance requires the predecessor's eligibility=ELIGIBLE, so the rework
    // restart must be authorized by the OPEN finding (the regate context
    // derives it from journal facts, exactly like the gate rework wave).
    if (node.node === "code-review") reviewRoundCounter += 1;
    const blocksChain = nodeCompletionBlocks(node);
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
      nextStepEligibility: blocksChain ? "BLOCKED" : "ELIGIBLE",
    });
    sequence += 1;
    stores.runStore.appendCapabilityExecution(started);
    stores.runStore.appendCapabilityExecution(succeeded);
    materializeProducerRevision(stores.runStore, script.requirementId, runId, succeeded, () => succeeded.createdAt);
    lastOutput.set(pointKey(node.node, "primary"), { ref: stored.artifactRef, version: node.version, digest });
    // Same settle-then-register order as the gate round: the re-review first
    // CLOSES what it confirms (binding the revision that fixed them — still
    // current at this point), THEN registers what it newly discovers.
    settleFindingActions(node, null, node.node === "code-review" ? reviewRoundCounter : 0);
    registerNodeFindings(node, null, succeeded.createdAt);
    recordFeedbackChange(node, succeeded.createdAt);
    checkpointProjection(node, intermediateManifestText);
  }

  // The crash resume: one projection bringing the manifest to the journal
  // head (the catch-up after the live takeover).
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
  let manifestText = readFileSync(manifestPath, "utf8");
  if (rollbackBaseline !== undefined) {
    // The catch-up's write was lost: restore the taken-over state and let the
    // resume re-derive the document — it MUST be byte-identical to the
    // computation whose write was lost (a crash must not change the result).
    const lostWriteText = manifestText;
    writeFileSync(manifestPath, rollbackBaseline, "utf8");
    const resume = projectLoopManifest({
      store: stores.runStore,
      runId,
      requirementId: script.requirementId,
      libraryDir: libDir,
    });
    if (resume.kind === "STOP") {
      throw new Error(`projector STOP ${resume.code}: ${resume.reason}`);
    }
    manifestText = readFileSync(manifestPath, "utf8");
    if (manifestText !== lostWriteText) {
      throw new Error("crash resume after the lost write is not byte-identical to the lost computation");
    }
  }
  if (script.resumeTwice === true) {
    // S-CRASH double-resume idempotence: the second resume must be a NO_OP
    // leaving the document byte-identical.
    const again = projectLoopManifest({
      store: stores.runStore,
      runId,
      requirementId: script.requirementId,
      libraryDir: libDir,
    });
    if (again.kind !== "NO_OP") {
      throw new Error(`double resume expected NO_OP, got ${again.kind}`);
    }
    if (readFileSync(manifestPath, "utf8") !== manifestText) {
      throw new Error("double resume is not byte-identical");
    }
  }
  return {
    manifestPath,
    manifestText,
    findingIds: stores.runStore.listFindings(runId).map((finding) => finding.findingId),
  };
}
