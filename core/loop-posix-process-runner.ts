// LOOP Executor Kernel — Controlled POSIX Process Runner
// ========================================================
// macOS/Linux host process runner with executable allowlist, cwd containment,
// explicit env, bounded streams, and POSIX process-group timeout/cleanup.
//
// Dependencies on POSIX process-group semantics:
// - Uses negative PID signaling (kill(-pid, sig)) to target the entire group.
// - Requires detached:true spawn for reliable process-group ownership.
// - No Windows support. No network filesystem guarantees.
// - cwd containment assumes allowed roots are not replaced by untrusted processes
//   between validation and spawn. Node/POSIX API does not provide kernel-level
//   openat-style cwd pinning.

import { createHash } from "node:crypto";
import type { ChildProcess, SpawnOptions } from "node:child_process";
const childProcess = require("node:child_process") as typeof import("node:child_process");
import * as fs from "node:fs";
import { isAbsolute, sep } from "node:path";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type LoopPosixExecutablePolicy = Readonly<{
  id: string;
  executablePath: string;
  fixedArgs?: readonly string[];
  allowDynamicArgs?: boolean;
  stdinMode?: "forbidden" | "optional" | "required";
}>;

export type LoopPosixProcessRunnerOptions = Readonly<{
  executables: readonly LoopPosixExecutablePolicy[];
  allowedCwdRoots: readonly string[];
  fixedEnv?: Readonly<Record<string, string>>;
  allowedRequestEnvKeys?: readonly string[];
  defaultTimeoutMs?: number;
  terminationGraceMs?: number;
  defaultMaxStdoutBytes?: number;
  defaultMaxStderrBytes?: number;
  maxStdinBytes?: number;
}>;

export type LoopPosixProcessRequest = Readonly<{
  executableId: string;
  args?: readonly string[];
  cwd: string;
  stdin?: string | Uint8Array;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}>;

export type LoopPosixProcessResult = Readonly<{
  status: "exited" | "timed_out";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutBytesReceived: number;
  stderrBytesReceived: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  termSignalSent: boolean;
  killSignalSent: boolean;
}>;

export type LoopPosixProcessRunnerErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PLATFORM"
  | "EXECUTABLE_NOT_ALLOWED"
  | "EXECUTABLE_INVALID"
  | "EXECUTABLE_CHANGED"
  | "CWD_NOT_ALLOWED"
  | "CWD_INVALID"
  | "ENV_NOT_ALLOWED"
  | "PROCESS_SPAWN_FAILED"
  | "PROCESS_IO_FAILED"
  | "PROCESS_CLEANUP_FAILED";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAX_ERROR_MSG = 256;
const EXEC_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DANGEROUS_ENV_KEYS = [
  "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH", "NODE_OPTIONS", "BASH_ENV", "ENV",
];
const MAX_ARGS_COUNT = 128;
const MAX_ARG_BYTES = 4096;
const MAX_TOTAL_ARGS_BYTES = 32768;
const MAX_ENV_COUNT = 128;
const MAX_ENV_VAL_BYTES = 4096;
const MAX_TOTAL_ENV_BYTES = 32768;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_GRACE_MS = 2000;
const DEFAULT_MAX_STDOUT = 1_048_576;
const DEFAULT_MAX_STDERR = 262144;
const DEFAULT_MAX_STDIN = 1_048_576;
const MAX_STDIN_BYTES = 16_777_216;
const MAX_OUTPUT_BYTES = 16_777_216;
const MIN_TIMEOUT = 100;
const MAX_TIMEOUT = 600_000;
const MIN_GRACE = 10;
const MAX_GRACE = 10_000;

function sanitize(msg: string): string {
  return msg.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, MAX_ERROR_MSG);
}

export class LoopPosixProcessRunnerError extends Error {
  readonly code: LoopPosixProcessRunnerErrorCode;
  constructor(code: LoopPosixProcessRunnerErrorCode, message: string) {
    super(sanitize(message));
    this.name = "LoopPosixProcessRunnerError";
    this.code = code;
  }
}

function fail(code: LoopPosixProcessRunnerErrorCode, msg: string): never {
  throw new LoopPosixProcessRunnerError(code, msg);
}

// ═══════════════════════════════════════════════════════════════
// Validation helpers
// ═══════════════════════════════════════════════════════════════

function validateString(v: unknown, label: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim()) fail("INVALID_INPUT", `${label} must be a trimmed non-empty string`);
  return v;
}
function safeInt(v: unknown, min: number, max: number, label: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) fail("INVALID_INPUT", `${label} out of range`);
  return v;
}
function strBytes(s: string): number { return Buffer.byteLength(s, "utf8"); }

// ═══════════════════════════════════════════════════════════════
// Executable identity (recorded at construction, verified per-run)
// ═══════════════════════════════════════════════════════════════

type PinnedExecutable = {
  id: string;
  canonicalPath: string;
  device: number;
  inode: number;
  mode: number;
  fixedArgs: readonly string[];
  allowDynamicArgs: boolean;
  stdinMode: "forbidden" | "optional" | "required";
};

function validateExecutableAtConstruction(policy: LoopPosixExecutablePolicy): PinnedExecutable {
  const id = validateString(policy.id, "executable.id");
  if (!EXEC_ID_RE.test(id)) fail("EXECUTABLE_INVALID", `executable id format invalid`);
  const path = validateString(policy.executablePath, "executablePath");
  if (!isAbsolute(path)) fail("EXECUTABLE_INVALID", "executablePath must be absolute");
  let stat: fs.Stats;
  try { stat = fs.lstatSync(path); } catch { fail("EXECUTABLE_INVALID", "executable not found"); }
  if (stat.isSymbolicLink()) fail("EXECUTABLE_INVALID", "executable must not be a symlink");
  if (!stat.isFile()) fail("EXECUTABLE_INVALID", "executable must be a regular file");
  if ((stat.mode & 0o111) === 0) fail("EXECUTABLE_INVALID", "executable must have at least one executable bit");
  let real: string;
  try { real = fs.realpathSync(path); } catch { fail("EXECUTABLE_INVALID", "executable realpath failed"); }
  if (real !== path) fail("EXECUTABLE_INVALID", "executable path must be canonical (no symlink components)");

  const fixedArgs: string[] = [];
  if (policy.fixedArgs) {
    for (const a of policy.fixedArgs) {
      if (typeof a !== "string") fail("INVALID_INPUT", "fixedArgs must be strings");
      if (a.includes("\x00")) fail("INVALID_INPUT", "args must not contain NUL");
      if (strBytes(a) > MAX_ARG_BYTES) fail("INVALID_INPUT", "arg exceeds max bytes");
      fixedArgs.push(a);
    }
    if (fixedArgs.length > MAX_ARGS_COUNT) fail("INVALID_INPUT", "too many fixed args");
    const total = fixedArgs.reduce((s, a) => s + strBytes(a), 0);
    if (total > MAX_TOTAL_ARGS_BYTES) fail("INVALID_INPUT", "fixed args total bytes exceeded");
  }

  const allowDynamicArgs = policy.allowDynamicArgs === true;
  const stdinMode = policy.stdinMode ?? "optional";
  if (stdinMode !== "forbidden" && stdinMode !== "optional" && stdinMode !== "required") fail("INVALID_INPUT", "invalid stdinMode");

  return {
    id, canonicalPath: path, device: stat.dev, inode: stat.ino, mode: stat.mode,
    fixedArgs: Object.freeze([...fixedArgs]), allowDynamicArgs, stdinMode,
  };
}

function revalidateExecutable(pe: PinnedExecutable): void {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(pe.canonicalPath); } catch { fail("EXECUTABLE_CHANGED", "executable not found"); }
  if (stat.isSymbolicLink()) fail("EXECUTABLE_CHANGED", "executable became symlink");
  if (!stat.isFile()) fail("EXECUTABLE_CHANGED", "executable no longer a regular file");
  if ((stat.mode & 0o111) === 0) fail("EXECUTABLE_CHANGED", "executable lost execute bit");
  if (stat.dev !== pe.device || stat.ino !== pe.inode) fail("EXECUTABLE_CHANGED", "executable inode/device changed");
  let real: string;
  try { real = fs.realpathSync(pe.canonicalPath); } catch { fail("EXECUTABLE_CHANGED", "realpath failed"); }
  if (real !== pe.canonicalPath) fail("EXECUTABLE_CHANGED", "executable path changed");
}

// ═══════════════════════════════════════════════════════════════
// cwd root tracking
// ═══════════════════════════════════════════════════════════════

type CwdRoot = { canonicalPath: string; device: number; inode: number };

function validateCwdRoot(path: string): CwdRoot {
  if (!isAbsolute(path)) fail("INVALID_INPUT", "cwd root must be absolute");
  if (path === "/") fail("INVALID_INPUT", "cwd root must not be filesystem root");
  let stat: fs.Stats;
  try { stat = fs.lstatSync(path); } catch { fail("INVALID_INPUT", "cwd root not found"); }
  if (stat.isSymbolicLink()) fail("INVALID_INPUT", "cwd root must not be symlink");
  if (!stat.isDirectory()) fail("INVALID_INPUT", "cwd root must be a directory");
  let real: string;
  try { real = fs.realpathSync(path); } catch { fail("INVALID_INPUT", "cwd root realpath failed"); }
  if (real !== path) fail("INVALID_INPUT", "cwd root must be canonical");
  return { canonicalPath: path, device: stat.dev, inode: stat.ino };
}

function checkCwdContainment(cwd: string, roots: readonly CwdRoot[]): CwdRoot {
  if (!isAbsolute(cwd)) fail("CWD_INVALID", "cwd must be absolute");
  let stat: fs.Stats;
  try { stat = fs.lstatSync(cwd); } catch { fail("CWD_INVALID", "cwd not found"); }
  if (stat.isSymbolicLink()) fail("CWD_INVALID", "cwd must not be a symlink");
  if (!stat.isDirectory()) fail("CWD_INVALID", "cwd must be a directory");
  let real: string;
  try { real = fs.realpathSync(cwd); } catch { fail("CWD_INVALID", "cwd realpath failed"); }
  if (real !== cwd) fail("CWD_INVALID", "cwd must be canonical (no symlink components)");

  // Find matching root
  for (const root of roots) {
    if (cwd === root.canonicalPath || (cwd.startsWith(root.canonicalPath + sep))) {
      // Verify root hasn't been replaced
      let rootStat: fs.Stats;
      try { rootStat = fs.lstatSync(root.canonicalPath); } catch { fail("CWD_INVALID", "cwd root not found"); }
      if (rootStat.dev !== root.device || rootStat.ino !== root.inode) fail("CWD_INVALID", "cwd root inode/device changed");
      return root;
    }
  }
  fail("CWD_NOT_ALLOWED", "cwd not within allowed roots");
}

// ═══════════════════════════════════════════════════════════════
// Env construction
// ═══════════════════════════════════════════════════════════════

function buildEnv(
  fixedEnv: Readonly<Record<string, string>>,
  allowedKeys: readonly string[],
  requestEnv: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const env: Record<string, string> = Object.create(null);

  // Copy fixed env
  for (const [k, v] of Object.entries(fixedEnv)) {
    if (!ENV_KEY_RE.test(k)) fail("INVALID_INPUT", "env key invalid");
    if (typeof v !== "string" || v.includes("\x00")) fail("INVALID_INPUT", "env value invalid");
    if (strBytes(v) > MAX_ENV_VAL_BYTES) fail("INVALID_INPUT", "env value too long");
    // Check dangerous
    const upper = k.toUpperCase();
    if (DANGEROUS_ENV_KEYS.some(d => d === upper)) fail("INVALID_INPUT", "dangerous env key not allowed");
    env[k] = v;
  }

  // Add allowed request env
  const allowedSet = new Set(allowedKeys);
  if (requestEnv) {
    for (const [k, v] of Object.entries(requestEnv)) {
      if (!allowedSet.has(k)) fail("ENV_NOT_ALLOWED", "env key not in allowed list");
      if (k in env) fail("ENV_NOT_ALLOWED", "cannot override fixed env");
      if (!ENV_KEY_RE.test(k)) fail("INVALID_INPUT", "env key invalid");
      if (typeof v !== "string" || v.includes("\x00")) fail("INVALID_INPUT", "env value invalid");
      if (strBytes(v) > MAX_ENV_VAL_BYTES) fail("INVALID_INPUT", "env value too long");
      const upper = k.toUpperCase();
      if (DANGEROUS_ENV_KEYS.some(d => d === upper)) fail("ENV_NOT_ALLOWED", "dangerous env key not allowed");
      env[k] = v;
    }
  }

  if (Object.keys(env).length > MAX_ENV_COUNT) fail("INVALID_INPUT", "too many env entries");
  let totalBytes = 0;
  for (const [k, v] of Object.entries(env)) totalBytes += strBytes(k) + strBytes(v);
  if (totalBytes > MAX_TOTAL_ENV_BYTES) fail("INVALID_INPUT", "env total bytes exceeded");

  return env;
}

// ═══════════════════════════════════════════════════════════════
// Bounded stream collector
// ═══════════════════════════════════════════════════════════════

class BoundedCollector {
  bytesReceived = 0;
  retainedBytes = 0;
  private chunks: Buffer[] = [];
  truncated = false;

  constructor(private limit: number) {}

  push(chunk: Buffer): void {
    this.bytesReceived += chunk.length;
    if (!this.truncated) {
      const remaining = this.limit - this.retainedBytes;
      if (chunk.length <= remaining) {
        this.chunks.push(chunk);
        this.retainedBytes += chunk.length;
      } else {
        if (remaining > 0) this.chunks.push(chunk.subarray(0, remaining));
        this.retainedBytes += remaining;
        this.truncated = true;
      }
    }
  }

  finalize(): string {
    return Buffer.concat(this.chunks, this.retainedBytes).toString("utf8");
  }
}

// ═══════════════════════════════════════════════════════════════
// LoopPosixProcessRunner
// ═══════════════════════════════════════════════════════════════

export class LoopPosixProcessRunner {
  private readonly executables: ReadonlyMap<string, PinnedExecutable>;
  private readonly cwdRoots: readonly CwdRoot[];
  private readonly fixedEnv: Readonly<Record<string, string>>;
  private readonly allowedEnvKeys: readonly string[];
  private readonly defaultTimeoutMs: number;
  private readonly terminationGraceMs: number;
  private readonly defaultMaxStdoutBytes: number;
  private readonly defaultMaxStderrBytes: number;
  private readonly maxStdinBytes: number;

  constructor(options: LoopPosixProcessRunnerOptions) {
    if (process.platform !== "darwin" && process.platform !== "linux") fail("UNSUPPORTED_PLATFORM", "only macOS and Linux supported");

    const exeMap = new Map<string, PinnedExecutable>();
    const exes = options.executables;
    if (!Array.isArray(exes) || exes.length === 0) fail("INVALID_INPUT", "at least one executable required");
    const seenIds = new Set<string>();
    for (const p of exes) {
      const pe = validateExecutableAtConstruction(p);
      if (seenIds.has(pe.id)) fail("INVALID_INPUT", `duplicate executable id`);
      seenIds.add(pe.id);
      exeMap.set(pe.id, pe);
    }
    this.executables = exeMap;

    const roots = options.allowedCwdRoots;
    if (!Array.isArray(roots) || roots.length === 0) fail("INVALID_INPUT", "at least one cwd root required");
    const rootSet: CwdRoot[] = [];
    const seenPaths = new Set<string>();
    for (const r of roots) {
      const vr = validateCwdRoot(validateString(r, "cwd root"));
      if (seenPaths.has(vr.canonicalPath)) continue;
      seenPaths.add(vr.canonicalPath);
      rootSet.push(vr);
    }
    this.cwdRoots = Object.freeze(rootSet);

    const fe = options.fixedEnv ?? {};
    const feObj: Record<string, string> = Object.create(null);
    for (const [k, v] of Object.entries(fe)) {
      if (!ENV_KEY_RE.test(k)) fail("INVALID_INPUT", "fixed env key invalid");
      if (typeof v !== "string" || v.includes("\x00")) fail("INVALID_INPUT", "fixed env value invalid");
      const upper = k.toUpperCase();
      if (DANGEROUS_ENV_KEYS.some(d => d === upper)) fail("INVALID_INPUT", "dangerous env key in fixed env");
      feObj[k] = v;
    }
    this.fixedEnv = Object.freeze(feObj);

    this.allowedEnvKeys = Object.freeze([...(options.allowedRequestEnvKeys ?? [])]);

    this.defaultTimeoutMs = safeInt(options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT, MAX_TIMEOUT, "defaultTimeoutMs");
    this.terminationGraceMs = safeInt(options.terminationGraceMs ?? DEFAULT_GRACE_MS, MIN_GRACE, MAX_GRACE, "terminationGraceMs");
    this.defaultMaxStdoutBytes = safeInt(options.defaultMaxStdoutBytes ?? DEFAULT_MAX_STDOUT, 1, MAX_OUTPUT_BYTES, "defaultMaxStdoutBytes");
    this.defaultMaxStderrBytes = safeInt(options.defaultMaxStderrBytes ?? DEFAULT_MAX_STDERR, 1, MAX_OUTPUT_BYTES, "defaultMaxStderrBytes");
    this.maxStdinBytes = safeInt(options.maxStdinBytes ?? DEFAULT_MAX_STDIN, 1, MAX_STDIN_BYTES, "maxStdinBytes");
  }

  async run(request: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
    // ── validate request ──
    const exeId = validateString(request.executableId, "executableId");
    const pe = this.executables.get(exeId);
    if (!pe) fail("EXECUTABLE_NOT_ALLOWED", "executable id not registered");
    revalidateExecutable(pe);

    // args
    const dynArgs: string[] = [];
    if (request.args && request.args.length > 0) {
      if (!pe.allowDynamicArgs) fail("INVALID_INPUT", "dynamic args not allowed for this executable");
      if (!Array.isArray(request.args)) fail("INVALID_INPUT", "args must be array");
      for (const a of request.args) {
        if (typeof a !== "string") fail("INVALID_INPUT", "args must be strings");
        if (a.includes("\x00")) fail("INVALID_INPUT", "args NUL rejected");
        if (strBytes(a) > MAX_ARG_BYTES) fail("INVALID_INPUT", "arg too long");
        dynArgs.push(a);
      }
      if (dynArgs.length > MAX_ARGS_COUNT) fail("INVALID_INPUT", "too many args");
      const totalBytes = dynArgs.reduce((s, a) => s + strBytes(a), 0);
      if (totalBytes > MAX_TOTAL_ARGS_BYTES) fail("INVALID_INPUT", "args total bytes exceeded");
    }
    const finalArgs = [...pe.fixedArgs, ...dynArgs];

    // cwd
    const cwd = validateString(request.cwd, "cwd");
    checkCwdContainment(cwd, this.cwdRoots);

    // stdin
    let stdinBuf: Buffer | null = null;
    if (request.stdin !== undefined) {
      if (pe.stdinMode === "forbidden") fail("INVALID_INPUT", "stdin not allowed");
      if (typeof request.stdin === "string") stdinBuf = Buffer.from(request.stdin, "utf8");
      else if (request.stdin instanceof Uint8Array) stdinBuf = Buffer.from(request.stdin);
      else fail("INVALID_INPUT", "stdin must be string or Uint8Array");
      if (stdinBuf.length > this.maxStdinBytes) fail("INVALID_INPUT", "stdin too large");
    } else if (pe.stdinMode === "required") {
      fail("INVALID_INPUT", "stdin required");
    }

    // env
    const env = buildEnv(this.fixedEnv, this.allowedEnvKeys, request.env);

    // limits
    const timeoutMs = safeInt(request.timeoutMs ?? this.defaultTimeoutMs, MIN_TIMEOUT, MAX_TIMEOUT, "timeoutMs");
    const maxStdout = safeInt(request.maxStdoutBytes ?? this.defaultMaxStdoutBytes, 1, MAX_OUTPUT_BYTES, "maxStdoutBytes");
    const maxStderr = safeInt(request.maxStderrBytes ?? this.defaultMaxStderrBytes, 1, MAX_OUTPUT_BYTES, "maxStderrBytes");

    // ═══════════════════════════════════════════════════════
    // Spawn
    // ═══════════════════════════════════════════════════════
    const startTime = Date.now();
    let child: ChildProcess;
    try {
      child = childProcess.spawn(pe.canonicalPath, finalArgs, {
        shell: false,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        cwd,
        env,
      } as SpawnOptions);
    } catch (e) {
      if (e instanceof LoopPosixProcessRunnerError) throw e;
      fail("PROCESS_SPAWN_FAILED", "spawn failed");
    }

    const pid = child.pid;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
      try { child.kill("SIGKILL"); } catch { /* best-effort */ }
      fail("PROCESS_SPAWN_FAILED", "invalid child pid");
    }

    // ═══════════════════════════════════════════════════════
    // Stream collectors
    // ═══════════════════════════════════════════════════════
    const stdoutCol = new BoundedCollector(maxStdout);
    const stderrCol = new BoundedCollector(maxStderr);

    // ═══════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════
    let settled = false;
    let termSignalSent = false;
    let killSignalSent = false;
    let closeCode: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;
    let ioError: LoopPosixProcessRunnerError | null = null;
    let timedOut = false;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const cleanupTimers = () => { for (const t of timers) clearTimeout(t); timers = []; };

    const cleanupProcessGroup = (): void => {
      if (termSignalSent) return;
      termSignalSent = true;
      try { process.kill(-pid!, "SIGTERM"); } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") {
          if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_CLEANUP_FAILED", "signal failed");
        }
      }
      timers.push(setTimeout(() => {
        if (!killSignalSent) {
          killSignalSent = true;
          try { process.kill(-pid!, "SIGKILL"); } catch (e2) {
            if ((e2 as NodeJS.ErrnoException).code !== "ESRCH") {
              if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_CLEANUP_FAILED", "kill signal failed");
            }
          }
          // Final deadline after SIGKILL
          timers.push(setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanupTimers();
              if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_CLEANUP_FAILED", "cleanup deadline exceeded");
              rejectSettle(ioError!);
            }
          }, this.terminationGraceMs));
        }
      }, this.terminationGraceMs));
    };

    let resolveSettle: (result: LoopPosixProcessResult) => void;
    let rejectSettle: (error: Error) => void;

    const promise = new Promise<LoopPosixProcessResult>((resolve, reject) => {
      resolveSettle = resolve;
      rejectSettle = reject;

      const settle = (): void => {
        if (settled) return;
        settled = true;
        cleanupTimers();

        if (ioError) { reject(ioError); return; }

        const duration = Date.now() - startTime;
        const result: LoopPosixProcessResult = Object.freeze({
          status: timedOut ? "timed_out" : "exited",
          exitCode: closeCode,
          signal: closeSignal,
          durationMs: duration,
          stdout: stdoutCol.finalize(),
          stderr: stderrCol.finalize(),
          stdoutBytesReceived: stdoutCol.bytesReceived,
          stderrBytesReceived: stderrCol.bytesReceived,
          stdoutTruncated: stdoutCol.truncated,
          stderrTruncated: stderrCol.truncated,
          termSignalSent,
          killSignalSent,
        });
        resolve(result);
      };

      // stdout drain
      child.stdout!.on("data", (chunk: Buffer) => stdoutCol.push(chunk));
      child.stdout!.on("error", (e) => {
        if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_IO_FAILED", "stdout stream error");
        cleanupProcessGroup();
      });

      // stderr drain
      child.stderr!.on("data", (chunk: Buffer) => stderrCol.push(chunk));
      child.stderr!.on("error", (e) => {
        if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_IO_FAILED", "stderr stream error");
        cleanupProcessGroup();
      });

      // child error
      child.on("error", (e) => {
        if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_SPAWN_FAILED", "child process error");
        cleanupProcessGroup();
      });

      // child close
      child.on("close", (code, signal) => {
        closeCode = code;
        closeSignal = signal as NodeJS.Signals | null;
        settle();
      });

      // stdin
      if (stdinBuf !== null) {
        try {
          child.stdin!.write(stdinBuf);
          child.stdin!.end();
        } catch (e) {
          if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_IO_FAILED", "stdin write failed");
          cleanupProcessGroup();
        }
      } else {
        child.stdin!.end();
      }
      child.stdin!.on("error", (e) => {
        if (!ioError) ioError = new LoopPosixProcessRunnerError("PROCESS_IO_FAILED", "stdin pipe error");
        cleanupProcessGroup();
      });

      // timeout
      if (timeoutMs > 0) {
        timers.push(setTimeout(() => {
          timedOut = true;
          cleanupProcessGroup();
        }, timeoutMs));
      }
    });

    return promise;
  }
}
