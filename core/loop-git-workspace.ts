// LOOP Executor Kernel — Isolated Git Workspace Lifecycle (Hardened C1)
// ========================================================
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopPosixProcessRunner, LoopPosixProcessRequest, LoopPosixProcessResult } from "./loop-posix-process-runner";

// ═══════════════════════════════════════ Types
export type LoopGitWorkspaceErrorCode =
  | "INVALID_INPUT" | "UNSUPPORTED_PLATFORM" | "REPOSITORY_INVALID" | "REPOSITORY_MISMATCH"
  | "BASE_SHA_MISMATCH" | "SOURCE_WORKSPACE_DRIFT" | "SOURCE_WIP_TOO_LARGE" | "SOURCE_WIP_UNSUPPORTED"
  | "TASK_BRANCH_CONFLICT" | "WORKTREE_CONFLICT" | "WORKSPACE_NOT_FOUND" | "WORKSPACE_CORRUPT"
  | "WORKSPACE_DIRTY" | "GIT_COMMAND_FAILED" | "WORKSPACE_IO_FAILED" | "CLEANUP_BLOCKED";

const MAX_MSG = 256;
function sn(msg: string): string { return msg.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, MAX_MSG); }

export class LoopGitWorkspaceError extends Error {
  readonly code: LoopGitWorkspaceErrorCode;
  constructor(code: LoopGitWorkspaceErrorCode, msg: string) { super(sn(msg)); this.name = "LoopGitWorkspaceError"; this.code = code; }
}
function fail(c: LoopGitWorkspaceErrorCode, m: string): never { throw new LoopGitWorkspaceError(c, m); }
function tf(c: LoopGitWorkspaceErrorCode, m: string): LoopGitWorkspaceError { return new LoopGitWorkspaceError(c, m); }

export type LoopGitWorkspaceManagerOptions = Readonly<{
  runner: Pick<LoopPosixProcessRunner, "run">;
  gitExecutableId: string;
  gitTimeoutMs?: number;
  maxGitOutputBytes?: number;
  maxSourceWipBytes?: number;
}>;

export type LoopGitWorkspaceSnapshot = Readonly<{
  state: "created" | "recovered" | "inspected";
  runId: string; repository: string; repositoryPath: string; controlRoot: string;
  gitCommonDir: string; workspacePath: string; baseBranch: string;
  expectedBaseSha: string; currentBaseSha: string; baseDrifted: boolean;
  taskBranch: string; taskHeadSha: string; taskHasChanges: boolean;
  taskStatusDigestSha256: string; sourceHeadSha: string; sourceBranch: string | null;
  sourceWipDigestSha256: string;
}>;

export type LoopGitWorkspaceCleanupOptions = Readonly<{
  expectedTaskHeadSha: string; deleteTaskBranch?: boolean;
}>;

export type LoopGitWorkspaceCleanupResult = Readonly<{
  workspacePath: string; worktreeRemoved: boolean; taskBranchDeleted: boolean;
  taskBranchRetained: boolean; alreadyAbsent: boolean;
}>;

// ═══════════════════════════════════════ Constants
const SHA_RE = /^[0-9a-f]{40}$/;
const GH_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const NON_CONTROL = /[\x00-\x1f\x7f]/;
const DEF_TO = 30000, MIN_TO = 100, MAX_TO = 120000;
const DEF_OUT = 1048576, MIN_OUT = 1, MAX_OUT = 16777216;
const DEF_WIP = 16777216;
const ORIGIN_RE = /^(?:https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$|git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$|ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$)/;
const ALLOWED_MGR_KEYS = ["runner","gitExecutableId","gitTimeoutMs","maxGitOutputBytes","maxSourceWipBytes"];
const ALLOWED_CLEANUP_KEYS = ["expectedTaskHeadSha","deleteTaskBranch"];

// ═══════════════════════════════════════ Descriptor-based plain-record scanner
function scanPlain(v: unknown, allowedKeys: readonly string[], nm: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") fail("INVALID_INPUT", `${nm} must be object`);
  if (Array.isArray(v)) fail("INVALID_INPUT", `${nm} must not be array`);
  let proto: unknown;
  try { proto = Object.getPrototypeOf(v); } catch { fail("INVALID_INPUT", `${nm} getPrototypeOf threw`); }
  if (proto !== Object.prototype && proto !== null) fail("INVALID_INPUT", `${nm} bad prototype`);
  let keys: Array<string | symbol>;
  try { keys = Reflect.ownKeys(v) as Array<string | symbol>; } catch { fail("INVALID_INPUT", `${nm} ownKeys threw`); }
  const out = Object.create(null) as Record<string, unknown>;
  const seen = new Set<string>();
  for (const k of keys) {
    if (typeof k === "symbol") fail("INVALID_INPUT", `${nm} symbol key`);
    if (k === "__proto__") fail("INVALID_INPUT", `${nm} __proto__ key`);
    if (!allowedKeys.includes(k)) fail("INVALID_INPUT", `${nm} unknown key`);
    if (seen.has(k)) fail("INVALID_INPUT", `${nm} duplicate key`);
    seen.add(k);
    let desc: PropertyDescriptor;
    try { desc = Object.getOwnPropertyDescriptor(v, k)!; } catch { fail("INVALID_INPUT", `${nm} getDescriptor threw`); }
    if (!desc) fail("INVALID_INPUT", `${nm} missing descriptor`);
    if ("get" in desc || "set" in desc) fail("INVALID_INPUT", `${nm} accessor`);
    if (!("value" in desc)) fail("INVALID_INPUT", `${nm} no value`);
    Object.defineProperty(out, k, { value: desc.value, writable: false, enumerable: true, configurable: false });
  }
  return out;
}

// ═══════════════════════════════════════ Helpers
function sha256Hex(data: Buffer | string): string { return crypto.createHash("sha256").update(data).digest("hex"); }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function vS(v: unknown, nm: string): string { if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim()) fail("INVALID_INPUT", `${nm} invalid`); return v; }
function vI(v: unknown, min: number, max: number, nm: string): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) fail("INVALID_INPUT", `${nm} out of range`); return v; }
function vSha(s: string, nm: string): string { if (!SHA_RE.test(s)) fail("INVALID_INPUT", `${nm} must be 40-char hex`); return s; }
function vAbsPath(p: string, nm: string): string {
  if (!path.isAbsolute(p)) fail("INVALID_INPUT", `${nm} not absolute`);
  let st: fs.Stats; try { st = fs.lstatSync(p); } catch (e) { fail("INVALID_INPUT", (e as NodeJS.ErrnoException).code === "ENOENT" ? `${nm} not found` : `${nm} lstat failed`); }
  if (st.isSymbolicLink()) fail("INVALID_INPUT", `${nm} is symlink`); if (!st.isDirectory()) fail("INVALID_INPUT", `${nm} not directory`);
  let r: string; try { r = fs.realpathSync(p); } catch { fail("INVALID_INPUT", `${nm} realpath failed`); }
  if (r !== p) fail("INVALID_INPUT", `${nm} not canonical`); return r;
}
function validateIdentity(id: LoopRunIdentity): void {
  try { validateLoopRunIdentity(id); } catch { fail("INVALID_INPUT", "identity invalid"); }
}

// ═══════════════════════════════════════ Manager
export class LoopGitWorkspaceManager {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly gitId: string;
  private readonly gTo: number;
  private readonly mxOut: number;
  private readonly mxWip: number;

  constructor(o: LoopGitWorkspaceManagerOptions) {
    if (process.platform !== "darwin" && process.platform !== "linux") fail("UNSUPPORTED_PLATFORM", "os");
    const opts = scanPlain(o, ALLOWED_MGR_KEYS, "options");
    const runnerVal = opts.runner;
    if (!runnerVal || typeof (runnerVal as any).run !== "function") fail("INVALID_INPUT", "runner missing run");
    this.runner = runnerVal as Pick<LoopPosixProcessRunner, "run">;
    this.gitId = vS(opts.gitExecutableId, "gitExecutableId");
    this.gTo = vI(opts.gitTimeoutMs ?? DEF_TO, MIN_TO, MAX_TO, "gitTimeoutMs");
    this.mxOut = vI(opts.maxGitOutputBytes ?? DEF_OUT, MIN_OUT, MAX_OUT, "maxGitOutputBytes");
    this.mxWip = vI(opts.maxSourceWipBytes ?? DEF_WIP, 1, MAX_OUT, "maxSourceWipBytes");
  }

  workspacePathFor(identity: LoopRunIdentity): string {
    validateIdentity(identity);
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    const rp = vAbsPath(identity.repositoryPath, "repositoryPath");
    if (rp === cr) fail("INVALID_INPUT", "repoPath equals controlRoot");
    const canonKey = JSON.stringify([
      "loop-git-workspace-v1", identity.runId, identity.requirementId,
      identity.repository.toLowerCase(), rp, identity.baseBranch,
      identity.expectedBaseSha, identity.taskBranch, cr,
    ]);
    const digest = sha256Hex(Buffer.from(canonKey, "utf8"));
    const wsDir = path.join(cr, "workspaces", "v1", digest);
    if (path.relative(cr, wsDir).startsWith("..") || path.isAbsolute(path.relative(cr, wsDir))) fail("INVALID_INPUT", "path outside controlRoot");
    return wsDir;
  }

  async prepare(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateIdentity(identity);
    await this._valAll(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    let mainErr: LoopGitWorkspaceError | null = null;
    try {
      const wsPath = this.workspacePathFor(identity);
      await this._ensureDirs(wsPath);
      const curBase = await this._curBase(identity);
      if (curBase !== identity.expectedBaseSha) fail("BASE_SHA_MISMATCH", "base mismatch");
      const exist = await this._findWt(identity, wsPath);
      if (exist.state === "exact") {
        await this._verifyWs(identity, wsPath, exist.taskHead);
        if ((await this._isAnc(wsPath, identity.expectedBaseSha, exist.taskHead)) === false) fail("TASK_BRANCH_CONFLICT", "base not ancestor");
        return await this._snap(identity, wsPath, "recovered", curBase, false);
      }
      if (exist.state === "branch_only") return await this._attachBr(identity, wsPath, exist.taskHead, curBase);
      return await this._createWt(identity, wsPath, curBase);
    } catch (e) { if (e instanceof LoopGitWorkspaceError) mainErr = e; else mainErr = tf("GIT_COMMAND_FAILED", "git error"); throw mainErr; }
    finally {
      let fpA = fpB;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch { /* after-fingerprint failure → drift */ }
      if (fpB !== fpA) { if (mainErr) throw mainErr; throw tf("SOURCE_WORKSPACE_DRIFT", "source drifted"); }
    }
  }

  async inspect(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateIdentity(identity);
    await this._valAll(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    try {
      const wsPath = this.workspacePathFor(identity);
      const curBase = await this._curBase(identity);
      const drifted = curBase !== identity.expectedBaseSha;
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath);
      if (!f || f.prunable || !f.pExists) {
        const lr = this._safeLstat(wsPath);
        if (lr === "exists") fail("WORKTREE_CONFLICT", "path exists unregistered");
        if (lr === "error") fail("WORKSPACE_IO_FAILED", "lstat failed");
        if (f && f.prunable) fail("WORKSPACE_CORRUPT", "prunable");
        fail("WORKSPACE_NOT_FOUND", "not found");
      }
      if (f.detached) fail("WORKSPACE_CORRUPT", "detached");
      await this._verifyWs(identity, wsPath, f.h);
      return await this._snap(identity, wsPath, "inspected", curBase, drifted);
    } finally {
      let fpA = fpB;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch {}
      if (fpB !== fpA) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  async cleanup(identity: LoopRunIdentity, opts: LoopGitWorkspaceCleanupOptions): Promise<LoopGitWorkspaceCleanupResult> {
    validateIdentity(identity);
    await this._valAll(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    try {
      const o = scanPlain(opts, ALLOWED_CLEANUP_KEYS, "cleanup");
      const expHead = vSha(vS(o.expectedTaskHeadSha, "expectedTaskHeadSha"), "expectedTaskHeadSha");
      const delBr = o.deleteTaskBranch === true;
      const wsPath = this.workspacePathFor(identity);
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath && !w.prunable && w.pExists);

      // If branch exists, verify HEAD matches
      const brRef = `refs/heads/${identity.taskBranch}`;
      const brCheck = await this._gitR(identity.repositoryPath, ["show-ref","--verify","--quiet",brRef], [0, 1]);
      const brExists = brCheck.exitCode === 0;

      if (brExists) {
        const brH = (await this._gitR(identity.repositoryPath, ["rev-parse","--verify",brRef], [0])).stdout.trim();
        if (brH !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");
        if ((await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, expHead)) === false) fail("CLEANUP_BLOCKED", "base not ancestor");
        // Check not in use by other worktree
        const other = wts.find(w => w.branch === identity.taskBranch && !w.prunable && w.pExists && w.p !== (f ? f.p : ""));
        if (other) fail("CLEANUP_BLOCKED", "branch in use");
      }

      if (!f) {
        if (!brExists) return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: false, taskBranchRetained: false, alreadyAbsent: true });
        const lr = this._safeLstat(wsPath);
        if (lr === "exists") fail("WORKTREE_CONFLICT", "path exists unregistered");
        if (!delBr) return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: false, taskBranchRetained: true, alreadyAbsent: false });
        try { await this._git(identity.repositoryPath, ["branch","-d",identity.taskBranch]); } catch { fail("CLEANUP_BLOCKED", "branch delete rejected"); }
        return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: true, taskBranchRetained: false, alreadyAbsent: false });
      }

      await this._verifyWs(identity, wsPath, expHead);
      // Check clean
      const status = (await this._gitR(wsPath, ["status","--porcelain=v1","-z","--untracked-files=all"], [0])).stdout;
      if (status.length > 0) fail("WORKSPACE_DIRTY", "workspace dirty");
      // Remove worktree
      await this._git(identity.repositoryPath, ["worktree","remove",wsPath]);
      // Re-read state after remove
      const wts2 = await this._wtList(identity.repositoryPath);
      const f2 = wts2.find(w => w.p === wsPath && !w.prunable && w.pExists);
      if (f2) fail("CLEANUP_BLOCKED", "worktree still registered");
      // Re-read branch HEAD
      const brH2 = (await this._gitR(identity.repositoryPath, ["rev-parse","--verify",brRef], [0])).stdout.trim();
      if (brH2 !== expHead) fail("CLEANUP_BLOCKED", "head changed");
      const other2 = wts2.find(w => w.branch === identity.taskBranch && !w.prunable && w.pExists);
      if (other2) fail("CLEANUP_BLOCKED", "branch re-attached");

      let bDel = false, bRet = true;
      if (delBr) {
        try { await this._git(identity.repositoryPath, ["branch","-d",identity.taskBranch]); bDel = true; bRet = false; } catch { fail("CLEANUP_BLOCKED", "branch delete rejected"); }
      }
      return freeze({ workspacePath: wsPath, worktreeRemoved: true, taskBranchDeleted: bDel, taskBranchRetained: bRet, alreadyAbsent: false });
    } finally {
      let fpA = fpB;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch {}
      if (fpB !== fpA) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ═══════════════════════════════════════ Private: centralized Git (returns exitCode)
  private async _gitR(cwd: string, args: readonly string[], allowedExit: number[]): Promise<{exitCode:number;stdout:string}> {
    const req: LoopPosixProcessRequest = { executableId: this.gitId, cwd, args: Object.freeze([...args]), timeoutMs: this.gTo, maxStdoutBytes: this.mxOut, maxStderrBytes: this.mxOut };
    let r: LoopPosixProcessResult;
    try { r = await this.runner.run(req); } catch { fail("GIT_COMMAND_FAILED", "runner failed"); }
    if (r.status !== "exited") fail("GIT_COMMAND_FAILED", "not exited");
    if (r.exitCode === null || r.exitCode === undefined || !Number.isSafeInteger(r.exitCode)) fail("GIT_COMMAND_FAILED", "bad exit");
    if (r.signal !== null) fail("GIT_COMMAND_FAILED", "signal");
    if (r.stdoutTruncated || r.stderrTruncated) fail("GIT_COMMAND_FAILED", "truncated");
    if (!allowedExit.includes(r.exitCode)) fail("GIT_COMMAND_FAILED", `exit ${r.exitCode}`);
    return { exitCode: r.exitCode, stdout: r.stdout };
  }
  private async _git(cwd: string, args: readonly string[]): Promise<string> { return (await this._gitR(cwd, args, [0])).stdout; }

  // ── Private: validation ──
  private async _valAll(identity: LoopRunIdentity): Promise<void> {
    const rp = vAbsPath(identity.repositoryPath, "repositoryPath");
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    if (rp === cr) fail("INVALID_INPUT", "repoPath equals controlRoot");
    // Mutual containment via path.relative
    const relRC = path.relative(rp, cr);
    const relCR = path.relative(cr, rp);
    if (!relRC.startsWith("..") && !path.isAbsolute(relRC)) fail("INVALID_INPUT", "repoPath contains controlRoot");
    if (!relCR.startsWith("..") && !path.isAbsolute(relCR)) fail("INVALID_INPUT", "controlRoot contains repoPath");
    if (!GH_SLUG_RE.test(identity.repository)) fail("REPOSITORY_INVALID", "slug format");
    // check-ref-format with proper error classification
    try { await this._gitR(rp, ["check-ref-format","--branch",identity.baseBranch], [0]); } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") {
        // Distinguish: if we can run another git command, it's a branch format issue
        try { await this._gitR(rp, ["rev-parse","--is-inside-work-tree"], [0]); fail("INVALID_INPUT", "baseBranch invalid"); } catch { throw e; }
      }
    }
    try { await this._gitR(rp, ["check-ref-format","--branch",identity.taskBranch], [0]); } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") {
        try { await this._gitR(rp, ["rev-parse","--is-inside-work-tree"], [0]); fail("INVALID_INPUT", "taskBranch invalid"); } catch { throw e; }
      }
    }
    if (NON_CONTROL.test(identity.baseBranch) || identity.baseBranch.startsWith("-") || identity.baseBranch.includes(" ")) fail("INVALID_INPUT", "baseBranch invalid chars");
    if (NON_CONTROL.test(identity.taskBranch) || identity.taskBranch.startsWith("-") || identity.taskBranch.includes(" ")) fail("INVALID_INPUT", "taskBranch invalid chars");
    if (identity.baseBranch === identity.taskBranch) fail("INVALID_INPUT", "same branch");
    vSha(identity.expectedBaseSha, "expectedBaseSha");
    // Verify inside work tree
    const inside = (await this._gitR(rp, ["rev-parse","--is-inside-work-tree"], [0])).stdout.trim();
    if (inside !== "true") fail("REPOSITORY_INVALID", "not inside work tree");
    // Verify toplevel
    const tl = (await this._gitR(rp, ["rev-parse","--show-toplevel"], [0])).stdout.trim();
    try { if (fs.realpathSync(tl) !== fs.realpathSync(rp)) fail("REPOSITORY_INVALID", "toplevel mismatch"); } catch { fail("REPOSITORY_INVALID", "toplevel realpath"); }
    // Verify common dir
    const cd = (await this._gitR(rp, ["rev-parse","--git-common-dir"], [0])).stdout.trim();
    try { const rcd = fs.realpathSync(path.resolve(rp, cd)); if (!fs.lstatSync(rcd).isDirectory()) fail("REPOSITORY_INVALID", "common dir not dir"); } catch { fail("REPOSITORY_INVALID", "common dir missing"); }
    // Verify origin
    const origin = (await this._gitR(rp, ["remote","get-url","origin"], [0])).stdout.trim();
    const m = origin.match(ORIGIN_RE); if (!m) fail("REPOSITORY_INVALID", "origin URL unsupported");
    const slug = (m[1] || m[2] || m[3] || "").toLowerCase();
    if (slug !== identity.repository.toLowerCase()) fail("REPOSITORY_MISMATCH", "origin repo mismatch");
    // Verify expected commit exists — separate classification from GIT_COMMAND_FAILED
    try {
      const ecCheck = await this._gitR(rp, ["rev-parse","--verify",`${identity.expectedBaseSha}^{commit}`], [0]);
      if (ecCheck.stdout.trim() !== identity.expectedBaseSha) fail("BASE_SHA_MISMATCH", "expected commit not found");
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") fail("BASE_SHA_MISMATCH", "expected commit not found");
      throw e;
    }
  }

  private async _curBase(identity: LoopRunIdentity): Promise<string> {
    return (await this._gitR(identity.repositoryPath, ["rev-parse","--verify",`refs/remotes/origin/${identity.baseBranch}^{commit}`], [0])).stdout.trim();
  }

  private async _isAnc(cwd: string, a: string, d: string): Promise<boolean> {
    const r = await this._gitR(cwd, ["merge-base","--is-ancestor",a,d], [0, 1]);
    return r.exitCode === 0;
  }

  private async _ensureDirs(wsPath: string): Promise<void> {
    const v1 = path.dirname(wsPath); const ws = path.dirname(v1);
    for (const d of [ws, v1]) {
      try { const st = fs.lstatSync(d); if (st.isSymbolicLink()) fail("INVALID_INPUT", "dir is symlink"); if (!st.isDirectory()) fail("INVALID_INPUT", "not directory"); if (fs.realpathSync(d) !== d) fail("INVALID_INPUT", "not canonical"); } catch (e) {
        if (e instanceof LoopGitWorkspaceError) throw e;
        if ((e as NodeJS.ErrnoException).code === "ENOENT") { fs.mkdirSync(d, { mode: 0o700 }); }
        else fail("WORKSPACE_IO_FAILED", "dir check failed");
      }
    }
  }

  private _safeLstat(p: string): "exists" | "enoent" | "error" {
    try { fs.lstatSync(p); return "exists"; } catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? "enoent" : "error"; }
  }

  private async _wtList(rp: string): Promise<Array<{p:string;pExists:boolean;h:string;branch:string|null;detached:boolean;prunable:boolean;prunableReason:string}>> {
    const out = (await this._gitR(rp, ["worktree","list","--porcelain","-z"], [0])).stdout;
    const entries = out.split("\0").filter(Boolean);
    const res: Array<{p:string;pExists:boolean;h:string;branch:string|null;detached:boolean;prunable:boolean;prunableReason:string}> = [];
    let cur: any = {};
    const flush = () => {
      if (!cur.p) return;
      const rawP = cur.p;
      let canonP = rawP, pExists = false;
      try { const st = fs.lstatSync(rawP); if (st.isSymbolicLink() || !st.isDirectory()) { pExists = false; } else { canonP = fs.realpathSync(rawP); pExists = true; } } catch { pExists = false; }
      res.push({ p: canonP, pExists, h: cur.h || "", branch: cur.branch ?? null, detached: !!cur.detached, prunable: !!cur.prunable, prunableReason: cur.prunableReason || "" });
      cur = {};
    };
    for (const e of entries) {
      if (e.startsWith("worktree ")) { flush(); cur.p = e.slice(9); }
      else if (e.startsWith("HEAD ")) cur.h = e.slice(5);
      else if (e.startsWith("branch ")) { const raw = e.slice(7); cur.branch = raw.startsWith("refs/heads/") ? raw.slice(11) : raw; }
      else if (e === "detached") cur.detached = true;
      else if (e.startsWith("prunable")) { cur.prunable = true; if (e.length > 8 && e[8] === " ") cur.prunableReason = e.slice(9); }
    }
    flush();
    return res;
  }

  private async _findWt(identity: LoopRunIdentity, wsPath: string): Promise<{state:"exact"|"branch_only"|"none";taskHead:string}> {
    const wts = await this._wtList(identity.repositoryPath);
    const bw = wts.filter(w => w.branch === identity.taskBranch && !w.prunable);
    const pw = wts.find(w => w.p === wsPath && !w.prunable);
    const prunablePw = wts.find(w => w.p === wsPath && w.prunable);
    if (prunablePw) fail("WORKSPACE_CORRUPT", "prunable exact path");
    if (bw.length > 1) fail("TASK_BRANCH_CONFLICT", "multiple worktrees for branch");
    const b = bw[0] || null;
    if (b && pw && b.p === pw.p) return { state: "exact", taskHead: b.h };
    if (b && !pw) fail("TASK_BRANCH_CONFLICT", "branch at other path");
    if (!b && pw) fail("WORKTREE_CONFLICT", "path used by other branch");
    if (b && pw && b.p !== pw.p) fail("TASK_BRANCH_CONFLICT", "branch/path mismatch");
    const lr = this._safeLstat(wsPath);
    if (lr === "exists") fail("WORKTREE_CONFLICT", "path exists unregistered");
    if (lr === "error") fail("WORKSPACE_IO_FAILED", "lstat failed");
    // Check branch existence via show-ref
    const brCheck = await this._gitR(identity.repositoryPath, ["show-ref","--verify","--quiet",`refs/heads/${identity.taskBranch}`], [0, 1]);
    if (brCheck.exitCode === 0) {
      const h = (await this._gitR(identity.repositoryPath, ["rev-parse","--verify",`refs/heads/${identity.taskBranch}`], [0])).stdout.trim();
      return { state: "branch_only", taskHead: h };
    }
    return { state: "none", taskHead: "" };
  }

  private async _verifyWs(identity: LoopRunIdentity, wsPath: string, expHead: string): Promise<void> {
    const brOut = (await this._gitR(wsPath, ["symbolic-ref","--quiet","--short","HEAD"], [0])).stdout.trim();
    if (brOut !== identity.taskBranch) fail("WORKSPACE_CORRUPT", "branch mismatch");
    const wsHead = (await this._gitR(wsPath, ["rev-parse","--verify","HEAD"], [0])).stdout.trim();
    const brRef = (await this._gitR(identity.repositoryPath, ["rev-parse","--verify",`refs/heads/${identity.taskBranch}`], [0])).stdout.trim();
    if (wsHead !== brRef) fail("WORKSPACE_CORRUPT", "HEAD/ref mismatch");
    if (wsHead !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");
    const wsCd = (await this._gitR(wsPath, ["rev-parse","--git-common-dir"], [0])).stdout.trim();
    const srcCd = (await this._gitR(identity.repositoryPath, ["rev-parse","--git-common-dir"], [0])).stdout.trim();
    try { if (fs.realpathSync(path.resolve(wsPath, wsCd)) !== fs.realpathSync(path.resolve(identity.repositoryPath, srcCd))) fail("WORKSPACE_CORRUPT", "common dir mismatch"); } catch { fail("WORKSPACE_CORRUPT", "common dir realpath"); }
    if ((await this._isAnc(wsPath, identity.expectedBaseSha, wsHead)) === false) fail("TASK_BRANCH_CONFLICT", "base not ancestor");
  }

  private async _createWt(identity: LoopRunIdentity, wsPath: string, curBase: string): Promise<LoopGitWorkspaceSnapshot> {
    try { await this._git(identity.repositoryPath, ["worktree","add","-b",identity.taskBranch,wsPath,identity.expectedBaseSha]); }
    catch {
      for (let i = 0; i < 5; i++) {
        await sleep(50 + i * 50);
        const wts = await this._wtList(identity.repositoryPath);
        const f = wts.find(w => w.p === wsPath && w.branch === identity.taskBranch && !w.prunable && w.pExists);
        if (f) { await this._verifyWs(identity, wsPath, f.h); return await this._snap(identity, wsPath, "recovered", curBase, false); }
      }
      throw tf("WORKSPACE_IO_FAILED", "create failed");
    }
    await this._verifyWs(identity, wsPath, identity.expectedBaseSha);
    return await this._snap(identity, wsPath, "created", curBase, false);
  }

  private async _attachBr(identity: LoopRunIdentity, wsPath: string, taskHead: string, curBase: string): Promise<LoopGitWorkspaceSnapshot> {
    if ((await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, taskHead)) === false) fail("TASK_BRANCH_CONFLICT", "base not ancestor");
    try { await this._git(identity.repositoryPath, ["worktree","add",wsPath,identity.taskBranch]); }
    catch {
      for (let i = 0; i < 3; i++) {
        await sleep(50);
        const wts = await this._wtList(identity.repositoryPath);
        const f = wts.find(w => w.p === wsPath && !w.prunable && w.pExists);
        if (f && f.branch === identity.taskBranch) { await this._verifyWs(identity, wsPath, f.h); return await this._snap(identity, wsPath, "recovered", curBase, false); }
        if (f) fail("WORKTREE_CONFLICT", "path occupied");
      }
      throw tf("WORKSPACE_IO_FAILED", "attach failed");
    }
    await this._verifyWs(identity, wsPath, taskHead);
    return await this._snap(identity, wsPath, "recovered", curBase, false);
  }

  private async _snap(identity: LoopRunIdentity, wsPath: string, state: "created"|"recovered"|"inspected", curBase: string, drifted: boolean): Promise<LoopGitWorkspaceSnapshot> {
    const cd = await fs.promises.realpath(path.resolve(identity.repositoryPath, (await this._gitR(identity.repositoryPath, ["rev-parse","--git-common-dir"], [0])).stdout.trim()));
    const tH = (await this._gitR(wsPath, ["rev-parse","--verify","HEAD"], [0])).stdout.trim();
    const tS = (await this._gitR(wsPath, ["status","--porcelain=v1","-z","--untracked-files=all"], [0])).stdout;
    const dirty = tS.length > 0;
    const tD = sha256Hex(Buffer.from(tS, "utf8"));
    const sH = (await this._gitR(identity.repositoryPath, ["rev-parse","--verify","HEAD"], [0])).stdout.trim();
    let sB: string | null = null;
    const symCheck = await this._gitR(identity.repositoryPath, ["symbolic-ref","--quiet","--short","HEAD"], [0, 1]);
    if (symCheck.exitCode === 0) sB = symCheck.stdout.trim() || null;
    const wD = await this._srcFp(identity.repositoryPath);
    return freeze({ state, runId: identity.runId, repository: identity.repository, repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot, gitCommonDir: cd, workspacePath: wsPath, baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha, currentBaseSha: curBase, baseDrifted: drifted, taskBranch: identity.taskBranch, taskHeadSha: tH, taskHasChanges: dirty, taskStatusDigestSha256: tD, sourceHeadSha: sH, sourceBranch: sB, sourceWipDigestSha256: wD });
  }

  private async _srcFp(rp: string): Promise<string> {
    const h = crypto.createHash("sha256");
    const head = (await this._gitR(rp, ["rev-parse","--verify","HEAD"], [0])).stdout.trim();
    h.update(`head:${head.length}:${head}`);
    const symCheck = await this._gitR(rp, ["symbolic-ref","--quiet","--short","HEAD"], [0, 1]);
    const branch = symCheck.exitCode === 0 ? symCheck.stdout.trim() : "";
    h.update(`branch:${branch.length}:${branch}`);
    const status = (await this._gitR(rp, ["status","--porcelain=v1","-z","--untracked-files=all"], [0])).stdout;
    h.update(`status:${status.length}:${status}`);
    const diff = (await this._gitR(rp, ["diff","--binary","--no-ext-diff","--no-textconv","--"], [0])).stdout;
    h.update(`diff:${diff.length}:${diff}`);
    const cached = (await this._gitR(rp, ["diff","--cached","--binary","--no-ext-diff","--no-textconv","HEAD","--"], [0])).stdout;
    h.update(`cached:${cached.length}:${cached}`);
    const untracked = (await this._gitR(rp, ["ls-files","--others","--exclude-standard","-z"], [0])).stdout.split("\0").filter(Boolean);
    h.update(`untracked:${untracked.length}:${untracked.join("\0")}`);
    let bytes = 0;
    for (const f of untracked) {
      if (f.includes("\x00")) fail("SOURCE_WIP_UNSUPPORTED", "NUL in path");
      if (path.isAbsolute(f)) fail("SOURCE_WIP_UNSUPPORTED", "absolute path");
      const fp = path.resolve(rp, f);
      const rel = path.relative(rp, fp);
      if (rel.startsWith("..") || path.isAbsolute(rel)) fail("SOURCE_WIP_UNSUPPORTED", "path escape");
      let st: fs.Stats;
      try { st = fs.lstatSync(fp); } catch { fail("WORKSPACE_IO_FAILED", "lstat failed"); }
      if (st.isSymbolicLink()) {
        let tgt: string; try { tgt = await fs.promises.readlink(fp); } catch { fail("WORKSPACE_IO_FAILED", "readlink failed"); }
        bytes += tgt.length; if (bytes > this.mxWip) fail("SOURCE_WIP_TOO_LARGE", "limit exceeded");
        h.update(`u:${f}:sym:${st.mode}:${tgt.length}:${tgt}`);
      } else if (st.isFile()) {
        bytes += st.size; if (bytes > this.mxWip) fail("SOURCE_WIP_TOO_LARGE", "limit exceeded");
        let content: Buffer; try { content = await fs.promises.readFile(fp); } catch { fail("WORKSPACE_IO_FAILED", "readFile failed"); }
        h.update(`u:${f}:file:${st.mode}:${st.size}:`); h.update(content);
      } else if (st.isDirectory()) {}
      else fail("SOURCE_WIP_UNSUPPORTED", "special file");
    }
    return h.digest("hex");
  }
}

function freeze<T extends object>(o: T): Readonly<T> { return Object.freeze(o); }
