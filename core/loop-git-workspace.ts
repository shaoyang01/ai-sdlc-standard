// LOOP Executor Kernel — Isolated Git Workspace Lifecycle
// ========================================================
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopPosixProcessRunner, LoopPosixProcessRequest } from "./loop-posix-process-runner";

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

// ═══════════════════════════════════════ Helpers
function sha256Hex(data: Buffer | string): string { return crypto.createHash("sha256").update(data).digest("hex"); }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function existsDir(p: string): boolean { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } }

function vS(v: unknown, nm: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim()) fail("INVALID_INPUT", `${nm} invalid`); return v;
}
function vI(v: unknown, min: number, max: number, nm: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) fail("INVALID_INPUT", `${nm} out of range`); return v;
}
function vPlain(v: unknown, nm: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail("INVALID_INPUT", `${nm} must be plain object`);
  const proto = Object.getPrototypeOf(v); if (proto !== null && proto !== Object.prototype) fail("INVALID_INPUT", `${nm} must be plain object`);
  return v as Record<string, unknown>;
}
function vBoolOrUndef(v: unknown): boolean | undefined { if (v === undefined) return undefined; if (typeof v !== "boolean") fail("INVALID_INPUT", "must be boolean"); return v; }
function vSha(s: string, nm: string): string { if (!SHA_RE.test(s)) fail("INVALID_INPUT", `${nm} must be 40-char hex`); return s; }
function vAbsPath(p: string, nm: string): string {
  if (!path.isAbsolute(p)) fail("INVALID_INPUT", `${nm} not absolute`);
  let st: fs.Stats; try { st = fs.lstatSync(p); } catch { fail("INVALID_INPUT", `${nm} not found`); }
  if (st.isSymbolicLink()) fail("INVALID_INPUT", `${nm} is symlink`); if (!st.isDirectory()) fail("INVALID_INPUT", `${nm} not directory`);
  let r: string; try { r = fs.realpathSync(p); } catch { fail("INVALID_INPUT", `${nm} realpath failed`); }
  if (r !== p) fail("INVALID_INPUT", `${nm} not canonical`); return r;
}
function vOriginUrl(url: string, expectedRepo: string): void {
  const m = url.trim().match(ORIGIN_RE); if (!m) fail("REPOSITORY_INVALID", "origin URL unsupported");
  const slug = (m[1] || m[2] || m[3] || "").toLowerCase();
  if (slug !== expectedRepo.toLowerCase()) fail("REPOSITORY_MISMATCH", "origin repo mismatch");
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
    vPlain(o, "options");
    if (!o.runner || typeof (o.runner as any).run !== "function") fail("INVALID_INPUT", "runner missing run");
    this.runner = o.runner;
    this.gitId = vS(o.gitExecutableId, "gitExecutableId");
    this.gTo = vI(o.gitTimeoutMs ?? DEF_TO, MIN_TO, MAX_TO, "gitTimeoutMs");
    this.mxOut = vI(o.maxGitOutputBytes ?? DEF_OUT, MIN_OUT, MAX_OUT, "maxGitOutputBytes");
    this.mxWip = vI(o.maxSourceWipBytes ?? DEF_WIP, 1, MAX_OUT, "maxSourceWipBytes");
  }

  // ── Public: deterministic workspace path ──
  workspacePathFor(identity: LoopRunIdentity): string {
    validateLoopRunIdentity(identity);
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    const canonKey = JSON.stringify([
      "loop-git-workspace-v1", identity.runId, identity.requirementId,
      identity.repository.toLowerCase(), identity.repositoryPath,
      identity.baseBranch, identity.expectedBaseSha, identity.taskBranch, cr,
    ]);
    const digest = sha256Hex(Buffer.from(canonKey, "utf8"));
    const wsDir = path.join(cr, "workspaces", "v1", digest);
    if (!wsDir.startsWith(cr + path.sep) && wsDir !== cr) fail("INVALID_INPUT", "path outside controlRoot");
    return wsDir;
  }

  // ── Public: prepare ──
  async prepare(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateLoopRunIdentity(identity);
    await this._validateRepo(identity);
    let fpBefore = await this._sourceFp(identity.repositoryPath);
    try {
      const wsPath = this.workspacePathFor(identity);
      await this._ensureDirs(wsPath);
      const curBase = await this._curBase(identity);
      if (curBase !== identity.expectedBaseSha) fail("BASE_SHA_MISMATCH", "base mismatch");
      const exist = await this._findWt(identity, wsPath);
      if (exist.state === "exact") {
        if (!await this._isAnc(wsPath, identity.expectedBaseSha, exist.taskHead)) fail("TASK_BRANCH_CONFLICT", "base not ancestor");
        return await this._snap(identity, wsPath, "recovered", curBase, false);
      }
      if (exist.state === "branch_only") return await this._attach(identity, wsPath, exist, curBase);
      return await this._create(identity, wsPath, curBase);
    } finally {
      if (fpBefore !== await this._sourceFp(identity.repositoryPath)) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ── Public: inspect ──
  async inspect(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateLoopRunIdentity(identity);
    await this._validateRepo(identity);
    let fpBefore = await this._sourceFp(identity.repositoryPath);
    try {
      const wsPath = this.workspacePathFor(identity);
      const curBase = await this._curBase(identity);
      const drifted = curBase !== identity.expectedBaseSha;
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath && !w.prunable);
      if (!f) {
        try { fs.lstatSync(wsPath); fail("WORKTREE_CONFLICT", "path exists unregistered"); } catch { fail("WORKSPACE_NOT_FOUND", "not found"); }
      }
      if (f.branch !== identity.taskBranch) fail("WORKTREE_CONFLICT", "branch mismatch");
      if (f.detached) fail("WORKSPACE_CORRUPT", "detached");
      if (!await this._chkCommon(wsPath, identity.repositoryPath)) fail("WORKSPACE_CORRUPT", "common dir");
      return await this._snap(identity, wsPath, "inspected", curBase, drifted);
    } finally {
      if (fpBefore !== await this._sourceFp(identity.repositoryPath)) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ── Public: cleanup ──
  async cleanup(identity: LoopRunIdentity, opts: LoopGitWorkspaceCleanupOptions): Promise<LoopGitWorkspaceCleanupResult> {
    validateLoopRunIdentity(identity);
    await this._validateRepo(identity);
    let fpBefore = await this._sourceFp(identity.repositoryPath);
    try {
      const o = vPlain(opts, "cleanup");
      const expHead = vSha(vS(o.expectedTaskHeadSha, "expectedTaskHeadSha"), "expectedTaskHeadSha");
      const delBr = vBoolOrUndef(o.deleteTaskBranch) ?? false;
      for (const k of Object.keys(o)) { if (k !== "expectedTaskHeadSha" && k !== "deleteTaskBranch") fail("INVALID_INPUT", "unknown cleanup option"); }
      const wsPath = this.workspacePathFor(identity);
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath && !w.prunable);
      if (!f) {
        if (!await this._brExists(identity.repositoryPath, identity.taskBranch)) return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: false, taskBranchRetained: false, alreadyAbsent: true });
        if (!delBr) return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: false, taskBranchRetained: true, alreadyAbsent: false });
        const brH = await this._git(identity.repositoryPath, ["rev-parse","--verify",`refs/heads/${identity.taskBranch}`]);
        if (brH.trim() !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");
        try { await this._gitV(identity.repositoryPath, ["branch","-d",identity.taskBranch]); } catch { fail("CLEANUP_BLOCKED", "branch delete rejected"); }
        return freeze({ workspacePath: wsPath, worktreeRemoved: false, taskBranchDeleted: true, taskBranchRetained: false, alreadyAbsent: false });
      }
      if (f.branch !== identity.taskBranch) fail("TASK_BRANCH_CONFLICT", "branch mismatch");
      const taskHead = await this._git(wsPath, ["rev-parse","--verify","HEAD"]);
      if (taskHead.trim() !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");
      const status = await this._git(wsPath, ["status","--porcelain=v1","-z","--untracked-files=all"]);
      if (status.length > 0) fail("WORKSPACE_DIRTY", "workspace dirty");
      await this._gitV(identity.repositoryPath, ["worktree","remove",wsPath]);
      let bDel = false, bRet = true;
      if (delBr) {
        const wts2 = await this._wtList(identity.repositoryPath);
        if (wts2.some(w => w.branch === identity.taskBranch && w.p !== wsPath && !w.prunable)) fail("CLEANUP_BLOCKED", "branch in use");
        try { await this._gitV(identity.repositoryPath, ["branch","-d",identity.taskBranch]); } catch { fail("CLEANUP_BLOCKED", "branch delete rejected"); }
        bDel = true; bRet = false;
      }
      return freeze({ workspacePath: wsPath, worktreeRemoved: true, taskBranchDeleted: bDel, taskBranchRetained: bRet, alreadyAbsent: false });
    } finally {
      if (fpBefore !== await this._sourceFp(identity.repositoryPath)) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ═══════════════════════════════════════ Private: git execution
  private async _git(cwd: string, args: readonly string[]): Promise<string> {
    const req: LoopPosixProcessRequest = { executableId: this.gitId, cwd, args, timeoutMs: this.gTo, maxStdoutBytes: this.mxOut, maxStderrBytes: this.mxOut };
    const r = await this.runner.run(req);
    if (r.status === "timed_out") fail("GIT_COMMAND_FAILED", "timeout");
    if (r.stdoutTruncated || r.stderrTruncated) fail("GIT_COMMAND_FAILED", "truncated");
    if (r.exitCode !== 0 && r.exitCode !== null) fail("GIT_COMMAND_FAILED", `exit ${r.exitCode}`);
    return r.stdout;
  }
  private async _gitV(cwd: string, args: readonly string[]): Promise<void> { await this._git(cwd, args); }

  // ── Private: validation ──
  private async _validateRepo(identity: LoopRunIdentity): Promise<void> {
    const rp = vAbsPath(identity.repositoryPath, "repositoryPath");
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    if (rp === cr) fail("INVALID_INPUT", "repoPath equals controlRoot");
    if (!GH_SLUG_RE.test(identity.repository)) fail("REPOSITORY_INVALID", "slug format");
    if (NON_CONTROL.test(identity.baseBranch) || identity.baseBranch.startsWith("-") || identity.baseBranch.includes(" ")) fail("INVALID_INPUT", "baseBranch invalid");
    if (NON_CONTROL.test(identity.taskBranch) || identity.taskBranch.startsWith("-") || identity.taskBranch.includes(" ")) fail("INVALID_INPUT", "taskBranch invalid");
    if (identity.baseBranch === identity.taskBranch) fail("INVALID_INPUT", "same branch");
    vSha(identity.expectedBaseSha, "expectedBaseSha");
    // Verify inside work tree
    const inside = await this._git(rp, ["rev-parse","--is-inside-work-tree"]);
    if (inside.trim() !== "true") fail("REPOSITORY_INVALID", "not inside work tree");
    // Verify top-level
    const topLevel = (await this._git(rp, ["rev-parse","--show-toplevel"])).trim();
    const realTl = await fs.promises.realpath(topLevel);
    const realRp = await fs.promises.realpath(rp);
    if (realTl !== realRp) fail("REPOSITORY_INVALID", "toplevel mismatch");
    // Verify common dir
    const cd = (await this._git(rp, ["rev-parse","--git-common-dir"])).trim();
    const rCd = await fs.promises.realpath(path.resolve(rp, cd));
    try { fs.lstatSync(rCd); } catch { fail("REPOSITORY_INVALID", "common dir missing"); }
    // Verify origin
    const origin = (await this._git(rp, ["remote","get-url","origin"])).trim();
    vOriginUrl(origin, identity.repository);
  }

  // ── Private: helpers ──
  private async _ensureDirs(wsPath: string): Promise<void> {
    const v1 = path.dirname(wsPath); const ws = path.dirname(v1);
    if (!existsDir(ws)) fs.mkdirSync(ws, { mode: 0o700 });
    if (!existsDir(v1)) fs.mkdirSync(v1, { mode: 0o700 });
  }
  private async _curBase(identity: LoopRunIdentity): Promise<string> {
    return (await this._git(identity.repositoryPath, ["rev-parse","--verify",`refs/remotes/origin/${identity.baseBranch}^{commit}`])).trim();
  }
  private async _isAnc(cwd: string, a: string, d: string): Promise<boolean> {
    const req: LoopPosixProcessRequest = { executableId: this.gitId, cwd, args: ["merge-base","--is-ancestor",a,d], timeoutMs: this.gTo, maxStdoutBytes: this.mxOut, maxStderrBytes: this.mxOut };
    const r = await this.runner.run(req);
    if (r.status === "timed_out") fail("GIT_COMMAND_FAILED", "timeout");
    return r.exitCode === 0;
  }
  private async _brExists(rp: string, br: string): Promise<boolean> {
    try { await this._gitV(rp, ["show-ref","--verify","--quiet",`refs/heads/${br}`]); return true; } catch { return false; }
  }
  private async _chkCommon(wsPath: string, rp: string): Promise<boolean> {
    try {
      const wc = (await this._git(wsPath, ["rev-parse","--git-common-dir"])).trim();
      return await fs.promises.realpath(path.resolve(wsPath, wc)) === await fs.promises.realpath(path.resolve(rp, ".git"));
    } catch { return false; }
  }
  private async _wtList(rp: string): Promise<Array<{p:string;h:string;branch:string|null;detached:boolean;prunable:boolean}>> {
    const out = await this._git(rp, ["worktree","list","--porcelain","-z"]);
    const entries = out.split("\0").filter(Boolean);
    const res: Array<{p:string;h:string;branch:string|null;detached:boolean;prunable:boolean}> = [];
    let cur: any = {};
    for (const e of entries) {
      if (e.startsWith("worktree ")) {
        if (cur.p) res.push({ p: fs.realpathSync(cur.p), h: cur.h || "", branch: cur.branch ?? null, detached: !!cur.detached, prunable: !!cur.prunable });
        cur = {}; cur.p = e.slice(9);
      } else if (e.startsWith("HEAD ")) cur.h = e.slice(5);
      else if (e.startsWith("branch ")) { const raw = e.slice(7); cur.branch = raw.startsWith("refs/heads/") ? raw.slice(11) : raw; }
      else if (e === "detached") cur.detached = true;
      else if (e === "prunable") cur.prunable = true;
    }
    if (cur.p) res.push({ p: fs.realpathSync(cur.p), h: cur.h || "", branch: cur.branch ?? null, detached: !!cur.detached, prunable: !!cur.prunable });
    return res;
  }
  private async _findWt(identity: LoopRunIdentity, wsPath: string): Promise<{state:"exact"|"branch_only"|"none";taskHead:string}> {
    const wts = await this._wtList(identity.repositoryPath);
    const bw = wts.find(w => w.branch === identity.taskBranch && !w.prunable);
    const pw = wts.find(w => w.p === wsPath && !w.prunable);
    if (bw && pw && bw.p === pw.p) return { state: "exact", taskHead: bw.h };
    if (bw && !pw) fail("TASK_BRANCH_CONFLICT", "branch at other path");
    if (!bw && pw) fail("WORKTREE_CONFLICT", "path used by other branch");
    if (bw && pw && bw.p !== pw.p) fail("TASK_BRANCH_CONFLICT", "branch/path mismatch");
    try { fs.lstatSync(wsPath); fail("WORKTREE_CONFLICT", "path exists unregistered"); } catch {}
    if (await this._brExists(identity.repositoryPath, identity.taskBranch)) {
      const h = (await this._git(identity.repositoryPath, ["rev-parse","--verify",`refs/heads/${identity.taskBranch}`])).trim();
      return { state: "branch_only", taskHead: h };
    }
    return { state: "none", taskHead: "" };
  }
  private async _create(identity: LoopRunIdentity, wsPath: string, curBase: string): Promise<LoopGitWorkspaceSnapshot> {
    try {
      await this._gitV(identity.repositoryPath, ["worktree","add","-b",identity.taskBranch,wsPath,identity.expectedBaseSha]);
    } catch {
      await sleep(50);
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath && w.branch === identity.taskBranch && !w.prunable);
      if (f) return await this._snap(identity, wsPath, "recovered", curBase, false);
      throw tf("WORKSPACE_IO_FAILED", "create failed");
    }
    return await this._snap(identity, wsPath, "created", curBase, false);
  }
  private async _attach(identity: LoopRunIdentity, wsPath: string, exist: {taskHead:string}, curBase: string): Promise<LoopGitWorkspaceSnapshot> {
    if (!await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, exist.taskHead)) fail("TASK_BRANCH_CONFLICT", "base not ancestor");
    try {
      await this._gitV(identity.repositoryPath, ["worktree","add",wsPath,identity.taskBranch]);
    } catch {
      await sleep(50);
      const wts = await this._wtList(identity.repositoryPath);
      const f = wts.find(w => w.p === wsPath && !w.prunable);
      if (f && f.branch === identity.taskBranch) return await this._snap(identity, wsPath, "recovered", curBase, false);
      if (f) fail("WORKTREE_CONFLICT", "path occupied");
      throw tf("WORKSPACE_IO_FAILED", "attach failed");
    }
    return await this._snap(identity, wsPath, "recovered", curBase, false);
  }
  private async _snap(identity: LoopRunIdentity, wsPath: string, state: "created"|"recovered"|"inspected", curBase: string, drifted: boolean): Promise<LoopGitWorkspaceSnapshot> {
    const cd = await fs.promises.realpath(path.resolve(identity.repositoryPath, ".git"));
    const tH = (await this._git(wsPath, ["rev-parse","--verify","HEAD"])).trim();
    const tS = await this._git(wsPath, ["status","--porcelain=v1","-z","--untracked-files=all"]);
    const dirty = tS.length > 0;
    const tD = sha256Hex(Buffer.from(tS, "utf8"));
    const sH = (await this._git(identity.repositoryPath, ["rev-parse","--verify","HEAD"])).trim();
    let sB: string | null = null;
    try { sB = (await this._git(identity.repositoryPath, ["symbolic-ref","--quiet","--short","HEAD"])).trim() || null; } catch { sB = null; }
    const wD = await this._sourceFp(identity.repositoryPath);
    return freeze({
      state, runId: identity.runId, repository: identity.repository, repositoryPath: identity.repositoryPath,
      controlRoot: identity.controlRoot, gitCommonDir: cd, workspacePath: wsPath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: curBase, baseDrifted: drifted,
      taskBranch: identity.taskBranch, taskHeadSha: tH, taskHasChanges: dirty,
      taskStatusDigestSha256: tD, sourceHeadSha: sH, sourceBranch: sB, sourceWipDigestSha256: wD,
    });
  }

  // ── Private: source WIP fingerprint ──
  private async _sourceFp(rp: string): Promise<string> {
    const h = crypto.createHash("sha256");
    try { const v = (await this._git(rp, ["rev-parse","--verify","HEAD"])).trim(); h.update(`head:${v.length}:${v}`); } catch { h.update("head:0:"); }
    try { const v = (await this._git(rp, ["symbolic-ref","--quiet","--short","HEAD"])).trim(); h.update(`branch:${v.length}:${v}`); } catch { h.update("branch:0:"); }
    try { const v = await this._git(rp, ["status","--porcelain=v1","-z","--untracked-files=all"]); h.update(`status:${v.length}:${v}`); } catch { h.update("status:0:"); }
    try { const v = await this._git(rp, ["diff","--binary","--no-ext-diff","--no-textconv","--"]); h.update(`diff:${v.length}:${v}`); } catch { h.update("diff:0:"); }
    try { const v = await this._git(rp, ["diff","--cached","--binary","--no-ext-diff","--no-textconv","HEAD","--"]); h.update(`cached:${v.length}:${v}`); } catch { h.update("cached:0:"); }
    try {
      const files = (await this._git(rp, ["ls-files","--others","--exclude-standard","-z"])).split("\0").filter(Boolean);
      h.update(`untracked:${files.length}:${files.join("\0")}`);
      let bytes = 0;
      for (const f of files) {
        const fp = path.resolve(rp, f);
        if (!fp.startsWith(rp + path.sep) && fp !== rp) continue;
        let st: fs.Stats;
        try { st = fs.lstatSync(fp); } catch { continue; }
        if (st.isSymbolicLink()) {
          const tgt = await fs.promises.readlink(fp);
          h.update(`u:${f}:sym:${tgt.length}:${tgt}`);
        } else if (st.isFile()) {
          bytes += st.size; if (bytes > this.mxWip) fail("SOURCE_WIP_TOO_LARGE", "limit exceeded");
          const content = await fs.promises.readFile(fp);
          h.update(`u:${f}:file:${st.mode}:${st.size}:`); h.update(content);
        } else if (st.isDirectory()) { /* skip */ }
        else fail("SOURCE_WIP_UNSUPPORTED", `type: ${f}`);
      }
    } catch (e) { if (e instanceof LoopGitWorkspaceError) throw e; h.update("untracked:0:"); }
    return h.digest("hex");
  }
}

function freeze<T extends object>(o: T): Readonly<T> { return Object.freeze(o); }
