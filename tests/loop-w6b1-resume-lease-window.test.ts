// W6b1 (E4-T3): the recovery → claim → spawn → terminal/promotion decision
// window must be entered only while the journal's resume lease is held.
//
// Before this wave the coverage was incidental: `run()` happened to wrap the
// whole chain in `withResumeLease`, so nothing prevented a future entry from
// reaching the same claim and spawn path unguarded. These tests pin the
// firewall that now fails closed, and prove the concurrency property the
// contract asks for: concurrent resumes produce at most one spawn.
//
// Reverse probes (run by the independent reviewer, not asserted here):
//  - delete the `isResumeLeaseHeld` guard in loop-capability-entry.ts → T1/T4
//    go red (the window opens unguarded);
//  - delete `requireResumeLeaseJournal: resumeJournalPath` in runtime.ts → the
//    production path silently loses the firewall (T1 still passes because it
//    arms the flag itself, so re-check that line by hand).

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import { isResumeLeaseHeld, withResumeLease } from "../core/loop-resume-lock";
import { LoopRunStore } from "../core/loop-run-store";
import { createKimiFakeRunner, type NodeCapabilityFakeRunner } from "../execution/multi-agent-fake-runners";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import { MultiAgentFakeGateway } from "./fixtures/multi-agent-fake-gateway";

// Contention probes must fail fast instead of queueing for the production
// 120s budget.
process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"] = "40";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

async function rejectsCode(code: string, fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
    assert.fail(message);
  } catch (error) {
    ok(error instanceof LoopRunJournalError && error.code === code, message);
  }
}

const TS = "2026-08-29T00:00:00.000Z";

interface Fixture {
  readonly root: string;
  readonly id: LoopRunIdentity;
  readonly journalPath: string;
  readonly runStore: LoopRunStore;
  readonly artifactStore: LoopArtifactStore;
  readonly source: Readonly<{ artifactRef: string; digest: string }>;
}

function fixture(prefix = "loop-w6b1-"): Fixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const id: LoopRunIdentity = Object.freeze({
    runId: "run-w6b1-001",
    requirementId: "REQ-W6B1-001",
    repository: "example",
    repositoryPath: repo,
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/w6b1-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
  const journalPath = join(root, "journal.db");
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(journalPath, { artifactStore });
  runStore.init();
  artifactStore.init();
  const source = artifactStore.put("requirement_summary", "W6b1 resume lease window source");
  return Object.freeze({ root, id, journalPath, runStore, artifactStore, source });
}

function request(fixture_: Fixture) {
  return Object.freeze({
    requirementId: fixture_.id.requirementId,
    identity: fixture_.id,
    capability: "requirement-intake" as const,
    executionRole: "primary" as const,
    inputArtifactRef: fixture_.source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: fixture_.source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "prove the dispatch window needs the lease" },
  });
}

function gateway(
  fixture_: Fixture,
  counter: { count: number },
): MultiAgentFakeGateway {
  const base = createKimiFakeRunner();
  const counting: NodeCapabilityFakeRunner = {
    run(request: ExecutionRequest): Promise<ExecutionResult> {
      counter.count += 1;
      return base.run(request);
    },
  };
  return new MultiAgentFakeGateway({
    kimiRunnerOverride: counting,
    capabilityTracing: {
      runStore: fixture_.runStore,
      artifactStore: fixture_.artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    },
  });
}

function entry(
  fixture_: Fixture,
  gw: MultiAgentFakeGateway,
  options: Readonly<{ requireResumeLeaseJournal?: string }> = {},
): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore: fixture_.runStore,
    artifactStore: fixture_.artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: gw,
    now: () => TS,
    ...options,
  });
}

async function main(): Promise<void> {
// ─── T1: armed guard, no lease → the window never opens ───────────
{
  const f = fixture("loop-w6b1-t1-");
  try {
    const counter = { count: 0 };
    const guarded = entry(f, gateway(f, counter), { requireResumeLeaseJournal: f.journalPath });
    await rejectsCode(
      "STORE_BUSY",
      () => guarded.execute(request(f)),
      "T1: an armed entry refuses to open the dispatch window without the lease",
    );
    ok(counter.count === 0, "T1: no spawn happened outside the lease");
    ok(
      f.runStore.getSnapshot(f.id.runId) === undefined,
      "T1: refusal happens before any durable write (no run bootstrapped)",
    );
    ok(
      isResumeLeaseHeld(f.journalPath) === false,
      "T1: the lease observer reports not-held outside withResumeLease",
    );
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T2: armed guard, inside the lease → dispatch proceeds ────────
{
  const f = fixture("loop-w6b1-t2-");
  try {
    const counter = { count: 0 };
    const guarded = entry(f, gateway(f, counter), { requireResumeLeaseJournal: f.journalPath });
    const result = await withResumeLease(f.journalPath, () => guarded.execute(request(f)));
    ok(counter.count === 1, "T2: the dispatch inside the lease spawns exactly once");
    ok(result.execution !== undefined, "T2: the guarded dispatch returns an execution result");
    const events = f.runStore.listCapabilityExecutions(f.id.runId);
    ok(
      events.filter((event) => event.status === "started").length === 1,
      "T2: exactly one claim was recorded for the execution point",
    );
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T3: guard not armed → unchanged behaviour (unit-test back-compat) ──
{
  const f = fixture("loop-w6b1-t3-");
  try {
    const counter = { count: 0 };
    const unguarded = entry(f, gateway(f, counter));
    const result = await unguarded.execute(request(f));
    ok(result.execution !== undefined, "T3: an entry that never armed the guard still dispatches");
    ok(counter.count === 1, "T3: the unguarded path is untouched by the firewall");
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T4: the lease identity is per-journal, not "any lease" ───────
{
  const f = fixture("loop-w6b1-t4-");
  try {
    const counter = { count: 0 };
    const otherJournal = join(f.root, "other-journal.db");
    const guarded = entry(f, gateway(f, counter), { requireResumeLeaseJournal: otherJournal });
    await withResumeLease(f.journalPath, async () => {
      await rejectsCode(
        "STORE_BUSY",
        () => guarded.execute(request(f)),
        "T4: holding a different journal's lease does not open this window",
      );
    });
    ok(counter.count === 0, "T4: no spawn happened under a foreign lease");
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T5: the lease observer is exact ──────────────────────────────
{
  const f = fixture("loop-w6b1-t5-");
  try {
    ok(isResumeLeaseHeld(f.journalPath) === false, "T5: not held at rest");
    await withResumeLease(f.journalPath, async () => {
      ok(isResumeLeaseHeld(f.journalPath) === true, "T5: held inside the window");
      await withResumeLease(f.journalPath, async () => {
        ok(isResumeLeaseHeld(f.journalPath) === true, "T5: re-entrant reuse still reads as held");
      });
      ok(
        isResumeLeaseHeld(join(f.root, "other-journal.db")) === false,
        "T5: a different journal is not reported as held",
      );
    });
    ok(isResumeLeaseHeld(f.journalPath) === false, "T5: released after the window closes");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T6: constructor rejects an unusable firewall path ────────────
{
  const f = fixture("loop-w6b1-t6-");
  try {
    for (const bad of ["", "   "]) {
      let threw = false;
      try {
        entry(f, gateway(f, { count: 0 }), { requireResumeLeaseJournal: bad });
      } catch (error) {
        threw = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
      }
      ok(threw, `T6: requireResumeLeaseJournal=${JSON.stringify(bad)} is rejected at construction`);
    }
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// ─── T7: concurrent resumes produce at most one spawn ─────────────
{
  const f = fixture("loop-w6b1-t7-");
  try {
    const counter = { count: 0 };
    const guarded = entry(f, gateway(f, counter), { requireResumeLeaseJournal: f.journalPath });
    const req = request(f);
    const settled = await Promise.allSettled([
      withResumeLease(f.journalPath, () => guarded.execute(req)),
      withResumeLease(f.journalPath, () => guarded.execute(req)),
    ]);
    ok(
      settled.every((item) => item.status === "fulfilled" || item.status === "rejected"),
      "T7: both concurrent resumes settled",
    );
    ok(counter.count === 1, "T7: concurrent resumes spawn the runner at most once");
    const events = f.runStore.listCapabilityExecutions(f.id.runId);
    ok(
      events.filter((event) => event.status === "started").length === 1,
      "T7: exactly one claim was recorded for the contended execution point",
    );
    ok(
      events.filter((event) => event.status === "succeeded").length === 1,
      "T7: exactly one terminal success landed for the contended execution point",
    );
  } finally {
    f.artifactStore.close();
    f.runStore.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

  console.log(`W6b1 resume lease window: ${passed} passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
