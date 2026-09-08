// LOOP Executor Kernel — Isolated Git Workspace Lifecycle
// ========================================================
// Creates isolated Git worktrees for concurrent LOOP runs without
// touching source workspace WIP. All Git commands through injected
// LoopPosixProcessRunner — no direct child_process or network access.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type {
  LoopPosixProcessRunner,
  LoopPosixProcessRequest,
  LoopPosixProcessResult,
} from "./loop-posix-process-runner";

// ═══════════════════════════════════════ Types

export type LoopGitWorkspaceErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PLATFORM"
  | "REPOSITORY_INVALID"
  | "REPOSITORY_MISMATCH"
  | "BASE_SHA_MISMATCH"
  | "SOURCE_WORKSPACE_DRIFT"
  | "SOURCE_WIP_TOO_LARGE"
  | "SOURCE_WIP_UNSUPPORTED"
  | "TASK_BRANCH_CONFLICT"
  | "WORKTREE_CONFLICT"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_CORRUPT"
  | "WORKSPACE_DIRTY"
  | "GIT_COMMAND_FAILED"
  | "WORKSPACE_IO_FAILED"
  | "CLEANUP_BLOCKED";

const MAX_MSG = 256;
function sn(msg: string): string {
  return msg.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, MAX_MSG);
}

export class LoopGitWorkspaceError extends Error {
  readonly code: LoopGitWorkspaceErrorCode;
  constructor(code: LoopGitWorkspaceErrorCode, msg: string) {
    super(sn(msg));
    this.name = "LoopGitWorkspaceError";
    this.code = code;
  }
}

function fail(c: LoopGitWorkspaceErrorCode, m: string): never {
  throw new LoopGitWorkspaceError(c, m);
}
function tf(c: LoopGitWorkspaceErrorCode, m: string): LoopGitWorkspaceError {
  return new LoopGitWorkspaceError(c, m);
}

export type LoopGitWorkspaceManagerOptions = Readonly<{
  runner: Pick<LoopPosixProcessRunner, "run">;
  gitExecutableId: string;
  gitTimeoutMs?: number;
  maxGitOutputBytes?: number;
  maxSourceWipBytes?: number;
}>;

export type LoopGitWorkspaceSnapshot = Readonly<{
  state: "created" | "recovered" | "inspected";
  runId: string;
  repository: string;
  repositoryPath: string;
  controlRoot: string;
  gitCommonDir: string;
  workspacePath: string;
  baseBranch: string;
  expectedBaseSha: string;
  currentBaseSha: string;
  baseDrifted: boolean;
  taskBranch: string;
  taskHeadSha: string;
  taskHasChanges: boolean;
  taskStatusDigestSha256: string;
  sourceHeadSha: string;
  sourceBranch: string | null;
  sourceWipDigestSha256: string;
}>;

// ═══════════════════════════════════════ Attempt outcome (E4-T5)

// How the attempt that owned this workspace ended, as reported by the caller.
// `unknown` means side effects could not be attributed — it must never be
// silently treated as success or failure.
export type LoopGitWorkspaceAttemptOutcome = "succeeded" | "failed" | "unknown";

// promote  = attempt succeeded, its output is already committed on the task
//            branch, so the isolated workspace can be reclaimed.
//            NOTE: promote never touches the base branch — no merge, no push.
//            Real promotion against a production repository requires E5.
// isolate  = attempt failed, keep the workspace and branch as evidence.
// block    = unknown or out-of-bounds side effects: keep the evidence and
//            refuse to clean up or promote.
export type LoopGitWorkspaceCleanupDecision = "promote" | "isolate" | "block";

export type LoopGitWorkspaceCleanupOptions = Readonly<{
  expectedTaskHeadSha: string;
  deleteTaskBranch?: boolean;
  outcome?: LoopGitWorkspaceAttemptOutcome;
  // Task-permitted paths. When present, any changed path outside this set
  // forces `block` regardless of `outcome`. Relative, no traversal.
  allowedPaths?: readonly string[];
}>;

export type LoopGitWorkspaceCleanupResult = Readonly<{
  workspacePath: string;
  worktreeRemoved: boolean;
  taskBranchDeleted: boolean;
  taskBranchRetained: boolean;
  alreadyAbsent: boolean;
  decision: LoopGitWorkspaceCleanupDecision;
  outOfBoundsPaths: readonly string[];
  evidenceRetained: boolean;
}>;

// ═══════════════════════════════════════ Constants

const SHA_RE = /^[0-9a-f]{40}$/;
const GH_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const NON_CTL = /[\x00-\x1f\x7f]/;
const DEF_TO = 30000, MIN_TO = 100, MAX_TO = 120000;
const DEF_OUT = 1048576, MIN_OUT = 1, MAX_OUT = 16777216;
const DEF_WIP = 16777216;
const ORIGIN_RE =
  /^(?:https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$|git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$|ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$)/;
const MGR_KEYS = ["runner", "gitExecutableId", "gitTimeoutMs", "maxGitOutputBytes", "maxSourceWipBytes"];
const CLN_KEYS = ["expectedTaskHeadSha", "deleteTaskBranch", "outcome", "allowedPaths"];
const EMPTY_PATHS: readonly string[] = Object.freeze([]);
const OUTCOMES: readonly string[] = ["succeeded", "failed", "unknown"];

// Full worktree record model
type WtRec = {
  rawPath: string;
  canonPath: string | null;
  pathExists: boolean;
  pathIsDir: boolean;
  pathIsSymlink: boolean;
  pathError: string;
  head: string;
  branch: string | null;
  detached: boolean;
  prunable: boolean;
  prunableReason: string;
};

// ═══════════════════════════════════════ Helpers

function sha256Hex(d: Buffer | string): string {
  return crypto.createHash("sha256").update(d).digest("hex");
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function vS(v: unknown, nm: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v !== v.trim())
    fail("INVALID_INPUT", `${nm} invalid`);
  return v;
}
function vI(v: unknown, min: number, max: number, nm: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    fail("INVALID_INPUT", `${nm} out of range`);
  return v;
}
function vSha(s: string, nm: string): string {
  if (!SHA_RE.test(s)) fail("INVALID_INPUT", `${nm} must be 40-char hex`);
  return s;
}
function vAbsPath(p: string, nm: string): string {
  if (!path.isAbsolute(p)) fail("INVALID_INPUT", `${nm} not absolute`);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    fail("INVALID_INPUT", (e as NodeJS.ErrnoException).code === "ENOENT" ? `${nm} not found` : `${nm} lstat failed`);
  }
  if (st.isSymbolicLink()) fail("INVALID_INPUT", `${nm} is symlink`);
  if (!st.isDirectory()) fail("INVALID_INPUT", `${nm} not directory`);
  let r: string;
  try {
    r = fs.realpathSync(p);
  } catch {
    fail("INVALID_INPUT", `${nm} realpath failed`);
  }
  if (r !== p) fail("INVALID_INPUT", `${nm} not canonical`);
  return r;
}

function scanPlain(v: unknown, allowed: readonly string[], nm: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") fail("INVALID_INPUT", `${nm} must be object`);
  if (Array.isArray(v)) fail("INVALID_INPUT", `${nm} must not be array`);
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(v);
  } catch {
    fail("INVALID_INPUT", `${nm} getPrototypeOf threw`);
  }
  if (proto !== Object.prototype && proto !== null) fail("INVALID_INPUT", `${nm} bad prototype`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(v) as Array<string | symbol>;
  } catch {
    fail("INVALID_INPUT", `${nm} ownKeys threw`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  const seen = new Set<string>();
  for (const k of keys) {
    if (typeof k === "symbol") fail("INVALID_INPUT", `${nm} symbol key`);
    if (k === "__proto__") fail("INVALID_INPUT", `${nm} __proto__ key`);
    if (!allowed.includes(k)) fail("INVALID_INPUT", `${nm} unknown key`);
    if (seen.has(k)) fail("INVALID_INPUT", `${nm} duplicate key`);
    seen.add(k);
    let desc: PropertyDescriptor;
    try {
      desc = Object.getOwnPropertyDescriptor(v, k)!;
    } catch {
      fail("INVALID_INPUT", `${nm} getDescriptor threw`);
    }
    if (!desc) fail("INVALID_INPUT", `${nm} missing descriptor`);
    if ("get" in desc || "set" in desc) fail("INVALID_INPUT", `${nm} accessor`);
    if (!("value" in desc)) fail("INVALID_INPUT", `${nm} no value`);
    Object.defineProperty(out, k, {
      value: desc.value,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return out;
}

function validateIdentity(id: LoopRunIdentity): void {
  try {
    validateLoopRunIdentity(id);
  } catch {
    fail("INVALID_INPUT", "identity invalid");
  }
}

// ═══════════════════════════════════════ E4-T5: attempt outcome helpers

// Normalized relative path for the task-permitted path allowlist. Rejects
// anything that could escape the worktree — fail-closed, a malformed allowlist
// entry is an input error, never a silent pass.
function vRelPath(v: unknown, nm: string): string {
  if (typeof v !== "string") fail("INVALID_INPUT", `${nm} must be string`);
  if (NON_CTL.test(v)) fail("INVALID_INPUT", `${nm} control char`);
  const n = v.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (n.startsWith("/")) fail("INVALID_INPUT", `${nm} absolute`);
  const parts = n.split("/").filter((s) => s.length > 0);
  if (parts.length === 0) fail("INVALID_INPUT", `${nm} empty`);
  if (parts.some((s) => s === "." || s === "..")) fail("INVALID_INPUT", `${nm} traversal`);
  return parts.join("/");
}

// Paths from `git status --porcelain=v1 -z`. Each record is `XY <path>\0`;
// a rename/copy is followed by a bare original-path record, which also counts
// as changed — those bytes were touched too.
function statusPaths(statusOut: string): string[] {
  const out: string[] = [];
  let expectOrig = false;
  for (const rec of statusOut.split("\0")) {
    if (rec.length === 0) continue;
    if (expectOrig) { expectOrig = false; out.push(rec); continue; }
    if (rec.length < 4 || rec[2] !== " ") continue;
    const body = rec.slice(3);
    if (body.length > 0) out.push(body);
    const xy = rec.slice(0, 2);
    if (xy.includes("R") || xy.includes("C")) expectOrig = true;
  }
  return out;
}

function isWithinAllowed(p: string, allowed: readonly string[]): boolean {
  const n = p.replace(/\\/g, "/").replace(/^\.\/+/, "");
  for (const a of allowed) if (n === a || n.startsWith(a + "/")) return true;
  return false;
}

export type LoopGitWorkspaceCleanupClassification = Readonly<{
  decision: LoopGitWorkspaceCleanupDecision;
  outOfBoundsPaths: readonly string[];
}>;

// Pure three-state decision for an attempt workspace. Exported so the caller
// can pre-judge without catching, and so the rule is testable without git.
export function classifyWorkspaceCleanup(input: Readonly<{
  outcome: LoopGitWorkspaceAttemptOutcome;
  changedPaths: readonly string[];
  allowedPaths: readonly string[] | null;
}>): LoopGitWorkspaceCleanupClassification {
  let outOfBounds: readonly string[] = EMPTY_PATHS;
  if (input.allowedPaths !== null && input.changedPaths.length > 0) {
    const bad = input.changedPaths.filter((p) => !isWithinAllowed(p, input.allowedPaths!));
    if (bad.length > 0) outOfBounds = Object.freeze(bad.slice());
  }
  // Out-of-bounds and unknown both outrank a reported success: unattributable
  // side effects are never promotable and never safe to discard.
  if (outOfBounds.length > 0) return freeze({ decision: "block", outOfBoundsPaths: outOfBounds });
  if (input.outcome === "unknown") return freeze({ decision: "block", outOfBoundsPaths: EMPTY_PATHS });
  if (input.outcome === "failed") return freeze({ decision: "isolate", outOfBoundsPaths: EMPTY_PATHS });
  return freeze({ decision: "promote", outOfBoundsPaths: EMPTY_PATHS });
}

// ═══════════════════════════════════════ Manager

export class LoopGitWorkspaceManager {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly gitId: string;
  private readonly gTo: number;
  private readonly mxOut: number;
  private readonly mxWip: number;

  constructor(o: LoopGitWorkspaceManagerOptions) {
    if (process.platform !== "darwin" && process.platform !== "linux")
      fail("UNSUPPORTED_PLATFORM", "os");
    const opts = scanPlain(o, MGR_KEYS, "options");
    const rv = opts.runner;
    if (!rv || typeof (rv as any).run !== "function")
      fail("INVALID_INPUT", "runner missing run");
    this.runner = rv as Pick<LoopPosixProcessRunner, "run">;
    this.gitId = vS(opts.gitExecutableId, "gitExecutableId");
    this.gTo = vI(opts.gitTimeoutMs ?? DEF_TO, MIN_TO, MAX_TO, "gitTimeoutMs");
    this.mxOut = vI(opts.maxGitOutputBytes ?? DEF_OUT, MIN_OUT, MAX_OUT, "maxGitOutputBytes");
    this.mxWip = vI(opts.maxSourceWipBytes ?? DEF_WIP, 1, MAX_OUT, "maxSourceWipBytes");
  }

  // ── Public: deterministic workspace path ──

  workspacePathFor(identity: LoopRunIdentity): string {
    validateIdentity(identity);
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    const rp = vAbsPath(identity.repositoryPath, "repositoryPath");
    if (rp === cr) fail("INVALID_INPUT", "repoPath equals controlRoot");
    const rRC = path.relative(rp, cr);
    const rCR = path.relative(cr, rp);
    if (!rRC.startsWith("..") && !path.isAbsolute(rRC))
      fail("INVALID_INPUT", "repoPath contains controlRoot");
    if (!rCR.startsWith("..") && !path.isAbsolute(rCR))
      fail("INVALID_INPUT", "controlRoot contains repoPath");
    const digest = sha256Hex(
      Buffer.from(
        JSON.stringify([
          "loop-git-workspace-v1", identity.runId, identity.requirementId,
          identity.repository.toLowerCase(), rp, identity.baseBranch,
          identity.expectedBaseSha, identity.taskBranch, cr,
        ]),
        "utf8",
      ),
    );
    const wsDir = path.join(cr, "workspaces", "v1", digest);
    if (path.relative(cr, wsDir).startsWith("..") || path.isAbsolute(path.relative(cr, wsDir)))
      fail("INVALID_INPUT", "path outside controlRoot");
    return wsDir;
  }

  // ── Public: prepare ──

  async prepare(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateIdentity(identity);
    await this._valRepo(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    let mainErr: LoopGitWorkspaceError | null = null;
    try {
      const wsPath = this.workspacePathFor(identity);
      await this._ensureDirs(wsPath);
      const curBase = await this._curBase(identity);
      if (curBase !== identity.expectedBaseSha) fail("BASE_SHA_MISMATCH", "base mismatch");
      const wts = await this._wtList(identity.repositoryPath);
      const cls = this._classify(wts, identity.taskBranch, wsPath);
      if (cls.state === "exact-ok") {
        const actualHead = await this._verifyStructure(identity, wsPath, cls.taskHead);
        if (!await this._isAnc(wsPath, identity.expectedBaseSha, actualHead))
          fail("TASK_BRANCH_CONFLICT", "base not ancestor");
        return await this._snap(identity, wsPath, "recovered", curBase, false);
      }
      if (cls.state === "branch-only") {
        return await this._attachBr(identity, wsPath, cls.taskHead!, curBase);
      }
      if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
      if (cls.state === "none") {
        // Check for branch-only recovery (branch exists without worktree)
        const brCheck = await this._gitR(
          identity.repositoryPath,
          ["show-ref", "--verify", "--quiet", `refs/heads/${identity.taskBranch}`],
          [0, 1],
        );
        if (brCheck.exitCode === 0) {
          const h = (await this._gitR(identity.repositoryPath,
            ["rev-parse", "--verify", `refs/heads/${identity.taskBranch}`], [0])).stdout.trim();
          return await this._attachBr(identity, wsPath, h, curBase);
        }
        return await this._createWt(identity, wsPath, curBase);
      }
      fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError) mainErr = e;
      else mainErr = tf("GIT_COMMAND_FAILED", "git error");
      throw mainErr;
    } finally {
      let fpA = fpB, fpFailed = false;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch { fpFailed = true; }
      if (fpFailed || fpB !== fpA) throw tf("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ── Public: inspect ──

  async inspect(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    validateIdentity(identity);
    await this._valRepo(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    try {
      const wsPath = this.workspacePathFor(identity);
      const curBase = await this._curBase(identity);
      const drifted = curBase !== identity.expectedBaseSha;
      const wts = await this._wtList(identity.repositoryPath);
      const cls = this._classify(wts, identity.taskBranch, wsPath);
      if (cls.state === "exact-ok") {
        await this._verifyStructure(identity, wsPath, cls.taskHead);
        return await this._snap(identity, wsPath, "inspected", curBase, drifted);
      }
      if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
      fail("WORKSPACE_NOT_FOUND", "not found");
    } finally {
      let fpA = fpB, fpFailed = false;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch { fpFailed = true; }
      if (fpFailed || fpB !== fpA) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ── Public: cleanup ──

  async cleanup(
    identity: LoopRunIdentity,
    opts: LoopGitWorkspaceCleanupOptions,
  ): Promise<LoopGitWorkspaceCleanupResult> {
    validateIdentity(identity);
    await this._valRepo(identity);
    let fpB = await this._srcFp(identity.repositoryPath);
    try {
      const o = scanPlain(opts, CLN_KEYS, "cleanup");
      const expHead = vSha(vS(o.expectedTaskHeadSha, "expectedTaskHeadSha"), "expectedTaskHeadSha");
      const delBr = o.deleteTaskBranch === true;
      // E4-T5: attempt outcome and the task-permitted path set
      let outcome: LoopGitWorkspaceAttemptOutcome = "succeeded";
      if (o.outcome !== undefined) {
        if (typeof o.outcome !== "string" || !OUTCOMES.includes(o.outcome))
          fail("INVALID_INPUT", "outcome invalid");
        outcome = o.outcome as LoopGitWorkspaceAttemptOutcome;
      }
      let allowedPaths: readonly string[] | null = null;
      if (o.allowedPaths !== undefined) {
        if (!Array.isArray(o.allowedPaths)) fail("INVALID_INPUT", "allowedPaths must be array");
        allowedPaths = Object.freeze(
          (o.allowedPaths as unknown[]).map((p) => vRelPath(p, "allowedPaths entry")),
        );
      }
      const wsPath = this.workspacePathFor(identity);
      const wts = await this._wtList(identity.repositoryPath);
      const cls = this._classify(wts, identity.taskBranch, wsPath);
      const brRef = `refs/heads/${identity.taskBranch}`;

      // Verify branch HEAD if branch exists
      const brCheck = await this._gitR(
        identity.repositoryPath,
        ["show-ref", "--verify", "--quiet", brRef],
        [0, 1],
      );
      const brExists = brCheck.exitCode === 0;

      if (brExists) {
        const brH = (await this._gitR(identity.repositoryPath,
          ["rev-parse", "--verify", brRef], [0])).stdout.trim();
        if (brH !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");
        if (!await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, expHead))
          fail("CLEANUP_BLOCKED", "base not ancestor");
        if (wts.filter((w) =>
          w.branch === identity.taskBranch &&
          !w.prunable && w.pathExists && w.pathIsDir && !w.pathIsSymlink,
        ).length > 1) fail("CLEANUP_BLOCKED", "branch in use");
      }

      // Handle non-exact-ok states
      if (cls.state !== "exact-ok") {
        if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
        if (!brExists) return freeze({
          workspacePath: wsPath, worktreeRemoved: false,
          taskBranchDeleted: false, taskBranchRetained: false, alreadyAbsent: true,
          decision: "promote", outOfBoundsPaths: EMPTY_PATHS, evidenceRetained: false,
        });
        if (!delBr) return freeze({
          workspacePath: wsPath, worktreeRemoved: false,
          taskBranchDeleted: false, taskBranchRetained: true, alreadyAbsent: false,
          decision: "promote", outOfBoundsPaths: EMPTY_PATHS, evidenceRetained: false,
        });
        // Use unified safe delete for branch-only path
        const deleted = await this._safeDeleteBranch(identity.repositoryPath, identity.taskBranch);
        return freeze({
          workspacePath: wsPath, worktreeRemoved: false,
          taskBranchDeleted: deleted, taskBranchRetained: false, alreadyAbsent: false,
          decision: "promote", outOfBoundsPaths: EMPTY_PATHS, evidenceRetained: false,
        });
      }

      // Exact-ok: verify structure (no expected head check here)
      await this._verifyStructure(identity, wsPath, cls.taskHead);
      // Cleanup-specific: verify expected head matches actual
      const actualHead = (await this._gitR(wsPath, ["rev-parse", "--verify", "HEAD"], [0])).stdout.trim();
      if (actualHead !== expHead) fail("CLEANUP_BLOCKED", "head mismatch");

      const status = (await this._gitR(wsPath,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"], [0])).stdout;
      // Every path the attempt touched: what it committed against the base plus
      // whatever is still uncommitted or untracked. Plan :443-444 — the
      // workspace diff must contain only task-permitted paths, and a committed
      // out-of-bounds file is exactly as out of bounds as an uncommitted one.
      //
      // --no-renames: git otherwise collapses `git mv secret/b.ts src/b.ts` into
      // a single destination record, so a move out of an out-of-bounds path
      // prints only `src/b.ts` and the attempt gets promoted with its evidence
      // destroyed. Without the flag a rename is reported as delete+add, which is
      // the same conservative direction statusPaths already takes for unstaged
      // renames (it counts the original path too: those bytes were touched).
      //
      // Gated on `allowedPaths`: `changedPaths` is only ever read by the
      // out-of-bounds check, and that check itself is gated on `allowedPaths`
      // (see classifyWorkspaceCleanup). Running the diff unconditionally cost
      // every legacy caller one extra git subprocess for a value nobody read,
      // and — because _gitR turns any timeout, signal, truncation or non-zero
      // exit into GIT_COMMAND_FAILED — it added a failure surface to a cleanup
      // path that previously could not fail there.
      const committed = allowedPaths === null ? "" : (await this._gitR(wsPath,
        ["diff", "--name-only", "-z", "--no-renames", `${identity.expectedBaseSha}...HEAD`], [0])).stdout;
      const changedPaths = [...new Set([
        ...committed.split("\0").filter(Boolean),
        ...statusPaths(status),
      ])];
      // E4-T5 three-state decision. block → fail closed (nothing removed,
      // nothing promoted); isolate → keep the worktree and branch as evidence
      // and report it instead of throwing; promote → the existing reclamation
      // path, which still requires a clean tree.
      const verdict = classifyWorkspaceCleanup({
        outcome, changedPaths, allowedPaths,
      });
      if (verdict.decision === "block")
        fail("CLEANUP_BLOCKED", verdict.outOfBoundsPaths.length > 0
          ? `out-of-bounds paths: ${verdict.outOfBoundsPaths.length}`
          : "unknown side effects");
      if (verdict.decision === "isolate") return freeze({
        workspacePath: wsPath, worktreeRemoved: false,
        taskBranchDeleted: false, taskBranchRetained: true, alreadyAbsent: false,
        decision: "isolate", outOfBoundsPaths: verdict.outOfBoundsPaths,
        evidenceRetained: true,
      });
      if (status.length > 0) fail("WORKSPACE_DIRTY", "workspace dirty");

      await this._git(identity.repositoryPath, ["worktree", "remove", wsPath]);

      // ── Post-remove race: if branch existed before, verify it still exists
      if (brExists) {
        let postBrR: { exitCode: number; stdout: string };
        try {
          postBrR = await this._runRaw(identity.repositoryPath,
            ["show-ref", "--verify", "--quiet", brRef]);
        } catch (e) {
          if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
          throw tf("GIT_COMMAND_FAILED", "show-ref post-remove runner");
        }
        // Branch disappeared during remove → race
        if (postBrR.exitCode === 1) fail("CLEANUP_BLOCKED", "branch disappeared during remove");
        if (postBrR.exitCode !== 0) fail("GIT_COMMAND_FAILED", "show-ref post-remove unexpected");

        // Branch still exists — re-read HEAD and verify
        let brH2R: { exitCode: number; stdout: string };
        try {
          brH2R = await this._runRaw(identity.repositoryPath,
            ["rev-parse", "--verify", brRef]);
        } catch (e) {
          if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
          throw tf("GIT_COMMAND_FAILED", "rev-parse post-remove runner");
        }
        if (brH2R.exitCode !== 0) fail("CLEANUP_BLOCKED", "branch rev-parse post-remove");
        const brH2 = brH2R.stdout.trim();
        if (brH2 !== expHead) fail("CLEANUP_BLOCKED", "head changed");
        if (!await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, expHead))
          fail("CLEANUP_BLOCKED", "base not ancestor");
      }

      // ── Re-read worktree list: reject ANY registration residue
      const wts2 = await this._wtList(identity.repositoryPath);
      // Exact-path residue (valid, prunable, broken, missing — any record)
      const anyExact2 = wts2.filter((w) => w.rawPath === wsPath || w.canonPath === wsPath);
      if (anyExact2.length > 0) fail("CLEANUP_BLOCKED", "worktree residue");
      // Task-branch registration residue (valid, prunable, broken, missing — any reattach)
      const anyTask2 = wts2.filter((w) => w.branch === identity.taskBranch);
      if (anyTask2.length > 0) fail("CLEANUP_BLOCKED", "branch still registered");

      let bDel = false, bRet = true;
      if (delBr && brExists) {
        bDel = await this._safeDeleteBranch(identity.repositoryPath, identity.taskBranch);
        bRet = false;
      }
      return freeze({
        workspacePath: wsPath, worktreeRemoved: true,
        taskBranchDeleted: bDel, taskBranchRetained: bRet, alreadyAbsent: false,
        decision: "promote", outOfBoundsPaths: EMPTY_PATHS, evidenceRetained: false,
      });
    } finally {
      let fpA = fpB, fpFailed = false;
      try { fpA = await this._srcFp(identity.repositoryPath); } catch { fpFailed = true; }
      if (fpFailed || fpB !== fpA) fail("SOURCE_WORKSPACE_DRIFT", "source drifted");
    }
  }

  // ═══════════════════════════════════════ Private: Git helpers

  private async _gitR(
    cwd: string, args: readonly string[], allowed: number[],
  ): Promise<{ exitCode: number; stdout: string }> {
    const req: LoopPosixProcessRequest = {
      executableId: this.gitId, cwd, args: Object.freeze([...args]),
      timeoutMs: this.gTo, maxStdoutBytes: this.mxOut, maxStderrBytes: this.mxOut,
    };
    let r: LoopPosixProcessResult;
    try { r = await this.runner.run(req); }
    catch { fail("GIT_COMMAND_FAILED", "runner failed"); }
    if (r.status !== "exited") fail("GIT_COMMAND_FAILED", "not exited");
    if (r.exitCode === null || r.exitCode === undefined || !Number.isSafeInteger(r.exitCode))
      fail("GIT_COMMAND_FAILED", "bad exit");
    if (r.signal !== null) fail("GIT_COMMAND_FAILED", "signal");
    if (r.stdoutTruncated || r.stderrTruncated) fail("GIT_COMMAND_FAILED", "truncated");
    if (!allowed.includes(r.exitCode)) fail("GIT_COMMAND_FAILED", `exit ${r.exitCode}`);
    return { exitCode: r.exitCode, stdout: r.stdout };
  }

  private async _git(cwd: string, args: readonly string[]): Promise<string> {
    return (await this._gitR(cwd, args, [0])).stdout;
  }

  // Direct Runner call that returns exitCode (infrastructure failures throw GIT_COMMAND_FAILED)
  private async _runRaw(
    cwd: string, args: readonly string[],
  ): Promise<{ exitCode: number; stdout: string }> {
    const req: LoopPosixProcessRequest = {
      executableId: this.gitId, cwd, args: Object.freeze([...args]),
      timeoutMs: this.gTo, maxStdoutBytes: this.mxOut, maxStderrBytes: this.mxOut,
    };
    let r: LoopPosixProcessResult;
    try { r = await this.runner.run(req); }
    catch { fail("GIT_COMMAND_FAILED", "runner failed"); }
    if (r.status !== "exited") fail("GIT_COMMAND_FAILED", "not exited");
    if (r.exitCode === null || r.exitCode === undefined || !Number.isSafeInteger(r.exitCode))
      fail("GIT_COMMAND_FAILED", "bad exit");
    if (r.signal !== null) fail("GIT_COMMAND_FAILED", "signal");
    if (r.stdoutTruncated || r.stderrTruncated) fail("GIT_COMMAND_FAILED", "truncated");
    return { exitCode: r.exitCode, stdout: r.stdout };
  }

  private async _chkRef(rp: string, branch: string): Promise<void> {
    let r: { exitCode: number; stdout: string };
    try {
      r = await this._runRaw(rp, ["check-ref-format", "--branch", branch]);
    } catch {
      fail("GIT_COMMAND_FAILED", "runner failed");
    }
    if (r.exitCode === 0) return;
    fail("INVALID_INPUT", "branch invalid");
  }

  // ═══════════════════════════════════════ Private: validation

  private async _valRepo(identity: LoopRunIdentity): Promise<void> {
    const rp = vAbsPath(identity.repositoryPath, "repositoryPath");
    const cr = vAbsPath(identity.controlRoot, "controlRoot");
    if (rp === cr) fail("INVALID_INPUT", "repoPath equals controlRoot");
    const rRC = path.relative(rp, cr), rCR = path.relative(cr, rp);
    if (!rRC.startsWith("..") && !path.isAbsolute(rRC))
      fail("INVALID_INPUT", "repoPath contains controlRoot");
    if (!rCR.startsWith("..") && !path.isAbsolute(rCR))
      fail("INVALID_INPUT", "controlRoot contains repoPath");
    if (!GH_SLUG_RE.test(identity.repository)) fail("REPOSITORY_INVALID", "slug format");
    await this._chkRef(rp, identity.baseBranch);
    await this._chkRef(rp, identity.taskBranch);
    if (NON_CTL.test(identity.baseBranch) || identity.baseBranch.startsWith("-") ||
      identity.baseBranch.includes(" ")) fail("INVALID_INPUT", "baseBranch chars");
    if (NON_CTL.test(identity.taskBranch) || identity.taskBranch.startsWith("-") ||
      identity.taskBranch.includes(" ")) fail("INVALID_INPUT", "taskBranch chars");
    if (identity.baseBranch === identity.taskBranch) fail("INVALID_INPUT", "same branch");
    vSha(identity.expectedBaseSha, "expectedBaseSha");
    if ((await this._gitR(rp, ["rev-parse", "--is-inside-work-tree"], [0])).stdout.trim() !== "true")
      fail("REPOSITORY_INVALID", "not inside work tree");
    const tl = (await this._gitR(rp, ["rev-parse", "--show-toplevel"], [0])).stdout.trim();
    try {
      if (fs.realpathSync(tl) !== fs.realpathSync(rp))
        fail("REPOSITORY_INVALID", "toplevel mismatch");
    } catch { fail("REPOSITORY_INVALID", "toplevel realpath"); }
    const cd = (await this._gitR(rp, ["rev-parse", "--git-common-dir"], [0])).stdout.trim();
    try {
      if (!fs.lstatSync(fs.realpathSync(path.resolve(rp, cd))).isDirectory())
        fail("REPOSITORY_INVALID", "common dir");
    } catch { fail("REPOSITORY_INVALID", "common dir missing"); }
    const origin = (await this._gitR(rp, ["remote", "get-url", "origin"], [0])).stdout.trim();
    const m = origin.match(ORIGIN_RE);
    if (!m) fail("REPOSITORY_INVALID", "origin URL unsupported");
    const slug = (m[1] || m[2] || m[3] || "").toLowerCase();
    if (slug !== identity.repository.toLowerCase()) fail("REPOSITORY_MISMATCH", "origin mismatch");
    // Expected commit: _runRaw to distinguish git-failure from infrastructure
    try {
      const ec = await this._runRaw(rp, [
        "rev-parse", "--verify", `${identity.expectedBaseSha}^{commit}`,
      ]);
      if (ec.exitCode !== 0 || ec.stdout.trim() !== identity.expectedBaseSha)
        fail("BASE_SHA_MISMATCH", "expected commit not found");
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw e;
    }
  }

  private async _curBase(identity: LoopRunIdentity): Promise<string> {
    const ref = `refs/remotes/origin/${identity.baseBranch}^{commit}`;
    let r: { exitCode: number; stdout: string };
    try {
      r = await this._runRaw(identity.repositoryPath, ["rev-parse", "--verify", ref]);
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw e;
    }
    if (r.exitCode !== 0) fail("BASE_SHA_MISMATCH", "remote base not found");
    return r.stdout.trim();
  }

  private async _isAnc(cwd: string, a: string, d: string): Promise<boolean> {
    const r = await this._gitR(cwd, ["merge-base", "--is-ancestor", a, d], [0, 1]);
    return r.exitCode === 0;
  }

  // ═══════════════════════════════════════ Private: worktree list

  private async _wtList(rp: string): Promise<WtRec[]> {
    const out = (await this._gitR(rp, ["worktree", "list", "--porcelain", "-z"], [0])).stdout;
    const entries = out.split("\x00").filter(Boolean);
    const res: WtRec[] = [];
    let cur: Partial<WtRec> = {};
    const flush = () => {
      if (!cur.rawPath) return;
      const raw = cur.rawPath!;
      let canon: string | null = null, pExists = false, pIsDir = false,
        pIsSymlink = false, pErr = "";
      try {
        const st = fs.lstatSync(raw);
        pExists = true;
        pIsSymlink = st.isSymbolicLink();
        pIsDir = st.isDirectory();
        if (!pIsSymlink && pIsDir) {
          try { canon = fs.realpathSync(raw); } catch { pErr = "realpath failed"; }
        } else {
          pErr = pIsSymlink ? "symlink" : "not directory";
        }
      } catch (e) {
        pErr = (e as NodeJS.ErrnoException).code || "lstat failed";
      }
      res.push({
        rawPath: raw, canonPath: canon, pathExists: pExists,
        pathIsDir: pIsDir, pathIsSymlink: pIsSymlink, pathError: pErr,
        head: cur.head || "", branch: cur.branch ?? null,
        detached: !!cur.detached, prunable: !!cur.prunable,
        prunableReason: cur.prunableReason || "",
      });
      cur = {};
    };
    for (const e of entries) {
      if (e.startsWith("worktree ")) { flush(); cur.rawPath = e.slice(9); }
      else if (e.startsWith("HEAD ")) cur.head = e.slice(5);
      else if (e.startsWith("branch ")) {
        const raw = e.slice(7);
        cur.branch = raw.startsWith("refs/heads/") ? raw.slice(11) : raw;
      } else if (e === "detached") cur.detached = true;
      else if (e.startsWith("prunable")) {
        cur.prunable = true;
        if (e.length > 8 && e[8] === " ") cur.prunableReason = e.slice(9);
      }
    }
    flush();
    return res;
  }

  // ═══════════════════════════════════════ Private: unified classification

  private _classify(
    wts: WtRec[], taskBranch: string, wsPath: string,
  ): { state: "exact-ok" | "branch-only" | "none"; errorCode?: string; errorMsg?: string; taskHead?: string } {
    // Check ALL task-branch records for corruption (not just exact path)
    const taskRecs = wts.filter((w) => w.branch === taskBranch);
    if (taskRecs.some((w) => w.prunable))
      return { state: "none", errorCode: "WORKSPACE_CORRUPT", errorMsg: "prunable task record" };
    for (const w of taskRecs) {
      if (!w.prunable && (!w.pathExists || !w.pathIsDir || w.pathIsSymlink ||
        (w.pathExists && w.pathIsDir && !w.pathIsSymlink && w.canonPath === null)))
        return { state: "none", errorCode: "WORKSPACE_CORRUPT", errorMsg: "broken task record" };
    }
    // Check exact-path records
    const exactRecs = wts.filter((w) => w.rawPath === wsPath || (w.canonPath !== null && w.canonPath === wsPath));
    if (exactRecs.some((w) => w.prunable))
      return { state: "none", errorCode: "WORKSPACE_CORRUPT", errorMsg: "prunable exact path" };
    for (const w of exactRecs) {
      if (!w.prunable && (!w.pathExists || !w.pathIsDir || w.pathIsSymlink ||
        (w.pathExists && w.pathIsDir && !w.pathIsSymlink && w.canonPath === null)))
        return { state: "none", errorCode: "WORKSPACE_CORRUPT", errorMsg: "broken exact path" };
    }
    // Filter to valid records
    const validExact = exactRecs.filter((w) =>
      !w.prunable && w.pathExists && w.pathIsDir && !w.pathIsSymlink && w.canonPath !== null);
    const validTask = taskRecs.filter((w) =>
      !w.prunable && w.pathExists && w.pathIsDir && !w.pathIsSymlink && w.canonPath !== null);
    if (validTask.length > 1)
      return { state: "none", errorCode: "TASK_BRANCH_CONFLICT", errorMsg: "multiple for branch" };
    const ev = validExact[0] || null;
    const tv = validTask[0] || null;
    if (ev && ev.detached)
      return { state: "none", errorCode: "WORKSPACE_CORRUPT", errorMsg: "detached HEAD" };
    if (ev && ev.branch !== taskBranch)
      return { state: "none", errorCode: "WORKTREE_CONFLICT", errorMsg: "other branch" };
    if (tv && !ev)
      return { state: "none", errorCode: "TASK_BRANCH_CONFLICT", errorMsg: "branch elsewhere" };
    if (ev && tv && ev.rawPath !== tv.rawPath)
      return { state: "none", errorCode: "TASK_BRANCH_CONFLICT", errorMsg: "path mismatch" };
    if (ev && tv && ev.rawPath === tv.rawPath)
      return { state: "exact-ok", taskHead: ev.head };
    // Check unregistered path
    try {
      fs.lstatSync(wsPath);
      return { state: "none", errorCode: "WORKTREE_CONFLICT", errorMsg: "unregistered" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        return { state: "none", errorCode: "WORKSPACE_IO_FAILED", errorMsg: "lstat failed" };
    }
    return { state: "none" };
  }

  // ═══════════════════════════════════════ Private: safe branch deletion

  // Unified safe branch deletion used by both branch-only and exact-worktree
  // cleanup paths. Uses _runRaw for infrastructure/git boundary separation.
  // Returns true if branch was confirmed deleted (show-ref exit 1).
  private async _safeDeleteBranch(rp: string, taskBranch: string): Promise<boolean> {
    // Step 1: git branch -d <taskBranch>
    let delR: { exitCode: number; stdout: string };
    try {
      delR = await this._runRaw(rp, ["branch", "-d", taskBranch]);
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "branch -d runner");
    }
    if (delR.exitCode !== 0) fail("CLEANUP_BLOCKED", "branch delete rejected");

    // Step 2: Post-condition — verify branch ref is gone
    const brRef = `refs/heads/${taskBranch}`;
    let postR: { exitCode: number; stdout: string };
    try {
      postR = await this._runRaw(rp, ["show-ref", "--verify", "--quiet", brRef]);
    } catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "show-ref runner");
    }
    if (postR.exitCode === 0) fail("CLEANUP_BLOCKED", "branch still exists after delete");
    if (postR.exitCode === 1) return true; // confirmed deleted
    fail("GIT_COMMAND_FAILED", "show-ref unexpected exit");
  }

  // ═══════════════════════════════════════ Private: workspace structure

  // Verifies workspace structural integrity using single _runRaw calls per query.
  // Infrastructure failures → GIT_COMMAND_FAILED; Git non-zero → WORKSPACE_CORRUPT.
  // Performs three-way HEAD comparison: worktree-list HEAD, workspace HEAD,
  // refs/heads/<taskBranch>. Returns actual task HEAD.
  // Does NOT check expectedTaskHeadSha (caller's job).
  private async _verifyStructure(
    identity: LoopRunIdentity, wsPath: string, wtListHead?: string,
  ): Promise<string> {
    // ── symbolic-ref: exit 1 = detached → WORKSPACE_CORRUPT
    let symR: { exitCode: number; stdout: string };
    try { symR = await this._runRaw(wsPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]); }
    catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "symbolic-ref runner");
    }
    if (symR.exitCode === 1) fail("WORKSPACE_CORRUPT", "detached HEAD");
    if (symR.exitCode !== 0) fail("WORKSPACE_CORRUPT", "symbolic-ref failed");
    if (symR.stdout.trim() !== identity.taskBranch) fail("WORKSPACE_CORRUPT", "branch mismatch");

    // ── rev-parse HEAD (workspace)
    let wsHeadR: { exitCode: number; stdout: string };
    try { wsHeadR = await this._runRaw(wsPath, ["rev-parse", "--verify", "HEAD"]); }
    catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "rev-parse HEAD runner");
    }
    if (wsHeadR.exitCode !== 0) fail("WORKSPACE_CORRUPT", "HEAD missing");
    const wsHead = wsHeadR.stdout.trim();

    // ── rev-parse refs/heads/<taskBranch>
    let brRefR: { exitCode: number; stdout: string };
    try { brRefR = await this._runRaw(identity.repositoryPath,
      ["rev-parse", "--verify", `refs/heads/${identity.taskBranch}`]); }
    catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "rev-parse branch ref runner");
    }
    if (brRefR.exitCode !== 0) fail("WORKSPACE_CORRUPT", "branch ref missing");
    const brRefVal = brRefR.stdout.trim();

    // ── Three-way HEAD comparison
    if (wtListHead !== undefined && wsHead !== wtListHead)
      fail("WORKSPACE_CORRUPT", "HEAD/wt-list mismatch");
    if (wsHead !== brRefVal)
      fail("WORKSPACE_CORRUPT", "HEAD/ref mismatch");

    // ── rev-parse --git-common-dir (workspace)
    let wsCdR: { exitCode: number; stdout: string };
    try { wsCdR = await this._runRaw(wsPath, ["rev-parse", "--git-common-dir"]); }
    catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "rev-parse common-dir runner");
    }
    if (wsCdR.exitCode !== 0) fail("WORKSPACE_CORRUPT", "common dir missing");
    const wsCd = wsCdR.stdout.trim();

    // ── rev-parse --git-common-dir (source repo)
    let srcCdR: { exitCode: number; stdout: string };
    try { srcCdR = await this._runRaw(identity.repositoryPath, ["rev-parse", "--git-common-dir"]); }
    catch (e) {
      if (e instanceof LoopGitWorkspaceError && e.code === "GIT_COMMAND_FAILED") throw e;
      throw tf("GIT_COMMAND_FAILED", "rev-parse src common-dir runner");
    }
    if (srcCdR.exitCode !== 0) fail("WORKSPACE_CORRUPT", "src common dir missing");
    const srcCd = srcCdR.stdout.trim();

    try {
      if (fs.realpathSync(path.resolve(wsPath, wsCd)) !==
        fs.realpathSync(path.resolve(identity.repositoryPath, srcCd)))
        fail("WORKSPACE_CORRUPT", "common dir mismatch");
    } catch { fail("WORKSPACE_CORRUPT", "common dir realpath"); }
    return wsHead;
  }

  // ═══════════════════════════════════════ Private: workspace operations

  // After a successful `git worktree add` (exit 0) on the normal create/attach
  // path, re-read `git worktree list --porcelain -z`, classify via the shared
  // _classify(), require an exact-ok registration, and run the three-way HEAD
  // structural verification using the worktree-list HEAD. Result rules:
  //   missing/untrusted exact registration → WORKSPACE_IO_FAILED
  //   typed conflict/corruption            → keeps its typed error
  //   three-way HEAD mismatch              → WORKSPACE_CORRUPT (in _verifyStructure)
  //   Runner infrastructure failure        → GIT_COMMAND_FAILED (in _wtList/_verifyStructure)
  // Reuses _classify — no second classification logic is introduced.
  private async _verifyPostAdd(
    identity: LoopRunIdentity, wsPath: string, absentMsg: string,
  ): Promise<void> {
    const wts = await this._wtList(identity.repositoryPath);
    const cls = this._classify(wts, identity.taskBranch, wsPath);
    if (cls.state !== "exact-ok") {
      if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
      fail("WORKSPACE_IO_FAILED", absentMsg);
    }
    await this._verifyStructure(identity, wsPath, cls.taskHead);
  }

  private async _ensureDirs(wsPath: string): Promise<void> {
    const v1 = path.dirname(wsPath), ws = path.dirname(v1);
    for (const d of [ws, v1]) {
      try {
        const st = fs.lstatSync(d);
        if (st.isSymbolicLink()) fail("INVALID_INPUT", "dir symlink");
        if (!st.isDirectory()) fail("INVALID_INPUT", "not dir");
        if (fs.realpathSync(d) !== d) fail("INVALID_INPUT", "not canonical");
      } catch (e) {
        if (e instanceof LoopGitWorkspaceError) throw e;
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          fs.mkdirSync(d, { mode: 0o700 });
        } else fail("WORKSPACE_IO_FAILED", "dir check");
      }
    }
  }

  private async _createWt(
    identity: LoopRunIdentity, wsPath: string, curBase: string,
  ): Promise<LoopGitWorkspaceSnapshot> {
    // Use _runRaw to distinguish infrastructure failure from git failure
    let r: { exitCode: number; stdout: string };
    try {
      r = await this._runRaw(identity.repositoryPath, [
        "worktree", "add", "-b", identity.taskBranch, wsPath, identity.expectedBaseSha,
      ]);
    } catch {
      fail("GIT_COMMAND_FAILED", "runner failed");
    }
    if (r.exitCode !== 0) {
      // Git non-zero — race reconciliation
      for (let i = 0; i < 5; i++) {
        await sleep(50 + i * 50);
        const wts = await this._wtList(identity.repositoryPath);
        const cls = this._classify(wts, identity.taskBranch, wsPath);
        if (cls.state === "exact-ok") {
          await this._verifyStructure(identity, wsPath, cls.taskHead);
          return await this._snap(identity, wsPath, "recovered", curBase, false);
        }
        if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
      }
      throw tf("WORKSPACE_IO_FAILED", "create failed");
    }
    await this._verifyPostAdd(identity, wsPath, "no registration after create");
    return await this._snap(identity, wsPath, "created", curBase, false);
  }

  private async _attachBr(
    identity: LoopRunIdentity, wsPath: string, taskHead: string, curBase: string,
  ): Promise<LoopGitWorkspaceSnapshot> {
    if (!await this._isAnc(identity.repositoryPath, identity.expectedBaseSha, taskHead))
      fail("TASK_BRANCH_CONFLICT", "base not ancestor");
    let r: { exitCode: number; stdout: string };
    try {
      r = await this._runRaw(identity.repositoryPath, [
        "worktree", "add", wsPath, identity.taskBranch,
      ]);
    } catch {
      fail("GIT_COMMAND_FAILED", "runner failed");
    }
    if (r.exitCode !== 0) {
      for (let i = 0; i < 3; i++) {
        await sleep(50);
        const wts = await this._wtList(identity.repositoryPath);
        const cls = this._classify(wts, identity.taskBranch, wsPath);
        if (cls.state === "exact-ok") {
          await this._verifyStructure(identity, wsPath, cls.taskHead);
          return await this._snap(identity, wsPath, "recovered", curBase, false);
        }
        if (cls.errorCode) fail(cls.errorCode as LoopGitWorkspaceErrorCode, cls.errorMsg!);
      }
      throw tf("WORKSPACE_IO_FAILED", "attach failed");
    }
    await this._verifyPostAdd(identity, wsPath, "no registration after attach");
    return await this._snap(identity, wsPath, "recovered", curBase, false);
  }

  private async _snap(
    identity: LoopRunIdentity, wsPath: string,
    state: "created" | "recovered" | "inspected",
    curBase: string, drifted: boolean,
  ): Promise<LoopGitWorkspaceSnapshot> {
    const cd = await fs.promises.realpath(path.resolve(
      identity.repositoryPath,
      (await this._gitR(identity.repositoryPath, ["rev-parse", "--git-common-dir"], [0])).stdout.trim(),
    ));
    const tH = (await this._gitR(wsPath, ["rev-parse", "--verify", "HEAD"], [0])).stdout.trim();
    const tS = (await this._gitR(wsPath,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"], [0])).stdout;
    const dirty = tS.length > 0;
    const tD = sha256Hex(Buffer.from(tS, "utf8"));
    const sH = (await this._gitR(identity.repositoryPath,
      ["rev-parse", "--verify", "HEAD"], [0])).stdout.trim();
    let sB: string | null = null;
    const symCheck = await this._gitR(identity.repositoryPath,
      ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]);
    if (symCheck.exitCode === 0) sB = symCheck.stdout.trim() || null;
    const wD = await this._srcFp(identity.repositoryPath);
    return freeze({
      state, runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: cd, workspacePath: wsPath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: curBase, baseDrifted: drifted,
      taskBranch: identity.taskBranch, taskHeadSha: tH, taskHasChanges: dirty,
      taskStatusDigestSha256: tD, sourceHeadSha: sH, sourceBranch: sB,
      sourceWipDigestSha256: wD,
    });
  }

  // ═══════════════════════════════════════ Private: source fingerprint

  private async _srcFp(rp: string): Promise<string> {
    const h = crypto.createHash("sha256");
    const head = (await this._gitR(rp, ["rev-parse", "--verify", "HEAD"], [0])).stdout.trim();
    h.update(`head:${head.length}:${head}`);
    const symCheck = await this._gitR(rp, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]);
    const branch = symCheck.exitCode === 0 ? symCheck.stdout.trim() : "";
    h.update(`branch:${branch.length}:${branch}`);
    const status = (await this._gitR(rp,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"], [0])).stdout;
    h.update(`status:${status.length}:${status}`);
    const diff = (await this._gitR(rp,
      ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"], [0])).stdout;
    h.update(`diff:${diff.length}:${diff}`);
    const cached = (await this._gitR(rp,
      ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "HEAD", "--"], [0])).stdout;
    h.update(`cached:${cached.length}:${cached}`);
    const untracked = (await this._gitR(rp,
      ["ls-files", "--others", "--exclude-standard", "-z"], [0])).stdout.split("\x00").filter(Boolean);
    h.update(`untracked:${untracked.length}:${untracked.join("\x00")}`);
    let bytes = 0;
    for (const f of untracked) {
      if (f.includes("\x00")) fail("SOURCE_WIP_UNSUPPORTED", "NUL");
      if (path.isAbsolute(f)) fail("SOURCE_WIP_UNSUPPORTED", "abs");
      const fp = path.resolve(rp, f);
      if (path.relative(rp, fp).startsWith("..")) fail("SOURCE_WIP_UNSUPPORTED", "escape");
      let st: fs.Stats;
      try { st = fs.lstatSync(fp); } catch { fail("WORKSPACE_IO_FAILED", "lstat"); }
      if (st.isSymbolicLink()) {
        let t: string;
        try { t = await fs.promises.readlink(fp); } catch { fail("WORKSPACE_IO_FAILED", "readlink"); }
        bytes += t.length;
        if (bytes > this.mxWip) fail("SOURCE_WIP_TOO_LARGE", "limit");
        h.update(`u:${f}:sym:${st.mode}:${t.length}:${t}`);
      } else if (st.isFile()) {
        bytes += st.size;
        if (bytes > this.mxWip) fail("SOURCE_WIP_TOO_LARGE", "limit");
        let c: Buffer;
        try { c = await fs.promises.readFile(fp); } catch { fail("WORKSPACE_IO_FAILED", "readFile"); }
        h.update(`u:${f}:file:${st.mode}:${st.size}:`);
        h.update(c);
      } else if (st.isDirectory()) { /* skip */ }
      else fail("SOURCE_WIP_UNSUPPORTED", "special");
    }
    return h.digest("hex");
  }
}

function freeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze(o);
}
