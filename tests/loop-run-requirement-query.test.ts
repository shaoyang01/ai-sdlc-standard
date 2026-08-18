// LOOP Run Store — Requirement Query Tests (C01 WP-1)
// ====================================================
// Cross-entry recovery lookup: listRunsByRequirement / findLatestRunByRequirement.
// All databases live in disposable temp directories outside the repository.
// No Git, no network, no Agent. Fail-closed semantics are tested explicitly.

import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TS = "2026-08-19T00:00:00.000Z";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-req-query-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-req-query-test-run-001",
    controlRoot: "/tmp/loop-req-query-test/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `${o.runId ?? "run-001"}:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
    runId: o.runId ?? "run-001",
    sequence: o.sequence,
    kind: o.kind,
    stage: o.stage ?? null,
    attempt: o.attempt ?? (stageLevel ? 1 : 0),
    createdAt: o.createdAt ?? nextTs(),
    inputDigest: o.inputDigest ?? null,
    outputArtifactRef: o.outputArtifactRef ?? null,
    outputDigest: o.outputDigest ?? null,
    errorCode: o.errorCode ?? null,
    retryable: o.retryable ?? null,
    reasonCode: o.reasonCode ?? null,
  });
}

function expectThrow(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert(false, `${message} (no error thrown)`);
  } catch (error) {
    const actual = error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR";
    assert(actual === code, `${message} (got ${actual})`);
  }
}

function withStore(fn: (store: LoopRunStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-req-query-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  try {
    fn(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("requirement query: empty and single-run lookup");
withStore((store) => {
  assert(store.listRunsByRequirement("req-001").length === 0, "empty requirement lists no runs");
  assert(store.findLatestRunByRequirement("req-001") === undefined, "empty requirement has no latest run");

  store.createRun(makeIdentity());
  const runs = store.listRunsByRequirement("req-001");
  assert(runs.length === 1, "one run listed for its requirement");
  assert(runs[0].state.identity.runId === "run-001", "listed snapshot identity matches run-001");
  assert(runs[0].events.some((e) => e.kind === "run_created"), "listed snapshot contains run_created event");

  const latest = store.findLatestRunByRequirement("req-001");
  assert(latest !== undefined && latest.state.identity.runId === "run-001", "latest lookup returns run-001");
});

console.log("requirement query: multiple runs ordered oldest first");
withStore((store) => {
  store.createRun(makeIdentity({ runId: "run-001", createdAt: TS }));
  store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
  store.createRun(makeIdentity({ runId: "run-003", createdAt: nextTs() }));

  const runs = store.listRunsByRequirement("req-001");
  assert(runs.length === 3, "three runs listed");
  assert(
    runs.map((s) => s.state.identity.runId).join(",") === "run-001,run-002,run-003",
    "runs ordered oldest first by createdAt",
  );

  const latest = store.findLatestRunByRequirement("req-001");
  assert(latest !== undefined && latest.state.identity.runId === "run-003", "latest lookup returns run-003");
});

console.log("requirement query: requirement isolation");
withStore((store) => {
  store.createRun(makeIdentity({ requirementId: "req-001" }));
  store.createRun(makeIdentity({ runId: "run-002", requirementId: "req-002" }));

  const runsA = store.listRunsByRequirement("req-001");
  const runsB = store.listRunsByRequirement("req-002");
  assert(runsA.length === 1 && runsA[0].state.identity.runId === "run-001", "req-001 lists only its own run");
  assert(runsB.length === 1 && runsB[0].state.identity.runId === "run-002", "req-002 lists only its own run");
  assert(store.listRunsByRequirement("req-003").length === 0, "unknown requirement lists no runs");
});

console.log("requirement query: fail-closed input validation");
withStore((store) => {
  const sentinel = "SENTINEL-INPUT-7f3a9c";
  const invalidInputs: Array<[unknown, string]> = [
    [12345, "non-string rejected"],
    ["", "empty string rejected"],
    ["   ", "blank string rejected"],
    [" req-001", "leading whitespace rejected"],
    ["req-001 ", "trailing whitespace rejected"],
    ["req\u0000-001", "NUL control character rejected"],
    ["req\u001b-001", "ESC control character rejected"],
  ];
  for (const [input, label] of invalidInputs) {
    expectThrow(
      "INVALID_INPUT",
      () => store.listRunsByRequirement(input as string),
      label,
    );
    expectThrow(
      "INVALID_INPUT",
      () => store.findLatestRunByRequirement(input as string),
      `${label} (latest)`,
    );
  }
  try {
    store.listRunsByRequirement(`${sentinel}\u0007`);
    assert(false, "input not echoed into error message (no error thrown)");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    assert(!message.includes(sentinel), "error message does not echo input sentinel");
  }
});

console.log("requirement query: corruption-first verification");
withStore((store, dir) => {
  store.createRun(makeIdentity());
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_runs SET identity_sha256 = ? WHERE run_id = ?").run("0".repeat(64), "run-001");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRunsByRequirement("req-001"), "tampered identity hash raises STORE_CORRUPT");
  expectThrow("STORE_CORRUPT", () => store.findLatestRunByRequirement("req-001"), "tampered identity hash raises STORE_CORRUPT (latest)");
});

console.log("requirement query: closed store behavior");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-req-query-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  store.close();
  expectThrow("STORE_CLOSED", () => store.listRunsByRequirement("req-001"), "closed store raises STORE_CLOSED");
  rmSync(dir, { recursive: true, force: true });
}

console.log("requirement query: identity and query share one validator (C1 boundary)");
withStore((store) => {
  // C1 control characters (\x80-\x9f) must be rejected consistently by both
  // createRun (identity validation) and the requirement query, otherwise a
  // run could be created that can never be recovered by its own ID.
  const c1Id = "req\u0080-001";
  expectThrow("INVALID_INPUT", () => store.createRun(makeIdentity({ requirementId: c1Id })), "createRun rejects C1 ID");
  expectThrow("INVALID_INPUT", () => store.listRunsByRequirement(c1Id), "query rejects C1 ID (consistent)");
  expectThrow("INVALID_INPUT", () => store.findLatestRunByRequirement(c1Id), "latest lookup rejects C1 ID (consistent)");

  const c0Id = "req\u001b-001";
  expectThrow("INVALID_INPUT", () => store.createRun(makeIdentity({ requirementId: c0Id })), "createRun rejects C0 ID");
  expectThrow("INVALID_INPUT", () => store.listRunsByRequirement(c0Id), "query rejects C0 ID (consistent)");

  // Same validator must accept the same legal boundary for both paths.
  const legalId = "req-!@#-001";
  store.createRun(makeIdentity({ requirementId: legalId }));
  assert(store.listRunsByRequirement(legalId).length === 1, "legal ID accepted by both create and query");
});

console.log("requirement query: created run recoverable by same ID");
withStore((store) => {
  const legalId = "req-recover-边界-001";
  store.createRun(makeIdentity({ requirementId: legalId }));
  const latest = store.findLatestRunByRequirement(legalId);
  assert(
    latest !== undefined && latest.state.identity.requirementId === legalId,
    "created run is recoverable by the same ID",
  );
  const runs = store.listRunsByRequirement(legalId);
  assert(runs.length === 1 && runs[0].state.identity.runId === "run-001", "recovered snapshot matches created run");
});

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
