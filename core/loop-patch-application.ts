// LOOP Executor Kernel — Bounded Multi-File Unified Diff Validator & Applier
// ============================================================================
// Validates and applies a bounded UTF-8 unified diff inside an isolated D03
// Git worktree. Only exact-whitelisted regular 100644 text files may be
// created or modified. Binary, rename, copy, delete, mode change, executable,
// symlink and gitlink changes are rejected fail-closed. Only the working tree
// is touched — the index and task HEAD are never modified. Forward/reverse
// `git apply --check` drives duplicate-application detection and deterministic
// post-apply reconciliation. All Git commands run through the injected
// LoopPosixProcessRunner with the patch delivered on stdin — no child_process,
// no shell, no temp patch file, no network Git.
//
// Platform & Security Limitations:
// 1. Only supports macOS (darwin) and Linux. No Windows fallback.
// 2. Filesystem containment assumes the workspace root and its components are
//    not replaced by untrusted processes between validation and apply. Node's
//    fs API offers no kernel-level openat-style pinning — the pre/post
//    target-state digest checking is a best-effort TOCTOU guard, not an
//    elimination of all kernel-level TOCTOU races.

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
import type {
  LoopGitWorkspaceManager,
  LoopGitWorkspaceSnapshot,
} from "./loop-git-workspace";

// ═══════════════════════════════════════ Types

export type LoopPatchApplicationErrorCode =
  | "INVALID_INPUT"
  | "PATCH_TOO_LARGE"
  | "PATCH_INVALID_ENCODING"
  | "PATCH_DIGEST_MISMATCH"
  | "PATCH_MALFORMED"
  | "PATCH_PATH_NOT_ALLOWED"
  | "PATCH_UNSAFE_PATH"
  | "PATCH_UNSUPPORTED_CHANGE"
  | "PATCH_BINARY"
  | "PATCH_SYMLINK"
  | "PATCH_NOT_APPLICABLE"
  | "PATCH_APPLY_FAILED"
  | "PATCH_RECONCILIATION_FAILED"
  | "WORKSPACE_DRIFT"
  | "GIT_COMMAND_FAILED"
  | "WORKSPACE_IO_FAILED";

const MAX_MSG = 256;
function sn(msg: string): string {
  return msg.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, MAX_MSG);
}

export class LoopPatchApplicationError extends Error {
  readonly code: LoopPatchApplicationErrorCode;
  constructor(code: LoopPatchApplicationErrorCode, msg: string) {
    super(sn(msg));
    this.name = "LoopPatchApplicationError";
    this.code = code;
  }
}

function fail(c: LoopPatchApplicationErrorCode, m: string): never {
  throw new LoopPatchApplicationError(c, m);
}
function tf(c: LoopPatchApplicationErrorCode, m: string): LoopPatchApplicationError {
  return new LoopPatchApplicationError(c, m);
}

export type LoopPatchApplicationManagerOptions = Readonly<{
  runner: Pick<LoopPosixProcessRunner, "run">;
  workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  gitExecutableId: string;
  gitTimeoutMs?: number;
  maxGitOutputBytes?: number;
  maxPatchBytes?: number;
  maxFiles?: number;
  maxHunks?: number;
  maxTargetFileBytes?: number;
}>;

export type LoopPatchApplicationWorkspace = Readonly<{
  workspacePath: string;
  taskBranch: string;
  expectedTaskHeadSha: string;
  expectedPreStatusDigestSha256: string;
}>;

export type LoopPatchApplicationRequest = Readonly<{
  identity: LoopRunIdentity;
  workspace: LoopPatchApplicationWorkspace;
  patchBytes: string | Uint8Array;
  expectedPatchSha256: string;
  allowedPaths: readonly string[];
  artifactRef?: string;
}>;

export type LoopPatchApplicationResult = Readonly<{
  state: "applied" | "already_applied";
  patchDigestSha256: string;
  files: readonly string[];
  preTaskHeadSha: string;
  postTaskHeadSha: string;
  preStatusDigestSha256: string;
  postStatusDigestSha256: string;
  preTargetStateDigestSha256: string;
  postTargetStateDigestSha256: string;
}>;

// ═══════════════════════════════════════ Constants

const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const HEX_RE = /^[0-9a-f]{7,64}$/;
const HUNK_HDR_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const NO_NL_MARKER = "\\ No newline at end of file";
const ASCII_WS_RE = /[ \t\r\n\v\f]/;
const PATCH_CTL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;

const DEF_GTO = 30000, MIN_GTO = 100, MAX_GTO = 120000;
const DEF_OUT = 1048576, MIN_OUT = 1, MAX_OUT = 16777216;
const DEF_PATCH = 1048576, MIN_PATCH = 1, MAX_PATCH = 16777216;
const DEF_FILES = 128, MIN_FILES = 1, MAX_FILES = 1024;
const DEF_HUNKS = 4096, MIN_HUNKS = 1, MAX_HUNKS = 65536;
const DEF_TGT = 16777216, MIN_TGT = 1, MAX_TGT = 67108864;
const PATH_MAX_BYTES = 4096;

const MGR_KEYS = [
  "runner", "workspaceManager", "gitExecutableId", "gitTimeoutMs",
  "maxGitOutputBytes", "maxPatchBytes", "maxFiles", "maxHunks", "maxTargetFileBytes",
];
const REQ_KEYS = [
  "identity", "workspace", "patchBytes", "expectedPatchSha256", "allowedPaths", "artifactRef",
];
const WS_KEYS = [
  "workspacePath", "taskBranch", "expectedTaskHeadSha", "expectedPreStatusDigestSha256",
];

// ═══════════════════════════════════════ Helpers

function sha256Hex(d: Buffer | string): string {
  return crypto.createHash("sha256").update(d).digest("hex");
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
function vSha256(s: unknown, nm: string): string {
  if (typeof s !== "string" || !SHA256_RE.test(s))
    fail("INVALID_INPUT", `${nm} must be 64-char lowercase hex`);
  return s;
}
function vSha40(s: unknown, nm: string): string {
  if (typeof s !== "string" || !SHA40_RE.test(s))
    fail("INVALID_INPUT", `${nm} must be 40-char lowercase hex`);
  return s;
}

function scanPlain(v: unknown, allowed: readonly string[], nm: string): Record<string, unknown> {
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
    if (!allowed.includes(k)) fail("INVALID_INPUT", `${nm} unknown key`);
    if (seen.has(k)) fail("INVALID_INPUT", `${nm} duplicate key`);
    seen.add(k);
    let desc: PropertyDescriptor;
    try { desc = Object.getOwnPropertyDescriptor(v, k)!; } catch { fail("INVALID_INPUT", `${nm} getDescriptor threw`); }
    if (!desc) fail("INVALID_INPUT", `${nm} missing descriptor`);
    if ("get" in desc || "set" in desc) fail("INVALID_INPUT", `${nm} accessor`);
    if (!("value" in desc)) fail("INVALID_INPUT", `${nm} no value`);
    Object.defineProperty(out, k, {
      value: desc.value, writable: false, enumerable: true, configurable: false,
    });
  }
  return out;
}

function validateIdentity(id: unknown): LoopRunIdentity {
  try { validateLoopRunIdentity(id); } catch { fail("INVALID_INPUT", "identity invalid"); }
  return id as LoopRunIdentity;
}

function validateRepoPath(p: unknown, nm: string): string {
  if (typeof p !== "string") fail("PATCH_UNSAFE_PATH", `${nm} not string`);
  if (p.length === 0) fail("PATCH_UNSAFE_PATH", `${nm} empty`);
  if (p.startsWith("/")) fail("PATCH_UNSAFE_PATH", `${nm} absolute`);
  if (p.endsWith("/")) fail("PATCH_UNSAFE_PATH", `${nm} trailing slash`);
  if (p.includes("\\")) fail("PATCH_UNSAFE_PATH", `${nm} backslash`);
  if (ASCII_WS_RE.test(p)) fail("PATCH_UNSAFE_PATH", `${nm} whitespace`);
  if (/[\x00-\x1f\x7f-\x9f]/.test(p)) fail("PATCH_UNSAFE_PATH", `${nm} control char`);
  if (p !== p.normalize("NFC")) fail("PATCH_UNSAFE_PATH", `${nm} not NFC`);
  if (Buffer.byteLength(p, "utf8") > PATH_MAX_BYTES) fail("PATCH_UNSAFE_PATH", `${nm} too long`);
  const segs = p.split("/");
  for (const s of segs) {
    if (s.length === 0) fail("PATCH_UNSAFE_PATH", `${nm} empty segment`);
    if (s === "." || s === "..") fail("PATCH_UNSAFE_PATH", `${nm} dot segment`);
    if (s === ".git") fail("PATCH_UNSAFE_PATH", `${nm} .git segment`);
  }
  return p;
}

// ═══════════════════════════════════════ Patch decoding

function decodePatch(patchBytes: unknown, maxPatchBytes: number): string {
  let buf: Buffer;
  if (typeof patchBytes === "string") {
    const enc = Buffer.from(patchBytes, "utf8");
    if (enc.length > maxPatchBytes) fail("PATCH_TOO_LARGE", "patch too large");
    const dec = new TextDecoder("utf-8", { fatal: true }).decode(enc);
    if (dec !== patchBytes) fail("PATCH_INVALID_ENCODING", "lossy round-trip");
    buf = enc;
  } else if (patchBytes instanceof Uint8Array) {
    if (patchBytes.byteLength > maxPatchBytes) fail("PATCH_TOO_LARGE", "patch too large");
    buf = Buffer.from(patchBytes);
    try { new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch { fail("PATCH_INVALID_ENCODING", "invalid UTF-8"); }
  } else {
    fail("INVALID_INPUT", "patchBytes type");
  }
  const text = buf.toString("utf8");
  if (text.length === 0) fail("PATCH_MALFORMED", "empty patch");
  if (text.charCodeAt(0) === 0xfeff) fail("PATCH_INVALID_ENCODING", "BOM");
  if (text.includes("\r")) fail("PATCH_INVALID_ENCODING", "CR not allowed");
  if (PATCH_CTL_RE.test(text)) fail("PATCH_INVALID_ENCODING", "control byte");
  if (!text.endsWith("\n")) fail("PATCH_MALFORMED", "missing final LF");
  return text;
}

// ═══════════════════════════════════════ Patch grammar

type ParsedSection = Readonly<{ path: string; isNew: boolean }>;

function parsePatch(text: string, maxFiles: number, maxHunks: number): readonly ParsedSection[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] !== "") fail("PATCH_MALFORMED", "trailing garbage");
  lines.pop();
  if (lines.length === 0) fail("PATCH_MALFORMED", "empty patch");

  const sections: ParsedSection[] = [];
  const seenPaths = new Set<string>();
  let totalHunks = 0;
  let i = 0;

  while (i < lines.length) {
    const header = lines[i]!;
    if (header.startsWith("diff --cc") || header.startsWith("diff --combined"))
      fail("PATCH_UNSUPPORTED_CHANGE", "combined diff");
    if (!header.startsWith("diff --git ")) fail("PATCH_MALFORMED", "bad section header");
    const rest = header.slice("diff --git ".length);
    if (rest.includes('"')) fail("PATCH_MALFORMED", "quoted path");
    const sp = rest.indexOf(" ");
    if (sp < 0) fail("PATCH_MALFORMED", "header missing b path");
    const aTok = rest.slice(0, sp);
    const bTok = rest.slice(sp + 1);
    if (!aTok.startsWith("a/") || !bTok.startsWith("b/"))
      fail("PATCH_MALFORMED", "header path prefix");
    const aPath = validateRepoPath(aTok.slice(2), "header a path");
    const bPath = validateRepoPath(bTok.slice(2), "header b path");
    if (aPath !== bPath) {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.startsWith("diff --git ") || l.startsWith("--- ")) break;
        if (
          l.startsWith("rename from") || l.startsWith("rename to") ||
          l.startsWith("copy from") || l.startsWith("copy to") ||
          l.startsWith("similarity index") || l.startsWith("dissimilarity index")
        ) fail("PATCH_UNSUPPORTED_CHANGE", "rename/copy not allowed");
      }
      fail("PATCH_MALFORMED", "header path mismatch");
    }
    const target = aPath;
    if (seenPaths.has(target)) fail("PATCH_MALFORMED", "duplicate section");
    seenPaths.add(target);
    i++;

    let isNew = false;
    let sawIndex = false;
    for (;;) {
      if (i >= lines.length) fail("PATCH_MALFORMED", "section truncated");
      const ln = lines[i]!;
      if (ln.startsWith("new file mode ")) {
        if (isNew || sawIndex) fail("PATCH_MALFORMED", "new file mode order");
        if (ln.slice("new file mode ".length) !== "100644")
          fail("PATCH_UNSUPPORTED_CHANGE", "new file mode not 100644");
        isNew = true; i++; continue;
      }
      if (ln.startsWith("index ")) {
        if (sawIndex) fail("PATCH_MALFORMED", "duplicate index line");
        const body = ln.slice("index ".length);
        const dot = body.indexOf("..");
        if (dot < 0) fail("PATCH_MALFORMED", "index line malformed");
        const left = body.slice(0, dot);
        let right = body.slice(dot + 2);
        const modeSp = right.indexOf(" ");
        if (modeSp >= 0) {
          const mode = right.slice(modeSp + 1);
          right = right.slice(0, modeSp);
          if (mode !== "100644") fail("PATCH_UNSUPPORTED_CHANGE", "index mode not 100644");
        }
        if (!HEX_RE.test(left) || !HEX_RE.test(right))
          fail("PATCH_MALFORMED", "index hex malformed");
        sawIndex = true; i++; continue;
      }
      if (
        ln.startsWith("rename from") || ln.startsWith("rename to") ||
        ln.startsWith("copy from") || ln.startsWith("copy to") ||
        ln.startsWith("similarity index") || ln.startsWith("dissimilarity index") ||
        ln.startsWith("deleted file mode") || ln.startsWith("old mode") ||
        ln.startsWith("new mode")
      ) fail("PATCH_UNSUPPORTED_CHANGE", "unsupported header line");
      if (ln.startsWith("diff --cc") || ln.startsWith("diff --combined"))
        fail("PATCH_UNSUPPORTED_CHANGE", "combined diff");
      if (
        ln.startsWith("GIT binary patch") || ln.startsWith("Binary files") ||
        ln.startsWith("literal ") || ln.startsWith("delta ")
      ) fail("PATCH_BINARY", "binary patch");
      break;
    }

    // --- / +++
    if (i >= lines.length) fail("PATCH_MALFORMED", "missing --- line");
    const minus = lines[i]!;
    if (isNew) {
      if (minus !== "--- /dev/null") fail("PATCH_MALFORMED", "new file --- not /dev/null");
    } else {
      if (!minus.startsWith("--- a/")) fail("PATCH_MALFORMED", "missing --- line");
      if (validateRepoPath(minus.slice("--- a/".length), "--- path") !== target)
        fail("PATCH_MALFORMED", "--- path mismatch");
    }
    i++;
    if (i >= lines.length) fail("PATCH_MALFORMED", "missing +++ line");
    const plus = lines[i]!;
    if (plus === "+++ /dev/null") fail("PATCH_UNSUPPORTED_CHANGE", "delete not allowed");
    if (!plus.startsWith("+++ b/")) fail("PATCH_MALFORMED", "missing +++ line");
    if (validateRepoPath(plus.slice("+++ b/".length), "+++ path") !== target)
      fail("PATCH_MALFORMED", "+++ path mismatch");
    i++;

    // --- hunks ---
    let hunkCount = 0;
    let lastOldEnd = 0;
    let lastNewEnd = 0;
    let firstHunk = true;
    while (i < lines.length && lines[i]!.startsWith("@@")) {
      const m = HUNK_HDR_RE.exec(lines[i]!);
      if (!m) fail("PATCH_MALFORMED", "hunk header malformed");
      const oldStart = Number(m[1]);
      const oldCount = m[2] === undefined ? 1 : Number(m[2]);
      const newStart = Number(m[3]);
      const newCount = m[4] === undefined ? 1 : Number(m[4]);
      if (
        !Number.isSafeInteger(oldStart) || !Number.isSafeInteger(oldCount) ||
        !Number.isSafeInteger(newStart) || !Number.isSafeInteger(newCount)
      ) fail("PATCH_MALFORMED", "hunk count not safe integer");

      // Strict overlap: current start must be strictly greater than previous effective end.
      const oldEnd = oldCount === 0 ? oldStart : oldStart + oldCount - 1;
      const newEnd = newCount === 0 ? newStart : newStart + newCount - 1;
      if (!Number.isSafeInteger(oldEnd) || !Number.isSafeInteger(newEnd))
        fail("PATCH_MALFORMED", "hunk end overflow");
      if (!firstHunk) {
        if (oldStart <= lastOldEnd) fail("PATCH_MALFORMED", "old ranges overlap");
        if (newStart <= lastNewEnd) fail("PATCH_MALFORMED", "new ranges overlap");
      }
      lastOldEnd = oldEnd;
      lastNewEnd = newEnd;
      firstHunk = false;

      i++;
      let oldConsumed = 0, newConsumed = 0, adds = 0, rems = 0;
      let prevWasContent = false;
      for (;;) {
        if (oldConsumed === oldCount && newConsumed === newCount) break;
        if (i >= lines.length) fail("PATCH_MALFORMED", "hunk body truncated");
        const bl = lines[i]!;
        if (bl === NO_NL_MARKER) {
          if (!prevWasContent) fail("PATCH_MALFORMED", "no-newline marker misplaced");
          prevWasContent = false;
          i++;
          continue;
        }
        const tag = bl.charAt(0);
        if (tag === " ") { oldConsumed++; newConsumed++; prevWasContent = true; i++; continue; }
        if (tag === "+") { newConsumed++; adds++; prevWasContent = true; i++; continue; }
        if (tag === "-") { oldConsumed++; rems++; prevWasContent = true; i++; continue; }
        break;
      }
      if (i < lines.length && lines[i] === NO_NL_MARKER) {
        if (!prevWasContent) fail("PATCH_MALFORMED", "no-newline marker misplaced");
        i++;
      }
      if (oldConsumed !== oldCount || newConsumed !== newCount)
        fail("PATCH_MALFORMED", "hunk count mismatch");
      if (adds === 0 && rems === 0) fail("PATCH_MALFORMED", "context-only hunk");

      hunkCount++;
      totalHunks++;
      if (totalHunks > maxHunks) fail("PATCH_MALFORMED", "too many hunks");
    }
    if (hunkCount === 0) fail("PATCH_MALFORMED", "section without hunk");
    sections.push({ path: target, isNew });
  }

  if (sections.length > maxFiles) fail("PATCH_MALFORMED", "too many files");
  if (sections.length === 0) fail("PATCH_MALFORMED", "no sections");
  return Object.freeze(sections.map((s) => Object.freeze(s)));
}

// ═══════════════════════════════════════ Manager

export class LoopPatchApplicationManager {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly wsm: Pick<LoopGitWorkspaceManager, "inspect">;
  private readonly gitId: string;
  private readonly gTo: number;
  private readonly mxOut: number;
  private readonly mxPatch: number;
  private readonly mxFiles: number;
  private readonly mxHunks: number;
  private readonly mxTgt: number;

  constructor(o: LoopPatchApplicationManagerOptions) {
    if (process.platform !== "darwin" && process.platform !== "linux")
      fail("INVALID_INPUT", "unsupported platform");
    const opts = scanPlain(o, MGR_KEYS, "options");
    const rv = opts.runner;
    if (!rv || typeof (rv as any).run !== "function") fail("INVALID_INPUT", "runner missing run");
    const wm = opts.workspaceManager;
    if (!wm || typeof (wm as any).inspect !== "function") fail("INVALID_INPUT", "workspaceManager missing inspect");
    this.runner = rv as Pick<LoopPosixProcessRunner, "run">;
    this.wsm = wm as Pick<LoopGitWorkspaceManager, "inspect">;
    this.gitId = vS(opts.gitExecutableId, "gitExecutableId");
    this.gTo = vI(opts.gitTimeoutMs ?? DEF_GTO, MIN_GTO, MAX_GTO, "gitTimeoutMs");
    this.mxOut = vI(opts.maxGitOutputBytes ?? DEF_OUT, MIN_OUT, MAX_OUT, "maxGitOutputBytes");
    this.mxPatch = vI(opts.maxPatchBytes ?? DEF_PATCH, MIN_PATCH, MAX_PATCH, "maxPatchBytes");
    this.mxFiles = vI(opts.maxFiles ?? DEF_FILES, MIN_FILES, MAX_FILES, "maxFiles");
    this.mxHunks = vI(opts.maxHunks ?? DEF_HUNKS, MIN_HUNKS, MAX_HUNKS, "maxHunks");
    this.mxTgt = vI(opts.maxTargetFileBytes ?? DEF_TGT, MIN_TGT, MAX_TGT, "maxTargetFileBytes");
  }

  async apply(request: LoopPatchApplicationRequest): Promise<LoopPatchApplicationResult> {
    // ── request / workspace plain-data scan ──
    const req = scanPlain(request, REQ_KEYS, "request");
    const identity = validateIdentity(req.identity);
    const wsRaw = scanPlain(req.workspace, WS_KEYS, "workspace");
    const workspacePath = vS(wsRaw.workspacePath, "workspacePath");
    const taskBranch = vS(wsRaw.taskBranch, "taskBranch");
    const expectedTaskHeadSha = vSha40(wsRaw.expectedTaskHeadSha, "expectedTaskHeadSha");
    const expectedPreStatusDigest = vSha256(
      wsRaw.expectedPreStatusDigestSha256, "expectedPreStatusDigestSha256");
    const expectedPatchSha256 = vSha256(req.expectedPatchSha256, "expectedPatchSha256");
    if (taskBranch !== identity.taskBranch)
      fail("INVALID_INPUT", "workspace taskBranch mismatch");
    if (req.artifactRef !== undefined) vS(req.artifactRef, "artifactRef");

    // ── allowedPaths whitelist ──
    if (!Array.isArray(req.allowedPaths)) fail("INVALID_INPUT", "allowedPaths must be array");
    const allowed = req.allowedPaths as unknown[];
    if (allowed.length < 1 || allowed.length > this.mxFiles)
      fail("INVALID_INPUT", "allowedPaths out of range");
    const allowedSet = new Set<string>();
    for (const ap of allowed) {
      const vp = validateRepoPath(ap, "allowedPath");
      if (allowedSet.has(vp)) fail("INVALID_INPUT", "duplicate allowedPath");
      allowedSet.add(vp);
    }

    // ── patch decode + digest ──
    const patchText = decodePatch(req.patchBytes, this.mxPatch);
    const patchBuf = Buffer.from(patchText, "utf8");
    const patchDigest = sha256Hex(patchBuf);
    if (patchDigest !== expectedPatchSha256) fail("PATCH_DIGEST_MISMATCH", "digest mismatch");

    // ── parse + whitelist enforcement ──
    const sections = parsePatch(patchText, this.mxFiles, this.mxHunks);
    for (const s of sections) {
      if (!allowedSet.has(s.path)) fail("PATCH_PATH_NOT_ALLOWED", "path not allowed");
    }
    const files = sections.map((s) => s.path);

    // ── workspace inspect + precondition ──
    const pre = await this._inspect(identity);
    this._checkSnapshot(pre, workspacePath, taskBranch, expectedTaskHeadSha, expectedPreStatusDigest);
    const preTaskHeadSha = pre.taskHeadSha;
    const preStatusDigest = pre.taskStatusDigestSha256;

    // ── index protection: pre cached digest ──
    const preIndexDigest = await this._indexDigest(workspacePath);

    // ── filesystem safety + pre target-state digest ──
    this._fsCheckAll(workspacePath, sections, false);
    const preTargetDigest = this._targetStateDigest(workspacePath, sections);

    // ── forward check → revalidate filesystem ──
    const f0 = await this._applyCheck(workspacePath, patchBuf, false);
    this._fsCheckAll(workspacePath, sections, false);
    const ptF = this._targetStateDigest(workspacePath, sections);
    if (ptF !== preTargetDigest) fail("WORKSPACE_DRIFT", "target drift after forward check");

    // ── reverse check → revalidate filesystem ──
    const r0 = await this._applyCheck(workspacePath, patchBuf, true);
    this._fsCheckAll(workspacePath, sections, false);
    const ptR = this._targetStateDigest(workspacePath, sections);
    if (ptR !== preTargetDigest) fail("WORKSPACE_DRIFT", "target drift after reverse check");

    if (f0 && r0) fail("PATCH_RECONCILIATION_FAILED", "forward and reverse both apply");

    if (!f0 && r0) {
      // Candidate already_applied — re-verify everything, no apply.
      const re = await this._inspect(identity);
      this._checkSnapshot(re, workspacePath, taskBranch, expectedTaskHeadSha, expectedPreStatusDigest);
      const reIndex = await this._indexDigest(workspacePath);
      if (reIndex !== preIndexDigest) fail("WORKSPACE_DRIFT", "index changed");
      this._fsCheckAll(workspacePath, sections, false);
      const reTarget = this._targetStateDigest(workspacePath, sections);
      if (reTarget !== preTargetDigest) fail("WORKSPACE_DRIFT", "target state changed");
      return this._result("already_applied", patchDigest, files,
        preTaskHeadSha, re.taskHeadSha, preStatusDigest, re.taskStatusDigestSha256,
        preTargetDigest, reTarget);
    }

    if (!f0 && !r0) fail("PATCH_NOT_APPLICABLE", "patch not applicable");

    // ── f0 true: re-verify preconditions before real apply ──
    const pre2 = await this._inspect(identity);
    this._checkSnapshot(pre2, workspacePath, taskBranch, expectedTaskHeadSha, expectedPreStatusDigest);
    const pre2Index = await this._indexDigest(workspacePath);
    if (pre2Index !== preIndexDigest) fail("WORKSPACE_DRIFT", "index changed before apply");
    this._fsCheckAll(workspacePath, sections, false);
    const pre2Target = this._targetStateDigest(workspacePath, sections);
    if (pre2Target !== preTargetDigest) fail("WORKSPACE_DRIFT", "target drift before apply");

    // ── real apply ──
    const applyExit = await this._apply(workspacePath, patchBuf);

    // ── post-apply: immediate filesystem check + post-apply target digest ──
    this._fsCheckAll(workspacePath, sections, true);
    const postApplyTarget = this._targetStateDigest(workspacePath, sections);

    // ── post-apply forward check → revalidate ──
    const f1 = await this._applyCheck(workspacePath, patchBuf, false);
    this._fsCheckAll(workspacePath, sections, true);
    const ptF1 = this._targetStateDigest(workspacePath, sections);
    if (ptF1 !== postApplyTarget) fail("WORKSPACE_DRIFT", "target drift after post forward check");

    // ── post-apply reverse check → revalidate ──
    const r1 = await this._applyCheck(workspacePath, patchBuf, true);
    this._fsCheckAll(workspacePath, sections, true);
    const ptR1 = this._targetStateDigest(workspacePath, sections);
    if (ptR1 !== postApplyTarget) fail("WORKSPACE_DRIFT", "target drift after post reverse check");

    // ── final inspect and state mapping ──
    const post = await this._inspect(identity);
    if (post.taskHeadSha !== preTaskHeadSha) fail("WORKSPACE_DRIFT", "task HEAD changed");
    if (post.workspacePath !== workspacePath || post.taskBranch !== taskBranch)
      fail("WORKSPACE_DRIFT", "workspace identity changed");
    const postIndexDigest = await this._indexDigest(workspacePath);
    if (postIndexDigest !== preIndexDigest) fail("WORKSPACE_DRIFT", "index changed after apply");
    const postStatusDigest = post.taskStatusDigestSha256;

    // Use the final target-state digest (post-reverse check) for the result contract.
    const finalTarget = ptR1;

    if (!f1 && r1) {
      // Fully applied. Contract: target-state must have changed.
      if (finalTarget === preTargetDigest)
        fail("PATCH_RECONCILIATION_FAILED", "applied but target-state unchanged");
      return this._result("applied", patchDigest, files,
        preTaskHeadSha, post.taskHeadSha, preStatusDigest, postStatusDigest,
        preTargetDigest, finalTarget);
    }
    if (f1 && !r1) {
      if (applyExit !== 0 && finalTarget === preTargetDigest
        && postStatusDigest === preStatusDigest
        && postIndexDigest === preIndexDigest
        && post.taskHeadSha === preTaskHeadSha)
        fail("PATCH_APPLY_FAILED", "apply failed without effect");
      fail("PATCH_RECONCILIATION_FAILED", "forward still applies after apply");
    }
    if (!f1 && !r1) fail("PATCH_RECONCILIATION_FAILED", "neither applies after apply");
    fail("PATCH_RECONCILIATION_FAILED", "both apply after apply");
  }

  // ═══════════════════════════════════════ Private: Git helpers

  private async _runGit(
    cwd: string, args: readonly string[], stdin: Buffer | null,
  ): Promise<LoopPosixProcessResult> {
    const req: LoopPosixProcessRequest = {
      executableId: this.gitId, cwd, args: Object.freeze([...args]),
      stdin: stdin ?? undefined,
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
    return r;
  }

  private async _git(cwd: string, args: readonly string[]): Promise<string> {
    const r = await this._runGit(cwd, args, null);
    if (r.exitCode !== 0) fail("GIT_COMMAND_FAILED", "git nonzero");
    return r.stdout;
  }

  private async _applyCheck(cwd: string, patch: Buffer, reverse: boolean): Promise<boolean> {
    const args = reverse
      ? ["apply", "--reverse", "--check", "-"]
      : ["apply", "--check", "-"];
    const r = await this._runGit(cwd, args, patch);
    if (r.exitCode === 0) return true;
    if (r.exitCode === 1) return false;
    fail("GIT_COMMAND_FAILED", "apply check unexpected exit");
  }

  private async _apply(cwd: string, patch: Buffer): Promise<number> {
    const r = await this._runGit(cwd, ["apply", "-"], patch);
    return r.exitCode!;
  }

  private async _indexDigest(cwd: string): Promise<string> {
    const out = await this._git(cwd,
      ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"]);
    return sha256Hex(Buffer.from(out, "utf8"));
  }

  private async _inspect(identity: LoopRunIdentity): Promise<LoopGitWorkspaceSnapshot> {
    let snap: LoopGitWorkspaceSnapshot;
    try { snap = await this.wsm.inspect(identity); }
    catch (e) {
      if (e instanceof LoopPatchApplicationError) throw e;
      fail("GIT_COMMAND_FAILED", "inspect failed");
    }
    return snap;
  }

  private _checkSnapshot(
    snap: LoopGitWorkspaceSnapshot, workspacePath: string, taskBranch: string,
    expectedTaskHeadSha: string, expectedPreStatusDigest: string,
  ): void {
    if (snap.workspacePath !== workspacePath) fail("WORKSPACE_DRIFT", "workspacePath mismatch");
    if (snap.taskBranch !== taskBranch) fail("WORKSPACE_DRIFT", "taskBranch mismatch");
    if (snap.taskHeadSha !== expectedTaskHeadSha) fail("WORKSPACE_DRIFT", "task HEAD mismatch");
    if (snap.taskStatusDigestSha256 !== expectedPreStatusDigest)
      fail("WORKSPACE_DRIFT", "pre-status mismatch");
  }

  private _result(
    state: "applied" | "already_applied", patchDigest: string, files: readonly string[],
    preHead: string, postHead: string, preStatus: string, postStatus: string,
    preTarget: string, postTarget: string,
  ): LoopPatchApplicationResult {
    if (state === "applied" && preTarget === postTarget)
      fail("PATCH_RECONCILIATION_FAILED", "applied but target-state invariant violated");
    if (state === "already_applied" && preTarget !== postTarget)
      fail("PATCH_RECONCILIATION_FAILED", "already_applied but target-state changed");
    return Object.freeze({
      state, patchDigestSha256: patchDigest, files: Object.freeze([...files]),
      preTaskHeadSha: preHead, postTaskHeadSha: postHead,
      preStatusDigestSha256: preStatus, postStatusDigestSha256: postStatus,
      preTargetStateDigestSha256: preTarget, postTargetStateDigestSha256: postTarget,
    });
  }

  // ═══════════════════════════════════════ Private: filesystem safety

  private _resolveInside(root: string, rel: string): string {
    const segs = rel.split("/");
    let cur = root;
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k]!;
      const next = path.join(cur, seg);
      const relNext = path.relative(root, next);
      if (relNext.startsWith("..") || path.isAbsolute(relNext))
        fail("PATCH_UNSAFE_PATH", "path escapes workspace");
      let st: fs.Stats;
      try { st = fs.lstatSync(next); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          if (k !== segs.length - 1) fail("PATCH_NOT_APPLICABLE", "parent missing");
          return next;
        }
        fail("WORKSPACE_IO_FAILED", "lstat failed");
      }
      if (st.isSymbolicLink()) fail("PATCH_SYMLINK", "symlink component");
      if (k < segs.length - 1 && !st.isDirectory())
        fail("PATCH_UNSAFE_PATH", "parent not directory");
      cur = next;
    }
    return cur;
  }

  /**
   * Full filesystem safety check covering: root, parent components, target,
   * symlink, directory, special file, regular file, realpath containment,
   * size, UTF-8, NUL, and executable bit.
   *
   * When `postApply` is true, also checks that existing targets are still
   * regular non-executable text files (catches post-apply corruption).
   */
  private _fsCheckAll(root: string, sections: readonly ParsedSection[], postApply: boolean): void {
    let rootSt: fs.Stats;
    try { rootSt = fs.lstatSync(root); }
    catch { fail("WORKSPACE_IO_FAILED", "workspace root lstat"); }
    if (rootSt.isSymbolicLink() || !rootSt.isDirectory())
      fail("WORKSPACE_IO_FAILED", "workspace root invalid");
    let realRoot: string;
    try { realRoot = fs.realpathSync(root); }
    catch { fail("WORKSPACE_IO_FAILED", "workspace root realpath"); }
    for (const s of sections) {
      const abs = this._resolveInside(root, s.path);
      const relAbs = path.relative(realRoot, abs);
      if (relAbs.startsWith("..") || path.isAbsolute(relAbs))
        fail("PATCH_UNSAFE_PATH", "realpath escapes workspace");
      let st: fs.Stats;
      try { st = fs.lstatSync(abs); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          if (!s.isNew) fail("PATCH_NOT_APPLICABLE", "modify target missing");
          continue; // create: absent is allowed
        }
        fail("WORKSPACE_IO_FAILED", "target lstat failed");
      }
      if (st.isSymbolicLink()) fail("PATCH_SYMLINK", "target symlink");
      if (st.isDirectory()) fail("PATCH_UNSAFE_PATH", "target is directory");
      if (!st.isFile()) fail("PATCH_UNSAFE_PATH", "target special file");
      // Executable bit check: existing targets must be 0644 (no exec bits).
      if ((st.mode & 0o111) !== 0) fail("PATCH_UNSUPPORTED_CHANGE", "target has exec bit");
      // Per-target realpath containment (defense-in-depth).
      let realTarget: string;
      try { realTarget = fs.realpathSync(abs); }
      catch { fail("WORKSPACE_IO_FAILED", "target realpath failed"); }
      const relTarget = path.relative(realRoot, realTarget);
      if (relTarget.startsWith("..") || path.isAbsolute(relTarget))
        fail("PATCH_UNSAFE_PATH", "target realpath escapes workspace");
      if (st.size > this.mxTgt) fail("PATCH_UNSAFE_PATH", "target too large");
      let content: Buffer;
      try { content = fs.readFileSync(abs); }
      catch { fail("WORKSPACE_IO_FAILED", "target read failed"); }
      if (content.includes(0x00)) fail("PATCH_BINARY", "target NUL byte");
      try { new TextDecoder("utf-8", { fatal: true }).decode(content); }
      catch { fail("PATCH_BINARY", "target invalid UTF-8"); }
    }
  }

  private _targetStateDigest(root: string, sections: readonly ParsedSection[]): string {
    const h = crypto.createHash("sha256");
    h.update("loop-patch-target-state-v2");
    for (const s of sections) {
      const abs = path.join(root, s.path);
      let st: fs.Stats;
      try { st = fs.lstatSync(abs); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          h.update(`\x00${s.path}:missing`);
          continue;
        }
        fail("WORKSPACE_IO_FAILED", "target lstat failed");
      }
      const kind = st.isSymbolicLink() ? "symlink"
        : st.isDirectory() ? "dir"
        : st.isFile() ? "file" : "special";
      h.update(`\x00${s.path}:${kind}:${st.mode}:${st.size}:`);
      if (st.isFile()) {
        let content: Buffer;
        try { content = fs.readFileSync(abs); }
        catch { fail("WORKSPACE_IO_FAILED", "target read failed"); }
        h.update(sha256Hex(content));
      }
    }
    return h.digest("hex");
  }
}
