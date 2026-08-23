// LOOP Run Store v2 Cutover Preflight — Tests (C02-WP3.5-B, D3 rules 4-6)
// ========================================================================
// Covers the read-only journal scanner end to end:
// - fresh v0 databases and healthy v6 journals pass;
// - v1..v5, future formats, unversioned-with-LOOP-tables, non-SQLite files
//   and owner-unconfirmable SQLite files all fail;
// - a real v5 journal reports STOP_AND_RE_RULE with the distinct exit code;
// - the script itself enforces explicit roots and non-zero exit semantics.

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

import {
  canonicalPreflightReportJson,
  preflightLoopRunStoreV2Cutover,
} from "../scripts/preflight-loop-run-store-v2-cutover";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const SCRIPT = join(process.cwd(), "scripts", "preflight-loop-run-store-v2-cutover.ts");

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

const TS = "2026-08-22T08:00:00.000Z";

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: "run-preflight-001",
    requirementId: "REQ-PREFLIGHT-001",
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/preflight-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

/** A healthy v6 journal created by the runtime itself. */
function seedV6Journal(root: string): string {
  const store = new LoopRunStore(join(root, "v6-journal.db"));
  store.init();
  store.createRun(identity(root));
  store.close();
  return root;
}

function seedVersionedFile(root: string, name: string, version: number): string {
  const path = join(root, name);
  const db = new Database(path);
  db.pragma(`user_version = ${version}`);
  db.close();
  return root;
}

function verdictOf(report: ReturnType<typeof preflightLoopRunStoreV2Cutover>, file: string) {
  return report.candidates.find((candidate) => candidate.path.endsWith(file));
}

function withRoot(name: string, fn: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), `loop-preflight-${name}-`));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("preflight: fresh v0 and healthy v6 pass");
  withRoot("pass", (root) => {
    seedV6Journal(root);
    new Database(join(root, "empty-v0.db")).close();
    const report = preflightLoopRunStoreV2Cutover([root]);
    ok(report.candidateCount === 2, "both candidate files discovered");
    ok(report.failureCount === 0 && !report.requiresGovernanceStop, "no failures on fresh v0 + v6");
    ok(verdictOf(report, "v6-journal.db")?.verdict === "OK_V6", "runtime-created journal classifies as OK_V6");
    ok(verdictOf(report, "empty-v0.db")?.verdict === "FRESH_EMPTY", "empty unversioned database is FRESH_EMPTY");
  });

  console.log("preflight: historical formats 1..5 fail; v5 demands STOP_AND_RE_RULE");
  withRoot("historical", (root) => {
    for (const version of [1, 2, 3, 4]) {
      seedVersionedFile(root, `format-${version}.db`, version);
    }
    seedVersionedFile(root, "format-5.db", 5);
    // Give the v5 candidate a LOOP table so its owner is confirmable.
    {
      const db = new Database(join(root, "format-5.db"));
      db.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
      db.close();
    }
    const report = preflightLoopRunStoreV2Cutover([root]);
    for (const version of [1, 2, 3, 4]) {
      ok(
        verdictOf(report, `format-${version}.db`)?.verdict === "FAIL_HISTORICAL_FORMAT" ||
          verdictOf(report, `format-${version}.db`)?.verdict === "FAIL_OWNER_UNKNOWN",
        `format ${version} fails as historical or unconfirmable`,
      );
    }
    ok(report.requiresGovernanceStop, "a v5 journal triggers the governance stop");
    ok(verdictOf(report, "format-5.db")?.verdict === "STOP_AND_RE_RULE", "v5 verdict is STOP_AND_RE_RULE");
    ok(report.failureCount >= 4, "every historical candidate counts as a failure");
  });

  console.log("preflight: future format and unversioned-with-tables fail");
  withRoot("future", (root) => {
    seedVersionedFile(root, "future.db", 8);
    const db = new Database(join(root, "unversioned.db"));
    db.exec("CREATE TABLE loop_findings (finding_id TEXT PRIMARY KEY)");
    db.close();
    const report = preflightLoopRunStoreV2Cutover([root]);
    ok(verdictOf(report, "future.db")?.verdict === "FAIL_FUTURE_FORMAT", "format above 7 fails as future");
    ok(
      verdictOf(report, "unversioned.db")?.verdict === "FAIL_UNVERSIONED_WITH_TABLES",
      "unversioned database carrying LOOP tables fails",
    );
    ok(report.failureCount === 2, "both candidates are failures");
  });

  console.log("preflight: corrupt SQLite and owner-unconfirmable SQLite fail; plain files ignored");
  withRoot("garbage", (root) => {
    // Round 1 (H2): candidates are discovered by magic header. A plain text
    // file is not a candidate at all; a file WITH the magic header but
    // unreadable as SQLite still fails closed.
    writeFileSync(join(root, "notes.txt"), "this is not sqlite at all");
    const corrupt = Buffer.alloc(4096);
    Buffer.from("SQLite format 3\x00", "latin1").copy(corrupt, 0);
    writeFileSync(join(root, "corrupt.db"), corrupt);
    new Database(join(root, "foreign.db")).exec("CREATE TABLE other_app (id INTEGER)");
    const report = preflightLoopRunStoreV2Cutover([root]);
    ok(verdictOf(report, "notes.txt") === undefined, "plain text files are not candidates");
    ok(verdictOf(report, "corrupt.db")?.verdict === "FAIL_NOT_SQLITE",
      "magic-bearing but unreadable SQLite fails as NOT_SQLITE");
    ok(verdictOf(report, "foreign.db")?.verdict === "FAIL_OWNER_UNKNOWN", "SQLite without LOOP tables has no confirmable owner");
    ok(report.failureCount === 2, "both garbage candidates fail");
  });

  console.log("preflight: nested roots scan recursively and dedupe");
  withRoot("nested", (root) => {
    mkdirSync(join(root, "nested", "deeper"), { recursive: true });
    seedVersionedFile(join(root, "nested", "deeper"), "deep.db", 6);
    const report = preflightLoopRunStoreV2Cutover([root, root]);
    ok(report.candidateCount === 1, "the same file found twice is reported once");
    ok(report.scannedRoots.length === 2, "both roots recorded in the report");
  });

  console.log("preflight: canonical JSON digest is stable and content-bound");
  withRoot("digest", (root) => {
    seedV6Journal(root);
    const report = preflightLoopRunStoreV2Cutover([root]);
    const first = canonicalPreflightReportJson(report);
    const second = canonicalPreflightReportJson(preflightLoopRunStoreV2Cutover([root]));
    ok(first === second, "two scans of unchanged state serialize identically");
    ok(first.includes('"schema":"loop-run-store-v2-cutover-preflight:v1"'), "canonical JSON pins the schema");
  });

  console.log("preflight: script exit codes enforce the cutover contract");
  withRoot("exitcodes", (root) => {
    const run = (...args: string[]) =>
      spawnSync(TSX, [SCRIPT, ...args], { encoding: "utf8" });

    // No roots at all → usage error.
    const noArgs = run();
    ok(noArgs.status === 2, "missing roots exits with usage error code 2");

    // Healthy roots → exit 0 with JSON + Markdown + digest on stdout.
    const passDir = join(root, "pass-root");
    mkdirSync(passDir, { recursive: true });
    seedV6Journal(passDir);
    const passing = run(passDir);
    ok(passing.status === 0, "all-pass scan exits 0");
    ok(passing.stdout.includes('"schema": "loop-run-store-v2-cutover-preflight:v1"'), "stdout carries the JSON inventory");
    ok(passing.stdout.includes("# LOOP Run Store v2 Cutover Preflight"), "stdout carries the Markdown inventory");
    ok(/digest: [0-9a-f]{64}/.test(passing.stdout), "stdout carries the report digest");

    // A failing candidate → non-zero exit.
    const failDir = join(root, "fail-root");
    mkdirSync(failDir, { recursive: true });
    seedVersionedFile(failDir, "old-format.db", 3);
    const failing = run(failDir);
    ok(failing.status !== 0, "historical format exits non-zero");

    // A real v5 journal → distinct STOP_AND_RE_RULE exit code 3.
    const stopDir = join(root, "stop-root");
    mkdirSync(stopDir, { recursive: true });
    const v5 = new Database(join(stopDir, "v5.db"));
    v5.pragma("user_version = 5");
    v5.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
    v5.close();
    const stopped = run(stopDir);
    ok(stopped.status === 3, "real v5 journal exits with the STOP_AND_RE_RULE code 3");
    ok(stopped.stdout.includes("STOP_AND_RE_RULE"), "stop report names the only legal next step");
  });

  console.log(`\nloop-run-store-v2-cutover-preflight: ${passed}/${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
