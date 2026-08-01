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
// R8 (Correction R1) changes, per project-controller review (CHANGES REQUIRED):
//   * Parent independently re-validates every first_failure killed payload:
//     non-zero integer test_exit, non-empty first_failure containing the FIXED
//     expectedEvidence token, expected_evidence exactly equal to MutationDef,
//     valid mutated_sha256 different from baseline, and ALL probe fields in the
//     single strict not_applicable expression. Forged killed payloads
//     (test_exit=0/null, empty/wrong evidence, unchanged mutated SHA, restore
//     mismatch) are rejected into harness_error and block aggregate success.
//   * G/H/L probe assertions are now structured plain JSON objects with the
//     FIXED per-scenario key contract (G:3, H:5, L:8 keys). The parent selects
//     the expected key set itself; missing, extra, false, or wrongly typed
//     assertion keys are rejected. Assertion JSON is serialized in the fixed
//     expected key order.
//   * Worker probe sessions now live INSIDE the pre-registered worker root
//     (workerRoot/probe-session/<id>/); the parent verifies absolute-path,
//     normalize/realpath containment and holds the FINAL cleanup authority over
//     every worker root (recursive force remove + existsSync re-check on every
//     exit path; failure forces harness_error).
//   * Workers run in controllable POSIX process groups (detached). On timeout,
//     signal, or any worker exit the parent terminates the whole group
//     (SIGTERM, bounded grace, then SIGKILL), re-verifies no residual group
//     members, and refuses success while any residual child process remains.
//   * Hidden internal-only selftest child modes (forge/graceful/forced) are
//     authorized by a random token + parent registry, fail closed for direct
//     invocation, and never bypass HEAD/root verification.
//
// R2 (Correction R2) changes, per project-controller review (CHANGES REQUIRED):
//   * A SHARED killed base contract applies to EVERY G/H/L worker result
//     (first_failure AND dedicated_probe): target_matches=1, fixed
//     expected_evidence, non-zero integer test_exit, valid parent baseline
//     SHA, valid CHANGED mutated SHA, byte-identical restore, scheduled root.
//   * Selftest children emit a strict single-record SELFTEST_READY {json}
//     (kind/child_pid/descendant_pid) only after the descendant REALLY spawned;
//     before signalling, the parent proves child+descendant existence,
//     non-zombie state, same PGID and the probe resource via a real process
//     scan. forge never emits a result when the descendant spawn fails.
//   * The `ps` scanner is fail-closed (discriminated success/failure result);
//     a failed scan can never be read as "clean", and scan errors are
//     preserved alongside cleanup errors.
//
// R3 (Correction R3) changes, per project-controller review:
//   * Linux `ps -eo pid=,pgid=,state=` may legitimately emit rows with
//     pid>0, pgid=0 and a non-empty state (processes not attached to a
//     positive process group). The row contract now accepts pgid=0: a row is
//     malformed only when pid<=0, pgid<0, state is empty, or the non-empty
//     line does not have exactly three fields. pgid=0 rows stay in the parsed
//     entries and can never match a positive worker/self-test target group.
//   * New fast fixtures prove the pgid=0 contract (parse, retention,
//     positive-target isolation, negative/non-integer pgid, pid<=0 and
//     extra-field rejection) and that scanner execution failures still fail
//     closed. Scanner diagnostics carry a failure category plus the calling
//     phase/context, and real self-test failures are logged by distinct
//     category (readiness / process-scan-execution / pid-pgid-mismatch /
//     resource-absence / residual-process).
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
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

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

// ── R7 bounded-parallel scheduler constants ──
const MAX_PARALLEL_MUTATIONS = 2; // fixed two-way bound; not overridable by env/CLI/config
const WORKER_RESULT_PREFIX = "WORKER_RESULT";
const WORKER_ROOT_PREFIX = "l04-worker-";
const REGISTRY_ENV = "L04_WORKER_REGISTRY";
// Parent-side ceiling for ONE internal worker: suite + probe + archive/cleanup headroom.
const WORKER_TIMEOUT_MS = PER_RUN_TIMEOUT_MS + PROBE_TIMEOUT_MS + 60000;
const WORKER_SIGNAL_GRACE_MS = 10000; // bounded cleanup window before fallback SIGKILL
const SHA40_RE = /^[0-9a-f]{40}$/;

/** Six environment-isolation boolean fields every G/H/L PROBE_RESULT must carry. */
const ENV_ISOLATION_FIELDS = [
  "home_isolated",
  "xdg_config_isolated",
  "git_global_config_disabled",
  "git_system_config_disabled",
  "git_terminal_prompt_disabled",
  "probe_root_contained",
] as const;

/**
 * FIXED per-scenario probe-assertion key contracts (R1). The parent selects the
 * expected key set from this contract; the worker never declares expected keys
 * itself. Values must be strictly boolean true; no missing, extra, or nested
 * entries are accepted.
 */
const PROBE_ASSERTION_KEYS: Readonly<Record<string, readonly string[]>> = {
  G: ["first_apply_state_applied", "second_attempt_error", "workspace_head_unchanged"],
  H: [
    "source_file_changed", "workspace_file_unchanged", "source_head_unchanged",
    "workspace_head_unchanged", "index_unchanged",
  ],
  L: [
    "patch1_state_applied", "patch2_attempt_error", "status_digest_equal",
    "target_state_digest_changed", "target_content_changed",
    "patch2_target_content_present", "head_unchanged", "index_unchanged",
  ],
};

/** Every probe-related field a first_failure killed payload must carry as exactly "not_applicable". */
const FIRST_FAILURE_PROBE_FIELDS: readonly string[] = [
  "probe_exit", "probe_scenario_id", "probe_error_name", "probe_error_code",
  "probe_error_message", "probe_assertions", "probe_environment_isolated",
  "probe_file_cleanup_complete", "probe_session_cleanup_complete",
];

/** Hidden internal-only selftest child authorization (random token + registry). */
const SELFTEST_TOKEN_ENV = "L04_SELFTEST_TOKEN";
const SELFTEST_CHILD_TIMEOUT_MS = 60000; // ultimate bound for one selftest child
const SELFTEST_CHILD_GRACE_MS = 2000; // bounded SIGTERM->SIGKILL escalation for selftest children
const SELFTEST_KINDS: readonly string[] = ["forge", "graceful", "forced"];
const SELFTEST_READY_PREFIX = "SELFTEST_READY";


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

/**
 * R1: strict plain-object assertion contract. `raw` must be a plain JSON
 * object (no array/Map/Set/class instance/nested prototype), its key set must
 * EXACTLY equal the FIXED `keys` contract (no missing, no extra), and every
 * value must be strictly boolean true. On success the object is re-serialized
 * in the fixed expected key order (never relying on insertion order).
 */
function exactAssertionObject(
  raw: unknown,
  keys: readonly string[],
): { ok: boolean; note: string; object: Record<string, boolean> | null } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, note: "probe assertions not an object", object: null };
  if (Object.getPrototypeOf(raw) !== Object.prototype)
    return { ok: false, note: "probe assertions has unknown prototype", object: null };
  const obj = raw as Record<string, unknown>;
  const own = Object.keys(obj);
  if (own.length !== keys.length || !keys.every((k) => own.includes(k)))
    return { ok: false, note: "probe assertions key set mismatch", object: null };
  for (const k of keys) {
    const v = obj[k];
    if (typeof v !== "boolean") return { ok: false, note: `probe assertion ${k} not boolean`, object: null };
    if (v !== true) return { ok: false, note: `probe assertion ${k} not true`, object: null };
  }
  const ordered: Record<string, boolean> = {};
  for (const k of keys) ordered[k] = obj[k] as boolean;
  return { ok: true, note: "", object: ordered };
}

interface ProbeCompare {
  killed: boolean;
  envIsolated: boolean;
  note: string;
  scenarioId: string;
  errorName: string;
  errorCode: string;
  errorMessage: string;
  assertions: Record<string, boolean> | null;
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
  const problems: string[] = [];

  if (scenarioId !== m.probeScenarioId) problems.push(`scenario_id mismatch: ${scenarioId}`);
  if (errorName !== m.expectedErrorName) problems.push(`error_name mismatch: ${errorName}`);
  if (errorCode !== m.expectedErrorCode) problems.push(`error_code mismatch: ${errorCode}`);
  if (errorMessage !== m.expectedErrorMessage) problems.push(`error_message mismatch: ${errorMessage}`);

  // R1: the scenario assertions are validated against the FIXED key contract
  // (G:3 / H:5 / L:8) as one plain JSON object with strict boolean values; the
  // worker never declares the expected key set.
  const keys = PROBE_ASSERTION_KEYS[m.id] ?? [];
  const assertionRaw: Record<string, unknown> = {};
  for (const k of keys) assertionRaw[k] = obj[k];
  const ex = exactAssertionObject(assertionRaw, keys);
  if (!ex.ok) problems.push(`assertions: ${ex.note}`);

  // Scenario-specific non-boolean state fields are still compared exactly.
  if (m.id === "G") {
    const fa = strField(obj, "first_apply_state");
    const sa = strField(obj, "second_attempt");
    if (fa !== "applied") problems.push("first_apply_state != applied");
    if (sa !== "error") problems.push("second_attempt != error");
  } else if (m.id === "L") {
    const p1 = strField(obj, "patch1_state");
    const p2 = strField(obj, "patch2_attempt");
    if (p1 !== "applied") problems.push("patch1_state != applied");
    if (p2 !== "error") problems.push("patch2_attempt != error");
  }

  // R6: six environment-isolation assertions common to G/H/L.
  let envIsolated = true;
  for (const k of ENV_ISOLATION_FIELDS) {
    const b = boolField(obj, k);
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
    assertions: ex.object,
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
  probeAssertions: string | Record<string, boolean>;
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

/** Registry of all parent-created worker roots (one per mutation A–N). */
const registeredWorkerRoots: string[] = [];

/** Worker-reported probe session/file paths, re-verified gone by the parent. */
const allWorkerProbeSessionPaths: string[] = [];
const allWorkerProbeFilePaths: string[] = [];

/** Active internal worker child processes, for controlled signal termination. */
const activeWorkerProcesses = new Set<ChildProcess>();

/** PIDs (== process-group ids) of every worker spawned this run. */
const allWorkerPgids: number[] = [];

/** Worker process groups that still had members when the worker closed; the
 *  parent terminates them immediately and re-verifies they are gone before the
 *  success gate (a lingering group means an orphaned descendant survived). */
const suspiciousPgids: number[] = [];

/** Any parent-owned cleanup failure recorded this run (blocks success). */
const cleanupFailures: string[] = [];

let stopping = false;

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
 * and fixture/ subdirectories INSIDE the given parent-owned root (the worker
 * root for full-mode workers, the disposable root for quick mode). The parent
 * harness is the sole authority for cleanup of this directory tree; a stale
 * leftover is removed first so the session always starts fresh.
 */
function createProbeSession(id: string, sessionParentRoot: string): {
  sessionRoot: string;
  homeDir: string;
  xdgConfigDir: string;
  fixtureDir: string;
} {
  const sessionRoot = path.join(sessionParentRoot, "probe-session", id);
  if (fs.existsSync(sessionRoot)) {
    try { fs.rmSync(sessionRoot, { recursive: true, force: true }); } catch { /* stale session: mkdir below fails closed */ }
  }
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
  probeFilePath: string;
}

// ═══════════════════════════════════════ Failure-path self-tests

interface SelfTestResult {
  baseline_failure_cleanup: boolean;
  target_mismatch_restore_cleanup: boolean;
  evidence_mismatch_restore_cleanup: boolean;
  probe_environment_isolation: boolean;
  probe_cleanup_gate: boolean;
  // R7 bounded-parallel checks (fast, deterministic, no network, no full suite):
  bounded_scheduler_peak_two: boolean;
  worker_root_validation: boolean;
  worker_kill_cannot_be_forged: boolean;
  worker_result_unknown_field_rejected: boolean;
  worker_result_malformed_rejected: boolean;
  worker_result_duplicate_rejected: boolean;
  worker_result_missing_rejected: boolean;
  worker_cleanup_failure_blocks_kill: boolean;
  records_ordered_A_to_N: boolean;
  worker_cli_fail_closed: boolean;
  // R1 checks:
  parent_first_failure_validation: boolean;
  structured_probe_assertions: boolean;
  forged_worker_kill_rejected: boolean;
  graceful_worker_cleanup: boolean;
  forced_worker_cleanup: boolean;
  // R2 checks:
  r2_ghl_suite_evidence_validation: boolean;
  r2_process_scan_fail_closed: boolean;
  // R3 checks:
  r3_linux_pgid_zero_compatibility: boolean;
  r3_process_scan_fail_closed_retained: boolean;
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
  const r: { status: MutStatus; note: string } = classifyProbeKill({
    probeExitZero: true,
    evidenceMatched: true,
    envIsolated: true,
    fileCleanupComplete: true,
    sessionCleanupComplete: false,
  });
  if (r.status !== "harness_error") return false;
  // Overall success gate must be false when cleanup fails.
  const successGate = (r.status as MutStatus) === "killed";
  return successGate === false;
}

async function runSelfTests(): Promise<SelfTestResult> {
  const ffTests = [
    selfTestParentRejectsZeroTestExitKill(),
    selfTestParentRejectsNullTestExitKill(),
    selfTestParentRejectsWrongExpectedEvidence(),
    selfTestParentRejectsEmptyFirstFailure(),
    selfTestParentRejectsFirstFailureWithoutToken(),
    selfTestParentRejectsUnchangedMutatedSha(),
    selfTestParentRejectsRestoreMismatch(),
  ];
  const assertionTests = [
    selfTestParentRejectsMissingProbeAssertion(),
    selfTestParentRejectsExtraProbeAssertion(),
    selfTestParentRejectsFalseProbeAssertion(),
    selfTestParentRejectsWrongProbeAssertionType(),
    selfTestParentAcceptsExactGAssertionSet(),
    selfTestParentAcceptsExactHAssertionSet(),
    selfTestParentAcceptsExactLAssertionSet(),
  ];
  return {
    baseline_failure_cleanup: selfTestBaselineFailureCleanup(),
    target_mismatch_restore_cleanup: selfTestTargetMismatchRestoreCleanup(),
    evidence_mismatch_restore_cleanup: selfTestEvidenceMismatchRestoreCleanup(),
    probe_environment_isolation: selfTestProbeEnvironmentIsolation(),
    probe_cleanup_gate: selfTestProbeCleanupGate(),
    bounded_scheduler_peak_two: await selfTestBoundedSchedulerPeak(),
    worker_root_validation: selfTestWorkerRootValidation(),
    worker_kill_cannot_be_forged: selfTestWorkerKillCannotBeForged(),
    worker_result_unknown_field_rejected: selfTestWorkerResultUnknownFieldRejected(),
    worker_result_malformed_rejected: selfTestWorkerResultMalformedRejected(),
    worker_result_duplicate_rejected: selfTestWorkerResultDuplicateRejected(),
    worker_result_missing_rejected: selfTestWorkerResultMissingRejected(),
    worker_cleanup_failure_blocks_kill: selfTestWorkerCleanupFailureBlocksKill(),
    records_ordered_A_to_N: selfTestRecordsOrderedAToN(),
    worker_cli_fail_closed: selfTestWorkerCliFailClosed(),
    parent_first_failure_validation: ffTests.every(Boolean),
    structured_probe_assertions: assertionTests.every(Boolean),
    forged_worker_kill_rejected: await selfTestForgedWorkerKillRejected(),
    graceful_worker_cleanup: await runAbruptCleanupSelftest("graceful"),
    forced_worker_cleanup: await runAbruptCleanupSelftest("forced"),
    r2_ghl_suite_evidence_validation: r2GhlSuiteEvidenceValidation(),
    r2_process_scan_fail_closed: r2ScannerFailClosedTests(),
    r3_linux_pgid_zero_compatibility: r3LinuxPgidZeroCompatibility(),
    r3_process_scan_fail_closed_retained: r3ScannerFailClosedRetained(),
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
 * copy. The parent creates and registers a probe session root INSIDE the given
 * parent-owned root (`<parentRoot>/probe-session/<id>/` — the worker root for
 * full-mode workers, the disposable root for quick mode), writes the probe
 * file inside the disposable copy, spawns the child with a fully isolated
 * environment, and — in a finally — deletes the probe file and the entire
 * session root, verifying deletion with existsSync. The child never creates
 * its own temp root and never deletes the session root.
 */
function runProbe(m: MutationDef, disp: string, repoRoot: string, sessionParentRoot: string): ProbeRunResult {
  if (!path.isAbsolute(sessionParentRoot))
    throw new Error("probe session parent root not absolute");
  if (isPathContained(repoRoot, sessionParentRoot))
    throw new Error("probe session parent root inside real repo");

  // 1–2. Parent creates session root with home/, xdg-config/, fixture/.
  const session = createProbeSession(m.id, sessionParentRoot);

  // 3. Parent writes dynamic probe file inside the disposable copy (which is
  //    itself contained in the session parent root).
  const probeRel = path.join("scripts", `__probe-${m.id}-${crypto.randomBytes(4).toString("hex")}.ts`);
  const probeAbs = path.join(disp, probeRel);
  if (!isPathContained(sessionParentRoot, probeAbs))
    throw new Error("probe file outside session parent root");
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
    probeFilePath: probeAbs,
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

// ── R7 self-tests (fast, deterministic, no network, no full targeted suite) ──
// These functions live inside the static-checker slice window on purpose: the
// strings they contain must never be mistaken for production evidence.

function sampleWorkerResult(m: MutationDef, overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    mutation_id: m.id,
    status: "killed",
    evidence_mode: m.evidenceMode,
    target_matches: 1,
    test_exit: 1,
    test_duration_ms: 10,
    first_failure: m.expectedEvidence,
    expected_evidence: m.expectedEvidence,
    probe_exit: "not_applicable",
    probe_scenario_id: "not_applicable",
    probe_error_name: "not_applicable",
    probe_error_code: "not_applicable",
    probe_error_message: "not_applicable",
    probe_assertions: "not_applicable",
    probe_environment_isolated: "not_applicable",
    probe_file_cleanup_complete: "not_applicable",
    probe_session_cleanup_complete: "not_applicable",
    baseline_sha256: "a".repeat(64),
    mutated_sha256: "b".repeat(64),
    restored_sha256: "a".repeat(64),
    restored_byte_identical: true,
    note: "",
    archive_extract_duration_ms: 1,
    cleanup_duration_ms: 1,
    worker_root_cleanup_complete: true,
    probe_session_root: "",
    probe_file_path: "",
    worker_root: path.join(os.tmpdir(), "l04-st-worker-root"),
    ...overrides,
  };
}

function okOutcome(m: MutationDef): WorkerOutcome {
  const sample = sampleWorkerResult(m);
  return { id: m.id, ok: true, note: "", result: sample, exitCode: 0, signal: null, timedOut: false, spawnError: false };
}

/** The REAL bounded runner, driven by 14 fake tasks, must peak at exactly 2. */
async function selfTestBoundedSchedulerPeak(): Promise<boolean> {
  const tasks: BoundedTask<string>[] = Array.from({ length: 14 }, (_, i) => ({
    id: String.fromCharCode(65 + i),
    run: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "ok";
    },
  }));
  const run = await runBoundedTasks(tasks, MAX_PARALLEL_MUTATIONS, () => false);
  return run.scheduled === 14 && run.completed === 14 && run.peakConcurrency === 2 && run.failedIds.length === 0;
}

/** Duplicate and repo-internal worker roots must be rejected; 14 distinct external roots accepted. */
function selfTestWorkerRootValidation(): boolean {
  const repo = path.join(os.tmpdir(), "l04-st-repo");
  const gitDir = path.join(repo, ".git");
  const roots = Array.from({ length: 14 }, (_, i) => path.join(os.tmpdir(), `l04-st-root-${i}`));
  const dup = validateWorkerRoots([...roots.slice(0, 13), roots[0]!], repo, gitDir);
  const inside = validateWorkerRoots([...roots.slice(0, 13), path.join(repo, "work")], repo, gitDir);
  const good = validateWorkerRoots(roots, repo, gitDir);
  return !dup.ok && dup.error.includes("not distinct") && !inside.ok && inside.error.includes("inside repository") && good.ok;
}

/** A structurally failed worker (e.g. nonzero exit) can never finalize as killed. */
function selfTestWorkerKillCannotBeForged(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const sample = sampleWorkerResult(def);
  const validated = validateWorkerResult(sample, def, "A", sample.worker_root, "a".repeat(64));
  const forged = finalizeWorkerStatus({ id: "A", ok: false, note: "worker exited nonzero (1)", result: validated.result, exitCode: 1, signal: null, timedOut: false, spawnError: false });
  return validated.ok && forged === "harness_error";
}

function selfTestWorkerResultUnknownFieldRejected(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const sample = sampleWorkerResult(def) as unknown as Record<string, unknown>;
  sample["sneaky"] = 1;
  const v = validateWorkerResult(sample, def, "A", path.join(os.tmpdir(), "l04-st-worker-root"), "a".repeat(64));
  return !v.ok && v.note.includes("unknown worker record field");
}

function selfTestWorkerResultMalformedRejected(): boolean {
  const p1 = parseWorkerStdout("WORKER_RESULT {not json");
  const p2 = parseWorkerStdout("hello\n");
  const p3 = parseWorkerStdout("WORKER_RESULT {}\nWORKER_RESULT {}\n");
  return (
    !p1.ok && p1.note.includes("malformed worker record") &&
    !p2.ok && p2.note.includes("no worker record") &&
    !p3.ok && p3.note.includes("multiple worker records")
  );
}

function selfTestWorkerResultDuplicateRejected(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const merged = mergeWorkerOutcomes([okOutcome(def), okOutcome(def)], MUTATIONS, "a".repeat(64));
  return merged.error !== "" && merged.duplicateIds.includes("A");
}

function selfTestWorkerResultMissingRejected(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const merged = mergeWorkerOutcomes([okOutcome(def)], MUTATIONS, "a".repeat(64));
  return merged.error !== "" && merged.missingIds.includes("B");
}

function selfTestWorkerCleanupFailureBlocksKill(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const sample = sampleWorkerResult(def, { restored_byte_identical: false });
  const v = validateWorkerResult(sample, def, "A", sample.worker_root, "a".repeat(64));
  return !v.ok && v.note.includes("restored byte identity");
}

/** Shuffled worker outcomes must merge into the fixed A–N record order. */
function selfTestRecordsOrderedAToN(): boolean {
  const outcomes: WorkerOutcome[] = [];
  for (let i = MUTATIONS.length - 1; i >= 0; i--) outcomes.push(okOutcome(MUTATIONS[i]!));
  const merged = mergeWorkerOutcomes(outcomes, MUTATIONS, "a".repeat(64));
  return merged.error === "" && merged.records.map((r) => r.id).join("") === "ABCDEFGHIJKLMN";
}

/** Internal-worker CLI must fail closed on every invalid/duplicate/mixed argument. */
function selfTestWorkerCliFailClosed(): boolean {
  const head = "a".repeat(40);
  const root = path.join(os.tmpdir(), "l04-st-root");
  const cwd = process.cwd();
  const token = "a".repeat(48);
  const cases: [string[], string][] = [
    [["--internal-worker", "--mutation=Z", "--expected-head=" + head, "--worker-root=" + root], "invalid mutation id"],
    [["--internal-worker", "--mutation=A", "--worker-root=" + root], "missing expected head"],
    [["--internal-worker", "--mutation=A", "--expected-head=zz", "--worker-root=" + root], "invalid expected head"],
    [["--internal-worker", "--mutation=A", "--expected-head=" + head, "--worker-root=relative"], "worker root not absolute"],
    [["--internal-worker", "--mutation=A", "--expected-head=" + head, "--worker-root=" + path.join(cwd, "scripts")], "worker root inside repository"],
    [["--mode=full", "--internal-worker", "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "unknown internal worker argument"],
    [["--internal-worker", "--internal-worker", "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "duplicate --internal-worker flag"],
    [["--internal-worker", "--mutation=A", "--mutation=B", "--expected-head=" + head, "--worker-root=" + root], "duplicate --mutation flag"],
    [["--internal-worker", "--internal-selftest=forge", "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "selftest kind and token must be provided together"],
    [["--internal-worker", "--selftest-token=" + token, "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "selftest kind and token must be provided together"],
    [["--internal-worker", "--internal-selftest=bogus", "--selftest-token=" + token, "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "unknown selftest kind"],
    [["--internal-worker", "--internal-selftest=forge", "--selftest-token=zz", "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "invalid selftest token"],
    [["--internal-worker", "--internal-selftest=forge", "--internal-selftest=forced", "--selftest-token=" + token, "--mutation=A", "--expected-head=" + head, "--worker-root=" + root], "duplicate --internal-selftest flag"],
  ];
  for (const [args, expect] of cases) {
    const r = parseWorkerArgs(args);
    if (r.error === "" || !r.error.includes(expect)) return false;
  }
  const good = parseWorkerArgs(["--internal-worker", "--mutation=A", "--expected-head=" + head, "--worker-root=" + root]);
  if (good.error !== "" || good.kind !== "worker" || good.mutationId !== "A") return false;
  const goodSelftest = parseWorkerArgs(["--internal-worker", "--internal-selftest=forge", "--selftest-token=" + token, "--mutation=A", "--expected-head=" + head, "--worker-root=" + root]);
  return goodSelftest.error === "" && goodSelftest.selftestKind === "forge" && goodSelftest.selftestToken === token;
}

// ── R1 self-tests (fast, deterministic, no network, no full targeted suite) ──
// Pure validator tests call the REAL validateWorkerResult; the three
// process-level tests spawn REAL harness children through the REAL parent
// spawn/cleanup helpers.

const SAMPLE_WORKER_ROOT = path.join(os.tmpdir(), "l04-st-worker-root");

function sampleProbeAssertions(id: string): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  for (const k of PROBE_ASSERTION_KEYS[id] ?? []) obj[k] = true;
  return obj;
}

/** A structurally valid dedicated-probe (G/H/L) worker result sample. */
function sampleProbeWorkerResult(m: MutationDef, overrides: Partial<WorkerResult> = {}): WorkerResult {
  return sampleWorkerResult(m, {
    probe_exit: "0",
    probe_scenario_id: m.probeScenarioId ?? "",
    probe_error_name: m.expectedErrorName ?? "",
    probe_error_code: m.expectedErrorCode ?? "",
    probe_error_message: m.expectedErrorMessage ?? "",
    probe_assertions: sampleProbeAssertions(m.id),
    probe_environment_isolated: "true",
    probe_file_cleanup_complete: "true",
    probe_session_cleanup_complete: "true",
    probe_session_root: path.join(SAMPLE_WORKER_ROOT, "probe-session", m.id),
    probe_file_path: path.join(SAMPLE_WORKER_ROOT, "work", "scripts", "__probe.ts"),
    ...overrides,
  });
}

function selfTestParentRejectsZeroTestExitKill(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { test_exit: 0 }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("test_exit");
}

function selfTestParentRejectsNullTestExitKill(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { test_exit: null }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("test_exit");
}

function selfTestParentRejectsWrongExpectedEvidence(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { expected_evidence: "wrong token" }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("expected_evidence");
}

function selfTestParentRejectsEmptyFirstFailure(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { first_failure: "" }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("first_failure");
}

function selfTestParentRejectsFirstFailureWithoutToken(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { first_failure: "✗ unrelated failure line" }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("expected evidence token");
}

function selfTestParentRejectsUnchangedMutatedSha(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { mutated_sha256: "a".repeat(64) }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("unchanged mutated bytes");
}

function selfTestParentRejectsRestoreMismatch(): boolean {
  const def = MUTATIONS.find((m) => m.id === "A")!;
  const v = validateWorkerResult(sampleWorkerResult(def, { restored_sha256: "c".repeat(64) }), def, "A", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("restored SHA");
}

function selfTestParentRejectsMissingProbeAssertion(): boolean {
  const def = MUTATIONS.find((m) => m.id === "G")!;
  const bad = {
    ...sampleProbeWorkerResult(def),
    probe_assertions: { first_apply_state_applied: true, second_attempt_error: true },
  } as unknown as WorkerResult;
  const v = validateWorkerResult(bad, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("key set");
}

function selfTestParentRejectsExtraProbeAssertion(): boolean {
  const def = MUTATIONS.find((m) => m.id === "G")!;
  const bad = {
    ...sampleProbeWorkerResult(def),
    probe_assertions: {
      first_apply_state_applied: true, second_attempt_error: true,
      workspace_head_unchanged: true, extra_key: true,
    },
  } as unknown as WorkerResult;
  const v = validateWorkerResult(bad, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("key set");
}

function selfTestParentRejectsFalseProbeAssertion(): boolean {
  const def = MUTATIONS.find((m) => m.id === "G")!;
  const bad = {
    ...sampleProbeWorkerResult(def),
    probe_assertions: {
      first_apply_state_applied: true, second_attempt_error: false, workspace_head_unchanged: true,
    },
  } as unknown as WorkerResult;
  const v = validateWorkerResult(bad, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v.ok && v.note.includes("not true");
}

function selfTestParentRejectsWrongProbeAssertionType(): boolean {
  const def = MUTATIONS.find((m) => m.id === "G")!;
  const badString = { ...sampleProbeWorkerResult(def), probe_assertions: "yes" } as unknown as WorkerResult;
  const badArray = { ...sampleProbeWorkerResult(def), probe_assertions: [] } as unknown as WorkerResult;
  const badNested = {
    ...sampleProbeWorkerResult(def),
    probe_assertions: { first_apply_state_applied: true, second_attempt_error: { a: true }, workspace_head_unchanged: true },
  } as unknown as WorkerResult;
  const v1 = validateWorkerResult(badString, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  const v2 = validateWorkerResult(badArray, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  const v3 = validateWorkerResult(badNested, def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return !v1.ok && !v2.ok && !v3.ok;
}

function selfTestParentAcceptsExactGAssertionSet(): boolean {
  const def = MUTATIONS.find((m) => m.id === "G")!;
  const v = validateWorkerResult(sampleProbeWorkerResult(def), def, "G", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return v.ok && v.result !== null && v.result.status === "killed" && typeof v.result.probe_assertions === "object";
}

function selfTestParentAcceptsExactHAssertionSet(): boolean {
  const def = MUTATIONS.find((m) => m.id === "H")!;
  const v = validateWorkerResult(sampleProbeWorkerResult(def), def, "H", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return v.ok && v.result !== null && v.result.status === "killed" && typeof v.result.probe_assertions === "object";
}

function selfTestParentAcceptsExactLAssertionSet(): boolean {
  const def = MUTATIONS.find((m) => m.id === "L")!;
  const v = validateWorkerResult(sampleProbeWorkerResult(def), def, "L", SAMPLE_WORKER_ROOT, "a".repeat(64));
  return v.ok && v.result !== null && v.result.status === "killed" && typeof v.result.probe_assertions === "object";
}

// ── R2 self-tests (fast, deterministic, no network, no full targeted suite) ──
// The R2 markers below are aggregated ONLY from these real validator tests.

/**
 * R2 (3.1): the SHARED killed base contract is enforced for EVERY G/H/L killed
 * payload — including dedicated_probe — via the REAL validateWorkerResult.
 * Loop over G/H/L: test_exit=0 / test_exit=null / wrong expected_evidence /
 * empty mutated_sha256 / unchanged mutated_sha256 must all be rejected, and a
 * legal dedicated-probe killed payload must be accepted.
 */
function r2GhlSuiteEvidenceValidation(): boolean {
  for (const id of ["G", "H", "L"]) {
    const def = MUTATIONS.find((m) => m.id === id)!;
    const cases: Array<[Partial<WorkerResult>, string]> = [
      [{ test_exit: 0 }, "test_exit"],
      [{ test_exit: null }, "test_exit"],
      [{ expected_evidence: "wrong token" }, "expected_evidence"],
      [{ mutated_sha256: "" }, "mutated_sha256"],
      [{ mutated_sha256: "a".repeat(64) }, "unchanged mutated bytes"],
    ];
    for (const [over, expect] of cases) {
      const v = validateWorkerResult(sampleProbeWorkerResult(def, over), def, id, SAMPLE_WORKER_ROOT, "a".repeat(64));
      if (v.ok || !v.note.includes(expect)) return false;
    }
    const good = validateWorkerResult(sampleProbeWorkerResult(def), def, id, SAMPLE_WORKER_ROOT, "a".repeat(64));
    if (!good.ok || good.result === null || good.result.status !== "killed") return false;
  }
  return true;
}

/**
 * R2 (3.3): the scanner is fail-closed. Spawn error, non-zero status, signal
 * termination, null status, non-string stdout and malformed non-empty lines
 * must ALL yield ok=false with a reportable reason; valid Linux/Darwin style
 * rows must parse (blank lines ignored); zombies are not live while a
 * same-PGID non-zombie member IS live; a failed scan can never be converted
 * into "clean".
 */
function r2ScannerFailClosedTests(): boolean {
  const failingRunner: PsRunner = () => ({ status: null, signal: null, stdout: "", error: new Error("ps boom") });
  const nonzeroRunner: PsRunner = () => ({ status: 3, signal: null, stdout: "unused" });
  const signalRunner: PsRunner = () => ({ status: null, signal: "SIGKILL", stdout: "" });
  const nullStatusRunner: PsRunner = () => ({ status: null, signal: null, stdout: "" });
  const nonStringRunner: PsRunner = () => ({ status: 0, signal: null, stdout: 42 });
  if (scanProcessGroups(failingRunner).ok) return false; // spawn error fail-closed
  if (scanProcessGroups(nonzeroRunner).ok) return false; // non-zero status fail-closed
  if (scanProcessGroups(signalRunner).ok) return false; // signal-terminated fail-closed
  if (scanProcessGroups(nullStatusRunner).ok) return false; // null status fail-closed
  if (scanProcessGroups(nonStringRunner).ok) return false; // non-string stdout fail-closed
  // Malformed non-empty lines fail the whole scan.
  if (parseProcessRows("  123 456 S\nbroken line\n").ok) return false;
  if (parseProcessRows("  123 456 S\nabc def ghi\n").ok) return false;
  if (parseProcessRows("  123 456 S\n  123 456\n").ok) return false;
  // Valid Linux/Darwin style rows parse; blank lines are ignored.
  const okScan = parseProcessRows("\n  123 999 Z\n  456 123 Z\n  789 456 Ss\n\n");
  if (!okScan.ok || okScan.entries.length !== 3) return false;
  // Zombie is not live; a same-PGID non-zombie member IS live.
  if (entriesPgidAlive(okScan.entries, 999)) return false; // pgid 999 has only a zombie
  if (!entriesPgidAlive(okScan.entries, 456)) return false; // pgid 456 has live member 789
  const alive = entriesAlivePgids(okScan.entries, [999, 456, 123]);
  if (alive.length !== 1 || alive[0] !== 456) return false;
  // Scan failure cannot convert to clean.
  const failAlive = pgidStillAlive(123, failingRunner);
  const failGroups = aliveGroups([123], failingRunner);
  if (failAlive.ok || failAlive.alive || failGroups.ok || failGroups.alive.length !== 0) return false;
  return true;
}

// ── R3 self-tests (Correction R3; fast, deterministic, no network) ──
// Linux `ps -eo pid=,pgid=,state=` can legitimately emit rows with pid>0,
// pgid=0 and a non-empty state. These fixtures call the REAL parser/helpers
// and prove the R3 row contract plus retention of the fail-closed scanner
// execution guarantees.

/**
 * R3 (3.1): pgid=0 compatibility. A legal `123 0 I` row parses and is
 * RETAINED in the parsed entries; a live pgid=0 row never satisfies a
 * positive target-group match and is never reported as an active worker
 * group; negative pgid, non-integer pgid, pid<=0 and extra fields are all
 * rejected.
 */
function r3LinuxPgidZeroCompatibility(): boolean {
  // The exact legal contract row `pid>0, pgid=0, state non-empty` parses.
  const p = parseProcessRows("123 0 I\n");
  if (!p.ok || p.entries.length !== 1) return false;
  const row = p.entries[0]!;
  if (row.pid !== 123 || row.pgid !== 0 || row.state !== "I") return false;
  // pgid=0 rows are retained in the entries of a mixed scan.
  const mixed = parseProcessRows("  123 0 I\n  456 456 Z\n  789 789 Ss\n");
  if (!mixed.ok || mixed.entries.length !== 3) return false;
  // A live pgid=0 row never matches a positive target pgid (exact equality),
  // and pgid 0 is never reported as an active group.
  if (entriesPgidAlive(mixed.entries, 456)) return false; // positive target has only a zombie
  if (!entriesPgidAlive(mixed.entries, 789)) return false; // positive target has a live member
  const alive = entriesAlivePgids(mixed.entries, [456, 789]);
  if (alive.length !== 1 || alive[0] !== 789 || alive.includes(0)) return false;
  // Negative pgid, non-integer pgid, pid 0 and extra fields are rejected.
  if (parseProcessRows("  123 -1 S\n").ok) return false;
  if (parseProcessRows("  123 12.5 S\n").ok) return false;
  if (parseProcessRows("  0 456 S\n").ok) return false;
  if (parseProcessRows("  123 456 S extra\n").ok) return false;
  return true;
}

/**
 * R3 (3.2): scanner execution failures remain fail-closed. Spawn error,
 * signal termination, null status, non-zero status and non-string stdout all
 * yield ok=false (never "clean"); a failed scan never converts into a clean
 * "alive=false"; and pgid=0 compatibility does not loosen the malformed-row
 * gate.
 */
function r3ScannerFailClosedRetained(): boolean {
  const failingRunner: PsRunner = () => ({ status: null, signal: null, stdout: "", error: new Error("ps boom") });
  const signalRunner: PsRunner = () => ({ status: null, signal: "SIGKILL", stdout: "" });
  const nullStatusRunner: PsRunner = () => ({ status: null, signal: null, stdout: "" });
  const nonzeroRunner: PsRunner = () => ({ status: 3, signal: null, stdout: "unused" });
  const nonStringRunner: PsRunner = () => ({ status: 0, signal: null, stdout: 42 });
  if (scanProcessGroups(failingRunner, "r3-fixture").ok) return false; // spawn error
  if (scanProcessGroups(signalRunner, "r3-fixture").ok) return false; // signal termination
  if (scanProcessGroups(nullStatusRunner, "r3-fixture").ok) return false; // null status
  if (scanProcessGroups(nonzeroRunner, "r3-fixture").ok) return false; // non-zero status
  if (scanProcessGroups(nonStringRunner, "r3-fixture").ok) return false; // non-string stdout
  // A failed scan never reports a clean "alive=false".
  const failAlive = pgidStillAlive(123, failingRunner, "r3-fixture");
  if (failAlive.ok || failAlive.alive) return false;
  // pgid=0 rows do not loosen the malformed-row gate.
  if (parseProcessRows("  123 0 I\nbroken line\n").ok) return false;
  return true;
}

/**
 * Build a one-off worker registry with 14 distinct external roots (the
 * first root is the test target) so the child's real registry/HEAD/root
 * validation — which must never be bypassed — runs against the true contract.
 */
function buildSelftestRegistry(): {
  roots: string[];
  root: string;
  registryPath: string;
  token: string;
  expectedHead: string;
} {
  const repoRoot = process.cwd();
  const roots = Array.from({ length: MUTATIONS.length }, () => fs.mkdtempSync(path.join(os.tmpdir(), "l04-st-regroot-")));
  const root = roots[0]!;
  const registryPath = path.join(os.tmpdir(), `l04-st-registry-${process.pid}-${crypto.randomBytes(4).toString("hex")}.json`);
  const token = crypto.randomBytes(24).toString("hex");
  const expectedHead = gitHeadShaAt(repoRoot);
  const gitCommonDir = gitCommonDirAt(repoRoot);
  fs.writeFileSync(registryPath, JSON.stringify({ expectedHead, repoRoot, gitCommonDir, roots }), "utf8");
  return { roots, root, registryPath, token, expectedHead };
}

function cleanupSelftestRegistry(roots: readonly string[], registryPath: string): void {
  for (const r of roots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  try { fs.rmSync(registryPath, { force: true }); } catch { /* best-effort */ }
}

/**
 * Real subprocess forged-result test: a harness child exits 0 after emitting a
 * structurally valid but semantically forged killed payload (test_exit=0) and
 * leaves a blocking descendant running. The REAL parent spawn path must reject
 * the payload (aggregate must not succeed), kill the process group, and delete
 * the worker root itself.
 */
async function selfTestForgedWorkerKillRejected(): Promise<boolean> {
  const reg = buildSelftestRegistry();
  try {
    const def = MUTATIONS.find((m) => m.id === "A")!;
    const baselineSha = sha256Buf(fs.readFileSync(path.join(process.cwd(), PROD_REL)));
    let pgid = 0;
    const outcome = await spawnWorkerProcess(def, reg.root, reg.registryPath, process.cwd(), reg.expectedHead, baselineSha, (p) => { pgid = p; }, { kind: "forge", token: reg.token });
    await sleepMs(250); // bounded settle for process-tree reaping
    const rejected = !outcome.ok && finalizeWorkerStatus(outcome) === "harness_error";
    const rootCleanedByParent = !fs.existsSync(reg.root);
    const residualScan = pgidStillAlive(pgid, undefined, "selftest-forge-residual");
    const noResidual = residualScan.ok && !residualScan.alive; // scan failure fails closed
    if (!residualScan.ok) {
      console.error(`SELF_TEST_FAIL category=process-scan-execution detail=${clampLine(`forge ${residualScan.error}`)}`);
    }
    if (process.env.L04_DEBUG === "1") {
      console.error(`DBG forge rejected=${rejected} note=${outcome.note} rootCleaned=${rootCleanedByParent} noResidual=${noResidual} pgid=${pgid}`);
    }
    return rejected && rootCleanedByParent && noResidual;
  } finally {
    cleanupSelftestRegistry(reg.roots, reg.registryPath);
  }
}

/**
 * Strict single-record readiness contract for selftest children (R2): exactly
 * one `SELFTEST_READY {json}` line whose object contains ONLY kind /
 * child_pid / descendant_pid. kind must equal the expected graceful/forced
 * kind; child_pid must be the positive integer pid of the REAL spawned child;
 * descendant_pid must be a positive integer different from child_pid.
 * Malformed, duplicate, unknown-field, or pid-mismatched records fail closed.
 */
interface ReadyRecord {
  ok: boolean;
  note: string;
  kind: string;
  childPid: number;
  descendantPid: number;
}

function parseSelftestReady(stdout: string, expectedKind: string, actualChildPid: number): ReadyRecord {
  const noReady = (note: string): ReadyRecord => ({ ok: false, note, kind: "", childPid: 0, descendantPid: 0 });
  const records: string[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (t.startsWith(SELFTEST_READY_PREFIX + " ")) records.push(t.slice(SELFTEST_READY_PREFIX.length + 1));
    else if (t === SELFTEST_READY_PREFIX) records.push("");
  }
  if (records.length === 0) return noReady("no SELFTEST_READY record");
  if (records.length !== 1) return noReady(`duplicate SELFTEST_READY records: ${records.length}`);
  let obj: unknown;
  try {
    obj = JSON.parse(records[0]!);
  } catch {
    return noReady("SELFTEST_READY JSON malformed");
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return noReady("SELFTEST_READY not an object");
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 3 || keys[0] !== "child_pid" || keys[1] !== "descendant_pid" || keys[2] !== "kind")
    return noReady("SELFTEST_READY unknown or missing fields");
  if (o.kind !== expectedKind) return noReady(`SELFTEST_READY kind mismatch: ${String(o.kind)}`);
  if (typeof o.child_pid !== "number" || !Number.isInteger(o.child_pid) || o.child_pid <= 0 || o.child_pid !== actualChildPid)
    return noReady("SELFTEST_READY child_pid mismatch");
  if (typeof o.descendant_pid !== "number" || !Number.isInteger(o.descendant_pid) || o.descendant_pid <= 0 || o.descendant_pid === o.child_pid)
    return noReady("SELFTEST_READY descendant_pid invalid");
  return { ok: true, note: "", kind: o.kind as string, childPid: o.child_pid, descendantPid: o.descendant_pid };
}

/**
 * Real abrupt-cleanup test (R1 + R2). The child creates a probe-like resource
 * inside the worker root, spawns a controlled blocking descendant in the same
 * process group, announces readiness ONLY after the descendant really spawned,
 * then blocks. The parent strictly parses the readiness record, proves by a
 * REAL process scan that child + descendant exist non-zombie in the child's
 * PGID (and the probe resource exists), then SIGTERMs the group; "graceful"
 * expects the child to die on SIGTERM, "forced" expects it to ignore SIGTERM
 * so the parent must escalate to SIGKILL after the grace window. In both
 * cases the process tree must end, the parent must remove the root and
 * resources, and the result must NOT be killed. ANY process-scan failure
 * fails the test closed (a failed scan is never treated as "clean").
 */
async function runAbruptCleanupSelftest(kind: "graceful" | "forced"): Promise<boolean> {
  const reg = buildSelftestRegistry();
  let child: ChildProcess | null = null;
  // R3: real self-test failures are logged by distinct auditable category
  // (readiness / process-scan-execution / pid-pgid-mismatch / resource-absence
  // / residual-process). Snippets are length-limited and control-char-cleaned.
  const failLog = (category: string, detail: string): void => {
    console.error(`SELF_TEST_FAIL category=${category} detail=${clampLine(detail)}`);
  };
  try {
    const spec = directSelftestSpawnArgs([
      "--internal-worker", `--internal-selftest=${kind}`,
      `--selftest-token=${reg.token}`, "--mutation=A",
      `--expected-head=${reg.expectedHead}`, `--worker-root=${reg.root}`,
    ]);
    const spawned = spawnHarnessChild(
      spec.bin,
      spec.args,
      {
        cwd: process.cwd(),
        env: { ...(process.env as Record<string, string>), [REGISTRY_ENV]: reg.registryPath, [SELFTEST_TOKEN_ENV]: reg.token },
        timeoutMs: SELFTEST_CHILD_TIMEOUT_MS,
        graceMs: SELFTEST_CHILD_GRACE_MS,
      },
    );
    child = spawned.child;
    activeWorkerProcesses.add(child);
    // Strict readiness parse (never a substring match). Early child exit,
    // malformed, duplicate, unknown-field, or pid-mismatched records fail.
    const pid = child.pid ?? -1;
    const readyDeadline = Date.now() + 30000;
    let ready: ReadyRecord = { ok: false, note: "no SELFTEST_READY record", kind: "", childPid: 0, descendantPid: 0 };
    while (Date.now() < readyDeadline && child.exitCode === null) {
      ready = parseSelftestReady(spawned.readStdout(), kind, pid);
      if (ready.ok || ready.note !== "no SELFTEST_READY record") break;
      await sleepMs(50);
    }
    if (!ready.ok) { failLog("readiness", `kind=${kind} ${ready.note}`); return false; }
    const descendantPid = ready.descendantPid;
    // Real process-scan proof BEFORE signalling: scan succeeded; child and
    // descendant both exist, are non-zombie, and belong to the child's PGID;
    // the probe-like resource exists. Any failure => self-test false.
    const scanBefore = scanProcessGroups(undefined, "selftest-abrupt-pre-signal");
    const childRow = scanBefore.ok ? scanBefore.entries.find((p) => p.pid === pid) : undefined;
    const descRow = scanBefore.ok ? scanBefore.entries.find((p) => p.pid === descendantPid) : undefined;
    const resourceExists = fs.existsSync(path.join(reg.root, "probe-session", "G", "probe-resource.bin"));
    if (!scanBefore.ok) { failLog("process-scan-execution", `kind=${kind} ${scanBefore.error}`); return false; }
    if (childRow === undefined || descRow === undefined) { failLog("pid-pgid-mismatch", `kind=${kind} child=${pid} descendant=${descendantPid} missing from ps`); return false; }
    if (childRow.state.includes("Z") || descRow.state.includes("Z")) { failLog("pid-pgid-mismatch", `kind=${kind} child state=${childRow.state} descendant state=${descRow.state}`); return false; }
    if (childRow.pgid !== pid || descRow.pgid !== pid) { failLog("pid-pgid-mismatch", `kind=${kind} child pgid=${childRow.pgid} descendant pgid=${descRow.pgid} expected ${pid}`); return false; }
    if (!resourceExists) { failLog("resource-absence", `kind=${kind} probe-resource.bin missing`); return false; }
    // Staged process-group termination: SIGTERM, bounded grace, then — only if
    // a real scan still finds live group members — SIGKILL. The need for
    // escalation is itself the assertion distinguishing graceful from forced.
    killProcessGroup(child, "SIGTERM");
    await sleepMs(SELFTEST_CHILD_GRACE_MS + 250);
    const afterTerm = pgidStillAlive(pid, undefined, "selftest-abrupt-after-term");
    if (!afterTerm.ok) { failLog("process-scan-execution", `kind=${kind} ${afterTerm.error}`); return false; } // scan failure fails closed
    const escalationNeeded = afterTerm.alive;
    if (escalationNeeded) killProcessGroup(child, "SIGKILL");
    const r = await spawned.done;
    activeWorkerProcesses.delete(child);
    await sleepMs(250); // bounded settle for group reaping
    // Parent-owned cleanup of the pre-registered root.
    fs.rmSync(reg.root, { recursive: true, force: true });
    // Mirror the REAL parent gate: a terminated worker can never be a kill.
    const def = MUTATIONS.find((x) => x.id === "A")!;
    const notKilled = ((): boolean => {
      if (r.signal !== null) return true;
      if (r.code !== 0) return true;
      const parsed = parseWorkerStdout(r.stdout);
      if (!parsed.ok) return true;
      const v = validateWorkerResult(parsed.raw, def, "A", reg.root, sha256Buf(fs.readFileSync(path.join(process.cwd(), PROD_REL))));
      return !v.ok || v.result === null || v.result.status !== "killed";
    })();
    const rootGone = !fs.existsSync(reg.root);
    const resourceGone = !fs.existsSync(path.join(reg.root, "probe-session", "G"));
    const finalScan = pgidStillAlive(pid, undefined, "selftest-abrupt-final");
    if (!finalScan.ok) { failLog("process-scan-execution", `kind=${kind} ${finalScan.error}`); return false; } // scan failure fails closed
    const noResidual = !finalScan.alive;
    const escalationMatches = escalationNeeded === (kind === "forced");
    if (process.env.L04_DEBUG === "1") {
      console.error(`DBG abrupt kind=${kind} code=${r.code} signal=${r.signal} notKilled=${notKilled} rootGone=${rootGone} resourceGone=${resourceGone} preVerified=${scanBefore.ok && childRow !== undefined && descRow !== undefined && !childRow.state.includes("Z") && !descRow.state.includes("Z") && childRow.pgid === pid && descRow.pgid === pid && resourceExists} noResidual=${noResidual} escalationNeeded=${escalationNeeded} pid=${pid} descendant=${descendantPid} ready=${ready.ok}`);
    }
    const ok = notKilled && rootGone && resourceGone && noResidual && escalationMatches;
    if (!ok) {
      if (!notKilled) failLog("readiness", `kind=${kind} terminated worker payload still classified killed`);
      if (!rootGone) failLog("resource-absence", `kind=${kind} worker root not removed`);
      if (!resourceGone) failLog("resource-absence", `kind=${kind} probe session resource not removed`);
      if (!noResidual) failLog("residual-process", `kind=${kind} pgid ${pid} still has live members`);
      if (!escalationMatches) failLog("residual-process", `kind=${kind} escalation observed=${escalationNeeded} expected=${kind === "forced"}`);
    }
    return ok;
  } finally {
    if (child !== null && child.exitCode === null && child.signalCode === null) {
      killProcessGroup(child, "SIGKILL");
    }
    activeWorkerProcesses.delete(child!);
    cleanupSelftestRegistry(reg.roots, reg.registryPath);
  }
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

  // ── R7 checks (bounded-parallel scheduler / internal worker) ──

  // 23. The fixed two-way bound is defined and used by the bounded scheduler.
  const boundedParallelismLimit =
    /const MAX_PARALLEL_MUTATIONS = 2/.test(code) &&
    /active\.size < limit/.test(code) &&
    code.includes("runBoundedTasks(");

  // 24. Internal worker CLI requires --expected-head (missing => fail-closed).
  const workerRequiresExpectedHead =
    code.includes('startsWith("--expected-head=")') && code.includes("missing expected head");

  // 25. Internal worker CLI requires a valid A–N mutation id.
  const workerRequiresValidMutationId =
    code.includes("MUTATIONS.some((m) => m.id === result.mutationId)") && code.includes("invalid mutation id");

  // 26. Worker roots must be absolute and outside the repository.
  const workerRequiresExternalRoot =
    code.includes("!path.isAbsolute(root)") && code.includes("root.startsWith(repoRoot");

  // 27. Worker roots must be distinct (Set-size equality check).
  const workerRootsDistinct = code.includes("new Set(roots).size !== roots.length");

  // 28. The scheduler gate never exceeds the fixed bound before starting a task.
  const schedulerNeverExceedsTwo =
    /while \(next < queue\.length && active\.size < limit\)/.test(code) &&
    code.includes("MAX_PARALLEL_MUTATIONS");

  // 29. A worker that exits nonzero (or is killed/timed out) can never forge a kill.
  const workerFailureCannotForgeKill =
    code.includes("worker exited nonzero") && code.includes('if (!outcome.ok) return "harness_error"');

  // 30. Cleanup failure blocks success: restore-identity and probe-cleanup demotions.
  const workerCleanupFailureBlocksSuccess =
    code.includes('!rest.identical && rec.status === "killed"') &&
    code.includes("!probeResult.probeFileCleanupComplete || !probeResult.probeSessionCleanupComplete");

  // 31. Duplicate worker records are rejected by the merge.
  const duplicateWorkerRecordRejected =
    code.includes("seen.has(m.id)") && code.includes("duplicateIds");

  // 32. Missing worker records are rejected by the merge.
  const missingWorkerRecordRejected =
    code.includes("missingIds.push(m.id)") && code.includes("missingIds");

  // 33. Malformed worker records are rejected by the stdout parser.
  const malformedWorkerRecordRejected =
    code.includes("malformed worker record") && code.includes("JSON.parse");

  // 34. Unknown worker-record fields are rejected by the allowlist validator.
  const unknownWorkerRecordRejected = code.includes("unknown worker record field");

  // 35. Official records are emitted in the fixed A–N order.
  const recordsEmittedAToN =
    code.includes("for (const rec of records) emitRecord(rec)") &&
    /for \(const m of mutations\)/.test(code);

  // 36. Quick-mode external contract is retained (no full scheduler in quick).
  const quickModeContractUnchanged =
    code.includes("R6_QUICK_MODE true") && code.includes("QUICK_PROBE_SUMMARY") && code.includes('mode === "quick"');

  // 37. Full mode retains all 14 mutations (task list built from MUTATIONS).
  const fullRetains14Mutations =
    code.includes("MUTATIONS.map((m, i) =>") && code.includes("roots.length !== MUTATIONS.length");

  // 38. G/H/L workers run the full targeted suite PLUS the dedicated probe.
  const iwStart = code.indexOf("async function runInternalWorker(");
  const iwEnd = code.indexOf("\nfunction spawnWorkerProcess(", iwStart >= 0 ? iwStart : 0);
  const iwBody = iwStart >= 0 && iwEnd > iwStart ? code.slice(iwStart, iwEnd) : "";
  const fullRetainsGHLSuitPlusProbe =
    iwBody.includes("runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS)") &&
    iwBody.includes("runProbe(m, disp, repoRoot,") &&
    iwBody.includes("dedicated_probe");

  // ── R1 checks (parent semantic re-validation & owned cleanup) ──

  // 39. Parent independently re-validates the first_failure killed payload.
  const r1FirstFailureSemantics =
    code.includes("killed with invalid test_exit") &&
    code.includes("killed with wrong expected_evidence") &&
    code.includes("killed without expected evidence token") &&
    code.includes("killed with unchanged mutated bytes") &&
    code.includes("killed first_failure with non-not_applicable probe field");

  // 40. Structured probe assertions use the FIXED key contract + exact-set validation.
  const r1StructuredAssertions =
    code.includes("PROBE_ASSERTION_KEYS") &&
    code.includes("exactAssertionObject(") &&
    code.includes("probe assertions key set mismatch");

  // 41. Workers run in controllable POSIX process groups; the parent terminates
  //     the whole group with SIGTERM and a bounded SIGKILL escalation.
  const r1ProcessGroupTermination =
    code.includes("detached: true") &&
    code.includes("killProcessGroup(") &&
    code.includes('killProcessGroup(child, "SIGKILL")');

  // 42. Parent owns final worker-root cleanup across EVERY worker exit path.
  const r1ParentOwnedCleanup =
    code.includes("parentCleanupWorkerRoot(") &&
    code.includes("parent worker root cleanup failed");

  // 43. Probe sessions/files are contained inside the worker root.
  const r1ProbeContainment =
    code.includes('"probe-session"') &&
    code.includes("killed probe session outside worker root") &&
    code.includes("killed probe file outside worker root");

  // 44. Hidden selftest child requires random token + parent registry authorization.
  const r1SelftestToken =
    code.includes("--internal-selftest=") &&
    code.includes("selftest token authorization failed") &&
    code.includes(SELFTEST_TOKEN_ENV);

  // 45. Residual worker processes block success.
  const r1ResidualCheck =
    code.includes("residual worker processes") && code.includes("aliveGroups(");

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
    { name: "bounded_parallelism_limit_enforced", ok: boundedParallelismLimit },
    { name: "worker_requires_expected_head", ok: workerRequiresExpectedHead },
    { name: "worker_requires_valid_mutation_id", ok: workerRequiresValidMutationId },
    { name: "worker_requires_external_root", ok: workerRequiresExternalRoot },
    { name: "worker_roots_are_distinct", ok: workerRootsDistinct },
    { name: "scheduler_never_exceeds_two", ok: schedulerNeverExceedsTwo },
    { name: "worker_failure_cannot_forge_kill", ok: workerFailureCannotForgeKill },
    { name: "worker_cleanup_failure_blocks_success", ok: workerCleanupFailureBlocksSuccess },
    { name: "duplicate_worker_record_rejected", ok: duplicateWorkerRecordRejected },
    { name: "missing_worker_record_rejected", ok: missingWorkerRecordRejected },
    { name: "malformed_worker_record_rejected", ok: malformedWorkerRecordRejected },
    { name: "unknown_worker_record_rejected", ok: unknownWorkerRecordRejected },
    { name: "records_emitted_A_to_N", ok: recordsEmittedAToN },
    { name: "quick_mode_contract_unchanged", ok: quickModeContractUnchanged },
    { name: "full_retains_14_mutations", ok: fullRetains14Mutations },
    { name: "full_retains_G_H_L_suite_plus_probe", ok: fullRetainsGHLSuitPlusProbe },
    { name: "r1_parent_first_failure_semantics", ok: r1FirstFailureSemantics },
    { name: "r1_structured_probe_assertions", ok: r1StructuredAssertions },
    { name: "r1_process_group_termination", ok: r1ProcessGroupTermination },
    { name: "r1_parent_owned_root_cleanup", ok: r1ParentOwnedCleanup },
    { name: "r1_probe_containment", ok: r1ProbeContainment },
    { name: "r1_selftest_token_authorization", ok: r1SelftestToken },
    { name: "r1_residual_process_check", ok: r1ResidualCheck },
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

// ═══════════════════════════════════════ R7: bounded-parallel worker runtime

/** A task with a stable id for the fixed-capacity bounded scheduler. */
interface BoundedTask<T> {
  readonly id: string;
  readonly run: () => Promise<T>;
}

interface BoundedRun<T> {
  readonly scheduled: number;
  readonly completed: number;
  readonly peakConcurrency: number;
  readonly wallMs: number;
  readonly results: Map<string, T>;
  readonly failedIds: readonly string[];
  readonly failNote: string;
}

/**
 * Fixed-capacity bounded scheduler. Never starts more than `limit` concurrent
 * tasks; the first task failure stops further scheduling while active tasks
 * drain (so their cleanup results are still collected). Used by BOTH the full
 * mode scheduler and the bounded-parallelism self-test.
 */
async function runBoundedTasks<T>(
  tasks: readonly BoundedTask<T>[],
  limit: number,
  isStopped: () => boolean,
): Promise<BoundedRun<T>> {
  const queue = [...tasks];
  const results = new Map<string, T>();
  const active = new Map<string, Promise<void>>();
  const failedIds: string[] = [];
  let next = 0;
  let peak = 0;
  let failNote = "";
  const wallStart = Date.now();

  const startTask = (task: BoundedTask<T>): void => {
    const p = (async () => {
      try {
        const value = await task.run();
        results.set(task.id, value);
      } catch (e) {
        if (failedIds.length === 0) {
          failNote = (e instanceof Error ? e.message : String(e)).slice(0, MAX_EVIDENCE_LEN);
        }
        failedIds.push(task.id);
      } finally {
        active.delete(task.id);
      }
    })();
    active.set(task.id, p);
    if (active.size > peak) peak = active.size;
  };

  while (next < queue.length || active.size > 0) {
    while (next < queue.length && active.size < limit) {
      if (isStopped() || failedIds.length > 0) break;
      startTask(queue[next]!);
      next++;
    }
    if (active.size === 0) break;
    await Promise.race([...active.values()]);
  }

  return {
    scheduled: next,
    completed: results.size,
    peakConcurrency: peak,
    wallMs: Date.now() - wallStart,
    results,
    failedIds,
    failNote,
  };
}

/** Strictly typed, allowlisted content of one WORKER_RESULT record. */
interface WorkerResult {
  mutation_id: string;
  status: MutStatus;
  evidence_mode: EvidenceMode;
  target_matches: number;
  test_exit: number | null;
  test_duration_ms: number;
  first_failure: string;
  expected_evidence: string;
  probe_exit: string;
  probe_scenario_id: string;
  probe_error_name: string;
  probe_error_code: string;
  probe_error_message: string;
  probe_assertions: string | Record<string, boolean>;
  probe_environment_isolated: string;
  probe_file_cleanup_complete: string;
  probe_session_cleanup_complete: string;
  baseline_sha256: string;
  mutated_sha256: string;
  restored_sha256: string;
  restored_byte_identical: boolean;
  note: string;
  archive_extract_duration_ms: number;
  cleanup_duration_ms: number;
  worker_root_cleanup_complete: boolean;
  probe_session_root: string;
  probe_file_path: string;
  worker_root: string;
}

/** Allowlist of every field a worker result may carry; anything else is rejected. */
const WORKER_RESULT_FIELDS: ReadonlySet<string> = new Set([
  "mutation_id", "status", "evidence_mode", "target_matches", "test_exit",
  "test_duration_ms", "first_failure", "expected_evidence", "probe_exit",
  "probe_scenario_id", "probe_error_name", "probe_error_code", "probe_error_message",
  "probe_assertions", "probe_environment_isolated", "probe_file_cleanup_complete",
  "probe_session_cleanup_complete", "baseline_sha256", "mutated_sha256",
  "restored_sha256", "restored_byte_identical", "note", "archive_extract_duration_ms",
  "cleanup_duration_ms", "worker_root_cleanup_complete", "probe_session_root",
  "probe_file_path", "worker_root",
]);

const WORKER_STATUSES: ReadonlySet<string> = new Set(["killed", "survived", "invalid", "harness_error"]);
const SHA64_RE = /^[0-9a-f]{64}$/;

interface ParsedCli {
  kind: "public" | "worker";
  mode: "full" | "quick";
  mutationId: string;
  expectedHead: string;
  workerRoot: string;
  selftestKind: string;
  selftestToken: string;
  error: string;
}

/**
 * Internal-worker CLI. All arguments are required; duplicates, unknown
 * arguments, out-of-range mutation ids, malformed HEADs and repo-internal
 * roots fail closed. Public --mode flags mixed with worker flags also fail.
 * The hidden selftest child flags (--internal-selftest + --selftest-token)
 * are authorized by a random token and fail closed for any direct invocation.
 */
function parseWorkerArgs(args: readonly string[]): ParsedCli {
  const result: ParsedCli = { kind: "worker", mode: "full", mutationId: "", expectedHead: "", workerRoot: "", selftestKind: "", selftestToken: "", error: "" };
  const seen = new Set<string>();
  for (const arg of args) {
    if (arg === "--internal-worker") {
      if (seen.has("marker")) return { ...result, error: "duplicate --internal-worker flag" };
      seen.add("marker");
    } else if (arg.startsWith("--internal-selftest=")) {
      if (seen.has("selftest-kind")) return { ...result, error: "duplicate --internal-selftest flag" };
      seen.add("selftest-kind");
      result.selftestKind = arg.slice("--internal-selftest=".length);
    } else if (arg.startsWith("--selftest-token=")) {
      if (seen.has("selftest-token")) return { ...result, error: "duplicate --selftest-token flag" };
      seen.add("selftest-token");
      result.selftestToken = arg.slice("--selftest-token=".length);
    } else if (arg.startsWith("--mutation=")) {
      if (seen.has("mutation")) return { ...result, error: "duplicate --mutation flag" };
      seen.add("mutation");
      result.mutationId = arg.slice("--mutation=".length);
    } else if (arg.startsWith("--expected-head=")) {
      if (seen.has("expected-head")) return { ...result, error: "duplicate --expected-head flag" };
      seen.add("expected-head");
      result.expectedHead = arg.slice("--expected-head=".length);
    } else if (arg.startsWith("--worker-root=")) {
      if (seen.has("worker-root")) return { ...result, error: "duplicate --worker-root flag" };
      seen.add("worker-root");
      result.workerRoot = arg.slice("--worker-root=".length);
    } else {
      return { ...result, error: `unknown internal worker argument: ${arg}` };
    }
  }
  if (!seen.has("marker")) return { ...result, error: "missing --internal-worker marker" };
  if (!seen.has("mutation")) return { ...result, error: "missing mutation id" };
  if (!seen.has("expected-head")) return { ...result, error: "missing expected head" };
  if (!seen.has("worker-root")) return { ...result, error: "missing worker root" };
  if (!MUTATIONS.some((m) => m.id === result.mutationId))
    return { ...result, error: "invalid mutation id" };
  if (!SHA40_RE.test(result.expectedHead))
    return { ...result, error: "invalid expected head" };
  if (!path.isAbsolute(result.workerRoot))
    return { ...result, error: "worker root not absolute" };
  const cwd = process.cwd();
  const normalizeForContainment = (p: string): string => {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  };
  const root = normalizeForContainment(result.workerRoot);
  const repo = normalizeForContainment(cwd);
  if (root === repo || root.startsWith(repo + path.sep))
    return { ...result, error: "worker root inside repository" };
  // Hidden selftest child authorization: kind and token must be paired.
  if (seen.has("selftest-kind") !== seen.has("selftest-token"))
    return { ...result, error: "selftest kind and token must be provided together" };
  if (result.selftestKind !== "" && !SELFTEST_KINDS.includes(result.selftestKind))
    return { ...result, error: "unknown selftest kind" };
  if (result.selftestToken !== "" && !/^[0-9a-f]{48}$/.test(result.selftestToken))
    return { ...result, error: "invalid selftest token" };
  return result;
}

/** Public CLI is unchanged (--mode=full|quick, default full); worker flags mixed in fail closed. */
function parseCli(args: readonly string[]): ParsedCli {
  if (args.some((a) => a === "--internal-worker")) return parseWorkerArgs(args);
  const publicCli = parseCliMode(args);
  return { kind: "public", mode: publicCli.mode, mutationId: "", expectedHead: "", workerRoot: "", selftestKind: "", selftestToken: "", error: publicCli.error };
}

/** All 14 worker roots must be absolute, distinct, and outside the repo + git common dir. */
function validateWorkerRoots(
  roots: readonly string[],
  repoRoot: string,
  gitCommonDir: string,
): { ok: boolean; error: string } {
  if (roots.length !== MUTATIONS.length)
    return { ok: false, error: `expected ${MUTATIONS.length} worker roots, got ${roots.length}` };
  if (new Set(roots).size !== roots.length)
    return { ok: false, error: "worker roots are not distinct" };
  for (const root of roots) {
    if (!path.isAbsolute(root)) return { ok: false, error: `worker root not absolute: ${root}` };
    if (root === repoRoot || root.startsWith(repoRoot + path.sep))
      return { ok: false, error: `worker root inside repository: ${root}` };
    if (gitCommonDir !== "" && (root === gitCommonDir || root.startsWith(gitCommonDir + path.sep)))
      return { ok: false, error: `worker root inside git common dir: ${root}` };
  }
  return { ok: true, error: "" };
}

interface StdoutParse {
  ok: boolean;
  note: string;
  raw: unknown;
}

/** Parse EXACTLY ONE `WORKER_RESULT {json}` line from a worker's stdout. */
function parseWorkerStdout(stdout: string): StdoutParse {
  const records: string[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (t.startsWith(WORKER_RESULT_PREFIX + " ")) records.push(t.slice(WORKER_RESULT_PREFIX.length + 1));
    else if (t === WORKER_RESULT_PREFIX) records.push("");
  }
  if (records.length === 0) return { ok: false, note: "no worker record", raw: null };
  if (records.length !== 1) return { ok: false, note: `multiple worker records: ${records.length}`, raw: null };
  let raw: unknown;
  try {
    raw = JSON.parse(records[0]!);
  } catch {
    return { ok: false, note: "malformed worker record JSON", raw: null };
  }
  return { ok: true, note: "", raw };
}

interface ResultValidation {
  ok: boolean;
  note: string;
  result: WorkerResult | null;
}

function strFieldOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Strict allowlist + type + cross-field validation of one worker result.
 * A result can never be accepted as killed unless targetMatches=1, restored
 * bytes are identical, and (for G/H/L) cleanup, environment isolation and the
 * FIXED scenario evidence all match the MutationDef.
 */
function validateWorkerResult(
  raw: unknown,
  def: MutationDef,
  expectedId: string,
  expectedRoot: string,
  parentBaselineSha: string,
): ResultValidation {
  const fail = (note: string): ResultValidation => ({ ok: false, note, result: null });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("worker record not an object");
  const obj = raw as Record<string, unknown>;
  if (Object.getPrototypeOf(obj) !== Object.prototype) return fail("worker record has unknown prototype");
  for (const k of Object.keys(obj)) {
    if (!WORKER_RESULT_FIELDS.has(k)) return fail(`unknown worker record field: ${k}`);
  }
  const need: Record<string, (v: unknown) => string | null> = {
    mutation_id: strFieldOrNull,
    status: strFieldOrNull,
    evidence_mode: strFieldOrNull,
    first_failure: strFieldOrNull,
    expected_evidence: strFieldOrNull,
    probe_exit: strFieldOrNull,
    probe_scenario_id: strFieldOrNull,
    probe_error_name: strFieldOrNull,
    probe_error_code: strFieldOrNull,
    probe_error_message: strFieldOrNull,
    probe_environment_isolated: strFieldOrNull,
    probe_file_cleanup_complete: strFieldOrNull,
    probe_session_cleanup_complete: strFieldOrNull,
    baseline_sha256: strFieldOrNull,
    mutated_sha256: strFieldOrNull,
    restored_sha256: strFieldOrNull,
    note: strFieldOrNull,
    probe_session_root: strFieldOrNull,
    probe_file_path: strFieldOrNull,
    worker_root: strFieldOrNull,
  };
  for (const [k, fn] of Object.entries(need)) {
    const v = obj[k];
    if (v === undefined) return fail(`missing worker record field: ${k}`);
    if (fn(v) === null) return fail(`worker record field ${k} has wrong type`);
  }
  // probe_assertions is NOT a plain string: it must be a plain JSON object
  // (G/H/L) or the single strict not_applicable expression (everywhere else).
  if (obj.probe_assertions === undefined) return fail("missing worker record field: probe_assertions");
  if (typeof obj.probe_assertions !== "string" &&
      (obj.probe_assertions === null || typeof obj.probe_assertions !== "object")) {
    return fail("worker record field probe_assertions has wrong type");
  }
  const r: WorkerResult = {
    mutation_id: obj.mutation_id as string,
    status: obj.status as MutStatus,
    evidence_mode: obj.evidence_mode as EvidenceMode,
    target_matches: obj.target_matches as number,
    test_exit: obj.test_exit as number | null,
    test_duration_ms: obj.test_duration_ms as number,
    first_failure: obj.first_failure as string,
    expected_evidence: obj.expected_evidence as string,
    probe_exit: obj.probe_exit as string,
    probe_scenario_id: obj.probe_scenario_id as string,
    probe_error_name: obj.probe_error_name as string,
    probe_error_code: obj.probe_error_code as string,
    probe_error_message: obj.probe_error_message as string,
    probe_assertions: obj.probe_assertions as string | Record<string, boolean>,
    probe_environment_isolated: obj.probe_environment_isolated as string,
    probe_file_cleanup_complete: obj.probe_file_cleanup_complete as string,
    probe_session_cleanup_complete: obj.probe_session_cleanup_complete as string,
    baseline_sha256: obj.baseline_sha256 as string,
    mutated_sha256: obj.mutated_sha256 as string,
    restored_sha256: obj.restored_sha256 as string,
    restored_byte_identical: obj.restored_byte_identical as boolean,
    note: obj.note as string,
    archive_extract_duration_ms: obj.archive_extract_duration_ms as number,
    cleanup_duration_ms: obj.cleanup_duration_ms as number,
    worker_root_cleanup_complete: obj.worker_root_cleanup_complete as boolean,
    probe_session_root: obj.probe_session_root as string,
    probe_file_path: obj.probe_file_path as string,
    worker_root: obj.worker_root as string,
  };

  // ── scalar type checks ──
  if (!WORKER_STATUSES.has(r.status)) return fail(`unknown worker status: ${r.status}`);
  if (r.evidence_mode !== def.evidenceMode) return fail("evidence_mode does not match MutationDef");
  if (r.mutation_id !== expectedId) return fail(`wrong mutation id: ${r.mutation_id}`);
  if (!Number.isInteger(r.target_matches) || r.target_matches < 0) return fail("target_matches not a non-negative integer");
  if (r.test_exit !== null && !Number.isInteger(r.test_exit)) return fail("test_exit not an integer or null");
  if (!Number.isInteger(r.test_duration_ms) || r.test_duration_ms < 0) return fail("test_duration_ms not a non-negative integer");
  if (!Number.isInteger(r.archive_extract_duration_ms) || r.archive_extract_duration_ms < 0) return fail("archive_extract_duration_ms not a non-negative integer");
  if (!Number.isInteger(r.cleanup_duration_ms) || r.cleanup_duration_ms < 0) return fail("cleanup_duration_ms not a non-negative integer");
  if (typeof r.restored_byte_identical !== "boolean") return fail("restored_byte_identical not a boolean");
  if (typeof r.worker_root_cleanup_complete !== "boolean") return fail("worker_root_cleanup_complete not a boolean");
  if (r.status !== "harness_error" && !SHA64_RE.test(r.baseline_sha256)) return fail("baseline_sha256 not a valid SHA-256");
  if (r.status !== "harness_error" && r.baseline_sha256 !== parentBaselineSha) return fail("baseline_sha256 does not match parent baseline");
  if (r.mutated_sha256 !== "" && !SHA64_RE.test(r.mutated_sha256)) return fail("mutated_sha256 not a valid SHA-256");
  if (r.restored_sha256 !== "" && !SHA64_RE.test(r.restored_sha256)) return fail("restored_sha256 not a valid SHA-256");
  if (r.worker_root !== expectedRoot) return fail("worker_root does not match scheduled root");
  if (!path.isAbsolute(r.worker_root)) return fail("worker_root not absolute");
  const truthy = (s: string): boolean => s === "true" || s === "false" || s === "not_applicable";
  if (!truthy(r.probe_environment_isolated)) return fail("probe_environment_isolated invalid");
  if (!truthy(r.probe_file_cleanup_complete)) return fail("probe_file_cleanup_complete invalid");
  if (!truthy(r.probe_session_cleanup_complete)) return fail("probe_session_cleanup_complete invalid");

  // ── R1: structured probe-assertion contract (plain JSON object with the
  //    FIXED key set for G/H/L; single strict not_applicable elsewhere) ──
  if (def.evidenceMode === "dedicated_probe") {
    const keys = PROBE_ASSERTION_KEYS[def.id];
    if (keys === undefined) return fail(`no fixed probe assertion contract for mutation ${def.id}`);
    if (typeof r.probe_assertions === "string") {
      if (r.probe_assertions !== "not_applicable")
        return fail("probe assertions must be an object or not_applicable");
    } else {
      const ex = exactAssertionObject(r.probe_assertions, keys);
      if (!ex.ok) return fail(`probe assertions: ${ex.note}`);
      r.probe_assertions = ex.object!;
    }
  } else if (r.probe_assertions !== "not_applicable") {
    return fail("non-probe mutation must use not_applicable probe assertions");
  }

  // ── R1: worker-reported probe paths must be contained in the scheduled root
  //    (absolute, normalize/realpath containment, no `..` escape) ──
  if (r.probe_session_root !== "") {
    if (!path.isAbsolute(r.probe_session_root)) return fail("probe_session_root not absolute");
    if (!isPathContained(expectedRoot, r.probe_session_root)) return fail("probe session outside worker root");
  }
  if (r.probe_file_path !== "") {
    if (!path.isAbsolute(r.probe_file_path)) return fail("probe_file_path not absolute");
    if (!isPathContained(expectedRoot, r.probe_file_path)) return fail("probe file outside worker root");
  }

  // ── R2: SHARED killed base contract — enforced for EVERY killed payload,
  //    first_failure AND dedicated_probe alike. The full targeted suite must
  //    have run and failed (non-zero integer test_exit), the mutation must
  //    have changed real bytes vs the parent baseline, restoration must be
  //    proven byte-identical, and the payload must reference the scheduled
  //    root. Any failure rejects the worker result (harness_error) and blocks
  //    aggregate success. ──
  if (r.status === "killed") {
    if (r.target_matches !== 1) return fail("killed with target match count != 1");
    if (r.expected_evidence !== def.expectedEvidence) return fail("killed with wrong expected_evidence");
    if (r.test_exit === null || !Number.isInteger(r.test_exit) || r.test_exit <= 0)
      return fail("killed with invalid test_exit");
    if (!SHA64_RE.test(r.baseline_sha256)) return fail("killed without valid baseline_sha256");
    if (r.baseline_sha256 !== parentBaselineSha) return fail("killed with baseline not equal to parent baseline");
    if (r.mutated_sha256 === "" || !SHA64_RE.test(r.mutated_sha256)) return fail("killed without valid mutated_sha256");
    if (r.mutated_sha256 === r.baseline_sha256) return fail("killed with unchanged mutated bytes");
    if (!r.restored_byte_identical) return fail("killed without restored byte identity");
    if (r.restored_sha256 !== r.baseline_sha256) return fail("killed without restored SHA equal to baseline");
    if (r.worker_root !== expectedRoot) return fail("killed with worker_root not equal to scheduled root");
    if (r.evidence_mode === "dedicated_probe") {
      // ── dedicated_probe extras on top of the shared base contract ──
      if (r.probe_environment_isolated !== "true") return fail("killed probe without environment isolation");
      if (r.probe_file_cleanup_complete !== "true" || r.probe_session_cleanup_complete !== "true")
        return fail("killed probe without complete cleanup");
      if (r.probe_scenario_id !== def.probeScenarioId || r.probe_error_name !== def.expectedErrorName ||
          r.probe_error_code !== def.expectedErrorCode || r.probe_error_message !== def.expectedErrorMessage)
        return fail("killed probe without fixed evidence match");
      if (r.probe_exit !== "0") return fail("killed probe without zero probe exit");
      if (typeof r.probe_assertions !== "object" || r.probe_assertions === null)
        return fail("killed probe without structured assertions");
      if (r.probe_session_root === "" || !isPathContained(expectedRoot, r.probe_session_root))
        return fail("killed probe session outside worker root");
      if (r.probe_file_path === "" || !isPathContained(expectedRoot, r.probe_file_path))
        return fail("killed probe file outside worker root");
    } else {
      // ── R1/R2: parent independently re-validates the first_failure killed
      //    payload on top of the shared base contract — the worker's own
      //    classification is never trusted. ──
      if (r.first_failure === "") return fail("killed with empty first_failure");
      if (!r.first_failure.includes(def.expectedEvidence))
        return fail("killed without expected evidence token");
      if (r.probe_session_root !== "" || r.probe_file_path !== "")
        return fail("killed first_failure with probe paths");
      for (const pf of FIRST_FAILURE_PROBE_FIELDS) {
        if ((r as unknown as Record<string, unknown>)[pf] !== "not_applicable")
          return fail("killed first_failure with non-not_applicable probe field");
      }
    }
  }
  return { ok: true, note: "", result: r };
}

interface WorkerOutcome {
  readonly id: string;
  readonly ok: boolean;
  readonly note: string;
  readonly result: WorkerResult | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly spawnError: boolean;
}

/**
 * The parent never trusts the worker exit code alone AND never lets a
 * nonzero/signalled/timed-out worker forge a kill: any structurally failed
 * worker yields harness_error.
 */
function finalizeWorkerStatus(outcome: WorkerOutcome): MutStatus {
  if (!outcome.ok) return "harness_error";
  return outcome.result!.status;
}

function buildRecordFromResult(m: MutationDef, r: WorkerResult): MutationRecord {
  const rec = newRecord(m, r.target_matches, r.baseline_sha256);
  rec.status = r.status;
  rec.testExit = r.test_exit;
  rec.durationMs = r.test_duration_ms;
  rec.firstFailure = r.first_failure;
  rec.probeExit = r.probe_exit;
  rec.probeScenarioId = r.probe_scenario_id;
  rec.probeErrorName = r.probe_error_name;
  rec.probeErrorCode = r.probe_error_code;
  rec.probeErrorMessage = r.probe_error_message;
  rec.probeAssertions = r.probe_assertions;
  rec.probeEnvironmentIsolated = r.probe_environment_isolated;
  rec.probeFileCleanupComplete = r.probe_file_cleanup_complete;
  rec.probeSessionCleanupComplete = r.probe_session_cleanup_complete;
  rec.mutatedSha256 = r.mutated_sha256;
  rec.restoredSha256 = r.restored_sha256;
  rec.restoredByteIdentical = r.restored_byte_identical;
  rec.note = r.note;
  return rec;
}

interface MergedOutcomes {
  records: MutationRecord[];
  error: string;
  missingIds: string[];
  duplicateIds: string[];
  sumTestDurationMs: number;
  sumArchiveExtractMs: number;
  sumCleanupMs: number;
}

/**
 * Merge per-worker outcomes into official MutationRecords in fixed A–N order.
 * Missing, duplicate, or unknown-id outcomes are REJECTED (the error is
 * non-empty and the overall gate fails).
 */
function mergeWorkerOutcomes(
  outcomeList: readonly WorkerOutcome[],
  mutations: readonly MutationDef[],
  parentBaselineSha: string,
): MergedOutcomes {
  const byId = new Map<string, WorkerOutcome>();
  const duplicateIds: string[] = [];
  for (const o of outcomeList) {
    if (byId.has(o.id)) duplicateIds.push(o.id);
    else byId.set(o.id, o);
  }
  const records: MutationRecord[] = [];
  const missingIds: string[] = [];
  const unknownIds = [...byId.keys()].filter((id) => !mutations.some((m) => m.id === id));
  let sumTest = 0;
  let sumArchive = 0;
  let sumCleanup = 0;
  for (const m of mutations) {
    const outcome = byId.get(m.id);
    if (!outcome) {
      missingIds.push(m.id);
      continue;
    }
    if (!outcome.ok) {
      const rec = newRecord(m, 0, parentBaselineSha);
      rec.status = "harness_error";
      rec.note = outcome.note.slice(0, MAX_EVIDENCE_LEN);
      records.push(rec);
      continue;
    }
    const r = outcome.result!;
    sumTest += r.test_duration_ms;
    sumArchive += r.archive_extract_duration_ms;
    sumCleanup += r.cleanup_duration_ms;
    const rec = buildRecordFromResult(m, r);
    rec.status = finalizeWorkerStatus(outcome);
    records.push(rec);
  }
  const error =
    missingIds.length > 0 || duplicateIds.length > 0 || unknownIds.length > 0
      ? `worker record merge failed: missing=${missingIds.join(",")} duplicate=${duplicateIds.join(",")} unknown=${unknownIds.join(",")}`
      : "";
  return { records, error, missingIds, duplicateIds, sumTestDurationMs: sumTest, sumArchiveExtractMs: sumArchive, sumCleanupMs: sumCleanup };
}

function buildWorkerResult(
  rec: MutationRecord,
  m: MutationDef,
  archiveExtractMs: number,
  probeSessionRoot: string,
  probeFilePath: string,
  workerRoot: string,
): WorkerResult {
  return {
    mutation_id: rec.id,
    status: rec.status,
    evidence_mode: rec.evidenceMode,
    target_matches: rec.targetMatches,
    test_exit: rec.testExit,
    test_duration_ms: rec.durationMs,
    first_failure: rec.firstFailure,
    expected_evidence: rec.expectedEvidence,
    probe_exit: rec.probeExit,
    probe_scenario_id: rec.probeScenarioId,
    probe_error_name: rec.probeErrorName,
    probe_error_code: rec.probeErrorCode,
    probe_error_message: rec.probeErrorMessage,
    probe_assertions: rec.probeAssertions,
    probe_environment_isolated: rec.probeEnvironmentIsolated,
    probe_file_cleanup_complete: rec.probeFileCleanupComplete,
    probe_session_cleanup_complete: rec.probeSessionCleanupComplete,
    baseline_sha256: rec.baselineSha256,
    mutated_sha256: rec.mutatedSha256,
    restored_sha256: rec.restoredSha256,
    restored_byte_identical: rec.restoredByteIdentical,
    note: rec.note,
    archive_extract_duration_ms: archiveExtractMs,
    cleanup_duration_ms: 0,
    worker_root_cleanup_complete: false,
    probe_session_root: probeSessionRoot,
    probe_file_path: probeFilePath,
    worker_root: workerRoot,
  };
}

function workerHarnessError(m: MutationDef, cli: ParsedCli, note: string): WorkerResult {
  return {
    mutation_id: cli.mutationId,
    status: "harness_error",
    evidence_mode: m.evidenceMode,
    target_matches: 0,
    test_exit: null,
    test_duration_ms: 0,
    first_failure: "",
    expected_evidence: m.expectedEvidence,
    probe_exit: "not_applicable",
    probe_scenario_id: "not_applicable",
    probe_error_name: "not_applicable",
    probe_error_code: "not_applicable",
    probe_error_message: "not_applicable",
    probe_assertions: "not_applicable",
    probe_environment_isolated: "not_applicable",
    probe_file_cleanup_complete: "not_applicable",
    probe_session_cleanup_complete: "not_applicable",
    baseline_sha256: "",
    mutated_sha256: "",
    restored_sha256: "",
    restored_byte_identical: false,
    note: note.slice(0, MAX_EVIDENCE_LEN),
    archive_extract_duration_ms: 0,
    cleanup_duration_ms: 0,
    worker_root_cleanup_complete: false,
    probe_session_root: "",
    probe_file_path: "",
    worker_root: cli.workerRoot,
  };
}

interface WorkerRegistry {
  expectedHead: string;
  repoRoot: string;
  gitCommonDir: string;
  roots: string[];
}

function readWorkerRegistry(): { registry: WorkerRegistry; error: string } {
  const empty: WorkerRegistry = { expectedHead: "", repoRoot: "", gitCommonDir: "", roots: [] };
  const regPath = process.env[REGISTRY_ENV] ?? "";
  if (regPath === "") return { registry: empty, error: "worker registry env missing" };
  let raw: string;
  try {
    raw = fs.readFileSync(regPath, "utf8");
  } catch (e) {
    return { registry: empty, error: `worker registry unreadable: ${(e as Error).message}` };
  }
  try {
    const obj = JSON.parse(raw) as WorkerRegistry;
    if (
      obj === null || typeof obj !== "object" || !Array.isArray(obj.roots) ||
      typeof obj.repoRoot !== "string" || typeof obj.gitCommonDir !== "string" ||
      typeof obj.expectedHead !== "string"
    ) {
      return { registry: empty, error: "worker registry malformed" };
    }
    return { registry: obj, error: "" };
  } catch {
    return { registry: empty, error: "worker registry malformed" };
  }
}

function gitHeadShaAt(repoRoot: string): string {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git rev-parse HEAD failed");
  return r.stdout.trim();
}

function gitShowHeadAt(repoRoot: string, rel: string, sha: string): Buffer {
  const r = spawnSync("git", ["show", `${sha}:${rel}`], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git show ${sha}:${rel} failed`);
  return r.stdout as Buffer;
}

function gitCommonDirAt(repoRoot: string): string {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git rev-parse --git-common-dir failed");
  const out = r.stdout.trim();
  return path.isAbsolute(out) ? path.normalize(out) : path.resolve(repoRoot, out);
}

// ═══════════════════════════════════════ R1: containment, process groups, cleanup

async function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Synchronous bounded sleep (used inside the signal handler). */
function syncSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Containment test that survives normalize AND realpath: the resolved child
 * path must equal the parent or live under it, and — when BOTH paths exist —
 * the realpath'd child must still be contained (a half-realpath'd comparison
 * would break on platforms where the temp root itself is a symlink, e.g.
 * macOS /var -> /private/var). `..` escapes are resolved by normalization and
 * can never pass.
 */
function isPathContained(parent: string, child: string): boolean {
  const lex = (p: string): string => path.normalize(path.resolve(p));
  const pLex = lex(parent);
  const cLex = lex(child);
  if (cLex !== pLex && !cLex.startsWith(pLex + path.sep)) return false;
  let pReal: string | null = null;
  let cReal: string | null = null;
  try { pReal = path.normalize(fs.realpathSync(parent)); } catch { pReal = null; }
  try { cReal = path.normalize(fs.realpathSync(child)); } catch { cReal = null; }
  if (pReal !== null && cReal !== null) {
    return cReal === pReal || cReal.startsWith(pReal + path.sep);
  }
  return true;
}

/**
 * Signal an entire POSIX process group. Workers are spawned `detached`, making
 * each worker a process-group leader, so `-pid` addresses the whole tree
 * (targeted-suite children, probe children, any controlled descendants).
 * Returns true when a group member was signalled; false when the group is
 * already gone (ESRCH) or no pid is available.
 */
function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): boolean {
  if (child.pid === undefined) return false;
  try { process.kill(-child.pid, signal); return true; } catch { return false; }
}

/** One strictly parsed `ps` row (pid, pgid, state). */
interface ProcessRow {
  pid: number;
  pgid: number;
  state: string;
}

/**
 * Fail-closed process scan (R2): success carries strictly parsed rows, failure
 * carries a stable reportable reason. A failed scan is NEVER treated as "no
 * residual processes" by any caller.
 */
type ProcessScan =
  | { ok: true; entries: readonly ProcessRow[] }
  | { ok: false; error: string };

/** Raw `ps` invocation result — injectable runner seam for scanner self-tests. */
interface PsRawResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: unknown;
  error?: Error;
}
type PsRunner = (args: readonly string[]) => PsRawResult;

const realPsRunner: PsRunner = (args) => {
  const r = spawnSync("ps", [...args], { encoding: "utf8" });
  return { status: r.status, signal: r.signal ?? null, stdout: r.stdout, error: r.error };
};

/**
 * Pure strict parser for `ps -o pid=,pgid=,state=` output. Blank lines are
 * ignored; ANY non-empty line that does not parse into exactly three fields
 * with a positive-integer pid, a NON-NEGATIVE integer pgid and a non-empty
 * state fails the whole scan. pgid=0 is legal on Linux (processes not
 * attached to a positive process group) and is RETAINED in the parsed
 * entries; it can never satisfy a positive target-group match because
 * matching is by exact pgid equality, so no caller ever treats it as an
 * active worker group. Malformed-row snippets in errors are length-limited
 * and control-character-cleaned; the full process table is never echoed.
 */
function parseProcessRows(stdout: string): ProcessScan {
  const entries: ProcessRow[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3)
      return { ok: false, error: `row-parse malformed ps line: ${clampLine(line)}` };
    const pid = Number(parts[0]);
    const pgid = Number(parts[1]);
    const state = parts[2] ?? "";
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(pgid) || pgid < 0 || state === "")
      return { ok: false, error: `row-parse invalid ps row: ${clampLine(line)}` };
    entries.push({ pid, pgid, state });
  }
  return { ok: true, entries };
}

/** Pure: does any NON-zombie row belong to the given pgid? */
function entriesPgidAlive(entries: readonly ProcessRow[], pgid: number): boolean {
  return entries.some((p) => p.pgid === pgid && !p.state.includes("Z"));
}

/** Pure: wanted pgids that still have live (non-zombie) rows. */
function entriesAlivePgids(entries: readonly ProcessRow[], wanted: readonly number[]): number[] {
  const set = new Set(wanted);
  const alive = new Set<number>();
  for (const p of entries) {
    if (set.has(p.pgid) && !p.state.includes("Z")) alive.add(p.pgid);
  }
  return [...alive];
}

/**
 * Snapshot of `ps` pid/pgid/state lines (darwin + linux supported platforms).
 * Fail-closed: spawn error, signal termination, null/non-zero status,
 * non-string stdout, or any unparseable non-empty line => ok=false with a
 * reportable reason that includes the failure category (scan-execution /
 * row-parse) and the calling phase/context. Never returns a bare `[]` on
 * failure. The runner parameter is an internal test seam; production always
 * uses the real `ps` binary (no shell, no third-party dependencies, no
 * env-controlled bypass).
 */
function scanProcessGroups(runner: PsRunner = realPsRunner, phase = "process-scan"): ProcessScan {
  const args = process.platform === "darwin" ? ["-axo", "pid=,pgid=,state="] : ["-eo", "pid=,pgid=,state="];
  const r = runner(args);
  if (r.error !== undefined) return { ok: false, error: `${phase}: scan-execution failure (spawn): ${r.error.message}` };
  if (r.signal !== null) return { ok: false, error: `${phase}: scan-execution failure (signal ${r.signal})` };
  if (r.status === null) return { ok: false, error: `${phase}: scan-execution failure (null status)` };
  if (r.status !== 0) return { ok: false, error: `${phase}: scan-execution failure (status ${r.status})` };
  if (typeof r.stdout !== "string") return { ok: false, error: `${phase}: scan-execution failure (non-string stdout)` };
  const parsed = parseProcessRows(r.stdout);
  if (!parsed.ok) return { ok: false, error: `${phase}: ${parsed.error}` };
  return parsed;
}

/**
 * Fail-closed "does this process group still have live (non-zombie) members?".
 * A failed scan yields ok=false (never "clean"). `phase` labels the calling
 * context in diagnostics.
 */
function pgidStillAlive(pgid: number, runner?: PsRunner, phase = "residual-check"): { ok: boolean; alive: boolean; error: string } {
  const s = scanProcessGroups(runner, phase);
  if (!s.ok) return { ok: false, alive: false, error: s.error };
  return { ok: true, alive: entriesPgidAlive(s.entries, pgid), error: "" };
}

/**
 * Fail-closed subset of the given pgids that still have live members. A failed
 * scan yields ok=false (never an empty "no residual" list). `phase` labels the
 * calling context in diagnostics.
 */
function aliveGroups(pgids: readonly number[], runner?: PsRunner, phase = "residual-check"): { ok: boolean; alive: number[]; error: string } {
  const s = scanProcessGroups(runner, phase);
  if (!s.ok) return { ok: false, alive: [], error: s.error };
  return { ok: true, alive: entriesAlivePgids(s.entries, pgids), error: "" };
}

/**
 * R1 parent-owned worker-root cleanup: recursive force remove followed by an
 * existsSync re-verification. Any failure is reported and forces the outcome
 * away from killed (the parent never trusts the worker's own cleanup claim).
 */
function parentCleanupWorkerRoot(root: string): { ok: boolean; note: string } {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {
    return { ok: false, note: `parent worker root cleanup failed: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN) };
  }
  if (fs.existsSync(root)) return { ok: false, note: "parent worker root cleanup incomplete" };
  return { ok: true, note: "" };
}

/**
 * Execute ONE mutation inside a worker against the worker's own disposable
 * copy: exact target lookup, byte mutation, full targeted suite, dedicated
 * probe (G/H/L), then byte-exact restore re-hashed in a finally.
 */
async function executeSingleMutation(
  m: MutationDef,
  disp: string,
  repoRoot: string,
  archiveExtractMs: number,
  cli: ParsedCli,
): Promise<WorkerResult> {
  const dispProd = path.join(disp, PROD_REL);
  const original = fs.readFileSync(dispProd);
  const originalSha = sha256Buf(original);
  const text = original.toString("utf8");

  let targetMatches = 0;
  let idx = text.indexOf(m.target);
  while (idx >= 0) {
    targetMatches++;
    idx = text.indexOf(m.target, idx + m.target.length);
  }

  const rec = newRecord(m, targetMatches, originalSha);
  let probeSessionRoot = "";
  let probeFilePath = "";

  if (targetMatches !== 1) {
    rec.status = "invalid";
    rec.note = `target match count ${targetMatches} != 1`;
  } else {
    const mutatedText = text.replace(m.target, m.replacement);
    const mutatedBytes = Buffer.from(mutatedText, "utf8");
    rec.mutatedSha256 = sha256Buf(mutatedBytes);
    if (rec.mutatedSha256 === originalSha) {
      rec.status = "invalid";
      rec.note = "replacement did not change bytes";
    } else {
      try {
        fs.writeFileSync(dispProd, mutatedBytes);

        if (m.evidenceMode === "first_failure") {
          // ── first_failure: full targeted suite, then the existing classifier ──
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
          // ── dedicated_probe (G/H/L): full targeted suite MUST run first ──
          const run = runTsxTest(disp, TEST_REL, PER_RUN_TIMEOUT_MS);
          rec.testExit = run.exitCode;
          rec.durationMs = run.durationMs;
          const ff = firstFailLine(run.combined);
          rec.firstFailure = ff ?? "";

          if (run.spawnError) {
            rec.status = "invalid";
            rec.note = "targeted test did not start";
          } else if (run.timedOut) {
            rec.status = "invalid";
            rec.note = "targeted suite timeout";
          } else if (run.exitCode === 0) {
            rec.status = "invalid";
            rec.note = "targeted suite passed under mutation (probe not run)";
          } else if (looksLikeNonKill(run.combined)) {
            rec.status = "invalid";
            rec.note = "targeted suite non-zero from syntax/module/tool/timeout fault";
          } else {
            // The targeted suite started and failed for the right reason: run the probe.
            const probeResult = runProbe(m, disp, repoRoot, cli.workerRoot);
            probeSessionRoot = probeResult.registeredSessionRoot;
            probeFilePath = probeResult.probeFilePath;
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
                rec.probeAssertions = cmp.assertions ?? "not_applicable";
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
            // Cleanup failure must block a kill even after classification.
            if (rec.status === "killed" && (!probeResult.probeFileCleanupComplete || !probeResult.probeSessionCleanupComplete)) {
              rec.status = "harness_error";
              rec.note = "probe cleanup incomplete after kill";
            }
          }
        }
      } catch (e) {
        rec.status = "harness_error";
        rec.note = `harness fault: ${(e as Error).message}`.slice(0, MAX_EVIDENCE_LEN);
      } finally {
        // Always restore original bytes, then re-read + re-hash to prove identity.
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
    }
  }

  return buildWorkerResult(rec, m, archiveExtractMs, probeSessionRoot, probeFilePath, cli.workerRoot);
}

/**
 * Internal worker entry: validates the expected HEAD and protected files in
 * the REAL repo, builds its OWN disposable copy via `git archive <expected
 * HEAD>`, executes exactly one mutation, restores, cleans its own root, and
 * emits exactly one structured WORKER_RESULT line.
 */
async function runInternalWorker(cli: ParsedCli): Promise<number> {
  const m = MUTATIONS.find((x) => x.id === cli.mutationId);
  if (!m) {
    console.error("WORKER_FAULT unknown mutation id");
    return 1;
  }
  const { registry, error: regError } = readWorkerRegistry();
  if (regError !== "") {
    console.error(`WORKER_FAULT ${regError}`);
    return 1;
  }
  const rootCheck = validateWorkerRoots(registry.roots, registry.repoRoot, registry.gitCommonDir);
  if (!rootCheck.ok) {
    console.error(`WORKER_FAULT ${rootCheck.error}`);
    return 1;
  }
  if (registry.expectedHead !== cli.expectedHead) {
    console.error("WORKER_FAULT registry expected HEAD mismatch");
    return 1;
  }
  if (!registry.roots.includes(cli.workerRoot)) {
    console.error("WORKER_FAULT worker root not registered by parent");
    return 1;
  }

  let result: WorkerResult | null = null;
  let cleanupMs = 0;
  let rootCleanupComplete = false;
  const cleanupRoot = (): void => {
    const cStart = Date.now();
    try { fs.rmSync(cli.workerRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    cleanupMs = Date.now() - cStart;
    rootCleanupComplete = !fs.existsSync(cli.workerRoot);
  };

  try {
    // ── Real-repo invariants vs the parent-provided expected HEAD ──
    if (gitHeadShaAt(registry.repoRoot) !== cli.expectedHead) {
      result = workerHarnessError(m, cli, "real local HEAD does not match expected HEAD");
    } else {
      const prodHeadBytes = gitShowHeadAt(registry.repoRoot, PROD_REL, cli.expectedHead);
      const testHeadBytes = gitShowHeadAt(registry.repoRoot, TEST_REL, cli.expectedHead);
      const lockHeadBytes = gitShowHeadAt(registry.repoRoot, LOCK_REL, cli.expectedHead);
      const prodWorkBytes = fs.readFileSync(path.join(registry.repoRoot, PROD_REL));
      const testWorkBytes = fs.readFileSync(path.join(registry.repoRoot, TEST_REL));
      const lockWorkBytes = fs.readFileSync(path.join(registry.repoRoot, LOCK_REL));
      if (sha256Buf(prodHeadBytes) !== sha256Buf(prodWorkBytes)) result = workerHarnessError(m, cli, "real production file differs from expected HEAD");
      else if (sha256Buf(testHeadBytes) !== sha256Buf(testWorkBytes)) result = workerHarnessError(m, cli, "real test file differs from expected HEAD");
      else if (sha256Buf(lockHeadBytes) !== sha256Buf(lockWorkBytes)) result = workerHarnessError(m, cli, "real package-lock differs from expected HEAD");
    }
    if (result === null) {
      // ── Build THIS worker's disposable copy from the fixed expected HEAD ──
      const disp = path.join(cli.workerRoot, "work");
      fs.mkdirSync(disp, { recursive: true });
      const aStart = Date.now();
      const archive = spawnSync("git", ["archive", cli.expectedHead], { cwd: registry.repoRoot, maxBuffer: 256 * 1024 * 1024 });
      const untar = archive.status === 0 && archive.stdout ? spawnSync("tar", ["-xf", "-"], { cwd: disp, input: archive.stdout, maxBuffer: 256 * 1024 * 1024 }) : null;
      const archiveExtractMs = Date.now() - aStart;
      if (archive.status !== 0 || !archive.stdout || untar === null || untar.status !== 0) {
        result = workerHarnessError(m, cli, "git archive / tar extract failed");
      } else {
        fs.symlinkSync(path.join(registry.repoRoot, "node_modules"), path.join(disp, "node_modules"), "dir");
        result = await executeSingleMutation(m, disp, registry.repoRoot, archiveExtractMs, cli);
      }
    }
  } catch (e) {
    result = workerHarnessError(m, cli, `worker harness fault: ${(e as Error).message}`);
  } finally {
    cleanupRoot();
  }

  if (result === null) result = workerHarnessError(m, cli, "worker produced no result");
  result.cleanup_duration_ms = cleanupMs;
  result.worker_root_cleanup_complete = rootCleanupComplete;
  console.log(WORKER_RESULT_PREFIX + " " + JSON.stringify(result));
  return 0;
}

/**
 * Hidden internal-only selftest child mode (R1). Authorized by a random token
 * (must match argv + env) and the parent worker registry; every real HEAD /
 * root / protected-file check a regular worker performs is still enforced —
 * this mode can never bypass verification, and any direct user invocation
 * fails closed. Modes:
 *   forge    — emit a structurally valid but semantically forged killed
 *              WORKER_RESULT (test_exit=0) and exit 0; a blocking descendant
 *              is intentionally left running so the parent must kill the
 *              process group and remove the worker root itself.
 *   graceful — create a probe-like resource + blocking descendant, announce
 *              SELFTEST_READY, then block until the parent SIGTERMs the group.
 *   forced   — same, but SIGTERM is ignored so the parent must escalate to
 *              SIGKILL after its bounded grace window.
 */
async function runSelftestChild(cli: ParsedCli): Promise<number> {
  const m = MUTATIONS.find((x) => x.id === cli.mutationId);
  if (!m) {
    console.error("WORKER_FAULT unknown mutation id");
    return 1;
  }
  // Random-token authorization: the argv token must equal the parent env token.
  if (!/^[0-9a-f]{48}$/.test(cli.selftestToken) || cli.selftestToken !== (process.env[SELFTEST_TOKEN_ENV] ?? "")) {
    console.error("WORKER_FAULT selftest token authorization failed");
    return 1;
  }
  const { registry, error: regError } = readWorkerRegistry();
  if (regError !== "") {
    console.error(`WORKER_FAULT ${regError}`);
    return 1;
  }
  const rootCheck = validateWorkerRoots(registry.roots, registry.repoRoot, registry.gitCommonDir);
  if (!rootCheck.ok) {
    console.error(`WORKER_FAULT ${rootCheck.error}`);
    return 1;
  }
  if (registry.expectedHead !== cli.expectedHead) {
    console.error("WORKER_FAULT registry expected HEAD mismatch");
    return 1;
  }
  if (!registry.roots.includes(cli.workerRoot)) {
    console.error("WORKER_FAULT worker root not registered by parent");
    return 1;
  }
  // Real HEAD / protected-file verification is NEVER bypassed by this mode.
  if (gitHeadShaAt(registry.repoRoot) !== cli.expectedHead) {
    console.error("WORKER_FAULT real local HEAD does not match expected HEAD");
    return 1;
  }
  for (const rel of [PROD_REL, TEST_REL, LOCK_REL]) {
    const headBytes = gitShowHeadAt(registry.repoRoot, rel, cli.expectedHead);
    const workBytes = fs.readFileSync(path.join(registry.repoRoot, rel));
    if (sha256Buf(headBytes) !== sha256Buf(workBytes)) {
      console.error(`WORKER_FAULT real ${rel} differs from expected HEAD`);
      return 1;
    }
  }

  // Probe-like resource inside the worker root — the parent's cleanup target.
  const resourceRoot = path.join(cli.workerRoot, "probe-session", "G");
  fs.mkdirSync(resourceRoot, { recursive: true });
  fs.writeFileSync(path.join(resourceRoot, "probe-resource.bin"), Buffer.from("selftest:" + cli.selftestToken, "utf8"));

  // Controlled blocking descendant in the SAME process group as this child.
  // The parent spawned this child detached, so this child is the process-group
  // leader and a non-detached descendant inherits this child's PGID. The
  // descendant's REAL spawn must succeed with a valid PID before any readiness
  // (or forged result) is emitted; a spawn error / missing PID fails closed
  // and the error event is never swallowed.
  const descendant = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const descendantPid = await new Promise<number>((resolve) => {
    descendant.once("spawn", () => resolve(descendant.pid ?? 0));
    descendant.once("error", () => resolve(0));
  });
  if (descendantPid <= 0 || descendantPid === process.pid) {
    console.error("WORKER_FAULT descendant spawn failed");
    return 1;
  }

  if (cli.selftestKind === "forge") {
    // Exit 0 immediately while the descendant keeps running: the parent must
    // kill the process group and delete the worker root itself.
    descendant.unref();
    const baselineSha = sha256Buf(fs.readFileSync(path.join(registry.repoRoot, PROD_REL)));
    const forged: WorkerResult = {
      mutation_id: m.id,
      status: "killed",
      evidence_mode: "first_failure",
      target_matches: 1,
      test_exit: 0,
      test_duration_ms: 123,
      first_failure: "✗ path not allowed (forged)",
      expected_evidence: "path not allowed",
      probe_exit: "not_applicable",
      probe_scenario_id: "not_applicable",
      probe_error_name: "not_applicable",
      probe_error_code: "not_applicable",
      probe_error_message: "not_applicable",
      probe_assertions: "not_applicable",
      probe_environment_isolated: "not_applicable",
      probe_file_cleanup_complete: "not_applicable",
      probe_session_cleanup_complete: "not_applicable",
      baseline_sha256: baselineSha,
      mutated_sha256: "b".repeat(64),
      restored_sha256: baselineSha,
      restored_byte_identical: true,
      note: "selftest forged killed payload",
      archive_extract_duration_ms: 1,
      cleanup_duration_ms: 1,
      worker_root_cleanup_complete: true,
      probe_session_root: "",
      probe_file_path: "",
      worker_root: cli.workerRoot,
    };
    console.log(WORKER_RESULT_PREFIX + " " + JSON.stringify(forged));
    return 0;
  }

  if (cli.selftestKind === "forced") {
    // Truly ignore SIGTERM so the parent must escalate to SIGKILL after its
    // bounded grace window.
    process.on("SIGTERM", () => {
      if (process.env.L04_DEBUG === "1") console.error("FORCED_GOT_SIGTERM pid=" + process.pid);
      /* ignored: the parent must escalate to SIGKILL */
    });
  }
  console.log(SELFTEST_READY_PREFIX + " " + JSON.stringify({ kind: cli.selftestKind, child_pid: process.pid, descendant_pid: descendantPid }));
  // Keep the event loop alive independently of the blocking descendant: if the
  // descendant dies (default SIGTERM disposition), the child must STILL survive
  // until the parent escalates — otherwise an empty loop would exit the child
  // with code 0 and defeat the forced-cleanup scenario.
  const loopHold = setInterval(() => { /* intentional no-op loop holder */ }, 1000);
  await new Promise<void>(() => { /* block until the parent terminates the process group */ });
  clearInterval(loopHold);
  return 0;
}

/**
 * Internal only: full argv for running THIS harness directly under node with
 * the tsx loader (no npm/tsx wrapper). Selftest children are spawned this way
 * so signal semantics belong to the real harness process alone.
 */
function directSelftestSpawnArgs(scriptArgs: readonly string[]): { bin: string; args: string[] } {
  const repoRoot = process.cwd();
  const preflight = path.join(repoRoot, "node_modules", "tsx", "dist", "preflight.cjs");
  const loader = pathToFileURL(path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;
  return {
    bin: process.execPath,
    args: ["--require", preflight, "--import", loader, path.join(repoRoot, "scripts", "loop-delivery-04-mutation-harness.ts"), ...scriptArgs],
  };
}

/**
 * Spawn ONE child (tsx on this same file) inside its OWN POSIX process group
 * (detached => the child is the group leader). Collects stdout/stderr and
 * resolves on close. The bounded timeout escalates SIGTERM -> SIGKILL for the
 * whole group, so no descendant can outlive the bound.
 */
interface ChildSpawnResult {
  child: ChildProcess;
  done: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError: boolean;
    spawnErrorNote: string;
  }>;
  readStdout: () => string;
}

function spawnHarnessChild(
  tsxBin: string,
  args: readonly string[],
  opts: { cwd: string; env: Record<string, string>; timeoutMs: number; graceMs: number },
): ChildSpawnResult {
  const child = spawn(tsxBin, args as string[], {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError: boolean;
    spawnErrorNote: string;
  }>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child, "SIGTERM");
      const fallback = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) killProcessGroup(child, "SIGKILL");
      }, opts.graceMs);
      fallback.unref();
    }, opts.timeoutMs);
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr, timedOut: false, spawnError: true, spawnErrorNote: e.message });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, spawnError: false, spawnErrorNote: "" });
    });
  });
  return { child, done, readStdout: () => stdout };
}

/**
 * Start ONE internal worker (tsx on this same file) and await its structured
 * WORKER_RESULT. Fail-closed: spawn failure, signal termination, timeout, any
 * nonzero exit, or a structurally invalid result all yield ok=false. On EVERY
 * exit path the parent (1) terminates the worker's process group so no
 * descendant becomes an orphan, (2) performs parent-owned recursive removal of
 * the pre-registered worker root and re-verifies it with existsSync. The
 * worker's own cleanup claim is never trusted. `selftest` (internal only)
 * switches the child into a hidden authorized selftest mode.
 */
function spawnWorkerProcess(
  m: MutationDef,
  workerRoot: string,
  registryPath: string,
  repoRoot: string,
  expectedHead: string,
  parentBaselineSha: string,
  onSpawned?: (pid: number) => void,
  selftest?: { kind: string; token: string },
): Promise<WorkerOutcome> {
  return new Promise((resolve) => {
    const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
    const harnessPath = path.join(repoRoot, "scripts", "loop-delivery-04-mutation-harness.ts");
    const args = [
      harnessPath,
      "--internal-worker",
      `--mutation=${m.id}`,
      `--expected-head=${expectedHead}`,
      `--worker-root=${workerRoot}`,
    ];
    if (selftest !== undefined) {
      args.push(`--internal-selftest=${selftest.kind}`, `--selftest-token=${selftest.token}`);
    }
    const env: Record<string, string> = { ...(process.env as Record<string, string>), [REGISTRY_ENV]: registryPath };
    if (selftest !== undefined) env[SELFTEST_TOKEN_ENV] = selftest.token;
    let spawned: ChildSpawnResult;
    try {
      spawned = spawnHarnessChild(tsxBin, args, {
        cwd: repoRoot,
        env,
        timeoutMs: WORKER_TIMEOUT_MS,
        graceMs: WORKER_SIGNAL_GRACE_MS,
      });
    } catch (e) {
      resolve({ id: m.id, ok: false, note: `worker spawn failure: ${(e as Error).message}`, result: null, exitCode: null, signal: null, timedOut: false, spawnError: true });
      return;
    }
    const child = spawned.child;
    activeWorkerProcesses.add(child);
    if (child.pid !== undefined) {
      allWorkerPgids.push(child.pid);
      onSpawned?.(child.pid);
    }
    spawned.done.then((r) => {
      activeWorkerProcesses.delete(child);
      // Process-tree closure: any surviving group member is killed NOW, while
      // the group still exists (pid/pgid reuse is impossible while members
      // remain), and recorded for the end-of-run residual verification.
      if (killProcessGroup(child, "SIGKILL") && child.pid !== undefined) suspiciousPgids.push(child.pid);
      const finish = (outcome: WorkerOutcome): void => {
        const clean = parentCleanupWorkerRoot(workerRoot);
        resolve(
          clean.ok
            ? outcome
            : { id: m.id, ok: false, note: clean.note, result: null, exitCode: outcome.exitCode, signal: outcome.signal, timedOut: outcome.timedOut, spawnError: outcome.spawnError },
        );
      };
      const reject = (note: string): void => {
        finish({ id: m.id, ok: false, note, result: null, exitCode: r.code, signal: r.signal, timedOut: r.timedOut, spawnError: r.spawnError });
      };
      if (r.spawnError) { reject(`worker spawn failure: ${r.spawnErrorNote}`); return; }
      if (r.timedOut) { reject("worker timeout"); return; }
      if (r.code !== 0) {
        const note = r.signal !== null ? `worker terminated by signal (${r.signal})` : `worker exited nonzero (${r.code})`;
        reject(note);
        return;
      }
      const parsed = parseWorkerStdout(r.stdout);
      if (!parsed.ok) { reject(parsed.note); return; }
      const validated = validateWorkerResult(parsed.raw, m, m.id, workerRoot, parentBaselineSha);
      if (!validated.ok) { reject(validated.note); return; }
      if (!validated.result!.worker_root_cleanup_complete) { reject("worker root cleanup false"); return; }
      finish({ id: m.id, ok: true, note: "", result: validated.result, exitCode: r.code, signal: null, timedOut: false, spawnError: false });
    });
  });
}

interface SchedulerOutcome {
  summary: BoundedRun<WorkerOutcome>;
  outcomes: Map<string, WorkerOutcome>;
}

/**
 * Full-mode bounded scheduler: one internal worker per mutation A–N, at most
 * MAX_PARALLEL_MUTATIONS concurrent, each with its own pre-registered root.
 */
async function runFullScheduler(
  workerRoots: readonly string[],
  registryPath: string,
  repoRoot: string,
  expectedHead: string,
  parentBaselineSha: string,
): Promise<SchedulerOutcome> {
  const outcomes = new Map<string, WorkerOutcome>();
  const tasks: BoundedTask<WorkerOutcome>[] = MUTATIONS.map((m, i) => ({
    id: m.id,
    run: async () => {
      const outcome = await spawnWorkerProcess(m, workerRoots[i]!, registryPath, repoRoot, expectedHead, parentBaselineSha);
      outcomes.set(m.id, outcome);
      if (!outcome.ok) throw new Error(outcome.note || "worker failure");
      return outcome;
    },
  }));
  const summary = await runBoundedTasks(tasks, MAX_PARALLEL_MUTATIONS, () => stopping);
  return { summary, outcomes };
}

async function main(): Promise<MainOutcome> {
  const cli = parseCli(process.argv.slice(2));
  if (cli.error !== "") {
    console.error(`HARNESS_ERROR ${cli.error}`);
    return { code: 1, tempCleanupComplete: false };
  }
  if (cli.kind === "worker") {
    // Internal worker mode: execute exactly one mutation, emit one WORKER_RESULT.
    if (cli.selftestKind !== "") return { code: await runSelftestChild(cli), tempCleanupComplete: false };
    return { code: await runInternalWorker(cli), tempCleanupComplete: false };
  }
  const mode = cli.mode;

  const platform = process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    console.error(`HARNESS_ERROR unsupported platform: ${platform}`);
    return { code: 1, tempCleanupComplete: false };
  }

  // ── R1: parent-owned cleanup + controlled termination are installed BEFORE
  //    the self-tests so a SIGINT/SIGTERM during any phase (including the real
  //    subprocess self-tests) still kills every process group and cleans every
  //    registered root. ──
  let tmpRoot = "";
  let registryPath = "";
  let disposableRootCleaned = false;
  const removeAndVerify = (label: string, p: string, recursive: boolean): void => {
    try { fs.rmSync(p, { recursive, force: true }); } catch { /* existence check below */ }
    if (fs.existsSync(p)) cleanupFailures.push(`${label}:${p}`);
  };
  const cleanup = (): void => {
    removeAndVerify("disposable-root", tmpRoot, true);
    disposableRootCleaned = tmpRoot === "" || !fs.existsSync(tmpRoot);
    for (const s of registeredProbeSessions) removeAndVerify("probe-session", s, true);
    for (const r of registeredWorkerRoots) removeAndVerify("worker-root", r, true);
    if (registryPath !== "") removeAndVerify("registry", registryPath, false);
  };
  const onSignal = async (): Promise<void> => {
    // Controlled termination: stop scheduling, SIGTERM every active process
    // group, bounded grace, SIGKILL survivors, wait for close, then parent
    // cleanup, then residual-group verification, then exit 130.
    stopping = true;
    for (const child of [...activeWorkerProcesses]) killProcessGroup(child, "SIGTERM");
    const deadline = Date.now() + WORKER_SIGNAL_GRACE_MS;
    while (Date.now() < deadline && activeWorkerProcesses.size > 0) syncSleep(50);
    for (const child of [...activeWorkerProcesses]) {
      if (child.exitCode === null && child.signalCode === null) killProcessGroup(child, "SIGKILL");
    }
    const closeDeadline = Date.now() + WORKER_SIGNAL_GRACE_MS;
    while (Date.now() < closeDeadline && activeWorkerProcesses.size > 0) syncSleep(50);
    const residual = aliveGroups(allWorkerPgids, undefined, "signal-handler");
    if (!residual.ok) {
      console.error(`HARNESS_ERROR process scan failed after signal: ${residual.error}`);
    } else if (residual.alive.length > 0) {
      console.error(`HARNESS_ERROR residual worker processes after signal: ${residual.alive.join(",")}`);
    }
    cleanup();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

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
  const st = await runSelfTests();
  const r1SelftestLine =
    `parent_rejects_zero_test_exit_kill=${selfTestParentRejectsZeroTestExitKill()} ` +
    `parent_rejects_null_test_exit_kill=${selfTestParentRejectsNullTestExitKill()} ` +
    `parent_rejects_wrong_expected_evidence=${selfTestParentRejectsWrongExpectedEvidence()} ` +
    `parent_rejects_empty_first_failure=${selfTestParentRejectsEmptyFirstFailure()} ` +
    `parent_rejects_first_failure_without_expected_token=${selfTestParentRejectsFirstFailureWithoutToken()} ` +
    `parent_rejects_unchanged_mutated_sha=${selfTestParentRejectsUnchangedMutatedSha()} ` +
    `parent_rejects_restore_mismatch=${selfTestParentRejectsRestoreMismatch()} ` +
    `parent_rejects_missing_probe_assertion=${selfTestParentRejectsMissingProbeAssertion()} ` +
    `parent_rejects_extra_probe_assertion=${selfTestParentRejectsExtraProbeAssertion()} ` +
    `parent_rejects_false_probe_assertion=${selfTestParentRejectsFalseProbeAssertion()} ` +
    `parent_rejects_wrong_probe_assertion_type=${selfTestParentRejectsWrongProbeAssertionType()} ` +
    `parent_accepts_exact_G_assertion_set=${selfTestParentAcceptsExactGAssertionSet()} ` +
    `parent_accepts_exact_H_assertion_set=${selfTestParentAcceptsExactHAssertionSet()} ` +
    `parent_accepts_exact_L_assertion_set=${selfTestParentAcceptsExactLAssertionSet()} ` +
    `parent_first_failure_validation=${st.parent_first_failure_validation} ` +
    `structured_probe_assertions=${st.structured_probe_assertions} ` +
    `forged_worker_kill_rejected=${st.forged_worker_kill_rejected} ` +
    `graceful_worker_cleanup=${st.graceful_worker_cleanup} ` +
    `forced_worker_cleanup=${st.forced_worker_cleanup}`;
  console.log(
    `HARNESS_SELF_TEST baseline_failure_cleanup=${st.baseline_failure_cleanup} ` +
      `target_mismatch_restore_cleanup=${st.target_mismatch_restore_cleanup} ` +
      `evidence_mismatch_restore_cleanup=${st.evidence_mismatch_restore_cleanup} ` +
      `probe_environment_isolation=${st.probe_environment_isolation} ` +
      `probe_cleanup_gate=${st.probe_cleanup_gate} ` +
      `bounded_scheduler_peak_two=${st.bounded_scheduler_peak_two} ` +
      `worker_root_validation=${st.worker_root_validation} ` +
      `worker_kill_cannot_be_forged=${st.worker_kill_cannot_be_forged} ` +
      `worker_result_unknown_field_rejected=${st.worker_result_unknown_field_rejected} ` +
      `worker_result_malformed_rejected=${st.worker_result_malformed_rejected} ` +
      `worker_result_duplicate_rejected=${st.worker_result_duplicate_rejected} ` +
      `worker_result_missing_rejected=${st.worker_result_missing_rejected} ` +
      `worker_cleanup_failure_blocks_kill=${st.worker_cleanup_failure_blocks_kill} ` +
      `records_ordered_A_to_N=${st.records_ordered_A_to_N} ` +
      `worker_cli_fail_closed=${st.worker_cli_fail_closed} ` +
      `r2_ghl_suite_evidence_validation=${st.r2_ghl_suite_evidence_validation} ` +
      `r2_process_scan_fail_closed=${st.r2_process_scan_fail_closed} ` +
      `r3_linux_pgid_zero_compatibility=${st.r3_linux_pgid_zero_compatibility} ` +
      `r3_process_scan_fail_closed_retained=${st.r3_process_scan_fail_closed_retained} ` +
      r1SelftestLine,
  );
  if (
    !st.baseline_failure_cleanup || !st.target_mismatch_restore_cleanup ||
    !st.evidence_mismatch_restore_cleanup || !st.probe_environment_isolation ||
    !st.probe_cleanup_gate || !st.bounded_scheduler_peak_two ||
    !st.worker_root_validation || !st.worker_kill_cannot_be_forged ||
    !st.worker_result_unknown_field_rejected || !st.worker_result_malformed_rejected ||
    !st.worker_result_duplicate_rejected || !st.worker_result_missing_rejected ||
    !st.worker_cleanup_failure_blocks_kill || !st.records_ordered_A_to_N ||
    !st.worker_cli_fail_closed ||
    !st.parent_first_failure_validation || !st.structured_probe_assertions ||
    !st.forged_worker_kill_rejected || !st.graceful_worker_cleanup ||
    !st.forced_worker_cleanup ||
    !st.r2_ghl_suite_evidence_validation || !st.r2_process_scan_fail_closed ||
    !st.r3_linux_pgid_zero_compatibility || !st.r3_process_scan_fail_closed_retained
  ) {
    console.error("HARNESS_ERROR failure-path self-test failed — refusing to run baseline/mutations");
    return { code: 1, tempCleanupComplete: false };
  }

  // ── R2 aggregate markers (Correction R2; derived ONLY from the real
  //    validator / subprocess self-tests above, never hard-coded) ──
  const r2GhlEvidence = st.r2_ghl_suite_evidence_validation;
  const r2DescendantVerified = st.graceful_worker_cleanup && st.forced_worker_cleanup;
  const r2ScannerFailClosed = st.r2_process_scan_fail_closed;
  const r2All = r2GhlEvidence && r2DescendantVerified && r2ScannerFailClosed;
  const r2Markers: Record<string, boolean> = {
    D04_R2_GHL_SUITE_EVIDENCE_VALIDATION_VERIFIED: r2GhlEvidence,
    D04_R2_DESCENDANT_SPAWN_VERIFIED: r2DescendantVerified,
    D04_R2_DESCENDANT_PGID_VERIFIED: r2DescendantVerified,
    D04_R2_PROCESS_SCAN_FAILURE_FAILS_CLOSED: r2ScannerFailClosed,
    D04_R2_ALL_CORRECTION_SELFTESTS_PASS: r2All,
  };
  for (const [name, ok] of Object.entries(r2Markers)) console.log(`${name} ${ok}`);
  const r2AllTrue = Object.values(r2Markers).every(Boolean);

  // ── R3 aggregate markers (Correction R3; derived ONLY from the real
  //    fixture / subprocess self-tests above, never hard-coded) ──
  const r3PgidZero = st.r3_linux_pgid_zero_compatibility;
  const r3ScannerFailClosed = st.r3_process_scan_fail_closed_retained;
  const r3Subprocess = st.forged_worker_kill_rejected && st.graceful_worker_cleanup && st.forced_worker_cleanup;
  const r3All = r3PgidZero && r3ScannerFailClosed && r3Subprocess;
  const r3Markers: Record<string, boolean> = {
    D04_R3_LINUX_PGID_ZERO_COMPATIBILITY_VERIFIED: r3PgidZero,
    D04_R3_PROCESS_SCAN_FAIL_CLOSED_RETAINED: r3ScannerFailClosed,
    D04_R3_REAL_SUBPROCESS_TESTS_PASS: r3Subprocess,
    D04_R3_ALL_CORRECTION_CHECKS_PASS: r3All,
  };
  for (const [name, ok] of Object.entries(r3Markers)) console.log(`${name} ${ok}`);
  const r3AllTrue = Object.values(r3Markers).every(Boolean);

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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "l04-mut-"));
  const disp = path.join(tmpRoot, "work");
  fs.mkdirSync(disp, { recursive: true });

  // Containment sanity: disposable copy must not be inside the repo root.
  const relDisp = path.relative(repoRoot, disp);
  if (!relDisp.startsWith("..") && !path.isAbsolute(relDisp)) {
    console.error("HARNESS_ERROR disposable copy is inside repo root");
    cleanup();
    return { code: 1, tempCleanupComplete: !fs.existsSync(tmpRoot) && cleanupFailures.length === 0 };
  }

  const records: MutationRecord[] = [];
  let baselineOk = false;
  let baselinePassed: number | null = null;
  let baselineFailed: number | null = null;
  let baselineExit: number | null = null;
  let baselineDurationMs = 0;
  let sessionCode = 0;
  let noResidualChildProcess = true;
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

    if (mode === "quick") {
      // ── Quick mode (unchanged contract): serial G/H/L probes only, no
      //    baseline, no scheduler, no full metrics. ──
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
            // ── first_failure (quick mode never selects these; kept fail-closed) ──
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
            // ── dedicated_probe (G/H/L) — probe only in quick mode ──
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
            const probeResult = runProbe(m, disp, repoRoot, tmpRoot);
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
                rec.probeAssertions = cmp.assertions ?? "not_applicable";
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
    } else {
      // ── Full mode: bounded parallel scheduler over all 14 mutations ──
      const expectedHead = headBefore; // fixed authorized Source SHA for every worker
      const parentBaselineSha = sha256Buf(fs.readFileSync(dispProd));

      // Register 14 distinct worker roots (system temp, outside the repo)
      // BEFORE any worker starts; the parent is the cleanup authority.
      const workerRoots: string[] = [];
      for (const m of MUTATIONS) {
        workerRoots.push(fs.mkdtempSync(path.join(os.tmpdir(), WORKER_ROOT_PREFIX + m.id + "-")));
      }
      registeredWorkerRoots.push(...workerRoots);
      const gitCommonDir = gitCommonDirAt(repoRoot);
      const rootCheck = validateWorkerRoots(workerRoots, repoRoot, gitCommonDir);
      if (!rootCheck.ok) {
        console.error(`HARNESS_ERROR worker root validation failed: ${rootCheck.error}`);
        sessionCode = 1;
        throw new Error("WORKER_ROOT_INVALID");
      }
      registryPath = path.join(os.tmpdir(), `l04-worker-registry-${process.pid}.json`);
      try {
        fs.writeFileSync(registryPath, JSON.stringify({ expectedHead, repoRoot, gitCommonDir, roots: workerRoots }), "utf8");
      } catch (e) {
        console.error(`HARNESS_ERROR cannot write worker registry: ${(e as Error).message}`);
        sessionCode = 1;
        throw new Error("REGISTRY_WRITE_FAILED");
      }

      const scheduler = await runFullScheduler(workerRoots, registryPath, repoRoot, expectedHead, parentBaselineSha);
      const summary = scheduler.summary;
      console.log(`MUTATION_SCHEDULER mode=bounded_parallel configured_limit=${MAX_PARALLEL_MUTATIONS}`);
      console.log(`MUTATION_SCHEDULER_SUMMARY scheduled=${summary.scheduled} completed=${summary.completed} peak_concurrency=${summary.peakConcurrency}`);

      const merged = mergeWorkerOutcomes([...scheduler.outcomes.values()], MUTATIONS, parentBaselineSha);
      if (merged.error !== "" || summary.failedIds.length > 0) {
        const note = merged.error !== "" ? merged.error : `worker failure: ${summary.failNote}`;
        console.error(`HARNESS_ERROR scheduler failure: ${note}`);
        sessionCode = 1;
        throw new Error("SCHEDULER_FAILED");
      }
      records.push(...merged.records);
      // Official records are emitted in the fixed A–N order, never in async
      // completion order.
      for (const rec of records) emitRecord(rec);

      // Probe summary from official records (identical semantics to the serial loop).
      for (const rec of records) {
        if (rec.evidenceMode !== "dedicated_probe") continue;
        probeSummary.total++;
        const passed = rec.status === "killed";
        probeSummary.perId.set(rec.id, passed);
        if (passed) probeSummary.passed++;
        else probeSummary.failed++;
        if (rec.probeFileCleanupComplete === "true" && rec.probeSessionCleanupComplete === "true") probeSummary.cleaned++;
        if (rec.probeEnvironmentIsolated === "true") probeSummary.isolated++;
      }

      // Worker-reported probe session/file paths must all be gone.
      for (const o of scheduler.outcomes.values()) {
        if (!o.ok || o.result === null) continue;
        if (o.result.probe_session_root !== "") {
          allWorkerProbeSessionPaths.push(o.result.probe_session_root);
          if (fs.existsSync(o.result.probe_session_root)) {
            console.error(`HARNESS_ERROR leftover probe session: ${o.result.probe_session_root}`);
            sessionCode = 1;
          }
        }
        if (o.result.probe_file_path !== "") {
          allWorkerProbeFilePaths.push(o.result.probe_file_path);
          if (fs.existsSync(o.result.probe_file_path)) {
            console.error(`HARNESS_ERROR leftover probe file: ${o.result.probe_file_path}`);
            sessionCode = 1;
          }
        }
      }

      // Registered worker roots must all be gone (worker self-cleanup verified).
      const leakedRoots = registeredWorkerRoots.filter((r) => fs.existsSync(r));
      if (leakedRoots.length > 0) {
        console.error(`HARNESS_ERROR leftover worker roots: ${leakedRoots.join(",")}`);
        sessionCode = 1;
      }

      // R1/R2: process groups that still had members when a worker closed must
      // be empty again now — any surviving member means an orphaned
      // descendant. A FAILED residual scan is never read as "clean": it forces
      // harness_error while cleanup of every registered root still runs below.
      const residualGroups = aliveGroups(suspiciousPgids, undefined, "full-run-residual");
      if (!residualGroups.ok) {
        console.error(`HARNESS_ERROR process scan failed for residual worker check: ${residualGroups.error}`);
        sessionCode = 1;
        noResidualChildProcess = false;
      } else if (residualGroups.alive.length > 0) {
        console.error(`HARNESS_ERROR residual worker processes: ${residualGroups.alive.join(",")}`);
        sessionCode = 1;
        noResidualChildProcess = false;
      } else {
        noResidualChildProcess = true;
      }

      if (sessionCode !== 0) throw new Error("SCHEDULER_FAILED");

      // Real scheduler metrics (never hard-coded; from actual execution).
      console.log(`BASELINE_DURATION_MS ${baselineDurationMs}`);
      console.log(`MUTATION_WALL_DURATION_MS ${summary.wallMs}`);
      console.log(`MUTATION_SUM_TEST_DURATION_MS ${merged.sumTestDurationMs}`);
      console.log(`MUTATION_SUM_ARCHIVE_EXTRACT_DURATION_MS ${merged.sumArchiveExtractMs}`);
      console.log(`MUTATION_SUM_CLEANUP_DURATION_MS ${merged.sumCleanupMs}`);
    }
  } catch (e) {
    // Controlled session failure (archive/tar/baseline/scheduler). cleanup
    // still runs in the finally below; the code is propagated via sessionCode.
    if (sessionCode === 0) sessionCode = 1;
    const msg = (e as Error).message;
    if (msg !== "ARCHIVE_FAILED" && msg !== "TAR_FAILED" && msg !== "BASELINE_FAILED" &&
        msg !== "WORKER_ROOT_INVALID" && msg !== "REGISTRY_WRITE_FAILED" && msg !== "SCHEDULER_FAILED") {
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
  // files deleted, (4) all registered worker roots deleted, (5) all
  // worker-reported probe session/file paths deleted, (6) registry file
  // deleted, (7) zero parent-owned cleanup failures (R1).
  const allSessionsCleaned = registeredProbeSessions.every((s) => !fs.existsSync(s));
  const allFilesCleaned = registeredProbeFiles.every((f) => !fs.existsSync(f));
  const allWorkerRootsCleaned = registeredWorkerRoots.every((r) => !fs.existsSync(r));
  const allWorkerProbeSessionsCleaned = allWorkerProbeSessionPaths.every((p) => !fs.existsSync(p));
  const allWorkerProbeFilesCleaned = allWorkerProbeFilePaths.every((f) => !fs.existsSync(f));
  const registryCleaned = registryPath === "" || !fs.existsSync(registryPath);
  const tempCleanupComplete =
    disposableRootCleaned && allSessionsCleaned && allFilesCleaned &&
    allWorkerRootsCleaned && allWorkerProbeSessionsCleaned && allWorkerProbeFilesCleaned &&
    registryCleaned && cleanupFailures.length === 0;

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
      tempCleanupComplete &&
      st.parent_first_failure_validation &&
      st.structured_probe_assertions &&
      st.forged_worker_kill_rejected &&
      st.graceful_worker_cleanup &&
      st.forced_worker_cleanup &&
      r2AllTrue &&
      r3AllTrue;

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

  // ── R1 aggregate markers (derived from real self-test / full-run state;
  //    never hard-coded) ──
  const r1Markers: Record<string, boolean> = {
    D04_R1_PARENT_FIRST_FAILURE_VALIDATION_VERIFIED: st.parent_first_failure_validation,
    D04_R1_STRUCTURED_PROBE_ASSERTIONS_VERIFIED: st.structured_probe_assertions,
    D04_R1_FORGED_WORKER_KILL_REJECTED: st.forged_worker_kill_rejected,
    D04_R1_GRACEFUL_WORKER_CLEANUP_VERIFIED: st.graceful_worker_cleanup,
    D04_R1_FORCED_WORKER_CLEANUP_VERIFIED: st.forced_worker_cleanup,
    D04_R1_PROCESS_TREE_TERMINATION_VERIFIED: st.graceful_worker_cleanup && st.forced_worker_cleanup,
    D04_R1_ALL_WORKER_ROOTS_CLEANED: allWorkerRootsCleaned,
    D04_R1_ALL_PROBE_RESOURCES_CLEANED: allWorkerProbeSessionsCleaned && allWorkerProbeFilesCleaned,
  };
  for (const [name, ok] of Object.entries(r1Markers)) console.log(`${name} ${ok}`);
  const r1AllTrue = Object.values(r1Markers).every(Boolean);

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
    r1AllTrue &&
    r2AllTrue &&
    r3AllTrue &&
    noResidualChildProcess &&
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
