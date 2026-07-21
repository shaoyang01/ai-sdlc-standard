// Hermes Phase 2 Code Review Canary — POSIX Process Runner (Round 3)
// ====================================================================
// Single, awaitable termination state machine. Process-group cleanup with signal 0.
// Bounded exit/close observation after any termination trigger; runner never hangs.
// Timeout and observation use truly cancelable timers (real setTimeout/clearTimeout
// in production); no real timer survives runner return.
// Synchronous stdin on/write/end failures are contained into the single
// terminationPromise and bounded cleanup; the runner never rejects on them.
// nonzero_exit decision for non-zero exits with confirmed cleanup.
// Restricted dependency injection for deterministic tests; production defaults
// are the real Node implementations. Dependencies never come from request,
// payload, approval, or environment variables.
// Darwin/linux only.

import { spawn } from "node:child_process";
import { realpathSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";

export type HermesPhase2CanaryRunnerDecision =
  | "process_group_cleanup_failed"
  | "temporary_cleanup_failed"
  | "exit_not_observed"
  | "close_not_observed"
  | "stdin_error"
  | "stdout_overflow"
  | "stderr_overflow"
  | "timed_out"
  | "nonzero_exit"
  | "spawn_failed"
  | "executed"
  | "unsupported_platform"
  | "executable_not_allowed"
  | "invalid_executable_path"
  | "args_validation_failed"
  | "credential_name_invalid"
  | "build_error"
  | "missing_credential_value";

export type HermesPhase2CanaryRunnerResult = Readonly<{
  decision: HermesPhase2CanaryRunnerDecision;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutOverflow: boolean;
  stderrOverflow: boolean;
  termSent: boolean;
  killSent: boolean;
  exitObserved: boolean;
  closeObserved: boolean;
  processGroupCleanupConfirmed: boolean;
  temporaryCleanupConfirmed: boolean;
}>;

/** Minimal structural view of a spawned child; satisfied by node:child_process.ChildProcess. */
export type HermesPhase2CanarySpawnedChild = {
  readonly pid?: number;
  readonly stdout: { on(event: string, listener: (chunk: Buffer) => void): unknown } | null;
  readonly stderr: { on(event: string, listener: (chunk: Buffer) => void): unknown } | null;
  readonly stdin: {
    write(data: string, encoding: string, callback: (err?: Error | null) => void): unknown;
    end(): unknown;
    on(event: string, listener: (...args: never[]) => void): unknown;
  } | null;
  kill(signal?: string): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
};

/** Restricted test-only dependencies. Production defaults are the real Node implementations. */
export type HermesPhase2CanaryRunnerDeps = Readonly<{
  spawnFn?: (
    command: string,
    args: string[],
    options: { cwd: string; env: Record<string, string> },
  ) => HermesPhase2CanarySpawnedChild;
  signalGroupFn?: (pid: number, sig: NodeJS.Signals) => "ok" | "esrch" | "error";
  signal0CheckFn?: (pid: number) => "gone" | "exists" | "error";
  delayFn?: (ms: number) => Promise<void>;
  setTimerFn?: (callback: () => void, milliseconds: number) => unknown;
  clearTimerFn?: (handle: unknown) => void;
  cleanupTempFn?: (dir: string) => boolean;
  nowFn?: () => number;
}>;

export type HermesPhase2CanaryProcessRunnerConfig = Readonly<{
  executablePath: string;
  allowedExecutablePaths: ReadonlyArray<string>;
  args: ReadonlyArray<string>;
  serializedPayload?: string;
  timeoutMs?: number;
  termGraceMs?: number;
  observationMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  credentialEnvNames?: ReadonlyArray<string>;
  sourceEnv?: Readonly<Record<string, string>>;
  deps?: HermesPhase2CanaryRunnerDeps;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TERM_GRACE_MS = 2_000;
const DEFAULT_OBSERVATION_MS = 1_000;
const MAX_OBSERVATION_MS = 5_000;
const POST_KILL_CONFIRM_MS = 200;
const MAX_STDOUT_BYTES = 16_384;
const MAX_STDERR_BYTES = 16_384;
const MAX_ARGS = 16;
const MAX_ARG_LEN = 256;
const MAX_ARG_TOTAL = 4_096;
const MAX_CREDENTIAL_NAMES = 8;
const CREDENTIAL_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

const RESERVED_ENV = new Set([
  "HOME", "TMPDIR", "PATH", "NODE_OPTIONS", "LD_PRELOAD",
  "DYLD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_FRAMEWORK_PATH",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "LANG", "LC_ALL", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME",
  "HISTFILE", "NO_COLOR",
]);

// ── default (production) dependency implementations ──

function defaultSpawnFn(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
): HermesPhase2CanarySpawnedChild {
  return spawn(command, args, {
    shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd, env: options.env,
  }) as unknown as HermesPhase2CanarySpawnedChild;
}

function defaultDelayFn(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function defaultSetTimerFn(callback: () => void, milliseconds: number): unknown {
  return setTimeout(callback, milliseconds);
}

function defaultClearTimerFn(handle: unknown): void {
  clearTimeout(handle as NodeJS.Timeout);
}

function cleanUpDir(dir: string): boolean {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    return !existsSync(dir);
  } catch { return false; }
}

function signalGroup(pid: number, sig: NodeJS.Signals): "ok" | "esrch" | "error" {
  try {
    process.kill(-pid, sig);
    return "ok";
  } catch (e: any) {
    if (e.code === "ESRCH") return "esrch";
    return "error";
  }
}

function signal0Check(pid: number): "gone" | "exists" | "error" {
  try {
    process.kill(-pid, 0);
    return "exists";
  } catch (e: any) {
    if (e.code === "ESRCH") return "gone";
    return "error";
  }
}

function formatResult(
  decision: HermesPhase2CanaryRunnerDecision,
  o: Partial<HermesPhase2CanaryRunnerResult> = {},
): HermesPhase2CanaryRunnerResult {
  return {
    decision,
    exitCode: o.exitCode ?? null,
    signal: o.signal ?? null,
    timedOut: o.timedOut ?? false,
    durationMs: o.durationMs ?? 0,
    stdoutBytes: o.stdoutBytes ?? 0,
    stderrBytes: o.stderrBytes ?? 0,
    stdoutOverflow: o.stdoutOverflow ?? false,
    stderrOverflow: o.stderrOverflow ?? false,
    termSent: o.termSent ?? false,
    killSent: o.killSent ?? false,
    exitObserved: o.exitObserved ?? false,
    closeObserved: o.closeObserved ?? false,
    processGroupCleanupConfirmed: o.processGroupCleanupConfirmed ?? false,
    temporaryCleanupConfirmed: o.temporaryCleanupConfirmed ?? false,
  };
}

// ── main ──

export async function runHermesPhase2CanaryProcess(
  config: HermesPhase2CanaryProcessRunnerConfig,
): Promise<HermesPhase2CanaryRunnerResult> {
  if (process.platform !== "linux" && process.platform !== "darwin") {
    return formatResult("unsupported_platform");
  }

  const {
    executablePath, allowedExecutablePaths, args,
    serializedPayload, timeoutMs = DEFAULT_TIMEOUT_MS,
    termGraceMs = DEFAULT_TERM_GRACE_MS,
    observationMs = DEFAULT_OBSERVATION_MS,
    maxStdoutBytes = MAX_STDOUT_BYTES, maxStderrBytes = MAX_STDERR_BYTES,
    credentialEnvNames = [], sourceEnv = {},
    deps = {},
  } = config;

  const spawnFn = deps.spawnFn ?? defaultSpawnFn;
  const signalGroupFn = deps.signalGroupFn ?? signalGroup;
  const signal0CheckFn = deps.signal0CheckFn ?? signal0Check;
  const delayFn = deps.delayFn ?? defaultDelayFn;
  const setTimerFn = deps.setTimerFn ?? defaultSetTimerFn;
  const clearTimerFn = deps.clearTimerFn ?? defaultClearTimerFn;
  const cleanupTempFn = deps.cleanupTempFn ?? cleanUpDir;
  const nowFn = deps.nowFn ?? (() => Date.now());

  // Config validation
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) return formatResult("build_error");
  if (typeof termGraceMs !== "number" || !Number.isFinite(termGraceMs) || !Number.isInteger(termGraceMs) || termGraceMs < 100 || termGraceMs > 5_000) return formatResult("build_error");
  if (typeof observationMs !== "number" || !Number.isFinite(observationMs) || !Number.isInteger(observationMs) || observationMs < 1 || observationMs > MAX_OBSERVATION_MS) return formatResult("build_error");
  if (typeof maxStdoutBytes !== "number" || !Number.isFinite(maxStdoutBytes) || !Number.isInteger(maxStdoutBytes) || maxStdoutBytes < 1 || maxStdoutBytes > 16_384) return formatResult("build_error");
  if (typeof maxStderrBytes !== "number" || !Number.isFinite(maxStderrBytes) || !Number.isInteger(maxStderrBytes) || maxStderrBytes < 1 || maxStderrBytes > 16_384) return formatResult("build_error");
  if (!Array.isArray(args) || args.length > MAX_ARGS) return formatResult("args_validation_failed");
  let argTotal = 0;
  for (const a of args) {
    if (typeof a !== "string" || a.length === 0 || a.trim().length === 0) return formatResult("args_validation_failed");
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\t\n\r]/.test(a)) return formatResult("args_validation_failed");
    const len = Buffer.byteLength(a, "utf8");
    if (len > MAX_ARG_LEN) return formatResult("args_validation_failed");
    argTotal += len;
    if (argTotal > MAX_ARG_TOTAL) return formatResult("args_validation_failed");
  }
  if (!Array.isArray(allowedExecutablePaths) || allowedExecutablePaths.length === 0) return formatResult("build_error");
  if (typeof executablePath !== "string" || executablePath.length === 0 || pathResolve(executablePath) !== executablePath) return formatResult("invalid_executable_path");
  let canonicalExec: string;
  try { canonicalExec = realpathSync(executablePath); } catch { return formatResult("executable_not_allowed"); }
  const normalizedAllowed: string[] = [];
  for (const p of allowedExecutablePaths) {
    try { normalizedAllowed.push(realpathSync(p)); } catch { return formatResult("executable_not_allowed"); }
  }
  if (!normalizedAllowed.includes(canonicalExec)) return formatResult("executable_not_allowed");
  if (credentialEnvNames.length > MAX_CREDENTIAL_NAMES) return formatResult("credential_name_invalid");
  const seenCreds = new Set<string>();
  for (const n of credentialEnvNames) {
    if (!CREDENTIAL_RE.test(n)) return formatResult("credential_name_invalid");
    if (RESERVED_ENV.has(n)) return formatResult("credential_name_invalid");
    if (seenCreds.has(n)) return formatResult("credential_name_invalid");
    seenCreds.add(n);
    if (typeof sourceEnv[n] !== "string" || sourceEnv[n].length === 0) return formatResult("missing_credential_value");
  }

  // Temp root (real filesystem; only removal is injectable)
  let tempRoot: string;
  try {
    tempRoot = join(tmpdir(), `hermes-canary-${randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(join(tempRoot, "work"));
    mkdirSync(join(tempRoot, "home"));
    mkdirSync(join(tempRoot, "tmp"));
    mkdirSync(join(tempRoot, "cache"));
    mkdirSync(join(tempRoot, "config"));
    mkdirSync(join(tempRoot, "state"));
  } catch {
    try { rmSync(tempRoot, { recursive: true, force: true }); } catch {}
    return existsSync(tempRoot) ? formatResult("temporary_cleanup_failed") : formatResult("build_error");
  }

  const workDir = join(tempRoot, "work");
  const childEnv: Record<string, string> = {
    HOME: join(tempRoot, "home"), TMPDIR: join(tempRoot, "tmp"),
    XDG_CACHE_HOME: join(tempRoot, "cache"), XDG_CONFIG_HOME: join(tempRoot, "config"),
    XDG_STATE_HOME: join(tempRoot, "state"), HISTFILE: "/dev/null", NO_COLOR: "1",
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
  };
  for (const n of credentialEnvNames) childEnv[n] = sourceEnv[n];

  // Spawn
  let child: HermesPhase2CanarySpawnedChild;
  try {
    child = spawnFn(canonicalExec, args as string[], { cwd: workDir, env: childEnv });
  } catch {
    cleanupTempFn(tempRoot);
    return formatResult("spawn_failed");
  }

  const pid = child.pid;
  if (pid === undefined) {
    try { child.kill("SIGKILL"); } catch {}
    cleanupTempFn(tempRoot);
    return formatResult("spawn_failed");
  }

  // ── shared state ──
  const startMs = nowFn();
  let timedOut = false, termSent = false, killSent = false;
  let exitObserved = false, closeObserved = false, childError = false;
  let exitCode: number | null = null, signal: string | null = null;
  let stdoutBytes = 0, stderrBytes = 0;
  let stdoutOverflow = false, stderrOverflow = false, stdinError = false;

  // Truly cancelable timer built on the (possibly injected) setTimerFn/clearTimerFn.
  // cancel() clears the underlying production timer handle, so no real timer
  // survives runner return. Firing or cancelling removes the timer from the
  // internal pending state; cancel is idempotent.
  function startTimer(ms: number, onFire: () => void): { cancel: () => void } {
    let pending = true;
    const handle = setTimerFn(() => {
      if (!pending) return;
      pending = false;
      onFire();
    }, ms);
    return {
      cancel: () => {
        if (!pending) return;
        pending = false;
        clearTimerFn(handle);
      },
    };
  }

  // ── event hub ──
  let notify: () => void = () => {};
  let eventPromise: Promise<void> = new Promise<void>((r) => { notify = r; });
  function resetEvent(): void {
    eventPromise = new Promise<void>((r) => { notify = r; });
  }

  // ── single termination state machine (exactly one terminationPromise) ──
  type TermOutcome = { termSent: boolean; killSent: boolean; confirmed: boolean };
  let terminationPromise: Promise<TermOutcome> | null = null;
  let terminationDone = false;

  function ensureTermination(): Promise<TermOutcome> {
    if (terminationPromise !== null) return terminationPromise;
    terminationPromise = (async (): Promise<TermOutcome> => {
      const sendTerm = signalGroupFn(pid, "SIGTERM");
      const termOk = sendTerm !== "error";
      if (sendTerm === "esrch") return { termSent: termOk, killSent: false, confirmed: true };
      if (sendTerm === "error") return { termSent: false, killSent: false, confirmed: false };
      await delayFn(termGraceMs);
      if (signal0CheckFn(pid) === "gone") return { termSent: termOk, killSent: false, confirmed: true };
      const killOk = signalGroupFn(pid, "SIGKILL") !== "error";
      await delayFn(POST_KILL_CONFIRM_MS);
      return { termSent: termOk, killSent: killOk, confirmed: signal0CheckFn(pid) === "gone" };
    })();
    terminationPromise.then((o) => {
      termSent = o.termSent;
      killSent = o.killSent;
      terminationDone = true;
      notify();
    });
    return terminationPromise;
  }

  // Idempotent stdin failure path: every stdin failure source (synchronous
  // throw from on/write/end, write callback error, or error event) converges
  // on the single terminationPromise. The runner never rejects on stdin errors.
  function noteStdinFailure(): void {
    stdinError = true;
    ensureTermination();
  }

  // timeout trigger (real cancelable timer; created at most once, after spawn)
  const timeoutTimer = startTimer(timeoutMs, () => {
    timedOut = true;
    ensureTermination();
  });

  // stdout/stderr overflow triggers
  child.stdout?.on("data", (c: Buffer) => {
    stdoutBytes += c.byteLength;
    if (stdoutBytes > maxStdoutBytes) { stdoutOverflow = true; ensureTermination(); }
  });
  child.stderr?.on("data", (c: Buffer) => {
    stderrBytes += c.byteLength;
    if (stderrBytes > maxStderrBytes) { stderrOverflow = true; ensureTermination(); }
  });

  // stdin (each operation individually guarded against synchronous throws)
  if (child.stdin) {
    const stdin = child.stdin;
    let listenerOk = true;
    try {
      stdin.on("error", () => { noteStdinFailure(); });
    } catch {
      listenerOk = false;
      noteStdinFailure();
    }
    if (listenerOk) {
      if (serializedPayload !== undefined) {
        // The payload is written at most once; no retry on any failure.
        try {
          stdin.write(serializedPayload, "utf8", (err) => {
            if (err) noteStdinFailure();
            try { stdin.end(); } catch { noteStdinFailure(); }
          });
        } catch {
          noteStdinFailure();
        }
      } else {
        try { stdin.end(); } catch { noteStdinFailure(); }
      }
    }
  } else if (serializedPayload !== undefined) {
    noteStdinFailure();
  }

  // child lifecycle events
  child.on("exit", (code: number | null, sig: string | null) => {
    exitObserved = true; exitCode = code; signal = sig; notify();
  });
  child.on("close", () => { closeObserved = true; notify(); });
  child.on("error", () => { childError = true; notify(); });

  // ── phase 1: wait for close/error or completed termination ──
  while (!closeObserved && !childError && !terminationDone) {
    await eventPromise;
    resetEvent();
  }
  timeoutTimer.cancel();

  // Await the unique terminationPromise before returning (if any trigger started it).
  let termOutcome: TermOutcome | null = null;
  if (terminationPromise !== null) {
    termOutcome = await terminationPromise;
  }

  // ── phase 2: bounded exit/close observation after termination ──
  if (!closeObserved && !childError) {
    let obsFired = false;
    let obsResolve!: () => void;
    const obsPromise = new Promise<void>((r) => { obsResolve = r; });
    const obsTimer = startTimer(observationMs, () => { obsFired = true; obsResolve(); });
    while (!closeObserved && !childError && !obsFired) {
      await Promise.race([obsPromise, eventPromise]);
      resetEvent();
    }
    obsTimer.cancel();
  }

  // ── process group cleanup confirmation (incl. descendant termination) ──
  const cleanPath = !childError && !timedOut && !stdoutOverflow && !stderrOverflow && !stdinError;
  let groupConfirmed = termOutcome !== null ? termOutcome.confirmed : false;
  if (!groupConfirmed) {
    const check = signal0CheckFn(pid);
    if (check === "gone") {
      groupConfirmed = true;
    } else if (check === "exists" && cleanPath && termOutcome === null) {
      // Parent exited but descendants remain in the process group: terminate once.
      termOutcome = await ensureTermination();
      groupConfirmed = termOutcome.confirmed;
    }
    // "exists" after an earlier termination, or "error": stays unconfirmed.
  }

  // ── temporary cleanup ──
  const tempOk = cleanupTempFn(tempRoot);
  const durationMs = nowFn() - startMs;

  // ── decision precedence ──
  let decision: HermesPhase2CanaryRunnerDecision;
  if (!groupConfirmed) decision = "process_group_cleanup_failed";
  else if (!tempOk) decision = "temporary_cleanup_failed";
  else if (!exitObserved) decision = "exit_not_observed";
  else if (!closeObserved) decision = "close_not_observed";
  else if (stdinError) decision = "stdin_error";
  else if (stdoutOverflow) decision = "stdout_overflow";
  else if (stderrOverflow) decision = "stderr_overflow";
  else if (timedOut) decision = "timed_out";
  else if (exitCode !== 0) decision = "nonzero_exit";
  else if (childError) decision = "spawn_failed";
  else decision = "executed";

  return formatResult(decision, {
    exitCode, signal, timedOut, durationMs,
    stdoutBytes, stderrBytes, stdoutOverflow, stderrOverflow,
    termSent, killSent, exitObserved, closeObserved,
    processGroupCleanupConfirmed: groupConfirmed,
    temporaryCleanupConfirmed: tempOk,
  });
}
