// Hermes Phase 2 Code Review Canary — POSIX Controlled Process Runner
// ====================================================================
// Controlled spawn with isolated env, termination state machine,
// process-group cleanup verification (SIGTERM → grace → signal 0 → SIGKILL → signal 0).
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

function cleanUpDir(dir: string): boolean {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    }
    return !existsSync(dir);
  } catch {
    return false;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function signal0Check(pid: number): "exists" | "gone" | "error" {
  try {
    process.kill(-pid, 0);
    return "exists";
  } catch (e: any) {
    if (e.code === "ESRCH") return "gone";
    return "error";
  }
}

function terminateProcessGroup(
  pid: number,
  graceMs: number,
): Promise<{ termSent: boolean; killSent: boolean; confirmed: boolean }> {
  const termSent = signalGroup(pid, "SIGTERM");
  let killSent = false;

  return new Promise((resolve) => {
    setTimeout(() => {
      const check = signal0Check(pid);
      if (check === "gone") {
        resolve({ termSent, killSent, confirmed: true });
        return;
      }
      // Still exists or error — send SIGKILL
      killSent = signalGroup(pid, "SIGKILL");
      setTimeout(() => {
        const finalCheck = signal0Check(pid);
        resolve({
          termSent,
          killSent,
          confirmed: finalCheck === "gone",
        });
      }, 200);
    }, graceMs);
  });
}

function formatResult(
  decision: HermesPhase2CanaryRunnerDecision,
  overrides: Partial<HermesPhase2CanaryRunnerResult> = {},
): HermesPhase2CanaryRunnerResult {
  return {
    decision,
    exitCode: overrides.exitCode ?? null,
    signal: overrides.signal ?? null,
    timedOut: overrides.timedOut ?? false,
    durationMs: overrides.durationMs ?? 0,
    stdoutBytes: overrides.stdoutBytes ?? 0,
    stderrBytes: overrides.stderrBytes ?? 0,
    stdoutOverflow: overrides.stdoutOverflow ?? false,
    stderrOverflow: overrides.stderrOverflow ?? false,
    termSent: overrides.termSent ?? false,
    killSent: overrides.killSent ?? false,
    exitObserved: overrides.exitObserved ?? false,
    closeObserved: overrides.closeObserved ?? false,
    processGroupCleanupConfirmed: overrides.processGroupCleanupConfirmed ?? false,
    temporaryCleanupConfirmed: overrides.temporaryCleanupConfirmed ?? false,
  };
}

export async function runHermesPhase2CanaryProcess(
  config: HermesPhase2CanaryProcessRunnerConfig,
): Promise<HermesPhase2CanaryRunnerResult> {
  const platform = process.platform;
  if (platform !== "linux" && platform !== "darwin") {
    return formatResult("unsupported_platform");
  }

  const {
    executablePath,
    allowedExecutablePaths,
    args,
    serializedPayload,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    termGraceMs = DEFAULT_TERM_GRACE_MS,
    maxStdoutBytes = MAX_STDOUT_BYTES,
    maxStderrBytes = MAX_STDERR_BYTES,
    credentialEnvNames = [],
    sourceEnv = {},
  } = config;

  // Validate timeout/grace/limits are finite integers
  if (
    typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 || timeoutMs > 120_000
  ) return formatResult("build_error");
  if (
    typeof termGraceMs !== "number" || !Number.isFinite(termGraceMs) || !Number.isInteger(termGraceMs) ||
    termGraceMs < 100 || termGraceMs > 5_000
  ) return formatResult("build_error");
  if (
    typeof maxStdoutBytes !== "number" || !Number.isFinite(maxStdoutBytes) || !Number.isInteger(maxStdoutBytes) ||
    maxStdoutBytes < 1 || maxStdoutBytes > 16_384
  ) return formatResult("build_error");
  if (
    typeof maxStderrBytes !== "number" || !Number.isFinite(maxStderrBytes) || !Number.isInteger(maxStderrBytes) ||
    maxStderrBytes < 1 || maxStderrBytes > 16_384
  ) return formatResult("build_error");

  // Validate args
  if (!Array.isArray(args) || args.length > MAX_ARGS) return formatResult("args_validation_failed");
  let argTotal = 0;
  for (const arg of args) {
    if (typeof arg !== "string") return formatResult("args_validation_failed");
    if (arg.length === 0 || arg.trim().length === 0) return formatResult("args_validation_failed");
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(arg)) return formatResult("args_validation_failed");
    if (arg.includes("\n") || arg.includes("\r") || arg.includes("\t")) return formatResult("args_validation_failed");
    const len = Buffer.byteLength(arg, "utf8");
    if (len > MAX_ARG_LEN) return formatResult("args_validation_failed");
    argTotal += len;
    if (argTotal > MAX_ARG_TOTAL) return formatResult("args_validation_failed");
  }

  // Validate allowedExecutablePaths non-empty
  if (!Array.isArray(allowedExecutablePaths) || allowedExecutablePaths.length === 0) {
    return formatResult("build_error");
  }

  // Resolve executable and allowlist
  if (typeof executablePath !== "string" || executablePath.length === 0 || pathResolve(executablePath) !== executablePath) {
    return formatResult("invalid_executable_path");
  }
  let canonicalExec: string;
  try {
    canonicalExec = realpathSync(executablePath);
  } catch {
    return formatResult("executable_not_allowed");
  }
  const normalizedAllowed: string[] = [];
  for (const allowed of allowedExecutablePaths) {
    try {
      normalizedAllowed.push(realpathSync(allowed));
    } catch {
      // not found — fail closed
      return formatResult("executable_not_allowed");
    }
  }
  if (!normalizedAllowed.includes(canonicalExec)) {
    return formatResult("executable_not_allowed");
  }

  // Validate credential names
  if (credentialEnvNames.length > MAX_CREDENTIAL_NAMES) return formatResult("credential_name_invalid");
  const seenCredentials = new Set<string>();
  for (const name of credentialEnvNames) {
    if (!CREDENTIAL_RE.test(name)) return formatResult("credential_name_invalid");
    if (RESERVED_ENV.has(name)) return formatResult("credential_name_invalid");
    if (seenCredentials.has(name)) return formatResult("credential_name_invalid");
    seenCredentials.add(name);
    // Must exist in sourceEnv and be non-empty
    if (typeof sourceEnv[name] !== "string" || sourceEnv[name].length === 0) {
      return formatResult("missing_credential_value");
    }
  }

  // Create isolated temp root
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
    return formatResult("build_error");
  }

  const workDir = join(tempRoot, "work");

  // Build child env from empty
  const childEnv: Record<string, string> = {
    HOME: join(tempRoot, "home"),
    TMPDIR: join(tempRoot, "tmp"),
    XDG_CACHE_HOME: join(tempRoot, "cache"),
    XDG_CONFIG_HOME: join(tempRoot, "config"),
    XDG_STATE_HOME: join(tempRoot, "state"),
    HISTFILE: "/dev/null",
    NO_COLOR: "1",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
  };
  for (const name of credentialEnvNames) {
    childEnv[name] = sourceEnv[name];
  }

  // Spawn child using canonical path
  let child: ChildProcess;
  try {
    child = spawn(canonicalExec, args as string[], {
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: workDir,
      env: childEnv,
    });
  } catch {
    cleanUpDir(tempRoot);
    return formatResult("spawn_failed");
  }

  const startMs = Date.now();
  const pid = child.pid;
  if (pid === undefined) {
    try { child.kill("SIGKILL"); } catch {}
    cleanUpDir(tempRoot);
    return formatResult("spawn_failed");
  }

  // State
  let timedOut = false;
  let termSent = false;
  let killSent = false;
  let exitObserved = false;
  let closeObserved = false;
  let exitCode: number | null = null;
  let signal: string | null = null;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutOverflow = false;
  let stderrOverflow = false;
  let stdinError = false;

  // Shared termination function
  const triggerTermination = async () => {
    const { termSent: ts, killSent: ks, confirmed } = await terminateProcessGroup(pid, termGraceMs);
    termSent = ts;
    killSent = ks;
    return { termSent: ts, killSent: ks, confirmed };
  };

  // Timeout timer
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const timer = setTimeout(() => {
    timedOut = true;
    triggerTermination();
  }, timeoutMs);

  // Stdout
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > maxStdoutBytes) {
      stdoutOverflow = true;
      triggerTermination();
    }
  });

  // Stderr
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes > maxStderrBytes) {
      stderrOverflow = true;
      triggerTermination();
    }
  });

  // Write stdin
  if (child.stdin) {
    if (serializedPayload !== undefined) {
      child.stdin.write(serializedPayload, "utf8", (err) => {
        if (err) {
          stdinError = true;
          triggerTermination();
        }
        child.stdin?.end();
        if (err) stdinError = true;
      });
      child.stdin.on("error", () => {
        stdinError = true;
        triggerTermination();
      });
    } else {
      child.stdin.end();
    }
    child.stdin.on("error", () => {
      stdinError = true;
      triggerTermination();
    });
  } else {
    // stdin not available
    if (serializedPayload !== undefined) {
      stdinError = true;
      triggerTermination();
    }
  }

  // Wait for close
  const result = await new Promise<HermesPhase2CanaryRunnerResult>((resolve) => {
    child.on("exit", (code, sig) => {
      exitObserved = true;
      exitCode = code;
      signal = sig;
    });

    let settled = false;
    const settle = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const durationMs = Date.now() - startMs;

      // After close, check descendants via signal 0
      if (pid !== undefined) {
        const check = signal0Check(pid);
        if (check === "exists") {
          // Descendants still exist — terminate
          const { confirmed } = await triggerTermination();
          if (!confirmed) {
            const tempOk = cleanUpDir(tempRoot);
            return resolve(formatResult("process_group_cleanup_failed", {
              exitCode, signal, timedOut, durationMs,
              stdoutBytes, stderrBytes, stdoutOverflow, stderrOverflow,
              termSent, killSent, exitObserved, closeObserved,
              processGroupCleanupConfirmed: false,
              temporaryCleanupConfirmed: tempOk,
            }));
          }
        }
      }

      // Decision precedence
      let decision: HermesPhase2CanaryRunnerDecision;
      if (stdinError) decision = "stdin_error";
      else if (stdoutOverflow) decision = "stdout_overflow";
      else if (stderrOverflow) decision = "stderr_overflow";
      else if (timedOut) decision = "timed_out";
      else if (!exitObserved) decision = "exit_not_observed";
      else if (!closeObserved) decision = "close_not_observed";
      else decision = "executed";

      const tempOk = cleanUpDir(tempRoot);
      if (!tempOk && decision === "executed") decision = "temporary_cleanup_failed";

      resolve(formatResult(decision as any, {
        exitCode, signal, timedOut,
        durationMs, stdoutBytes, stderrBytes,
        stdoutOverflow, stderrOverflow,
        termSent, killSent, exitObserved, closeObserved,
        processGroupCleanupConfirmed: signal0Check(pid ?? 0) === "gone",
        temporaryCleanupConfirmed: tempOk,
      }));
    };

    child.on("close", () => {
      closeObserved = true;
      settle();
    });

    child.on("error", () => {
      settle();
    });
  });

  return result;
}
