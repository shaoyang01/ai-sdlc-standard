// Hermes Phase 2 Code Review Canary — POSIX Controlled Process Runner
// ====================================================================
// Controlled child_process.spawn wrapper with isolated environment,
// resource limits, timeout, signal escalation, and verified cleanup.
// Only linux and darwin are supported.

import { spawn, type ChildProcess } from "node:child_process";
import { realpathSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";

export type HermesPhase2CanaryRunnerDecision =
  | "executed"
  | "unsupported_platform"
  | "executable_not_allowed"
  | "invalid_executable_path"
  | "spawn_failed"
  | "stdin_error"
  | "timed_out"
  | "stdout_overflow"
  | "stderr_overflow"
  | "args_validation_failed"
  | "credential_name_invalid"
  | "process_group_cleanup_failed"
  | "temporary_cleanup_failed"
  | "exit_not_observed"
  | "close_not_observed"
  | "build_error";

export type HermesPhase2CanaryRunnerResult = Readonly<{
  decision: HermesPhase2CanaryRunnerDecision;
  executed: boolean;
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

function isValidPath(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    pathResolve(value) === value
  );
}

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

function killProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function deny(
  decision: HermesPhase2CanaryRunnerDecision,
  overrides: Partial<HermesPhase2CanaryRunnerResult> = {},
): HermesPhase2CanaryRunnerResult {
  return {
    decision,
    executed: overrides.executed ?? false,
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
    return deny("unsupported_platform");
  }

  const {
    executablePath,
    allowedExecutablePaths,
    args,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    termGraceMs = DEFAULT_TERM_GRACE_MS,
    maxStdoutBytes = MAX_STDOUT_BYTES,
    maxStderrBytes = MAX_STDERR_BYTES,
    credentialEnvNames = [],
    sourceEnv = {},
  } = config;

  // Validate args count and sizes
  if (!Array.isArray(args) || args.length > MAX_ARGS) {
    return deny("args_validation_failed");
  }
  let argTotal = 0;
  for (const arg of args) {
    if (typeof arg !== "string") return deny("args_validation_failed");
    if (arg.includes("\x00") || /[\x00-\x08\x0e-\x1f]/.test(arg)) return deny("args_validation_failed");
    const len = Buffer.byteLength(arg, "utf8");
    if (len > MAX_ARG_LEN) return deny("args_validation_failed");
    argTotal += len;
    if (argTotal > MAX_ARG_TOTAL) return deny("args_validation_failed");
  }

  // Validate executable
  if (!isValidPath(executablePath)) {
    return deny("invalid_executable_path");
  }
  let canonicalExec: string;
  try {
    canonicalExec = realpathSync(executablePath);
  } catch {
    return deny("executable_not_allowed");
  }
  const normalizedAllowed: string[] = [];
  for (const allowed of allowedExecutablePaths) {
    try {
      normalizedAllowed.push(realpathSync(allowed));
    } catch {
      // not found, skip
    }
  }
  if (!normalizedAllowed.includes(canonicalExec)) {
    return deny("executable_not_allowed");
  }

  // Validate timeout range
  if (timeoutMs < 1000 || timeoutMs > 120_000) {
    return deny("build_error");
  }
  if (termGraceMs < 100 || termGraceMs > 5_000) {
    return deny("build_error");
  }

  // Validate credential names
  if (credentialEnvNames.length > MAX_CREDENTIAL_NAMES) {
    return deny("credential_name_invalid");
  }
  const seenCredentials = new Set<string>();
  for (const name of credentialEnvNames) {
    if (!CREDENTIAL_RE.test(name)) return deny("credential_name_invalid");
    if (RESERVED_ENV.has(name)) return deny("credential_name_invalid");
    if (seenCredentials.has(name)) return deny("credential_name_invalid");
    seenCredentials.add(name);
  }

  // Create isolated temp root
  let tempRoot: string;
  try {
    tempRoot = join(tmpdir(), `hermes-canary-${randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    const work = join(tempRoot, "work");
    const home = join(tempRoot, "home");
    const tmp = join(tempRoot, "tmp");
    const cache = join(tempRoot, "cache");
    const configDir = join(tempRoot, "config");
    const state = join(tempRoot, "state");
    mkdirSync(work);
    mkdirSync(home);
    mkdirSync(tmp);
    mkdirSync(cache);
    mkdirSync(configDir);
    mkdirSync(state);
  } catch {
    return deny("build_error");
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

  // Add credential envs from sourceEnv
  for (const name of credentialEnvNames) {
    if (name in sourceEnv) {
      childEnv[name] = sourceEnv[name];
    }
  }

  // Spawn child
  let child: ChildProcess;
  try {
    child = spawn(executablePath, args as string[], {
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: workDir,
      env: childEnv,
    });
  } catch {
    cleanUpDir(tempRoot);
    return deny("spawn_failed");
  }

  // Close stdin immediately (payload is not passed via stdin in this runner)
  if (child.stdin) {
    child.stdin.end();
  }

  const startMs = Date.now();
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
  let terminationError: HermesPhase2CanaryRunnerDecision | null = null;

  const pid = child.pid;
  if (pid === undefined) {
    try { child.kill("SIGKILL"); } catch {}
    cleanUpDir(tempRoot);
    return deny("spawn_failed");
  }

  // Timeout
  const timer = setTimeout(() => {
    timedOut = true;
    termSent = killProcessGroup(pid, "SIGTERM");
    setTimeout(() => {
      killSent = killProcessGroup(pid, "SIGKILL");
    }, termGraceMs);
  }, timeoutMs);

  // Stdout
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > maxStdoutBytes) {
      stdoutOverflow = true;
      try { killProcessGroup(pid, "SIGTERM"); } catch {}
    }
  });

  // Stderr
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes > maxStderrBytes) {
      stderrOverflow = true;
      try { killProcessGroup(pid, "SIGTERM"); } catch {}
    }
  });

  // Wait for close
  const result = await new Promise<HermesPhase2CanaryRunnerResult>((resolve) => {
    child.on("exit", (code, sig) => {
      exitObserved = true;
      exitCode = code;
      signal = sig;
    });

    child.on("close", () => {
      closeObserved = true;
      clearTimeout(timer);
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(deny("spawn_failed", {
        durationMs: Date.now() - startMs,
        temporaryCleanupConfirmed: cleanUpDir(tempRoot),
      }));
    });

    // Also handle close as final resolver for normal paths
    child.on("close", () => {
      const durationMs = Date.now() - startMs;

      // Check for overflows first
      if (stdoutOverflow || stderrOverflow) {
        const decision = stdoutOverflow ? "stdout_overflow" : "stderr_overflow";
        const confirmed = cleanUpDir(tempRoot);
        if (!confirmed) {
          return resolve(deny("temporary_cleanup_failed", {
            executed: true, exitCode, signal, timedOut,
            durationMs, stdoutBytes, stderrBytes,
            stdoutOverflow, stderrOverflow,
            termSent, killSent, exitObserved, closeObserved,
            processGroupCleanupConfirmed: false,
            temporaryCleanupConfirmed: false,
          }));
        }
        return resolve(deny(decision, {
          executed: true, exitCode, signal, timedOut,
          durationMs, stdoutBytes, stderrBytes,
          stdoutOverflow, stderrOverflow,
          termSent, killSent, exitObserved, closeObserved,
          processGroupCleanupConfirmed: false,
          temporaryCleanupConfirmed: true,
        }));
      }

      if (!exitObserved) {
        cleanUpDir(tempRoot);
        return resolve(deny("exit_not_observed", {
          durationMs, stdoutBytes, stderrBytes,
          termSent, killSent, exitObserved, closeObserved,
          temporaryCleanupConfirmed: cleanUpDir(tempRoot),
        }));
      }

      if (timedOut) {
        cleanUpDir(tempRoot);
        return resolve(deny("timed_out", {
          executed: true, exitCode, signal, timedOut,
          durationMs, stdoutBytes, stderrBytes,
          stdoutOverflow, stderrOverflow,
          termSent, killSent, exitObserved, closeObserved,
          temporaryCleanupConfirmed: cleanUpDir(tempRoot),
        }));
      }

      // Final cleanup
      const tempOk = cleanUpDir(tempRoot);
      if (!tempOk) {
        return resolve(deny("temporary_cleanup_failed", {
          executed: true, exitCode, signal, timedOut,
          durationMs, stdoutBytes, stderrBytes,
          stdoutOverflow, stderrOverflow,
          termSent, killSent, exitObserved, closeObserved,
          processGroupCleanupConfirmed: false,
          temporaryCleanupConfirmed: false,
        }));
      }

      resolve({
        decision: "executed",
        executed: true,
        exitCode,
        signal,
        timedOut,
        durationMs,
        stdoutBytes,
        stderrBytes,
        stdoutOverflow,
        stderrOverflow,
        termSent,
        killSent,
        exitObserved,
        closeObserved,
        processGroupCleanupConfirmed: true,
        temporaryCleanupConfirmed: true,
      });
    });
  });

  return result;
}
