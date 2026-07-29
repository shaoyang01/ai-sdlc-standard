// LOOP-DELIVERY-04 R4 — Reproducible Mutation A–N Evidence Harness
// ============================================================================
// Deterministic, CI-runnable mutation harness for the D04 bounded multi-file
// patch applier. This is EVIDENCE ONLY: it never changes D04 production
// behavior, never mutates the real working tree, and never touches the Git
// index or HEAD of the source repository.
//
// How it works:
//   1. Verify the real working tree's production / test / lock files are
//      byte-identical to HEAD and that the platform is darwin or linux.
//   2. Build a DISPOSABLE copy of the current HEAD via `git archive HEAD`
//      expanded into the system temp directory (outside the repo root), with a
//      read-only symlink to the repo's node_modules.
//   3. Run the targeted D04 suite once in the disposable copy with NO mutation
//      to establish the exact baseline (must be 287 passed / 0 failed).
//   4. For each of the 14 fixed mutations A–N: apply the byte-exact replacement
//      to the disposable copy's core/loop-patch-application.ts, re-run the
//      targeted suite, classify killed / survived / invalid / harness_error
//      against a PRE-DECLARED expectedEvidence, then restore the original bytes
//      in a finally block and re-hash to prove restoration.
//   5. Re-verify the real working tree HEAD / index / file SHAs are unchanged
//      and remove the disposable copy.
//
// Kill rule (strict): a mutation is "killed" only when the targeted suite
// actually starts, exits non-zero, and its FIRST failure evidence matches the
// pre-declared expectedEvidence (first `✗` line, or — for the F/G/H uncaught
// error allowance — a matching uncaught LoopPatchApplicationError + code).
// Any non-zero exit that is a SyntaxError, module-load error, missing tool,
// timeout, or harness fault is NOT a kill.
//
// Platform & cleanup limitations: supports darwin/linux only; no network.
// SIGINT/SIGTERM trigger best-effort disposal cleanup. SIGKILL cannot be
// handled — this harness makes no claim of recovery from SIGKILL.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

// ═══════════════════════════════════════ Constants

const PROD_REL = "core/loop-patch-application.ts";
const TEST_REL = "tests/loop-patch-application.test.ts";
const LOCK_REL = "package-lock.json";

const EXPECTED_BASELINE_PASSED = 287;
const EXPECTED_BASELINE_FAILED = 0;
const PER_RUN_TIMEOUT_MS = 300000; // 5 min per targeted-suite run (baseline ~150s)
const MAX_EVIDENCE_LEN = 400;

type MutStatus = "killed" | "survived" | "invalid" | "harness_error";

interface MutationDef {
  readonly id: string;
  readonly description: string;
  readonly target: string;
  readonly replacement: string;
  readonly expectedEvidence: string;
  readonly allowUncaughtLoopPatchError: boolean;
  readonly expectedErrorCode?: string;
  // Message substring present in the printed stack for uncaught-error kills.
  // The error `code` is a class property and is NOT printed by console.error,
  // so uncaught kills are matched on the error message boundary instead.
  readonly expectedErrorToken?: string;
}

// ── Fixed Mutation A–N definitions (byte-exact target / replacement) ──
// Each target occurs EXACTLY ONCE in core/loop-patch-application.ts at HEAD.
// expectedEvidence is FIXED here before any run; it is never derived from the
// observed failure output.
const MUTATIONS: readonly MutationDef[] = [
  {
    id: "A",
    description: "Exact whitelist bypass",
    target:
      '    for (const s of sections) {\n      if (!allowedSet.has(s.path)) fail("PATCH_PATH_NOT_ALLOWED", "path not allowed");\n    }',
    replacement:
      '    for (const s of sections) {\n      if (false) fail("PATCH_PATH_NOT_ALLOWED", "path not allowed");\n    }',
    expectedEvidence: "path not allowed",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "B",
    description: "Traversal guard bypass",
    target: '    if (s === "." || s === "..") fail("PATCH_UNSAFE_PATH", `${nm} dot segment`);',
    replacement: '    if (s === ".") fail("PATCH_UNSAFE_PATH", `${nm} dot segment`);',
    expectedEvidence: "traversal path",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "C",
    description: "Parent symlink guard bypass",
    target: '      if (st.isSymbolicLink()) fail("PATCH_SYMLINK", "symlink component");',
    replacement: '      if (false) fail("PATCH_SYMLINK", "symlink component");',
    expectedEvidence: "parent symlink rejected",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "D",
    description: "GIT binary patch guard bypass",
    target: 'ln.startsWith("GIT binary patch")',
    replacement: "false",
    expectedEvidence: "GIT binary patch rejected",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "E",
    description: "Index mode 100644 guard bypass",
    target: '          if (mode !== "100644") fail("PATCH_UNSUPPORTED_CHANGE", "index mode not 100644");',
    replacement: '          if (false) fail("PATCH_UNSUPPORTED_CHANGE", "index mode not 100644");',
    expectedEvidence: "index mode non-100644 rejected",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "F",
    description: "Initial forward check bypass",
    target: "    const f0 = await this._applyCheck(workspacePath, patchBuf, false);",
    replacement: "    const f0 = true;",
    expectedEvidence: "target race before apply",
    allowUncaughtLoopPatchError: true,
    expectedErrorCode: "WORKSPACE_DRIFT",
    expectedErrorToken: "target drift after forward check",
  },
  {
    id: "G",
    description: "Initial reverse check bypass",
    target: "    const r0 = await this._applyCheck(workspacePath, patchBuf, true);",
    replacement: "    const r0 = false;",
    expectedEvidence: "second apply already_applied",
    allowUncaughtLoopPatchError: true,
    expectedErrorCode: "PATCH_NOT_APPLICABLE",
    expectedErrorToken: "patch not applicable",
  },
  {
    id: "H",
    description: "Workspace cwd isolation bypass",
    target: "    const applyExit = await this._apply(workspacePath, patchBuf);",
    replacement: "    const applyExit = await this._apply(identity.repositoryPath, patchBuf);",
    expectedEvidence: "multi-file + create apply",
    allowUncaughtLoopPatchError: true,
    expectedErrorCode: "PATCH_RECONCILIATION_FAILED",
    expectedErrorToken: "forward still applies after apply",
  },
  {
    id: "I",
    description: "Partial apply prohibition bypass",
    target: '    const r = await this._runGit(cwd, ["apply", "-"], patch);',
    replacement: '    const r = await this._runGit(cwd, ["apply", "--reject", "-"], patch);',
    expectedEvidence: "no --reject",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "J",
    description: "Post-apply reconciliation bypass",
    target: "    if (!f1 && r1) {",
    replacement: "    if (true) {",
    expectedEvidence: "apply exit 1 no side effect",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "K",
    description: "Expected task HEAD guard bypass",
    target:
      '    if (snap.taskHeadSha !== expectedTaskHeadSha) fail("WORKSPACE_DRIFT", "task HEAD mismatch");',
    replacement: '    if (false) fail("WORKSPACE_DRIFT", "task HEAD mismatch");',
    expectedEvidence: "task HEAD mismatch",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "L",
    description: "Historical status-digest regression",
    target: '    if (state === "applied" && preTarget === postTarget)',
    replacement: '    if (state === "applied" && preStatus === postStatus)',
    expectedEvidence: "dirty layered repair applied",
    allowUncaughtLoopPatchError: true,
    expectedErrorCode: "PATCH_RECONCILIATION_FAILED",
    expectedErrorToken: "applied but target-state invariant violated",
  },
  {
    id: "M",
    description: "Old hunk overlap guard bypass",
    target: '        if (oldStart <= lastOldEnd) fail("PATCH_MALFORMED", "old ranges overlap");',
    replacement: '        if (false) fail("PATCH_MALFORMED", "old ranges overlap");',
    expectedEvidence: "K1 old partial overlap",
    allowUncaughtLoopPatchError: false,
  },
  {
    id: "N",
    description: "Executable target guard bypass",
    target:
      '      if ((st.mode & 0o111) !== 0) fail("PATCH_UNSUPPORTED_CHANGE", "target has exec bit");',
    replacement: '      if (false) fail("PATCH_UNSUPPORTED_CHANGE", "target has exec bit");',
    expectedEvidence: "tracked exec modify rejected",
    allowUncaughtLoopPatchError: false,
  },
];

// ═══════════════════════════════════════ Helpers

function sha256Buf(b: Buffer): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}

function clampLine(s: string): string {
  const one = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim();
  return one.length > MAX_EVIDENCE_LEN ? one.slice(0, MAX_EVIDENCE_LEN) + "…" : one;
}

interface RunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  combined: string;
  durationMs: number;
  timedOut: boolean;
  spawnError: boolean;
}

function runTsxTest(cwd: string, testRel: string, timeoutMs: number): RunResult {
  const tsxBin = path.join(cwd, "node_modules", ".bin", "tsx");
  const start = Date.now();
  const r = spawnSync(tsxBin, [testRel], {
    cwd,
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  const durationMs = Date.now() - start;
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  const spawnError = r.error !== undefined;
  return {
    exitCode: r.status,
    signal: r.signal ?? null,
    stdout,
    stderr,
    combined: stdout + "\n" + stderr,
    durationMs,
    timedOut: r.signal === "SIGTERM" && durationMs >= timeoutMs - 1000,
    spawnError,
  };
}

function parseResults(combined: string): { passed: number | null; failed: number | null } {
  const m = /Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed/.exec(combined);
  if (!m) return { passed: null, failed: null };
  return { passed: Number(m[1]), failed: Number(m[2]) };
}

/** First `✗` failure line, or null. */
function firstFailLine(combined: string): string | null {
  for (const line of combined.split("\n")) {
    const idx = line.indexOf("✗");
    if (idx >= 0) return clampLine(line.slice(idx));
  }
  return null;
}

const NON_KILL_PATTERNS: ReadonlyArray<RegExp> = [
  /SyntaxError/,
  /Cannot find module/,
  /Cannot find package/,
  /ERR_MODULE_NOT_FOUND/,
  /Module not found/,
  /tsx: (command )?not found/i,
  /git: (command )?not found/i,
  /npm: (command )?not found/i,
  /ENOENT.*tsx/,
  /ETIMEDOUT/,
  /operation timed out/i,
];

function looksLikeNonKill(combined: string): boolean {
  return NON_KILL_PATTERNS.some((re) => re.test(combined));
}

/**
 * Message of the FIRST uncaught LoopPatchApplicationError, or null.
 *
 * An uncaught error is printed by the test runner's top-level catch as a stack
 * whose header line is `LoopPatchApplicationError: <message>`. The error `code`
 * is a class property and is NOT part of the printed stack, so uncaught kills
 * are matched on the message boundary. Test result labels also mention
 * `LoopPatchApplicationError` but always as `…→LoopPatchApplicationError:CODE`
 * (prefixed by ✓/✗ and an arrow), never at line start — anchoring to line start
 * distinguishes a genuine uncaught stack from a passing/failing label.
 */
function firstUncaughtMessage(combined: string): string | null {
  for (const line of combined.split("\n")) {
    const m = /^LoopPatchApplicationError:\s*(.*)$/.exec(line);
    if (m) return m[1]!.trim();
  }
  return null;
}

// ═══════════════════════════════════════ Output records

interface MutationRecord {
  id: string;
  description: string;
  status: MutStatus;
  targetMatches: number;
  testExit: number | null;
  durationMs: number;
  firstFailure: string;
  expectedEvidence: string;
  baselineSha256: string;
  mutatedSha256: string;
  restoredSha256: string;
  restoredByteIdentical: boolean;
  note: string;
}

// ═══════════════════════════════════════ Main

async function main(): Promise<void> {
  const platform = process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    console.error(`HARNESS_ERROR unsupported platform: ${platform}`);
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const prodPath = path.join(repoRoot, PROD_REL);
  const testPath = path.join(repoRoot, TEST_REL);
  const lockPath = path.join(repoRoot, LOCK_REL);

  // ── Precondition: real working tree files byte-identical to HEAD ──
  function gitShowHead(rel: string): Buffer {
    const r = spawnSync("git", ["show", `HEAD:${rel}`], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git show HEAD:${rel} failed: ${r.stderr?.toString()}`);
    return r.stdout as Buffer;
  }
  function gitHeadSha(): string {
    const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
    if (r.status !== 0) throw new Error("git rev-parse HEAD failed");
    return r.stdout.trim();
  }
  function gitIndexDigest(): string {
    const r = spawnSync(
      "git",
      ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (r.status !== 0) throw new Error("git diff --cached failed");
    return sha256Buf(Buffer.from(r.stdout, "utf8"));
  }
  function gitStatusPorcelain(): string {
    const r = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
    if (r.status !== 0) throw new Error("git status failed");
    return r.stdout;
  }

  const headBefore = gitHeadSha();
  const indexBefore = gitIndexDigest();
  const statusBefore = gitStatusPorcelain();

  const prodHeadBytes = gitShowHead(PROD_REL);
  const testHeadBytes = gitShowHead(TEST_REL);
  const lockHeadBytes = gitShowHead(LOCK_REL);

  const prodWorkBytes = fs.readFileSync(prodPath);
  const testWorkBytes = fs.readFileSync(testPath);
  const lockWorkBytes = fs.readFileSync(lockPath);

  const prodShaBefore = sha256Buf(prodWorkBytes);
  const testShaBefore = sha256Buf(testWorkBytes);
  const lockShaBefore = sha256Buf(lockWorkBytes);

  if (sha256Buf(prodHeadBytes) !== prodShaBefore) {
    console.error("HARNESS_ERROR real production file differs from HEAD");
    process.exit(1);
  }
  if (sha256Buf(testHeadBytes) !== testShaBefore) {
    console.error("HARNESS_ERROR real test file differs from HEAD");
    process.exit(1);
  }
  if (sha256Buf(lockHeadBytes) !== lockShaBefore) {
    console.error("HARNESS_ERROR real package-lock differs from HEAD");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(repoRoot, "node_modules", ".bin", "tsx"))) {
    console.error("HARNESS_ERROR local tsx not available in node_modules/.bin");
    process.exit(1);
  }

  const baselineProductionSha256 = prodShaBefore;

  // ── Build disposable copy OUTSIDE the repo root via git archive HEAD ──
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "l04-mut-"));
  const disp = path.join(tmpRoot, "work");
  fs.mkdirSync(disp, { recursive: true });

  // Containment sanity: disposable copy must not be inside the repo root.
  const relDisp = path.relative(repoRoot, disp);
  if (!relDisp.startsWith("..") && !path.isAbsolute(relDisp)) {
    console.error("HARNESS_ERROR disposable copy is inside repo root");
    process.exit(1);
  }

  let tempCleanupComplete = false;
  const cleanup = (): void => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      tempCleanupComplete = !fs.existsSync(tmpRoot);
    } catch {
      tempCleanupComplete = false;
    }
  };
  const onSignal = (): void => {
    cleanup();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const records: MutationRecord[] = [];
  let baselineOk = false;
  let baselinePassed: number | null = null;
  let baselineFailed: number | null = null;
  let baselineExit: number | null = null;
  let baselineDurationMs = 0;

  try {
    // Expand HEAD into the disposable copy.
    const archive = spawnSync("git", ["archive", "HEAD"], { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 });
    if (archive.status !== 0 || !archive.stdout) {
      console.error("HARNESS_ERROR git archive HEAD failed");
      process.exit(1);
    }
    const untar = spawnSync("tar", ["-xf", "-"], { cwd: disp, input: archive.stdout, maxBuffer: 256 * 1024 * 1024 });
    if (untar.status !== 0) {
      console.error("HARNESS_ERROR tar extract failed");
      process.exit(1);
    }

    // Read-only reuse of the repo's node_modules via symlink.
    fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(disp, "node_modules"), "dir");

    const dispProd = path.join(disp, PROD_REL);
    const dispTest = path.join(disp, TEST_REL);

    // ── Baseline run (no mutation) ──
    const base = runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS);
    baselineExit = base.exitCode;
    baselineDurationMs = base.durationMs;
    const bp = parseResults(base.combined);
    baselinePassed = bp.passed;
    baselineFailed = bp.failed;
    baselineOk =
      base.exitCode === 0 &&
      bp.passed === EXPECTED_BASELINE_PASSED &&
      bp.failed === EXPECTED_BASELINE_FAILED;

    console.log(
      `BASELINE_RESULT passed=${bp.passed ?? "?"} failed=${bp.failed ?? "?"} exit=${base.exitCode ?? "?"}`,
    );

    if (!baselineOk) {
      console.error("HARNESS_ERROR baseline is not exactly 287/0 — refusing to mutate");
      const ff = firstFailLine(base.combined);
      if (ff) console.error(`BASELINE_FIRST_FAILURE ${ff}`);
      process.exit(1);
    }

    // ── Run each mutation ──
    for (const m of MUTATIONS) {
      const original = fs.readFileSync(dispProd); // baseline bytes (disposable)
      const originalSha = sha256Buf(original);
      const text = original.toString("utf8");

      // Count exact target occurrences.
      let targetMatches = 0;
      let idx = text.indexOf(m.target);
      while (idx >= 0) {
        targetMatches++;
        idx = text.indexOf(m.target, idx + m.target.length);
      }

      const rec: MutationRecord = {
        id: m.id,
        description: m.description,
        status: "harness_error",
        targetMatches,
        testExit: null,
        durationMs: 0,
        firstFailure: "",
        expectedEvidence: m.expectedEvidence,
        baselineSha256: originalSha,
        mutatedSha256: "",
        restoredSha256: "",
        restoredByteIdentical: false,
        note: "",
      };

      if (targetMatches !== 1) {
        rec.status = "invalid";
        rec.note = `target match count ${targetMatches} != 1`;
        records.push(rec);
        emitRecord(rec);
        continue;
      }

      const mutatedText = text.replace(m.target, m.replacement);
      const mutatedBytes = Buffer.from(mutatedText, "utf8");
      rec.mutatedSha256 = sha256Buf(mutatedBytes);

      if (rec.mutatedSha256 === originalSha) {
        rec.status = "invalid";
        rec.note = "replacement did not change bytes";
        records.push(rec);
        emitRecord(rec);
        continue;
      }

      try {
        fs.writeFileSync(dispProd, mutatedBytes);

        const run = runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS);
        rec.testExit = run.exitCode;
        rec.durationMs = run.durationMs;
        const ff = firstFailLine(run.combined);
        rec.firstFailure = ff ?? "";

        if (run.spawnError || run.timedOut) {
          rec.status = "invalid";
          rec.note = run.spawnError ? "targeted test did not start" : "timeout";
        } else if (run.exitCode === 0) {
          rec.status = "survived";
          rec.note = "targeted suite passed under mutation";
        } else if (looksLikeNonKill(run.combined)) {
          rec.status = "invalid";
          rec.note = "non-zero exit from syntax/module/tool/timeout fault";
        } else {
          // Non-zero exit. Require first failure evidence to match the
          // pre-declared expectedEvidence (✗ line), or — for the F/G/H/L
          // uncaught-error allowance — a matching uncaught error message
          // boundary. The error `code` is not printed in an uncaught stack,
          // so matching is on the pre-declared expectedErrorToken.
          const failMatch = ff !== null && ff.includes(m.expectedEvidence);
          let uncaughtMatch = false;
          if (m.allowUncaughtLoopPatchError && m.expectedErrorToken) {
            const msg = firstUncaughtMessage(run.combined);
            uncaughtMatch = msg !== null && msg.includes(m.expectedErrorToken);
          }
          if (failMatch || uncaughtMatch) {
            rec.status = "killed";
            rec.note = failMatch ? "first ✗ evidence matched" : "uncaught error boundary matched";
          } else {
            rec.status = "invalid";
            rec.note = "non-zero exit but expectedEvidence not matched";
          }
        }
      } catch (e) {
        rec.status = "harness_error";
        rec.note = `harness fault: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN);
      } finally {
        // Always restore original bytes, then re-read + re-hash.
        try {
          fs.writeFileSync(dispProd, original);
          const restored = fs.readFileSync(dispProd);
          rec.restoredSha256 = sha256Buf(restored);
          rec.restoredByteIdentical = rec.restoredSha256 === originalSha;
        } catch (e) {
          rec.restoredByteIdentical = false;
          rec.note = `restore failed: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN);
          if (rec.status === "killed") rec.status = "harness_error";
        }
      }

      records.push(rec);
      emitRecord(rec);
    }
  } finally {
    cleanup();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }

  // ── Final real-worktree invariance verification ──
  const headAfter = gitHeadSha();
  const indexAfter = gitIndexDigest();
  const statusAfter = gitStatusPorcelain();
  const prodShaAfter = sha256Buf(fs.readFileSync(prodPath));
  const testShaAfter = sha256Buf(fs.readFileSync(testPath));
  const lockShaAfter = sha256Buf(fs.readFileSync(lockPath));

  const realUnchanged =
    headBefore === headAfter &&
    indexBefore === indexAfter &&
    prodShaBefore === prodShaAfter &&
    testShaBefore === testShaAfter &&
    lockShaBefore === lockShaAfter &&
    statusBefore === statusAfter;

  // ── Summary ──
  const killed = records.filter((r) => r.status === "killed").length;
  const survived = records.filter((r) => r.status === "survived").length;
  const invalid = records.filter((r) => r.status === "invalid").length;
  const harnessError = records.filter((r) => r.status === "harness_error").length;
  const restored = records.filter((r) => r.restoredByteIdentical).length;

  console.log(
    `MUTATION_SUMMARY total=${records.length} killed=${killed} survived=${survived} ` +
      `invalid=${invalid} harness_error=${harnessError} restored=${restored}`,
  );
  console.log(`REAL_WORKTREE_UNCHANGED ${realUnchanged}`);
  console.log(`TEMP_CLEANUP_COMPLETE ${tempCleanupComplete}`);

  const allGood =
    baselineOk &&
    records.length === 14 &&
    killed === 14 &&
    survived === 0 &&
    invalid === 0 &&
    harnessError === 0 &&
    restored === 14 &&
    realUnchanged &&
    tempCleanupComplete;

  process.exit(allGood ? 0 : 1);
}

function emitRecord(r: MutationRecord): void {
  console.log(
    [
      "MUTATION",
      `id=${r.id}`,
      `status=${r.status}`,
      `target_matches=${r.targetMatches}`,
      `test_exit=${r.testExit === null ? "null" : r.testExit}`,
      `duration_ms=${r.durationMs}`,
      `first_failure=${r.firstFailure === "" ? "-" : JSON.stringify(r.firstFailure)}`,
      `expected_evidence=${JSON.stringify(r.expectedEvidence)}`,
      `baseline_sha256=${r.baselineSha256}`,
      `mutated_sha256=${r.mutatedSha256 === "" ? "-" : r.mutatedSha256}`,
      `restored_sha256=${r.restoredSha256 === "" ? "-" : r.restoredSha256}`,
      `restored_byte_identical=${r.restoredByteIdentical}`,
      `note=${r.note === "" ? "-" : JSON.stringify(r.note)}`,
    ].join(" "),
  );
}

main().catch((e) => {
  console.error(`HARNESS_ERROR ${(e as Error).stack ?? (e as Error).message}`);
  process.exit(1);
});
