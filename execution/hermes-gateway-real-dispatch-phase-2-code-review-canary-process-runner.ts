// Hermes Phase 2 Code Review Canary — POSIX Process Runner (Round 2)
// ====================================================================
// Single, awaitable termination state machine. Process-group cleanup with signal 0.
// Decision precedence with cleanup failures overriding.
// Darwin/linux only.

import { spawn, type ChildProcess } from "node:child_process";
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

export type HermesPhase2CanaryProcessRunnerConfig = Readonly<{
  executablePath: string;
  allowedExecutablePaths: ReadonlyArray<string>;
  args: ReadonlyArray<string>;
  serializedPayload?: string;
  timeoutMs?: number;
  termGraceMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  credentialEnvNames?: ReadonlyArray<string>;
  sourceEnv?: Readonly<Record<string, string>>;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TERM_GRACE_MS = 2_000;
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

// ── helpers ──

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
    maxStdoutBytes = MAX_STDOUT_BYTES, maxStderrBytes = MAX_STDERR_BYTES,
    credentialEnvNames = [], sourceEnv = {},
  } = config;

  // Config validation
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) return formatResult("build_error");
  if (typeof termGraceMs !== "number" || !Number.isFinite(termGraceMs) || !Number.isInteger(termGraceMs) || termGraceMs < 100 || termGraceMs > 5_000) return formatResult("build_error");
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

  // Temp root
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
  let child: ChildProcess;
  try {
    child = spawn(canonicalExec, args as string[], {
      shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"],
      cwd: workDir, env: childEnv,
    });
  } catch {
    cleanUpDir(tempRoot);
    return formatResult("spawn_failed");
  }

  const pid = child.pid;
  if (pid === undefined) {
    try { child.kill("SIGKILL"); } catch {}
    cleanUpDir(tempRoot);
    return formatResult("spawn_failed");
  }

  // ── shared state ──
  const startMs = Date.now();
  let timedOut = false, termSent = false, killSent = false;
  let exitObserved = false, closeObserved = false;
  let exitCode: number | null = null, signal: string | null = null;
  let stdoutBytes = 0, stderrBytes = 0;
  let stdoutOverflow = false, stderrOverflow = false, stdinError = false;

  // ── single termination state machine ──
  let terminationPromise: Promise<{ termSent: boolean; killSent: boolean; confirmed: boolean }> | null = null;

  function ensureTermination(): typeof terminationPromise {
    if (terminationPromise !== null) return terminationPromise;
    terminationPromise = new Promise((resolve) => {
      const sendTerm = signalGroup(pid, "SIGTERM");
      termSent = sendTerm !== "error";
      if (sendTerm === "esrch") {
        resolve({ termSent, killSent: false, confirmed: true });
        return;
      }
      if (sendTerm === "error") {
        resolve({ termSent, killSent: false, confirmed: false });
        return;
      }
      setTimeout(() => {
        const check = signal0Check(pid);
        if (check === "gone") { resolve({ termSent, killSent: false, confirmed: true }); return; }
        killSent = signalGroup(pid, "SIGKILL") !== "error";
        setTimeout(() => {
          const final = signal0Check(pid);
          resolve({ termSent, killSent, confirmed: final === "gone" });
        }, POST_KILL_CONFIRM_MS);
      }, termGraceMs);
    });
    return terminationPromise;
  }

  // timeout
  const timer = setTimeout(() => {
    timedOut = true;
    ensureTermination();
  }, timeoutMs);

  // stdout/stderr
  child.stdout?.on("data", (c: Buffer) => {
    stdoutBytes += c.byteLength;
    if (stdoutBytes > maxStdoutBytes) { stdoutOverflow = true; ensureTermination(); }
  });
  child.stderr?.on("data", (c: Buffer) => {
    stderrBytes += c.byteLength;
    if (stderrBytes > maxStderrBytes) { stderrOverflow = true; ensureTermination(); }
  });

  // stdin
  if (child.stdin) {
    if (serializedPayload !== undefined) {
      child.stdin.write(serializedPayload, "utf8", (err) => {
        if (err) { stdinError = true; ensureTermination(); }
        child.stdin?.end();
      });
      child.stdin.on("error", () => { stdinError = true; ensureTermination(); });
    } else {
      child.stdin.end();
      child.stdin.on("error", () => { stdinError = true; ensureTermination(); });
    }
  } else if (serializedPayload !== undefined) {
    stdinError = true;
    ensureTermination();
  }

  // ── wait for close with bounded observation ──
  const result = await new Promise<HermesPhase2CanaryRunnerResult>((resolve) => {
    let settled = false;
    const settle = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // Await termination if started
      const term = terminationPromise !== null ? await terminationPromise : null;
      if (term) { termSent = term.termSent; killSent = term.killSent; }

      // Check descendants after normal close
      if (!timedOut && !stdoutOverflow && !stderrOverflow && !stdinError) {
        const descCheck = signal0Check(pid);
        if (descCheck === "exists") {
          const descTerm = await ensureTermination();
          if (!descTerm?.confirmed) {
            cleanUpDir(tempRoot);
            return resolve(formatResult("process_group_cleanup_failed", {
              exitCode, signal, timedOut, durationMs: Date.now() - startMs,
              stdoutBytes, stderrBytes, stdoutOverflow, stderrOverflow,
              termSent, killSent, exitObserved, closeObserved,
              processGroupCleanupConfirmed: false, temporaryCleanupConfirmed: cleanUpDir(tempRoot),
            }));
          }
        } else if (descCheck === "error") {
          cleanUpDir(tempRoot);
          return resolve(formatResult("process_group_cleanup_failed", {
            exitCode, signal, timedOut, durationMs: Date.now() - startMs,
            stdoutBytes, stderrBytes, stdoutOverflow, stderrOverflow,
            termSent, killSent, exitObserved, closeObserved,
            processGroupCleanupConfirmed: false, temporaryCleanupConfirmed: cleanUpDir(tempRoot),
          }));
        }
      }

      const durationMs = Date.now() - startMs;
      const groupCheck = signal0Check(pid);
      const groupConfirmed = groupCheck === "gone";
      const tempOk = cleanUpDir(tempRoot);

      // Decision precedence
      let decision: HermesPhase2CanaryRunnerDecision;
      if (term !== null && !term.confirmed) decision = "process_group_cleanup_failed";
      else if (!groupConfirmed) decision = "process_group_cleanup_failed";
      else if (!tempOk) decision = "temporary_cleanup_failed";
      else if (!exitObserved) decision = "exit_not_observed";
      else if (!closeObserved) decision = "close_not_observed";
      else if (stdinError) decision = "stdin_error";
      else if (stdoutOverflow) decision = "stdout_overflow";
      else if (stderrOverflow) decision = "stderr_overflow";
      else if (timedOut) decision = "timed_out";
      else decision = "executed";

      resolve(formatResult(decision, {
        exitCode, signal, timedOut, durationMs,
        stdoutBytes, stderrBytes, stdoutOverflow, stderrOverflow,
        termSent, killSent, exitObserved, closeObserved,
        processGroupCleanupConfirmed: groupConfirmed,
        temporaryCleanupConfirmed: tempOk,
      }));
    };

    child.on("exit", (code, sig) => { exitObserved = true; exitCode = code; signal = sig; });
    child.on("close", () => { closeObserved = true; settle(); });
    child.on("error", () => { settle(); });
  });

  return result;
}
