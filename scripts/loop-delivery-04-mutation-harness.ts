// LOOP-DELIVERY-04 R6 — Isolated Probe Environment & Verified Cleanup
// ============================================================================
// Deterministic, CI-runnable mutation harness for the D04 bounded multi-file
// patch applier. This is EVIDENCE ONLY: it never changes D04 production
// behavior, never mutates the real working tree, and never touches the Git
// index or HEAD of the source repository.
//
// R6 changes (relative to R5), per project-controller review (CHANGES REQUIRED):
//   * All G/H/L probes run under a fully isolated Git environment: independent
//     HOME, XDG_CONFIG_HOME, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1,
//     GIT_TERMINAL_PROMPT=0. No host ~/.gitconfig, system config, init templates,
//     hooksPath, or credential helpers are reachable.
//   * Probe sessions are parent-managed: the parent harness creates a unique
//     session root (l04-probe-session-{G,H,L}-*) with home/, xdg-config/, and
//     fixture/ subdirectories, registers it, and is the SOLE authority for
//     cleanup. The child never creates its own temp root and never deletes the
//     session root.
//   * Every direct execFileSync(git, ...) and every LoopPosixProcessRunner
//     fixedEnv in the probe child uses the same unified PROBE_ENV.
//   * Each PROBE_RESULT emits six real environment-isolation booleans computed
//     from the actual process environment (never hard-coded).
//   * Cleanup is fail-closed: the parent deletes the probe file and session
//     root in a finally, then verifies deletion with existsSync. Cleanup
//     failure forces harness_error and blocks the success gate.
//   * The misleading child-reported fixture_cleanup_complete field is removed.
//   * Two new self-tests: probe_environment_isolation and probe_cleanup_gate.
//   * CLI --mode=full (default, CI) and --mode=quick (local lightweight).
//
// R5 changes (retained):
//   * Every mutation declares an explicit evidence mode:
//       - first_failure    (A,B,C,D,E,F,I,J,K,M,N)
//       - dedicated_probe  (G,H,L)
//   * G/H/L are killed ONLY via a disposable dedicated probe that directly
//     catches the real Error object and emits a single structured
//     `PROBE_RESULT {json}` record. The parent harness re-compares
//     error_name / error_code / error_message and every scenario assertion
//     against FIXED expected values; probe exit 0 alone is never trusted.
//   * `expectedErrorCode` participates in the comparison logic.
//   * Failure paths no longer call process.exit() after the disposable root is
//     created: main() returns an exit code, cleanup runs in a finally that
//     spans the whole disposable session, and process.exitCode is set once.
//
// How it works:
//   1. Static self-checks (source-level invariants of this harness).
//   2. Failure-path self-tests (baseline cleanup, target-mismatch restore,
//      evidence-mismatch restore, probe env isolation, probe cleanup gate)
//      — no network, no full suite.
//   3. Verify the real working tree's production / test / lock files are
//      byte-identical to HEAD and that the platform is darwin or linux.
//   4. Build a DISPOSABLE copy of the current HEAD via `git archive HEAD`
//      expanded into the system temp directory (outside the repo root), with a
//      read-only symlink to the repo's node_modules.
//   5. full mode: Run the targeted D04 suite once with NO mutation to establish
//      the exact baseline (must be 287 passed / 0 failed).
//   6. For each mutation (A–N in full, G/H/L only in quick): apply the
//      byte-exact replacement to the disposable copy, run the targeted suite
//      (full only) and/or dedicated probe, classify, then restore the original
//      bytes in a finally block and re-hash to prove restoration.
//   7. Re-verify the real working tree HEAD / index / file SHAs are unchanged
//      and remove the disposable copy and all probe sessions.
//
// Platform & cleanup limitations: supports darwin/linux only; no network.
// SIGINT/SIGTERM trigger best-effort disposal cleanup (cleanup runs first).
// SIGKILL cannot be handled — this harness makes no claim of recovery from it.

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
const PROBE_TIMEOUT_MS = 120000; // 2 min per dedicated probe
const MAX_EVIDENCE_LEN = 400;
const PROBE_PREFIX = "PROBE_RESULT";

/** Six environment-isolation boolean fields every G/H/L PROBE_RESULT must carry. */
const ENV_ISOLATION_FIELDS = [
  "home_isolated",
  "xdg_config_isolated",
  "git_global_config_disabled",
  "git_system_config_disabled",
  "git_terminal_prompt_disabled",
  "probe_root_contained",
] as const;

type MutStatus = "killed" | "survived" | "invalid" | "harness_error";
type EvidenceMode = "first_failure" | "dedicated_probe";

interface MutationDef {
  readonly id: string;
  readonly description: string;
  readonly target: string;
  readonly replacement: string;
  readonly evidenceMode: EvidenceMode;
  readonly expectedEvidence: string;
  // dedicated_probe-only fixed expectations (present iff evidenceMode === "dedicated_probe"):
  readonly probeScenarioId?: string;
  readonly expectedErrorName?: string;
  readonly expectedErrorCode?: string;
  readonly expectedErrorMessage?: string;
}

// ── Fixed Mutation A–N definitions (byte-exact target / replacement) ──
// Each target occurs EXACTLY ONCE in core/loop-patch-application.ts at HEAD.
// All expected evidence (first-failure token OR probe scenario/name/code/message)
// is FIXED here before any run; it is never derived from observed output.
const MUTATIONS: readonly MutationDef[] = [
  {
    id: "A",
    description: "Exact whitelist bypass",
    target:
      '    for (const s of sections) {\n      if (!allowedSet.has(s.path)) fail("PATCH_PATH_NOT_ALLOWED", "path not allowed");\n    }',
    replacement:
      '    for (const s of sections) {\n      if (false) fail("PATCH_PATH_NOT_ALLOWED", "path not allowed");\n    }',
    evidenceMode: "first_failure",
    expectedEvidence: "path not allowed",
  },
  {
    id: "B",
    description: "Traversal guard bypass",
    target: '    if (s === "." || s === "..") fail("PATCH_UNSAFE_PATH", `${nm} dot segment`);',
    replacement: '    if (s === ".") fail("PATCH_UNSAFE_PATH", `${nm} dot segment`);',
    evidenceMode: "first_failure",
    expectedEvidence: "traversal path",
  },
  {
    id: "C",
    description: "Parent symlink guard bypass",
    target: '      if (st.isSymbolicLink()) fail("PATCH_SYMLINK", "symlink component");',
    replacement: '      if (false) fail("PATCH_SYMLINK", "symlink component");',
    evidenceMode: "first_failure",
    expectedEvidence: "parent symlink rejected",
  },
  {
    id: "D",
    description: "GIT binary patch guard bypass",
    target: 'ln.startsWith("GIT binary patch")',
    replacement: "false",
    evidenceMode: "first_failure",
    expectedEvidence: "GIT binary patch rejected",
  },
  {
    id: "E",
    description: "Index mode 100644 guard bypass",
    target: '          if (mode !== "100644") fail("PATCH_UNSUPPORTED_CHANGE", "index mode not 100644");',
    replacement: '          if (false) fail("PATCH_UNSUPPORTED_CHANGE", "index mode not 100644");',
    evidenceMode: "first_failure",
    expectedEvidence: "index mode non-100644 rejected",
  },
  {
    id: "F",
    description: "Initial forward check bypass",
    target: "    const f0 = await this._applyCheck(workspacePath, patchBuf, false);",
    replacement: "    const f0 = true;",
    evidenceMode: "first_failure",
    expectedEvidence: "target race before apply",
  },
  {
    id: "G",
    description: "Initial reverse check bypass",
    target: "    const r0 = await this._applyCheck(workspacePath, patchBuf, true);",
    replacement: "    const r0 = false;",
    evidenceMode: "dedicated_probe",
    expectedEvidence: "second apply already_applied",
    probeScenarioId: "second_apply_already_applied",
    expectedErrorName: "LoopPatchApplicationError",
    expectedErrorCode: "PATCH_NOT_APPLICABLE",
    expectedErrorMessage: "patch not applicable",
  },
  {
    id: "H",
    description: "Workspace cwd isolation bypass",
    target: "    const applyExit = await this._apply(workspacePath, patchBuf);",
    replacement: "    const applyExit = await this._apply(identity.repositoryPath, patchBuf);",
    evidenceMode: "dedicated_probe",
    expectedEvidence: "multi-file + create apply",
    probeScenarioId: "workspace_cwd_isolation",
    expectedErrorName: "LoopPatchApplicationError",
    expectedErrorCode: "PATCH_RECONCILIATION_FAILED",
    expectedErrorMessage: "forward still applies after apply",
  },
  {
    id: "I",
    description: "Partial apply prohibition bypass",
    target: '    const r = await this._runGit(cwd, ["apply", "-"], patch);',
    replacement: '    const r = await this._runGit(cwd, ["apply", "--reject", "-"], patch);',
    evidenceMode: "first_failure",
    expectedEvidence: "no --reject",
  },
  {
    id: "J",
    description: "Post-apply reconciliation bypass",
    target: "    if (!f1 && r1) {",
    replacement: "    if (true) {",
    evidenceMode: "first_failure",
    expectedEvidence: "apply exit 1 no side effect",
  },
  {
    id: "K",
    description: "Expected task HEAD guard bypass",
    target:
      '    if (snap.taskHeadSha !== expectedTaskHeadSha) fail("WORKSPACE_DRIFT", "task HEAD mismatch");',
    replacement: '    if (false) fail("WORKSPACE_DRIFT", "task HEAD mismatch");',
    evidenceMode: "first_failure",
    expectedEvidence: "task HEAD mismatch",
  },
  {
    id: "L",
    description: "Historical status-digest regression",
    target: '    if (state === "applied" && preTarget === postTarget)',
    replacement: '    if (state === "applied" && preStatus === postStatus)',
    evidenceMode: "dedicated_probe",
    expectedEvidence: "dirty layered repair applied",
    probeScenarioId: "dirty_same_file_layered_repair",
    expectedErrorName: "LoopPatchApplicationError",
    expectedErrorCode: "PATCH_RECONCILIATION_FAILED",
    expectedErrorMessage: "applied but target-state invariant violated",
  },
  {
    id: "M",
    description: "Old hunk overlap guard bypass",
    target: '        if (oldStart <= lastOldEnd) fail("PATCH_MALFORMED", "old ranges overlap");',
    replacement: '        if (false) fail("PATCH_MALFORMED", "old ranges overlap");',
    evidenceMode: "first_failure",
    expectedEvidence: "K1 old partial overlap",
  },
  {
    id: "N",
    description: "Executable target guard bypass",
    target:
      '      if ((st.mode & 0o111) !== 0) fail("PATCH_UNSUPPORTED_CHANGE", "target has exec bit");',
    replacement: '      if (false) fail("PATCH_UNSUPPORTED_CHANGE", "target has exec bit");',
    evidenceMode: "first_failure",
    expectedEvidence: "tracked exec modify rejected",
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

// ═══════════════════════════════════════ Evidence classification

interface EvidenceInput {
  targetMatches: number;
  mutatedSha: string;
  baselineSha: string;
  run: RunResult;
  expectedEvidence: string;
}

/**
 * Classify a first_failure mutation. A kill requires: exactly one target match,
 * mutated bytes differ from baseline, the suite actually started and exited
 * non-zero, is not a syntax/module/tool/timeout fault, and the first `✗` failure
 * line contains the pre-declared expectedEvidence.
 */
function classifyFirstFailure(inp: EvidenceInput): { status: MutStatus; note: string } {
  if (inp.targetMatches !== 1) return { status: "invalid", note: `target match count ${inp.targetMatches} != 1` };
  if (inp.mutatedSha === inp.baselineSha) return { status: "invalid", note: "replacement did not change bytes" };
  if (inp.run.spawnError) return { status: "invalid", note: "targeted test did not start" };
  if (inp.run.timedOut) return { status: "invalid", note: "timeout" };
  if (inp.run.exitCode === 0) return { status: "survived", note: "targeted suite passed under mutation" };
  if (looksLikeNonKill(inp.run.combined))
    return { status: "invalid", note: "non-zero exit from syntax/module/tool/timeout fault" };
  const ff = firstFailLine(inp.run.combined);
  if (ff !== null && ff.includes(inp.expectedEvidence))
    return { status: "killed", note: "first ✗ evidence matched" };
  return { status: "invalid", note: "non-zero exit but expectedEvidence not matched" };
}

// ── Probe result parsing ──

interface ProbeParse {
  ok: boolean;
  count: number;
  obj: Record<string, unknown> | null;
  note: string;
}

/**
 * Parse EXACTLY ONE `PROBE_RESULT {json}` record from combined probe output.
 * Zero records, more than one record, or invalid JSON => ok=false (=> invalid).
 */
function parseProbeResult(combined: string): ProbeParse {
  const records: string[] = [];
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (t.startsWith(PROBE_PREFIX + " ")) records.push(t.slice(PROBE_PREFIX.length + 1));
    else if (t === PROBE_PREFIX) records.push("");
  }
  if (records.length === 0) return { ok: false, count: 0, obj: null, note: "no PROBE_RESULT record" };
  if (records.length !== 1) return { ok: false, count: records.length, obj: null, note: `expected exactly 1 PROBE_RESULT, got ${records.length}` };
  let obj: unknown;
  try {
    obj = JSON.parse(records[0]!);
  } catch {
    return { ok: false, count: 1, obj: null, note: "PROBE_RESULT JSON parse failed" };
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj))
    return { ok: false, count: 1, obj: null, note: "PROBE_RESULT not an object" };
  return { ok: true, count: 1, obj: obj as Record<string, unknown>, note: "" };
}

function strField(obj: Record<string, unknown>, k: string): string | null {
  const v = obj[k];
  return typeof v === "string" ? v : null;
}
function boolField(obj: Record<string, unknown>, k: string): boolean | null {
  const v = obj[k];
  return typeof v === "boolean" ? v : null;
}

interface ProbeCompare {
  killed: boolean;
  envIsolated: boolean;
  note: string;
  scenarioId: string;
  errorName: string;
  errorCode: string;
  errorMessage: string;
  assertions: string[];
}

/**
 * Independently re-compare a parsed PROBE_RESULT object against the FIXED
 * MutationDef expectations. Probe exit 0 is NOT trusted here: every field,
 * every required scenario assertion, and all six environment-isolation
 * booleans must match exactly.
 */
function compareProbe(m: MutationDef, obj: Record<string, unknown>): ProbeCompare {
  const scenarioId = strField(obj, "scenario_id") ?? "";
  const errorName = strField(obj, "error_name") ?? "";
  const errorCode = strField(obj, "error_code") ?? "";
  const errorMessage = strField(obj, "error_message") ?? "";
  const assertions: string[] = [];
  const problems: string[] = [];

  if (scenarioId !== m.probeScenarioId) problems.push(`scenario_id mismatch: ${scenarioId}`);
  if (errorName !== m.expectedErrorName) problems.push(`error_name mismatch: ${errorName}`);
  if (errorCode !== m.expectedErrorCode) problems.push(`error_code mismatch: ${errorCode}`);
  if (errorMessage !== m.expectedErrorMessage) problems.push(`error_message mismatch: ${errorMessage}`);

  // Scenario-specific required boolean assertions (all must be === true).
  let required: string[] = [];
  if (m.id === "G") {
    required = ["first_apply_state_applied", "second_attempt_error", "workspace_head_unchanged"];
    const fa = strField(obj, "first_apply_state");
    const sa = strField(obj, "second_attempt");
    assertions.push(`first_apply_state=${fa ?? "-"}`);
    assertions.push(`second_attempt=${sa ?? "-"}`);
    if (fa !== "applied") problems.push("first_apply_state != applied");
    if (sa !== "error") problems.push("second_attempt != error");
  } else if (m.id === "H") {
    required = [
      "source_file_changed", "workspace_file_unchanged", "source_head_unchanged",
      "workspace_head_unchanged", "index_unchanged",
    ];
  } else if (m.id === "L") {
    required = [
      "patch1_state_applied", "patch2_attempt_error", "status_digest_equal",
      "target_state_digest_changed", "target_content_changed",
      "patch2_target_content_present", "head_unchanged", "index_unchanged",
    ];
    const p1 = strField(obj, "patch1_state");
    const p2 = strField(obj, "patch2_attempt");
    assertions.push(`patch1_state=${p1 ?? "-"}`);
    assertions.push(`patch2_attempt=${p2 ?? "-"}`);
    if (p1 !== "applied") problems.push("patch1_state != applied");
    if (p2 !== "error") problems.push("patch2_attempt != error");
  }
  for (const k of required) {
    const b = boolField(obj, k);
    assertions.push(`${k}=${b === null ? "-" : b}`);
    if (b !== true) problems.push(`assertion ${k} != true`);
  }

  // R6: six environment-isolation assertions common to G/H/L.
  let envIsolated = true;
  for (const k of ENV_ISOLATION_FIELDS) {
    const b = boolField(obj, k);
    assertions.push(`${k}=${b === null ? "-" : b}`);
    if (b !== true) {
      problems.push(`env isolation ${k} != true`);
      envIsolated = false;
    }
  }

  return {
    killed: problems.length === 0,
    envIsolated,
    note: problems.length === 0 ? "probe evidence matched" : problems.join("; ").slice(0, MAX_EVIDENCE_LEN),
    scenarioId,
    errorName,
    errorCode,
    errorMessage,
    assertions,
  };
}

/**
 * Pure classification of a dedicated-probe kill gate. Used by both the main
 * loop and the probe_cleanup_gate self-test. Cleanup failure forces
 * harness_error; environment isolation failure forces invalid.
 */
function classifyProbeKill(inp: {
  probeExitZero: boolean;
  evidenceMatched: boolean;
  envIsolated: boolean;
  fileCleanupComplete: boolean;
  sessionCleanupComplete: boolean;
}): { status: MutStatus; note: string } {
  if (!inp.envIsolated) return { status: "invalid", note: "environment not fully isolated" };
  if (!inp.fileCleanupComplete || !inp.sessionCleanupComplete)
    return { status: "harness_error", note: `probe cleanup incomplete: file=${inp.fileCleanupComplete} session=${inp.sessionCleanupComplete}` };
  if (!inp.probeExitZero) return { status: "invalid", note: "probe exit non-zero" };
  if (!inp.evidenceMatched) return { status: "invalid", note: "evidence mismatch" };
  return { status: "killed", note: "all probe kill conditions met" };
}

// ═══════════════════════════════════════ Output records

interface MutationRecord {
  id: string;
  description: string;
  status: MutStatus;
  evidenceMode: EvidenceMode;
  targetMatches: number;
  testExit: number | null;
  durationMs: number;
  firstFailure: string;
  expectedEvidence: string;
  probeExit: string;
  probeScenarioId: string;
  probeErrorName: string;
  probeErrorCode: string;
  probeErrorMessage: string;
  probeAssertions: string;
  probeEnvironmentIsolated: string;
  probeFileCleanupComplete: string;
  probeSessionCleanupComplete: string;
  baselineSha256: string;
  mutatedSha256: string;
  restoredSha256: string;
  restoredByteIdentical: boolean;
  note: string;
}

function newRecord(m: MutationDef, targetMatches: number, baselineSha: string): MutationRecord {
  return {
    id: m.id,
    description: m.description,
    status: "harness_error",
    evidenceMode: m.evidenceMode,
    targetMatches,
    testExit: null,
    durationMs: 0,
    firstFailure: "",
    expectedEvidence: m.expectedEvidence,
    probeExit: "not_applicable",
    probeScenarioId: "not_applicable",
    probeErrorName: "not_applicable",
    probeErrorCode: "not_applicable",
    probeErrorMessage: "not_applicable",
    probeAssertions: "not_applicable",
    probeEnvironmentIsolated: "not_applicable",
    probeFileCleanupComplete: "not_applicable",
    probeSessionCleanupComplete: "not_applicable",
    baselineSha256: baselineSha,
    mutatedSha256: "",
    restoredSha256: "",
    restoredByteIdentical: false,
    note: "",
  };
}

function emitRecord(r: MutationRecord): void {
  console.log(
    [
      "MUTATION",
      `id=${r.id}`,
      `status=${r.status}`,
      `evidence_mode=${r.evidenceMode}`,
      `target_matches=${r.targetMatches}`,
      `test_exit=${r.testExit === null ? "null" : r.testExit}`,
      `test_duration_ms=${r.durationMs}`,
      `first_failure=${r.firstFailure === "" ? "-" : JSON.stringify(r.firstFailure)}`,
      `expected_evidence=${JSON.stringify(r.expectedEvidence)}`,
      `probe_exit=${r.probeExit}`,
      `probe_scenario_id=${r.probeScenarioId}`,
      `probe_error_name=${r.probeErrorName}`,
      `probe_error_code=${r.probeErrorCode}`,
      `probe_error_message=${r.probeErrorMessage === "not_applicable" ? "not_applicable" : JSON.stringify(r.probeErrorMessage)}`,
      `probe_assertions=${r.probeAssertions === "not_applicable" ? "not_applicable" : JSON.stringify(r.probeAssertions)}`,
      `probe_environment_isolated=${r.probeEnvironmentIsolated}`,
      `probe_file_cleanup_complete=${r.probeFileCleanupComplete}`,
      `probe_session_cleanup_complete=${r.probeSessionCleanupComplete}`,
      `baseline_sha256=${r.baselineSha256}`,
      `mutated_sha256=${r.mutatedSha256 === "" ? "-" : r.mutatedSha256}`,
      `restored_sha256=${r.restoredSha256 === "" ? "-" : r.restoredSha256}`,
      `restored_byte_identical=${r.restoredByteIdentical}`,
      `note=${r.note === "" ? "-" : JSON.stringify(r.note)}`,
    ].join(" "),
  );
}

// ═══════════════════════════════════════ Disposable root + restore helpers

/**
 * Create a fresh temp root, run `work(root)`, and ALWAYS remove the root in a
 * finally. Returns { ok, removed, error }. Used by the failure-path self-tests.
 */
function withDisposableRoot(
  prefix: string,
  work: (root: string) => void,
): { ok: boolean; removed: boolean; error: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  let ok = false;
  let error = "";
  try {
    work(root);
    ok = true;
  } catch (e) {
    error = (e as Error).message;
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* removal failure reflected in `removed` below */
    }
  }
  return { ok, removed: !fs.existsSync(root), error };
}

/** Restore baseline bytes to a file and re-hash to prove byte-identity. */
function restoreMutatedFile(
  filePath: string,
  original: Buffer,
  originalSha: string,
): { restoredSha: string; identical: boolean } {
  fs.writeFileSync(filePath, original);
  const restored = fs.readFileSync(filePath);
  const restoredSha = sha256Buf(restored);
  return { restoredSha, identical: restoredSha === originalSha };
}

// ═══════════════════════════════════════ Parent-managed probe sessions

/** Registry of all probe session roots and probe files created this run. */
const registeredProbeSessions: string[] = [];
const registeredProbeFiles: string[] = [];

/**
 * Pure env builder for a probe session. Returns the isolated environment
 * variables that the parent passes to the probe child. Deterministic for
 * given inputs — used by both runProbe and the probe_environment_isolation
 * self-test.
 */
function buildProbeSessionEnv(sessionRoot: string, repoRoot: string): Record<string, string> {
  const homeDir = path.join(sessionRoot, "home");
  const xdgConfigDir = path.join(sessionRoot, "xdg-config");
  const fixtureDir = path.join(sessionRoot, "fixture");
  return {
    HOME: homeDir,
    XDG_CONFIG_HOME: xdgConfigDir,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    LC_ALL: "C",
    LANG: "C",
    L04_PROBE_SESSION_ROOT: sessionRoot,
    L04_PROBE_ROOT: fixtureDir,
    L04_EXPECTED_HOME: homeDir,
    L04_EXPECTED_XDG_CONFIG_HOME: xdgConfigDir,
    L04_REAL_REPO_ROOT: repoRoot,
  };
}

/**
 * Create and register a unique probe session root with home/, xdg-config/,
 * and fixture/ subdirectories. The parent harness is the sole authority for
 * cleanup of this directory tree.
 */
function createProbeSession(id: string): {
  sessionRoot: string;
  homeDir: string;
  xdgConfigDir: string;
  fixtureDir: string;
} {
  const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `l04-probe-session-${id}-`));
  const homeDir = path.join(sessionRoot, "home");
  const xdgConfigDir = path.join(sessionRoot, "xdg-config");
  const fixtureDir = path.join(sessionRoot, "fixture");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(xdgConfigDir, { recursive: true });
  fs.mkdirSync(fixtureDir, { recursive: true });
  registeredProbeSessions.push(sessionRoot);
  return { sessionRoot, homeDir, xdgConfigDir, fixtureDir };
}

interface ProbeRunResult {
  run: RunResult;
  environmentConfigured: boolean;
  probeFileCleanupComplete: boolean;
  probeSessionCleanupComplete: boolean;
  registeredSessionRoot: string;
}

// ═══════════════════════════════════════ Failure-path self-tests

interface SelfTestResult {
  baseline_failure_cleanup: boolean;
  target_mismatch_restore_cleanup: boolean;
  evidence_mismatch_restore_cleanup: boolean;
  probe_environment_isolation: boolean;
  probe_cleanup_gate: boolean;
}

/**
 * Self-test 1: a controlled error thrown inside the "baseline" phase must still
 * trigger the finally cleanup, leaving no temp root behind.
 */
function selfTestBaselineFailureCleanup(): boolean {
  const r = withDisposableRoot("l04-st1-", (root) => {
    fs.mkdirSync(path.join(root, "work"), { recursive: true });
    // Simulate entering the baseline phase, then a fixed controlled failure.
    throw new Error("CONTROLLED_BASELINE_FAILURE");
  });
  // work threw (ok=false) but cleanup must have removed the root.
  return r.ok === false && r.removed === true && r.error === "CONTROLLED_BASELINE_FAILURE";
}

/**
 * Self-test 2: a non-existent target yields target_matches=0 => invalid, the
 * file bytes stay equal to baseline, and the temp root is removed.
 */
function selfTestTargetMismatchRestoreCleanup(): boolean {
  const r = withDisposableRoot("l04-st2-", (root) => {
    const file = path.join(root, "prod.ts");
    const baseline = Buffer.from("const a = 1;\nconst b = 2;\n", "utf8");
    fs.writeFileSync(file, baseline);
    const baselineSha = sha256Buf(baseline);
    const text = baseline.toString("utf8");
    const target = "THIS_TARGET_DOES_NOT_EXIST";
    let targetMatches = 0;
    let idx = text.indexOf(target);
    while (idx >= 0) {
      targetMatches++;
      idx = text.indexOf(target, idx + target.length);
    }
    const cls = classifyFirstFailure({
      targetMatches,
      mutatedSha: baselineSha,
      baselineSha,
      run: { exitCode: 1, signal: null, stdout: "", stderr: "", combined: "", durationMs: 0, timedOut: false, spawnError: false },
      expectedEvidence: "irrelevant",
    });
    if (targetMatches !== 0) throw new Error("expected target_matches=0");
    if (cls.status !== "invalid") throw new Error("expected invalid for target mismatch");
    const after = fs.readFileSync(file);
    if (sha256Buf(after) !== baselineSha) throw new Error("file bytes changed");
  });
  return r.ok === true && r.removed === true;
}

/**
 * Self-test 3: simulated mutant bytes + a non-zero RunResult whose first failure
 * does NOT match expectedEvidence => invalid; the finally restores baseline
 * bytes (restored SHA == baseline SHA) and the temp root is removed.
 */
function selfTestEvidenceMismatchRestoreCleanup(): boolean {
  const r = withDisposableRoot("l04-st3-", (root) => {
    const file = path.join(root, "prod.ts");
    const baseline = Buffer.from("function f() { return 1; }\n", "utf8");
    fs.writeFileSync(file, baseline);
    const baselineSha = sha256Buf(baseline);

    // Simulate writing mutant bytes.
    const mutant = Buffer.from("function f() { return 2; }\n", "utf8");
    fs.writeFileSync(file, mutant);
    const mutantSha = sha256Buf(mutant);

    // Simulated non-zero suite run whose first ✗ does NOT match expectedEvidence.
    const run: RunResult = {
      exitCode: 1,
      signal: null,
      stdout: "  ✗ some unrelated failure line\n",
      stderr: "",
      combined: "  ✗ some unrelated failure line\n",
      durationMs: 5,
      timedOut: false,
      spawnError: false,
    };
    const cls = classifyFirstFailure({
      targetMatches: 1,
      mutatedSha: mutantSha,
      baselineSha,
      run,
      expectedEvidence: "EXPECTED_TOKEN_NOT_PRESENT",
    });
    if (cls.status !== "invalid") throw new Error("expected invalid for evidence mismatch");

    // finally-style restore + re-hash
    const rest = restoreMutatedFile(file, baseline, baselineSha);
    if (!rest.identical) throw new Error("restored SHA != baseline SHA");
    if (rest.restoredSha !== baselineSha) throw new Error("restoredSha mismatch");
  });
  return r.ok === true && r.removed === true;
}

/**
 * Self-test 4 (R6): the pure env builder must produce an isolated HOME,
 * XDG_CONFIG_HOME, disabled global/system Git config, disabled terminal
 * prompt, HOME different from the host HOME, and correct containment of
 * session / home / xdg / fixture paths.
 */
function selfTestProbeEnvironmentIsolation(): boolean {
  const sessionRoot = path.join(os.tmpdir(), "l04-st4-env-test");
  const repoRoot = path.join(os.tmpdir(), "l04-st4-repo");
  const env = buildProbeSessionEnv(sessionRoot, repoRoot);
  const sep = path.sep;
  return (
    env.HOME === path.join(sessionRoot, "home") &&
    env.HOME !== (process.env.HOME ?? "") &&
    env.XDG_CONFIG_HOME === path.join(sessionRoot, "xdg-config") &&
    env.GIT_CONFIG_GLOBAL === "/dev/null" &&
    env.GIT_CONFIG_NOSYSTEM === "1" &&
    env.GIT_TERMINAL_PROMPT === "0" &&
    env.L04_PROBE_SESSION_ROOT === sessionRoot &&
    env.L04_PROBE_ROOT === path.join(sessionRoot, "fixture") &&
    env.L04_EXPECTED_HOME === path.join(sessionRoot, "home") &&
    env.L04_EXPECTED_XDG_CONFIG_HOME === path.join(sessionRoot, "xdg-config") &&
    env.L04_REAL_REPO_ROOT === repoRoot &&
    env.HOME.startsWith(sessionRoot + sep) &&
    env.XDG_CONFIG_HOME.startsWith(sessionRoot + sep) &&
    env.L04_PROBE_ROOT.startsWith(sessionRoot + sep)
  );
}

/**
 * Self-test 5 (R6): when all structured evidence is correct and probe exit is
 * 0, but probe_session_cleanup_complete is false, the kill gate must classify
 * as harness_error (NOT killed) and the overall success gate must be false.
 */
function selfTestProbeCleanupGate(): boolean {
  const r = classifyProbeKill({
    probeExitZero: true,
    evidenceMatched: true,
    envIsolated: true,
    fileCleanupComplete: true,
    sessionCleanupComplete: false,
  });
  if (r.status !== "harness_error") return false;
  // Overall success gate must be false when cleanup fails.
  const successGate = r.status === "killed";
  return successGate === false;
}

function runSelfTests(): SelfTestResult {
  return {
    baseline_failure_cleanup: selfTestBaselineFailureCleanup(),
    target_mismatch_restore_cleanup: selfTestTargetMismatchRestoreCleanup(),
    evidence_mismatch_restore_cleanup: selfTestEvidenceMismatchRestoreCleanup(),
    probe_environment_isolation: selfTestProbeEnvironmentIsolation(),
    probe_cleanup_gate: selfTestProbeCleanupGate(),
  };
}

// ═══════════════════════════════════════ Dedicated probes (G/H/L)

/**
 * Build the disposable probe TypeScript source for a given mutation. The probe
 * imports the MUTATED production module from the disposable copy, uses the
 * parent-provided L04_PROBE_ROOT as its fixture root (never creates its own
 * temp root), drives the exact scenario under a fully isolated Git environment,
 * directly catches the real Error object, and prints a single
 * `PROBE_RESULT {json}` line with six real environment-isolation booleans.
 * It exits 0 only if ALL of its own fixed expectations match; otherwise it
 * exits 1. The probe never deletes the session root — the parent is the sole
 * cleanup authority. The probe never touches the real repository.
 */
function buildProbeSource(m: MutationDef, disp: string): string {
  const common = `
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { delimiter, join, dirname } from "node:path";
import { LoopPatchApplicationManager } from ${JSON.stringify(path.join(disp, "core", "loop-patch-application").replace(/\\/g, "/"))};
import { LoopGitWorkspaceManager } from ${JSON.stringify(path.join(disp, "core", "loop-git-workspace").replace(/\\/g, "/"))};
import { LoopPosixProcessRunner } from ${JSON.stringify(path.join(disp, "core", "loop-posix-process-runner").replace(/\\/g, "/"))};

const MUTATION_ID = ${JSON.stringify(m.id)};
const SCENARIO_ID = ${JSON.stringify(m.probeScenarioId ?? "")};
const EXP_NAME = ${JSON.stringify(m.expectedErrorName ?? "")};
const EXP_CODE = ${JSON.stringify(m.expectedErrorCode ?? "")};
const EXP_MSG = ${JSON.stringify(m.expectedErrorMessage ?? "")};

// ── Environment validation (parent-provided paths) ──
const SESSION_ROOT = process.env.L04_PROBE_SESSION_ROOT ?? "";
const PROBE_ROOT = process.env.L04_PROBE_ROOT ?? "";
const EXPECTED_HOME = process.env.L04_EXPECTED_HOME ?? "";
const EXPECTED_XDG = process.env.L04_EXPECTED_XDG_CONFIG_HOME ?? "";
const REAL_REPO_ROOT = process.env.L04_REAL_REPO_ROOT ?? "";

function fail(msg: string): never {
  console.error("PROBE_FAULT " + msg);
  process.exitCode = 1;
  throw new Error(msg);
}

const envChecks: [string, string][] = [
  ["L04_PROBE_SESSION_ROOT", SESSION_ROOT],
  ["L04_PROBE_ROOT", PROBE_ROOT],
  ["L04_EXPECTED_HOME", EXPECTED_HOME],
  ["L04_EXPECTED_XDG_CONFIG_HOME", EXPECTED_XDG],
  ["L04_REAL_REPO_ROOT", REAL_REPO_ROOT],
];
for (const [nm, val] of envChecks) {
  if (!path.isAbsolute(val)) fail("env " + nm + " not absolute: " + val);
}
if (!EXPECTED_HOME.startsWith(SESSION_ROOT + "/")) fail("home not contained in session root");
if (!EXPECTED_XDG.startsWith(SESSION_ROOT + "/")) fail("xdg not contained in session root");
if (!PROBE_ROOT.startsWith(SESSION_ROOT + "/")) fail("fixture not contained in session root");
if (PROBE_ROOT === REAL_REPO_ROOT || PROBE_ROOT.startsWith(REAL_REPO_ROOT + "/")) fail("fixture inside real repo");

// ── Isolation evidence (computed from actual environment, never hard-coded) ──
const home_isolated = process.env.HOME === EXPECTED_HOME;
const xdg_config_isolated = process.env.XDG_CONFIG_HOME === EXPECTED_XDG;
const git_global_config_disabled = process.env.GIT_CONFIG_GLOBAL === "/dev/null";
const git_system_config_disabled = process.env.GIT_CONFIG_NOSYSTEM === "1";
const git_terminal_prompt_disabled = process.env.GIT_TERMINAL_PROMPT === "0";
const probe_root_contained =
  PROBE_ROOT.startsWith(SESSION_ROOT + "/") &&
  PROBE_ROOT !== REAL_REPO_ROOT &&
  !PROBE_ROOT.startsWith(REAL_REPO_ROOT + "/");

// ── Unified isolated environment for ALL Git calls ──
const PROBE_ENV: Record<string, string> = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: process.env.HOME ?? "",
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? "",
  GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL ?? "",
  GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM ?? "",
  GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? "",
  LC_ALL: "C",
  LANG: "C",
};

function sha256(d: Buffer | string): string {
  return crypto.createHash("sha256").update(typeof d === "string" ? Buffer.from(d, "utf8") : d).digest("hex");
}
function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try { const st = fs.lstatSync(fp); if (st.isFile() && (st.mode & 0o111)) return fs.realpathSync(fp); } catch {}
  }
  throw new Error("git not found");
}
const GP = findGit();
const A_OLD = "alpha\\nbeta\\ngamma\\n";
const A_NEW = "alpha\\nBETA\\ngamma\\n";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync(GP, args as string[], { cwd, encoding: "utf8", env: PROBE_ENV });
}

function makeDiff(oldC: string, newC: string, rel: string, scratchRoot: string): string {
  const sc = path.join(scratchRoot, "diff-" + crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(sc, { recursive: true });
  execFileSync(GP, ["init", "-q"], { cwd: sc, env: PROBE_ENV });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: sc, env: PROBE_ENV });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: sc, env: PROBE_ENV });
  fs.mkdirSync(dirname(join(sc, rel)), { recursive: true });
  fs.writeFileSync(join(sc, rel), oldC);
  execFileSync(GP, ["add", "-A"], { cwd: sc, env: PROBE_ENV });
  execFileSync(GP, ["commit", "-q", "-m", "base"], { cwd: sc, env: PROBE_ENV });
  fs.writeFileSync(join(sc, rel), newC);
  return execFileSync(GP, ["diff", "--no-color", "--", rel], { cwd: sc, encoding: "utf8", env: PROBE_ENV });
}

interface Fixture { tr: string; rp: string; cr: string; baseSha: string; featSha: string; }
function setupRepo(root: string): Fixture {
  const tr = fs.realpathSync(root);
  const rp = join(tr, "repo"), cr = join(tr, "ctrl");
  fs.mkdirSync(rp, { recursive: true }); fs.mkdirSync(cr, { recursive: true });
  execFileSync(GP, ["init", "-b", "main"], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: rp, env: PROBE_ENV });
  fs.writeFileSync(join(rp, "a.txt"), A_OLD);
  fs.writeFileSync(join(rp, "b.txt"), "one\\ntwo\\n");
  execFileSync(GP, ["add", "a.txt", "b.txt"], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["commit", "-m", "init"], { cwd: rp, env: PROBE_ENV });
  const baseSha = git(rp, ["rev-parse", "HEAD"]).trim();
  execFileSync(GP, ["checkout", "-b", "feat/loop-runtime-v1"], { cwd: rp, env: PROBE_ENV });
  fs.writeFileSync(join(rp, "c.txt"), "cee\\n");
  execFileSync(GP, ["add", "c.txt"], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["commit", "-m", "feat"], { cwd: rp, env: PROBE_ENV });
  const featSha = git(rp, ["rev-parse", "HEAD"]).trim();
  execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: rp, env: PROBE_ENV });
  execFileSync(GP, ["checkout", "main"], { cwd: rp, env: PROBE_ENV });
  return { tr, rp, cr, baseSha, featSha };
}
function mkRunner(f: Fixture) {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GP, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [f.rp, f.cr],
    fixedEnv: {
      GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      HOME: process.env.HOME ?? "", XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? "",
      PATH: join(GP, ".."), LC_ALL: "C", LANG: "C",
    },
    allowedRequestEnvKeys: [], defaultTimeoutMs: 15000,
  });
}
function mkId(f: Fixture, runId: string, taskBranch: string) {
  return Object.freeze({
    runId, requirementId: "req", repository: "example/fixture-repo", repositoryPath: f.rp,
    baseBranch: "feat/loop-runtime-v1", expectedBaseSha: f.featSha, taskBranch,
    controlRoot: f.cr, createdAt: new Date().toISOString(),
  });
}
function mkReq(id: any, snap: any, patch: string, allowed: readonly string[]) {
  return {
    identity: id,
    workspace: {
      workspacePath: snap.workspacePath, taskBranch: id.taskBranch,
      expectedTaskHeadSha: snap.taskHeadSha, expectedPreStatusDigestSha256: snap.taskStatusDigestSha256,
    },
    patchBytes: patch, expectedPatchSha256: sha256(patch), allowedPaths: allowed,
  };
}
function emit(obj: Record<string, unknown>): void {
  console.log("PROBE_RESULT " + JSON.stringify(obj));
}
`;

  if (m.id === "G") {
    return common + `
async function scenario(): Promise<void> {
  const f = setupRepo(PROBE_ROOT);
  const runner = mkRunner(f);
  const wsMgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId(f, "g", "codex/g");
  const snap0 = await wsMgr.prepare(id);
  const mgr = new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr, gitExecutableId: "git" });
  const patch = makeDiff(A_OLD, A_NEW, "a.txt", PROBE_ROOT);
  const headBefore = git(snap0.workspacePath, ["rev-parse", "HEAD"]).trim();

  const r1 = await mgr.apply(mkReq(id, snap0, patch, ["a.txt"]));
  const firstApplyState = r1.state;

  // Do NOT commit the first modification. Re-inspect to get the updated
  // (dirty) pre-status digest, then apply the SAME patch again.
  const snap1 = await wsMgr.inspect(id);
  let secondAttempt = "no_error";
  let errorName = "", errorCode = "", errorMessage = "";
  try {
    await mgr.apply(mkReq(id, snap1, patch, ["a.txt"]));
  } catch (e: any) {
    secondAttempt = "error";
    errorName = e?.name ?? "";
    errorCode = e?.code ?? "";
    errorMessage = e?.message ?? "";
  }
  const headAfter = git(snap0.workspacePath, ["rev-parse", "HEAD"]).trim();
  const workspaceHeadUnchanged = headBefore === headAfter;

  const checksOk =
    firstApplyState === "applied" &&
    secondAttempt === "error" &&
    errorName === EXP_NAME && errorCode === EXP_CODE && errorMessage === EXP_MSG &&
    workspaceHeadUnchanged;

  emit({
    mutation_id: MUTATION_ID, scenario_id: SCENARIO_ID, status: checksOk ? "expected_error" : "mismatch",
    first_apply_state: firstApplyState, second_attempt: secondAttempt,
    error_name: errorName, error_code: errorCode, error_message: errorMessage,
    workspace_head_unchanged: workspaceHeadUnchanged,
    first_apply_state_applied: firstApplyState === "applied",
    second_attempt_error: secondAttempt === "error",
    home_isolated, xdg_config_isolated, git_global_config_disabled,
    git_system_config_disabled, git_terminal_prompt_disabled, probe_root_contained,
  });
  if (!checksOk) process.exitCode = 1;
}
scenario().catch((e) => { console.error("PROBE_FAULT " + (e?.stack ?? e?.message)); process.exitCode = 1; });
`;
  }

  if (m.id === "H") {
    return common + `
async function scenario(): Promise<void> {
  const f = setupRepo(PROBE_ROOT);
  const runner = mkRunner(f);
  const wsMgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId(f, "h", "codex/h");
  const snap0 = await wsMgr.prepare(id);
  const mgr = new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr, gitExecutableId: "git" });
  const ws = snap0.workspacePath;
  const patch = makeDiff(A_OLD, A_NEW, "a.txt", PROBE_ROOT);

  const sourceFileBefore = fs.readFileSync(join(f.rp, "a.txt"));
  const workspaceFileBefore = fs.readFileSync(join(ws, "a.txt"));
  const sourceHeadBefore = git(f.rp, ["rev-parse", "HEAD"]).trim();
  const workspaceHeadBefore = git(ws, ["rev-parse", "HEAD"]).trim();
  const indexBefore = git(ws, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]);

  let errorName = "", errorCode = "", errorMessage = "", attempt = "no_error";
  try {
    await mgr.apply(mkReq(id, snap0, patch, ["a.txt"]));
  } catch (e: any) {
    attempt = "error";
    errorName = e?.name ?? "";
    errorCode = e?.code ?? "";
    errorMessage = e?.message ?? "";
  }

  const sourceFileAfter = fs.readFileSync(join(f.rp, "a.txt"));
  const workspaceFileAfter = fs.readFileSync(join(ws, "a.txt"));
  const sourceHeadAfter = git(f.rp, ["rev-parse", "HEAD"]).trim();
  const workspaceHeadAfter = git(ws, ["rev-parse", "HEAD"]).trim();
  const indexAfter = git(ws, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]);

  // Under mutation H the real apply is mis-directed to the Source fixture
  // repository (identity.repositoryPath) instead of the isolated worktree.
  const sourceFileChanged = !sourceFileBefore.equals(sourceFileAfter) &&
    sourceFileAfter.toString("utf8") === A_NEW;
  const workspaceFileUnchanged = workspaceFileBefore.equals(workspaceFileAfter) &&
    workspaceFileAfter.toString("utf8") === A_OLD;
  const sourceHeadUnchanged = sourceHeadBefore === sourceHeadAfter;
  const workspaceHeadUnchanged = workspaceHeadBefore === workspaceHeadAfter;
  const indexUnchanged = indexBefore === indexAfter;

  const checksOk =
    attempt === "error" &&
    errorName === EXP_NAME && errorCode === EXP_CODE && errorMessage === EXP_MSG &&
    sourceFileChanged && workspaceFileUnchanged &&
    sourceHeadUnchanged && workspaceHeadUnchanged && indexUnchanged;

  emit({
    mutation_id: MUTATION_ID, scenario_id: SCENARIO_ID, status: checksOk ? "expected_error" : "mismatch",
    attempt, error_name: errorName, error_code: errorCode, error_message: errorMessage,
    source_file_changed: sourceFileChanged, workspace_file_unchanged: workspaceFileUnchanged,
    source_head_unchanged: sourceHeadUnchanged, workspace_head_unchanged: workspaceHeadUnchanged,
    index_unchanged: indexUnchanged,
    home_isolated, xdg_config_isolated, git_global_config_disabled,
    git_system_config_disabled, git_terminal_prompt_disabled, probe_root_contained,
  });
  if (!checksOk) process.exitCode = 1;
}
scenario().catch((e) => { console.error("PROBE_FAULT " + (e?.stack ?? e?.message)); process.exitCode = 1; });
`;
  }

  // m.id === "L"
  return common + `
// Single-file target-state digest using the SAME encoding as production
// (loop-patch-target-state-v2). Reimplemented here (not via the private method).
function targetStateDigest(root: string, rel: string): string {
  const h = crypto.createHash("sha256");
  h.update("loop-patch-target-state-v2");
  const abs = path.join(root, rel);
  let st: fs.Stats;
  try { st = fs.lstatSync(abs); }
  catch { h.update("\\u0000" + rel + ":missing"); return h.digest("hex"); }
  const kind = st.isSymbolicLink() ? "symlink" : st.isDirectory() ? "dir" : st.isFile() ? "file" : "special";
  h.update("\\u0000" + rel + ":" + kind + ":" + st.mode + ":" + st.size + ":");
  if (st.isFile()) h.update(sha256(fs.readFileSync(abs)));
  return h.digest("hex");
}
function statusDigest(ws: string): string {
  const out = git(ws, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return sha256(out);
}
async function scenario(): Promise<void> {
  const f = setupRepo(PROBE_ROOT);
  const runner = mkRunner(f);
  const wsMgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId(f, "l", "codex/l");
  const snap0 = await wsMgr.prepare(id);
  const mgr = new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr, gitExecutableId: "git" });
  const ws = snap0.workspacePath;

  // patch1: A_OLD -> A_NEW, applied, NOT committed (workspace stays dirty).
  const p1 = makeDiff(A_OLD, A_NEW, "a.txt", PROBE_ROOT);
  const r1 = await mgr.apply(mkReq(id, snap0, p1, ["a.txt"]));
  const patch1State = r1.state;

  // Re-inspect the dirty workspace.
  const snapD = await wsMgr.inspect(id);

  // patch2 builds on patch1's result, modifying the SAME dirty file.
  const p2 = makeDiff(A_NEW, "alpha\\nBETA\\ndelta\\n", "a.txt", PROBE_ROOT);
  const PATCH2_TARGET = "alpha\\nBETA\\ndelta\\n";

  const preStatus = statusDigest(ws);
  const preTargetState = targetStateDigest(ws, "a.txt");
  const preContent = fs.readFileSync(join(ws, "a.txt"));
  const preContentSha = sha256(preContent);
  const headBefore = git(ws, ["rev-parse", "HEAD"]).trim();
  const indexBefore = git(ws, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]);

  let patch2Attempt = "no_error";
  let errorName = "", errorCode = "", errorMessage = "";
  try {
    await mgr.apply(mkReq(id, snapD, p2, ["a.txt"]));
  } catch (e: any) {
    patch2Attempt = "error";
    errorName = e?.name ?? "";
    errorCode = e?.code ?? "";
    errorMessage = e?.message ?? "";
  }

  const postStatus = statusDigest(ws);
  const postTargetState = targetStateDigest(ws, "a.txt");
  const postContent = fs.readFileSync(join(ws, "a.txt"));
  const postContentSha = sha256(postContent);
  const headAfter = git(ws, ["rev-parse", "HEAD"]).trim();
  const indexAfter = git(ws, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]);

  const statusDigestEqual = preStatus === postStatus;
  const targetStateDigestChanged = preTargetState !== postTargetState;
  const targetContentChanged = preContentSha !== postContentSha;
  const patch2TargetContentPresent = postContent.toString("utf8") === PATCH2_TARGET;
  const headUnchanged = headBefore === headAfter;
  const indexUnchanged = indexBefore === indexAfter;

  const checksOk =
    patch1State === "applied" && patch2Attempt === "error" &&
    errorName === EXP_NAME && errorCode === EXP_CODE && errorMessage === EXP_MSG &&
    statusDigestEqual && targetStateDigestChanged && targetContentChanged &&
    patch2TargetContentPresent && headUnchanged && indexUnchanged;

  emit({
    mutation_id: MUTATION_ID, scenario_id: SCENARIO_ID, status: checksOk ? "expected_error" : "mismatch",
    patch1_state: patch1State, patch2_attempt: patch2Attempt,
    error_name: errorName, error_code: errorCode, error_message: errorMessage,
    pre_status_digest: preStatus, post_status_digest: postStatus, status_digest_equal: statusDigestEqual,
    pre_target_state_digest: preTargetState, post_target_state_digest: postTargetState,
    target_state_digest_changed: targetStateDigestChanged,
    pre_target_content_sha256: preContentSha, post_target_content_sha256: postContentSha,
    target_content_changed: targetContentChanged, patch2_target_content_present: patch2TargetContentPresent,
    head_unchanged: headUnchanged, index_unchanged: indexUnchanged,
    patch1_state_applied: patch1State === "applied", patch2_attempt_error: patch2Attempt === "error",
    home_isolated, xdg_config_isolated, git_global_config_disabled,
    git_system_config_disabled, git_terminal_prompt_disabled, probe_root_contained,
  });
  if (!checksOk) process.exitCode = 1;
}
scenario().catch((e) => { console.error("PROBE_FAULT " + (e?.stack ?? e?.message)); process.exitCode = 1; });
`;
}

/**
 * Run a dedicated probe against the CURRENT mutated bytes in the disposable
 * copy. The parent creates and registers a probe session root, writes the
 * probe file inside the disposable copy, spawns the child with a fully
 * isolated environment, and — in a finally — deletes the probe file and the
 * entire session root, verifying deletion with existsSync. The child never
 * creates its own temp root and never deletes the session root.
 */
function runProbe(m: MutationDef, disp: string, repoRoot: string): ProbeRunResult {
  // 1–2. Parent creates session root with home/, xdg-config/, fixture/.
  const session = createProbeSession(m.id);

  // 3. Parent writes dynamic probe file inside the disposable copy.
  const probeRel = path.join("scripts", `__probe-${m.id}-${crypto.randomBytes(4).toString("hex")}.ts`);
  const probeAbs = path.join(disp, probeRel);
  fs.mkdirSync(path.dirname(probeAbs), { recursive: true });
  fs.writeFileSync(probeAbs, buildProbeSource(m, disp), "utf8");
  registeredProbeFiles.push(probeAbs);

  // Isolated child environment: session paths + Git config lockdown.
  const sessionEnv = buildProbeSessionEnv(session.sessionRoot, repoRoot);
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>), ...sessionEnv };

  let run: RunResult;
  let environmentConfigured = true;
  let probeFileCleanupComplete = false;
  let probeSessionCleanupComplete = false;

  try {
    // 4. Parent starts child.
    const tsxBin = path.join(disp, "node_modules", ".bin", "tsx");
    const start = Date.now();
    const r = spawnSync(tsxBin, [probeRel], {
      cwd: disp,
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: childEnv,
    });
    const durationMs = Date.now() - start;
    // 5. Parent saves child stdout, stderr, exit.
    const stdout = r.stdout ?? "";
    const stderr = r.stderr ?? "";
    run = {
      exitCode: r.status,
      signal: r.signal ?? null,
      stdout,
      stderr,
      combined: stdout + "\n" + stderr,
      durationMs,
      timedOut: r.signal === "SIGTERM" && durationMs >= PROBE_TIMEOUT_MS - 1000,
      spawnError: r.error !== undefined,
    };
  } catch (e) {
    run = {
      exitCode: null, signal: null, stdout: "", stderr: String(e),
      combined: String(e), durationMs: 0, timedOut: false, spawnError: true,
    };
    environmentConfigured = false;
  } finally {
    // 6–9. Parent enters finally, deletes probe file, deletes session root,
    // then verifies both are actually gone.
    try { fs.rmSync(probeAbs, { force: true }); } catch { /* best-effort */ }
    probeFileCleanupComplete = !fs.existsSync(probeAbs);
    try { fs.rmSync(session.sessionRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    probeSessionCleanupComplete = !fs.existsSync(session.sessionRoot);
  }

  // 10. Return real cleanup results.
  return {
    run,
    environmentConfigured,
    probeFileCleanupComplete,
    probeSessionCleanupComplete,
    registeredSessionRoot: session.sessionRoot,
  };
}

// ═══════════════════════════════════════ Static self-checks

interface StaticCheck {
  name: string;
  ok: boolean;
}

/**
 * Strip `//` line comments and `/* *\/` block comments while respecting string
 * literals, template literals, and regex literals, so the static checks below
 * inspect REAL code only (never comment text). Regex awareness matters: a `/`
 * inside a regex literal must not be mistaken for a comment start.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let str: string | null = null; // active quote char (' " `) or null
  let lastSig = ""; // last significant (non-whitespace) char emitted
  const canBeRegex = (prev: string): boolean => {
    if (prev === "") return true;
    return "(,=:[!&|?{};+-*%<>~^".includes(prev);
  };
  while (i < n) {
    const c = src[i]!;
    if (str !== null) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; out += c; lastSig = c; i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "/" && canBeRegex(lastSig)) {
      // Regex literal: copy until the unescaped closing slash, then flags.
      out += c;
      i++;
      let inClass = false;
      while (i < n) {
        const rc = src[i]!;
        out += rc;
        if (rc === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
        if (rc === "[") inClass = true;
        else if (rc === "]") inClass = false;
        else if (rc === "/" && !inClass) { i++; break; }
        i++;
      }
      while (i < n && /[a-z]/.test(src[i]!)) { out += src[i]!; i++; }
      lastSig = "/";
      continue;
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

/**
 * Source-level invariants of THIS harness. To avoid the checker matching its own
 * literals, the two checker functions (stripComments + runStaticChecks) are
 * sliced out of the source first, then comments are stripped; the remaining
 * REAL code is what gets analyzed. Checks are structural, not comment searches.
 */
function runStaticChecks(harnessSource: string): StaticCheck[] {
  const cutStart = harnessSource.indexOf("function stripComments(");
  const cutEnd = harnessSource.indexOf("interface MainOutcome");
  const analyzed =
    cutStart >= 0 && cutEnd > cutStart
      ? harnessSource.slice(0, cutStart) + harnessSource.slice(cutEnd)
      : harnessSource;
  const code = stripComments(analyzed);

  const byId = new Map(MUTATIONS.map((m) => [m.id, m]));
  const g = byId.get("G")!;
  const h = byId.get("H")!;
  const l = byId.get("L")!;

  // ── R5 checks (retained) ──

  // 1. expectedErrorCode is consumed by compareProbe (not merely declared).
  const errorCodeUsed =
    /m\.expectedErrorCode/.test(code) && /errorCode !== m\.expectedErrorCode/.test(code);

  // 2 & 3. The uncaught-error allowance concept is gone from real code.
  const noAllowUncaught = !code.includes("allowUncaught" + "LoopPatchError");
  const noErrorToken = !code.includes("expectedError" + "Token");

  // 4. G/H/L are dedicated_probe.
  const probeModes =
    g.evidenceMode === "dedicated_probe" &&
    h.evidenceMode === "dedicated_probe" &&
    l.evidenceMode === "dedicated_probe";

  // 5. L does not use any uncaught branch (no uncaught classifier remains).
  const noUncaughtBranch =
    !code.includes("firstUncaught" + "Message") && !code.includes("uncaught" + "Match");

  // 6. The main disposable failure path does not directly terminate the process.
  //    The ONLY permitted call is the signal handler, which runs cleanup() first.
  const exitRe = /process\.exit\s*\(/g;
  const exitMatches = code.match(exitRe) ?? [];
  const exitIdx = code.search(exitRe);
  const preWindow = exitIdx >= 0 ? code.slice(Math.max(0, exitIdx - 80), exitIdx) : "";
  const noProcessExit = exitMatches.length === 1 && /cleanup\(\)/.test(preWindow);

  // 7. Probe JSON parsing requires exactly one PROBE_RESULT.
  const exactOneProbe = /records\.length !== 1/.test(code);

  // 8. Probe comparison includes name, code, and message.
  const compareFields =
    /errorName !== m\.expectedErrorName/.test(code) &&
    /errorCode !== m\.expectedErrorCode/.test(code) &&
    /errorMessage !== m\.expectedErrorMessage/.test(code);

  // ── R6 checks ──

  // Isolate the buildProbeSource function body for child-specific checks.
  const bpsStart = code.indexOf("function buildProbeSource(");
  const bpsEnd = code.indexOf("\nfunction runProbe(", bpsStart >= 0 ? bpsStart : 0);
  const bpsBody = bpsStart >= 0 && bpsEnd > bpsStart ? code.slice(bpsStart, bpsEnd) : "";

  // 9. Probe env explicitly sets HOME.
  const envSetsHome = /HOME:\s*homeDir/.test(code) || code.includes("HOME: homeDir");

  // 10. Probe env explicitly sets XDG_CONFIG_HOME.
  const envSetsXdg = /XDG_CONFIG_HOME:\s*xdgConfigDir/.test(code) || code.includes("XDG_CONFIG_HOME: xdgConfigDir");

  // 11. Probe env explicitly sets GIT_CONFIG_GLOBAL.
  const envSetsGitGlobal = code.includes('GIT_CONFIG_GLOBAL: "/dev/null"');

  // 12. Probe env explicitly sets GIT_CONFIG_NOSYSTEM.
  const envSetsGitNosystem = code.includes('GIT_CONFIG_NOSYSTEM: "1"');

  // 13. Probe env explicitly sets GIT_TERMINAL_PROMPT.
  const envSetsGitPrompt = code.includes('GIT_TERMINAL_PROMPT: "0"');

  // 14. Child probe does not call mkdtempSync to create an unknown root;
  //     it uses the parent-provided L04_PROBE_ROOT instead.
  const childNoMkdtemp = bpsBody.includes("L04_PROBE_ROOT") && !bpsBody.includes("mkdtemp" + "Sync");

  // 15. All direct Git helpers in the probe child use the unified PROBE_ENV.
  const gitHelpersIsolated = bpsBody.includes("env: PROBE_ENV");

  // 16. Parent comparison includes the six environment-isolation assertions.
  const parentComparesEnv =
    code.includes("ENV_ISOLATION_FIELDS") && /for\s*\(const k of ENV_ISOLATION_FIELDS\)/.test(code);

  // 17. Killed gate includes parent cleanup results.
  const killedGateCleanup =
    code.includes("fileCleanupComplete") && code.includes("sessionCleanupComplete");

  // 18. Cleanup booleans are computed AFTER actual deletion (existsSync follows rmSync).
  const cleanupAfterDelete =
    /rmSync[\s\S]{0,120}existsSync/.test(code);

  // 19. CLI quick/full argument parsing exists.
  const cliModeParsing = code.includes("--mode=");

  // 20. Default with no arguments is full mode.
  const defaultFull = /mode\s*\?\?\s*"full"/.test(code) || code.includes('?? "full"');

  // 21. Quick mode does not execute the full baseline or A–N mutations.
  const quickSkipsFull = code.includes('mode === "quick"');

  // 22. Child no longer emits the misleading fixture_cleanup_complete field.
  const childNoFixtureCleanup = !bpsBody.includes("fixture_cleanup" + "_complete");

  return [
    { name: "expectedErrorCode_used_in_comparison", ok: errorCodeUsed },
    { name: "no_uncaught_allowance_field", ok: noAllowUncaught },
    { name: "no_error_token_field", ok: noErrorToken },
    { name: "G_H_L_dedicated_probe", ok: probeModes },
    { name: "L_no_uncaught_branch", ok: noUncaughtBranch },
    { name: "no_process_exit_in_harness", ok: noProcessExit },
    { name: "probe_requires_exactly_one_result", ok: exactOneProbe },
    { name: "probe_compares_name_code_message", ok: compareFields },
    { name: "probe_env_sets_HOME", ok: envSetsHome },
    { name: "probe_env_sets_XDG_CONFIG_HOME", ok: envSetsXdg },
    { name: "probe_env_sets_GIT_CONFIG_GLOBAL", ok: envSetsGitGlobal },
    { name: "probe_env_sets_GIT_CONFIG_NOSYSTEM", ok: envSetsGitNosystem },
    { name: "probe_env_sets_GIT_TERMINAL_PROMPT", ok: envSetsGitPrompt },
    { name: "child_no_mkdtempSync", ok: childNoMkdtemp },
    { name: "git_helpers_use_isolated_env", ok: gitHelpersIsolated },
    { name: "parent_comparison_includes_env_assertions", ok: parentComparesEnv },
    { name: "killed_gate_includes_cleanup", ok: killedGateCleanup },
    { name: "cleanup_computed_after_deletion", ok: cleanupAfterDelete },
    { name: "cli_mode_parsing_exists", ok: cliModeParsing },
    { name: "default_mode_is_full", ok: defaultFull },
    { name: "quick_mode_skips_full_baseline", ok: quickSkipsFull },
    { name: "child_no_fixture_cleanup_complete", ok: childNoFixtureCleanup },
  ];
}

// ═══════════════════════════════════════ CLI parsing

function parseCliMode(args: readonly string[]): { mode: "full" | "quick"; error: string } {
  let mode: string | null = null;
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      if (mode !== null) return { mode: "full", error: "duplicate --mode flag" };
      const val = arg.slice("--mode=".length);
      if (val !== "full" && val !== "quick") return { mode: "full", error: `unknown mode: ${val}` };
      mode = val;
    } else {
      return { mode: "full", error: `unknown argument: ${arg}` };
    }
  }
  return { mode: (mode ?? "full") as "full" | "quick", error: "" };
}

// ═══════════════════════════════════════ Main

interface MainOutcome {
  code: number;
  tempCleanupComplete: boolean;
}

async function main(): Promise<MainOutcome> {
  const cli = parseCliMode(process.argv.slice(2));
  if (cli.error !== "") {
    console.error(`HARNESS_ERROR ${cli.error}`);
    return { code: 1, tempCleanupComplete: false };
  }
  const mode = cli.mode;

  const platform = process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    console.error(`HARNESS_ERROR unsupported platform: ${platform}`);
    return { code: 1, tempCleanupComplete: false };
  }

  // ── Static self-checks ──
  let harnessSource = "";
  try {
    harnessSource = fs.readFileSync(path.join(process.cwd(), "scripts", "loop-delivery-04-mutation-harness.ts"), "utf8");
  } catch {
    // Fallback: read relative to this module file.
    try { harnessSource = fs.readFileSync(__filename, "utf8"); } catch { harnessSource = ""; }
  }
  const staticChecks = runStaticChecks(harnessSource);
  for (const c of staticChecks) console.log(`STATIC_CHECK ${c.name}=${c.ok}`);
  if (staticChecks.some((c) => !c.ok)) {
    console.error("HARNESS_ERROR static self-check failed");
    return { code: 1, tempCleanupComplete: false };
  }

  // ── Failure-path self-tests (before any baseline / mutation work) ──
  const st = runSelfTests();
  console.log(
    `HARNESS_SELF_TEST baseline_failure_cleanup=${st.baseline_failure_cleanup} ` +
      `target_mismatch_restore_cleanup=${st.target_mismatch_restore_cleanup} ` +
      `evidence_mismatch_restore_cleanup=${st.evidence_mismatch_restore_cleanup} ` +
      `probe_environment_isolation=${st.probe_environment_isolation} ` +
      `probe_cleanup_gate=${st.probe_cleanup_gate}`,
  );
  if (
    !st.baseline_failure_cleanup || !st.target_mismatch_restore_cleanup ||
    !st.evidence_mismatch_restore_cleanup || !st.probe_environment_isolation ||
    !st.probe_cleanup_gate
  ) {
    console.error("HARNESS_ERROR failure-path self-test failed — refusing to run baseline/mutations");
    return { code: 1, tempCleanupComplete: false };
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
    return { code: 1, tempCleanupComplete: false };
  }
  if (sha256Buf(testHeadBytes) !== testShaBefore) {
    console.error("HARNESS_ERROR real test file differs from HEAD");
    return { code: 1, tempCleanupComplete: false };
  }
  if (sha256Buf(lockHeadBytes) !== lockShaBefore) {
    console.error("HARNESS_ERROR real package-lock differs from HEAD");
    return { code: 1, tempCleanupComplete: false };
  }
  if (!fs.existsSync(path.join(repoRoot, "node_modules", ".bin", "tsx"))) {
    console.error("HARNESS_ERROR local tsx not available in node_modules/.bin");
    return { code: 1, tempCleanupComplete: false };
  }

  // ── Build disposable copy OUTSIDE the repo root via git archive HEAD ──
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "l04-mut-"));
  const disp = path.join(tmpRoot, "work");
  fs.mkdirSync(disp, { recursive: true });

  // Containment sanity: disposable copy must not be inside the repo root.
  const relDisp = path.relative(repoRoot, disp);
  if (!relDisp.startsWith("..") && !path.isAbsolute(relDisp)) {
    console.error("HARNESS_ERROR disposable copy is inside repo root");
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    return { code: 1, tempCleanupComplete: !fs.existsSync(tmpRoot) };
  }

  let disposableRootCleaned = false;
  const cleanup = (): void => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      disposableRootCleaned = !fs.existsSync(tmpRoot);
    } catch {
      disposableRootCleaned = false;
    }
    for (const s of registeredProbeSessions) {
      try { fs.rmSync(s, { recursive: true, force: true }); } catch { /* best-effort */ }
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
  let sessionCode = 0;
  const probeSummary = { total: 0, passed: 0, failed: 0, cleaned: 0, isolated: 0, perId: new Map<string, boolean>() };

  // In quick mode, only G/H/L are processed (probe only, no targeted suite).
  const mutationsToRun = mode === "quick" ? MUTATIONS.filter((m) => m.evidenceMode === "dedicated_probe") : MUTATIONS;

  try {
    // Expand HEAD into the disposable copy. Failures here return a code (the
    // outer finally still runs cleanup) instead of calling process.exit.
    const archive = spawnSync("git", ["archive", "HEAD"], { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 });
    if (archive.status !== 0 || !archive.stdout) {
      console.error("HARNESS_ERROR git archive HEAD failed");
      sessionCode = 1;
      throw new Error("ARCHIVE_FAILED");
    }
    const untar = spawnSync("tar", ["-xf", "-"], { cwd: disp, input: archive.stdout, maxBuffer: 256 * 1024 * 1024 });
    if (untar.status !== 0) {
      console.error("HARNESS_ERROR tar extract failed");
      sessionCode = 1;
      throw new Error("TAR_FAILED");
    }

    // Read-only reuse of the repo's node_modules via symlink.
    fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(disp, "node_modules"), "dir");

    const dispProd = path.join(disp, PROD_REL);

    // ── Baseline run (full mode only) ──
    if (mode !== "quick") {
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
        sessionCode = 1;
        throw new Error("BASELINE_FAILED");
      }
    }

    // ── Run each mutation ──
    for (const m of mutationsToRun) {
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

      const rec = newRecord(m, targetMatches, originalSha);

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

        if (m.evidenceMode === "first_failure") {
          // ── first_failure (full mode only; quick mode skips A–F,I–K,M,N) ──
          const run = runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS);
          rec.testExit = run.exitCode;
          rec.durationMs = run.durationMs;
          const ff = firstFailLine(run.combined);
          rec.firstFailure = ff ?? "";

          const cls = classifyFirstFailure({
            targetMatches,
            mutatedSha: rec.mutatedSha256,
            baselineSha: originalSha,
            run,
            expectedEvidence: m.expectedEvidence,
          });
          rec.status = cls.status;
          rec.note = cls.note;
        } else {
          // ── dedicated_probe (G/H/L) ──
          probeSummary.total++;

          if (mode !== "quick") {
            // Full mode: the targeted suite must actually start and exit non-zero.
            const run = runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS);
            rec.testExit = run.exitCode;
            rec.durationMs = run.durationMs;
            const ff = firstFailLine(run.combined);
            rec.firstFailure = ff ?? "";

            if (run.spawnError) {
              rec.status = "invalid";
              rec.note = "targeted test did not start";
              probeSummary.failed++;
              probeSummary.perId.set(m.id, false);
              records.push(rec);
              emitRecord(rec);
              continue;
            } else if (run.timedOut) {
              rec.status = "invalid";
              rec.note = "targeted suite timeout";
              probeSummary.failed++;
              probeSummary.perId.set(m.id, false);
              records.push(rec);
              emitRecord(rec);
              continue;
            } else if (run.exitCode === 0) {
              rec.status = "invalid";
              rec.note = "targeted suite passed under mutation (probe not run)";
              probeSummary.failed++;
              probeSummary.perId.set(m.id, false);
              records.push(rec);
              emitRecord(rec);
              continue;
            } else if (looksLikeNonKill(run.combined)) {
              rec.status = "invalid";
              rec.note = "targeted suite non-zero from syntax/module/tool/timeout fault";
              probeSummary.failed++;
              probeSummary.perId.set(m.id, false);
              records.push(rec);
              emitRecord(rec);
              continue;
            }
          }

          // Run the dedicated probe (both full and quick mode).
          const probeResult = runProbe(m, disp, repoRoot);
          rec.probeExit = probeResult.run.exitCode === null ? "null" : String(probeResult.run.exitCode);
          rec.probeFileCleanupComplete = String(probeResult.probeFileCleanupComplete);
          rec.probeSessionCleanupComplete = String(probeResult.probeSessionCleanupComplete);

          if (probeResult.run.spawnError || probeResult.run.timedOut || looksLikeNonKill(probeResult.run.combined)) {
            rec.status = "invalid";
            rec.note = probeResult.run.spawnError ? "probe did not start" : probeResult.run.timedOut ? "probe timeout" : "probe non-kill fault";
          } else {
            const parsed = parseProbeResult(probeResult.run.combined);
            if (!parsed.ok || parsed.obj === null) {
              rec.status = "invalid";
              rec.note = parsed.note;
            } else {
              const cmp = compareProbe(m, parsed.obj);
              rec.probeScenarioId = cmp.scenarioId === "" ? "-" : cmp.scenarioId;
              rec.probeErrorName = cmp.errorName === "" ? "-" : cmp.errorName;
              rec.probeErrorCode = cmp.errorCode === "" ? "-" : cmp.errorCode;
              rec.probeErrorMessage = cmp.errorMessage === "" ? "-" : cmp.errorMessage;
              rec.probeAssertions = cmp.assertions.join(",");
              rec.probeEnvironmentIsolated = String(cmp.envIsolated);

              const killCls = classifyProbeKill({
                probeExitZero: probeResult.run.exitCode === 0,
                evidenceMatched: cmp.killed,
                envIsolated: cmp.envIsolated,
                fileCleanupComplete: probeResult.probeFileCleanupComplete,
                sessionCleanupComplete: probeResult.probeSessionCleanupComplete,
              });
              rec.status = killCls.status;
              rec.note = killCls.note;
            }
          }

          const passed = rec.status === "killed";
          probeSummary.perId.set(m.id, passed);
          if (passed) probeSummary.passed++;
          else probeSummary.failed++;
          if (probeResult.probeFileCleanupComplete && probeResult.probeSessionCleanupComplete) probeSummary.cleaned++;
          if (rec.probeEnvironmentIsolated === "true") probeSummary.isolated++;
        }
      } catch (e) {
        rec.status = "harness_error";
        rec.note = `harness fault: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN);
      } finally {
        // Always restore original bytes, then re-read + re-hash.
        try {
          const rest = restoreMutatedFile(dispProd, original, originalSha);
          rec.restoredSha256 = rest.restoredSha;
          rec.restoredByteIdentical = rest.identical;
          if (!rest.identical && rec.status === "killed") rec.status = "harness_error";
        } catch (e) {
          rec.restoredByteIdentical = false;
          rec.note = `restore failed: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN);
          if (rec.status === "killed") rec.status = "harness_error";
        }
      }

      records.push(rec);
      emitRecord(rec);
    }
  } catch (e) {
    // Controlled session failure (archive/tar/baseline). cleanup still runs in
    // the finally below; the code is propagated via sessionCode.
    if (sessionCode === 0) sessionCode = 1;
    if ((e as Error).message !== "ARCHIVE_FAILED" && (e as Error).message !== "TAR_FAILED" && (e as Error).message !== "BASELINE_FAILED") {
      console.error(`HARNESS_ERROR ${(e as Error).stack ?? (e as Error).message}`);
    }
  } finally {
    cleanup();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }

  // ── Final real-worktree invariance verification ──
  let realUnchanged = false;
  try {
    const headAfter = gitHeadSha();
    const indexAfter = gitIndexDigest();
    const statusAfter = gitStatusPorcelain();
    const prodShaAfter = sha256Buf(fs.readFileSync(prodPath));
    const testShaAfter = sha256Buf(fs.readFileSync(testPath));
    const lockShaAfter = sha256Buf(fs.readFileSync(lockPath));
    realUnchanged =
      headBefore === headAfter &&
      indexBefore === indexAfter &&
      prodShaBefore === prodShaAfter &&
      testShaBefore === testShaAfter &&
      lockShaBefore === lockShaAfter &&
      statusBefore === statusAfter;
  } catch (e) {
    console.error(`HARNESS_ERROR real-worktree verification failed: ${(e as Error).message}`);
    realUnchanged = false;
  }

  // ── Aggregate temp cleanup verification ──
  // TEMP_CLEANUP_COMPLETE aggregates: (1) main disposable root deleted,
  // (2) all registered probe session roots deleted, (3) all registered probe
  // files deleted.
  const allSessionsCleaned = registeredProbeSessions.every((s) => !fs.existsSync(s));
  const allFilesCleaned = registeredProbeFiles.every((f) => !fs.existsSync(f));
  const tempCleanupComplete = disposableRootCleaned && allSessionsCleaned && allFilesCleaned;

  // ── Summary ──
  if (mode === "quick") {
    // Quick mode output.
    console.log("R6_QUICK_MODE true");
    for (const id of ["G", "H", "L"]) {
      const rec = records.find((r) => r.id === id);
      const passed = rec?.status === "killed";
      const isolated = rec?.probeEnvironmentIsolated === "true";
      const cleaned = rec?.probeFileCleanupComplete === "true" && rec?.probeSessionCleanupComplete === "true";
      console.log(`QUICK_PROBE id=${id} status=${passed ? "passed" : "failed"} isolated=${isolated} cleaned=${cleaned}`);
    }
    console.log(
      `QUICK_PROBE_SUMMARY total=${probeSummary.total} passed=${probeSummary.passed} ` +
        `failed=${probeSummary.failed} cleaned=${probeSummary.cleaned} isolated=${probeSummary.isolated}`,
    );
    console.log(`REAL_WORKTREE_UNCHANGED ${realUnchanged}`);
    console.log(`TEMP_CLEANUP_COMPLETE ${tempCleanupComplete}`);

    const quickGood =
      sessionCode === 0 &&
      probeSummary.total === 3 &&
      probeSummary.passed === 3 &&
      probeSummary.failed === 0 &&
      probeSummary.cleaned === 3 &&
      probeSummary.isolated === 3 &&
      records.every((r) => r.restoredByteIdentical) &&
      realUnchanged &&
      tempCleanupComplete;

    console.log(`R6_QUICK_MODE_COMPLETE ${quickGood}`);
    return { code: quickGood ? 0 : 1, tempCleanupComplete };
  }

  // Full mode output.
  const killed = records.filter((r) => r.status === "killed").length;
  const survived = records.filter((r) => r.status === "survived").length;
  const invalid = records.filter((r) => r.status === "invalid").length;
  const harnessError = records.filter((r) => r.status === "harness_error").length;
  const restored = records.filter((r) => r.restoredByteIdentical).length;

  console.log(
    `DEDICATED_PROBE_SUMMARY total=${probeSummary.total} passed=${probeSummary.passed} ` +
      `failed=${probeSummary.failed} cleaned=${probeSummary.cleaned} isolated=${probeSummary.isolated}`,
  );
  for (const id of ["G", "H", "L"]) {
    const passed = probeSummary.perId.get(id) === true;
    console.log(`${id} probe ${passed ? "passed" : "failed"}`);
  }
  console.log(
    `MUTATION_SUMMARY total=${records.length} killed=${killed} survived=${survived} ` +
      `invalid=${invalid} harness_error=${harnessError} restored=${restored}`,
  );
  console.log(`REAL_WORKTREE_UNCHANGED ${realUnchanged}`);
  console.log(`TEMP_CLEANUP_COMPLETE ${tempCleanupComplete}`);

  const allGood =
    sessionCode === 0 &&
    baselineOk &&
    baselinePassed === EXPECTED_BASELINE_PASSED &&
    baselineFailed === EXPECTED_BASELINE_FAILED &&
    records.length === 14 &&
    killed === 14 &&
    survived === 0 &&
    invalid === 0 &&
    harnessError === 0 &&
    restored === 14 &&
    probeSummary.total === 3 &&
    probeSummary.passed === 3 &&
    probeSummary.failed === 0 &&
    probeSummary.cleaned === 3 &&
    probeSummary.isolated === 3 &&
    realUnchanged &&
    tempCleanupComplete;

  return { code: allGood ? 0 : 1, tempCleanupComplete };
}

// ═══════════════════════════════════════ Bootstrap (no process.exit)

main()
  .then((outcome) => {
    process.exitCode = outcome.code;
  })
  .catch((e) => {
    console.error(`HARNESS_ERROR ${(e as Error).stack ?? (e as Error).message}`);
    process.exitCode = 1;
  });
