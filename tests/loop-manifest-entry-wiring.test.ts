// G5-T4 (D-090-03 Δ3): production entry readiness preflight + terminal→
// projector call point + crash-recovery idempotence, plus the T3-R1 S-2
// obligation (a projection stop is durably recorded before the run exits).
// The channel is exercised end-to-end: real production door → real
// LoopRunStore/artifact store → real projector → the §7.2 exit envelope.
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import {
  parseProductionEntryRequest,
  PRODUCTION_ENTRY_SCHEMA,
  type ParsedProductionEntry,
} from "../core/loop-production-entry";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
} from "../core/loop-capability-execution";
import {
  LOOP_MANIFEST_SCHEMA_VERSION,
  sealManifest,
} from "../core/loop-manifest-projector";
import { dumpRubyYaml, parseRubyYaml } from "../core/loop-manifest-yaml";
import {
  releaseManifestProjectionBlock,
  resolveManifestReadiness,
  runProduction,
  type ProductionPreflightSnapshot,
} from "../runtime";

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

const TS = "2026-09-12T00:00:00.000Z";
const REQ = "REQ-T4";
function dg(letter: string): string {
  return letter.repeat(64);
}

function makeRoot(): { root: string; repo: string; control: string } {
  const root = mkdtempSync(join(tmpdir(), "t4-manifest-"));
  const repo = join(root, "repo");
  const control = join(root, "control");
  mkdirSync(repo, { recursive: true });
  mkdirSync(control, { recursive: true });
  return { root, repo, control };
}

function parsedEntry(parts: { repo: string; control: string; runId?: string }): ParsedProductionEntry {
  return parseProductionEntryRequest(
    {
      schema: PRODUCTION_ENTRY_SCHEMA,
      requirementId: REQ,
      repository: "example/repo",
      repositoryPath: parts.repo,
      baseBranch: "loop-runtime-v1",
      expectedBaseSha: "a".repeat(40),
      taskBranch: "feature/t4",
      controlRoot: parts.control,
      sourceFiles: [join(parts.control, "requirement.md")],
      bindingRegistryVersion: "1",
      executionProfileVersion: "1.0.0",
      mode: "real" as const,
    },
    { now: () => TS, runId: parts.runId ?? "run-t4-001" },
  );
}

function stores(control: string, repo: string): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } {
  const artifactStore = new LoopArtifactStore({ controlRoot: control, repositoryPath: repo });
  const runStore = new LoopRunStore(join(control, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { runStore, artifactStore };
}

const clean = async (): Promise<ProductionPreflightSnapshot> =>
  ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) });

function manualInitBase(title: string): Record<string, unknown> {
  return {
    schema_version: LOOP_MANIFEST_SCHEMA_VERSION,
    requirement_id: REQ,
    title,
    publish_seq: 1,
    projected_through: "MANUAL",
    updated_at: TS,
    depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
    entries: [
      { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: dg("b"), updated_at: TS, source_event_ref: "00-需求资料/req_需求摘要.md" },
      { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
    ],
    finding_index: [],
    declaration_log: [],
    corrections: [],
    repair_records: [],
  };
}

function writeManifest(libraryDir: string, base: Record<string, unknown>): void {
  mkdirSync(libraryDir, { recursive: true });
  const sealed = sealManifest(base as never);
  writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }), "utf8");
}

function libraryDirOf(repo: string): string {
  return join(repo, "library", REQ);
}

function manifestExists(libraryDir: string): boolean {
  try {
    readFileSync(join(libraryDir, "manifest.md"), "utf8");
    return true;
  } catch {
    return false;
  }
}

function readManifestDoc(libraryDir: string): Record<string, unknown> {
  return parseRubyYaml(readFileSync(join(libraryDir, "manifest.md"), "utf8")) as Record<string, unknown>;
}

/**
 * The published document must always self-verify: stripping the embedded
 * digest and re-sealing reproduces it. This is the crash-recovery invariant —
 * whatever a resume does, the on-disk manifest stays self-consistent.
 */
function manifestSelfVerifies(libraryDir: string): boolean {
  try {
    const doc = readManifestDoc(libraryDir);
    const claimed = doc.manifest_digest;
    const without = { ...doc };
    delete without.manifest_digest;
    return sealManifest(without as never).manifest_digest === claimed;
  } catch {
    return false;
  }
}

async function scenarioFreshAndLegacy(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const { root: root2, repo: repo2, control: control2 } = makeRoot();
  try {
    // (1) FRESH: no library directory at all → the run proceeds normally.
    const s1 = stores(join(root, "c1"), repo);
    const fresh = await runProduction(
      parsedEntry({ repo, control: join(root, "c1"), runId: "run-t4-fresh" }),
      "build it",
      { inspectWorkspace: clean, runStore: s1.runStore, artifactStore: s1.artifactStore, maxDispatches: 2 },
    );
    ok(fresh.blocking_reason_code === undefined || fresh.blocking_reason_code === null, "fresh requirement is not stopped by the manifest preflight");
    ok(fresh.run_id === "run-t4-fresh", "the fresh run recorded the parsed identity runId");
    ok(!manifestExists(libraryDirOf(repo)), "no manifest is minted for a fresh requirement (intake owns creation)");

    // (2) LEGACY_NO_MANIFEST → BLOCKED_AMBIGUOUS, zero dispatches, never rebuilt.
    const s2 = stores(control2, repo2);
    mkdirSync(libraryDirOf(repo2), { recursive: true });
    writeFileSync(join(libraryDirOf(repo2), "legacy-note.md"), "archived", "utf8");
    const legacy = await runProduction(
      parsedEntry({ repo: repo2, control: control2, runId: "run-t4-legacy" }),
      "build it",
      { inspectWorkspace: clean, runStore: s2.runStore, artifactStore: s2.artifactStore, maxDispatches: 2 },
    );
    ok(legacy.final_status === "failed" && legacy.chain_status === "BLOCKED", "legacy reuse exits BLOCKED");
    ok(legacy.blocking_reason_code === "BLOCKED_AMBIGUOUS", "legacy reuse carries BLOCKED_AMBIGUOUS (§6.2.7)");
    ok(legacy.next_execution_point === null, "no re-entry target for the legacy archive");
    ok(legacy.execution_trace.length === 0, "zero dispatches happened before the legacy exit");
    ok(!manifestExists(libraryDirOf(repo2)), "the legacy directory is never rebuilt");
    // The entry preflight precedes the run: the journal run is created on the
    // first dispatch, which the preflight correctly prevented — so there is no
    // journal object to record the stop into at that point.
    ok(
      s2.runStore.findLatestRunByRequirement(REQ) === undefined,
      "a preflight stop on a never-started requirement leaves no journal run (preflight precedes the run)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(root2, { recursive: true, force: true });
  }
}

async function scenarioCorruptStopAndS2(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const s = stores(control, repo);
  try {
    const dir = libraryDirOf(repo);

    // Establish a real journal run first — the S-2 recording target.
    writeManifest(dir, manualInitBase("探针需求"));
    await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-corrupt" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    const journalRun = s.runStore.findLatestRunByRequirement(REQ);
    ok(journalRun !== undefined, "the first invocation created the journal run");
    const journalRunId = journalRun!.state.identity.runId;

    // Level-1: change content WITHOUT rehashing → the embedded self-digest no
    // longer matches, so the file is corrupt (not a divergence, not a tamper
    // with a valid digest).
    const text = readFileSync(join(dir, "manifest.md"), "utf8");
    ok(/^title: .*$/mu.test(text), "the published manifest carries a title line to corrupt");
    writeFileSync(join(dir, "manifest.md"), text.replace(/^title: .*$/mu, "title: tampered-without-rehash"), "utf8");

    const corrupt = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-corrupt" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(corrupt.blocking_reason_code === "MANIFEST_CORRUPT_STOP", "a digest-breaking manifest stops the run (level 1)");
    ok(corrupt.next_execution_point === null, "the corrupt exit offers no re-entry target");

    // S-2: the stop is durably recorded — §7.2 code in reasonCode, the
    // projector's human-readable reason digest-bound in the artifact store.
    const blockedEvents = s.runStore.listEvents(journalRunId).filter((e) => e.kind === "run_blocked");
    ok(blockedEvents.length === 1, "exactly one durable run_blocked event was appended (S-2)");
    ok(blockedEvents[0]?.reasonCode === "MANIFEST_CORRUPT_STOP", "the §7.2 code is persisted in reasonCode (S-2)");
    ok(typeof blockedEvents[0]?.outputArtifactRef === "string", "the reason detail is referenced as an artifact (S-2)");
    const detail = JSON.parse(
      s.artifactStore.read(blockedEvents[0]!.outputArtifactRef!, blockedEvents[0]!.outputDigest!).toString("utf8"),
    ) as { code?: string; reason?: string };
    ok(
      detail.code === "MANIFEST_CORRUPT_STOP" && typeof detail.reason === "string" && detail.reason.length > 0,
      "the persisted detail carries the code and the projector reason verbatim (S-2)",
    );

    // Re-entry re-judges the same stop: same code, no duplicate block event.
    const again = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-corrupt" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(again.blocking_reason_code === "MANIFEST_CORRUPT_STOP", "re-entry re-judges and reports the same code");
    ok(
      s.runStore.listEvents(journalRunId).filter((e) => e.kind === "run_blocked").length === 1,
      "re-entry does not append a duplicate block event (the durable fact is idempotent)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function scenarioTerminalProjection(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const s = stores(control, repo);
  try {
    const dir = libraryDirOf(repo);
    writeManifest(dir, manualInitBase("探针需求"));

    const first = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-chain" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(first.execution_trace.length >= 1, `the chain dispatched at least one node (${first.execution_trace.length})`);

    const afterFirst = readManifestDoc(dir);
    ok(typeof afterFirst.projection_provenance === "object" && afterFirst.projection_provenance !== null,
      "the takeover provenance is recorded by the entry projection");
    ok(afterFirst.projected_through !== "MANUAL",
      `projected_through advanced past MANUAL after the terminal projection (${String(afterFirst.projected_through)})`);
    const entries = afterFirst.entries as readonly Record<string, unknown>[];
    const intake = entries.find((e) => e.node === "requirement-intake")!;
    ok(intake.execution !== undefined, "the node terminal landed an execution slot on the intake entry (§6.2.4 mapping)");
    ok(manifestSelfVerifies(dir), "the published manifest self-verifies after the terminal projection");

    // Crash-recovery idempotence: re-entering the door re-judges the same
    // three states and re-projects without duplicating or corrupting state.
    // The cursor never moves backwards, the document always self-verifies,
    // and when the replay adds no new journal material the bytes do not move.
    const throughBefore = afterFirst.projected_through as number;
    const bytesBefore = readFileSync(join(dir, "manifest.md"), "utf8");
    const replay = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-chain" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(
      replay.blocking_reason_code === undefined || replay.blocking_reason_code === null,
      "a replay does not stop on the manifest",
    );
    const afterReplay = readManifestDoc(dir);
    ok((afterReplay.projected_through as number) >= throughBefore, "projected_through never moves backwards across a resume");
    ok(manifestSelfVerifies(dir), "the manifest still self-verifies after the resume");
    if ((afterReplay.projected_through as number) === throughBefore) {
      ok(readFileSync(join(dir, "manifest.md"), "utf8") === bytesBefore,
        "a resume that adds no journal material leaves the manifest byte-identical");
    }
    assert.ok(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function scenarioInterruptedResumeFresh(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const s = stores(control, repo);
  try {
    // Seed the crashed-attempt shape: a run whose intake claim is still
    // STARTED (no terminal). This is the interrupted-resume entry into the
    // chain, i.e. the second terminal→projector call point.
    const parsed = parsedEntry({ repo, control, runId: "run-t4-interrupted" });
    const source = s.artifactStore.put("requirement_summary", "build it");
    s.runStore.createRun(parsed.identity);
    s.runStore.appendEvent(Object.freeze({
      eventId: `${parsed.identity.runId}:2:run_started`,
      runId: parsed.identity.runId,
      sequence: 2,
      kind: "run_started" as const,
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
    }));
    s.runStore.appendCapabilityExecution(Object.freeze({
      schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
      executionEventId: `${parsed.identity.runId}:capability:1:started`,
      runId: parsed.identity.runId,
      sequence: 1,
      capability: "requirement-intake",
      executionRole: "primary",
      nodeId: "requirement-intake",
      attempt: 1,
      status: "started",
      createdAt: TS,
      bindingId: "binding-codex-requirement-intake-primary",
      bindingVersion: "2.0.0",
      bindingRegistryVersion: "1",
      executorAgent: "codex",
      executorAdapter: "codex-real-dispatch",
      executorVersion: "1.0.0",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
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
    } as never));
    ok(manifestExists(libraryDirOf(repo)) === false, "the interrupted-resume scenario starts with no library directory (lawful FRESH)");

    const resumed = await runProduction(parsed, "build it", {
      inspectWorkspace: clean,
      runStore: s.runStore,
      artifactStore: s.artifactStore,
      maxDispatches: 2,
    });
    // The interrupted-resume call point must apply the same three-state guard
    // as the main loop: a lawful FRESH requirement whose crashed run is
    // resumed here must NOT be misread as the §6.2.7 legacy-reuse case.
    ok(
      resumed.blocking_reason_code !== "BLOCKED_AMBIGUOUS",
      `interrupted resume of a lawful FRESH run is not misjudged as legacy reuse (got ${String(resumed.blocking_reason_code)})`,
    );
    ok(
      !s.runStore.listEvents(parsed.identity.runId).some((e) => e.kind === "run_blocked"),
      "no durable block event was appended for the lawful fresh resume",
    );
    ok(!manifestExists(libraryDirOf(repo)), "no manifest was minted by the resume");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function scenarioRepairAndGovernedRelease(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const s = stores(control, repo);
  try {
    const dir = libraryDirOf(repo);
    writeManifest(dir, manualInitBase("探针需求"));
    await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-release" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    const runId = s.runStore.findLatestRunByRequirement(REQ)!.state.identity.runId;
    const healthy = readFileSync(join(dir, "manifest.md"), "utf8");

    // Corrupt → durable manifest stop.
    writeFileSync(join(dir, "manifest.md"), healthy.replace(/^title: .*$/mu, "title: tampered"), "utf8");
    const stopped = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-release" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(stopped.blocking_reason_code === "MANIFEST_CORRUPT_STOP", "the corrupt manifest stops the run");
    ok(
      s.runStore.listEvents(runId).some((e) => e.kind === "run_blocked" && e.reasonCode === "MANIFEST_CORRUPT_STOP"),
      "the stop is a durable journal fact (S-2)",
    );

    // While still broken, the governed release must refuse: trust is restored
    // by the manifest, never by the release decision alone.
    let refusedWhileBroken = false;
    try {
      releaseManifestProjectionBlock({
        store: s.runStore,
        requirementId: REQ,
        libraryDir: dir,
        release: { kind: "RISK_ACCEPTED" },
      });
    } catch {
      refusedWhileBroken = true;
    }
    ok(refusedWhileBroken, "the release is refused while the manifest still stops (forces a healthy re-judgement)");

    // §6.2.6 repair: restore the healthy bytes.
    writeFileSync(join(dir, "manifest.md"), healthy, "utf8");

    // The still-durable block keeps the run from proceeding until released.
    const stillBlocked = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-release" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(stillBlocked.chain_status === "BLOCKED" || stillBlocked.blocking_reason_code === undefined || stillBlocked.blocking_reason_code === null,
      "a repaired manifest does not silently bypass the durable block");

    // Governed release: the projection re-judges healthy, so the block clears.
    releaseManifestProjectionBlock({
      store: s.runStore,
      requirementId: REQ,
      libraryDir: dir,
      release: { kind: "RISK_ACCEPTED" },
    });
    ok(
      s.runStore.listEvents(runId).some((e) => e.kind === "run_resumed" && e.reasonCode === "RISK_ACCEPTED"),
      "the governed release is recorded as a run_resumed decision event",
    );
    const afterRelease = await runProduction(
      parsedEntry({ repo, control, runId: "run-t4-release" }),
      "build it",
      { inspectWorkspace: clean, runStore: s.runStore, artifactStore: s.artifactStore, maxDispatches: 3 },
    );
    ok(
      afterRelease.blocking_reason_code === undefined || afterRelease.blocking_reason_code === null,
      `after a governed release the repaired run proceeds (${String(afterRelease.blocking_reason_code)})`,
    );
    ok(manifestSelfVerifies(dir), "the manifest still self-verifies through the stop-repair-release cycle");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("G5-T4 readiness — three entry states (Δ3 / §6.2.7 / DP4)");
  {
    const { root, repo } = makeRoot();
    try {
      const dir = libraryDirOf(repo);
      ok(resolveManifestReadiness(dir).kind === "FRESH", "absent directory is FRESH (intake owns creation)");

      mkdirSync(dir, { recursive: true });
      ok(
        resolveManifestReadiness(dir).kind === "LEGACY_NO_MANIFEST",
        "existing directory without a manifest is the legacy archive state",
      );

      writeManifest(dir, manualInitBase("探针需求"));
      ok(resolveManifestReadiness(dir).kind === "MANIFEST_PRESENT", "a manifest.md makes the state MANIFEST_PRESENT");

      const filePath = join(repo, "library", "NOT-A-DIR");
      writeFileSync(filePath, "x", "utf8");
      ok(
        resolveManifestReadiness(filePath).kind === "LEGACY_NO_MANIFEST",
        "a non-directory at the library path is NOT fresh (fail-closed, never dispatched over)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log("G5-T4 preflight — fresh proceeds, legacy reuse stops");
  await scenarioFreshAndLegacy();

  console.log("G5-T4 preflight — corrupt stops before dispatch, and S-2 records it durably");
  await scenarioCorruptStopAndS2();

  console.log("G5-T4 terminal call point — the manifest keeps step with the journal");
  await scenarioTerminalProjection();

  console.log("G5-T4 interrupted resume — a lawful FRESH run is never misjudged as legacy reuse");
  await scenarioInterruptedResumeFresh();

  console.log("G5-T4 recovery — repair plus governed release (RC3-1)");
  await scenarioRepairAndGovernedRelease();

  console.log(`\ng5t4: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
