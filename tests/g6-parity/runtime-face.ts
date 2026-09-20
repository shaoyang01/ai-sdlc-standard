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
import { extractManifestYaml, projectLoopManifest, sealManifest } from "../../core/loop-manifest-projector";
import { dumpRubyYaml, parseRubyYaml } from "../../core/loop-manifest-yaml";
import { materializeProducerRevision } from "../../runtime";
import type { LoopCapabilityExecutionEvent } from "../../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../../core/loop-capability-execution";
import type { NodeCapabilityId } from "../../loop/types";
import type { FactScript } from "./types";
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
  const runId = `g6-${requirementId}`;
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

/**
 * Artifact-layer driver: replays the fact script as journal events carrying
 * the SAME raw-content digests the manual face declares (T5 discipline), then
 * projects the manifest through the real projector.
 */
export function driveRuntimeStoreLevel(
  stores: RuntimeStores,
  script: FactScript,
  libDir: string,
  seedManifestText: string,
): StoreLevelResult {
  mkdirSync(libDir, { recursive: true });
  // Both faces start from the manual init's seed (requirement-intake holds the
  // manifest-creation duty per contract; DP4 never rebuilds). The runtime face
  // re-bases the seed to a runtime cursor: projected_through must be NUMERIC
  // (0 = nothing projected yet, so the whole journal is the catch-up tail) —
  // a MANUAL cursor marks a takeover state, which is a different protocol path.
  const seedDoc = parseRubyYaml(extractManifestYaml(seedManifestText));
  const { manifest_digest: _staleDigest, ...withoutDigest } = seedDoc;
  const rebased = sealManifest({ ...withoutDigest, projected_through: 0, publish_seq: 0 });
  writeFileSync(join(libDir, "manifest.md"), dumpRubyYaml(rebased), "utf8");
  const runId = startRun(stores, script.requirementId);
  let sequence = 1;
  // The first capability execution requires a non-null input ref (journal
  // validation); seed the requirement input. Input refs are journal-face
  // fields, not manifest entry fields — they do not enter the comparison.
  const requirementInput = stores.artifactStore.put(
    "requirement_summary" as Parameters<LoopArtifactStore["put"]>[0],
    `# ${script.requirementId} requirement input\n`,
  );
  let previousRef: string | null = requirementInput.artifactRef;
  let previousDigest: string | null = requirementInput.digest;

  for (const node of script.nodes) {
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
      const scanStarted = event(runId, {
        sequence: sequence++,
        status: "started",
        capability: "solution-gate" as NodeCapabilityId,
        executionRole: "adversarial_scan",
        inputArtifactRef: previousRef,
        inputArtifactVersion: previousRef ? "1.0.0" : null,
        inputDigest: previousDigest,
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

      const delta = stores.artifactStore.put(
        "solution_review" as Parameters<LoopArtifactStore["put"]>[0],
        `depth=${node.decisionDepth ?? "STANDARD"} decision delta for ${runId}`,
      );
      const verdictStarted = event(runId, {
        sequence: sequence++,
        status: "started",
        capability: "solution-gate" as NodeCapabilityId,
        executionRole: "formal_verdict",
        inputArtifactRef: stored.artifactRef,
        inputArtifactVersion: node.version,
        inputDigest: digest,
        executorAgent: "hermes",
        executorAdapter: "hermes-cli",
        bindingId: "binding-hermes-solution-gate-formal_verdict",
        consumedFindingsRef: ledger.artifactRef,
        consumedFindingsDigest: ledger.digest,
      });
      const verdictSucceeded = event(runId, {
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
        nextStepEligibility: "ELIGIBLE",
      });
      sequence += 1;
      stores.runStore.appendCapabilityExecution(verdictStarted);
      stores.runStore.appendCapabilityExecution(verdictSucceeded);
      materializeProducerRevision(stores.runStore, script.requirementId, runId, verdictSucceeded, () => TS);
      previousRef = stored.artifactRef;
      previousDigest = digest;
      continue;
    }

    const started = event(runId, {
      sequence: sequence++,
      status: "started",
      capability: node.node as NodeCapabilityId,
      inputArtifactRef: previousRef,
      inputArtifactVersion: previousRef ? "1.0.0" : null,
      inputDigest: previousDigest,
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
    previousRef = stored.artifactRef;
    previousDigest = digest;
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
