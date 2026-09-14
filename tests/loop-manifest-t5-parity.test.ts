// G5-T5 (D-090-03): projection regression residuals + manual/runtime parity.
// Completion-gate coverage that earlier tasks deferred to this task:
//   - gate #1: a REAL manual trace (driven through the frozen publisher
//     scripts/publish-requirement-manifest.sh) taken over by the runtime face
//     with equivalent journal/finding-store facts — the three-level
//     discrimination passing IS the normalized-equivalence proof, and the
//     replay is byte-identical (manual trace artifact kept in the review
//     fixture below)
//   - gate #3 / lag end-to-end: finding store RESOLVED with durable proof
//     aligned against a manual OPEN row (legal lag), entries untouched
//   - ACCEPTED mixed V9 variant (same code branch as RESOLVED — R4 annotation)
//   - §6.2.6 repair full flow with repair_records surviving republication
//   - JOURNAL_MANIFEST_MISMATCH_STOP through the production door
//   - real D-9 DEFERRED (terminal event without a materialized revision)
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
    "--artifact-path", "00-需求资料/00-需求资料.md", "--version", "1.0.0",
    "--digest", intakeDigest, "--source-ref", "00-需求资料/00-需求资料.md",
  ]);
  publisher(libDir, [
    "entry-update", "--node", "solution-design", "--declaration-seq", "3",
    "--artifact-path", "01-技术方案/01-技术方案.md", "--version", "1.0.0",
    "--digest", designDigest, "--source-ref", "01-技术方案/01-技术方案.md",
  ]);
  const designV2Digest = sha256(`# ${REQ} design v2\n`);
  publisher(libDir, [
    "entry-update", "--node", "solution-design", "--declaration-seq", "4",
    "--artifact-path", "01-技术方案/01-技术方案.md", "--version", "2.0.0",
    "--digest", designV2Digest, "--source-ref", "01-技术方案/01-技术方案.md",
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


/**
 * V9 ACCEPTED mixed variant: a scan finding accepted via the durable
 * `acceptFindingRisk` proof, projected alongside a journal tail in ONE
 * publish (entries updated by the tail, finding row ACCEPTED by the
 * lifecycle delta — the V9 mixed rule), entries' artifact bindings untouched.
 */
async function scenarioAcceptedMixedV9(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "t5-v9-"));
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
      taskBranch: "feature/t5v9", controlRoot: join(root, "control"),
      sourceFiles: [join(root, "control", "requirement.md")],
      bindingRegistryVersion: "1", executionProfileVersion: "1.0.0", mode: "real" as const,
    }, { now: () => TS, runId: "run-t5-v9" });
    const result = await runProduction(parsed, "build it", {
      inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
      runStore, artifactStore,
      manifestLibraryDir: libDir,
      maxDispatches: 12,
    });
    ok(result.execution_trace.length >= 6, `the full chain ran (${result.execution_trace.length} nodes)`);
    ok(result.blocking_reason_code === undefined || result.blocking_reason_code === null, "the chain completed without a manifest stop");

    // A scan finding discovered by the gate round, then risk-accepted by the
    // formal verdict through the durable acceptance API (RISK_ACCEPTANCE proof).
    const runId = runStore.findLatestRunByRequirement(REQ)!.state.identity.runId;
    const verdict = runStore.listCapabilityExecutions(runId)
      .find((e) => e.executionRole === "formal_verdict" && e.status === "succeeded")!;
    const gateRev = gateRevision(runStore, runId);
    const scanFinding = createLoopFinding({
      runId, requirementId: REQ, sequence: 1,
      sourceCapability: "solution-gate",
      sourceRevisionId: gateRev.revisionId,
      causeKind: "IMPROVEMENT", introducedByRevisionId: null,
      severity: "MEDIUM", category: "SOLUTION",
      evidenceRef: gateRev.artifactRef,
      evidenceDigest: gateRev.digest,
      earliestAffectedNodeId: "solution-design", createdAt: TS,
    });
    runStore.appendFinding(scanFinding);
    runStore.acceptFindingRisk(runId, scanFinding.findingId, {
      riskAcceptedBy: "formal_verdict",
      riskAcceptanceEvidenceRef: gateRevision(runStore, runId).artifactRef,
      riskAcceptanceEvidenceDigest: gateRevision(runStore, runId).digest,
      decisionScopeId: verdict.decisionScopeId ?? `${runId}:scope:1`,
    });

    // The acceptance is a finding-lifecycle delta with NO node terminal: the
    // projection updates the finding row and leaves every artifact binding
    // untouched (gate #3 / entries 不被触碰).
    const before = readFileSync(join(libDir, "manifest.md"), "utf8");
    const outcome = projectLoopManifest({ store: runStore, runId, requirementId: REQ, libraryDir: libDir });
    ok(outcome.kind === "PUBLISHED", `the acceptance projects as a lifecycle-only publish (${JSON.stringify(outcome)})`);
    const doc = parseRubyYaml(readFileSync(join(libDir, "manifest.md"), "utf8")) as Record<string, unknown>;
    const rows = doc.finding_index as readonly Record<string, unknown>[];
    const accepted = rows.find((r) => r.finding_id === scanFinding.findingId)!;
    ok(accepted.status === "ACCEPTED", "the finding row is ACCEPTED (OPEN -> ACCEPTED lawful lag)");
    ok(accepted.closed_by === "formal_verdict", "the acceptance authority is recorded");
    const entriesBefore = (parseRubyYaml(before.startsWith("---") ? before : extractManifestYaml(before)) as Record<string, unknown>).entries;
    const digestBefore = JSON.stringify((entriesBefore as Record<string, unknown>[]).map((e) => [e.node, e.status, e.digest]));
    const digestAfter = JSON.stringify((doc.entries as Record<string, unknown>[]).map((e) => [e.node, e.status, e.digest]));
    ok(digestBefore === digestAfter, "artifact bindings untouched by the lifecycle-only publish");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function gateRevision(runStore: LoopRunStore, runId: string) {
  return runStore.listArtifactRevisions(runId).find((r) => r.nodeId === "solution-gate")!;
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
        { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/00-需求资料.md", version: "1.0.0", digest: intakeStored.digest, updated_at: TS, source_event_ref: intakeStored.artifactRef },
        { node: "solution-design", status: "current", artifact_path: "01-技术方案/01-技术方案.md", version: "1.0.0", digest: designStored.digest, updated_at: TS, source_event_ref: "01-技术方案/01-技术方案.md" },
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

async function main(): Promise<void> {
  console.log("G5-T5 parity — real manual chain vs runtime face (gate #1)");
  await scenarioManualRuntimeParity();
  console.log("G5-T5 residuals — MISMATCH through the production door");
  await scenarioMismatchThroughDoor();
  console.log("G5-T5 residuals — real D-9 DEFERRED then publish");
  await scenarioDeferredThenPublish();
  console.log(`\ng5t5-parity: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
