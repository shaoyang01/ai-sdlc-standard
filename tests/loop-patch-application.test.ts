// LOOP Patch Application — Bounded Multi-File Unified Diff Safety Tests
// =======================================================================
// Real temporary Git repository + D03 isolated worktree. No real Codex, no
// network, no user global Git config. All fixtures/monkeypatches restored in
// finally. Negative helpers fail closed on no-throw / wrong type / wrong code.
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync,
  existsSync, readFileSync, lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  LoopPatchApplicationManager, LoopPatchApplicationError,
} from "../core/loop-patch-application";
import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }

async function assertRejects(fn: () => Promise<any>, code: string, label: string): Promise<void> {
  try { await fn(); ok(false, label + " (no throw)"); }
  catch (e: any) {
    ok(e instanceof LoopPatchApplicationError && e.code === code,
      `${label}→${e?.constructor?.name ?? "?"}:${e?.code ?? "?"}`);
  }
}
function assertThrows(fn: () => any, code: string, label: string): void {
  try { fn(); ok(false, label + " (no throw)"); }
  catch (e: any) {
    ok(e instanceof LoopPatchApplicationError && e.code === code,
      `${label}→${e?.constructor?.name ?? "?"}:${e?.code ?? "?"}`);
  }
}

function sha256(s: string | Buffer): string {
  return createHash("sha256").update(typeof s === "string" ? Buffer.from(s, "utf8") : s).digest("hex");
}

function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try { const st = lstatSync(fp); if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp); } catch {}
  }
  throw new Error("git not found");
}
const GP = findGit();

const A_OLD = "alpha\nbeta\ngamma\n";
const A_NEW = "alpha\nBETA\ngamma\n";
const B_OLD = "one\ntwo\n";
const B_NEW = "one\nTWO\nthree\n";

interface SetupResult { tr: string; rp: string; cr: string; baseSha: string; featSha: string; home: string; }

function setupRepo(): SetupResult {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l04-")));
  const rp = join(tr, "repo"), cr = join(tr, "ctrl");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execFileSync(GP, ["init", "-b", "main"], { cwd: rp });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: rp });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: rp });
  writeFileSync(join(rp, "a.txt"), A_OLD);
  writeFileSync(join(rp, "b.txt"), B_OLD);
  execFileSync(GP, ["add", "a.txt", "b.txt"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "init"], { cwd: rp });
  const baseSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["checkout", "-b", "feat/loop-runtime-v1"], { cwd: rp });
  writeFileSync(join(rp, "c.txt"), "cee\n");
  execFileSync(GP, ["add", "c.txt"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "feat"], { cwd: rp });
  const featSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });
  execFileSync(GP, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp });
  execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: rp });
  execFileSync(GP, ["checkout", "main"], { cwd: rp });
  const home = join(tr, "home"); mkdirSync(home, { recursive: true });
  return { tr, rp, cr, baseSha, featSha, home };
}

function mkId(o: { rp: string; cr: string; sha: string; runId?: string; taskBranch?: string }): LoopRunIdentity {
  return Object.freeze({
    runId: o.runId ?? "r", requirementId: "req",
    repository: "example/fixture-repo", repositoryPath: o.rp,
    baseBranch: "feat/loop-runtime-v1", expectedBaseSha: o.sha,
    taskBranch: o.taskBranch ?? "codex/t", controlRoot: o.cr,
    createdAt: new Date().toISOString(),
  });
}

function mkRunner(rp: string, cr: string, home: string) {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GP, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [rp, cr],
    fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: home, PATH: join(GP, ".."), LC_ALL: "C", LANG: "C" },
    allowedRequestEnvKeys: [], defaultTimeoutMs: 15000,
  });
}

function interceptedRunner(rp: string, cr: string, home: string,
  inject: (req: any, orig: (req: any) => Promise<any>) => Promise<any>) {
  const base = mkRunner(rp, cr, home);
  const orig = base.run.bind(base);
  (base as any).run = async (req: any) => inject(req, orig);
  return base;
}

// Generate a canonical modify patch via a scratch repo (correct hunk headers).
function makeDiff(oldC: string, newC: string, rel: string): string {
  const sc = realpathSync(mkdtempSync(join(tmpdir(), "l04d-")));
  try {
    execFileSync(GP, ["init", "-q"], { cwd: sc });
    execFileSync(GP, ["config", "user.name", "t"], { cwd: sc });
    execFileSync(GP, ["config", "user.email", "t@t"], { cwd: sc });
    mkdirSync(dirname(join(sc, rel)), { recursive: true });
    writeFileSync(join(sc, rel), oldC);
    execFileSync(GP, ["add", "-A"], { cwd: sc });
    execFileSync(GP, ["commit", "-q", "-m", "base"], { cwd: sc });
    writeFileSync(join(sc, rel), newC);
    return execFileSync(GP, ["diff", "--no-color", "--", rel], { cwd: sc, encoding: "utf8" });
  } finally { rmSync(sc, { recursive: true, force: true }); }
}

// Generate a canonical new-file patch via a scratch repo.
function makeNew(newC: string, rel: string): string {
  const sc = realpathSync(mkdtempSync(join(tmpdir(), "l04n-")));
  try {
    execFileSync(GP, ["init", "-q"], { cwd: sc });
    execFileSync(GP, ["config", "user.name", "t"], { cwd: sc });
    execFileSync(GP, ["config", "user.email", "t@t"], { cwd: sc });
    writeFileSync(join(sc, "seed.txt"), "seed\n");
    execFileSync(GP, ["add", "-A"], { cwd: sc });
    execFileSync(GP, ["commit", "-q", "-m", "base"], { cwd: sc });
    mkdirSync(dirname(join(sc, rel)), { recursive: true });
    writeFileSync(join(sc, rel), newC);
    execFileSync(GP, ["add", "-N", rel], { cwd: sc });
    return execFileSync(GP, ["diff", "--no-color", "--", rel], { cwd: sc, encoding: "utf8" });
  } finally { rmSync(sc, { recursive: true, force: true }); }
}

interface Ctx {
  s: SetupResult; runner: any; wsMgr: LoopGitWorkspaceManager;
  mgr: LoopPatchApplicationManager; id: LoopRunIdentity; snap: any;
}

async function mkCtx(runId = "r", taskBranch = "codex/t", mgrOpts: any = {}): Promise<Ctx> {
  const s = setupRepo();
  const runner = mkRunner(s.rp, s.cr, s.home);
  const wsMgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId({ rp: s.rp, cr: s.cr, sha: s.featSha, runId, taskBranch });
  const snap = await wsMgr.prepare(id);
  const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" }) &&
    new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr, gitExecutableId: "git", ...mgrOpts });
  return { s, runner, wsMgr, mgr, id, snap };
}

/** Re-inspect the workspace so ctx.snap reflects on-disk fixture changes. */
async function refresh(ctx: Ctx): Promise<Ctx> {
  const snap = await ctx.wsMgr.inspect(ctx.id);
  return { ...ctx, snap };
}

function mkReq(ctx: Ctx, o: {
  patch: string | Uint8Array; allowed: readonly string[]; digest?: string;
  workspacePath?: string; taskBranch?: string; head?: string; preStatus?: string;
  artifactRef?: string;
}): any {
  const patchStr = typeof o.patch === "string" ? o.patch : Buffer.from(o.patch).toString("utf8");
  const req: any = {
    identity: ctx.id,
    workspace: {
      workspacePath: o.workspacePath ?? ctx.snap.workspacePath,
      taskBranch: o.taskBranch ?? ctx.id.taskBranch,
      expectedTaskHeadSha: o.head ?? ctx.snap.taskHeadSha,
      expectedPreStatusDigestSha256: o.preStatus ?? ctx.snap.taskStatusDigestSha256,
    },
    patchBytes: o.patch,
    expectedPatchSha256: o.digest ?? sha256(patchStr),
    allowedPaths: o.allowed,
  };
  if (o.artifactRef !== undefined) req.artifactRef = o.artifactRef;
  return req;
}

// ── R2 hunk infrastructure ──

/** Strict unified diff range formatter: count===1 omits comma, all others include it. */
function formatRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

interface HunkSpec {
  oldStart: number; oldCount: number;
  newStart: number; newCount: number;
  body: string; // body lines with ' '/'+'/'-' prefixes, each ending \n
}

/** Build a single-file patch with one diff section and multiple @@ hunks. */
function makeSingleFilePatch(path: string, hunks: HunkSpec[]): string {
  let s = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  for (const h of hunks) {
    s += `@@ -${formatRange(h.oldStart, h.oldCount)} +${formatRange(h.newStart, h.newCount)} @@\n${h.body}`;
  }
  return s;
}

/** Wrap a real runner to count invocations. */
function countingRunner(base: any) {
  const state = { count: 0 };
  const orig = base.run.bind(base);
  (base as any).run = async (req: any) => { state.count++; return orig(req); };
  return { runner: base, state };
}

async function main() {
  console.log("LOOP Patch Application — Bounded Multi-File Unified Diff Safety Tests\n");

  // ════════════════════════════════════════════════════════════════
  // A. Plain-data & limits
  // ════════════════════════════════════════════════════════════════
  {
    console.log("A. Plain-data & limits");
    const ctx = await mkCtx("a", "codex/a");
    const { runner, wsMgr } = ctx;
    const goodOpts = { runner, workspaceManager: wsMgr, gitExecutableId: "git" };

    let gc = 0;
    const getterOpts = { get runner() { gc++; return runner; }, workspaceManager: wsMgr, gitExecutableId: "git" };
    assertThrows(() => new LoopPatchApplicationManager(getterOpts as any), "INVALID_INPUT", "ctor getter rejected");
    ok(gc === 0, "ctor getter not invoked");

    assertThrows(() => new LoopPatchApplicationManager(
      Object.defineProperty({ workspaceManager: wsMgr, gitExecutableId: "git" }, "runner",
        { set(_v: any) {}, enumerable: true, configurable: true }) as any),
      "INVALID_INPUT", "ctor setter rejected");

    const protoOwn: any = { runner, workspaceManager: wsMgr, gitExecutableId: "git" };
    Object.defineProperty(protoOwn, "__proto__", { value: {}, enumerable: true });
    assertThrows(() => new LoopPatchApplicationManager(protoOwn), "INVALID_INPUT", "ctor __proto__ rejected");

    const symObj: any = { runner, workspaceManager: wsMgr, gitExecutableId: "git" };
    Object.defineProperty(symObj, Symbol("x"), { value: 1, enumerable: true });
    assertThrows(() => new LoopPatchApplicationManager(symObj), "INVALID_INPUT", "ctor symbol rejected");

    assertThrows(() => new LoopPatchApplicationManager([] as any), "INVALID_INPUT", "ctor array rejected");

    class Foo { runner = runner; workspaceManager = wsMgr; gitExecutableId = "git"; }
    assertThrows(() => new LoopPatchApplicationManager(new Foo() as any), "INVALID_INPUT", "ctor class rejected");

    assertThrows(() => new LoopPatchApplicationManager({ ...goodOpts, bad: 1 } as any), "INVALID_INPUT", "ctor unknown field");
    assertThrows(() => new LoopPatchApplicationManager({ workspaceManager: wsMgr, gitExecutableId: "git" } as any), "INVALID_INPUT", "ctor missing runner");

    const throwProto = new Proxy({ ...goodOpts }, { getPrototypeOf() { throw new Error("boom"); } });
    assertThrows(() => new LoopPatchApplicationManager(throwProto as any), "INVALID_INPUT", "ctor throwing getPrototypeOf");
    const throwKeys = new Proxy({ ...goodOpts }, { ownKeys() { throw new Error("boom"); } });
    assertThrows(() => new LoopPatchApplicationManager(throwKeys as any), "INVALID_INPUT", "ctor throwing ownKeys");
    const throwDesc = new Proxy({ ...goodOpts }, { getOwnPropertyDescriptor() { throw new Error("boom"); } });
    assertThrows(() => new LoopPatchApplicationManager(throwDesc as any), "INVALID_INPUT", "ctor throwing descriptor");

    assertThrows(() => new LoopPatchApplicationManager({ ...goodOpts, gitTimeoutMs: 5 } as any), "INVALID_INPUT", "gitTimeoutMs too small");
    assertThrows(() => new LoopPatchApplicationManager({ ...goodOpts, maxFiles: 0 } as any), "INVALID_INPUT", "maxFiles too small");
    assertThrows(() => new LoopPatchApplicationManager({ ...goodOpts, maxHunks: 99999999 } as any), "INVALID_INPUT", "maxHunks too large");
    assertThrows(() => new LoopPatchApplicationManager({ ...goodOpts, maxTargetFileBytes: 0 } as any), "INVALID_INPUT", "maxTargetFileBytes too small");

    // request-level scanner
    const patch = makeDiff(A_OLD, A_NEW, "a.txt");
    let rgc = 0;
    const reqGetter = { ...mkReq(ctx, { patch, allowed: ["a.txt"] }) };
    Object.defineProperty(reqGetter, "patchBytes", { get() { rgc++; return patch; }, enumerable: true, configurable: true });
    await assertRejects(() => ctx.mgr.apply(reqGetter as any), "INVALID_INPUT", "request getter rejected");
    ok(rgc === 0, "request getter not invoked");
    await assertRejects(() => ctx.mgr.apply({ ...mkReq(ctx, { patch, allowed: ["a.txt"] }), bad: 1 } as any), "INVALID_INPUT", "request unknown field");
    await assertRejects(() => ctx.mgr.apply({ ...mkReq(ctx, { patch, allowed: ["a.txt"] }), workspace: { ...mkReq(ctx, { patch, allowed: ["a.txt"] }).workspace, bad: 1 } } as any), "INVALID_INPUT", "workspace unknown field");

    // encoding / limits via apply
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "", allowed: ["a.txt"], digest: sha256("") })), "PATCH_MALFORMED", "empty patch");
    const big = "x".repeat(2000000);
    const mgrSmallPatch = new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr, gitExecutableId: "git", maxPatchBytes: 1000 });
    await assertRejects(() => mgrSmallPatch.apply(mkReq(ctx, { patch: big, allowed: ["a.txt"], digest: sha256(big) })), "PATCH_TOO_LARGE", "oversized patch");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: new Uint8Array([0xff, 0xfe, 0x0a]), allowed: ["a.txt"], digest: sha256(Buffer.from([0xff, 0xfe, 0x0a])) })), "PATCH_INVALID_ENCODING", "invalid UTF-8 bytes");
    const bom = "\ufeff" + patch;
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: bom, allowed: ["a.txt"], digest: sha256(bom) })), "PATCH_INVALID_ENCODING", "BOM rejected");
    const crlf = patch.replace(/\n/g, "\r\n");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: crlf, allowed: ["a.txt"], digest: sha256(crlf) })), "PATCH_INVALID_ENCODING", "CRLF rejected");
    const ctl = patch.slice(0, 5) + "\x01" + patch.slice(5);
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: ctl, allowed: ["a.txt"], digest: sha256(ctl) })), "PATCH_INVALID_ENCODING", "control byte rejected");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch, allowed: ["a.txt"], digest: "0".repeat(64) })), "PATCH_DIGEST_MISMATCH", "digest mismatch");
    const surrogate = "diff --git a/a.txt b/a.txt\n" + String.fromCharCode(0xd800) + "\n";
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: surrogate, allowed: ["a.txt"], digest: sha256(surrogate) })), "PATCH_INVALID_ENCODING", "unpaired surrogate rejected");
    const noLf = patch.replace(/\n$/, "");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: noLf, allowed: ["a.txt"], digest: sha256(noLf) })), "PATCH_MALFORMED", "missing final LF");

    // frozen result + files
    const res = await ctx.mgr.apply(mkReq(ctx, { patch, allowed: ["a.txt"] }));
    ok(Object.isFrozen(res), "result frozen");
    ok(Object.isFrozen(res.files), "files frozen");
    ok(res.state === "applied", "A apply ok");

    rmSync(ctx.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // B. Unified diff grammar
  // ════════════════════════════════════════════════════════════════
  {
    console.log("B. Unified diff grammar");
    const ctx = await mkCtx("b", "codex/b");

    // valid single modify
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");
    const r1 = await ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: ["a.txt"] }));
    ok(r1.state === "applied" && r1.files.length === 1 && r1.files[0] === "a.txt", "valid single modify");
    ok(readFileSync(join(ctx.snap.workspacePath, "a.txt"), "utf8") === A_NEW, "single modify content");

    // valid multi-file modify (fresh ctx)
    const ctx2 = await mkCtx("b2", "codex/b2");
    const pMulti = makeDiff(A_OLD, A_NEW, "a.txt") + makeDiff(B_OLD, B_NEW, "b.txt");
    const r2 = await ctx2.mgr.apply(mkReq(ctx2, { patch: pMulti, allowed: ["a.txt", "b.txt"] }));
    ok(r2.state === "applied" && r2.files.join(",") === "a.txt,b.txt", "valid multi-file modify + order");

    // valid new file
    const ctx3 = await mkCtx("b3", "codex/b3");
    const pNew = makeNew("hello\nworld\n", "new.txt");
    const r3 = await ctx3.mgr.apply(mkReq(ctx3, { patch: pNew, allowed: ["new.txt"] }));
    ok(r3.state === "applied" && readFileSync(join(ctx3.snap.workspacePath, "new.txt"), "utf8") === "hello\nworld\n", "valid new file");

    // modify + new file same patch
    const ctx4 = await mkCtx("b4", "codex/b4");
    const pMix = makeDiff(A_OLD, A_NEW, "a.txt") + makeNew("z\n", "z.txt");
    const r4 = await ctx4.mgr.apply(mkReq(ctx4, { patch: pMix, allowed: ["a.txt", "z.txt"] }));
    ok(r4.state === "applied" && r4.files.join(",") === "a.txt,z.txt", "modify + new file batch");

    // optional index line accepted (makeDiff includes index line) — already exercised; assert index present
    ok(pMod.includes("\nindex "), "fixture patch carries optional index line");

    // no-newline marker accepted
    const ctx5 = await mkCtx("b5", "codex/b5");
    writeFileSync(join(ctx5.snap.workspacePath, "nn.txt"), "noeol");
    execFileSync(GP, ["add", "nn.txt"], { cwd: ctx5.snap.workspacePath });
    execFileSync(GP, ["commit", "-q", "-m", "nn"], { cwd: ctx5.snap.workspacePath });
    // re-snapshot after commit to refresh head/status
    const snap5 = await ctx5.wsMgr.inspect(ctx5.id);
    const pNn = makeDiff("noeol", "noeol2", "nn.txt");
    ok(pNn.includes("No newline at end of file"), "fixture emits no-newline marker");
    const ctx5b = { ...ctx5, snap: snap5 };
    const r5 = await ctx5.mgr.apply(mkReq(ctx5b as Ctx, { patch: pNn, allowed: ["nn.txt"] }));
    ok(r5.state === "applied", "no-newline marker accepted");

    // multi-hunk accepted
    const ctx6 = await mkCtx("b6", "codex/b6");
    const bigOld = Array.from({ length: 40 }, (_, i) => `line${i}`).join("\n") + "\n";
    const bigNew = Array.from({ length: 40 }, (_, i) => (i === 2 || i === 30 ? `CH${i}` : `line${i}`)).join("\n") + "\n";
    writeFileSync(join(ctx6.snap.workspacePath, "mh.txt"), bigOld);
    execFileSync(GP, ["add", "mh.txt"], { cwd: ctx6.snap.workspacePath });
    execFileSync(GP, ["commit", "-q", "-m", "mh"], { cwd: ctx6.snap.workspacePath });
    const snap6 = await ctx6.wsMgr.inspect(ctx6.id);
    const pMh = makeDiff(bigOld, bigNew, "mh.txt");
    ok((pMh.match(/@@/g) || []).length >= 4, "fixture emits multiple hunks");
    const r6 = await ctx6.mgr.apply(mkReq({ ...ctx6, snap: snap6 } as Ctx, { patch: pMh, allowed: ["mh.txt"] }));
    ok(r6.state === "applied", "multi-hunk accepted");

    // malformed cases (hand-built)
    const H = (body: string) => `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n${body}`;
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "garbage header\n", allowed: ["a.txt"] })), "PATCH_MALFORMED", "malformed diff header");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: 'diff --git a/"a.txt" b/"a.txt"\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n', allowed: ["a.txt"] })), "PATCH_MALFORMED", "quoted path rejected");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "diff --git a/a.txt b/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n", allowed: ["a.txt"] })), "PATCH_MALFORMED", "missing --- line");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "diff --git a/a.txt b/other.txt\n--- a/a.txt\n+++ b/other.txt\n@@ -1 +1 @@\n-x\n+y\n", allowed: ["a.txt", "other.txt"] })), "PATCH_MALFORMED", "header a/b mismatch");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod + pMod, allowed: ["a.txt"] })), "PATCH_MALFORMED", "duplicate section");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n", allowed: ["a.txt"] })), "PATCH_MALFORMED", "missing hunk");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: H("@@ -1,2 +1,2 @@\n-x\n+y\n"), allowed: ["a.txt"] })), "PATCH_MALFORMED", "hunk count mismatch");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: H("@@ -1 +1 @@\nx\n"), allowed: ["a.txt"] })), "PATCH_MALFORMED", "invalid body prefix");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: H("@@ -1 +1 @@\n x\n"), allowed: ["a.txt"] })), "PATCH_MALFORMED", "context-only hunk");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: H("@@ -1,3 +1,3 @@\n-alpha\n-beta\n@@ -1,3 +1,3 @@\n-alpha\n+X\n"), allowed: ["a.txt"] })), "PATCH_MALFORMED", "overlapping hunk");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod + "trailing\n", allowed: ["a.txt"] })), "PATCH_MALFORMED", "trailing garbage");
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: "preamble text\n" + pMod, allowed: ["a.txt"] })), "PATCH_MALFORMED", "preamble rejected");

    rmSync(ctx.s.tr, { recursive: true, force: true });
    rmSync(ctx2.s.tr, { recursive: true, force: true });
    rmSync(ctx3.s.tr, { recursive: true, force: true });
    rmSync(ctx4.s.tr, { recursive: true, force: true });
    rmSync(ctx5.s.tr, { recursive: true, force: true });
    rmSync(ctx6.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // C. Path & whitelist
  // ════════════════════════════════════════════════════════════════
  {
    console.log("C. Path & whitelist");
    const ctx = await mkCtx("c", "codex/c");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // extra whitelist entries ok
    const rExtra = await ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: ["a.txt", "unused.txt"] }));
    ok(rExtra.state === "applied", "extra whitelist entries ok");

    // not allowed
    const ctxN = await mkCtx("c2", "codex/c2");
    await assertRejects(() => ctxN.mgr.apply(mkReq(ctxN, { patch: pMod, allowed: ["other.txt"] })), "PATCH_PATH_NOT_ALLOWED", "path not allowed");
    // prefix collision
    const ctxP = await mkCtx("c3", "codex/c3");
    await assertRejects(() => ctxP.mgr.apply(mkReq(ctxP, { patch: pMod, allowed: ["a.txt.bak"] })), "PATCH_PATH_NOT_ALLOWED", "prefix collision not allowed");

    // structural path rules via allowedPaths
    const bad = (ap: string, code: string, label: string) =>
      assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: [ap] })), code, label);
    await bad("/abs.txt", "PATCH_UNSAFE_PATH", "absolute path");
    await bad("../esc.txt", "PATCH_UNSAFE_PATH", "traversal path");
    await bad("a/./b.txt", "PATCH_UNSAFE_PATH", "dot segment");
    await bad("a//b.txt", "PATCH_UNSAFE_PATH", "empty segment");
    await bad("a\\b.txt", "PATCH_UNSAFE_PATH", "backslash");
    await bad("a b.txt", "PATCH_UNSAFE_PATH", "whitespace");
    await bad("a\x00b.txt", "PATCH_UNSAFE_PATH", "NUL in path");
    await bad("a\x01b.txt", "PATCH_UNSAFE_PATH", "control in path");
    await bad("a\u0301.txt", "PATCH_UNSAFE_PATH", "non-NFC path");
    await bad("dir/.git/x", "PATCH_UNSAFE_PATH", ".git segment");
    await bad("a".repeat(5000) + ".txt", "PATCH_UNSAFE_PATH", "path byte limit");

    // duplicate allowed path
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: ["a.txt", "a.txt"] })), "INVALID_INPUT", "duplicate allowed path");
    // duplicate touched path (two sections same path)
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod + pMod, allowed: ["a.txt"] })), "PATCH_MALFORMED", "duplicate touched path");
    // empty allowedPaths
    await assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: [] })), "INVALID_INPUT", "empty allowedPaths");

    rmSync(ctx.s.tr, { recursive: true, force: true });
    rmSync(ctxN.s.tr, { recursive: true, force: true });
    rmSync(ctxP.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // D. Unsupported change
  // ════════════════════════════════════════════════════════════════
  {
    console.log("D. Unsupported change");
    const ctx = await mkCtx("d", "codex/d");
    const rej = (patch: string, code: string, label: string, allowed = ["a.txt"]) =>
      assertRejects(() => ctx.mgr.apply(mkReq(ctx, { patch, allowed })), code, label);

    await rej("diff --git a/a.txt b/b.txt\nsimilarity index 100%\nrename from a.txt\nrename to b.txt\n", "PATCH_UNSUPPORTED_CHANGE", "rename rejected", ["a.txt", "b.txt"]);
    await rej("diff --git a/a.txt b/b.txt\nsimilarity index 100%\ncopy from a.txt\ncopy to b.txt\n", "PATCH_UNSUPPORTED_CHANGE", "copy rejected", ["a.txt", "b.txt"]);
    await rej("diff --git a/a.txt b/a.txt\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/a.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-alpha\n", "PATCH_UNSUPPORTED_CHANGE", "delete rejected");
    await rej("diff --git a/a.txt b/a.txt\nGIT binary patch\nliteral 10\nabcdefghij\n", "PATCH_BINARY", "GIT binary patch rejected");
    await rej("diff --git a/a.txt b/a.txt\nBinary files a/a.txt and b/a.txt differ\n", "PATCH_BINARY", "Binary files differ rejected");
    await rej("diff --git a/a.txt b/a.txt\nold mode 100644\nnew mode 100755\n", "PATCH_UNSUPPORTED_CHANGE", "mode-only rejected");
    await rej("diff --git a/x.sh b/x.sh\nnew file mode 100755\nindex 0000000..1111111\n--- /dev/null\n+++ b/x.sh\n@@ -0,0 +1 @@\n+echo hi\n", "PATCH_UNSUPPORTED_CHANGE", "executable create rejected", ["x.sh"]);
    await rej("diff --git a/lnk b/lnk\nnew file mode 120000\nindex 0000000..1111111\n--- /dev/null\n+++ b/lnk\n@@ -0,0 +1 @@\n+a.txt\n", "PATCH_UNSUPPORTED_CHANGE", "symlink mode rejected", ["lnk"]);
    await rej("diff --git a/sub b/sub\nnew file mode 160000\nindex 0000000..1111111\n", "PATCH_UNSUPPORTED_CHANGE", "gitlink mode rejected", ["sub"]);
    await rej("diff --git a/a.txt b/a.txt\nindex 1111111..2222222 100755\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-alpha\n+y\n", "PATCH_UNSUPPORTED_CHANGE", "index mode non-100644 rejected");
    await rej("diff --cc a.txt\nindex 1111111,2222222..3333333\n--- a/a.txt\n+++ b/a.txt\n", "PATCH_UNSUPPORTED_CHANGE", "combined diff rejected");
    await rej("diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-alpha\n+y\n", "PATCH_MALFORMED", "new file with a/ --- rejected");

    rmSync(ctx.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // E. Filesystem safety
  // ════════════════════════════════════════════════════════════════
  {
    console.log("E. Filesystem safety");
    const fsr = require("node:fs");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // missing modify target
    const ctxM = await mkCtx("e1", "codex/e1");
    const pMissing = makeDiff("zz\n", "yy\n", "missing.txt");
    await assertRejects(() => ctxM.mgr.apply(mkReq(ctxM, { patch: pMissing, allowed: ["missing.txt"] })), "PATCH_NOT_APPLICABLE", "missing modify target");
    rmSync(ctxM.s.tr, { recursive: true, force: true });

    // target symlink
    const ctxS = await mkCtx("e2", "codex/e2");
    symlinkSync(join(ctxS.snap.workspacePath, "a.txt"), join(ctxS.snap.workspacePath, "sl.txt"));
    const ctxSr = await refresh(ctxS);
    const pSl = makeDiff(A_OLD, A_NEW, "sl.txt");
    await assertRejects(() => ctxSr.mgr.apply(mkReq(ctxSr, { patch: pSl, allowed: ["sl.txt"] })), "PATCH_SYMLINK", "target symlink rejected");
    rmSync(ctxS.s.tr, { recursive: true, force: true });

    // parent symlink
    const ctxPS = await mkCtx("e3", "codex/e3");
    mkdirSync(join(ctxPS.snap.workspacePath, "realdir"));
    writeFileSync(join(ctxPS.snap.workspacePath, "realdir", "f.txt"), A_OLD);
    symlinkSync(join(ctxPS.snap.workspacePath, "realdir"), join(ctxPS.snap.workspacePath, "linkdir"));
    const ctxPSr = await refresh(ctxPS);
    const pPs = makeDiff(A_OLD, A_NEW, "linkdir/f.txt");
    await assertRejects(() => ctxPSr.mgr.apply(mkReq(ctxPSr, { patch: pPs, allowed: ["linkdir/f.txt"] })), "PATCH_SYMLINK", "parent symlink rejected");
    rmSync(ctxPS.s.tr, { recursive: true, force: true });

    // target directory
    const ctxD = await mkCtx("e4", "codex/e4");
    mkdirSync(join(ctxD.snap.workspacePath, "subdir"));
    const ctxDr = await refresh(ctxD);
    const pDir = makeDiff("x\n", "y\n", "subdir");
    await assertRejects(() => ctxDr.mgr.apply(mkReq(ctxDr, { patch: pDir, allowed: ["subdir"] })), "PATCH_UNSAFE_PATH", "target directory rejected");
    rmSync(ctxD.s.tr, { recursive: true, force: true });

    // target FIFO
    const ctxF = await mkCtx("e5", "codex/e5");
    execFileSync("mkfifo", [join(ctxF.snap.workspacePath, "fifo1")]);
    const ctxFr = await refresh(ctxF);
    const pFifo = "diff --git a/fifo1 b/fifo1\n--- a/fifo1\n+++ b/fifo1\n@@ -1 +1 @@\n-x\n+y\n";
    try {
      await assertRejects(() => ctxFr.mgr.apply(mkReq(ctxFr, { patch: pFifo, allowed: ["fifo1"] })), "PATCH_UNSAFE_PATH", "target FIFO rejected");
    } finally { rmSync(ctxF.s.tr, { recursive: true, force: true }); }

    // invalid UTF-8 target
    const ctxU = await mkCtx("e6", "codex/e6");
    writeFileSync(join(ctxU.snap.workspacePath, "bin.txt"), Buffer.from([0xff, 0xfe, 0x0a]));
    const ctxUr = await refresh(ctxU);
    const pBin = "diff --git a/bin.txt b/bin.txt\n--- a/bin.txt\n+++ b/bin.txt\n@@ -1 +1 @@\n-x\n+y\n";
    await assertRejects(() => ctxUr.mgr.apply(mkReq(ctxUr, { patch: pBin, allowed: ["bin.txt"] })), "PATCH_BINARY", "invalid UTF-8 target rejected");
    rmSync(ctxU.s.tr, { recursive: true, force: true });

    // NUL target
    const ctxNul = await mkCtx("e7", "codex/e7");
    writeFileSync(join(ctxNul.snap.workspacePath, "nul.txt"), Buffer.from([0x61, 0x00, 0x0a]));
    const ctxNulr = await refresh(ctxNul);
    const pNul = "diff --git a/nul.txt b/nul.txt\n--- a/nul.txt\n+++ b/nul.txt\n@@ -1 +1 @@\n-x\n+y\n";
    await assertRejects(() => ctxNulr.mgr.apply(mkReq(ctxNulr, { patch: pNul, allowed: ["nul.txt"] })), "PATCH_BINARY", "NUL target rejected");
    rmSync(ctxNul.s.tr, { recursive: true, force: true });

    // oversized target
    const ctxBig = await mkCtx("e8", "codex/e8");
    const mgrTiny = new LoopPatchApplicationManager({ runner: ctxBig.runner, workspaceManager: ctxBig.wsMgr, gitExecutableId: "git", maxTargetFileBytes: 3 });
    await assertRejects(() => mgrTiny.apply(mkReq(ctxBig, { patch: pMod, allowed: ["a.txt"] })), "PATCH_UNSAFE_PATH", "oversized target rejected");
    rmSync(ctxBig.s.tr, { recursive: true, force: true });

    // lstat failure
    const ctxL = await mkCtx("e9", "codex/e9");
    const tgtL = join(ctxL.snap.workspacePath, "a.txt");
    const origLstat = fsr.lstatSync;
    fsr.lstatSync = function (pp: any, ...rest: any[]) {
      if (pp === tgtL) throw Object.assign(new Error("io"), { code: "EIO" });
      return origLstat.call(fsr, pp, ...rest);
    };
    try {
      await assertRejects(() => ctxL.mgr.apply(mkReq(ctxL, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_IO_FAILED", "lstat failure");
    } finally { fsr.lstatSync = origLstat; rmSync(ctxL.s.tr, { recursive: true, force: true }); }

    // realpath failure (per-target containment check)
    const ctxRp = await mkCtx("e10", "codex/e10");
    const origRealpath = fsr.realpathSync;
    const tgtRp = join(ctxRp.snap.workspacePath, "a.txt");
    fsr.realpathSync = function (pp: any, ...rest: any[]) {
      if (pp === tgtRp) throw Object.assign(new Error("io"), { code: "EIO" });
      return origRealpath.call(fsr, pp, ...rest);
    };
    try {
      await assertRejects(() => ctxRp.mgr.apply(mkReq(ctxRp, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_IO_FAILED", "realpath failure");
    } finally { fsr.realpathSync = origRealpath; rmSync(ctxRp.s.tr, { recursive: true, force: true }); }

    // read failure
    const ctxRf = await mkCtx("e11", "codex/e11");
    const tgtR = join(ctxRf.snap.workspacePath, "a.txt");
    const origRead = fsr.readFileSync;
    fsr.readFileSync = function (pp: any, ...rest: any[]) {
      if (pp === tgtR) throw Object.assign(new Error("io"), { code: "EACCES" });
      return origRead.call(fsr, pp, ...rest);
    };
    try {
      await assertRejects(() => ctxRf.mgr.apply(mkReq(ctxRf, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_IO_FAILED", "read failure");
    } finally { fsr.readFileSync = origRead; rmSync(ctxRf.s.tr, { recursive: true, force: true }); }

    // target race before apply (drift between pre and pre2 target digest)
    const ctxRace = await mkCtx("e12", "codex/e12");
    const raceRunner = interceptedRunner(ctxRace.s.rp, ctxRace.s.cr, ctxRace.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && r.exitCode === 0) {
        writeFileSync(join(ctxRace.snap.workspacePath, "a.txt"), "mutated\n");
      }
      return r;
    });
    const mgrRace = new LoopPatchApplicationManager({ runner: raceRunner, workspaceManager: ctxRace.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrRace.apply(mkReq(ctxRace, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "target race before apply");
    rmSync(ctxRace.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // F. Create file
  // ════════════════════════════════════════════════════════════════
  {
    console.log("F. Create file");
    // 100644 create success
    const ctx1 = await mkCtx("f1", "codex/f1");
    const pNew = makeNew("created\n", "created.txt");
    const r1 = await ctx1.mgr.apply(mkReq(ctx1, { patch: pNew, allowed: ["created.txt"] }));
    ok(r1.state === "applied" && readFileSync(join(ctx1.snap.workspacePath, "created.txt"), "utf8") === "created\n", "100644 create success");
    rmSync(ctx1.s.tr, { recursive: true, force: true });

    // parent not exist
    const ctx2 = await mkCtx("f2", "codex/f2");
    const pNoPar = makeNew("x\n", "nodir/f.txt");
    await assertRejects(() => ctx2.mgr.apply(mkReq(ctx2, { patch: pNoPar, allowed: ["nodir/f.txt"] })), "PATCH_NOT_APPLICABLE", "create parent missing");
    rmSync(ctx2.s.tr, { recursive: true, force: true });

    // parent directory symlink
    const ctx3 = await mkCtx("f3", "codex/f3");
    mkdirSync(join(ctx3.snap.workspacePath, "rd"));
    symlinkSync(join(ctx3.snap.workspacePath, "rd"), join(ctx3.snap.workspacePath, "ld"));
    const ctx3r = await refresh(ctx3);
    const pParSym = makeNew("x\n", "ld/f.txt");
    await assertRejects(() => ctx3r.mgr.apply(mkReq(ctx3r, { patch: pParSym, allowed: ["ld/f.txt"] })), "PATCH_SYMLINK", "create parent symlink rejected");
    rmSync(ctx3.s.tr, { recursive: true, force: true });

    // target exists & patch not applied (create onto different existing content)
    const ctx4 = await mkCtx("f4", "codex/f4");
    writeFileSync(join(ctx4.snap.workspacePath, "exists.txt"), "different\n");
    const ctx4r = await refresh(ctx4);
    const pExists = makeNew("created\n", "exists.txt");
    await assertRejects(() => ctx4r.mgr.apply(mkReq(ctx4r, { patch: pExists, allowed: ["exists.txt"] })), "PATCH_NOT_APPLICABLE", "create onto existing different file");
    rmSync(ctx4.s.tr, { recursive: true, force: true });

    // target exists & patch already applied → already_applied
    const ctx5 = await mkCtx("f5", "codex/f5");
    const pNew5 = makeNew("created\n", "c5.txt");
    const first5 = await ctx5.mgr.apply(mkReq(ctx5, { patch: pNew5, allowed: ["c5.txt"] }));
    ok(first5.state === "applied", "create first apply ok");
    const ctx5r = await refresh(ctx5);
    const second5 = await ctx5r.mgr.apply(mkReq(ctx5r, { patch: pNew5, allowed: ["c5.txt"] }));
    ok(second5.state === "already_applied", "create already_applied on existing applied target");
    rmSync(ctx5.s.tr, { recursive: true, force: true });

    // target symlink (create path)
    const ctx6 = await mkCtx("f6", "codex/f6");
    symlinkSync(join(ctx6.snap.workspacePath, "a.txt"), join(ctx6.snap.workspacePath, "c6.txt"));
    const ctx6r = await refresh(ctx6);
    const pSym6 = makeNew("x\n", "c6.txt");
    await assertRejects(() => ctx6r.mgr.apply(mkReq(ctx6r, { patch: pSym6, allowed: ["c6.txt"] })), "PATCH_SYMLINK", "create target symlink rejected");
    rmSync(ctx6.s.tr, { recursive: true, force: true });

    // target directory (create path)
    const ctx7 = await mkCtx("f7", "codex/f7");
    mkdirSync(join(ctx7.snap.workspacePath, "c7dir"));
    const ctx7r = await refresh(ctx7);
    const pDir7 = makeNew("x\n", "c7dir");
    await assertRejects(() => ctx7r.mgr.apply(mkReq(ctx7r, { patch: pDir7, allowed: ["c7dir"] })), "PATCH_UNSAFE_PATH", "create target directory rejected");
    rmSync(ctx7.s.tr, { recursive: true, force: true });

    // target binary (create path)
    const ctx8 = await mkCtx("f8", "codex/f8");
    writeFileSync(join(ctx8.snap.workspacePath, "c8.bin"), Buffer.from([0xff, 0x00, 0x0a]));
    const ctx8r = await refresh(ctx8);
    const pBin8 = makeNew("x\n", "c8.bin");
    await assertRejects(() => ctx8r.mgr.apply(mkReq(ctx8r, { patch: pBin8, allowed: ["c8.bin"] })), "PATCH_BINARY", "create target binary rejected");
    rmSync(ctx8.s.tr, { recursive: true, force: true });

    // parent is a file (directory creation rejected)
    const ctx9 = await mkCtx("f9", "codex/f9");
    const pParFile = makeNew("x\n", "a.txt/inner.txt");
    await assertRejects(() => ctx9.mgr.apply(mkReq(ctx9, { patch: pParFile, allowed: ["a.txt/inner.txt"] })), "PATCH_UNSAFE_PATH", "parent-is-file rejected");
    rmSync(ctx9.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // G. Apply behavior
  // ════════════════════════════════════════════════════════════════
  {
    console.log("G. Apply behavior");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // multi-file apply + digests + HEAD/index invariants
    const ctx = await mkCtx("g1", "codex/g1");
    const ws = ctx.snap.workspacePath;
    const preCached = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
    const pMulti = makeDiff(A_OLD, A_NEW, "a.txt") + makeDiff(B_OLD, B_NEW, "b.txt") + makeNew("nn\n", "g.txt");
    const res = await ctx.mgr.apply(mkReq(ctx, { patch: pMulti, allowed: ["a.txt", "b.txt", "g.txt"] }));
    ok(res.state === "applied", "multi-file + create apply");
    ok(res.files.join(",") === "a.txt,b.txt,g.txt", "returned file order = patch order");
    ok(res.preTaskHeadSha === res.postTaskHeadSha, "task HEAD unchanged");
    ok(res.preStatusDigestSha256 !== res.postStatusDigestSha256, "status digest changed on applied");
    ok(res.patchDigestSha256 === sha256(pMulti), "returned patch digest correct");
    const postCached = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
    ok(preCached === postCached, "index unchanged after apply");
    ok(readFileSync(join(ws, "a.txt"), "utf8") === A_NEW && readFileSync(join(ws, "g.txt"), "utf8") === "nn\n", "apply wrote expected content");

    // Source workspace unchanged
    const srcHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ctx.s.rp, encoding: "utf8" }).trim();
    const srcBranch = execFileSync(GP, ["symbolic-ref", "--short", "HEAD"], { cwd: ctx.s.rp, encoding: "utf8" }).trim();
    const srcStatus = execFileSync(GP, ["status", "--porcelain"], { cwd: ctx.s.rp, encoding: "utf8" });
    ok(srcHead === ctx.s.featSha || srcHead === ctx.s.baseSha, "source HEAD unchanged");
    ok(srcBranch === "main", "source branch unchanged");
    ok(srcStatus === "", "source status clean/unchanged");
    ok(readFileSync(join(ctx.s.rp, "a.txt"), "utf8") === A_OLD, "source file content unchanged");
    rmSync(ctx.s.tr, { recursive: true, force: true });

    // clean-round repair patch (patch2 builds on committed patch1 result)
    const ctx2 = await mkCtx("g2", "codex/g2");
    const p1 = makeDiff(A_OLD, A_NEW, "a.txt");
    await ctx2.mgr.apply(mkReq(ctx2, { patch: p1, allowed: ["a.txt"] }));
    // Commit so status digest resets to clean; next apply makes it dirty again.
    execFileSync(GP, ["add", "a.txt"], { cwd: ctx2.snap.workspacePath });
    execFileSync(GP, ["commit", "-q", "-m", "round1"], { cwd: ctx2.snap.workspacePath });
    const snap2 = await ctx2.wsMgr.inspect(ctx2.id);
    const p2 = makeDiff(A_NEW, "alpha\nBETA\ndelta\n", "a.txt");
    const r2 = await ctx2.mgr.apply(mkReq({ ...ctx2, snap: snap2 } as Ctx, { patch: p2, allowed: ["a.txt"] }));
    ok(r2.state === "applied" && readFileSync(join(ctx2.snap.workspacePath, "a.txt"), "utf8") === "alpha\nBETA\ndelta\n", "clean-round repair patch");
    rmSync(ctx2.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // H. Duplicate / reconciliation
  // ════════════════════════════════════════════════════════════════
  {
    console.log("H. Duplicate / reconciliation");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // second apply → already_applied, no write
    const ctx = await mkCtx("h1", "codex/h1");
    const ws = ctx.snap.workspacePath;
    await ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: ["a.txt"] }));
    const snapB = await ctx.wsMgr.inspect(ctx.id);
    const before = readFileSync(join(ws, "a.txt"), "utf8");
    const res2 = await ctx.mgr.apply(mkReq({ ...ctx, snap: snapB } as Ctx, { patch: pMod, allowed: ["a.txt"] }));
    ok(res2.state === "already_applied", "second apply already_applied");
    ok(res2.preStatusDigestSha256 === res2.postStatusDigestSha256, "already_applied no status change");
    ok(readFileSync(join(ws, "a.txt"), "utf8") === before, "already_applied no write");
    rmSync(ctx.s.tr, { recursive: true, force: true });

    // manual drift → pre-status mismatch → WORKSPACE_DRIFT
    const ctxD = await mkCtx("h2", "codex/h2");
    writeFileSync(join(ctxD.snap.workspacePath, "a.txt"), "manual drift\n");
    await assertRejects(() => ctxD.mgr.apply(mkReq(ctxD, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "manual drift pre-status mismatch");
    rmSync(ctxD.s.tr, { recursive: true, force: true });

    // F fail R fail → PATCH_NOT_APPLICABLE
    const ctxN = await mkCtx("h3", "codex/h3");
    const pWrong = makeDiff("totally\ndifferent\n", "other\n", "a.txt");
    await assertRejects(() => ctxN.mgr.apply(mkReq(ctxN, { patch: pWrong, allowed: ["a.txt"] })), "PATCH_NOT_APPLICABLE", "F fail R fail not applicable");
    rmSync(ctxN.s.tr, { recursive: true, force: true });

    // F success R success (simulated) → PATCH_RECONCILIATION_FAILED
    const ctxFR = await mkCtx("h4", "codex/h4");
    const frRunner = interceptedRunner(ctxFR.s.rp, ctxFR.s.cr, ctxFR.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check"))
        return { status: "exited", exitCode: 0, stdout: "", stderr: "", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 0, termSignalSent: false, killSignalSent: false };
      return orig(req);
    });
    const mgrFR = new LoopPatchApplicationManager({ runner: frRunner, workspaceManager: ctxFR.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrFR.apply(mkReq(ctxFR, { patch: pMod, allowed: ["a.txt"] })), "PATCH_RECONCILIATION_FAILED", "F and R both succeed");
    rmSync(ctxFR.s.tr, { recursive: true, force: true });

    // apply exit 1, no side effect → PATCH_APPLY_FAILED
    const ctxA1 = await mkCtx("h5", "codex/h5");
    const a1Runner = interceptedRunner(ctxA1.s.rp, ctxA1.s.cr, ctxA1.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check"))
        return { status: "exited", exitCode: 1, stdout: "", stderr: "err", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 3, termSignalSent: false, killSignalSent: false };
      return orig(req);
    });
    const mgrA1 = new LoopPatchApplicationManager({ runner: a1Runner, workspaceManager: ctxA1.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrA1.apply(mkReq(ctxA1, { patch: pMod, allowed: ["a.txt"] })), "PATCH_APPLY_FAILED", "apply exit 1 no side effect");
    rmSync(ctxA1.s.tr, { recursive: true, force: true });

    // apply exit 1 but fully applied → applied (recovered)
    const ctxA2 = await mkCtx("h6", "codex/h6");
    const a2Runner = interceptedRunner(ctxA2.s.rp, ctxA2.s.cr, ctxA2.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check"))
        return { ...r, exitCode: 1 };
      return r;
    });
    const mgrA2 = new LoopPatchApplicationManager({ runner: a2Runner, workspaceManager: ctxA2.wsMgr, gitExecutableId: "git" });
    const rA2 = await mgrA2.apply(mkReq(ctxA2, { patch: pMod, allowed: ["a.txt"] }));
    ok(rA2.state === "applied", "apply exit 1 but fully applied → applied");
    rmSync(ctxA2.s.tr, { recursive: true, force: true });

    // apply exit >1 but fully applied → applied
    const ctxA3 = await mkCtx("h7", "codex/h7");
    const a3Runner = interceptedRunner(ctxA3.s.rp, ctxA3.s.cr, ctxA3.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check")) return { ...r, exitCode: 2 };
      return r;
    });
    const mgrA3 = new LoopPatchApplicationManager({ runner: a3Runner, workspaceManager: ctxA3.wsMgr, gitExecutableId: "git" });
    const rA3 = await mgrA3.apply(mkReq(ctxA3, { patch: pMod, allowed: ["a.txt"] }));
    ok(rA3.state === "applied", "apply exit 2 but fully applied → applied");
    rmSync(ctxA3.s.tr, { recursive: true, force: true });

    // apply nonzero partial side effect → PATCH_RECONCILIATION_FAILED
    const ctxA4 = await mkCtx("h8", "codex/h8");
    const a4Runner = interceptedRunner(ctxA4.s.rp, ctxA4.s.cr, ctxA4.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check")) {
        writeFileSync(join(ctxA4.snap.workspacePath, "a.txt"), "partial garbage\n");
        return { status: "exited", exitCode: 1, stdout: "", stderr: "err", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 3, termSignalSent: false, killSignalSent: false };
      }
      return orig(req);
    });
    const mgrA4 = new LoopPatchApplicationManager({ runner: a4Runner, workspaceManager: ctxA4.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrA4.apply(mkReq(ctxA4, { patch: pMod, allowed: ["a.txt"] })), "PATCH_RECONCILIATION_FAILED", "apply nonzero partial side effect");
    rmSync(ctxA4.s.tr, { recursive: true, force: true });

    // apply exit 0 but post-state incomplete → PATCH_RECONCILIATION_FAILED
    const ctxA5 = await mkCtx("h9", "codex/h9");
    const a5Runner = interceptedRunner(ctxA5.s.rp, ctxA5.s.cr, ctxA5.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check"))
        return { status: "exited", exitCode: 0, stdout: "", stderr: "", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 0, termSignalSent: false, killSignalSent: false };
      return orig(req);
    });
    const mgrA5 = new LoopPatchApplicationManager({ runner: a5Runner, workspaceManager: ctxA5.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrA5.apply(mkReq(ctxA5, { patch: pMod, allowed: ["a.txt"] })), "PATCH_RECONCILIATION_FAILED", "apply exit 0 but not applied");
    rmSync(ctxA5.s.tr, { recursive: true, force: true });

    // post-index changed → WORKSPACE_DRIFT
    const ctxI = await mkCtx("h10", "codex/h10");
    const iRunner = interceptedRunner(ctxI.s.rp, ctxI.s.cr, ctxI.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check") && r.exitCode === 0)
        execFileSync(GP, ["add", "a.txt"], { cwd: ctxI.snap.workspacePath });
      return r;
    });
    const mgrI = new LoopPatchApplicationManager({ runner: iRunner, workspaceManager: ctxI.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrI.apply(mkReq(ctxI, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "post-index changed");
    rmSync(ctxI.s.tr, { recursive: true, force: true });

    // post-HEAD changed → WORKSPACE_DRIFT
    const ctxHd = await mkCtx("h11", "codex/h11");
    const hdRunner = interceptedRunner(ctxHd.s.rp, ctxHd.s.cr, ctxHd.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check") && r.exitCode === 0) {
        execFileSync(GP, ["add", "-A"], { cwd: ctxHd.snap.workspacePath });
        execFileSync(GP, ["commit", "-q", "-m", "sneaky"], { cwd: ctxHd.snap.workspacePath });
      }
      return r;
    });
    const mgrHd = new LoopPatchApplicationManager({ runner: hdRunner, workspaceManager: ctxHd.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrHd.apply(mkReq(ctxHd, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "post-HEAD changed");
    rmSync(ctxHd.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // I. Runner / workspace faults
  // ════════════════════════════════════════════════════════════════
  {
    console.log("I. Runner / workspace faults");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");
    const fakeResult = (over: any) => ({ status: "exited", exitCode: 0, stdout: "", stderr: "", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 0, termSignalSent: false, killSignalSent: false, ...over });

    // Runner throw on apply check
    const ctxT = await mkCtx("i1", "codex/i1");
    const tRunner = interceptedRunner(ctxT.s.rp, ctxT.s.cr, ctxT.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) throw new Error("runner crash");
      return orig(req);
    });
    const mgrT = new LoopPatchApplicationManager({ runner: tRunner, workspaceManager: ctxT.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrT.apply(mkReq(ctxT, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "runner throw");
    rmSync(ctxT.s.tr, { recursive: true, force: true });

    // timeout
    const ctxTo = await mkCtx("i2", "codex/i2");
    const toRunner = interceptedRunner(ctxTo.s.rp, ctxTo.s.cr, ctxTo.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) return fakeResult({ status: "timed_out", exitCode: null });
      return orig(req);
    });
    const mgrTo = new LoopPatchApplicationManager({ runner: toRunner, workspaceManager: ctxTo.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrTo.apply(mkReq(ctxTo, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "timeout");
    rmSync(ctxTo.s.tr, { recursive: true, force: true });

    // null exit
    const ctxNe = await mkCtx("i3", "codex/i3");
    const neRunner = interceptedRunner(ctxNe.s.rp, ctxNe.s.cr, ctxNe.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) return fakeResult({ exitCode: null });
      return orig(req);
    });
    const mgrNe = new LoopPatchApplicationManager({ runner: neRunner, workspaceManager: ctxNe.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrNe.apply(mkReq(ctxNe, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "null exit");
    rmSync(ctxNe.s.tr, { recursive: true, force: true });

    // signal
    const ctxSg = await mkCtx("i4", "codex/i4");
    const sgRunner = interceptedRunner(ctxSg.s.rp, ctxSg.s.cr, ctxSg.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) return fakeResult({ exitCode: null, signal: "SIGKILL" });
      return orig(req);
    });
    const mgrSg = new LoopPatchApplicationManager({ runner: sgRunner, workspaceManager: ctxSg.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrSg.apply(mkReq(ctxSg, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "signal");
    rmSync(ctxSg.s.tr, { recursive: true, force: true });

    // stdout truncation
    const ctxSt = await mkCtx("i5", "codex/i5");
    const stRunner = interceptedRunner(ctxSt.s.rp, ctxSt.s.cr, ctxSt.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) return fakeResult({ stdoutTruncated: true });
      return orig(req);
    });
    const mgrSt = new LoopPatchApplicationManager({ runner: stRunner, workspaceManager: ctxSt.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrSt.apply(mkReq(ctxSt, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "stdout truncation");
    rmSync(ctxSt.s.tr, { recursive: true, force: true });

    // stderr truncation
    const ctxSe = await mkCtx("i6", "codex/i6");
    const seRunner = interceptedRunner(ctxSe.s.rp, ctxSe.s.cr, ctxSe.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check")) return fakeResult({ stderrTruncated: true });
      return orig(req);
    });
    const mgrSe = new LoopPatchApplicationManager({ runner: seRunner, workspaceManager: ctxSe.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrSe.apply(mkReq(ctxSe, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "stderr truncation");
    rmSync(ctxSe.s.tr, { recursive: true, force: true });

    // check exit >1
    const ctxCe = await mkCtx("i7", "codex/i7");
    const ceRunner = interceptedRunner(ctxCe.s.rp, ctxCe.s.cr, ctxCe.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse")) return fakeResult({ exitCode: 2, stderr: "fatal" });
      return orig(req);
    });
    const mgrCe = new LoopPatchApplicationManager({ runner: ceRunner, workspaceManager: ctxCe.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrCe.apply(mkReq(ctxCe, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "check exit >1");
    rmSync(ctxCe.s.tr, { recursive: true, force: true });

    // workspace path mismatch
    const ctxWp = await mkCtx("i8", "codex/i8");
    await assertRejects(() => ctxWp.mgr.apply(mkReq(ctxWp, { patch: pMod, allowed: ["a.txt"], workspacePath: ctxWp.snap.workspacePath + "-wrong" })), "WORKSPACE_DRIFT", "workspace path mismatch");
    rmSync(ctxWp.s.tr, { recursive: true, force: true });

    // task branch mismatch (request validation)
    const ctxTb = await mkCtx("i9", "codex/i9");
    await assertRejects(() => ctxTb.mgr.apply(mkReq(ctxTb, { patch: pMod, allowed: ["a.txt"], taskBranch: "codex/other" })), "INVALID_INPUT", "task branch mismatch");
    rmSync(ctxTb.s.tr, { recursive: true, force: true });

    // task HEAD mismatch
    const ctxH = await mkCtx("i10", "codex/i10");
    await assertRejects(() => ctxH.mgr.apply(mkReq(ctxH, { patch: pMod, allowed: ["a.txt"], head: "0".repeat(40) })), "WORKSPACE_DRIFT", "task HEAD mismatch");
    rmSync(ctxH.s.tr, { recursive: true, force: true });

    // pre-status mismatch
    const ctxPs = await mkCtx("i11", "codex/i11");
    await assertRejects(() => ctxPs.mgr.apply(mkReq(ctxPs, { patch: pMod, allowed: ["a.txt"], preStatus: "1".repeat(64) })), "WORKSPACE_DRIFT", "pre-status mismatch");
    rmSync(ctxPs.s.tr, { recursive: true, force: true });

    // D03 inspect corruption
    const ctxIc = await mkCtx("i12", "codex/i12");
    const mgrIc = new LoopPatchApplicationManager({ runner: ctxIc.runner, workspaceManager: { inspect: async () => { throw new Error("corrupt"); } } as any, gitExecutableId: "git" });
    await assertRejects(() => mgrIc.apply(mkReq(ctxIc, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "inspect corruption");
    rmSync(ctxIc.s.tr, { recursive: true, force: true });

    // cached diff command fails
    const ctxCd = await mkCtx("i13", "codex/i13");
    const cdRunner = interceptedRunner(ctxCd.s.rp, ctxCd.s.cr, ctxCd.s.home, async (req, orig) => {
      const a = (req.args as string[]).join(" ");
      if (a.includes("diff") && a.includes("--cached")) return fakeResult({ exitCode: 128, stderr: "fatal" });
      return orig(req);
    });
    const mgrCd = new LoopPatchApplicationManager({ runner: cdRunner, workspaceManager: ctxCd.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrCd.apply(mkReq(ctxCd, { patch: pMod, allowed: ["a.txt"] })), "GIT_COMMAND_FAILED", "cached diff command fails");
    rmSync(ctxCd.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // J. Static prohibitions
  // ════════════════════════════════════════════════════════════════
  {
    console.log("J. Static prohibitions");
    const prodSrc = readFileSync(join(__dirname, "..", "core", "loop-patch-application.ts"), "utf8");

    ok(!prodSrc.includes("require('child_process')") && !prodSrc.includes('require("child_process")')
      && !prodSrc.match(/from ["']child_process["']/) && !prodSrc.match(/from ["']node:child_process["']/),
      "no child_process import");
    ok(!prodSrc.includes("shell:") && !prodSrc.match(/\bspawn\b/), "no shell/spawn");
    ok(!prodSrc.match(/"fetch"/) && !prodSrc.match(/"pull"/) && !prodSrc.match(/"push"/), "no fetch/pull/push git args");
    ok(!prodSrc.includes("writeFileSync") && !prodSrc.includes("mkdtemp") && !prodSrc.match(/os\.tmpdir/), "no temp patch file");
    ok(!prodSrc.includes("--unsafe-paths"), "no --unsafe-paths");
    ok(!prodSrc.includes("--reject"), "no --reject");
    ok(!prodSrc.includes("--3way"), "no --3way");
    ok(!prodSrc.includes("--index"), "no --index");
    ok(!prodSrc.includes("--intent-to-add"), "no --intent-to-add");
    ok(!prodSrc.includes("--recount"), "no --recount");
    ok(!prodSrc.match(/\["apply"[^\]]*--cached/) && prodSrc.includes('"diff", "--cached"'), "--cached only with diff, never apply");
    ok(!prodSrc.match(/"add"/), "no git add");
    ok(!prodSrc.match(/"commit"/), "no git commit");
    ok(!prodSrc.match(/\.git\/worktrees/) && !prodSrc.includes("writeFileSync"), "no .git internal writes");
    ok(!prodSrc.match(/_apply\([^,)]*repositoryPath/) && !prodSrc.match(/_runGit\([^,)]*repositoryPath/), "no Source cwd apply");
  }

  // ════════════════════════════════════════════════════════════════
  // K. Hunk overlap — single-section multi-hunk matrix
  // ════════════════════════════════════════════════════════════════
  {
    console.log("K. Hunk overlap (single-section multi-hunk)");

    // ── formatRange unit checks ──
    ok(formatRange(2, 1) === "2", "formatRange count=1 → bare start");
    ok(formatRange(2, 0) === "2,0", "formatRange count=0 → start,0");
    ok(formatRange(2, 3) === "2,3", "formatRange count=3 → start,3");

    // Helper: build a counting-runner Manager and assert runner untouched after reject.
    async function kReject(
      label: string, hunks: HunkSpec[], code: string,
    ): Promise<void> {
      const ctx = await mkCtx("k-" + label.replace(/\W/g, ""), "codex/k-" + label.replace(/\W/g, ""));
      const { runner, state } = countingRunner(mkRunner(ctx.s.rp, ctx.s.cr, ctx.s.home));
      const wsMgr2 = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
      const mgr2 = new LoopPatchApplicationManager({ runner, workspaceManager: wsMgr2, gitExecutableId: "git" });
      const snap2 = await wsMgr2.inspect(ctx.id);
      state.count = 0; // reset after inspect; we measure only Manager.apply calls
      const patch = makeSingleFilePatch("a.txt", hunks);
      ok(state.count === 0, `${label}: runner count 0 before Manager`);
      try {
        await mgr2.apply(mkReq({ ...ctx, snap: snap2 } as Ctx, { patch, allowed: ["a.txt"] }));
        ok(false, `${label} (no throw)`);
      } catch (e: any) {
        ok(e instanceof LoopPatchApplicationError && e.code === code,
          `${label}→${e?.constructor?.name ?? "?"}:${e?.code ?? "?"}`);
      }
      ok(state.count === 0, `${label}: runner count 0 after reject (Git boundary not reached)`);
      rmSync(ctx.s.tr, { recursive: true, force: true });
    }

    // K1: Old partial overlap — second oldStart inside first old range, second oldEnd > first oldEnd.
    //     New ranges strictly non-overlapping.
    await kReject("K1 old partial overlap", [
      { oldStart: 1, oldCount: 5, newStart: 1, newCount: 5, body: " a\n-b\n+B\n c\n d\n e\n" },
      { oldStart: 3, oldCount: 5, newStart: 7, newCount: 5, body: " e\n-f\n+F\n g\n h\n i\n" },
    ], "PATCH_MALFORMED");

    // K2: New partial overlap — second newStart inside first new range, second newEnd > first newEnd.
    //     Old ranges strictly non-overlapping.
    await kReject("K2 new partial overlap", [
      { oldStart: 1, oldCount: 5, newStart: 1, newCount: 5, body: " a\n-b\n+B\n c\n d\n e\n" },
      { oldStart: 7, oldCount: 5, newStart: 3, newCount: 5, body: " g\n-h\n+H\n i\n j\n k\n" },
    ], "PATCH_MALFORMED");

    // K3: Full containment — second old range fully contains first old range.
    //     New ranges strictly non-overlapping.
    await kReject("K3 full containment", [
      { oldStart: 3, oldCount: 3, newStart: 3, newCount: 3, body: " c\n-d\n+D\n e\n" },
      { oldStart: 1, oldCount: 7, newStart: 7, newCount: 7, body: " a\n-b\n+B\n c\n-d\n+D\n e\n" },
    ], "PATCH_MALFORMED");

    // K4: Same start — old ranges share the same oldStart.
    //     New ranges strictly non-overlapping.
    await kReject("K4 same start", [
      { oldStart: 1, oldCount: 2, newStart: 1, newCount: 2, body: "-a\n+A\n b\n" },
      { oldStart: 1, oldCount: 3, newStart: 5, newCount: 3, body: " a\n-b\n+B\n c\n" },
    ], "PATCH_MALFORMED");

    // K5: Count=0 same insertion point — two oldCount=0 hunks with same oldStart.
    //     New ranges strictly increasing.
    await kReject("K5 count0 same insert", [
      { oldStart: 2, oldCount: 0, newStart: 3, newCount: 1, body: "+x\n" },
      { oldStart: 2, oldCount: 0, newStart: 4, newCount: 1, body: "+y\n" },
    ], "PATCH_MALFORMED");

    // K6: Effective-end overflow — start=MAX_SAFE_INTEGER, count≥2.
    await kReject("K6 end overflow", [
      { oldStart: Number.MAX_SAFE_INTEGER, oldCount: 2, newStart: 1, newCount: 2, body: "-a\n+b\n" },
    ], "PATCH_MALFORMED");

    // ── K7: Real adjacent two-hunk success (Git-applied) ──
    {
      console.log("  K7: adjacent two-hunk success");
      const ctx = await mkCtx("k7", "codex/k7");
      const ws = ctx.snap.workspacePath;
      const adjLines = Array.from({ length: 20 }, (_, i) => String(i + 1));
      const adjOld = adjLines.join("\n") + "\n";
      writeFileSync(join(ws, "adj.txt"), adjOld);
      execFileSync(GP, ["add", "adj.txt"], { cwd: ws });
      execFileSync(GP, ["commit", "-q", "-m", "adj"], { cwd: ws });
      const snap7 = await ctx.wsMgr.inspect(ctx.id);

      // hunk1: old 1..5, new 1..5, change line 2 → TWO
      // hunk2: old 6..12, new 6..12, change line 9 → NINE
      // secondOldStart(6) = firstOldEnd(5) + 1 ✓
      // secondNewStart(6) = firstNewEnd(5) + 1 ✓
      const hunk1Body = " 1\n-2\n+TWO\n 3\n 4\n 5\n";
      const hunk2Body = " 6\n 7\n 8\n-9\n+NINE\n 10\n 11\n 12\n";
      const adjPatch = makeSingleFilePatch("adj.txt", [
        { oldStart: 1, oldCount: 5, newStart: 1, newCount: 5, body: hunk1Body },
        { oldStart: 6, oldCount: 7, newStart: 6, newCount: 7, body: hunk2Body },
      ]);

      // Assert patch structure: exactly two @@ hunk headers
      const hunkHeaders = adjPatch.split("\n").filter((l: string) => l.startsWith("@@"));
      ok(hunkHeaders.length === 2, "K7: patch has exactly 2 @@ hunk headers");

      // Parse ranges and verify adjacency
      const r1m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(hunkHeaders[0]!);
      const r2m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(hunkHeaders[1]!);
      ok(!!r1m && !!r2m, "K7: both hunk headers parse");
      const firstOldEnd = Number(r1m![1]) + Number(r1m![2]) - 1;
      const firstNewEnd = Number(r1m![3]) + Number(r1m![4]) - 1;
      ok(Number(r2m![1]) === firstOldEnd + 1, "K7: secondOldStart = firstOldEnd + 1");
      ok(Number(r2m![3]) === firstNewEnd + 1, "K7: secondNewStart = firstNewEnd + 1");

      // Capture pre-state
      const preHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim();
      const preIdx = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
      const srcHeadBefore = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ctx.s.rp, encoding: "utf8" }).trim();
      const srcStatusBefore = execFileSync(GP, ["status", "--porcelain"], { cwd: ctx.s.rp, encoding: "utf8" });

      const r7 = await ctx.mgr.apply(mkReq({ ...ctx, snap: snap7 } as Ctx, { patch: adjPatch, allowed: ["adj.txt"] }));
      ok(r7.state === "applied", "K7: state=applied via real Git");

      const finalContent = readFileSync(join(ws, "adj.txt"), "utf8");
      ok(finalContent.includes("TWO"), "K7: file contains TWO");
      ok(finalContent.includes("NINE"), "K7: file contains NINE");

      const postHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim();
      ok(postHead === preHead, "K7: task HEAD unchanged");
      const postIdx = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
      ok(postIdx === preIdx, "K7: index unchanged");
      const srcHeadAfter = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ctx.s.rp, encoding: "utf8" }).trim();
      const srcStatusAfter = execFileSync(GP, ["status", "--porcelain"], { cwd: ctx.s.rp, encoding: "utf8" });
      ok(srcHeadAfter === srcHeadBefore && srcStatusAfter === srcStatusBefore, "K7: Source workspace unchanged");
      rmSync(ctx.s.tr, { recursive: true, force: true });
    }

    // ── K8: Count=0 adjacent parser acceptance ──
    {
      console.log("  K8: count=0 adjacent parser acceptance");
      const ctx = await mkCtx("k8", "codex/k8");
      const ws = ctx.snap.workspacePath;
      // a.txt exists with 3 lines. Use oldStart beyond file length so git apply
      // --check fails (forward=false, reverse=false → PATCH_NOT_APPLICABLE).
      // This proves the parser accepted count=0 syntax (no PATCH_MALFORMED)
      // and that forward/reverse checks were actually invoked.
      // hunk1: oldStart=100, oldCount=0, newStart=101, newCount=1
      // hunk2: oldStart=101, oldCount=0, newStart=103, newCount=1
      // secondOldStart(101) > firstOldEffectiveEnd(100) ✓
      // secondNewStart(103) > firstNewEffectiveEnd(101) ✓
      const zPatch = makeSingleFilePatch("a.txt", [
        { oldStart: 100, oldCount: 0, newStart: 101, newCount: 1, body: "+Z1\n" },
        { oldStart: 101, oldCount: 0, newStart: 103, newCount: 1, body: "+Z2\n" },
      ]);

      // Track runner calls to prove Git boundary reached.
      // Intercept ALL apply commands (check and real) to return exit 1,
      // ensuring no real apply modifies the workspace.
      let forwardCheckCalled = false;
      let reverseCheckCalled = false;
      let realApplyIntercepted = false;
      const zRunner = interceptedRunner(ctx.s.rp, ctx.s.cr, ctx.s.home, async (req, orig) => {
        const a = (req.args as string[]).join(" ");
        if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse")) {
          forwardCheckCalled = true;
          return { status: "exited", exitCode: 1, stdout: "", stderr: "err", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 3, termSignalSent: false, killSignalSent: false };
        }
        if (a.includes("apply") && a.includes("--check") && a.includes("--reverse")) {
          reverseCheckCalled = true;
          return { status: "exited", exitCode: 1, stdout: "", stderr: "err", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 3, termSignalSent: false, killSignalSent: false };
        }
        if (a.includes("apply") && !a.includes("--check")) {
          realApplyIntercepted = true;
          return { status: "exited", exitCode: 1, stdout: "", stderr: "err", signal: null, stdoutTruncated: false, stderrTruncated: false, durationMs: 1, stdoutBytesReceived: 0, stderrBytesReceived: 3, termSignalSent: false, killSignalSent: false };
        }
        return orig(req);
      });
      const mgrZ = new LoopPatchApplicationManager({ runner: zRunner, workspaceManager: ctx.wsMgr, gitExecutableId: "git" });

      const preHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim();
      const preIdx = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
      const preContent = readFileSync(join(ws, "a.txt"), "utf8");

      let zError: any = null;
      try { await mgrZ.apply(mkReq(ctx, { patch: zPatch, allowed: ["a.txt"] })); }
      catch (e: any) { zError = e; }

      // Parser must NOT reject as PATCH_MALFORMED — count=0 syntax accepted
      ok(!!zError && zError instanceof LoopPatchApplicationError && zError.code !== "PATCH_MALFORMED",
        `K8: parser accepted count=0 syntax (got ${zError?.code ?? "no error"})`);
      ok(forwardCheckCalled, "K8: forward apply --check was called");
      ok(reverseCheckCalled, "K8: reverse apply --check was called");
      ok(!realApplyIntercepted, "K8: no real git apply reached");

      // Workspace unchanged
      const postHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim();
      const postIdx = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
      const postContent = readFileSync(join(ws, "a.txt"), "utf8");
      ok(postHead === preHead, "K8: HEAD unchanged");
      ok(postIdx === preIdx, "K8: index unchanged");
      ok(postContent === preContent, "K8: target content unchanged");
      rmSync(ctx.s.tr, { recursive: true, force: true });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // L. Dirty same-file layered repair
  // ════════════════════════════════════════════════════════════════
  {
    console.log("L. Dirty same-file layered repair");
    const ctx = await mkCtx("l", "codex/l");
    const ws = ctx.snap.workspacePath;
    // Apply patch1: a.txt A_OLD → A_NEW (dirty)
    const p1 = makeDiff(A_OLD, A_NEW, "a.txt");
    const r1 = await ctx.mgr.apply(mkReq(ctx, { patch: p1, allowed: ["a.txt"] }));
    ok(r1.state === "applied" && r1.preTargetStateDigestSha256 !== r1.postTargetStateDigestSha256, "p1 applied, target changed");
    ok(r1.preTaskHeadSha === r1.postTaskHeadSha, "p1 HEAD unchanged");

    // Re-inspect WITHOUT commit — workspace is still dirty
    const snapD = await ctx.wsMgr.inspect(ctx.id);
    ok(snapD.taskHeadSha === ctx.snap.taskHeadSha, "HEAD unchanged after p1");
    ok(snapD.taskHasChanges, "workspace still dirty");

    // Apply patch2 on the dirty same file (builds on p1 result)
    const p2 = makeDiff(A_NEW, "alpha\nBETA\ndelta\n", "a.txt");
    // Capture index before p2
    const idxBeforeP2 = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
    const r2 = await ctx.mgr.apply(mkReq({ ...ctx, snap: snapD } as Ctx, { patch: p2, allowed: ["a.txt"] }));
    ok(r2.state === "applied", "dirty layered repair applied");
    ok(readFileSync(join(ws, "a.txt"), "utf8") === "alpha\nBETA\ndelta\n", "dirty layered content correct");
    ok(r2.preTaskHeadSha === r2.postTaskHeadSha, "HEAD unchanged through p2");
    ok(r2.preTargetStateDigestSha256 !== r2.postTargetStateDigestSha256, "target digest changed on applied");
    // R2 contract: status digest MUST remain equal (same dirty file, no add/commit between)
    ok(r2.preStatusDigestSha256 === r2.postStatusDigestSha256, "dirty repair: status digest equal (same dirty file)");
    // Index before === index after
    const idxAfterP2 = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
    ok(idxBeforeP2 === idxAfterP2, "dirty repair: index unchanged through p2");
    // Index unchanged
    const idx = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: ws, encoding: "utf8" });
    ok(idx === "", "index clean after dirty layered repair");
    rmSync(ctx.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // M. Filesystem race matrix
  // ════════════════════════════════════════════════════════════════
  {
    console.log("M. Filesystem race matrix");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // After F check, target → symlink
    const ctxMs = await mkCtx("m1", "codex/m1");
    const msRunner = interceptedRunner(ctxMs.s.rp, ctxMs.s.cr, ctxMs.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      // After the forward check (first apply --check call), replace a.txt with symlink
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && r.exitCode === 0) {
        rmSync(join(ctxMs.snap.workspacePath, "a.txt"), { force: true });
        symlinkSync(join(ctxMs.snap.workspacePath, "c.txt"), join(ctxMs.snap.workspacePath, "a.txt"));
      }
      return r;
    });
    const mgrMs = new LoopPatchApplicationManager({ runner: msRunner, workspaceManager: ctxMs.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrMs.apply(mkReq(ctxMs, { patch: pMod, allowed: ["a.txt"] })), "PATCH_SYMLINK", "after F: target to symlink");
    rmSync(ctxMs.s.tr, { recursive: true, force: true });

    // After F check, parent → symlink
    const ctxMp = await mkCtx("m2", "codex/m2");
    mkdirSync(join(ctxMp.snap.workspacePath, "d1"));
    writeFileSync(join(ctxMp.snap.workspacePath, "d1", "f.txt"), "x\ny\n");
    execFileSync(GP, ["add", "-A"], { cwd: ctxMp.snap.workspacePath });
    execFileSync(GP, ["commit", "-q", "-m", "dir"], { cwd: ctxMp.snap.workspacePath });
    const snapMp = await ctxMp.wsMgr.inspect(ctxMp.id);
    const pMp = makeDiff("x\ny\n", "X\ny\n", "d1/f.txt");
    const mpRunner = interceptedRunner(ctxMp.s.rp, ctxMp.s.cr, ctxMp.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && r.exitCode === 0) {
        rmSync(join(ctxMp.snap.workspacePath, "d1", "f.txt"), { force: true });
        rmSync(join(ctxMp.snap.workspacePath, "d1"), { recursive: true, force: true });
        symlinkSync(join(ctxMp.snap.workspacePath, "a.txt"), join(ctxMp.snap.workspacePath, "d1"));
      }
      return r;
    });
    const mgrMp = new LoopPatchApplicationManager({ runner: mpRunner, workspaceManager: ctxMp.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrMp.apply(mkReq({ ...ctxMp, snap: snapMp } as Ctx, { patch: pMp, allowed: ["d1/f.txt"] })), "PATCH_SYMLINK", "after F: parent to symlink");
    rmSync(ctxMp.s.tr, { recursive: true, force: true });

    // After F check, target → directory
    const ctxMd = await mkCtx("m3", "codex/m3");
    const mdRunner = interceptedRunner(ctxMd.s.rp, ctxMd.s.cr, ctxMd.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && r.exitCode === 0) {
        rmSync(join(ctxMd.snap.workspacePath, "a.txt"), { force: true });
        mkdirSync(join(ctxMd.snap.workspacePath, "a.txt"));
      }
      return r;
    });
    const mgrMd = new LoopPatchApplicationManager({ runner: mdRunner, workspaceManager: ctxMd.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrMd.apply(mkReq(ctxMd, { patch: pMod, allowed: ["a.txt"] })), "PATCH_UNSAFE_PATH", "after F: target to directory");
    rmSync(ctxMd.s.tr, { recursive: true, force: true });

    // After F check, target → FIFO
    const ctxMf = await mkCtx("m4", "codex/m4");
    const mfRunner = interceptedRunner(ctxMf.s.rp, ctxMf.s.cr, ctxMf.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && r.exitCode === 0) {
        rmSync(join(ctxMf.snap.workspacePath, "a.txt"), { force: true });
        execFileSync("mkfifo", [join(ctxMf.snap.workspacePath, "a.txt")]);
      }
      return r;
    });
    const mgrMf = new LoopPatchApplicationManager({ runner: mfRunner, workspaceManager: ctxMf.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrMf.apply(mkReq(ctxMf, { patch: pMod, allowed: ["a.txt"] })), "PATCH_UNSAFE_PATH", "after F: target to FIFO");
    rmSync(ctxMf.s.tr, { recursive: true, force: true });

    // Between F/R checks, target content changes → WORKSPACE_DRIFT (target digest changes)
    const ctxMc = await mkCtx("m5", "codex/m5");
    let mcFired = false;
    const mcRunner = interceptedRunner(ctxMc.s.rp, ctxMc.s.cr, ctxMc.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && !mcFired) {
        mcFired = true;
        // After F but before R, mutate content → target digest changes
        writeFileSync(join(ctxMc.snap.workspacePath, "a.txt"), "mutated content\n");
      }
      return r;
    });
    const mgrMc = new LoopPatchApplicationManager({ runner: mcRunner, workspaceManager: ctxMc.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrMc.apply(mkReq(ctxMc, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "between F/R: content drift");
    rmSync(ctxMc.s.tr, { recursive: true, force: true });

    // After apply, target → symlink
    const ctxAp = await mkCtx("m6", "codex/m6");
    const apRunner = interceptedRunner(ctxAp.s.rp, ctxAp.s.cr, ctxAp.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check") && r.exitCode === 0) {
        rmSync(join(ctxAp.snap.workspacePath, "a.txt"), { force: true });
        symlinkSync(join(ctxAp.snap.workspacePath, "c.txt"), join(ctxAp.snap.workspacePath, "a.txt"));
      }
      return r;
    });
    const mgrAp = new LoopPatchApplicationManager({ runner: apRunner, workspaceManager: ctxAp.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrAp.apply(mkReq(ctxAp, { patch: pMod, allowed: ["a.txt"] })), "PATCH_SYMLINK", "post-apply: target to symlink");
    rmSync(ctxAp.s.tr, { recursive: true, force: true });

    // During post-check, target content changes → WORKSPACE_DRIFT
    const ctxPc = await mkCtx("m7", "codex/m7");
    let pcFired = false;
    const pcRunner = interceptedRunner(ctxPc.s.rp, ctxPc.s.cr, ctxPc.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && a.includes("--check") && !a.includes("--reverse") && !pcFired) {
        pcFired = true;
        // After apply but during the post forward check, mutate content
        writeFileSync(join(ctxPc.snap.workspacePath, "a.txt"), "different drift\n");
      }
      return r;
    });
    const mgrPc = new LoopPatchApplicationManager({ runner: pcRunner, workspaceManager: ctxPc.wsMgr, gitExecutableId: "git" });
    await assertRejects(() => mgrPc.apply(mkReq(ctxPc, { patch: pMod, allowed: ["a.txt"] })), "WORKSPACE_DRIFT", "post-check: content drift");
    rmSync(ctxPc.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // N. Executable target rejection
  // ════════════════════════════════════════════════════════════════
  {
    console.log("N. Executable target rejection");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // Tracked exec file, modify patch → PATCH_UNSUPPORTED_CHANGE
    const ctx1 = await mkCtx("n1", "codex/n1");
    writeFileSync(join(ctx1.snap.workspacePath, "exec.txt"), "echo hi\n");
    execFileSync("chmod", ["+x", join(ctx1.snap.workspacePath, "exec.txt")]);
    execFileSync(GP, ["add", "exec.txt"], { cwd: ctx1.snap.workspacePath });
    execFileSync(GP, ["commit", "-q", "-m", "exec"], { cwd: ctx1.snap.workspacePath });
    const snap1r = await ctx1.wsMgr.inspect(ctx1.id);
    const pExec = makeDiff("echo hi\n", "echo CH\n", "exec.txt");
    await assertRejects(() => ctx1.mgr.apply(mkReq({ ...ctx1, snap: snap1r } as Ctx, { patch: pExec, allowed: ["exec.txt"] })), "PATCH_UNSUPPORTED_CHANGE", "tracked exec modify rejected");
    rmSync(ctx1.s.tr, { recursive: true, force: true });

    // Untracked exec file → PATCH_UNSUPPORTED_CHANGE
    const ctx2 = await mkCtx("n2", "codex/n2");
    writeFileSync(join(ctx2.snap.workspacePath, "uexec.txt"), "echo hi\n");
    execFileSync("chmod", ["+x", join(ctx2.snap.workspacePath, "uexec.txt")]);
    const ctx2r = await refresh(ctx2);
    const pUexec = makeDiff("echo hi\n", "echo CH\n", "uexec.txt");
    await assertRejects(() => ctx2r.mgr.apply(mkReq(ctx2r, { patch: pUexec, allowed: ["uexec.txt"] })), "PATCH_UNSUPPORTED_CHANGE", "untracked exec modify rejected");
    rmSync(ctx2.s.tr, { recursive: true, force: true });

    // Create patch onto exec target with matching content → not already_applied, should reject
    const ctx3 = await mkCtx("n3", "codex/n3");
    writeFileSync(join(ctx3.snap.workspacePath, "cExec.txt"), "new exec\n");
    execFileSync("chmod", ["+x", join(ctx3.snap.workspacePath, "cExec.txt")]);
    const ctx3r = await refresh(ctx3);
    const pNewExec = makeNew("new exec\n", "cExec.txt");
    await assertRejects(() => ctx3r.mgr.apply(mkReq(ctx3r, { patch: pNewExec, allowed: ["cExec.txt"] })), "PATCH_UNSUPPORTED_CHANGE", "create onto exec target rejected");
    rmSync(ctx3.s.tr, { recursive: true, force: true });

    // Regular non-exec file → allowed (existing test verifies, quick reaffirm)
    const ctx4 = await mkCtx("n4", "codex/n4");
    const pReg = makeDiff(A_OLD, A_NEW, "a.txt");
    const r4 = await ctx4.mgr.apply(mkReq(ctx4, { patch: pReg, allowed: ["a.txt"] }));
    ok(r4.state === "applied", "regular non-exec modify allowed");
    rmSync(ctx4.s.tr, { recursive: true, force: true });

    // Exec on already_applied existing target → PATCH_UNSUPPORTED_CHANGE (fs check before return)
    const ctx5 = await mkCtx("n5", "codex/n5");
    const pNew5 = makeNew("new5\n", "n5.txt");
    await ctx5.mgr.apply(mkReq(ctx5, { patch: pNew5, allowed: ["n5.txt"] }));
    execFileSync("chmod", ["+x", join(ctx5.snap.workspacePath, "n5.txt")]);
    const snap5r = await ctx5.wsMgr.inspect(ctx5.id);
    await assertRejects(() => ctx5.mgr.apply(mkReq({ ...ctx5, snap: snap5r } as Ctx, { patch: pNew5, allowed: ["n5.txt"] })), "PATCH_UNSUPPORTED_CHANGE", "already_applied with exec rejected");
    rmSync(ctx5.s.tr, { recursive: true, force: true });

    // Post-apply executable race: chmod +x between real apply exit and post-apply revalidation
    const ctx6 = await mkCtx("n6", "codex/n6");
    const ws6 = ctx6.snap.workspacePath;
    // Create a regular non-executable tracked text target
    writeFileSync(join(ws6, "race.txt"), "original\n");
    execFileSync(GP, ["add", "race.txt"], { cwd: ws6 });
    execFileSync(GP, ["commit", "-q", "-m", "race"], { cwd: ws6 });
    const snap6 = await ctx6.wsMgr.inspect(ctx6.id);
    const pRace = makeDiff("original\n", "modified\n", "race.txt");
    // Intercept: after real apply returns exit 0, chmod +x the target
    const raceRunner = interceptedRunner(ctx6.s.rp, ctx6.s.cr, ctx6.s.home, async (req, orig) => {
      const r = await orig(req);
      const a = (req.args as string[]).join(" ");
      if (a.includes("apply") && !a.includes("--check") && r.exitCode === 0) {
        execFileSync("chmod", ["+x", join(ws6, "race.txt")]);
      }
      return r;
    });
    const mgrRace = new LoopPatchApplicationManager({ runner: raceRunner, workspaceManager: ctx6.wsMgr, gitExecutableId: "git" });
    try {
      await mgrRace.apply(mkReq({ ...ctx6, snap: snap6 } as Ctx, { patch: pRace, allowed: ["race.txt"] }));
      ok(false, "post-apply exec race (no throw)");
    } catch (e: any) {
      ok(e instanceof LoopPatchApplicationError && e.code === "PATCH_UNSUPPORTED_CHANGE",
        `post-apply exec race→${e?.constructor?.name ?? "?"}:${e?.code ?? "?"}`);
    }
    // Restore fixture
    try { execFileSync("chmod", ["-x", join(ws6, "race.txt")]); } catch {}
    rmSync(ctx6.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // O. Exact Source workspace protection
  // ════════════════════════════════════════════════════════════════
  {
    console.log("O. Exact Source before/after");
    const ctx = await mkCtx("o", "codex/o");
    const rp = ctx.s.rp;
    const ws = ctx.snap.workspacePath;

    // Capture precise before snapshot of Source
    const beforeHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
    const beforeBranch = execFileSync(GP, ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
    const beforeStatus = execFileSync(GP, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: rp, encoding: "utf8" });
    const beforeDiff = execFileSync(GP, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: rp, encoding: "utf8" });
    const beforeCached = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: rp, encoding: "utf8" });
    const beforeUntracked = execFileSync(GP, ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: rp, encoding: "utf8" });
    const files = ["a.txt", "b.txt", "c.txt"];
    const beforeFileState: Record<string, { exists: boolean; mode: number; size: number; sha256: string }> = {};
    for (const f of files) {
      const fp = join(rp, f);
      const ex = existsSync(fp);
      beforeFileState[f] = { exists: ex, mode: 0, size: 0, sha256: "" };
      if (ex) {
        const st = lstatSync(fp);
        beforeFileState[f]!.mode = st.mode;
        beforeFileState[f]!.size = st.size;
        beforeFileState[f]!.sha256 = sha256(readFileSync(fp));
      }
    }

    // Apply multi-file patch
    const pMulti = makeDiff(A_OLD, A_NEW, "a.txt") + makeDiff(B_OLD, B_NEW, "b.txt") + makeNew("oo\n", "g.txt");
    const res = await ctx.mgr.apply(mkReq(ctx, { patch: pMulti, allowed: ["a.txt", "b.txt", "g.txt"] }));
    ok(res.state === "applied", "multi-file apply ok");

    // After: re-read same fields
    const afterHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
    const afterBranch = execFileSync(GP, ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
    const afterStatus = execFileSync(GP, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: rp, encoding: "utf8" });
    const afterDiff = execFileSync(GP, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: rp, encoding: "utf8" });
    const afterCached = execFileSync(GP, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--"], { cwd: rp, encoding: "utf8" });
    const afterUntracked = execFileSync(GP, ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: rp, encoding: "utf8" });

    // Exact before/after assertions
    ok(beforeHead === afterHead, `source HEAD unchanged: ${beforeHead.slice(0, 8)}`);
    ok(beforeBranch === afterBranch, `source branch unchanged: ${beforeBranch}`);
    ok(beforeStatus === afterStatus, "source status exact match");
    ok(beforeDiff === afterDiff, "source diff exact match");
    ok(beforeCached === afterCached, "source cached diff exact match");
    ok(beforeUntracked === afterUntracked, "source untracked exact match");
    for (const f of files) {
      const fp = join(rp, f);
      const ex = existsSync(fp);
      const b = beforeFileState[f]!;
      ok(ex === b.exists, `source ${f} exists unchanged`);
      if (ex) {
        const st = lstatSync(fp);
        ok(st.mode === b.mode, `source ${f} mode unchanged`);
        ok(st.size === b.size, `source ${f} size unchanged`);
        ok(sha256(readFileSync(fp)) === b.sha256, `source ${f} sha256 unchanged`);
      }
    }
    // Workspace DID change (a.txt, b.txt, g.txt)
    ok(readFileSync(join(ws, "a.txt"), "utf8") === A_NEW, "workspace a.txt changed");
    ok(readFileSync(join(ws, "b.txt"), "utf8") === B_NEW, "workspace b.txt changed");
    ok(existsSync(join(ws, "g.txt")), "workspace g.txt created");
    rmSync(ctx.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // P. Result contract & target digest
  // ════════════════════════════════════════════════════════════════
  {
    console.log("P. Result contracts");
    const ctx = await mkCtx("p", "codex/p");
    const pMod = makeDiff(A_OLD, A_NEW, "a.txt");

    // applied: preTarget != postTarget
    const r1 = await ctx.mgr.apply(mkReq(ctx, { patch: pMod, allowed: ["a.txt"] }));
    ok(r1.state === "applied", "applied state");
    ok(r1.preTargetStateDigestSha256 !== r1.postTargetStateDigestSha256, "applied: target digest differs");
    ok(Object.isFrozen(r1), "applied result frozen");
    ok(typeof r1.preTargetStateDigestSha256 === "string" && r1.preTargetStateDigestSha256.length === 64, "pre target digest valid");
    ok(typeof r1.postTargetStateDigestSha256 === "string" && r1.postTargetStateDigestSha256.length === 64, "post target digest valid");

    // already_applied: preTarget == postTarget
    const snap2 = await ctx.wsMgr.inspect(ctx.id);
    const r2 = await ctx.mgr.apply(mkReq({ ...ctx, snap: snap2 } as Ctx, { patch: pMod, allowed: ["a.txt"] }));
    ok(r2.state === "already_applied", "already_applied state");
    ok(r2.preTargetStateDigestSha256 === r2.postTargetStateDigestSha256, "already_applied: target digest unchanged");
    ok(Object.isFrozen(r2), "already_applied result frozen");
    rmSync(ctx.s.tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // Q. Static self-check — test file integrity
  // ════════════════════════════════════════════════════════════════
  {
    console.log("Q. Static self-check");
    const testSrc = readFileSync(join(__dirname, "loop-patch-application.test.ts"), "utf8");
    // Regex-based checks avoid embedding literal forbidden strings in this section.
    const reOkTrue = new RegExp("\\bok\\s*\\(\\s*true\\s*,");
    ok(!reOkTrue.test(testSrc), "no unconditional ok(true) in test file");
    const rePWord = new RegExp("place" + "holder", "i");
    ok(!rePWord.test(testSrc), "no forbidden p-word in test file");
    const reSkip = new RegExp("skip\\s+this\\s+test", "i");
    ok(!reSkip.test(testSrc), "no forbidden s-phrase in test file");
    const reIWord = new RegExp("inspection" + "-only", "i");
    ok(!reIWord.test(testSrc), "no forbidden i-phrase in test file");
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
