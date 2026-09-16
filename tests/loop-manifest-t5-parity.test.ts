// G5-T5 (D-090-03): manual/runtime parity + the residuals this task owns.
// EXECUTED scenarios — the list below IS the main() call list; keep them in
// sync (a header that outruns main() is a defect, not a summary):
//   1. scenarioManualRuntimeParity        gate #1 parity over a REAL manual trace
//   2. scenarioMismatchThroughDoor        level-2 divergence via the production door
//   3. scenarioDeferredThenPublish        real D-9 DEFERRED then publish
//   4. scenarioRealPublisherProductsReadable  title-less init + folded repair reason
//   5. scenarioRepairFullFlow             §6.2.6 repair end to end (corrected_entries)
//   6. scenarioAcceptedMixedV9            ACCEPTED mixed V9 (scan ledger + PWR
//                                         ruling + acceptFindingRisk + planning
//                                         tail in ONE atomic publish)
// NOT covered here (declared, with the owning task): D-21/§7.4 cross-face
// resolution (no T2 caller), cross-face legal lag (manual OPEN vs store
// RESOLVED).
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunEvent, LoopRunIdentity } from "../core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { createLoopFinding, loopFindingId } from "../core/loop-finding-lifecycle";
import { parseProductionEntryRequest, PRODUCTION_ENTRY_SCHEMA } from "../core/loop-production-entry";
import { runProduction } from "../runtime";
import { materializeProducerRevision } from "../runtime";
import { extractManifestYaml, projectLoopManifest, sealManifest } from "../core/loop-manifest-projector";
import { dumpRubyYaml, parseRubyYaml } from "../core/loop-manifest-yaml";

let passed = 0;
let failed = 0;
function ok(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TS = "2026-09-14T00:00:00.000Z";
const REQ = "req-t5-parity";
/** Distinct event timestamps (a shared clock makes the invalidation-edge
 * registration ambiguous, which the projector correctly refuses per RC1-1). */
const stamp = (n: number): string => new Date(Date.parse(TS) + n * 1000).toISOString();
const sha256 = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");

function identity(root: string, runId: string): LoopRunIdentity {
  return Object.freeze({
    runId,
    requirementId: REQ,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/t5",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

function runEvent(runId: string, sequence: number, kind: "run_started"): LoopRunEvent {
  return Object.freeze({
    eventId: `${runId}:${sequence}:${kind}`,
    runId,
    sequence,
    kind,
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
}

function event(runId: string, overrides: Partial<LoopCapabilityExecutionEvent> = {}): LoopCapabilityExecutionEvent {
  const sequence = overrides.sequence ?? 1;
  const status = overrides.status ?? "started";
  const capability = overrides.capability ?? "requirement-intake";
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: `${runId}:capability:${sequence}:${status}`,
    runId,
    sequence,
    capability,
    executionRole: overrides.executionRole ?? "primary",
    nodeId: capability,
    attempt: 1,
    status,
    createdAt: TS,
    bindingId: `binding-codex-${capability}-${overrides.executionRole ?? "primary"}`,
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: "codex",
    executorAdapter: "codex-real-dispatch",
    executorVersion: "1.0.0",
    inputArtifactRef: null,
    inputArtifactVersion: null,
    inputDigest: null,
    outputArtifactRef: null,
    outputArtifactVersion: null,
    outputDigest: null,
    gateResult: null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    consumedFindingsRef: null,
    consumedFindingsDigest: null,
    decisionDepth: null,
    decisionStatus: null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
    nextStepEligibility: null,
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
}

const PUBLISHER = join(process.cwd(), "scripts", "publish-requirement-manifest.sh");

function publisher(libDir: string, args: readonly string[]): void {
  execFileSync("bash", [PUBLISHER, libDir, ...args], { stdio: "pipe" });
}

/** Drives the REAL manual chain: init (the intake declaration) + finding
 * register + the design declaration + resolution. Identity fields use the
 * runtime revision-id form so both faces carry the same facts. Returns the
 * produced manifest text and the declared facts. */
function driveManualChain(libDir: string, runId: string, artifactStore: LoopArtifactStore): { manifestText: string; intakeDigest: string; designDigest: string; designContent: string; fixEvidence: { ref: string; digest: string } } {
  mkdirSync(libDir, { recursive: true });
  const designRevisionId = `${runId}:revision:solution-design:1`;
  const designDigest = sha256(`# ${REQ} design\n`);
  publisher(libDir, [
    "init", "--requirement-id", REQ, "--requested-depth", "STANDARD",
    "--depth-basis", "user_requested", "--decision-scope", "FULL_REQUIREMENT", "--title", "T5 parity fixture",
  ]);
  const intakeDigest = sha256(`# ${REQ} intake\n`);
  publisher(libDir, [
    "finding-register", "--finding-id", "T5-F01", "--discovered-at", "solution-design",
    "--category", "SOLUTION", "--earliest", "solution-design",
    "--source-revision", designRevisionId,
    "--evidence-ref", `loop-artifact:v1:technical_design:sha256:${designDigest}`,
  ]);
  publisher(libDir, [
    "entry-update", "--node", "requirement-intake", "--declaration-seq", "2",
    "--artifact-path", `00-需求资料/${REQ}_需求摘要.md`, "--version", "1.0.0",
    "--digest", intakeDigest, "--source-ref", `00-需求资料/${REQ}_需求摘要.md`,
  ]);
  publisher(libDir, [
    "entry-update", "--node", "solution-design", "--declaration-seq", "3",
    "--artifact-path", `01-技术方案/${REQ}_技术方案.md`, "--version", "1.0.0",
    "--digest", designDigest, "--source-ref", `01-技术方案/${REQ}_技术方案.md`,
  ]);
  const designV2Digest = sha256(`# ${REQ} design v2\n`);
  publisher(libDir, [
    "entry-update", "--node", "solution-design", "--declaration-seq", "4",
    "--artifact-path", `01-技术方案/${REQ}_技术方案.md`, "--version", "2.0.0",
    "--digest", designV2Digest, "--source-ref", `01-技术方案/${REQ}_技术方案.md`,
  ]);
  const fixStored = artifactStore.put("technical_design", "fix-evidence\n");
  publisher(libDir, [
    "finding-action", "--finding-id", "T5-F01", "--action", "resolve",
    "--closed-by", "solution-design", "--evidence-ref", fixStored.artifactRef,
    "--evidence-digest", fixStored.digest, "--bound-revision-id", `${runId}:revision:solution-design:2`,
  ]);
  return {
    manifestText: readFileSync(join(libDir, "manifest.md"), "utf8"),
    intakeDigest,
    designDigest,
    designContent: `# ${REQ} design\n`,
    fixEvidence: { ref: fixStored.artifactRef, digest: fixStored.digest },
  };
}

/** Normalized equivalence view (freeze §7.1 / D-4): face-only progress and
 * execution fields are dropped; identity/status/binding fields stay. */
function normalize(doc: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  for (const key of [
    "projection_provenance", "declaration_log", "publish_seq", "projected_through",
    "updated_at", "corrections", "repair_records", "manifest_digest",
  ]) {
    delete clone[key];
  }
  const entries = clone.entries as Record<string, unknown>[];
  for (const entry of entries) {
    delete entry.source_event_ref;
    delete entry.updated_at;
    delete entry.execution;
  }
  return clone;
}

async function scenarioManualRuntimeParity(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-parity-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo, { recursive: true });
    const libManual = join(root, "lib-manual");
    const artifactStore = new LoopArtifactStore({ controlRoot: join(root, "control"), repositoryPath: repo });
    artifactStore.init();
    const manual = driveManualChain(libManual, "run-t5-parity", artifactStore);
    ok(manual.manifestText.length > 100, "the real publisher produced the manual trace");

    // The manual OPEN→RESOLVED row is the durable truth; the runtime face
    // replays the SAME facts through journal + finding store and must judge
    // the manual manifest fully consistent (takeover-B).
    const runStore = new LoopRunStore(join(root, "control", "journal.db"), { artifactStore });
    runStore.init();
    const runId = "run-t5-parity";
    runStore.createRun(identity(root, runId));
    runStore.appendEvent(runEvent(runId, 2, "run_started"));

    // Runtime journal facts equal to the manual declarations (same digests).
    const designStored = artifactStore.put("technical_design", manual.designContent);
    const designRef = designStored.artifactRef;
    const intakeDigest = manual.intakeDigest;
    const intakeStored = artifactStore.put("requirement_summary", `# ${REQ} intake\n`);
    const intakeRef = intakeStored.artifactRef;
    const intakeStarted = event(runId, {
      sequence: 1, status: "started", capability: "requirement-intake",
      inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${"e".repeat(64)}`,
      inputArtifactVersion: "1.0.0", inputDigest: "e".repeat(64),
    });
    const intakeSucceeded = event(runId, {
      ...intakeStarted,
      executionEventId: `${runId}:capability:2:succeeded`,
      sequence: 2, status: "succeeded",
      outputArtifactRef: intakeRef, outputArtifactVersion: "1.0.0", outputDigest: intakeDigest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
    });
    runStore.appendCapabilityExecution(intakeStarted);
    runStore.appendCapabilityExecution(intakeSucceeded);
    materializeProducerRevision(runStore, REQ, runId, intakeSucceeded, () => TS);
    const designStarted = event(runId, {
      sequence: 3, status: "started", capability: "solution-design",
      inputArtifactRef: intakeRef, inputArtifactVersion: "1.0.0", inputDigest: intakeDigest,
    });
    const designSucceeded = event(runId, {
      ...designStarted,
      executionEventId: `${runId}:capability:4:succeeded`,
      sequence: 4, status: "succeeded",
      outputArtifactRef: designRef, outputArtifactVersion: "1.0.0", outputDigest: manual.designDigest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
    });
    runStore.appendCapabilityExecution(designStarted);
    runStore.appendCapabilityExecution(designSucceeded);
    materializeProducerRevision(runStore, REQ, runId, designSucceeded, () => TS);

    const finding = createLoopFinding({
      runId,
      requirementId: REQ,
      sequence: 1,
      sourceCapability: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:1`,
      causeKind: "IMPROVEMENT",
      introducedByRevisionId: null,
      severity: "MEDIUM",
      category: "SOLUTION",
      evidenceRef: `loop-artifact:v1:technical_design:sha256:${manual.designDigest}`,
      evidenceDigest: manual.designDigest,
      earliestAffectedNodeId: "solution-design",
      createdAt: TS,
    });
    runStore.appendFinding(finding);
    // The REGRESSION finding invalidates the examined design revision; the
    // rework wave authors design v2, which becomes the trusted current the
    // resolution can bind.
    const designV2Stored = artifactStore.put("technical_design", `# ${REQ} design v2\n`);
    const designV2Started = event(runId, {
      sequence: 5, status: "started", capability: "solution-design", attempt: 2,
      inputArtifactRef: intakeRef, inputArtifactVersion: "1.0.0", inputDigest: intakeDigest,
    });
    const designV2Digest = sha256(`# ${REQ} design v2\n`);
    const designV2Succeeded = event(runId, {
      ...designV2Started,
      executionEventId: `${runId}:capability:6:succeeded`,
      sequence: 6, status: "succeeded",
      outputArtifactRef: designV2Stored.artifactRef,
      outputArtifactVersion: "2.0.0", outputDigest: designV2Stored.digest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
    });
    runStore.appendCapabilityExecution(designV2Started);
    runStore.appendCapabilityExecution(designV2Succeeded);
    materializeProducerRevision(runStore, REQ, runId, designV2Succeeded, () => TS);
    runStore.resolveFinding(runId, loopFindingId(runId, 1), {
      resolvedByNodeId: "solution-design",
      resolvedByRevisionId: `${runId}:revision:solution-design:2`,
      resolutionEvidenceRef: manual.fixEvidence.ref,
      resolutionEvidenceDigest: manual.fixEvidence.digest,
    });

    // Takeover-B: the manual manifest is the takeover input; the runtime face
    // re-derives every row from journal + store and must judge it consistent.
    const request = { store: runStore, runId, requirementId: REQ, libraryDir: libManual };
    const takeover = projectLoopManifest(request);
    ok(takeover.kind === "PUBLISHED" && takeover.tookOver, `takeover-B accepts the real manual trace (${JSON.stringify(takeover)})`);
    const afterTakeover = readFileSync(join(libManual, "manifest.md"), "utf8");

    const replay = projectLoopManifest(request);
    ok(replay.kind === "NO_OP", "replay after takeover is NO_OP");
    ok(readFileSync(join(libManual, "manifest.md"), "utf8") === afterTakeover, "replay is byte-identical (gate: 同输入重放逐字节一致)");

    // Normalized equivalence: the manual face's own output equals the
    // runtime-taken-over document on every cross-face comparable field.
    const manualDoc = JSON.parse(JSON.stringify(parseRubyYamlText(manual.manifestText))) as Record<string, unknown>;
    const runtimeDoc = normalize(JSON.parse(JSON.stringify(parseRubyYamlText(afterTakeover))) as Record<string, unknown>);
    const normalizedManual = normalize(manualDoc);
    assert.deepStrictEqual(runtimeDoc, normalizedManual);
    ok(true, "normalized manual trace equals the runtime-taken-over document (gate #1)");
    rmSync(root, { recursive: true, force: true });
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function parseRubyYamlText(text: string): Record<string, unknown> {
  return parseRubyYaml(extractManifestYaml(text)) as Record<string, unknown>;
}


/** MISMATCH through the production door: a rehashed tamper on the entries
 * must stop the run with the exact §7.2 code (T4-R1 S-3 seed). */
async function scenarioMismatchThroughDoor(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-door-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const artifactStore = new LoopArtifactStore({ controlRoot: join(root, "control"), repositoryPath: repo });
  artifactStore.init();
  const runStore = new LoopRunStore(join(root, "control", "journal.db"), { artifactStore });
  runStore.init();
  try {
    const libDir = join(root, "library", REQ);
    const parsed = parseProductionEntryRequest({
      schema: PRODUCTION_ENTRY_SCHEMA, requirementId: REQ, repository: "example/repo",
      repositoryPath: repo, baseBranch: "loop-runtime-v1", expectedBaseSha: "a".repeat(40),
      taskBranch: "feature/t5door", controlRoot: join(root, "control"),
      sourceFiles: [join(root, "control", "requirement.md")],
      bindingRegistryVersion: "1", executionProfileVersion: "1.0.0", mode: "real" as const,
    }, { now: () => TS, runId: "run-t5-door" });
    // Seed a MANUAL-format manifest (the real intake artifact) so the door
    // has a manifest to take over.
    mkdirSync(libDir, { recursive: true });
    const doorSeed = {
      schema_version: "1.0", requirement_id: REQ, title: "T5 door",
      publish_seq: 1, projected_through: "MANUAL", updated_at: TS,
      depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "user_requested", required_depth: "STANDARD" },
      entries: ["requirement-intake", "solution-design", "solution-gate", "task-planning", "implementation", "code-review", "knowledge-sync"].map((n) => ({
        node: n, status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null,
      })),
      finding_index: [], declaration_log: [], corrections: [], repair_records: [],
    };
    writeFileSync(join(libDir, "manifest.md"), dumpRubyYaml({ ...doorSeed, manifest_digest: sealManifest(doorSeed as never).manifest_digest }), "utf8");
    const first = await runProduction(parsed, "build it", {
      inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
      runStore, artifactStore, manifestLibraryDir: libDir, maxDispatches: 6,
    });
    ok(first.execution_trace.length >= 2, `baseline chain completed (${first.execution_trace.length} nodes)`);

    // Level-2: rehash a tampered entry so self-consistency holds but the
    // journal prefix diverges.
    const raw = readFileSync(join(libDir, "manifest.md"), "utf8");
    const yaml = extractManifestYaml(raw);
    const doc = parseRubyYaml(yaml) as Record<string, unknown>;
    // parseRubyYaml freezes its result: build a fresh tampered document
    // instead of mutating the frozen one.
    const entries = (doc.entries as Record<string, unknown>[]).map((e, i) =>
      i === 0 ? { ...e, digest: sha256("tampered") } : { ...e });
    const tamperedDoc: Record<string, unknown> = { ...doc, entries };
    delete tamperedDoc.manifest_digest;
    const resealed = sealManifest(tamperedDoc as never);
    writeFileSync(
      join(libDir, "manifest.md"),
      dumpRubyYaml(Object.assign({}, tamperedDoc, { manifest_digest: resealed.manifest_digest }) as never),
      "utf8",
    );

    const second = await runProduction(parsed, "build it", {
      inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
      runStore, artifactStore, manifestLibraryDir: libDir, maxDispatches: 2,
    });
    ok(second.blocking_reason_code === "JOURNAL_MANIFEST_MISMATCH_STOP", `true divergence stops the run (${String(second.blocking_reason_code)})`);
    ok(second.final_status === "failed" && second.chain_status === "BLOCKED", "the mismatch exit is the canonical blocked envelope");
    ok(second.next_execution_point === null, "no re-entry target is offered");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Real D-9 DEFERRED: a succeeded terminal whose revision is not yet
 * materialized defers the projection (no publish, no byte change); once the
 * revision materializes the same journal publishes (PUBLISHED). */
async function scenarioDeferredThenPublish(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-defer-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const artifactStore = new LoopArtifactStore({ controlRoot: join(root, "control"), repositoryPath: repo });
  artifactStore.init();
  const runStore = new LoopRunStore(join(root, "control", "journal.db"), { artifactStore });
  runStore.init();
  try {
    const runId = "run-t5-defer";
    runStore.createRun(identity(root, runId));
    runStore.appendEvent(runEvent(runId, 2, "run_started"));
    const libDir = join(root, "library", REQ);
    mkdirSync(libDir, { recursive: true });

    const designDigest = sha256(`# ${REQ} design\n`);
    const intakeStored = artifactStore.put("requirement_summary", `# ${REQ} intake\n`);
    const intakeStarted = event(runId, { sequence: 1, status: "started", capability: "requirement-intake", inputArtifactRef: intakeStored.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: intakeStored.digest });
    const intakeSucceeded = event(runId, {
      ...intakeStarted,
      executionEventId: `${runId}:capability:2:succeeded`,
      sequence: 2, status: "succeeded",
      outputArtifactRef: intakeStored.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: intakeStored.digest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
    });
    runStore.appendCapabilityExecution(intakeStarted);
    runStore.appendCapabilityExecution(intakeSucceeded);
    materializeProducerRevision(runStore, REQ, runId, intakeSucceeded, () => TS);
    // The design artifact was uploaded before the crash — only the terminal's
    // revision materialization is missing (the deferred D-9 window).
    const designStored = artifactStore.put("technical_design", `# ${REQ} design\n`);
    const designStarted = event(runId, {
      sequence: 3, status: "started", capability: "solution-design",
      inputArtifactRef: intakeStored.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: intakeStored.digest,
    });
    const designSucceeded = event(runId, {
      ...designStarted,
      executionEventId: `${runId}:capability:4:succeeded`,
      sequence: 4, status: "succeeded",
      outputArtifactRef: designStored.artifactRef,
      outputArtifactVersion: "1.0.0", outputDigest: designStored.digest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
    });
    runStore.appendCapabilityExecution(designStarted);
    runStore.appendCapabilityExecution(designSucceeded);
    // NO materialization yet -> D-9 pending revision -> DEFERRED.

    const seed = {
      schema_version: "1.0", requirement_id: REQ, title: "T5 DEFERRED",
      publish_seq: 1, projected_through: "MANUAL", updated_at: TS,
      depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "user_requested", required_depth: "STANDARD" },
      entries: [
        { node: "requirement-intake", status: "current", artifact_path: `00-需求资料/${REQ}_需求摘要.md`, version: "1.0.0", digest: intakeStored.digest, updated_at: TS, source_event_ref: intakeStored.artifactRef },
        { node: "solution-design", status: "current", artifact_path: `01-技术方案/${REQ}_技术方案.md`, version: "1.0.0", digest: designStored.digest, updated_at: TS, source_event_ref: `01-技术方案/${REQ}_技术方案.md` },
        ...["solution-gate", "task-planning", "implementation", "code-review", "knowledge-sync"].map((n) => ({
          node: n, status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null,
        })),
      ],
      finding_index: [], declaration_log: [], corrections: [], repair_records: [],
    };
    writeFileSync(join(libDir, "manifest.md"), dumpRubyYaml({ ...seed, manifest_digest: sealManifest(seed as never).manifest_digest }), "utf8");

    const request = { store: runStore, runId, requirementId: REQ, libraryDir: libDir };
    const before = readFileSync(join(libDir, "manifest.md"), "utf8");
    const deferred = projectLoopManifest(request);
    ok(deferred.kind === "DEFERRED", `pending revision defers the projection (${JSON.stringify(deferred)})`);
    ok(readFileSync(join(libDir, "manifest.md"), "utf8") === before, "DEFERRED leaves the manifest bytes untouched");

    materializeProducerRevision(runStore, REQ, runId, designSucceeded, () => TS);
    const published = projectLoopManifest(request);
    ok(published.kind === "PUBLISHED", `after materialization the projection publishes (${JSON.stringify(published)})`);
    const doc = parseRubyYaml(extractManifestYaml(readFileSync(join(libDir, "manifest.md"), "utf8"))) as Record<string, unknown>;
    ok(doc.projected_through === 4, "projected_through advanced to the journal head (4)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** T5-R1-RC2-1 regression: the REAL publisher products the reader used to
 * reject — a title-less init (`title: ''`) and a repair with a long reason
 * (folded scalar inside a seq-item map) — must parse back value-exact. */
async function scenarioRealPublisherProductsReadable(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-pub-"));
  const libDir = join(root, "lib");
  const longReason = "a deliberately long english reason that should exceed the eighty column folding width used by the reference emitter";
  try {
    mkdirSync(libDir, { recursive: true });
    publisher(libDir, [
      "init", "--requirement-id", REQ, "--requested-depth", "STANDARD",
      "--depth-basis", "user_requested", "--decision-scope", "FULL_REQUIREMENT",
    ]);
    publisher(libDir, ["repair", "--who", "reviewer", "--reason", longReason]);

    const raw = readFileSync(join(libDir, "manifest.md"), "utf8");
    ok(raw.includes("title: ''"), "the title-less init really emits an empty single-quoted scalar");
    const doc = parseRubyYaml(extractManifestYaml(raw)) as Record<string, unknown>;
    ok(doc.title === "", "the empty scalar parses back as an empty string (was: unterminated-quote throw)");
    const repairRows = doc.repair_records as readonly Record<string, unknown>[];
    ok(repairRows.length === 1 && repairRows[0]!.reason === longReason,
      "the folded reason inside a seq-item map reassembles value-exact");
    ok(repairRows[0]!.who === "reviewer", "the sibling inner keys still parse after the fold");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** §6.2.6 repair end to end: the publisher records digest corrections and
 * republishes; the runtime reader must take the product back value-exact
 * (this is the shape that used to be rejected: corrected_entries is a nested
 * sequence under an inner key of a seq-item map). */
async function scenarioRepairFullFlow(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-repair-"));
  const libDir = join(root, "lib");
  try {
    mkdirSync(join(libDir, "00-需求资料"), { recursive: true });
    mkdirSync(join(libDir, "01-技术方案"), { recursive: true });
    publisher(libDir, [
      "init", "--requirement-id", REQ, "--requested-depth", "STANDARD",
      "--depth-basis", "user_requested", "--decision-scope", "FULL_REQUIREMENT",
    ]);
    // R1-P0-2: canonical names bind the requirement id (contract §3.1).
    const rId = REQ;
    const intakeRel = `00-需求资料/${rId}_需求摘要.md`;
    const designRel = `01-技术方案/${rId}_技术方案.md`;
    writeFileSync(join(libDir, "00-需求资料", `${rId}_需求摘要.md`), "# intake artifact\n", "utf8");
    writeFileSync(join(libDir, "01-技术方案", `${rId}_技术方案.md`), "# design artifact\n", "utf8");
    // Bind deliberately wrong digests so repair has real drift to correct.
    publisher(libDir, [
      "entry-update", "--node", "requirement-intake", "--declaration-seq", "2",
      "--artifact-path", intakeRel, "--version", "1.0.0",
      "--digest", "0".repeat(64), "--source-ref", intakeRel,
    ]);
    publisher(libDir, [
      "entry-update", "--node", "solution-design", "--declaration-seq", "3",
      "--artifact-path", designRel, "--version", "1.0.0",
      "--digest", "1".repeat(64), "--source-ref", designRel,
    ]);
    publisher(libDir, ["repair", "--who", "reviewer", "--reason", "drift repair with corrections"]);

    const raw = readFileSync(join(libDir, "manifest.md"), "utf8");
    const doc = parseRubyYaml(extractManifestYaml(raw)) as Record<string, unknown>;
    const records = doc.repair_records as readonly Record<string, unknown>[];
    ok(records.length === 1, "the repair record survives the republication");
    const corrected = records[0]!.corrected_entries as readonly Record<string, unknown>[];
    ok(corrected.length === 2, `both drifted bindings are recorded (${corrected.length})`);
    ok(corrected[0]!.node === "requirement-intake", "the first corrected entry names its node");
    ok(corrected[0]!.recorded_digest === "0".repeat(64), "the recorded digest is preserved verbatim");
    ok(typeof corrected[0]!.corrected_digest === "string" && corrected[0]!.corrected_digest !== "0".repeat(64),
      "the corrected digest is the artifact's real digest");
    ok(records[0]!.baseline_reset === "self-digest recomputed from verified current content",
      "the baseline reset note is read back exactly");
    const corrections = doc.corrections as readonly Record<string, unknown>[];
    ok(corrections.length === 2, "the flat corrections list also parses (same nested shape)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** ACCEPTED mixed V9: a scan-source finding risk-accepted by a CONFIRMED
 * PASS_WITH_RISK ruling, published in the SAME atomic publish as a journal
 * tail (entries from the tail, the finding row from the lifecycle delta).
 * Constructed entirely from the public store API — no G4 PWR re-gate fixture
 * is needed, which is why this is delivered rather than deferred. */
async function scenarioAcceptedMixedV9(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-accepted-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const artifactStore = new LoopArtifactStore({ controlRoot: join(root, "control"), repositoryPath: repo });
  artifactStore.init();
  const runStore = new LoopRunStore(join(root, "control", "journal.db"), { artifactStore });
  runStore.init();
  try {
    const runId = "run-t5-accepted";
    runStore.createRun(identity(root, runId));
    runStore.appendEvent(runEvent(runId, 2, "run_started"));

    // The scan round's Finding Ledger: a canonical envelope carrying exactly
    // one member (the membership count the store cross-checks).
    const ledger = artifactStore.put(
      "capability_findings",
      JSON.stringify({ schema: "loop-capability-findings:v1", findings: [{ finding_id: "scan-1" }] }) + "\n",
    );
    const gateResultBlob = artifactStore.put("solution_review", "gate verdict: PASS_WITH_RISK\n");
    // The ruling's own persisted decision delta (a succeeded formal_verdict
    // must materialize one).
    const deltaStored = artifactStore.put(
      "governance_tail_result",
      JSON.stringify({ schema: "loop-decision-delta:v1", riskAcceptanceRefs: [] }) + "\n",
    );
    const sourceStored = artifactStore.put("requirement_summary", `# ${REQ} accepted source\n`);

    // intake + design rounds so the gate has real upstream revisions.
    const intakeStarted = event(runId, { sequence: 1, createdAt: stamp(1), status: "started", capability: "requirement-intake", inputArtifactRef: sourceStored.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: sourceStored.digest });
    const intakeSucceeded = event(runId, { ...intakeStarted, executionEventId: `${runId}:capability:2:succeeded`, sequence: 2, createdAt: stamp(2), status: "succeeded", outputArtifactRef: sourceStored.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: sourceStored.digest, gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE" });
    runStore.appendCapabilityExecution(intakeStarted);
    runStore.appendCapabilityExecution(intakeSucceeded);
    materializeProducerRevision(runStore, REQ, runId, intakeSucceeded, () => TS);
    const designStored = artifactStore.put("technical_design", `# ${REQ} accepted design\n`);
    const designStarted = event(runId, { sequence: 3, createdAt: stamp(3), status: "started", capability: "solution-design", inputArtifactRef: sourceStored.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: sourceStored.digest });
    const designSucceeded = event(runId, { ...designStarted, executionEventId: `${runId}:capability:4:succeeded`, sequence: 4, createdAt: stamp(4), status: "succeeded", outputArtifactRef: designStored.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: designStored.digest, gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE" });
    runStore.appendCapabilityExecution(designStarted);
    runStore.appendCapabilityExecution(designSucceeded);
    materializeProducerRevision(runStore, REQ, runId, designSucceeded, () => TS);

    // The adversarial scan round that PRODUCED the ledger (membership receipt:
    // the finding registered below carries this terminal's own createdAt).
    const scanStarted = event(runId, { sequence: 5, createdAt: stamp(5), status: "started", capability: "solution-gate", executionRole: "adversarial_scan", inputArtifactRef: designStored.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: designStored.digest });
    const scanSucceeded = event(runId, {
      ...scanStarted,
      executionEventId: `${runId}:capability:6:succeeded`,
      sequence: 6, createdAt: stamp(6), status: "succeeded",
      outputArtifactRef: gateResultBlob.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: gateResultBlob.digest,
      gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE",
      unresolvedFindingsRef: ledger.artifactRef, unresolvedFindingsDigest: ledger.digest,
    });
    runStore.appendCapabilityExecution(scanStarted);
    runStore.appendCapabilityExecution(scanSucceeded);
    // The finding's source revision must exist in the run.
    materializeProducerRevision(runStore, REQ, runId, scanSucceeded, () => TS);

    const finding = createLoopFinding({
      runId, requirementId: REQ, sequence: 1,
      sourceCapability: "solution-gate",
      // The discovery anchor is the revision the scan EXAMINED (the design
      // current); an adversarial_scan authors no node revision of its own.
      sourceRevisionId: `${runId}:revision:solution-design:1`,
      causeKind: "IMPROVEMENT", introducedByRevisionId: null,
      severity: "MEDIUM", category: "SOLUTION",
      evidenceRef: ledger.artifactRef, evidenceDigest: ledger.digest,
      earliestAffectedNodeId: "solution-design",
      createdAt: scanSucceeded.createdAt,
    });
    runStore.appendFinding(finding);

    const verdictStarted = event(runId, {
      sequence: 7, createdAt: stamp(7), status: "started", capability: "solution-gate", executionRole: "formal_verdict",
      inputArtifactRef: gateResultBlob.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: gateResultBlob.digest,
      // A formal_verdict must record the Finding Ledger it consumes on its
      // own events (not only on the terminal), and the dual-agent rule
      // requires a DIFFERENT executor than the scan round.
      consumedFindingsRef: ledger.artifactRef, consumedFindingsDigest: ledger.digest,
      executorAgent: "hermes",
      executorAdapter: "hermes-cli",
      bindingId: "binding-hermes-solution-gate-formal_verdict",
    });
    const verdictSucceeded = event(runId, {
      ...verdictStarted,
      executionEventId: `${runId}:capability:8:succeeded`,
      sequence: 8, createdAt: stamp(8), status: "succeeded",
      outputArtifactRef: gateResultBlob.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: gateResultBlob.digest,
      gateResult: "PASS_WITH_RISK", decisionDepth: "STANDARD", decisionStatus: "CONFIRMED",
      decisionScopeId: `${runId}:decision:1`,
      decisionDeltaRef: deltaStored.artifactRef, decisionDeltaDigest: deltaStored.digest,
      nextStepEligibility: "ELIGIBLE",
      consumedFindingsRef: ledger.artifactRef, consumedFindingsDigest: ledger.digest,
    });
    runStore.appendCapabilityExecution(verdictStarted);
    runStore.appendCapabilityExecution(verdictSucceeded);
    // A PASS_WITH_RISK ruling authors the solution-gate node revision.
    materializeProducerRevision(runStore, REQ, runId, verdictSucceeded, () => TS);

    runStore.acceptFindingRisk(runId, finding.findingId, {
      riskAcceptedBy: "formal_verdict",
      riskAcceptanceEvidenceRef: verdictSucceeded.outputArtifactRef,
      riskAcceptanceEvidenceDigest: verdictSucceeded.outputDigest,
      decisionScopeId: verdictSucceeded.decisionScopeId,
    });
    ok(runStore.listFindings(runId)[0]!.status === "ACCEPTED_RISK", "the store accepted the risk on the scan-source finding");

    // A planning tail lands AFTER the acceptance -> mixed publish.
    const libDir = join(root, "library", REQ);
    mkdirSync(libDir, { recursive: true });
    const seed = {
      schema_version: "1.0", requirement_id: REQ, title: "T5 ACCEPTED",
      publish_seq: 1, projected_through: "MANUAL", updated_at: TS,
      depth: { decision_scope: "FULL_REQUIREMENT", requested_depth: "STANDARD", initial_depth_basis: "user_requested", required_depth: "STANDARD" },
      entries: [
        { node: "requirement-intake", status: "current", artifact_path: `00-需求资料/${REQ}_需求摘要.md`, version: "1.0.0", digest: sourceStored.digest, updated_at: TS, source_event_ref: sourceStored.artifactRef },
        // The scan finding invalidated the examined design revision, so the
        // manual face must mirror that truth (status stale) — a current row
        // here is a genuine B2 divergence, not a fixture convenience.
        { node: "solution-design", status: "stale", artifact_path: `01-技术方案/${REQ}_技术方案.md`, version: "1.0.0", digest: designStored.digest, updated_at: TS, source_event_ref: designStored.artifactRef },
        { node: "solution-gate", status: "current", artifact_path: `02-方案审核/${REQ}_方案审核.md`, version: "1.0.0", digest: gateResultBlob.digest, updated_at: TS, source_event_ref: gateResultBlob.artifactRef,
          gate_result: "PASS_WITH_RISK", decision_depth: "STANDARD", decision_status: "CONFIRMED" },
        ...["task-planning", "implementation", "code-review", "knowledge-sync"].map((n) => ({
          node: n, status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null,
        })),
      ],
      finding_index: [{
        finding_id: finding.findingId, discovered_at: "solution-gate", root_cause_category: "SOLUTION",
        earliest_affected_node_id: "solution-design", source_revision: `${runId}:revision:solution-design:1`,
        evidence_ref: ledger.artifactRef, status: "OPEN",
        closed_by: null, closure_evidence_ref: null, closure_evidence_digest: null, closure_bound_revision_id: null,
      }],
      declaration_log: [], corrections: [], repair_records: [],
    };
    writeFileSync(join(libDir, "manifest.md"), dumpRubyYaml({ ...seed, manifest_digest: sealManifest(seed as never).manifest_digest }), "utf8");

    const request = { store: runStore, runId, requirementId: REQ, libraryDir: libDir, takeoverAcceptedAt: TS };
    const first = projectLoopManifest(request as never);
    ok(first.kind === "PUBLISHED" || first.kind === "NO_OP", `the takeover of the accepted-state manifest settles (${JSON.stringify(first)})`);

    const planStored = artifactStore.put("task_plan", `# ${REQ} plan\n`);
    // The tail node's input must be the predecessor's (gate's) effective output.
    const planStarted = event(runId, { sequence: 9, createdAt: stamp(9), status: "started", capability: "task-planning", inputArtifactRef: gateResultBlob.artifactRef, inputArtifactVersion: "1.0.0", inputDigest: gateResultBlob.digest });
    const planSucceeded = event(runId, { ...planStarted, executionEventId: `${runId}:capability:10:succeeded`, sequence: 10, createdAt: stamp(10), status: "succeeded", outputArtifactRef: planStored.artifactRef, outputArtifactVersion: "1.0.0", outputDigest: planStored.digest, gateResult: "NOT_APPLICABLE", nextStepEligibility: "ELIGIBLE" });
    runStore.appendCapabilityExecution(planStarted);
    runStore.appendCapabilityExecution(planSucceeded);
    materializeProducerRevision(runStore, REQ, runId, planSucceeded, () => TS);

    const beforeDoc = parseRubyYaml(extractManifestYaml(readFileSync(join(libDir, "manifest.md"), "utf8"))) as Record<string, unknown>;
    const beforeEntries = JSON.stringify((beforeDoc.entries as Record<string, unknown>[]).map((e) => [e.node, e.status, e.digest]));
    const mixed = projectLoopManifest(request as never);
    ok(mixed.kind === "PUBLISHED", `the mixed publish lands the tail and the acceptance together (${JSON.stringify(mixed)})`);
    const after = parseRubyYaml(extractManifestYaml(readFileSync(join(libDir, "manifest.md"), "utf8"))) as Record<string, unknown>;
    const rows = after.finding_index as readonly Record<string, unknown>[];
    const accepted = rows.find((r) => r.finding_id === finding.findingId)!;
    ok(accepted.status === "ACCEPTED", "the scan finding projects as ACCEPTED (ACCEPTED_RISK -> ACCEPTED)");
    ok(accepted.closed_by === "formal_verdict", "the risk acceptor is recorded as the formal verdict");
    const afterEntries = JSON.stringify((after.entries as Record<string, unknown>[]).map((e) => [e.node, e.status, e.digest]));
    ok(afterEntries !== beforeEntries, "the journal tail's entry landed in the same publish");
    const planning = (after.entries as readonly Record<string, unknown>[]).find((e) => e.node === "task-planning")!;
    ok(planning.status === "current", "the tail node's entry is current after the mixed publish");
    ok(
      JSON.stringify((beforeDoc.entries as Record<string, unknown>[]).filter((e) => e.node !== "task-planning").map((e) => [e.node, e.status, e.digest])) ===
        JSON.stringify((after.entries as Record<string, unknown>[]).filter((e) => e.node !== "task-planning").map((e) => [e.node, e.status, e.digest])),
      "no other artifact binding moved (V9: unrelated entries untouched)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("G5-T5 parity — real manual chain vs runtime face (gate #1)");
  await scenarioManualRuntimeParity();
  console.log("G5-T5 residuals — MISMATCH through the production door");
  await scenarioMismatchThroughDoor();
  console.log("G5-T5 residuals — real D-9 DEFERRED then publish");
  await scenarioDeferredThenPublish();
  console.log("G5-T5-R1 rework — real publisher products are readable end to end");
  await scenarioRealPublisherProductsReadable();
  console.log("G5-T5-R2 rework — §6.2.6 repair full flow");
  await scenarioRepairFullFlow();
  console.log("G5-T5-R2 rework — ACCEPTED mixed V9");
  await scenarioAcceptedMixedV9();
  console.log(`\ng5t5-parity: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
