// LOOP Executor Kernel — Controlled POSIX Process Runner
// ========================================================
// macOS/Linux host process runner with executable allowlist, cwd containment,
// explicit env, bounded streams, and POSIX process-group timeout/cleanup.
//
// R1: Lifecycle state model with mainError/cleanupError separation,
// single idempotent cleanup entry, post-settle signal guard, typed stdio
// boundary, copied bounded streams, executable permission mode pinning,
// runtime input validation.
//
// Dependencies on POSIX process-group semantics:
// - Uses negative PID signaling (kill(-pid, sig)) to target the entire group.
// - Requires detached:true spawn for reliable process-group ownership.
// - No Windows support. No network filesystem guarantees.
// - cwd containment assumes allowed roots are not replaced by untrusted
//   processes between validation and spawn. Node/POSIX API does not provide
//   kernel-level openat-style cwd pinning.

import type { ChildProcess } from "node:child_process";
const childProcess = require("node:child_process") as typeof import("node:child_process");
import * as fs from "node:fs";
import { isAbsolute, sep } from "node:path";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type LoopPosixExecutablePolicy = Readonly<{
  id: string; executablePath: string; fixedArgs?: readonly string[];
  allowDynamicArgs?: boolean; stdinMode?: "forbidden" | "optional" | "required";
}>;
export type LoopPosixProcessRunnerOptions = Readonly<{
  executables: readonly LoopPosixExecutablePolicy[];
  allowedCwdRoots: readonly string[];
  fixedEnv?: Readonly<Record<string, string>>;
  allowedRequestEnvKeys?: readonly string[];
  defaultTimeoutMs?: number; terminationGraceMs?: number;
  defaultMaxStdoutBytes?: number; defaultMaxStderrBytes?: number;
  maxStdinBytes?: number;
}>;
export type LoopPosixProcessRequest = Readonly<{
  executableId: string; args?: readonly string[]; cwd: string;
  stdin?: string | Uint8Array; env?: Readonly<Record<string, string>>;
  timeoutMs?: number; maxStdoutBytes?: number; maxStderrBytes?: number;
}>;
export type LoopPosixProcessResult = Readonly<{
  status: "exited" | "timed_out"; exitCode: number | null; signal: NodeJS.Signals | null;
  durationMs: number; stdout: string; stderr: string;
  stdoutBytesReceived: number; stderrBytesReceived: number;
  stdoutTruncated: boolean; stderrTruncated: boolean;
  termSignalSent: boolean; killSignalSent: boolean;
}>;
export type LoopPosixProcessRunnerErrorCode =
  | "INVALID_INPUT" | "UNSUPPORTED_PLATFORM" | "EXECUTABLE_NOT_ALLOWED"
  | "EXECUTABLE_INVALID" | "EXECUTABLE_CHANGED" | "CWD_NOT_ALLOWED"
  | "CWD_INVALID" | "ENV_NOT_ALLOWED" | "PROCESS_SPAWN_FAILED"
  | "PROCESS_IO_FAILED" | "PROCESS_CLEANUP_FAILED";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAX_ERROR_MSG = 256;
const EXEC_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DANGEROUS_ENV_KEYS = ["LD_PRELOAD","LD_LIBRARY_PATH","DYLD_INSERT_LIBRARIES","DYLD_LIBRARY_PATH","NODE_OPTIONS","BASH_ENV","ENV"];
const MAX_ARGS = 128, MAX_ARG_B = 4096, MAX_ARGS_TOTAL_B = 32768;
const MAX_ENV = 128, MAX_ENV_VAL_B = 4096, MAX_ENV_TOTAL_B = 32768;
const MAX_ALLOWED_ENV_KEYS = 128;
const DEF_TO = 120000, DEF_GRACE = 2000, DEF_SO = 1_048_576, DEF_SE = 262144, DEF_SI = 1_048_576;
const MAX_SI = 16_777_216, MAX_OUT = 16_777_216;
const MIN_TO = 100, MAX_TO = 600_000, MIN_GRACE = 10, MAX_GRACE = 10_000;

function sanitize(msg: string): string { return msg.replace(/[\x00-\x1f\x7f-\x9f]/g," ").slice(0,MAX_ERROR_MSG); }
export class LoopPosixProcessRunnerError extends Error {
  readonly code: LoopPosixProcessRunnerErrorCode;
  constructor(code: LoopPosixProcessRunnerErrorCode, message: string) { super(sanitize(message)); this.name="LoopPosixProcessRunnerError"; this.code=code; }
}
function fail(code: LoopPosixProcessRunnerErrorCode, msg: string): never { throw new LoopPosixProcessRunnerError(code, msg); }
function typedFail(code: LoopPosixProcessRunnerErrorCode, msg: string): LoopPosixProcessRunnerError { return new LoopPosixProcessRunnerError(code, msg); }

// ── validation ──
function vStr(v: unknown, label: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim()) fail("INVALID_INPUT", `${label} must be trimmed non-empty string`);
  return v;
}
function vObj(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail("INVALID_INPUT", `${label} must be a non-null non-array object`);
  return v as Record<string, unknown>;
}
function vArr(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) fail("INVALID_INPUT", `${label} must be an array`);
  return v;
}
function vInt(v: unknown, min: number, max: number, label: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) fail("INVALID_INPUT", `${label} out of range`);
  return v;
}
function strB(s: string): number { return Buffer.byteLength(s,"utf8"); }

// ═══════════════════════════════════════════════════════════════
// Executable identity
// ═══════════════════════════════════════════════════════════════

type PinnedExecutable = {
  id: string; canonicalPath: string; device: number; inode: number;
  permissionMode: number; fixedArgs: readonly string[];
  allowDynamicArgs: boolean; stdinMode: "forbidden"|"optional"|"required";
};

function validateExecutable(policy: LoopPosixExecutablePolicy): PinnedExecutable {
  const po = vObj(policy, "executable policy");
  const id = vStr(po.id, "executable.id");
  if (!EXEC_ID_RE.test(id)) fail("EXECUTABLE_INVALID","executable id format invalid");
  const path = vStr(po.executablePath, "executablePath");
  if (!isAbsolute(path)) fail("EXECUTABLE_INVALID","executablePath must be absolute");
  let s: fs.Stats;
  try { s = fs.lstatSync(path); } catch { fail("EXECUTABLE_INVALID","executable not found"); }
  if (s.isSymbolicLink()) fail("EXECUTABLE_INVALID","executable must not be symlink");
  if (!s.isFile()) fail("EXECUTABLE_INVALID","executable must be regular file");
  const permMode = s.mode & 0o7777;
  if ((s.mode & 0o111) === 0) fail("EXECUTABLE_INVALID","executable must have executable bit");
  let real: string;
  try { real = fs.realpathSync(path); } catch { fail("EXECUTABLE_INVALID","realpath failed"); }
  if (real !== path) fail("EXECUTABLE_INVALID","executable path must be canonical");

  const fa: string[] = [];
  if (po.fixedArgs !== undefined) {
    vArr(po.fixedArgs,"fixedArgs");
    for (const a of po.fixedArgs as unknown[]) {
      if (typeof a !== "string") fail("INVALID_INPUT","fixedArgs items must be strings");
      if (a.includes("\x00")) fail("INVALID_INPUT","args NUL rejected");
      if (strB(a) > MAX_ARG_B) fail("INVALID_INPUT","arg too long");
      fa.push(a);
    }
    if (fa.length > MAX_ARGS) fail("INVALID_INPUT","too many fixed args");
    if (fa.reduce((t,a)=>t+strB(a),0) > MAX_ARGS_TOTAL_B) fail("INVALID_INPUT","fixed args total bytes exceeded");
  }
  if (po.allowDynamicArgs !== undefined && typeof po.allowDynamicArgs !== "boolean") fail("INVALID_INPUT","allowDynamicArgs must be boolean");
  const ad = po.allowDynamicArgs === true;
  const sm = (po.stdinMode ?? "optional") as string;
  if (sm !== "forbidden" && sm !== "optional" && sm !== "required") fail("INVALID_INPUT","invalid stdinMode");

  return { id, canonicalPath: path, device: s.dev, inode: s.ino, permissionMode: permMode,
    fixedArgs: Object.freeze([...fa]), allowDynamicArgs: ad, stdinMode: sm };
}

function revalidateExecutable(pe: PinnedExecutable): void {
  let s: fs.Stats;
  try { s = fs.lstatSync(pe.canonicalPath); } catch { fail("EXECUTABLE_CHANGED","executable not found"); }
  if (s.isSymbolicLink()) fail("EXECUTABLE_CHANGED","executable became symlink");
  if (!s.isFile()) fail("EXECUTABLE_CHANGED","no longer regular file");
  if ((s.mode & 0o111) === 0) fail("EXECUTABLE_CHANGED","lost execute bit");
  if (s.dev !== pe.device || s.ino !== pe.inode) fail("EXECUTABLE_CHANGED","inode/device changed");
  if ((s.mode & 0o7777) !== pe.permissionMode) fail("EXECUTABLE_CHANGED","permission mode changed");
  let real: string;
  try { real = fs.realpathSync(pe.canonicalPath); } catch { fail("EXECUTABLE_CHANGED","realpath failed"); }
  if (real !== pe.canonicalPath) fail("EXECUTABLE_CHANGED","canonical path changed");
}

// ═══════════════════════════════════════════════════════════════
// cwd roots
// ═══════════════════════════════════════════════════════════════

type CwdRoot = { canonicalPath: string; device: number; inode: number };

function validateCwdRoot(path: string): CwdRoot {
  if (!isAbsolute(path)) fail("INVALID_INPUT","cwd root must be absolute");
  if (path === "/") fail("INVALID_INPUT","cwd root must not be filesystem root");
  let s: fs.Stats;
  try { s = fs.lstatSync(path); } catch { fail("INVALID_INPUT","cwd root not found"); }
  if (s.isSymbolicLink()) fail("INVALID_INPUT","cwd root must not be symlink");
  if (!s.isDirectory()) fail("INVALID_INPUT","cwd root must be directory");
  let real: string;
  try { real = fs.realpathSync(path); } catch { fail("INVALID_INPUT","realpath failed"); }
  if (real !== path) fail("INVALID_INPUT","cwd root must be canonical");
  return { canonicalPath: path, device: s.dev, inode: s.ino };
}

function revalidateCwdRoot(root: CwdRoot): void {
  let s: fs.Stats;
  try { s = fs.lstatSync(root.canonicalPath); } catch { fail("CWD_INVALID","cwd root not found"); }
  if (s.isSymbolicLink()) fail("CWD_INVALID","cwd root became symlink");
  if (!s.isDirectory()) fail("CWD_INVALID","cwd root not directory");
  if (s.dev !== root.device || s.ino !== root.inode) fail("CWD_INVALID","cwd root inode/device changed");
  let real: string;
  try { real = fs.realpathSync(root.canonicalPath); } catch { fail("CWD_INVALID","realpath failed"); }
  if (real !== root.canonicalPath) fail("CWD_INVALID","cwd root canonical path changed");
}

function checkCwd(cwd: string, roots: readonly CwdRoot[]): CwdRoot {
  if (!isAbsolute(cwd)) fail("CWD_INVALID","cwd must be absolute");
  let s: fs.Stats;
  try { s = fs.lstatSync(cwd); } catch { fail("CWD_INVALID","cwd not found"); }
  if (s.isSymbolicLink()) fail("CWD_INVALID","cwd must not be symlink");
  if (!s.isDirectory()) fail("CWD_INVALID","cwd must be directory");
  let real: string;
  try { real = fs.realpathSync(cwd); } catch { fail("CWD_INVALID","realpath failed"); }
  if (real !== cwd) fail("CWD_INVALID","cwd must be canonical");

  for (const root of roots) {
    if (cwd === root.canonicalPath || (cwd.startsWith(root.canonicalPath + sep))) {
      revalidateCwdRoot(root);
      return root;
    }
  }
  fail("CWD_NOT_ALLOWED","cwd not within allowed roots");
}

// ═══════════════════════════════════════════════════════════════
// Env
// ═══════════════════════════════════════════════════════════════

function validateEnvKey(k: string): void {
  if (!ENV_KEY_RE.test(k)) fail("INVALID_INPUT","env key format invalid");
  if (DANGEROUS_ENV_KEYS.some(d => d === k.toUpperCase())) fail("ENV_NOT_ALLOWED","dangerous env key");
}

function buildEnv(fixedEnv: Record<string,string>, allowedKeys: readonly string[], reqEnv: Record<string,string> | undefined): Record<string,string> {
  const env: Record<string,string> = Object.create(null);
  for (const [k,v] of Object.entries(fixedEnv)) { env[k] = v; }
  if (reqEnv) {
    const allowed = new Set(allowedKeys);
    for (const [k,v] of Object.entries(reqEnv)) {
      if (!allowed.has(k)) fail("ENV_NOT_ALLOWED","env key not allowed");
      if (k in env) fail("ENV_NOT_ALLOWED","cannot override fixed env");
      if (typeof v !== "string" || v.includes("\x00")) fail("INVALID_INPUT","env value invalid");
      if (strB(v) > MAX_ENV_VAL_B) fail("INVALID_INPUT","env value too long");
      validateEnvKey(k);
      env[k] = v;
    }
  }
  // Final bounds check
  const keys = Object.keys(env);
  if (keys.length > MAX_ENV) fail("INVALID_INPUT","too many total env entries");
  let totalB = 0;
  for (const k of keys) totalB += strB(k) + strB(env[k]!);
  if (totalB > MAX_ENV_TOTAL_B) fail("INVALID_INPUT","env total bytes exceeded");
  return env;
}

// ═══════════════════════════════════════════════════════════════
// Bounded collector (copied chunks, no shared backing store)
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
      const rem = this.limit - this.retainedBytes;
      if (chunk.length <= rem) {
        this.chunks.push(Buffer.from(chunk));
        this.retainedBytes += chunk.length;
      } else {
        if (rem > 0) this.chunks.push(Buffer.from(chunk.subarray(0, rem)));
        this.retainedBytes += rem;
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
  private readonly exes: ReadonlyMap<string, PinnedExecutable>;
  private readonly roots: readonly CwdRoot[];
  private readonly fEnv: Readonly<Record<string,string>>;
  private readonly aEnvKeys: readonly string[];
  private readonly defTo: number;
  private readonly grace: number;
  private readonly defSo: number;
  private readonly defSe: number;
  private readonly maxSi: number;

  constructor(options: LoopPosixProcessRunnerOptions) {
    if (process.platform !== "darwin" && process.platform !== "linux") fail("UNSUPPORTED_PLATFORM","macOS/Linux only");
    vObj(options,"options");

    const exes = vArr(options.executables,"executables") as LoopPosixExecutablePolicy[];
    if (exes.length === 0) fail("INVALID_INPUT","at least one executable required");
    const m = new Map<string,PinnedExecutable>();
    const seen = new Set<string>();
    for (const p of exes) {
      const pe = validateExecutable(p);
      if (seen.has(pe.id)) fail("INVALID_INPUT","duplicate executable id");
      seen.add(pe.id); m.set(pe.id, pe);
    }
    this.exes = m;

    const roots = vArr(options.allowedCwdRoots,"allowedCwdRoots") as string[];
    if (roots.length === 0) fail("INVALID_INPUT","at least one cwd root required");
    const rs: CwdRoot[] = []; const sp = new Set<string>();
    for (const r of roots) { const vr = validateCwdRoot(vStr(r,"cwd root")); if (!sp.has(vr.canonicalPath)) { sp.add(vr.canonicalPath); rs.push(vr); } }
    this.roots = Object.freeze(rs);

    // Fixed env
    const fe = options.fixedEnv ?? {};
    vObj(fe,"fixedEnv");
    const feo: Record<string,string> = Object.create(null);
    for (const [k,v] of Object.entries(fe)) {
      validateEnvKey(k);
      if (typeof v !== "string" || v.includes("\x00")) fail("INVALID_INPUT","fixed env value invalid");
      if (strB(v) > MAX_ENV_VAL_B) fail("INVALID_INPUT","fixed env value too long");
      feo[k] = v;
    }
    const feKeys = Object.keys(feo);
    if (feKeys.length > MAX_ENV) fail("INVALID_INPUT","too many fixed env entries");
    let feTotal = 0;
    for (const k of feKeys) feTotal += strB(k) + strB(feo[k]!);
    if (feTotal > MAX_ENV_TOTAL_B) fail("INVALID_INPUT","fixed env total bytes exceeded");
    this.fEnv = Object.freeze(feo);

    // Allowed env keys
    const aeks = options.allowedRequestEnvKeys ?? [];
    vArr(aeks,"allowedRequestEnvKeys");
    const aekSet = new Set<string>();
    const aekList: string[] = [];
    for (const k of aeks as unknown[]) {
      if (typeof k !== "string") fail("INVALID_INPUT","allowed env key must be string");
      validateEnvKey(k);
      if (aekSet.has(k)) fail("INVALID_INPUT","duplicate allowed env key");
      aekSet.add(k); aekList.push(k);
    }
    if (aekList.length > MAX_ALLOWED_ENV_KEYS) fail("INVALID_INPUT","too many allowed env keys");
    this.aEnvKeys = Object.freeze(aekList);

    this.defTo = vInt(options.defaultTimeoutMs ?? DEF_TO, MIN_TO, MAX_TO, "defaultTimeoutMs");
    this.grace = vInt(options.terminationGraceMs ?? DEF_GRACE, MIN_GRACE, MAX_GRACE, "terminationGraceMs");
    this.defSo = vInt(options.defaultMaxStdoutBytes ?? DEF_SO, 1, MAX_OUT, "defaultMaxStdoutBytes");
    this.defSe = vInt(options.defaultMaxStderrBytes ?? DEF_SE, 1, MAX_OUT, "defaultMaxStderrBytes");
    this.maxSi = vInt(options.maxStdinBytes ?? DEF_SI, 1, MAX_SI, "maxStdinBytes");
  }

  async run(request: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
    vObj(request,"request");
    const rid = vStr(request.executableId,"executableId");
    const pe = this.exes.get(rid);
    if (!pe) fail("EXECUTABLE_NOT_ALLOWED","executable id not registered");
    revalidateExecutable(pe);

    // args
    const dynArgs: string[] = [];
    if (request.args !== undefined) {
      vArr(request.args,"args");
      const argsArr = request.args as unknown[];
      if (argsArr.length > 0) {
        if (!pe.allowDynamicArgs) fail("INVALID_INPUT","dynamic args not allowed");
        for (const a of argsArr) {
        if (typeof a !== "string") fail("INVALID_INPUT","args must be strings");
        if (a.includes("\x00")) fail("INVALID_INPUT","args NUL rejected");
        if (strB(a) > MAX_ARG_B) fail("INVALID_INPUT","arg too long");
        dynArgs.push(a);
      }
      if (dynArgs.length > MAX_ARGS) fail("INVALID_INPUT","too many args");
      if (dynArgs.reduce((t,a)=>t+strB(a),0) > MAX_ARGS_TOTAL_B) fail("INVALID_INPUT","args total bytes exceeded");
    }
    const finalArgs = [...pe.fixedArgs, ...dynArgs];

    // cwd
    const cwd = vStr(request.cwd,"cwd");
    checkCwd(cwd, this.roots);

    // stdin
    let stdinBuf: Buffer | null = null;
    if (request.stdin !== undefined) {
      if (pe.stdinMode === "forbidden") fail("INVALID_INPUT","stdin not allowed");
      if (typeof request.stdin === "string") stdinBuf = Buffer.from(request.stdin,"utf8");
      else if (request.stdin instanceof Uint8Array) stdinBuf = Buffer.from(request.stdin);
      else fail("INVALID_INPUT","stdin must be string or Uint8Array");
      if (stdinBuf.length > this.maxSi) fail("INVALID_INPUT","stdin too large");
    } else if (pe.stdinMode === "required") {
      fail("INVALID_INPUT","stdin required");
    }

    // env
    const reqEnv = request.env !== undefined ? vObj(request.env,"env") as Record<string,string> : undefined;
    const env = buildEnv(this.fEnv, this.aEnvKeys, reqEnv);

    // limits
    const to = vInt(request.timeoutMs ?? this.defTo, MIN_TO, MAX_TO, "timeoutMs");
    const mxo = vInt(request.maxStdoutBytes ?? this.defSo, 1, MAX_OUT, "maxStdoutBytes");
    const mxe = vInt(request.maxStderrBytes ?? this.defSe, 1, MAX_OUT, "maxStderrBytes");

    // ═══════════════════════════════════════════════════════════
    // Lifecycle state
    // ═══════════════════════════════════════════════════════════
    let mainError: LoopPosixProcessRunnerError | null = null;
    let cleanupError: LoopPosixProcessRunnerError | null = null;
    let timedOut = false;
    let closeSeen = false;
    let settled = false;
    let cleanupStarted = false;
    let termSignalSent = false;
    let killSignalSent = false;
    let closeCode: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;
    let pid: number | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clrTimers = () => { for (const t of timers) clearTimeout(t); timers.length = 0; };

    let resolveSettle: (r: LoopPosixProcessResult) => void = () => {};
    let rejectSettle: (e: Error) => void = () => {};
    const promise = new Promise<LoopPosixProcessResult>((res, rej) => { resolveSettle = res; rejectSettle = rej; });

    const settle = (): void => {
      if (settled) return;
      settled = true; clrTimers();
      // Final priority: cleanupError > mainError > timedOut > exited
      if (cleanupError) { rejectSettle(cleanupError); return; }
      if (mainError) { rejectSettle(mainError); return; }
      const dur = Date.now() - startTime;
      const result: LoopPosixProcessResult = Object.freeze({
        status: timedOut ? "timed_out" : "exited",
        exitCode: closeCode, signal: closeSignal, durationMs: dur,
        stdout: stdoutCol.finalize(), stderr: stderrCol.finalize(),
        stdoutBytesReceived: stdoutCol.bytesReceived, stderrBytesReceived: stderrCol.bytesReceived,
        stdoutTruncated: stdoutCol.truncated, stderrTruncated: stderrCol.truncated,
        termSignalSent, killSignalSent,
      });
      resolveSettle(result);
    };

    // ═══════════════════════════════════════════════════════════
    // Single idempotent cleanup entry
    // ═══════════════════════════════════════════════════════════
    const requestProcessGroupCleanup = (reason: LoopPosixProcessRunnerError | null): void => {
      if (settled || closeSeen || cleanupStarted) return;
      cleanupStarted = true;

      const doTerm = (): void => {
        if (settled || closeSeen || pid === null || pid <= 0) return;
        try { process.kill(-pid, "SIGTERM"); termSignalSent = true; } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ESRCH") cleanupError = typedFail("PROCESS_CLEANUP_FAILED","TERM signal failed");
        }
        timers.push(setTimeout(() => {
          if (settled || closeSeen) return;
          if (pid !== null && pid > 0) {
            try { process.kill(-pid, "SIGKILL"); killSignalSent = true; } catch (e2) {
              if ((e2 as NodeJS.ErrnoException).code !== "ESRCH") cleanupError = typedFail("PROCESS_CLEANUP_FAILED","KILL signal failed");
            }
          }
          timers.push(setTimeout(() => {
            if (settled || closeSeen) return;
            cleanupError = typedFail("PROCESS_CLEANUP_FAILED","cleanup deadline exceeded");
            settle();
          }, this.grace));
        }, this.grace));
      };

      doTerm();
    };

    // ═══════════════════════════════════════════════════════════
    // Spawn
    // ═══════════════════════════════════════════════════════════
    const startTime = Date.now();
    const stdoutCol = new BoundedCollector(mxo);
    const stderrCol = new BoundedCollector(mxe);
    let child: ChildProcess;

    // Spawn (sync throw → PROCESS_SPAWN_FAILED)
    try {
      child = childProcess.spawn(pe.canonicalPath, finalArgs, {
        shell: false, detached: true, stdio: ["pipe","pipe","pipe"], cwd, env,
      });
    } catch (e) {
      if (e instanceof LoopPosixProcessRunnerError) throw e;
      fail("PROCESS_SPAWN_FAILED","spawn failed");
    }

    // Install child error listener BEFORE pid/stdio checks
    try {
      child.on("error", (e) => {
        if (settled || closeSeen) return;
        mainError = typedFail("PROCESS_SPAWN_FAILED","child process error");
        requestProcessGroupCleanup(mainError);
      });
    } catch {
      if (!settled && !closeSeen) {
        mainError = typedFail("PROCESS_SPAWN_FAILED","child error listener install failed");
        if (pid !== null) requestProcessGroupCleanup(mainError); else { settled = true; clrTimers(); rejectSettle(mainError); }
      }
    }

    // PID check — invalid PID → immediate bounded settle
    const rawPid = child.pid;
    if (typeof rawPid === "number" && Number.isSafeInteger(rawPid) && rawPid > 0) {
      pid = rawPid;
    } else {
      mainError = typedFail("PROCESS_SPAWN_FAILED","invalid child pid");
      // No valid PID → cannot send group signals. Settle immediately.
      if (!settled) { settled = true; clrTimers(); rejectSettle(mainError); }
      // Keep guarded error listener for late events; return settled promise
    }

    // Stdio checks
    const stdioOk = child.stdin && child.stdout && child.stderr;
    if (!stdioOk) {
      if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","missing stdio pipe");
      if (pid !== null) {
        requestProcessGroupCleanup(mainError);
      } else {
        // Invalid PID + missing stdio → already settled above, nothing more to do
      }
    }

    // stdout
    if (child.stdout && !settled) {
      try {
        child.stdout.on("data", (chunk: Buffer) => {
          if (settled || closeSeen) return;
          try { stdoutCol.push(chunk); } catch {
            if (!settled && !closeSeen) {
              if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stdout data handling error");
              requestProcessGroupCleanup(mainError);
            }
          }
        });
        child.stdout.on("error", () => {
          if (settled || closeSeen) return;
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stdout stream error");
          requestProcessGroupCleanup(mainError);
        });
      } catch {
        if (!settled && !closeSeen) {
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stdout listener install failed");
          requestProcessGroupCleanup(mainError);
        }
      }
    }
    // stderr
    if (child.stderr && !settled) {
      try {
        child.stderr.on("data", (chunk: Buffer) => {
          if (settled || closeSeen) return;
          try { stderrCol.push(chunk); } catch {
            if (!settled && !closeSeen) {
              if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stderr data handling error");
              requestProcessGroupCleanup(mainError);
            }
          }
        });
        child.stderr.on("error", () => {
          if (settled || closeSeen) return;
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stderr stream error");
          requestProcessGroupCleanup(mainError);
        });
      } catch {
        if (!settled && !closeSeen) {
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stderr listener install failed");
          requestProcessGroupCleanup(mainError);
        }
      }
    }

    // close
    try {
      child.on("close", (code, signal) => {
        if (closeSeen) return;
        closeSeen = true;
        closeCode = code;
        closeSignal = signal as NodeJS.Signals | null;
        settle();
      });
    } catch {
      if (!settled && !closeSeen) {
        if (!mainError) mainError = typedFail("PROCESS_SPAWN_FAILED","close listener install failed");
        if (pid !== null) requestProcessGroupCleanup(mainError); else { settled = true; clrTimers(); rejectSettle(mainError); }
      }
    }

    // stdin
    if (child.stdin && !settled) {
      try {
        child.stdin.on("error", () => {
          if (settled || closeSeen) return;
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stdin pipe error");
          requestProcessGroupCleanup(mainError);
        });
        if (stdinBuf !== null) {
          try { child.stdin.write(stdinBuf); } catch {
            if (!settled && !closeSeen && !mainError) mainError = typedFail("PROCESS_IO_FAILED","stdin write failed");
            if (pid !== null) requestProcessGroupCleanup(mainError);
          }
          try { child.stdin.end(); } catch {
            if (!settled && !closeSeen && !mainError) mainError = typedFail("PROCESS_IO_FAILED","stdin end failed");
            if (pid !== null) requestProcessGroupCleanup(mainError);
          }
        } else {
          try { child.stdin.end(); } catch {
            if (!settled && !closeSeen && !mainError) mainError = typedFail("PROCESS_IO_FAILED","stdin end failed");
            if (pid !== null) requestProcessGroupCleanup(mainError);
          }
        }
      } catch {
        if (!settled && !closeSeen) {
          if (!mainError) mainError = typedFail("PROCESS_IO_FAILED","stdin listener install failed");
          if (pid !== null) requestProcessGroupCleanup(mainError);
        }
      }
    }

    // timeout
    if (to > 0) {
      timers.push(setTimeout(() => {
        if (settled || closeSeen) return;
        timedOut = true;
        requestProcessGroupCleanup(null);
      }, to));
    }

    return promise;
  }
}
}
